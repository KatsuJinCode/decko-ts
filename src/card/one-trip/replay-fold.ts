// THE PLAN-REPLAY FOLD (fold-plan-replay lane, 2026-10-06): the per-read-
// class merged statement that collapses a render plan's replay batch.
//
// THE MECHANISM, and why it is SQL rather than protocol:
// hrana (what BunnyDB speaks over fetch) has NO server-side set-based
// execution — a pipeline POST carries N `execute` entries and pays a
// per-execute server cost each (deliverables/FOLD-MECHANISM-RESEARCH-2026-10-05
// §1, verified against the vendored @libsql/hrana-client 0.10.0 surface and
// the public HRANA_3 spec). The measured edge term is ~55 ms per statement
// (gate2-request-trace-lane.md, the deployed /Aikido ledger), so the cost is
// STATEMENT COUNT, not POST count. The collapse therefore has to happen
// inside the SQL layer, and SQLite already has the shape: bind a JSON array
// as ONE parameter, expand it with `json_each`, join `cards` on BINARY
// collation so the index seek survives. The engine already ships that exact
// shape on the live serving DB — the seat's V2 head binds a 3,530-id member
// list in one statement (one-trip-fetch.ts:186-197) — so this is a proven
// mechanism, not a bet.
//
// WHAT THIS MODULE DOES, precisely: groups the plan's entries by READ CLASS
// (the residue registry in render-plan.ts names the classes; this module
// matches the concrete SQL TEXT shapes that carry the mass) and emits ONE
// merged statement per class. Each merged row carries a tag column naming the
// source entry, so the merged result decomposes back into per-entry results
// with zero round trips for the live read that hits the armed router.
//
// THE EXACTNESS CONTRACT — the reason this is a cache-warming fold and not a
// re-implementation:
//   - The merged statement's WHERE clause is the source statement's own
//     predicate, re-expressed as an EXISTS over the bound list. Same rows.
//   - The per-entry row ORDER is pinned by an explicit ORDER BY that the
//     per-class entry declares; `tests/card/one-trip/replay-fold-exactness
//     .test.ts` and the lane's harness prove the decomposition equals the
//     original per-entry execution row-for-row, order included.
//   - A class whose binds are not canonical lowercase keys, or whose SQL
//     text does not match a known shape, is NOT folded. It rides the
//     ladder unchanged. The fold can only remove statements; it can never
//     change which rows a plan entry returns.
//   - If the folded batch throws, replayRenderPlan re-runs the unfolded
//     batch. The fold is an optimization; the ladder is the fallback
//     (the same graceful-degradation contract render-gate.ts carries).
//
// CHUNKING: a merged statement's bind is ONE JSON parameter (json_each wins
// over VALUES because VALUES needs two binds per row and the serving DB's
// SQLITE_MAX_VARIABLE_NUMBER is unknown). The OUTPUT is chunked instead, to
// FOLD_CHUNK_GROUPS entries per statement, so a class's row mass is split
// across a bounded number of result sets. UNION ALL is used only as the
// per-class stitch where a class needs more than one shape; the 500-arm
// compound-select wall (research §2 case D, measured) is never approached.

import type { SQLStatement } from "../../server/driver.js";
import type { RenderPlanEntry } from "./render-plan.js";

/** The tag column each merged statement carries: the index of the source
 *  entry inside the plan. Namespaced (`__fold_`) so it cannot collide with a
 *  cards column or a projection alias. */
export const FOLD_TAG_COLUMN = "__fold_g";
/** The ordinal column for families whose source statement can return the
 *  same row more than once (the OR-chain pair reads): a second merged
 *  statement's row order has to reproduce the OR-term order, which is the
 *  bind order. */
export const FOLD_POS_COLUMN = "__fold_p";

/** Maximum source entries carried by ONE merged statement (the output
 *  chunk). Bounds the result set and the JSON bind per statement; a class
 *  with more entries becomes several statements of the same shape. */
export const FOLD_CHUNK_GROUPS = 512;

/** Whether the fold runs at all. Default ON (it is a statement-count
 *  optimization inside an already-config-gated path — the replay only
 *  happens when DECKO_ONE_TRIP=1). Set DECKO_REPLAY_FOLD=0 to restore the
 *  ladder exactly. */
export function replayFoldWantsMerge(): boolean {
  return process.env.DECKO_REPLAY_FOLD !== "0";
}

// ---------------------------------------------------------------------------
// Per-class fold shapes
// ---------------------------------------------------------------------------

/** One merged statement's source group: which plan entries it carries, and
 *  the binds each contributed.
 *
 *  `binds` is parallel to `entryIndexes`. A SCALAR family's bind is the
 *  array of that entry's values (`["*type"]`, `[6568, 6569]`); the chunk
 *  flattens those into ONE bound JSON array and keeps a position→entry map
 *  so the tag column still names the source entry. A PAIR family's bind is
 *  an array of pairs and stays nested, because the merged statement walks
 *  the pairs with a second json_each. */
interface FoldGroup {
  /** plan entry indexes, in plan order */
  entryIndexes: number[];
  /** one bind per entry index, parallel to entryIndexes */
  binds: unknown[][];
}

export interface FoldShape {
  family: string;
  /** Whether the chunk's binds stay nested (pair families) or flatten into
   *  one scalar array (everything else). */
  nested: boolean;
  /** The source statement shape's test, on the raw SQL text. */
  match(sql: string, params: unknown[]): boolean;
  /** The merged statement for one chunk. `ordinal` is true when the source
   *  statement can return the same card row twice (duplicate bind pairs);
   *  those families get the ordinal tag column so the duplicate is
   *  reproduced rather than collapsed. */
  build(binds: unknown[], ordinal: boolean): string;
}

function allStringsLowercase(values: unknown[]): boolean {
  for (const v of values) {
    if (typeof v !== "string") return false;
    if (v !== v.toLowerCase()) return false;
  }
  return true;
}

function allNumbers(values: unknown[]): boolean {
  for (const v of values) if (typeof v !== "number" || !Number.isFinite(v)) return false;
  return true;
}

/** The card column list a `SELECT * FROM cards` yields, spelled out for the
 *  merged projection so the tag column cannot shift the row shape. */
const CARD_COLUMNS =
  'c.id, c.name, c."key", c.codename, c.left_id, c.right_id, c.current_revision_id, c.created_at, c.updated_at, c.creator_id, c.updater_id, c.read_rule_class, c.read_rule_id, c.references_expired, c.trash, c.type_id, c.db_content';

function cardProjection(alias: string): string {
  return CARD_COLUMNS.split(", ")
    .map((c) => c.replace(/^c\./, `${alias}.`))
    .join(", ");
}

/** The FIRST live row's MIN(id) guard: reproduces a source statement's
 *  `LIMIT 1` (which returns one row but does not promise which when the
 *  predicate can match several). */
function minIdGuard(alias: string, groupExpr: string, where: string): string {
  return `${alias}.id = (SELECT MIN(m.id) FROM cards m WHERE ${where})`;
}

const KEY_MULTI_RE =
  /^SELECT \* FROM cards WHERE (?:"key" COLLATE NOCASE|key) IN \([^)]*\) AND trash = 0$/;
const ID_MULTI_RE = /^SELECT \* FROM cards WHERE id IN \([^)]*\) AND trash = 0$/;
const KEY_POINT_RE = /^SELECT \* FROM cards WHERE key = \? AND trash = 0 LIMIT 1$/;
const ID_POINT_RE = /^SELECT \* FROM cards WHERE id = \?( AND trash = 0)?( LIMIT 1)?$/;
const PAIR_EXISTS_RE =
  /^SELECT id FROM cards WHERE left_id = \? AND right_id = \? AND trash = 0 LIMIT 1$/;
const TEMPLATE_LINK_RE = /^SELECT id, db_content FROM cards WHERE id IN \([^)]*\)$/;
const LEXICON_ID_RE = /^SELECT name, left_id, right_id FROM cards WHERE id = \? LIMIT 1$/;
const LEXICON_KEY_RE = /^SELECT id FROM cards WHERE key = \? AND trash = 0 LIMIT 1$/;
const OR_PAIR_HEAD = "SELECT j.* FROM cards j WHERE j.trash = 0 AND ((j.left_id = ? AND j.right_id = ?)";
const OR_PAIR_TERM = "(j.left_id = ? AND j.right_id = ?)";
/** The OR-chain pair shape, matched structurally rather than by one regex:
 *  head, first term, N-1 " OR term" clauses, closing paren. A chain that
 *  differs in any other way fails the exact reconstruction, so the class
 *  does not match and the entry rides the ladder unchanged. */
function isOrPairShape(sql: string, params: unknown[]): boolean {
  if (params.length % 2 !== 0 || params.length === 0 || !allNumbers(params)) return false;
  const terms = params.length / 2;
  let expected = OR_PAIR_HEAD;
  for (let i = 0; i < terms - 1; i++) expected += ` OR ${OR_PAIR_TERM}`;
  return `${expected})` === sql;
}
const CLOSURE_JSON_RE =
  /^SELECT\s+json_object\(\s*'id',\s*c\.id,[\s\S]*?\)\s+AS\s+card_json\s+FROM\s+\(SELECT\s+DISTINCT\s+co\.\*\s+FROM\s+cards\s+co\s+JOIN\s+\(SELECT\s+value\s+AS\s+id\s+FROM\s+json_each\(\?\)\)\s+m\s+ON\s+m\.id\s*=\s*co\.id\)\s+c\s+ORDER\s+BY\s+c\.id$/;

const CLOSURE_JSON_PROJECTION =
  "json_object('id', c.id, 'name', c.name, 'key', c.\"key\", 'codename', c.codename, 'left_id', c.left_id, 'right_id', c.right_id, 'current_revision_id', c.current_revision_id, 'created_at', c.created_at, 'updated_at', c.updated_at, 'creator_id', c.creator_id, 'updater_id', c.updater_id, 'read_rule_class', c.read_rule_class, 'read_rule_id', c.read_rule_id, 'references_expired', c.references_expired, 'trash', c.trash, 'type_id', c.type_id, 'db_content', c.db_content)";

/** The per-class fold shapes, most-statement-saving first in the registry
 *  order (the matcher order is the merge order for two shapes that could
 *  both match — none of the shapes below can). */
export const FOLD_SHAPES: readonly FoldShape[] = [
  // THE CLOSURE MASS — 36 of Aikido's 108 replay statements on the pin. The
  // source statements are ALREADY the json_each shape (one id list each), so
  // the fold is the nesting that makes one statement carry all of them: the
  // outer json_each names the source entry, the inner expands that entry's
  // id list. The DISTINCT over (tag, co.*) reproduces the source's own
  // DISTINCT co.* per entry.
  {
    family: "closure-json-id-list",
    nested: true,
    match: (sql, params) =>
      CLOSURE_JSON_RE.test(sql.trim()) &&
      params.length === 1 &&
      typeof params[0] === "string" &&
      Array.isArray(safeJsonArray(params[0])),
    build: () =>
      `SELECT c.${FOLD_TAG_COLUMN} AS ${FOLD_TAG_COLUMN}, ${CLOSURE_JSON_PROJECTION} AS card_json ` +
      `FROM (SELECT DISTINCT g.key AS ${FOLD_TAG_COLUMN}, co.* FROM json_each(?) AS g ` +
      `JOIN json_each(g.value) AS m JOIN cards co ON co.id = m.value) AS c ` +
      `ORDER BY ${FOLD_TAG_COLUMN}, c.id`,
  },
  // THE PREFETCH KEY IN-LISTS — the largest remaining family. The source text
  // carries COLLATE NOCASE on the COLUMN side, which DEFEATS the index seek
  // in a join (research §2 case C2 measured 1,532 ms). The merged join
  // therefore compares BINARY, which is lossless because decko keys are
  // canonical lowercase (prefetch.ts:870-875) — and match() only accepts the
  // class when every bind already satisfies that invariant, so a key that is
  // not canonical rides the ladder instead.
  {
    family: "cards-key-multi",
    nested: true,
    match: (sql, params) =>
      KEY_MULTI_RE.test(sql.trim()) &&
      params.length > 0 &&
      params.length !== 2 &&
      allStringsLowercase(params),
    build: () =>
      `SELECT src.${FOLD_TAG_COLUMN} AS ${FOLD_TAG_COLUMN}, ${cardProjection("c")} ` +
      `FROM (SELECT DISTINCT g.key AS ${FOLD_TAG_COLUMN}, k.value AS kv ` +
      `FROM json_each(?) AS g CROSS JOIN json_each(g.value) AS k) AS src ` +
      `CROSS JOIN cards c ON c."key" = src.kv WHERE c.trash = 0 ` +
      `ORDER BY ${FOLD_TAG_COLUMN}, c.id`,
  },
  // The head read fold's own IN-list (same projection, binary keys, id IN).
  {
    family: "cards-id-multi",
    nested: true,
    match: (sql, params) =>
      ID_MULTI_RE.test(sql.trim()) &&
      params.length > 0 &&
      params.length !== 2 &&
      allNumbers(params),
    build: () =>
      `SELECT src.${FOLD_TAG_COLUMN} AS ${FOLD_TAG_COLUMN}, ${cardProjection("c")} ` +
      `FROM (SELECT DISTINCT g.key AS ${FOLD_TAG_COLUMN}, k.value AS kv ` +
      `FROM json_each(?) AS g CROSS JOIN json_each(g.value) AS k) AS src ` +
      `CROSS JOIN cards c ON c.id = src.kv WHERE c.trash = 0 ` +
      `ORDER BY ${FOLD_TAG_COLUMN}, c.id`,
  },
  // Simple-name point reads. ≤ 1 row per entry by construction (the MIN(id)
  // guard reproduces LIMIT 1 exactly), so the per-entry row order is trivial.
  {
    family: "cards-key-point",
    nested: true,
    match: (sql, params) =>
      KEY_POINT_RE.test(sql.trim()) && params.length === 1 && allStringsLowercase(params),
    build: () =>
      `SELECT g.key AS ${FOLD_TAG_COLUMN}, ${cardProjection("c")} ` +
      `FROM json_each(?) AS g CROSS JOIN json_each(g.value) AS k CROSS JOIN cards c ` +
      `ON c."key" = k.value AND c.trash = 0 ORDER BY ${FOLD_TAG_COLUMN}`,
  },
  // id point reads, with or without the trash filter / LIMIT 1. The MIN(id)
  // guard also reproduces the no-LIMIT form: an id is the cards primary key,
  // so the guard never drops a row the source returned.
  {
    family: "cards-id-point",
    nested: true,
    match: (sql, params) =>
      ID_POINT_RE.test(sql.trim()) && params.length === 1 && allNumbers(params),
    build: () =>
      `SELECT g.key AS ${FOLD_TAG_COLUMN}, ${cardProjection("c")} ` +
      `FROM json_each(?) AS g CROSS JOIN json_each(g.value) AS k CROSS JOIN cards c ` +
      `ON c.id = k.value ORDER BY ${FOLD_TAG_COLUMN}`,
  },
  // The (left_id, right_id) junction existence probe. ≤ 1 row per entry, so
  // no row order matters beyond the tag.
  {
    family: "pair-exists",
    nested: true,
    match: (sql, params) =>
      PAIR_EXISTS_RE.test(sql.trim()) && params.length === 2 && allNumbers(params),
    build: () =>
      `SELECT g.key AS ${FOLD_TAG_COLUMN}, c.id AS id ` +
      `FROM json_each(?) AS g ` +
      `CROSS JOIN json_each(g.value) AS l ` +
      `CROSS JOIN json_each(g.value) AS r ON r.key = l.key + 1 ` +
      `CROSS JOIN cards c ON c.left_id = l.value AND c.right_id = r.value ` +
      `WHERE l.key % 2 = 0 AND c.trash = 0 ORDER BY ${FOLD_TAG_COLUMN}`,
  },
  // The OR-chain pair reads (the prefetch's side-key and permission rounds). A
  // source entry CAN return the same card twice when its bind list repeats a
  // pair, so the merged statement carries the ordinal tag as well and the
  // decomposition keeps both rows in bind order.
  {
    family: "or-chain-pairs",
    nested: true,
    match: (sql, params) => isOrPairShape(sql.trim(), params),
    build: () =>
      `SELECT g.key AS ${FOLD_TAG_COLUMN}, ${cardProjection("j")} ` +
      `FROM json_each(?) AS g ` +
      `CROSS JOIN json_each(g.value) AS l ` +
      `CROSS JOIN json_each(g.value) AS r ON r.key = l.key + 1 ` +
      `CROSS JOIN cards j ON j.left_id = l.value AND j.right_id = r.value ` +
      `WHERE l.key % 2 = 0 AND j.trash = 0 ORDER BY ${FOLD_TAG_COLUMN}, j.id`,
  },
  // The template-link prepare sweep's junction read by id.
  {
    family: "template-link-ids",
    nested: true,
    match: (sql, params) =>
      TEMPLATE_LINK_RE.test(sql.trim()) &&
      params.length > 0 &&
      params.length !== 2 &&
      allNumbers(params),
    build: () =>
      `SELECT src.${FOLD_TAG_COLUMN} AS ${FOLD_TAG_COLUMN}, c.id AS id, c.db_content AS db_content ` +
      `FROM (SELECT DISTINCT g.key AS ${FOLD_TAG_COLUMN}, k.value AS kv ` +
      `FROM json_each(?) AS g CROSS JOIN json_each(g.value) AS k) AS src ` +
      `CROSS JOIN cards c ON c.id = src.kv ORDER BY ${FOLD_TAG_COLUMN}, c.id`,
  },
  // The lexicon's id→name fallback (LIMIT 1, no trash filter).
  {
    family: "lexicon-id-to-name",
    nested: true,
    match: (sql, params) =>
      LEXICON_ID_RE.test(sql.trim()) && params.length === 1 && allNumbers(params),
    build: () =>
      `SELECT g.key AS ${FOLD_TAG_COLUMN}, c.name AS name, c.left_id AS left_id, c.right_id AS right_id ` +
      `FROM json_each(?) AS g CROSS JOIN json_each(g.value) AS k CROSS JOIN cards c ` +
      `ON c.id = k.value ORDER BY ${FOLD_TAG_COLUMN}`,
  },
  // The lexicon's key→id fallback (LIMIT 1, id projection).
  {
    family: "lexicon-key-to-id",
    nested: true,
    match: (sql, params) =>
      LEXICON_KEY_RE.test(sql.trim()) && params.length === 1 && allStringsLowercase(params),
    build: () =>
      `SELECT g.key AS ${FOLD_TAG_COLUMN}, c.id AS id ` +
      `FROM json_each(?) AS g CROSS JOIN json_each(g.value) AS k CROSS JOIN cards c ` +
      `ON c."key" = k.value AND c.trash = 0 ORDER BY ${FOLD_TAG_COLUMN}`,
  },
];

// ---------------------------------------------------------------------------
// The fold plan: which statements ride the batch, and how to take them apart
// ---------------------------------------------------------------------------

/** How one merged statement's result becomes per-entry results. */
export interface MergedSlice {
  /** index into the folded batch's statement array */
  statementIndex: number;
  family: string;
  /** every entry this chunk answers for (an entry with no row still gets an
   *  empty result — the ladder's execution returned no rows for it too) */
  entryIndexes: number[];
  /** the tag column's value is an index into this map, not into
   *  entryIndexes — the flat families bind one JSON value per source BIND,
   *  so the same entry owns a RUN of tag values */
  tagToEntry: number[];
  hasPos: boolean;
}

export interface UnfoldedSlice {
  statementIndex: number;
  entryIndex: number;
}

export interface FoldedPlan {
  /** the batch to execute: merged statements then unfolded ladder statements */
  statements: SQLStatement[];
  merged: MergedSlice[];
  unfolded: UnfoldedSlice[];
  /** per-family source-entry counts (the RED->GREEN histogram) */
  families: Record<string, number>;
  /** the entry count that stayed on the ladder, with the reason named */
  unfoldedFamilies: Record<string, number>;
  entryCount: number;
}

/** JSON.parse that reports failure instead of throwing — a plan whose id-list
 *  bind is not a JSON array is not folded, it rides the ladder. */
function safeJsonArray(text: unknown): unknown[] | undefined {
  if (typeof text !== "string") return undefined;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as unknown[]) : undefined;
  } catch {
    return undefined;
  }
}

/** The one bind each entry contributes to its class's merged statement: an
 *  array of the values (a key list, an id list) or a list of pairs. */
function groupBindsFor(shape: FoldShape, entry: RenderPlanEntry): unknown[] | undefined {
  const params = entry.params;
  if (shape.family === "closure-json-id-list") return safeJsonArray(params[0]);
  if (shape.family === "or-chain-pairs" || shape.family === "pair-exists") return [...params];
  return [...params];
}

/** Build the folded batch for a plan. A plan with nothing foldable still
 *  yields a valid plan whose statements are the ladder's, one for one. */
export function foldRenderPlanEntries(entries: readonly RenderPlanEntry[]): FoldedPlan {
  const shapes = new Map<FoldShape, FoldGroup>();
  const entryShape = new Map<number, FoldShape>();
  const unfoldedFamilies: Record<string, number> = {};

  entries.forEach((entry, entryIndex) => {
    const sql = entry.sql.trim();
    let matched: FoldShape | undefined;
    for (const shape of FOLD_SHAPES) {
      if (shape.match(sql, entry.params)) {
        matched = shape;
        break;
      }
    }
    const binds = matched === undefined ? undefined : groupBindsFor(matched, entry);
    if (matched === undefined || binds === undefined) {
      // Not folded. The bucket is the shape's own SQL prefix — a named
      // reason, never a silent drop.
      const bucket = sql.slice(0, 60).replace(/\s+/g, " ");
      unfoldedFamilies[bucket] = (unfoldedFamilies[bucket] ?? 0) + 1;
      return;
    }
    entryShape.set(entryIndex, matched);
    let group = shapes.get(matched);
    if (group === undefined) {
      group = { entryIndexes: [], binds: [] };
      shapes.set(matched, group);
    }
    group.entryIndexes.push(entryIndex);
    group.binds.push(binds);
  });

  const statements: SQLStatement[] = [];
  const merged: MergedSlice[] = [];
  const unfolded: UnfoldedSlice[] = [];
  const families: Record<string, number> = {};

  // The merged statements first (the fold's own shape), then the ladder's
  // unfolded entries in plan order. Order inside the batch is irrelevant to
  // correctness (every statement is a read) and to the batch driver's result
  // alignment, which is index-wise.
  for (const [shape, group] of shapes) {
    families[shape.family] = group.entryIndexes.length;
    const hasPos = false;
    for (let start = 0; start < group.entryIndexes.length; start += FOLD_CHUNK_GROUPS) {
      const chunkIndexes = group.entryIndexes.slice(start, start + FOLD_CHUNK_GROUPS);
      const chunkBinds = group.binds.slice(start, start + FOLD_CHUNK_GROUPS);
      // A flat family binds one JSON value per source bind (the tag column is
      // that value's index); a nested family binds one list of pairs per
      // source entry (the tag is the entry's index).
      const tagToEntry: number[] = [];
      const bound = shape.nested ? chunkBinds : chunkBinds.flat();
      if (!shape.nested) {
        chunkBinds.forEach((binds, k) => {
          for (let i = 0; i < binds.length; i++) tagToEntry.push(chunkIndexes[k] as number);
        });
      }
      statements.push({
        sql: shape.build(bound, hasPos),
        params: [JSON.stringify(bound)],
      });
      merged.push({
        statementIndex: statements.length - 1,
        family: shape.family,
        entryIndexes: chunkIndexes,
        tagToEntry: shape.nested ? chunkIndexes : tagToEntry,
        hasPos,
      });
    }
  }
  entries.forEach((entry, entryIndex) => {
    if (entryShape.has(entryIndex)) return;
    unfolded.push({ statementIndex: statements.length, entryIndex });
    statements.push({ sql: entry.sql, params: entry.params });
  });

  return { statements, merged, unfolded, families, unfoldedFamilies, entryCount: entries.length };
}

/** Split a merged result back into the source entries' result sets. Every
 *  entry named by a slice gets a result even when no row carried its tag —
 *  an empty plan entry's result is `{ rows: [], rowsAffected: 0 }`, exactly
 *  what the ladder's execution of that entry returned. */
export function decomposeMergedRows(
  slice: MergedSlice,
  result: { rows?: unknown[] } | undefined,
): Map<number, unknown[]> {
  const perEntry = new Map<number, unknown[]>();
  for (const entryIndex of slice.entryIndexes) perEntry.set(entryIndex, []);
  for (const raw of result?.rows ?? []) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const tag = row[FOLD_TAG_COLUMN];
    if (typeof tag !== "number") continue;
    const entryIndex = slice.tagToEntry[tag];
    if (entryIndex === undefined) continue;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === FOLD_TAG_COLUMN || (slice.hasPos && k === FOLD_POS_COLUMN)) continue;
      out[k] = v;
    }
    perEntry.get(entryIndex)?.push(out);
  }
  return perEntry;
}