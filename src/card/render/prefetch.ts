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
//    (Chunk::Nest full_re [^{}]*), so a numbers-table scan for '{{' +
//    first '}}' reproduces the chunker's spans; the key transform is a
//    best-effort lower/space-to-underscore (the JS parser is the semantic
//    authority, see 3). Cycle-safe: UNION dedups keys.
//    COVERAGE BOUNDARY: the walk matches references against cards.key -
//    SIMPLE references only. Post-2020 junction rows store NULL name/key
//    columns (composition runs through the lexicon side ids), so compound
//    references cannot be matched in SQL without re-implementing name
//    composition there; they ride the fallback below instead.
// 2. One driver.batch round trip: [walk+rows, type+side cards]. On the edge
//    drivers this is the design's whole point (D1 batch = one HTTP request);
//    LocalSqliteDriver wraps it in one transaction.
// 3. JS verification + per-level fallback: after composing the fetched rows,
//    the REAL parser (nest-syntax.ts) re-derives every reference. Anything
//    the CTE could not resolve (compound references, relative names, odd key
//    characters, plural stems, content past the SQL scan cap) is fetched in
//    per-level IN-query rounds - the prescribed "one batched round trip per
//    level" shape - until closure. Correctness never depends on the SQL
//    extraction.
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
 * The recursive walk. `frontier` seeds with the root key; the recursive step
 * extracts every `{{...}}` span of every frontier card's content (via the
 * numbers table), cuts nest options at "|", best-effort transforms the name
 * to its key (lowercase + spaces to underscores - enough for the common
 * absolute reference), and adds it. UNION dedups, so cycles terminate.
 */
function walkStatement(rootKey: string, finalSelect: string): SQLStatement {
  const rawSpan =
    `substr(c.db_content, n.n + 2, instr(substr(c.db_content, n.n + 2), '}}') - 1)`;
  const cutOptions =
    `CASE WHEN instr(${rawSpan}, '|') = 0 THEN ${rawSpan} ` +
    `ELSE substr(${rawSpan}, 1, instr(${rawSpan}, '|') - 1) END`;
  const keyExpr = `lower(replace(trim(${cutOptions}), ' ', '_'))`;
  const sql =
    `WITH RECURSIVE\n` +
    `nums(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM nums WHERE n < ${SQL_CONTENT_SCAN_CAP}),\n` +
    `frontier(key) AS (\n` +
    `  SELECT ?\n` +
    `  UNION\n` +
    `  SELECT DISTINCT ${keyExpr}\n` +
    `  FROM frontier f\n` +
    `  JOIN cards c ON c."key" = f.key AND c.trash = 0\n` +
    `  JOIN nums n\n` +
    `    ON n.n + 3 <= length(c.db_content)\n` +
    `   AND substr(c.db_content, n.n, 2) = '{{'\n` +
    `   AND instr(substr(c.db_content, n.n + 2), '}}') > 1\n` +
    `)\n` +
    finalSelect;
  return { sql, params: [rootKey] };
}

const SELECT_WALKED =
  `SELECT c.* FROM cards c JOIN frontier f ON c."key" = f."key" AND c.trash = 0`;

/** Type cards (type names for data attributes + set keys) and side cards
 *  (lexicon composition of compound names + TYPE_PLUS_RIGHT left types) of
 *  everything the walk reached. */
const SELECT_TYPE_AND_SIDE =
  `SELECT c.* FROM cards c WHERE c.trash = 0 AND c.id IN (\n` +
  `  SELECT j.type_id FROM cards j JOIN frontier fj ON fj.key = j."key" AND j.trash = 0 WHERE j.type_id IS NOT NULL\n` +
  `  UNION SELECT s.type_id FROM cards j JOIN frontier fj ON fj.key = j."key" AND j.trash = 0\n` +
  `        JOIN cards s ON s.id IN (j.left_id, j.right_id) WHERE s.type_id IS NOT NULL\n` +
  `  UNION SELECT j.left_id FROM cards j JOIN frontier fj ON fj.key = j."key" AND j.trash = 0 WHERE j.left_id IS NOT NULL\n` +
  `  UNION SELECT j.right_id FROM cards j JOIN frontier fj ON fj.key = j."key" AND j.trash = 0 WHERE j.right_id IS NOT NULL\n` +
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

  // Compose + cache everything (idempotent with the fetch cache).
  const allRows = [...sideRows, ...walkedRows];
  if (!allRows.some((row) => row.id === root.id)) allRows.push(recordToRawRow(root));
  await composeAndCache(allRows, ctx, stats);

  // --- mechanism 3: JS verification + per-level fallback --------------------
  await verifyClosure([recordToRawRow(root), ...walkedRows], ctx, stats);
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
 * queries.
 */
async function composeAndCache(
  rows: RawRow[],
  ctx: PrefetchContext,
  stats: PrefetchStats,
): Promise<void> {
  const byId = new Map<number, RawRow>();
  for (const row of rows) byId.set(row.id, row);

  // Bottom-up name composition over the row map (sides before junctions),
  // so each Lexicon#write carries the composed name like Ruby's would.
  const names = new Map<number, DeckoName>();
  let pending = [...byId.values()];
  for (let pass = 0; pass < 64 && pending.length > 0; pass++) {
    const still: RawRow[] = [];
    for (const row of pending) {
      const composed = tryComposeName(row, names);
      if (composed !== undefined) names.set(row.id, composed);
      else still.push(row);
    }
    if (still.length === pending.length) break; // unresolvable sides stay
    pending = still;
  }

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
    const record = await composeCardRecord(rowToCardsRow(row), ctx.lexicon);
    await ctx.cacheRecord(record);
    stats.cards += 1;
  }
}

function tryComposeName(row: RawRow, names: Map<number, DeckoName>): DeckoName | undefined {
  if (row.name !== null) return DeckoName.parse(row.name);
  if (row.leftId === null || row.rightId === null) return undefined;
  const left = names.get(row.leftId);
  if (left === undefined) return undefined;
  const right = names.get(row.rightId);
  if (right === undefined) return undefined;
  return DeckoName.parse(`${left.s}+${right.s}`);
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
 * Junction handling: compound rows carry NULL key columns (2020 convention),
 * so a junction reference resolves through a SIDE-KEY join
 * (left.key + right.key -> junction row), one joint per round: a reference
 * like "a+b+c" first resolves its sides ("a+b" as a compound of "a"+"b",
 * then the junction row itself). Unknown names simply stop the rounds - the
 * render's nest fetch decides what an unknown nest means (wave 3).
 */
async function verifyClosure(
  scanRows: RawRow[],
  ctx: PrefetchContext,
  stats: PrefetchStats,
): Promise<void> {
  const known = new Set<string>();
  for (const row of scanRows) {
    if (row.key !== null) known.add(row.key);
  }
  let frontier = scanRows;
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
  collect(frontier);

  for (let round = 0; round < MAX_FALLBACK_ROUNDS && pending.size > 0; round++) {
    stats.fallbackRounds += 1;
    const simpleKeys: string[] = [];
    const junctionPairs: { left: string; right: string }[] = [];
    const matchedPairs = new Set<string>();
    for (const nameStr of pending) {
      const name = DeckoName.parse(nameStr);
      if (!name.isCompound) {
        simpleKeys.push(name.key);
      } else {
        const left = name.leftName;
        const right = name.rightName;
        if (left !== undefined && right !== undefined && !left.isCompound && !right.isCompound) {
          junctionPairs.push({ left: left.key, right: right.key });
        }
        // deeper compounds: their sides resolve first (next round sees them
        // as simple keys once fetched; then the junction join matches)
        if (left !== undefined) pending.add(left.s);
        if (right !== undefined) pending.add(right.s);
      }
    }

    const fetched: RawRow[] = [];
    if (simpleKeys.length > 0) {
      const placeholders = simpleKeys.map(() => "?").join(", ");
      const result = await ctx.driver.query<CardsRow>(
        `SELECT * FROM cards WHERE "key" IN (${placeholders}) AND trash = 0`,
        simpleKeys,
      );
      stats.statements += 1;
      for (const row of result.rows as CardsRow[]) fetched.push(toRawRow(row));
    }
    if (junctionPairs.length > 0) {
      const leftKeys = junctionPairs.map((pair) => pair.left);
      const rightKeys = junctionPairs.map((pair) => pair.right);
      const placeholdersL = leftKeys.map(() => "?").join(", ");
      const placeholdersR = rightKeys.map(() => "?").join(", ");
      const result = await ctx.driver.query<Record<string, unknown>>(
        `SELECT DISTINCT j.*, l."key" AS __left_key, r."key" AS __right_key FROM cards j\n` +
        `  JOIN cards l ON l.id = j.left_id AND l."key" IN (${placeholdersL})\n` +
        `  JOIN cards r ON r.id = j.right_id AND r."key" IN (${placeholdersR})\n` +
        ` WHERE j.trash = 0`,
        [...leftKeys, ...rightKeys],
      );
      stats.statements += 1;
      for (const row of result.rows as Record<string, unknown>[]) {
        fetched.push(toRawRow(row as unknown as CardsRow));
        const leftKey = row["__left_key"];
        const rightKey = row["__right_key"];
        if (typeof leftKey === "string" && typeof rightKey === "string") {
          matchedPairs.add(`${leftKey}|${rightKey}`);
        }
      }
    }

    // Which pending names did this round resolve?
    const fetchedKeys = new Set<string>();
    for (const row of fetched) {
      if (row.key !== null) fetchedKeys.add(row.key);
    }
    const resolved = new Set<string>();
    for (const nameStr of pending) {
      const name = DeckoName.parse(nameStr);
      if (!name.isCompound) {
        if (fetchedKeys.has(name.key) || known.has(name.key)) resolved.add(nameStr);
      } else if (name.leftName !== undefined && name.rightName !== undefined) {
        if (matchedPairs.has(`${name.leftName.key}|${name.rightName.key}`)) resolved.add(nameStr);
      }
    }

    if (fetched.length === 0) return; // unknown names: stop, render decides
    for (const row of fetched) {
      if (row.key !== null) known.add(row.key);
    }
    await composeAndCache(fetched, ctx, stats);
    collect(fetched); // their content references join the pending set
    for (const nameStr of resolved) pending.delete(nameStr);
    frontier = fetched;
  }
}
