// The render engine: TypeScript port of the Decko card renderer's public
// surface, with the decko-commons/decko#1282 batched inclusion prefetch.
//
//   const engine = new RenderEngine(fetchEngine);
//   const html = await engine.render("Home", "open");
//
// Render pipeline :
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
//   divergence is

import { DeckoName } from "./name.js";
import { getNameEnvironment, setNameEnvironment } from "./name/environment.js";
import { findAssignedTypeName } from "./set-patterns/set-type-assignment.js";
import { CodenameNotFoundError, NameNotFoundError } from "./name/errors.js";
import { FetchEngine, type NewCardOptions } from "./fetch.js";
import {
  invalidateSeatedPagePayloads,
  oneTripWantsPayload,
  seatOneTripPayloadForRender,
  type OneTripSeatResult,
} from "./one-trip/render-gate.js";
import { cardContent, composeCardRecord, type CardRecord } from "./fetch/card-record.js";
import { executeCount, executeQuery, type CqlQueryResult } from "../cql/execute.js";
import { resolvePointerItemName, rawItemStrings } from "./render/pointer-list.js";
import { listItemContentOverride } from "./render/content-overrides.js";
import { findRule } from "./rules/lookup.js";
import { ruleCacheStatement, type RuleCacheRow } from "./rules/rule-cache.js";
import { ruleCacheKeyFromRow } from "./set-patterns/rule-names.js";
import { ruleNamesForCard } from "./set-patterns/rule-names.js";
import { applyViewOverride, resolveViewOverride } from "./rules/apply.js";
import { resolveVirtualCardStructure } from "./fetch/virtual-cards.js";
import { virtualSearchCqlFor } from "./fetch/virtual-search-cards.js";
import { statementAfterFirstQuery } from "../cql/consumed-conjunctions.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  resolveStructuredContent,
  templateReferenceNames,
  defaultRuleUniverseStatement,
  structureRuleTypesFromResults,
  templateTypeNameStatement,
  templateTypeNamesFromResults,
  DEFAULT_SETTING_NAME,
  STRUCTURE_SETTING_NAME,
} from "./rules/structure.js";
import type { CardsRow } from "../server/schema.js";
import {
  RenderFormat,
  RUBY_MAX_DEPTH,
  str,
  UnsupportedViewError,
  type RenderCard,
  type RenderEngineLike,
  type SearchBoxCompleteSeat,
  type ViewFn,
  type ViewResult,
} from "./render/format.js";
import { renderPageBytes, headContent, UnknownLayoutError } from "./render/page.js";
import { deckDefaultHtmlView, envOriginForSurface, pageDefaultHtmlView } from "./render/deck-origin.js";
import { deploymentDefaultHtmlViewNest } from "./render/deployment-follow-live-config.js";
import {
  enabledRolesDropdownHtml,
  myCardDropdownInnerHtml,
  rolesAccountDropdownHtml,
  signedInAccountLinksInnerHtml,
  type SessionRolesInput,
} from "./render/navbar-views.js";
import type { ViewOverride } from "./rules/apply.js";
import {
  HTML_VIEWS,
  SETTING_GROUPS,
  isTemplatedNestsName,
  templateLinkSetNameFromParts,
  baseTableEntry,
  flatViewRefused,
  visibleSettingCodenames,
  visibleSettingsForGroup,
} from "./render/views.js";
import { RULE_TYPE_IDS_FOR_PRELOAD } from "./render/virtual-rule-card.js";
import { headViewReadStatement } from "./render/head-views.js";
import {
  bootBundleForVersion,
  bootCacheIsWarm,
  readBootContentVersion,
  storeBootBundle,
  type BootBundle,
} from "./render/boot-cache.js";
import type { SearchResultPaging } from "./render/search-paging.js";
import {
  ModLoader,
  getDefaultModLoader,
  modGeneration,
} from "./mod-loader.js";
import { modEngineHost } from "./mod-loader/mod-engine-host.js";
import { bindModuleAdminHost } from "./mod-loader/mods/core-mod.js";
import { prepareAdminRuntime } from "./mod-loader/mods/core-admin-runtime.js";
import {
  badQuery,
  dateError,
  emptyQueryError,
  isValidDateContent,
  upstreamMatchError,
  BAD_QUERY_CLASS_NAME,
} from "./render/errors.js";
import {
  composeAndCacheSqlRows,
  prefetchInclusionClosure,
  prefetchWarmupClosure,
  type PrefetchContext,
  type PrefetchStats,
  type WarmupCard,
  type WarmupRef,
  type WarmupScan,
  type WarmupMode,
  type WarmupStats,
} from "./render/prefetch.js";
import { readCardRowsByIdChunked } from "../server/chunked-row-reads.js";
import type {
  HistoryActionRow,
  HistoryActRow,
  HistoryChangeRow,
} from "./mod-loader/mods/card-mod-history.js";
import {
  actionPreviousValue,
  actionValue,
  historyActs,
  historyCardIds,
  lastAction,
  lastAct,
  recentActs,
  updaterOf,
} from "./mod-loader/mods/card-mod-history.js";
import { trackedFieldByIndex } from "./history/change.js";

/** The views the render-time history seam loads for (render-seam.ts): the
 *  three ported history views. A render of any other view never touches
 *  the seam (prepareHistoryRender is gated on this set). */
// The history seam's view gate. "conflict" joins the three history views:
// card-mod-format's :conflict (set/all/html/error.rb:37-51) reads the same
// render-time act data - card.last_action (:38 revision span + the actor
// walk) and render_act (:47, the act_from_context no-act_id branch).
// "history_tab" joins for the board views (card-mod-edit tab_views.rb:8-12:
// acts_board_layout reads the same prepared act bundle).
const HISTORY_SEAM_VIEWS = new Set([
  "history",
  "act",
  "action_summary",
  "action_expanded",
  "last_action_verb",
  "conflict",
  "history_tab",
  // surfaces round: view :board_act (history_board.rb:18-26) reads the
  // same prepared act bundle (act_listing_opts_from_params + act_from_
  // context + act_renderer(:board) + act_listing — the graded corpus row
  // view:admin:Topic 001:board_act pins the overlay frame + the create
  // action's diff/summary listing).
  "board_act",
  // surfaces-batch3 (2026-09-30): the ladder trio reads the same prepared
  // act bundle (:act_legend's helpers + :last_action's last_act walk and
  // :change's composition over it — card-mod-history views.rb:15-53).
  "act_legend",
  "last_action",
  "change",
  // wave-1 follow family: base_views.rb's :subedit_notice reads the same
  // prepared act bundle (notification_action's card.last_action / Action
  // .fetch walk over the changed fields — set/all/notify/base_views.rb:
  // 25-31 + 84-96 + 121-123; the sibling :list_of_changes joins (wave-2,
  // 2026-10-10): the corpus's headless admin op pins the ALLOWED arm's
  // action rows - the email lane's flat "" was the DENIED arm the
  // denial:blank config answers before any body runs).
  "subedit_notice",
  "list_of_changes",
]);
import type {
  HistoryActionCardInfo,
  HistoryRenderParams,
  HistoryRenderReader,
} from "./history/render-seam.js";

/** The views the render-time ACT-SEARCH seam loads for (updater-seam.ts):
 *  the ones whose bodies reach :updated_by. :box renders :box_bottom when
 *  `voo.show("box_bottom")` (card-mod-bar_and_box box.rb:13-15, the
 *  `= render :box_bottom` line of box.haml), :box_bottom renders
 *  `_render_updated_by` directly (history_board.rb:10-16), and
 *  :updated_by is itself a renderable view name (it is in the registry,
 *  so a caller may ask for it directly). A :titled / :open / :content
 *  render never touches the seam. */
const UPDATER_SEAM_VIEWS = new Set(["box", "box_bottom", "updated_by"]);

/** Views that render edit forms, whose content formgroups carry each real
 *  card's conflict tracker (card-mod-edit all/form.rb:27-31 view
 *  :conflict_tracker: `card.last_action_id`). */
const FORM_VIEW_PATTERN = /edit|board|bridge|form|overlay|modal/;

/** The views whose bodies read the render root's SELF-SET card through the
 *  rule walk (card-mod-edit editing.rb:50-52 edit_rules nests
 *  current_set_card). The rule-side warm (Card::Rule::Cache's request-cycle
 *  set-anchor load) covers them. */
const RULE_WARM_VIEWS = new Set(["edit_rules"]);
import type { UpdaterCardInfo, UpdaterRenderReader } from "./history/updater-seam.js";
import {
  FOLLOW_SEAM_VIEWS,
  prepareFollowRender,
  type FollowRenderBundle,
} from "./follow/follow-render-seam.js";
import { safeSetKeys } from "./render/set-keys.js";
import { referencedNames, scanNests } from "./render/nest-syntax.js";
import type { PatternCardInput } from "./set-patterns/types.js";
import { PATTERN_TABLE } from "./set-patterns/registry.js";
import type { PhantomItemType, SettingClassWithRules } from "./render/format.js";
import {
  readPermissionStatements,
  readPermissionStateFromViewerResults,
  PERMISSION_GATE_COUNT_STATEMENT_INDEX,
  canReadByStoredRule,
  canReadByRuleLookup,
  ANONYMOUS_VIEWER,
  anonymousIdFromResults,
  type ReadViewer,
  type ReadPermissionState,
} from "./permissions/index.js";
import {
  nameHasReadOverride,
  readPermissionOverride,
  updatePermissionOverride,
} from "./permissions/read-override.js";
import {
  allTaskVerdictsForCard,
  taskVerdictForCard,
  viewTaskPermissionStatements,
  viewTaskStateFromResults,
  type ViewTaskState,
  type WriteTask,
} from "./permissions/view-task-rules.js";
import { viewRequiresTask, type CrudTask } from "./permissions/view-perms.js";
import { installHelpRules, type HelpRulesApi } from "./render/help-popover.js";
import { setPrototypeTypeCode } from "./render/views.js";
import {
} from "./render/views.js";
import type { SQLQueryResult, SQLStatement } from "../server/driver.js";
import type { Lex } from "./fetch/lexicon.js";
import type { TokenRuntimeConfig } from "./auth/token.js";

export { UnsupportedViewError };
export { UnknownLayoutError };
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
/** The freshness-stamp read — the exact statement (one PK point SELECT) the
 *  render path pays per request. deck_data_version is bumped by AFTER
 *  triggers on cards + card_references (db/schema.sqlite.sql, the
 *  [ENGINE-FRESHNESS] block), so EVERY committed write moves it — same
 *  connection, another connection, another process, raw SQL or the write
 *  path — because the storage layer is the one place all committed writes
 *  cross. The render entry reads it ONCE per request and calls
 *  resetCaches() when it moved: no staleness window, no post-revocation
 *  leak (requirement:79). Warm-render cost: exactly ONE statement.
 *  Exported for the freshness suite's statement-identity pin. */
export const DECK_DATA_VERSION_STATEMENT =
  'SELECT "version" FROM "deck_data_version" WHERE "id" = 1';
export type { SettingClassWithRules } from "./render/format.js";

/** One entry of the engine's cold closure batch: either a statement to hand
 *  the storage layer, or the RESULT SET the content-version boot cache is
 *  serving in its place (render/boot-cache.ts). Both occupy a slot, and a
 *  slot's position is what the fixed-index parsers in render() read — which
 *  is why a hit and a miss produce the same foldedResults array. */
type ColdBatchSlot = SQLStatement | { readonly cachedResult: SQLQueryResult };

function isCachedColdSlot(slot: ColdBatchSlot): slot is { readonly cachedResult: SQLQueryResult } {
  return "cachedResult" in slot;
}

const SEARCH_TYPE_CODE = "search_type";

/** The codename of a bootswatch skin's `+parent` POINTER subcard -
 *  card-mod-bootstrap's set/type/bootswatch_skin.rb:37 declares
 *  `card_accessor :parent` (a trait), and bootswatch_skin.rb:57-59's
 *  `parent_skin_card` reads that TRAIT, i.e. the subcard whose right side
 *  is this codename's card. It is a codename, never a name: the deck's
 *  parent-pointer junction has right_id 45364, the card NAMED `parent 1`
 *  (corpus). See warmSkinParentPointer. */
const SKIN_PARENT_TRAIT_CODENAME = "parent";

/** The views whose body reaches Auth.createable_types (edit_type.rb:44-48
 *  type_field via :type_formgroup/:board_type_formgroup, wrapped by
 *  :edit_type/:edit_type_form; new.rb:128-152 new_view_type's
 *  new_type_permitted? = Card.new(type_id: card.type_id).ok? :create via
 *  :new_type_formgroup, reached from :new/:new_in_modal/:new_fields/
 *  :simple_new) — the prepare gate for ensureCreateableTypes. */
const CREATEABLE_TYPES_VIEWS = new Set([
  "edit_type",
  "edit_type_form",
  "type_formgroup",
  "board_type_formgroup",
  "new",
  "new_in_modal",
  "new_fields",
  "new_type_formgroup",
  "simple_new",
  // The rule-form surfaces whose bodies render the rule card's own
  // type_formgroup (rules.rb's form builder): rules.rb:51-66 rule_form/
  // rule_edit form + the setting-list quick-edit form (quick_edit.rb) and
  // the nest-rules board forms (nest_rules.rb) - the corpus's rule-form ops
  // reach the type select through these roots and the type select's option
  // list is Auth.createable_types (edit_type.rb:52-62 raw_type_options).
  "rule_edit",
  "rule_form",
  "overlay_rule",
  "modal_rule",
  "nest_rules",
  "modal_nest_rules",
  "quick_edit_setting_list",
  "quick_edit",
  "edit_rules",
]);
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
// search cards have type cards whose CARD NAME is arbitrary -- the deck
// gives its type cards generated names, not the human name -- so gating
// on typeName silently skips every corpus-shaped entry: the prepare
// phase never runs runSearch and the JSON-parse BadQuery never fires.
// Match by codename (the value the codehash lookup returns) for parity
// with the captured Ruby deck.
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

/** The search statement's own limit (cql_search.rb:85-87 card_content_limit
 *  = `cql_hash&.dig :limit`): the cql's `limit` key as number or numeric
 *  string, else undefined (the caller applies the html default 20). Ruby: 0
 *  is TRUTHY — `cql limit: 0` means unlimited, and `0 || super` keeps the 0
 *  (the engine's toIntOrZero(0) = unlimited, the same quirk). */
function searchCqlLimit(statement: Record<string, unknown>): number | undefined {
  const raw = statement["limit"];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "" && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }
  return undefined;
}

/** The set of patterns a setting card's children can carry (card-mod-rules
 *  set/type/setting.rb#set_classes_with_rules + card-mod-rules
 *  set/type/setting/core.haml:1-12): every rule whose right part is the
 *  setting's name is bucketed under one of these classes, in this order.
 *  Ruby walks ALL of `Pattern.concrete.reverse` — no pattern is excluded —
 *  and a class survives whenever rules_for_set_class finds rows: the
 *  oracle's *create Setting page carries `*star` and `*rstar` sections
 *  (the deck stores *star+*create / *rstar+*create rows, and the earlier
 *  rule/star/rstar exclusion dropped both sections from every *create
 *  page). The lookup order (PATTERN_TABLE) reversed gives Ruby's
 *  least-specific-first section order. */
const SETTING_CLASSES = PATTERN_TABLE;

/** The [[target]] wikilinks inside one content string, deduplicated by the
 *  caller's array (targets may repeat across cards). Target = the part
 *  before `|`, trimmed — the same bytes page.ts scanWarmDeps harvests (the
 *  page path's twin of this pass; the regex is kept byte-identical so both
 *  surfaces resolve the same target set). Explicit-target forms (leading
 *  `/`, `http(s):`, `mailto:`) never reach the named-anchor branch of
 *  renderLinkChunk, so they are not existence candidates. */
function collectLinkTargetNames(content: string, out: string[]): void {
  for (const match of content.matchAll(/\[\[([^\][\n]+?)\]\]/g)) {
    const target = (match[1] ?? "").split("|")[0]?.trim() ?? "";
    if (target === "" || /^(\/|https?:|mailto:)/.test(target)) continue;
    out.push(target);
  }
}

/**
 * The views whose body routes to `_render_core` / `render_core` — the only
 * bodies that can reach card-mod-layout set/self/head.rb:9-17 view :core
 * through a `{{...|core}}` nest. Ruby: card-mod-format set/all/base.rb:85-87
 * (:core), :89-95 (:content and :open_content both `_render_core`; the
 * comment at :113-116 spells out that they render core EXPLICITLY so core
 * overrides fire), :101-107 (:labeled_content / :titled_content
 * `render_core`), :120-128 (:titled `_render_core`, :open the alias of
 * :titled, :labeled `_render_labeled_content`, :closed the alias of
 * :labeled). :one_line_content is deliberately ABSENT: base.rb:97-99 wraps
 * its `render_core` in `with_nest_mode(:compact)`, where the nest renders
 * the head card’s :one_line_content, not its :core.
 */
const CORE_REACHING_VIEWS: ReadonlySet<string> = new Set([
  "core",
  "content",
  "open_content",
  "labeled_content",
  "titled_content",
  "titled",
  "open",
  "labeled",
  "closed",
]);

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

  /** THE SWEEP SURFACE (the sweep-cascade cut, the warmflood sweep-cut note
   *  2026-10-06): the keys seated during the CURRENT render call. Every
   *  prepare sweep that walks the whole render-card map is bounded to this
   *  set, and this set is cleared at the start of each render call (and by
   *  resetCaches()).
   *
   *  MEASURED MECHANISM IT CUTS: the sweeps' done-sets (structureProcessed,
   *  pointerListHostsDone, linkScanDoneKeys, ...) are engine-lifetime, but
   *  every sweep seats new cards AFTER the other sweeps' last pass of the
   *  render, so each render's chase seats (pointer items, link targets,
   *  wave seats, type-opt/template-junction targets) are the NEXT render's
   *  unprocessed surface. Their content refs then resolve one shell deeper
   *  into the corpus's connected lattice — measured (attribution probe,
   *  warmflood-attribution-run4/5.log): +875 / +1,325 / +1,284 fresh map
   *  cards per warm render at 370 / 551 / 500 trips, 100% of them outside
   *  the page's byte closure (bytes are slot-stable across map sizes 477 →
   *  3,961, so no view ever reads them). Bounding the sweeps to the
   *  render's own seats keeps every byte-critical behavior (render 1 and
   *  the post-reset render seat the whole closure, surface == map there)
   *  while the warm render's sweeps find nothing new to chase. */
  private renderSeats = new Set<string>();

  /** The page surface's prepare marker: renderPageBytes seats the layout
   *  closure AROUND its inner render() call, and those seats belong to the
   *  PAGE render's surface — not to whatever render() runs next. While set,
   *  render() does not clear renderSeats (renderPageBytes cleared it once,
   *  at its own start). */
  private pagePrepareDepth = 0;

  /** The page's HTTP status when the render decided one, as Ruby's
   *  `root.error_status` (card format.rb:34): format/error.rb:27-31
   *  view_for_denial sets 403 when the FOCAL (main) card's ROOT view is
   *  denied (`root.error_status = 403 if focal? && voo.root?`). A denied
   *  nested card does not set it. Cleared when a page render starts
   *  (beginPagePrepare); read by renderPageWithStatus. */
  pageErrorStatus: number | undefined = undefined;
  /** The page lane's body-render id_counter state, handed to the modal
   *  renders (render_outside_of_layout's render! continues the body
   *  render's numbering on the same root format — process_layout.rb:
   *  44-48; the pointer-input journeys' oracle pins the continuation).
   *  Request scope: overwritten by every page body render, read only by
   *  that request's modal sites. */
  pageRootIdCounter?: number;

  /** html/error.rb:200-204's @denied_task-nil arm — the loud denial's
   *  "to do that" wording for a CONTROLLER-rescue denial (a raised
   *  PermissionDenied carries no view-level denied task; the explicit-GET
   *  update alternative's renderErrorPage hook is that surface). Host scope:
   *  the error-page hook sets it before the render and clears it after (the
   *  page-lane prepare must not wipe a value the same render reads). */
  pageLoudDenialTaskPhrase: string | undefined = undefined;

  /** Open the page surface's prepare scope (see pagePrepareDepth): one clear
   *  of the sweep surface for the whole page render, its layout warm-ups
   *  included. Pair with endPagePrepare in a finally block. */
  beginPagePrepare(): void {
    this.pagePrepareDepth += 1;
    if (this.pagePrepareDepth === 1) this.pageErrorStatus = undefined;
    this.renderSeats.clear();
    if (this.sweepAllHeldCards) for (const key of this.renderCards.keys()) this.renderSeats.add(key);
  }

  endPagePrepare(): void {
    this.pagePrepareDepth = Math.max(0, this.pagePrepareDepth - 1);
  }

  /** M9 - bootswatch_skin new_customized_name's resolved answer, keyed by
   *  the skin card's canonical key. `name` is the answer itself (the card
   *  name the Customize button proposes); `asked` is every candidate the
   *  walk asked Card.exist? about, verbatim, so a save can invalidate
   *  exactly the decisions that consulted it and no others.
   *
   *  `Card.exist?` is a LIVE Ruby query (card/mod/core/set/all/states.rb:
   *  18-23 `real?` -> `quick_fetch`; fetch/retrieve.rb:34-40 `{ key:
   *  mark.key }`), and the customize_button view function is synchronous,
   *  so the query cannot live there - warmCustomizedName runs the walk in
   *  the async prepare phase and the view reads this memo.
   *  Cleared on resetCaches() and, per saved name, in expireRenderCard. */
  private customizedNameBySkinKey = new Map<
    string,
    { name: string; asked: readonly string[] }
  >();

  /** Save-side invalidation for the enriched render-card map: after a write,
   *  BOTH layers holding the pre-save row must drop it - the fetch layer's
   *  card cache (FetchEngine#expireName, the cache/all.rb#expire port) and
   *  this map, which is a TS render-perf structure with no Ruby counterpart
   *  (Ruby's expired Card objects simply re-fetch). Without the map drop a
   *  post-save page render serves the pre-save content forever (observed
   *  live). The next render re-fetches and
   *  re-enriches from the database row. */
  expireRenderCard(name: string): void {
    const key = DeckoName.parse(name ?? "").key;
    if (key !== "") {
      this.renderCards.delete(key);
      // The layout warm-up's engine-lifetime scan memory (warmupScannedKeys)
      // records that this card's content references were chased; a write
      // that drops the card invalidates that record, so a re-enriched card
      // gets its refs re-chased.
      this.warmupScannedKeys.delete(key);
      // The structure-content sweep's done-set is engine-lifetime for the
      // same reason — but its entry describes the MAP CARD the sweep
      // processed, and the expiry just deleted that entry. The re-fetch
      // seats a FRESH record (the stored row: Topic 002's db_content is
      // empty; the *structure template's content is what the sweep swaps
      // in), so the done-set entry must go too or the re-seated card skips
      // the sweep and renders its raw (empty) row content — the post-save
      // slot refresh of a structured card rendered a bare empty body
      // (edit-nested-summary-member's "topic after nested edit").
      this.structureProcessed.delete(key);
    }
    // M9: a save flips the Card.exist? verdict for exactly the stored name
    // it wrote. Drop every warmed decision that ASKED about that name, and
    // every decision whose answer IS that name (the save created the card
    // the button was about to propose). The comparison is on the verbatim
    // name string, not the canonical key: the walk's candidates are exact
    // strings, and key comparison would fold case across them.
    for (const [skinKey, answer] of [...this.customizedNameBySkinKey]) {
      if (answer.name === name || answer.asked.includes(name)) {
        this.customizedNameBySkinKey.delete(skinKey);
      }
    }
  }
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
  /** Seated paging records by search card key — the show_paging? == true
   *  case only ({limit, offset, count}; search-paging.ts header). Seated in
   *  runSearch alongside the items; read by the :card_list view's
   *   searchResultPaging seam. Cleared on resetCaches(). */
  private searchResultPagingMap = new Map<string, SearchResultPaging>();
  /** Seated counts by search card key, for a search whose cql declares
   *  `return: "count"`: Ruby's search_with_params answers an Integer and
   *  search_result_view (search_views.rb:6-13) renders :search_count
   *  instead of :card_list. Seated in runSearch; cleared on resetCaches(). */
  private searchCountResults = new Map<string, number>();
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
  /** The viewer actually resolved for the permission state — ANONYMOUS_VIEWER
   *  carries no actorId, but ensureReadPermission resolves the anonymous card
   *  id from the batch's codename rows (read-rules.ts) into THIS copy; the
   *  viewer key the own_account?/own_email? overrides compare against comes
   *  from its actorId. Cleared on resetCaches(). */
  private readViewer: ReadViewer | undefined;
  /** Memoized Auth.as_card.key (the readViewer actor card's canonical key) —
   *  resolved once per permission-state generation; undefined when the actor
   *  card is unresolvable. Cleared on resetCaches(). */
  private readViewerKey: string | undefined;
  private readViewerKeyResolved = false;
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
  /** The page-chrome session (Ruby Auth.current) — see RenderEngineLike.
   *  page.ts (decko.signed_in), navbar-views.ts (the *account_links
   *  branch) and format.ts (the loud-denial copy) read this, never the
   *  read-verdict viewer (Auth.as_id). Undefined = signed-out chrome (the
   *  corpus surface, byte-identical to the pre-session render). */
  pageSession: ReadViewer | undefined;
  /** Render a card that does not exist as Ruby does (Card.fetch name, new:
   *  {} — the controller's load_card), instead of throwing "card not
   *  found". A view renders through view_for_unknown (format/error.rb:
   *  18-25): the view's unknown setting or :unknown; a page's main card
   *  renders :new when the viewer may create it and :not_found otherwise
   *  (set/all/html/error.rb:81-87), and pageErrorStatus reports the 404.
   *  Off by default: the hosts map the thrown error to their own not-found
   *  response. */
  renderAbsentCards = false;
  /** The prepared signed-in *account_links navbar items (see
   *  RenderEngineLike.pageSessionAccountLinksHtml, the UNFILLED variant).
   *  Filled once per session actor by prepareSessionAccountLinks; survives
   *  across pages of the same engine (the chrome session does not change
   *  mid-engine; the ensure_roles fill rides the per-request flag, not the
   *  prepared strings). */
  private sessionAccountLinks: string | undefined;
  private sessionAccountLinksActorId: number | undefined;
  /** The prepared :my_card view body (the account_dropdown arm) — see
   *  RenderEngineLike.pageSessionMyCardHtml. */
  private sessionMyCardHtml: string | undefined;
  /** The FILLED :my_card variant (the ensure_roles read-fill applied — the
   *  hidden content field's value present). Baked alongside the unfilled
   *  string when the session's actor holds the roles nest; served once a
   *  render has already shown the roles nest once (below). */
  private sessionMyCardHtmlFilled: string | undefined;
  /** RenderEngineLike.pageSessionRolesDropdownHtml. */
  private sessionRolesDropdownHtml: string | undefined;
  /** The prepared signed-in *account_links navbar items, FILLED variant (the
   *  my_card roles nest inside it carrying the ensure_roles value). */
  private sessionAccountLinksFilledHtml: string | undefined;
  /** The session +*enabled_roles card's content fill, the port of
   *  set/right/enabled_roles.rb ensure_roles' STATE LIFETIME (probed live
   *  against the Ruby oracle on the real capture deck, 2026-10-11):
   *  checkbox_input calls card.ensure_roles at EVERY roles-nest render; the
   *  first call fills the blank session card's content AFTER the hidden
   *  content field is emitted, so the FIRST render shows the blank input
   *  and every later render of the same process reads the filled content.
   *  The mutated card object lives in Card::Cache, so the fill's lifetime
   *  is the CACHE's, not the request's: Card::Env.reset alone keeps the
   *  filled content (probed: a post-reset page renders FILLED), and
   *  Card::Cache.renew blanks it again (probed). The real-deck capture rig
   *  recorded exactly that (6,537 of 6,588 member pages carry the filled
   *  input; the 48 real-page exceptions are each capture process's FIRST
   *  page). The flag is therefore cache-scoped: cleared by
   *  resetRequestSession — the harness seam that stands for the Ruby rigs'
   *  fresh-process/Cache.renew boundary — never at render() entry, and
   *  flipped by the view fns AFTER they consume the roles-nest html
   *  (RenderEngineLike.markSessionRolesContentFilled). */
  private sessionRolesContentFilled = false;
  /** The fill's consumption WITHIN the current render pass (render() entry
   *  to render() exit). The page pipeline renders a page op in several
   *  passes (the prepare render, the main re-render); Ruby serves ONE
   *  render per request, so each pass reads the COMMITTED state and its
   *  own consumption — never an earlier pass's flip (the synthetic
   *  corpus's single-nest pages pin the navbar UNFILLED even though the
   *  prepare pass already consumed the nest; the real corpus's pages
   *  after the first pin FILLED from the committed state). Folded into
   *  the committed flag at the request boundary
   *  (commitSessionRolesFill, renderPageBytes' finally). */
  private sessionRolesFillConsumedThisPass = false;
  private sessionAccountLinksHasRoles = false;

  /** The render-time history seam bundle (src/card/history/render-seam.ts):
   *  set by prepareHistoryRender during a render whose view is one of
   *  HISTORY_SEAM_VIEWS, cleared at every render() entry. The sync history
   *  ViewFns read it through RenderEngineLike#historyRenderReader. */
  private historyReader: HistoryRenderReader | undefined;

  /** The current request's search parameters (HistoryRenderParams#search —
   *  search_params.rb: the query vars `Env.hash(params[:query])` and the
   *  paging offset). Set at every render() entry, cleared with the history
   *  seam's per-render reset; read by the search warm's statement merge and
   *  RenderEngineLike#searchKeyword. */
  private renderSearch: {
    vars?: Record<string, string>;
    offset?: number;
    term?: string;
    main?: string;
  } | undefined;

  /** The render-time search_box_complete seam bundle (card-mod-search
   *  set/self/search.rb:70-72 view :search_box_complete): the view fn is
   *  synchronous, so its request-term data (the goto-item search and the
   *  exact-card fetch) seats here during the async prepare phase, keyed to
   *  the one view that reads it, and clears at every render() entry like
   *  the other per-render seams. */
  private searchBoxCompleteData: SearchBoxCompleteSeat | undefined;

  /** The render root's key — the focal card. search_params' env arms
   *  (paging.rb:37-45 env_search_param) apply ONLY to the focal card's
   *  search (`return unless focal?`); the warm consults this key so the
   *  request's vars/offset reach the root's own search and no nested one. */
  private renderSearchFocalKey: string | undefined;

  /** The current request's new-card arguments (HistoryRenderParams#newCard):
   *  Ruby's params[:type] and card hash, read by the new-card views'
   *  new_type_preset? (card-mod-edit new.rb:142-144). Set at every render()
   *  entry. RenderEngineLike#requestNewCard. */
  requestNewCard: NewCardOptions | undefined;

  /** The render-time ACT-SEARCH seam bundle (src/card/history/updater-seam.ts):
   *  set by prepareUpdaterRender during a render whose view is one of
   *  UPDATER_SEAM_VIEWS, cleared at every render() entry. The sync
   *  :updated_by ViewFn reads it through
   *  RenderEngineLike#updaterRenderReader. */
  private updaterReader: UpdaterRenderReader | undefined;

  /** The render-time follow seam bundle (src/card/follow/follow-render-seam.ts):
   *  set by prepareFollowRender during a render whose view is one of
   *  FOLLOW_SEAM_VIEWS, cleared at every render() entry. The sync follow /
   *  account ViewFns read it through RenderEngineLike#followRenderBundle.
   *  The session half is the EXPLICIT ACTOR BOUNDARY (Ruby Auth.current):
   *  the seam resolves it from engine.pageSession only — never a global,
   *  never the read-verdict viewer. */
  private followBundle: FollowRenderBundle | undefined;

  /** The card-mod-history action-level ContentDiff memo - the port of
   *  Differ's @content_diff_object ivar (differ.rb:79-86), which lives on
   *  the CACHED Action record and therefore outlives a single render: the
   *  first view render of an action builds the diff and checks
   *  summary_omits_content? BEFORE rendering the summary (Ruby reads nil),
   *  later renders of the same action see the rendered state (the capture
   *  pins both shapes). Engine-lifetime = the Action-record lifetime for
   *  the bare view path; resetCaches() clears it with the rest. */
  readonly historyDiffMemo = new Map<number, import("./history/content-diff.js").ContentDiff>();
  /** The deck's CDN/asset host for carrierwave cloud images (A-30 — see
   *  RenderEngineLike.imageCdnHost). Host-deployment config; undefined =
   *  host-relative /files URLs. */
  imageCdnHost: string | undefined;
  /** The deck's PHANTOM item type — the type an unknown (record-less)
   *  pointer/list item carries when no host item type resolves one.
   *
   *  WHY IT IS CONFIGURATION: in Ruby this is the deck's own
   *  `*all+*default` template type —
   *  `Card.fetch(name, new: {})`, whose type_id comes from the deck's rule
   *  row (states.rb:44-50 + the *default template chain). It is a property
   *  of the DECK, not of the engine: one corpus's `*all+*default` names a
   *  BasicCs type card, and hard-coding that id/name/key made every other
   *  deck's unknown items render another deck's type chip and data attrs.
   *
   *  undefined = no phantom type configured, and the unknown item renders
   *  with NO type chip and NO type attributes — the shape a deck with no
   *  `*all+*default` rule produces (Ruby: the template walk answers nil, so
   *  the new card carries no type at all). A deck that HAS such a rule
   *  configures this at boot with its own type's id, name and key. */
  phantomItemType: PhantomItemType | undefined;
  /** The Auth::Token runtime config — the HMAC secret the account
   *  verify_url / reset_password_url links are signed with
   *  (card-1.110.0/lib/card/auth/token.rb:7 reads Rails' secret_key_base;
   *  src/card/auth/token.ts takes it per call because there is no Rails
   *  credentials object in this engine). Host-deployment config: same shape
   *  and same reason as imageCdnHost above and the CSRF secret
   *  (src/server/write-routes.ts WriteRouteContext.csrfSecret) — the HOST
   *  owns the secret, the engine never stores or defaults one, and an unset
   *  field makes a token call fail loudly rather than sign under a
   *  repo-pinned key. vm-staging-server.mjs pins it from DECKO_TOKEN_SECRET
   *  with a per-boot random fallback, the way it pins DECKO_CSRF_SECRET.
   *  undefined = no token links are mintable. */
  tokenConfig: TokenRuntimeConfig | undefined;
  /** Cardio.config.file_storage's port (card-mod-carrierwave
   *  set/abstract/attachment/01_storage_type.rb:75-79
   *  storage_type_from_config): the attachment-storage default the deck is
   *  configured with. Read LIVE by the file :input view's no_upload? gate
   *  (web.rb:1-3); undefined = the deck default :local (the oracle's
   *  config_file_storage_default). Host-deployment config. */
  fileStorage: "local" | "web" | "cloud" | "coded" | undefined = undefined;
  /** Codename ids the rule? predicate compares against (SettingID/SetID/
   *  UserID, resolved from the codename codehash). Folded into the cold
   *  render's closure batch (zero extra round trips); undefined until
   *  then. Cleared on resetCaches(). */
  private ruleTypeIds:
    | { setting: number | undefined; set: number | undefined; user: number | undefined }
    | undefined;
  /** Keys of COMPOUND cards whose set keys were computed while ruleTypeIds
   *  was still undefined — exactly the enrichment state where the RULE
   *  pattern's applies? cannot answer and safeSetKeys writes the set keys
   *  WITHOUT the bare RULE token (06_rule.rb; the corpus's rule-page
   *  key-order family). The rule set-key repair below re-derives those
   *  cards' set keys once the ids exist, then clears this record, so the
   *  repair's gate is the HAZARD itself ("cards seated before the ids
   *  folded") rather than the ids' temperature: the help resolver
   *  (help-popover.ts prepare) memoizes ruleTypeIds during the mod
   *  prepare phase — BEFORE the first render — while the boot-time rule
   *  cache (card-mod-rules prepareRuleCache, earlier in the same prepare
   *  phase) has already enriched the deck's rule cards without them.
   *  Gating on ruleTypeIds === undefined there skipped the repair forever
   *  and left every deck-created rule card's page slot one token short
   *  (the 118 pinned corpus ops this field retires). Cleared on
   *  resetCaches() beside ruleTypeIds (the map the keys point into is
   *  dropped with it). */
  private setKeysPendingRuleTypes = new Set<string>();
  /** existing-rule resolution for VIRTUAL rule cards — the port of
   *  card-mod-rules set/rule/editor.rb:119-131 find_existing_rule_card
   *  (`new_card? ? existing_rule_from_prototype : self`): for a rule card
   *  with no stored row, `existing_rule_card` is the prototype's winning
   *  stored rule for the same setting. The prototype's candidate walk and
   *  the SET card's own walk land on the same first-existing stored rule
   *  for every anchored/anchorless set in this corpus (the prototype's
   *  extra SELF candidate never stores a row for the *dummy/nameless
   *  members), so the resolution runs from the set card's pattern input
   *  during preloadVirtualRuleVerdicts and the sync bar renderer reads
   *  the memo. Keys are virtual rule-card keys ("set+*setting");
   *  populated only for settings whose virtual card actually renders.
   *  Cleared on resetCaches(). */
  private existingRuleCards: Map<string, RenderCard> | undefined;
  /** Set-card ids whose rule environment preloadSetRules has fully
   *  populated since the last resetCaches(): stored rule children
   *  enriched, *all setting cards loaded, per-setting virtual verdicts
   *  and existing-rule memos populated. The deck is static and every
   *  pass inside the preload is skip-if-present, so re-running them on
   *  a warm render of the same set card only re-does identical work —
   *  the dead renderCards map scan, the left_id SQL query, the child
   *  re-enrichment and the full setting-group loop that made warm
   *  set-card renders ~2x an earlier warm medians. Keyed by card id
   *  (R16's corrected test: stored children carry
   *  record.leftId === setCard.id, not a name-key match), so the first
   *  render of each set card always runs the full preload and every
   *  later warm render skips it. Cleared on resetCaches() so a
   *  whole-engine reset re-preloads exactly as the first render does. */
  private setRulePreloadDoneIds: Set<number> | undefined;
  /** *structure rule templates by rule-card composed key -> the rule card's
   *  db_content (null = NULL content). The bulk universe rides the cold
   *  render's closure batch (one statement, zero extra round trips — the
   *  #1282 shape); structured content (content/all.rb:8-10:
   *  structured_content || standard_content) is then pure memory. Undefined
   *  until the first parse. Cleared on resetCaches(). */
  private structureContents: Map<string, string | null> | undefined;
  /** The structure universe's rule cards' own type_id by composed rule key
   *  (parsed from the SAME universe batch as structureContents). The sync
   *  virtual-left-type resolution reads it (virtualLeftTypeName): a nest
   *  whose left card is itself virtual ("X+*type" -> Set) needs the left's
   *  template-chain type AT CLASS-BUILD TIME, before the async enrichment
   *  lands it in the render map. Cleared on resetCaches(). */
  private structureRuleTypes: Map<string, number> | undefined;
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
   *  type_id) — the new-child template machinery. Ruby resolves a
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
  /** composed *default rule key -> the rule card's db_content (the
   *  content/all.rb:17-19 standard_content's
   *  new_card branch — a nest-miss new card's content IS the *default
   *  rule's content; the oracle's discussion-page titled-view
   *  body is the discussion+*right+*default's `<p> </p>` x2 verbatim). Parsed
   *  from the SAME universe rows the types ride (structureUniverseFromResults
   *  over the default result). Cleared on resetCaches(). */
  private defaultRuleContents: Map<string, string | null> | undefined;
  /** type_id -> type card NAME for the *default universe's referenced types
   *  (the data-card-type-name attribute + safeSetKeys TYPE anchor input for
   *  the new-child card). One batched id query, once per engine. Cleared on
   *  resetCaches(). */
  private defaultTypeNameById: Map<number, string> | undefined;
  /** ok_to_<task>? state for the non-read view tasks — loaded once per
   *  engine, on the first render whose ROOT view demands a non-read task
   *. Cleared on resetCaches. */
  private taskState: ViewTaskState | undefined;
  /** auth/permissions.rb:18-26 Auth.createable_types — the sorted cardtype
   *  names the viewer's create verdict admits ([] until precomputed by
   *  ensureCreateableTypes, which the type-editor views' prepare gate
   *  fires). Cleared on resetCaches(). */
  private createableTypesCache: string[] | undefined;
  /** card key -> allowed verdicts per write task (the ensureVerdicts
   *  model; undefined entries mean unverifiable). Cleared on resetCaches(). */
  private taskVerdicts = new Map<string, Record<WriteTask, boolean | undefined>>();
  /** Unknown (fetch-miss) cards whose create verdict a render asked for
   *  before any prepare step computed it — the createable gate of the
   *  :unknown / :mini_unknown views (card-mod-format set/all/html/error.rb
   *  `card.ok?(:create) ? yield : ""`) on nest targets no prepare walk
   *  collects (pointer items rendered by the navbar views, for one). The
   *  render entry points compute these after the render and render again
   *  (renderWithUnknownCreateVerdicts), so the second pass reads Ruby's
   *  verdict; warm renders find them memoized in taskVerdicts. */
  private unknownCreateMisses = new Map<string, RenderCard>();
  /** Nesting depth of renderWithUnknownCreateVerdicts: only the outermost
   *  entry point settles misses and re-renders. */
  private unknownCreateRenderDepth = 0;
  /** Card key -> the can_configure? verdict for each seated card that
   *  nests configure_button (update-ok on `<card>+*type+*structure`,
   *  cardtype.rb:57-59).
   *  Precomputed in the prepare phase (ensureConfigureVerdict) so the
   *  synchronous configure_button permission gate resolves the predicate
   *  without queries. Cleared on resetCaches(). */
  private configureVerdicts = new Map<string, boolean | undefined>();
  /** Card keys ensureConfigureVerdict has checked and found not to nest
   *  configure_button, so repeated warms skip the structure resolution.
   *  Cleared on resetCaches(). */
  private configureChecked = new Set<string>();
  /** Host card key -> the resolved item type for the card's rendered item
   *  slots ({typeName, typeId}), or undefined once resolved-and-nil. The
   *  port of Ruby's item-type chain (card-mod-collection set/all/item.rb
   *  item_type_id/name -> set/abstract/items.rb:5-11 options_card walk ->
   *  card-mod-search cql_search.rb:14-19 cql :type), resolved once per host
   *  in the prepare phase (resolveHostItemTypeName) and read synchronously
   *  by the item-slot emitters (views.ts renderPointerListItem /
   *  cardListView). Cleared on resetCaches(). */
  private itemTypeNameByHostKey = new Map<
    string,
    { typeName: string; typeId: number } | undefined
  >();
  /** The UNKNOWN pointer/list items' precomputed permission verdicts, keyed
   *  `"${hostKey}|${itemKey}"` (see ensurePointerItemVerdicts). Ruby builds
   *  the fetch-miss phantom FRESH PER NEST (Nest::Fetch#new_card ->
   *  Card.fetch name, new: new_card_args — nest/fetch.rb), so the same
   *  unknown name under two hosts carries TWO verdicts: the verdict input's
   *  type is THAT nest's folded item type (determine_item_view_options_type
   *  folds the rendering host's item_type_name only for its own nest), and
   *  one host's fold must never answer another host's item slot — the
   *  per-item-only keying let a pointer host that folds to Person
   *  pre-empt the RVW List's untyped BasicCs verdict and render a person
   *  card readable where the oracle denies.
   *  Cleared on resetCaches(). */
  private pointerItemVerdicts = new Map<
    string,
    { read: boolean; create: boolean | undefined }
  >();
  /** Item keys whose verdict already seeded the deck-global verdict maps
   *  (deniedVerdictsByKey / taskVerdicts) — first-wins, the exact seeding
   *  semantics the per-item-only keying produced before the per-host key
   *  (the global maps' consumers — isDenied / taskAllowed on surfaces
   *  outside the pointer-item slot — keep their pre-change bytes). Cleared on
   *  resetCaches(). */
  private pointerItemGlobalVerdictDone = new Set<string>();
  /** The modeled `Cardio.config.default_html_view` render surface (R17, A-36
   *  correction): "content" while a PAGE render is active — the production
   *  config value the page capture applies
   *  (capture-dual-$1page-and-view.rb:314, the capture's
   *  production-equivalent setting #5) — "titled" otherwise, the railtie
   *  default
   *  (card-mod-format lib/card/mod/format.rb:2) under which the BARE render
   *  capture (surface V, the old-capture dev boot) ran. Ruby reads process
   *  config per call (html.rb:17-19), never a deck rule; the corpus's
   *  `*all+*default html view` rule card 22769 is dead in 0.20.0. The flag
   *  is byte-safe across interleaved renders because resolveView memoizes
   *  VIEW FUNCTIONS, never rendered bytes. Not cached: the flag toggles per
   *  render surface. */
  private pageConfigActive = false;
  /** The help-rule resolver (menu popover content) — attached once per
   *  engine by installHelpRules; its deck-wide batch runs once in the
   *  prepare phase. format.ts reads engine.helpRules. Cleared on
   *  resetCaches(). */
  helpRules?: HelpRulesApi;
  private helpResolver: ReturnType<typeof installHelpRules> | undefined;
  private lastPrefetch: PrefetchStats | undefined;
  /** view-fail class V4 (links.rb:140-144 add_known_or_wanted_class): the
   *  cards whose dbContent the link-target warm pass has already scanned
   *  for [[wikilink]] targets (once per engine per card; the deck is static
   *  on the read surface). */
  private linkScanDoneKeys: Set<string> | undefined;
  /** The core mod admin-runtime build's once-per-engine guard (see
   *  ensureCoreAdminRuntime). resetCaches re-arms it. */
  private coreAdminRuntimeEnsured = false;
  /** The last observed deck_data_version (the committed-write stamp, bumped
   *  by storage-layer triggers on cards + card_references). Baseline is set
   *  on the engine's FIRST render — folded into the cold closure batch, +0
   *  round trips — and compared on every later render at the render entry
   *  (exactly ONE standalone statement); a move fires resetCaches() so a
   *  warm runtime serves the committed state with no staleness window and a
   *  revoked read is never served from a cached verdict (delivery
   *  contract:79). Deliberately NOT cleared by resetCaches(): it is the
   *  comparison baseline, not a derived cache. */
  private deckDataVersion: number | undefined;

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
   * Render one view of one card to HTML bytes (Ruby's to_s-ing consumer of
   * the view answer). Throws UnsupportedViewError for views outside the
   * ported registry (the captured sentinel contract). The RAW boundary -
   * integers (:id, the token-days views) and nil (the early-return arms)
   * surviving as numbers/null, exactly what Ruby's format.render returns -
   * is renderRaw(); the reference harness records through it.
   */
  async render(cardName: string, view: string, params: HistoryRenderParams = {}): Promise<string> {
    return str(await this.renderRaw(cardName, view, params));
  }

  /**
   * Ruby's card.format.render(view): the view block's value verbatim. The
   * render API boundary the corpus adapter records through - every OTHER
   * consumer of a view answer (HTML assembly, caches) interpolates through
   * Ruby's to_s (str()).
   */
  async renderRaw(cardName: string, view: string, params: HistoryRenderParams = {}): Promise<ViewResult> {
    // One render is one request: hold the Temporary caches so no
    // within_key_counts reset drops an entry this render seated before its
    // synchronous readers use it (TemporaryCache#hold). Nested inside a
    // page render the page's own hold is already open; holds nest.
    const releaseCaches =
      typeof this.fetcher?.holdTemporaryCaches === "function" ? this.fetcher.holdTemporaryCaches() : () => {};
    // The name memos' request scope (DeckoName.beginRequestScope); nested
    // inside a page render it joins the page's scope.
    DeckoName.beginRequestScope();
    try {
      return await this.renderWithUnknownCreateVerdicts(() => this.renderHeld(cardName, view, params));
    } finally {
      DeckoName.endRequestScope();
      releaseCaches();
    }
  }

  private async renderHeld(cardName: string, view: string, params: HistoryRenderParams): Promise<ViewResult> {
    // THE SWEEP SURFACE reset: this render's sweeps chase only what THIS
    // render seats (the sweep-cascade cut — renderSeats' doc). The page
    // it clears once for the whole page render (beginPagePrepare), so
    // its inner render() leaves the layout warm-ups' seats in scope.
    if (this.pagePrepareDepth === 0) this.renderSeats.clear();
    // The chrome session's account-links data (the *account links views'
    // and the navbar's prepared items): Ruby reads Auth.current live on
    // every render; the port prepares once per actor. The page lane calls
    // this ahead of the sync layout render (page.ts); the bare view lane
    // prepares here so a direct *account links view render (the corpus's
    // view ops) sees the signed-in items, not the signed-out pair.
    // Memoized per actor; a no-op for signed-out sessions.
    await this.prepareSessionAccountLinks();
    // Ruby's Rule::Cache.read: populated on first rule lookup, so the sync
    // view half can answer find_existing_rule_card's rule-cache walk
    // (one deck-wide query per engine lifetime, cleared on writes).
    await this.ensureRuleCacheSetLabels();
    // THE ONE-TRIP SEAT (stamp-as-column lane, 2026-10-06 — spec §c): moved
    // ABOVE the freshness gate because on this posture the seat's HEAD
    // statement IS the render's stamp read — deck_data_version rides the
    // head as a column of the same snapshot that carries the plan payload
    // and the member list (consistent by construction; a write between
    // renders moves the version the NEXT head read sees). The seat itself
    // runs the stamp-move branch BEFORE seating anything from the payload
    // (the callback below), so a moved stamp recomposes the caches and
    // never discards a payload seated moments earlier — the same guarantee
    // the gate-first order gave, now enforced inside the seat.
    let seat: OneTripSeatResult | undefined;
    const runSeat = async (): Promise<OneTripSeatResult | undefined> =>
      !this.liveRequest && oneTripWantsPayload()
        ? await seatOneTripPayloadForRender(cardName, this.fetcher, {
            lastSeenVersion: this.deckDataVersion,
            onStampMove: async (observed) => {
              this.resetCaches();
              // The one-trip SEAT STATE is cache state too (the per-viewer seat,
              // 2026-10-06): the armed plan's in-memory results and the seating
              // memo predate the moved stamp. Left armed/memoized, this render
              // answers matched reads from pre-move rows and the seat never
              // re-fetches (measured at base: 397 live trips, 0 seat fetches,
              // partial stale-arm answers). Dropped here, the seat completes its
              // recomposition from the store as it now stands. (The explicit
              // disarm is redundant with FetchEngine.resetCaches()'s own disarm
              // — kept: it is what the seat posture pin observes, and it holds
              // under any future reset path that loses the in-reset one.)
              this.fetcher.replayRouter.disarmRenderPlan();
              invalidateSeatedPagePayloads(this.fetcher);
              // The BOOT-LIFETIME state is cache state too (same pass): the reset
              // wiped the codename registry's bulk load, and without this re-prime
              // the post-reset render degrades to per-lookup live name reads
              // (measured: 340 trips vs the 7-trip seated floor — worse than the
              // 177-trip fresh ladder, because a fresh boot re-primes and this
              // path did not). One batched statement, once per version move.
              await this.fetcher.reprimeBootState();
              this.deckDataVersion = observed;
            },
          })
        : undefined;
    seat = await runSeat();
    // Freshness gate (requirement:79): any render that could serve
    // warm bytes reads the deck's committed-write stamp FIRST and clears
    // every derived cache when a committed write moved it. On the one-trip
    // path the seat's head column already carried that live stamp (and ran
    // the move branch itself), so the comparison below consumes the column
    // with zero extra round trips; every other path (gate OFF, seatless
    // page, memo-hit warm re-render — a memo hit fetches no head, so its
    // stored stamp is seat-time state, never current-at-read) reads the
    // stamp live exactly as before, one statement. The engine's first render
    // has no warm state to protect; its baseline arms from the seat's
    // column, or — when no seat ran — from the cold closure batch below
    // (stampCold), so the cold ROUND-TRIP count is unchanged and a warm
    // render's total cost is exactly this one statement. After a
    // version-triggered reset the render below proceeds over empty caches
    // and reads storage end to end, which is what makes the four committed-
    // mutation kinds (content edit, nested dependency, rule, access
    // revocation) visible on the very next request — including the
    // revocation case, where the invalidated object is a cached permission
    // verdict.
    if (this.deckDataVersion !== undefined) {
      const observed = seat?.deckDataVersion ?? (await this.readDeckDataVersion());
      if (observed !== this.deckDataVersion) {
        this.resetCaches();
        this.fetcher.replayRouter.disarmRenderPlan();
        invalidateSeatedPagePayloads(this.fetcher);
        // The BOOT-LIFETIME re-prime (see the seat callback above): same
        // reset tail for the gate's own move detection (memo-hit warm
        // renders read the stamp live; a move here discards the memoized
        // payload).
        await this.fetcher.reprimeBootState();
        this.deckDataVersion = observed;
        // THE SAME-RENDER RE-SEAT (the seat seat's recomposition contract,
        // pinned by signed-in-seat-posture): the invalidated payload
        // belonged to the pre-move state, so re-seat from the store as it
        // now stands — the baseline adopted above is the fresh comparison
        // value, and a second move mid-render fires the callback again
        // (each move costs one reset, bounded by writes). The fresh seat
        // result replaces this render's gate column and gate-count rows.
        seat = await runSeat();
      }
    } else if (typeof seat?.deckDataVersion === "number") {
      // First render, seat-carried baseline: the stampCold fold below is
      // skipped (the baseline is already armed from the head's column).
      this.deckDataVersion = seat.deckDataVersion;
    }
    // THE BOOT-CACHE VERSION PROBE (render/boot-cache.ts). ONE statement —
    // or ZERO on the one-trip path: the seat's head column already carried
    // the committed-write stamp this render (the same row this probe reads),
    // so a warm boot's probe consumes the column and the boot's only trips
    // are the bundle's (the stamp-as-column pass folds the probe, one-trip
    // build change, $1). Only on this engine's FIRST render, and only
    // once the process already holds a boot bundle to compare against: with
    // nothing to compare, a probe cannot hit, so a process's first engine
    // reads the boot read-set from storage exactly as it always has and pays
    // nothing extra. A memo-hit seat fetches no head and reports no column,
    // so the probe falls back to its own statement there.
    //
    // It rides the root fetch's round trip (Promise.all below): +1 statement,
    // +0 round trips. It is the check the cache's correctness rests on — a
    // bundle is served only when the committed-write stamp it was read at is
    // still the stamp storage reports — so it is NOT skippable, and a
    // database with no stamp throws here rather than rendering.
    const bootProbe =
      !this.bootProbeIssued && bootCacheIsWarm(this.fetcher.driver)
        ? seat?.deckDataVersion !== undefined
          ? Promise.resolve(seat.deckDataVersion)
          : readBootContentVersion(this.fetcher.driver)
        : undefined;
    this.bootProbeIssued = true;
    const [found] = await Promise.all([this.fetcher.fetchByName(cardName), bootProbe]);
    if (bootProbe !== undefined) this.bootProbeVersion = await bootProbe;
    const record = (found === undefined || found.isNew === true) && this.renderAbsentCards
      ? await this.fetcher.fetchByName(cardName, { new: params.newCard ?? {} })
      : found;
    if (record === undefined || record.name === undefined) {
      throw new Error(`card not found: ${cardName}`);
    }
    const name = record.name;
    // An absent card is built from this request's arguments: a render card
    // an earlier request seated under the same name (another type, say) is
    // not this one.
    if (record.isNew === true && this.renderAbsentCards) this.renderCards.delete(name.key);
    // The render-time history seam state is per-render: a render whose view
    // is not one of the history views must not see a previous render's
    // bundle (render-seam.ts documents the seam boundary). Same for the
    // act-search (updater) seam.
    this.historyReader = undefined;
    this.updaterReader = undefined;
    this.searchBoxCompleteData = undefined;
    this.requestNewCard = params.newCard;
    this.renderSearch = params.search;
    this.renderSearchFocalKey = name.key;
    // The fill's PER-PASS consumption state resets here: a render() call is
    // one Ruby request-shaped pass (the page pipeline runs several passes
    // per page op — the prepare render and the main re-render — and Ruby
    // has exactly ONE render per request, so each pass must start from the
    // COMMITTED fill state, never from the previous pass's flip). The
    // committed state itself is NOT cleared here: its lifetime is the card
    // cache's (the field note's live-oracle probe: Card::Env.reset alone
    // keeps the filled content; only the harness's Cache.renew boundary —
    // resetRequestSession — blanks it). commitSessionRolesFill folds the
    // pass's consumption into the committed state at the request boundary.
    this.sessionRolesFillConsumedThisPass = false;

    // Read-permission preparation (see src/card/permissions/). On a cold
    // render the state resolution rides the prefetch batch (one round trip
    // stays one round trip); on a warm closure it runs as its own batch —
    // once per engine, never per warm render. The codename codehash (the
    // rule? predicate's type-id source) folds into the same batch.
    const permissionCold = this.readPermission === undefined;
    // THE GATE-COUNT ARM (the stamp-as-column change): when the seat's head
    // carried the permission gate-count's row (statement index
    // PERMISSION_GATE_COUNT_STATEMENT_INDEX — a zero-bind, viewer-
    // independent statement, spec §a.4's "settings count" arm), that slot
    // carries the carried result and the statement is never issued. The
    // cold batch's live discharge — the replay router forwards only its
    // unmatched members, and skips the wire at zero misses — loses its last
    // member, and with the stamp consumed from the head column the
    // count+stamp trip drops 1 -> 0 (the D3 floor's fifth trip).
    const seatGateRows = permissionCold ? seat?.permissionGateRows : undefined;
    const permissionStatements = permissionCold ? readPermissionStatements(this.viewer) : [];
    const permissionSlots: ColdBatchSlot[] = permissionStatements.map((stmt, i) =>
      i === PERMISSION_GATE_COUNT_STATEMENT_INDEX && seatGateRows !== undefined
        ? { cachedResult: seatGateRows }
        : (stmt as ColdBatchSlot),
    );
    const ruleTypesCold = this.ruleTypeIds === undefined;
    const structureCold = this.structureContents === undefined;
    // The head read-set rides THIS batch rather than a query of its own:
    // the head prefetch is a cold-path pass, and the cold path already
    // owns a batch vehicle, so folding it in costs ZERO extra round trips
    // (the query-count gates in junction-depth-closure /
    // render-engine / depth-sweep pin the cold shape at 3-4 round trips
    // and stay where they are). Its result index is
    // HEAD_STATEMENT_INDEX below, which is a function of the three
    // conditionals above it — read that comment before reordering.
    const headReadsCold = !this.headReadsWarmed;
    // The freshness-stamp baseline: on the engine's FIRST render (no warm
    // state exists, nothing to protect) the stamp read folds into the cold
    // batch below — +1 statement, +0 round trips. Every later render reads
    // it standalone at the render entry (see the gate at render() top).
    const stampCold = this.deckDataVersion === undefined;
    let foldedResults: SQLQueryResult[] | undefined;
    if (!this.closureWarm(record)) {
      // THE BOOT READ-SET, OR THE CONTENT-VERSION CACHE'S COPY OF IT.
      //
      // Three of the entries below are FIXED statements whose rows depend on
      // nothing but the deck's content — the codename codehash, the template
      // type-name fold and the head read-set. When the process holds a bundle
      // whose committed-write version still matches storage
      // (render/boot-cache.ts), those three entries carry the bundle's RESULT
      // SETS instead of statements: they cost zero queries and are consumed
      // by the same parsers a live result is consumed by, so nothing
      // downstream can tell the difference.
      //
      // WHY AN ARRAY OF SLOTS RATHER THAN A CONDITIONAL STATEMENTS ARRAY:
      // the parsers below read folded results by FIXED INDEX
      // (parseRuleTypeIds by permissionStatementCount, parseStructureContents
      // by a slice, the head by its own arithmetic). Splicing the cached
      // results back at their original positions is what keeps those indices
      // true — a hit and a miss then produce the same foldedResults array,
      // and the index comments below stay accurate without restating them.
      const bootHit =
        this.bootProbeVersion === undefined
          ? undefined
          : bootBundleForVersion(this.fetcher.driver, this.bootProbeVersion);
      const coldSlots: ColdBatchSlot[] = [
        // The permission slots, with the gate-count slot carrying the seat
        // head's column result when it rode the seat (never issued — the
        // splice preserves the slot order the fixed-index parsers read).
        ...permissionSlots,
        ...(ruleTypesCold
          ? bootHit !== undefined
            ? [{ cachedResult: bootHit.codehash }]
            : [this.fetcher.codenames.codehashStatement()]
          : []),
        // The *structure rule universe (one statement; the structured-content
        // resolution reads it as pure memory afterwards) + the *default rule
        // universe (the new-child type source, same statement shape).
        // Appended LAST: the permission state parser reads folded results
        // by fixed index, and parseStructureContents slices past the
        // permission + codename statements to find the pair in order.
        // (R17 removed the *default html view universe that rode slot +2:
        // Ruby's default_nest_view reads process CONFIG — html.rb:17-19 —
        // never a deck rule; the engine models it as the pageConfigActive
        // pass flag instead.)
        ...(structureCold
          ? [structureRuleUniverseStatement(), defaultRuleUniverseStatement()]
          : []),
        // The template TYPE-NAME read (both universes' rule-card types
        // joined to their type cards' names — newCardDefaultType's
        // dup_structure leg answers a *structure rule card's own type and
        // must resolve its NAME synchronously; an IN-list would need the
        // universe rows first, so this is a self-contained JOIN). Rides the
        // cold batch: +1 statement, +0 round trips (the p20-email
        // prelude-prime precedent).
        ...(structureCold
          ? bootHit !== undefined
            ? [{ cachedResult: bootHit.typeNames }]
            : [templateTypeNameStatement()]
          : []),
        // The head read-set, appended after every slot the parsers above
        // index into, so the head's index is stable at
        // permissionStatements.length + (ruleTypesCold ? 1 : 0)
        //                             + (structureCold ? 3 : 0).
        ...(headReadsCold
          ? bootHit !== undefined
            ? [{ cachedResult: bootHit.headReads }]
            : [headViewReadStatement()]
          : []),
        // The freshness-stamp baseline rides LAST: the fixed-index parsers
        // above (permission by 0..n, structure by slice) read only the
        // prefix, so appending is fold-safe (same shape as the R17 removal
        // note). Parsed by parseDeckDataVersion right after the batch —
        // its index is the one below, a function of every conditional
        // above it (recomputed for the composed batch in the
        // the lineage reconciliation).
        ...(stampCold
          ? [{ sql: DECK_DATA_VERSION_STATEMENT, params: [] as unknown[] }]
          : []),
      ];
      const coldStatements = coldSlots.filter(
        (slot): slot is SQLStatement => !isCachedColdSlot(slot),
      );
      const stats = await prefetchInclusionClosure(record, {
        driver: this.fetcher.driver,
        lexicon: this.fetcher.lexicon,
        writeToCache: (cached) => this.fetcher.writeToCache(cached),
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
        ...(this.skipRootClosureWalk && record.key === this.skipRootClosureKey ? { skipClosureWalk: true } : {}),
      });
      this.lastPrefetch = stats;
      // Splice the cached results back beside the executed ones, in slot
      // order, so `foldedResults` has exactly the shape every parser below
      // indexes by — whether this boot was a hit or a miss.
      {
        const executed = stats.additionalResults;
        let cursor = 0;
        foldedResults = coldSlots.map((slot) =>
          isCachedColdSlot(slot) ? slot.cachedResult : (executed as SQLQueryResult[])[cursor++],
        );
      }
      // The rule ids must be memoized BEFORE enrichment: enrichAndStore
      // computes set keys (the RULE pattern's applies?) synchronously from
      // them. Sliced past the permission statements the batch also carried.
      if (ruleTypesCold) await this.parseRuleTypeIds(foldedResults, permissionStatements.length);
      this.parseStructureContents(
        foldedResults,
        permissionStatements.length + (ruleTypesCold ? 1 : 0),
      );
      // The template type-name rows, consumed from the same batch (only
      // pushed when structureCold — same condition as the slot below).
      if (structureCold && this.defaultTypeNameById === undefined) {
        const nameIndex =
          permissionStatements.length +
          (ruleTypesCold ? 1 : 0) +
          2;
        this.defaultTypeNameById = templateTypeNamesFromResults(
          foldedResults?.[nameIndex],
        );
      }
      // The head read-set's rows, consumed from the same batch. Index is
      // everything the three parsers above occupy, in order.
      if (headReadsCold) {
        const headIndex =
          permissionStatements.length +
          (ruleTypesCold ? 1 : 0) +
          (structureCold ? 3 : 0);
        await this.cacheHeadViewReads(foldedResults?.[headIndex]);
        this.headReadsWarmed = true;
      }
      // The freshness-stamp baseline, consumed from the same batch. The
      // stamp rides LAST in the composed batch, so its index is everything
      // the parsers above occupy: permission + codename + both universes +
      // template type-name + head read-set (index recomputed for the
      // composed batch in the lineage reconciliation; the freshness
      // pass's original +2 counted only the two universe statements). A
      // boot-cache hit splices the bundle's rows into the head slot but does
      // not move the stamp's index (the splice preserves slot order).
      if (stampCold) {
        this.parseDeckDataVersion(
          foldedResults,
          permissionStatements.length +
            (ruleTypesCold ? 1 : 0) +
            (structureCold ? 3 : 0) +
            (headReadsCold ? 1 : 0),
        );
      }
      // HAND THE BOOT READ-SET TO THE PROCESS CACHE, on the boot that
      // actually read it. A miss is the only path that reaches here with real
      // rows; a hit spliced the bundle's rows in and has nothing new to
      // store. `version` is the probe's answer when this engine ran one, and
      // undefined when the process held no bundle yet — which leaves the
      // stored bundle PROVISIONAL (never served), so the next engine's probe
      // is what versions it.
      if (bootHit === undefined && ruleTypesCold && structureCold && headReadsCold) {
        storeBootBundle(this.bootBundleFrom(foldedResults, {
          codehashIndex: permissionStatements.length,
          typeNamesIndex: permissionStatements.length + (ruleTypesCold ? 1 : 0) + 2,
          headReadsIndex:
            permissionStatements.length + (ruleTypesCold ? 1 : 0) + (structureCold ? 3 : 0),
        }));
      }
      // The root itself may not be in the walked set (already cached).
      await this.enrichAndStore(record);
      // The probe is spent: it describes the deck as of THIS render's start,
      // and letting a later render reuse it would let a bundle outlive the
      // check that admitted it.
      this.bootProbeVersion = undefined;
    }
    if (ruleTypesCold || this.setKeysPendingRuleTypes.size > 0) {
      // Warm-closure FIRST render: the fold above never ran (the batch is
      // skipped), so parse here defensively - one standalone codename load,
      // once per engine (parseRuleTypeIds' own defensive branch).
      if (this.ruleTypeIds === undefined) {
        await this.parseRuleTypeIds(undefined, 0);
      }
      // THE RULE SET-KEY REPAIR (oracle-pinned:
      // fixtures/captured/search-list-views.json target 152): set keys were
      // computed by enrichAndStore while ruleTypeIds was still undefined -
      // computeIsRule returned undefined and safeSetKeys dropped the bare
      // RULE token - and the existing-key guard (enrichAndStore's head)
      // never recomputed them. Re-derive now that the ids are folded:
      // structurePatternInputForSync is the SAME input contract safeSetKeys
      // consumes (its doc), and every compound card's name parts are
      // enriched ahead of it, so the sync predicate resolves.
      // Memory-only, zero queries.
      // THE GATE IS THE HAZARD, NOT THE IDS' TEMPERATURE: the pending set
      // (setKeysPendingRuleTypes) records every compound card enriched
      // before the ids folded - the only cards whose set keys can be
      // missing the RULE token. Gating on ruleTypesCold alone skipped this
      // repair forever on the composed adapters, where the help resolver
      // (help-popover.ts prepare) memoizes ruleTypeIds during the mod
      // prepare phase - after the boot-time rule cache
      // (card-mod-rules prepareRuleCache) had already enriched the deck's
      // rule cards WITHOUT them - so every deck-created rule card's page
      // slot rendered one token short (the corpus's rule-page key-order
      // family, 118 pinned ops, retired 2026-10-10).
      // The map need not hold every part the predicate reads: a rule card
      // reached by its stored key (`*all+*style` from a set's rules board)
      // enters without its right part (`*style`). The sync read cannot tell
      // "not a rule" from "parts not in the map", so a card whose parts are
      // missing is answered by the fetching predicate, as Ruby's rule?
      // fetches them.
      for (const pendingKey of this.setKeysPendingRuleTypes) {
        const card = this.renderCards.get(pendingKey);
        // resetCaches dropped the map beside ruleTypeIds (the pending set is
        // cleared there too); a missing entry has nothing to repair.
        if (card === undefined || !card.name.isCompound) continue;
        const input = this.structurePatternInputForSync(card);
        let isRule = input.isRule === true;
        if (!isRule && !this.rulePartsInMap(card)) {
          const leftKey = card.name.leftName?.key;
          const leftRecord =
            leftKey !== undefined ? this.renderCards.get(leftKey)?.record : undefined;
          isRule = (await this.computeIsRule(card.name, leftRecord)) === true;
        }
        card.setKeys = safeSetKeys({
          name: card.name,
          typeId: input.typeId ?? undefined,
          typeName: typeof input.typeName === "string" ? input.typeName : undefined,
          leftTypeName:
            typeof input.leftTypeName === "string" ? input.leftTypeName : undefined,
          isRule,
        });
      }
      this.setKeysPendingRuleTypes.clear();
    }
    // Defensive fallback for the one shape the fold cannot cover: a first
    // render that took the WARM-closure branch (a prior closureWarmup
    // populated the caches before any render). The baseline must be armed
    // before any warm-serving render, so read it standalone here — this
    // branch costs one statement only on engines warmed before their first
    // render.
    if (stampCold && this.deckDataVersion === undefined) {
      this.deckDataVersion = await this.readDeckDataVersion();
    }
    if (permissionCold) await this.ensureReadPermission(foldedResults, seatGateRows);
    // THE CLOSURE HALF OF THE SWEEP SURFACE (renderSeats' doc): the render's
    // sweeps must also process the cards THIS render's root closure reaches
    // that EARLIER renders seated — a nest target chased as another page's
    // late seat sits in the map already (enrichAndStore's existing-key guard
    // skipped it, so it never entered renderSeats), but when THIS page nests
    // it, its structure substitution and its first processing ARE this
    // render's byte obligation (the structure-corpus-replay drift case).
    // The walk is closureWarm's own BFS (nest-reference reachability over
    // the map, memory-only); chase residue of OTHER pages enters the surface
    // only when THIS render's closure reaches it, so the cascade stays cut.
    for (const key of this.closureSurface(record)) this.renderSeats.add(key);
    // Structured content pass #1: the prefetched closure (Ruby resolves the
    // template at Card#content time — every view reads the substituted
    // accessor; templating.rb#structure). On every first-render path this
    // also parses the *default universe (folded, or the defensive standalone
    // batch), so the new-child type preload below can run right after.
    await this.applyStructureContent();
    await this.preloadDefaultTypeNames();
    // Unknown nest-target read verdicts (the closure walk's fetch misses:
    // trashed rows + never-existed names) — the *default-universe type
    // preload above must precede them (newCardDefaultType input). The sync
    // unknown-card gate (format.ts renderView) reads these for views whose
    // `unknown:` config is true — Ruby's alter_unknown||denial arm.
    await this.seatUnknownRefReadVerdicts();
    // Blank-key nest targets ({{}} and {{\_...}}) have no ref-miss row to
    // walk (the ref walk skips empty keys)  their deck-constant verdict
    // seats under the "" key (see the method doc).
    await this.seatBlankKeyReadVerdict();
    // THE RECOMPOSITION REFILL RESIDUAL (measured, the recomposition sweep
    // 2026-10-06): on the first render after a committed-write reset the
    // refill runs raw (the plan is legitimately disarmed by the reset per
    // the stamp-read-vs-plan pin) and its solo tail lives in the SEAT
    // PIPELINE, not in missing priming: composeCardRecord resolves each
    // wave-fetched junction row's name through the lexicon one solo pair
    // read at a time (measured post-bump: 53 `left_id = ? AND right_id = ?`
    // probes issued from _DbLexicon.cacheFetch, 59 fetch-ladder legs, ~55
    // wave-round trips, 16 cold-batch statements, 14 search re-runs — 182
    // trips / 52 live pair probes). A reset-gated candidate prime here was
    // measured and WITHDRAWN: gating a bigger/earlier candidate wave on the
    // reset moved pin 2 by +2 trips (184) — the verdict ladders ride
    // driver-level CTEs (resolveRuleRowsByRuleKeys / resolveRuleIdsByRule
    // Keys) that never needed the seats, and the wave's own composer IS the
    // solo-tail issuer. Closing pin 2 needs the fetch layer's seat pipeline
    // to resolve row names in batched vehicles — a fetch/lexicon pass
    // refactor, recorded OPEN-BLOCKED in the warmflood sweep-cut note.md.
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
    // whose NAME is arbitrary (the corpus's date-type and search-type
    // cards are both named with generated strings). Patch
    // every prepared card's typeCode from the (now-folded) codehash
    // before the prepare walk reads it.
    this.populateTypeCodes();
    await this.prepareSearches(record);
    // Pass #2: cards enrichAndStore'd during search preparation (their
    // records joined after pass #1). Idempotent — processed keys skip.
    await this.applyStructureContent();
    // an earlier pass misses (refs surfaced by search-enriched cards) seat here too —
    // the universe + type names are loaded by now.
    await this.seatUnknownRefReadVerdicts();
    // The blank-key seat is idempotent (has("") guard); re-called for the
    // same reason an earlier ref seat is.
    await this.seatBlankKeyReadVerdict();
    // Pass #2 populateTypeCodes: cards enriched during runSearch also
    // need their typeCode patched (their enrichAndStore ran AFTER the
    // batch fold, so peekNameForId returned the right codename — but
    // items reached transitively from another search's results might
    // have been enriched without the typeCode fixup, mirroring the
    // prefetch walk's shape).
    this.populateTypeCodes();
    await this.ensureTaskVerdicts(view);
    // The comment_box gate's update verdicts (views.ts commentBoxBaseView):
    // +discussion cores inside :open/:content bodies render the form only
    // on a POSITIVE update verdict, and the generic task warm above is
    // view-gated (viewRequiresTask) - warm the discussion cards here (the
    // page lane runs the same warm at page.ts; census M8: the graded
    // Sample_Card_099+discussion:open pair renders the
    // inherited-grant form on THIS lane).
    await this.ensureDiscussionUpdateVerdicts({ cardName, view });
    // The type editor's select (auth/permissions.rb:18-26 createable_types):
    // precomputed for the views whose body reaches it so the sync render
    // resolves the option list query-free.
    if (CREATEABLE_TYPES_VIEWS.has(view)) await this.ensureCreateableTypes();
    // The configure_button permission predicate (cardtype.rb:68-70) for
    // cardtype-structure pages: precomputed before the sync render so the
    // view gate resolves it query-free.
    await this.ensureConfigureVerdict(record);
    // The create verdicts of the root's unknown nest targets (the :unknown
    // view's createable gate).
    await this.seatUnknownNestCreateVerdicts(record);
    // db round-trip elimination: prime the derived state
    // the SYNC render resolves by name at view time - every prepared
    // record's TYPE card (the enrichAndStore type reads) and the rule
    // candidates the view-time resolvers walk (resolveOptionsCard /
    // setHostOptionsParseFailure's settings). Measured position: AFTER
    // ensureConfigureVerdict (covers the options-parse boundaries + seams);
    // a second call before view dispatch measured NET WORSE (+5 to +20
    // RT/page: its fresh asks cost more than the point queries they
    // displaced) and was reverted.
    await this.primePreparedCardDerivedState(record.key);
    // The cwwrite-seam warm (the asset-output views): the right/asset_output
    // :not_found gate reads the LEFT card's set keys and the outputter
    // :asset_output_url reads the `+*asset output` child's identifier —
    // both synchronously (fetchRenderCard is cache-only). The prefetch
    // closure chases neither (not nest-syntax references), so warm the one
    // related card the rendered card's shape implies: an `*asset output`
    // child warms its left, an asset-outputter (TypePlusRight::Set::Style/
    // ::Script set keys) warms its `+*asset output` child. One conditional
    // fetch, riding the fetch layer's cache; other cards warm nothing.
    {
      const rendered = this.fetchRenderCard(name.s);
      if (name.s.endsWith("+*asset output")) {
        const left = name.leftName;
        if (left !== undefined) await this.prepareItemForRender(left.s);
      } else if (
        rendered?.setKeys.includes("TYPE_PLUS_RIGHT-set-Xstyle") === true ||
        rendered?.setKeys.includes("TYPE_PLUS_RIGHT-set-Xscript") === true
      ) {
        await this.prepareItemForRender(`${name.s}+*asset output`);
      }
    }
    // The Mod-cardtype asset-children warm.
    //
    // card/mod/core/set/type/mod.rb:56-65 reads `card.fetch :style` and
    // `card.fetch :script` and `type/mod.rb:110-116 gates the two sections
    // on `fetch(:style).present?` / `fetch(:script).present?` — the CHILD
    // CARD, i.e. the `mod: X+*style` / `mod: X+*script` row. The port
    // reads that test synchronously (core-mod.ts#childCard ->
    // fetchRenderCard, cache-only), and nothing warmed those two children,
    // so the Styles/Scripts section was decided entirely by the deck-pinned
    // MOD_ASSET_GROUPS table and a gem with a real child row but no pinned
    // entry lost its section. `mod: shades` is exactly that: corpus row
    // `mod: shades+*script` (id 49309) exists, MOD_ASSET_GROUPS_SRC has no
    // `shades` key, and the capture carries the section while the engine
    // rendered a bare `<p></p>` (recapture-raw-shard-000043 `mod: shades:page`,
    // -28). One conditional family, same shape and same caveat as the
    // bootswatch-skin warm below: a mod with neither child warms nothing.
    if (record.typeId !== undefined && this.peekCodenameById?.(record.typeId) === "mod") {
      await this.prepareItemForRender(`${name.s}+*style`);
      await this.prepareItemForRender(`${name.s}+*script`);
    }
    // The bootswatch-skin page warm (the compiled-in coreView branch's
    // synchronous reads - views.ts calls bootswatchSkinCoreHtml, whose
    // current_skin? / parent? / image / field lookups are all
    // fetchRenderCard cache-only): a bootswatch_skin-typed rendered card
    // warms its +Image field, its +parent pointer, the three skin-field
    // children (+*colors / +*variables / +*stylesheets - the accordion
    // nests resolve real rows through these; theme skins carry none and
    // the view constructs the virtual fields), and the *all+*style rule
    // the current_skin? check reads. Cards that do not exist warm nothing
    // (prepareItemForRender undefined). One conditional family, riding the
    // fetch layer's cache; other cards warm nothing.
    // (Merge note: composed with bar-slots' V6 map scan below — this block
    // covers the ROOT skin's full family; the scan covers +Image for skin
    // cards NESTED into the render that joined the map outside the prefetch
    // loop.)
    if (record.typeId !== undefined && this.peekCodenameById?.(record.typeId) === "bootswatch_skin") {
      await this.prepareItemForRender(`${name.s}+Image`);
      await this.prepareItemForRender(`${name.s}+parent`);
      await this.prepareItemForRender(`${name.s}+*colors`);
      await this.prepareItemForRender(`${name.s}+*variables`);
      await this.prepareItemForRender(`${name.s}+*stylesheets`);
      await this.prepareItemForRender("*all+*style");
      // M9: html_views.rb:4-11 new_customized_name asks Card.exist? about
      // `<skin> customized`, `<skin> customized 1`, ... The customized
      // sibling is NOT in this page's nest closure (nothing on a skin page
      // references it), so the render-card-map-only gate could not see it -
      // that is the M9 gap: two of the corpus's skin pages carry
      // `card[name]=...customized+1` and the other eighteen skin pages
      // carry the bare name. This is the async half of
      // the seam; warmCustomizedName runs the whole walk here, where
      // queries are legal, and the synchronous customize_button view
      // reads the answer out of memory.
      await this.warmCustomizedName(name);
      // Row 6 (the corresponding port note): the `+parent` warm above asks for
      // the pointer BY NAME, and the pointer is not nameable. `parent` is a
      // card_accessor TRAIT (bootswatch_skin.rb:37), so Ruby's `card.parent`
      // is `parent_skin_card` (bootswatch_skin.rb:57-59) - a CODENAME-keyed
      // subcard lookup. The deck's pointer is a Pointer junction whose right
      // side is a card NAMED `parent 1` carrying codename `parent` (the
      // junction's left is a customized skin card and its content is that
      // skin's own name), so `<skin>+parent` as a NAME resolves to the
      // junction (the skin's left id, the id of the card literally named
      // `parent`) - a different card - or to nothing, and every
      // skin page took the parent-less branch where the capture carries
      // `Inherit from:` + a link to the parent theme (+232 B on the page).
      // warmSkinParentPointer resolves the pointer the way Ruby does and
      // seats it under BOTH names; run it BEFORE warmCustomizedName so the
      // customized-name walk sees the same parent? verdict the views do.
      await this.warmSkinParentPointer(name);
      await this.warmCustomizedName(name);
    }
    // The ACCOUNT-FAMILY warm (the setup view's explicit-edit fields): a
    // User-typed rendered card's setup/account surfaces read the +*account
    // field card and ITS field rows (+*email / +*password / +*salt /
    // +*status) synchronously (card-mod-account account_formgroups'
    // subformat + the before hook's edit_structure tuples → the multi-card
    // edit's field fabrications resolve real rows). The prefetch closure
    // chases neither (the fields are data-driven, not content nests). A
    // User-typed card with no account family rows warms nothing
    // (prepareItemForRender undefined on every miss).
    if (record.typeId !== undefined && this.peekCodenameById?.(record.typeId) === "user") {
      await this.prepareItemForRender(`${name.s}+*account`);
      for (const accountChild of ["+*email", "+*password", "+*salt", "+*status"]) {
        await this.prepareItemForRender(`${name.s}+*account${accountChild}`);
      }
    }
    // p20-help-content warm (the setting-page core's synchronous reads):
    // a SETTING-typed rendered card's core (views.ts settingCoreHtml)
    // reads the *all+<setting> rule card synchronously — the rule_help
    // alert's fetch (set/type/setting.rb:59-61's nest) and
    // set_classes_with_rules' render-card-map walk (setting.rb:31-37) —
    // and the Abstract::ModAssets CHILD pages ("mod: X+*style" /
    // "mod: X+*script") read their LEFT mod card's codename the same way.
    // The prefetch closure chases neither (not nest-syntax references).
    // One conditional fetch per shape; cards that do not exist warm
    // nothing (prepareItemForRender undefined), and a left card that is
    // already enriched as Mod-typed costs only the cached map read.
    {
      const renderedCard = this.fetchRenderCard(name.s);
      if (renderedCard !== undefined) {
        if (renderedCard.typeCode === "setting") {
          await this.prepareItemForRender(`*all+${name.s}`);
          // the virtual-rule-card fallback (a missing *all+<setting>
          // junction, rule_help unknown:true) builds its set card from the
          // map too — the corpus prefetches *all on every page, a bare
          // engine does not
          await this.prepareItemForRender("*all");
          // The set-class rows' rule universe: EVERY rule card whose right
          // part is this setting (setting.rb:49-53 rules_for_set_class's
          // per-class cql). The prefetch closure chases none of them, and
          // the rows walk the render-card map — without this warm the rows
          // rendered only what earlier pages happened to enrich (map-luck
          // state the escape-residue-era sweep saw). fetchById reconstructs
          // the junction names the cards table stores name-less.
          if (renderedCard.id !== undefined) {
            const results = await this.fetcher.driver.batch([
              {
                sql: "SELECT id FROM cards WHERE right_id = ? AND left_id IS NOT NULL AND trash = 0",
                params: [renderedCard.id],
              },
            ]);
            for (const row of (results[0]?.rows ?? []) as Array<{ id: number }>) {
              const rec = await this.fetcher.fetchById(Number(row.id));
              if (rec === undefined || rec.name === undefined) continue;
              await this.enrichAndStore(rec);
            }
          }
        }
        if (renderedCard.name.isCompound) {
          const leftName = renderedCard.name.leftName;
          const rightName = renderedCard.name.rightName;
          if (leftName !== undefined && rightName !== undefined) {
            const right = this.fetchRenderCard(rightName.key);
            const rightCodename = right?.record.codename;
            if (rightCodename === "style" || rightCodename === "script") {
              const left = this.fetchRenderCard(leftName.key);
              if (left === undefined || left.typeCode !== "mod") {
                await this.prepareItemForRender(leftName.s);
              }
            }
          }
        }
      }
    }
    // The edit_structure nest warm (view :edit_structure): the view walks the
    // root card's *structure rule candidates over the SEATED render cards
    // (card-mod-edit.ts editStructureView - fetchRenderCard is cache-only)
    // and the rule cards are no nest-syntax references the prefetch closure
    // chases, so the view's candidates ride this warm: one point fetch per
    // candidate (the *all tail miss is cheap, the rule_help warm's own
    // precedent). Every other view warms nothing.
    if (view === "edit_structure") {
      for (const candidate of ruleNamesForCard(
        { name: name.s, id: record.id, typeId: record.typeId, isNew: record.isNew === true },
        "*structure",
      )) {
        await this.prepareItemForRender(candidate);
      }
    }
    // view-fail class V6: the bootswatch_skin bar_left
    // nests the card's +Image child at :boxed (card-mod-bar_and_box
    // media_snippet.haml's `nest image_card, view: :boxed, size: size`).
    // Ruby's nest does a live fetch; the sync ViewFn reads the
    // render-card map, so the children ride the prepare phase — one
    // conditional fetch per skin card in the prepared closure (the root
    // skin itself, plus skin cards NESTED into the render — the oracle's
    // +parent 1 pointer items nest skin bars, phase-019). The prefetch
    // closure chases neither: the bar_left nest is view-time, so no
    // card_references row names the image. Skins without an +Image child
    // fetch nothing (the boxed unknown-nest bytes are name-shaped).
    // Called TWICE per render — see warmNestedSkinImages for why the first
    // call cannot be the only one.
    await this.warmNestedSkinImages();
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

    const preparedRoot = this.renderCards.get(name.key);
    if (preparedRoot === undefined) {
      throw new Error(`render card not prepared: ${name.s}`);
    }
    const rootCard =
      record.isNew === true && preparedRoot.id === undefined && this.renderAbsentCards
        ? await this.seatAbsentRoot(preparedRoot)
        : preparedRoot;
    // Pointer / List cardtypes: pre-enrich every item their content
    // references (the prefetch closure walk does NOT chase plain-text
    // references — only nest-syntax ones — so the items are absent
    // from renderCards when the sync core view tries to fetch them).
    // The walk covers EVERY pointer/list card in the prepared closure,
    // not just the render root: a list nested inside a page (+Pages
    // inside a Person card) hits the same sync-fetch gap, and the sync
    // item dispatch (renderPointerListItem) has no await to repair a
    // miss — prepareItemForRender must run here, in the async prepare
    // phase. Repeat to a fixpoint: enriched items may themselves be
    // pointer/list hosts. Termination is structural — enrichAndStore
    // skips existing keys, so renderCards only grows.
    const deniedRootSkip = this.skipDeniedRootWalks && this.isDenied(rootCard);
    if (!deniedRootSkip) await this.enrichPointerListItemsClosure();
    // The pointer/list editors' options walk (card-mod-layout options_api.rb,
    // the checkbox/radio/select/multiselect editors' card.options_hash): the
    // sync editor views read seated items, so the chain's search member
    // seats here, on the one view whose root renders an editor (the
    // journeys' ?view=edit surface). No-op for every other root.
    if (view === "edit") {
      await this.ensurePointerEditorOptions(rootCard);
    }
    // The navbox typeahead's data (card-mod-search set/self/search.rb:70-72
    // view :search_box_complete): the sync view fn reads the goto-item cards
    // and the exact-term card, so they seat here, on the one view whose root
    // renders it. No-op for every other root (the view-lane corpus ops never
    // ask for it — the view was unported before this seam existed).
    if (view === "search_box_complete") {
      await this.prepareSearchBoxComplete(rootCard);
    }
    // A junction root's OWN field rows sit in no reference closure (a
    // subcard is reachable only through its left_id), and a CODED core's
    // nests are runtime-built - the account core's labeled rows emit
    // {{+*email}} / {{+*password}} from views.rb's tuples while the
    // +*account row's stored db_content is empty - so neither the prefetch
    // closure (stored nest syntax only) nor any other warm reaches them.
    // Ruby's nest fetch (format/nest/fetch.rb fetch_card) is a LIVE
    // Card.fetch per nest: the row exists, every view renders it. The sync
    // port's nest() is cache-only, so the rows must seat in prepare or the
    // nest renders the fabricated new-card (observed: the after-save ajax
    // slot of an account change re-rendered the +*email/+*password labeled
    // rows with the tag-typed empty fabrication once the posted-subcard
    // expiry dropped the edit page's stale seats - the stale value was gone
    // AND the fresh value unreadable until the next full page load's edit
    // view re-warmed them). Every view, one batch, junction roots only.
    if (rootCard.id !== undefined && rootCard.name.isCompound && !rootCard.unknown) {
      const children = (await this.fetcher.driver.query<CardsRow>(
        "SELECT * FROM cards WHERE left_id = ? AND trash = false",
        [rootCard.id],
      )).rows;
      for (const row of children) {
        const tag = row.right_id !== undefined && row.right_id !== null
          ? this.peekNameForId(row.right_id)
          : undefined;
        if (tag === undefined) continue;
        await this.prepareItemForRender(`${rootCard.name.s}+${tag}`);
      }
      await this.ensureVerdicts();
    }
    // A NEW compound-eligible root's structured-form fields (the /new/:type
    // page: multi_card_edit nests `${root}+${tag}` for the type structure
    // template's own nests, all/mod/form.rb:115-122 via the implicit
    // field-config walk). The field cards have no rows, so nothing seats
    // them: each field editor rendered the quiet read-denial span where
    // Ruby's form renders the editor. The seat carries the field's
    // type_id_from_template shape (type.rb:78-80): the field's *default
    // rule card — related+*right+*default is Pointer-typed,
    // summary+*right+*default RichText "No summary yet." — supplies BOTH
    // the type and the editor's initial content (new_card_template returns
    // the default card itself). One prepare round, then the verdict pass.
    if (rootCard.id === undefined && rootCard.unknown) {
      const structure = this.structureRuleForSync({
        name: name.s,
        id: record.id,
        typeId: record.typeId,
        typeName: rootCard.typeName ?? (record.typeId !== undefined ? this.peekNameForId(record.typeId) : undefined),
        isNew: true,
      });
      if (structure !== undefined && structure.content.includes("{{")) {
        const seen = new Set<string>([name.key]);
        let warmed = false;
        for (const piece of scanNests(structure.content)) {
          if (piece.kind !== "nest" || piece.nest === undefined) continue;
          if (piece.nest.comment !== undefined) continue;
          const target = DeckoName.parse(piece.nest.name).absoluteName(name);
          if (seen.has(target.key)) continue;
          seen.add(target.key);
          if (this.fetchRenderCard(target.key) !== undefined) continue;
          // The field's *default rule: first existing candidate decides
          // (rule/all.rb first-hit), exactly newCardDefaultType's walk —
          // read here for the CONTENT as well as the type.
          const leftTypeName =
            rootCard.typeName ?? (record.typeId !== undefined ? this.peekNameForId(record.typeId) : undefined);
          const seated = await (async (): Promise<RenderCard | undefined> => {
            const found = await this.fetcher.fetchByName(target.s).catch(() => undefined);
            if (found !== undefined && found.id !== undefined) return undefined; // a real row: the ordinary warm
            const defaulted = await this.newCardDefaultType(target, leftTypeName);
            const absent = await this.fetcher.fetchByName(target.s, {
              new: defaulted !== undefined ? { typeId: defaulted.typeId } : {},
            });
            if (absent === undefined) return undefined;
            return this.seatAbsentRoot({
              name: target,
              key: target.key,
              typeId: absent.typeId ?? defaulted?.typeId,
              typeName: defaulted?.typeName,
              record: absent,
              unknown: true,
            } as RenderCard);
          })();
          if (seated === undefined) continue;
          for (const candidate of ruleNamesForCard(
            {
              name: target.s,
              id: undefined,
              typeId: undefined,
              typeName: undefined,
              leftTypeName,
              isNew: true,
            },
            "*default",
          )) {
            const ruleKey = DeckoName.parse(candidate).key;
            const ruleRow = this.fetcher.driver
              .query<{ id: number; type_id: number; db_content: string | null }>(
                "SELECT c.id, c.type_id, c.db_content FROM cards c WHERE c.key = ? AND c.trash = 0",
                [ruleKey],
              )
              .then((r) => (r.rows as Array<{ id: number; type_id: number; db_content: string | null }>)[0])
              .catch(() => undefined);
            const row = (await ruleRow) as
              | { id: number; type_id: number; db_content: string | null }
              | undefined;
            if (row === undefined) continue;
            const updated = this.fetchRenderCard(target.key);
            if (updated === undefined) break;
            const withTemplate: RenderCard = {
              ...updated,
              typeId: row.type_id,
              typeName: this.peekNameForId(row.type_id),
              typeCode: this.peekCodenameById?.(row.type_id),
              dbContent: row.db_content ?? "",
              record: { ...updated.record, typeId: row.type_id, dbContent: row.db_content ?? "" },
            };
            this.renderCards.set(target.key, withTemplate);
            break;
          }
          warmed = true;
        }
        if (warmed) await this.ensureVerdicts();
      }
    }
    // The V6 nested-skin scan has to run again HERE, not only above. A skin
    // reached through a POINTER/LIST item is not in the render-card map when
    // the earlier scan walks it — measured cold on a skin reached
    // through a pointer: that scan sees mapSize=10 with
    // only the skin's own customized card in it, the pointer-item walk
    // then grows the map to 211 with the base skin seated, and the
    // bar_left nest fires `fetchRenderCard("<skin>+Image")` against a
    // junction the scan never looked at. The bytes were then the empty
    // image-box
    // (`<div title="<skin>" class="image-box medium"></div>`), -86 on
    // one skin, -84 on another, -82 on a third. Re-walking after the pointer/list
    // closure is what makes those three entries' verdict independent of
    // whether the process happened to render the skin as a root earlier.
    await this.warmNestedSkinImages();
    // R17 (signup core): the Sign up cardtype's core view reads the
    // +account junction child synchronously (account_holder.rb:11-13
    // `account? = account.real?`) and its +*email child for the
    // verification_sent_line (views.rb:63-67). The trait fetch composes
    // the STAR name — oracle probe r17-junction-fetch-probe.rb:
    // card.account -> id 46002 name "Sample Card 164+*account" (right 100 =
    // *account), Card.fetch("Sample Card 164+account") is nil, and the tag
    // card "account" does not exist. Neither child is reachable from the
    // reference closure (the signup content names only its template
    // nests), so they enrich here, in the async prepare phase — the same
    // sync-fetch gap the pointer-item walk closes. Both calls tolerate
    // fetch misses (a card without +account stays absent; the core's
    // missing-account branch renders).
    // mod-completion-100 (2026-10-03): the account walk's cards — signup
    // :content_formgroups and user :setup ride account_formgroups
    // (account_holder.rb:143-145, the DIRECT subformat render of the
    // +*account trait's content_formgroups) -> the explicit edit_structure
    // walk nests <root>+*account+email and <root>+*account+password (the
    // NO-STAR field children, right/account/views.rb:59-61's tuples through
    // the edit mod's walk). The sync view's map reads need all three warm.
    if (rootCard.typeCode === "signup" || rootCard.typeCode === "user") {
      await this.prepareItemForRender(`${rootCard.name.s}+*account`);
      await this.prepareItemForRender(`${rootCard.name.s}+*account+email`);
      await this.prepareItemForRender(`${rootCard.name.s}+*account+password`);
    }
    if (rootCard.typeCode === "signup") {
      // views.rb:43-45 self_signup? compares creator_id against AnonymousID
      // ("was signed up on" vs "signed up on") — the *anonymous codename
      // card must be warm for the sync view's map read.
      await this.prepareItemForRender("Anonymous");
      await this.prepareItemForRender(`${rootCard.name.s}+*account`);
      await this.prepareItemForRender(`${rootCard.name.s}+*account+*email`);
      await this.prepareItemForRender(`${rootCard.name.s}+*account+*status`);
      await this.prepareSignupApprovalVerdicts(rootCard);
      // The enriched children landed AFTER both ensureVerdicts passes, so
      // deniedVerdicts has no entry for their ids and isDenied() would
      // return gate-open false for the +*email child — the verification
      // email would LEAK (Ruby's ok?(:read) denies Anonymous; the oracle
      // carries zero verification lines). Re-run the verdict pass; the
      // skip-if-set guard makes it a no-op for every card already judged
      // (the same defect class and fix shape as the pointer-item and
      // help-rules re-passes above).
      await this.ensureVerdicts();
    }
    // R17 (unknown-nest typing): an explicit `| type:X ` nest opt names the
    // NEW card's type when the target is missing (nest/fetch.rb:47-48
    // new_card_args) — but buildUnknownNestCard resolves the type card
    // SYNCHRONOUSLY from the warm map, and the type card ("Toggle", the
    // +agree nest opt of every Sign up card; corpus-wide the only two
    // type-opt shapes are `+agree | type:Toggle` ×94 and
    // `*signup+*subject|type:Phrase` ×1) is referenced by an OPT, never by
    // content, so the reference closure never prepares it. Walk the
    // prepared closure once per render and enrich every distinct type-opt
    // target that is not warm yet. Cheap: the content quick-skip
    // (includes "type:") precedes the chunk scan.
    await this.enrichNestTypeOptTargets();
    // D9 (warm-map junction load): card-mod-edit's :template_nest view
    // composes its set name at RENDER time (`Role+*members+*type plus
    // right` for page 105's `{{+*members}}`) and nests it; Ruby resolves
    // that compound through Card::Lexicon.id's live left x right join
    // (fetch/retrieve.rb:35-45), which finds corpus junction 45421 even
    // though that row has a NULL key and ZERO inbound card_references —
    // so the reference-driven prepare walk never warms it and the sync
    // nest read falls back to buildUnknownNestCard's fabricated card (no
    // data-card-id, url_key data-card-name, no SELF set-key token).
    // Warm the same names the view composes, through the same shared
    // composition, so the sync read finds the real card. Runs beside
    // enrichNestTypeOptTargets (same sync-fetch-gap class, same once-per-
    // engine-lifetime sweep) and BEFORE the verdict re-pass below, which
    // then judges the newly seated junctions.
    if (!deniedRootSkip) await this.enrichTemplateLinkSetJunctions();
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
    // card-mod-format set/all/content.rb:37-41 label_description: the
    // :smart_label view reads the +description subcard SYNCHRONOUSLY
    // (card.fetch(:description) -> desc.format.render_core). The subcard
    // is reachable from no reference closure (a smart_label render reads
    // no content), so the render must warm it here — the same sync-fetch
    // gap the R17 signup-children block above closes (the same
    // prepareItemForRender seam). Fetch misses are tolerated: a card
    // without +description renders the bare label (content.rb:30-34
    // label_with_description's nil-description arm).
    if (view === "smart_label") {
      await this.prepareItemForRender(`${name.s}+description`);
      // the warmed child landed after the verdict passes, so its id has
      // no deniedVerdicts entry — re-run the pass (skip-if-set makes it a
      // no-op for every card already judged; same defect class and fix
      // shape as the re-passes above).
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
      // the stored rule children preloadSetRules just cached
      // (composeCardRecord carries their stored read_rule_id) landed
      // AFTER the last verdict pass above, so deniedVerdicts has no
      // entry for their ids and isDenied() returned gate-open false —
      // the setting list rendered a BAR for every stored rule card whose
      // stored read rule denies (e.g. *all+*default, read_rule_id 22283 =
      // "BasicCs+*type+*read" → "Anyone Signed In" → Anonymous denied;
      // the oracle pins the quiet span, the engine pinned the bar).
      // The children are List/Pointer-typed rule cards whose ITEMS (the
      // rule's grant parties, e.g. "Anyone Signed In" inside *all+*read)
      // also only reach renderCards through the enrichment walk — without
      // it the bar-right one-line renders them wanted-card instead of
      // known-card (links.rb add_known_or_wanted_class). Re-run BOTH
      // passes; both are no-ops (skip-if-set) for cards already handled.
      // Same defect class and same fix shape as the help-rules and
      // pointer-item re-passes above.
      if (!deniedRootSkip) await this.enrichPointerListItemsClosure();
      await this.ensureVerdicts();
    }
    // A set card's rule list nested by OTHER content (a getting-started
    // Rules section: `{{:all|bar_setting_list; filter: webpage}}`) reads the
    // same stored rule children (rule_lists.rb setting_list_item:
    // `card.fetch setting, new: {}`), so the nested set gets the same
    // preload; without it every stored `*all+*<setting>` rendered as a
    // virtual new bar.
    if (await this.preloadNestedSetRuleLists(rootCard)) {
      await this.enrichPointerListItemsClosure();
      await this.ensureVerdicts();
    }
    // view-fail class V4: the sync render's [[wikilink]] anchors classify
    // known/wanted off the prepared map (Ruby asks a live fetch per anchor,
    // links.rb:140-144) — warm the link targets this render's surface can
    // name BEFORE the sync dispatch. Runs after every other enrichment
    // group so the harvested set is the full prepared closure (help rule
    // cards, set-rule children, pointer items included). Zero statements
    // when nothing new resolves.
    if (!deniedRootSkip) await this.enrichLinkTargetsForKnownClass(rootCard);
    // THE HEAD READ-SET (the async-view seam — the two candidate seams and
    // why the prefetch won are argued at renderView's contract note below).
    //
    // card-mod-format's head views (set/all/head.rb: :page_title,
    // :page_title_tag, :favicon_tag, :stylesheet_tags, :head) each need
    // an engine READ, but ViewFn is SYNCHRONOUS (render/format.ts:291).
    // The prefetch IS the seam: it warms the cards those reads name, so
    // the views read them out of renderCards through the already-public
    // synchronous RenderEngineLike#fetchRenderCard (format.ts:1371) with
    // no await, no async view class, and no change to ViewFn or the
    // dispatcher. See the headReadsCold comment above for where the
    // statement rides the cold batch and the cacheHeadViewReads comment
    // (below preloadAllSettingCards) for the read set itself.
    //
    // Cost: ZERO extra round trips — the statement folds into the cold
    // path's existing batch, and `headReadsWarmed` keeps it out of every
    // later one. The query-count gates in tests/card/render
    // (junction-depth-closure, render-engine, depth-sweep) pin the cold
    // shape and are unchanged by this change.
    //
    // This is the engine's own idiom, not a new subsystem: the same
    // shape as preloadAllSettingCards, preloadSetRules and the
    // pointer-item closure — prepare-phase async fetch feeding a
    // synchronous map read. And it is what Ruby itself asks for:
    // head.rb:5-13 lists :all+*head, :all+*style,
    // :all+*style+*asset_output and :all+*script in
    // basket[:cache_seed_names] — the deck's "always fetch these
    // setting cards" list.
    //
    // Nothing to await here: the statement and its cache fold both ran
    // inside the cold batch above.
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
    const format = new RenderFormat(rootCard, this, {
      maxDepth: RUBY_MAX_DEPTH,
      // The bare view lane rescues nested render errors to the quiet span,
      // the same render-global config the page lane passes (page.ts
      // nestQuietErrors: true): Ruby's wrap_and_render rescue is quiet for
      // every NESTED render (nesting/subformat.rb:41-43 focal? is
      // depth.zero?, and a nest's nesting format always has depth > 0).
      // The previous default rethrew, so a nest-depth raise aborted the
      // whole op where the oracle carries the full frames plus the inline
      // render-error span (the seconds corpus's Chain/Loop ops,
      // 2026-10-09).
      nestQuietErrors: true,
      // The route's (.:format) suffix (engine_routes.rb:19,24,51) — the
      // request's response format rides the render params; the format
      // inheritance in the view-chain walk scopes the dispatch to the
      // format's own registrations (a json-format view never dispatches on
      // an html render and vice versa, Ruby's per-format method tables).
      // Undefined = html, every pre-existing caller's shape.
      ...(params.format !== undefined ? { formatName: params.format } : {}),
      // THE bare view-lane root (render.ts renders nothing else at this
      // entry; page.ts builds its own rootFormat without the marker). The
      // census-M1 bar-seat climbs the parent chain for this flag.
      isViewLaneRoot: true,
    });
    // card-mod-layout set/self/head.rb:9-17 view :core reads the head bytes
    // for the RENDER ROOT (`nest root.card, view: :head`, escape_in_main at
    // :27-29). The page path has always seated them before the main render
    // (render/page.ts:294 headContent -> seatPageHead); the BARE single-card
    // view surface did not, so the Self::Head core answered "" and the
    // inclusion-carrying head rules' CodeRay <pre> came out EMPTY where the
    // oracle carries the page's own head block (m4verify D3: card 34754
    // `*all+*head` views.content, pre 0 B vs the oracle's 2441 B).
    //
    // The bytes are a property of the ROOT card and the same builder makes
    // them, so the two paths cannot drift: this IS page.ts's headContent, not
    // a second implementation. Gated on RenderFormat#contentNestsHeadCore —
    // the root's own content must nest the head card's :core view, and a
    // :template-nest-mode (Layout) card is excluded because its nests stay
    // literal — so no render that cannot reach the head core pays the read
    // set, and the query-count gates keep their cold shape.
    if (
      this.pageHeadBytesFor(rootCard.key) === undefined &&
      format.contentNestsHeadCore() &&
      CORE_REACHING_VIEWS.has(view)
    ) {
      this.seatPageHead(rootCard.key, await headContent(this, name, rootCard));
    }
    // The render-time history seam (render-seam.ts): load the act/action/
    // change rows the history views read ONLY when a history view is
    // requested - never on :titled/:open/:content renders. Read-only
    // SELECTs through the card-mod-history readers; verdict-filtered like
    // every read. Runs after ensureVerdicts so the viewable filter sees the
    // prepared read verdicts.
    if (HISTORY_SEAM_VIEWS.has(view)) {
      this.historyReader = await this.prepareHistoryRender(rootCard, params);
    }
    // set/self/recent.rb:28-33 - the *recent card's html :core is the
    // deck-wide recent-acts feed (recent_acts + acts_layout :absolute), a
    // Self-set override of the search core (self outranks Type::SearchType
    // in the set chain). The seam loads for any core-reaching render whose
    // ROOT is the *recent card itself (SELF-Xrecent) - the bare view lane
    // (:core) and the page lane (titled/open reach the core) alike.
    if (
      CORE_REACHING_VIEWS.has(view) &&
      rootCard.setKeys.split(" ").includes("SELF-Xrecent")
    ) {
      this.historyReader = await this.prepareHistoryRender(rootCard, params, "recent");
    }
    // The render-time ACT-SEARCH seam (updater-seam.ts): load the DISTINCT
    // update-actor cards the :updated_by view reads - ONLY for the two
    // views that reach it (:box, which renders :box_bottom, and
    // :box_bottom). One read-only SELECT through the card-mod-history
    // reader (updaterOf, the port of the gem's own updater_of query), then
    // a name peek per actor, all here in the async prepare half; the sync
    // ViewFn reads the memoized bundle.
    if (UPDATER_SEAM_VIEWS.has(view)) {
      this.updaterReader = await this.prepareUpdaterRender(rootCard);
    }
    // The render-time follow seam (follow/follow-render-seam.ts): the
    // follow/account views' rule-walk + actor-session bundle, prepared ONLY
    // when a seam view is requested (the history seam's gating rule).
    // Read-only SELECTs through the rule algebra; the actor
    // resolves from pageSession (the session field) or
    // degrades to signed-out. Cleared first so a failed prepare cannot
    // leak the previous render's bundle.
    this.followBundle = undefined;
    if (RULE_WARM_VIEWS.has(view)) {
      // The RULE-SIDE warm: rule junctions are reached by the rule walk,
      // never by content references, so the prefetch closure has no path to
      // them. Ruby's request cycle loads rule cards WITH their set anchors
      // in one cache fill - Card::Rule::Cache (card-1.110.0
      // lib/card/rule/cache.rb:1-27: the JOIN carries sets.id / anchor_id /
      // set_tag_id alongside every rule row). The port warms the render
      // root's self-set card the same way before the view body runs.
      const setCard = await this.fetcher.fetchByName(
        `${rootCard.name.s}+*self`,
      );
      if (setCard !== undefined) await this.cacheFetchedRecord(setCard);
    }
    if (FOLLOW_SEAM_VIEWS.has(view)) {
      this.followBundle = await prepareFollowRender(
        this.fetcher,
        this.pageSession,
        rootCard,
        view,
      );
      // warm the pills' known/wanted marks: the +*followers junction
      // (followers_board_link's known-card) and the actor's own User+*follow
      // card (follow_overview_button's known/wanted split)
      const session = this.followBundle.session;
      if (session !== undefined) {
        const userFollow = await this.fetcher.fetchByName(
          `${session.actorName}+*follow`,
        );
        if (userFollow !== undefined) await this.cacheFetchedRecord(userFollow);
      }
      const followersJunction = await this.fetcher.fetchByName(
        `${rootCard.name.s}+*followers`,
      );
      if (followersJunction !== undefined) {
        await this.cacheFetchedRecord(followersJunction);
      }
      // wave-1 rule_editor warm: the view's two sync fetchRenderCard reads
      // (card-mod-follow.ts ruleEditorView) need the preference_name card +
      // the string arm's dispatch target in the prepared map - the same
      // seam-prepare warm shape the user-follow card above rides.
      if (view === "rule_editor") {
        for (const warmName of [
          this.followBundle.ruleEditorPreferenceName,
          this.followBundle.ruleEditorTargetName,
        ]) {
          if (warmName === undefined) continue;
          const warmed = await this.fetcher.fetchByName(warmName);
          if (warmed !== undefined) await this.cacheFetchedRecord(warmed);
        }
      }
    }
    // THE LATE-SEAT STRUCTURE SWEEP (T1-1 sweepproof): every seat path of
    // this render has run by here (the pointer/list closure, the asset/
    // skin/setting warms, the link-target sweep, the follow/rule warms) —
    // process this render's late seats BEFORE the sync dispatch reads their
    // content. See applyLateSeatStructureContent's doc.
    // A bare view render (the view surface) reaching a Role dashboard's
    // `{{_L|configs}}` nest needs the admin runtime the page surface builds in
    // page.ts before its own sync render; same gate, once per engine. The
    // page surface's inner render leaves it to page.ts.
    if (
      this.pagePrepareDepth === 0 &&
      (view === "configs" || this.renderClosureNeedsCoreAdminRuntime())
    ) {
      await this.ensureCoreAdminRuntime();
    }
    await this.applyLateSeatStructureContent();
    if (FORM_VIEW_PATTERN.test(view)) await this.seatLastActionIds();
    // db round-trip elimination: prime the derived state
    // Ruby render(view, opts): the render's view opts ride the voo (the
    // form-substrate-2 modal hidden-header arm reaches the wrap
    // gates through params.viewOpts; undefined for every prior caller -
    // the {} pass-through is byte-identical). The 4th arg marks THE bare
    // view-surface root render: this entry's optional render arg defaults to
    // :show (method_delegation.rb#optional_render_opt), and the live
    // serializer omits exactly that enrollment from the root slot - the
    // page-surface and nest renders pass their own optional explicitly and are
    // NOT roots (format.ts#slotOptions root-drop arm reads this flag).
    const baseHtml =
      this.skipSyncRender?.() === true ? "" : format.renderView(view, params.viewOpts ?? {}, "show", true);

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
    if (override !== undefined && typeof baseHtml === "string") return applyViewOverride(baseHtml, override);
    // The boundary: Ruby's render returns the view block's value verbatim -
    // integers (:id, the token-days views) and nil (the early-return arms)
    // survive as numbers/null; view-override rules substitute view NAMES, so
    // they never post-process a non-string answer.
    return baseHtml;
  }

  /**
   * Render the live page for one card — the html-format show path
   * (show_with_page_layout: *layout rule resolution, the {{_main|view}}
   * main render with main! context, the layout body substitution, the
   * :html_page wrapper, production default_nest_view=:content and quiet
   * nested-error semantics). The full mechanism port lives in
   * src/card/render/page.ts; the preparation reuses render() so the bare
   * and page surfaces share one prepare path. Throws UnknownLayoutError (the
   * captured "unknown layout card" UserError sentinel) for layout names
   * that resolve to no card/built-in layout.
   */
  async renderPage(cardName: string): Promise<string> {
    return renderPageBytes(this, cardName);
  }

  /**
   * The (card, view) view-override rule lookup shared with render() (same
   * ruleCache; the page renderer applies the same *<view> rule to the main
   * body bytes it builds with main! context). Additive seam — render()
   * itself is untouched.
   */
  async viewOverrideFor(card: RenderCard, view: string): Promise<ViewOverride | undefined> {
    const cacheKey = `${card.key}|${view}`;
    let override = this.ruleCache.get(cacheKey);
    if (override === undefined && !this.ruleCache.has(cacheKey)) {
      const rule = await findRule(
        this.fetcher,
        { name: card.name, id: card.id, typeId: card.record.typeId, typeName: card.typeName },
        `*${view}`,
      );
      override = rule === undefined ? undefined : resolveViewOverride(view, [rule.rule]);
      this.ruleCache.set(cacheKey, override);
    }
    return override;
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
    // "*layout+*right+*content options") captures REAL :open/:content bytes
    // (48 *content options + 27 *structure rules, zero CAPTURE_ERROR), while
    // every CAPTURE_ERROR search card is non-rule; date-typed rules (a
    // `<date type>+*right+*default` card) still capture the Date::Error
    // sentinel. So the Search arm skips rule cards
    // (computeIsRuleSync — the same standard_rule? predicate the RULE
    // set-key uses) and the Date arm does not.
    if (card.typeCode === SEARCH_TYPE_CODE && PARSE_DISPATCH_VIEWS.has(view)) {
      const failed = this.searchFailures.get(this.searchCacheKey(card));
      if (failed !== undefined && !this.computeIsRuleSync(card)) throw failed;
    }
    // THE DATE ARM MOVED TO :core (2026-10-02, open-clusters-fix). The
    // Search arm above keeps its {open, content} axis, but the Date arm used
    // to share it — and that put the raise ONE LEVEL TOO HIGH.
    //
    // Ruby raises inside the date cardtype's OWN view: mod/date/set/type/
    // date.rb:6-8 declares `view :core do ::Date.parse(card.content)
    // .strftime "%B %-d, %Y" end` and nothing else. The :content view that
    // renders a Date card is the all-set one (mod/format/set/all/html/
    // views.rb:10-18), whose body is `wrap do [..., render_core, ...] end`;
    // render_core is a method delegation (format/method_delegation.rb:41-47)
    // with its own wrap_and_render rescue (format/render.rb:7-14, :96-100).
    // So the Date::Error is raised INSIDE the :core scope, one level below
    // the :content dispatch.
    //
    // Raising at the :content dispatch instead skipped the view body: the
    // `wrap` never ran, so the card-slot div was never emitted, and nest()'s
    // catch (format.ts) produced the unwrapped span labelled "(content
    // view)". The corpus carries the wrapped form with the DELEGATED label,
    // on four Date cards whose content refuses to render:
    //   <div id="...-date-content-view" class="card-slot content-view ...">
    //   <span class="render-error alert alert-danger">Error rendering:
    //   ...+Date (core view)</span></div>
    //
    // Moving the gate to :core preserves the other half of the contract for
    // free: a TOP-LEVEL `format.render(:content)` of a bad-content Date card
    // is still CAPTURE_ERROR, because the delegated core render is focal
    // (nesting/subformat.rb:41-43 `focal?` = depth.zero?) and re-raises
    // (format/error.rb:65-73) — which is the census shape this arm was
    // originally built for.
    if (card.typeCode === DATE_TYPE_CODE && view === "core") {
      if (!isValidDateContent(card.dbContent)) throw dateError();
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

  /** view/permission.rb:38 `setting :unknown` for ONE card: the p20-nest-
   *  selection fix. With a mod deck bound, the per-card CHAIN walk is the
   *  authority — loader.viewUnknownSettingForCard walks viewChain(setKeys,
   *  view) (the same MRO walk the dispatcher uses) and takes the first
   *  chain entry whose set module CARRIES an `unknown` config for the view
   *  (Ruby: the most specific set module that defined the
   *  `_view_<view>__unknown` method). Without a loader, undefined — the
   *  caller falls back to the compiled per-set decl table
   *  (format.ts compiledUnknownSettingForCard). */
  viewUnknownSettingForCard(card: RenderCard, view: string): true | string | false | undefined {
    const loader = this.modLoader;
    if (loader === undefined) return undefined;
    return loader.viewUnknownSettingForCard(card.setKeys, view, "html");
  }

  /** True when a mod deck is bound (format.ts consults this to keep the
   *  compiled per-set decl stand-in from firing over the loader's chain
   *  answer — a per-set declaration must not globalize again). */
  modDeckBound(): boolean {
    return this.modLoader !== undefined;
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
    // the pre-chain dispatch path when no loader is registered. A flat view
    // Ruby defines only on some sets resolves only for cards in them.
    if (flatViewRefused(view, card.setKeys)) return undefined;
    // With a deck bound, the base layer is the compiled-in table as it
    // stood before the deck registered into the shared record: the record
    // also carries the abstract sets' views for the loader-less dispatch,
    // and those reach only the sets that include them (the chain above).
    return loader !== undefined ? baseTableEntry(view) : this.views[view];
  }

  /** ONE statement: the deck's committed-write stamp read (the render
   *  path's entire per-request freshness cost). Throws LOUDLY when the
   *  stamp is missing — an unmigrated database must not render, because a
   *  silently skipped check is a silent staleness window (delivery
   *  contract:79's no-leak clause). */
  private async readDeckDataVersion(): Promise<number> {
    const result = await this.fetcher.driver.query<{ version: number }>(
      DECK_DATA_VERSION_STATEMENT,
      [],
    );
    const version = result.rows[0]?.version;
    if (typeof version !== "number") {
      throw new Error(
        "deck_data_version unreadable: the freshness stamp table/row is missing — " +
          "apply the stamp schema (db/schema.sqlite.sql [ENGINE-FRESHNESS] block, or " +
          "deploy/migrations/0003-deck-data-version-stamp.sql for provisioned databases) " +
          "before rendering",
      );
    }
    return version;
  }

  /** The folded first-render baseline: deck_data_version's single row rides
   *  the cold batch's LAST slot (see the stampCold fold in render()). Same
   *  loud failure as readDeckDataVersion. */
  private parseDeckDataVersion(
    folded: SQLQueryResult[] | undefined,
    index: number,
  ): void {
    const result = folded?.[index];
    const version = (
      result?.rows[0] as { version?: unknown } | undefined
    )?.version;
    if (typeof version !== "number") {
      throw new Error(
        "deck_data_version unreadable: the freshness stamp table/row is missing — " +
          "apply the stamp schema (db/schema.sqlite.sql [ENGINE-FRESHNESS] block, or " +
          "deploy/migrations/0003-deck-data-version-stamp.sql for provisioned databases) " +
          "before rendering",
      );
    }
    this.deckDataVersion = version;
  }

  /** Drop every derived cache (the fetch engine's caches + the render-side
   *  maps). Mirrors FetchEngine#resetCaches for whole-engine resets. */
  resetCaches(): void {
    this.fetcher.resetCaches();
    this.renderCards.clear();
    this.idsByKey.clear();
    // Ruby's clear_rule_cache: a write invalidates the deck-wide rule
    // lookup hash (the set-label winner map included).
    this.ruleCacheSetLabels = undefined;
    this.ruleCacheSetLabelsLoad = undefined;
    this.resetDerivedRenderState();
  }

  /** INCREMENTAL DISCOVERY (live render, src/card/live/live-render.ts). One
   *  engine serves a request's discovery passes, which answer unknown reads
   *  with a speculative "no rows"; everything it holds as ABSENT is therefore
   *  provisional. Between passes this keeps what is positive and pure of the
   *  request's rows (the fetch layer's stored cards and lexicon ids, the
   *  seated stored render cards) and drops the rest, so the next pass asks
   *  again. The page bytes never come from this engine: a fresh engine
   *  renders them under the completion rule, so anything this misses costs a
   *  pass, never a byte.
   *    level 2: the fetch layer's negatives, id-less render cards, and every
   *             derived render-side cache (verdicts, rules, searches,
   *             structure, ask memories, warm markers);
   *    level 1: only the ask/miss/scan memories and the fetch negatives. */
  clearProvisionalState(level = 2): void {
    if (level >= 3) {
      this.fetcher.resetCaches();
      this.fetcher.lexicon.forgetDurableRecords();
    }
    else this.fetcher.purgeNegatives();
    if (level < 2) {
      this.structureRefMisses.clear();
      this.waveAskedSimpleKeys = undefined;
      this.waveAskedPairs = undefined;
      this.waveAskedSideKeyPairs.clear();
      this.warmupScannedKeys.clear();
      this.primeAskedIds = undefined;
      return;
    }
    for (const [key, card] of this.renderCards) {
      if (level >= 4 || card.id === undefined) this.renderCards.delete(key);
    }
    if (level >= 4) this.idsByKey.clear();
    this.resetDerivedRenderState();
  }

  /** Incremental discovery: a page prepare's sweep surface (renderSeats)
   *  starts with every card the engine holds, as a fresh engine's would hold
   *  every card it seated in this render. */
  sweepAllHeldCards = false;

  private resetDerivedRenderState(): void {
    this.renderSeats.clear();
    this.sessionAccountLinks = undefined;
    this.sessionAccountLinksActorId = undefined;
    this.sessionMyCardHtml = undefined;
    this.sessionRolesDropdownHtml = undefined;
    this.searchResults.clear();
    this.searchFailures.clear();
    this.searchResultPagingMap.clear();
    this.searchCountResults.clear();
    this.pageHeadBytes.clear();
    this.optionsCardCache.clear();
    this.setHostChainCache.clear();
    this.ruleCache.clear();
    this.viewDispatchCache.clear();
    this.readPermission = undefined;
    this.accountRightIds = undefined;
    this.deniedVerdicts.clear();
    this.deniedVerdictsByKey.clear();
    this.coreAdminRuntimeEnsured = false;
    this.existingRuleCards = undefined;
    this.setRulePreloadDoneIds = undefined;
    this.ruleTypeIds = undefined;
    // The pending-repair keys point into the render-card map dropped above
    // (setKeysPendingRuleTypes' doc): entries repaired or dropped with the
    // map; post-reset enrichments re-record themselves.
    this.setKeysPendingRuleTypes.clear();
    this.structureContents = undefined;
    this.structureRuleTypes = undefined;
    this.structureProcessed.clear();
    this.structureRefMisses.clear();
    this.defaultRuleTypes = undefined;
    this.defaultRuleContents = undefined;
    this.defaultTypeNameById = undefined;
    this.taskState = undefined;
    this.taskVerdicts.clear();
    this.signupApprovalVerdicts.clear();
    this.createableTypesCache = undefined;
    this.configureVerdicts.clear();
    this.configureChecked.clear();
    this.itemTypeNameByHostKey.clear();
    this.pointerItemVerdicts.clear();
    this.pointerItemGlobalVerdictDone.clear();
    this.warmupScannedKeys.clear();
    this.customizedNameBySkinKey.clear();
    this.linkScanDoneKeys = undefined;
    this.helpRules = undefined;
    this.helpResolver = undefined;
    this.lastPrefetch = undefined;
    // The set-once WARM MARKERS complete the same rule (per-viewer-seat
    // , $1 — landed at 7fa6a045; the warmflood-fix pass ports
    // the block, and this assembly carries it via the warmflood merge).
    // Each marker records "this fold already ran this engine lifetime" on
    // the deck-is-static assumption a stamp move breaks; its fold's
    // outputs live in the caches this reset just emptied. Left set, the
    // next render SKIPS the fold over empty caches (headReadsWarmed skips
    // the head-read-set fold while pageHeadBytes is empty; the *Done sets
    // skip the pointer/account/nest/template warm passes) and the render
    // re-derives their reads one solo statement at a time — measured on
    // this trunk: the post-stamp-move render ran 572 trips / 590
    // statements / 320 pair-exists probes against the fresh-engine shape's
    // 7 / 88 / 0.
    this.headReadsWarmed = false;
    this.pointerListHostsDone.clear();
    this.accountFieldWarmDone.clear();
    this.nestTypeOptTargetsDone.clear();
    this.templateLinkJunctionTargetsDone.clear();
    // The waves' ENGINE-LIFETIME ASK MEMORY completes the rule (the
    // recomposition trip-flood's fix d1; design doc
    // tripflood-recomposition-fix-design.md F2). The ask maps record "this
    // question was already answered" while the ANSWERS live in the lexicon
    // cache and the render-card map — exactly what this reset just wiped.
    // Left set, the wave skips every question it ever asked ("already
    // asked") with nowhere to answer from, and the name walk falls to the
    // solo point path: one `SELECT id FROM cards WHERE left_id = ? AND
    // right_id = ?` round trip per junction name (the measured 295-320
    // live-probe flood). Cleared WITH the knowledge they index, the wave
    // re-asks its questions in BATCHED rounds (MAX_WAVE_ROUNDS, one
    // driver.batch per round) and re-primes the wiped caches — the same
    // questions, the same answers, a bounded number of round trips.
    // primeIdByLex/primeIdsByKey derive negatives from THIS call's
    // ask/answer sets (see seatNamesByWave), which post-reset read the
    // CURRENT deck — correct by construction.
    this.waveAskedSimpleKeys = undefined;
    this.waveAskedPairs = undefined;
    this.waveAskedSideKeyPairs.clear();
    this.primeAskedIds = undefined;
    this.typeCardsPrimed.clear();
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
      // The template type-name statement rides the same batch (+1 statement,
      // +0 round trips — same shape as the folded path).
      const batch = await this.fetcher.driver.batch([
        structureRuleUniverseStatement(),
        defaultRuleUniverseStatement(),
        templateTypeNameStatement(),
      ]);
      result = batch[0];
      defaultResult = batch[1];
      if (this.defaultTypeNameById === undefined) {
        this.defaultTypeNameById = templateTypeNamesFromResults(batch[2]);
      }
    }
    this.structureContents = structureUniverseFromResults(result);
    this.structureRuleTypes = structureRuleTypesFromResults(result);
    this.defaultRuleTypes = structureRuleTypesFromResults(defaultResult);
    this.defaultRuleContents = structureUniverseFromResults(defaultResult);
  }

  /**
   * RenderEngineLike#defaultHtmlViewConfig — the modeled
   * `Cardio.config.default_html_view` for the CURRENT render surface (R17
   * A-36 correction; see the pageConfigActive field doc and
   * format.ts#defaultNestView): "content" while a page render is active
   * (the production config, capture-dual-$1page-and-view.rb:369),
   * "titled" otherwise (the railtie default, mod/format.rb:2, under which
   * the bare-render capture ran — probe-pinned by
   * r17-nest-default-view-probe.rb: Cardio.config.default_html_view ==
   * :titled at boot, implicit nests render titled-view).
   *
   * A deployment that SETS the config rides the follow-live seam
   * (deploymentDefaultHtmlViewNest): the live deck configures :content on
   * BOTH surfaces — the graded corpus's view surface carries it (children:open,
   * recapture-raw-shard-000025: the implicit {{_self+*referred_to_by}}
   * nest renders content-view where the railtie-default arm rendered
   * titled-view), the same deck state the live pages' page-surface bytes
   * prove (capture record #5, a blog page whose content-view it sets).
   */
  defaultHtmlViewConfig(): string {
    if (this.pageConfigActive) return pageDefaultHtmlView();
    return deploymentDefaultHtmlViewNest() ?? deckDefaultHtmlView() ?? "titled";
  }

  /**
   * RenderEngineLike#envOriginConfig — the modeled `Card::Env.origin` for
   * the CURRENT render surface (card-1.110.0 lib/card/env/serializable.rb:
   * 20-22 `Cardio.config.deck_origin || "#{protocol}#{request&
   * host_with_port}"`). The value is the DECK'S CONFIGURATION:
   * `deck_origin` installed through
   * setDeckEnvironment — by the deck's own spec
   * (reference-harness/adapters/ts/adapter.ts) or by the deployment's
   * served-deltas `deckOrigin` / DECKO_DECK_ORIGIN at the edge boot — or
   * "" when nothing is configured (railtie.rb:28 nil + a requestless
   * runner, env.rb:17-19). `card_url` (env/location.rb:19-21) is
   * `"#{Env.origin}#{card_path rel}"`, so the empty origin yields the
   * bare rooted path. The capture photographed the two CONFIGURATION
   * states: the page surface set deck_origin
   * (capture-dual-$1page-and-view.rb:391-400 — 6588/6588 page rows
   * carry its `decko.rootUrl`), the view surface rendered outside that
   * block with a controller-less `Card::Env.reset` (:439 — 4 view rows
   * carry `decko.rootUrl='/'`). The pass flag stays shaped here,
   * but the VALUE follows configuration, not this pass.
   */
  envOriginConfig(): string {
    return envOriginForSurface(this.pageConfigActive);
  }

  /**
   * Run `fn` with the process config active
   * (pageConfigActive = true, restored in finally): the page capture
   * wraps `fmt.show(nil, {})` in the production config values —
   * default_html_view :content among them — while every bare render runs
   * under the railtie defaults. Restores the prior flag (nesting-safe:
   * a page render's inner prepare render must NOT clear the flag a page
   * render set).
   */
  async runWithPageConfig<T>(fn: () => Promise<T>): Promise<T> {
    const prior = this.pageConfigActive;
    this.pageConfigActive = true;
    try {
      // The help resolver installs on the VIEW path's prepare (render()
      // below); the PAGE path bypasses render(), so install here too —
      // once per engine (the canary guard inside prepare makes the second
      // call a no-op). Without this the graded page surface rendered every
      // menu popover as the &nbsp; placeholder where Ruby resolved help
      // (26 oracle pages carry real help text; the
      // three +*variables pages pin the resolved bytes).
      // Head-rule popover counts: the help resolver's
      // deck-wide Setting#count batch filters by the VIEWER's readable rule
      // set (help-popover.ts settingRuleCountsStatement — the port of the
      // Card.search read filter). An UNRESOLVED readPermission degrades that
      // filter to the read_rule_id-IS-NULL branch, and every corpus *head
      // rule carries a stored read_rule_id — the page surface rendered
      // "(0 head rules)" where the oracle pins "(2 head rules)" (the
      // *all+*head / ZQVT+*self+*head nest-miss pages). The VIEW path folds
      // the state earlier in render() (the permissionCold pass) before its
      // own install; the page path must too. Once per engine: the state is
      // memoized, render()'s permissionCold goes false, and its cold batch
      // drops the permission statements — the folded-index math is computed
      // from the same conditionals and stays consistent.
      if (this.readPermission === undefined) await this.ensureReadPermission();
      if (this.helpResolver === undefined) {
        this.helpResolver = installHelpRules(this, this.fetcher);
        await this.helpResolver.prepare();
      }
      return await fn();
    } finally {
      this.pageConfigActive = prior;
    }
  }

  /**
   * The type names the *default universe's referenced type ids point at
   * (once per engine; one batched id query). These names feed the
   * new-child card's data-card-type-name attribute and its safeSetKeys
   * TYPE anchor. Genuinely missing type rows simply stay absent from the
   * map — newCardDefaultType degrades to the untyped new-card
   * shape for those, never throws.
   */
  private async preloadDefaultTypeNames(): Promise<void> {
    // An UNLOADED universe (defaultRuleTypes undefined — the *default rule
    // statement has not parsed yet, e.g. a first render that skipped the cold
    // batch) must NOT latch the map: the map is set here defined-but-empty,
    // and every later fill path (the folded parse's === undefined guard, the
    // defensive batch's, this method's own) is then defeated for the engine's
    // lifetime — newCardDefaultType degraded to untyped forever. Leave it
    // undefined; the load paths fill it. Genuinely EMPTY universes (parsed,
    // zero rules) still latch the empty map exactly as before.
    if (this.defaultRuleTypes === undefined) return;
    if (this.defaultTypeNameById !== undefined) return;
    const map = new Map<number, string>();
    // The *default universe's rule-card types AND the *structure universe's
    // (newCardDefaultType's dup_structure leg answers a *structure rule
    // card's own type — its name must resolve in the same sync map).
    const ids = [
      ...new Set([
        ...(this.defaultRuleTypes?.values() ?? []),
        ...(this.structureRuleTypes?.values() ?? []),
      ]),
    ];
    if (ids.length > 0) {
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
  /**
   * RenderEngineLike#virtualLeftTypeName — the sync resolution of a
   * compound name's LEFT card's type through the loaded *structure
   * universe: the same candidate walk the fetch layer's virtual hook runs
   * (resolveVirtualCardStructure — states.rb:44-50 virtual? ->
   * templating.rb:19-48 structure_rule_card -> type.rb:78-80
   * type_id_from_template), so a nest-miss child's TYPE_PLUS_RIGHT anchor
   * reads the virtual left's template type instead of the context card's
   * (the census page-22 defect: the oracle anchored
   * TYPE_PLUS_RIGHT-set-by_name off the virtual set card
   * "PlainText+*type" - Set via the *type+*right+*structure rule card -
   * while the context fallback anchored cardtype-by_name off the Cardtype
   * page card). The type NAME is read through the codename registry's
   * memo - key-identical to the type card's name, which is all the anchor
   * consumes (pattern/base.rb:70-73 safe_key keys the anchor name).
   * Undefined when the universe is not loaded or no *structure rule
   * applies (the caller keeps its context fallback - the pre-existing
   * shape for genuinely unknown lefts).
   */
  /** The phantom-item VIRTUAL resolution — the
   *  port of Ruby's known?-ness decision for a pointer/list fetch-miss
   *  item (states.rb:65 known? = real? || virtual?; states.rb:44-50
   *  virtual? = compound && structure.present?). The pointer-list seat
   *  KNOWS the phantom's type (the host-resolved item type,
   *  item.rb:245-248), so the *type candidates (<Type>+*type+*structure)
   *  are derivable here — unlike the fetch hook, whose walk computes the
   *  type and omits them. Undefined (=> the phantom stays UNKNOWN, the
   *  mini_bar substitution path) when the universe is not loaded, the
   *  name is simple, or no *structure rule resolves. The corpus pins the
   *  split: the compound Tracked Item/Task-typed phantoms (structure rule
   *  2081 Tracked Item+*type+*structure / 21905 Task+*type+*structure
   *  exist) render the plain quiet denial span (SMD exp @8350, PdG exp
   *  @8515-8987 — and the live Task card Merchandise denies as a real
   *  card), while the simple-named denied phantoms (the view-surface census,
   *  133 entries — mostly anonymized person cards, all
   *  BasicCs/RichText/Practice-typed) render the mini_bar wrap with the
   *  two-span body: name.simple? short-circuits virtual? to false
   *  (states.rb:45) whatever their type.
   *  Honest static-trace limit, recorded for the next reader: the gem as
   *  written retypes new_card_template's dup to the DEFAULT rule's type
   *  (templating.rb:25-27 — for these phantoms RichText, whose
   *  +*type+*structure rule is absent), so a literal reading does not
   *  reach virtual? for the SMD/PdG phantoms; the capture deck's runtime
   *  (not runnable on this machine — the p20-perm-residuals recorded result)
   *  demonstrably answers known? for them. The engine seats the decision
   *  on the corpus-consistent reading — compound name + a *structure rule
   *  resolves for the phantom's OWN type — which reproduces every pinned
   *  surface (the four byte-exact class pages + the simple-named census +
   *  the unit fixtures). */
  phantomVirtualStructure(
    name: DeckoName,
    typeName: string | undefined,
    typeId: number | undefined,
  ): { ruleKey: string; templateContent: string; typeId?: number } | undefined {
    if (!name.isCompound) return undefined;
    if (this.structureContents === undefined || this.structureRuleTypes === undefined) {
      return undefined;
    }
    return resolveVirtualCardStructure(
      name,
      { contents: this.structureContents, ruleTypeIds: this.structureRuleTypes },
      undefined,
      typeName,
      typeId,
    );
  }
  virtualLeftTypeName(name: DeckoName): string | undefined {
    if (!name.isCompound) return undefined;
    if (this.structureContents === undefined || this.structureRuleTypes === undefined) {
      return undefined;
    }
    const resolution = resolveVirtualCardStructure(
      name,
      { contents: this.structureContents, ruleTypeIds: this.structureRuleTypes },
      undefined,
    );
    if (resolution?.typeId === undefined) return undefined;
    return this.fetcher.codenames.peekNameForId(resolution.typeId);
  }

  newCardDefaultType(
    name: DeckoName,
    leftTypeName?: string,
  ): { typeId: number; typeName: string } | undefined {
    // type.rb:58-66 ensure_type_id: `type_id_from_code ||
    // type_id_from_template` — the ASSIGNMENT walk runs FIRST. The walk is
    // the set-type-assignment registry over the card's type-assigning
    // pattern module keys (*right / *type plus right; pattern/all.rb:74-81
    // each_type_assigning_module_key) — sync: the registry is a Map and the
    // anchor-codename lookups go through the installed name environment
    // (warmed by warmLexicon). A registration whose type card does not
    // resolve (`assignment[..]&.card_id` nil, type.rb:72) falls through to
    // the template walk, exactly like Ruby's ||.
    const assignedName = findAssignedTypeName({ name: name.s, isNew: true, leftTypeName });
    if (assignedName !== undefined) {
      const env = getNameEnvironment();
      const assignedId =
        env?.codename?.id(assignedName) ?? env?.lexicon?.id(DeckoName.parse(assignedName).key);
      if (assignedId !== undefined) {
        // type.rb:32-35 quick_fetch(type_id)&.name — the TYPE CARD's name
        // ("List"), not the registration string ("list"): the slot's
        // data-card-type-name carries the card name (welcome_email.exp.html
        // pins "List" where the assignment line names :list).
        const assignedType =
          env?.lexicon?.name(assignedId) ?? env?.codename?.nameForId(assignedId);
        if (assignedType !== undefined) {
          return { typeId: assignedId, typeName: assignedType };
        }
      }
    }
    const universe = this.defaultRuleTypes;
    const names = this.defaultTypeNameById;
    if (universe === undefined || universe.size === 0 || names === undefined) return undefined;
    // isNew: true — every caller resolves a Ruby Card.new (the nest-miss
    // child here, the set_prototype prototype in prototypePatternInput), and
    // new cards drop the first applied pattern (the *self candidate —
    // lib/card/set/pattern/all.rb:26-28 `new_card? ? concrete_patterns[1..]
    // : concrete_patterns`). Keeping *self in the walk let an anchor's
    // X+*self+*default rule win where Ruby's prototype walk never sees it.
    const candidates = ruleNamesForCard(
      {
        name,
        id: undefined,
        typeId: undefined,
        typeName: undefined,
        leftTypeName,
        isNew: true,
      },
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
      if (typeName === undefined) return undefined;
      // dup_structure (templating.rb:61-65 + new_card_template:52-59): the
      // template is NOT always the *default rule card — the *default-typed
      // dup's *structure rule card, when it exists (content != "_self"),
      // BECOMES the template, and ensure_type_id's type_id_from_template
      // then answers THE STRUCTURE RULE CARD's own type_id. Corpus proof
      // (2026-10-02): a RichText gallery set whose *type plus right rule
      // names its prototype's *default walk hits *all plus+*default
      // (RichText-typed); the RichText-typed dup carries that set's
      // *type plus right+*structure rule (HTML-typed) -> the prototype
      // types HTML -> the *create walk hits HTML's *type+*create rule —
      // the oracle's create/delete rows for that set page.
      //
      // leftTypeName (the typeprint regression fix, 2026-10-02): Ruby's dup is a
      // real `dup` of the prototype Card, so it keeps @supercard/@superleft —
      // and the *structure walk's TPR anchor reads
      // `left_type(card) = card.superleft&.type_name`
      // (set_pattern/class_methods.rb:59-71). For a *type plus right
      // prototype the supercard is `Card.new(name: "*dummy", type:
      // anchor.trunk_name)` (08_type_plus_right.rb:23-28), so the anchor is
      // `<set's trunk>+<tag>` — NOT the registry's "unknown left type ->
      // RichText" default (registry.ts:186-192). Corpus proof: the
      // Search+large image+*type plus right prototype `*dummy+large image`
      // (supercard `*dummy` typed Search) walks to
      // Search+large image+*type plus right+*structure (rule 17703,
      // PlainText-typed) — with the RichText default the candidate misses,
      // the walk falls to `large image+*right+*structure` (rule 17705,
      // HTML-typed), and the prototype types HTML, so the *create/*update/
      // *delete walks hit HTML's +*type+*<setting> rules, which are
      // HTML-typed, where the oracle renders the `_left` inherit-perm span
      // (*all plus+*<setting>).
      const structureTypes = this.structureRuleTypes;
      const structureContents = this.structureContents;
      if (structureTypes !== undefined && structureTypes.size > 0) {
        const structureCandidates = ruleNamesForCard(
          { name, id: undefined, typeId, typeName, leftTypeName, isNew: true },
          STRUCTURE_SETTING_NAME,
        );
        for (const structureCandidate of structureCandidates) {
          let structureKey: string;
          try {
            structureKey = DeckoName.parse(structureCandidate).key;
          } catch (err) {
            if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
              continue; // unresolved mark: no *structure rule candidate
            }
            throw err;
          }
          const structureTypeId = structureTypes.get(structureKey);
          if (structureTypeId === undefined) continue;
          // structure_rule_card nils a "_self" winner (templating.rb:44-48)
          // — the walk does not continue past it.
          const structureContent = structureContents?.get(structureKey);
          if (structureContent !== undefined && structureContent !== null && structureContent.trim() === "_self") {
            return { typeId, typeName };
          }
          const structureTypeName = names.get(structureTypeId);
          return structureTypeName !== undefined
            ? { typeId: structureTypeId, typeName: structureTypeName }
            : { typeId, typeName };
        }
      }
      return { typeId, typeName };
    }
    return undefined;
  }

  /**
   * RenderEngineLike#defaultRuleTypeIdForSetName — views.ts
   * setPrototypeTypeCode's template leg, COLD arm: the set's own *default
   * rule card's TYPE ID from the preloaded full-deck *default universe
   * (defaultRuleUniverseStatement — every non-trashed <set>+*default rule
   * composed by the recursive name walk, loaded in the cold render's folded
   * batch). Ruby's template leg is a live rule-cascade data lookup
   * (card-mod-content-0.20.0 set/all/templating.rb:27-39 template ->
   * new_card_template -> rule_card(:default); lib/card/rule/all.rb
   * first-hit) with NO render-warmth dependency — the warm collectRules
   * walk (this.collectRules) only sees rule cards an earlier page render
   * happened to warm, which made the recent-category verdicts depend on
   * boot page order (the Search page's -51 `_category-recent` fold
   * regression: Family/*style/Collection *content options bars rendered
   * while their sets' List-typed *default cards 570/17452/17826 were
   * cold). Returns undefined when the universe is not loaded (the caller
   * keeps the not-allowed verdict — pre-fix behavior).
   */
  defaultRuleTypeIdForSetName(setName: string): number | undefined {
    const universe = this.defaultRuleTypes;
    if (universe === undefined || universe.size === 0) return undefined;
    let key: string;
    try {
      key = DeckoName.parse(`${setName}+*default`).key;
    } catch (err) {
      if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
        return undefined;
      }
      throw err;
    }
    return universe.get(key);
  }

  /**
   * Ruby's Rule::Cache (lib/card/rule/cache.rb) - the deck-wide rule
   * lookup hash, populated on FIRST rule lookup (Cache.read -> populate)
   * and cleared on writes. The port preloads the same SQL
   * (ruleCacheStatement) once per engine, in the async render half, and
   * answers rule-cache walks synchronously at view time:
   * set/rule/editor.rb's find_existing_rule_card chain (new_card? ->
   * existing_rule_from_prototype -> set_prototype.rule_card(setting) ->
   * rule_card_id -> rule_id_lookup) needs a sync answer no render-warmed
   * fetch can give (a stored rule no earlier render happened to seat).
   * Values carry the winning rule's SET identity (cache.rb's pattern_code
   * + the anchor name) so Set#label composes without a second lookup.
   * Cleared on resetCaches() (Ruby's clear_rule_cache).
   */
  private ruleCacheSetLabels:
    | Map<string, { patternCode: string; anchorName: string | undefined }>
    | undefined;
  private ruleCacheSetLabelsLoad: Promise<void> | undefined;

  async ensureRuleCacheSetLabels(): Promise<void> {
    if (this.ruleCacheSetLabels !== undefined) return;
    this.ruleCacheSetLabelsLoad ??= (async () => {
      const setTypeId = this.peekIdByCodename("set");
      const settingTypeId = this.peekIdByCodename("setting");
      if (setTypeId === undefined || settingTypeId === undefined) {
        this.ruleCacheSetLabels = new Map();
        return;
      }
      const statement = ruleCacheStatement(setTypeId, settingTypeId);
      const result = await this.fetcher.driver.query<RuleCacheRow>(
        statement.sql,
        statement.params ?? [],
      );
      // Anchor names: one lexicon read per distinct anchor id, resolved
      // here in the async half; the view-time answer is a Map hit.
      const anchorNames = new Map<number, string | undefined>();
      for (const row of result.rows) {
        if (row.anchor_id === null) continue;
        const anchorId = Number(row.anchor_id);
        if (anchorNames.has(anchorId)) continue;
        anchorNames.set(anchorId, (await this.fetcher.lexicon.name(anchorId))?.s);
      }
      const hash = new Map<
        string,
        { patternCode: string; anchorName: string | undefined }
      >();
      for (const row of result.rows) {
        const anchorId = row.anchor_id === null ? null : Number(row.anchor_id);
        // cache.rb pattern_code: the anchorless arm reads the set row's
        // OWN id, the anchored arm its pattern tag (set_tag_id).
        const patternSourceId =
          anchorId === null ? Number(row.set_id) : Number(row.set_tag_id ?? 0);
        const patternCode = this.peekCodenameById(patternSourceId);
        const settingCode = this.peekCodenameById(Number(row.setting_id));
        if (patternCode === undefined || settingCode === undefined) continue;
        hash.set(
          ruleCacheKeyFromRow(anchorId, patternCode, settingCode),
          {
            patternCode,
            anchorName:
              anchorId === null ? undefined : anchorNames.get(anchorId),
          },
        );
      }
      this.ruleCacheSetLabels = hash;
    })();
    await this.ruleCacheSetLabelsLoad;
  }

  /**
   * Rule::All#rule_card_id + rule_id_lookup (rule/all.rb:23-27, :66-74):
   * the FIRST lookup key whose "<key>+<setting>" the rule cache answers -
   * no fallback suffix (rule_card has none; that is preference_card_id's
   * arm). Returns the winning rule's SET identity (pattern code + anchor
   * name) so the caller composes Set#label without a second lookup.
   * Undefined when the cache is not loaded (ensureRuleCacheSetLabels not
   * awaited) or no key hits - Ruby's Card.fetch(nil) arm, the caller's
   * "--" fallback.
   */
  ruleCacheSetLabelWinner(
    lookupKeys: readonly string[],
    settingCode: string,
  ): { patternCode: string; anchorName: string | undefined } | undefined {
    const hash = this.ruleCacheSetLabels;
    if (hash === undefined) return undefined;
    for (const key of lookupKeys) {
      const winner = hash.get(`${key}+${settingCode}`);
      if (winner !== undefined) return winner;
    }
    return undefined;
  }

  /**
   * RenderEngineLike#ruleSetPrototypeTypeCode — card-mod-rules set/type/set.rb
   * #prototype.type_id's CODENAME for a RULE card's set (the visible_settings
   * input the categories machinery filters the restricted settings by):
   * Card.fetch(subclass_for_set.prototype_args(anchor_name), new:).type_id.
   * Delegates to views.ts #setPrototypeTypeCode — the SAME oracle-verified
   * port the set-page board's restricted-setting filter runs (assignment
   * layer right::<setting> / type_plus_right::<type>::<right>, template
   * chain, SELF existing-anchor arm; grep-verified 2026-09-26 against
   * expected-v2) — so the board enumeration and the bar categories read ONE
   * prototype resolution, never two divergent ports. Undefined when the set
   * card is not warm or no arm resolves (the caller's restricted-setting
   * filter treats that as not-allowed, never allowed).
   */
  ruleSetPrototypeTypeCode(card: RenderCard): string | undefined {
    if (!card.name.isCompound) return undefined;
    const parts = card.name.parts;
    if (parts.length < 2) return undefined;
    // The rule card's SET card (its trunk) — the closure composes junction
    // names from their side cards, so the trunk is warm wherever the rule
    // card is (composeAndCache's transitive-side passes).
    const setCard = this.fetchRenderCard(parts.slice(0, -1).join("+"));
    if (setCard === undefined) return undefined;
    return setPrototypeTypeCode(this, setCard);
  }

  /**
   * The *default rule's CONTENT for a nest-miss new card (content/all.rb:
   * 17-19 standard_content's new_card branch: `db_content ||
   * (new_card? ? default_content : "")`, default_content = template&.
   * db_content — the SAME winning rule card newCardDefaultType reads the
   * type from). p20-nest-selection: an earlier class's 19 Project pages
   * pin the applied form — the oracle's +discussion titled body is
   * `discussion+*right+*default`'s `<p> </p>\r\n<p> </p>` verbatim.
   * Returns undefined when the universe is not loaded or no candidate
   * exists (the caller keeps dbContent "" — Ruby's nil falls through to
   * standard_content's "" tail).
   */
  newCardDefaultContent(name: DeckoName): string | undefined {
    const universe = this.defaultRuleContents;
    if (universe === undefined || universe.size === 0) return undefined;
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
      if (!universe.has(key)) continue;
      // NULL-content rule: Ruby's default_content nil falls through
      // standard_content to "" — indistinguishable from no rule here.
      return universe.get(key) ?? "";
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
   * transitive refs (e.g. A -> B -> {{xxxx...}}) sat on a
   * card without an applicable *structure rule: structureProcessed
   * skipped such cards (the old `if (resolved === undefined) continue`
   * shape) so the xxx refs never entered structureRefMisses, closureWarm
   * saw them missing on every render, and the cold SQL walk re-ran —
   * measured 4.5 s/render on one card's closed view alone (well past
   * the 25 ms
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
  /** THE LATE-SEAT STRUCTURE SWEEP (T1-1 sweepproof, 2026-10-06): one final
   *  applyStructureContent pass immediately before a sync render dispatch.
   *
   *  Mechanism the sweep cut left open: applyStructureContent's two inline
   *  passes (the prepare flow's only structure processors) run BEFORE the
   *  render tail's late seat paths — enrichPointerListItemsClosure, the
   *  asset/skin/setting warms, enrichLinkTargetsForKnownClass, the follow/
   *  rule warms (bare surface), warmupLayoutReferences and
   *  prepareNestClosureSearches (page surface). A card seated by any of them
   *  joins renderSeats but no structure pass of its seat render ever sees
   *  it: enrichAndStore seats only on map INSERT (the existing-key guard),
   *  so no later render re-seats it, and closureSurface's BFS walks only
   *  absolute nest references — pointer-item lines, search results, and
   *  relative references are not BFS edges — so no later render re-reaches
   *  it either. Its *structure substitution never lands and every later
   *  render reads the raw db_content (permanently; only resetCaches re-does
   *  it). The pre-cut tree's whole-map pass was those cards' only processor.
   *
   *  This call closes the class structurally instead of by edge enumeration:
   *  every seat path above runs before the dispatch, so the pass sees every
   *  seat of the render (renderSeats is render-scoped), substitutes each
   *  exactly once (structureProcessed is engine-lifetime), and costs one
   *  query-free map scan when nothing seated late (warm renders seat no late
   *  cards — the sweep cut froze the map at the byte closure — so the
   *  one-trip warm posture is untouched).
   *
   *  Call sites = every prepare pass's last point before a sync dispatch:
   *  render() (the bare view surface, after the follow/rule warms), and the
   *  page surface's two dispatch boundaries (before the main body render and
   *  before the layout content render — the layout warm-ups seat between
   *  the two). */
  async applyLateSeatStructureContent(): Promise<void> {
    await this.applyStructureContent();
  }

  private async applyStructureContent(): Promise<void> {
    const universe = this.structureContents;
    if (universe === undefined) return;
    for (let round = 0; round < 8; round++) {
      const toFetch = new Map<string, string>(); // ref name -> key
      // Existing map cards this round's substituted templates reach, seated
      // into this render's surface (see the ref loop below).
      let seatedExisting = false;
      // SWEEP-SURFACE (renderSeats): process only cards THIS render seated.
      // The done-sets below are engine-lifetime, so a card seated by an
      // earlier render is either processed already or is that render's
      // chase residue — chasing it is the sweep cascade (renderSeats' doc);
      // no view ever reads it (bytes stable across map sizes 477 → 3,961).
      for (const [key, card] of this.renderCards) {
        if (!this.renderSeats.has(key)) continue;
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
        // Both branches absolutize against THIS card's name (the
        // chunk/reference.rb referencing-card contract the Ruby port cites
        // in nest-syntax.ts's header): a template's `{{+image}}` names
        // `<instance>+image`. Without the context the walk produced the
        // literal key "+image", which matched no row, fell into
        // structureRefMisses, and every template child rendered as the
        // unknown-card empty slot even when its row existed (a live-wire
        // gap found on the deployed site). The prefetch's contextual collect and
        // closureWarm's cardReferenceKeys absolutize identically, so all
        // three walkers agree on one key set.
        const contentForRefs = resolved !== undefined
          ? resolved.templateContent
          : card.dbContent;
        if (resolved !== undefined && resolved.templateContent !== card.dbContent) {
          card.dbContent = resolved.templateContent;
        }
        // Live render: references are not chased (skipStructureRefWalks'
        // doc). Remember them so a render that asks for one is caught.
        const lazyRefs = this.skipStructureRefWalks;
        for (const refName of templateReferenceNames(contentForRefs, card.name)) {
          if (lazyRefs) {
            let lazyKey: string;
            try {
              lazyKey = DeckoName.parse(refName).key;
            } catch {
              lazyKey = ""; // an unresolvable mark: the walk below drops it too
            }
            if (lazyKey !== "" && !this.eagerStructureRefs.has(lazyKey)) {
              this.skippedStructureRefs.set(lazyKey, refName);
              continue;
            }
          }
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
          // A template ref to a card an EARLIER render stored is still this
          // render's nest: closureSurface ran before the substitution, so it
          // never saw this edge, and enrichAndStore seats only on insert. Seat
          // the card's closure here, so this render's sweeps (structure, link
          // targets, verdicts) process it exactly as a fresh engine would.
          // Without this, a sample author's `+agree` (whose
          // `agree+*right+*structure` nests `Intellectual Property+Statement`)
          // rendered that card's links as wanted on any warm engine.
          if (refKey !== "" && this.renderCards.has(refKey) && !this.renderSeats.has(refKey)) {
            for (const k of this.closureSurfaceFromKey(refKey)) {
              if (!this.renderSeats.has(k)) {
                this.renderSeats.add(k);
                seatedExisting = true;
              }
            }
            continue;
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
      if (toFetch.size === 0) {
        if (seatedExisting) continue;
        return;
      }
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
      // db round-trip elimination: the compound refs resolve in
      // BATCHED rounds (the driveClosure statement shapes) instead of one
      // full fetch-ladder walk per name - the census measured this loop as
      // the render path's single largest point-query family (up to ~550
      // hops/page: per name up to two key->id side lookups, one pair
      // existence check, one id row, and idToLex reads on compose). After
      // the wave every ref is seated in the render-card map or primed
      // negative in the lexicon, so the ladder walk below answers from
      // cache - the name-by-name loop stays for its miss bookkeeping, now
      // zero-query.
      if (compoundNames.length > 0) {
        const seatedAny = await this.seatNamesByWave(compoundNames);
        if (seatedAny) enrichedAny = true;
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
      if (!enrichedAny && !seatedExisting) return; // all misses recorded; nothing new to process
    }
  }

  /**
   * db round-trip elimination: prime the derived state the
   * sync render resolves by name at view time, in batched waves:
   *
   *   1. TYPE CARDS - one chunked IN-list over every prepared record's
   *      typeId; the view-time enrichAndStore type reads then hit the
   *      fetch cache (census: 18-26 point queries per page, ids 5/50/52/19
   *      - the seed type cards).
   *   2. RULE CANDIDATES - for every prepared card, the candidate rule
   *      names of the settings the view-time resolvers walk
   *      (resolveOptionsCard's *content options + setHostOptionsParse-
   *      Failure's *help/*structure/*default) seat through seatNamesByWave
   *      - the findRule ladder then answers from the seated map (hit) or
   *      the primed negative (miss). Census: 26-82 pair queries per page.
   *
   * Everything here writes exactly what the per-name point path would
   * have written (rows through composeCardRecord + cacheFetchedRecord +
   * Lexicon#write; negatives through the wave's priming), so the sync
   * render's answers are byte-identical - only the round trips change.
   */
  private async primePreparedCardDerivedState(rootKey: string | undefined): Promise<void> {
    const typeIds = new Set<number>();
    // SWEEP-SURFACE (renderSeats): new type ids arrive only with this
    // render's seats; earlier renders' cards were primed already.
    for (const card of this.renderCards.values()) {
      if (!this.renderSeats.has(card.key)) continue;
      const t = card.record.typeId;
      if (
        typeof t === "number" &&
        Number.isSafeInteger(t) &&
        t > 0 &&
        !this.typeCardsPrimed.has(t)
      ) {
        typeIds.add(t);
      }
    }
    if (typeIds.size > 0) {
      for (const id of typeIds) this.typeCardsPrimed.add(id);
      const ids = [...typeIds];
      const typeStatements: SQLStatement[] = [];
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const placeholders = chunk.map(() => "?").join(", ");
        typeStatements.push({
          sql: `SELECT * FROM cards WHERE id IN (${placeholders}) AND trash = 0`,
          params: chunk,
        });
      }
      // W4 batch fusion (the round-trip reduction fix): the type prime no longer
      // spends its own round trip before the candidate seat. When the seat
      // will run, the statements ride seatNamesByWave's FIRST batch as its
      // preamble - one round trip carries the priming rows AND the wave's
      // own asks, and the preamble rows seat before the wave rows so the
      // seated cards' enrichAndStore type reads hit the fresh cache. The
      // priming population nuance: the type cards themselves seat with the
      // wave now, so THIS render's candidate collection (memory over the
      // prepared map) runs without them - their rule candidates prime on a
      // later render's population instead. Answers are untouched (priming
      // only fills the cache; the findRule ladder computes the same verdicts
      // either way - the byte oracles are the proof).
      const candidateSettings = ["*content options", "*help", "*structure", "*default"];
      let seatCandidates = true;
      if (rootKey !== undefined && rootKey !== "") {
        // warm re-render of this page: nothing to seat; the type prime (the
        // documented late-seat warm exception) runs standalone below.
        if (this.ruleCandidatesPrimedFor.has(rootKey)) seatCandidates = false;
        else this.ruleCandidatesPrimedFor.add(rootKey);
      }
      const names = new Set<string>();
      if (seatCandidates) {
        // SWEEP-SURFACE (renderSeats): candidate collection over this
        // render's seats — the set is deterministic per root on the render
        // that seats the closure (render 1 / post-reset), and warm renders
        // seat nothing new.
        for (const card of this.renderCards.values()) {
          if (!this.renderSeats.has(card.key)) continue;
          if (card.record.isNew) continue;
          for (const setting of candidateSettings) {
            let candidates: string[];
            try {
              candidates = ruleNamesForCard(this.structurePatternInputForSync(card), setting);
            } catch (err) {
              if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
                continue;
              }
              throw err;
            }
            for (const candidate of candidates) names.add(candidate);
          }
        }
      }
      if (seatCandidates && names.size > 0) {
        await this.seatNamesByWave([...names], typeStatements);
      } else {
        const rows = (await this.fetcher.driver.batch(typeStatements)).flatMap(
          (result) => (result.rows as CardsRow[]) ?? [],
        );
        // the batched fetch composer: the type rows' own compose needs
        // (their sides, their type cards) prime from the held rows the same
        // way the wave's rows do — this standalone arm measured 5
        // idToLex + 6 row-by-id solos post-reset before the prime.
        await this.primeRowsForComposition(rows);
        for (const row of rows as CardsRow[]) {
          const record = await composeCardRecord(row, this.fetcher.lexicon);
          if (record.name === undefined || record.id === undefined) continue;
          if (row.name !== null && row.name !== undefined) {
            this.fetcher.lexicon.write(record.id, record.name, row.name);
          }
          await this.cacheFetchedRecord(record);
        }
      }
    }
  }

  /**
   * db round-trip elimination: seat ABSOLUTE names into the
   * render-card map in BATCHED rounds - the driveClosure statement shapes
   * (prefetch.ts) over this engine's render-card map as the known-set:
   *
   *   - simple names ride chunked `"key" COLLATE NOCASE IN` statements,
   *   - depth-2 junctions ride the side-key join (and their simple sides
   *     ride the same round's IN-list so the junction composes),
   *   - junctions whose sides are both seated ride the chunked
   *     (left_id, right_id) tuple form keyed on the seated ids,
   *   - a compound side that is not seated yet joins the next round
   *     (resolution-first, the driveClosure contract).
   *
   * Every fetched row composes sides-first within the batch, primes the
   * lexicon both directions (Lexicon#write, the prefetch composer's
   * contract), and lands in the enriched render-card map through
   * cacheFetchedRecord - the same write path the closure walk uses, so the
   * seated state is indistinguishable from the per-name ladder's. Names
   * that asked and missed prime NEGATIVE lexicon entries (the pair key
   * where both sides' ids are known, the key form for simple names) so the
   * ladder walk answers the miss from cache with the same placeholder the
   * point-query path would have cached.
   *
   * Returns whether any name seated (the caller's enrichedAny signal).
   */
  private async seatNamesByWave(
    names: string[],
    preambleStatements?: SQLStatement[],
  ): Promise<boolean> {
    if (names.length === 0) return false;
    const knownId = (key: string): number | undefined => {
      const card = this.renderCards.get(key);
      const id = card?.record.id;
      return typeof id === "number" && id > 0 ? id : undefined;
    };
    const MAX_WAVE_ROUNDS = 25; // prefetch.ts MAX_CLOSURE_ROUNDS parity
    const pending = new Set<string>();
    for (const raw of names) {
      let key: string;
      try {
        key = DeckoName.parse(raw).key;
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
          continue; // unresolved mark: the ladder walk reports it
        }
        throw err;
      }
      if (this.renderCards.has(key) || this.structureRefMisses.has(key)) continue;
      pending.add(raw);
    }
    // ENGINE-LIFETIME ask memory (db round-trip elimination): every
    // question one wave asked the database, this engine never re-asks. The
    // deck is static per engine lifetime (the same contract
    // pointerListHostsDone and prefetch.ts's scannedKeys document), so a
    // later render's wave cannot find a new answer for a question the db
    // already answered - and the warm-render query-shape pins (zero
    // queries on re-render) hold because every re-ask is skipped.
    if (this.waveAskedSimpleKeys === undefined) this.waveAskedSimpleKeys = new Map();
    if (this.waveAskedPairs === undefined) this.waveAskedPairs = new Map();
    const askedSimpleKeys = this.waveAskedSimpleKeys;
    const askedPairs = this.waveAskedPairs;
    const askedSideKeyPairs = this.waveAskedSideKeyPairs;
    // THIS CALL's asks and answers (db-roundtrip-elimination continuation):
    // the negative priming below derives "asked and missed" from THESE, never
    // from the engine-lifetime maps (a warm render's call would otherwise
    // re-prime nil over an earlier render's positive) and never from
    // per-round answer sets (a multi-round call re-primed nil over its own
    // earlier-round positives - the stored nil then answered the render's own rule
    // ladders "absent" for junctions the db holds).
    const callAskedSimple = new Set<string>();
    const callAskedPairs = new Set<string>();
    const callAnsweredSimple = new Set<string>();
    const callAnsweredPairs = new Set<string>();
    // W4 batch fusion (the round-trip reduction fix): a caller's preamble
    // statements (the W2b type-card prime) ride the FIRST round's batch -
    // one round trip carries the priming rows and the wave's own asks. The
    // preamble rows flow through the same compose/write/seat pipeline as the
    // round's rows; they are ordinary cards, not wave asks, so they never
    // enter the ask sets and the negative priming below is untouched. If the
    // wave finishes without ever batching (every pending name already
    // seated), the preamble runs as its own batch after the loop - the
    // priming is never lost.
    let preamble = preambleStatements ?? [];
    let seatedAny = false;
    for (let round = 0; round < MAX_WAVE_ROUNDS && pending.size > 0; round++) {
      const simpleKeys: string[] = [];
      const sideKeyPairs: { left: string; right: string; raw: string }[] = [];
      const sideIdPairs: { leftId: number; rightId: number; lex: Lex }[] = [];
      const nextRound: string[] = [];
      let heldSeatThisRound = false;
      for (const raw of pending) {
        let name: DeckoName;
        try {
          name = DeckoName.parse(raw);
        } catch (err) {
          if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
            continue;
          }
          throw err;
        }
        if (this.renderCards.has(name.key)) continue; // seated by an earlier round
        const left = name.leftName;
        const right = name.rightName;
        if (!name.isCompound || left === undefined || right === undefined) {
          const key = name.key;
          // the batched fetch composer (2026-10-06): the OLD gate skipped the
          // ask whenever the LEXICON held any entry for the key — but a lex
          // entry is not a seated record: lexToId's side resolutions write
          // `L-<key> -> id` without ever fetching the row, and the wave's
          // job (the seat) was then left to the caller's solo point query
          // (measured: the item loop's `WHERE key = ?` ladders over exactly
          // such keys). The gate now asks what the wave actually needs: the
          // record not held at all -> ask it; the record held in the FETCH
          // cache -> seat it from cache (zero queries, the seat still
          // happens); a held NEGATIVE (a database answer) keeps the skip —
          // the ask happened once (askedSimpleKeys) and the row does not
          // exist. askedSimpleKeys keeps the never-re-ask discipline, so a
          // warm render still asks nothing new.
          if (
            !this.renderCards.has(key) &&
            !askedSimpleKeys.has(key) &&
            !this.fetcher.lexicon.heldKeyNegative(key)
          ) {
            const held = this.fetcher.retrieveFromCacheByKey(key);
            if (held !== undefined) {
              heldSeatThisRound = true;
              await this.cacheFetchedRecord(held);
              seatedAny = true;
            } else {
              askedSimpleKeys.set(key, raw);
              callAskedSimple.add(key);
              simpleKeys.push(key);
            }
          }
          continue;
        }
        const leftId = knownId(left.key);
        const rightId = knownId(right.key);
        if (leftId !== undefined && rightId !== undefined) {
          const lex: Lex = [leftId, rightId];
          const pairKey = `L-${leftId}-${rightId}`;
          if (!askedPairs.has(pairKey) && !this.fetcher.lexicon.lexEntryKnown(lex)) {
            askedPairs.set(pairKey, { leftId, rightId, lex });
            callAskedPairs.add(pairKey);
            sideIdPairs.push({ leftId, rightId, lex });
          }
        } else if (!left.isCompound && !right.isCompound) {
          // depth-2 pair: side-key join; the sides ride this round's
          // IN-list so the junction composes (driveClosure shape).
          const sidePairKey = `${left.key}~${right.key}`;
          if (!askedSideKeyPairs.has(sidePairKey)) {
            askedSideKeyPairs.add(sidePairKey);
            sideKeyPairs.push({ left: left.key, right: right.key, raw });
            if (!this.renderCards.has(left.key) && !askedSimpleKeys.has(left.key)) {
              askedSimpleKeys.set(left.key, left.s);
              callAskedSimple.add(left.key);
              simpleKeys.push(left.key);
            }
            if (!this.renderCards.has(right.key) && !askedSimpleKeys.has(right.key)) {
              askedSimpleKeys.set(right.key, right.s);
              callAskedSimple.add(right.key);
              simpleKeys.push(right.key);
            }
          }
        } else {
          // a compound side is not seated yet: resolve the sides first.
          nextRound.push(left.s, right.s);
          // the batched fetch composer (2026-10-06): re-pend the name itself.
          // MEASURED CONVERGENCE GAP (this pass's attribution): the old push
          // resolved the sides but never re-asked the PARENT, so the
          // parent's own pair existence was left to the caller's first
          // id() walk — one solo pair probe per 3-level name (the residual
          // X+*right+*content options / X+*type+by name probes). With the
          // name re-pended, a later round sees both sides seated and asks
          // the parent pair in the batched OR-tuple (once — askedPairs),
          // seating or negatively priming exactly what the caller's fetch
          // would have asked. Termination: the name only re-pends while a
          // side is compound-and-unseated; each round the unresolved side
          // decomposes toward simple names (which seat or prime negative),
          // and MAX_WAVE_ROUNDS bounds the whole loop — an unresolvable
          // virtual side costs memory-only deferral rounds, never queries.
          nextRound.push(raw);
        }
      }
      if (simpleKeys.length === 0 && sideKeyPairs.length === 0 && sideIdPairs.length === 0) {
        // Nothing fetchable: every pending name waits on sides that resolve
        // next round or is already seated/asked.
        if (nextRound.length === 0) break;
        // Fixpoint: a round that asked nothing and seated nothing changed no
        // state the round reads (renderCards, the ask sets, the lexicon), so
        // when it re-pends exactly the names it started with, every later
        // round is the same no-op up to MAX_WAVE_ROUNDS. Stop now.
        if (!heldSeatThisRound && nextRound.length >= pending.size) {
          const next = new Set(nextRound);
          if (next.size === pending.size && [...next].every((raw) => pending.has(raw))) break;
        }
        pending.clear();
        for (const raw of nextRound) pending.add(raw);
        continue;
      }
      const statements: SQLStatement[] = [];
      if (preamble.length > 0) {
        // The preamble rows return FIRST in the batch results and seat
        // before the wave rows (the flatMap below preserves statement
        // order) - exactly the order the priming needs.
        statements.push(...preamble);
        preamble = [];
      }
      if (simpleKeys.length > 0) {
        for (let i = 0; i < simpleKeys.length; i += 90) {
          const chunk = simpleKeys.slice(i, i + 90);
          const placeholders = chunk.map(() => "?").join(", ");
          statements.push({
            sql: `SELECT * FROM cards WHERE "key" COLLATE NOCASE IN (${placeholders}) AND trash = 0`,
            params: chunk,
          });
        }
      }
      if (sideKeyPairs.length > 0) {
        for (let i = 0; i < sideKeyPairs.length; i += 45) {
          const chunk = sideKeyPairs.slice(i, i + 45);
          const leftKeys = chunk.map((pair) => pair.left);
          const rightKeys = chunk.map((pair) => pair.right);
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
        }
      }
      if (sideIdPairs.length > 0) {
        for (let i = 0; i < sideIdPairs.length; i += 400) {
          const chunk = sideIdPairs.slice(i, i + 400);
          const tuple = chunk.map(() => "(j.left_id = ? AND j.right_id = ?)").join(" OR ");
          const params = chunk.flatMap((pair) => [pair.leftId, pair.rightId]);
          statements.push({
            sql: `SELECT j.* FROM cards j WHERE j.trash = 0 AND (${tuple})`,
            params,
          });
        }
      }
      // Side priming rides LAST (the driveClosure batch contract): the
      // sides of every row this round fetched join the next round so their
      // records compose + enrich (junction names need them).
      const rows = (await this.fetcher.driver.batch(statements)).flatMap(
        (result) => (result.rows as CardsRow[]) ?? [],
      );
      // the batched fetch composer: the rows in hand carry everything
      // the per-row compose pipeline is about to ask one row at a time
      // (sides' idToLex reads, type-card reads, left-side row reads).
      // Prime from the held rows + one id IN read for the residue BEFORE
      // the compose loop, so composeCardRecord/enrichAndStore answer from
      // cache — same rows, same answers, batched asks (the wave's own
      // priming pattern applied to the rows the wave already holds).
      // Prime only, never serve: the compose loop below still runs its
      // own pipeline and lands every row through cacheFetchedRecord.
      await this.primeRowsForComposition(rows);
      const fetchedPairs = new Set<string>();
      for (const row of rows) {
        if (row.left_id !== null && row.left_id !== undefined && row.right_id !== null && row.right_id !== undefined) {
          fetchedPairs.add(`L-${row.left_id}-${row.right_id}`);
        }
        const record = await composeCardRecord(row, this.fetcher.lexicon);
        if (record.name === undefined || record.key === undefined || record.key === "") continue;
        // The row ANSWERED its question for this call: a row whose composed
        // key is one this call asked can never be primed as a miss below.
        callAnsweredSimple.add(record.key);
        if (row.name !== null && row.name !== undefined) {
          this.fetcher.lexicon.write(record.id!, record.name, row.name);
        } else if (
          row.left_id !== null &&
          row.left_id !== undefined &&
          row.right_id !== null &&
          row.right_id !== undefined
        ) {
          this.fetcher.lexicon.write(record.id!, record.name, [row.left_id, row.right_id]);
        }
        await this.cacheFetchedRecord(record);
        seatedAny = true;
      }
      for (const pairKey of fetchedPairs) callAnsweredPairs.add(pairKey);
      // Negative priming for the asked-and-missed questions: the exact
      // entries lexToId's cacheFetch would have cached. Both derivations are
      // THIS CALL's cumulative ask/answer sets (see their declaration):
      //  - a simple key is missed only when no row of any round carried it
      //    (callAnsweredSimple) and it did not seat earlier (renderCards);
      //  - a pair is missed only when no row of any round answered it
      //    (callAnsweredPairs unions every round's fetchedPairs). The
      //    previous per-round view re-primed NIL over first-round positives at
      //    every later round of a multi-round call - and the render-card-map
      //    view (the ask memory variant) primed nil over ANSWERED keys
      //    whenever the answer was not seated into the map.
      const missingSimple: { key: string; id: undefined }[] = [];
      for (const key of callAskedSimple) {
        if (!callAnsweredSimple.has(key) && !this.renderCards.has(key)) {
          missingSimple.push({ key, id: undefined });
        }
      }
      if (missingSimple.length > 0) this.fetcher.lexicon.primeIdsByKey(missingSimple);
      for (const pairKey of callAskedPairs) {
        // the positive rows primed via lexicon.write above; the negative
        // only for pairs no row of ANY round answered.
        if (!callAnsweredPairs.has(pairKey)) {
          const entry = askedPairs.get(pairKey);
          if (entry !== undefined) this.fetcher.lexicon.primeIdByLex(entry.lex, undefined);
        }
      }
      pending.clear();
      for (const raw of nextRound) pending.add(raw);
      // A side-key-pair name whose junction row did not come back retries
      // NEXT round as a side-id pair (its sides just seated): that ask is
      // final - it lands in askedPairs and primes the negative there. A
      // name whose final-form ask missed is dropped: its negative is
      // primed, so the ladder walk below answers the miss from cache with
      // the same placeholder the point-query path would have cached
      // (zero queries).
      for (const pair of sideKeyPairs) {
        let retry: DeckoName;
        try {
          retry = DeckoName.parse(pair.raw);
        } catch {
          continue;
        }
        const left = retry.leftName;
        const right = retry.rightName;
        if (left === undefined || right === undefined) continue;
        const leftId = knownId(left.key);
        const rightId = knownId(right.key);
        if (leftId === undefined || rightId === undefined) continue; // side missed: negative already primed
        const pairKey = `L-${leftId}-${rightId}`;
        if (!askedPairs.has(pairKey) && !this.renderCards.has(retry.key)) {
          pending.add(pair.raw);
        }
      }
    }
    if (preamble.length > 0) {
      // The wave never reached a batch (all candidate names already seated
      // or asked): the priming still runs, one batch.
      const rows = (await this.fetcher.driver.batch(preamble)).flatMap(
        (result) => (result.rows as CardsRow[]) ?? [],
      );
      // the batched fetch composer: same in-hand prime as the round
      // loop's batch (see primeRowsForComposition).
      await this.primeRowsForComposition(rows);
      for (const row of rows as CardsRow[]) {
        const record = await composeCardRecord(row, this.fetcher.lexicon);
        if (record.name === undefined || record.id === undefined) continue;
        if (row.name !== null && row.name !== undefined) {
          this.fetcher.lexicon.write(record.id, record.name, row.name);
        }
        await this.cacheFetchedRecord(record);
        seatedAny = true;
      }
    }
    return seatedAny;
  }

  /**
   * the batched fetch composer (2026-10-06): prime the compose
   * pipeline's inputs from rows the wave ALREADY HOLDS, before the
   * per-row compose loop runs.
   *
   * MEASURED MECHANISM (warmflood sweep-cut + this pass's attribution
   * probes): a wave-fetched junction row's composeCardRecord walks
   * composeName -> name(sideId) -> idToLex point reads (one round trip
   * per side, recursively for nested junctions), and the seat pipeline's
   * cacheFetchedRecord -> enrichAndStore adds retrieveFromCacheById
   * (typeId -> idToLex + row read) and fetchByName(leftKey) (a row read
   * by key) — measured post-reset: 12 idToLex + ~18 row-by-id + several
   * row-by-key solos per render, all for data the wave's own statements
   * already returned (every junction row carries its sides' ids; the
   * side rows usually ride the same IN-lists).
   *
   * THE VEHICLE: (1) entries derivable from the held rows are written at
   * zero queries — exactly idToLex's write shape (lexicon.noteIdToLexRow);
   * (2) the residue (side ids and type ids no held row answers) asks ONE
   * chunked `WHERE id IN` statement, trash UNFILTERED — idToLex reads
   * without a trash filter (lexicon.rb#id_to_lex), so a trashed side's
   * name composes exactly as the point read would compose it; iterated to
   * a fixpoint over newly read junction rows' own sides (bounded — the
   * lex recursion's depth shape); (3) clean (trash = 0) rows land in the
   * FETCH cache only (writeToCache — the same write the base flow's
   * updateCache performs when ITS point query returns the row), never the
   * render map, so enrichAndStore's type/left fetches hit the cache in
   * the same order the base flow produces and the map's insertion order
   * is untouched.
   *
   * PRIME DISCIPLINE: every entry derives from a row actually read by a
   * statement this wave ran (asked-and-answered); an id the batched read
   * proved absent mirrors idToLex's own empty-result write-back
   * (lexicon.noteIdToLexMiss) and nothing else. The compose loop after
   * this call still runs its own pipeline — this method only decides who
   * asks first.
   */
  private async primeRowsForComposition(rows: CardsRow[]): Promise<void> {
    if (rows.length === 0) return;
    // the edge regression fixes (2026-10-06): the residue reads below had NO
    // ask memory — every wave call re-collected every side/type id not in
    // ITS OWN rows and re-batched it, so the sweepproof late-seat sweep's
    // added wave traffic multiplied the SAME per-id reads (Home measured
    // one id 17x per render, 487 id-to-name statements where the r5 tree
    // issued 196). The wave ask maps above set the contract: a point read
    // by id is definitive ("the deck is static per engine lifetime"), so
    // the prime asks each id ONCE per engine and lets the lexicon absorb
    // the rest — cleared in resetCaches alongside the knowledge it indexes,
    // exactly like waveAskedSimpleKeys/waveAskedPairs.
    if (this.primeAskedIds === undefined) this.primeAskedIds = new Set();
    const askedPrimeIds = this.primeAskedIds;
    const inHand = new Map<number, CardsRow>();
    const missing = new Set<number>();
    const fullRows: CardsRow[] = [];
    for (const row of rows) {
      if (typeof row.id === "number") {
        inHand.set(row.id, row);
        fullRows.push(row);
      }
    }
    const PRIME_ID_CHUNK = 500;
    const collectNeeds = (source: Iterable<CardsRow>): number => {
      let added = 0;
      for (const row of source) {
        for (const side of [row.left_id, row.right_id]) {
          if (
            typeof side === "number" &&
            !inHand.has(side) &&
            !missing.has(side) &&
            !askedPrimeIds.has(side)
          ) {
            missing.add(side);
            added += 1;
          }
        }
        if (
          typeof row.type_id === "number" &&
          !inHand.has(row.type_id) &&
          !missing.has(row.type_id) &&
          !askedPrimeIds.has(row.type_id)
        ) {
          missing.add(row.type_id);
          added += 1;
        }
      }
      return added;
    };
    collectNeeds(inHand.values());
    // (1) the lexicon entries, exactly idToLex's write shape, from held
    // rows. FREE (no queries) — always runs.
    for (const row of inHand.values()) this.fetcher.lexicon.noteIdToLexRow(row);
    // Residue gate (measured, three shapes): firing the residue read per
    // wave call cost +46 trips net when the calls were ~100 per-host waves;
    // at >= 2 it fires per wave ROUND (primeRowsForComposition runs once
    // per round) and cost +16 net (85 -> 101 measured). At >= 6 the read
    // fires only for the big merged waves, where it kills more compose
    // solos than its round trip costs (measured 91 -> 85 together with the
    // prefetch type prime). Below the gate the absent-id write-back is NOT
    // materialized either — those ids were never asked by a statement, so
    // the base flow's own point read stays the asker.
    if (missing.size < 6) return;
    // (2) ask the residue (no trash filter — idToLex semantics), then
    // chase the newly read junction rows' own sides to a fixpoint. The
    // members ride ONE batch as PER-ID statements in the exact recorded
    // idToLex shape (`SELECT name, left_id, right_id FROM cards WHERE
    // id = ? LIMIT 1` — the lexicon-id-to-name plan family): a serving
    // render's plan holds those reads, so the replay router serves every
    // member and the prime costs zero live trips exactly where the base
    // flow's own idToLex point reads were served too. An absent id is
    // final after its one read (a point read by id is definitive) and gets
    // the mirrored write-back after the loop. The residue rows are SLIM
    // (no content columns) — they prime the lexicon ONLY; the fetch-cache
    // writes in (3) draw from the wave's own FULL rows, never the slim
    // ones (a content-less record would poison the cache exactly like the
    // prefetch's codename-less record did).
    const absent = new Set<number>();
    let guard = 0;
    while (missing.size > 0 && guard < 8) {
      guard += 1;
      const ids = [...missing];
      missing.clear();
      for (let i = 0; i < ids.length; i += PRIME_ID_CHUNK) {
        const chunk = ids.slice(i, i + PRIME_ID_CHUNK);
        // Ask memory is written at ASK time: an absent id is definitive too
        // (a point read by id found nothing), so its one read must never
        // re-batch on a later wave call.
        for (const id of chunk) askedPrimeIds.add(id);
        const results = await this.fetcher.driver.batch(
          chunk.map((id) => ({
            sql: "SELECT name, left_id, right_id FROM cards WHERE id = ? LIMIT 1",
            params: [id],
          })),
        );
        const freshById = new Map<number, CardsRow>();
        results.forEach((result, k) => {
          const askedId = chunk[k]!;
          const row = (result.rows as Partial<CardsRow>[])[0];
          if (row === undefined) {
            absent.add(askedId); // definitive: a point read by id found nothing
            return;
          }
          const slim = {
            id: askedId,
            name: row.name ?? null,
            left_id: row.left_id ?? null,
            right_id: row.right_id ?? null,
          } as CardsRow;
          if (!inHand.has(askedId)) {
            inHand.set(askedId, slim);
            freshById.set(askedId, slim);
          }
          this.fetcher.lexicon.noteIdToLexRow(slim);
        });
        collectNeeds(freshById.values());
      }
    }
    for (const id of absent) this.fetcher.lexicon.noteIdToLexMiss(id);
    // (3) clean FULL rows into the FETCH cache only (never the render
    // map) — the same storeCard write the base flow's updateCache performs
    // when its point query returns the row. The compose below is now a
    // cache hit (the entries above answer it), so this costs zero queries.
    for (const row of fullRows) {
      if (row.trash !== 0) continue;
      const record = await composeCardRecord(row, this.fetcher.lexicon);
      if (record.name === undefined || record.id === undefined) continue;
      this.fetcher.writeToCache(record);
    }
  }

  /** Seat the read verdicts of UNKNOWN nest-target refs. Ruby fetches such
   *  a target with `new:` (format/nest/fetch.rb) so the nest renders a NEW
   *  card whose type RESOLVES FROM THE *default TEMPLATE before any
   *  permission walk (mod/core/set/all/type.rb:78-80
   *  type_id_from_template at new-card creation), and
   *  view/permission.rb:22 `alter_unknown || denial` consults that card's
   *  read verdict for every view whose `unknown:` config is `true` (the
   *  view "supports unknown"). Two populations, both corpus-proven:
   *
   *  1. SIMPLE STARRED names (the setting-card shape — the corpus's *foot,
   *     card 4033 trash=1): the new card's type lands on *all+*default
   *     (rule 28, BasicCs), its read walk hits BasicCs+*type+*read (rule
   *     22283, "Anyone Signed In") and Anonymous is denied → the quiet
   *     denial span inside the highlighted layout source (the oracle-pinned
   *     class).
   *  2. COMPOUND names (the {{+field}} phantom family — Sample Card 167's
   *     {{+Human|closed}} leaves): the verdict is the LIVE RECURSIVE _left
   *     walk (card-mod-permissions set/all/permissions.rb:55-71, read
   *     verbatim: `permission_rule_id` -> `rule(action).match?(
   *     /^\[?\[?_left\]?\]?$/)` -> `left_permission_rule_id` ->
   *     `lcard.permission_rule_id action` — the stored read_rule_id column
   *     is never consulted). The walk itself was PROVEN verdict-correct
   *     against the pre-change tree (env-gated probe run: BW+Human false,
   *     the TPR virtuals false, Exhibit+Item's virtuals true, and the
   *     CDW_Host+management guard-population walks true — Ruby's wanted-card
   *     render), so seating the computed verdict reproduces Ruby for BOTH
   *     directions at once: BW's leaves deny through 6569 "_left" -> left
   *     11201 (EXISTS — the prior recorded result's absent-left claim is
   *     falsified) -> Sample Card 167+*self+*read 10577 (role list, no
   *     Anonymous); CDW_Host+management allows through its 6568-chain
   *     left. (The whole-population fear is answered by
   *     evidence, not scope: the walk's verdict IS Ruby's; the earlier
   *     denial came from the BasicCs-substituted verdict input, which
     *     this seat does not use.) Seated into deniedVerdictsByKey — the
   *  map isDenied reads for id-less cards; pointer/list item keys keep
   *  their richer pointerItemVerdicts path (the cql item-typing unit's
   *  population). Verdict undefined (partial decks) seats ALLOWED — the
   *  same undefined-means-unverifiable contract isDenied applies. Runs
   *  AFTER preloadDefaultTypeNames (newCardDefaultType needs the *default
   *  universe's type names) — never inline at miss time. */
  /** Seat the render root for an ABSENT card (renderAbsentCards): the
   *  controller's Card.fetch name, new: {} gives a new card typed by the
   *  type assignment or *default template (type.rb:58-66 ensure_type_id —
   *  newCardDefaultType, the same walk a nest miss takes), and unknown?
   *  (states.rb), so its views route through view_for_unknown. Its four
   *  task verdicts are judged here, while awaiting is legal: a page's main
   *  card renders :new or :not_found by ok?(:create) (html/error.rb:81-87),
   *  and the :unknown view's create link reads the same verdict. */
  private async seatAbsentRoot(card: RenderCard): Promise<RenderCard> {
    const name = card.name;
    let leftTypeName: string | undefined;
    if (name.isCompound && name.leftName !== undefined) {
      const left = await this.fetcher.fetchByName(name.leftName.s);
      if (left?.typeId !== undefined && left.typeId !== null) {
        leftTypeName = (await this.fetcher.fetchById(left.typeId))?.name?.s;
      }
    }
    const typed =
      card.typeId !== undefined
        ? { typeId: card.typeId, typeName: card.typeName ?? "" }
        : this.newCardDefaultType(name, leftTypeName);
    const typeId = typed?.typeId;
    const seated: RenderCard = {
      ...card,
      record: { ...card.record, typeId },
      typeId,
      typeName: typed?.typeName,
      typeCode: typeId === undefined ? undefined : this.fetcher.codenames.peekNameForId(typeId),
      setKeys: safeSetKeys({ name, typeId, typeName: typed?.typeName, leftTypeName, isNew: true }),
      unknown: true,
    };
    this.renderCards.set(card.key, seated);
    if (this.readPermission !== undefined) {
      if (this.taskState === undefined) {
        const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
        this.taskState = viewTaskStateFromResults(results, this.readPermission);
      }
      const verdicts = await allTaskVerdictsForCard(
        this.fetcher,
        this.structurePatternInputForSync(seated),
        this.taskState,
      );
      this.taskVerdicts.set(seated.key, verdicts);
      // The :new page view's type field lists Auth.createable_types (the
      // same prepare gate a requested :new view takes).
      if (verdicts.create === true || this.readPermission.alwaysOk) {
        await this.ensureCreateableTypes();
        // ... and its alert guide (guide.rb determine_guide_card: the new
        // card's *guide rule, first candidate that exists).
        // prepend_guide_edit_link reads the guide card's ok?(:update).
        for (const candidate of ruleNamesForCard(this.structurePatternInputForSync(seated), "*guide")) {
          const guide = await this.prepareItemForRender(candidate);
          if (guide?.id === undefined || this.taskVerdicts.has(guide.key)) continue;
          const guideVerdicts = await allTaskVerdictsForCard(
            this.fetcher,
            this.structurePatternInputForSync(guide),
            this.taskState,
          );
          this.taskVerdicts.set(guide.key, await this.applyUpdateOverride(guide, guideVerdicts));
        }
        await this.ensureVerdicts();
      }
    }
    return seated;
  }

  /**
   * An unknown nest target renders :unknown, whose body is
   * `createable { ... }` (card-mod-format set/all/html/error.rb:15-21): the
   * add link shows when the viewer may create the new card. The sync view
   * reads the create verdict from taskVerdicts, which the prepare phase
   * fills only for prepared cards, so a nest miss on the render root (a
   * Role card's `{{+:description|lead}}` with no description yet) rendered
   * nothing for a viewer Ruby lets create it (`*all plus+*create = _left`).
   * This seats the verdict for each of the root's references that resolves
   * to no card, typed by the *default template chain like Card.new. Only
   * signed-in viewers are asked: on a stock deck *all+*create excludes
   * Anonymous, and leaving anonymous renders untouched keeps their query
   * counts as they were.
   */
  private async seatUnknownNestCreateVerdicts(record: CardRecord): Promise<void> {
    if (this.readPermission === undefined || this.readPermission.alwaysOk) return;
    if (this.readPermission.signedInActorId === undefined) return;
    const rootKey = record.key ?? (record.name ? DeckoName.parse(record.name).key : undefined);
    const root = rootKey !== undefined ? this.renderCards.get(rootKey) : undefined;
    if (root === undefined || root.dbContent === undefined || root.dbContent === "") return;
    const misses: DeckoName[] = [];
    for (const ref of referencedNames(root.dbContent)) {
      const pipe = ref.name.indexOf("|");
      const base = pipe === -1 ? ref.name : ref.name.slice(0, pipe);
      let name: DeckoName;
      try {
        name = DeckoName.parse(DeckoName.parse(base).absolute(root.name));
      } catch {
        continue;
      }
      if (name.key === "" || this.renderCards.has(name.key) || this.taskVerdicts.has(name.key)) continue;
      if (virtualSearchCqlFor(name, this.codenameHolderKey) !== undefined) continue;
      misses.push(name);
    }
    if (misses.length === 0) return;
    if (this.taskState === undefined) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      this.taskState = viewTaskStateFromResults(results, this.readPermission);
    }
    for (const name of misses) {
      // The fetch-miss card's type follows the NEST-FETCH semantics, not the
      // Card.new template chain: the nest pipeline (format/nest/fetch.rb
      // new_card) constructs the miss like Card.fetch's new card under the
      // page's render context, and the capture pins the result — a
      // research page's {{+gallery}} miss (the +research
      // structure's nest, structure rule Research+*type+*structure) is
      // typed RichText (data-card-type-id 3): the left card is
      // Research-typed, and Ruby's dup_structure walk
      // for the *default-typed dup lands on the LEFT TYPE's *structure rule
      // (the set's *type plus right+*structure rule is absent; the TYPE
      // rule exists and is RichText-typed), whose own type_id (3)
      // becomes type_id_from_template's answer. Typing through
      // newCardDefaultType WITHOUT the left's type name instead walks the
      // TPR anchor on the registry's RichText fallback into the set's
      // *type plus right+*structure rule (HTML-typed)
      // and seats HTML — whose *type+*create rule denies a
      // member the capture permits (the *all plus+*create "_left" chain to
      // *all+*update "Anyone Signed In"). leftTypeName is the same
      // quick_type(left) input seatAbsentRoot passes. (The unknown-view
      // family this closes: the 69 member page rows + Guns /
      // Sample Card 068 / Work Week — the 21c92f3e fix's
      // dispatch, which never reached the integration line.)
      let leftTypeName: string | undefined;
      if (name.isCompound && name.leftName !== undefined) {
        const left = await this.fetcher.fetchByName(name.leftName.s, { skipVirtual: true });
        if (left?.typeId !== undefined && left.typeId !== null) {
          leftTypeName = (await this.fetcher.fetchById(left.typeId, { skipModules: true }))?.name?.s;
        }
      }
      const defaulted = this.newCardDefaultType(name, leftTypeName);
      const input = {
        name,
        isNew: true,
        ...(defaulted?.typeId !== undefined ? { typeId: defaulted.typeId } : {}),
        ...(defaulted?.typeName !== undefined ? { typeName: defaulted.typeName } : {}),
      };
      const create = await taskVerdictForCard(this.fetcher, input, "create", this.taskState);
      this.taskVerdicts.set(name.key, { update: undefined, delete: undefined, create });
    }
  }

  private async seatUnknownRefReadVerdicts(): Promise<void> {
    if (this.readPermission === undefined) return; // state not folded yet
    for (const refKey of this.structureRefMisses) {
      if (refKey === "" || this.deniedVerdictsByKey.has(refKey)) continue;
      let parsed: DeckoName;
      try {
        parsed = DeckoName.parse(refKey);
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
          continue;
        }
        throw err;
      }
      if (parsed.key === "") continue;
      // COMPOUND phantom arm (p21-left-climb): the live walk's verdict on
      // the absolutized name, typed by the *default template chain — the
      // same input recipe as the simple-starred arm (Ruby's ensure_type_id
      // type_id_from_template), never the BasicCs substitution.
      if (parsed.isCompound) {
        const defaulted = this.newCardDefaultType(parsed);
        const input = {
          name: parsed,
          isNew: true,
          ...(defaulted?.typeId !== undefined ? { typeId: defaulted.typeId } : {}),
          ...(defaulted?.typeName !== undefined ? { typeName: defaulted.typeName } : {}),
        };
        const read = await canReadByRuleLookup(this.fetcher, input, this.readPermission);
        this.deniedVerdictsByKey.set(refKey, read === false);
        continue;
      }
      // SIMPLE arm, starred or not: ok_to_read? (permissions.rb:139-146)
      // walks permission_rule_id(:read) for EVERY new card. A plain simple
      // name ({{user design|closed}}) types from the *default template
      // exactly like a starred one, so on this deck it lands on
      // BasicCs+*type+*read ("Anyone Signed In") and Anonymous is denied.
      // Leaving it unseated read as ALLOWED in isDenied and rendered the
      // full bar to readers Ruby denies.
      const defaulted = this.newCardDefaultType(parsed);
      const input = {
        name: parsed,
        isNew: true,
        ...(defaulted?.typeId !== undefined ? { typeId: defaulted.typeId } : {}),
        ...(defaulted?.typeName !== undefined ? { typeName: defaulted.typeName } : {}),
      };
      const read = await canReadByRuleLookup(this.fetcher, input, this.readPermission);
      this.deniedVerdictsByKey.set(refKey, read === false);
    }
  }

  /** The pattern input for one card's structure-candidate walk — the SAME
   *  fields enrichAndStore feeds safeSetKeys (leftTypeName for the *type
   *  plus right anchor, isRule for the *rule pattern), so candidate
   *  derivation is identical on both consumption sites. All fetches are
   *  cache hits (the prefetch walked the sides). */
  /** The read verdict for BLANK-KEY new cards - the nest targets whose name
   *  normalizes to the empty key: the blank reference `{{}}` (name "") and
   *  backslash-escaped relative forms like `{{\_|board_link}}` (name `\_`;
   *  cardname.rb:107-118 simple_key strips `\` outside OK4KEY_RE, so the
   *  key is "" there too). Ruby's fetch hands BOTH the same shape: a NEW
   *  card (retrieve.rb:7 skips the blank mark; `\_` retrieves by key ""
   *  and finds no row - the deck has no empty-key card), typed by the
   *  *default template chain (type.rb:78-80 type_id_from_template ->
   *  BasicCs on this deck, rule 28), whose read walk lands on
   *  BasicCs+*type+*read (rule 22283, "Anyone Signed In") - Anonymous is
   *  read-DENIED. That verdict is deck-constant for every blank-key card
   *  (the key carries no set anchors beyond the type/*all patterns), so it
   *  seats ONCE under the "" key, where isDenied's byKey map read picks it
   *  up for every fabricated blank-key card. The view decides whether the
   *  denial SURFACES: `unknown:`-capable views (template_nest under
   *  template mode; board_link) take the alter_unknown||denial arm and
   *  render the 76-byte quiet span (corpus 636 + 38250, both re-proven
   *  live 2026-10-03); plain views substitute :unknown whose createable
   *  gate renders "" (corpus 10488, live re-proven same session).
   *  Seated beside seatUnknownRefReadVerdicts (same prepare phase, same
   *  newCardDefaultType input recipe), keyed "" - the walk itself skips
   *  blank keys (its `parsed.key === ""` guard), so this is the one seat
   *  that covers them. */
  private async seatBlankKeyReadVerdict(): Promise<void> {
    if (this.readPermission === undefined) return; // state not folded yet
    if (this.deniedVerdictsByKey.has("")) return; // once per engine
    const name = DeckoName.parse("");
    const defaulted = this.newCardDefaultType(name);
    const read = await canReadByRuleLookup(
      this.fetcher,
      {
        name,
        id: undefined,
        isNew: true,
        ...(defaulted?.typeId !== undefined ? { typeId: defaulted.typeId } : {}),
        ...(defaulted?.typeName !== undefined ? { typeName: defaulted.typeName } : {}),
      },
      this.readPermission,
    );
    this.deniedVerdictsByKey.set("", read === false);
  }

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
        const leftCard = this.peekPrepared(leftKey);
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
   * :32-51). The PREFERENCE? arm is ported below — it used to bail at
   * `parts.length > 3 -> false` on the standing note that "the
   * preference? shape is not ported", but the ASYNC twin right above
   * (render.ts:5626-5641) DOES port it (citing all.rb:42-48 + 50-53),
   * so the two declared "counterparts" disagreed and the sync one —
   * the one that runs at applyStructureContent time — dropped the RULE
   * token for every preference rule card. The capture pins it: card
   * 22735 `*all+*all+*follow` (List-typed, 3 parts) renders
   *   `class='accordion-item bar ALL ALL_PLUS TYPE-list RSTAR RULE
   *    RIGHT-Xfollow TYPE_PLUS_RIGHT-rich_text-Xfollow SELF-Xall-Xall-Xfollow'`
   * and the engine emitted the same list WITHOUT ` RULE`.
   *
   * CORRECTION (oracle-pinned by
   * fixtures/captured/form-substrate.json rule_card_head/guide): the
   * 2-part restriction below was WRONG against Ruby — standard_rule?
   * (all.rb:37-44) has NO part-count limit; the 2-part "*all+*head" is a
   * rule card exactly like the 3-part preference shape, and the async
   * computeIsRule already implements the 2-part arm (its `else if (leftRecord
   * !== undefined ...)` branch). The sync twin's `parts.length === 2 ->
   * false` dropped the RULE token from every 2-part rule card's repaired
   * set keys, and quick_edit (the first view to pin a 2-part rule card's
   * SLOT classes — the link views carry no slot wrap) exposed it: the
   * capture pins `... RSTAR RULE RIGHT-Xhead ...`.
   */
  /** Whether every part computeIsRuleSync reads is in the render map, so
   *  its `false` is an answer rather than a gap: the right part, the left
   *  part, and for a 3+-part name whose right part is a Setting, the
   *  preference arm's trunk and preferer. */
  private rulePartsInMap(card: RenderCard): boolean {
    const name = card.name;
    const rightKey = name.rightName?.key;
    const leftKey = name.leftName?.key;
    if (rightKey === undefined || leftKey === undefined) return true;
    const rightCard = this.renderCards.get(rightKey);
    if (rightCard === undefined || !this.renderCards.has(leftKey)) return false;
    if (name.parts.length <= 2 || rightCard.record.typeId !== this.ruleTypeIds?.setting) {
      return true;
    }
    const trunkKey = DeckoName.parse(name.parts.slice(0, -2).join("+")).key;
    const prefererKey = DeckoName.parse(name.parts[name.parts.length - 2] ?? "").key;
    return (
      (trunkKey === "" || this.renderCards.has(trunkKey)) &&
      (prefererKey === "" || this.renderCards.has(prefererKey))
    );
  }

  private computeIsRuleSync(card: RenderCard): boolean {
    const ids = this.ruleTypeIds;
    if (ids === undefined || ids.setting === undefined || ids.set === undefined) {
      return false;
    }
    const name = card.name;
    if (!name.isCompound) return false;
    const rightKey = name.rightName?.key;
    if (rightKey === undefined) return false;
    const rightCard = this.peekPrepared(rightKey);
    if (rightCard === undefined || rightCard.record.typeId !== ids.setting) return false;
    if (name.parts.length > 2) {
      // standard_rule? (all.rb:37-40) — the left part ("A+B" for a
      // 3-part name, "A" for a 2-part one) is Set-typed.
      const leftKey = name.leftName?.key;
      if (leftKey !== undefined) {
        const leftCard = this.peekPrepared(leftKey);
        if (leftCard !== undefined && leftCard.record.typeId === ids.set) return true;
      }
      // preference? (all.rb:42-48) — `name[0..-3]` is Set-typed, then
      // valid_preferer? (all.rb:50-52): the `[-2]` part is User-typed, or
      // that part's codename is "all". The async twin's predicate, read
      // off the render-card map instead of the fetch ladder. Corpus
      // evidence for both preferer clauses: `*all` is the Set-typed
      // trunk card whose codename is "all" = the codename clause; a
      // person card is User-typed (codename "user") = the User clause.
      const trunkKey = DeckoName.parse(name.parts.slice(0, -2).join("+")).key;
      if (trunkKey === "") return false;
      const trunkCard = this.peekPrepared(trunkKey);
      if (trunkCard === undefined || trunkCard.record.typeId !== ids.set) return false;
      const prefererKey = DeckoName.parse(name.parts[name.parts.length - 2] ?? "").key;
      if (prefererKey === "") return false;
      const prefererCard = this.peekPrepared(prefererKey);
      if (prefererCard === undefined) return false;
      if (ids.user !== undefined && prefererCard.record.typeId === ids.user) return true;
      return prefererCard.record.codename === "all";
    }
    // Two-part standard_rule?: name.left is the whole first part.
    const twoPartLeftKey = name.leftName?.key;
    if (twoPartLeftKey === undefined) return false;
    const twoPartLeft = this.peekPrepared(twoPartLeftKey);
    return twoPartLeft?.record.typeId === ids.set;
  }

  // -------------------------------------------------------------------------
  // read-permission resolution (prepare phase; never during the render)
  // -------------------------------------------------------------------------

  /** Complete the permission state from folded batch results, or run the
   *  standalone batch (warm-closure first render). Once per engine.
   *  `seatGateRows` is the seat head's gate-count column result (the
   *  the stamp-as-column change): when present, that statement is spliced in at
   *  its index and never issued — on the standalone-batch path the batch
   *  then carries only the remaining statements, and on a plan-armed render
   *  the router answers those, so the batch's live discharge is empty and
   *  costs zero trips. */
  private async ensureReadPermission(
    folded?: SQLQueryResult[],
    seatGateRows?: SQLQueryResult,
  ): Promise<ReadPermissionState> {
    if (this.readPermission !== undefined) return this.readPermission;
    const statements = readPermissionStatements(this.viewer);
    let results: SQLQueryResult[];
    if (seatGateRows !== undefined) {
      const rest = statements.filter(
        (_, i) => i !== PERMISSION_GATE_COUNT_STATEMENT_INDEX,
      );
      const live = await this.fetcher.driver.batch(rest);
      results = [];
      let k = 0;
      statements.forEach((_, i) => {
        results.push(
          i === PERMISSION_GATE_COUNT_STATEMENT_INDEX
            ? seatGateRows
            : (live as SQLQueryResult[])[k++],
        );
      });
    } else {
      results = folded ?? (await this.fetcher.driver.batch(statements));
    }
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
    this.readViewer = viewer;
    return this.readPermission;
  }

  /**
   * The PatternCardInput the read-verdict walk receives. The *type plus
   * right pattern's anchor composes from the LEFT side's type name
   * (registry.ts type_plus_right anchorName: `${leftType}+${tag}` — Ruby's
   * superleft&.type_name), so a compound card's candidate rule names are
   * only correct when leftTypeName rides along. The pre-fix inputs omitted
   * it: the anchor fell back to "RichText+<tag>" (the quick_type default)
   * and the walk skipped past the deck's actual *type plus right read rule
   * to the *all plus / *all catch-all — the fail-open that leaked
   * "+Source Content" bodies to anonymous (trace tenth-item-trace.md
   * bug 3; corpus rule 34568 = "Source+Source Content+*type plus
   * right+*read" -> "Anyone Signed In").
   *
   * leftTypeName resolves from the render-card map first (the prefetch
   * walk enriched the sides of every closure card — cache hit); an
   * un-enriched left (a search result's left side arriving through
   * canReadCard) rides the same fetch+enrich structurePatternInputFor
   * does. All fetches are cache-first, so warm verdicts stay zero-query.
   */
  private async verdictPatternInput(
    name: DeckoName,
    id: number | undefined,
    typeId: number | undefined,
    typeName: string | undefined,
  ): Promise<PatternCardInput> {
    let leftTypeName: string | undefined;
    if (name.isCompound) {
      const leftKey = name.leftName?.key;
      if (leftKey !== undefined) {
        const leftCard = this.peekPrepared(leftKey);
        if (leftCard !== undefined) {
          leftTypeName = leftCard.typeName;
        } else {
          const leftRecord = await this.fetcher.fetchByKey(leftKey);
          if (leftRecord !== undefined) {
            leftTypeName = (await this.enrichAndStore(leftRecord)).typeName;
          }
        }
      }
    }
    return {
      name,
      id,
      typeId,
      ...(typeName !== undefined ? { typeName } : {}),
      ...(leftTypeName !== undefined ? { leftTypeName } : {}),
    };
  }

  /**
   * Public seam for the page renderer's warm-up: re-run the read-permission
   * verdict pass over every prepared card (the skip-if-set guard inside
   * ensureVerdicts makes this a no-op for already-judged cards — only
   * warm-up enrichments made after the main render's pass get judged
   * here). The layout subtree's denied items (e.g. the *Undertakings
   * dropdown's read-denied rows) must render the quiet denial span exactly
   * like the capture; without this refresh a warm-enriched card has no
   * verdict and renders content instead.
   */
  async refreshVerdicts(): Promise<void> {
    await this.ensureVerdicts();
  }

  /**
   * Page-render recovery seam (2026-09-29): resolve the
   * read-permission state and judge every prepared card when the prepare
   * render died BEFORE the folded batch landed. The page path catches
   * prepare errors and continues (nested-raise semantics), but the sync
   * render's gate reads only the precomputed verdicts — an unresolved state
   * leaves every card unjudged, and `isDenied`'s unjudged-allowed contract
   * then renders read-denied bodies in full (Ruby denies them; an earlier
   * triage booked 130 such pages). The standalone permission batch is three
   * small statements — it succeeds where the folded closure batch died.
   * No-op on a healthy prepare: ensureReadPermission returns the memoized
   * state and ensureVerdicts is the map-size integer compare.
   */
  async ensurePermissionVerdicts(): Promise<void> {
    await this.ensureReadPermission();
    await this.ensureVerdicts();
  }

  /**
   * Verdicts for every card the render can touch — the sync render path
   * reads only this map. The mod set-module ok_to_read? overrides
   * (read-override.ts) decide first for their populations; cards they defer
   * (or that match no override) resolve through the stored read_rule_id
   * purely (permissions.rb:142-143), and cards without one fall back to the
   * live rule walk (permission_rule_id, permissions.rb:55-61) — bounded by
   * the hasReadRules gate, so rule-less seeds cost zero queries and stay
   * allowed (the documented divergence).
   */
  private async ensureVerdicts(): Promise<void> {
    const state = this.readPermission;
    if (state === undefined) return;
    // SWEEP-SURFACE (renderSeats): judge this render's seats, walked
    // directly (seats are a small subset of the warm map). Already-judged
    // cards hit the has-checks and continue. There is deliberately no
    // "map size unchanged" shortcut: a card can enter the map during one
    // render without being its seat, so map size never proves every card
    // was judged, and a skipped pass leaves a seat verdict-less — which
    // isDenied reads as ALLOWED (the `tags` warm-engine leak).
    for (const seatKey of this.renderSeats) {
      const card = this.renderCards.get(seatKey);
      if (card === undefined) continue;
      if (card.id === undefined) {
        // The virtual cards (states.rb#virtual?): no row, no id — the read
        // rule resolves through the live name walk exactly like Ruby's
        // `read_rule_id ||= permission_rule_id(:read)` on a rowless card
        // (set/all/permissions.rb:139-146). Keyed by card key: virtual
        // cards share no id space.
        if (this.deniedVerdictsByKey.has(card.key)) continue;
        const allowed = await this.cardReadAllowed(
          card.name,
          undefined,
          card.record.typeId,
          card.typeName,
          undefined,
        );
        this.deniedVerdictsByKey.set(card.key, allowed === false);
        continue;
      }
      if (this.deniedVerdicts.has(card.id)) continue;
      const allowed = await this.cardReadAllowed(
        card.name,
        card.id,
        card.record.typeId,
        card.typeName,
        card.record.readRuleId,
      );
      this.deniedVerdicts.set(card.id, allowed === false);
    }
  }

  /**
   * The full ok_to_read? port for one card. The mod set-module overrides
   * (read-override.ts — right::head/script/enabled_roles/style true, the
   * account family own_account?/own_email?, asset_output -> left) REPLACE
   * the generic path whenever they decide; `super` and non-matching cards
   * fall through to the generic stored/live verdict exactly as before.
   * Ruby always_ok? sits BEFORE ok_to_read? for every override outcome
   * (each override's own always_ok branch or the generic short-circuit),
   * so an always-ok viewer skips the override walk entirely — identical
   * verdicts, zero override queries.
   */
  private async cardReadAllowed(
    name: DeckoName,
    id: number | undefined,
    typeId: number | undefined,
    typeName: string | undefined,
    storedReadRuleId: number | undefined,
    depth = 0,
  ): Promise<boolean | undefined> {
    const state = this.readPermission;
    if (state === undefined) return undefined;
    if (!state.alwaysOk) {
      const override = await readPermissionOverride(name, {
        viewerKey: await this.resolveViewerKey(),
        fetchByKey: (key) => this.fetcher.fetchByKey(key),
        fetchById: (cardId) => this.fetcher.fetchById(cardId),
        leftReadVerdict: (leftName, leftDepth) =>
          this.leftReadAllowed(leftName, leftDepth),
      }, depth);
      if (override !== undefined) return override;
    }
    if (id !== undefined && storedReadRuleId !== undefined) {
      return canReadByStoredRule(storedReadRuleId, state);
    }
    return canReadByRuleLookup(
      this.fetcher,
      await this.verdictPatternInput(name, id, typeId, typeName),
      state,
    );
  }

  /** right::asset_output's `left.ok_to_read?` — the LEFT card's full
   *  verdict (its own overrides included), resolved through the same
   *  cardReadAllowed machinery so the recursion memoizes into the shared
   *  verdict maps. A missing left row defers (undefined) — no verdict is
   *  fabricated from absent data. */
  private async leftReadAllowed(
    leftName: DeckoName,
    depth: number,
  ): Promise<boolean | undefined> {
    const leftRecord = await this.fetcher.fetchByKey(leftName.key);
    if (leftRecord === undefined) return undefined;
    return this.cardReadAllowed(
      leftRecord.name ?? leftName,
      leftRecord.id,
      leftRecord.typeId,
      undefined,
      leftRecord.readRuleId,
      depth,
    );
  }

  /** Ruby Auth.as_card.key — the readViewer actor card's canonical key,
   *  resolved once per permission-state generation. */
  private async resolveViewerKey(): Promise<string | undefined> {
    if (this.readViewerKeyResolved) return this.readViewerKey;
    this.readViewerKeyResolved = true;
    const actorId = this.readViewer?.actorId;
    if (actorId === undefined) return undefined;
    const actor = await this.fetcher.fetchById(actorId);
    this.readViewerKey = actor?.key;
    return this.readViewerKey;
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

  /** THE FRESHNESS BOUNDARY FOR THE NON-RENDER CARD-SERVING ENTRIES (the
   *  Workers' JSON/API routes): the same gate the render entry runs at the
   *  top of renderHeld, minus the render path's one-trip-seat column fold.
   *  render() reads the deck's committed-write stamp (deck_data_version,
   *  ONE point SELECT) and clears every derived cache when it moved, so a
   *  warm runtime never serves post-revocation state; a route that answers
   *  through fetcher/canReadCard WITHOUT rendering skips that gate, and the
   *  memoized permission state (readPermission, deniedVerdicts) then serves
   *  a verdict computed before the revocation was committed. Callers run
   *  this ONCE per request, BEFORE any fetch or permission check. Cost: the
   *  stamp read — exactly what a warm render pays. A first call on a cold
   *  engine only arms the baseline (nothing warm exists to protect, the
   *  first-render arm). The stamp's loud-missing throw applies here too:
   *  an unmigrated database must not serve permission verdicts. */
  async ensureFreshness(): Promise<void> {
    const observed = await this.readDeckDataVersion();
    if (this.deckDataVersion === undefined || observed === this.deckDataVersion) {
      this.deckDataVersion = observed;
      return;
    }
    this.resetCaches();
    this.fetcher.replayRouter.disarmRenderPlan();
    invalidateSeatedPagePayloads(this.fetcher);
    await this.fetcher.reprimeBootState();
    this.deckDataVersion = observed;
  }

  /** Read verdict for one card record — the per-card half of ensureVerdicts,
   *  shared by entries that serve card data outside the HTML view pipeline
   *  (deploy/worker.ts cardRecordJson). The full ok_to_read? port — the mod
   *  set-module overrides first (cardReadAllowed -> read-override.ts), then
   *  the stored read_rule_id (canReadByStoredRule, permissions.rb:142-143),
   *  then the live rule walk (canReadByRuleLookup, permissions.rb:55-61;
   *  undefined = rule-less deck: allowed, the documented divergence).
   *  `typeName` is optional — the *type pattern's anchor name; callers that
   *  already hold the type record pass it, others let the lookup resolve.
   *  Verdicts memoize into the same deniedVerdicts map ensureVerdicts uses,
   *  so a card judged here is judged for the HTML path too (and vice versa:
   *  an existing verdict short-circuits). */
  async canReadCard(record: CardRecord, typeName?: string): Promise<boolean> {
    await this.ensureReadPermission();
    if (record.id !== undefined && this.deniedVerdicts.has(record.id)) {
      return !this.deniedVerdicts.get(record.id);
    }
    // A name-less record has no set membership and no rule candidates (not
    // a real card) — the overrides cannot apply and the walk cannot run.
    const allowed =
      record.name === undefined
        ? true
        : await this.cardReadAllowed(
            record.name,
            record.id,
            record.typeId,
            typeName,
            record.readRuleId,
          );
    const denied = allowed === false;
    // Verdict memoization mirrors ensureVerdicts' split keying: real cards
    // by id, virtual (id-less) cards by canonical key.
    if (record.id !== undefined) this.deniedVerdicts.set(record.id, denied);
    else if (record.key !== undefined && record.key !== "") {
      this.deniedVerdictsByKey.set(record.key, denied);
    }
    return !denied;
  }

  /**
   * The right-part card ids the account substrate hangs its secrets on:
   * card-mod-account-0.20.0 data/real.yml:82 (`*account`), :121 (`*email`),
   * :132 (`*password`), :143 (`*salt`), :150 (`*status`), plus `*api_key`.
   * A junction whose right part is one of these IS a row of somebody's
   * account: the email address, the PBKDF2 digest, the digest salt, the
   * bearer key that authenticates as the account.
   *
   * `api_key` is the one from a different gem — card-mod-api_key-0.20.0
   * set/right/api_key.rb:1, `include_set Abstract::AccountField` — but it is
   * the same kind of row by that include alone: the same abstract set as
   * `*email`, `*password` and `*salt`, hanging off the same `*account`
   * junction, and its content is a credential (`authenticate_api_key`
   * compares it, `generate_api_key` stores a fresh one, set/right/api_key.rb
   * :25-31). Reading it is an account takeover exactly as reading the digest
   * is, so it belongs in this list on the account-field argument and not on
   * card-mod-account's.
   *
   * Resolved by CODENAME the way every other account codename is resolved in
   * this port (signin.ts resolveAccountCodenameIds, first-run-setup.ts
   * resolveCodenameCardId) — never by a hardcoded id — and absent codenames
   * are skipped rather than defaulted, so a deck without the account system
   * (the 0001..0003 chain) gets an empty set and no exclusion clause. A deck
   * WITHOUT card-mod-api_key has no `api_key` codename, and is unaffected. */
  private static readonly ACCOUNT_RIGHT_CODENAMES = [
    "account",
    "email",
    "password",
    "salt",
    "status",
    "api_key",
  ] as const;

  private accountRightIds: number[] | undefined;

  /** The account field right ids, resolved once per engine. */
  private async accountFieldRightIds(): Promise<number[]> {
    if (this.accountRightIds === undefined) {
      const ids: number[] = [];
      for (const codename of RenderEngine.ACCOUNT_RIGHT_CODENAMES) {
        const row = await this.fetcher.driver.query<{ id: number }>(
          `SELECT id FROM cards WHERE codename = ? AND trash = 0 ORDER BY id LIMIT 1`,
          [codename],
        );
        const id = row.rows[0]?.id;
        if (typeof id === "number") ids.push(id);
      }
      this.accountRightIds = ids;
    }
    return this.accountRightIds;
  }

  /** The CQL permission filter for this engine's viewer — the shape
   *  executeQuery's SqlOptions take (sql.ts implicitConditions, the port of
   *  Where#permission_conditions). Ruby's Card::Query runs with
   *  Auth.always_ok? false, so every /api/query-shaped statement is
   *  filtered to the viewer's readable rule set; serving rows without the
   *  filter leaks db_content the HTML views deny.
   *
   *  THE RULE-LESS ALLOWANCE, now SCOPED. This used to answer
   *  `alwaysOk: true` — filter off — whenever the deck carried no catch-all
   *  read rule, on the reasoning that a rule-less seed has nothing to filter
   *  by. That reasoning is true of a deck with no ACCOUNTS and false of one
   *  with them: "no rule to evaluate" is not "readable to everyone", and on
   *  the shipped demo deck it answered /api/query {"right":"*password"} with
   *  every stored digest. The allowance stays (a synthetic rule-less deck is
   *  a real shape, and Ruby's fail-closed answer there would deny every card
   *  and break it), but it now carries an exclusion for the account field
   *  rows: `excludedRightIds` renders `right_id NOT IN (...)` (sql.ts
   *  implicitConditions), so a rule-less deck serves everything EXCEPT
   *  somebody's account fields.
   *
   *  A deck that DOES carry the rules (the shipped one, since
   *  0004-demo-account-substrate.sql block C) gets the ordinary filtered
   *  answer with no exclusion — the rules are the answer there, and adding a
   *  second mechanism on top would be the kind of belt-and-braces that hides
   *  a broken rule set. */
  async cqlPermissionOptions(): Promise<{
    alwaysOk: boolean;
    readRuleIds: number[];
    excludedRightIds: number[];
  }> {
    const state = await this.ensureReadPermission();
    if (state.alwaysOk) {
      // Ruby's own short-circuit (permissions.rb:140): the bot and
      // administrators are never filtered, so an exclusion here would
      // narrow Ruby's answer rather than restore it.
      return { alwaysOk: true, readRuleIds: [], excludedRightIds: [] };
    }
    if (!state.hasReadRules || !state.hasCatchAllReadRule) {
      // The scoped rule-less allowance (see the doc comment above).
      return { alwaysOk: true, readRuleIds: [], excludedRightIds: await this.accountFieldRightIds() };
    }
    return { alwaysOk: false, readRuleIds: [...state.readableRuleIds], excludedRightIds: [] };
  }

  // -------------------------------------------------------------------------
  // RenderEngineLike - the synchronous render-path surface
  // -------------------------------------------------------------------------

  /** Cache-first card resolution for the render path. Returns undefined for
   *  anything the prefetch did not prepare (the nest machinery reports).
   *
   *  THE MARK NAMES THE CARD THIS FETCH RETURNS (results.rb:30-32
   *  `assign_name mark`, reached from `new_result_card` on every fetch
   *  that lands on a `new_card?` record). Ruby keeps two things apart that
   *  this port's single key-keyed map had merged:
   *
   *    store.rb:21-28  `new_for_cache` instantiates `Card.new name: mark`
   *                     - the placeholder is built FROM THE MARK;
   *    store.rb:9      `Card.write_to_cache card` keys it by `card.key`,
   *                     so the shared cache holds it under the FOLDED name;
   *    results.rb:8    a KNOWN card skips `new_result_card` and goes to
   *                     `finalize_result_card` - a stored row's name is the
   *                     row's, never a mark's.
   *
   *  So the cache entry is keyed (shared, unchanged) while the object a
   *  fetch HANDS BACK carries the mark that named it. That is the whole
   *  semantic, and it belongs at the fetch - not at the name layer. A prior
   *  pass ported it at format.ts#nest instead (dddb01cd, reverted forward-
   *  only by fbb6eda3); the nest is the one consumer that must not carry it,
   *  because a `{{`_}}` / `{{_self}}` nest resolves its target from the
   *  CONTEXT card and never reaches this function at all (format.ts:1601,
   *  `contextTarget ?? this.engine.fetchRenderCard(targetName)`).
   *
   *  THE MEASURED DEFECT (parity-restore-runbook.md:184, mechanism #4,
   *  Field:page): the corpus row `Field+references` (27199) stores its
   *  reference in KEY case, so the structure walk's compound-ref warm
   *  (render.ts#applyStructureContent -> fetcher.fetchByName) fetched
   *  "aiki+*referred_to_by", MISSED (corpus: left_id 2705 + right_id 3945
   *  -> no row) and seated a placeholder named FROM THAT MARK - the key
   *  form. The page's own `{{_self+*referred_to_by}}` then resolved the
   *  RIGHT name ("Field+*referred_to_by") and read the KEY, hitting the
   *  key-named placeholder.
   *
   *  ONLY a fabricated, id-less placeholder is re-bound, and only onto the
   *  mark that reached it. A STORED card keeps its row's name: re-binding
   *  one would let an authored `{{aiki}}` rename the "Field" card's slots
   *  (Ruby's known? path never calls assign_name for a stored card). The map
   *  entry is never mutated - a copy is returned, which is what Ruby's
   *  per-fetch `Card.new` gives for free and a shared map does not. */
  /** A synchronous read of the prepared map by key (the render's helpers
   *  that look up a card's parts, type or rule hosts). A miss on a key a
   *  skipped structure walk left out is recorded like a fetchRenderCard
   *  miss (skipStructureRefWalks' doc). */
  private peekPrepared(key: string): RenderCard | undefined {
    const card = this.renderCards.get(key);
    if (card === undefined && this.skippedStructureRefAsked !== undefined) {
      const name = this.skippedStructureRefs.get(key);
      if (name !== undefined) this.skippedStructureRefAsked.add(name);
    }
    return card;
  }

  fetchRenderCard(name: string): RenderCard | undefined {
    const requested = DeckoName.parse(name);
    const card = this.renderCards.get(requested.key);
    if (card === undefined) {
      // Collect mode (live-batch): the sync render asked for a card the
      // prepare phase did not seat — record the question for the next pass.
      this.demandRecorder?.add(requested.s);
      if (this.skippedStructureRefs.has(requested.key)) this.skippedStructureRefAsked?.add(requested.s);
      return undefined;
    }
    if (card.id !== undefined || card.record.isNew !== true) return card; // stored: results.rb:8
    if (card.name.s === requested.s) return card; // the mark already named it
    // Same key by construction - the lookup above is keyed on it - so the
    // two spellings differ by case alone and the re-bind is a pure case fix.
    return { ...card, name: requested, key: requested.key };
  }

  /** M9 - `Card.exist?` as an ASYNC EXACT-stored-name query (the
   *  customize_button new_customized_name gate, html_views.rb:4-11).
   *
   *  Two arms, in order:
   *
   *  1. THE PREPARED RENDER-CARD MAP - but the map is keyed by the
   *     CANONICAL key (`DeckoName.key`, case-folded through
   *     `Inflector#underscore`, cardname lib/cardname.rb:106-116), so a
   *     map hit is re-checked against the seat's STORED name
   *     (`card.name.s`) before it counts. A fold-only hit is not
   *     existence; that is precisely the trap the negative-delta change's
   *     `Lexicon#peekId` arm fell into.
   *  2. ONE point query against the stored name - `WHERE name = ? AND
   *     trash = 0`, the `trash = false unless look_in_trash` default of
   *     retrieve.rb:28-33 pointed at the name column.
   *
   *  Compound names (never produced by this walk - `"#{name} customized"`
   *  on a simple skin name stays simple) delegate to the fetcher, because
   *  a junction row stores a NULL `name` and its identity IS its side
   *  ids.
   *
   *  WHY ASYNC, AND WHY THE ASYNC BOUNDARY IS SAFE HERE: the view
   *  function itself cannot query. The whole render pipeline dispatches
   *  SYNCHRONOUS ViewFns over a prepared map - fetchRenderCard is
   *  cache-only by contract (its own doc: "Returns undefined for anything
   *  the prefetch did not prepare"). So the query belongs in the ASYNC
   *  PREPARE PHASE of `render()`, which is this engine's established
   *  seam for exactly this shape: prepareItemForRender,
   *  enrichLinkTargetsForKnownClass and the bootswatch-skin family warm
   *  above are all async, all run before the dispatch, and all hand the
   *  sync view pure memory. Ruby's `Card.exist?` is equally live per
   *  invocation; the port hoists it into prepare because the port's
   *  render is a batch, and Ruby's batch is the prepare phase.
   *
   *  SCOPE OF THE CHANGE: the verdict never enters renderCards. Seating a
   *  not-really-warm card there would change what every sync surface can
   *  see - the blast radius the the negative-delta change refused to take without a
   *  full-canvas grade. This arm feeds exactly one decision: the
   *  customize_button's proposed new card name. */
  async cardExists(name: string): Promise<boolean> {
    const parsed = DeckoName.parse(name);
    if (!parsed.isCompound) {
      // Arm 1: the prepared map, re-checked on the STORED name.
      const seated = this.renderCards.get(parsed.key);
      if (seated !== undefined) return seated.name.s === name;
      // Arm 2: one point query on the stored name.
      const row = await this.fetcher.driver.query<{ id: number }>(
        "SELECT id FROM cards WHERE name = ? AND trash = 0 LIMIT 1",
        [name],
      );
      return row.rows.length > 0;
    }
    // Compound: identity is the side-id pair, not a stored name string.
    return (await this.fetcher.fetchByName(parsed)) !== undefined;
  }

  /** Row 6 (the corresponding port note) - the bootswatch skin's `+parent`
   *  POINTER, resolved the way Ruby resolves it.
   *
   *  `card.parent?` is bootswatch_skin.rb:57-59's
   *  `parent_skin_card&.real?`, and `parent` is a card_accessor TRAIT
   *  (bootswatch_skin.rb:37) - so the subcard is found through the CODENAME
   *  registry, by the (left_id, codename-id) side pair. It is NOT a name.
   *  The deck proves the difference: the pointer is a Pointer junction whose
   *  left_id is a customized skin card and whose right_id is the card
   *  NAMED `parent 1` whose codename is `parent`, with content the skin's own
   *  name and a card_references row from the junction to that referee key.
   *  So the junction's composed name is
   *  `<skin customized>+parent 1`, and the `<skin>+parent` name every
   *  view builds resolves to the junction (the skin's left id, the id of the
   *  card literally named `parent`) instead.
   *
   *  MEASURED (a probe over the raw corpus): asking for the composed name
   *  with the codename name (`<skin>+parent`) resolves to nothing, while
   *  asking for the db's own composed name (`<skin>+parent 1`) resolves to
   *  the Pointer junction whose content is the skin's name.
   *  which is why every skin page took the parent-less branch and the capture
   *  carries `Inherit from:` + a known-card link to the parent theme instead
   *  (+232 B on the skin's page).
   *
   *  WHY AN ALIAS SEAT. The pointer is seated under its OWN canonical name
   *  (the db's, `<skin>+parent 1`) and then aliased under the requested
   *  `<skin>+parent` key, so the four synchronous readers -
   *  bootswatchCoreView and skinCoreView's parent? arms, inputView's, and
   *  customizeButtonView's `return "" if card.parent?` - resolve through the
   *  one lookup they already use, with no per-view change. The alias is the
   *  same card under the name Ruby addresses it by (`Card[:<skin>, :parent]`),
   *  not a different card, and it is confined to this one key family.
   *
   *  Cost: one point query per SKIN whose parent? is asked for the first time
   *  (memoized on the alias key), plus the codename/lexicon reads, all in the
   *  async prepare phase where queries are legal. A skin with no pointer
   *  spends the one query and seats nothing. */
  private async warmSkinParentPointer(skinName: DeckoName): Promise<void> {
    const aliasName = `${skinName.s}+parent`;
    const aliasKey = DeckoName.parse(aliasName).key;
    if (this.renderCards.has(aliasKey)) return;
    const rightId = await this.fetcher.codenames.id(SKIN_PARENT_TRAIT_CODENAME);
    if (rightId === undefined) return;
    const leftId = await this.fetcher.lexicon.id(skinName);
    if (leftId === undefined) return;
    const row = await this.fetcher.driver.query<{ id: number }>(
      "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1",
      [leftId, rightId],
    );
    const junction = row.rows[0];
    if (junction === undefined) return;
    const rightName = await this.fetcher.lexicon.name(rightId);
    if (rightName === undefined) return;
    const composed = `${skinName.s}+${rightName.s}`;
    if (composed === aliasName) return; // nameable already; nothing to alias
    const seated =
      this.fetchRenderCard(composed) ?? (await this.prepareItemForRender(composed));
    if (seated === undefined) return;
    this.renderCards.set(aliasKey, seated);
  }

  /** M9 - the prepare-phase warm for html_views.rb:4-11 new_customized_
   *  name. Mirrors the Ruby walk verbatim:
   *
   *      nname = "#{name} customized"
   *      if Card.exist?(nname)
   *        nname = "#{nname} 1"
   *        nname.next! while Card.exist?(nname)
   *      end
   *      nname
   *
   *  html_views.rb:38-48's `return "" if card.parent?` runs BEFORE
   *  new_customized_name, so a skin with a +parent subcard never asks a
   *  single existence question - this warm no-ops for it instead of
   *  spending queries on an answer the view discards. The `String#next!`
   *  increment is the numeric-suffix walk the port already used: each
   *  candidate is `"#{base} N"` from the initial " 1".
   *
   *  Termination and cost: the walk is bounded only by the deck, as
   *  Ruby's is, and every verdict memoizes per skin key, so a warm
   *  re-render costs zero queries. A deck holding `<skin> customized`
   *  through `<skin> customized N` pays N+2 point queries on that skin's
   *  first page - the same count Ruby pays on the same page. */
  private async warmCustomizedName(skinName: DeckoName): Promise<void> {
    if (this.customizedNameBySkinKey.has(skinName.key)) return;
    // html_views.rb:38-48 `return "" if card.parent?` short-circuits
    // before new_customized_name; nothing below is reachable for a
    // parented skin. warmSkinParentPointer runs BEFORE this method in the
    // prepare phase, so the alias it seats makes this short-circuit read the
    // same parent? verdict the customize_button view does.
    if (this.fetchRenderCard(`${skinName.s}+parent`) !== undefined) return;
    const base = `${skinName.s} customized`;
    const asked: string[] = [];
    let answer = base;
    let n = 1;
    while (await this.cardExists(answer)) {
      asked.push(answer);
      answer = `${base} ${n}`;
      n += 1;
    }
    this.customizedNameBySkinKey.set(skinName.key, { name: answer, asked });
  }

  /** M9 - the synchronous read side of the seam above, for the
   *  customize_button ViewFn. Undefined = never warmed (an engine that did
   *  not run the prepare phase for this card, or a skin nested into a render
   *  rather than being the root); the view falls back to the render-card
   *  map exactly as it did before this pass. */
  peekCustomizedName(skinName: string): string | undefined {
    return this.customizedNameBySkinKey.get(DeckoName.parse(skinName).key)?.name;
  }

  /** view-fail class V4 — links.rb:140-144 add_known_or_wanted_class truth
   *  for a render-map miss. Ruby's `Card.known?(name)` is a LIVE fetch
   *  (cache, then DB): the class of a wikilink anchor reflects existence,
   *  never prefetch reach. The sync render path cannot query, so this peek
   *  covers the one existence source the cold render already carries in
   *  memory: the codename registry's codehash memo (codename.rb
   *  load_codehash — the same fold every cold render's batch rides, and the
   *  same load Ruby's registry memoizes). A map miss whose key is a
   *  registered codename with a non-NULL registered name IS a live card
   *  ([[List]]/[[Pointer]]/[[Search]] — the *content options help popover's
   *  cardtype links, 10 of the class's 15 dump entries). Returns the
   *  registered card NAME (link_to_card's href source, base.rb:43-47) or
   *  undefined when the name is not a live card. NULL-name junction rows
   *  stay undefined (wanted-card) — absence of knowledge never flips a
   *  class; the corpus's People Green pin (wanted on BOTH sides) is the
   *  guard. Regular (uncodenamed) cards resolve through the prepare-phase
   *  link-target warm pass below instead, which seats the real record. */
  peekKnownCardName(name: string): string | undefined {
    let key: string;
    try {
      key = DeckoName.parse(name).key;
    } catch {
      return undefined; // unresolvable mark: never known (cardReferenceKeys' tolerance)
    }
    const id = this.fetcher.codenames.peekId(key);
    if (id === undefined) return undefined;
    return this.fetcher.codenames.peekRegisteredName(id);
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
  /** card-mod-rules set/type/set.rb:73-75 visible_setting_codenames for a
   *  set card by name: the card, its pattern (right) card and its anchor
   *  (left) card are prepared first, because the prototype type the
   *  restriction reads comes from them. Undefined for a card that does not
   *  exist or is not Set-typed (Ruby raises NoMethodError there). */
  async visibleSettingCodenamesFor(name: string): Promise<ReadonlyArray<string> | undefined> {
    // The prototype type reads the *structure / *default universes
    // (newCardDefaultType); load them here when no render has yet, so the
    // answer does not depend on call order.
    await this.parseStructureContents(undefined, 0);
    await this.preloadDefaultTypeNames();
    const card = await this.prepareItemForRender(name);
    if (card === undefined) return undefined;
    if (card.name.leftName !== undefined) await this.prepareItemForRender(card.name.leftName.s);
    if (card.name.rightName !== undefined) await this.prepareItemForRender(card.name.rightName.s);
    return visibleSettingCodenames(this, card);
  }

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

  /** view-fail class V4 — the prepare-phase link-target warm pass. The sync
   *  render's wikilink anchors (renderLinkChunk + the Link-chunk walker,
   *  format.ts) classify known/wanted off the prepared map, and Ruby asks a
   *  LIVE fetch per anchor. A fresh-process render of a card whose content
   *  (or static help popover) links cards no {{nest}} reference reaches
   *  emitted wanted-card for existing cards — 15 an earlier pass dump entries
   *  (10x the *content options popover's [[List]]/[[Pointer]]/[[Search]],
   *  5x card-body wikilinks to other cards on the page).
   *
   *  Harvest (memory only): the [[target]] matches of every prepared card's
   *  dbContent not yet scanned (once per engine per card), plus the rendered
   *  root's registered static setting-help text (the popover bytes are
   *  registry strings — no card's dbContent carries them). Resolution: map
   *  hit skips (already truthful); peekKnownCardName hit skips (the
   *  codename memo is the existence truth, query-free); everything else
   *  rides prepareItemForRender — fetch + enrich + memoize, so the sync
   *  anchor reads the REAL record (href carries the stored name's casing,
   *  the corpus's [[narrative]] -> /Narrative shape). Fetch misses leave
   *  the anchor wanted-card: the oracle's own wanted pins (People Green)
   *  must not flip.
   *
   *  Cost: zero statements on renders whose surfaces carry no new
   *  unresolvable link targets (the depth-sweep chain, the prelude pins);
   *  one point query per NEW existing target, Ruby's own cost model. The
   *  harvested-then-seated cards join AFTER the last verdict pass, so the
   *  same skip-if-set re-pass every other enrichment group runs here. */
  private async enrichLinkTargetsForKnownClass(rootCard: RenderCard): Promise<void> {
    const targets: string[] = [];
    if (this.linkScanDoneKeys === undefined) this.linkScanDoneKeys = new Set();
    // SWEEP-SURFACE (renderSeats): harvest link targets from this render's
    // seats only. The rendered cards' targets seat on the render that seats
    // the closure; earlier renders' residue holds no rendered anchor.
    for (const card of this.renderCards.values()) {
      if (!this.renderSeats.has(card.key)) continue;
      if (this.linkScanDoneKeys.has(card.key)) continue;
      this.linkScanDoneKeys.add(card.key);
      const content = card.dbContent;
      if (content === undefined || content === "" || !content.includes("[[")) continue;
      collectLinkTargetNames(content, targets);
    }
    const staticHelp = this.helpResolver?.peekStaticHelpTextFor(rootCard);
    if (staticHelp !== undefined && staticHelp.includes("[[")) {
      collectLinkTargetNames(staticHelp, targets);
    }
    let seated = false;
    // db round-trip elimination: the harvested targets seat in
    // ONE batched wave (seatNamesByWave, the driveClosure shapes) before
    // the ladder loop; the loop below stays for its exact hit/miss
    // bookkeeping (unknown flags, wanted-card pins) and now answers from
    // the seated map / primed negatives at zero queries.
    if (targets.length > 0) {
      await this.seatNamesByWave([...targets]);
    }
    for (const target of targets) {
      if (this.fetchRenderCard(target) !== undefined) continue;
      // NO registry-hit skip here: the codename memo answers the classifier
      // arms that consult it (format.ts renderLinkChunk's peek), but the
      // popover's nest-path classifier (help-popover.ts renderLinkChunk ->
      // fmt.nest view :link -> titleLinkView) reads the SEATED card's
      // unknown flag - a registry-known but map-absent target renders a
      // phantom (wanted-card) unless it joins the prepared map. The V4
      // suite's *content options popover pin (known-card [[List]] /
      // [[Pointer]] / [[Search]]) is the guard. Cost: one point query per
      // registry-known harvested target - the same cost model as the
      // un-skipped arm below (the un-skipped arm's own doc).
      const prepared = await this.prepareItemForRender(target);
      if (prepared !== undefined) seated = true;
    }
    if (seated) await this.ensureVerdicts();
  }

  /** Whether any prepared card's content carries a `|configs` nest opt —
   *  the Role dashboards' `{{_L|configs}}` shape (card-mod-account
   *  set/type/role.rb view :configs dispatches). The async
   *  prepare gates the admin-runtime build on this (see
   *  ensureCoreAdminRuntime): pages that never reach the view pay zero
   *  queries, so the query-count gates stay untouched.
   *
   *  MOD PAGES (mm-cstructural, 2026-09-30): a Mod-typed card's :core also
   *  reads the admin runtime — the Cardtypes accordion nests admin.yml
   *  codenames through `codenameToName` (core-mod.ts nestItemHtml), and
   *  Ruby's nest resolves a SYMBOL argument with `Card.fetch` (an
   *  existing-card fetch), so the slot's `nest_name` is the codename card's
   *  AUTHORED name — the oracle's `nest_name: Role`, not the yml's `role`
   *  (format/nest.rb:28 `view_opts[:nest_name] ||= card.name`). Without the
   *  runtime the map is empty, the raw codename is nested, and the slot JSON
   *  disagrees. The Depends-on section is deliberately NOT in this class:
   *  `card_mods` yields STRINGS (type/mod.rb:222-226), and a String argument
   *  takes nest/fetch.rb:31-33's `new_card` branch, which keeps the literal
   *  (`mod_-account`) — which is what the oracle shows. So the trigger is
   *  Mod-TYPED, not "the page nests a mod". */
  renderClosureNeedsCoreAdminRuntime(): boolean {
    for (const card of this.renderCards.values()) {
      const content = card.dbContent?.toString();
      if (content !== undefined && content.includes("|configs")) return true;
      if (card.typeCode === "mod") return true;
    }
    return false;
  }

  /** Seats each prepared real card's last action id for the conflict
   *  tracker of an edit form. Ruby reads `card.last_action_id`, the card's
   *  latest non-draft action (card-mod-history history.rb), not the cards
   *  row's current_revision_id column, which decks Decko 0.20 creates leave
   *  empty; a tracker rendered empty makes every save a conflict
   *  (events.rb:66 detect_conflict). Cards whose row carries the column keep
   *  it. One statement over the render's prepared cards. */
  private async seatLastActionIds(): Promise<void> {
    const missing = new Map<number, RenderCard[]>();
    for (const card of this.renderCards.values()) {
      if (card.id === undefined || card.record.currentRevisionId !== undefined) continue;
      const list = missing.get(card.id) ?? [];
      list.push(card);
      missing.set(card.id, list);
    }
    if (missing.size === 0) return;
    const ids = [...missing.keys()];
    const { rows } = await this.fetcher.driver.query<{ card_id: number; last_id: number }>(
      `SELECT card_id, MAX(id) AS last_id FROM card_actions WHERE card_id IN (${ids.map(() => "?").join(", ")})` +
        ` AND (draft IS NULL OR draft = 0) GROUP BY card_id`,
      ids,
    );
    for (const row of rows) {
      for (const card of missing.get(Number(row.card_id)) ?? []) {
        card.record.currentRevisionId = Number(row.last_id);
      }
    }
  }

  /** The core mod's admin runtime (mod-core's prepareAdminRuntime: the
   *  mod cards, the *update-rule role walk) built lazily for engines with
   *  NO bound loader — the graded page-surface harness shape, where the mod
   *  prepareEngine never ran and the :configs view would otherwise read an
   *  empty admin universe. Sync view
   *  bodies cannot await a build, so the page surface calls this from the
   *  async prepare (gated by renderClosureNeedsCoreAdminRuntime) BEFORE
   *  the sync render dispatches. Once per engine (the flag; resetCaches
   *  re-arms). */
  async ensureCoreAdminRuntime(): Promise<void> {
    if (this.coreAdminRuntimeEnsured) return;
    this.coreAdminRuntimeEnsured = true;
    const host = modEngineHost(this, this.fetcher);
    bindModuleAdminHost(host);
    const before = new Set(this.renderCards.keys());
    await prepareAdminRuntime(host);
    // The runtime caches every codename card into the render map AFTER the
    // page's verdict pass, outside its seats, and the :configs lists nest
    // them. Judge them now: a card with no verdict reads as allowed, which
    // rendered *recaptcha settings (read rule: Administrator) as a full
    // bar to the anonymous reader where Ruby renders the denial.
    for (const [key, card] of this.renderCards) {
      if (before.has(key)) continue;
      await this.canReadCard(card.record, card.typeName);
    }
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

  /** Stats of the last warmupLayoutReferences call (probe/verification
   *  surface — round trips, statements, rounds, fallbacks). */
  lastWarmupStats: WarmupStats | undefined;

  /** DISCOVERY PASS (request-local live render): when set and true at one of
   *  the page's synchronous view renders, that render is skipped (returns
   *  ""). Only a discovery pass that has already consumed a speculative
   *  "no rows" sets it: such a pass is never the page, its bytes are
   *  discarded, and a synchronous render issues no reads. The page is always
   *  rendered by a pass for which this is false at every render point. */
  skipSyncRender: (() => boolean) | undefined;

  /** COLLECT MODE (request-local live render). demandRecorder collects every
   *  card the synchronous render asked the prepared map for and did not
   *  find; demandSeeds are names an earlier pass of THIS request asked for,
   *  which the page prepares up front (existence + enrichment, no reference
   *  chase). Both are per-engine, and the engine lives for one pass. */
  demandRecorder: Set<string> | undefined;
  demandSeeds: string[] | undefined;
  /** With collect mode on, the reference-chasing warm-ups are skipped: the
   *  render asks for what it needs instead. */
  warmupChaseOff = false;
  /** Request-local live render only: in the warm-up closure, junction sides
   *  queued to compose a compound name are prepared but never scanned
   *  (prefetch.ts WarmupClosureContext.sidesUnscanned). Off everywhere
   *  else. */
  warmupSidesUnscanned = false;
  /** Request-local live render only: an earlier pass of this request found
   *  the page root (key skipRootClosureKey) read-denied, so this pass
   *  composes the root without walking its inclusion closure. The hidden
   *  body is never rendered; anything the layout or the denial frame reads
   *  is asked for by the synchronous render and prepared by the next pass,
   *  and the pass that is served still judges the root itself. Off
   *  everywhere else. */
  skipRootClosureWalk = false;
  skipRootClosureKey: string | undefined;
  /** Set on the engines of the request-local live render
   *  (src/card/live/live-render.ts): the render never seats a one-trip plan
   *  payload, whatever DECKO_ONE_TRIP says. That path stores nothing between
   *  requests and reads no plan. */
  liveRequest = false;
  /** DENIED ROOT (request-local live render, collect passes only): when the
   *  render root is read-denied, its body renders as the denial span and
   *  none of its pointer items, template junctions or link targets are read
   *  by the synchronous render. The prepare-phase walks that warm them are
   *  then skipped; anything the layout does read is asked for by the render
   *  and prepared by the next collect pass (the completion rule). Off
   *  everywhere else. */
  skipDeniedRootWalks = false;
  /** LAZY STRUCTURE REFERENCES (request-local live render only): the
   *  structure sweep (applyStructureContent) still substitutes every seated
   *  card's *structure template, but does not fetch and seat the cards the
   *  content references. On the normal render that walk seats every card a
   *  seated card's content names: link targets, date cards' journal
   *  junctions, and so on, most of which no view reads. In the live render
   *  each level of that chase cost a discovery pass, and the misses cost
   *  ~18k virtual-card resolutions per pass on the deepest pages.
   *
   *  The skipped references are remembered (skippedStructureRefs). When the
   *  synchronous render asks for one (fetchRenderCard, or the part / rule
   *  host reads through peekPrepared), the name is recorded in
   *  skippedStructureRefAsked; the live render then counts the pass as not
   *  final, and in every later pass that reference is walked eagerly
   *  (eagerStructureRefs), seated through the same fetch ladder as on the
   *  normal render. So a skipped walk costs a pass, never a byte. Off
   *  everywhere else. */
  skipStructureRefWalks = false;
  /** Keys an earlier pass of this request asked for: their walk runs
   *  eagerly, exactly as on the normal render. */
  eagerStructureRefs: ReadonlySet<string> = new Set<string>();
  /** Key -> reference name of every reference a skipped walk left out. */
  readonly skippedStructureRefs = new Map<string, string>();
  /** Names the synchronous render asked for among skippedStructureRefs. */
  skippedStructureRefAsked: Set<string> | undefined;

  /** The layout warm-up chase, bounded + batched (see
   *  prefetch.ts#prefetchWarmupClosure): the layout's render-relevant
   *  references (spine: nest targets + pointer/list items, which render
   *  and expand; leaf: [[link]] targets, which are existence-reads only)
   *  resolve in ONE driver.batch per reference-BFS round instead of one
   *  point-query ladder per name. Seeds are {name, context} pairs resolved
   *  exactly like the format does (absolute, or relative against the
   *  referencing card). */
  async warmupLayoutReferences(
    seeds: WarmupRef[],
    scan: (card: WarmupCard, mode: WarmupMode) => WarmupScan,
    onRound?: () => Promise<void>,
    force = false,
  ): Promise<WarmupStats> {
    if (this.warmupChaseOff && !force) {
      const empty: WarmupStats = { batches: 0, statements: 0, rounds: 0, cards: 0, fallbacks: 0 };
      this.lastWarmupStats = empty;
      return empty;
    }
    const stats = await prefetchWarmupClosure(
      seeds,
      {
        driver: this.fetcher.driver,
        lexicon: this.fetcher.lexicon,
        writeToCache: (cached) => this.fetcher.writeToCache(cached),
        cacheRecord: (cached) => this.cacheFetchedRecord(cached).then(() => undefined),
        getCard: (key) => this.renderCards.get(key),
        scannedKeys: this.warmupScannedKeys,
        ...(this.fetcher.virtualCardLookup !== undefined
          ? {
              virtualLookup: async (abs: string) =>
                this.fetcher.virtualCardLookup?.(DeckoName.parse(abs)),
            }
          : {}),
        prepareFallback: async (name) => (await this.prepareItemForRender(name)) ?? undefined,
        ...(onRound !== undefined ? { onRound } : {}),
        ...(this.warmupSidesUnscanned ? { sidesUnscanned: true } : {}),
      },
      scan,
    );
    this.lastWarmupStats = stats;
    return stats;
  }

  /**
   * Pre-execute the Search-type cards the page's NEST CLOSURE reaches — the
   * reference-BFS from the given seed cards over the prepared-card map, run
   * at the point the page renderer calls it: after the prepare render +
   * warm-up enrichment (the cards are on the map) but BEFORE the sync
   * body/layout render dispatches their nests. The card_list view reads ONLY
   * the pre-executed map (executeSearch → searchResults.get(key) ?? []), so
   * a warm-enriched but unexecuted search renders search-no-results with
   * zero queries — the 10-census-page SEARCH-EMPTY class (cache-nil-fix.md
   * section 3).
   *
   * Ruby parity: card-mod-search set/abstract/0_search/views.rb view
   * :card_list calls search_with_params -> Abstract::Search#search ->
   * query.run INSIDE the view dispatch — the CQL executes during the
   * request, synchronously, before the page's bytes are complete; there is
   * no sync/async split in the Ruby request. This pass IS that view-time
   * execution for the nest-closure searches, hoisted into the async phase
   * the port runs before the sync render.
   *
   * SCOPE (the perf guard): only cards the page actually NESTS. The walk is
   * prepareSearches' own algorithm — content references + search result
   * items — extended to resolve RELATIVE references contextually (the
   * warm-up's resolveWarmName semantics: absolute stays, relative resolves
   * against the referencing card; prepareSearches' cardReferenceKeys skips
   * them, which is exactly the gap). Cards that join the prepared map
   * WITHOUT being nested — type-record sides (the `*search` type card joins
   * as the junction searches' typeId row: executing it ran a whole-deck CQL
   * whose 11,964 result items cascaded the pass across the deck),
   * pointer-item chases, link targets — are never seeded and never reached,
   * so the pass costs only what the page's own nests imply.
   *
   * Guards mirror prepareSearches exactly: the SEARCH_TYPE_CODE gate, the
   * already-seated skip (searchResults/searchFailures — prepareSearches
   * executed these during the prepare render), the isDenied skip (verdicts
   * are fresh — the caller refreshes after the warm-up enrichment and again
   * for the result items), and the BadQuery catch that seats an empty result
   * + records the failure for the dispatch boundary's re-raise. Returns the
   * number of searches executed (0 when every closure search is seated —
   * warm re-renders).
   */
  async prepareNestClosureSearches(seeds: WarmupRef[]): Promise<number> {
    this.populateTypeCodes();
    const visited = new Set<string>();
    const queue: RenderCard[] = [];
    for (const seed of seeds) {
      let key: string | undefined;
      try {
        const parsed = DeckoName.parse(seed.name);
        key = (
          parsed.isAbsolute ? parsed : parsed.absoluteName(DeckoName.parse(seed.context))
        ).key;
      } catch {
        continue;
      }
      if (key === undefined) continue;
      const card = this.renderCards.get(key);
      if (card !== undefined && !visited.has(card.key)) queue.push(card);
    }
    let executed = 0;
    while (queue.length > 0) {
      const card = queue.shift() as RenderCard;
      if (visited.has(card.key)) continue;
      visited.add(card.key);
      // Content references resolve exactly like the warm-up enrichment that
      // put these cards on the map: absolute names stay, relative names
      // resolve against the REFERENCING card (the sync nest dispatch's own
      // resolution context).
      for (const ref of referencedNames(card.dbContent)) {
        let refKey: string | undefined;
        try {
          const parsed = DeckoName.parse(ref.name);
          refKey = (parsed.isAbsolute ? parsed : parsed.absoluteName(card.name)).key;
        } catch {
          continue;
        }
        if (refKey === undefined) continue;
        const refCard = this.renderCards.get(refKey);
        if (refCard !== undefined && !visited.has(refCard.key)) queue.push(refCard);
        if (refCard === undefined) {
          // No row and no structure: a VirtualSearch family card is still
          // known, and its results are what the nest renders.
          let resolved: string;
          try {
            const pipe = ref.name.indexOf("|");
            const parsed = DeckoName.parse(pipe === -1 ? ref.name : ref.name.slice(0, pipe));
            resolved = (parsed.isAbsolute ? parsed : parsed.absoluteName(card.name)).s;
          } catch {
            continue;
          }
          const items = await this.prepareVirtualFamilySearch(resolved);
          if (items !== undefined) {
            queue.push(...items);
            executed++;
          }
        }
      }
      if (card.typeCode !== SEARCH_TYPE_CODE) continue;
      if (this.searchResults.has(this.searchCacheKey(card)) || this.searchFailures.has(this.searchCacheKey(card))) continue;
      if (this.isDenied(card)) continue;
      try {
        const items = await this.runSearch(card);
        this.searchResults.set(this.searchCacheKey(card), items);
        queue.push(...items);
      } catch (err) {
        // Same parse-failure contract as prepareSearches: BadQuery seats an
        // empty result and records the exact error for the dispatched view to
        // re-raise; unknown errors are NOT parse failures — rethrow.
        if (!(err instanceof Error) || err.name !== BAD_QUERY_CLASS_NAME) throw err;
        this.searchFailures.set(this.searchCacheKey(card), err);
        this.searchResults.set(this.searchCacheKey(card), []);
      }
      executed++;
    }
    return executed;
  }

  /** Hosts whose pointer/list enrichment has COMPLETED (every item line
   *  either resolved into renderCards or is a true fetch miss — the deck
   *  is static per engine lifetime, so a processed host can never present
   *  a new line and a miss re-checked on a later render resolves nothing
   *  new; reportUnknownCard is a documented no-op, so re-walking only
   *  re-parses). Keyed by host key, mirroring itemTypeNameByHostKey. */
  private pointerListHostsDone = new Set<string>();
  /** +*account cards whose email/password field records the closure already
   *  warmed (the account core view's sync field_nest fetches; see
   *  enrichPointerListItemsClosure). */
  private accountFieldWarmDone = new Set<string>();

  /** ENGINE-LIFETIME warm-up scan memory (prefetch.ts scannedKeys): card
   *  keys whose reference scan some page render's layout warm-up already
   *  performed. The warm-up worklist is per-call, but the reference BFS it
   *  walks terminates in engine state (renderCards), so once a card's refs
   *  have been chased the chase can never find anything new on this engine
   *  - the deck is static (the pointerListHostsDone contract). Without this
   *  memory the warm-up's drain of warm-but-unscanned pending entries (the
   *  render-state-fix order-independence fix) re-scans the whole
   *  layout-connected closure (~6k corpus cards, pure CPU regex work) on
   *  EVERY warm page render. Cleared in resetCaches() (the map it describes
   *  is cleared there) and per key in expireRenderCard() (a dropped card's
   *  content refs must be re-chased if it comes back). */
   private warmupScannedKeys = new Set<string>();

  /** Set by enrichAndStore on every NEW render card, consumed by
   *  enrichPointerListItemsClosure: renderCards only grows, so a render
   *  with no stores since the last closure pass has nothing new to walk —
   *  the closure skips its whole deck-sized filter sweep. */
  private renderCardsGrewSinceClosure = false;

  /** Type-opt nest targets already enriched this engine lifetime (the
   *  corpus carries exactly two distinct type-opt shapes, so the set is
   *  bounded; the sync unknown-nest builder reads the warm map). */
  private nestTypeOptTargetsDone = new Set<string>();
  /** Cards whose dbContent the type-opt sweep already scanned (keyed like
   *  pointerListHostsDone). The deck is static per engine lifetime — a
   *  re-scan could only re-parse the same chunks — and the unguarded
   *  47k-record map walk per render measured as a verifier-grading
   *  slowdown (R17 first run: grading phase never completed). */
  private nestTypeOptScanned = new Set<string>();
  /** renderCards.size at the last type-opt sweep: new stores are the only
   *  thing that can add an unscanned host, so an unchanged size skips the
   *  whole walk (the enrichPointerListItemsClosure grew-flag shape). */
  private nestTypeOptLastSize = -1;

  /** R17 (unknown-nest typing): enrich every `| type:X ` nest-opt target
   *  the prepared closure's contents name but the reference closure never
   *  reached (an OPT value is not a reference). buildUnknownNestCard
   *  resolves the type card synchronously (nest/fetch.rb:47-48
   *  new_card_args — `args[:type] = view_opts[:type]`), so the target must
   *  be warm before the first nest miss renders. Skips entirely while the
   *  render-card map has not grown since the last sweep, and per card via
   *  nestTypeOptScanned. */
  private async enrichNestTypeOptTargets(): Promise<void> {
    if (this.renderCards.size === this.nestTypeOptLastSize) return;
    this.nestTypeOptLastSize = this.renderCards.size;
    const need = new Set<string>();
    // SWEEP-SURFACE (renderSeats): scan this render's seats only.
    for (const card of this.renderCards.values()) {
      if (!this.renderSeats.has(card.key)) continue;
      if (this.nestTypeOptScanned.has(card.key)) continue;
      this.nestTypeOptScanned.add(card.key);
      const content = card.dbContent;
      if (content === undefined || content === "" || !content.includes("type:")) continue;
      for (const piece of scanNests(content)) {
        if (piece.kind !== "nest" || piece.nest === undefined) continue;
        const t = piece.nest.options.extra["type"];
        if (typeof t !== "string" || t === "" || this.nestTypeOptTargetsDone.has(t)) continue;
        if (this.fetchRenderCard(t) === undefined) need.add(t);
      }
    }
    // db round-trip elimination: batch-seat the type-option
    // targets before the ladder loop (same wave contract as the other
    // prepare sweeps).
    if (need.size > 0) {
      await this.seatNamesByWave([...need]);
    }
    for (const name of need) {
      this.nestTypeOptTargetsDone.add(name);
      await this.prepareItemForRender(name);
    }
  }

  /** TEMPLATE-LINK SET JUNCTION targets already composed (or determined
   *  absent) for this engine lifetime. Keyed by the composed NAME, the
   *  pointerListHostsDone shape: the deck is static, so a later render's
   *  pass cannot find a new answer for a name it already asked about. */
  private templateLinkJunctionTargetsDone = new Set<string>();
  /** db round-trip elimination: the waves' ENGINE-LIFETIME ask memory
   *  (see seatNamesByWave) - every simple key and id pair any wave asked
   *  the database, so warm renders' waves re-ask nothing and the
   *  warm-zero query-shape pins hold. */
  private waveAskedSimpleKeys?: Map<string, string>;
  private waveAskedPairs?: Map<string, { leftId: number; rightId: number; lex: Lex }>;
  /** the edge regression fixes (2026-10-06): the composition primer's own
   *  ask memory — every side/type id primeRowsForComposition ever batched,
   *  so a later wave call (the sweepproof late-seat sweep adds them)
   *  re-asks nothing. Same contract and same resetCaches clearing as the
   *  wave ask maps. */
  private primeAskedIds?: Set<number>;
  /** Side-KEY join asks (the depth-2 shape), keyed "<leftKey>~<rightKey>" -
   *  the same engine-lifetime memory. A join miss converts to a pair-id ask
   *  (askedPairs) on the retry round, so this set never blocks that. */
  private waveAskedSideKeyPairs = new Set<string>();
  /** db round-trip elimination: type-card ids the W3b priming already
   *  seated - the priming pass's IN-list runs once per id per engine. */
  private typeCardsPrimed = new Set<number>();
  /** Root card keys whose rule-candidate set the W2b priming already
   *  asked - the priming pass runs once per page per engine, which is what
   *  makes a warm re-render of the same page zero-query by construction
   *  (the candidates of a page's prepared set are deterministic in the
   *  deck-static-per-engine contract). */
  private ruleCandidatesPrimedFor = new Set<string>();
  /** Templated-nests rule cards whose content the junction warm already
   *  scanned. The gate that keeps this pass off the other ~47k deck cards
   *  is `isTemplatedNestsName` (the `*default` / `*structure` right tag),
   *  not this set — the set only avoids re-parsing a rule body. */
  private templateLinkJunctionScanned = new Set<string>();
  /** renderCards.size at the last junction sweep: new stores are the only
   *  thing that can add an unscanned rule card. */
  private templateLinkJunctionLastSize = -1;

  /** D9 (warm-map junction load): seat the junction cards that
   *  card-mod-edit's :template_nest view composes, so the sync nest that
   *  view dispatches finds the REAL card instead of fabricating an unknown.
   *
   *  The mechanism this closes, in Ruby:
   *
   *  - `modal_nest_view` (mode.rb) swaps a :template-mode nest's view for
   *    `:template_nest`, whose field-only branch nests
   *    `template_link_set_name` (template_nest.rb:5-8) — an ABSOLUTE name
   *    built by the view at render time, `Role+*members+*type plus right`
   *    for page 105's `{{+*members}}`.
   *  - That programmatic nest resolves through `fetch_card` ->
   *    `new_card` (format/nest/fetch.rb:13, :30-33) -> `Card.fetch name,
   *    new: {...}`. `Fetch#normalize_mark` (fetch.rb:36-41) absolutizes the
   *    mark, then `retrieve_from_db` (fetch/retrieve.rb:21-26) queries it.
   *  - `retrieval_from_db_query_base` (retrieve.rb:35-41) takes the
   *    `key:` branch ONLY for a SIMPLE mark; a compound mark goes to
   *    `id_from_mark` (retrieve.rb:43-45) = `Lexicon.id(mark_value)`, and
   *    `name_to_lex`/`lex_to_id` (lexicon.rb:112-128) resolve it as
   *    `Card.where(left_id:, right_id:, trash: false)` — a LIVE left x right
   *    join on the NAME, never a reference lookup.
   *
   *  The port's `fetchRenderCard` is a warm-map read and its prepare walk is
   *  driven by `card_references` rows. Corpus 6a44dfdc: 9,593 live compound
   *  rows carry `name`/`key` NULL and ZERO inbound references, so they are
   *  never warmed. The two witnesses are 45421 (`Role+*members+*type plus
   *  right`, page 105 `{{+*members}}`) and 6554
   *  (`Cardtype+description+*type plus right`, page 88 `{{+description}}`)
   *  — both exist, both rendered the fabricated unknown shape (no
   *  `data-card-id`, url_key `data-card-name`, no SELF set-key token).
   *
   *  Why a prepare-phase pass and not a sync lookup: the render is
   *  synchronous after prepare (the whole enrichAndStore/type-opt/pointer
   *  family above is the same constraint), and the name the view composes
   *  is not in any card's content — it is computed inside the view — so no
   *  content-reference walker can see it. This pass composes the SAME
   *  names through the SAME shared function the view runs
   *  (`templateLinkSetNameFromParts`, render/views.ts) and warms them
   *  through `prepareItemForRender`, which runs the faithful fetch ladder
   *  and therefore lands on `retrieveFromDb` -> `lexicon.id` ->
   *  `Card.where(left_id, right_id)`. That is Ruby's own resolution, not
   *  a key lookup: a junction row with a NULL key is unreachable by any
   *  key path.
   *
   *  Gate, population and blast radius (census over corpus 6a44dfdc, the
   *  sha-verified copy): 101 live cards sit in the `on_type_set` shape
   *  (their trunk's tag is the `type` codename card); 40 of them carry a
   *  `{{` in content; their 316 field-only relative nests compose 26
   *  junctions that HAVE a row and 290 that do not. A composed name with
   *  no row warms nothing and leaves the unknown-card bytes exactly as
   *  they are, so the flip is bounded to those 26. The D9 witness sites
   *  are two of them (105 -> 45421, 88 -> 6554; 17770 -> 6554 is the same
   *  junction from a sibling rule).
   *
   *  Idempotence, same contract as enrichNestTypeOptTargets: each rule card
   *  is content-scanned once per engine lifetime, and each composed name is
   *  asked once. The pass returns after the map stops growing, which is
   *  structural — enrichAndStore skips existing keys. */
  private async enrichTemplateLinkSetJunctions(): Promise<void> {
    if (this.renderCards.size === this.templateLinkJunctionLastSize) return;
    this.templateLinkJunctionLastSize = this.renderCards.size;
    const need = new Set<string>();
    // SWEEP-SURFACE (renderSeats): scan this render's seats only.
    for (const card of this.renderCards.values()) {
      if (!this.renderSeats.has(card.key)) continue;
      if (this.templateLinkJunctionScanned.has(card.key)) continue;
      const content = card.dbContent;
      if (content === undefined || content === "" || !content.includes("{{")) continue;
      if (!isTemplatedNestsName(card.name)) continue;
      this.templateLinkJunctionScanned.add(card.key);
      // template_nest.rb:23-31 on_type_set: the parent rule's TRUNK's TAG
      // must be the `type` codename card; the composition then takes the
      // TRUNK's LEFT as the base. Mirrors card-mod-edit#onTypeSet, which
      // reads the same two names off the same warm map.
      const trunk = card.name.trunkName;
      const tagCard = this.fetchRenderCard(trunk.tagName.s);
      const base = tagCard?.record.codename === "type" ? trunk.leftName : undefined;
      for (const piece of scanNests(content)) {
        if (piece.kind !== "nest" || piece.nest === undefined) continue;
        if (piece.nest.comment !== undefined) continue;
        const raw = piece.nest.name.trim();
        if (raw === "" || raw === "_" || raw === "_self") continue;
        let nestName: DeckoName;
        try {
          nestName = DeckoName.parse(raw);
        } catch (err) {
          if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) continue;
          throw err;
        }
        // template_nest.rb:5-8 reaches the composition only on the
        // field-only arm (`field_only?`, fields.rb:33-35).
        if (!nestName.fieldOnly) continue;
        const composed = templateLinkSetNameFromParts(base, nestName);
        if (composed.s === "" || this.templateLinkJunctionTargetsDone.has(composed.key)) continue;
        if (this.fetchRenderCard(composed.s) !== undefined) {
          this.templateLinkJunctionTargetsDone.add(composed.key);
          continue;
        }
        need.add(composed.s);
        this.templateLinkJunctionTargetsDone.add(composed.key);
      }
    }
    // db round-trip elimination: batch-seat the junction targets
    // before the ladder loop (same wave contract as the other sweeps).
    if (need.size > 0) {
      await this.seatNamesByWave([...need]);
    }
    for (const name of need) await this.prepareItemForRender(name);
  }

  /** view-fail class V6: the bootswatch_skin bar_left nests the card's
   *  +Image child at :boxed (card-mod-bar_and_box media_snippet.haml's
   *  `nest image_card, view: :boxed, size: size`). Ruby's nest does a live
   *  fetch; the sync ViewFn reads the render-card map, so the child rides
   *  the prepare phase. The prefetch closure chases it never: the bar_left
   *  nest is view-time, so no card_references row names the image. Skins
   *  without an +Image child fetch nothing (the boxed unknown-nest bytes
   *  are name-shaped).
   *
   *  The +Image child is a NULL-NAMED left/right junction — corpus-wide,
   *  zero rows carry `+Image` in a name, and the one a skin owns is a
   *  plain left/right row whose content is that skin's own asset path —
   *  so the fetch has to be by DERIVED COMPOUND name. `fetchByName` does
   *  derive it (it returns that junction with `name` = "<skin>+Image"),
   *  which is why the guard below is `name !== undefined` and not a
   *  stored-name check.
   *
   *  WHY IT IS CALLED TWICE. A skin reached through a POINTER/LIST item is
   *  not in renderCards when the prepare phase's first pass walks the map:
   *  on a cold render of a skin reached through a pointer that pass
   *  sees mapSize=10 holding only the skin's customized card, and the
   *  pointer/list closure walk that follows grows the map to 211 with
   *  the base skin seated. The view-time nest then reads a junction nobody
   *  had fetched and emits the EMPTY image-box, -86 bytes. Re-walking after
   *  that walk is what makes the entry's bytes a function of the card alone
   *  rather than of what the process rendered earlier. Both calls are
   *  idempotent: `fetchRenderCard` short-circuits a seated junction and
   *  `enrichAndStore` skips existing keys, so the second pass costs one map
   *  scan plus zero queries on an already-warm deck. */
  private async warmNestedSkinImages(): Promise<void> {
    const skinImageNames = new Set<string>();
    const pushSkin = (card: RenderCard | undefined): void => {
      if (card?.typeCode === "bootswatch_skin" && card.name !== undefined) {
        skinImageNames.add(`${card.name.s}+Image`);
      }
    };
    // SWEEP-SURFACE (renderSeats): skin cards this render seated — a warm
    // render re-walking the whole map fetches the cascade's skin seats'
    // +Image children solo (the flood's skin family).
    for (const card of this.renderCards.values()) {
      if (!this.renderSeats.has(card.key)) continue;
      pushSkin(card);
      // A seated search's results and a seated list's items are nested by
      // this render too, but a result an EARLIER render stored is not
      // re-seated (enrichAndStore's existing-key guard). On a warm engine
      // the `Bootswatch skin` cardtype page lists skins an earlier page
      // stored; their bars nest +Image all the same.
      for (const result of this.searchResults.get(card.key) ?? []) pushSkin(result);
      if (this.isPointerLikeHost(card)) {
        for (const item of this.pointerItemNamesOf(card)) {
          let key: string;
          try {
            key = DeckoName.parse(item).key;
          } catch (err) {
            // An item naming a gone id (`~861`) is no skin; the item walk
            // renders it as missing.
            if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) continue;
            throw err;
          }
          pushSkin(this.renderCards.get(key));
        }
      }
    }
    for (const imageName of skinImageNames) {
      if (this.fetchRenderCard(imageName) !== undefined) continue;
      const imageChild = await this.fetcher.fetchByName(imageName);
      if (imageChild !== undefined && imageChild.name !== undefined) {
        await this.enrichAndStore(imageChild);
      }
    }
  }

  /** Pre-enrich the items of every pointer/list card reachable in the
   *  render-card map, repeating until the map stops growing (an enriched
   *  item may itself be a pointer/list host whose items need the same
   *  pass). Each host is processed exactly once per engine lifetime: the
   *  deck is static, so a later render's closure round must skip done
   *  hosts — without the skip, every render re-split every deck host's
   *  entire dbContent and re-ran DeckoName.parse on every item line (the
   *  prewarm enriches all ~47k records into renderCards, so the "every
   *  host" set is the deck's whole pointer/list/search population, and
   *  the per-render re-walk measured 5 -> 23ms median per warm entry on
   *  the corpus harness; the per-item renderCards cache check made the
   *  lines cheap but never the parsing). The round cap is paranoia —
   *  renderCards strictly grows, so the fixpoint is reached in at most
   *  deck-size rounds; the cap keeps a pathological cycle bounded. */
  /** A seated pointer/list/search/skin host the closure walk has not done
   *  (the host filter of enrichPointerListItemsClosure). */
  private hasUnwalkedSeatedHost(): boolean {
    for (const key of this.renderSeats) {
      if (this.pointerListHostsDone.has(key)) continue;
      const card = this.renderCards.get(key);
      if (card === undefined) continue;
      if (
        card.typeCode === "pointer" ||
        card.typeCode === "list" ||
        card.typeCode === "search_type" ||
        card.typeCode === "skin" ||
        card.typeName === "Search"
      ) {
        return true;
      }
    }
    return false;
  }

  private async enrichPointerListItemsClosure(): Promise<void> {
    // renderCards only grows: no store since the last pass means no new
    // host and no un-walked card — the sweep below would re-visit every
    // deck card only to Set.has-skip each one. Consume the flag here so
    // the pass runs once after whatever stored new cards.
    // But map growth is not the only way a host arrives: on a warm engine a
    // card stored by an EARLIER render (outside that render's seats) can be
    // seated by this one without the map growing. Such an un-walked seated
    // host must still get its item type and items (the bench-paired E4
    // cluster: list/search hosts whose item nests lost `"type"`), so the
    // pass also runs when any seat is an un-walked host. The check walks
    // the seats, not the map.
    if (!this.renderCardsGrewSinceClosure && !this.hasUnwalkedSeatedHost()) return;
    this.renderCardsGrewSinceClosure = false;
    const MAX_ROUNDS = RUBY_MAX_DEPTH;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      let grew = false;
      // the batched fetch composer (V2+V3, 2026-10-06): the round's hosts'
      // asks ride ONE merged wave before any per-host work runs. MEASURED
      // MECHANISM (this pass's attribution, post-reset): the per-host
      // waves cost one round trip each (~25 arms on the Home page), and
      // the hosts' own ladders (resolveHostItemTypeName's findRule walk
      // over ruleNamesForCard("*content options") candidates) resolved
      // one pair probe per candidate solo — 44 of the post-bump render's
      // 52 pair probes. The merged wave (items ∪ the hosts' option-rule
      // candidates) seats the whole cohort's answers in 1-2 statements,
      // and the per-host passes then answer from the seated map / primed
      // negatives. The per-host waves below stay — they no-op without a
      // batch when everything is seated or asked-and-primed (the ask
      // memory), so a host the pre-pass could not see keeps its own
      // correct behavior. WARM RENDERES ASK NOTHING: the pre-pass runs
      // only over this render's not-done hosts (the sweep surface), and a
      // warm render has none — the d2v1 hops-gate failure mode (a wave
      // proactively asking on warm renders) is structurally absent. The
      // candidate seat is the W2b precedent's exact shape
      // (primePreparedCardDerivedState seats the same ruleNamesForCard
      // families for the cards seated before it — byte-proven at every
      // cost level; this extends the same coverage to the closure's
      // late-seated hosts).
      const pendingHosts: RenderCard[] = [];
      for (const card of this.renderCards.values()) {
        if (!this.renderSeats.has(card.key)) continue;
        if (!this.isPointerLikeHost(card)) continue;
        if (this.pointerListHostsDone.has(card.key)) continue;
        pendingHosts.push(card);
      }
      if (pendingHosts.length > 0) {
        const merged = new Set<string>();
        for (const host of pendingHosts) {
          for (const item of this.pointerItemNamesOf(host)) merged.add(item);
          for (const candidate of this.optionsRuleCandidatesOf(host)) merged.add(candidate);
        }
        // The hosts' resolved options cards' cql :type names (the options
        // cards seat with the candidates): collectable MEMORY-ONLY now,
        // so the cql type fetches ride this same wave instead of one
        // point read per host.
        const cqlTypeNames = new Set<string>();
        this.collectCqlItemTypeNames(pendingHosts, new Set<string>(), cqlTypeNames);
        for (const t of cqlTypeNames) merged.add(t);
        if (merged.size > 0) await this.seatNamesByWave([...merged]);
      }
      // Search-type cards join the walk as hosts: their :card_list items
      // nest through the same nest_item -> item_view_options ->
      // determine_item_view_options_type chain (card-mod-search
      // 0_search/views.rb:132-136), so the items' slot JSON carries the
      // search's own cql :type (cql_search.rb:14-19 item_type_id).
      // Skin-typed cards join for the same reason: card-mod-style
      // set/type/skin.rb:3 `include_set List` puts Type::Skin on
      // Abstract::List, so a Skin host's items run the identical
      // nest_item walk (an earlier Skin pages' phantom items need their
      // read verdicts precomputed exactly like list hosts').
      // Iterate the map directly (no intermediate array): the prewarmed
      // map holds the whole deck, and this filter runs every render.
      // SWEEP-SURFACE (renderSeats): hosts this render seated — the
      // engine-lifetime done-sets below mean an earlier render's hosts are
      // either done already or are that render's chase residue, and
      // re-walking them is the sweep cascade (renderSeats' doc).
      for (const card of this.renderCards.values()) {
        if (!this.renderSeats.has(card.key)) continue;
        // The +*account cards' field records: card-mod-account
        // set/right/account/views.rb view :core nests +*email and +*password
        // (accountFieldNest, views.ts) — fields the CONTENT-based closure
        // never references (the +*account row's db_content is empty; the
        // fields ride the mod's VIEW, not authored nests). The sync
        // fetchRenderCard in nest() is cache-only, so without this warm the
        // +*email nest misses and renders a PHANTOM where the oracle pins
        // the real row's labeled view (data-card-id 19978 on
        // Anonymous+*account). Ruby-faithful surface: exactly the two fields
        // the gem's core view nests, resolved through Card.fetch's key
        // ladder (prepareItemForRender) like every other cache-miss need.
        if (
          card.name.isCompound &&
          card.name.rightName?.key === "*account" &&
          !this.accountFieldWarmDone.has(card.key)
        ) {
          this.accountFieldWarmDone.add(card.key);
          const beforeAccount = this.renderCards.size;
          await this.prepareItemForRender(`${card.name.s}+*email`);
          await this.prepareItemForRender(`${card.name.s}+*password`);
          if (this.renderCards.size !== beforeAccount) grew = true;
        }
        if (
          card.typeCode !== "pointer" &&
          card.typeCode !== "list" &&
          card.typeCode !== "search_type" &&
          card.typeCode !== "skin" &&
          card.typeName !== "Search"
        ) {
          continue;
        }
        if (this.pointerListHostsDone.has(card.key)) continue;
        const before = this.renderCards.size;
        // Host item type FIRST: the unknown-item read
        // verdict must be computed on the phantom's REAL type — Ruby folds
        // `options[:type] = card.item_type_name` into the item nest BEFORE
        // the fetch (item.rb:149-158 determine_item_view_options_type), and
        // new_unknown_item_args (item.rb:245-248) builds the fetch-miss card
        // from that folded arg. A verdict computed before the host's item
        // type resolves typed every phantom with the *all+*default template
        // walk's type (BasicCs here), and BasicCs+*type+*read = "Anyone
        // Signed In" denied Anonymous — rendering the two-span denied body
        // for exactly the host-typed unknown items Ruby renders the full
        // bar for (two person cards in the capture, both of which the
        // oracle renders bar-body/card-title/bar-menu for).
        await this.resolveHostItemTypeName(card);
        await this.enrichPointerListItems(card);
        this.pointerListHostsDone.add(card.key);
        if (this.renderCards.size !== before) grew = true;
      }
      if (!grew) return;
    }
  }

  // -------------------------------------------------------------------------
  // item type resolution (card-mod-collection item.rb + set/abstract/items.rb
  // + card-mod-search cql_search.rb + card-mod-layout options_api.rb)
  // -------------------------------------------------------------------------

  /** RenderEngineLike#hostItemTypeName — the sync read side of the item-type
   *  chain, resolved per host in the prepare phase (enrichPointerListItems
   *  Closure). undefined = resolved-and-nil or not a host card. */
  hostItemTypeName(
    card: RenderCard,
  ): { typeName: string; typeId: number } | undefined {
    return this.itemTypeNameByHostKey.get(card.key);
  }

  /** The unknown-item verdicts the pointer walk precomputed (the sync read
   *  side; see pointerItemVerdicts). `hostKey` = the RENDERING host's card
   *  key — Ruby's phantom is per-nest, so the lookup is per (host, item). */
  pointerItemVerdict(
    hostKey: string,
    key: string,
  ): { read: boolean; create: boolean | undefined } | undefined {
    return this.pointerItemVerdicts.get(`${hostKey}|${key}`);
  }

  /** RenderEngineLike#seatPhantomReadVerdict: publish ONE phantom item's
   *  host-scoped read verdict under the bare item key (the deck-global
   *  map the view gate reads). Called from views.ts
   *  renderUnknownPointerListItem right before the phantom's nest renders,
   *  so the inner bar views see THIS host's fold rather than a foreign
   *  host's earlier global seeding of the same item name (the
   *  a foreign untyped BasicCs fold seats denied where this host's
   *  own Project-typed fold reads allowed, and the oracle renders the
   *  item bar). */
  seatPhantomReadVerdict(key: string, denied: boolean): void {
    this.deniedVerdictsByKey.set(key, denied);
  }

  /**
   * Precompute the read + create verdicts for every UNKNOWN pointer/list
   * item line of one host (the fetch misses enrichPointerListItems found).
   * The verdicts are Ruby's own gates on the phantom's pattern input:
   *  - read: canReadByRuleLookup (the *read rule walk, read-rules.ts) —
   *    the oracle split this decides: the demo deck's "radio" item renders
   *    the FULL mini_bar body for every actor (its *all+*read grants
   *    Anyone) while the corpus's denied phantoms render the two-span body
   *    (pointerListItemBodyForUnknown) — one mechanism, two verdicts.
   *  - create: taskVerdictForCard(:create) (view-task-rules.ts) — the
   *    unknown/mini_unknown views' createable gate (html/error.rb:19-21
   *    `card.ok?(:create) ? yield : ""`): the demo oracle renders the
   *    unknown-link bytes for bot only.
   * Stored per item key; the sync item path reads them query-free via
   * pointerItemVerdict. Also folded into the engine's standard verdict
   * maps (deniedVerdictsByKey / taskVerdicts) so every other consumer
   * (isDenied, taskAllowed) answers the phantom consistently.
   *
   * `hostItemType` is the HOST's resolved item_type_name — the SAME
   * identity the sync render path folds into the phantom
   * (renderUnknownPointerListItem -> phantomIdentity). Ruby types the
   * fetch-miss item with it (new_unknown_item_args, item.rb:245-248:
   * `itype = args[:type] || item_type_name`; args[:type] is the host item
   * type determine_item_view_options_type folded in at item.rb:154-158),
   * and the read walk's type-scoped candidates follow THAT type. Computing
   * the verdict from newCardDefaultType alone (the *all+*default template
   * walk) typed every host-typed phantom BasicCs, and BasicCs+*type+*read
   * = "Anyone Signed In" denied Anonymous where Ruby's walk on the REAL
   * type falls through to *all+*read = "Anyone" — the divergence
   * the capture records on two person cards, both of which the oracle
   * renders the full bar body for. The default-template walk stays
   * as the fallback for hosts that resolve no item type, exactly
   * Card.new's ensure_type_id.
   *
   * PER-NEST KEYING: Ruby constructs the phantom fresh for EVERY nest
   * fetch (Nest::Fetch#new_card -> Card.fetch name, new: new_card_args),
   * so the same unknown item name under two hosts renders TWO verdicts —
   * each nest's own fold. The verdicts are therefore keyed
   * `"${host.key}|${itemKey}"`; a host that resolves a Person item
   * type must not pre-empt the RVW List's
   * untyped BasicCs verdict for the same item (probe p21b: RVW's oracle
   * renders the two-span denied body — its item_type_name is nil — while
   * the foreign host's Person fold rendered readable). The deck-global
   * verdict maps keep the FIRST computation per item (the pre-keying
   * seeding semantics; pointerItemGlobalVerdictDone), so consumers outside
   * the pointer-item slot keep their pre-change bytes.
   */
  private async ensurePointerItemVerdicts(
    host: RenderCard,
    missNames: readonly string[],
    hostItemType?: { typeName: string; typeId: number },
  ): Promise<void> {
    if (missNames.length === 0) return;
    if (this.readPermission === undefined) return; // state not folded yet
    let taskState = this.taskState;
    if (taskState === undefined) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      taskState = viewTaskStateFromResults(results, this.readPermission);
      this.taskState = taskState;
    }
    for (const name of missNames) {
      let parsed: DeckoName;
      try {
        parsed = DeckoName.parse(name);
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
          continue; // unresolvable mark: the sync path degrades to the phantom fallback
        }
        throw err;
      }
      const key = parsed.key;
      if (key === "") continue;
      const verdictKey = `${host.key}|${key}`;
      if (this.pointerItemVerdicts.has(verdictKey)) continue;
      // Phantom identity: the host's item type wins; the *all+*default
      // template walk is the fallback (item.rb:245-248 + Card.new's
      // ensure_type_id — the same precedence the sync render path uses in
      // phantomIdentity, views.ts).
      const defaulted = hostItemType ?? this.newCardDefaultType(parsed);
      const input = {
        name: parsed,
        isNew: true,
        ...(defaulted?.typeId !== undefined ? { typeId: defaulted.typeId } : {}),
        ...(defaulted?.typeName !== undefined ? { typeName: defaulted.typeName } : {}),
      };
      const read = await canReadByRuleLookup(this.fetcher, input, this.readPermission);
      const create = await taskVerdictForCard(this.fetcher, input, "create", taskState);
      this.pointerItemVerdicts.set(verdictKey, { read: read === true, create });
      // The deck-global verdict maps keep the FIRST HOST-AGNOSTIC computation
      // per item — the template-fallback walk (hostItemType undefined), which
      // is Ruby's bare Card.new ensure_type_id verdict for the name. A
      // HOST-TYPED computation is per-context in Ruby (each nest constructs
      // its own phantom, Nest::Fetch#new_card) and must neither poison nor
      // consume the global slot: one host's unknown list
      // item resolved Project-typed (readable via *all+*read
      // "Anyone") while an earlier render in the same boot seated the global
      // map from a different host's computation (denied) — the nest's view
      // gate then read the poisoned entry and emitted two quiet denial spans
      // where the oracle renders the item bar (-1605 bytes on that
      // page). Only the untyped walk
      // may claim pointerItemGlobalVerdictDone, so an untyped computation
      // that arrives later still seeds the global maps (the RVW p21b case:
      // its nil-item-type BasicCs denial must land no matter which
      // host-typed fold ran first).
      if (hostItemType === undefined && !this.pointerItemGlobalVerdictDone.has(key)) {
        this.pointerItemGlobalVerdictDone.add(key);
        this.deniedVerdictsByKey.set(key, read === false);
        const existing = this.taskVerdicts.get(key) ?? { update: undefined, create: undefined, delete: undefined };
        this.taskVerdicts.set(key, { ...existing, create });
      }
    }
  }

  /**
   * The host's item_type_name (card-mod-collection set/all/item.rb:94-96
   * `item_type_name` = `no_item_type_recursion { item_type_id&.cardname }`),
   * resolved once per host into itemTypeNameByHostKey. The walk:
   *
   * 1. Search-typed host: cql_search.rb:14-19 — the cql content's :type
   *    value -> the type card (plausible_type? = String/Symbol/Integer,
   *    never "_left", cql_search.rb:76-78).
   * 2. Pointer/list host: set/abstract/items.rb:5-11 — the options card's
   *    item_type_id, where options_card (card-mod-layout
   *    set/abstract/items/options_api.rb) = `rule_card(:content_options) ||
   *    right_type_options || Card[:all]`. The corpus's *content options
   *    rules are Search-typed JSON specs (`{"type": "person"}` — rule rows
   *    410/498/501 et al.), so the recursion lands in branch 1.
   * 3. Everything else (and the *all fallback, a non-list card): the
   *    generic item_type_id (item.rb:90-92) returns nil through
   *    no_item_type_recursion (item.rb:221-225) — the port short-circuits
   *    to nil. right_type_options (right is a Cardtype) has no engine
   *    virtual `R+type+by_name` card to fetch — nil here, documented
   *    residual.
   */
  private async resolveHostItemTypeName(host: RenderCard): Promise<void> {
    if (this.itemTypeNameByHostKey.has(host.key)) return;
    // Pre-seed the key so a cycle in the options-card walk terminates (the
    // port of Ruby's no_item_type_recursion per-card @item_type_lookup).
    this.itemTypeNameByHostKey.set(host.key, undefined);
    let resolved: { typeName: string; typeId: number } | undefined;
    try {
      resolved = await this.itemTypeIdOf(host, new Set([host.key]));
    } catch (err) {
      // The cql parse of the options card's content raises BadQuery in
      // Ruby. At this PREPARE seam the view is not known yet — the corpus
      // contract (options-card-cql-parse-boundary.test.ts) keeps the
      // render-time raise view-conditional (:open only, permitted host),
      // so the closure degrades to no-item-type and lets the boundary
      // machinery own the raise. The raw deck's option specs are valid
      // JSON (the *all fallback content is "{}"), so this branch is the
      // fixture-anonymization artifact, not raw-deck behavior.
      if (err instanceof Error && err.message.startsWith("Invalid JSON search query")) {
        return;
      }
      throw err;
    }
    if (resolved !== undefined) {
      this.itemTypeNameByHostKey.set(host.key, resolved);
    }
  }

  /** One step of the item-type walk (resolveHostItemTypeName's doc).
   *  Search AND Set hosts resolve through the cql parse (card-mod-rules
   *  set/type/set.rb includes Abstract::Search — SET_TYPE_CODE's note);
   *  pointer/list recurse into their options card; everything else (and
   *  the *all fallback, a Set-typed card whose db_content is no JSON spec)
   *  resolves nil like Ruby's no_item_type_recursion guard. */
  private async itemTypeIdOf(
    card: RenderCard,
    visiting: Set<string>,
  ): Promise<{ typeName: string; typeId: number } | undefined> {
    // cql_search.rb:14-19 (Search/Set sets; overrides Abstract::Items for
    // those cardtypes — the corpus's options rules resolve here).
    if (
      card.typeCode === SEARCH_TYPE_CODE ||
      card.typeCode === SET_TYPE_CODE ||
      card.typeName === "Search"
    ) {
      return this.cqlItemTypeId(card);
    }
    // set/abstract/items.rb:5-11 (Pointer/List sets include Abstract::Items).
    if (card.typeCode === "pointer" || card.typeCode === "list") {
      const opt = await this.resolveOptionsCard(card);
      if (opt === undefined) return undefined;
      if (opt.key === card.key || visiting.has(opt.key)) return undefined;
      visiting.add(opt.key);
      return this.itemTypeIdOf(opt, visiting);
    }
    // item.rb:90-96 generic def: no_item_type_recursion makes the
    // item_type_id <-> item_type_name pair return nil off the collection
    // sets. right_type_options' virtual `R+type+by_name` card has no engine
    // port (resolveOptionsCard documents the stop) — nil, same as Ruby.
    return undefined;
  }

  /** the batched fetch composer: the option-rule candidate names the
   *  host's item-type walk resolves through findRule — the same pure,
   *  sync list ruleNamesForCard emits, so the merged pre-pass wave can
   *  seat (or negatively prime) the whole family before the per-host
   *  ladders run. Candidates whose parse raises ride the same tolerance
   *  primePreparedCardDerivedState applies (Codename/NameNotFound skip). */
  private optionsRuleCandidatesOf(host: RenderCard): string[] {
    const out: string[] = [];
    try {
      for (const candidate of ruleNamesForCard(
        this.structurePatternInputForSync(host),
        "*content options",
      )) {
        out.push(candidate);
      }
    } catch (err) {
      if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
        return out;
      }
      throw err;
    }
    return out;
  }

  /** the batched fetch composer: the cql :type names the hosts' item-
   *  type walks resolve (itemTypeIdOf's Search/Set arm -> cqlItemTypeId's
   *  fetchByName), collected MEMORY-ONLY from options cards the merged
   *  wave just seated — so the type-card fetches ride the same wave
   *  instead of one point read per host. Mirrors itemTypeIdOf's traversal
   *  shape (pointer/list recurse into their options card; search/set
   *  terminals parse their JSON) without asking anything: an options card
   *  the merged wave did not seat simply contributes nothing here, and
   *  the per-host pass resolves it the base way. A non-JSON content is
   *  the BadQuery-raise class — the view seam owns the raise; the
   *  collector silently skips (the same content the boundary test pins). */
  private collectCqlItemTypeNames(
    hosts: readonly RenderCard[],
    visiting: Set<string>,
    out: Set<string>,
  ): void {
    for (const host of hosts) {
      this.collectCqlItemTypeNamesOf(host, visiting, out);
    }
  }

  private collectCqlItemTypeNamesOf(
    card: RenderCard,
    visiting: Set<string>,
    out: Set<string>,
  ): void {
    if (visiting.has(card.key)) return;
    visiting.add(card.key);
    if (
      card.typeCode === SEARCH_TYPE_CODE ||
      card.typeCode === SET_TYPE_CODE ||
      card.typeName === "Search"
    ) {
      const content = card.dbContent?.toString();
      if (content === undefined || content.trim() === "") return;
      let query: unknown;
      try {
        query = JSON.parse(content);
      } catch {
        return; // the raise is cqlItemTypeId's (view-conditional) business
      }
      if (query === null || typeof query !== "object" || Array.isArray(query)) return;
      const type = (query as Record<string, unknown>)["type"];
      if (typeof type === "string" && type !== "" && type !== "_left") out.add(type);
      return;
    }
    if (card.typeCode === "pointer" || card.typeCode === "list") {
      if (this.optionsCardCache.has(card.key)) {
        const opt = this.optionsCardCache.get(card.key);
        if (opt !== undefined) this.collectCqlItemTypeNamesOf(opt, visiting, out);
      }
    }
  }

  /** cql_search.rb:14-19 item_type_id + :76-78 plausible_type?:
   *  `type = cql_hash[:type]; type = type&.card_id if plausible_type? type;
   *  type if type.is_a? Integer`. cql_content parses the db_content JSON
   *  (parse_json_cql — a non-JSON content raises BadQuery, which the render's
   *  quiet-error semantics degrade like Ruby's rescue_view). The value is a
   *  type CARD NAME (or an integer id); `String#card_id` is the Lexicon
   *  lookup (name_variants.rb:32-34, nil-safe), and the emitted name is the
   *  type card's own display name (`item_type_id&.cardname`). */
  private async cqlItemTypeId(
    card: RenderCard,
  ): Promise<{ typeName: string; typeId: number } | undefined> {
    const content = card.dbContent?.toString();
    if (content === undefined || content.trim() === "") return undefined;
    let query: unknown;
    try {
      query = JSON.parse(content);
    } catch {
      throw new Error(`Invalid JSON search query: ${content}`);
    }
    if (query === null || typeof query !== "object" || Array.isArray(query)) {
      return undefined;
    }
    const type = (query as Record<string, unknown>)["type"];
    if (typeof type === "number") {
      if (!Number.isInteger(type)) return undefined;
      return this.typeNameForTypeId(type);
    }
    if (typeof type !== "string" || type === "" || type === "_left") return undefined;
    const typeCard = await this.fetcher.fetchByName(type);
    if (typeCard?.id === undefined || typeCard.name === undefined) return undefined;
    return { typeName: typeCard.name.s, typeId: typeCard.id };
  }

  /** The type card's display name for an integer cql :type value
   *  (`type&.cardname` on the id; nil when the row is missing). */
  private async typeNameForTypeId(
    id: number,
  ): Promise<{ typeName: string; typeId: number } | undefined> {
    const typeCard = await this.fetcher.fetchById(id);
    if (typeCard?.name === undefined) return undefined;
    return { typeName: typeCard.name.s, typeId: id };
  }

  /** Pre-enrich every item name a pointer / list card's db_content
   *  references (card-mod-list set/all/item.rb#raw_item_strings:
   *  content.to_s.split(/\n+/), each item stripped of [[ / ]]). Each
   *  missing item resolves through prepareItemForRender — Card.fetch's
   *  key-based ladder (retrieve.rb), whose Lexicon resolves compound
   *  names through left_id/right_id (lexicon.rb#name_to_lex). An
   *  authored line that differs in form from the stored card's name
   *  ("...+videos" vs stored "...+video", "+Business" vs "business",
   *  spaced-hyphen vs stored underscores) is key-identical to it, so
   *  the line resolves to the REAL card and the item renders that
   *  card's stored display name — the phantom fallback fires only for
   *  true fetch misses. */
  /** The pointer/list host's item names (the exact transform
   *  enrichPointerListItems renders from). Extracted verbatim for the
   *  closure's merged-wave pre-pass (the batched fetch composer V3), which
   *  must collect the SAME names the per-host pass would ask. */
  private pointerItemNamesOf(card: RenderCard): string[] {
    // A set module's `def content` override replaces the stored items
    // (`*input type+*right+*content options`: the list-input catalog), and
    // Ruby fetches the items it actually lists, so the walk reads the same
    // content the item views render.
    return (listItemContentOverride(card) ?? card.dbContent)
      .toString()
      .split(/\n+/)
      .map((s) => s.replace(/\[\[|\]\]/g, "").trim())
      .filter((s) => s.length > 0)
      // Relative item lines ("+bootswatch theme") absolutize against the
      // HOST card's name (clean_item_name's context, card-mod-collection
      // item.rb:29-33) — the SAME transform the sync render path applies
      // (views.ts pointer-list items map, resolvePointerItemName). Without
      // it the miss names (and therefore the pointerItemVerdicts keys)
      // carry the bare relative key ("+bootswatch_theme") while the sync
      // path looks the verdict up under the absolutized key
      // ("bootstrap_default_skin_bootswatch_theme") — every relative
      // item's verdict misses and renders the denied phantom fallback
      // regardless of the deck's rules. The shared helper also resolves
      // the session-relative "_user" items (Card::Name.session) the sync
      // path resolves — signup alert email+*from's "_user" item.
      .map((s) => resolvePointerItemName(s, card.name));
  }

  /** The pointer/list host filter the closure's host loop applies (its
   *  iteration surface; shared by the merged-wave pre-pass). */
  private isPointerLikeHost(card: RenderCard): boolean {
    return (
      card.typeCode === "pointer" ||
      card.typeCode === "list" ||
      card.typeCode === "search_type" ||
      card.typeCode === "skin" ||
      card.typeName === "Search"
    );
  }

  private async enrichPointerListItems(card: RenderCard): Promise<void> {
    const items = this.pointerItemNamesOf(card);
    const missNames: string[] = [];
    // db round-trip elimination: the card's item names seat in
    // ONE batched wave before the per-item ladder loop (the census's
    // biggest prepareItemForRender family - up to ~230 point-query hops
    // per page on the pointer-heavy probe pages). The loop below keeps its
    // exact tolerance and miss bookkeeping; each iteration now answers
    // from the seated map (hit) or the primed negative (miss, zero
    // queries).
    if (items.length > 0) {
      await this.seatNamesByWave(items);
    }
    for (const name of items) {
      // An item line carrying an unresolvable ID/codename mark ("~393")
      // throws at DeckoName.PARSE time (name.ts#parse resolves id marks
      // through the name environment's sync peek, and the lexicon temp
      // cache evicts itself at 10000 keys — after warmLexicon pours the
      // whole deck through, low ids are gone; name.ts#badMark raises
      // NameNotFoundError). The capture deck had the card; this render's
      // sync peek does not. That is a TRUE FETCH MISS: degrade to the
      // sync path's phantom fallback (the line stays unenriched and
      // renderPointerListItem's miss branch renders the phantom slot),
      // never fail the whole render. The GUARD parse is inside the try
      // for the same reason. Same tolerance shape as the sync mark
      // resolution and the prefetch closures (CodenameNotFoundError /
      // NameNotFoundError swallowed, everything else rethrown).
      try {
        if (DeckoName.parse(name).key === "") continue;
        const prepared = await this.prepareItemForRender(name);
        if (prepared === undefined) missNames.push(name);
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) {
          // Ruby's Lexicon.name(id) reads rows WITHOUT a trash filter
          // (lexicon.rb#id_to_lex), so a `~id` item pointing at a TRASHED
          // member card still RESOLVES to its name there (CB_role /
          // role card's +*members nest: the item ids are trashed
          // rows, never warmed by warmLexicon's live-id pour and carrying
          // no card_references rows for the seed closure). The async
          // lexicon IS that db fallback: resolve, record the durable name
          // (the sync boundary's next parse then succeeds), and let the
          // item render through the unknown-item path — Ruby's own
          // Card.fetch does NOT return the trashed row (retrieve.rb:24
          // trash = false unless look_in_trash), so the record stays
          // unknown and the oracle pins the denied unknown-item bar with
          // the resolved name. A true db miss keeps the phantom fallback
          // with the authored mark.
          const idMatch = /^~(\d+)$/.exec(name.trim());
          if (idMatch !== null) {
            const id = Number(idMatch[1] as string);
            if (Number.isSafeInteger(id)) {
              const resolved = await this.fetcher.lexicon.name(id);
              if (resolved !== undefined && resolved.s !== "") {
                const record = await this.fetcher.fetchById(id);
                if (record?.name !== undefined) {
                  await this.enrichAndStore(record);
                  continue;
                }
              }
            }
          }
          this.reportUnknownCard(name);
          missNames.push(name);
          continue;
        }
        throw err;
      }
    }
    // The misses are the UNKNOWN items: precompute their read/create
    // verdicts (ensurePointerItemVerdicts) so the sync item path renders
    // Ruby's own gates query-free (the readable-unknown full bar vs the
    // denied phantom spans; the createable unknown-link). The host's
    // resolved item type rides along (resolveHostItemTypeName ran first in
    // the closure) — the verdict input's type is the phantom's REAL type
    // (new_unknown_item_args, item.rb:245-248), not the *all+*default
    // fallback.
    await this.ensurePointerItemVerdicts(
      card,
      missNames,
      this.hostItemTypeName(card),
    );
  }

  /** Pre-load every rule card whose left_id equals the set card's id,
   *  plus the rule's right side (the setting card), so the set-card
   *  Rules section's collectRules walk finds them in renderCards.
   *  Single batched query; warm renders (closure warm) skip the pass.
   *  The right side cards must also include the *all setting cards
   *  themselves (autoname, default, structure, ...) so the before(:bar)
   *  hook can resolve the right part's codename for the _category-*
   *  class chain. */
  /** The set cards this render's seats nest with a setting-list view
   *  (`{{<set>|bar_setting_list…}}`, `pill_setting_list`, …), each given
   *  preloadSetRules. Returns whether any preload ran. Memory-only when no
   *  seated content names such a view. */
  private async preloadNestedSetRuleLists(rootCard: RenderCard): Promise<boolean> {
    const targets: Array<{ target: string; context: DeckoName }> = [];
    for (const card of this.renderCards.values()) {
      if (!this.renderSeats.has(card.key)) continue;
      const content = card.dbContent;
      if (content === undefined || !content.includes("setting_list")) continue;
      for (const m of content.matchAll(/\{\{([^{}|]+)\|([^{}]*)\}\}/g)) {
        if (!/\b[a-z]+_setting_list\b/.test(m[2] ?? "")) continue;
        targets.push({ target: (m[1] ?? "").trim(), context: card.name });
      }
    }
    let ran = false;
    for (const { target, context } of targets) {
      let name: string;
      try {
        const parsed = DeckoName.parse(target);
        name = parsed.isAbsolute ? parsed.s : parsed.absoluteName(context).s;
      } catch (err) {
        if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) continue;
        throw err;
      }
      const setCard = await this.prepareItemForRender(name);
      if (setCard === undefined || setCard.typeCode !== "set" || setCard.key === rootCard.key) continue;
      await this.preloadSetRules(setCard);
      ran = true;
    }
    return ran;
  }

  private async preloadSetRules(setCard: RenderCard): Promise<void> {
    if (setCard.id === undefined) return;
    // Warm skip: this set card's rule environment is already fully
    // populated (see setRulePreloadDoneIds). The first render of each
    // set card always runs the whole preload below — the R16 warm-test
    // correction (stored child record.leftId === setCard.id, not the
    // name-key match that skipped the preload for exactly the sets
    // whose rules-editor setting list needed it) is subsumed by the
    // memo: nothing is skipped until one full preload has completed
    // for this id.
    if (this.setRulePreloadDoneIds?.has(setCard.id) === true) return;
    const result = await this.fetcher.driver.query<CardsRow>(
      `SELECT * FROM cards WHERE left_id = ? AND trash = 0 ` +
      `ORDER BY db_content, name`,
      [setCard.id],
    );
    // Child-rule enrichment only fires when stored rule children exist. The
    // settings preload + the virtual-rule-card verdict preload below run for
    // EVERY set-card render: the Rules section's setting list builds a
    // VIRTUAL rule card per setting without a stored child (the common case
    // — most sets store no rules), and both the bar's category classes and
    // its read-verdict depend on these passes. The previous early return on
    // `rows.length === 0` skipped them for exactly the sets with no stored
    // rules, leaving findSettingCard empty and every virtual's read gate
    // closed — the engine rendered 21 quiet-denial spans where Ruby renders
    // 20 rule bars + 1 denial (*sidebar+*self content view, the dominant
    // permission_denied_mismatch signature).
    if (result.rows.length > 0) {
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
    }
    // Load the *all 23 settings cards (autoname, default, structure, create,
    // read, ...) so the before(:bar) hook can resolve each rule's right
    // part to its codename. Without these the _category-* class chain
    // is empty (bar_view.rb:10 + editor.rb:54-58).
    await this.preloadAllSettingCards();
    // The virtual rule cards' type cards (the corpus-pinned ensure_type
    // outcomes - virtual-rule-card.ts RULE_TYPE_BY_SETTING) must be in
    // the render-card map before the SYNC Rules-section render resolves
    // each virtual's typeName/typeCode from the DECK
    // (buildVirtualRuleCard's deckTypeCard lookup): Ruby's template walk
    // resolves the rule's type to an ID and then prints the deck card AT
    // that id, so the served deck's type names are what the oracle bytes
    // carry (corpus:268 and recapture-shard-000000.jsonl *captcha+*right
    // read TYPE-gwtx / data-card-type-name="gwtx" for the *head
    // virtuals). Same preload contract as the settings walk above; fetch
    // is cache-first, so warm renders add zero queries.
    for (const preloadTypeId of RULE_TYPE_IDS_FOR_PRELOAD) {
      const typeRecord = await this.fetcher.fetchById(preloadTypeId);
      if (typeRecord === undefined || typeRecord.name === undefined) continue;
      await this.enrichAndStore(typeRecord);
    }
    // Pre-populate read-permission verdicts for every (setCard,
    // settingCard) pair the sync render path will construct a virtual
    // for — the engine's setRulesCoreHtml falls through to
    // views.ts#renderSettingListItems which builds one virtual per
    // setting that has no stored child, and the view-permission gate
    // (format.ts:renderView) reads isDenied which reads
    // deniedVerdictsByKey. Without this pass the gate is open for every
    // virtual and the engine renders a bar where Ruby renders the
    // quiet denial span (the permission_denied_mismatch
    // residual; see preloadVirtualRuleVerdicts for the full mechanism).
    await this.preloadVirtualRuleVerdicts(setCard);
    // Marked only after every pass above completed, so an aborted
    // preload retries in full on the next render of this set card.
    if (this.setRulePreloadDoneIds === undefined) this.setRulePreloadDoneIds = new Set();
    this.setRulePreloadDoneIds.add(setCard.id);
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

  /** Set once the head read-set has been folded into the render-card map
   *  from the cold batch. Mirrors the skip-if-set shape every other
   *  memoized prepare pass uses, so a warm render pays zero round trips
   *  and does not re-add the statement to a batch. */
  private headReadsWarmed = false;

  /** The content version the boot-cache probe read at the top of this
   *  render, when it ran one. UNDEFINED means no probe: either this engine
   *  has already spent its one probe, or the process held no boot bundle to
   *  compare against. The cold batch consumes and clears it. */
  private bootProbeVersion: number | undefined;

  /** The boot-cache probe runs at most once per engine — it answers "is the
   *  process bundle still current?", which is a question about the deck at
   *  the start of a render, not a per-render gate. */
  private bootProbeIssued = false;

  /** Assemble the process boot bundle from this cold batch's folded
   *  results. The three indices are the same fixed indices the parsers above
   *  use; a MISS is the only caller, so every index here points at a result
   *  storage actually returned. */
  private bootBundleFrom(
    folded: SQLQueryResult[] | undefined,
    indices: { codehashIndex: number; typeNamesIndex: number; headReadsIndex: number },
  ): BootBundle {
    const empty: SQLQueryResult = { rows: [], rowsAffected: 0 };
    return {
      version: this.bootProbeVersion,
      driver: this.fetcher.driver,
      codehash: folded?.[indices.codehashIndex] ?? empty,
      typeNames: folded?.[indices.typeNamesIndex] ?? empty,
      headReads: folded?.[indices.headReadsIndex] ?? empty,
    };
  }

  /**
   * THE ASYNC-VIEW SEAM: warm the cards the head views read, so their
   * SYNCHRONOUS ViewFn bodies can read them out of the render-card map
   * through RenderEngineLike#fetchRenderCard (format.ts:1371).
   *
   * Why this exists: card-mod-format set/all/head.rb's :page_title,
   * :page_title_tag, :favicon_tag, :stylesheet_tags and :head each need
   * an engine read (Card::Rule.global_setting, nest :favicon,
   * main_stylesheet_path -> asset_output_url), but ViewFn is
   * synchronous (format.ts:291) and its dispatcher
   * (RenderFormat#renderView, format.ts:452) returns `string`. The two
   * candidate seams were a prepare-phase prefetch or an async view
   * class; the prefetch won because it is the engine's established
   * idiom (preloadAllSettingCards, preloadSetRules, isDenied's verdict
   * pass, findSettingCard) and because the async class would have made
   * renderView's return type a Promise for the whole ~200-view registry.
   * The rejected alternative is an async view class, which would have made
   * renderView's return type a Promise for the whole ~200-view registry.
   *
   * The read set is the fixed key list HEAD_READ_SET_KEYS
   * (render/head-views.ts): the *title and *favicon setting cards (the
   * `Card[:codename]` reads global_setting/nest make) and the two
   * *all+*<setting>+*asset output chains asset_output_url walks. Ruby's
   * own basket[:cache_seed_names] (head.rb:5-13) declares the same cards
   * as always-prefetched, so this is a port of a Ruby mechanism, not an
   * engine-local invention.
   *
   * The batch matches the `key` COLUMN, which is the normalized
   * (underscored) form: a three-part junction stores
   * `*all+*style+*asset_output` as its key, not the display
   * `*all+*style+*asset output`. The read side is unaffected —
   * fetchRenderCard runs DeckoName.parse, which normalizes — so the
   * views address the display names while the batch addresses the keys.
   *
   * Absolute names, not the `:codename` marks: a mark resolves through
   * the codename codehash, which a bare view render does not always
   * fold; `:title` and `*title` are the same card (global_setting does
   * `Card[name]`, rule/all.rb:5-9), so the map read is byte-identical
   * and carries no registry dependency.
   *
   * ZERO extra round trips: the statement rides the cold path's existing
   * batch (see the headReadsCold comment in render()), so the query-count
   * gates that pin the cold shape stay exactly where they are. A name
   * that does not exist in the deck is simply absent from renderCards,
   * which is the state the views already handle as "no setting"
   * (faviconTagBytes -> "", pageTitleBytes -> name alone).
   */
  private async cacheHeadViewReads(result: SQLQueryResult | undefined): Promise<void> {
    for (const row of result?.rows ?? []) {
      const record = await composeCardRecord(row as CardsRow, this.fetcher.lexicon);
      if (record.name === undefined) continue;
      // Ruby's Card#key is name.key (name/all.rb:17-19) and every cache
      // consumer keys by the normalized form (fetch.ts#retrieveFromCacheByKey
      // reads mark.name.key; fetchRenderCard reads DeckoName.parse(name).key).
      // The raw capture dump's key COLUMN carries the verbatim display name
      // for simple rows ("*recent settings"), so seat under the name's
      // normalized key — byte-identical for every row whose key column is
      // already normalized (fixture decks seed DeckoName.parse(name).key) or
      // single-word (all pre-existing head reads). Without this, a raw-dump
      // row seats where no normalized lookup can ever reach it and the
      // recent arm (format.ts#recentSettingCodenames -> fetchRenderCard)
      // reads an empty membership on every raw-corpus render.
      record.key = record.name.key;
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
   * Ruby renders the denial span (the permission_denied_mismatch
   * residual).
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
    if (this.existingRuleCards === undefined) this.existingRuleCards = new Map();
    for (const groupName of SETTING_GROUPS) {
      // The seat enumerates EXACTLY the settings the sync nav renders
      // (views.ts rule-lists): Ruby's nav walk is group_settings ->
      // visible_settings (card-mod-rules set/type/set/setting_categories.rb
      // :47-49 -> set/type/set.rb:76-84) — the restricted_to_type gate is
      // PROTOTYPE-dependent (card-mod-list set/self/content_options.rb:2
      // `%i[list pointer session]`), so content_options/content_option_view
      // ARE nav candidates on list/pointer/session-prototype sets. The
      // prior deck-wide skip (SETTING_NEVER_VISIBLE via visibleGroupSettings)
      // left those virtual bars unjudged here while the sync nav still
      // rendered them — isDenied map miss = gate-open = the over-allow the
      // oracle span pairs pin (HBQ+*right+*layout+*self: two allowed bars
      // where Ruby renders quiet denials). Seating the verdict the nav will
      // look up is the whole fix; the verdict itself (deny via the generic
      // _left walk, permissions.rb:55-71) needed no change.
      // (Merge note: supersedes bar-slots' V1 full-registration walk —
      // visibleSettingsForGroup is the prototype-aware enumeration of the
      // SAME rows V1's 62 dump-pinned nav diffs need, per-set instead of
      // deck-wide.)
      const groupSettings = visibleSettingsForGroup(this, setCard, groupName);
      for (const settingCodename of groupSettings) {
        const settingCard = this.findSettingCard(settingCodename);
        if (settingCard === undefined) continue;
        const name = DeckoName.parse(`${setCard.name.s}+*${settingCodename}`);
        if (this.deniedVerdictsByKey.has(name.key)) continue;
        // The FULL ok_to_read? port (cardReadAllowed): the mod set-module
        // overrides decide first — the rules-editor nav's "+*head /
        // +*script" bars sit under right::head / right::script's
        // unconditional `true` even where the tag-scoped *right+*read rule
        // denies (the FOR CHILDREN'S CLASS+*self nav class: the generic
        // walk alone rendered the denial span where Ruby renders the bar).
        const allowed = await this.cardReadAllowed(
          name,
          undefined,
          settingCard.typeId,
          settingCard.typeName,
          undefined,
        );
        this.deniedVerdictsByKey.set(name.key, allowed === false);
        // find_existing_rule_card for the virtual (editor.rb:126-130
        // existing_rule_from_prototype → set_prototype.rule_card(setting) —
        // the first EXISTING stored rule in the prototype's candidate walk).
        // The set card's own pattern walk lands on the same stored rule for
        // this corpus (documented on existingRuleKeys); memoized so the sync
        // bar renderer (views.ts prepareBar's `voo.hide :bar_nav unless
        // existing_rule_card` + the one-line-content gate in rule-bar-right)
        // stays query-free.
        if (!this.existingRuleCards.has(name.key)) {
          const protoInput = await this.prototypePatternInput(setCard);
          if (protoInput !== undefined) {
            const rule = await this.findPrototypeRule(
              protoInput,
              settingCard.name?.s ?? `*${settingCodename}`,
            );
            if (rule !== undefined && rule.rule.name !== undefined) {
              const ruleCard = await this.enrichAndStore(rule.rule);
              if (ruleCard !== undefined) this.existingRuleCards.set(name.key, ruleCard);
            }
          }
        }
      }
    }
  }

  /** findRule with Ruby's cache-walk semantics for NEW-card prototypes.
   *
   *  TYPE-ANCHORED CANDIDATES NEED A TYPE: a NEW card whose type the
   *  template chain has not resolved carries no Type / TypePlusRight
   *  pattern (set_pattern application anchors those on card.type_id), so
   *  its rule-cache walk emits no "<type>+<setting>" /
   *  "<type>+<anchor>+*type plus right+<setting>" lookup keys. The
   *  name-walk's candidates for an untyped input compose those forms with
   *  the registry's RichText default; on the RVW+*right set prototype that
   *  composition answered "existing" where the oracle pins the opposite
   *  (the capture's slot census: hide:["bar_nav"] exactly on
   *  structure/autoname/help/input_type/on_create/on_update/on_delete/
   *  thanks/follow). Skip while the input's type is unresolved.
   *
   *  TPR CANDIDATES ANCHOR ON left_type, NOT THE CARD'S OWN TYPE:
   *  pattern/class_methods.rb:59-73 left_type = `card.superleft&.type_name
   *  || quick_type(card.name.left_name)`, where quick_type types a NEW
   *  left card through ITS OWN *default walk — for the set prototype
   *  *dummy+RVW (typed RichText via *all plus+*default) the TPR anchor is
   *  quick_type("*dummy") = the *all+*default rule's type ("Basic Cs"),
   *  so Ruby's lookup key reads "BasicCs+RVW+type_plus_right+<setting>" —
   *  an anchor naming NO card (@anchor_id nil, pattern/base.rb:75-80
   *  `elsif @anchor_id`) — and the key never forms: the
   *  RichText+RVW+*type plus right+*structure rule (10722) stays
   *  unreachable and the prototype's existing-rule verdict for *structure
   *  is nil. The name walk instead composes the TPR candidate from the
   *  input's own type name (RichText), whose anchor card DOES exist — the
   *  one-hit divergence. Probe the quick-type-anchored form and skip the
   *  input-type-anchored one for plain (supercard-less) compounds;
   *  supercard-shaped inputs keep leftTypeName (class_methods.rb:61's
   *  superleft arm, the Search+large image pin). */
  private async findPrototypeRule(
    protoInput: PatternCardInput,
    setting: string,
  ): Promise<{ rule: CardRecord } | undefined> {
    const candidates = ruleNamesForCard(protoInput, setting);
    const protoName =
      protoInput.name instanceof DeckoName
        ? protoInput.name
        : DeckoName.parse(String(protoInput.name));
    const quickLeftTypeName =
      protoInput.typeId !== undefined &&
      protoInput.isNew === true &&
      protoInput.leftTypeName === undefined &&
      protoName.isCompound
        ? await this.quickTypeName(protoName.leftName)
        : undefined;
    for (const candidate of candidates) {
      if (
        protoInput.typeId === undefined &&
        /\+(\*type|\*type plus right)\+/.test(candidate)
      ) {
        continue;
      }
      const tprMatch = /^(.*)\+\*type plus right\+/.exec(candidate);
      let probe = candidate;
      if (
        tprMatch !== null &&
        quickLeftTypeName !== undefined &&
        protoInput.typeName !== undefined &&
        tprMatch[1].startsWith(`${protoInput.typeName}+`)
      ) {
        // rewrite the anchor's left type to Ruby's quick_type(left_name)
        probe = `${quickLeftTypeName}${candidate.slice(String(protoInput.typeName).length)}`;
      } else if (tprMatch !== null && quickLeftTypeName === undefined) {
        continue;
      }
      let record: CardRecord | undefined;
      try {
        record = await this.fetcher.fetchByName(probe);
      } catch (err) {
        if (
          err instanceof CodenameNotFoundError ||
          err instanceof NameNotFoundError
        ) {
          continue;
        }
        throw err;
      }
      if (record !== undefined && record.name !== undefined) {
        return { rule: record };
      }
    }
    return undefined;
  }

  /** class_methods.rb:64-72 quick_type: the type name of a NEW card named
   *  `name`, resolved through its own *default walk (untyped input; the
   *  *self candidate drops for new cards and the compound-only *all plus
   *  candidates need a type), first existing rule's own type. Undefined
   *  when no *default rule applies or the type card cannot be named. */
  private async quickTypeName(name: DeckoName | undefined): Promise<string | undefined> {
    if (name === undefined) return undefined;
    const candidates = ruleNamesForCard(
      { name, id: undefined, typeId: undefined, typeName: undefined, isNew: true },
      "*default",
    );
    for (const candidate of candidates) {
      if (/\+(\*type|\*type plus right)\+/.test(candidate)) continue;
      let record: CardRecord | undefined;
      try {
        record = await this.fetcher.fetchByName(candidate);
      } catch (err) {
        if (
          err instanceof CodenameNotFoundError ||
          err instanceof NameNotFoundError
        ) {
          continue;
        }
        throw err;
      }
      if (record !== undefined && record.typeId !== undefined) {
        const typeCard = await this.fetcher.fetchById(record.typeId);
        const typeName = typeCard?.name?.s;
        if (typeName !== undefined) return typeName;
      }
    }
    return undefined;
  }

  /** Ruby's Auth.always_ok? for the session's viewer — the
   *  ReadPermissionState.alwaysOk verdict (auth/permissions.rb:7-13, the
   *  DeckoBot actor or an Administrator-role member), settled in the
   *  prepare phase and read synchronously here (format.ts RenderEngineLike#
   *  peekAlwaysOk). html/error.rb:47-49 show_all_errors? consumes it: the
   *  quiet render-error span's ADMIN arm (backtrace_link's debug-page
   *  title) renders only for an always-ok viewer. Undefined = no
   *  permission state resolved (the plain-cardname arm). */
  peekAlwaysOk(): boolean | undefined {
    return this.readPermission?.alwaysOk;
  }

  /** The read-permission verdict for a prepared card (ok_to_read?'s set
   *  membership, precomputed in the prepare phase — never a query here).
   *  ID-less cards (the virtual cards) read their verdicts from the
   *  key-keyed map (see deniedVerdictsByKey). */
  isDenied(card: RenderCard): boolean {
    if (card.id !== undefined) {
      const verdict = this.deniedVerdicts.get(card.id);
      if (verdict !== undefined) return verdict;
      // A real card that reached a view without being judged (prepare paths
      // that add cards outside the page's seats: the *help rule prefetch,
      // the admin runtime). ok_to_read? (permissions.rb:139-146) reads the
      // STORED read_rule_id first, which is sync — answer from it instead
      // of reading the missing verdict as allowed. Names a set-module
      // override may decide stay on the old path (the override is async).
      const state = this.readPermission;
      const storedRule = card.record.readRuleId;
      if (state === undefined || storedRule === undefined) return false;
      if (nameHasReadOverride(card.name)) return false;
      const denied = !canReadByStoredRule(storedRule, state);
      this.deniedVerdicts.set(card.id, denied);
      return denied;
    }
    return this.deniedVerdictsByKey.get(card.key) === true;
  }

  /** ok_to_<task>? for the non-read view tasks. */
  taskAllowed(card: RenderCard, task: Exclude<CrudTask, "read">): boolean | undefined {
    if (this.readPermission?.alwaysOk) return true;
    return this.taskVerdicts.get(card.key)?.[task];
  }

  /** card-mod-account set/type/signup/views.rb verification_links' gates
   *  for a Sign up card, keyed by the card's key: can_approve? (signup.rb:
   *  `Card.new(type_id: Card.default_accounted_type_id).ok? :create`, the
   *  default accounted type being the :user cardtype) and the card's own
   *  ok?(:delete). Prepared for the page's root Sign up card. */
  private signupApprovalVerdicts = new Map<string, { approve: boolean; delete: boolean }>();

  signupApprovalVerdict(card: RenderCard): { approve: boolean; delete: boolean } | undefined {
    if (this.readPermission?.alwaysOk) return { approve: true, delete: true };
    return this.signupApprovalVerdicts.get(card.key);
  }

  private async prepareSignupApprovalVerdicts(card: RenderCard): Promise<void> {
    if (this.signupApprovalVerdicts.has(card.key) || card.id === undefined) return;
    const state = this.readPermission ?? (await this.ensureReadPermission());
    if (this.taskState === undefined) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      this.taskState = viewTaskStateFromResults(results, state);
    }
    const userTypeId = await this.fetcher.codenames.id("user");
    let approve = false;
    if (userTypeId !== undefined) {
      const userType = await this.fetcher.fetchById(userTypeId, { skipVirtual: true });
      approve =
        (await taskVerdictForCard(
          this.fetcher,
          { name: "", isNew: true, typeId: userTypeId, typeName: userType?.name?.s },
          "create",
          this.taskState,
        )) === true;
    }
    const own = await allTaskVerdictsForCard(this.fetcher, this.structurePatternInputForSync(card), this.taskState);
    this.signupApprovalVerdicts.set(card.key, { approve, delete: own.delete === true });
  }

  /** The createable gate of the :unknown / :mini_unknown views
   *  (card-mod-format set/all/html/error.rb `card.ok?(:create) ? yield :
   *  ""`): true only on a computed allow. A fetch-miss card whose verdict no
   *  prepare step computed is recorded, and the render entry point computes
   *  it and renders again (renderWithUnknownCreateVerdicts). */
  unknownCardCreatable(card: RenderCard): boolean {
    const verdict = this.taskAllowed(card, "create");
    if (
      verdict === undefined &&
      card.id === undefined &&
      this.readPermission !== undefined &&
      !this.unknownCreateMisses.has(card.key)
    ) {
      this.unknownCreateMisses.set(card.key, card);
    }
    return verdict === true;
  }

  /** Card::Name.session (Card::Auth.current.name), which resolves `_user`
   *  in names (cardname contextual.rb user_part): the page session's
   *  account name when signed in, "Anonymous" otherwise. Installed into
   *  the name environment before each render entry point. */
  private nameSessionActor: { id: number; name: string } | undefined;

  private async ensureNameSession(): Promise<void> {
    const env = getNameEnvironment();
    if (env === undefined) return;
    let name = "Anonymous";
    const session = this.pageSession;
    if (session?.signedIn === true && session.actorId !== undefined) {
      if (this.nameSessionActor?.id !== session.actorId) {
        const actor = await this.fetcher.fetchById(session.actorId, { skipVirtual: true });
        const actorName = actor?.name?.s;
        this.nameSessionActor =
          actorName === undefined || actorName === "" ? undefined : { id: session.actorId, name: actorName };
      }
      if (this.nameSessionActor !== undefined) name = this.nameSessionActor.name;
    }
    if (env.session !== name) setNameEnvironment({ ...env, session: name });
  }

  /** Run one render entry point; when it asked for create verdicts of
   *  unknown cards that no prepare step computed, compute them (the same
   *  ok_to_create? walk the write path uses, on the card's would-be type)
   *  and render again. Nested entry points defer to the outermost. A
   *  verdict is memoized under the card's key, so the loop ends: a second
   *  pass can only miss on cards the first pass never reached. */
  async renderWithUnknownCreateVerdicts(run: () => Promise<ViewResult>): Promise<ViewResult> {
    if (this.unknownCreateRenderDepth > 0) return run();
    this.unknownCreateRenderDepth += 1;
    try {
      await this.ensureNameSession();
      let html = await run();
      for (let pass = 0; pass < 4 && this.unknownCreateMisses.size > 0; pass++) {
        const misses = [...this.unknownCreateMisses.values()];
        this.unknownCreateMisses.clear();
        if (this.readPermission === undefined) break;
        if (this.taskState === undefined) {
          const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
          this.taskState = viewTaskStateFromResults(results, this.readPermission);
        }
        for (const card of misses) {
          if (this.taskVerdicts.get(card.key)?.create !== undefined) continue;
          const create = await taskVerdictForCard(
            this.fetcher,
            { ...this.structurePatternInputForSync(card), isNew: true },
            "create",
            this.taskState,
          );
          const existing = this.taskVerdicts.get(card.key) ?? { update: undefined, create: undefined, delete: undefined };
          // An unresolvable verdict settles as denied for the createable
          // gate (Ruby's who_can -> [] -> among? on an empty rule).
          this.taskVerdicts.set(card.key, { ...existing, create: create ?? false });
        }
        html = await run();
      }
      return html;
    } finally {
      this.unknownCreateMisses.clear();
      this.unknownCreateRenderDepth -= 1;
    }
  }

  /** The harness's fresh-process boundary (the Ruby rigs' Cache.renew): a
   *  host whose sessions are per request (the reference harness's recorder
   *  renews Card::Cache before every recorded op — harness_env.rb
   *  begin_request!) clears the prepared chrome and the ensure_roles fill
   *  state, so the next render is the session's FIRST render — the roles
   *  dropdown's content input blank, the account links re-prepared. The
   *  pageSession itself stays; the caller re-signs in through it. */
  resetRequestSession(): void {
    this.sessionAccountLinks = undefined;
    this.sessionAccountLinksActorId = undefined;
    this.sessionMyCardHtml = undefined;
    this.sessionMyCardHtmlFilled = undefined;
    this.sessionRolesDropdownHtml = undefined;
    this.sessionAccountLinksFilledHtml = undefined;
    this.sessionRolesContentFilled = false;
    this.sessionRolesFillConsumedThisPass = false;
    this.sessionAccountLinksHasRoles = false;
  }

  /** The request boundary's fold (renderPageBytes' finally): a Ruby request
   *  whose roles nest rendered leaves the fill committed on the session's
   *  card object — the next request (and every later page of the process,
   *  the real capture rigs' filled-everywhere posture) reads it. The
   *  passes INSIDE this request model the one Ruby render and never see
   *  each other's flips; this fold is where the flip becomes cache state. */
  commitSessionRolesFill(): void {
    if (this.sessionRolesFillConsumedThisPass) this.sessionRolesContentFilled = true;
  }

  /** The fill state the serving sites read: the committed card-cache state
   *  OR this pass's own consumption (ensure_roles' mid-request mutation —
   *  a nest rendered after the first one in the SAME Ruby request reads
   *  the filled content; the synthetic corpus's page:member:*account
   *  links pins exactly that body-blank/navbar-filled pair). */
  private get sessionRolesFillVisible(): boolean {
    return this.sessionRolesContentFilled || this.sessionRolesFillConsumedThisPass;
  }

  /** RenderEngineLike.pageSessionAccountLinksHtml — the prepared signed-in
   *  *account_links navbar items (undefined until a page render prepared
   *  them for a signed-in chrome session). Serves the FILLED variant once
   *  this render has already shown the roles nest once (ensure_roles'
   *  mid-request mutation; see the field note). */
  get pageSessionAccountLinksHtml(): string | undefined {
    return this.sessionRolesFillVisible
      ? (this.sessionAccountLinksFilledHtml ?? this.sessionAccountLinks)
      : this.sessionAccountLinks;
  }

  /** RenderEngineLike.pageSessionMyCardHtml — the prepared :my_card view
   *  body (the account_dropdown arm; see the prepare note below). Serves
   *  the FILLED variant once this render has already shown the roles nest
   *  once (ensure_roles' mid-request mutation; see the field note). */
  get pageSessionMyCardHtml(): string | undefined {
    return this.sessionRolesFillVisible ? (this.sessionMyCardHtmlFilled ?? this.sessionMyCardHtml) : this.sessionMyCardHtml;
  }

  /** RenderEngineLike.pageSessionRolesDropdownHtml. */
  get pageSessionRolesDropdownHtml(): string | undefined {
    return this.sessionRolesDropdownHtml;
  }

  /** RenderEngineLike.markSessionRolesContentFilled — the port of
   *  ensure_roles' mutation point (set/right/enabled_roles.rb:52
   *  checkbox_input's first line): a view fn that has just consumed the
   *  roles-nest html flips this request's fill state, so the NEXT roles
   *  nest render of the same request serves the filled content input.
   *  A no-op unless the session's chrome carries the roles nest. */
  markSessionRolesContentFilled(): void {
    if (this.sessionAccountLinksHasRoles) this.sessionRolesFillConsumedThisPass = true;
  }

  /** Prepare the signed-in account-links chrome for the page session — the
   *  async half of the navbar seam (the view fns are sync). Resolves what
   *  the sync view cannot:
   *  - the session account card's NAME (the my-card label/href — Ruby:
   *    link_to_mycard's `Auth.current.name`, account_dropdown.rb:2-4);
   *  - known/virtual resolution for the three links (links.rb:141-144
   *    add_known_or_wanted_class -> Card.known? = real? || virtual?;
   *    virtual? = compound && structure.present? — states.rb:63-67 — which
   *    for a deck account holder's `+*account settings` nest hits
   *    the deck's `*account settings+*right+*structure` rule).
   *  Memoized per actor; a no-op for signed-out or actor-less sessions.
   *  An unresolvable session account cannot exist in Ruby (Auth.current_id
   *  always names a live account card), so the engine degrades the whole
   *  chrome to signed-out (the auth/current.rb:58-63 unresolvable-session
   *  shape) rather than rendering half a session. */
  async prepareSessionAccountLinks(): Promise<void> {
    const session = this.pageSession;
    if (session?.signedIn !== true || session.actorId === undefined) return;
    if (
      this.sessionAccountLinks !== undefined &&
      this.sessionAccountLinksActorId === session.actorId
    ) {
      return;
    }
    const actor = await this.fetcher.fetchById(session.actorId, { skipVirtual: true });
    if (actor?.name === undefined || actor.name === null || actor.name.s === "") {
      this.pageSession = undefined;
      this.sessionAccountLinks = undefined;
      this.sessionAccountLinksActorId = undefined;
      this.sessionMyCardHtml = undefined;
      this.sessionMyCardHtmlFilled = undefined;
      this.sessionRolesDropdownHtml = undefined;
      this.sessionAccountLinksFilledHtml = undefined;
      return;
    }
    const actorName: string = actor.name.s;
    const accountSettingsName = `${actorName}+*account settings`;
    const accountSettingsReal =
      (await this.fetcher.fetchByKey(DeckoName.parse(accountSettingsName).key, {
        skipVirtual: true,
      })) !== undefined;
    // virtual?: a compound card is known when a *structure rule applies to
    // it (states.rb:63-67) — findRule walks the same pattern candidates
    // Ruby's rule lookup does.
    const accountSettingsVirtual =
      (await findRule(this.fetcher, { name: accountSettingsName }, "*structure")) !== undefined;
    // The sign-out mark is the SYMBOL :signin (account_dropdown.rb:22) —
    // Card::Name[:symbol] resolves through the codename registry
    // (name.rb:77 Codename.name!), so known? is the codename card's
    // real existence.
    const signinId = await this.fetcher.codenames.id("signin");
    const signinReal =
      signinId !== undefined &&
      (await this.fetcher.fetchById(signinId, { skipVirtual: true })) !== undefined;
    const known = {
      actor: true,
      accountSettings: accountSettingsReal || accountSettingsVirtual,
      signin: signinReal,
    };
    // The :my_card view body (account_links.rb view :my_card):
    // `can_disable_roles? ? interactive_roles_dropdown : account_dropdown`.
    // Both ensure_roles variants bake here (the async prepare is the only
    // place with the resolved roles): UNFILLED for the first roles-nest
    // render of a request (the blank content input the oracle pins), FILLED
    // for every later nest render of the same request — the fill state
    // itself flips per request at the consumption seam
    // (markSessionRolesContentFilled).
    const rolesInput = await this.sessionRolesInput(actor);
    this.sessionAccountLinksHasRoles = rolesInput !== undefined;
    this.sessionMyCardHtml =
      rolesInput === undefined
        ? myCardDropdownInnerHtml(actorName, known, [])
        : enabledRolesDropdownHtml(rolesInput, known, false);
    this.sessionMyCardHtmlFilled =
      rolesInput === undefined ? undefined : enabledRolesDropdownHtml(rolesInput, known, true);
    this.sessionRolesDropdownHtml =
      rolesInput === undefined
        ? myCardDropdownInnerHtml(actorName, known, [])
        : rolesAccountDropdownHtml(rolesInput, known);
    this.sessionAccountLinks = signedInAccountLinksInnerHtml(actorName, known, this.sessionMyCardHtml);
    this.sessionAccountLinksFilledHtml =
      rolesInput === undefined
        ? undefined
        : signedInAccountLinksInnerHtml(actorName, known, this.sessionMyCardHtmlFilled);
    this.sessionAccountLinksActorId = session.actorId;
  }

  /** account_links.rb can_disable_roles? and the facts its roles dropdown
   *  renders: undefined unless the actor holds more than one current role
   *  (Auth.current_roles = Anyone Signed In + the role member cards' roles,
   *  auth/current.rb current_roles) and the *enabled_roles codename
   *  exists. The roles are the resolved read state's parties without
   *  Anyone and the actor itself (read-rules.ts builds them as Anyone,
   *  Anyone Signed In, the member roles, the actor). */
  private async sessionRolesInput(actor: CardRecord): Promise<SessionRolesInput | undefined> {
    const state = this.readPermission ?? (await this.ensureReadPermission());
    if (actor.id === undefined || actor.name === undefined) return undefined;
    if ((await this.fetcher.codenames.id("enabled_roles")) === undefined) return undefined;
    const anyoneId = await this.fetcher.codenames.id("anyone");
    const partyRoles = state.parties.filter((id) => id !== anyoneId && id !== actor.id);
    if (partyRoles.length <= 1) return undefined;
    // auth/current.rb current_roles: Anyone Signed In, then Role.role_ids in
    // the role hash's order — set/self/role.rb generate_rolehash iterates an
    // unsorted Card.search over the roles' +*members cards (no ORDER BY, so
    // the store's id order).
    const anyoneSignedInId = await this.fetcher.codenames.id("anyone_signed_in");
    const membersId = await this.fetcher.codenames.id("members");
    let roleIds = partyRoles;
    if (membersId !== undefined) {
      const memberRoles = partyRoles.filter((id) => id !== anyoneSignedInId);
      const placeholders = memberRoles.map(() => "?").join(", ");
      const ordered =
        memberRoles.length === 0
          ? []
          : ((
              await this.fetcher.driver.query<{ left_id: number }>(
                `SELECT left_id FROM cards WHERE right_id = ? AND trash = 0 AND left_id IN (${placeholders}) ORDER BY id`,
                [membersId, ...memberRoles],
              )
            ).rows as Array<{ left_id: number }>).map((row) => Number(row.left_id));
      const rest = memberRoles.filter((id) => !ordered.includes(id));
      roleIds = [
        ...(anyoneSignedInId !== undefined && partyRoles.includes(anyoneSignedInId) ? [anyoneSignedInId] : []),
        ...ordered,
        ...rest,
      ];
    }
    const roles: string[] = [];
    for (const id of roleIds) {
      const role = await this.fetcher.fetchById(id, { skipVirtual: true });
      if (role?.name === undefined || role.name === null) return undefined;
      roles.push(role.name.s);
    }
    const sessionTypeId = await this.fetcher.codenames.id("session");
    if (sessionTypeId === undefined) return undefined;
    const sessionType = await this.fetcher.fetchById(sessionTypeId, { skipVirtual: true });
    const actorType =
      actor.typeId === undefined ? undefined : await this.fetcher.fetchById(actor.typeId, { skipVirtual: true });
    if (sessionType?.name == null || actorType?.name == null) return undefined;
    return {
      actorName: actor.name.s,
      actorTypeKey: actorType.name.key,
      sessionTypeId,
      sessionTypeName: sessionType.name.s,
      roles,
    };
  }

  /** RenderEngineLike.updateVerdictForCard — ok?(:update) on demand for the
   *  page head's universal_edit_button (perms: :update, card-mod-format
   *  set/all/html/head.rb:46). always_ok? short-circuits first
   *  (permissions.rb:140); otherwise the shared task-verdict machinery
   *  computes (and memoizes into taskVerdicts) the card's four task
   *  verdicts — the page head reuses whatever the render already computed.
   *  The pattern input rides through structurePatternInputForSync so the
   *  verdict walk's type_plus_right candidate anchors on the SAME
   *  leftTypeName the structure walk sees (class_methods.rb:58-72
   *  left_type: the LEFT card's type — on an Image card's +discussion
   *  page, an `image+discussion+*type plus right+*update` rule granting
   *  "Anyone" wins, where the type-less input anchored rich_text and
   *  denied). */
  async updateVerdictForCard(card: RenderCard): Promise<boolean | undefined> {
    if (this.readPermission?.alwaysOk) return true;
    if (this.readPermission === undefined) return undefined;
    if (card.id === undefined) return undefined;
    const memoized = this.taskVerdicts.get(card.key);
    if (memoized !== undefined) return memoized.update;
    if (this.taskState === undefined) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      this.taskState = viewTaskStateFromResults(results, this.readPermission);
    }
    const verdicts = await allTaskVerdictsForCard(
      this.fetcher,
      this.structurePatternInputForSync(card),
      this.taskState,
    );
    this.taskVerdicts.set(card.key, await this.applyUpdateOverride(card, verdicts));
    return this.taskVerdicts.get(card.key)?.update;
  }

  /** RenderEngineLike#peekNameForId: names from this engine's own fetch
   *  caches (the history prepare primes the card's creator), so a view
   *  never reads another engine's lexicon through the process-wide name
   *  environment. */
  peekNameForId(id: number): string | undefined {
    return this.fetcher.peekNameForId(id);
  }

  /**
   * RenderEngineLike#canConfigure — the cardtype.rb:68-70 can_configure?
   * predicate (`Card.fetch(card, :type, :structure, new: {}).ok? :update`):
   * the update-ok verdict on the card's *structure rule card, precomputed
   * by ensureConfigureVerdict. undefined = unverifiable (same allow
   * contract as taskAllowed).
   */
  canConfigure(card: RenderCard): boolean | undefined {
    if (this.readPermission?.alwaysOk) return true;
    return this.configureVerdicts.get(card.key);
  }

  /**
   * Precompute the can_configure? verdict for every card this render seats
   * whose content reaches configure_button: the page's main card and every
   * nested card (a cardtype listed on the Cardtype page, a cardtype nested
   * in a tag structure). Ruby evaluates the view's `perms: :can_configure?`
   * on each card the view renders for, so the verdict is per card:
   * `Card.fetch(card, :type, :structure, new: {}).ok? :update`
   * (card-mod-format set/type/cardtype.rb:57-59), the update verdict on
   * `<card>+*type+*structure`. A card qualifies when its own content or
   * its winning *structure rule's template nests configure_button (the
   * `Cardtype+*type+*structure` rule and the cardtype cards that store
   * the same template). Memoized per card key and per rule name; the rule
   * universe is cached per driver, so after the first verdict each one is
   * a lookup. Engines whose viewer is always-ok skip all of it.
   */
  async ensureConfigureVerdict(record?: CardRecord): Promise<void> {
    if (this.readPermission === undefined) return;
    if (this.readPermission.alwaysOk) return;
    const universe = this.structureContents;
    const rootKey =
      record === undefined
        ? undefined
        : (record.key ?? (record.name ? DeckoName.parse(record.name).key : undefined));
    const hosts: RenderCard[] = [];
    const consider = (card: RenderCard | undefined): void => {
      if (card === undefined || this.configureVerdicts.has(card.key)) return;
      if (this.configureChecked.has(card.key) || hosts.includes(card)) return;
      let nests = card.dbContent.includes("configure_button");
      if (!nests && universe !== undefined && universe.size > 0) {
        const resolved = resolveStructuredContent(this.structurePatternInputForSync(card), universe);
        nests = resolved !== undefined && resolved.templateContent.includes("configure_button");
      }
      if (nests) hosts.push(card);
      else this.configureChecked.add(card.key);
    };
    if (rootKey !== undefined) consider(this.renderCards.get(rootKey));
    // SWEEP-SURFACE (renderSeats): the cards this render nests.
    for (const card of this.renderCards.values()) {
      if (this.renderSeats.has(card.key)) consider(card);
    }
    if (hosts.length === 0) return;
    if (this.taskState === undefined) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      this.taskState = viewTaskStateFromResults(results, this.readPermission);
    }
    const byRule = new Map<string, boolean | undefined>();
    for (const card of hosts) {
      const ruleName = `${card.name.s}+*type+*structure`;
      const ruleKey = DeckoName.parse(ruleName).key;
      if (!byRule.has(ruleKey)) {
        byRule.set(
          ruleKey,
          await taskVerdictForCard(this.fetcher, { name: ruleName }, "update", this.taskState),
        );
      }
      this.configureVerdicts.set(card.key, byRule.get(ruleKey));
    }
  }

  /** Prepares the non-read task verdicts when the requested view needs
   *  them: one batch for the who_can universe, then one candidate
   *  resolution per prepared card (memoized — warm renders stay at zero
   *  queries). Read/none-only renders skip entirely. */
  /** The comment_box gate's verdict half (views.ts commentBoxBaseView):
   *  the same task-verdict algebra ensureTaskVerdicts runs, scoped to the
   *  +discussion cards the render closure carries, WITHOUT the
   *  viewRequiresTask gate (the comment form renders inside :open /
   *  :content bodies whose top view never requests task verdicts, so the
   *  generic warm skips them entirely). Corpus input: the *update rule
   *  row on the discussion's own *self set (Sample_Card_098+
   *  discussion: left_id 9813's *update row, content "Anyone") is what
   *  the anonymous viewer's update rides - the same algebra
   *  allTaskVerdictsForCard already walks. */
  async ensureDiscussionUpdateVerdicts(page?: {
    cardName: string;
    view: string;
  }): Promise<void> {
    if (this.readPermission === undefined) return;
    // Closure gate: a render whose closure carries no +discussion card
    // must not pay the who_can batch - the junction-depth-closure /
    // render-engine / depth-sweep query-count gates pin the round-trip
    // shape, and the loop below would skip every card anyway.
    let hasDiscussionCard = false;
    // SWEEP-SURFACE (renderSeats): this render's seats carry the closure's
    // discussion cards (the page's own nests); a warm render's map walk
    // over residue only finds cascade seats to run rule ladders against.
    for (const card of this.renderCards.values()) {
      if (!this.renderSeats.has(card.key)) continue;
      if (card.id !== undefined && card.name.rightName?.key === "discussion") {
        hasDiscussionCard = true;
        break;
      }
    }
    if (!hasDiscussionCard && !this.isBoardDiscussionPage(page)) {
      return;
    }
    if (this.taskState === undefined) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      this.taskState = viewTaskStateFromResults(results, this.readPermission);
    }
    // THE BOARD PAGE'S PHANTOM DISCUSSION CHILD: the board view's engage_tab
    // nests `<main>+discussion` programmatically during the SYNC render
    // (card-mod-edit.ts engageTabView), so the child never seats before this
    // warm and the comment_box gate's taskAllowed(card, "create") read (the
    // comment.rb:46 perms :update arm on a new card) answered undefined —
    // no form where Ruby renders one. Ruby resolves the same chain at nest
    // time: the phantom is a new card (fetch new:{}, *all+*default types it
    // RichText), whose create verdict runs the _left inheritance (rule
    // all-plus "_left" -> the real left's :update rule — on the synthetic
    // deck Topic+*type+*update "Member", the live-probe verdicts). Seat the
    // child's create verdict from the same taskState the sweep below uses;
    // the sync nest then renders the seated verdict. Board-view pages only:
    // the engage_tab is the tab family's only discussion nest, so no other
    // page pays the batch.
    if (page !== undefined && this.isBoardDiscussionPage(page)) {
      await this.seatBoardPagePhantomDiscussionVerdict(page.cardName);
    }
    for (const card of this.renderCards.values()) {
      if (!this.renderSeats.has(card.key)) continue;
      if (this.taskVerdicts.has(card.key)) continue;
      if (card.name.rightName?.key !== "discussion") continue;
      if (card.id === undefined) {
        // A PHANTOM +discussion (the engage_tab's not-yet-existing child):
        // Ruby's perms :update on a new card consults the CREATE
        // permission (the board fixture's arms are the oracle: tova -
        // whose only grant is the *all+*create rule "Anyone Signed In" -
        // renders the comment form; anonymous, excluded by that rule,
        // renders the blank). Only the create field is stored: every
        // other consumer of this map keeps its undefined for a card with
        // no row.
        const verdicts = await allTaskVerdictsForCard(
          this.fetcher,
          this.structurePatternInputForSync(card),
          this.taskState,
        );
        this.taskVerdicts.set(card.key, {
          update: undefined,
          create: verdicts.create,
          delete: undefined,
        });
        continue;
      }
      this.taskVerdicts.set(
        card.key,
        await this.applyUpdateOverride(
          card,
          await allTaskVerdictsForCard(
            this.fetcher,
            this.structurePatternInputForSync(card),
            this.taskState,
          ),
        ),
      );
    }
  }

  /** The page-context arm of the discussion warm: the board view's engage
   *  tab is the only surface that nests the (usually absent) +discussion
   *  child of a real card. page.view "board" is that tab family's dispatch
   *  surface; a signed-out visitor renders no engage tab at all
   *  (tab_visibility show_engage? = card.real? && signed_in for this arm). */
  private isBoardDiscussionPage(page?: { cardName: string; view: string }): boolean {
    return (
      page !== undefined &&
      page.view === "board" &&
      page.cardName !== "" &&
      this.readPermission?.signedInActorId !== undefined
    );
  }

  /** The board page's `<main>+discussion` phantom's create verdict (the
   *  comment_box gate's read — see ensureDiscussionUpdateVerdicts' board
   *  arm above). The phantom input is the new-card shape the nest builds:
   *  *all+*default's type (newCardDefaultType) over the absolutized field
   *  name; the verdict walk is allTaskVerdictsForCard, whose create arm
   *  runs the _left inheritance through the real left's :update rule. */
  private async seatBoardPagePhantomDiscussionVerdict(cardName: string): Promise<void> {
    const name = DeckoName.parse(`${cardName}+discussion`);
    if (this.taskVerdicts.has(name.key)) return;
    if (this.renderCards.has(name.key)) return; // a seated card: the sweep owns it
    const defaulted = this.newCardDefaultType(name);
    const verdicts = await allTaskVerdictsForCard(
      this.fetcher,
      {
        name,
        isNew: true,
        ...(defaulted?.typeId !== undefined ? { typeId: defaulted.typeId } : {}),
        ...(defaulted?.typeName !== undefined ? { typeName: defaulted.typeName } : {}),
      },
      this.taskState!,
    );
    this.taskVerdicts.set(name.key, {
      update: undefined,
      delete: undefined,
      create: verdicts.create,
    });
  }

  private async ensureTaskVerdicts(view: string): Promise<void> {
    if (this.readPermission === undefined) return;
    if (!viewRequiresTask(view)) return;
    if (this.taskState === undefined) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      this.taskState = viewTaskStateFromResults(results, this.readPermission);
    }
    // SWEEP-SURFACE (renderSeats): task verdicts for this render's seats —
    // earlier renders' cards carry their verdicts already (the has-check
    // below would skip them; the cascade's seats would not).
    for (const card of this.renderCards.values()) {
      if (!this.renderSeats.has(card.key)) continue;
      if (card.id === undefined || this.taskVerdicts.has(card.key)) continue;
      const verdicts = await allTaskVerdictsForCard(
        this.fetcher,
        // same pattern input the structure walk uses (leftTypeName for the
        // type_plus_right anchor — class_methods.rb:58-72 left_type; the
        // bare 4-field input anchored every compound card's candidate on
        // the registry's RichText fallback). MERGE: censustail3's
        // input kept under perm-allow2's applyUpdateOverride layer below.
        this.structurePatternInputForSync(card),
        this.taskState,
      );
      this.taskVerdicts.set(card.key, await this.applyUpdateOverride(card, verdicts));
    }
  }

  /** The mod set-module ok_to_update? overrides (read-override.ts'
   *  updatePermissionOverride — right::account's own_account? clean-arm,
   *  the Abstract::AccountField chain through a +*account middle card,
   *  right::status's own-status deny, account_holder's self update) lay
   *  over the generic permit(:update) verdict exactly as Ruby's set
   *  modules shadow Set::All#ok_to_update? (permissions.rb:148). The
   *  page head's universal_edit_button (perms :update) consumes this —
   *  the oracle renders "Edit this page!" on the viewer's own account
   *  cards where the generic walk alone denies. */
  private async applyUpdateOverride(
    card: RenderCard,
    verdicts: { update: boolean | undefined; create: boolean | undefined; delete: boolean | undefined },
  ): Promise<{ update: boolean | undefined; create: boolean | undefined; delete: boolean | undefined }> {
    const override = await updatePermissionOverride(card.name, {
      viewerKey: await this.resolveViewerKey(),
      fetchByKey: (key) => this.fetcher.fetchByKey(key),
      fetchById: (cardId) => this.fetcher.fetchById(cardId),
    });
    return override === undefined ? verdicts : { ...verdicts, update: override };
  }

  /** auth/permissions.rb:18-26 Auth.createable_types — the sorted cardtype
   *  card names the viewer's create verdict admits:
   *
   *  1. the bot-scope cardtype search (`Card.search type: CardtypeID,
   *     not: {codename: ["in"] + Set.basket[:non_createable_types]}`) —
   *     one statement, basket codenames inline (the basket is the loaded
   *     mods' fixed registry: rules/setting+set, session, account/signup,
   *     bootstrap/bootswatch_skin, assets/group_remote, script+style local
   *     groups, core/mod — each push cited in card-mod-edit.ts);
   *  2. the per-type `Card.new(type: name).ok? :create` verdict — the REAL
   *     task-verdict algebra on a virtual new card (patternsForCard drops
   *     the Self pattern for new cards, so the candidates are
   *     `<Type>+*type+*create` then `*all+*create`, first resolved wins);
   *  3. `.sort` (Ruby String#sort, byte-wise).
   *
   *  Memoized per engine; fired by the prepare gate for the views whose
   *  body reaches it (the type editor's select). */
  private async ensureCreateableTypes(): Promise<void> {
    if (this.createableTypesCache !== undefined) return;
    this.createableTypesCache = [];
    if (this.readPermission === undefined) return;
    if (this.taskState === undefined) {
      const results = await this.fetcher.driver.batch(viewTaskPermissionStatements());
      this.taskState = viewTaskStateFromResults(results, this.readPermission);
    }
    const state = this.taskState;
    const [types] = await this.fetcher.driver.batch([{
      sql:
        `SELECT c.id AS id, c.name AS name FROM cards c ` +
        `WHERE c.type_id = ` +
        `  (SELECT id FROM cards WHERE codename = 'cardtype' AND trash = 0 ORDER BY id LIMIT 1) ` +
        `AND c.trash = 0 ` +
        `AND (c.codename IS NULL OR c.codename NOT IN (` +
        `  'mod', 'set', 'setting', 'signup', 'remote_manifest_group',` +
        `  'local_script_folder_group', 'local_script_manifest_group',` +
        `  'local_style_folder_group', 'local_style_manifest_group',` +
        `  'bootswatch_skin', 'session'))`,
      params: [],
    }]);
    const ok: string[] = [];
    for (const row of (types?.rows ?? []) as Array<{ id: number; name: string }>) {
      const verdict = await taskVerdictForCard(
        this.fetcher,
        { name: "", isNew: true, typeId: row.id, typeName: row.name },
        "create",
        state,
      );
      if (verdict === true) ok.push(row.name);
    }
    ok.sort();
    this.createableTypesCache = ok;
  }

  /** The sync read for the type-editor views (RenderFormat#createableTypes
   *  delegates here) — [] until the prepare gate ran ensureCreateableTypes. */
  createableTypes(): string[] {
    return this.createableTypesCache ?? [];
  }

  /** Pre-executed results for a Search core (card_list view). */
  executeSearch(fmt: RenderFormat): RenderCard[] {
    return this.searchResults.get(this.searchCacheKey(fmt.card)) ?? [];
  }

  /** The search-result caches' key: the card key, PLUS the focal request's
   *  search parameters when this card IS the focal card (search_params.rb —
   *  Ruby's search_with_params is per-request: the same *search card renders
   *  different results for different query[keyword]/offset params, and the
   *  engine-lifetime cache must not serve the home page's unfiltered warm
   *  to the params-carrying search request that follows it). Non-focal
   *  cards key bare (their results are params-independent). */
  private searchCacheKey(card: RenderCard): string {
    if (this.renderSearchFocalKey !== card.key || this.renderSearch === undefined) return card.key;
    return `${card.key}|${JSON.stringify({ v: this.renderSearch.vars ?? {}, o: this.renderSearch.offset ?? 0 })}`;
  }

  /** RenderEngineLike#searchResultPaging — the seated paging record for a
   *  rendered search (search-paging.ts header; undefined = not paged, the
   *  show_paging? == false case). */
  searchResultPaging(fmt: RenderFormat): SearchResultPaging | undefined {
    return this.searchResultPagingMap.get(this.searchCacheKey(fmt.card));
  }

  /** RenderEngineLike#searchKeyword — the request's search keyword
   *  (search_params.rb:32-34 search_keyword = term_param ||
   *  search_vars&.dig(:keyword); the port carries the query vars AND the
   *  term through the render params' search seam). term_param
   *  (search_params.rb:19-23 + search.rb:130-137 json override):
   *  present?(params[:term]) with the "+"-prefixed term prepended by
   *  params["main"] when present. Undefined for headless engines and
   *  requests without term/query[keyword] — the :results_for_keyword
   *  header's own present? guard. */
  searchKeyword(_card: RenderFormat["card"]): string | undefined {
    const term = this.renderSearch?.term;
    if (term !== undefined && term !== "") {
      // search.rb:133-136: `(term =~ /^\+/) && (main = params["main"]) ?
      // main + term : term` — the junction-tail term absolutized by the
      // main card param.
      const main = this.renderSearch?.main;
      return term.startsWith("+") && main !== undefined ? main + term : term;
    }
    const keyword = this.renderSearch?.vars?.["keyword"];
    return keyword !== undefined && keyword !== "" ? keyword : undefined;
  }

  /** RenderEngineLike#searchResultCount — the seated count of a rendered
   *  search whose cql returns a count (undefined for a list search). */
  searchResultCount(fmt: RenderFormat): number | undefined {
    return this.searchCountResults.get(this.searchCacheKey(fmt.card));
  }

  /** RenderEngineLike#historyRenderReader — the render-time history seam
   *  accessor the card-mod-history views read (undefined unless THIS
   *  render's view is one of HISTORY_SEAM_VIEWS; see render-seam.ts). */
  historyRenderReader(): HistoryRenderReader | undefined {
    return this.historyReader;
  }

  /** RenderEngineLike#updaterRenderReader — the render-time act-search
   *  seam accessor the :updated_by view reads (undefined unless THIS
   *  render's view is one of UPDATER_SEAM_VIEWS; see updater-seam.ts). */
  updaterRenderReader(): UpdaterRenderReader | undefined {
    return this.updaterReader;
  }

  /**
   * The act-search seam's prepare half: run the gem's own updater_of query
   * for the render root, READ-ONLY, then resolve each actor's NAME (the
   * lexicon/composed name `nest updater, view: :link` renders) and hand the
   * result to the sync :updated_by view as a memoized bundle. See
   * src/card/history/updater-seam.ts for the boundary + safety note.
   *
   * Query inventory (all SELECTs; the seam adds zero writes):
   * - updaterOf (the DISTINCT update-actor join - the port of the SQL the
   *   gem runs in history_board.rb:11);
   * - fetchById per actor, cache-first, for the name. A card with no stored
   *   name/key (a junction) is composed by the fetcher's lexicon exactly as
   *   Ruby's lex_to_name does.
   *
   * `card.id` is the guard Ruby writes first (`if card.id`,
   * history_board.rb:11): a NEW card has no id, so the search never runs
   * and the view body is empty.
   */
  private async prepareUpdaterRender(rootCard: RenderCard): Promise<UpdaterRenderReader> {
    const cardId = rootCard.id;
    if (cardId === undefined) return { rootCardId: undefined, updaters: [] };
    const rows = await updaterOf(this.fetcher.driver, cardId);
    const updaters: UpdaterCardInfo[] = [];
    for (const row of rows) {
      const id = Number(row.id);
      const record = await this.fetcher.fetchById(id);
      updaters.push({ cardId: id, name: record?.name?.s });
    }
    return { rootCardId: cardId, updaters };
  }

  /** RenderEngineLike#followRenderBundle — the render-time follow seam
   *  accessor the follow/account views read (undefined unless THIS
   *  render's view is one of FOLLOW_SEAM_VIEWS; see
   *  follow/follow-render-seam.ts). */
  followRenderBundle(): FollowRenderBundle | undefined {
    return this.followBundle;
  }

  /**
   * The history seam's prepare half: load, READ-ONLY, exactly the rows the
   * requested history view will read, then hand them to the sync view fns
   * as a memoized bundle. See src/card/history/render-seam.ts for the
   * boundary + safety design note.
   *
   * Query inventory (all through the tested card-mod-history readers, or
   * the same tables those readers own):
   * - historyCardIds + historyActs (the gem's history_acts walk, verdict-
   *   filtered per action card) - the revisions list;
   * - one IN-list SELECT per row table over the involved ids (card_actions
   *   by act, card_changes by action) - the act/action/changes rows;
   * - lastAct + lastAction (the current-act / act_from_context fallbacks);
   * - actionValue/actionPreviousValue per involved action for the three
   *   diffed fields (the sole-action synthesis stays in the tested readers);
   * - fetchById + enrichAndStore for every involved card (action cards,
   *   actors, types) so the views' subformat renders and name algebra ride
   *   the standard prepared-card machinery.
   */
  private async prepareHistoryRender(
    rootCard: RenderCard,
    params: HistoryRenderParams,
    source: "history" | "recent" = "history",
  ): Promise<HistoryRenderReader> {
    const driver = this.fetcher.driver;
    const cardId = rootCard.id;

    // Card::Auth.current_id: the viewer's actor id. Anonymous resolves
    // through the codename registry (Card::AnonymousID = Card[:anonymous].id
    // - the same card the read-permission parties list resolves).
    let currentUserId = -1;
    if (this.viewer.signedIn === true && this.viewer.actorId !== undefined) {
      currentUserId = this.viewer.actorId;
    } else {
      const anon = await driver.query<{ id: number }>(
        "SELECT id FROM cards WHERE codename = 'anonymous' LIMIT 1",
        [],
      );
      currentUserId = Number(anon.rows[0]?.id ?? -1);
    }

    const emptyReader: HistoryRenderReader = {
      params,
      rootCardId: cardId,
      currentUserId,
      acts: [],
      actsTotal: 0,
      cardLastAct: undefined,
      cardLastAction: undefined,
      actById: () => undefined,
      actionById: () => undefined,
      actionsOfAct: () => [],
      actionOn: () => undefined,
      actionsAffecting: () => [],
      approvedActions: (actions) => actions,
      actionCard: () => undefined,
      cardInfo: () => undefined,
      value: () => undefined,
      previousValue: () => undefined,
      typeNameForId: () => undefined,
      rootUpdateAllowed: this.taskAllowed(rootCard, "update"),
      changes: new Map(),
    };
    if (cardId === undefined) return emptyReader;

    // history_acts (acts.rb:2-4 -> act.rb:46-59): the reference-closure
    // walk. The viewable filter (the ok?(:read) / viewable_sql stand-in -
    // render-seam.ts note 4) applies AFTER the involved cards are enriched
    // and verdict-ed: act.rb:54-59's JOIN drops non-viewable ACTION rows
    // and an act with no surviving action drops from the DISTINCT - so the
    // raw acts load first, the family's cards enrich + judge, then the
    // at-least-one-viewable-action filter runs.
    //
    // The "recent" source (set/self/recent.rb:14-21 recent_acts) swaps the
    // per-card reference closure for the DECK-WIDE feed: every act with a
    // non-draft action on an existing card, id DESC, under limiting_scan
    // (the last 10k act ids). The viewable filter rides the same
    // verdict pass; clean_acts (act_listing.rb:59-63) drops below.
    const historyCardIdList = await historyCardIds(driver, cardId);
    const rawActs =
      source === "recent"
        ? await recentActs(driver)
        : await historyActs(driver, historyCardIdList, {
            currentUserId,
            withDrafts: true,
          });

    // The acts' actions + changes (one IN-list SELECT per table - the same
    // rows Act#actions and Action#all_changes read, batched).
    const actIds = rawActs.map((a) => a.id);
    const actions =
      actIds.length === 0
        ? ([] as HistoryActionRow[])
        : (
            await driver.query<HistoryActionRow>(
              `SELECT * FROM card_actions WHERE card_act_id IN (${actIds.map(() => "?").join(", ")}) ORDER BY id`,
              actIds,
            )
          ).rows;
    const actionIds = actions.map((a) => a.id);
    const changeRows: HistoryChangeRow[] = [];
    if (actionIds.length > 0) {
      const rows = await driver.query<{
        id: number;
        card_action_id: number;
        field: number;
        value: string | null;
      }>(
        `SELECT * FROM card_changes WHERE card_action_id IN (${actionIds.map(() => "?").join(", ")}) ORDER BY id`,
        actionIds,
      );
      for (const row of rows.rows) {
        const field = trackedFieldByIndex(Number(row.field));
        if (field === undefined) continue;
        changeRows.push({ cardActionId: Number(row.card_action_id), field, value: row.value });
      }
    }

    // The current-act chain (last.rb) - current_act? + act/action_from_context.
    const cardLastAct = await lastAct(driver, cardId);
    const cardLastAction = await lastAction(driver, cardId);

    // Involved cards: action cards + act primary cards + actors (+ their
    // types). fetchById is cache-first; enrichAndStore makes each a
    // prepared RenderCard so the views' subformat renders (the nested
    // :action_summary slot) ride the standard machinery.
    const involvedCardIds = new Set<number>();
    for (const action of actions) if (action.card_id !== null) involvedCardIds.add(Number(action.card_id));
    for (const act of rawActs) if (act.card_id !== null) involvedCardIds.add(Number(act.card_id));
    for (const act of rawActs) involvedCardIds.add(Number(act.actor_id));
    // The card's creator: the board's :creator_credit (history_board.rb:2-8)
    // names it, and nothing else on these views may have read it.
    if (rootCard.record.creatorId !== undefined) involvedCardIds.add(Number(rootCard.record.creatorId));
    const cardById = new Map<number, RenderCard>();
    const cardInfoById = new Map<number, HistoryActionCardInfo>();
    for (const id of involvedCardIds) {
      const record = await this.fetcher.fetchById(id);
      if (record === undefined || record.name === undefined) continue;
      const renderCard = await this.enrichAndStore(record);
      cardById.set(id, renderCard);
      cardInfoById.set(id, {
        cardId: id,
        name: renderCard.name.s,
        typeId: record.typeId ?? null,
        typeName: renderCard.typeName,
        renderCard,
      });
    }
    // The bootswatch-skin act warm (the action-summary assembly's
    // synchronous reads): a bootswatch_skin-typed action card's summary
    // renders through BootswatchSkin#content (card-mod-bootstrap
    // set/type/bootswatch_skin.rb:44-48, the four-part CONTENT_PARTS
    // assembly served by the content-override registry's type/
    // bootswatch_skin entry) — differ.rb:60-66 raw_view renders the card's
    // raw view, whose card.content is the ASSEMBLY, and the assembly's
    // fetchRenderCard reads (+*colors / +*variables / +*stylesheets / the
    // +parent pointer / the style: mods card) are cache-only. Nothing in a
    // history render's nest closure chases those rows, so warm the family
    // for each involved skin card — the same conditional-family shape as
    // the skin-page warm (a skin-typed ROOT warms +Image/+parent/the three
    // skin fields below). Cards that do not exist warm nothing.
    if (this.peekCodenameById !== undefined) {
      let styleModsWarmed = false;
      for (const renderCard of cardById.values()) {
        if (this.peekCodenameById(renderCard.typeId ?? -1) !== "bootswatch_skin") continue;
        const n = renderCard.name.s;
        await this.prepareItemForRender(`${n}+*colors`);
        await this.prepareItemForRender(`${n}+*variables`);
        await this.prepareItemForRender(`${n}+*stylesheets`);
        await this.prepareItemForRender(`${n}+parent`);
        if (!styleModsWarmed) {
          await this.prepareItemForRender("style: mods");
          styleModsWarmed = true;
        }
      }
    }

    // The value / previous-value projections (changes.rb readers - the
    // sole-action synthesis stays inside the tested functions).
    const valueCache = new Map<number, Map<string, string | number | boolean | null | undefined>>();
    const previousCache = new Map<number, Map<string, string | number | boolean | null | undefined>>();
    const diffFields = ["name", "type_id", "db_content"] as const;
    for (const action of actions) {
      for (const field of diffFields) {
        const value = await actionValue(driver, action, field);
        const previous = await actionPreviousValue(driver, action, field);
        let own = valueCache.get(action.id);
        if (own === undefined) valueCache.set(action.id, (own = new Map()));
        own.set(field, value);
        let ownPrev = previousCache.get(action.id);
        if (ownPrev === undefined) previousCache.set(action.id, (ownPrev = new Map()));
        ownPrev.set(field, previous);
      }
    }

    // Type names for the cardtype diff (create actions render
    // `<ins>RichText</ins>` - the TYPE card's name through the registry).
    const typeNames = new Map<number, string>();
    for (const id of involvedCardIds) {
      const info = cardInfoById.get(id);
      if (info?.typeId !== undefined && info.typeId !== null && !typeNames.has(info.typeId)) {
        const record = await this.fetcher.fetchById(info.typeId);
        if (record?.name !== undefined) typeNames.set(info.typeId, record.name.s);
      }
    }

    // The actions-by-act fold moved into finishHistoryReader (shared with
    // the deck-wide *recent source).

    // The verdict pass for the history family's involved cards, then the
    // act-level viewable filter (an act survives when at least one of its
    // actions' cards is readable - act.rb:54-59 DISTINCT semantics).
    // ensureVerdicts judges this render's SEATS only - and a warm engine
    // re-enriches held cards through enrichAndStore's early return WITHOUT
    // re-seating them (resetDerivedRenderState clears renderSeats and
    // deniedVerdicts together every render), so a deck-wide feed's act
    // cards can ride a missing verdict - which isDenied reads as ALLOWED.
    // Judge the family explicitly (the same input shape as the seat pass):
    // the *recent feed's oracle pins the shape twice over - the anonymous
    // *recent page must DROP the Shared Note 01/Contractor Note 01
    // +*self+*read rule acts (their rule cards' own read rule is
    // self-pointing, content "Anyone Signed In"/"Contractor" - not the
    // anonymous parties) and BACKFILL the window with the next-readable
    // acts (Report Index, Report 4).
    await this.ensureVerdicts();
    for (const [involvedId, renderCard] of cardById) {
      if (this.deniedVerdicts.has(involvedId)) continue;
      const allowed = await this.cardReadAllowed(
        renderCard.name,
        involvedId,
        renderCard.record.typeId,
        renderCard.typeName,
        renderCard.record.readRuleId,
      );
      this.deniedVerdicts.set(involvedId, allowed === false);
    }
    // clean_acts (act_listing.rb:59-63, applied by BOTH sources'
    // acts_for_accordion): drop acts whose primary card row is gone.
    const cleanActs = rawActs.filter(
      (act) => act.card_id !== null && cardInfoById.has(Number(act.card_id)),
    );
    // history_card_ids of the ROOT (the actions_affecting closure test).
    const rootHistoryIds = new Set(historyCardIdList);
    return this.finishHistoryReader(rootCard, params, currentUserId, {
      rawActs: cleanActs,
      actions,
      changeRows,
      cardInfoById,
      valueCache,
      previousCache,
      typeNames,
      cardLastAct,
      cardLastAction,
      rootHistoryIds,
    });
  }

  /** The reader construction both history sources share (the per-card
   *  history seam AND the deck-wide *recent feed - set/self/recent.rb).
   *  The act-level viewable filter runs here: an act survives when at
   *  least one of its actions' cards is readable (act.rb:54-59's DISTINCT
   *  semantics - Ruby's recent_acts/history_acts apply viewable_sql inside
   *  the SQL JOIN, so an act with no surviving action drops). */
  private async finishHistoryReader(
    rootCard: RenderCard,
    params: HistoryRenderParams,
    currentUserId: number,
    loaded: {
      rawActs: HistoryActRow[];
      actions: HistoryActionRow[];
      changeRows: HistoryChangeRow[];
      cardInfoById: Map<number, HistoryActionCardInfo>;
      valueCache: Map<number, Map<string, string | number | boolean | null | undefined>>;
      previousCache: Map<number, Map<string, string | number | boolean | null | undefined>>;
      typeNames: Map<number, string>;
      cardLastAct: HistoryActRow | undefined;
      cardLastAction: HistoryActionRow | undefined;
      rootHistoryIds: Set<number> | undefined;
    },
  ): Promise<HistoryRenderReader> {
    const cardId = rootCard.id;
    const {
      rawActs,
      actions,
      changeRows,
      cardInfoById,
      valueCache,
      previousCache,
      typeNames,
      cardLastAct,
      cardLastAction,
      rootHistoryIds,
    } = loaded;
    // Act#actions (act.rb:88-92, id order) — the fold both sources read.
    const actionsByActRaw = new Map<number, HistoryActionRow[]>();
    for (const action of actions) {
      if (action.card_act_id === null) continue;
      const actId = Number(action.card_act_id);
      const list = actionsByActRaw.get(actId);
      if (list === undefined) actionsByActRaw.set(actId, [action]);
      else list.push(action);
    }
    const acts = rawActs.filter((act) =>
      (actionsByActRaw.get(act.id) ?? []).some(
        (a) => a.card_id !== null && this.deniedVerdicts.get(Number(a.card_id)) !== true,
      ),
    );
    const actByIdMap = new Map<number, HistoryActRow>(acts.map((a) => [a.id, a]));
    const actionByIdMap = new Map<number, HistoryActionRow>(actions.map((a) => [a.id, a]));
    const changesByAction = new Map<number, HistoryChangeRow[]>();
    for (const change of changeRows) {
      const list = changesByAction.get(change.cardActionId);
      if (list === undefined) changesByAction.set(change.cardActionId, [change]);
      else list.push(change);
    }
    const readValue = (
      action: HistoryActionRow,
      field: "name" | "type_id" | "db_content" | "content" | "trash",
    ): string | number | boolean | null | undefined =>
      valueCache.get(action.id)?.get(field === "content" ? "db_content" : field);

    const readPrevious = (
      action: HistoryActionRow,
      field: "name" | "type_id" | "db_content" | "content" | "trash",
    ): string | number | boolean | null | undefined =>
      previousCache.get(action.id)?.get(field === "content" ? "db_content" : field);

    return {
      params,
      rootCardId: cardId,
      currentUserId,
      acts,
      actsTotal: acts.length,
      cardLastAct,
      cardLastAction,
      actById: (id) => actByIdMap.get(id),
      actionById: (id) => actionByIdMap.get(id),
      actionsOfAct: (actId) => actionsByActRaw.get(actId) ?? [],
      actionOn: (actId, onCardId) =>
        (actionsByActRaw.get(actId) ?? []).find((a) => a.card_id === onCardId && a.draft !== 1),
      actionsAffecting: (actId, affectingCardId) =>
        (actionsByActRaw.get(actId) ?? []).filter(
          (a) =>
            a.card_id === affectingCardId ||
            (a.card_id !== null && rootHistoryIds?.has(Number(a.card_id)) === true),
        ),
      approvedActions: (list) =>
        list.filter((a) => {
          if (a.card_id === null) return false; // `a.card&.ok? :read` - no card, dropped
          const info = cardInfoById.get(Number(a.card_id));
          if (info === undefined) return false; // card row gone (clean_acts/approved)
          return this.deniedVerdicts.get(Number(a.card_id)) !== true;
        }),
      actionCard: (a) => (a.card_id === null ? undefined : cardInfoById.get(Number(a.card_id))),
      cardInfo: (id) => cardInfoById.get(id),
      value: readValue,
      previousValue: readPrevious,
      typeNameForId: (typeId) => typeNames.get(typeId),
      rootUpdateAllowed: this.taskAllowed(rootCard, "update"),
      changes: changesByAction,
    };
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

  /** Synchronous codename -> id lookup (the same pre-folded codehash memo,
   *  Card::Codename.id). Consumed by the VirtualSearch family’s
   *  assign_type :search_type (render/format.ts buildUnknownNestCard). */
  peekIdByCodename(codename: string): number | undefined {
    return this.fetcher.codenames.peekId(codename);
  }

  /** Synchronous registered card NAME for a codenamed id (the codehash
   *  i2name map — codename.ts#peekRegisteredName). Consumed by the
   *  VirtualSearch family’s virtual-card typeName ("Search"). */
  peekRegisteredNameForId(id: number): string | undefined {
    return this.fetcher.codenames.peekRegisteredName(id);
  }

  /** The page head bytes per page root (seated by the page renderer when
   *  headContent builds the <head>; read by set/self/head.rb:17’s
   *  `nest root.card, view: :head` port — src/card/render/views.ts
   *  Self::Head core branch). Keyed by the page root’s card key; entries
   *  are the exact bytes the page’s own <head> carries, so the
   *  *all+*head-family CodeRay cores read the identical bytes Ruby’s head
   *  view renders. Cleared with the other per-deck render caches. */
  private pageHeadBytes = new Map<string, string>();
  seatPageHead(rootKey: string, bytes: string): void {
    this.pageHeadBytes.set(rootKey, bytes);
  }
  pageHeadBytesFor(rootKey: string): string | undefined {
    return this.pageHeadBytes.get(rootKey);
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

  /** Synchronous render-card lookup BY ID - the map is keyed by key;
   *  this walks it the same way findSettingCard does. The set-card Rules
   *  section's virtual rule cards resolve the DECK's type card at the
   *  corpus-pinned template id through this (virtual-rule-card.ts
   *  deckTypeCard): Ruby prints the type name/code of the deck's card at
   *  that id, so the virtual's TYPE- fragment and data-card-type-name
   *  read the SERVED deck's names (the sanitized corpus names
   *  codename-html card 50 "gwtx"). */
  findRenderCardById(id: number): RenderCard | undefined {
    for (const card of this.renderCards.values()) {
      if (card.id === id) return card;
    }
    return undefined;
  }

  /** card-mod-rules set/type/setting.rb#set_classes_with_rules + Ruby's
   *  `card.rules_for_set_class(klass)`: for a setting-type card (e.g.
   *  *read), walk every rule whose right part matches this setting and
   *  bucket by the LEFT pattern class. Each PatternSpec's patternCardName
   *  (*all, *all plus, *type, *right, *type plus right, *self — the ones a
   *  setting's children can carry) becomes one bucket, emitted in
   *  `Pattern.concrete.reverse` order (least-specific first: *all opens the
   *  page, *self closes it); `anchorless` mirrors whether the pattern
   *  carries an `anchor_name` override (the *all and *all_plus specs don't,
   *  so Ruby collapses those into a single full-name row; the anchored
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
      // Ruby's cql runs under the viewer's read rules — a read-denied
      // rule never reaches the row list (corpus 21805
      // "Sample Card 065+*type+*on create": its *read is
      // "Anyone Signed In" (rule 22283), so the oracle's *on create page
      // shows ONE *type-class bar although the row exists).
      if (this.isDenied(card)) continue;
      const leftKey = card.name.leftName?.key;
      if (leftKey === undefined) continue;
      // cql left: { type: SetID } — the left part is SET-typed (setting.rb
      // :47-51); Mod-typed lefts (the mod: X+*style junction family) are
      // not set rows and never bucket.
      const left = this.peekPrepared(leftKey);
      if (left === undefined || left.typeCode !== "set") continue;
      // p20-help-content: the ANCHORED classes bucket by the left's RIGHT
      // part (rules_for_set_class, setting.rb:51-53:
      // `cql[:left][:right_id] = set_class.pattern_id` for anchored
      // patterns) — the *type class's rules are "X+*type+<setting>"
      // cards whose left "X+*type" has *type as its right part. The old
      // exact-leftKey lookup only ever matched the ANCHORLESS classes
      // (left literally the pattern card, e.g. "*all").
      let bucketKey = leftKey;
      if (left.name.isCompound) {
        const leftRightKey = left.name.rightName?.key;
        if (leftRightKey !== undefined) bucketKey = leftRightKey;
      }
      const bucket = settingBuckets.get(bucketKey);
      if (bucket === undefined) {
        settingBuckets.set(bucketKey, [card]);
      } else {
        bucket.push(card);
      }
    }
    // card-mod-rules set/type/setting.rb:40-46 walks `Pattern.concrete.reverse`
    // — the LOOKUP order reversed, least-specific first — so a Setting page
    // opens with the *all section ("all cards") and closes with *self ("a
    // single card"). Two more subtleties of the Ruby shape:
    //
    //   • rules_for_set_class matches rows by set_class.pattern_id (the
    //     pattern CARD's id, setting.rb:51-53), so the deck's spelling of the
    //     pattern card's name cannot break the match. The port's buckets are
    //     keyed by card KEY (bucketKey above), so the lookup must use
    //     DeckoName's key of the pattern card name — not a raw lowercase —
    //     or the one pattern whose name keys differently (*all plus keys to
    //     "*all_plu") never matches and its section silently drops.
    //
    //   • rules_for_set_class sorts by %w[content name] (setting.rb:50) —
    //     SQL `ORDER BY db_content, key`. The corpus deck stores every rule
    //     junction name-less (cards.key IS NULL for all 503 junction rows),
    //     so the key tier never discriminates: NULLs sort first in SQLite
    //     ASC and the fully-tied tier falls to rowid — the same (content,
    //     id) shape the engine's search port pins as its standard
    //     tie-breaker (cql/sql.ts orderDirectivesOf). RenderCard.record.key
    //     cannot stand in for the column: composeCardRecord fills it with
    //     the COMPOSED key for junction rows, which would interleave rows
    //     Ruby leaves in rowid order (sidebar/api-key first-diff shape).
    const byteOrder = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);
    for (const klass of [...SETTING_CLASSES].reverse()) {
      const bucketKey = DeckoName.parse(klass.patternCardName).key;
      const rules = settingBuckets.get(bucketKey);
      if (rules === undefined || rules.length === 0) continue;
      rules.sort((a, b) => {
        const contentOrder = byteOrder(a.record.dbContent ?? "", b.record.dbContent ?? "");
        if (contentOrder !== 0) return contentOrder;
        return (a.id ?? 0) - (b.id ?? 0);
      });
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
    const right = this.peekPrepared(rightKey);
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
   *    and item_type_id returns nil (measured on a two-part name
   *    whose parts are both generated strings). The port has no such
   *    virtual card -> stop, no raise.
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
      // "cardtype") and for *right (right whose TYPE is a
      // cardtype whose own name is a generated string). The full Ruby's "right's TYPE is a
      // cardtype" check (peekNameForId(peekId(rightType.type_id)) ===
      // "cardtype") is more permissive and gates ~898 entries that the
      // corpus pins as BadQuery raises — Ruby gates only the codename'd
      // cardtype card (right.type_code == "cardtype"), which is the
      // peekNameForId check below. Keep the original check; the C1 fix
      // attempt lives on in tests/card/render for future repair.
      const rightKey = card.name.rightName?.key;
      const right = rightKey !== undefined ? this.peekPrepared(rightKey) : undefined;
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
  /** the existing_rule_card memo for virtual rule cards — the sync
   *  half of the preloadVirtualRuleVerdicts resolution (editor.rb:119-131).
   *  True = a stored rule exists for this virtual's (set, setting); false =
   *  the prototype walk found none (Ruby's `voo.hide :bar_nav unless
   *  existing_rule_card` + the one-line mini_unknown gate read this).
   *  Undefined = the setting was never preloaded for this set card. */
  hasExistingRuleFor(key: string): boolean | undefined {
    if (this.existingRuleCards === undefined) return undefined;
    return this.existingRuleCards.has(key);
  }

  /** the resolved existing-rule CARD for a virtual rule card — the
   *  bar_right one-line content nests THIS card's :one_line_content through
   *  its own read verdict (rule_short_content, bar_view.rb:39-44), not the
   *  virtual's own. Undefined = no existing rule (or not preloaded). */
  existingRuleFor(key: string): RenderCard | undefined {
    return this.existingRuleCards?.get(key);
  }

  /** the PROTOTYPE pattern input for a set card — the port of
   *  set_prototype (set.rb:90-93 `Card.fetch prototype_args(anchor_name),
   *  new: prototype_args`) consumed by the existing-rule resolution above
   *  (editor.rb:126-130 existing_rule_from_prototype). Per pattern:
   *  - SELF: the anchor REAL card (prototype_args {name: anchor}) — its
   *    own candidate walk, SELF pattern included (isNew false).
   *  - TYPE: prototype_args {type: anchor} — a NAMELESS new card of the
   *    anchor type; only the TYPE + ALL candidates apply (blank name).
   *  - RIGHT: prototype_args {name: "*dummy+anchor"} — a new compound
   *    whose type rides the template chain (newCardDefaultType).
   *  - TYPE_PLUS_RIGHT: prototype_args {name: "*dummy+right"} typed by
   *    the same template chain (the supercard feeds only the TPR anchor's
   *    left_type).
   *  - ALL: nameless/untyped — only the ALL candidate applies.
   *  - ALL_PLUS/STAR/RSTAR/RULE: their prototype_args names ("+",
   *    "*dummy", "*dummy+*dummy", "*all+*create"), typed by the same
   *    template chain; star's simple *dummy skips compound-only *all plus
   *    in the *default walk → *all+*default's type; rstar's compound
   *    *dummy+*dummy lands on *all plus+*default.
   *  The undefined input (unknown pattern) skips the resolution; the
   *  renderer treats it as no-existing-rule (documented remainder). */
  private async prototypePatternInput(setCard: RenderCard): Promise<PatternCardInput | undefined> {
    const rightName = setCard.name.rightName;
    const codenameOf = async (name: string | undefined): Promise<string | undefined> => {
      if (name === undefined) return undefined;
      let card = this.fetchRenderCard(name);
      if (card === undefined) {
        const record = await this.fetcher.fetchByName(name);
        if (record !== undefined) card = await this.enrichAndStore(record);
      }
      const id = card?.id;
      return id !== undefined ? this.peekCodenameById(id) : undefined;
    };
    const patternCode =
      rightName !== undefined ? await codenameOf(rightName.s) : await codenameOf(setCard.name.s);
    const anchorName = setCard.name.leftName?.s;
    const fetchAnchor = async (): Promise<RenderCard | undefined> => {
      if (anchorName === undefined) return undefined;
      let real = this.fetchRenderCard(anchorName);
      if (real === undefined) {
        const record = await this.fetcher.fetchByName(anchorName);
        if (record !== undefined) real = await this.enrichAndStore(record);
      }
      return real;
    };
    switch (patternCode) {
      case "all":
        // 01_all.rb:9-11 prototype_args: {} — a nameless, typeless new card;
        // only the *all candidate applies.
        return { name: DeckoName.parse(""), id: undefined, typeId: undefined, typeName: undefined, isNew: true };
      case "all_plus":
      case "rstar":
      case "rule":
      case "star": {
        // Prototype_args per pattern file (card/mod/core/set_pattern/):
        // 02_all_plus.rb:11-13 {name: "+"}; 05_rstar.rb:11-13
        // {name: "*dummy+*dummy"}; 06_rule.rb:11-13 {name: "*all+*create"};
        // 04_star.rb:9-11 {name: "*dummy"}. The prior arm collapsed
        // star/rstar/all_plus into the NAMELESS prototype (only *all+X
        // candidates) — that shape contradicts both the Ruby walk and the
        // byte oracle: star's prototype *dummy is SIMPLE, so the *default
        // template walk skips compound-only *all plus (02_all_plus.rb:1
        // `@@options = { compound_only: true }`) and lands on *all+*default
        // (rule 28, BasicCs-typed) → the *read walk then hits
        // BasicCs+*type+*read (rule 22283, "Anyone Signed In") — the exact
        // *star read-row oracle bytes (shard 3, [Anyone_Signed_In] href)
        // the nameless walk missed with *all+*read "Anyone". rstar's
        // compound *dummy+*dummy lands on *all plus+*default (rule 17827,
        // RichText-typed) → the *default walk hits RichText+*type+*default
        // (rule 21450) — the "RichText : <em>empty</em>" row.
        // (Supersedes the bar-slots pass note: the *star rows do NOT all
        // resolve at the *all+<setting> level — the read row resolves at
        // BasicCs+*type+*read through the typed prototype.)
        const protoName =
          patternCode === "all_plus"
            ? "+"
            : patternCode === "rstar"
              ? "*dummy+*dummy"
              : patternCode === "rule"
                ? "*all+*create"
                : "*dummy";
        const parsed = DeckoName.parse(protoName);
        // The prototype's TYPE rides the new-card template chain
        // (set/all/type.rb:58-80 type_id_from_template → mod/content
        // set/all/templating.rb:52-59 new_card_template: the *default rule
        // walk on the typeless prototype; no *structure rule intervenes on
        // any relevant set — checked 2026-10-02).
        const defaultType = this.newCardDefaultType(parsed);
        return {
          name: parsed,
          id: undefined,
          typeId: defaultType?.typeId,
          typeName: defaultType?.typeName,
          isNew: true,
        };
      }
      case "self": {
        const real = await fetchAnchor();
        if (real !== undefined && real.id !== undefined) {
          return { name: real.name, id: real.id, typeId: real.typeId, typeName: real.typeName, isNew: false };
        }
        return anchorName !== undefined
          ? { name: DeckoName.parse(anchorName), id: undefined, typeId: undefined, isNew: true }
          : undefined;
      }
      case "type": {
        const typeCard = await fetchAnchor();
        if (typeCard === undefined || typeCard.id === undefined) {
          return { name: DeckoName.parse(""), id: undefined, typeId: undefined, isNew: true };
        }
        return {
          name: DeckoName.parse(""),
          id: undefined,
          typeId: typeCard.id,
          typeName: typeCard.name,
          isNew: true,
        };
      }
      case "right": {
        if (anchorName === undefined) return undefined;
        const parsed = DeckoName.parse(`*dummy+${anchorName}`);
        // 07_right.rb:18-20 {name: "*dummy+anchor"}; the type rides the
        // template chain (type.rb:58-80): Recommendations+*right resolves
        // the anchor card's own type, putting its TYPE candidate
        // "<that type>+*type+*create" (whose content is a two-line
        // role list) ahead of *all plus+*create — the exact winner the
        // Recommendations+*right oracle pins (pointer-list [Administrator,
        // Team]). typeName MUST ride along: the type pattern's anchor name
        // reads it (03_type.rb:15-17 anchor_name = card.type_name) — a
        // typeId without typeName built the broken "+*type+*create"
        // candidate and the walk skipped the type candidate entirely (the
        // pre-fix inherit-perm divergence).
        const defaultType = this.newCardDefaultType(parsed);
        return {
          name: parsed,
          id: undefined,
          typeId: defaultType?.typeId,
          typeName: defaultType?.typeName,
          isNew: true,
        };
      }
      case "type_plus_right": {
        const leftName = setCard.name.leftName;
        const rightPart = leftName?.rightName?.s;
        const typeName = leftName?.leftName?.s;
        if (rightPart === undefined || typeName === undefined) return undefined;
        const parsed = DeckoName.parse(`*dummy+${rightPart}`);
        // 08_type_plus_right.rb:23-31 prototype_args {name: "+#{tag}",
        // supercard: Card.new(name: "*dummy", type: anchor.trunk_name)} — the
        // supercard feeds ONLY the TPR anchor's left_type (left_type(card) =
        // superleft&.type_name, base.rb class_methods); the prototype's OWN
        // type always runs ensure_type_id (type.rb:58-66
        // type_id_from_code || type_id_from_template) — the *default template
        // walk (newCardDefaultType), which for RichText+Recommendations
        // resolves the anchor card and puts its TYPE candidate
        // "<that type>+*type+*create" ([Administrator, Team]) ahead
        // of *all plus+*create — the oracle's create-row bytes for BOTH the
        // Recommendations+*right and RichText+Recommendations+*type plus
        // right set pages. The prior anchor-type stamp (RichText) built the
        // wrong prototype type and the walk fell through to *all plus+*create
        // ("_left" → inherit-perm).
        const defaultType = this.newCardDefaultType(parsed, typeName);
        return {
          name: parsed,
          id: undefined,
          typeId: defaultType?.typeId,
          typeName: defaultType?.typeName,
          leftTypeName: typeName,
          isNew: true,
        };
      }
      default:
        return undefined;
    }
  }

  /** set/rule SET membership — the port of set_pattern/06_rule.rb
   *  (`pattern_applies? card -> card.rule?`, lib/card/rule/all.rb:32-40):
   *  standard_rule? = the right part is a Setting AND the left part is a
   *  Set — NO part-count limit (the 2-part `*all+*autoname` and the 3-part
   *  `*captcha+*right+*autoname` are both rule cards). Gates the rule-bar
   *  behaviors: bar_view.rb:10's `_rule-item` class_up + category classes,
   *  bar_view.rb:2-3's three-column bar_cols (5,4,3) with bar_middle kept,
   *  and the bar_menu's new-card create/edit label split. The corpus's
   *  `mod: format+*style` (left "mod: format" is Mod-typed, NOT a Set) is
   *  NOT a rule card — the oracle pins its bar WITHOUT `_rule-item`
   *  (dual-$1view:style: mods:render:open). */
  cardMatchesRuleSet(card: RenderCard): boolean {
    const ids = this.ruleTypeIds;
    if (ids === undefined || ids.setting === undefined || ids.set === undefined) {
      return false;
    }
    if (!card.name.isCompound) return false;
    // rule? is standard_rule? OR preference? (all.rb:32-53). The preference
    // shape (`*all+*all+*follow`: trunk a Set, preferer a User or `*all`)
    // has a non-Set left, so the two-part check below misses it; the set
    // keys' RULE token is the computed rule? verdict (enrichAndStore's
    // fetching predicate) and decides it.
    if (card.setKeys.split(/\s+/).includes("RULE")) return true;
    const rightKey = card.name.rightName?.key;
    const leftKey = card.name.leftName?.key;
    if (rightKey === undefined || leftKey === undefined) return false;
    const rightRecord = this.peekPrepared(rightKey);
    const leftRecord = this.peekPrepared(leftKey);
    if (rightRecord === undefined || leftRecord === undefined) return false;
    return (
      rightRecord.record.typeId === ids.setting &&
      leftRecord.record.typeId === ids.set
    );
  }

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
    const rightRecord = this.peekPrepared(rightKey);
    const leftRecord = this.peekPrepared(leftKey);
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
  /** THE SWEEP SURFACE's closure half (renderSeats' doc): the keys this
   *  render's root closure reaches — closureWarm's BFS shape (nest-reference
   *  reachability over the render-card map), collecting instead of
   *  checking. Missing refs simply stop the walk down that branch (the cold
   *  path seats them and enrichAndStore puts them in renderSeats); the
   *  search-card gate is a warmth question, not reachability, and does not
   *  belong here. Memory-only, bounded by the closure the map holds. */
  private closureSurface(record: CardRecord): Set<string> {
    if (record.key === undefined || record.key === "") return new Set<string>();
    return this.closureSurfaceFromKey(record.key);
  }

  private closureSurfaceFromKey(rootKey: string): Set<string> {
    const surface = new Set<string>();
    if (!this.renderCards.has(rootKey)) return surface;
    const queue: string[] = [rootKey];
    while (queue.length > 0) {
      const key = queue.pop() as string;
      if (surface.has(key)) continue;
      const card = this.renderCards.get(key);
      if (card === undefined) continue;
      surface.add(key);
      for (const ref of this.cardReferenceKeys(card)) {
        if (this.structureRefMisses.has(ref)) continue;
        if (!surface.has(ref) && this.renderCards.has(ref)) queue.push(ref);
      }
    }
    return surface;
  }

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
      // p20-email-views: the Abstract::TestContext ladder's sync fetches
      // (views.ts testContextCardFor — `card.left.fetch(:test_context)
      // &.first_card`) need the +*test context junction and its first item
      // warm. A message card whose RECORD was side-primed by ANOTHER page's
      // closure (the parent email template page side-primes all its field
      // children) answers warm on the content-ref walk alone — the junction
      // sits in no content reference walk — so the prefetch prelude
      // (prefetch.ts, the same tag-key condition) would never run for the
      // message PAGES. Require the junction's key explicitly, symmetric
      // with the prelude.
      const tagKey =
        card.name !== undefined && card.name.isCompound
          ? DeckoName.parse(card.name.tag).key
          : undefined;
      if (
        (tagKey === "*html_message" || tagKey === "*text_message") &&
        card.name.leftName !== undefined
      ) {
        // The key keeps the star: "...+*test_context".
        const junctionKey = `${card.name.leftName.key}+*test_context`;
        const junction = this.renderCards.get(junctionKey);
        if (junction === undefined) return false;
        // The FIRST ITEM too (test_context.rb:17 `&.first_card`) — the same
        // plain-list-line shape the prefetch's follow-up statement warms.
        const firstItem = (junction.dbContent ?? "")
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line !== "");
        if (firstItem !== undefined && !this.renderCards.has(DeckoName.parse(firstItem).key)) {
          return false;
        }
      }
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
   *  Every non-underscore ref is ABSOLUTIZED against the card's
   *  own name (chunk/reference.rb referencing-card contract) — the same
   *  contextual resolution applyStructureContent's ref walk and the
   *  prefetch's record collect use. A card's `{{+image}}` checks
   *  `<card>+image` in the render-card map; the literal
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
   *  and later fetchById/fetchByName calls are cache hits. The staleness
   *  keeper answers FIRST: a row composed fresh from storage must not
   *  out-seat a pinned update_column staleness (the rename-referers oracle
   *  freezes the pre-rename bytes across the walk's own read — Ruby's
   *  cached card is what renders, and the pinned entry leaves only through
   *  the card's own expire). */
  private async cacheFetchedRecord(record: CardRecord): Promise<void> {
    if (record.key === undefined || record.key === "") return;
    const kept = this.fetcher.peekStaleCard(record.key);
    if (kept !== undefined) {
      await this.enrichAndStore(kept);
      return;
    }
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
    // computeIsRule answered undefined (ids not folded yet): the set keys
    // written below CANNOT carry the RULE token even for a stored rule card.
    // Record the card for the rule set-key repair (render() entry path) —
    // see setKeysPendingRuleTypes.
    if (name.isCompound && isRule === undefined) this.setKeysPendingRuleTypes.add(key);
    const card: RenderCard = {
      record,
      name,
      key,
      typeName,
      typeId,
      typeCode,
      id: record.id,
      dbContent: cardContent(record),
      // pattern/all.rb#patterns: a NEW card's safe_set_keys drops the SELF
      // token. record.isNew is false for every stored row (byte-neutral
      // there) and true for the fetch placeholders — the virtual-card hits
      // (the structured/missing children: ZQVT+legacy class) whose captured
      // slots read "ALL ALL_PLUS TYPE-<t> RIGHT-<r> TYPE_PLUS_RIGHT-<l>-<r>"
      // with no SELF.
      setKeys: safeSetKeys({
        name,
        typeId,
        typeName,
        leftTypeName,
        isRule,
        ...(record.isNew ? { isNew: true } : {}),
      }),
    };
    this.renderCards.set(key, card);
    if (record.id !== undefined) this.idsByKey.set(key, record.id);
    this.renderSeats.add(key);
    this.renderCardsGrewSinceClosure = true;
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
      // RELATIVE references resolve contextually here too (the referencing
      // card is the resolution context - the same semantics the sync nest
      // dispatch and prepareNestClosureSearches use). cardReferenceKeys
      // skips them, which is exactly the view-surface gap this loop closes:
      // children's content `<p>{{_self+*referred_to_by}}</p>` carries a
      // RELATIVE reference to its search card, so the search never joined
      // the walk, never pre-executed, and the dispatched card_list read
      // searchResults.get(key) ?? [] - the search-no-results bytes on the
      // graded children:open entry (probe-green3: -6186) where live renders
      // the two referer bars (corpus 30315 + 31591). Ruby has no such gap
      // to close: set/abstract/0_search/views.rb view :card_list calls
      // search_with_params INSIDE the view dispatch (see the
      // prepareNestClosureSearches doc's Ruby-parity note), so every
      // readable search the render will read executes before the bytes
      // complete - on every surface, not just the page surface.
      for (const ref of referencedNames(card.dbContent)) {
        // Other references were walked through cardReferenceKeys above; they
        // are resolved here only for the VirtualSearch family check below.
        const relative = ref.relative;
        const pipe = ref.name.indexOf("|");
        const base = pipe === -1 ? ref.name : ref.name.slice(0, pipe);
        let resolvedName: string;
        try {
          resolvedName = DeckoName.parse(base).absolute(card.name);
        } catch (err) {
          if (!relative) continue;
          if (err instanceof CodenameNotFoundError || err instanceof NameNotFoundError) continue;
          throw err;
        }
        if (resolvedName === undefined || resolvedName === "") continue;
        const refKey = DeckoName.parse(resolvedName).key;
        let refCard = this.renderCards.get(refKey);
        if (!relative) {
          if (refCard === undefined) {
            const items = await this.prepareVirtualFamilySearch(resolvedName);
            for (const item of items ?? []) {
              if (!visited.has(item.key)) queue.push(item.record);
            }
          }
          continue;
        }
        if (refCard === undefined) {
          // The contextually-resolved reference never joined the prepared
          // map - the VIRTUAL-card class: children+*referred_to_by is a
          // composed search card (the *referred to by codename's default
          // CQL), which no prefetch closure fetches because the only
          // reference to it was the relative one every earlier walk
          // skipped. Prepare it exactly like the sync nest dispatch would
          // (fetchByName resolves the virtual composition; enrichAndStore
          // joins the map), then walk it. The RESOLVED NAME goes in - not
          // the key: fetchByName(key) on a null-name junction row composes
          // from parts and can land a wrong-cased record in the prepared
          // map ahead of the nest dispatch's own correctly-cased fetch
          // (the Anyone Signed In Anonymous+*created bar regressed to
          // data-card-name "anonymous+*created" on exactly that).
          refCard = await this.prepareItemForRender(resolvedName);
        }
        if (refCard === undefined) {
          // No row and no structure: a VirtualSearch family card is still
          // known, and its results are what the nest renders.
          const items = await this.prepareVirtualFamilySearch(resolvedName);
          for (const item of items ?? []) {
            if (!visited.has(item.key)) queue.push(item.record);
          }
        }
        if (refCard !== undefined && !visited.has(refCard.key)) queue.push(refCard.record);
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
  /** The search statement's own limit — see searchCqlLimit below. */
  /** Resolves a codename to the key of the card holding it in this deck
   *  (the VirtualSearch family's Right-pattern match). */
  private codenameHolderKey = (codename: string): string | undefined => {
    const id = this.peekIdByCodename(codename);
    const holder = id !== undefined ? this.peekRegisteredNameForId(id) : undefined;
    return holder !== undefined ? DeckoName.parse(holder).key : undefined;
  };

  /**
   * Executes the search of a VirtualSearch family card that has no row
   * (`Topic+*type+by name`, `X+*refers to`, ...) and seats its results under
   * the name's key, where the sync nest dispatch's virtual card
   * (format.ts buildUnknownNestCard) reads them. Ruby runs this search
   * inside the card_list view (virtual_search.rb's cql_content over the
   * search views); the port hoists it into the prepare phase like every
   * other closure search. Returns the result items, or undefined when the
   * name is not a family member or is already seated.
   */
  private async prepareVirtualFamilySearch(resolvedName: string): Promise<RenderCard[] | undefined> {
    let name: DeckoName;
    try {
      name = DeckoName.parse(resolvedName);
    } catch {
      return undefined;
    }
    const cql = virtualSearchCqlFor(name, this.codenameHolderKey);
    if (cql === undefined) return undefined;
    const key = name.key;
    if (this.searchResults.has(key) || this.searchFailures.has(key)) return undefined;
    const items = await this.runSearch({ name, key, dbContent: cql } as RenderCard);
    this.searchResults.set(key, items);
    return items;
  }

  // -------------------------------------------------------------------------
  // card-mod-layout set/abstract/items/options_api.rb - the pointer/list
  // editors' options walk (the browser-journeys lane: the checkbox/radio/
  // select/multiselect editors read it through card-mod-list).
  // -------------------------------------------------------------------------

  /** options_card (options_api.rb:47-49):
   *  `rule_card(:content_options) || right_type_options || Card[:all]`,
   *  resolved against the prepared map. The rule arm resolves the SETTING
   *  BY CODENAME (lib/card/rule/cache.rb lookup_key keys the rule cache by
   *  `Codename[setting_id]`, so the candidates hang off the card HOLDING
   *  the content_options codename — the probe options-probe receipt: a
   *  deck rule card merely NAMED `+*options` without the codename is NOT
   *  found). The right-type arm fires only when the pointer's right card
   *  exists as a real Cardtype (options_api.rb:57-63 right_type?), naming
   *  the `[right, :type, :by name]` virtual search. The last arm is the
   *  *all set card. undefined = no chain member resolves (degenerate deck:
   *  no *all). */
  optionsCardSource(card: RenderCard):
    | { source: "rule"; card: RenderCard }
    | { source: "right-type"; name: string }
    | { source: "all"; card: RenderCard }
    | undefined {
    const settingId = this.peekIdByCodename("content_options");
    if (settingId !== undefined) {
      const settingName = this.peekRegisteredNameForId(settingId);
      if (settingName !== undefined) {
        const setting = DeckoName.parse(settingName);
        const input: PatternCardInput = {
          name: card.name.s,
          id: card.id,
          typeId: card.typeId,
          typeName: card.typeName,
        };
        if (card.name.isCompound) {
          const leftKey = card.name.leftName?.key;
          const left =
            leftKey !== undefined ? this.fetchRenderCard(leftKey) : undefined;
          input.leftTypeName = left?.typeName;
        }
        for (const candidate of ruleNamesForCard(input, setting.s)) {
          const record = this.fetchRenderCard(candidate);
          if (record === undefined || record.unknown === true) continue;
          if (this.isDenied(record)) continue; // ok?(:read) false
          return { source: "rule", card: record };
        }
      }
    }
    const rightName = card.name.rightName;
    if (rightName !== undefined) {
      const right = this.fetchRenderCard(rightName.key);
      if (
        right !== undefined &&
        right.unknown !== true &&
        right.typeCode === "cardtype"
      ) {
        return { source: "right-type", name: `${rightName.s}+*type+by name` };
      }
    }
    const all = this.fetchRenderCard("*all");
    if (all !== undefined && all.unknown !== true) {
      return { source: "all", card: all };
    }
    return undefined;
  }

  /** The options walk, seated in the async prepare phase (the sync editor
   *  views cannot query): whichever SEARCH/SET member the chain resolves
   *  to has its items seated exactly like prepareSearches seats a search
   *  (BadQuery seats an empty result plus the recorded failure); the
   *  right-type member is a virtual search (prepareVirtualFamilySearch).
   *  Literal (non-search) rule members need no seat — the sync walk reads
   *  their dbContent items directly. */
  private async ensurePointerEditorOptions(rootCard: RenderCard): Promise<void> {
    if (rootCard.unknown === true) return;
    if (rootCard.typeCode !== "pointer" && rootCard.typeCode !== "list") return;
    const source = this.optionsCardSource(rootCard);
    if (source === undefined) return;
    if (source.source === "right-type") {
      await this.prepareVirtualFamilySearch(source.name);
      return;
    }
    const typeCode = source.card.typeCode;
    if (typeCode !== "search" && typeCode !== "set") return;
    const key = source.card.key;
    if (this.searchResults.has(key) || this.searchFailures.has(key)) return;
    // Ruby's limit (options_api.rb:42,45 `o_card.try(:default_limit).to_i`):
    // the only chain member defining a card-level default_limit is the
    // *content_options rule card (card-mod-list set/right/content_options.rb:
    // 3-5, 50); the *all set answers none — 0, Ruby's unlimited.
    const limit = source.source === "rule" ? 50 : 0;
    try {
      const items = await this.runSearch(source.card, limit);
      this.searchResults.set(key, items);
    } catch (err) {
      if (!(err instanceof Error) || err.name !== BAD_QUERY_CLASS_NAME) throw err;
      this.searchFailures.set(key, err);
      this.searchResults.set(key, []);
    }
  }

  /** Seated search results by KEY (the options walk's read side; also the
   *  virtual searches prepareVirtualFamilySearch seated). undefined = not
   *  seated; [] = seated empty, including a seated BadQuery failure. */
  seatedSearchItems(key: string): RenderCard[] | undefined {
    return this.searchResults.get(key);
  }

  /** templating.rb:60-71 structure_rule_card + Card#structure, resolved
   *  SYNC against the boot's structure universe (resolveStructuredContent —
   *  the same walk the core-view substitution runs, "_self" included): the
   *  winning *structure rule's name and template content for this card;
   *  undefined when no rule applies. The card-mod-edit multi-card editor
   *  (multiCardEditor/multiCardEdit) reads this — the rule card itself is
   *  in no render closure on a new/edit page, so a fetchRenderCard walk
   *  misses it. */
  structureRuleForSync(
    card: PatternCardInput,
  ): { ruleName: string; content: string } | undefined {
    const resolved = resolveStructuredContent(
      card,
      this.structureContents ?? new Map(),
    );
    return resolved === undefined
      ? undefined
      : { ruleName: resolved.ruleName, content: resolved.templateContent };
  }

  /** options_hash (options_api.rb:4-6) as the [label, name] pairs the five
   *  list editors iterate: json_options? (options_api.rb:8-10) parses the
   *  JSON-typed options card's content (its own pairs); otherwise
   *  option_hash_from_names (options_api.rb:12-16) pairs every option_name
   *  with itself. option_names (options_api.rb:18-24) = (standard +
   *  selected).uniq — standard = the options card's item names
   *  (option_names_from_items, options_api.rb:40-45), selected = the
   *  pointer's own items. */
  optionsCardPairs(card: RenderCard): Array<[string, string]> {
    const source = this.optionsCardSource(card);
    let standard: string[];
    if (source === undefined) {
      standard = [];
    } else if (source.source === "right-type") {
      const key = DeckoName.parse(source.name).key;
      standard = (this.searchResults.get(key) ?? []).map((r) => r.name.s);
    } else {
      const opts = source.card;
      if (opts.typeCode === "json") {
        // json_options? arm (options_api.rb:33-34): the parsed hash's own
        // pairs, values the option names (standard_option_names reads
        // values.map(&:to_name)). A non-object parse is Ruby's
        // parse_content NoMethodError-equivalent: throw loudly.
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(opts.dbContent ?? ""));
        } catch {
          throw badQuery(String(opts.dbContent ?? ""));
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error(`options card ${opts.name.s} is not a JSON hash`);
        }
        return Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [
          k,
          String(v),
        ]);
      }
      if (opts.typeCode === "search" || opts.typeCode === "set") {
        standard = (this.searchResults.get(opts.key) ?? []).map((r) => r.name.s);
      } else {
        // Literal item names (item.rb:15-22, context: the options card's
        // own name — option_names_from_items passes context_name only for
        // the non-right-type host; the members reached here absolutize
        // against the options card itself).
        standard = rawItemStrings(opts.dbContent).map((item) =>
          DeckoName.parse(item.replace(/\[\[|\]\]/g, "").trim()).absoluteName(opts.name).s,
        );
      }
    }
    // selected (options_api.rb:19): the host card's own items. An empty
    // content yields NO items (Ruby's split discards them - rawItemStrings
    // keeps the trailing empty, the shared helper's JS-split model), so the
    // union never grows a phantom empty option.
    const selected = rawItemStrings(card.dbContent)
      .map((item) => item.replace(/\[\[|\]\]/g, "").trim())
      .filter((item) => item !== "")
      .map((item) => DeckoName.parse(item).absoluteName(card.name).s);
    const names: string[] = [];
    for (const name of [...standard, ...selected]) {
      if (!names.includes(name)) names.push(name); // options_api.rb:20 uniq
    }
    return names.map((name) => [name, name]);
  }

  private async runSearch(card: RenderCard, limitOverride?: number): Promise<RenderCard[]> {
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
    // Run#alter_results? (run.rb:116-118) reads the statement's OWN
    // prepend/append keys after the SQL has run — caller-facing keys the
    // parser preserves in statementExtras (ast.ts:129 "accepted but not
    // affecting SQL, for callers") and nothing ever consumed. Read here at
    // the result-shaping layer, exactly where Ruby's Run module applies them.
    const stmtHash = statement as Record<string, unknown>;
    const prependRaw = stmtHash["prepend"];
    const appendRaw = stmtHash["append"];
    const prepend = typeof prependRaw === "string" ? prependRaw : undefined;
    const append = typeof appendRaw === "string" ? appendRaw : undefined;
    const alterResults = prepend !== undefined || append !== undefined;
    // The html search view's paging limit (card-mod-search
    // set/abstract/0_search/search_params.rb:38-40 format :html
    // default_limit = Cardio.config.paging_limit || 20; cql_search.rb:85-87
    // card_content_limit = cql_hash&.dig(:limit)): the cql's own limit when
    // it declares one (0 = Ruby-truthy = unlimited), else 20. It rides the
    // statement like Ruby's search_params merge (cql_search.rb:70-74
    // standardized_query_args merges {limit:, offset:} ON TOP of the cql
    // hash — the cql's own offset is overridden to 0 headless). Searches
    // rendering <= 20 items are byte-unchanged (paging only renders when
    // limit < count); a search with more items now renders Ruby's first
    // page instead of the whole set.
    const cqlLimit = searchCqlLimit(statement as Record<string, unknown>);
    // limitOverride rides the pointer-editor options walk only
    // (ensurePointerEditorOptions): Ruby's option_names_from_items reads
    // `limit: o_card.try(:default_limit).to_i` (options_api.rb:42,45) — the
    // *content_options rule card is the only chain member that defines a
    // card-level default_limit (card-mod-list set/right/content_options.rb:
    // 3-5, 50); every other chain member (the type+by name virtual search,
    // the *all set) answers no method, so 0 — Ruby's unlimited. 0 deletes
    // the key (Ruby's limit_and_offset treats a 0/absent limit as
    // unbounded); undefined keeps the search-view default below.
    const limit =
      limitOverride === undefined ? (cqlLimit ?? 20) : limitOverride <= 0 ? 0 : limitOverride;
    if (limitOverride === undefined || limitOverride > 0) {
      (statement as Record<string, unknown>)["limit"] = limit;
    } else {
      delete (statement as Record<string, unknown>)["limit"];
    }
    // search_params.rb:12-18 + normalization.rb:57-65 — the request's query
    // vars substitute the cql's $var references (standardized_query_args
    // merges the vars), and the paging window rides the offset
    // (paging_params' offset; focal pages only, seated by the host). The
    // substituted MATCH then reproduces the upstream failure this deck
    // pins: the match value compiles through the adapter's match — which
    // raises for every non-PostgreSQL connection (active_record.rb:80-83,
    // the recorded keyword-search 500's raise site).
    const focalSearch =
      this.renderSearch !== undefined && this.renderSearchFocalKey === card.key
        ? this.renderSearch
        : undefined;
    const vars = focalSearch?.vars;
    for (const [key, value] of Object.entries(statement as Record<string, unknown>)) {
      const varMatch = /^\$(\w+)$/.exec(String(value));
      if (varMatch === null) continue;
      const varValue = vars?.[varMatch[1]];
      if (varValue === undefined || varValue === "") {
        // Ruby: the unresolved var normalizes to nil and the CONDITION
        // drops (normalization.rb:57-65 string_value_from_var → nil;
        // MatchAttributes#match `return unless val.present?`) — the search
        // runs unfiltered, never raising.
        delete (statement as Record<string, unknown>)[key];
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(varValue);
      } catch {
        parsed = varValue;
      }
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        // A var value that parses as a CQL hash nests into the statement
        // (the observed shape: query[keyword]={"type":"Memo"} narrows the
        // match to the type filter — the oracle's cql page 200s with the
        // filtered results where the plain-keyword searches 500).
        delete (statement as Record<string, unknown>)[key];
        Object.assign(statement as Record<string, unknown>, parsed);
      } else {
        (statement as Record<string, unknown>)[key] = String(parsed);
      }
    }
    if (
      typeof (statement as Record<string, unknown>)["match"] === "string" &&
      (statement as Record<string, unknown>)["match"] !== ""
    ) {
      // active_record.rb:80-83 (the SQLite adapter carries no match
      // override on this deck): the match compiles through
      // AbstractAdapter#match, which raises the uninterpolated
      // lib_exception_not_implemented i18n string — the reproduced
      // upstream failure the recorded keyword-search debug page pins.
      throw upstreamMatchError();
    }
    const searchOffset = focalSearch?.offset;
    if (searchOffset !== undefined && searchOffset > 0) {
      (statement as Record<string, unknown>)["offset"] = searchOffset;
    }
    let rows: CardsRow[];
    let records: Map<number, CardRecord>;
    let paging: SearchResultPaging | undefined;
    try {
      const queryOptions = {
        // The viewer's read-permission filter rides the SQL
        // (implicitConditions' `read_rule_id IN (...)` — cqlPermissionOptions
        // is the same seam the /api/query path uses, never a parallel
        // system). This is Ruby's ordering: Card::Query applies the current
        // user's read rules at the relation level (Where#
        // permission_conditions) BEFORE limit_and_offset closes the window,
        // so an unreadable card never occupies a result slot. The pre-fix
        // permissionless search let a denied card consume slot 2 of the
        // corpus news listing and pushed readable rank-11 out of the LIMIT 9
        // window entirely (trace tenth-item-trace.md bug 1).
        ...(await this.cqlPermissionOptions()),
        parse: {
          // The search runs in the search card's OWN name context (Ruby:
          // card-mod-search set/abstract/cql_search.rb passes `context: name`
          // to Card::Query — the same name the card was fetched under, so a
          // virtual *type plus right search nested on a host card carries the
          // HOST-specific junction name and `_left` absolutizes to the host).
          // Without it, root.context defaults to "" (AbstractQuery#context,
          // parser.ts opts.context ?? "") and every relative reference in the
          // statement (`refer_to: "_left"`, `_self`, `_right`, `_N`) resolves
          // against the blank context to the unresolvable-name sentinel — the
          // query returns zero rows even with every name key resolvable
          // (2026-09-25 a person card's +Item(s) Listing "0
          // results" defect 2; ParseOptions.context, src/cql/ast.ts).
          context: card.name.s,
          // sync resolver over the prefetched id map (module doc), falling
          // back to the deck lexicon — Ruby answers every CQL name->id
          // through Card::Lexicon (lib/card/query/value.rb#id_from_val ->
          // Card::Lexicon.id), whose deck-boot warm covers cards the render
          // walk never enriched: a search statement's own name arguments
          // ("Participant(s)", the "project" type) are not nest references,
          // so nothing in the page walk fetches them and idsByKey alone
          // misses them (staging "0 results" defect 1's second half).
          // peekId is the warm-cache sync mirror (src/card/fetch/lexicon.ts);
          // origins prime it at boot (vm-staging-server primeEngine step 3,
          // worker primeCqlNameResolver). Unknown names still return
          // undefined -> the parser's -999 sentinel, exactly as Ruby.
          // ensureCardId is Ruby's other half (card-1.110.0 lexicon.rb#
          // lex_to_id: cache-first WITH a synchronous SQL fallback): the
          // warm mirror cannot hold decks larger than the Temporary cache's
          // max_keys (temporary.rb#within_key_counts resets at 10_000 - the
          // 47k-card corpus deck resets it 10x during warmLexicon), so
          // executeQuery pre-resolves this statement's name strings through
          // the async db-fallback walk before the sync interpretation reads
          // them. Unknown names still sentinel to -999 exactly as before.
          ensureCardId: (nameish: string) => this.fetcher.lexicon.id(nameish),
          resolveCardId: (nameish: string) => {
            const key = DeckoName.parse(nameish).key;
            return this.idsByKey.get(key) ?? this.fetcher.lexicon.peekId(nameish);
          },
        },
      };
      const result = await executeQuery(
        this.fetcher.driver,
        statement as Record<string, unknown>,
        queryOptions,
      );
      if ("rows" in result) {
        rows = result.rows;
      } else {
        rows = [];
        this.searchCountResults.set(this.searchCacheKey(card), result.count);
      }
      rows = await this.canonicalizeDanglingSideRows(rows);
    // Transport chunking (the batching pattern from src/card/render/prefetch.ts
    // generalized to the search read path): every result row used to cost its own
    // fetchById point query here — the whole-deck probe measured 12,475
    // driver round trips for one 6,233-item page render, far past the
    // Workers free tier's 50-per-invocation subrequest cap. The rows now
    // ride readCardRowsByIdChunked (IN-list statements of 50 ids, grouped
    // into driver.batch calls of 20 statements — one subrequest per batch:
    // 7 batches for the probe) and compose + cache through the SAME
    // compose/enrich ladder the per-row fetch used (composeAndCacheSqlRows
    // keeps the real `SELECT *` field fidelity, so the composed record is
    // value-identical to the record the point-read ladder composed — same
    // rows, same order, same bytes). The loop below walks the CQL result in
    // order and consumes the composed records directly: its per-item
    // fetchById was removed with the chunked read itself (the lexicon
    // temporary cache's own Ruby-mirrored 10k-key reset wipes primed
    // entries mid-prefetch, so even primed lexicon entries could not serve
    // 6,233 per-item cache lookups — the records are already composed, and
    // re-fetching each would only re-query). canReadCard/enrichAndStore
    // semantics are unchanged.
    records = await this.prefetchSearchResultRows(rows);
      // The paging record (search-paging.ts header): show_paging?
      // (paging_views.rb:4-9) — fewer_results_than_limit? is false exactly
      // when the limited SQL list filled its window (rows.length >= limit;
      // the Ruby list IS the SQL list — the JS re-check below can only
      // shrink the RENDERED items, not Ruby's list length), and the nav
      // renders only when limit < count_with_params. The count query runs
      // only in that full-window case — small-set searches never pay it and
      // render byte-identically to the pre-paging port. The count statement
      // is the same statement with return: count — the engine's count path
      // ignores limit/offset the way Ruby's 0_search.rb:35-39 count args
      // (offset 0, limit 0) do.
      // show_paging? (paging_views.rb:4-9): false when limit < 1; false
      // when fewer_results_than_limit? — "offset 0 AND the limited result
      // list is not full" (paging.rb's fewer_results_than_limit?). An
      // offset BEYOND page 1 always shows the nav (Ruby: the nav renders
      // for every offset>0 page, even a short tail page).
      if (limit >= 1 && (rows.length >= limit || (searchOffset ?? 0) > 0)) {
        // Ruby builds this count from the card's cached cql hash after the
        // item search consumed its leading conjunctions
        // (src/cql/consumed-conjunctions.ts). The count query runs with the
        // window ZEROED unconditionally (0_search.rb:85-90 `count args={
        // offset: 0, limit: 0 }` — count overrides both whatever the
        // requested page) — the total always counts ALL matching cards.
        const countStatement = statementAfterFirstQuery(statement as Record<string, unknown>);
        delete countStatement["offset"];
        delete countStatement["limit"];
        const count = await executeCount(this.fetcher.driver, countStatement, queryOptions);
        // The record carries the REQUEST's offset (paging_params' offset —
        // the focal env_search_param), not the hardcoded 0: the nav's
        // current_page math renders the requested page's state (page 2's
        // « 1 2 » with 2 active and the "21 - 29 of 29" context).
        if (count > limit) paging = { limit, offset: searchOffset ?? 0, count };
      }
    } catch {
      return []; // search_error view is wave 3
    }
    const items: RenderCard[] = [];
    for (const row of rows) {
      // The transport-chunked prefetch composed every result row (from the
      // identical row bytes the per-row point reads used to return); a row
      // absent from the map had no non-trashed cards row — the exact case
      // the old fetchById returned undefined for.
      const record = records.get(row.id);
      if (record === undefined) continue;
      // Defense in depth (the listing slot AND the body must both deny):
      // the SQL filter excludes stored read_rule_id denials, but rows whose
      // verdict resolves through the live rule walk (read_rule_id-less rows,
      // rule walk deny) are invisible to it. Re-check through the SAME
      // verdict machinery the render gate reads (canReadCard memoizes into
      // deniedVerdicts, so ensureVerdicts' skip-if-set pass never
      // re-judges). A denied row never becomes an item, so the limit counts
      // post-filter — no denied placeholder, no backfill gap.
      if (!(await this.canReadCard(record))) continue;
      // Render-precondition guard, NOT permission: a row whose junction
      // name cannot compose (dangling side ids; no real corpus row — the
      // composition is lexicon-recursive and resolves every real junction)
      // has no name to render, link, or key a slot with. Ruby never
      // view-renders a nameless card (fetch returns nil); skipping mirrors
      // that instead of crashing the listing.
      if (record.name === undefined) continue;
      if (alterResults) {
        // Run#process_name/alter_result (run.rb:96-109): the result name is
        // Card::Name[[prepend, name, append].compact] and the RESULT CARD is
        // `Card.fetch altered_name, new: {}` (run.rb:100) — the real row when
        // one exists, the placeholder new card otherwise. The port rides the
        // FetchEngine's own fetch-new idiom (FetchOptions.new, results.rb
        // quick_renew), then resolves the NEW card's type through the same
        // *default template chain the nest path uses (type.rb:58-66
        // ensure_type_id -> type_id_from_template; newCardDefaultType) and
        // its content through the template's db_content (content/all.rb
        // 17-19 standard_content new_card branch; newCardDefaultContent).
        const parts = [prepend, record.name.s, append].filter(
          (p): p is string => p !== undefined,
        );
        const altered = DeckoName.parse(parts.join("+"));
        const fetched = await this.fetcher.fetchByName(altered, { new: {} });
        if (fetched !== undefined) {
          if (fetched.typeId === undefined) {
            // The *type plus right candidates anchor on the altered name's
            // LEFT card's type (set_pattern left_type). `Collection+Item`'s
            // `"append":"short"` lists `<item>+short`, whose template is
            // `Item+short+*type plus right+*structure` (HTML-typed); without
            // the left type the walk read the registry's RichText default,
            // missed it, and typed the virtual card RichText.
            const leftKey = altered.leftName?.key;
            const leftRecord =
              leftKey !== undefined && leftKey !== ""
                ? (await this.fetcher.fetchByName(leftKey)) ?? undefined
                : undefined;
            const leftTypeName =
              leftRecord !== undefined ? (await this.enrichAndStore(leftRecord)).typeName : undefined;
            const defaulted = this.newCardDefaultType(altered, leftTypeName);
            if (defaulted !== undefined) fetched.typeId = defaulted.typeId;
          }
          if (fetched.dbContent === undefined || fetched.dbContent === "") {
            const content = this.newCardDefaultContent(altered);
            if (content !== undefined && content !== "") fetched.dbContent = content;
          }
          items.push(await this.enrichAndStore(fetched));
          continue;
        }
      }
      const enriched = await this.enrichAndStore(record);
      items.push(enriched);
    }
    if (paging !== undefined) {
      this.searchResultPagingMap.set(this.searchCacheKey(card), paging);
    }
    return items;
  }

  /** card-mod-search set/self/search.rb — the :search_box_complete view's
   *  data seat (the sync ViewFn reads it through
   *  RenderEngineLike#searchBoxCompleteSeat).
   *
   *  term = search_keyword (search_params.rb:32-34, via searchKeyword —
   *  term_param || vars.keyword). exact = Card.fetch(term, new: {})
   *  (:102 — the REAL row when the term names one, the fabricated new card
   *  otherwise; permission-blind like every fetch). The goto names run the
   *  complete search (:117-119 map_goto_items -> :73-75
   *  complete_or_match_search with start_only: match_start_only? — the
   *  railtie default TRUE (lib/card/mod/search.rb:3
   *  search_box_match_start_only), so the match half never fires):
   *  complete_search(limit: AUTOCOMPLETE_LIMIT = 8, 0_search.rb:4) is
   *  `card.search({limit: 8, sort_by: "name", return: "name",
   *  complete: term_param.to_s})` — standardized_query_args
   *  (cql_search.rb:70-74) merges the *search card's OWN cql UNDER those
   *  args, and the card's "$keyword" var stays UNRESOLVED (no vars ride
   *  Card#search — the request-var merge lives in the format layer's
   *  search_with_params, which this view bypasses) → normalization
   *  string_value_from_var "" → the match condition drops. ORDER BY:
   *  sort_by ("name" -> key) shadows the card's own `sort: "relevance"`
   *  (sorting.rb:70 `@mods[:sort_by] || @mods[:sort]` — the same
   *  precedence sql.ts#orderDirectivesOf renders).
   *  map_goto_items (:120-121) unshifts the exact name when the card is
   *  known (go_to_exact_match? = exact.known?); uniq keeps it first.
   *
   *  The read-permission filter rides the same cqlPermissionOptions seam
   *  runSearch uses (Ruby's Query applies the viewer's read rules at the
   *  relation level, before the limit closes the window); the exact-card
   *  fetch is permission-blind (Ruby's Card.fetch), so a known-but-denied
   *  exact name still unshifts — its label view renders the denial shape
   *  exactly as Ruby's render_goto_autocomplete_item would.
   *
   *  A broken *search cql does NOT throw here: Ruby's raise site is inside
   *  the VIEW body (each_search_box_item -> map_goto_items -> complete_or_match_search
   *  -> card.search -> parse_json_cql), where wrap_and_render rescues it to
   *  the quiet render-error span. The seat carries the failure message; the
   *  ViewFn raises it inside the dispatch's own rescue scope. */
  private async prepareSearchBoxComplete(rootCard: RenderCard): Promise<void> {
    const term = this.searchKeyword(rootCard);
    let exact: RenderCard | undefined;
    let exactKnown = false;
    if (term !== undefined) {
      // Card.fetch(term, new: {}): the real row when one exists, the
      // fabricated new card otherwise (fetch.rb new-card idiom). The fetch
      // is permission-blind. A VIRTUAL resolution (a virtual-family name:
      // "X+*type+by name" et al) is neither: Ruby's exact.known? is false
      // (no row) and exact.virtual? true, so add_autocomplete_ok? dies on
      // its !virtual? guard (autocomplete.rb:39) and only the goto unshift
      // could care (it doesn't — known? false). The fabricated card seats
      // only when the name is neither row nor virtual.
      const real = await this.fetcher.fetchByName(term, { skipVirtual: true });
      if (real !== undefined && real.id !== undefined) {
        exactKnown = true;
        exact = await this.enrichAndStore(real);
      } else if (
        virtualSearchCqlFor(DeckoName.parse(term), this.codenameHolderKey) === undefined
      ) {
        const fabricated = await this.fetcher.fetchByName(term, { new: {} });
        if (fabricated !== undefined) exact = await this.enrichAndStore(fabricated);
      }
    }
    const goto: RenderCard[] = [];
    let failure: string | undefined;
    // cql_search.rb:29-38 parse_json_cql — the same BadQuery shapes the
    // runSearch seat records ("" content / unparseable JSON / non-Hash parse
    // result crashes Ruby unrescued at cql_search.rb:11 symbolize_keys —
    // plain Error here).
    let statement: Record<string, unknown> = {};
    let statementBroken: string | undefined;
    try {
      const parsed: unknown = JSON.parse(rootCard.dbContent ?? "");
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        // The non-Hash parse result: runSearch's graded posture returns the
        // empty list (the corpus pins [] there, not the Ruby NoMethodError
        // crash) — the goto arm stays empty the same way.
        statement = {};
      } else {
        statement = { ...(parsed as Record<string, unknown>) };
      }
    } catch (e) {
      statementBroken =
        rootCard.dbContent === ""
          ? "can't run search with empty content"
          : `Invalid JSON search query: ${rootCard.dbContent ?? ""}`;
    }
    if (statementBroken !== undefined) {
      this.searchBoxCompleteData = {
        term,
        exact,
        exactKnown,
        goto,
        failure: statementBroken,
      };
      return;
    }
    // name_cql(8).merge(complete_cql) (0_search/views.rb:70-73) ON TOP of
    // the card's cql hash (cql_search.rb:71 standardized_query_args).
    statement["limit"] = 8;
    statement["sort_by"] = "name";
    statement["return"] = "name";
    statement["complete"] = term ?? "";
    try {
      const result = await executeQuery(this.fetcher.driver, statement, {
        ...(await this.cqlPermissionOptions()),
        parse: {
          context: rootCard.name.s, // cql_search.rb:72 args[:context] ||= name
          ensureCardId: (nameish: string) => this.fetcher.lexicon.id(nameish),
          resolveCardId: (nameish: string) => {
            const key = DeckoName.parse(nameish).key;
            return this.idsByKey.get(key) ?? this.fetcher.lexicon.peekId(nameish);
          },
        },
      });
      if (!("rows" in result)) {
        this.searchBoxCompleteData = { term, exact, exactKnown, goto, failure };
        return;
      }
      // The composed records (junction names compose from their sides, the
      // same ladder runSearch rides) + the verdict re-check the search
      // results walk applies: the SQL filter excludes stored read_rule_id
      // denials, live-rule-walk rows re-judge through canReadCard.
      const records = await this.prefetchSearchResultRows(result.rows);
      const seenKeys = new Set<string>();
      for (const row of result.rows) {
        const record = records.get(row.id);
        if (record === undefined) continue;
        if (!(await this.canReadCard(record))) continue;
        if (record.name === undefined) continue;
        const enriched = await this.enrichAndStore(record);
        if (seenKeys.has(enriched.key)) continue;
        seenKeys.add(enriched.key);
        goto.push(enriched);
      }
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }
    this.searchBoxCompleteData = { term, exact, exactKnown, goto, failure };
  }

  /** RenderEngineLike#searchBoxCompleteSeat — the :search_box_complete
   *  view's prepared data (undefined = this render never prepared it — the
   *  view dispatch on a seatless render is a port defect, loud). */
  searchBoxCompleteSeat(_card: RenderFormat["card"]): SearchBoxCompleteSeat | undefined {
    return this.searchBoxCompleteData;
  }

  /** The search read path's transport-chunked prefetch (see the runSearch
   *  call site for the mechanism + baseline numbers). Collects the id set
   *  the result walk can touch — each CQL row's card, its TYPE row (the
   *  enrichment's typeRecord fetch), and junction SIDE rows (name
   *  composition + enrichAndStore's left-card fetch) — reads them all
   *  through readCardRowsByIdChunked, and composes + caches the fetched
   *  rows through the shared ladder (fetch cache via cacheFetchedRecord,
   *  which also enriches into renderCards). Returns the composed records
   *  keyed by id: the runSearch loop consumes them directly (same values
   *  the old per-row fetchById composed, from the identical row bytes) so
   *  the walk costs zero per-item queries even when the lexicon
   *  temporary cache's Ruby-mirrored 10k-key reset — which fires at
   *  whole-deck scale DURING the priming writes — wipes the primed
   *  lexicon entries behind it. Rows with no non-trashed cards row
   *  (trashed/absent ids) are absent from the map, the exact case the
   *  point-read ladder answered undefined. */
  /** Live rows whose junction side id points at no cards row still compose
   *  their names  with the EMPTY part (lexicon.ts#lexToName; lexicon.rb:
   *  11-15 + name/all.rb:16-18)  so several such rows can share ONE
   *  composed name. The corpus's only collision class: cards 375/377/389
   *  (lefts 374/376/388 absent, right *default) all compose "+*default"
   *  (junction pair-uniqueness makes dangling-side compositions the only
   *  collision source). Ruby's listing renders the shared name under its
   *  lowest-id card  the Phrase page oracle pins card 375 (data-card-id=
   *  "375", type List) for the row the engine's own search matches as 389.
   *  This map holds row id -> canonical (lowest-id) row id for the dangling
   *  class, built once per engine from one statement; engines that never
   *  meet a dangling row pay nothing. The swap runs BEFORE the prefetch so
   *  the shared name-key seats the canonical record (enrichAndStore's
   *  existing-key guard would otherwise pin whichever row composed first). */
  private danglingSideRowCanonical: Map<number, number> | undefined;

  private async danglingSideRowCanonicalMap(): Promise<Map<number, number>> {
    if (this.danglingSideRowCanonical !== undefined) {
      return this.danglingSideRowCanonical;
    }
    const result = await this.fetcher.driver.query<CardsRow>(
      "SELECT c.* FROM cards c WHERE c.trash = 0 AND c.left_id IS NOT NULL AND " +
        "(NOT EXISTS (SELECT 1 FROM cards l WHERE l.id = c.left_id) OR " +
        " NOT EXISTS (SELECT 1 FROM cards r WHERE r.id = c.right_id))",
      [],
    );
    const names = new Map<string, number>();
    const remap = new Map<number, number>();
    for (const row of result.rows) {
      const record = await composeCardRecord(row, this.fetcher.lexicon);
      if (record.name === undefined) continue;
      const key = record.name.key;
      const current = names.get(key);
      if (current === undefined || row.id < current) {
        names.set(key, row.id);
      }
    }
    for (const row of result.rows) {
      const record = await composeCardRecord(row, this.fetcher.lexicon);
      if (record.name === undefined) continue;
      const canonicalId = names.get(record.name.key);
      if (canonicalId !== undefined) remap.set(row.id, canonicalId);
    }
    this.danglingSideRowCanonical = remap;
    return remap;
  }

  /** Swap every search-result row that belongs to the dangling-side
   *  collision class for its canonical (lowest-id) row's bytes, before the
   *  prefetch composes and seats them (see danglingSideRowCanonical). */
  private async canonicalizeDanglingSideRows(rows: CardsRow[]): Promise<CardsRow[]> {
    if (rows.length === 0) return rows;
    // junction-less results can never meet the collision class - keep the
    // remap build (one statement, memoized per engine) off such searches
    if (!rows.some((r) => r.left_id !== null && r.left_id !== undefined)) {
      return rows;
    }
    const remap = await this.danglingSideRowCanonicalMap();
    if (remap.size === 0) return rows;
    let swapped = false;
    const canonicalRows = new Map<number, CardsRow>();
    const out: CardsRow[] = [];
    for (const row of rows) {
      const canonicalId = remap.get(row.id);
      if (canonicalId === undefined || canonicalId === row.id) {
        out.push(row);
        continue;
      }
      let canonicalRow = canonicalRows.get(canonicalId);
      if (canonicalRow === undefined) {
        const fetched = await this.fetcher.driver.query<CardsRow>(
          "SELECT * FROM cards WHERE id = ? AND trash = 0",
          [canonicalId],
        );
        canonicalRow = fetched.rows[0];
        if (canonicalRow === undefined) {
          canonicalRows.set(canonicalId, row);
          out.push(row);
          continue;
        }
        canonicalRows.set(canonicalId, canonicalRow);
      }
      out.push(canonicalRow);
      swapped = true;
    }
    return swapped ? out : rows;
  }

  private async prefetchSearchResultRows(rows: CardsRow[]): Promise<Map<number, CardRecord>> {
    const records = new Map<number, CardRecord>();
    if (rows.length === 0) return records;
    const ids: number[] = [];
    const seen = new Set<number>();
    const pushId = (id: number | null | undefined): void => {
      if (id === null || id === undefined || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    };
    for (const row of rows) {
      pushId(row.id);
      pushId(row.type_id);
      pushId(row.left_id);
      pushId(row.right_id);
    }
    const fetched = await readCardRowsByIdChunked(this.fetcher.driver, ids);
    if (fetched.length === 0) return records;
    const ctx: PrefetchContext = {
      driver: this.fetcher.driver,
      lexicon: this.fetcher.lexicon,
      writeToCache: (record) => this.fetcher.writeToCache(record),
      cacheRecord: (record) => this.cacheFetchedRecord(record),
    };
    const composed = await composeAndCacheSqlRows(fetched, ctx);
    for (const record of composed) {
      if (record.id !== undefined) records.set(record.id, record);
    }
    return records;
  }
}
