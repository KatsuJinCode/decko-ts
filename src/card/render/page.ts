// The page renderer: TypeScript port of the html-format show path —
// `card.format(:html).show(nil, {})` through show_with_page_layout — the
// live-serving page assembly the bare view-function renderer does not do.
//
// Truth source (pinned gems + the 2026-09-25 dual-lane page capture):
// - card-mod-layout set/all/process_layout.rb#show_with_page_layout:
//     main! -> page_layout (per-card *layout rule via rule_card(:layout)
//     -> first_name; nil -> the :default CODE layout) -> Layout.main_nest_opts
//     (the {{_main|view}} chunk of the layout card names the main view) ->
//     render! (main render, main: true + main_view: true + layout opts) ->
//     wrap_with_card_layout (the layout card's content processed through the
//     page's own format, {{_main}} replaced by wrap_main { main.rendered }).
// - card-mod-format set/all/html/show.rb: show wraps the layout output with
//     the :html_page wrapper (`<!DOCTYPE HTML>` + <head> + interior).
// - card-mod-format set/all/html/head.rb view :head: page_title_tag,
//     meta_tags, favicon_tag, stylesheet_tags, universal_edit_button (""),
//     rss_links (nil), javascript_tags, script_variables, script_calls.
// - card-mod-layout lib/card/layout/{card_layout,code_layout,unknown_layout}.rb:
//     layout classification (card / built-in code / unknown). Unknown layouts
//     raise Card::Error::UserError "unknown layout card: <key>" from
//     wrapper.rb#raise_wrap_error (voo.layout.to_name.key) — AFTER the main
//     render (the raise site is wrap_with_wrapper).
// - card-1.110.0 lib/card/format/error.rb: production error semantics
//     (raise_all_rendering_errors=false): nested view errors render the quiet
//     `render-error alert alert-danger` span (UserError messages verbatim,
//     else the lib_error_rendering locale line); focal (main) errors re-raise.
//
// Preparation reuse: the main render runs through RenderEngine.render() (the
// exact prepare sequence + parse gates the bare view path exercises —
// permission state, structure universe, search preparation, pointer/set
// preloads), then the page assembles from the warm maps. One throwaway bare
// render per cold page buys a minimal render.ts diff (the only render.ts
// hunk is the renderPage method itself).
//
// Production-vs-capture environment deltas this module pins (the five
// production-equivalent settings): default_html_view = :content on the
// page path only (the bare view path keeps the development default
// :titled), deck_origin https://culturesmith.com, and carrierwave cloud
// attachments resolving to the absolute bucket URL. The captured page
// JSONL bytes are the contract; every template below is diff-pinned
// against them.

import type { CardRecord } from "../fetch/card-record.js";
import { DeckoName } from "../name.js";
import { findRule } from "../rules/lookup.js";
import { applyViewOverride } from "../rules/apply.js";
import { scanNests, referencedNames } from "./nest-syntax.js";
import type { WarmupMode, WarmupRef, WarmupScan } from "./prefetch.js";
import { RenderFormat } from "./format.js";
import type { RenderCard } from "./format.js";
import {
  cloudAttachmentUrl,
  faviconTagBytes,
  META_TAGS,
  pageTitleTagBytes,
  applyDeploymentCssRevision,
  stylesheetTagsBytes,
  type HeadReadSet,
} from "./head-views.js";
import { getDeploymentCloudAssetHost } from "./views.js";
import { deckoRootUrl } from "./deployment-follow-live-config.js";
import { scriptIntegrityFor } from "./deployment-follow-live-config.js";
import type { RenderEngine } from "../render.js";
import type { HistoryRenderParams } from "../history/render-seam.js";
import { DECK_ORIGIN } from "./deck-origin.js";

// The production `Cardio.config.deck_origin` the capture pinned (runbook
// production-equivalent setting 4; Env.origin with no request) now lives in
// render/deck-origin.ts: the `:url` view needs the same literal (Ruby's
// `card_url` is ABSOLUTE, and the email-template pages pin its output), so
// the head tag and the view share one source instead of two literals.

/** The production `Cardio.config.default_html_view`: :content (the page
 *  capture's production-equivalent setting 5, documented at
 *  capture-dual-lane-page-and-view.rb:314 and assigned at :344; every
 *  live-wire page renders implicit child nests as content-views). This is
 *  PROCESS CONFIG the capture flips around the page render — modeled by
 *  engine.runWithPageConfig wrapping renderPageBytes, so
 *  RenderFormat.defaultNestView reads "content" for every nest inside the
 *  page and "titled" for bare renders (the railtie default the
 *  requestless capture boot ran under). The main-view fallback below reads
 *  the same config through the engine accessor. */

/** The carrierwave cloud attachment URL the capture's fog storage config
 *  produced: endpoint + empty bucket + files_web_path ("files") + id/action.
 *  Source contents look like "(my_bucket)/103/3649.jpg" — the paren prefix
 *  is the credential/bucket key, never emitted (set/abstract/attachment/
 *  cloud.rb + file_card_uploader.rb:88-117). */
const CLOUD_URL_PREFIX = "http://s3.amazonaws.com//files/";

/** Card::Error::UserError raised by wrapper.rb#raise_wrap_error for a layout
 *  name that fetches to neither a card layout nor a built-in code layout.
 *  The class name matters: the replay handlers map it to the sentinel's
 *  "Card::Error::UserError" spelling. */
export class UnknownLayoutError extends Error {
  readonly layoutName: string;
  constructor(layoutName: string, key: string) {
    super(`unknown layout card: ${key}`);
    this.name = "UnknownLayoutError";
    this.layoutName = layoutName;
  }
}

/** The result of show_with_page_layout's page_layout step. */
interface PageLayout {
  /** The resolved layout name ("Default Layout", "PCTS_main_layout", ...) or
   *  ":default" for the built-in code layout fallback. */
  layoutName: string;
  /** How the layout will render (CardLayout / CodeLayout / UnknownLayout). */
  kind: "card" | "code-default" | "unknown";
  /** The layout CARD's content (card layouts only). */
  layoutCardContent?: string;
  /** The {{_main|view}} chunk's view (card layouts); undefined when the
   *  layout names no view and the default_nest_view applies. */
  mainViewRaw?: string;
  /** The {{_main...}} chunk's full syntax (the main slot's nest_syntax). */
  mainNestSyntax?: string;
  /** The voo.layout wrapper key for the unknown-layout error
   *  (wrapper.rb raise_wrap_error: "unknown layout card: #{wrapper}"). */
  unknownKey?: string;
}

/**
 * Render the live page for one card (the show path). Throws for the same
 * inputs the pinned Ruby oracle raised for: unknown layout cards (the
 * UserError sentinel), missing cards, and focal-view render errors (the
 * production loud_error re-raise).
 *
 * `requestedView` is the ?view=/ ?v= query param (rest.rb view_from_params
 * feeds format.page(controller, view) — the requested view IS the root
 * show view, overriding the layout's {{_main|view}} chunk, which Ruby
 * satisfies from the memoized main.rendered). Unsupported views raise the
 * engine's UnsupportedViewError (Ruby: the unsupported-view UserError,
 * format/render.rb:60-64).
 *
 * `historyParams` is THE PAGE-PATH SEAM for the history views (the
 * p2-history-seam lane, 2026-10-03 — edge-site-shell residual #3): the
 * Card::Env.params equivalents Ruby's history views read at render time
 * (HistoryRenderParams — act_id/action_id/page/...), carried THROUGH the
 * page-path routing. It threads into the prepare render below, whose
 * RenderEngine.render seats the render-time history reader
 * (render.ts prepareHistoryRender) the sync history ViewFns read; without
 * it, a history view served through this entry rendered the no-param
 * fallback arms (and, before the edge's wire-key translation, ignored the
 * query entirely). Undefined for every other caller — every pre-existing
 * call is byte-identical.
 */
export async function renderPageBytes(
  engine: RenderEngine,
  cardName: string,
  requestedView?: string,
  historyParams?: HistoryRenderParams,
): Promise<string> {
  // The page capture wraps `fmt.show(nil, {})` in the production config
  // (capture-dual-lane-page-and-view.rb:369, inside the config block at
  // :368-370; its settings are assigned at :343-344). The engine models
  // that with the pageConfigActive flag:
  // every nest resolved inside this call (including the prepare render's)
  // reads "content"; bare renders keep the railtie "titled".
  //
  // The page is one request: no Temporary-cache reset may drop an entry this
  // request seated before its synchronous readers use it
  // (TemporaryCache#hold; the reset is deferred to the request's end).
  // (Stub decks in the edge request tests carry a partial fetcher.)
  const releaseCaches =
    typeof engine.fetcher?.holdTemporaryCaches === "function" ? engine.fetcher.holdTemporaryCaches() : () => {};
  try {
    return await engine.runWithPageConfig(() =>
      renderPageBytesWithPageConfig(engine, cardName, requestedView, historyParams),
    );
  } finally {
    releaseCaches();
  }
}

async function renderPageBytesWithPageConfig(
  engine: RenderEngine,
  cardName: string,
  requestedView?: string,
  historyParams?: HistoryRenderParams,
): Promise<string> {
  // THE PAGE LANE'S SWEEP-SURFACE scope (renderSeats' doc): the layout
  // warm-ups below seat AROUND the inner render() — one clear here puts the
  // whole page's seats (main closure + layout closure) in this page render's
  // sweep surface, and the next page's render starts from an empty one (the
  // sweep-cascade cut: a page's chase seats must never become a later
  // render's scan surface).
  engine.beginPagePrepare();
  try {
    return await renderPageBytesWithPageConfigInner(
      engine,
      cardName,
      requestedView,
      historyParams,
    );
  } finally {
    engine.endPagePrepare();
  }
}

async function renderPageBytesWithPageConfigInner(
  engine: RenderEngine,
  cardName: string,
  requestedView?: string,
  historyParams?: HistoryRenderParams,
): Promise<string> {
  // process_layout.rb: main! (the root format is the main format) then
  // page_layout — the *layout rule walk happens BEFORE the main render.
  const record = await engine.fetcher.fetchByName(cardName);
  if (record === undefined || record.name === undefined) {
    throw new Error(`card not found: ${cardName}`);
  }
  const layout = await resolvePageLayout(engine, record);

  // The requested ?view= wins over the layout chunk (rest.rb view_from_params
  // -> format.page -> show(view)); otherwise the layout's {{_main|view}}
  // chunk names the main view; render_with_layout falls back to
  // default_page_view (= default_nest_view = Cardio.config.default_html_view,
  // :content in production) when the layout carries no view. The page lane's
  // config is active here, so the accessor answers "content".
  const mainView = requestedView ?? layout.mainViewRaw ?? engine.defaultHtmlViewConfig();

  // The main render + the full prepare sequence (permission state, search
  // parse gates, structure universe...) — the identical preparation and
  // (card, view) render the bare path runs. Output discarded; the page pass
  // re-renders through the main! format below from warm maps.
  //
  // The raise semantics differ between the two captures: the bare capture
  // ran development (raise_all_rendering_errors=true — every nested view
  // error re-raises, the view-capture sentinels), the page capture ran
  // production (nested errors -> the quiet render-error span). A view-
  // dispatch raise here (Date::Error, search BadQuery) must NOT fail the
  // page: the assembly's main! render converts nested raises via
  // nestQuietErrors. Focal gate raises (pointer/set-host options chains)
  // only fire for open/content MAIN views (2 corpus pages) — accepted
  // collateral. A lost root (prepare died before enrichment) rethrows.
  let prepareError: Error | undefined;
  try {
    // The HistoryRenderParams thread (the page-path seam — see the
    // renderPageBytes doc): render() seats the render-time history reader
    // when the view is one of the history views; the sync main render
    // below reads it. undefined passes through render()'s own `= {}`
    // default, so non-history pages are untouched.
    await engine.render(record.name.s, mainView, historyParams);
  } catch (error) {
    prepareError = error as Error;
  }
  const rootCard = engine.fetchRenderCard(record.name.s);
  if (rootCard === undefined) {
    throw prepareError ?? new Error(`render card not prepared: ${record.name.s}`);
  }

  // The chrome session's account-links data must exist before the sync
  // layout render: the *account_link navbar view (and the :core view) read
  // the prepared items synchronously. No-op for signed-out/actor-less
  // sessions (the anonymous corpus surface never enters this path).
  await engine.prepareSessionAccountLinks();
  // The page body's [[link]] targets must be warm before the sync render:
  // renderLinkChunk's known/wanted (links.rb add_known_or_wanted_class)
  // reads the warm map, and Ruby's Card.known? is a LIVE fetch — so a cold
  // render whose link targets are not yet prepared emits wanted-card for
  // existing cards (the Aikido 2 [[Aikido Oak Cliff]] golden pin:
  // known-card; the cold prefetch closure walks {{nest}} references only —
  // nest-syntax.ts referencedNames — leaving the structured template's
  // links unwarm). The main card seeds the SAME bounded BFS the layout
  // warm-up uses (scanWarmDeps: nest refs spine, link targets leaf), so
  // the whole rendered content closure resolves with its link targets.
  const mainWarmup = await engine.warmupLayoutReferences(
    [{ name: record.name.s, context: record.name.s }],
    scanWarmDeps,
    () => ensureCodenameMarksResolvable(engine),
  );
  // Enriched cards need verdicts before the sync render (unjudged cards
  // render as placeholder content — the known late-enrichment trap). The
  // card-layout path's warmUpLayoutNests refreshes below anyway; this
  // covers the code-default-layout pages (no layout warm-up there) and is
  // a map-size no-op when nothing landed.
  if (mainWarmup.cards > 0) {
    await engine.refreshVerdicts();
  }
  // Search pre-execution pass 1 — BEFORE the main body render. The search
  // cards this page's content nests (`<page>+*referred_to_by`,
  // `<page>+*type+by name`) are now enriched but unexecuted: the prepare
  // render's prepareSearches either never reached them (relative references
  // are skipped at cardReferenceKeys' ref.relative continue — the
  // {{_self+*referred_to_by}} class: money 18253 + six more census pages)
  // or saw them enriched only AFTER its walk (structure-content junction
  // searches applyStructureContent joins late — the {{+*type+by name}}
  // class: Sign up 12, PlainText 22, VAP 827). The mainBody render below
  // dispatches these nests synchronously through the card_list view, which
  // reads ONLY the pre-executed map (executeSearch →
  // searchResults.get(key) ?? []) — so they rendered search-no-results with
  // zero queries (the 10-census-page SEARCH-EMPTY class,
  // cache-nil-fix.md section 3). Ruby executes these inside the view
  // dispatch (card-mod-search set/abstract/0_search/views.rb view :card_list
  // → search_with_params → query.run): the Ruby request has no sync/async
  // split, so this pass IS that view-time execution, hoisted into the async
  // phase the port completes before the sync render. The walk is the page's
  // NEST closure only (content references + result items — never the
  // type-record sides or pointer chases the enrichment also landed, whose
  // whole-deck searches the page does not render). Then re-judge the search
  // items' verdicts (the late-enrichment trap; refreshVerdicts is
  // skip-if-set for already-judged cards).
  const mainBodySearches = await engine.prepareNestClosureSearches([
    { name: record.name.s, context: record.name.s },
  ]);
  if (mainBodySearches > 0) {
    await engine.refreshVerdicts();
  }
  // Permission recovery (2026-09-29): a prepare render
  // that died before the folded batch landed (the corpus proof was the cold
  // closure batch's SqliteError "Expression tree is too large" — the 1019-
  // pair junction OR-tuple of 20120122+BW+RVW) leaves the read-permission
  // state unresolved and every prepared card unjudged. The sync gate's
  // unjudged-allowed contract would then render the read-denied MAIN body in
  // full where Ruby emits the denial frame (the pass-15 triage's 130
  // denial-wrapper-leak pages) — denial, not byte noise. Resolve the state
  // from the standalone three-statement batch and judge the prepared map
  // BEFORE any sync render. No-op when the prepare landed (memoized state +
  // map-size guard). Deny-direction only: verdicts become Ruby's data-driven
  // ones; readable cards are unaffected.
  await engine.ensurePermissionVerdicts();
  // The comment_box gate's update verdicts (views.ts commentBoxBaseView):
  // the +discussion cores inside the page body render the comment form
  // only on a POSITIVE update verdict, and the generic task warm
  // (ensureTaskVerdicts) is view-gated - warm the discussion cards here.
  await engine.ensureDiscussionUpdateVerdicts();

  // THE ROLE CONFIGS ADMIN-RUNTIME WARM.
  // card-mod-account set/type/role.rb view :configs (the Role dashboards'
  // `{{_L|configs}}` nests) reads the core mod's admin runtime state (mod
  // cards + the *update-rule role walk) — state whose build is ASYNC while
  // the view body is SYNC. A loader-bound boot builds it in the mod
  // prepareEngine; this page lane binds NO loader, so when the prepared
  // closure actually dispatches the view (any prepared card's content
  // carries a `|configs` nest opt, or the main view IS configs), build it
  // here, once per engine, before the sync render. Pages that never reach
  // :configs pay zero queries (the query-count gates stay untouched).
  if (mainView === "configs" || engine.renderClosureNeedsCoreAdminRuntime()) {
    await engine.ensureCoreAdminRuntime();
  }

  // THE LATE-SEAT STRUCTURE SWEEP (T1-1 sweepproof) — main-body boundary:
  // the prepare render's tail warms and the page lane's own seat paths after
  // it (warmupLayoutReferences, prepareNestClosureSearches) seat cards the
  // prepare render's two structure passes never saw. Process every seat of
  // this page BEFORE the main body dispatch reads their content. See
  // RenderEngine.applyLateSeatStructureContent's doc.
  await engine.applyLateSeatStructureContent();

  // The root format: main! context (h1 header, focal gates) + production
  // quiet-error semantics for nested views. The default nest view needs no
  // override — RenderFormat.defaultNestView reads the page-active engine
  // config the main-view pick above used.
  const rootFormat = new RenderFormat(rootCard, engine, {
    main: true,
    nestQuietErrors: true,
  });
  // Seat the head bytes BEFORE the main-body render: the Self::Head core
  // view (card-mod-layout set/self/head.rb:17 `nest root.card,
  // view: :head`) fires INSIDE the main body when the page card's content
  // is a `{{:head|core}}` reference (*all+*head / X+*self+*head rule
  // pages) and reads the page's own head bytes back — the oracle pins them
  // byte-identical (the CodeRay <pre> content == the page <head> content
  // on every such page). headContent is a read-only walk over warmed
  // state, so building it before the main render is order-safe; the same
  // bytes go into the :html_page wrapper below.
  const head = await headContent(engine, record.name, rootCard);
  engine.seatPageHead(rootCard.key, head);

  // render_with_layout: render! the main view with the main-nest opts (the
  // captured data-slot JSON: view, nest_name "_main", nest_syntax, main,
  // home_view, main_view, layout). Ruby memoizes this as main.rendered
  // (wrapper.rb:15 `@rendered = yield`, then the wrapper pass at :23-27);
  // the layout body's {{_main}} nest then wraps it with wrap_main
  // (<div id="main">). The assignment is the port's with_wrapper seam, and
  // it MUST come after the main render: mid-render, the root format's
  // @rendered holds whatever the last view dispatch left there — the :raw
  // view's raw source while a `{{_main}}` inside the MAIN card's own
  // content is being chunked (D6, page 470).
  const mainBody = rootFormat.renderView(
    mainView,
    {
      nest_name: "_main",
      ...(layout.mainNestSyntax !== undefined ? { nest_syntax: layout.mainNestSyntax } : {}),
      main: true,
      home_view: mainView,
      main_view: true,
      layout: layout.layoutName,
    },
    // show_with_page_layout's render! carries NO optional render opt — the
    // main slot's captured data-slot has no "show" viz (unlike the bare
    // view lane where format.render pins show:[view]). null = no viz (a
    // JS default parameter would revive "show" on undefined).
    null,
  );
  rootFormat.rendered = await applyMainViewOverride(engine, rootCard, mainView, mainBody);

  // Unknown layouts raise AFTER the main render (wrap_with_wrapper ->
  // raise_wrap_error), never before — matching the capture's sentinel order.
  if (layout.kind === "unknown") {
    throw new UnknownLayoutError(layout.layoutName, layout.unknownKey ?? "");
  }

  // wrap_with_card_layout: the layout card's content processed through the
  // page's own format ({{_main}} -> wrap_main { main.rendered }).
  // Prefetch first: the layout's nest targets (header/footer/skin cards)
  // are outside the main card's inclusion closure, and the sync nest path
  // only reads prepared cards. One warm-up render per DISTINCT target
  // (typically *header + *footer, shared corpus-wide — later pages skip);
  // warm-up failures are the target's own render errors and surface
  // through the real nest as the quiet span.
  let layoutNestSeeds: WarmupRef[] = [];
  if (layout.kind === "card") {
    for (const piece of scanNests(layout.layoutCardContent ?? "")) {
      if (piece.kind === "nest" && piece.nest !== undefined && piece.nest.name !== "_main") {
        layoutNestSeeds.push({
          name: piece.nest.name,
          context: record.name.s,
          mode: nestWarmMode(piece.nest.options.view),
        });
      }
    }
    await ensureCodenameMarksResolvable(engine);
    await warmUpLayoutNests(engine, layoutNestSeeds);
    await ensureCodenameMarksResolvable(engine);
  }
  // Search pre-execution pass 2 — the layout warm-up's completion, before
  // the sync layout render. The layout warm-up above enriched the layout
  // body's nest targets (header/footer/skin cards — a layout CAN nest
  // search cards directly, unlike the Default Layout) without executing
  // them; the same pre-execution the main body got above must cover these
  // before processLayoutContent dispatches the nests. The walk seeds from
  // the layout's own nests (the cards the layout body dispatches), so a
  // search nested in the *header/*footer content executes here and nothing
  // else. Idempotent: the already-seated skip inside
  // prepareNestClosureSearches makes this a no-op re-walk when pass 1
  // executed everything.
  if (layoutNestSeeds.length > 0) {
    const layoutSearches = await engine.prepareNestClosureSearches(layoutNestSeeds);
    if (layoutSearches > 0) {
      await engine.refreshVerdicts();
    }
  }
  // THE LATE-SEAT STRUCTURE SWEEP (T1-1 sweepproof) — layout boundary: the
  // layout warm-up above (warmUpLayoutNests) and its search pass seat cards
  // between the main-body render and the layout content render; process
  // them before the layout dispatch reads their content. See
  // RenderEngine.applyLateSeatStructureContent's doc.
  await engine.applyLateSeatStructureContent();
  const interior =
    layout.kind === "card"
      ? rootFormat.processLayoutContent(layout.layoutCardContent ?? "")
      : codeDefaultLayoutInterior(rootFormat);

  // show.rb: the :html_page wrapper (head + interior). Byte shape pinned by
  // the page-lane capture: the wrapper heredoc's 6/8/10-space indentation is
  // part of the served bytes on every captured page, and the heredoc's
  // closing line ends with a newline — BOTH golden families (the
  // authenticated set and the dual-lane anonymous pages) end
  // `      </html>\n`, so the wrapper's trailing newline is part of the
  // served bytes.
  return (
    `      <!DOCTYPE HTML>\n` +
    `      <html class="h-100">\n` +
    `        <head>\n` +
    `          ${head}\n` +
    `        </head>\n` +
    `        ${resolveCloudUrls(interior)}\n` +
    `      </html>\n`
  );
}

/** The main view's *<view> rule override — the same rule-application hook
 *  RenderEngine.render applies to its bare output (shared ruleCache, so the
 *  warm page pass is one Map lookup). A denied main render never reaches
 *  view dispatch, so overrides cannot apply to it — same guard as render(). */
async function applyMainViewOverride(
  engine: RenderEngine,
  rootCard: RenderCard,
  view: string,
  baseHtml: string,
): Promise<string> {
  if (engine.isDenied(rootCard)) return baseHtml;
  const override = await engine.viewOverrideFor(rootCard, view);
  return override !== undefined ? applyViewOverride(baseHtml, override) : baseHtml;
}

// ---------------------------------------------------------------------------
// page_layout (process_layout.rb:36-38 + layout_name_from_rule)
// ---------------------------------------------------------------------------

/** Prepare every card the layout body can dispatch on: the layout's nest
 *  targets, their content references, [[link]] targets, and pointer/list
 *  items (plain-text item lists the closure walk never chases — the
 *  *Opportunities dropdown items). Enrichment lands in the prepared-card
 *  map, then one verdict refresh so the warm subtree denies exactly like
 *  the capture. Names resolve exactly like the format does: DeckoName
 *  marks (:codename) through the name environment, RELATIVE names against
 *  the REFERENCING card (format.ts resolveNestName's context is the card
 *  whose content nests the reference: layout-level nests resolve against
 *  the page card, a warmed card's own content refs against that card).
 *  Resolving every hop against the page name warmed spurious names
 *  ("*credit"'s +image warmed as "Aikido Oak Cliff+image"), the real sync
 *  nest fetch missed the prepared-card map, and the cold page's footer
 *  rendered the nest empty - the junction row (*credit+*image) stores a
 *  NULL key column, so its name resolves only through the prepared/
 *  temp-cache path the reference-context walk actually primes.
 *
 *  BOUNDED + BATCHED (the cold-render burst fix — this chase used to walk
 *  nest refs, link targets, AND pointer items transitively to a fixpoint
 *  through one point-query ladder per name, preparing the whole
 *  navbar-connected site at ~5,900-7,300 driver round trips per cold
 *  render): the reference CLASSES are unchanged — every class still
 *  expands to the same fixpoint the baseline reached, because what renders
 *  is not decidable from content syntax ([[target|label]] is an
 *  existence-only anchor in ordinary content but a real nest through the
 *  navbar chunk walk; a pointer item renders as a full bar) — the burst is
 *  killed by BATCHING instead: prefetch.ts resolves the closure in
 *  reference-BFS rounds, ONE driver.batch per round (round trips scale
 *  with reference DEPTH, not card count), 90-param chunking for the edge
 *  driver's statement ceiling, and the per-name ladder fallback only for
 *  names with no fetched row (placeholder/virtual semantics preserved
 *  byte-exact). Completeness is unchanged: every card the sync render
 *  reads from the prepared map is prepared before the render starts —
 *  pinned by the page-layout-warmup regressions and the Aikido Oak Cliff
 *  14-slot ordered comparison. */
async function warmUpLayoutNests(
  engine: RenderEngine,
  seeds: WarmupRef[],
): Promise<void> {
  await engine.warmupLayoutReferences(seeds, scanWarmDeps, () =>
    ensureCodenameMarksResolvable(engine),
  );
  await engine.refreshVerdicts();
}

/** The reference classes one warmed card contributes (prefetch.ts
 *  WarmupScan): nest refs and pointer/list items are SPINE (they render
 *  inside the page, so their own refs are read at sync-render time),
 *  [[link]] targets are LEAF (renderLinkChunk's known/wanted class reads
 *  only their existence off the prepared map; a link target never renders
 *  in this page). Every pushed name keeps the REFERENCING card as its
 *  resolution context. */
function scanWarmDeps(
  card: {
    name: DeckoName;
    dbContent: string;
    typeCode: string | undefined;
  },
  mode: WarmupMode,
): WarmupScan {
  const refs: WarmupRef[] = [];
  const leaves: WarmupRef[] = [];
  const context = card.name.s;
  const isItems = card.typeCode === "pointer" || card.typeCode === "list";
  const items = (): string[] =>
    card.dbContent
      .split(/\n+/)
      .map((s) => s.replace(/\[\[|\]\]/g, "").trim())
      .filter((s) => s !== "");
  if (!LINKS_ARE_LEAVES) mode = "full";

  if (mode === "nav-item") {
    // view :nav_item (navbar-views.ts): a plain card renders as a link; a
    // Pointer/List renders a dropdown whose items are links
    // (nav_link_in_dropdown): existence + title only.
    if (isItems) for (const item of items()) leaves.push({ name: item, context });
    return { refs, leaves };
  }

  for (const piece of scanNests(card.dbContent)) {
    const nest = piece.nest;
    if (nest === undefined || nest.comment !== undefined) continue;
    refs.push({ name: nest.name, context, mode: nestWarmMode(nest.options.view) });
  }
  // A card rendered through :navbar_links nests each [[link]] target with
  // view :nav_item; anywhere else a [[link]] is an existence-only anchor
  // (renderLinkChunk's known/wanted class), so its target is a leaf.
  for (const m of card.dbContent.matchAll(/\[\[([^\][\n]+?)\]\]/g)) {
    const target = (m[1] ?? "").split("|")[0]?.trim() ?? "";
    if (target === "") continue;
    if (!LINKS_ARE_LEAVES) refs.push({ name: target, context });
    else if (mode === "navbar") refs.push({ name: target, context, mode: "nav-item" });
    else leaves.push({ name: target, context });
  }
  if (isItems) {
    for (const item of items()) {
      refs.push({ name: item, context, ...(mode === "navbar" ? { mode: "nav-item" as const } : {}) });
    }
  }
  return { refs, leaves };
}

/** The warm-up class a nest's view implies (prefetch.ts WarmupMode). */
function nestWarmMode(view: string | undefined): WarmupMode {
  if (!LINKS_ARE_LEAVES) return "full";
  if (view === "navbar_links") return "navbar";
  if (view === "nav_item") return "nav-item";
  return "full";
}

/** [[link]] targets are existence-only (LEAF): prepared, never scanned for
 *  their own references, unless a nest, pointer item or navbar reaches them.
 *  DECKO_WARMUP_LINKS_SPINE=1 restores the old transitive chase. */
const LINKS_ARE_LEAVES = process.env.DECKO_WARMUP_LINKS_SPINE !== "1";

/** Re-prime the lexicon entries the layout body's `:codename` marks resolve
 *  through. The temporary cache's max_keys reset (cache.ts TemporaryCache —
 *  Ruby temporary.rb within_key_counts) wipes primed entries as renders
 *  write; a wiped entry turns DeckoName.parse(":x") into a spurious
 *  CodenameNotFoundError inside nest(). The sync name-environment adapters
 *  cannot load from the driver, so the marks must peek warm. Probe every
 *  codehash codename (in-memory parses, sub-millisecond); re-prime the
 *  lexicon entries of the failures. */
async function ensureCodenameMarksResolvable(engine: RenderEngine): Promise<void> {
  const entries = engine.fetcher.codenames.peekEntries();
  if (entries.length === 0) return;
  const failedIds: number[] = [];
  for (const [codename, id] of entries) {
    try {
      DeckoName.parse(`:${codename}`);
    } catch {
      failedIds.push(id);
    }
  }
  if (failedIds.length > 0) {
    await engine.fetcher.warmLexicon(failedIds);
  }
}

async function resolvePageLayout(
  engine: RenderEngine,
  record: CardRecord,
): Promise<PageLayout> {
  // card.rule_card(:layout) — the ordered set-pattern candidate walk, first
  // EXISTING rule card wins (its content may still be empty -> first_name
  // nil -> the :default code layout; the walk does not continue).
  const rule = await findRule(engine.fetcher, { name: record.name }, "*layout");
  const layoutName =
    rule === undefined ? undefined : firstItemOfRuleContent(rule.rule.dbContent);
  if (layoutName === undefined || layoutName === "") {
    return { layoutName: ":default", kind: "code-default" };
  }

  // Layout.card_layout? — the layout name must fetch to a Layout/Html/Basic
  // typed card. Fetch misses (including trashed cards) fall through.
  const layoutCard = await engine.fetcher.fetchByName(layoutName);
  const typeCode =
    layoutCard?.typeId === undefined
      ? undefined
      : await engine.fetcher.codenames.nameForId(layoutCard.typeId);
  if (
    layoutCard !== undefined &&
    layoutCard.name !== undefined &&
    (typeCode === "layout_type" || typeCode === "html" || typeCode === "basic")
  ) {
    const layoutCardContent = layoutCard.dbContent ?? "";
    const mainChunk = findMainNestChunk(layoutCardContent);
    if (mainChunk === undefined) {
      // CardLayout#fetch_main_nest_opts raise (Layout.main_nest_opts phase,
      // before the main render).
      throw new Error(`no main nest found in layout "${layoutName}"`);
    }
    return {
      layoutName,
      kind: "card",
      layoutCardContent,
      mainViewRaw: mainChunk.options.view,
      mainNestSyntax: mainChunk.syntax,
    };
  }

  // Layout.code_layout? — the built-in registry. The corpus surface only
  // resolves :default (the empty-rule fallback); the other built-ins
  // (simple/pre/no_side/modal) have no captured page.
  if (layoutName === "default") {
    return { layoutName: ":default", kind: "code-default" };
  }

  // UnknownLayout — wrapper.rb#raise_wrap_error with voo.layout.to_name.key.
  return { layoutName, kind: "unknown", unknownKey: DeckoName.parse(layoutName).key };
}

/** set/all/item.rb raw_item_strings: content.split(/\n+/).map(strip_item);
 *  first_name = item_names.first. List/Pointer-typed rule cards store JSON
 *  arrays — parsed before the split (Abstract::List#raw_item_strings). */
function firstItemOfRuleContent(content: string | null | undefined): string | undefined {
  if (content === null || content === undefined) return undefined;
  const trimmed = content.trim();
  if (trimmed === "") return undefined;
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0];
        const s = typeof first === "string" ? first : String(first ?? "");
        return s.trim() === "" ? undefined : s.trim();
      }
    } catch {
      // not JSON: fall through to the plain-text split
    }
  }
  const firstLine = trimmed.split(/\n+/)[0]?.trim() ?? "";
  return firstLine === "" ? undefined : firstLine;
}

/** The {{_main|view}} chunk of a layout card's content
 *  (CardLayout#find_main_nest_chunk, direct-chunk case). The name match is
 *  case-sensitive exactly like Ruby's main_nest? ("_MAIN" nests as a plain
 *  child — runbook: the GBA/FrAi uppercase variants never fire the main
 *  path). */
function findMainNestChunk(
  content: string,
): { options: { view?: string; extra: Record<string, string> }; syntax: string } | undefined {
  for (const piece of scanNests(content)) {
    if (piece.kind === "nest" && piece.nest !== undefined && piece.nest.name === "_main") {
      return {
        options: { view: piece.nest.options.view, extra: piece.nest.options.extra },
        syntax: piece.nest.syntax,
      };
    }
  }
  return undefined;
}

/** layouts.rb layout :default (the built-in code layout; body_tag wraps):
 *  header / article(main) / aside(sidebar) / footer, each a codename nest.
 *  No corpus page pins the byte indentation of this path (the empty-rule
 *  cards are outside the captured set) — the heredoc is rendered unstripped
 *  per the show.rb wrapper precedent. */
function codeDefaultLayoutInterior(fmt: RenderFormat): string {
  const nest = (name: string, view: string): string =>
    fmt.nest({
      name,
      syntax: `${name}|${view}`,
      options: { view, extra: {} },
      comment: undefined,
    });
  return (
    `<body class="">\n` +
    `  <header>${nest(":header", "core")}</header>\n` +
    `  <article>${fmt.nest({
      name: "_main",
      syntax: "_main",
      options: { extra: {} },
      comment: undefined,
    })}</article>\n` +
    `  <aside>${nest(":sidebar", "core")}</aside>\n` +
    `  <footer>${nest(":footer", "content")}</footer>\n` +
    `</body>`
  );
}

// ---------------------------------------------------------------------------
// head content (html/show.rb head_content -> the page card's :head view;
// html/head.rb basket[:head_views] joined "\n")
// ---------------------------------------------------------------------------

export async function headContent(
  engine: RenderEngine,
  name: DeckoName,
  rootCard: RenderCard,
): Promise<string> {
  // head_views order (card-mod-format set/all/html/head.rb:1-4 basket:
  // page_title_tag, meta_tags, favicon_tag, stylesheet_tags,
  // universal_edit_button, rss_links — then the script mod's views) with the
  // empty-string contributions the captured pages pin: the blank between
  // meta_tags and favicon_tag (every golden, anonymous AND signed-in), and
  // universal_edit_button itself, which renders "" on a perms :update
  // denial (every anonymous golden's blank after the stylesheets) and the
  // x-wiki link when update is allowed (every admin golden). rss_links
  // renders NIL on the captured surface and Ruby's join drops nils
  // (head.rb:32 `.compact.join "\n"`) — no line at all.
  //
  // The page_title/favicon/stylesheet byte builders come from
  // render/head-views.ts, the ONE module the card-mod-format head VIEWS
  // also call (through the prepare-phase prefetch,
  // RenderEngine#preloadHeadViewReads). They used to be private functions
  // in this file; extracting them is what makes the mod views
  // byte-identical by construction instead of by review.
  const read = await headReadSet(engine, "style");
  return [
    pageTitleTagBytes(read, name.s),
    META_TAGS,
    "", // pinned blank (mod basket head view; "" on every captured page)
    faviconTagBytes(read),
    stylesheetTagsBytes(read),
    await universalEditButtonTag(engine, rootCard),
    await javascriptTags(engine),
    await scriptVariablesTag(engine),
    await scriptCallsTag(engine),
  ].join("\n");
}

/** card-mod-format set/all/html/head.rb:46-51 view :universal_edit_button
 *  (unknown: :blank, denial: :blank, perms: :update): the update-permission
 *  gate is the VIEW's perms check (ok? :update via Auth.as_id — format.rb
 *  error.rb:27-29 ok?), denial renders :blank (the empty head entry the
 *  anonymous captures pin); the allowed branch renders
 *  `tag "link", rel: "alternate", type: "application/x-wiki", title:
 *  "Edit this page!", href: path(view: :edit)` — Rails' tag builder emits
 *  the self-closing form and `path(view: :edit)` is the "/<NAME>/edit"
 *  name-path form (golden-pinned: `<link rel="alternate"
 *  type="application/x-wiki" title="Edit this page!" href="/Home/edit" />`).
 *  `return if card.new?` (head.rb:47): an id-less page root renders "". */
async function universalEditButtonTag(
  engine: RenderEngine,
  rootCard: RenderCard,
): Promise<string> {
  if (rootCard.id === undefined) return ""; // head.rb:47 return if card.new?
  const updateOk = await engine.updateVerdictForCard?.(rootCard);
  if (updateOk === false) return ""; // perms :update denial -> :blank
  const namePath = rootCard.name.s.replace(/ /g, "_");
  return (
    `<link rel="alternate" type="application/x-wiki" title="Edit this page!" ` +
    `href="/${namePath}/edit" />`
  );
}

/** The read set the head builders consume, fetched ASYNC on the page
 *  path (the mod's ViewFn views read the same cards SYNC out of the
 *  prepared map instead — head-views.ts#HeadReadSet is the shared
 *  contract between the two). `styleSetting` selects which
 *  *all+*<setting>+*asset output chain fills styleAssetOutput; the page
 *  path passes "style" for the head and the javascript/script_variables
 *  builders reuse assetOutputUrl directly for the script chain. */
async function headReadSet(engine: RenderEngine, styleSetting: string): Promise<HeadReadSet> {
  return {
    titleSetting: await globalSettingContent(engine, "title"),
    faviconSource: await globalSettingContent(engine, "favicon"),
    styleAssetOutput: await assetOutputContent(engine, styleSetting),
  };
}

/** The *all+*<setting>+*asset output card's db_content — the compiled
 *  asset's attachment SOURCE (asset_outputter.rb asset_output_url
 *  resolves this source to the cloud URL). undefined when the universe
 *  default rule for the setting does not exist, which is the
 *  no-asset-pipeline branch every caller renders as "". */
async function assetOutputContent(
  engine: RenderEngine,
  settingCodename: string,
): Promise<string | undefined> {
  const rule = await engine.fetcher.fetchByName(`*all+*${settingCodename}`);
  if (rule?.name === undefined) return undefined;
  const output = await engine.fetcher.fetchByName(`${rule.name.s}+*asset output`);
  return output?.dbContent;
}

/** Card::Rule.global_setting(name): the codename card's db_content
 *  (rule.rb:5-9 — `Card[name]` with the codename mark).
 *
 *  Codename-less decks (edge-site-shell residual #4): Ruby's head assembly
 *  cannot 500 a page on an unmapped codename. `Codename.id` (codename.rb:
 *  35-41) returns nil for an unmapped codename, and the raise-capable fetch
 *  forms are caught per-view in the page assembly (nest fetches rescue
 *  Card::Error::CodenameNotFound and render the not-found card, format/nest/
 *  fetch.rb:22-34; every nested view's raise is rescued by wrap_and_render
 *  -> rescue_view -> quiet_error, format/render.rb:56-59 + format/error.rb:
 *  69-84). This port reads the registry FIRST (Codename.id — the
 *  nil-returning fetch) and answers undefined for an unmapped codename, so
 *  each head entry renders its no-setting branch; a mapped codename takes
 *  the exact pre-fix fetch path (byte-identical, memo read only — the page
 *  path folds the codehash in the prepare render before the head assembles). */
async function globalSettingContent(
  engine: RenderEngine,
  codename: string,
): Promise<string | undefined> {
  if ((await engine.fetcher.codenames.id(codename)) === undefined) {
    return undefined; // Ruby Codename.id nil: the setting card cannot exist
  }
  const card = await engine.fetcher.fetchByName(`:${codename}`);
  const content = card?.dbContent;
  return content === undefined || content === null ? undefined : content;
}

/** javascript_tags: [nest(*script, :remote_script_tags), MAIN DECKO
 *  JAVASCRIPT comment, main_javascript_tag]. The remote tags are the pinned
 *  mods' manifest "remote" groups (constant bytes across the corpus). */
async function javascriptTags(engine: RenderEngine): Promise<string> {
  const scriptUrl = await assetOutputUrl(engine, "script");
  return [
    applyScriptIntegrity(REMOTE_SCRIPT_TAGS),
    `<!-- MAIN DECKO JAVASCRIPT -->`,
    `<script src="${scriptUrl}"></script>`,
  ].join("\n");
}

/** The *all+*<setting>+*asset output card's content, resolved to the fog
 *  cloud URL (asset_outputter.rb asset_output_url). */
async function assetOutputUrl(engine: RenderEngine, settingCodename: string): Promise<string> {
  return cloudAttachmentUrl(await assetOutputContent(engine, settingCodename)) ?? "";
}

/** head_javascript.rb view :script_variables (javascript_tag + the CDATA
 *  wrapper); decko_script_variables order pinned: rootUrl, doubleClick,
 *  cssPath, signed_in. */
async function scriptVariablesTag(engine: RenderEngine): Promise<string> {
  const cssPath = applyDeploymentCssRevision(await assetOutputUrl(engine, "style"));
  // decko_script_variables order pinned: rootUrl, doubleClick, cssPath,
  // signed_in. signed_in is the SESSION (Auth.signed_in? — Auth.current_id
  // != AnonymousID, auth/current.rb), not the read-verdict actor: the page
  // chrome session (engine.pageSession) carries it; undefined = signed out
  // (the anonymous corpus surface's false, byte-identical).
  const signedIn = engine.pageSession?.signedIn === true;
  // decko.rootUrl is card_url("") (mod/script/set/all/head_javascript.rb:35)
  // = Env.origin + card_path("") (card/lib/card/env/location.rb:19-21 + :6-16,
  // card_path "" -> relative_url_root + "/"). Env.origin is PER RENDER
  // (card/lib/card/env/serializable.rb:20-22: Cardio.config.deck_origin ||
  // "#{protocol}#{request&.host_with_port}"), and this builder is reached on
  // BOTH surfaces since the bare-view-lane fix (render.ts:1385 seats this
  // same headContent for an unseated root whose content nests the head
  // card's :core). The page lane runs it under runWithPageConfig
  // (renderPageBytes, page.ts:130-142) with the capture's
  // deck_origin = "https://culturesmith.com" (capture-dual-lane-page-and-view
  // .rb:343); the VIEW lane runs it with the railtie default
  // (card/lib/cardio/railtie.rb:28 config.deck_origin = nil) and no
  // controller (card/lib/card/env.rb:17), so origin is "" and card_url("")
  // is the bare "/". engine.envOriginConfig() is that per-surface value
  // (render.ts:1770-1772, render/deck-origin.ts:73-75) — reading it here
  // is what the constant could not do. Oracle: 6588/6588 page rows carry
  // 'https://culturesmith.com/', cards 34754 / 34758 views carry '/'.
  const rootUrl = deckoRootUrl() ?? `${engine.envOriginConfig()}/`;
  return (
    `<script>\n//<![CDATA[\n` +
    `decko.rootUrl='${rootUrl}';\n` +
    `decko.doubleClick='signed_in';\n` +
    `decko.cssPath='${cssPath}';\n` +
    `decko.signed_in=${signedIn};\n` +
    `\n//]]>\n</script>`
  );
}

/** head_javascript.rb view :script_calls: the mod script_calls basket
 *  (ace editor -> setAceConfig over global_setting(:ace); tinymce_editor ->
 *  setTinyMCEConfig over global_setting(:tiny_mce)) + trigger_slot_ready,
 *  joined "\n\n" inside the CDATA script. Config JSONs are
 *  escape_javascript'd (newlines -> \n literals). */
async function scriptCallsTag(engine: RenderEngine): Promise<string> {
  const ace = (await globalSettingContent(engine, "ace")) ?? "";
  const tinymce = (await globalSettingContent(engine, "tiny_mce")) ?? "";
  const configs = [
    `decko.setAceConfig('${escapeJavascript(ace)}')`,
    `decko.setTinyMCEConfig('${escapeJavascript(tinymce)}')`,
    `$('document').ready(function() { $('.card-slot').trigger('decko.slot.ready'); })`,
  ].join("\n\n");
  return `<script>\n//<![CDATA[\n${configs}\n//]]>\n</script>`;
}

/** Rails escape_javascript (action_view/helpers/javascript_helper.rb
 *  JAVASCRIPT_ESCAPE_MAP order): \\ -> \\\\, </ -> <\\/ (Rails inserts the
 *  backslash after the backslash pass), newlines -> \\n, " -> \\", ' -> \\',
 *  ` -> \\`, $ -> \\$. The captured config bytes pin the quote form. */
function escapeJavascript(js: string): string {
  return js
    .replace(/\\/g, "\\\\")
    .replace(/<\//g, "<\\/")
    .replace(/\r\n/g, "\\n")
    .replace(/\r/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");
}

/** card-mod-script set/all/head_javascript.rb:17 javascript_tags'
 *  remote_script_tags nest — the pinned mods' manifest "remote" groups in
 *  the deck's *all+*script item order (format, ace editor, bootstrap).
 *  Constant for the captured deck (the CDN urls live in the gems'
 *  manifest.yml files, not in card content). */
const REMOTE_SCRIPT_TAGS = [
  `<!-- mod: format (remote) -->`,
  `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous"></script>`,
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`,
  `<!-- mod: ace editor (remote) -->`,
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js" crossorigin="anonymous"></script>`,
  `<!-- mod: bootstrap (remote) -->`,
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`,
  `<script src="https://kit.fontawesome.com/1366963381.js" crossorigin="anonymous"></script>`,
].join("\n");

/** The deployment's SRI integrity attributes
 *  (deployment-follow-live-config.ts scriptIntegrityBySrc): the live head's
 *  remote CDN script tags carry integrity="..." after crossorigin and before
 *  an optional referrerpolicy (live head 12/12 pages; the vm-staging-server
 *  derived constants). UNSET = identity (the frozen capture-era tags).
 *  Exported for the deployment-config pin test. */
export function applyScriptIntegrity(tags: string): string {
  return tags.replace(
    /<script src="([^"]+)"([^>]*)><\/script>/g,
    (tag: string, src: string, attrs: string) => {
      const integrity = scriptIntegrityFor(src);
      if (integrity === undefined) return tag;
      const referrer = attrs.indexOf(" referrerpolicy=");
      const at = referrer === -1 ? attrs.length : referrer;
      return `<script src="${src}"${attrs.slice(0, at)} integrity="${integrity}"${attrs.slice(at)}></script>`;
    },
  );
}

/** The page-path cloud attachment resolution: attachment URLs inside the
 *  assembled interior (header logo, image cores) must resolve to the
 *  absolute fog URL exactly like the head pieces; the bare view lane keeps
 *  the raw "(bucket)/..." bytes (different capture env — the view-lane
 *  contract). Runs LAST so nested view output is covered wholesale.
 *  The prefix reads the process-wide deployment asset host when set (the
 *  graded environment's setting, mirroring Ruby's process-wide storage
 *  config); unset = the capture's fog CLOUD_URL_PREFIX, byte-identical to
 *  the pre-config engine. Note the two constants' slash shapes: the fog
 *  host carries a trailing slash (empty bucket -> the double slash the
 *  oracle pins), the deployment host does not (a REAL bucket -> single
 *  slash), and each is joined to "/files/" to reproduce exactly its own
 *  pinned form. */
function resolveCloudUrls(html: string): string {
  const deployment = getDeploymentCloudAssetHost();
  const prefix = deployment !== undefined
    ? `${deployment}/files/`
    : CLOUD_URL_PREFIX;
  return html.replace(
    /\([^()\s]+\)\/(\d+\/[^\s"'<>)]+\.[A-Za-z0-9]+)/g,
    `${prefix}$1`,
  );
}
