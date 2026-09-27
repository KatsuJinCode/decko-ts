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
// 1. PER-KEY CLOSURE ROUNDS (the mechanism since the 2026-09-23 read-cost
//    fix): the closure is driven in per-level rounds from the JS side - each
//    round batches the three indexed query shapes (simple keys by
//    cards_key_index seek, depth-2 junctions by their sides' key pair, deeper
//    junctions by their sides' resolved id pair) and every fetched card's
//    content is re-parsed with the REAL parser to collect the next level's
//    targets, until no reference remains unresolved. The previous mechanism
//    ran the whole resolution in ONE recursive-CTE statement whose `resolved`
//    closure was seeded from EVERY card in the deck - it composed the deck's
//    full compound-key universe per cold render (measured: the 2,279-card
//    targeted deck read its 2,279-row universe twice per render; the 47k-row
//    corpus deck materialized 47,232 rows per execution, ~237-352 ms locally,
//    with O(deck x passes) rows read on D1 - scaling with DECK size, not page
//    size). The rounds touch only the requested keys' paths: O(page).
//    Spans cannot nest braces (Chunk::Nest full_re [^{}]*), so the JS span
//    scan reproduces the chunker's spans exactly (nest-syntax.ts is the
//    semantic authority).
// 2. The PRELUDE BATCH (2026-09-27 cold-query lane; before this, the folds
//    rode closure round 0): one driver.batch round trip before composition
//    carrying the root's side priming, the root's TYPE row (the enrichment
//    fold - enrichAndStore's type-name resolution stopped being two point
//    round trips), the root's set-pattern anchor names (the lex_to_id priming
//    that keeps the render's rule-lookup candidate walk at zero point
//    queries), and the render engine's permission/codename/structure folds
//    LAST. A cold render's fixed cost is the root fetch + this ONE round
//    trip; each closure level is one batched round trip of its own. On the
//    edge drivers a batch is literally one HTTP request; LocalSqliteDriver
//    wraps each batch in one transaction.
// 3. JS verification at every level: the REAL parser (nest-syntax.ts)
//    re-derives every reference, so correctness never depends on a key
//    transform. Junction sides resolve recursively: a depth-N chain takes
//    O(N) rounds, each joining junction rows by their UNIQUE
//    (left_id, right_id) pair; unknown names simply stop the rounds - the
//    render's nest fetch decides what an unknown nest means (wave 3).
//
// All fetching is read-only (SELECT); the write path is another stream.

import { DeckoName } from "../name.js";
import {
  CodenameNotFoundError,
  NameNotFoundError,
} from "../name/errors.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import { composeCardRecord, type CardRecord } from "../fetch/card-record.js";
import type { DbLexicon } from "../fetch/lexicon.js";
import { concretePatternsForCard } from "../set-patterns/card-patterns.js";
import { referencedNames } from "./nest-syntax.js";

/** Safety bound for the closure rounds (BFS over levels). Deliberately
 *  ABOVE the renderer's nest-depth guard (RUBY_MAX_DEPTH = 20,
 *  format.ts — Ruby Card.config.max_depth, railtie.rb:17): every chain the
 *  renderer can legally walk is resolvable by the prefetch, so the depth
 *  guard fires deterministically instead of the outcome depending on
 *  whether the fallback rounds gave up first (the battery's depth-44
 *  nondeterminism, {200,500} at maxDepth 42 — collapsed by the alignment). */
const MAX_CLOSURE_ROUNDS = 25;

export interface PrefetchStats {
  /** driver.batch round trips issued. */
  batches: number;
  /** individual SQL statements issued (batch statements count one each). */
  statements: number;
  /** closure rounds run (per-level batches after the prelude; zero minimum -
   *  a root with no references runs no closure round at all). */
  fallbackRounds: number;
  /** cards composed into the fetch cache. */
  cards: number;
  /** Results of `additionalStatements` (present only when they were
   *  supplied and the prelude batch actually ran). The permissions
   *  stream folds its read-rule resolution in here so the cold render stays
   *  ONE round trip for the engine-level state (decko-commons/decko#1282
   *  shape). */
  additionalResults?: SQLQueryResult[];
}

/** The row shape the prefetch needs before composition. codename MUST ride
 *  along: the composed record is written into the FETCH cache
 *  (PrefetchContext.cacheRecord -> FetchEngine#writeToCache), and a
 *  codename-less record there poisons later fetches - the fetched record is
 *  the corpus oracle's `codename` field (card-1.110.0 lib/card/codename.rb
 *  #codename reads the cards.codename column; card-record.ts#composeCardRecord
 *  passes it through). Dropping it here is what produced the corpus:274
 *  record real-fail (expected "codename":"all", got null for "*all" whose
 *  walked-closure record had been cached without the column). */
interface RawRow {
  id: number;
  name: string | null;
  key: string | null;
  codename: string | null;
  leftId: number | null;
  rightId: number | null;
  typeId: number | null;
  dbContent: string | null;
  trash: number;
  /** cards.read_rule_id / read_rule_class - the DATA side of the read rule
   *  (card-mod-permissions set/all/permissions.rb:1-5 set_read_rule). The
   *  read-permission stream reads them OFF THE COMPOSED RECORD at render
   *  time; dropping them here would push every walked card into the
   *  rule-lookup fallback and mis-deny/mis-allow against the stored state
   *  Ruby actually rendered with. */
  readRuleId: number | null;
  readRuleClass: string | null;
  /** cards.created_at / cards.updated_at - the date mod's set-module
   *  `def content` overrides render them (card-mod-date set/right/
   *  when_created.rb:7-11 localizes left.created_at; when_last_edited.rb
   *  on updated_at), so the earlier "dates are not rendered" premise no
   *  longer holds; dropping them surfaced "" through the warmed record
   *  and blanked the override bytes. */
  createdAt: string | null;
  updatedAt: string | null;
}

function toRawRow(row: CardsRow): RawRow {
  return {
    id: row.id,
    name: row.name ?? null,
    key: row.key ?? null,
    codename: row.codename ?? null,
    leftId: row.left_id ?? null,
    rightId: row.right_id ?? null,
    typeId: row.type_id ?? null,
    dbContent: row.db_content ?? null,
    trash: row.trash ?? 0,
    readRuleId: row.read_rule_id ?? null,
    readRuleClass: row.read_rule_class ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export interface PrefetchContext {
  driver: SQLDatabaseDriver;
  lexicon: DbLexicon;
  /** Writes the composed record into the fetch cache (both levels) and
   *  enriches it for the synchronous render path. Awaited: enrichment is
   *  async (cache-hit fetches) and the render must not start before every
   *  card is ready. */
  cacheRecord: (record: CardRecord) => Promise<void>;
  /** Independent statements carried in the PRELUDE batch (the one round trip
   *  before any composition; their results come back on
   *  stats.additionalResults). Must not depend on the closure's output —
   *  they execute alongside the prelude folds in one round trip. */
  additionalStatements?: SQLStatement[];
}

/**
 * Ensure the fetch cache holds every card the render of `root` can touch
 * through {{inclusion}} references (plus the type/side cards composition
 * needs). Returns the query-cost stats.
 *
 * The cold render's fixed cost is TWO round trips (2026-09-27 cold-query
 * lane): the root fetch (the caller's fetchByName) plus THIS prelude batch -
 * one driver.batch carrying, in order:
 *
 *   1. the root's side priming (moved out of closure round 0 - same
 *      statement, same "composed + enriched but not content-scanned"
 *      reached semantics),
 *   2. the root's type row (`SELECT * FROM cards WHERE id = ? AND trash =
 *      0`) - the enrichment fold. enrichAndStore resolves the type NAME
 *      through retrieveFromCacheById -> Lexicon.name -> idToLex and then
 *      fetchById; on a cold engine both were point round trips. Composing
 *      the row here (composeAndCache -> lexicon.write -> cacheRecord)
 *      turns both into cache hits,
 *   3. the set-pattern anchor priming: the PATTERN CARD names of the
 *      root's concrete patterns ("*self", "*type", "*all", ...) - exactly
 *      the names the render's rule walk (rules/lookup.ts findRule
 *      candidates "<set>+<setting>") resolves through Lexicon.id. One
 *      keyed statement; the rows prime lex_to_id entries (including the
 *      negative entries a miss caches), so candidate resolution issues no
 *      point queries,
 *   4. ctx.additionalStatements (the engine's permission / codename /
 *      structure folds) LAST - their results ride
 *      stats.additionalResults in order, the contract
 *      parseRuleTypeIds/parseStructureContents slice by fixed index.
 *
 * The closure rounds then cost one round trip per unfetched inclusion
 * level. Warm closures short-circuit before this runs (the renderer's
 * closureWarm gate) and stay at zero queries.
 */
export async function prefetchInclusionClosure(
  root: CardRecord,
  ctx: PrefetchContext,
): Promise<PrefetchStats> {
  const stats: PrefetchStats = { batches: 0, statements: 0, fallbackRounds: 0, cards: 0 };
  if (root.name === undefined || root.key === undefined) return stats;

  const rootRow = recordToRawRow(root);

  // --- prelude statements (see the doc comment above) ---
  const preludeStatements: SQLStatement[] = [];
  const seenIds = new Set<number>([rootRow.id]);
  const rootSideIds = nextSideIds([rootRow], seenIds);

  let sidePrimeSlot = -1;
  if (rootSideIds.length > 0) {
    const placeholders = rootSideIds.map(() => "?").join(", ");
    preludeStatements.push({
      sql: `SELECT * FROM cards WHERE id IN (${placeholders}) AND trash = 0`,
      params: rootSideIds,
    });
    sidePrimeSlot = preludeStatements.length - 1;
  }

  let typeRowSlot = -1;
  const rootTypeId = root.typeId;
  if (typeof rootTypeId === "number" && Number.isSafeInteger(rootTypeId) && rootTypeId > 0) {
    preludeStatements.push({
      sql: `SELECT * FROM cards WHERE id = ? AND trash = 0`,
      params: [rootTypeId],
    });
    typeRowSlot = preludeStatements.length - 1;
  }

  /** The root's pattern card names - the anchor parts of every rule
   *  candidate the render's findRule walk will resolve by name. */
  let anchorNames: string[] = [];
  let anchorSlot = -1;
  let anchorEntries: { key: string; id: number | undefined }[] = [];
  try {
    anchorNames = [
      ...new Set(concretePatternsForCard(root).map((pattern) => pattern.patternCardName)),
    ];
  } catch {
    // The pattern registry needs the name environment for some specs; a
    // registry failure must not break the prefetch - the rule walk then
    // resolves anchors through the ordinary (per-key) path.
    anchorNames = [];
  }
  if (anchorNames.length > 0) {
    const placeholders = anchorNames.map(() => "?").join(", ");
    preludeStatements.push({
      sql: `SELECT id, key FROM cards WHERE key COLLATE NOCASE IN (${placeholders}) AND trash = 0`,
      params: anchorNames.map((name) => DeckoName.parse(name).key),
    });
    anchorSlot = preludeStatements.length - 1;
  }

  const preludeSideRows: RawRow[] = [];
  const preludeTypeRows: RawRow[] = [];
  const additional = ctx.additionalStatements ?? [];
  let additionalResults: SQLQueryResult[] | undefined;
  if (preludeStatements.length > 0 || additional.length > 0) {
    const batch = await ctx.driver.batch([...preludeStatements, ...additional]);
    stats.batches += 1;
    stats.statements += preludeStatements.length + additional.length;
    if (additional.length > 0) {
      additionalResults = batch.slice(preludeStatements.length);
    }
    batch.slice(0, preludeStatements.length).forEach((result, i) => {
      const rows = (result.rows as CardsRow[]) ?? [];
      if (i === sidePrimeSlot) preludeSideRows.push(...rows.map(toRawRow));
      else if (i === typeRowSlot) preludeTypeRows.push(...rows.map(toRawRow));
      else if (i === anchorSlot) {
        // Prime lex_to_id for every anchor name: the found id, or the
        // negative entry the lexicon's own cacheFetch would cache.
        const byKey = new Map<string, number>();
        for (const row of rows) {
          if (typeof row.key === "string" && typeof row.id === "number") {
            byKey.set(row.key, row.id);
          }
        }
        anchorEntries = anchorNames.map((name) => ({
          key: name,
          id: byKey.get(DeckoName.parse(name).key),
        }));
      }
    });
    if (anchorEntries.length > 0) ctx.lexicon.primeIdsByKey(anchorEntries);
  }

  // Compose + cache the prelude rows BEFORE the root composition, so the
  // root's enrichment (type-name resolution) reads them from cache. Side
  // rows join the closure's seed set (the reached semantics: composed +
  // enriched, content unscanned); the type row is composed + cached but
  // deliberately NOT closure-seeded - the pre-existing path fetched it
  // through the enrichment ladder, outside the closure's known set.
  const preludeSideComposed =
    preludeSideRows.length > 0 ? await composeAndCache(preludeSideRows, ctx, stats) : [];
  if (preludeTypeRows.length > 0) await composeAndCache(preludeTypeRows, ctx, stats);

  const composed = await composeAndCache([rootRow], ctx, stats);
  stats.additionalResults = additionalResults;
  await driveClosure([rootRow], [...composed, ...preludeSideComposed], ctx, stats);
  return stats;
}

function recordToRawRow(record: CardRecord): RawRow {
  return {
    id: record.id ?? -1,
    name: record.name?.s ?? null,
    key: record.key ?? null,
    codename: record.codename ?? null,
    leftId: record.leftId ?? null,
    rightId: record.rightId ?? null,
    typeId: record.typeId ?? null,
    dbContent: record.dbContent ?? null,
    trash: record.trash ? 1 : 0,
    readRuleId: record.readRuleId ?? null,
    readRuleClass: record.readRuleClass ?? null,
    createdAt: record.createdAt ?? null,
    updatedAt: record.updatedAt ?? null,
  };
}

/**
 * Compose rows into CardRecords, sides before junctions (multi-pass over the
 * row map so every compound name resolves within the batch), prime the
 * lexicon (Lexicon#write - lib/card/lexicon.rb#write) and write every record
 * into the fetch cache. Composing through the warmed lexicon costs zero
 * queries. Returns the composed records so callers can index them by key
 * (the junction-closure rounds need composed-key -> id).
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
  // Sides cached by an EARLIER call (previous closure rounds) resolve
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
  // The fields composeCardRecord reads; the date columns ride along now
  // that the date mod's content overrides render them (RawRow note).
  // codename is read (lib/card/codename.rb#codename) and
  // read_rule_id/read_rule_class are read by the permission layer
  // (RawRow note) - both ride along.
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    codename: row.codename,
    left_id: row.leftId,
    right_id: row.rightId,
    current_revision_id: null,
    created_at: row.createdAt ?? "",
    updated_at: row.updatedAt ?? "",
    creator_id: 0,
    updater_id: 0,
    read_rule_class: row.readRuleClass,
    read_rule_id: row.readRuleId,
    references_expired: null,
    trash: row.trash === 1 ? 1 : 0,
    type_id: row.typeId ?? 0,
    db_content: row.dbContent,
  };
}

/**
 * The closure driver: BFS over inclusion levels. Every round collects the
 * not-yet-known reference targets from everything fetched so far (the REAL
 * parser - the semantic authority), fetches them in ONE batched round trip,
 * composes + caches the fetched rows, and repeats until no reference remains
 * or the safety bound hits.
 *
 * Junction handling (the 2020 NULL-key convention): a compound reference
 * resolves through its SIDES, exactly the walk DbLexicon.nameToLex does -
 * simple sides by key, compound sides recursively (each round resolves
 * deeper sides first, then the junction row joins its sides' ids by the
 * UNIQUE (left_id, right_id) pair). Depth-2 pairs keep the direct side-key
 * join (one round); a depth-N chain takes O(N) rounds.
 *
 * The engine's permission / codename / structure folds and the root's side
 * priming no longer ride round 0 - they run in the caller's PRELUDE batch
 * (prefetchInclusionClosure), so round 0 carries only fetch shapes. Their
 * results still reach the caller through stats.additionalResults.
 */
async function driveClosure(
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
  // Round 9: contextual collection from COMPOSED records. A row-scanned ref
  // like `{{+image}}` parses as the literal key "+image" (no row carries it),
  // so every template child / plus-child nest fell out of the closure and the
  // render's nest fetch missed the cache — the live-wire gap (children of
  // type+*structure pages rendered as unknown-card empty slots even when the
  // child rows existed). Ruby absolutizes each reference against the
  // REFERENCING card at process time (chunk/reference.rb; cited in
  // nest-syntax.ts's header), so the composed record's name is the context
  // the closure must mirror. Records whose names did not compose (unresolvable
  // junction sides) contribute nothing here; their absolute refs still join
  // through the row-based collect when their rows are scanned. Underscore
  // refs stay skipped: _left/_main resolve against the render-time format
  // context, not the name algebra alone.
  const collectFromRecords = (records: CardRecord[]): void => {
    for (const record of records) {
      const content = record.dbContent;
      if (content === undefined || content === "" || content === null) continue;
      if (record.name === undefined || record.name.s === "") continue;
      for (const ref of referencedNames(content)) {
        if (ref.relative) continue;
        let name: DeckoName;
        try {
          name = DeckoName.parse(ref.name).absoluteName(record.name);
        } catch (err) {
          if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
            continue; // unresolved mark: the render's nest path reports it
          }
          throw err;
        }
        if (name.s === "" || known.has(name.key)) continue;
        pending.add(name.s);
      }
    }
  };
  collectFromRecords(composed);

  // Transitive side priming (the old SQL walk's `reached` closure): the
  // synchronous render path reads SIDE cards from the enriched render-card
  // map (isRuleCard / ruleCandidateNames / computeIsRuleSync), so every
  // junction row's side rows must be composed into renderCards too - not
  // just into the fetch cache. The ids ride each round's batch (the ROOT's
  // sides primed in the caller's prelude batch; round N primes the sides of
  // the rows the previous round fetched). Primed side rows are composed +
  // enriched but their content is NOT scanned for references (exactly the
  // old reached semantics: only walked rows fed the frontier).
  const seenIds = new Set<number>();
  for (const row of scanRows) seenIds.add(row.id);
  let sideIdsToPrime: number[] = [];

  for (let round = 0; round < MAX_CLOSURE_ROUNDS; round++) {
    if (pending.size === 0 && sideIdsToPrime.length === 0) {
      return;
    }
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

    // The round's statements (only the non-empty shapes ride the batch).
    const statements: SQLStatement[] = [];
    const collectors: ((rows: CardsRow[]) => RawRow[])[] = [];
    if (simpleKeys.length > 0) {
      const placeholders = simpleKeys.map(() => "?").join(", ");
      // COLLATE NOCASE matches the collation of cards_key_index (the
      // column itself is BINARY); lossless for decko's lowercase keys -
      // the seek is the O(page) lookup the rounds exist for.
      statements.push({
        sql: `SELECT * FROM cards WHERE "key" COLLATE NOCASE IN (${placeholders}) AND trash = 0`,
        params: simpleKeys,
      });
      collectors.push((rows) => rows.map(toRawRow));
    }
    if (sideKeyPairs.length > 0) {
      const leftKeys = sideKeyPairs.map((pair) => pair.left);
      const rightKeys = sideKeyPairs.map((pair) => pair.right);
      const placeholdersL = leftKeys.map(() => "?").join(", ");
      const placeholdersR = rightKeys.map(() => "?").join(", ");
      statements.push({
        sql:
          `SELECT DISTINCT j.* FROM cards j\n` +
          `  JOIN cards l ON l.id = j.left_id AND l."key" COLLATE NOCASE IN (${placeholdersL})\n` +
          `  JOIN cards r ON r.id = j.right_id AND r."key" COLLATE NOCASE IN (${placeholdersR})\n` +
          ` WHERE j.trash = 0`,
        params: [...leftKeys, ...rightKeys],
      });
      collectors.push((rows) => rows.map(toRawRow));
    }
    if (sideIdPairs.length > 0) {
      const tuple = sideIdPairs.map(() => `(j.left_id = ? AND j.right_id = ?)`).join(" OR ");
      const params = sideIdPairs.flatMap((pair) => [pair.leftId, pair.rightId]);
      statements.push({
        sql: `SELECT j.* FROM cards j WHERE j.trash = 0 AND (${tuple})`,
        params,
      });
      collectors.push((rows) => rows.map(toRawRow));
    }
    // Side priming rides LAST in the batch; its rows are composed +
    // enriched but not content-scanned (closureRows vs sideRows below).
    let sidePrimeSlot = -1;
    if (sideIdsToPrime.length > 0) {
      const placeholders = sideIdsToPrime.map(() => "?").join(", ");
      statements.push({
        sql: `SELECT * FROM cards WHERE id IN (${placeholders}) AND trash = 0`,
        params: sideIdsToPrime,
      });
      sidePrimeSlot = statements.length - 1;
      collectors.push((rows) => rows.map(toRawRow));
    }

    let closureRows: RawRow[] = [];
    let sideRows: RawRow[] = [];
    const splitResults = (results: SQLQueryResult[]): void => {
      results.forEach((result, i) => {
        const rows = collectors[i]!(result.rows as CardsRow[]);
        if (i === sidePrimeSlot) sideRows.push(...rows);
        else closureRows.push(...rows);
      });
    };
    if (statements.length === 0) {
      // Every pending name was already resolved while building the round's
      // statements: nothing left to fetch, no round trip to spend.
      return;
    }
    // One batched round trip for the level (single transaction locally;
    // one HTTP request per round on the edge drivers).
    const batch = await ctx.driver.batch(statements);
    stats.batches += 1;
    stats.statements += statements.length;
    splitResults(batch);
    stats.fallbackRounds += 1;

    if (closureRows.length === 0 && sideRows.length === 0) {
      // Unknown names: stop, render decides.
      return;
    }
    const newComposed = await composeAndCache([...sideRows, ...closureRows], ctx, stats);
    seedKeys(newComposed); // junction rows resolve through their composed keys
    collect(closureRows); // their content references join the pending set
    // Round 9: the composed CLOSURE records join contextually too (side rows
    // stay unscanned — the reached-semantics note above; only walked rows fed
    // the frontier). Filter by id: newComposed mixes closure + side records.
    {
      const closureIds = new Set(closureRows.map((row) => row.id));
      collectFromRecords(
        newComposed.filter((record) => record.id !== undefined && closureIds.has(record.id)),
      );
    }
    for (const nameStr of [...pending]) {
      // Mark-resolution error tolerance (mirror round-3 cardReferenceKeys
      // catch, render.ts:1773): a name that fails the synchronously-resolved
      // mark parse is dropped from the closure rather than raised. This is a
      // safety net only — for a clean run nothing in `pending` is mark-
      // shaped, so the catch is never entered.
      let resolvedKey: string;
      try {
        resolvedKey = DeckoName.parse(nameStr).key;
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
          pending.delete(nameStr);
          continue;
        }
        throw err;
      }
      if (known.has(resolvedKey)) pending.delete(nameStr);
    }
    // The sides of everything this round composed prime next round (rows
    // already fetched are in seenIds, so only genuinely-unseen sides prime).
    for (const row of [...sideRows, ...closureRows]) seenIds.add(row.id);
    sideIdsToPrime = nextSideIds([...sideRows, ...closureRows], seenIds);
  }
}

/** The not-yet-seen side ids of `rows` (the transitive side-priming
 *  frontier). Mutates `seenIds` with every id it returns. */
function nextSideIds(rows: RawRow[], seenIds: Set<number>): number[] {
  const ids: number[] = [];
  for (const row of rows) {
    for (const sideId of [row.leftId, row.rightId]) {
      if (sideId === null || sideId === undefined || seenIds.has(sideId)) continue;
      seenIds.add(sideId);
      ids.push(sideId);
    }
  }
  return ids;
}
