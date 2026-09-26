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
import { CodenameNotFoundError, NameNotFoundError } from "./name/errors.js";
import { FetchEngine } from "./fetch.js";
import { cardContent, composeCardRecord, type CardRecord } from "./fetch/card-record.js";
import { executeQuery } from "../cql/execute.js";
import { findRule } from "./rules/lookup.js";
import { ruleNamesForCard } from "./set-patterns/rule-names.js";
import { applyViewOverride, resolveViewOverride } from "./rules/apply.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  resolveStructuredContent,
  templateReferenceNames,
  defaultRuleUniverseStatement,
  structureRuleTypesFromResults,
  DEFAULT_SETTING_NAME,
} from "./rules/structure.js";
import type { CardsRow } from "../server/schema.js";
import {
  RenderFormat,
  RUBY_MAX_DEPTH,
  UnsupportedViewError,
  type RenderCard,
  type RenderEngineLike,
  type ViewFn,
} from "./render/format.js";
import { HTML_VIEWS, SETTING_GROUPS, GROUP_TO_SETTINGS } from "./render/views.js";
import {
  ModLoader,
  getDefaultModLoader,
  modGeneration,
} from "./mod-loader.js";
import {
  badQuery,
  dateError,
  emptyQueryError,
  isValidDateContent,
  BAD_QUERY_CLASS_NAME,
} from "./render/errors.js";
import {
  prefetchInclusionClosure,
  type PrefetchStats,
} from "./render/prefetch.js";
import { safeSetKeys } from "./render/set-keys.js";
import { referencedNames } from "./render/nest-syntax.js";
import type { PatternCardInput } from "./set-patterns/types.js";
import { PATTERN_TABLE } from "./set-patterns/registry.js";
import type { SettingClassWithRules } from "./render/format.js";
import {
  readPermissionStatements,
  readPermissionStateFromViewerResults,
  canReadByStoredRule,
  canReadByRuleLookup,
  ANONYMOUS_VIEWER,
  anonymousIdFromResults,
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
export type { SettingClassWithRules } from "./render/format.js";

const SEARCH_TYPE_CODE = "search_type";
/** The codename of the Set cardtype (Type::Set includes Type::SearchType,
 *  card-mod-rules set/type/set.rb — set-typed cards answer item_type_id
 *  through Abstract::CqlSearch's parse exactly like search-type cards). */
const SET_TYPE_CODE = "set";
/** The codename of the Cardtype cardtype (right_type_options gate). */
const CARDTYPE_TYPE_CODE = "cardtype";
/** The four permission settings whose right-side set modules include
 *  Abstract::Permission (card-mod-permissions set/right/*.rb) — the
 *  options-gate's excluded host class. */
const PERMISSION_RIGHT_CODENAMES: ReadonlySet<string> = new Set([
  "read",
  "create",
  "update",
  "delete",
]);
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

/** The views whose Ruby view method PARSES (the lazy Search/Date raise
 *  boundary's gate — src/card/render.ts resolveView). Capture census over
 *  all 105 corpus search-type cards: :open/:content = 24 CAPTURE_ERROR +
 *  80 real each; :closed/:title = 105 real each (Ruby never parses them);
 *  date likewise (corpus:1135 :open/:content raise, :closed/:title real). */
const PARSE_DISPATCH_VIEWS = new Set(["open", "content"]);

/** The set of patterns a setting card's children can carry (card-mod-rules
 *  set/type/setting.rb#set_classes_with_rules + card-mod-rules
 *  set/type/setting/core.haml:1-12): every rule whose right part is the
 *  setting's name is bucketed under one of these classes, in this order.
 *  The *rule / *star / *rstar patterns are excluded — they don't classify
 *  setting children. The lookup order (PATTERN_TABLE) is preserved so the
 *  rendered per-pattern groups match Ruby's `klass.to_s` ordering. */
const SETTING_CLASSES = PATTERN_TABLE.filter(
  (spec) => spec.code !== "rule" && spec.code !== "star" && spec.code !== "rstar",
);

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
  /** Search cards whose cql_search parse raised, by card key -> the error
   *  the dispatched view re-raises. Ruby's parse fires INSIDE the view
   *  method of the dispatched card (card-mod-search set/abstract/
   *  cql_search.rb:29-38) — never at prefetch scope — so the prepare walk
   *  records the failure and the DISPATCH boundary re-raises it, view-
   *  gated: the capture census pins search :open/:content as CAPTURE_ERROR
   *  (24 each) while :closed/:title are real bytes (105/105 each), i.e.
   *  Ruby only parses the result-rendering views. Cleared on resetCaches(). */
  private searchFailures = new Map<string, Error>();
  /** Resolved options cards by host key (the options-card parse boundary's
   *  rule walk). `has(key) === true` means resolved; the value is the
   *  resolved options card, or undefined when the walk stopped without one
   *  (right_type_options virtual card / nothing found). Warm re-renders pay
   *  one Map lookup. Cleared on resetCaches(). */
  private optionsCardCache = new Map<string, RenderCard | undefined>();
  /** Set-host rules-editor chain memoization (the set-host options-chain
   *  gate's per-host cache — separate from optionsCardCache because the
   *  value type is the failing content string, not a RenderCard).
   *  Warm re-renders of the same set host pay ONE Map lookup. Cleared on
   *  resetCaches(). */
  private setHostChainCache = new Map<string, string | undefined>();
  /** Read-permission state for the engine's viewer (the Anonymous corpus
   *  actor) — the port of Auth.as_card.read_rules_hash. Resolved lazily on
   *  the first render, folded into the prefetch batch so a cold render
   *  stays ONE round trip; undefined until then. Cleared on resetCaches(). */
  private readPermission: ReadPermissionState | undefined;
  /** card id -> denied verdict (the pure half of ok_to_read?). Computed in
   *  the prepare phase so the synchronous render path never queries.
   *  Cleared on resetCaches(). */
  private deniedVerdicts = new Map<number, boolean>();
  /** card key -> denied verdict for ID-LESS cards — the virtual cards
   *  (states.rb#virtual?) the fetch layer synthesizes for orphan junction
   *  names: no row, no id, but full view-permission semantics. Keyed by the
   *  canonical key because multiple virtual cards share no id space (the
   *  prefetch walk's -1 root placeholder is intercepted in render(), so
   *  every verdict here belongs to exactly one name). Cleared on
   *  resetCaches(). */
  private deniedVerdictsByKey = new Map<string, boolean>();
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
  /** The *default rule universe (composed rule key -> the rule card's own
   *  type_id) — round 9's new-child template machinery. Ruby resolves a
   *  nest-miss child (format/nest/fetch.rb#new_card -> Card.fetch new:) to
   *  the *default rule card's TYPE (mod/core/set/all/type.rb:78-80
   *  type_id_from_template -> template&.type_id; for a new card the
   *  template IS the *default rule card, card-mod-content templating.rb
   *  new_card_template). The raw-oracle pins the rendered shape: absent
   *  "+Discussion" children carry data-card-type-id=3 (RichText — the
   *  discussion+*right+*default rule card's type). Rides the same cold
   *  batch as the structure universe (one statement, +0 round trips).
   *  Cleared on resetCaches(). */
  private defaultRuleTypes: Map<string, number> | undefined;
  /** type_id -> type card NAME for the *default universe's referenced types
   *  (the data-card-type-name attribute + safeSetKeys TYPE anchor input for
   *  the new-child card). One batched id query, once per engine. Cleared on
   *  resetCaches(). */
  private defaultTypeNameById: Map<number, string> | undefined;
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
        // resolution reads it as pure memory afterwards) + the *default rule
        // universe (the new-child type source, same statement shape). Both
        // Appended LAST: the permission state parser reads folded results by
        // fixed index, and parseStructureContents slices past the permission
        // + codename statements to find the pair in order.
        ...(structureCold
          ? [structureRuleUniverseStatement(), defaultRuleUniverseStatement()]
          : []),
      ];
      const stats = await prefetchInclusionClosure(record, {
        driver: this.fetcher.driver,
        lexicon: this.fetcher.lexicon,
        cacheRecord: (cached) =>
          // Virtual-card root: the prefetch's recordToRawRow placeholders an
          // id-less record as id -1; storing that record would poison the
          // fetch cache and idsByKey with a fake id (and collide every
          // virtual card's verdict under one map key). Re-enrich the
          // PRISTINE id-less record instead — same key, undefined id — and
          // let the -1 row dissolve (enrichAndStore's existing-key guard
          // keeps the map entry pristine).
          cached.id === -1 && record.id === undefined && cached.key === record.key
            ? this.enrichAndStore(record).then(() => undefined)
            : this.cacheFetchedRecord(cached),
        ...(coldStatements.length > 0 ? { additionalStatements: coldStatements } : {}),
      });
      this.lastPrefetch = stats;
      foldedResults = stats.additionalResults;
      // The rule ids must be memoized BEFORE enrichment: enrichAndStore
      // computes set keys (the RULE pattern's applies?) synchronously from
      // them. Sliced past the permission statements the batch also carried.
      if (ruleTypesCold) await this.parseRuleTypeIds(foldedResults, permissionStatements.length);
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
    // accessor; templating.rb#structure). On every first-render path this
    // also parses the *default universe (folded, or the defensive standalone
    // batch), so the new-child type preload below can run right after.
    await this.applyStructureContent();
    await this.preloadDefaultTypeNames();
    // Read-permission verdicts for the closure MUST be computed BEFORE
    // prepareSearches — the Ruby render path short-circuits denied cards
    // before the Search card's JSON.parse (corpus:34 *children+*right+
    // *structure + corpus:95 *edited+*right+*structure, both captured as
    // `<span class="denied">` — NOT CAPTURE_ERROR:BadQuery). The port
    // must respect that ordering: a denied Search card with non-JSON
    // content renders as the denial span, not BadQuery, exactly mirroring
    // Ruby's view/permission.rb:46-50 #denial -> view_for_denial, which
    // wraps the rendered view BEFORE view_method (render.rb:87-89) ever
    // dispatches to cql_search.rb. ensureVerdicts populates
    // `deniedVerdicts` for every prepared card from the folded permission
    // state; prepareSearches then skips cards in that map at line 1257.
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
      // Help-rules prepare enriches *help rule cards into renderCards (via
      // cacheFetchedRecord → enrichAndStore, help-popover.ts:439-444). Those
      // records land AFTER the main ensureVerdicts at line 281 has already
      // memoized its verdicts, so their card.ids have no entry in
      // deniedVerdicts and isDenied() returns false — the sync render path
      // then renders them as placeholder content instead of the Ruby
      // `<span class="denied">` (view/permission.rb:46-50 altered_view
      // wraps the view before view_method dispatches). Re-call the verdict
      // pass after help-rules; ensureVerdicts' skip-if-set guard
      // (line 733) means this is a no-op for cards already judged — it
      // only fills verdicts for the help-rules batch's newly-enriched cards.
      // Closes the corpus-wide permission_denied_sentinel_replaced_with
      // _placeholder growth that permfix48 surfaced (+238 on the slice,
      // +487 corpus-wide across 489a22c's readableRuleIds filter side).
      await this.ensureVerdicts();
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
      // The items enriched above land AFTER both ensureVerdicts passes
      // (the main pass and the help-rules re-pass), so their card.ids
      // have no entry in deniedVerdicts and isDenied() returns
      // gate-open false — the sync render path then renders every item
      // bar at full body even when the corpus's captured bytes carry
      // the `<span class="denied">` quiet denial (the pointer/list
      // item slots are exactly the surface where the corpus pins 229
      // denied item bodies). Re-run the verdict pass for the newly
      // enriched items; the skip-if-set guard makes it a no-op for
      // every card already judged. Same defect class and same fix
      // shape as the help-rules re-pass above.
      await this.ensureVerdicts();
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
    // THE OPTIONS-CARD CQL PARSE BOUNDARY (the host's own item-view options
    // chain — one of the firing paths of the capture-sentinel class; oracle
    // probes tmp/recapture-deck/diagnose-capture-error{,2,3,4,5,6,7}.rb).
    //
    // Mechanism (Ruby): rendering :open of a pointer/list card runs
    // standard_pointer_core (card-mod-list set/abstract/01_list/
    // html_views.rb:6-13), whose wrapper class needs item_view_options
    // (collection mod set/all/item.rb:149-159) -> determine_item_view_options
    // _type -> card.item_type_name -> Abstract::Items#item_type_id
    // (card-mod-collection set/abstract/items.rb:5-11):
    //     opt = options_card; return unless opt && opt != self
    //     opt.item_type_id
    // options_card (card-mod-layout set/abstract/items/options_api.rb:47-48)
    // = rule_card(:content_options) || right_type_options || Card[:all].
    // Pointer/list options cards RECURSE through the same chain; when the
    // chain lands on a search-type or set-type card, item_type_id is
    // Abstract::CqlSearch#item_type_id (cql_search.rb:14-18) -> cql_hash ->
    // parse_json_cql(content) -> Card::Error::BadQuery for garbage content
    // — and the raise unwinds the whole parent render (the capture's
    // CAPTURE_ERROR sentinel for the host).
    //
    // Gate (pinned empirically over BOTH capture keys — recapture census
    // tmp/recapture-deck/enumeration/options-gate-model.json, oracle probes
    // 5-7): pointer/list hosts on :open ONLY. :closed never consults the
    // options chain for plain lists (labeled/one_line_content), :content
    // never produced a sentinel in either capture (0/46), set hosts raise
    // via their rules-editor chains instead (their own options card is
    // never consulted — probe 7), and Abstract::Permission hosts
    // (right part *read/*create/*update/*delete) recorded REAL :open bytes
    // in both captures (original corpus: 1,537/1,537 real) while today's
    // Ruby raises — a capture-time divergence the fixtures pin as bytes, so
    // the gate must not fire for them. Read-denied hosts render the denial
    // span before any view body runs (view/permission.rb:46-50), and
    // unknown hosts render the unknown substitution — both skip.
    if (
      view === "open" &&
      (rootCard.typeCode === "pointer" || rootCard.typeCode === "list") &&
      rootCard.unknown !== true &&
      !this.isDenied(rootCard) &&
      !this.isPermissionRightHost(rootCard)
    ) {
      const failContent = await this.itemOptionsParseFailure(rootCard, new Set([rootCard.key]));
      if (failContent !== undefined) {
        // cql_search.rb:29-38 parity: empty content raises the distinct
        // "can't run search with empty content" BadQuery before the parse.
        throw failContent === "" ? emptyQueryError() : badQuery(failContent);
      }
    }
    // THE SET-HOST RULES-EDITOR OPTIONS-CHAIN BOUNDARY (the largest
    // remaining sentinel class — set|content=166, set|open=510 across both
    // capture keys; recapture census
    // tmp/recapture-deck/enumeration/set-host-options-gate-model.json,
    // oracle probes 7-9). Set hosts' :open and :content delegate to the
    // rules-editor accordion (card-mod-rules-0.20.0 set/type/set/
    // html_views.rb:6-11 + rule_lists.rb), which walks setting_categories
    // (per-setting rule_card lookups for content_options/help/structure/
    // default) and the recent_settings list (*recent settings+*self+
    // *content options, a search-type rule hanging off the deck's
    // recent_settings SET). When the walk resolves a search-type or set-
    // type rule card, the nested render hits Abstract::CqlSearch#item_type_id
    // (cql_search.rb:14-18) -> parse_json_cql(content) -> BadQuery for
    // garbage content, unwinding the host render. The probe-7 census pins
    // set hosts as the only class whose own options_card chain does NOT
    // raise — the raise originates INSIDE the rules-editor render on a
    // NESTED rule card. :closed never rendered the rules-editor in either
    // capture (the compact one_line_content); permission-right hosts
    // already short-circuited at the *open pointer/list gate above.
    //
    // Gate (pinned empirically over BOTH capture keys — model output
    // set-host-options-gate-model.json): set hosts on :open AND :content
    // (both views render the rules editor via :core delegation). Walks
    // the host's per-setting rule_card candidates + the recent_settings
    // *content_options rule + the host's own options_card walk; the FIRST
    // chain that lands on a search/set-type card with garbage content
    // raises. Memoized per host key in optionsCardCache (warm re-renders
    // stay zero-query).
    if (
      (view === "open" || view === "content") &&
      rootCard.typeCode === "set" &&
      rootCard.unknown !== true &&
      !this.isDenied(rootCard) &&
      !this.isPermissionRightHost(rootCard)
    ) {
      const failContent = await this.setHostOptionsParseFailure(rootCard);
      if (failContent !== undefined) {
        throw failContent === "" ? emptyQueryError() : badQuery(failContent);
      }
    }
    // Ruby Card.config.max_depth = 20 (railtie.rb:17; see RUBY_MAX_DEPTH).
    // The prefetch closure's MAX_CLOSURE_ROUNDS = 25 exceeds it, so every
    // nest chain the renderer can walk IS resolvable by the prefetch — the
    // depth guard is always reachable on fully-prefetched chains and the
    // battery's depth-44 envelope {200,500} collapses to a deterministic
    // guard hit instead of depending on fallback-round ordering.
    const format = new RenderFormat(rootCard, this, { maxDepth: RUBY_MAX_DEPTH });
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
    // THE SEARCH/DATE PARSE BOUNDARY (the R4 lazy seam's re-raise site).
    // Ruby parses inside the dispatched view method on THAT card —
    // cql_search.rb:29-38 for Search, Date.parse for the date cardtype's
    // content views — and only after the permission gate wrapped any denial
    // (view/permission.rb:46-50; format.ts runs viewPermissionDenial before
    // calling this). Only the result-rendering views parse: the capture
    // census pins search :open/:content CAPTURE_ERROR (24 each) vs
    // :closed/:title real (105/105), date likewise. This fires for NESTED
    // dispatches too — every nest routes through this seam (format.ts
    // renderView -> engine.resolveView) — which is how pointer/list/set
    // containers reproduce the capture's BadQuery for their search-card
    // items. View-gated: :title/:closed/:bar never raise here.
    //
    // RULE-card asymmetry (capture census, 2026-09-23): a search-TYPE card
    // that is ALSO a rule (3-part name, right part a setting — e.g.
    // "*layout+*right+*content options", corpus:316/571/9610) captures REAL
    // :open/:content bytes (48 *content options + 27 *structure rules, zero
    // CAPTURE_ERROR), while every CAPTURE_ERROR search card is non-rule;
    // date-typed rules (corpus:1135 "evog+*right+*default") still capture
    // the Date::Error sentinel. So the Search arm skips rule cards
    // (computeIsRuleSync — the same standard_rule? predicate the RULE
    // set-key uses) and the Date arm does not.
    if (
      (card.typeCode === SEARCH_TYPE_CODE || card.typeCode === DATE_TYPE_CODE) &&
      PARSE_DISPATCH_VIEWS.has(view)
    ) {
      if (card.typeCode === SEARCH_TYPE_CODE) {
        const failed = this.searchFailures.get(card.key);
        if (failed !== undefined && !this.computeIsRuleSync(card)) throw failed;
      } else if (!isValidDateContent(card.dbContent)) {
        throw dateError();
      }
    }
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
    this.searchFailures.clear();
    this.optionsCardCache.clear();
    this.setHostChainCache.clear();
    this.ruleCache.clear();
    this.viewDispatchCache.clear();
    this.readPermission = undefined;
    this.deniedVerdicts.clear();
    this.deniedVerdictsByKey.clear();
    this.ruleTypeIds = undefined;
    this.structureContents = undefined;
    this.structureProcessed.clear();
    this.structureRefMisses.clear();
    this.defaultRuleTypes = undefined;
    this.defaultTypeNameById = undefined;
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
   *  + codename statements; the *default universe rides the next slot).
   *  Falls back to one standalone batch on the defensive warm-closure-first-
   *  render path (once per engine) fetching BOTH universes. */
  private async parseStructureContents(
    folded: SQLQueryResult[] | undefined,
    structureStatementIndex: number,
  ): Promise<void> {
    if (this.structureContents !== undefined) return;
    let result = folded !== undefined ? folded[structureStatementIndex] : undefined;
    let defaultResult = folded !== undefined ? folded[structureStatementIndex + 1] : undefined;
    if (result === undefined || defaultResult === undefined) {
      // No folded batch to read (defensive: a warm-closure first render).
      const batch = await this.fetcher.driver.batch([
        structureRuleUniverseStatement(),
        defaultRuleUniverseStatement(),
      ]);
      result = batch[0];
      defaultResult = batch[1];
    }
    this.structureContents = structureUniverseFromResults(result);
    this.defaultRuleTypes = structureRuleTypesFromResults(defaultResult);
  }

  /**
   * The type names the *default universe's referenced type ids point at
   * (once per engine; one batched id query). These names feed the
   * new-child card's data-card-type-name attribute and its safeSetKeys
   * TYPE anchor. Genuinely missing type rows simply stay absent from the
   * map — newCardDefaultType degrades to the pre-round-9 untyped new-card
   * shape for those, never throws.
   */
  private async preloadDefaultTypeNames(): Promise<void> {
    if (this.defaultTypeNameById !== undefined) return;
    const map = new Map<number, string>();
    const universe = this.defaultRuleTypes;
    if (universe !== undefined && universe.size > 0) {
      const ids = [...new Set(universe.values())];
      const placeholders = ids.map(() => "?").join(", ");
      const result = await this.fetcher.driver.query<CardsRow>(
        `SELECT id, name FROM cards WHERE id IN (${placeholders}) AND trash = 0`,
        ids,
      );
      for (const row of result.rows as CardsRow[]) {
        if (row.name !== null && row.name !== undefined && row.name !== "") {
          map.set(row.id, row.name);
        }
      }
    }
    this.defaultTypeNameById = map;
  }

  /**
   * RenderEngineLike#newCardDefaultType: the *default rule card's type for
   * a nest-miss child name — the port of Ruby's new-card template type
   * resolution (type_id_from_template; see the defaultRuleTypes field note).
   * The candidate walk is the naming algebra only (ruleNamesForCard with a
   * type-less input: a new card carries no type yet, so type-anchored
   * candidates are correctly absent and the name-derived *right / *self
   * candidates decide); the FIRST candidate that exists in the universe
   * wins (pattern precedence), matching rule_card's first-hit walk.
   */
  newCardDefaultType(name: DeckoName): { typeId: number; typeName: string } | undefined {
    const universe = this.defaultRuleTypes;
    const names = this.defaultTypeNameById;
    if (universe === undefined || universe.size === 0 || names === undefined) return undefined;
    const candidates = ruleNamesForCard(
      { name, id: undefined, typeId: undefined, typeName: undefined },
      DEFAULT_SETTING_NAME,
    );
    for (const candidate of candidates) {
      let key: string;
      try {
        key = DeckoName.parse(candidate).key;
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
          continue; // unresolved mark: no *default rule candidate
        }
        throw err;
      }
      const typeId = universe.get(key);
      if (typeId === undefined) continue;
      const typeName = names.get(typeId);
      // First existing candidate decides (rule/all.rb first-hit); a missing
      // type row degrades the whole resolution to untyped rather than
      // walking past the winning rule.
      return typeName !== undefined ? { typeId, typeName } : undefined;
    }
    return undefined;
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
        // Round 9: both branches absolutize against THIS card's name (the
        // chunk/reference.rb referencing-card contract the Ruby port cites
        // in nest-syntax.ts's header): a template's `{{+image}}` names
        // `<instance>+image`. Without the context the walk produced the
        // literal key "+image", which matched no row, fell into
        // structureRefMisses, and every template child rendered as the
        // unknown-card empty slot even when its row existed (the round-9
        // live-wire gap). The prefetch's contextual collect and
        // closureWarm's cardReferenceKeys absolutize identically, so all
        // three walkers agree on one key set.
        const contentForRefs = resolved !== undefined
          ? resolved.templateContent
          : card.dbContent;
        if (resolved !== undefined && resolved.templateContent !== card.dbContent) {
          card.dbContent = resolved.templateContent;
        }
        for (const refName of templateReferenceNames(contentForRefs, card.name)) {
          // Mark-resolution error tolerance (mirror prefetch.ts:525-531 +
          // cardReferenceKeys:1858): a ref whose name is a codename/id
          // mark the codehash can't resolve (e.g. ":members" on a deck
          // whose corpus anonymizer omitted the *members card) would throw
          // out of DeckoName.parse. Drop the ref instead of failing the
          // whole structure walk — the unknown-card view path renders it
          // safely, and the warm closure picks it up on a later round.
          let refKey: string;
          try {
            refKey = DeckoName.parse(refName).key;
          } catch (err) {
            if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
              continue;
            }
            throw err;
          }
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
    // Actor threading (R4 seam 2): the signed-out viewer's OWN card id is a
    // party — account_holder.rb:27-29 parties = all_enabled_roles + [self],
    // and fetch_read_rules (:115-123) unions the cache over [AnyoneID] +
    // parties. ANONYMOUS_VIEWER carries no actorId, so resolve it from this
    // batch's codename rows — exactly what resolveAnonymousReadPermission
    // does (read-rules.ts:352-360) — instead of dropping the [AnonymousID]
    // party. Corpus-neutral today (verified: 0 read rules grant the
    // anonymous party, 0 grant anonymous-but-not-anyone), but the parties
    // must match Ruby's for any deck whose rules grant [[Anonymous]].
    const viewer: ReadViewer =
      this.viewer.signedIn === true
        ? this.viewer
        : { signedIn: false, actorId: anonymousIdFromResults(results) };
    this.readPermission = readPermissionStateFromViewerResults(results, viewer);
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
      if (card.id === undefined) {
        // The virtual cards (states.rb#virtual?): no row, no id — the read
        // rule resolves through the live name walk exactly like Ruby's
        // `read_rule_id ||= permission_rule_id(:read)` on a rowless card
        // (set/all/permissions.rb:139-146). Keyed by card key: virtual
        // cards share no id space.
        if (this.deniedVerdictsByKey.has(card.key)) continue;
        const byRule = await canReadByRuleLookup(
          this.fetcher,
          { name: card.name, id: card.id, typeId: card.record.typeId, typeName: card.typeName },
          state,
        );
        this.deniedVerdictsByKey.set(card.key, byRule === false);
        continue;
      }
      if (this.deniedVerdicts.has(card.id)) continue;
      const stored = card.record.readRuleId;
      if (stored !== undefined) {
        // Two-pass (the recapture 2026-09-24 fix): the STORED read_rule_id
        // is the most specific rule the set_read_rule walk picked at save
        // time. Ruby's live permission_rule_id(:read) is what gates the
        // ACTUAL view (permissions.rb:142-143 falls back to the live walk
        // on every uncached path, and rule_id_lookup re-resolves on
        // read-rule rebuild). When the stored rule doesn't grant the
        // viewer but the live walk's rule candidates resolve to one that
        // does (the deck's *all+*read catchall, the canonical
        // pattern-precedence tail), Ruby's live walk ALLOWS — match it:
        // consult the live candidates before pinning the denial. The
        // stored-id fast path still wins when the stored rule grants.
        // STRICT: only the live walk's EXPLICIT grant flips the stored
        // denial (boolean true). Undefined (no rule resolved) keeps the
        // stored verdict — the partial-deck / rule-less case must NOT
        // silently allow a stored denial.
        if (canReadByStoredRule(stored, state)) {
          this.deniedVerdicts.set(card.id, false);
          continue;
        }
        const byRule = await canReadByRuleLookup(
          this.fetcher,
          { name: card.name, id: card.id, typeId: card.record.typeId, typeName: card.typeName },
          state,
        );
        if (byRule === true) {
          this.deniedVerdicts.set(card.id, false);
        } else {
          // byRule === false: live walk explicitly grants a non-readable
          // rule (rare; corroborates denial). byRule === undefined: no
          // rule resolved (partial-deck case); honor the stored verdict.
          this.deniedVerdicts.set(card.id, !canReadByStoredRule(stored, state));
        }
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
  // permission seams for non-HTML entries (the deploy worker's record-JSON
  // route and CQL API) — same engine state the HTML verdicts read
  // -------------------------------------------------------------------------

  /** Read verdict for one card record — the per-card half of ensureVerdicts,
   *  shared by entries that serve card data outside the HTML view pipeline
   *  (deploy/worker.ts cardRecordJson). Stored read_rule_id resolves purely
   *  (canReadByStoredRule, permissions.rb:142-143); cards without one fall
   *  back to the live rule walk (canReadByRuleLookup, permissions.rb:55-61;
   *  undefined = rule-less deck: allowed, the documented divergence).
   *  `typeName` is optional — the *type pattern's anchor name; callers that
   *  already hold the type record pass it, others let the lookup resolve.
   *  Verdicts memoize into the same deniedVerdicts map ensureVerdicts uses,
   *  so a card judged here is judged for the HTML path too (and vice versa:
   *  an existing verdict short-circuits). */
  async canReadCard(record: CardRecord, typeName?: string): Promise<boolean> {
    const state = await this.ensureReadPermission();
    if (record.id !== undefined && this.deniedVerdicts.has(record.id)) {
      return !this.deniedVerdicts.get(record.id);
    }
    let denied: boolean;
    const stored = record.readRuleId;
    if (stored !== undefined) {
      // Two-pass — see ensureVerdicts for the rationale (recapture
      // 2026-09-24 fix: live walk after a stored-rule miss so the
      // pattern-precedence catchall is honored). Strict: only EXPLICIT
      // live-walk grants flip the stored denial; undefined (no rule
      // resolved) preserves the stored verdict.
      if (canReadByStoredRule(stored, state)) {
        denied = false;
      } else {
        const byRule = record.name
          ? await canReadByRuleLookup(
              this.fetcher,
              {
                name: record.name,
                id: record.id,
                typeId: record.typeId,
                ...(typeName !== undefined ? { typeName } : {}),
              },
              state,
            )
          : false; // a name-less record has no rule candidates
        if (byRule === true) {
          denied = false;
        } else {
          denied = !canReadByStoredRule(stored, state);
        }
      }
    } else {
      const byRule = record.name
        ? await canReadByRuleLookup(
            this.fetcher,
            {
              name: record.name,
              id: record.id,
              typeId: record.typeId,
              ...(typeName !== undefined ? { typeName } : {}),
            },
            state,
          )
        : true; // a name-less record has no rule candidates (not a real card)
      denied = byRule === false; // undefined = rule-less: allowed
    }
    // Verdict memoization mirrors ensureVerdicts' split keying: real cards
    // by id, virtual (id-less) cards by canonical key.
    if (record.id !== undefined) this.deniedVerdicts.set(record.id, denied);
    else if (record.key !== undefined && record.key !== "") {
      this.deniedVerdictsByKey.set(record.key, denied);
    }
    return !denied;
  }

  /** The CQL permission filter for this engine's viewer — the shape
   *  executeQuery's SqlOptions take (sql.ts implicitConditions, the port of
   *  Where#permission_conditions). Ruby's Card::Query runs with
   *  Auth.always_ok? false, so every /api/query-shaped statement is
   *  filtered to the viewer's readable rule set; serving rows without the
   *  filter leaks db_content the HTML views deny. The rule-less-deck
   *  allowance mirrors canReadByRuleLookup's undefined verdict (no read
   *  rule cards at all: nothing to filter by, everything allowed — the
   *  same divergence the HTML verdicts document; filtering with the empty
   *  set would deny every card and break rule-less seeds). */
  async cqlPermissionOptions(): Promise<{ alwaysOk: boolean; readRuleIds: number[] }> {
    const state = await this.ensureReadPermission();
    if (state.alwaysOk) return { alwaysOk: true, readRuleIds: [] };
    if (!state.hasReadRules || !state.hasCatchAllReadRule) {
      return { alwaysOk: true, readRuleIds: [] }; // rule-less allowance
    }
    return { alwaysOk: false, readRuleIds: [...state.readableRuleIds] };
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
    // Pre-populate read-permission verdicts for every (setCard,
    // settingCard) pair the sync render path will construct a virtual
    // for — the engine's setRulesCoreHtml falls through to
    // views.ts#renderSettingListItems which builds one virtual per
    // setting that has no stored child, and the view-permission gate
    // (format.ts:renderView) reads isDenied which reads
    // deniedVerdictsByKey. Without this pass the gate is open for every
    // virtual and the engine renders a bar where Ruby renders the
    // quiet denial span (the round-7 permission_denied_mismatch
    // residual; see preloadVirtualRuleVerdicts for the full mechanism).
    await this.preloadVirtualRuleVerdicts(setCard);
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

  /**
   * Pre-populate read-permission verdicts for the virtual rule cards the
   * set-card Rules section renders. The engine constructs each missing-
   * setting virtual (the engine's setRulesCoreHtml path falls through to
   * views.ts#renderSettingListItems which builds one virtual per setting
   * that has no stored child) — Ruby's setting_list_item runs the live
   * permission walk on the virtual (rule_lists.rb#setting_list_item's
   * card.ok_to_read?), and the verdict decides between a bar and the
   * quiet denial span (card-mod-format set/all/html/error.rb:185-189
   * quiet_denial).
   *
   * The sync render path (format.ts#renderView line 315, the view-perm
   * gate at view-perms.ts#viewPermissionDenial) reads `isDenied` which
   * pulls from `deniedVerdictsByKey` — without a pre-populated verdict
   * the virtual card's gate is open and the engine renders a bar where
   * Ruby renders the denial span (the round-7
   * permission_denied_mismatch residual).
   *
   * This pass mirrors the stored-card verdict path (ensureVerdicts
   * 958-1020): same canReadByRuleLookup, same deniedVerdictsByKey map,
   * same keying by canonical name key. NO parallel system. Each
   * candidate name = `${setCard.name.s}+*${settingCodename}` exactly as
   * buildVirtualRuleCard produces; the verdict lookup uses the
   * id-less card shape (id undefined, type from the setting card) so
   * ruleNamesForCard drops the SELF candidate (pattern/all.rb#patterns'
   * new-card branch), letting the RSTAR *all+*<setting> candidate win
   * for the Anonymous corpus viewer (the captured denial surface).
   *
   * Idempotent: skip-if-set guard matches ensureVerdicts' skip-if-set
   * pattern (line 968). Warm renders stay at zero queries — verdicts
   * already in the map.
   *
   * Called from preloadSetRules after preloadAllSettingCards (settings
   * are cached so findSettingCard is a synchronous render-cards walk).
   */
  private async preloadVirtualRuleVerdicts(setCard: RenderCard): Promise<void> {
    const state = this.readPermission;
    if (state === undefined) return;
    for (const groupName of SETTING_GROUPS) {
      for (const settingCodename of GROUP_TO_SETTINGS[groupName]) {
        const settingCard = this.findSettingCard(settingCodename);
        if (settingCard === undefined) continue;
        const name = DeckoName.parse(`${setCard.name.s}+*${settingCodename}`);
        if (this.deniedVerdictsByKey.has(name.key)) continue;
        const byRule = await canReadByRuleLookup(
          this.fetcher,
          {
            name,
            id: undefined,
            typeId: settingCard.typeId,
            typeName: settingCard.typeName,
          },
          state,
        );
        this.deniedVerdictsByKey.set(name.key, byRule === false);
      }
    }
  }

  /** The read-permission verdict for a prepared card (ok_to_read?'s set
   *  membership, precomputed in the prepare phase — never a query here).
   *  ID-less cards (the virtual cards) read their verdicts from the
   *  key-keyed map (see deniedVerdictsByKey). */
  isDenied(card: RenderCard): boolean {
    if (card.id !== undefined) {
      return this.deniedVerdicts.get(card.id) === true;
    }
    return this.deniedVerdictsByKey.get(card.key) === true;
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

  /** Look up a SETTING card by its codename (the 23 settings the
   *  preloadAllSettingCards walk loads: autoname/default/structure/
   *  create/read/update/delete/captcha/head/layout/style/script/help/
   *  input_type/guide/content_options/content_option_view/on_create/
   *  on_update/on_delete/thanks/follow_fields/follow). Used by the
   *  set-card Rules section to construct virtual rule cards for settings
   *  that have no stored child (card-mod-rules rule_lists.rb#setting_list_item;
   *  the deep-read-rule-deny cluster 14 fix — see virtual-rule-card.ts).
   *  Walks the render-card map (the settings are preloaded in the cold
   *  render path; no query). */
  findSettingCard(codename: string): RenderCard | undefined {
    for (const card of this.renderCards.values()) {
      if (card.record.codename === codename) return card;
    }
    return undefined;
  }

  /** card-mod-rules set/type/setting.rb#set_classes_with_rules + Ruby's
   *  `card.rules_for_set_class(klass)`: for a setting-type card (e.g.
   *  *read), walk every rule whose right part matches this setting and
   *  bucket by the LEFT pattern class. Each PatternSpec's patternCardName
   *  (*all, *all plus, *type, *right, *type plus right, *self — in the
   *  registry's lookup order, the ones a setting's children can carry)
   *  becomes one bucket; `anchorless` mirrors whether the pattern carries
   *  an `anchor_name` override (the *all and *all_plus specs don't, so
   *  Ruby collapses those into a single full-name row; the anchored
   *  ones iterate per-rule). Used by the setting-card core view
   *  (setting.rb:39-55 + core.haml:1-12). */
  setClassesWithRules(host: RenderCard): SettingClassWithRules[] {
    const out: SettingClassWithRules[] = [];
    const hostKey = host.key;
    if (hostKey === "") return out;
    const settingBuckets = new Map<string, RenderCard[]>();
    for (const card of this.renderCards.values()) {
      if (card.id === undefined) continue;
      if (!card.name.isCompound) continue;
      if (card.name.rightName?.key !== hostKey) continue;
      const leftKey = card.name.leftName?.key;
      if (leftKey === undefined) continue;
      const bucket = settingBuckets.get(leftKey);
      if (bucket === undefined) {
        settingBuckets.set(leftKey, [card]);
      } else {
        bucket.push(card);
      }
    }
    for (const klass of SETTING_CLASSES) {
      const leftKey = klass.patternCardName.toLowerCase();
      const rules = settingBuckets.get(leftKey);
      if (rules === undefined || rules.length === 0) continue;
      out.push({
        klass,
        rules,
        anchorless: klass.anchorName === undefined,
      });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // options-card CQL parse boundary (the capture-sentinel class, chain A)
  // -------------------------------------------------------------------------

  /** Abstract::Permission host test: a compound card whose RIGHT part's
   *  card carries one of the four permission setting codenames
   *  (card-mod-permissions set/right/{read,create,update,delete}.rb all
   *  `include Abstract::Permission`, whose options_card override returns
   *  Card[:cards_with_account]). The gate excludes these hosts: both
   *  captures recorded REAL :open bytes for them (original corpus
   *  1,537/1,537) despite today's Ruby raising — the fixtures pin bytes,
   *  so the parse boundary must stay closed for this class. */
  private isPermissionRightHost(card: RenderCard): boolean {
    if (!card.name.isCompound) return false;
    const rightKey = card.name.rightName?.key;
    if (rightKey === undefined) return false;
    const right = this.renderCards.get(rightKey);
    const codename = right?.record.codename;
    return codename !== undefined && PERMISSION_RIGHT_CODENAMES.has(codename);
  }

  /** The recursive half of the boundary: resolve `card`'s options card and
   *  walk the Abstract::Items#item_type_id chain (items.rb:5-11) until a
   *  search/set-type terminal parses its content (failure content returned,
   *  "" for the empty-content branch) or the chain stops (undefined):
   *  - right_type_options (layout options_api.rb:57-59): the right part is
   *    a cardtype -> Card.fetch [right.name, :type, :by_name] — a VIRTUAL
   *    card whose Ruby content is a CQL Hash, so cql_content never parses
   *    and item_type_id returns nil (probe 5, cixvol+jzuqht). The port has
   *    no such virtual card -> stop, no raise.
   *  - Card[:all] fallback (options_api.rb:48); *all is set-typed, so the
   *    terminal parse fires on its db_content ("fr" corpus-wide).
   *  - `seen` carries the visited keys — `opt != self` recursion guard.
   *  All fetches ride the fetch engine's cache-first ladder; the resolution
   *  memoizes per host key so warm re-renders stay zero-query. */
  private async itemOptionsParseFailure(
    card: RenderCard,
    seen: Set<string>,
  ): Promise<string | undefined> {
    const opt = await this.resolveOptionsCard(card);
    if (opt === undefined) return undefined;
    if (seen.has(opt.key)) return undefined;
    seen.add(opt.key);
    if (opt.typeCode === SEARCH_TYPE_CODE || opt.typeCode === SET_TYPE_CODE) {
      const raw = opt.dbContent;
      if (raw === "") return "";
      try {
        JSON.parse(raw);
        return undefined;
      } catch {
        return raw;
      }
    }
    if (opt.typeCode === "pointer" || opt.typeCode === "list") {
      return this.itemOptionsParseFailure(opt, seen);
    }
    return undefined;
  }

  /** options_card (options_api.rb:47-48) minus the permission-abstract
   *  override (excluded at the gate):
   *  rule_card(:content_options) || right_type_options || Card[:all].
   *  rule_card rides the SAME rule-name algebra + storage walk the
   *  view-override lookup uses (findRule -> ruleNamesForCard, the
   *  pattern-precedence candidate walk). Memoized per card key. */
  private async resolveOptionsCard(card: RenderCard): Promise<RenderCard | undefined> {
    const cached = this.optionsCardCache.get(card.key);
    if (this.optionsCardCache.has(card.key)) return cached;
    let resolved: RenderCard | undefined;
    const rule = await findRule(this.fetcher, this.structurePatternInputForSync(card), "*content options");
    if (rule !== undefined && rule.rule.name !== undefined) {
      resolved = await this.enrichAndStore(rule.rule);
    }
    if (resolved === undefined && card.name.isCompound) {
      // right_type_options: right part is a cardtype -> the by-name
      // virtual card stops the chain (see itemOptionsParseFailure).
      // Per the recapture 2026-09-24 probe: the peekNameForId check fires
      // for the Cardtype cardtype ITSELF (right whose TYPE has codename
      // "cardtype") and for *right (right whose TYPE swtktey is a
      // cardtype but anonymized). The full Ruby's "right's TYPE is a
      // cardtype" check (peekNameForId(peekId(rightType.type_id)) ===
      // "cardtype") is more permissive and gates ~898 entries that the
      // corpus pins as BadQuery raises — Ruby gates only the codename'd
      // cardtype card (right.type_code == "cardtype"), which is the
      // peekNameForId check below. Keep the original check; the C1 fix
      // attempt lives on in tests/card/render for future repair.
      const rightKey = card.name.rightName?.key;
      const right = rightKey !== undefined ? this.renderCards.get(rightKey) : undefined;
      const rightTypeId = right?.record.typeId;
      if (
        rightTypeId !== undefined &&
        this.fetcher.codenames.peekNameForId(rightTypeId) === CARDTYPE_TYPE_CODE
      ) {
        this.optionsCardCache.set(card.key, undefined);
        return undefined;
      }
    }
    if (resolved === undefined) {
      // Card[:all] fallback
      const allRecord = await this.fetcher.fetchByName("*all");
      if (allRecord !== undefined && allRecord.name !== undefined) {
        resolved = await this.enrichAndStore(allRecord);
      }
    }
    this.optionsCardCache.set(card.key, resolved);
    return resolved;
  }

  /** The set-host rules-editor options-chain walk: per-setting rule_card
   *  lookups (content_options / help / structure / default), the recent
   *  settings list's *content_options rule, and the host's own options
   *  card. Each candidate walks the Abstract::Items#item_type_id chain
   *  (itemOptionsParseFailure): search/set terminals parse their content
   *  as JSON and return the failing content ("" for the empty-content
   *  raise); pointer/list cards recurse into THEIR own options card;
   *  everything else has no parse and stops. Returns the FIRST failing
   *  content (the chain the fixture's BadQuery message echoes) or
   *  undefined when no chain fires.
   *
   *  Memoized per host key in optionsCardCache (the same map the
   *  pointer/list gate uses): warm re-renders of the same host pay ONE
   *  Map lookup regardless of view. The key encodes the rule-walk input
   *  (host card identity); cache hits return the recorded content
   *  verbatim. */
  private async setHostOptionsParseFailure(
    host: RenderCard,
  ): Promise<string | undefined> {
    // Cache key: the host's own key. Per-setting rule walks are derived
    // from the host's pattern input (deterministic), so the cache is safe
    // to key on the host only.
    if (this.setHostChainCache.has(host.key)) {
      return this.setHostChainCache.get(host.key);
    }

    const settings = ["*content options", "*help", "*structure", "*default"];

    for (const settingName of settings) {
      // Walk the host's rule-card candidates for this setting: the SAME
      // ruleNamesForCard algebra the rule-card view-override uses. Each
      // candidate, when it resolves to a real card, gets parsed DIRECTLY
      // if it's a search-type rule (the rules editor's nested render
      // triggers Abstract::CqlSearch#item_type_id on the rule itself,
      // NOT on the rule's options_card chain). Set-typed rules are
      // skipped: the recapture's 676 set-host sentinels all carry
      // search-type terminals (jjmd, kwnd), never the *all "fr"
      // fallback. The first rule whose content parses-failure raises
      // with that content; pointer/list rules recurse into THEIR
      // options chain (rare in practice).
      const rule = await findRule(
        this.fetcher,
        this.structurePatternInputForSync(host),
        settingName,
      );
      if (rule !== undefined && rule.rule.name !== undefined) {
        const ruleCard = await this.enrichAndStore(rule.rule);
        if (ruleCard !== undefined) {
          const fail = this.ruleCardParseFailure(ruleCard);
          if (fail !== undefined) {
            this.setHostChainCache.set(host.key, fail);
            return fail;
          }
          if (
            ruleCard.typeCode === "pointer" || ruleCard.typeCode === "list"
          ) {
            const optFail = await this.itemOptionsParseFailure(
              ruleCard,
              new Set([host.key, ruleCard.key]),
            );
            if (optFail !== undefined) {
              this.setHostChainCache.set(host.key, optFail);
              return optFail;
            }
          }
        }
      }
    }

    // Recent_settings chain (recapture 2026-09-24 REVERT): the original
    // check is restored. The 1012 handler_raised FP class (the set-host
    // chain change's stated motivation) traced to a too-broad itemOptions-
    // ParseFailure fallback that fired for set hosts whose right's TYPE
    // is a cardtype — exactly the case the C1 fix above (peekNameForId →
    // typeCode === CARDTYPE_TYPE_CODE) is supposed to gate before the
    // walk falls through. With the C1 fix in place, the right walk stops
    // at the right_type_options gate for those entries; the recent_
    // settings card's bad JSON then ONLY fires for the set hosts whose
    // right's TYPE is NOT a cardtype (the corpus parity set — Ruby
    // captures BadQuery for these). Returning to the recent_settings
    // check restores those set-host raises without re-introducing the
    // 1012 FP class (the C1 fix prevents the right walk from falling
    // through to *all for the FP entries).
    const recentRuleRecord = await this.fetcher.fetchByName("*recent settings+*self+*content options");
    if (recentRuleRecord !== undefined && recentRuleRecord.name !== undefined) {
      const recentRule = await this.enrichAndStore(recentRuleRecord);
      if (recentRule !== undefined) {
        const fail = this.ruleCardParseFailure(recentRule);
        if (fail !== undefined) {
          this.setHostChainCache.set(host.key, fail);
          return fail;
        }
      }
    }

    // No fall-through to the host's OWN options_card chain: with the C1
    // fix restored above, the right walk stops at right_type_options for
    // compound hosts whose right's TYPE is a cardtype. The *all "fr"
    // fallback would falsely raise for set-card-views corpus parity pins
    // (those hosts render real bytes in the corpus).
    this.setHostChainCache.set(host.key, undefined);
    return undefined;
  }

  /** Parse a single rule card's content as CQL if it's search-typed.
   *  The set-host gate's parse site: the rules editor's nested render
   *  consults Abstract::CqlSearch#item_type_id on the rule card
   *  directly (cql_search.rb:14-18) -- not via the rule's options_card
   *  chain. Set-type rules are NOT parsed: the recapture's 676 set-host
   *  sentinels all carry search-type terminals (jjmd, kwnd), never the
   *  *all "fr" fallback; the pointer/list gate handles *all as a
   *  terminal separately. Returns the failing content ("" for the
   *  empty-query branch) or undefined when the rule isn't search-typed
   *  or its content parses cleanly. */
  private ruleCardParseFailure(card: RenderCard): string | undefined {
    if (card.typeCode !== SEARCH_TYPE_CODE) {
      return undefined;
    }
    const raw = card.dbContent;
    if (raw === "") return "";
    try {
      JSON.parse(raw);
      return undefined;
    } catch {
      return raw;
    }
  }


  // -------------------------------------------------------------------------
  // rule? predicate (lib/card/rule/all.rb:32-51) — the RULE set-key input
  // -------------------------------------------------------------------------

  /** Parse the folded codehash result (sliced past the permission
   *  statements) into memoized codename ids. Runs once per engine, before
   *  enrichment, so set-key derivation never queries. */
  private async parseRuleTypeIds(
    folded: SQLQueryResult[] | undefined,
    permissionStatementCount: number,
  ): Promise<void> {
    const result = folded !== undefined ? folded[permissionStatementCount] : undefined;
    if (result !== undefined) {
      this.fetcher.codenames.foldCodehashResults(result);
    } else {
      // No folded batch to read (defensive: a warm-closure first render).
      // One standalone load, still once per engine. Awaited (was `void`)
      // so the peekId reads below see a populated codehash — the `void`
      // branch could race with peekId on a warm-closure first render and
      // leave ruleTypeIds fully undefined, breaking the per-type
      // down-stream lookup.
      await this.fetcher.codenames.ensureLoaded();
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
   *  (26/1000 shard-0 cards cold after prewarm, render-perf harness).
   *
   *  Round 9: every non-underscore ref is ABSOLUTIZED against the card's
   *  own name (chunk/reference.rb referencing-card contract) — the same
   *  contextual resolution applyStructureContent's ref walk and the
   *  prefetch's record collect use. A card's `{{+image}}` checks
   *  `<card>+image` in the render-card map; the pre-round-9 literal
   *  "+image" key matched no prepared card, but the walkers' bogus miss
   *  landed in structureRefMisses so warm detection only stayed stable by
   *  accident of the shared bogus key.
   *
   *  Sync mark resolution tolerates CodenameNotFoundError / NameNotFoundError
   *  for unresolved codename/id marks: the lexicon temp cache evicts itself
   *  at 10000 keys (lib/card/cache/temporary.rb#within_key_counts); after
   *  eviction the sync peek returns undefined and DeckoName.parse throws.
   *  Treat the ref as unknown (skip it) — the cold path will refill the
   *  cache, re-walk the closure, and reach a stable closure. */
  private cardReferenceKeys(card: RenderCard): string[] {
    const keys: string[] = [];
    for (const ref of referencedNames(card.dbContent)) {
      if (ref.relative) continue;
      const pipe = ref.name.indexOf("|");
      const base = pipe === -1 ? ref.name : ref.name.slice(0, pipe);
      let key: string;
      try {
        key = DeckoName.parse(base).absoluteName(card.name).key;
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) continue;
        throw err;
      }
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
   * R4 lazy-parse seam: this walk NO LONGER RAISES. Ruby's Search JSON.parse
   * and Date.parse fire INSIDE the dispatched view method
   * (cql_search.rb:29-38; view/permission.rb:46-50 wraps the denial BEFORE
   * view_method, so only readable cards ever parse), and only on the
   * result-rendering views — the capture census pins search :open/:content
   * as CAPTURE_ERROR (24 each) while :closed/:title carry real bytes
   * (105/105 each; date likewise, corpus:1135). The eager throw here both
   * over-raised (date :closed/:title — 1,066 corpus views where Ruby
   * rendered) and, via the prewarm driver's catch arm, poisoned the seat so
   * dispatched views never raised at all. Now a parse failure is RECORDED
   * (searchFailures, with the exact error object the dispatched view
   * re-raises) and the walk COMPLETES — the completion is load-bearing: it
   * enriches the queue's remaining cards so the post-prepare ensureVerdicts
   * pass judges them (render.ts's second ensureVerdicts call). The dispatch
   * boundary that re-raises is engine.resolveView (below).
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
      // CAPTURE_ERROR sentinel; view/permission.rb:46-50). The prepare phase
      // must mirror that ordering: only READABLE Search cards get their
      // parse attempted (and only a readable card can ever re-raise at the
      // dispatch boundary).
      if (this.isDenied(card)) continue;
      if (card.typeCode === SEARCH_TYPE_CODE) {
        if (this.searchResults.has(key) || this.searchFailures.has(key)) continue;
        try {
          const items = await this.runSearch(card);
          this.searchResults.set(key, items);
          for (const item of items) {
            if (!visited.has(item.key)) queue.push(item.record);
          }
        } catch (err) {
          // Parse failures (cql_search.rb:29-38 BadQuery, both the
          // invalid-JSON and the empty-content branches) become dispatch
          // re-raises: seat an empty result (closureWarm's has(key) stays
          // true — the perf contract the prewarm pins) and record the exact
          // error. Unknown errors are NOT parse failures — rethrow.
          if (!(err instanceof Error) || err.name !== BAD_QUERY_CLASS_NAME) throw err;
          this.searchFailures.set(key, err);
          this.searchResults.set(key, []);
        }
        continue;
      }
      // Date-type cards are validated at the dispatch boundary (resolveView)
      // — the walk records nothing for them: Ruby's Date.parse runs inside
      // the dispatched view method on THAT card (corpus:1135's :open/:content
      // raise while :closed/:title render), never at prefetch scope. Keyed on
      // the type card's codename (corpus:1135's type card is NAMED "evog";
      // the typeCode gate matches the codename "date" regardless of the
      // display name).
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
