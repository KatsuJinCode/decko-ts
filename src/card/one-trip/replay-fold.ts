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
/** The namespace every fold-internal column shares — decompose strips ALL of
 *  them, so merged-only columns (the side-key arm's per-row match keys) can
 *  never leak into an entry's served result. */
export const FOLD_NAMESPACE = "__fold_";
/** The side-key arm's per-row match keys: which bound l-key / r-key each j
 *  row matched. The drift arm index uses them to answer a SMALLER side-key
 *  ask from a recorded superset entry's rows (driftfix lane). */
export const FOLD_LEFT_KEY_COLUMN = "__fold_lk";
export const FOLD_RIGHT_KEY_COLUMN = "__fold_rk";
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
 *  does not match and the entry rides the ladder unchanged.
 *
 *  THE 2-PAIR REFUSAL (driftfix lane, 2026-10-06 — measured, Peace_Practices
 *  plan entry #91): SQLite answers a two-term OR chain with the multi-index
 *  OR plan, whose row order is BRANCH order, not id order (ids 19825, 12796
 *  vs the merged arm's id-ordered 12796, 19825). Three or more terms tip the
 *  planner back to a full scan, which IS id order (51/52 non-empty entries
 *  measured id-ordered across the six measured pages, the one deviation this
 *  two-term entry). The 2-value IN-list refusal's sibling: an order no rule
 *  expresses is an order the fold does not reproduce. */
function isOrPairShape(sql: string, params: unknown[]): boolean {
  if (params.length % 2 !== 0 || params.length === 0 || !allNumbers(params)) return false;
  const terms = params.length / 2;
  if (terms === 2) return false;
  let expected = OR_PAIR_HEAD;
  for (let i = 0; i < terms - 1; i++) expected += ` OR ${OR_PAIR_TERM}`;
  return `${expected})` === sql;
}
/** The side-key join shape: the DISTINCT junction read through BOTH sides'
 *  key IN-lists (the largest unfurled residual of the giant fold, now folded
 *  by the driftfix lane). The arm keeps the source's own DISTINCT semantics
 *  per (l-key, r-key) combination and lets decompose collapse the rows back
 *  to DISTINCT j.* per entry. Whitespace-tolerant: the recorder captured this
 *  shape multi-line (`\n  JOIN cards l ...`), which is exactly why it never
 *  met the giant fold's single-line matchers. */
const SIDE_KEY_RE =
  /^SELECT\s+DISTINCT\s+j\.\*\s+FROM\s+cards\s+j\s+JOIN\s+cards\s+l\s+ON\s+l\.id\s*=\s*j\.left_id\s+AND\s+l\."key"\s+COLLATE\s+NOCASE\s+IN\s*\([^)]*\)\s+JOIN\s+cards\s+r\s+ON\s+r\.id\s*=\s*j\.right_id\s+AND\s+r\."key"\s+COLLATE\s+NOCASE\s+IN\s*\([^)]*\)\s+WHERE\s+j\.trash\s*=\s*0$/;
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
  // THE SIDE-KEY JOIN (driftfix lane, 2026-10-06) — the giant fold's largest
  // unfurled residual, now an arm. The source's L x R pair product is NOT
  // materialized: both sides expand from the ONE flat bind via two json_each
  // scans over the same entry array (first half = l keys, second half = r
  // keys), each side seeking `cards` by its key index and the junction by
  // its UNIQUE (left_id, right_id) index — the CROSS JOIN planner lesson
  // (fold-plan §3 point 3). Per-row match keys ride along (__fold_lk/rk) so
 // the drift arm index can answer a SMALLER ask from a recorded superset.
  // DISTINCT over (tag, lk, rk, j.*) keeps one row per (entry, combination);
  // decompose collapses back to the source's DISTINCT j.* per entry.
  //
  // Refusals: binds not canonical lowercase (the BINARY-join collation
  // precondition, shared with cards-key-multi), an odd bind count, or fewer
  // than THREE binds on a side — the 2-value order artifact generalized to
  // both halves (measured: every non-id-ordered side-key entry on the six
  // measured pages has a side with exactly two binds).
  {
    family: "side-key-join",
    nested: true,
    match: (sql, params) =>
      SIDE_KEY_RE.test(sql.trim()) &&
      params.length >= 6 &&
      params.length % 2 === 0 &&
      allStringsLowercase(params),
    build: () =>
      `SELECT DISTINCT g.key AS ${FOLD_TAG_COLUMN}, l.value AS ${FOLD_LEFT_KEY_COLUMN}, r.value AS ${FOLD_RIGHT_KEY_COLUMN}, ${cardProjection("j")} ` +
      `FROM json_each(?) AS g ` +
      `CROSS JOIN json_each(g.value) AS l ` +
      `CROSS JOIN json_each(g.value) AS r ` +
      `CROSS JOIN cards cl ON cl."key" = l.value ` +
      `CROSS JOIN cards cr ON cr."key" = r.value ` +
      `CROSS JOIN cards j ON j.left_id = cl.id AND j.right_id = cr.id ` +
      `WHERE l.key < json_array_length(g.value) / 2 AND r.key >= json_array_length(g.value) / 2 AND j.trash = 0 ` +
      `ORDER BY ${FOLD_TAG_COLUMN}, j.id`,
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
  /** The source statement was SELECT DISTINCT over the card rows (the
   *  side-key join): the arm's per-combination rows must collapse back to
   *  one row per card id per entry, keeping the first (arm order = id
   *  order), or the decomposed result would carry duplicates the ladder
   *  never returned. */
  distinctById?: boolean;
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
  if (shape.family === "side-key-join") {
    // one flat bind per entry: [l keys..., r keys...] — the arm splits the
    // halves inside SQL via json_array_length
    return [...params];
  }
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
        distinctById: shape.family === "side-key-join",
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
 *  what the ladder's execution of that entry returned.
 *
 *  ALL `__fold_`-namespaced columns are stripped (the tag, the ordinal, the
 *  side-key arm's per-row match keys — anything the merged statement carried
 *  for its own bookkeeping), so a decomposed entry's rows are
 *  column-identical to the ladder's. */
export function decomposeMergedRows(
  slice: MergedSlice,
  result: { rows?: unknown[] } | undefined,
): Map<number, unknown[]> {
  const perEntry = new Map<number, unknown[]>();
  for (const entryIndex of slice.entryIndexes) perEntry.set(entryIndex, []);
  const seenIds = slice.distinctById ? new Map<number, Set<unknown>>() : undefined;
  for (const raw of result?.rows ?? []) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const tag = row[FOLD_TAG_COLUMN];
    if (typeof tag !== "number") continue;
    const entryIndex = slice.tagToEntry[tag];
    if (entryIndex === undefined) continue;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith(FOLD_NAMESPACE)) continue;
      out[k] = v;
    }
    if (seenIds !== undefined) {
      // DISTINCT j.* semantics: one row per card id per entry, first wins
      // (the arm's ORDER BY tag, id makes duplicates adjacent and the first
      // occurrence deterministic).
      let ids = seenIds.get(entryIndex);
      if (ids === undefined) {
        ids = new Set<unknown>();
        seenIds.set(entryIndex, ids);
      }
      if (ids.has(out.id)) continue;
      ids.add(out.id);
    }
    perEntry.get(entryIndex)?.push(out);
  }
  return perEntry;
}

// ---------------------------------------------------------------------------
// THE DRIFT ARM INDEX (driftfix lane, 2026-10-06)
//
// THE REGRESSION: the four drift pages (Aikido_2, Aikido_in_Education,
// Peace_Practices, Laundry) fell from 5 to 14-30 trips on the assembled tree
// because the live render's key-multi / side-key / or-chain IN-list binds
// depend on mid-flight cache evolution; a bind set that differs from record
// time misses the armed map's exact (sql, params) key and the statement
// rides live in a small batch. Measured record-vs-live shapes: the recorded
// ask `IN ("", "", "", "", "", "kayla_feder", "recommendation")` comes back
// live as `IN ("kayla_feder", "recommendation")` — the SAME question with
// the cache-warmed holes gone.
//
// THE CURE (spec §2): the drift classes' answers are indexed by BIND VALUE,
// not by (sql, params) pair. A drifted ask whose every bind is covered by
// the recorded rows composes its answer from the index — bind drift is
// structurally impossible to miss because there are no per-entry pairs to
// miss. A question the plan never asked (any bind uncovered) is NOT served:
// the live path stays authoritative, exactly as the router's contract
// requires ("a hit returns the rows the database itself returned for that
// statement against this deck" — extended to "that question's binds").
//
// THE MEASURED LAWS each composition rule rests on (driftfix offline
// experiments 02/03/04/05, deck `arch-demo-45p-freshness-stamped`):
//   - key IN-lists with 3+ binds return rows in card-id order; exactly-2
//     binds are a planner artifact (the giant fold's refusal, preserved) —
//     drifted 2-value asks ride live, never served.
//   - OR-chains: same law on PAIR count (the 2-pair refusal, new — measured
//     Peace_Practices #91); 1-pair and 3+-pair asks compose id-ordered.
//   - side-key asks: a live ask whose left keys are a subset of some
//     recorded entry's left keys AND whose right keys are a subset of that
//     SAME entry's right keys composes order-exact (id-sorted, deduped) —
//     21/21 covered asks on Aikido_2. Cross-entry unions are NOT provable
//     from binds alone and are never served.
//   - LIMIT 1 point asks serve the id-ordered first row (the MIN-id row the
//     limit returns on the key index).
// ---------------------------------------------------------------------------

/** The drift classes the index serves, decided by the SAME shape matchers
 *  the fold uses — one source of truth for "what is this statement?". */
export type DriftServeClass =
  | "key-point"
  | "key-multi"
  | "side-key"
  | "or-chain"
  | "pair-exists"
  | "id-point"
  | "template-link";

export function classifyDriftServeClass(sql: string, params: unknown[]): DriftServeClass | undefined {
  const t = sql.trim();
  if (KEY_POINT_RE.test(t) && params.length === 1 && allStringsLowercase(params)) return "key-point";
  // the exactly-2-bind IN-list refusal is a SERVING rule too: SQLite's
  // two-way IN order is a planner artifact and the composition cannot
  // reproduce it (measured: both serving order-mismatches were 2-value).
  if (KEY_MULTI_RE.test(t) && params.length > 0 && params.length !== 2 && allStringsLowercase(params)) {
    return "key-multi";
  }
  if (
    SIDE_KEY_RE.test(t) &&
    params.length >= 2 &&
    params.length % 2 === 0 &&
    allStringsLowercase(params)
  ) {
    return "side-key";
  }
  // isOrPairShape carries the 2-pair refusal (branch-order artifact).
  if (isOrPairShape(t, params)) return "or-chain";
  if (PAIR_EXISTS_RE.test(t) && params.length === 2 && allNumbers(params)) return "pair-exists";
  if (ID_POINT_RE.test(t) && params.length === 1 && allNumbers(params)) return "id-point";
  // the primary-key IN-list's row order is rowid order at every bind count
  // (measured 32/32 entries id-ordered, `IN (?, ?)` included).
  if (TEMPLATE_LINK_RE.test(t) && params.length > 0 && allNumbers(params)) return "template-link";
  return undefined;
}

/** One recorded side-key entry's absorbable shape: its bind supersets plus
 *  every junction row attributed to the (l-key, r-key) combination that
 *  matched it. A live ask composes from this entry when its own bind sets
 *  are subsets of THESE. */
export interface SideKeyArmEntry {
  entryIndex: number;
  lKeys: Set<string>;
  rKeys: Set<string>;
  rows: { row: Record<string, unknown>; lk: string; rk: string }[];
}

export interface DriftArmIndex {
  /** key -> the recorded point-read rows (0 or 1: the source is LIMIT 1) */
  keyPoint: Map<string, Record<string, unknown>[]>;
  /** key -> every row a key-multi entry recorded for it (id-ordered) */
  keyMulti: Map<string, Record<string, unknown>[]>;
  /** keys a key-multi entry asked and got ZERO rows for: negative knowledge */
  keyMultiAskedEmpty: Set<string>;
  /** "l,r" -> the recorded probe rows (0 or 1: the UNIQUE pair index) */
  pairExists: Map<string, Record<string, unknown>[]>;
  /** "l,r" -> the recorded junction rows for that pair */
  orChain: Map<string, Record<string, unknown>[]>;
  /** pairs an or-chain entry asked and got zero rows for */
  orChainAskedEmpty: Set<string>;
  /** id -> the recorded point rows (0 or 1) */
  idPoint: Map<string, Record<string, unknown>[]>;
  idPointAskedEmpty: Set<string>;
  /** id -> the recorded template-link rows (id, db_content) */
  templateLink: Map<string, Record<string, unknown>[]>;
  templateLinkAskedEmpty: Set<string>;
  sideKeyEntries: SideKeyArmEntry[];
}

function emptyDriftArmIndex(): DriftArmIndex {
  return {
    keyPoint: new Map(),
    keyMulti: new Map(),
    keyMultiAskedEmpty: new Set(),
    pairExists: new Map(),
    orChain: new Map(),
    orChainAskedEmpty: new Set(),
    idPoint: new Map(),
    idPointAskedEmpty: new Set(),
    templateLink: new Map(),
    templateLinkAskedEmpty: new Set(),
    sideKeyEntries: [],
  };
}

type Row = Record<string, unknown>;

function pushDistinct(map: Map<string, Row[]>, key: string, rows: Row[]): void {
  const existing = map.get(key);
  if (existing === undefined) {
    map.set(key, [...rows]);
    return;
  }
  const ids = new Set(existing.map((r) => r.id));
  for (const row of rows) if (!ids.has(row.id)) existing.push(row);
}

/** Build the index from a plan's per-entry results (the ladder's own
 *  execution OR the folded batch's decomposed results — row shapes are
 *  identical by the exactness contract). Attribution is client-side only:
 *  a row's own columns name its bind (a card row's `key`, a junction row's
 *  `left_id`/`right_id`, a template row's `id`). */
export function buildDriftArmIndex(
  entries: readonly RenderPlanEntry[],
  results: readonly unknown[],
): DriftArmIndex {
  const index = emptyDriftArmIndex();
  entries.forEach((entry, i) => {
    const cls = classifyDriftServeClass(entry.sql, entry.params);
    if (cls === undefined || cls === "side-key") return; // side-key needs the arm's match keys
    const result = results[i] as { rows?: unknown[] } | undefined;
    const rows = (result?.rows ?? []).filter(
      (r): r is Row => typeof r === "object" && r !== null,
    );
    if (cls === "key-point") {
      index.keyPoint.set(String(entry.params[0]), rows);
    } else if (cls === "key-multi") {
      for (const row of rows) {
        const key = row["key"];
        if (typeof key === "string") pushDistinct(index.keyMulti, key, [row]);
      }
      for (const bind of entry.params) {
        const key = String(bind);
        if (!index.keyMulti.has(key)) index.keyMultiAskedEmpty.add(key);
      }
    } else if (cls === "pair-exists") {
      index.pairExists.set(`${String(entry.params[0])},${String(entry.params[1])}`, rows);
    } else if (cls === "or-chain") {
      const pairs: string[] = [];
      for (let p = 0; p < entry.params.length; p += 2) {
        pairs.push(`${String(entry.params[p])},${String(entry.params[p + 1])}`);
      }
      for (const row of rows) {
        const pk = `${String(row["left_id"])},${String(row["right_id"])}`;
        if (pairs.includes(pk)) pushDistinct(index.orChain, pk, [row]);
      }
      for (const pk of pairs) if (!index.orChain.has(pk)) index.orChainAskedEmpty.add(pk);
    } else if (cls === "id-point") {
      index.idPoint.set(String(entry.params[0]), rows);
    } else if (cls === "template-link") {
      for (const row of rows) pushDistinct(index.templateLink, String(row["id"]), [row]);
      for (const bind of entry.params) {
        const id = String(bind);
        if (!index.templateLink.has(id)) index.templateLinkAskedEmpty.add(id);
      }
    }
  });
  return index;
}

/** Absorb the side-key arm's raw merged rows into the index. Only the folded
 *  path can do this: the per-row match keys (__fold_lk / __fold_rk) exist
 *  only in the merged result, before decompose strips them. */
export function absorbSideKeyArmRows(
  index: DriftArmIndex,
  entries: readonly RenderPlanEntry[],
  folded: FoldedPlan,
  mergedResults: readonly unknown[],
): void {
  for (const slice of folded.merged) {
    if (slice.family !== "side-key-join") continue;
    const result = mergedResults[slice.statementIndex] as { rows?: unknown[] } | undefined;
    const byEntry = new Map<number, SideKeyArmEntry>();
    for (const raw of result?.rows ?? []) {
      if (typeof raw !== "object" || raw === null) continue;
      const row = raw as Row;
      const tag = row[FOLD_TAG_COLUMN];
      if (typeof tag !== "number") continue;
      const entryIndex = slice.tagToEntry[tag];
      if (entryIndex === undefined) continue;
      const lk = row[FOLD_LEFT_KEY_COLUMN];
      const rk = row[FOLD_RIGHT_KEY_COLUMN];
      if (typeof lk !== "string" || typeof rk !== "string") continue;
      const out: Row = {};
      for (const [k, v] of Object.entries(row)) {
        if (k.startsWith(FOLD_NAMESPACE)) continue;
        out[k] = v;
      }
      let armEntry = byEntry.get(entryIndex);
      if (armEntry === undefined) {
        const binds = entries[entryIndex]?.params ?? [];
        const half = binds.length / 2;
        armEntry = {
          entryIndex,
          lKeys: new Set(binds.slice(0, half).map(String)),
          rKeys: new Set(binds.slice(half).map(String)),
          rows: [],
        };
        byEntry.set(entryIndex, armEntry);
      }
      // the arm is DISTINCT over (tag, lk, rk, j.*): one j row can appear
      // once per matching combination — the source's DISTINCT j.* collapses
      // them; keep the first (arm order = id order).
      if (armEntry.rows.some((c) => c.row.id === out.id)) continue;
      armEntry.rows.push({ row: out, lk, rk });
    }
    index.sideKeyEntries.push(...byEntry.values());
  }
}

/** Merge an incoming index into an armed one (multi-page sessions re-arm per
 *  page; same deck, same rows — accumulation is the map's own contract). */
export function mergeDriftArmIndex(target: DriftArmIndex, incoming: DriftArmIndex): DriftArmIndex {
  for (const [k, v] of incoming.keyPoint) target.keyPoint.set(k, v);
  for (const [k, v] of incoming.keyMulti) pushDistinct(target.keyMulti, k, v);
  for (const k of incoming.keyMultiAskedEmpty) target.keyMultiAskedEmpty.add(k);
  for (const [k, v] of incoming.pairExists) target.pairExists.set(k, v);
  for (const [k, v] of incoming.orChain) pushDistinct(target.orChain, k, v);
  for (const k of incoming.orChainAskedEmpty) target.orChainAskedEmpty.add(k);
  for (const [k, v] of incoming.idPoint) target.idPoint.set(k, v);
  for (const k of incoming.idPointAskedEmpty) target.idPointAskedEmpty.add(k);
  for (const [k, v] of incoming.templateLink) pushDistinct(target.templateLink, k, v);
  for (const k of incoming.templateLinkAskedEmpty) target.templateLinkAskedEmpty.add(k);
  const seen = new Set(target.sideKeyEntries.map((e) => e.entryIndex));
  for (const e of incoming.sideKeyEntries) if (!seen.has(e.entryIndex)) target.sideKeyEntries.push(e);
  return target;
}

function composeIdOrdered(map: Map<string, Row[]>, keys: iterableOfStrings): Row[] | undefined {
  void map;
  void keys;
  return undefined;
}
type iterableOfStrings = Iterable<string>;

/** Compose a drifted ask's answer from the index, or undefined when the ask
 *  is not provably covered (it rides live). Every served row set equals what
 *  the database returns for that statement against this deck — content AND
 *  order — per the measured laws above. */
export function serveFromDriftArmIndex(
  index: DriftArmIndex,
  sql: string,
  params: unknown[],
): { rows: Row[] } | undefined {
  const cls = classifyDriftServeClass(sql, params);
  if (cls === undefined) return undefined;
  if (cls === "key-point") {
    const key = String(params[0]);
    const rows = index.keyPoint.get(key);
    if (rows !== undefined) return { rows };
    // the point read's LIMIT 1 row is the id-ordered first row of the
    // multi-read's rows for the same key (the key index returns MIN id).
    const multi = index.keyMulti.get(key);
    if (multi !== undefined && multi.length > 0) return { rows: [multi[0]!] };
    return undefined;
  }
  if (cls === "key-multi") {
    const keys = [...new Set(params.map(String))];
    for (const key of keys) {
      if (!index.keyMulti.has(key) && !index.keyMultiAskedEmpty.has(key)) return undefined;
    }
    const byId = new Map<unknown, Row>();
    for (const key of keys) {
      for (const row of index.keyMulti.get(key) ?? []) {
        if (!byId.has(row.id)) byId.set(row.id, row);
      }
    }
    return { rows: [...byId.values()].sort((a, b) => (a.id as number) - (b.id as number)) };
  }
  if (cls === "or-chain") {
    const pairs: string[] = [];
    for (let p = 0; p < params.length; p += 2) {
      const pk = `${String(params[p])},${String(params[p + 1])}`;
      if (!pairs.includes(pk)) pairs.push(pk);
    }
    for (const pk of pairs) {
      if (!index.orChain.has(pk) && !index.orChainAskedEmpty.has(pk)) return undefined;
    }
    const byId = new Map<unknown, Row>();
    for (const pk of pairs) {
      for (const row of index.orChain.get(pk) ?? []) {
        if (!byId.has(row.id)) byId.set(row.id, row);
      }
    }
    return { rows: [...byId.values()].sort((a, b) => (a.id as number) - (b.id as number)) };
  }
  if (cls === "side-key") {
    const half = params.length / 2;
    const lKeys = new Set(params.slice(0, half).map(String));
    const rKeys = new Set(params.slice(half).map(String));
    // the single-entry superset rule: provable coverage, never a cross-entry
    // union (a junction row's presence in a UNION of entries is not decidable
    // from binds alone).
    const entry = index.sideKeyEntries.find(
      (e) =>
        [...lKeys].every((k) => e.lKeys.has(k)) && [...rKeys].every((k) => e.rKeys.has(k)),
    );
    if (entry === undefined) return undefined;
    const byId = new Map<unknown, Row>();
    for (const combo of entry.rows) {
      if (!lKeys.has(combo.lk) || !rKeys.has(combo.rk)) continue;
      if (!byId.has(combo.row.id)) byId.set(combo.row.id, combo.row);
    }
    return { rows: [...byId.values()].sort((a, b) => (a.id as number) - (b.id as number)) };
  }
  if (cls === "pair-exists") {
    const rows = index.pairExists.get(`${String(params[0])},${String(params[1])}`);
    return rows !== undefined ? { rows } : undefined;
  }
  if (cls === "id-point") {
    const id = String(params[0]);
    const rows = index.idPoint.get(id);
    if (rows !== undefined) return { rows };
    if (index.idPointAskedEmpty.has(id)) return { rows: [] };
    return undefined;
  }
  // template-link: the primary-key IN-list, id order at every bind count
  const ids = [...new Set(params.map(String))];
  for (const id of ids) {
    if (!index.templateLink.has(id) && !index.templateLinkAskedEmpty.has(id)) return undefined;
  }
  const byId = new Map<unknown, Row>();
  for (const id of ids) {
    for (const row of index.templateLink.get(id) ?? []) {
      if (!byId.has(row.id)) byId.set(row.id, row);
    }
  }
  return { rows: [...byId.values()].sort((a, b) => (a.id as number) - (b.id as number)) };
}