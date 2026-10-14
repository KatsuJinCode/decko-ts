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
// 1. PER-KEY CLOSURE ROUNDS: the closure is driven in per-level rounds from
//    the JS side - each
//    round batches the three indexed query shapes (simple keys by
//    cards_key_index seek, depth-2 junctions by their sides' key pair, deeper
//    junctions by their sides' resolved id pair) and every fetched card's
//    content is re-parsed with the REAL parser to collect the next level's
//    targets, until no reference remains unresolved. The previous mechanism
//    ran the whole resolution in ONE recursive-CTE statement whose `resolved`
//    closure was seeded from EVERY card in the deck - it composed the deck's
//    full compound-key universe per cold render (measured: a 47k-row deck
//    materialized 47,232 rows per execution, ~237-352 ms locally,
//    with O(deck x passes) rows read on D1 - scaling with DECK size, not page
//    size; a small deck still re-read its full row universe twice per
//    render). The rounds touch only the requested keys' paths: O(page).
//    Spans cannot nest braces (Chunk::Nest full_re [^{}]*), so the JS span
//    scan reproduces the chunker's spans exactly (nest-syntax.ts is the
//    semantic authority).
// 2. The PRELUDE BATCH (before it, the folds
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
//    render's nest fetch decides what an unknown nest means.
//
// All fetching is read-only (SELECT); the write path is separate.

import { DeckoName } from "../name.js";
import {
  CodenameNotFoundError,
  NameNotFoundError,
} from "../name/errors.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../server/driver.js";
import type { CardsRow } from "../../server/schema.js";
import { composeCardRecord, newCardRecord, type CardRecord } from "../fetch/card-record.js";
import type { DbLexicon } from "../fetch/lexicon.js";
import { concretePatternsForCard } from "../set-patterns/card-patterns.js";
import type { VirtualCardResolution } from "../fetch/virtual-cards.js";
import { referencedNames } from "./nest-syntax.js";

/** Safety bound for the closure rounds (BFS over levels). Deliberately
 *  ABOVE the renderer's nest-depth guard (RUBY_MAX_DEPTH = 20,
 *  format.ts — Ruby Card.config.max_depth, railtie.rb:17): every chain the
 *  renderer can legally walk is resolvable by the prefetch, so the depth
 *  guard fires deterministically instead of the outcome depending on
 *  whether the fallback rounds gave up first. */
const MAX_CLOSURE_ROUNDS = 25;

/** Safety bound for the layout warm-up's batched reference rounds (see
 *  prefetchWarmupClosure). Round trips scale with ROUNDS, not cards, so the
 *  cap bounds the blocking chase while the batch carries the volume; rounds
 *  beyond it degrade to the per-name ladder fallback instead of truncating
 *  the prepared set (byte parity over speed on a deck that deep). */
const MAX_WARMUP_ROUNDS = 60;

/** Bound parameters per statement. Cloudflare D1 caps a statement at 100
 *  bound parameters; 90 leaves headroom. LocalSqliteDriver has no limit, so
 *  chunking is purely a portability guard (extra chunk statements ride the
 *  SAME driver.batch — still one round trip). */
const WARMUP_CHUNK = 90;

function chunkParams<T>(items: T[], perStatement: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += perStatement) out.push(items.slice(i, i + perStatement));
  return out;
}

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
  /** the batched fetch composer (V1-prefetch): type ids this prefetch's
   *  compose prime already asked (one statement per prefetch, not per
   *  composeAndCache call). */
  typePrimeMemo: Set<number>;
}

/** The row shape the prefetch needs before composition. codename MUST ride
 *  along: the composed record is written into the FETCH cache
 *  (PrefetchContext.cacheRecord -> FetchEngine#writeToCache), and a
 *  codename-less record there poisons later fetches - Ruby's codename comes
 *  off the cards.codename column (card-1.110.0 lib/card/codename.rb
 *  #codename; card-record.ts#composeCardRecord
 *  passes it through). Dropping it here cached walked-closure records
 *  without the column, and later fetches answered a null codename
 *  (e.g. for "*all") instead of the stored one. */
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
  /** cards.creator_id - the Sign up core's invited?/self_signup? input
   *  (card-mod-account set/type/signup/views.rb:39-45 compares against
   *  AnonymousID); it rides through like the date columns above
   *  (a hardcoded 0 zeroed every prewarmed record's creator). */
  creatorId: number | null;
  /** cards.current_revision_id - the conflict tracker's value
   *  (card-mod-edit set/all/form.rb:27-31 `hidden_field
   *  :last_action_id_before_edit` reads card.last_action_id, which is this
   *  column). It is a FORM-VALUE input like creator_id, and it rides
   *  through for the same reason: a card prewarmed through the closure
   *  rounds composed a record with this column null, so the tracker
   *  rendered with no value attribute at all (Rails skips a nil value,
   *  tag_helper.rb:298) where the deck's row carries one. That is how the
   *  nested HTML card of Home's :edit_nests arm came to differ from the
   *  capture by exactly that attribute. The chunked-search composer
   *  (composeAndCacheSqlRows, same file) already passes the real row
   *  through; this closes the same gap on the closure path, so a record
   *  the two composers build for one id are value-identical. */
  currentRevisionId: number | null;
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
    creatorId: row.creator_id ?? null,
    currentRevisionId: row.current_revision_id ?? null,
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
  /** the batched fetch composer: cache-only record
   *  write (the base flow's updateCache -> storeCard — never the render
   *  map). The type-card prime below needs it so enrichAndStore's typeId
   *  reads hit the fetch cache exactly as the base flow's own fetchById
   *  would have left them. Optional: without it the prime still fills the
   *  lexicon entries. */
  writeToCache?: (record: CardRecord) => void;
  /** Independent statements carried in the PRELUDE batch (the one round trip
   *  before any composition; their results come back on
   *  stats.additionalResults). Must not depend on the closure's output —
   *  they execute alongside the prelude folds in one round trip. */
  additionalStatements?: SQLStatement[];
  /** Request-local live render only: compose the root and the prelude rows
   *  but do not walk the root's inclusion closure (its nests are prepared
   *  only when the synchronous render asks for them). */
  skipClosureWalk?: boolean;
}

/**
 * Ensure the fetch cache holds every card the render of `root` can touch
 * through {{inclusion}} references (plus the type/side cards composition
 * needs). Returns the query-cost stats.
 *
 * The cold render's fixed cost is TWO round trips:
 * the root fetch (the caller's fetchByName) plus THIS prelude batch -
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
  const stats: PrefetchStats = {
    batches: 0,
    statements: 0,
    fallbackRounds: 0,
    cards: 0,
    typePrimeMemo: new Set<number>(),
  };
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

  // The Abstract::TestContext ladder (card-mod-email
  // set/abstract/test_context.rb:16-18 `card.left.fetch(:test_context)
  // &.first_card`) — the sync render's context lookup is warm-map-only
  // (fetchRenderCard = renderCards.get), and the +*test context junction
  // plus its first item sit OUTSIDE every content-reference closure (the
  // notification templates' nests are self-references; nothing in the
  // message content names the junction). A message-card root — the RIGHT
  // pattern's tag keys the include_set seam covers (right/html_message,
  // right/text_message; the subject right never renders a page) — therefore
  // primes its junction ROW here; composing it both warms the record the
  // render's fetch answers and (via the closure's own content-ref walk)
  // reaches the first item card on the next round.
  let testContextSlot = -1;
  // DeckoName keys KEEP the star ("*html_message", not "html_message") —
  // the same row-shape truth the closureWarm gate below carries.
  const rootTagKey = root.name?.isCompound === true ? DeckoName.parse(root.name.tag).key : undefined;
  if (
    root.leftId !== undefined &&
    root.leftId > 0 &&
    (rootTagKey === "*html_message" || rootTagKey === "*text_message")
  ) {
    preludeStatements.push({
      sql: `SELECT j.* FROM cards j JOIN cards s ON s.id = j.right_id WHERE j.left_id = ? AND s.codename = 'test_context' AND j.trash = 0`,
      params: [root.leftId],
    });
    testContextSlot = preludeStatements.length - 1;
  }
  // The EmailTemplate read_form arm of the same ladder.
  // The template's :core (= render_read_form) nests `+*test context`
  // PROGRAMMATICALLY (views.ts emailTemplateCoreBody — html.rb:2-4 appends
  // :test_context to edit_fields), and the template's own content never
  // references it (a template's content nests only the EMAIL_FIELDS), so the
  // closure's content-ref walk has no path to the junction either — the
  // parent pages rendered the junction slot as an unknown card (no id, no
  // SELF pattern class) and every field content render answered without the
  // context. Same statement shape as the message arm, keyed on the
  // template root's OWN id, gated to email-template roots via the type
  // codename EXISTS (same gate shape as the field-anchor statement below)
  // so every other page's prelude carries exactly the statement set it had
  // before.
  let templateTestContextSlot = -1;
  if (root.id !== undefined && root.id > 0) {
    preludeStatements.push({
      sql: `SELECT j.* FROM cards j JOIN cards s ON s.id = j.right_id WHERE j.left_id = ? AND s.codename = 'test_context' AND j.trash = 0 AND EXISTS (SELECT 1 FROM cards t WHERE t.id = ? AND t.codename = 'email_template')`,
      params: [root.id, root.typeId ?? -1],
    });
    templateTestContextSlot = preludeStatements.length - 1;
  }

  // The EmailTemplate read_form's field-setting anchors.
  // The type-assignment walk (render.ts newCardDefaultType -> findAssigned-
  // TypeName) keys each virtual field card's module key on the TAG's
  // CODENAME (pattern/base.rb:21-29 — the anchor parts' codenames), whose
  // sync lookup is lexicon.id(key) — warm-cache-only. Nothing in a
  // template page's content references the *to/*from/... setting cards,
  // so their keys never prime and every virtual field fell back to the
  // template type (RichText) instead of the assigned List/Phrase/PlainText
  // types.
  // One statement, gated to email-template roots via an EXISTS on the
  // root's own type row's codename, so every other page's prelude carries
  // exactly the statement set it had before.
  let emailFieldAnchorSlot = -1;
  if (root.typeId !== undefined && root.typeId > 0) {
    preludeStatements.push({
      sql: `SELECT c.id, c.key FROM cards c WHERE c.key COLLATE NOCASE IN ('*to','*from','*cc','*bcc','*attach','*subject','*text message','*html message','*test context') AND c.trash = 0 AND EXISTS (SELECT 1 FROM cards t WHERE t.id = ? AND t.codename = 'email_template')`,
      params: [root.typeId],
    });
    emailFieldAnchorSlot = preludeStatements.length - 1;
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
  /** The root message card's +*test context junction row
   *  (see the statement's comment): composed into the cache so the
   *  render's warm fetch answers, and SCANNED so the closure's content-ref
   *  walk reaches the first item card. */
  const preludeTestContextRows: RawRow[] = [];
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
      else if (i === testContextSlot) preludeTestContextRows.push(...rows.map(toRawRow));
      else if (i === templateTestContextSlot) preludeTestContextRows.push(...rows.map(toRawRow));
      else if (i === emailFieldAnchorSlot) {
        // Prime the read_form field-setting keys (same lex_to_id write the
        // anchor arm makes): the type-assignment walk's sync codename
        // lookup reads these.
        const entries = rows
          .filter((row) => typeof row.key === "string" && typeof row.id === "number")
          .map((row) => ({ key: row.key as string, id: row.id as number }));
        if (entries.length > 0) ctx.lexicon.primeIdsByKey(entries);
      } else if (i === anchorSlot) {
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

  // The junction's FIRST ITEM card (test_context.rb:17 `&.first_card`):
  // referencedNames scans nest chunks only, and the +*test context value is
  // a plain LIST line ("User" / "*changed card"), so the closure's own
  // content-ref walk never reaches it — one follow-up statement keyed on
  // the junction rows' first non-empty line, run only when a junction row
  // actually came back. A missing item row stays missing: the render's
  // fetch then answers undefined and Ruby's `with_context nil` shape (no
  // switch) is what fires.
  const testContextItemKeys = new Set<string>();
  for (const row of preludeTestContextRows) {
    const firstItem = (row.dbContent ?? "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line !== "");
    if (firstItem === undefined || firstItem === "") continue;
    try {
      testContextItemKeys.add(DeckoName.parse(firstItem).key);
    } catch (err) {
      if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
        continue; // unresolvable item line: the render's fetch misses too
      }
      throw err;
    }
  }
  const preludeItemRows: RawRow[] = [];
  if (testContextItemKeys.size > 0) {
    const placeholders = [...testContextItemKeys].map(() => "?").join(", ");
    const itemBatch = await ctx.driver.batch([
      {
        sql: `SELECT * FROM cards WHERE key COLLATE NOCASE IN (${placeholders}) AND trash = 0`,
        params: [...testContextItemKeys],
      },
    ]);
    stats.batches += 1;
    stats.statements += 1;
    preludeItemRows.push(...(((itemBatch[0]?.rows as CardsRow[]) ?? []).map(toRawRow)));
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
  const preludeTestContextComposed =
    preludeTestContextRows.length > 0
      ? await composeAndCache(preludeTestContextRows, ctx, stats)
      : [];
  const preludeItemComposed =
    preludeItemRows.length > 0 ? await composeAndCache(preludeItemRows, ctx, stats) : [];

  const composed = await composeAndCache([rootRow], ctx, stats);
  stats.additionalResults = additionalResults;
  if (ctx.skipClosureWalk === true) return stats;
  await driveClosure(
    [rootRow, ...preludeTestContextRows],
    [...composed, ...preludeSideComposed, ...preludeTestContextComposed, ...preludeItemComposed],
    ctx,
    stats,
  );
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
    creatorId: record.creatorId ?? null,
    currentRevisionId: record.currentRevisionId ?? null,
  };
}

/**
 * the batched fetch composer: prime the compose
 * pipeline's TYPE-card reads from one chunked statement. The composer's
 * rows name their type cards by id; the per-record enrichAndStore
 * (ctx.cacheRecord) resolves each NEW typeId through retrieveFromCacheById
 * -> Lexicon.name -> idToLex and then a row read by id — up to two point
 * queries per distinct type, all for rows one statement answers.
 *
 * TRASH SEMANTICS: this is the FETCH path's read, so the statement filters
 * `trash = 0` exactly like the base flow's fetchById — and an ABSENT id is
 * deliberately left UNPRIMED (no noteIdToLexMiss here): the base flow's
 * first idToLex read has no trash filter and would find a trashed row's
 * lex where a primed miss would answer unknown — different answers.
 * Priming only what the statement actually returned keeps every answer
 * byte-identical (the prime discipline).
 */
async function primeComposeTypeInputs(
  ctx: PrefetchContext,
  typeIds: Iterable<number | null | undefined>,
  memo: Set<number>,
  heldIds?: ReadonlySet<number>,
): Promise<void> {
  const need = new Set<number>();
  for (const t of typeIds) {
    if (typeof t !== "number" || t <= 0) continue;
    if (memo.has(t)) continue;
    memo.add(t);
    // A row the caller's own set holds is composed from that row — asking
    // it here would spend a round trip re-reading a row in hand (the
    // one-trip payload seat measures zero live queries; this filter is
    // what keeps that contract).
    if (heldIds?.has(t) === true) continue;
    need.add(t);
  }
  if (need.size === 0) return;
  // The members ride ONE batch as PER-ID statements in the exact
  // fetch-ladder shape (`SELECT * FROM cards WHERE id = ? AND trash = 0
  // LIMIT 1` — the point-row-by-id plan family), so the prime's reads are
  // statement-for-statement the reads the base flow's own fetchById
  // ladder would have issued for the same ids.
  const CHUNK = 500;
  const ids = [...need];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const results = await ctx.driver.batch(
      chunk.map((id) => ({
        sql: "SELECT * FROM cards WHERE id = ? AND trash = 0 LIMIT 1",
        params: [id],
      })),
    );
    const rows: CardsRow[] = [];
    results.forEach((result) => {
      const row = (result.rows as CardsRow[])[0];
      if (row !== undefined) rows.push(row);
    });
    for (const row of rows) ctx.lexicon.noteIdToLexRow(row);
    if (ctx.writeToCache !== undefined) {
      for (const row of rows) {
        const record = await composeCardRecord(row, ctx.lexicon);
        if (record.name === undefined || record.id === undefined) continue;
        ctx.writeToCache(record);
      }
    }
  }
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
  await primeComposeTypeInputs(
    ctx,
    rows.map((row) => row.typeId),
    stats.typePrimeMemo,
    new Set(byId.keys()),
  );

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
    ctx.lexicon.noteDurableName(row.id, typeof name === "string" ? name : name.s);
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
    // The row is now composed and cached, so a later type prime in this
    // prefetch must not read it again (a card that is both a prelude row and
    // the type of a later row cost one extra round trip).
    stats.typePrimeMemo.add(row.id);
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
  // codename is read (lib/card/codename.rb#codename), current_revision_id
  // is the conflict tracker's value (form.rb:27-31), and
  // read_rule_id/read_rule_class are read by the permission layer
  // (RawRow note) - both ride along.
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    codename: row.codename,
    left_id: row.leftId,
    right_id: row.rightId,
    current_revision_id: row.currentRevisionId,
    created_at: row.createdAt ?? "",
    updated_at: row.updatedAt ?? "",
    creator_id: row.creatorId ?? 0,
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
 * The chunked-search-prefetch composer: compose + cache REAL cards rows
 * (the `SELECT *` shape readCardRowsByIdChunked returns) for the whole-set
 * search read path (render.ts#runSearch's transport-chunked adoption).
 *
 * Field fidelity is the point: unlike the closure rounds above (whose
 * RawRow round trip synthesizes a documented subset), this composer passes
 * the real row straight into
 * composeCardRecord — updater_id, current_revision_id, references_expired
 * and every other column ride through — so a record the chunked prefetch
 * writes into the fetch cache is VALUE-IDENTICAL to the record the per-row
 * point-read ladder would have composed for the same id. That is the
 * result-identity invariant the search adoption depends on: same rows,
 * same order, same bytes.
 *
 * Composition order mirrors composeAndCache: sides before junctions over a
 * multi-pass walk of the row map, so every junction name resolves within
 * the batch (sides an earlier call already composed resolve through the
 * warmed lexicon, zero queries); each composed row then primes the lexicon
 * (Lexicon#write — both directions) exactly as the closure path does, and
 * the composed record goes through ctx.cacheRecord (fetch cache + enrich).
 */
export async function composeAndCacheSqlRows(
  rows: CardsRow[],
  ctx: PrefetchContext,
): Promise<CardRecord[]> {
  const byId = new Map<number, CardsRow>();
  for (const row of rows) byId.set(row.id, row);
  // the batched fetch composer (V1-prefetch): same type prime as
  // composeAndCache (a per-call memo — these single-shot callers have no
  // shared stats object; the lexicon entries make repeat calls free). The
  // caller's own row set is heldIds: the one-trip payload carries the type
  // rows, and re-asking them here would break its zero-live-query seat.
  await primeComposeTypeInputs(
    ctx,
    rows.map((row) => row.type_id),
    new Set<number>(),
    new Set(byId.keys()),
  );

  const names = new Map<number, DeckoName>();
  let pending = [...byId.values()];
  for (let pass = 0; pass < 64 && pending.length > 0; pass++) {
    const still: CardsRow[] = [];
    for (const row of pending) {
      const composed = await tryComposeSqlRowName(row, names, byId, ctx);
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
    if (row.name !== null && row.name !== undefined) {
      ctx.lexicon.write(row.id, name, row.name); // simple lex: the name string
    } else if (row.left_id !== null && row.left_id !== undefined && row.right_id !== null && row.right_id !== undefined) {
      ctx.lexicon.write(row.id, name, [row.left_id, row.right_id]); // compound lex
    }
  }

  for (const row of byId.values()) {
    const name = names.get(row.id);
    if (name === undefined) continue;
    // Durable coverage: the removed per-row fetchById ladder recorded
    // every warmed row's id->name in the lexicon's durable map (via
    // lexicon.name(id)); the own-rows composer notes it explicitly instead
    // (db truth from the held row - see DbLexicon.noteDurableName).
    ctx.lexicon.noteDurableName(row.id, typeof name === "string" ? name : name.s);
    const record = await composeCardRecord(row, ctx.lexicon); // the REAL row
    await ctx.cacheRecord(record);
    composedRecords.push(record);
  }
  return composedRecords;
}

/** tryComposeName over a real cards row: simple rows parse their name
 *  column; junction rows compose from their sides. A side present in THIS
 *  call's row set (byId) resolves ONLY from the local composed map —
 *  returning undefined defers the junction to the next pass instead of
 *  querying the lexicon for a row the batch already carries (the whole-set
 *  read fetched every side; a lexicon point query here would reintroduce
 *  exactly the per-row round trips the chunked read removed). Sides NOT in
 *  the row set keep the closure path's fallback: the lexicon's warm cache,
 *  then a real read (cached on first miss). */
async function tryComposeSqlRowName(
  row: CardsRow,
  names: Map<number, DeckoName>,
  byId: Map<number, CardsRow>,
  ctx: PrefetchContext,
): Promise<DeckoName | undefined> {
  if (row.name !== null && row.name !== undefined) return DeckoName.parse(row.name);
  if (row.left_id === null || row.left_id === undefined) return undefined;
  if (row.right_id === null || row.right_id === undefined) return undefined;
  const left = await sqlRowSideName(row.left_id, names, byId, ctx);
  if (left === undefined) return undefined;
  const right = await sqlRowSideName(row.right_id, names, byId, ctx);
  if (right === undefined) return undefined;
  return DeckoName.parse(`${left.s}+${right.s}`);
}

async function sqlRowSideName(
  id: number,
  names: Map<number, DeckoName>,
  byId: Map<number, CardsRow>,
  ctx: PrefetchContext,
): Promise<DeckoName | undefined> {
  const local = names.get(id);
  if (local !== undefined) return local;
  if (byId.has(id)) return undefined; // in the row set: resolve on a later pass, never query
  try {
    const viaLexicon = await ctx.lexicon.name(id);
    // lexicon.rb#lex_to_name's side guard reads the PUBLIC Lexicon.name,
    // which answers the EMPTY name (truthy, lexicon.rb:11-15) for a side
    // id whose cards row is missing - the join continues with the empty
    // part ("+*default"-shaped names) instead of abandoning the name.
    return viaLexicon ?? DeckoName.parse("");
  } catch {
    return undefined;
  }
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
  /** Names retired for good, keyed by the same string `pending` holds.
   *  A name lands here when one of its side keys is EMPTY: `cards` carries
   *  no row with key = '' (`SELECT COUNT(*) FROM cards WHERE key = ''`
   *  = 0; the `key IS NULL` rows are side-less junctions that a
   *  `COLLATE NOCASE IN (...)` list never matches anyway), so the name can
   *  NEVER resolve through the row path. Before the fold such a name stayed
   *  in `pending` forever — seedKeys admits no empty key, and the round's
   *  drain removes a name only once its key reached `known` — so the loop
   *  re-issued byte-identical statements until MAX_CLOSURE_ROUNDS ran out.
   *  Retiring the name changes no rendered byte: the render already answers unknown for
   *  it (the unknown-card substitution), which is what the empty-padded
   *  IN-lists produced too. */
  const dead = new Set<string>();
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
        // Guard parity with collectFromRecords below: an unresolvable mark
        // ("~861" — a TRASHED row the pointer/list item enrichment resolves
        // through the async lexicon's no-trash-filter read, lexicon.rb
        // #id_to_lex) must skip the reference, never unwind the whole
        // prepare. The render's item path reports true fetch misses.
        let name: DeckoName;
        try {
          name = DeckoName.parse(ref.name);
        } catch (err) {
          if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
            continue;
          }
          throw err;
        }
        if (name.s === "" || known.has(name.key) || dead.has(name.key)) continue;
        pending.add(name.s);
      }
    }
  };
  collect(scanRows);
  // Contextual collection from COMPOSED records. A row-scanned ref
  // like `{{+image}}` parses as the literal key "+image" (no row carries it),
  // so every template child / plus-child nest fell out of the closure and the
  // render's nest fetch missed the cache (children of
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
        if (name.s === "" || known.has(name.key) || dead.has(name.key)) continue;
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
    const sideKeyPairs: { left: string; right: string; entryKey: string }[] = [];
    const sideIdPairs: { leftId: number; rightId: number; entryKey: string }[] = [];
    for (const nameStr of pending) {
      const name = DeckoName.parse(nameStr);
      if (known.has(name.key)) continue; // an earlier round resolved it
      // Retired by an earlier round's negative marking (or by the
      // empty-side / dead-side rules below): it provably cannot resolve, so
      // it leaves the queue now instead of being re-issued every round.
      if (dead.has(name.key)) {
        pending.delete(nameStr);
        continue;
      }
      if (!name.isCompound) {
        simpleKeys.push(name.key);
        continue;
      }
      const left = name.leftName;
      const right = name.rightName;
      if (left === undefined || right === undefined) continue;
      // THE FOLD, queue half. A name that provably cannot resolve leaves
      // the queue here instead of being re-issued for MAX_CLOSURE_ROUNDS.
      // Four provable negatives, all keyed on facts the round itself
      // established (see the `dead` doc above and the post-round marking
      // below):
      //   (a) an empty side key — no card carries key = '';
      //   (b) a side that already went negative — the junction row needs
      //       that side's row to exist at all;
      //   (c) a pair whose junction row missed once BOTH sides resolved;
      //   (d) a simple key whose statement returned no row.
      // None of them can resolve later within this call: the loop's only
      // resolution path is a card row, and `dead` is per-call state.
      if (left.key === "" || right.key === "") {
        dead.add(name.key);
        pending.delete(nameStr);
        continue;
      }
      if (dead.has(left.key) || dead.has(right.key)) {
        dead.add(name.key);
        pending.delete(nameStr);
        continue;
      }
      const leftKnown = known.has(left.key);
      const rightKnown = known.has(right.key);
      if (!left.isCompound && !right.isCompound) {
        // depth-2 pair: direct side-key join, and fetch the sides themselves
        // in the same round so the junction composes (composed-key resolution).
        sideKeyPairs.push({ left: left.key, right: right.key, entryKey: name.key });
        if (!leftKnown) simpleKeys.push(left.key);
        if (!rightKnown) simpleKeys.push(right.key);
      } else if (leftKnown && rightKnown) {
        // both sides' rows are cached: join the junction row by side ids
        // (the UNIQUE index_cards_on_left_id_and_right_id pair).
        const leftId = knownIds.get(left.key);
        const rightId = knownIds.get(right.key);
        if (leftId !== undefined && rightId !== undefined) {
          sideIdPairs.push({ leftId, rightId, entryKey: name.key });
        }
      } else {
        // a compound side is not yet resolved: resolve the sides first
        // (they join this round as their own pending targets).
        if (!leftKnown && !dead.has(left.key)) pending.add(left.s);
        if (!rightKnown && !dead.has(right.key)) pending.add(right.s);
        if (dead.has(left.key) || dead.has(right.key)) {
          dead.add(name.key);
          pending.delete(nameStr);
        }
      }
    }

    // The round's statements (only the non-empty shapes ride the batch).
    const statements: SQLStatement[] = [];
    const collectors: ((rows: CardsRow[]) => RawRow[])[] = [];
    // THE FOLD, statement half: no key IN-list this loop builds may carry
    // an empty member. Provably row-set identical — an empty key matches no
    // card, so every statement below returns exactly the rows it returned
    // with the empty members present — and it keeps the placeholder count
    // honest for statements the round budget does spend.
    const fetchableKeys = simpleKeys.filter((key) => key !== "");
    if (fetchableKeys.length > 0) {
      const placeholders = fetchableKeys.map(() => "?").join(", ");
      // COLLATE NOCASE matches the collation of cards_key_index (the
      // column itself is BINARY); lossless for decko's lowercase keys -
      // the seek is the O(page) lookup the rounds exist for.
      statements.push({
        sql: `SELECT * FROM cards WHERE "key" COLLATE NOCASE IN (${placeholders}) AND trash = 0`,
        params: fetchableKeys,
      });
      collectors.push((rows) => rows.map(toRawRow));
    }
    if (sideKeyPairs.length > 0) {
      // The two lists are an INDEPENDENT CROSS PRODUCT (`l.key IN (lefts)`
      // AND `r.key IN (rights)` — the pairing is positional in neither
      // list), so the realized (l, r) set is
      // `(lefts INTERSECT real) X (rights INTERSECT real)`. Dropping an
      // empty member from EITHER list therefore leaves that product
      // unchanged; dropping a whole PAIR would not (it would take the
      // pair's non-empty side with it). Empty members are filtered per
      // list, not per pair.
      const leftKeys = sideKeyPairs.map((pair) => pair.left).filter((key) => key !== "");
      const rightKeys = sideKeyPairs.map((pair) => pair.right).filter((key) => key !== "");
      if (leftKeys.length > 0 && rightKeys.length > 0) {
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
    }
    if (sideIdPairs.length > 0) {
      // SQLITE_MAX_EXPR_DEPTH (default 1000) counts every OR arm toward the
      // expression tree: the unchunked one-statement tuple died at 1019 pairs
      // ("Expression tree is too large (maximum depth 1000)") — and the throw
      // killed the WHOLE folded batch, permission statements included, so the
      // prepare render died before the read-permission state resolved and the
      // page rendered read-denied bodies unjudged. Chunk at
      // 400 pairs (800 params: under the depth limit and under the classic
      // 999-variable limit). All chunks ride the SAME batch — still one round
      // trip — and small rounds keep the single-statement shape.
      const SIDE_ID_PAIRS_PER_STATEMENT = 400;
      for (let start = 0; start < sideIdPairs.length; start += SIDE_ID_PAIRS_PER_STATEMENT) {
        const chunk = sideIdPairs.slice(start, start + SIDE_ID_PAIRS_PER_STATEMENT);
        const tuple = chunk.map(() => `(j.left_id = ? AND j.right_id = ?)`).join(" OR ");
        const params = chunk.flatMap((pair) => [pair.leftId, pair.rightId]);
        statements.push({
          sql: `SELECT j.* FROM cards j WHERE j.trash = 0 AND (${tuple})`,
          params,
        });
        collectors.push((rows) => rows.map(toRawRow));
      }
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
    // THE FOLD, post-round negatives (the mirror of prefetchWarmupClosure's
    // step 5a, which this loop never had — see its `sidePairKeys` / `simpleKeys`
    // marking). Every name this round ATTEMPTED and did not get a row for is
    // a permanent negative for this call: the loop's only resolution path is
    // a card row, so re-asking cannot change the answer. Without this the
    // loop re-issued byte-identical statements until MAX_CLOSURE_ROUNDS.
    // `fetchedKeys` is the round's ACTUAL returned rows (not `known`, which
    // also carries earlier rounds' compositions), so a row the round did
    // receive — even via the pair join rather than the simple-key list — is
    // never mistaken for a negative.
    {
      const fetchedKeys = new Set<string>();
      for (const row of [...sideRows, ...closureRows]) {
        if (row.key !== null && row.key !== "") fetchedKeys.add(row.key);
      }
      // (d) a simple key (or an unresolved side pushed for composition) that
      //     came back with no row: nothing stored, exactly as the warm-up
      //     ladder records it.
      for (const key of fetchableKeys) {
        if (!fetchedKeys.has(key)) dead.add(key);
      }
      // (c) a pair whose BOTH sides resolved and whose junction row did not come
      //     back. Two probes carry the junction row, and both are exact:
      //     the depth-2 side-KEY join (this loop's `sideKeyPairs` arm, which
      //     runs BEFORE the side-ID arm and therefore handles every depth-2
      //     pair) and the side-ID join on index_cards_on_left_id_and_right_id.
      //     A miss from either is a permanent negative. Tested on the
      //     returned rows' OWN side ids, never on the junction row's stored
      //     key column — a junction row can carry a NULL key, and a key-based
      //     test would read that as a negative. A pair whose side ids are
      //     not yet known concludes nothing this round: its side goes dead
      //     through (d) instead, and the dead-side rule retires it next.
      const landedIds = new Set<string>();
      for (const row of [...sideRows, ...closureRows]) {
        if (row.leftId !== null && row.rightId !== null) landedIds.add(`${row.leftId}/${row.rightId}`);
      }
      const concludePair = (leftId: number | undefined, rightId: number | undefined, entryKey: string): void => {
        if (leftId === undefined || rightId === undefined) return;
        if (!landedIds.has(`${leftId}/${rightId}`)) dead.add(entryKey);
      };
      for (const pair of sideIdPairs) {
        concludePair(pair.leftId, pair.rightId, pair.entryKey);
      }
      for (const pair of sideKeyPairs) {
        concludePair(knownIds.get(pair.left), knownIds.get(pair.right), pair.entryKey);
      }
    }
    collect(closureRows); // their content references join the pending set
    // The composed CLOSURE records join contextually too (side rows
    // stay unscanned — the reached-semantics note above; only walked rows fed
    // the frontier). Filter by id: newComposed mixes closure + side records.
    {
      const closureIds = new Set(closureRows.map((row) => row.id));
      collectFromRecords(
        newComposed.filter((record) => record.id !== undefined && closureIds.has(record.id)),
      );
    }
    for (const nameStr of [...pending]) {
      // Mark-resolution error tolerance (mirror of cardReferenceKeys'
      // catch in render.ts): a name that fails the synchronously-resolved
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

// ---------------------------------------------------------------------------
// layout warm-up closure — the served page's bounded + batched chase
// (prefetch.ts#driveClosure's statement shapes over the warm-up's reference
// classes; see page.ts warmUpLayoutNests)
// ---------------------------------------------------------------------------

/** One chased reference: a raw name plus the REFERENCING card it resolves
 *  against (format.ts resolveNestName semantics — layout-level refs resolve
 *  against the page card, a warmed card's own content refs against that
 *  card). */
export interface WarmupRef {
  name: string;
  context: string;
  /** How this reference renders (default "full"). */
  mode?: WarmupMode;
}

/** Reference classes, weakest to strongest:
 *  - leaf: existence/title only ([[link]] targets) — prepared, not scanned;
 *  - nav-item: nested with view :nav_item — a link, or for Pointer/List
 *    types a dropdown of its items (each a link: leaves);
 *  - navbar: nested with view :navbar_links — its [[links]] are nav items;
 *  - full: rendered content — nests and pointer items are full, links leaf. */
export type WarmupMode = "leaf" | "nav-item" | "navbar" | "full";
export const WARMUP_MODE_RANK: Record<WarmupMode, number> = { leaf: 0, "nav-item": 1, navbar: 2, full: 3 };

/** The references one scanned card's content contributes. Every class
 *  expands: which references render is NOT decidable from content syntax
 *  alone (a [[link]] is an existence-only anchor in ordinary content but a
 *  real NEST through the navbar chunk walk — navbar-views.ts
 *  navbarLinksView turns [[target|label]] into nav_item nests whose targets
 *  render, and a pointer item renders as a full bar) — so the chase keeps
 *  the baseline fixpoint classes and takes its bound from BATCHING (round
 *  trips scale with reference-BFS depth, not card count) plus the round
 *  cap, never from dropping a reference class. */
export interface WarmupScan {
  refs: WarmupRef[];
  /** Existence-only references: prepared like refs, never scanned (their
   *  own references are not read by this page unless something else
   *  reaches them as a ref). */
  leaves?: WarmupRef[];
}

/** Structural view of a prepared render card (RenderCard satisfies it). */
export interface WarmupCard {
  key: string;
  id: number | undefined;
  name: DeckoName;
  dbContent: string;
  typeCode: string | undefined;
}

export interface WarmupClosureContext extends PrefetchContext {
  /** Prepared-map read (the render-card map): undefined when this key has
   *  no prepared card. */
  getCard: (key: string) => WarmupCard | undefined;
  /** ENGINE-LIFETIME scan memory (the render engine's warmupScannedKeys):
   *  card keys whose reference scan some earlier warm-up call on this
   *  engine already performed. The per-call `scanned` set prevents
   *  re-scanning within one call; this set prevents re-scanning ACROSS
   *  calls - without it, a fixpoint loop that drains warm-but-unscanned
   *  pending entries (see the no-statements branch below) re-walks the
   *  whole layout-connected closure on every warm page render. Valid
   *  because the deck is static per engine lifetime (the same contract
   *  pointerListHostsDone documents) and every caller shares one scan
   *  function (page.ts scanWarmDeps); resetCaches() and expireRenderCard
   *  drop keys when the underlying state they describe goes away. */
  scannedKeys?: Set<string>;
  /** The injected states.rb#virtual? hook (FetchEngine.virtualCardLookup):
   *  for a compound name whose pair join found no row, the baseline ladder's
   *  fetch returns a VIRTUAL record when a *structure rule applies — run
   *  here directly (in-memory over the loaded universe, no queries) so the
   *  prepared-map state matches the ladder without paying its per-name
   *  cache-write/reset churn. Undefined when the fetcher has no hook (the
   *  baseline then stored nothing for these names either). */
  virtualLookup?: (name: string) => Promise<VirtualCardResolution | undefined>;
  /** Per-name ladder fallback — the CAP safety net only: names still live
   *  when the round cap hits degrade to the exact baseline ladder path
   *  instead of truncating the prepared set (byte parity over speed). */
  prepareFallback: (name: string) => Promise<WarmupCard | undefined>;
  /** Re-prime the lexicon entries :codename marks resolve through (the
   *  temporary cache wipes primed entries as renders write — page.ts
   *  ensureCodenameMarksResolvable). Runs once per round, matching the
   *  baseline chase's per-batch cadence. */
  onRound?: () => Promise<void>;
  /** Junction sides queued only to compose a compound name are prepared as
   *  existence-only leaves, never scanned (request-local live render's
   *  demand-seed warm-up only; without it such a side is scanned as "full"
   *  and its content's references are chased). */
  sidesUnscanned?: boolean;
}

export interface WarmupStats {
  /** driver.batch round trips issued. */
  batches: number;
  /** individual SQL statements issued (chunked IN-lists count one each). */
  statements: number;
  /** reference-BFS rounds (each round at most one batch). */
  rounds: number;
  /** rows composed into the fetch cache + render-card map. */
  cards: number;
  /** cap-degradation ladder fallbacks (0 on decks that converge in rounds). */
  fallbacks: number;
}

/**
 * Resolve the warm-up reference closure in BATCHED rounds:
 * every round drains names already prepared, collects the reference classes
 * from newly scanned cards, and fetches everything unresolved in ONE
 * driver.batch (key IN-lists / side-key joins / side-id pair joins / side
 * priming — the driveClosure shapes, chunked to the D1 parameter ceiling).
 * Round trips therefore scale with reference DEPTH, not card count — the
 * cold-render burst this batching exists to fix.
 *
 * Side cards of junction rows are composed + enriched but never scanned
 * (exactly the driveClosure reached-semantics — and the baseline chase,
 * whose enqueueWarmDeps ran only for the chased name itself, never for the
 * left record enrichAndStore recursed into).
 *
 * NEGATIVE names (no row) leave the queue the round they go negative: the
 * baseline ladder stored NOTHING for a fetch miss (results.rb new_result_card
 * returns undefined — isKnownCard is real?, the placeholder has no id) —
 * a simple negative costs one key query, a compound negative one pair join
 * or one missing-part lookup, and no prepared-map state. A compound negative
 * that a *structure rule would resolve as a VIRTUAL card goes through
 * ctx.virtualLookup directly (in-memory; the ladder's cache-write/reset
 * churn per negative name is exactly the burst this path avoids).
 */
export async function prefetchWarmupClosure(
  seeds: WarmupRef[],
  ctx: WarmupClosureContext,
  scan: (card: WarmupCard, mode: WarmupMode) => WarmupScan,
): Promise<WarmupStats> {
  const stats: WarmupStats = { batches: 0, statements: 0, rounds: 0, cards: 0, fallbacks: 0 };
  const foldStats: PrefetchStats = {
    batches: 0,
    statements: 0,
    fallbackRounds: 0,
    cards: 0,
    typePrimeMemo: new Set<number>(),
  };

  /** Keys sent to SQL or through the cap fallback at least once. */
  const checked = new Set<string>();
  /** Negative names (no row): the baseline stored nothing for them — they
   *  leave the queue permanently. Guards re-collection from later refs. */
  const dead = new Set<string>();
  /** Keys whose content refs this call already collected (each card scans
   *  once per warm-up call — the baseline `warmed` set). */
  const scanned = new Set<string>();
  /** Compound dead names whose virtual? resolution has not run yet. */
  const virtualCheckQueue: string[] = [];

  interface Entry {
    abs: string;
  }
  /** Keyed by canonical key. */
  const pending = new Map<string, Entry>();
  /** The strongest reference class each key was reached as (WARMUP_MODE_RANK). */
  const modes = new Map<string, WarmupMode>();
  /** The class each scanned key was scanned at. */
  const scannedAs = new Map<string, WarmupMode>();
  const rank = (m: WarmupMode | undefined): number => WARMUP_MODE_RANK[m ?? "full"];
  const pushRef = (ref: WarmupRef, modeOverride?: WarmupMode): void => {
    const abs = resolveWarmName(ref.name, ref.context);
    if (abs === undefined) return; // unresolved mark: the real nest renders it
    let key: string;
    try {
      key = DeckoName.parse(abs).key;
    } catch {
      return;
    }
    const mode: WarmupMode = modeOverride ?? ref.mode ?? "full";
    const had = modes.get(key);
    if (had === undefined || rank(mode) > rank(had)) {
      modes.set(key, mode);
      const done = scannedAs.get(key);
      if (done !== undefined && rank(mode) > rank(done)) {
        // reached again as a stronger class after its scan: re-scan at it
        const prepared = ctx.getCard(key);
        if (prepared !== undefined) {
          scannedAs.set(key, mode);
          const found = scan(prepared, mode);
          for (const r of found.refs) pushRef(r);
          for (const r of found.leaves ?? []) pushRef(r, "leaf");
        }
      } else if (done === undefined && had === "leaf" && !pending.has(key) && !dead.has(key)) {
        // prepared as a leaf, now needs a scan
        const prepared = ctx.getCard(key);
        if (prepared !== undefined) {
          scanned.delete(key);
          scanCard(prepared);
          return;
        }
      }
    }
    if (dead.has(key) || pending.has(key)) return;
    pending.set(key, { abs });
  };
  for (const seed of seeds) pushRef(seed);

  /** Drop a negative name from the chase; compound names queue for the
   *  in-memory virtual? walk (a *structure rule makes the ladder return a
   *  virtual record — nothing is stored when it does not apply). */
  const markDead = (key: string): void => {
    const entry = pending.get(key);
    if (entry === undefined) return;
    pending.delete(key);
    dead.add(key);
    virtualCheckQueue.push(entry.abs);
  };

  function scanCard(card: WarmupCard): void {
    if (scanned.has(card.key)) return;
    const mode = modes.get(card.key) ?? "full";
    if (mode === "leaf") return; // prepared for existence only
    scanned.add(card.key);
    scannedAs.set(card.key, mode);
    if (mode === "full") {
      if (ctx.scannedKeys?.has(card.key)) {
        // An earlier warm-up call on this engine already chased this card's
        // references (see scannedKeys on the context): skip the re-scan. The
        // per-call bookkeeping still marks it scanned so within-call pushes
        // never loop, and the drain that removed it from pending still makes
        // progress.
        return;
      }
      ctx.scannedKeys?.add(card.key);
    }
    const found = scan(card, mode);
    for (const ref of found.refs) pushRef(ref);
    for (const ref of found.leaves ?? []) pushRef(ref, "leaf");
  }

  /** Run the queued virtual? walks; a hit constructs the same record the
   *  ladder's new_result_card would return (placeholder + rule type +
   *  template content), caches + enriches it, and scans its refs. */
  const drainVirtualChecks = async (): Promise<number> => {
    const queue = virtualCheckQueue.splice(0, virtualCheckQueue.length);
    if (ctx.virtualLookup === undefined) return 0; // no hook: nothing stored, like the ladder
    let landed = 0;
    for (const abs of queue) {
      let resolution: VirtualCardResolution | undefined;
      try {
        resolution = await ctx.virtualLookup(abs);
      } catch {
        resolution = undefined; // the baseline ladder's catch-and-continue
      }
      if (resolution === undefined) continue;
      let name: DeckoName;
      try {
        name = DeckoName.parse(abs);
      } catch {
        continue;
      }
      const record = newCardRecord(name);
      if (resolution.typeId !== undefined && record.typeId === undefined) {
        record.typeId = resolution.typeId;
      }
      record.dbContent = resolution.templateContent;
      await ctx.cacheRecord(record);
      const card = ctx.getCard(name.key);
      if (card !== undefined) {
        scanCard(card);
        landed += 1;
      }
    }
    return landed;
  };

  /** CAP safety net: live names still unresolved degrade to the exact
   *  baseline per-name ladder (byte parity over speed). */
  const capFallbackSweep = async (): Promise<void> => {
    for (const [key, entry] of [...pending]) {
      if (ctx.getCard(key) !== undefined) continue; // drained next iteration
      pending.delete(key);
      checked.add(key);
      stats.fallbacks += 1;
      const card = await ctx.prepareFallback(entry.abs);
      if (card !== undefined) scanCard(card);
    }
  };

  /** Junction side ids primed for composition + the sync side reads
   *  (driveClosure's side priming: enriched into the map, never scanned). */
  const seenSideIds = new Set<number>();
  let sideIdsToPrime: number[] = [];

  while (true) {
    // 1. Drain: names already prepared leave the queue and scan.
    for (const [key] of [...pending]) {
      const card = ctx.getCard(key);
      if (card === undefined) continue;
      pending.delete(key);
      scanCard(card);
    }
    if (pending.size === 0 && virtualCheckQueue.length === 0) break;

    // 2. Collect the round's fetch shapes from unresolved, unchecked names.
    const simpleKeys: string[] = [];
    const sideKeyPairs: { left: string; right: string; entryKey: string }[] = [];
    const sideIdPairs: { leftId: number; rightId: number; entryKey: string }[] = [];
    const deadJunctions: string[] = [];
    for (const [key, entry] of pending) {
      if (checked.has(key)) continue;
      if (ctx.getCard(key) !== undefined) continue; // prepared: next drain scans it
      let name: DeckoName;
      try {
        name = DeckoName.parse(entry.abs);
      } catch {
        checked.add(key);
        markDead(key);
        continue;
      }
      if (!name.isCompound) {
        simpleKeys.push(name.key);
        checked.add(key);
        continue;
      }
      const left = name.leftName;
      const right = name.rightName;
      if (left === undefined || right === undefined) {
        checked.add(key);
        markDead(key);
        continue;
      }
      // THE FOLD, warm-up arm: an empty side key matches no card row, so
      // the row ladder can never form this lex — the same negative the
      // dead-side branch below records. Retiring it through markDead (not a
      // bare drop) keeps the virtual? walk queued for the name: a *structure
      // rule can still construct a record here, and that path is unchanged.
      if (left.key === "" || right.key === "") {
        checked.add(key);
        markDead(key);
        continue;
      }
      const leftCard = ctx.getCard(left.key);
      const rightCard = ctx.getCard(right.key);
      if (
        leftCard !== undefined &&
        leftCard.id !== undefined &&
        rightCard !== undefined &&
        rightCard.id !== undefined
      ) {
        // both sides' rows are cached: join the junction row by the UNIQUE
        // (left_id, right_id) pair
        sideIdPairs.push({ leftId: leftCard.id, rightId: rightCard.id, entryKey: key });
      } else if (
        (leftCard === undefined && dead.has(left.key)) ||
        (rightCard === undefined && dead.has(right.key))
      ) {
        // a side already went negative: the ladder's name_to_lex could never
        // form this lex — dead (virtual? walk still runs on the name)
        checked.add(key);
        deadJunctions.push(key);
      } else if (!left.isCompound && !right.isCompound) {
        // depth-2 pair: direct side-key join; the sides themselves ride the
        // same round's simple-key statements so the junction composes
        sideKeyPairs.push({ left: left.key, right: right.key, entryKey: key });
        if (
          leftCard === undefined &&
          !checked.has(left.key) &&
          !dead.has(left.key) &&
          !pending.has(left.key)
        ) {
          simpleKeys.push(left.key);
        }
        if (
          rightCard === undefined &&
          !checked.has(right.key) &&
          !dead.has(right.key) &&
          !pending.has(right.key)
        ) {
          simpleKeys.push(right.key);
        }
      } else {
        // a compound side is not yet resolved: resolve the sides first
        // (resolution-only entries: composed, never scanned); simple sides
        // ride this round's simple-key statements
        if (
          leftCard === undefined &&
          !left.isCompound &&
          !checked.has(left.key) &&
          !dead.has(left.key) &&
          !pending.has(left.key)
        ) {
          simpleKeys.push(left.key);
        }
        if (
          rightCard === undefined &&
          !right.isCompound &&
          !checked.has(right.key) &&
          !dead.has(right.key) &&
          !pending.has(right.key)
        ) {
          simpleKeys.push(right.key);
        }
        if (
          leftCard === undefined &&
          left.isCompound &&
          !checked.has(left.key) &&
          !dead.has(left.key) &&
          !pending.has(left.key)
        ) {
          pending.set(left.key, { abs: left.s });
          if (ctx.sidesUnscanned === true && !modes.has(left.key)) modes.set(left.key, "leaf");
        }
        if (
          rightCard === undefined &&
          right.isCompound &&
          !checked.has(right.key) &&
          !dead.has(right.key) &&
          !pending.has(right.key)
        ) {
          pending.set(right.key, { abs: right.s });
          if (ctx.sidesUnscanned === true && !modes.has(right.key)) modes.set(right.key, "leaf");
        }
      }
    }
    for (const key of deadJunctions) markDead(key);

    const statements: SQLStatement[] = [];
    const collectors: ((rows: CardsRow[]) => void)[] = [];
    const closureRows: RawRow[] = [];
    const sideRows: RawRow[] = [];
    const sidePairKeys: string[][] = [];
    // THE FOLD, statement half (same contract as driveClosure above): no key
    // IN-list this loop builds carries an empty member. Provably row-set
    // identical — an empty key matches no card.
    for (const group of chunkParams(simpleKeys.filter((key) => key !== ""), WARMUP_CHUNK)) {
      const placeholders = group.map(() => "?").join(", ");
      statements.push({
        sql: 'SELECT * FROM cards WHERE "key" COLLATE NOCASE IN (' + placeholders + ") AND trash = 0",
        params: group,
      });
      collectors.push((rows) => {
        closureRows.push(...rows.map(toRawRow));
      });
    }
    for (const group of chunkParams(sideKeyPairs, WARMUP_CHUNK / 2)) {
      // Per-list filtering, not per-pair: the two IN-lists are an
      // independent CROSS PRODUCT, so `(lefts INTERSECT real) X (rights
      // INTERSECT real)` is unchanged by dropping an empty member from
      // either list. sidePairKeys rides only when the statement does — an
      // entry whose statement was never issued earns no negative.
      const leftKeys = group.map((pair) => pair.left).filter((key) => key !== "");
      const rightKeys = group.map((pair) => pair.right).filter((key) => key !== "");
      if (leftKeys.length === 0 || rightKeys.length === 0) continue;
      const placeholdersL = leftKeys.map(() => "?").join(", ");
      const placeholdersR = rightKeys.map(() => "?").join(", ");
      statements.push({
        sql:
          "SELECT DISTINCT j.* FROM cards j\n" +
          '  JOIN cards l ON l.id = j.left_id AND l."key" COLLATE NOCASE IN (' + placeholdersL + ")\n" +
          '  JOIN cards r ON r.id = j.right_id AND r."key" COLLATE NOCASE IN (' + placeholdersR + ")\n" +
          " WHERE j.trash = 0",
        params: [...leftKeys, ...rightKeys],
      });
      sidePairKeys.push(group.map((pair) => pair.entryKey));
      collectors.push((rows) => {
        closureRows.push(...rows.map(toRawRow));
      });
    }
    for (const group of chunkParams(sideIdPairs, WARMUP_CHUNK / 2)) {
      const tuple = group.map(() => "(j.left_id = ? AND j.right_id = ?)").join(" OR ");
      const params = group.flatMap((pair) => [pair.leftId, pair.rightId]);
      statements.push({
        sql: "SELECT j.* FROM cards j WHERE j.trash = 0 AND (" + tuple + ")",
        params,
      });
      sidePairKeys.push(group.map((pair) => pair.entryKey));
      collectors.push((rows) => {
        closureRows.push(...rows.map(toRawRow));
      });
    }
    for (const group of chunkParams(sideIdsToPrime, WARMUP_CHUNK)) {
      const placeholders = group.map(() => "?").join(", ");
      statements.push({
        sql: "SELECT * FROM cards WHERE id IN (" + placeholders + ") AND trash = 0",
        params: group,
      });
      collectors.push((rows) => {
        sideRows.push(...rows.map(toRawRow));
      });
    }

    // 3. Nothing fetchable: run the queued virtual? walks; if they land
    //    nothing either, the chase is at its fixpoint.
    if (statements.length === 0) {
      const landed = await drainVirtualChecks();
      if (landed === 0) {
        // The fixpoint is reached only when NO pending name can still make
        // progress. A pending name that is ALREADY PREPARED (renderCards
        // hit - prepared by an EARLIER render or warm-up call on this
        // engine: the map is engine-lifetime state, the worklist is
        // per-call) was skipped by collect with the "prepared: next drain
        // scans it" contract - but that next drain never runs if we break
        // here, and the card's own references never join the chase. The
        // concrete failure a bare view exposed: rendered before the first
        // page render, it prepared the layout's header/menu cards as
        // one-level template references; this break then ate the scan of
        // the menu card, the navbar's nested dropdown chunks stayed
        // unprepared, and every subsequently rendered page lost the menu
        // items to the unknown-card substitution. Continue instead: the
        // next iteration's drain removes each prepared name from the
        // worklist and scans it (scanCard's per-call `scanned` guard and
        // the engine-lifetime scannedKeys memory keep the sweep finite),
        // so the loop still terminates - and only when every remaining
        // pending name is genuinely unresolvable.
        let preparedPending = false;
        for (const key of pending.keys()) {
          if (ctx.getCard(key) !== undefined) {
            preparedPending = true;
            break;
          }
        }
        if (!preparedPending) break;
        continue;
      }
      continue;
    }

    if (stats.rounds >= MAX_WARMUP_ROUNDS) {
      // Round cap: the live tail degrades to the per-name ladder instead of
      // truncating the prepared set (byte parity over speed).
      await drainVirtualChecks();
      await capFallbackSweep();
      continue;
    }

    // 4. ONE batched round trip for the whole round (chunks ride along).
    if (ctx.onRound !== undefined) await ctx.onRound();
    const batch = await ctx.driver.batch(statements);
    stats.batches += 1;
    stats.statements += statements.length;
    stats.rounds += 1;
    batch.forEach((result, i) => {
      collectors[i]?.(result.rows as CardsRow[]);
    });
    collectors.length = 0;

    // 5. Compose + cache (lexicon prime + fetch cache + enrichAndStore).
    await composeAndCache([...sideRows, ...closureRows], ctx, foldStats);
    // 5a. Negatives go dead: pair-join misses (compound — virtual? walk
    //     queued) and simple-key misses (nothing stored, like the ladder).
    for (const keys of sidePairKeys) {
      for (const key of keys) {
        if (ctx.getCard(key) === undefined) markDead(key);
      }
    }
    for (const key of simpleKeys) {
      if (ctx.getCard(key) === undefined) {
        // negative simple name — includes junction SIDES pushed for
        // composition (they are not pending entries, but must die here or
        // their parent junction re-pushes them every round). Simple names
        // never resolve virtual (states.rb needs a junction), so like the
        // ladder they store nothing.
        dead.add(key);
        pending.delete(key);
      }
    }
    // 5b. Prime the next round's sides.
    sideIdsToPrime = [];
    for (const row of [...sideRows, ...closureRows]) {
      seenSideIds.add(row.id);
      for (const sideId of [row.leftId, row.rightId]) {
        if (sideId === null || seenSideIds.has(sideId)) continue;
        seenSideIds.add(sideId);
        sideIdsToPrime.push(sideId);
      }
    }
    await drainVirtualChecks();
  }

  stats.cards = foldStats.cards;
  return stats;
}


function resolveWarmName(raw: string, context: string): string | undefined {
  try {
    const parsed = DeckoName.parse(raw);
    return parsed.isAbsolute ? parsed.s : parsed.absoluteName(DeckoName.parse(context)).s;
  } catch {
    return undefined;
  }
}
