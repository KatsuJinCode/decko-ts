// The batched inclusion prefetch - the decko-commons/decko#1282 mechanism.
//
// Ruby resolves nests depth-first: every {{inclusion}} costs a Card.fetch at
// render time (one per inclusion per level - the N+1 the upstream proposal
// replaces; measured truth: depth+3 queries for a depth-N chain). This
// prefetcher inverts the order: it resolves the ENTIRE inclusion closure
// BEFORE rendering starts, so the render itself is pure memory.
//
// Three cooperating mechanisms:
//
// 1. SQL-side closure walk (the accelerator): one recursive CTE follows
//    {{...}} references through db_content in SQLite itself, so the whole
//    tree - any depth - arrives in ONE statement. Spans cannot nest braces
//    (Chunk::Nest full_re [^{}]*), so an instr-chained span scan (find the
//    next '{{', cut at the first '}}') reproduces the chunker's spans; the
//    key transform is a best-effort lower/space-to-underscore (the JS parser
//    is the semantic authority, see 3). Cycle-safe: UNION dedups whole rows.
//    JUNCTION COVERAGE: post-2020 junction rows carry NULL name/key columns,
//    so the walk resolves every frontier key through a `resolved` closure -
//    a second recursive CTE that composes each junction row's key from its
//    sides (left-resolved+right-simple, then right-resolved+left-simple -
//    the DbLexicon nameToLex walk in SQL). Frontier keys match resolved.ckey
//    whether they name simple cards or composed junctions, so junction
//    references enter the SQL frontier too.
//    (PERFORMANCE NOTE, 2026-09-20 profile: the previous numbers-table scan
//    cost O(10k positions x frontier x cards) per walk - up to 173 s per
//    render on the corpus, because `c."key" = f.key` could not use the
//    NOCASE-collated cards_key_index under BINARY comparison and fell back
//    to the near-unselective trash index. The span chain removes the
//    numbers table entirely and key comparisons are annotated COLLATE
//    NOCASE - lossless for decko's lowercase-ASCII keys, and it lets the
//    planner seek cards_key_index.)
// 2. One driver.batch round trip: [walk+rows, type+side cards]. On the edge
//    drivers this is the design's whole point (D1 batch = one HTTP request);
//    LocalSqliteDriver wraps it in one transaction.
// 3. JS verification + per-level fallback: after composing the fetched rows,
//    the REAL parser (nest-syntax.ts) re-derives every reference. Anything
//    the CTE could not resolve (compound references past what `resolved`
//    composed, relative names, odd key characters, plural stems, content
//    past the SQL scan cap) is fetched in per-level IN-query rounds - the
//    prescribed "one batched round trip per level" shape - until closure.
//    Junction sides resolve recursively: a depth-N chain takes O(N) rounds,
//    each joining junction rows by their UNIQUE (left_id, right_id) pair.
//    Correctness never depends on the SQL extraction.
//
// All fetching is read-only (SELECT); the write path is another stream.

import { DeckoName } from "../name.js";
import type { SQLDatabaseDriver, SQLStatement } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import { composeCardRecord, type CardRecord } from "../fetch/card-record.js";
import type { DbLexicon } from "../fetch/lexicon.js";
import { referencedNames } from "./nest-syntax.js";

/** Content longer than this is not span-scanned in SQL (the JS fallback
 *  rounds stay correct past the cap; 10k chars is generous for real decks). */
const SQL_CONTENT_SCAN_CAP = 10_000;

/** Safety bound for the fallback rounds (BFS over levels). */
const MAX_FALLBACK_ROUNDS = 25;

export interface PrefetchStats {
  /** driver.batch round trips issued. */
  batches: number;
  /** individual SQL statements issued (batch statements count one each). */
  statements: number;
  /** JS-verification fallback rounds (0 when the CTE covered everything). */
  fallbackRounds: number;
  /** cards composed into the fetch cache. */
  cards: number;
}

/** The row shape the prefetch needs before composition. */
interface RawRow {
  id: number;
  name: string | null;
  key: string | null;
  leftId: number | null;
  rightId: number | null;
  typeId: number | null;
  dbContent: string | null;
  trash: number;
}

function toRawRow(row: CardsRow): RawRow {
  return {
    id: row.id,
    name: row.name ?? null,
    key: row.key ?? null,
    leftId: row.left_id ?? null,
    rightId: row.right_id ?? null,
    typeId: row.type_id ?? null,
    dbContent: row.db_content ?? null,
    trash: row.trash ?? 0,
  };
}

/**
 * The recursive walk. `frontier(t, rest)` seeds with the root key; each
 * frontier row is either an unresolved target (rest IS NULL) or a scan
 * cursor (rest = content still to search). The recursive arms:
 *   A. seed the scan of a matched target (via the `resolved` key closure, so
 *      junction composed keys match too) - one substr, only nest-bearing
 *      content;
 *   B1. advance one '{{' span (slice the cursor);
 *   B2. emit the span's best-effort key (cut at '|', trim, lower,
 *       spaces->underscores) as a new unresolved target;
 *   B3. mark the scan done (back to rest IS NULL - a row that already
 *       exists, so UNION dedups it and recursion stops).
 * Rows are pure functions of (key, scan position), so cycles terminate.
 */
function walkStatement(rootKey: string, finalSelect: string): SQLStatement {
  const at = `instr(f.rest, '{{')`;
  const restAfter = `substr(f.rest, ${at} + 2)`;
  const closeAt = `instr(substr(f.rest, ${at} + 2), '}}')`;
  const span = `substr(f.rest, ${at} + 2, ${closeAt} - 1)`;
  const cutOptions =
    `CASE WHEN instr(${span}, '|') = 0 THEN ${span} ` +
    `ELSE substr(${span}, 1, instr(${span}, '|') - 1) END`;
  const keyExpr = `lower(replace(trim(${cutOptions}), ' ', '_'))`;
  const sql =
    `WITH RECURSIVE\n` +
    // Composed-key closure over ALL rows (DbLexicon.nameToLex in SQL):
    // simple cards by their key column, junction rows by their sides - one
    // joint per pass, both orientations, UNION dedups (rows are pure
    // functions of the row id, so cycles terminate).
    `resolved(id, ckey) AS (\n` +
    `  SELECT id, "key" FROM cards WHERE "key" IS NOT NULL AND trash = 0\n` +
    `  UNION\n` +
    `  SELECT j.id, l.ckey || '+' || r."key" FROM resolved l\n` +
    `    JOIN cards j ON j.left_id = l.id AND j.trash = 0\n` +
    `    JOIN cards r ON r.id = j.right_id AND r."key" IS NOT NULL\n` +
    `  UNION\n` +
    `  SELECT j.id, l."key" || '+' || r.ckey FROM resolved r\n` +
    `    JOIN cards j ON j.right_id = r.id AND j.trash = 0\n` +
    `    JOIN cards l ON l.id = j.left_id AND l."key" IS NOT NULL\n` +
    `),\n` +
    `frontier(t, rest) AS (\n` +
    `  SELECT ?, NULL\n` +
    `  UNION\n` +
    `  SELECT f.t, substr(c.db_content, 1, ${SQL_CONTENT_SCAN_CAP})\n` +
    `  FROM frontier f\n` +
    `  JOIN resolved rs ON rs.ckey = f.t\n` +
    `  JOIN cards c ON c.id = rs.id AND c.trash = 0\n` +
    `  WHERE f.rest IS NULL AND c.db_content LIKE '%{{%'\n` +
    `  UNION\n` +
    `  SELECT f.t, ${restAfter} FROM frontier f\n` +
    `   WHERE f.rest IS NOT NULL AND ${at} > 0\n` +
    `  UNION\n` +
    `  SELECT DISTINCT ${keyExpr}, NULL FROM frontier f\n` +
    `   WHERE f.rest IS NOT NULL AND ${at} > 0 AND ${closeAt} > 1\n` +
    `  UNION\n` +
    `  SELECT f.t, NULL FROM frontier f\n` +
    `   WHERE f.rest IS NOT NULL AND ${at} = 0\n` +
    `)\n` +
    finalSelect;
  return { sql, params: [rootKey] };
}

const SELECT_WALKED =
  `SELECT DISTINCT c.* FROM resolved rs\n` +
  `JOIN frontier f ON f.t = rs.ckey\n` +
  `JOIN cards c ON c.id = rs.id`;

/** Type cards (type names for data attributes + set keys) and side cards
 *  (lexicon composition of compound names + TYPE_PLUS_RIGHT left types) of
 *  everything the walk reached. */
const SELECT_TYPE_AND_SIDE =
  `SELECT c.* FROM cards c WHERE c.trash = 0 AND c.id IN (\n` +
  `  SELECT j.type_id FROM resolved rs JOIN frontier fj ON fj.t = rs.ckey\n` +
  `        JOIN cards j ON j.id = rs.id AND j.trash = 0 WHERE j.type_id IS NOT NULL\n` +
  `  UNION SELECT s.type_id FROM resolved rs JOIN frontier fj ON fj.t = rs.ckey\n` +
  `        JOIN cards j ON j.id = rs.id AND j.trash = 0\n` +
  `        JOIN cards s ON s.id IN (j.left_id, j.right_id) WHERE s.type_id IS NOT NULL\n` +
  `  UNION SELECT j.left_id FROM resolved rs JOIN frontier fj ON fj.t = rs.ckey\n` +
  `        JOIN cards j ON j.id = rs.id AND j.trash = 0 WHERE j.left_id IS NOT NULL\n` +
  `  UNION SELECT j.right_id FROM resolved rs JOIN frontier fj ON fj.t = rs.ckey\n` +
  `        JOIN cards j ON j.id = rs.id AND j.trash = 0 WHERE j.right_id IS NOT NULL\n` +
  `)`;

export interface PrefetchContext {
  driver: SQLDatabaseDriver;
  lexicon: DbLexicon;
  /** Writes the composed record into the fetch cache (both levels) and
   *  enriches it for the synchronous render path. Awaited: enrichment is
   *  async (cache-hit fetches) and the render must not start before every
   *  card is ready. */
  cacheRecord: (record: CardRecord) => Promise<void>;
}

/**
 * Ensure the fetch cache holds every card the render of `root` can touch
 * through {{inclusion}} references (plus the type/side cards composition
 * needs). Returns the query-cost stats.
 */
export async function prefetchInclusionClosure(
  root: CardRecord,
  ctx: PrefetchContext,
): Promise<PrefetchStats> {
  const stats: PrefetchStats = { batches: 0, statements: 0, fallbackRounds: 0, cards: 0 };
  if (root.name === undefined || root.key === undefined) return stats;

  const { driver } = ctx;

  // --- mechanism 1+2: the SQL walk, one batched round trip ------------------
  const batch = await driver.batch([
    walkStatement(root.key, SELECT_WALKED),
    walkStatement(root.key, SELECT_TYPE_AND_SIDE),
  ]);
  stats.batches += 1;
  stats.statements += 2;
  const walkedRows = ((batch[0]?.rows ?? []) as CardsRow[]).map(toRawRow);
  const sideRows = ((batch[1]?.rows ?? []) as CardsRow[]).map(toRawRow);
  console.log(
    "PROBE walked=",
    JSON.stringify(walkedRows.map((r) => [r.id, r.name, r.leftId, r.rightId])),
    "sides=",
    JSON.stringify(sideRows.map((r) => [r.id, r.name, r.leftId, r.rightId])),
  );

  // Compose + cache everything (idempotent with the fetch cache).
  const allRows = [...sideRows, ...walkedRows];
  if (!allRows.some((row) => row.id === root.id)) allRows.push(recordToRawRow(root));
  const composed = await composeAndCache(allRows, ctx, stats);

  // --- mechanism 3: JS verification + per-level fallback --------------------
  await verifyClosure([recordToRawRow(root), ...walkedRows], composed, ctx, stats);
  return stats;
}

function recordToRawRow(record: CardRecord): RawRow {
  return {
    id: record.id ?? -1,
    name: record.name?.s ?? null,
    key: record.key ?? null,
    leftId: record.leftId ?? null,
    rightId: record.rightId ?? null,
    typeId: record.typeId ?? null,
    dbContent: record.dbContent ?? null,
    trash: record.trash ? 1 : 0,
  };
}

/**
 * Compose rows into CardRecords, sides before junctions (multi-pass over the
 * row map so every compound name resolves within the batch), prime the
 * lexicon (Lexicon#write - lib/card/lexicon.rb#write) and write every record
 * into the fetch cache. Composing through the warmed lexicon costs zero
 * queries. Returns the composed records so callers can index them by key
 * (the junction-closure walk needs composed-key -> id).
 */
async function composeAndCache(
  rows: RawRow[],
  ctx: PrefetchContext,
  stats: PrefetchStats,
): Promise<CardRecord[]> {
  const byId = new Map<number, RawRow>();
  for (const row of rows) byId.set(row.id, row);

  // Bottom-up name composition over the row map (sides before junctions),
  // so each Lexicon#write carries the composed name like Ruby's would.
  // Sides cached by an EARLIER call (previous fallback rounds) resolve
  // through the lexicon - warm-cache reads, zero queries - so a junction
  // fetched in round N composes against sides fetched in round N-1.
  const names = new Map<number, DeckoName>();
  let pending = [...byId.values()];
  for (let pass = 0; pass < 64 && pending.length > 0; pass++) {
    const still: RawRow[] = [];
    for (const row of pending) {
      const composed = await tryComposeName(row, names, ctx);
      if (composed !== undefined) names.set(row.id, composed);
      else still.push(row);
    }
    if (still.length === pending.length) break; // unresolvable sides stay
    pending = still;
  }

  const composedRecords: CardRecord[] = [];
  for (const row of byId.values()) {
    const name = names.get(row.id);
    if (name === undefined) continue;
    if (row.name !== null) {
      ctx.lexicon.write(row.id, name, row.name); // simple lex: the name string
    } else if (row.leftId !== null && row.rightId !== null) {
      ctx.lexicon.write(row.id, name, [row.leftId, row.rightId]); // compound lex
    }
  }

  for (const row of byId.values()) {
    const name = names.get(row.id);
    if (name === undefined) continue;
    const record = await composeCardRecord(rowToCardsRow(row), ctx.lexicon);
    await ctx.cacheRecord(record);
    composedRecords.push(record);
    stats.cards += 1;
  }
  return composedRecords;
}

async function tryComposeName(
  row: RawRow,
  names: Map<number, DeckoName>,
  ctx: PrefetchContext,
): Promise<DeckoName | undefined> {
  if (row.name !== null) return DeckoName.parse(row.name);
  if (row.leftId === null || row.rightId === null) return undefined;
  const left = await sideName(row.leftId, names, ctx);
  const right = await sideName(row.rightId, names, ctx);
  if (left === undefined || right === undefined) return undefined;
  return DeckoName.parse(`${left.s}+${right.s}`);
}

/** This call's composition first, then the lexicon's cached name for a side
 *  an earlier call already composed (warm-cache read; a genuinely unknown
 *  side yields undefined and the junction stays uncomposed this pass). */
async function sideName(
  id: number,
  names: Map<number, DeckoName>,
  ctx: PrefetchContext,
): Promise<DeckoName | undefined> {
  const local = names.get(id);
  if (local !== undefined) return local;
  try {
    const viaLexicon = await ctx.lexicon.name(id);
    return viaLexicon !== undefined && viaLexicon.s !== "" ? viaLexicon : undefined;
  } catch {
    return undefined;
  }
}

function rowToCardsRow(row: RawRow): CardsRow {
  // Only the fields composeCardRecord reads matter here (dates/creators are
  // not rendered); the NOT-NULL columns get inert values.
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    codename: null,
    left_id: row.leftId,
    right_id: row.rightId,
    current_revision_id: null,
    created_at: "",
    updated_at: "",
    creator_id: 0,
    updater_id: 0,
    read_rule_class: null,
    read_rule_id: null,
    references_expired: null,
    trash: row.trash === 1 ? 1 : 0,
    type_id: row.typeId ?? 0,
    db_content: row.dbContent,
  };
}

/**
 * The semantic authority: parse every fetched card's content with the real
 * parser; any reference not already resolved is fetched here, in per-level
 * rounds (the prescribed one-batch-per-level shape).
 *
 * Junction handling (the 2020 NULL-key convention): a compound reference
 * resolves through its SIDES, exactly the walk DbLexicon.nameToLex does -
 * simple sides by key, compound sides recursively (each round resolves
 * deeper sides first, then the junction row joins its sides' ids by the
 * UNIQUE (left_id, right_id) pair). Depth-2 pairs keep the direct side-key
 * join (one round); a depth-N chain takes O(N) rounds. Unknown names simply
 * stop the rounds - the render's nest fetch decides what an unknown nest
 * means (wave 3).
 */
async function verifyClosure(
  scanRows: RawRow[],
  composed: CardRecord[],
  ctx: PrefetchContext,
  stats: PrefetchStats,
): Promise<void> {
  /** Composed keys with a cached record - "this name resolves". */
  const known = new Set<string>();
  /** Composed key -> row id (junction side-id joins need the ids). */
  const knownIds = new Map<string, number>();
  const seedKeys = (records: CardRecord[]): void => {
    for (const record of records) {
      if (record.key !== undefined && record.key !== "" && !record.isNew) {
        known.add(record.key);
        if (record.id !== undefined) knownIds.set(record.key, record.id);
      }
    }
  };
  for (const row of scanRows) {
    if (row.key !== null) known.add(row.key); // simple rows: key is authoritative
  }
  seedKeys(composed);

  let pending = new Set<string>();
  const collect = (rows: RawRow[]): void => {
    for (const row of rows) {
      const content = row.dbContent;
      if (content === null || content === "") continue;
      for (const ref of referencedNames(content)) {
        if (ref.relative) continue; // context-relative: render-time resolution
        const name = DeckoName.parse(ref.name);
        if (name.s === "" || known.has(name.key)) continue;
        pending.add(name.s);
      }
    }
  };
  collect(scanRows);

  for (let round = 0; round < MAX_FALLBACK_ROUNDS && pending.size > 0; round++) {
    stats.fallbackRounds += 1;
    const simpleKeys: string[] = [];
    const sideKeyPairs: { left: string; right: string }[] = [];
    const sideIdPairs: { leftId: number; rightId: number }[] = [];
    for (const nameStr of pending) {
      const name = DeckoName.parse(nameStr);
      if (known.has(name.key)) continue; // an earlier round resolved it
      if (!name.isCompound) {
        simpleKeys.push(name.key);
        continue;
      }
      const left = name.leftName;
      const right = name.rightName;
      if (left === undefined || right === undefined) continue;
      const leftKnown = known.has(left.key);
      const rightKnown = known.has(right.key);
      if (!left.isCompound && !right.isCompound) {
        // depth-2 pair: direct side-key join, and fetch the sides themselves
        // in the same round so the junction composes (composed-key resolution).
        sideKeyPairs.push({ left: left.key, right: right.key });
        if (!leftKnown) simpleKeys.push(left.key);
        if (!rightKnown) simpleKeys.push(right.key);
      } else if (leftKnown && rightKnown) {
        // both sides' rows are cached: join the junction row by side ids
        // (the UNIQUE index_cards_on_left_id_and_right_id pair).
        const leftId = knownIds.get(left.key);
        const rightId = knownIds.get(right.key);
        if (leftId !== undefined && rightId !== undefined) {
          sideIdPairs.push({ leftId, rightId });
        }
      } else {
        // a compound side is not yet resolved: resolve the sides first
        // (they join this round as their own pending targets).
        if (!leftKnown) pending.add(left.s);
        if (!rightKnown) pending.add(right.s);
      }
    }

    const fetched: RawRow[] = [];
    if (simpleKeys.length > 0) {
      const placeholders = simpleKeys.map(() => "?").join(", ");
      const result = await ctx.driver.query<CardsRow>(
        // COLLATE NOCASE matches the collation of cards_key_index (the
        // column itself is BINARY); lossless for decko's lowercase keys -
        // see the module perf note.
        `SELECT * FROM cards WHERE "key" COLLATE NOCASE IN (${placeholders}) AND trash = 0`,
        simpleKeys,
      );
      stats.statements += 1;
      for (const row of result.rows as CardsRow[]) fetched.push(toRawRow(row));
    }
    if (sideKeyPairs.length > 0) {
      const leftKeys = sideKeyPairs.map((pair) => pair.left);
      const rightKeys = sideKeyPairs.map((pair) => pair.right);
      const placeholdersL = leftKeys.map(() => "?").join(", ");
      const placeholdersR = rightKeys.map(() => "?").join(", ");
      const result = await ctx.driver.query<CardsRow>(
        `SELECT DISTINCT j.* FROM cards j\n` +
        `  JOIN cards l ON l.id = j.left_id AND l."key" COLLATE NOCASE IN (${placeholdersL})\n` +
        `  JOIN cards r ON r.id = j.right_id AND r."key" COLLATE NOCASE IN (${placeholdersR})\n` +
        ` WHERE j.trash = 0`,
        [...leftKeys, ...rightKeys],
      );
      stats.statements += 1;
      for (const row of result.rows as CardsRow[]) fetched.push(toRawRow(row));
    }
    if (sideIdPairs.length > 0) {
      const tuple = sideIdPairs.map(() => `(j.left_id = ? AND j.right_id = ?)`).join(" OR ");
      const params = sideIdPairs.flatMap((pair) => [pair.leftId, pair.rightId]);
      const result = await ctx.driver.query<CardsRow>(
        `SELECT j.* FROM cards j WHERE j.trash = 0 AND (${tuple})`,
        params,
      );
      stats.statements += 1;
      for (const row of result.rows as CardsRow[]) fetched.push(toRawRow(row));
    }

    if (fetched.length === 0) return; // unknown names: stop, render decides
    const newComposed = await composeAndCache(fetched, ctx, stats);
    seedKeys(newComposed); // junction rows resolve through their composed keys
    collect(fetched); // their content references join the pending set
    for (const nameStr of [...pending]) {
      if (known.has(DeckoName.parse(nameStr).key)) pending.delete(nameStr);
    }
  }
}
