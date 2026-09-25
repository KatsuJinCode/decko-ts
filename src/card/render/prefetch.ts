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
// 2. One driver.batch round trip for the FIRST round: the render engine's
//    permission/codename/structure statements fold into it, so a cold render
//    still pays ONE round trip for the engine-level state (the #1282 fold);
//    each further closure level is one batched round trip of its own. On the
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
  /** closure rounds run (per-level batches; one minimum on a cold closure,
   *  since the engine-level folds ride round 0's batch). */
  fallbackRounds: number;
  /** cards composed into the fetch cache. */
  cards: number;
  /** Results of `additionalStatements` (present only when they were
   *  supplied and the first round's batch actually ran). The permissions
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
  /** Independent statements carried in the SAME batch as the first closure
   *  round (their results come back on stats.additionalResults). Must not
   *  depend on the closure's output — they execute alongside it in one
   *  round trip. */
  additionalStatements?: SQLStatement[];
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

  const rootRow = recordToRawRow(root);
  const composed = await composeAndCache([rootRow], ctx, stats);
  await driveClosure([rootRow], composed, ctx, stats);
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
 * `ctx.additionalStatements` (the render engine's permission / codename /
 * structure folds) rides the FIRST round's batch: a cold render keeps the
 * one-round-trip engine-state fold, and their results come back on
 * stats.additionalResults in order.
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
        // Sync mark resolution tolerates CodenameNotFoundError / NameNotFoundError
        // for unresolved codename/id marks: the lexicon temp cache evicts itself
        // at 10000 keys (lib/card/cache/temporary.rb#within_key_counts); after
        // eviction the sync peek returns undefined and DeckoName.parse throws.
        // Mirror the round-3 cardReferenceKeys catch (render.ts:1773): treat the
        // ref as a leaf that the closure cannot resolve, leave it out of
        // `pending` — the cold render path will refill the cache and the next
        // pass will see whatever did resolve. Adds nothing to a clean prefix
        // name (CodenameNotFound is reached only via the `^:(\w+)$` and
        // `^~(\d+)$` mark shapes, never a plain-name parse).
        let name: DeckoName;
        try {
          name = DeckoName.parse(ref.name);
        } catch (err) {
          if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) continue;
          throw err;
        }
        if (name.s === "" || known.has(name.key)) continue;
        pending.add(name.s);
      }
    }
  };
  collect(scanRows);

  const additional = ctx.additionalStatements ?? [];
  // Transitive side priming (the old SQL walk's `reached` closure): the
  // synchronous render path reads SIDE cards from the enriched render-card
  // map (isRuleCard / ruleCandidateNames / computeIsRuleSync), so every
  // junction row's side rows must be composed into renderCards too - not
  // just into the fetch cache. The ids ride each round's batch (round 0
  // primes the root's sides; round N primes the sides of the rows the
  // previous round fetched). Primed side rows are composed + enriched but
  // their content is NOT scanned for references (exactly the old reached
  // semantics: only walked rows fed the frontier).
  const seenIds = new Set<number>();
  for (const row of scanRows) seenIds.add(row.id);
  const nextSideIds = (rows: RawRow[]): number[] => {
    const ids: number[] = [];
    for (const row of rows) {
      for (const sideId of [row.leftId, row.rightId]) {
        if (sideId === null || sideId === undefined || seenIds.has(sideId)) continue;
        seenIds.add(sideId);
        ids.push(sideId);
      }
    }
    return ids;
  };
  let sideIdsToPrime = nextSideIds(scanRows);

  for (let round = 0; round < MAX_CLOSURE_ROUNDS; round++) {
    const firstRound = round === 0;
    if (
      pending.size === 0 &&
      sideIdsToPrime.length === 0 &&
      !(firstRound && additional.length > 0)
    ) {
      return;
    }
    const simpleKeys: string[] = [];
    const sideKeyPairs: { left: string; right: string }[] = [];
    const sideIdPairs: { leftId: number; rightId: number }[] = [];
    for (const nameStr of pending) {
      // Same CodenameNotFoundError / NameNotFoundError tolerance as the
      // collect() loop and render.ts#cardReferenceKeys: a freshly-evicted
      // lexicon temp cache can make a name that resolved minutes ago throw a
      // mark resolution error now. Skip — the ref stays in `pending` only
      // while its key fits the closure shape; if even the canonical parse
      // throws on an unusual mark form, drop it from this round's pass.
      let name: DeckoName;
      try {
        name = DeckoName.parse(nameStr);
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) continue;
        throw err;
      }
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
    let additionalResults: SQLQueryResult[] | undefined;
    const splitResults = (results: SQLQueryResult[]): void => {
      results.forEach((result, i) => {
        const rows = collectors[i]!(result.rows as CardsRow[]);
        if (i === sidePrimeSlot) sideRows.push(...rows);
        else closureRows.push(...rows);
      });
    };
    if (firstRound && additional.length > 0) {
      // ONE batched round trip: the round's fetches + the engine's folds.
      const batch = await ctx.driver.batch([...statements, ...additional]);
      stats.batches += 1;
      stats.statements += statements.length + additional.length;
      additionalResults = batch.slice(statements.length);
      splitResults(batch.slice(0, statements.length));
    } else {
      // One batched round trip for the level (single transaction locally;
      // one HTTP request per round on the edge drivers).
      const batch = await ctx.driver.batch(statements);
      stats.batches += 1;
      stats.statements += statements.length;
      splitResults(batch);
    }
    stats.fallbackRounds += 1;

    if (closureRows.length === 0 && sideRows.length === 0) {
      // Unknown names: stop, render decides. (First round with folds only:
      // the additionalResults were still delivered above.)
      stats.additionalResults = additionalResults;
      return;
    }
    const newComposed = await composeAndCache([...sideRows, ...closureRows], ctx, stats);
    seedKeys(newComposed); // junction rows resolve through their composed keys
    collect(closureRows); // their content references join the pending set
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
    sideIdsToPrime = nextSideIds([...sideRows, ...closureRows]);
    if (firstRound && additionalResults !== undefined) {
      stats.additionalResults = additionalResults;
    }
  }
}
