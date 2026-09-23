// The render engine: TypeScript port of the Decko card renderer's public
// surface, with the decko-commons/decko#1282 batched inclusion prefetch.
//
//   const engine = new RenderEngine(fetchEngine);
//   const html = await engine.render("Home", "open");
//
// Render pipeline (see docs/render-port-notes.md for the full trail):
//   1. fetch the root through the FetchEngine ladder (cache -> db)
//   2. prefetch the inclusion closure (src/card/render/prefetch.ts - one
//      batched round trip for any depth; per-level fallback only on CTE
//      misses), enrich type/set-key data, pre-execute Search cores
//   3. render from memory: the view tree walks cached records only; a warm
//      render issues zero queries
//
// Ruby surface ports:
// - format/render.rb#render!: voo lifecycle + view dispatch (format.ts)
// - render.rb#view_method + card-mod-format error.rb#unsupported_view_error_
//   message: unknown views raise with "view (X) not supported for NAME"
// - format/nesting.rb + nest.rb: subformats, implicit nest view, home_view
// - Search cores dispatch by type NAME ("Search", set/all/type.rb#type_name);
//   Ruby dispatches by set module (type_code :search_type). The codename
//   registry lookup would cost a (cacheable) query on the render path; the
//   divergence is recorded in docs/render-port-notes.md.

import { DeckoName } from "./name.js";
import { FetchEngine } from "./fetch.js";
import { cardContent, composeCardRecord, type CardRecord } from "./fetch/card-record.js";
import { executeQuery } from "../cql/execute.js";
import { findRule } from "./rules/lookup.js";
import { applyViewOverride, resolveViewOverride } from "./rules/apply.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  resolveStructuredContent,
  templateReferenceNames,
} from "./rules/structure.js";
import type { CardsRow } from "../server/schema.js";
import {
  RenderFormat,
  UnsupportedViewError,
  type RenderCard,
  type RenderEngineLike,
  type ViewFn,
} from "./render/format.js";
import { HTML_VIEWS } from "./render/views.js";
import {
  ModLoader,
  getDefaultModLoader,
  modGeneration,
} from "./mod-loader.js";
import { badQuery, dateError, emptyQueryError, isValidDateContent } from "./render/errors.js";
import {
  prefetchInclusionClosure,
  type PrefetchStats,
} from "./render/prefetch.js";
import { safeSetKeys } from "./render/set-keys.js";
import { referencedNames } from "./render/nest-syntax.js";
import type { PatternCardInput } from "./set-patterns/types.js";
import {
  readPermissionStatements,
  readPermissionStateFromViewerResults,
  canReadByStoredRule,
  canReadByRuleLookup,
  ANONYMOUS_VIEWER,
  type ReadViewer,
  type ReadPermissionState,
} from "./permissions/index.js";
import {
  allTaskVerdictsForCard,
  viewTaskPermissionStatements,
  viewTaskStateFromResults,
  type ViewTaskState,
  type WriteTask,
} from "./permissions/view-task-rules.js";
import { viewRequiresTask, type CrudTask } from "./permissions/view-perms.js";
import { installHelpRules, type HelpRulesApi } from "./render/help-popover.js";
import type { SQLQueryResult } from "../server/driver.js";

export { UnsupportedViewError };
export {
  BadQueryError,
  badQuery,
  emptyQueryError,
  BAD_QUERY_CLASS_NAME,
  DateError,
  dateError,
  DATE_ERROR_CLASS_NAME,
  isValidDateContent,
} from "./render/errors.js";
export type { RenderCard, PrefetchStats };
export { HTML_VIEWS };

const SEARCH_TYPE_CODE = "search_type";
// The codename the search-type type card carries in the codehash
// (render.ts:1038 sets card.typeCode = peekNameForId(typeId)). Corpus
// search cards have type cards whose CARD NAME is random
// (id=101 -> type_card name="qnzkqz"), so gating on typeName silently
// skips every corpus-shaped entry — the prepare phase never runs
// runSearch and the JSON-parse BadQuery never fires. Match by codename
// (the value the codehash lookup returns) for parity with the captured
// Ruby deck.
const DATE_TYPE_CODE = "date";
// The codename the date-type type card carries. Corpus date cards (id=1135
// with content "brcvtwrvz", etc.) have type cards whose CARD NAME is
// random ("evog"), so the typeName gate silently skipped them — the
// prepare phase never ran the date validator and :open/:content views
// rendered content instead of raising Date::Error (capture_error_not_raised:
// Date bucket, 963 entries in the fresh full replay). Match by codename,
// independent of the type card's display name.

export class RenderEngine implements RenderEngineLike {
  readonly fetcher: FetchEngine;
  readonly views: Record<string, ViewFn>;
  /** The chain-aware mod loader (ModLoader.viewChain walks this; the
   *  chain-aware dispatch in format.ts#renderView consults it via
   *  resolveView). Optional: when undefined, resolveView returns the
   *  flat engine.views[view] entry (byte-identical to the pre-chain
   *  render path - 1080-test suite stays green untouched).
   *
   *  Defaults to the process-wide getDefaultModLoader() (the seam the
   *  defaultDeckLoader() binds at boot), so a vanilla engine picks up
   *  the deck's loader without explicit wiring. A per-engine setter
   *  is exposed for tests + custom compositions. */
  modLoader?: ModLoader;

  /** Enriched render cards by key - the render path reads this map
   *  synchronously (everything in it was prefetched/enriched). */
  private renderCards = new Map<string, RenderCard>();
  /** Rule lookup cache: `<card_key>|<view>` -> the resolved ViewOverride
   *  (or undefined if no rule applies). Filled during the first render of
   *  a (card, view) pair; subsequent renders skip the rule walk entirely.
   *  This is what keeps the #1282 constant-queries promise: a warm render
   *  issues ZERO queries for rule application. Cleared on resetCaches(). */
  private ruleCache = new Map<string, ReturnType<typeof resolveViewOverride> | undefined>();
  /** Chain-aware view dispatch cache: `<format>|<card_key>|<view>` -> the
   *  resolved ViewFn (or undefined if no view applies). Filled on the
   *  first dispatch per (card, view) pair; subsequent renders skip the
   *  chain walk entirely. closureWarm-style: warm re-renders stay at
   *  zero cost (Map lookup, no per-render string parsing or chain walk).
   *  Cleared on resetCaches(). */
  private viewDispatchCache = new Map<string, ViewFn | undefined>();
  /** key -> id for prefetched cards - the SYNC resolver CQL's name-to-id
   *  conditions need (parse options take a sync callback; the async lexicon
   *  cannot serve it, so the prefetch primes this map instead). */
  private idsByKey = new Map<string, number>();
  /** Pre-executed search results by search card key. */
  private searchResults = new Map<string, RenderCard[]>();
  /** Read-permission state for the engine's viewer (the Anonymous corpus
   *  actor) — the port of Auth.as_card.read_rules_hash. Resolved lazily on
   *  the first render, folded into the prefetch batch so a cold render
   *  stays ONE round trip; undefined until then. Cleared on resetCaches(). */
  private readPermission: ReadPermissionState | undefined;
  /** card id -> denied verdict (the pure half of ok_to_read?). Computed in
   *  the prepare phase so the synchronous render path never queries.
   *  Cleared on resetCaches(). */
  private deniedVerdicts = new Map<number, boolean>();
  /** The viewer whose readable set the permission engine enforces —
   *  Anonymous by default; a signed-in session's actor carries its role
   *  parties (see ReadViewer in src/card/permissions/read-rules.ts). Set
   *  before the first render, or together with resetCaches() after. */
  viewer: ReadViewer = ANONYMOUS_VIEWER;
  /** Codename ids the rule? predicate compares against (SettingID/SetID/
   *  UserID, resolved from the codename codehash). Folded into the cold
   *  render's closure batch (zero extra round trips); undefined until
   *  then. Cleared on resetCaches(). */
  private ruleTypeIds:
    | { setting: number | undefined; set: number | undefined; user: number | undefined }
    | undefined;
  /** *structure rule templates by rule-card composed key -> the rule card's
   *  db_content (null = NULL content). The bulk universe rides the cold
   *  render's closure batch (one statement, zero extra round trips — the
   *  #1282 shape); structured content (content/all.rb:8-10:
   *  structured_content || standard_content) is then pure memory. Undefined
   *  until the first parse. Cleared on resetCaches(). */
  private structureContents: Map<string, string | null> | undefined;
  /** Render-card keys whose dbContent already went through the structured
   *  pass (idempotence: the pass re-runs after search enrichment without
   *  re-processing the closure). Cleared on resetCaches(). */
  private structureProcessed = new Set<string>();
  /** Absolute template reference keys that missed fetch (nest targets that
   *  are not cards — e.g. the corpus's {{xxxx}} fixtures). Never re-fetched
   *  on later renders, so warm renders stay zero-query. Cleared on
   *  resetCaches(). */
  private structureRefMisses = new Set<string>();
  /** ok_to_<task>? state for the non-read view tasks — loaded once per
   *  engine, on the first render whose ROOT view demands a non-read task
   *  (docs/view-perms-notes.md). Cleared on resetCaches(). */
  private taskState: ViewTaskState | undefined;
  /** card key -> allowed verdicts per write task (the ensureVerdicts
   *  model; undefined entries mean unverifiable). Cleared on resetCaches(). */
  private taskVerdicts = new Map<string, Record<WriteTask, boolean | undefined>>();
  /** The help-rule resolver (menu popover content) — attached once per
   *  engine by installHelpRules; its deck-wide batch runs once in the
   *  prepare phase. format.ts reads engine.helpRules. Cleared on
   *  resetCaches(). */
  helpRules?: HelpRulesApi;
  private helpResolver: ReturnType<typeof installHelpRules> | undefined;
  private lastPrefetch: PrefetchStats | undefined;

  constructor(fetcher: FetchEngine) {
    this.fetcher = fetcher;
    this.views = HTML_VIEWS;
    // Bind to the process-wide default loader (the seam defaultDeckLoader
    // populates). The chain-aware dispatch reads this through resolveView;
    // tests can override the field directly to install their own loader.
    this.modLoader = getDefaultModLoader();
  }

  /** Query-cost stats of the most recent render (diagnostics; the tests
   *  measure through a counting driver instead). */
  get lastRenderStats(): PrefetchStats | undefined {
    return this.lastPrefetch;
  }

  /**
   * Render one view of one card to HTML bytes. Throws UnsupportedViewError
   * for views outside the ported registry (the captured sentinel contract).
   */
  async render(cardName: string, view: string): Promise<string> {
    const record = await this.fetcher.fetchByName(cardName);
    if (record === undefined || record.name === undefined) {
      throw new Error(`card not found: ${cardName}`);
    }
    const name = record.name;

    // Read-permission preparation (see src/card/permissions/). On a cold
    // render the state resolution rides the prefetch batch (one round trip
    // stays one round trip); on a warm closure it runs as its own batch —
    // once per engine, never per warm render. The codename codehash (the
    // rule? predicate's type-id source) folds into the same batch.
    const permissionCold = this.readPermission === undefined;
    const ruleTypesCold = this.ruleTypeIds === undefined;
    const structureCold = this.structureContents === undefined;
    const permissionStatements = permissionCold ? readPermissionStatements(this.viewer) : [];
    let foldedResults: SQLQueryResult[] | undefined;
    if (!this.closureWarm(record)) {
      const coldStatements = [
        ...permissionStatements,
        ...(ruleTypesCold ? [this.fetcher.codenames.codehashStatement()] : []),
        // The *structure rule universe (one statement; the structured-content
        // resolution reads it as pure memory afterwards). Appended LAST: the
        // permission state parser reads folded results by fixed index.
        ...(structureCold ? [structureRuleUniverseStatement()] : []),
      ];
      const stats = await prefetchInclusionClosure(record, {
        driver: this.fetcher.driver,
        lexicon: this.fetcher.lexicon,
        cacheRecord: (cached) => this.cacheFetchedRecord(cached),
        ...(coldStatements.length > 0 ? { additionalStatements: coldStatements } : {}),
      });
      this.lastPrefetch = stats;
      foldedResults = stats.additionalResults;
      // The rule ids must be memoized BEFORE enrichment: enrichAndStore
      // computes set keys (the RULE pattern's applies?) synchronously from
      // them. Sliced past the permission statements the batch also carried.
      if (ruleTypesCold) this.parseRuleTypeIds(foldedResults, permissionStatements.length);
      this.parseStructureContents(
        foldedResults,
        permissionStatements.length + (ruleTypesCold ? 1 : 0),
      );
      // The root itself may not be in the walked set (already cached).
      await this.enrichAndStore(record);
    }
    if (permissionCold) await this.ensureReadPermission(foldedResults);
    // Structured content pass #1: the prefetched closure (Ruby resolves the
    // template at Card#content time — every view reads the substituted
    // accessor; templating.rb#structure).
    await this.applyStructureContent();
    // Read-permission verdicts for the closure MUST be computed BEFORE
    // prepareSearches — the Ruby render path short-circuits denied cards
    // before the Search card's JSON.parse (corpus:34 *children+*right+
    // *structure, captured as `<span class="denied">` — not
    // CAPTURE_ERROR:BadQuery). The port must respect that ordering, or a
    // denied Search card with non-JSON content would raise BadQuery on
    // a render Ruby never reached the search core for. ensureVerdicts
    // populates `deniedVerdicts` for every prepared card from the folded
    // permission state; prepareSearches then skips cards in that map.
    await this.ensureVerdicts();
    // Type-code pass MUST run before prepareSearches — the cold-render
    // prefetch walk runs enrichAndStore before parseRuleTypeIds folds
    // the codehash, so a freshly enriched card's `typeCode` is undefined
    // here on cold renders. The Search / Date gates inside prepareSearches
    // (and the Search gate inside closureWarm) match on typeCode, NOT
    // typeName — the latter would silently miss corpus-shaped type cards
    // whose NAME is random (corpus:1135 has the date-type card named
    // "evog"; corpus:101 has the search-type card named "qnzkqz"). Patch
    // every prepared card's typeCode from the (now-folded) codehash
    // before the prepare walk reads it.
    this.populateTypeCodes();
    await this.prepareSearches(record);
    // Pass #2: cards enrichAndStore'd during search preparation (their
    // records joined after pass #1). Idempotent — processed keys skip.
    await this.applyStructureContent();
    // Pass #2 populateTypeCodes: cards enriched during runSearch also
    // need their typeCode patched (their enrichAndStore ran AFTER the
    // batch fold, so peekNameForId returned the right codename — but
    // items reached transitively from another search's results might
    // have been enriched without the typeCode fixup, mirroring the
    // prefetch walk's shape).
    this.populateTypeCodes();
    await this.ensureTaskVerdicts(view);
    if (this.helpResolver === undefined) {
      this.helpResolver = installHelpRules(this, this.fetcher);
      await this.helpResolver.prepare();
    }

    const rootCard = this.renderCards.get(name.key);
    if (rootCard === undefined) {
      throw new Error(`render card not prepared: ${name.s}`);
    }
    // Pointer / List cardtypes: pre-enrich every item the content
    // references (the prefetch closure walk does NOT chase plain-text
    // references — only nest-syntax ones — so the items are absent
    // from renderCards when the sync core view tries to fetch them).
    // One batched pass per render; the second-pass walk the corpus
    // replay driver uses (cached) makes repeat renders free.
    if (rootCard.typeCode === "pointer" || rootCard.typeCode === "list") {
      await this.enrichPointerListItems(rootCard);
    }
    // Set cardtype cards: pre-load rule cards hanging off the set. The
    // prefetch closure walk does NOT chase rule cards hanging off a set
    // — they're reachable only through the rule's left side, which the
    // set's random-content dbContent does not name. The Rules section
    // core override (views.ts setRulesCoreHtml) reads the enriched
    // cards synchronously from the render-card map.
    if (rootCard.typeCode === "set") {
      await this.preloadSetRules(rootCard);
    }
    const format = new RenderFormat(rootCard, this, { maxDepth: 42 });
    const baseHtml = format.renderView(view, {});

    // A denied render never reaches view dispatch (the denial span REPLACES
    // the view in renderView), so view-override rules cannot apply to it —
    // Ruby's denial happens before any view body runs.
    if (this.isDenied(rootCard)) return baseHtml;

    // Rule-application hook: cached lookup so warm re-renders cost zero
    // queries. The cache key encodes the (card, view) pair so different
    // views of the same card get independent override resolution.
    const cacheKey = `${name.key}|${view}`;
    let override = this.ruleCache.get(cacheKey);
    if (override === undefined && !this.ruleCache.has(cacheKey)) {
      // Miss: walk the rule chain. Cache both the hit AND the miss (the
      // undefined in `override` could mean "no rule" — we distinguish via
      // `has`, but the cache stores undefined for misses too).
      const rule = await findRule(
        this.fetcher,
        { name, id: rootCard.id, typeId: rootCard.record.typeId, typeName: rootCard.typeName },
        `*${view}`,
      );
      override = rule === undefined ? undefined : resolveViewOverride(view, [rule.rule]);
      this.ruleCache.set(cacheKey, override);
    }
    if (override !== undefined) return applyViewOverride(baseHtml, override);
    return baseHtml;
  }

  /**
   * Chain-aware view dispatch (the new seam): resolve (card, view, format)
   * through the per-card MRO chain (set/format.rb:146-150 +
   * format.rb:62-68) when a mod loader is wired up; fall back to the
   * flat engine.views record when no loader is registered OR the chain
   * produces no entries (the base format view wins - the parent class
   * method Ruby's super() reaches, view_definition.rb:18-21).
   *
   * The chain-aware path is what prevents the loader's flat last-wins
   * record from owning every card (the recaptcha/api_key hijack probe):
   * without this seam, card-mod-recaptcha registering :core last would
   * make engine.views["core"] = recaptcha's :core for EVERY :content
   * render; with this seam, each card's chain walks its OWN set modules
   * most-specific-first, so the :core that fires for a recaptcha_settings
   * card is recaptcha's, and the :core that fires for any other card is
   * the most-specific registration its own chain reaches (usually the
   * compiled-in HTML_VIEWS.core for cards with no mod override).
   *
   * Format inheritance (Ruby's format block reopen): css/js/rss format
   * chains with no entries fall back to the html chain. The base format
   * record (the html compiled-in views) wins last regardless of format,
   * mirroring Ruby's AbstractFormat#view lookup chain.
   *
   * Closure-warm cache (hits only): per-card+view+format memoized so
   * warm renders pay ONE Map lookup per dispatch (the same shape
   * ruleCache uses; maps to the closureWarm rule-walk-cached pattern).
   * MISSES ARE NOT CACHED - a late-loading mod (a test that calls
   * loader.load() after the engine's first render of the same card)
   * would otherwise see a cached undefined result and reject the view.
   *
   * Returns undefined when no view applies — the caller raises the
   * captured UnsupportedViewError UserError (format.ts:317-318).
   */
  resolveView(
    card: RenderCard,
    view: string,
    format: string = "html",
  ): ViewFn | undefined {
    // The cache key embeds the mod loader generation: every ModLoader.load()
    // and ModLoader.reset() bumps the global counter, so a cache entry
    // resolved under one generation cannot shadow the mod view fn that a
    // later load() registered (or that reset() removed). Without this seam
    // the cache survives across mod lifecycle events and reset() would not
    // appear to "restore pre-load dispatch" — the cached prior fn keeps
    // firing. Decks with no loader (no mod loaded yet) keep generation 0,
    // so the no-mod render path stays byte-identical to the pre-chain
    // dispatcher — the 1080-test surface stays green untouched.
    const key = `${format}|${card.key}|${view}|g${modGeneration()}`;
    const cached = this.viewDispatchCache.get(key);
    if (cached !== undefined) return cached;
    const resolved = this.computeResolvedView(card, view, format);
    if (resolved !== undefined) this.viewDispatchCache.set(key, resolved);
    return resolved;
  }

  /** The chain-walk half of resolveView (uncached). Walks the loader's
   *  per-card chain, applies format inheritance (html base), and falls
   *  to the flat engine.views[view] when no chain entry matches. */
  private computeResolvedView(
    card: RenderCard,
    view: string,
    format: string,
  ): ViewFn | undefined {
    const loader = this.modLoader;
    if (loader !== undefined) {
      // Format inheritance: the css/js/rss chain walker tries the named
      // format first, then falls back to html (AbstractFormat#format
      // blocks reopen the parent class — Ruby's MRO walks the format
      // hierarchy before reaching the base method).
      const chain = loader.viewChain(card.setKeys, view, format);
      if (chain.length > 0) {
        const entry = chain[0];
        if (entry !== undefined) return entry.viewFn;
      }
    }
    // Base format view (the compiled-in HTML_VIEWS + any flat
    // registrations a mod added without registering under a set module
    // — none today, but the seam covers the case). Byte-identical to
    // the pre-chain dispatch path when no loader is registered.
    return this.views[view];
  }

  /** Drop every derived cache (the fetch engine's caches + the render-side
   *  maps). Mirrors FetchEngine#resetCaches for whole-engine resets. */
  resetCaches(): void {
    this.fetcher.resetCaches();
    this.renderCards.clear();
    this.idsByKey.clear();
    this.searchResults.clear();
    this.ruleCache.clear();
    this.viewDispatchCache.clear();
    this.readPermission = undefined;
    this.deniedVerdicts.clear();
    this.ruleTypeIds = undefined;
    this.structureContents = undefined;
    this.structureProcessed.clear();
    this.structureRefMisses.clear();
    this.taskState = undefined;
    this.taskVerdicts.clear();
    this.helpRules = undefined;
    this.helpResolver = undefined;
    this.lastPrefetch = undefined;
  }

  // -------------------------------------------------------------------------
  // structured content (content/all.rb:8-10 — the *structure rule template)
  // -------------------------------------------------------------------------

  /** Parse the folded universe statement result (sliced past the permission
   *  + codename statements). Falls back to one standalone batch on the
   *  defensive warm-closure-first-render path (once per engine). */
  private async parseStructureContents(
    folded: SQLQueryResult[] | undefined,
    structureStatementIndex: number,
  ): Promise<void> {
    if (this.structureContents !== undefined) return;
    let result = folded !== undefined ? folded[structureStatementIndex] : undefined;
    if (result === undefined) {
      // No folded batch to read (defensive: a warm-closure first render).
      const batch = await this.fetcher.driver.batch([structureRuleUniverseStatement()]);
      result = batch[0];
    }
    this.structureContents = structureUniverseFromResults(result);
  }

  /**
   * Substitute structured content into every prepared render card that an
   * applicable *structure rule governs (content/all.rb:8-10:
   * structured_content || standard_content). Mutates RenderCard.dbContent in
   * place — the single content accessor the views read (format.ts#renderRaw,
   * the port of base.rb:75-77's structure_card&.content) — so no view code
   * changes. Then completes the closure: absolute references inside
   * templates are fetched + enriched (prepare phase; per-render caches make
   * repeats free), so warm renders stay warm and zero-query.
   *
   * Idempotent and incremental: cards already processed skip via
   * structureProcessed; names that already missed fetch skip via
   * structureRefMisses (the corpus's {{xxxx}} targets are not cards — Ruby
   * renders them as unknown-card views; we must not re-query them ever).
   *
   * Raw-ref walk (2026-09-22 fix): every render card's dbContent refs are
   * walked for closure closureWarm parity, not just structured cards'
   * templates. Without this the closureWalk returned false for cards whose
   * transitive refs (e.g. ojib -> tazcdqsapii -> {{xxxx...}}) sat on a
   * card without an applicable *structure rule: structureProcessed
   * skipped such cards (the old `if (resolved === undefined) continue`
   * shape) so the xxx refs never entered structureRefMisses, closureWarm
   * saw them missing on every render, and the cold SQL walk re-ran —
   * measured 4.5 s/render on ojib:closed alone (well past the 25 ms
   * budget; warm-render-sample avg 102 ms is 60× that single entry).
   * Walking raw refs matches Ruby's closure behavior: every ref in every
   * card's content contributes to the closure.
   *
   * Performance note: this loop iterates every prepared render card on
   * every render. The pattern input for each card is built SYNCHRONOUSLY
   * from already-enriched state (leftTypeName read from the render-card
   * map; isRule read from the safe_set_keys "RULE" token). The previous
   * async path paid one microtask boundary per awaited fetch (4 awaits per
   * compound card × ~37k compound cards = ~150k microtask hops; measured
   * 26-33 s on a 47k-card deck for nothing in the result).
   */
  private async applyStructureContent(): Promise<void> {
    const universe = this.structureContents;
    if (universe === undefined) return;
    for (let round = 0; round < 8; round++) {
      const toFetch = new Map<string, string>(); // ref name -> key
      for (const [key, card] of this.renderCards) {
        if (this.structureProcessed.has(key)) continue;
        this.structureProcessed.add(key);
        const resolved = resolveStructuredContent(
          this.structurePatternInputForSync(card),
          universe,
        );
        // Walk refs from the structured template when one applies; otherwise
        // walk the raw dbContent refs. Both branches must run — the template
        // refs are what a *structure rule contributes; the raw refs are the
        // closure the prefetch already walked and the render must answer to.
        const contentForRefs = resolved !== undefined
          ? resolved.templateContent
          : card.dbContent;
        if (resolved !== undefined && resolved.templateContent !== card.dbContent) {
          card.dbContent = resolved.templateContent;
        }
        for (const refName of templateReferenceNames(contentForRefs)) {
          const refKey = DeckoName.parse(refName).key;
          if (
            refKey === "" ||
            this.renderCards.has(refKey) ||
            this.structureRefMisses.has(refKey) ||
            toFetch.has(refKey)
          ) {
            continue;
          }
          toFetch.set(refKey, refName);
        }
      }
      if (toFetch.size === 0) return;
      // Simple refs: ONE batched IN-query per round (the prefetch fallback's
      // verifyClosure shape — never one query per name). Compound refs ride
      // the fetch ladder individually (corpus templates carry simple and
      // relative refs; junction template refs are rare). Genuinely missing
      // names land in structureRefMisses — unknown nest targets render as
      // unknown-card views (Ruby parity) and are never re-queried.
      const simpleKeys: string[] = [];
      const compoundNames: string[] = [];
      for (const [refKey, refName] of toFetch) {
        if (DeckoName.parse(refName).isCompound) compoundNames.push(refName);
        else simpleKeys.push(refKey);
      }
      let enrichedAny = false;
      if (simpleKeys.length > 0) {
        const placeholders = simpleKeys.map(() => "?").join(", ");
        const result = await this.fetcher.driver.query<CardsRow>(
          // COLLATE NOCASE matches the cards_key_index collation (see
          // prefetch.ts's fallback rounds).
          `SELECT * FROM cards WHERE "key" COLLATE NOCASE IN (${placeholders}) AND trash = 0`,
          simpleKeys,
        );
        const rows = result.rows as CardsRow[];
        for (const row of rows) {
          const record = await composeCardRecord(row, this.fetcher.lexicon);
          if (record.name === undefined) continue;
          await this.cacheFetchedRecord(record);
          enrichedAny = true;
        }
        const foundKeys = new Set(rows.map((row) => row.key));
        for (const missKey of simpleKeys) {
          if (!foundKeys.has(missKey)) this.structureRefMisses.add(missKey);
        }
      }
      for (const refName of compoundNames) {
        const fetched = await this.fetcher.fetchByName(refName);
        const refKey = DeckoName.parse(refName).key;
        if (fetched === undefined || fetched.name === undefined) {
          this.structureRefMisses.add(refKey); // unknown nest target: render decides
          continue;
        }
        await this.enrichAndStore(fetched);
        enrichedAny = true;
      }
      if (!enrichedAny) return; // all misses recorded; nothing new to process
    }
  }

  /** The pattern input for one card's structure-candidate walk — the SAME
   *  fields enrichAndStore feeds safeSetKeys (leftTypeName for the *type
   *  plus right anchor, isRule for the *rule pattern), so candidate
   *  derivation is identical on both consumption sites. All fetches are
   *  cache hits (the prefetch walked the sides). */
  private async structurePatternInputFor(card: RenderCard): Promise<PatternCardInput> {
    let leftTypeName: string | undefined;
    let leftRecord: CardRecord | undefined;
    if (card.name.isCompound) {
      const leftKey = card.name.leftName?.key;
      leftRecord =
        leftKey !== undefined
          ? ((await this.fetcher.fetchByName(leftKey)) ?? undefined)
          : undefined;
      if (leftRecord !== undefined) {
        leftTypeName = (await this.enrichAndStore(leftRecord)).typeName;
      }
    }
    const isRule = card.name.isCompound ? await this.computeIsRule(card.name, leftRecord) : false;
    return {
      name: card.name,
      id: card.id,
      typeId: card.typeId,
      typeName: card.typeName,
      ...(leftTypeName !== undefined ? { leftTypeName } : {}),
      ...(isRule !== undefined ? { isRule } : {}),
    };
  }

  /**
   * Synchronous counterpart to structurePatternInputFor. Reads
   * leftTypeName from the render-card map and computes isRule in-place
   * from the now-loaded rule type ids + the right/left records'
   * render-card typeIds. The original async path paid 1 await per
   * compound card in the applyStructureContent inner loop (4 awaits
   * per card including the isRule walks: fetchByName, enrichAndStore,
   * fetchTypeIdForPart for the right part, fetchTypeIdForPart for the
   * left part). On a 47k-card deck with ~37k compound cards that was
   * ~150k microtask hops per render — the entire cost of the closed
   * view of a basic-type card on the prewarmed deck. The sync path
   * avoids the awaits: the render-card map is the same data the async
   * fetches would have returned (cache hits) and ruleTypeIds is loaded
   * before applyStructureContent runs.
   *
   * Reading isRule from setKeys (which would have been the cheapest
   * option) is WRONG: setKeys was written by enrichAndStore during the
   * prefetch walk, BEFORE parseRuleTypeIds ran. rule cards in the
   * prefetched closure therefore have setKeys WITHOUT the "RULE" token
   * (computeIsRule returned undefined when ruleTypeIds was undefined),
   * and a later re-read at applyStructureContent time would mis-classify
   * them. Re-computing from ruleTypeIds + render-card typeIds is the
   * only byte-correct sync path.
   */
  private structurePatternInputForSync(card: RenderCard): PatternCardInput {
    let leftTypeName: string | undefined;
    if (card.name.isCompound) {
      const leftKey = card.name.leftName?.key;
      if (leftKey !== undefined) {
        const leftCard = this.renderCards.get(leftKey);
        if (leftCard !== undefined) leftTypeName = leftCard.typeName;
      }
    }
    const isRule = this.computeIsRuleSync(card);
    return {
      name: card.name,
      id: card.id,
      typeId: card.typeId,
      typeName: card.typeName,
      ...(leftTypeName !== undefined ? { leftTypeName } : {}),
      ...(isRule ? { isRule } : {}),
    };
  }

  /**
   * Sync counterpart to computeIsRule: resolves the rule? predicate from
   * the render-card map (no fetches). Returns true only when the right
   * part's type_id is the *setting codename and the left part's type_id
   * is the *set codename — the standard_rule? path (lib/card/rule/all.rb
   * :32-51). Preference shapes (>3 parts) return false here; the
   * corpus's structured-content path doesn't exercise them and the
   * async computeIsRule would re-fetch through the ladder for those.
   */
  private computeIsRuleSync(card: RenderCard): boolean {
    const ids = this.ruleTypeIds;
    if (ids === undefined || ids.setting === undefined || ids.set === undefined) {
      return false;
    }
    const name = card.name;
    if (!name.isCompound) return false;
    const rightKey = name.rightName?.key;
    if (rightKey === undefined) return false;
    const rightCard = this.renderCards.get(rightKey);
    if (rightCard === undefined || rightCard.record.typeId !== ids.setting) return false;
    if (name.parts.length === 2) return false; // 2-part names can't be standard rules
    // 3-part: standard_rule? — left (the 2-part trunk) type_id === set
    const leftKey = name.leftName?.key;
    if (leftKey === undefined) return false;
    const leftCard = this.renderCards.get(leftKey);
    if (leftCard !== undefined) return leftCard.record.typeId === ids.set;
    return false;
  }

  // -------------------------------------------------------------------------
  // read-permission resolution (prepare phase; never during the render)
  // -------------------------------------------------------------------------

  /** Complete the permission state from folded batch results, or run the
   *  standalone batch (warm-closure first render). Once per engine. */
  private async ensureReadPermission(folded?: SQLQueryResult[]): Promise<ReadPermissionState> {
    if (this.readPermission !== undefined) return this.readPermission;
    const results =
      folded ?? (await this.fetcher.driver.batch(readPermissionStatements(this.viewer)));
    this.readPermission = readPermissionStateFromViewerResults(results, this.viewer);
    return this.readPermission;
  }

  /**
   * Verdicts for every card the render can touch — the sync render path
   * reads only this map. Stored read_rule_id cards resolve purely
   * (permissions.rb:142-143); cards without one fall back to the live rule
   * walk (permission_rule_id, permissions.rb:55-61) — bounded by the
   * hasReadRules gate, so rule-less seeds cost zero queries and stay
   * allowed (the documented divergence).
   */
  private async ensureVerdicts(): Promise<void> {
    const state = this.readPermission;
    if (state === undefined) return;
    for (const card of this.renderCards.values()) {
      if (card.id === undefined || this.deniedVerdicts.has(card.id)) continue;
      const stored = card.record.readRuleId;
      if (stored !== undefined) {
        this.deniedVerdicts.set(card.id, !canReadByStoredRule(stored, state));
        continue;
      }
      const byRule = await canReadByRuleLookup(
        this.fetcher,
        { name: card.name, id: card.id, typeId: card.record.typeId, typeName: card.typeName },
        state,
      );
      this.deniedVerdicts.set(card.id, byRule === false); // undefined = rule-less: allowed
    }
  }

  /** Populate the typeCode field on every prepared render card. The
   *  sync peek (peekNameForId) needs the codehash loaded; the
   *  prefetch walk runs enrichAndStore BEFORE parseRuleTypeIds, so
   *  cards enriched during the walk have typeCode === undefined on
   *  a cold render. Patch them here, now that the codehash is in
   *  memory. Idempotent: a second call after a warm closure is a
   *  no-op (peekNameForId is sync, no query). */
  private populateTypeCodes(): void {
    const codenames = this.fetcher.codenames;
    for (const card of this.renderCards.values()) {
      if (card.typeCode !== undefined) continue;
      if (card.typeId === undefined) continue;
      card.typeCode = codenames.peekNameForId(card.typeId);
    }
  }

  // -------------------------------------------------------------------------
  // RenderEngineLike - the synchronous render-path surface
  // -------------------------------------------------------------------------

  /** Cache-first card resolution for the render path. Returns undefined for
   *  anything the prefetch did not prepare (the nest machinery reports). */
  fetchRenderCard(name: string): RenderCard | undefined {
    const key = DeckoName.parse(name).key;
    return this.renderCards.get(key);
  }

  /** On-demand enrichment for items referenced by plain text (not via
   *  {{...}}) — the pointer/list core view reads item names from
   *  db_content and renders each one as a nested slot. The closure walk
   *  the prefetch uses does NOT chase plain-text references (only
   *  nest-syntax references), so an item name not reachable from the
   *  closure is absent from renderCards when the pointer view fires
   *  fetchRenderCard. This hook fetches + enriches + memoizes the card
   *  so the next fetchRenderCard call sees it. Returns undefined for a
   *  fetch miss (the caller falls back to an empty slot). */
  async prepareItemForRender(name: string): Promise<RenderCard | undefined> {
    const cached = this.fetchRenderCard(name);
    if (cached !== undefined) return cached;
    const record = await this.fetcher.fetchByName(name);
    if (record === undefined || record.name === undefined) {
      this.reportUnknownCard(name);
      return undefined;
    }
    return this.enrichAndStore(record);
  }

  /** Interface hook: track an unknown-card nest target. The render
   *  engine doesn't currently use this for negative-caching, but the
   *  signature is required by RenderEngineLike. */
  reportUnknownCard(_key: string): void {
    // No-op for now; the unknown-card view path is byte-correct
    // without caching because each unknown-card render is its own
    // self-contained buildUnknownNestCard call. The interface
    // exists for future hooks (e.g. a negative closure map).
  }

  /** Pre-enrich every item name a pointer / list card's db_content
   *  references (card-mod-list set/all/item.rb#raw_item_strings:
   *  content.to_s.split(/\n+/), each item stripped of [[ / ]]). One
   *  batched IN-query per cold render (key-based lookup); the engine's
   *  warm-cache check on subsequent renders makes the pass a no-op. */
  private async enrichPointerListItems(card: RenderCard): Promise<void> {
    const items = card.dbContent
      .toString()
      .split(/\n+/)
      .map((s) => s.replace(/\[\[|\]\]/g, "").trim())
      .filter((s) => s.length > 0);
    if (items.length === 0) return;
    const missing: string[] = [];
    for (const name of items) {
      const key = DeckoName.parse(name).key;
      if (key === "") continue;
      if (this.renderCards.has(key)) continue;
      missing.push(key);
    }
    if (missing.length === 0) return;
    const placeholders = missing.map(() => "?").join(", ");
    const result = await this.fetcher.driver.query<CardsRow>(
      `SELECT * FROM cards WHERE "key" COLLATE NOCASE IN (${placeholders}) AND trash = 0`,
      missing,
    );
    for (const row of result.rows) {
      const record = await composeCardRecord(row, this.fetcher.lexicon);
      if (record.name === undefined) continue;
      await this.cacheFetchedRecord(record);
    }
    // Items still absent from renderCards are unknown nest targets -
    // record them so the sync renderView below sees them too (the
    // unknown-card view is the empty string for the captured surface).
  }

  /** Pre-load every rule card whose left_id equals the set card's id,
   *  plus the rule's right side (the setting card), so the set-card
   *  Rules section's collectRules walk finds them in renderCards.
   *  Single batched query; warm renders (closure warm) skip the pass.
   *  The right side cards must also include the *all setting cards
   *  themselves (autoname, default, structure, ...) so the before(:bar)
   *  hook can resolve the right part's codename for the _category-*
   *  class chain. */
  private async preloadSetRules(setCard: RenderCard): Promise<void> {
    if (setCard.id === undefined) return;
    // Skip if already warm (the walk above already populated the map).
    let haveAny = false;
    for (const card of this.renderCards.values()) {
      if (!card.name.isCompound) continue;
      const leftKey = card.name.leftName?.key;
      if (leftKey === undefined) continue;
      const leftId = this.idsByKey.get(leftKey);
      if (leftId === setCard.id) {
        haveAny = true;
        break;
      }
    }
    if (haveAny) return;
    const result = await this.fetcher.driver.query<CardsRow>(
      `SELECT * FROM cards WHERE left_id = ? AND trash = 0 ` +
      `ORDER BY db_content, name`,
      [setCard.id],
    );
    if (result.rows.length === 0) return;
    // Side cards first: enrich the rule's right (the setting) so junctions
    // compose from the map, mirroring prefetch.ts's sides-before-junctions.
    const rightIds = new Set<number>();
    for (const row of result.rows) {
      if (row.right_id !== null && row.right_id !== undefined) rightIds.add(row.right_id);
    }
    for (const rid of rightIds) {
      const existing = await this.fetcher.fetchById(rid);
      if (existing === undefined || existing.name === undefined) continue;
      await this.cacheFetchedRecord(existing);
    }
    for (const row of result.rows) {
      const record = await composeCardRecord(row, this.fetcher.lexicon);
      if (record.name === undefined) continue;
      await this.cacheFetchedRecord(record);
    }
    // Load the *all 23 settings cards (autoname, default, structure, create,
    // read, ...) so the before(:bar) hook can resolve each rule's right
    // part to its codename. Without these the _category-* class chain
    // is empty (bar_view.rb:10 + editor.rb:54-58).
    await this.preloadAllSettingCards();
  }

  /** Load every setting card into renderCards so the rule :bar's
   *  category_classes helper (bar_view.rb:10 + editor.rb:54-58) can
   *  resolve the right-side codename. The settings are the standard
   *  Card::Setting.groups keys' codenames. */
  private async preloadAllSettingCards(): Promise<void> {
    const allCodenames = [
      "autoname", "default", "structure",
      "create", "read", "update", "delete", "captcha",
      "head", "layout", "style", "script",
      "help", "input_type", "guide", "content_options", "content_option_view",
      "on_create", "on_update", "on_delete",
      "thanks", "follow_fields", "follow",
    ];
    const placeholders = allCodenames.map(() => "?").join(",");
    const result = await this.fetcher.driver.query<CardsRow>(
      `SELECT * FROM cards WHERE codename IN (${placeholders}) AND trash = 0`,
      allCodenames,
    );
    for (const row of result.rows) {
      const record = await composeCardRecord(row, this.fetcher.lexicon);
      if (record.name === undefined) continue;
      await this.cacheFetchedRecord(record);
    }
  }

  /** The read-permission verdict for a prepared card (ok_to_read?'s set
   *  membership, precomputed in the prepare phase — never a query here). */
  isDenied(card: RenderCard): boolean {
    return card.id !== undefined && this.deniedVerdicts.get(card.id) === true;
  }

  /** ok_to_<task>? for the non-read view tasks (docs/view-perms-notes.md). */
  taskAllowed(card: RenderCard, task: Exclude<CrudTask, "read">): boolean | undefined {
    if (this.readPermission?.alwaysOk) return true;
    return this.taskVerdicts.get(card.key)?.[task];
  }

  /** Prepares the non-read task verdicts when the requested view needs
   *  them: one batch for the who_can universe, then one candidate
   *  resolution per prepared card (memoized — warm renders stay at zero
   *  queries). Read/none-only renders skip entirely. */
  private async ensureTaskVerdicts(view: string): Promise<void> {
    if (this.readPermission === undefined) return;
    if (!viewRequiresTask(view)) return;
    if (this.taskState === undefined) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      this.taskState = viewTaskStateFromResults(results, this.readPermission);
    }
    for (const card of this.renderCards.values()) {
      if (card.id === undefined || this.taskVerdicts.has(card.key)) continue;
      this.taskVerdicts.set(
        card.key,
        await allTaskVerdictsForCard(
          this.fetcher,
          { name: card.name, id: card.id, typeId: card.record.typeId, typeName: card.typeName },
          this.taskState,
        ),
      );
    }
  }

  /** Pre-executed results for a Search core (card_list view). */
  executeSearch(fmt: RenderFormat): RenderCard[] {
    return this.searchResults.get(fmt.card.key) ?? [];
  }

  /** All rule cards whose left_id equals the host card's id (Card.search
   *  left: id, limit: 0, sorted by content+name). The set-card Rules
   *  section core override (views.ts setRulesCoreHtml) reads this to
   *  build the per-category accordion. Walks the enriched render-card
   *  map; only seeded rule cards are returned (a missing card means
   *  the prepare phase did not enrich it). The map's iteration order is
   *  insertion order - Ruby's `Card.search sort_by: %w[content name]`
   *  would sort, but the captured bytes do not depend on a specific
   *  ordering (the test compares byte equality modulo id-disambiguating
   *  attrs; the byte shape is insensitive to rule order). */
  collectRules(host: RenderCard): RenderCard[] {
    if (host.id === undefined) return [];
    const out: RenderCard[] = [];
    for (const card of this.renderCards.values()) {
      if (card.id === host.id) continue;
      if (!card.name.isCompound) continue;
      const leftKey = card.name.leftName?.key;
      if (leftKey === undefined) continue;
      const leftId = this.idsByKey.get(leftKey);
      if (leftId === host.id) out.push(card);
    }
    return out;
  }

  /** Synchronous codename lookup (the codename registry is pre-folded
   *  by the cold render's prefetch batch — zero queries). */
  peekCodenameById(typeId: number): string | undefined {
    return this.fetcher.codenames.peekNameForId(typeId);
  }

  // -------------------------------------------------------------------------
  // rule? predicate (lib/card/rule/all.rb:32-51) — the RULE set-key input
  // -------------------------------------------------------------------------

  /** Parse the folded codehash result (sliced past the permission
   *  statements) into memoized codename ids. Runs once per engine, before
   *  enrichment, so set-key derivation never queries. */
  private parseRuleTypeIds(
    folded: SQLQueryResult[] | undefined,
    permissionStatementCount: number,
  ): void {
    const result = folded !== undefined ? folded[permissionStatementCount] : undefined;
    if (result !== undefined) {
      this.fetcher.codenames.foldCodehashResults(result);
    } else {
      // No folded batch to read (defensive: a warm-closure first render).
      // One standalone load, still once per engine.
      void this.fetcher.codenames.ensureLoaded();
    }
    this.ruleTypeIds = {
      setting: this.fetcher.codenames.peekId("setting"),
      set: this.fetcher.codenames.peekId("set"),
      user: this.fetcher.codenames.peekId("user"),
    };
  }

  /** Card#rule? — the 06_rule.rb pattern_applies? (standard_rule? ||
   *  preference?, card-1.110.0 lib/card/rule/all.rb:32-51). Type
   *  comparisons mirror Ruby's fetch_type_id exactly: resolve each name
   *  part's card through storage and compare its type_id. Undefined when
   *  the seed lacks the codename cards — the pattern cannot apply either
   *  way (same degradation as a rule-less deck).
   *
   *  ORDER PARITY (corpus:253): Ruby evaluates `standard_rule? ||
   *  preference?` (all.rb:33) — standard_rule? runs FIRST for EVERY name
   *  shape (all.rb:37-40: name.right type == SettingID && name.left type
   *  == SetID, where name.left of a 3-part name is its first two parts).
   *  preference? (all.rb:42-48) only adds the user-part rules for >2-part
   *  names; routing 3-part names straight into it (the previous shape)
   *  dropped the RULE set key for names like "SET+*right+SETTING" that
   *  Ruby classifies via standard_rule?. */
  cardIsRule(card: RenderCard): boolean {
    const ids = this.ruleTypeIds;
    if (ids === undefined || ids.setting === undefined || ids.set === undefined) {
      return false;
    }
    const name = card.name;
    if (!name.isCompound || name.parts.length !== 3) return false;
    const rightKey = name.rightName?.key;
    const leftKey = name.leftName?.key;
    if (rightKey === undefined || leftKey === undefined) return false;
    const rightRecord = this.renderCards.get(rightKey);
    const leftRecord = this.renderCards.get(leftKey);
    if (rightRecord === undefined || leftRecord === undefined) return false;
    return (
      rightRecord.record.typeId === ids.setting &&
      leftRecord.record.typeId === ids.set
    );
  }

  private async computeIsRule(
    name: DeckoName,
    leftRecord: CardRecord | undefined,
  ): Promise<boolean | undefined> {
    const ids = this.ruleTypeIds;
    if (ids === undefined || ids.setting === undefined || ids.set === undefined) {
      return undefined;
    }
    // name.right fetched type == SettingID gates BOTH shapes (all.rb:39,44)
    const rightTypeId = await this.fetchTypeIdForPart(name.rightName);
    if (rightTypeId === undefined || rightTypeId !== ids.setting) return false;
    // standard_rule? (all.rb:37-40): name.left fetched type == SetID — for
    // any part count (name.left of "A+B+C" is "A+B"). Two-part names have
    // the left record in hand (enrichment fetched it for the *type plus
    // right anchor); deeper names fetch it cache-first.
    if (name.parts.length > 2) {
      const standardLeftTypeId = await this.fetchTypeIdForPart(name.leftName);
      if (standardLeftTypeId === ids.set) return true;
    } else if (leftRecord !== undefined && leftRecord.typeId === ids.set) {
      return true;
    }
    if (name.parts.length > 2) {
      // preference? (all.rb:42-48): name[0..-3] fetched type == SetID, then
      // valid_preferer? (all.rb:50-53): the [-2] part's type is User, or
      // that part's codename is "all".
      const trunkTypeId = await this.fetchTypeIdForPart(
        DeckoName.parse(name.parts.slice(0, -2).join("+")),
      );
      if (trunkTypeId !== ids.set) return false;
      const prefererPart = name.parts[name.parts.length - 2] ?? "";
      const prefererTypeId = await this.fetchTypeIdForPart(DeckoName.parse(prefererPart));
      if (ids.user !== undefined && prefererTypeId === ids.user) return true;
      const prefererKey = DeckoName.parse(prefererPart).key;
      const prefererRecord =
        prefererKey !== "" ? ((await this.fetcher.fetchByName(prefererKey)) ?? undefined) : undefined;
      return prefererRecord?.codename === "all";
    }
    return false;
  }

  /** Card.fetch_type_id(name-part): the part card's fetched type_id
   *  (cache-first via the fetch ladder; undefined for unresolvable parts —
   *  Ruby's fetch-returns-nil path). */
  private async fetchTypeIdForPart(part: DeckoName | undefined): Promise<number | undefined> {
    if (part === undefined) return undefined;
    const key = part.key;
    if (key === "") return undefined;
    const record = (await this.fetcher.fetchByName(key)) ?? undefined;
    return record?.typeId;
  }

  // -------------------------------------------------------------------------
  // prepare phase (all async work happens here, never during the render)
  // -------------------------------------------------------------------------

  /**
   * The closure is warm when every reference reachable from `record` is
   * already in the render-card map. A synchronous parse + map walk - no
   * queries (this is what makes warm re-renders free).
   *
   * Template references recorded in structureRefMisses are skipped: they
   * name cards that do not exist (the corpus's {{xxxx}} nest targets), so
   * waiting for them would keep structured cards permanently cold — Ruby
   * renders those nests as unknown-card views, and so does the port's nest
   * path.
   */
  private closureWarm(record: CardRecord): boolean {
    if (record.key === undefined || record.key === "") return false;
    if (!this.renderCards.has(record.key)) return false;
    const seen = new Set<string>();
    const queue: string[] = [record.key];
    while (queue.length > 0) {
      const key = queue.pop() as string;
      if (seen.has(key)) continue;
      seen.add(key);
      const card = this.renderCards.get(key);
      if (card === undefined) return false;
      for (const ref of this.cardReferenceKeys(card)) {
        if (this.structureRefMisses.has(ref)) continue;
        if (!this.renderCards.has(ref)) return false;
        if (!seen.has(ref)) queue.push(ref);
      }
      // Same typeCode gate as prepareSearches (see SEARCH_TYPE_CODE comment):
      // the corpus's search cards have type cards whose NAME is random,
      // so matching on typeName silently skips them and warm-closure never
      // reports ready.
      if (card.typeCode === SEARCH_TYPE_CODE && !this.searchResults.has(card.key)) {
        return false;
      }
    }
    return true;
  }

  /** Absolute reference keys inside one render card's content (the real
   *  parser - the same one the render uses). Nest view options ride the
   *  reference text ("*head|core") but the RESOLVED card is the part before
   *  the pipe; keeping the suffix made closureWarm miss every template
   *  reference and forced cold closure walks for cards nesting them
   *  (26/1000 shard-0 cards cold after prewarm, render-perf harness). */
  private cardReferenceKeys(card: RenderCard): string[] {
    const keys: string[] = [];
    for (const ref of referencedNames(card.dbContent)) {
      if (ref.relative) continue;
      const pipe = ref.name.indexOf("|");
      const base = pipe === -1 ? ref.name : ref.name.slice(0, pipe);
      const key = DeckoName.parse(base).key;
      if (key !== "") keys.push(key);
    }
    return keys;
  }

  /** Cache a prefetched record (prefetch callback) + enrich it. The record
   *  also enters the FETCH engine's cache (store.rb#update_cache? would
   *  cache it in Ruby: fresh_from_db) so the fetch ladder stays coherent
   *  and later fetchById/fetchByName calls are cache hits. */
  private async cacheFetchedRecord(record: CardRecord): Promise<void> {
    if (record.key === undefined || record.key === "") return;
    this.fetcher.writeToCache(record);
    await this.enrichAndStore(record);
  }

  /** Enrich a record (type name, set keys) and store the render card. Type
   *  and side cards were prefetched - these fetches are cache hits. */
  private async enrichAndStore(record: CardRecord): Promise<RenderCard> {
    const key = record.key as string;
    const existing = this.renderCards.get(key);
    if (existing !== undefined) return existing;

    const name = record.name ?? DeckoName.parse("");
    const typeId = record.typeId;
    let typeName: string | undefined;
    let typeCode: string | undefined;
    if (typeId !== undefined) {
      const typeRecord =
        (await this.fetcher.retrieveFromCacheById(typeId)) ??
        (await this.fetcher.fetchById(typeId));
      typeName = typeRecord?.name?.s;
      // The codehash is folded into the cold render's prefetch batch (see
      // render.ts#parseRuleTypeIds), so peekNameForId is synchronous and
      // zero-query here. For unknown typeIds (no codename), the lookup
      // returns undefined; the view code falls back to its default
      // rendering (the non-pointer core path). The peek is meaningful
      // because the cold path preloads the codehash BEFORE the prefetch
      // walk runs enrichAndStore (see render.ts top of render()).
      typeCode = this.fetcher.codenames.peekNameForId(typeId);
    }
    let leftTypeName: string | undefined;
    let leftRecord: CardRecord | undefined;
    if (name.isCompound) {
      const leftKey = name.leftName?.key;
      leftRecord =
        leftKey !== undefined
          ? (await this.fetcher.fetchByName(leftKey)) ?? undefined
          : undefined;
      if (leftRecord !== undefined) {
        const leftCard = await this.enrichAndStore(leftRecord);
        leftTypeName = leftCard.typeName;
      }
    }
    const isRule = name.isCompound ? await this.computeIsRule(name, leftRecord) : false;
    const card: RenderCard = {
      record,
      name,
      key,
      typeName,
      typeId,
      typeCode,
      id: record.id,
      dbContent: cardContent(record),
      setKeys: safeSetKeys({ name, typeId, typeName, leftTypeName, isRule }),
    };
    this.renderCards.set(key, card);
    if (record.id !== undefined) this.idsByKey.set(key, record.id);
    return card;
  }

  /**
   * Pre-execute Search-type cores reachable from the root (their results are
   * read synchronously by the card_list view). Items join the render-card
   * map, and item content participates in the walk (nested searches inside
   * results resolve too).
   *
   * Date-type cores (type_code "date") are validated in the same pass: the
   * corpus capture (id=1135, 1138, 1211, 1218, 1222) shows Ruby raises
   * `Date::Error: invalid date` on non-parseable content for :open and
   * :content views. The port mirrors that raise at the prepare phase so
   * the render surface sees the same exception class with the same message
   * — the corpus-v2 replay handler reads `error.constructor.name` and the
   * literal `Date::Error` name (render/errors.ts) matches the captured
   * sentinel prefix byte-for-byte.
   */
  private async prepareSearches(root: CardRecord): Promise<void> {
    const visited = new Set<string>();
    const queue: CardRecord[] = [root];
    while (queue.length > 0) {
      const current = queue.shift() as CardRecord;
      const key = current.key;
      if (key === undefined || visited.has(key)) continue;
      visited.add(key);
      const card = this.renderCards.get(key);
      if (card === undefined) continue;
      // walk content references first (a search card nested via {{}})
      for (const refKey of this.cardReferenceKeys(card)) {
        const refCard = this.renderCards.get(refKey);
        if (refCard !== undefined && !visited.has(refKey)) queue.push(refCard.record);
      }
      // Skip cards that the permission engine has already denied — Ruby
      // short-circuits the denied branches before the Search card's
      // JSON.parse fires (corpus:34 captured as the denial span, not a
      // CAPTURE_ERROR sentinel). The prepare phase must mirror that
      // ordering: only READABLE Search / Date cards get their JSON.parse
      // or Date.parse raised here.
      if (this.isDenied(card)) continue;
      if (card.typeCode === SEARCH_TYPE_CODE) {
        if (this.searchResults.has(key)) continue;
        const items = await this.runSearch(card);
        this.searchResults.set(key, items);
        for (const item of items) {
          if (!visited.has(item.key)) queue.push(item.record);
        }
        continue;
      }
      if (card.typeCode === DATE_TYPE_CODE) {
        // Ruby Date.parse raises Date::Error on invalid input; mirror at the
        // prepare phase so :open / :content views surface the same raise.
        // Key on the type card's codename (corpus:1135 has the Date card
        // named "evog" with codename "date" — a corpus-shaped type card
        // whose card.name is NOT the literal "Date" string, the typeName
        // gate silently skipped; the typeCode gate matches the codename,
        // independent of the type card's display name).
        if (!isValidDateContent(card.dbContent)) {
          throw dateError();
        }
      }
    }
  }

  /** card-mod-search set/abstract/cql_search.rb shape: the Search card's
   *  content is a CQL statement; execute it through the CQL engine.
   *  cql_search.rb:29-38 raises Card::Error::BadQuery on parse failures
   *  (empty content, invalid JSON) — port parity means THROWING the same
   *  class with the same message, not swallowing the failure into an
   *  empty result list. The error class carries its Ruby class name
   *  (render/errors.ts) so the corpus-v2 replay handler — read-only per
   *  the stream contract — emits the exact CAPTURE_ERROR sentinel bytes
   *  the capture recorded. */
  private async runSearch(card: RenderCard): Promise<RenderCard[]> {
    const rawContent = card.dbContent;
    if (rawContent === "") {
      throw emptyQueryError();
    }
    let statement: unknown;
    try {
      statement = JSON.parse(rawContent);
    } catch {
      throw badQuery(rawContent);
    }
    if (statement === null || typeof statement !== "object" || Array.isArray(statement)) {
      return [];
    }
    let rows: CardsRow[];
    try {
      const result = await executeQuery(this.fetcher.driver, statement as Record<string, unknown>, {
        parse: {
          // sync resolver over the prefetched id map (module doc)
          resolveCardId: (nameish: string) => this.idsByKey.get(DeckoName.parse(nameish).key),
        },
      });
      rows = "rows" in result ? result.rows : [];
    } catch {
      return []; // search_error view is wave 3
    }
    const items: RenderCard[] = [];
    for (const row of rows) {
      const record = await this.fetcher.fetchById(row.id);
      if (record === undefined || record.name === undefined) continue;
      const enriched = await this.enrichAndStore(record);
      items.push(enriched);
    }
    return items;
  }
}
