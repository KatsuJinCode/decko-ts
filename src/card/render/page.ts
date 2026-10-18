import { str, type ViewResult } from "./format.js";
import {applyMaterialIconsAssetConfiguration} from "./material-icons.js";
import { applyFontAwesomeAssetConfiguration, fontAwesomeHeadTag, STOCK_FONT_AWESOME_TAG } from "./font-awesome.js";
// The page renderer: TypeScript port of the html-format show path —
// `card.format(:html).show(nil, {})` through show_with_page_layout — the
// live-serving page assembly the bare view-function renderer does not do.
//
// Truth source (the pinned gems):
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
// render per cold page keeps the integration surface minimal (render.ts
// gains only the renderPage entry point).
//
// Production-equivalent environment settings this module pins on the page
// path: default_html_view = :content (page path only — the bare view path
// keeps the development default :titled), deck_origin https://example.com,
// and carrierwave cloud attachments resolving to the absolute bucket URL.

import type { CardRecord } from "../fetch/card-record.js";
import { DeckoName } from "../name.js";
import { findRule } from "../rules/lookup.js";
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
import { h } from "./slot-html.js";
import { debugFlag } from "../debug-flags.js";

// The `decko.rootUrl` this head emits (scriptVariablesTag below) reads the
// deployment's follow-live constant first, then the ENGINE's configured
// origin (render/deck-origin.ts — the deck's own `Cardio.config.deck_origin`
// through setDeckEnvironment); with neither, the
// bare rooted form Ruby's requestless runner produces. The same value feeds
// the `:url` view through the engine accessor (Ruby's `card_url` is
// ABSOLUTE only when an origin is configured; email templates render the
// configured shape).

/** The production `Cardio.config.default_html_view`: :content (every
 *  served page renders implicit child nests as content-views). This is
 *  PROCESS CONFIG production sets around the page render — modeled by
 *  engine.runWithPageConfig wrapping renderPageBytes, so
 *  RenderFormat.defaultNestView reads "content" for every nest inside the
 *  page and "titled" for bare renders (the railtie default). The
 *  main-view fallback below reads the same config through the engine
 *  accessor. */

/** The carrierwave cloud attachment URL a fog storage config with an empty
 *  bucket name produces: endpoint + files_web_path ("files") + id/action.
 *  Source contents look like "(my_bucket)/12/34.jpg" — the paren prefix
 *  is the credential/bucket key, never emitted (set/abstract/attachment/
 *  cloud.rb + file_card_uploader.rb:88-117). */
const CLOUD_URL_PREFIX = "http://s3.amazonaws.com//files/";

/** The views stock Decko 0.20 declares with a modal or board wrapper, which a
 *  page renders outside its layout (process_layout.rb
 *  explicit_modal_wrapper?): card-mod-edit edit_content.rb :edit,
 *  editing.rb :board, new.rb :new_in_modal; card-mod-layout modal.rb :modal;
 *  card-mod-rules rule/editor.rb :rule_edit, rule/board_rules_editor.rb
 *  :modal_rule, type/set filtered_rule_lists.rb :modal_nest_rules;
 *  card-mod-format html/error.rb :debug_server_error. */
const OUTSIDE_LAYOUT_VIEWS: ReadonlySet<string> = new Set([
  "edit",
  "board",
  "new_in_modal",
  "modal",
  "rule_edit",
  "modal_rule",
  "modal_nest_rules",
  "debug_server_error",
]);

/** Card::Error::UserError raised by wrapper.rb#raise_wrap_error for a layout
 *  name that fetches to neither a card layout nor a built-in code layout.
 *  The class name matters: the engine's error handlers map it to the Ruby
 *  sentinel spelling "Card::Error::UserError". */
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
  /** The resolved layout name (e.g. "Default Layout") or
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
 * `historyParams` is THE PAGE-PATH SEAM for the history views: the
 * Card::Env.params equivalents Ruby's history views read at render time
 * (HistoryRenderParams — act_id/action_id/page/...), carried THROUGH the
 * page-path routing. It threads into the prepare render below, whose
 * RenderEngine.render seats the render-time history reader
 * (render.ts prepareHistoryRender) the sync history ViewFns read; without
 * it, a history view served through this entry renders the no-param
 * fallback arms. Undefined for every other caller.
 */
export async function renderPageBytes(
  engine: RenderEngine,
  cardName: string,
  requestedView?: string,
  historyParams?: HistoryRenderParams,
  bareMainOpts?: Record<string, unknown>,
): Promise<string> {
  // The page path wraps `fmt.show(nil, {})` in the production config
  // (the production-equivalent settings listed at the top of this file).
  // The engine models that with the pageConfigActive flag:
  // every nest resolved inside this call (including the prepare render's)
  // reads "content"; bare renders keep the railtie "titled".
  //
  // The page is one request: no Temporary-cache reset may drop an entry this
  // request seated before its synchronous readers use it
  // (TemporaryCache#hold; the reset is deferred to the request's end).
  // The request scope of the name memos (DeckoName.beginRequestScope):
  // parse and mark memos live for this page and are dropped with it.
  DeckoName.beginRequestScope();
  try {
    await resolveIdMarksInRequestedName(engine, cardName);
    // (Test stubs carry a partial fetcher.)
    const releaseCaches =
      typeof engine.fetcher?.holdTemporaryCaches === "function" ? engine.fetcher.holdTemporaryCaches() : () => {};
    const render = () =>
      engine.runWithPageConfig(() =>
        renderPageBytesWithPageConfig(engine, cardName, requestedView, historyParams, bareMainOpts),
      );
    try {
      // (Test stub engines carry no unknown-card
      // create-verdict pass; the real engine always does.)
      const body =
      typeof engine.renderWithUnknownCreateVerdicts === "function"
        ? await engine.renderWithUnknownCreateVerdicts(render)
        : await render();
      return applyMaterialIconsAssetConfiguration(applyFontAwesomeAssetConfiguration(str(body), engine.fontAwesomeAssetMode),engine.materialIconsAssetMode);
    } finally {
      // The request boundary's fill fold (commitSessionRolesFill): a Ruby
      // request whose roles nest rendered leaves the fill on the session's
      // card object for the NEXT request; the passes inside THIS request
      // never see each other's flips (the per-pass reset at render()
      // entry). Runs on the error path too — the mutation precedes any
      // late render failure. Optional-call per the merge-4 precedent: the
      // edge request tests drive the handler with stub engines that have
      // no such fold, and a real engine always does.
      engine.commitSessionRolesFill?.();
      releaseCaches();
    }
  } finally {
    DeckoName.endRequestScope();
  }
}

/** renderPageBytes plus the page's HTTP status: Ruby's `root.error_status`
 *  when the render set one (403 for a read-denied main card,
 *  RenderEngine#pageErrorStatus), else 200. Read before anything else runs
 *  on the engine, so a caller holding the engine for one request gets its
 *  own page's status. */
export async function renderPageWithStatus(
  engine: RenderEngine,
  cardName: string,
  requestedView?: string,
  historyParams?: HistoryRenderParams,
  bareMainOpts?: Record<string, unknown>,
): Promise<{ html: string; status: number }> {
  const html = await renderPageBytes(engine, cardName, requestedView, historyParams, bareMainOpts);
  return { html, status: engine.pageErrorStatus ?? 200 };
}

/** A requested name may carry id marks (`/~10`, `/~10+*email`). Its parse
 *  is synchronous, and the synchronous name environment only knows ids some
 *  earlier async read proved. Ruby resolves a mark with a synchronous
 *  database read (lexicon.rb:71-76); here each mark is read asynchronously
 *  first (DbLexicon#name records the durable id/name entry the synchronous
 *  parse consults), so the page never depends on whether a boot-time scan
 *  or an earlier request happened to warm the id. No statement when the
 *  name has no `~<digits>` mark. */
async function resolveIdMarksInRequestedName(engine: RenderEngine, cardName: string): Promise<void> {
  if (!cardName.includes("~")) return;
  const lexicon = engine.fetcher?.lexicon;
  if (lexicon === undefined || typeof lexicon.name !== "function") return;
  for (const m of cardName.matchAll(/~(\d+)/g)) await lexicon.name(Number(m[1]));
}

async function renderPageBytesWithPageConfig(
  engine: RenderEngine,
  cardName: string,
  requestedView?: string,
  historyParams?: HistoryRenderParams,
  bareMainOpts?: Record<string, unknown>,
): Promise<string> {
  // THE PAGE SURFACE'S SWEEP-SURFACE scope (renderSeats' doc): the layout
  // warm-ups below seat AROUND the inner render() — one clear here puts the
  // whole page's seats (main closure + layout closure) in this page render's
  // sweep surface, and the next page's render starts from an empty one (the
  // sweep-cascade cut: a page's chase seats must never become a later
  // render's scan surface).
  engine.beginPagePrepare();
  try {
    if (requestedView !== undefined && MODAL_WRAPPED_VIEWS.has(requestedView)) {
      return await renderOutsideOfLayout(engine, cardName, requestedView, historyParams);
    }
    return await renderPageBytesWithPageConfigInner(
      engine,
      cardName,
      requestedView,
      historyParams,
      false,
      bareMainOpts,
    );
  } finally {
    engine.endPagePrepare();
  }
}

/** Views whose definition wraps them in a modal or board (card-mod-layout
 *  set/all/process_layout.rb explicit_modal_wrapper?: `view_setting :wrap`
 *  names :modal or :board): card-mod-edit editing.rb :board, edit_content.rb
 *  :edit, new.rb :new_in_modal; card-mod-layout modal.rb :modal; card-mod-
 *  rules board_rules_editor.rb :modal_rule, editor.rb :rule_edit,
 *  filtered_rule_lists.rb :modal_nest_rules; card-mod-format html/error.rb
 *  :debug_server_error. */
const MODAL_WRAPPED_VIEWS: ReadonlySet<string> = new Set([
  "board",
  "edit",
  "new_in_modal",
  "modal",
  "modal_rule",
  "rule_edit",
  "modal_nest_rules",
  "debug_server_error",
]);

/** process_layout.rb render_outside_of_layout: a requested view that wraps
 *  itself in a modal or board renders OUTSIDE the page layout — the page is
 *  the layout with its own main view (`render_with_layout nil, ...`), and
 *  the requested view, rendered on the main format with the main args
 *  (main_render_args: main and main_view), goes in before `</body>`
 *  (body_with_modal). A denied view therefore renders the readable card's
 *  page followed by the loud denial, and the page answers 403 (the denial is
 *  focal and its voo the root). */
async function renderOutsideOfLayout(
  engine: RenderEngine,
  cardName: string,
  view: string,
  historyParams?: HistoryRenderParams,
): Promise<string> {
  const found = await engine.fetcher.fetchByName(cardName);
  // RenderEngine#renderAbsentCards: the controller's Card.fetch with the
  // request's new-card arguments. The unknown MAIN-card page branch
  // (card-mod-format set/all/html/error.rb:81-86 page_view_for_unknown):
  // an unknown card whose actor may create renders the :new page at the
  // requested address (status 200) — the create form a browser lands on
  // when a deleted card's address reloads — with the requested view riding
  // the modal on that same new card. Without create permission the
  // card-not-found raise stands (page_status_for_unknown's 404).
  let record = (found === undefined || found.isNew === true) && engine.renderAbsentCards
    ? await engine.fetcher.fetchByName(cardName, { new: historyParams?.newCard ?? {} })
    : found;
  if (record !== undefined && record.id === undefined && cardName.includes("_")) {
    record = (await engine.fetcher.fetchByName(cardName.replace(/_/g, " "))) ?? record;
  }
  if (record === undefined || record.name === undefined) {
    throw new Error(`card not found: ${cardName}`);
  }
  const body = await renderPageBytesWithPageConfigInner(
    engine,
    cardName,
    // page_view_for_unknown: the unknown card's page view is :new (the
    // create form); a known card keeps its layout's own main view.
    record.isNew === true ? "new" : undefined,
    historyParams,
    true,
  );
  const status = engine.pageErrorStatus;
  try {
    await engine.render(record.name.s, view, historyParams);
  } catch {
    // the prepare render's own failure surfaces through the main render below
  }
  const rootCard = engine.fetchRenderCard(record.name.s);
  if (rootCard === undefined) throw new Error(`render card not prepared: ${record.name.s}`);
  if (record.isNew === true && !engine.unknownCardCreatable(rootCard)) {
    // page_status_for_unknown: no create permission answers the not_found
    // page (404), not the create form.
    throw new Error(`card not found: ${cardName}`);
  }
  engine.pageErrorStatus = status;
  const modalFormat = new RenderFormat(rootCard, engine, { main: true, nestQuietErrors: true });
  // render_outside_of_layout's `render!` runs on the SAME root format
  // (process_layout.rb:44-48): the modal's editors continue the body's
  // id_counter numbering (the layout's enabled-roles checkboxes consume
  // 1-2 first; the pointer-input journeys' oracle pins 3-12).
  modalFormat.seedRootIdCounter(engine.pageRootIdCounter);
  // The body's main view ran on the same Ruby format; a titled or labeled
  // main view left @content_body set for the denial frame's body.
  const layout = await resolvePageLayout(engine, record);
  const bodyView = layout.mainViewRaw ?? engine.defaultHtmlViewConfig();
  modalFormat.contentBody = bodyView === "titled" || bodyView === "labeled";
  const modal = modalFormat.renderView(view, { main: true, main_view: true }, null);
  return body.includes("</body>") ? body.replace("</body>", `${modal}</body>`) : body + modal;
}

async function renderPageBytesWithPageConfigInner(
  engine: RenderEngine,
  cardName: string,
  requestedView?: string,
  historyParams?: HistoryRenderParams,
  // render_outside_of_layout renders the body with `render_with_layout nil,
  // layout, {}`: no main_render_args, so the main slot carries no main_view
  outsideOfLayout = false,
  // THE AJAX SLOT-REFRESH OPTS (the bare main-view lane): when present, the
  // main view renders with THESE opts and the layout wrap is skipped —
  // show_without_page_layout's `render view, slot_params` (the decko.js
  // post-save slot refresh GET /~<id>/<view>?slot[main]=true&... whose
  // recorded answer is the saved-slot shape: the main format + the main-nest
  // data-slot JSON). The full page warm sequence below still runs: the sync
  // main render's prepare needs every seat the layout lane seats (the
  // late-seat structure sweep especially — a structured body's field rows).
  bareMainOpts?: Record<string, unknown>,
): Promise<string> {
  // process_layout.rb: main! (the root format is the main format) then
  // page_layout — the *layout rule walk happens BEFORE the main render.
  const found = await engine.fetcher.fetchByName(cardName);
  // RenderEngine#renderAbsentCards: the controller's Card.fetch with the
  // request's new-card arguments (new: {} when it carries none).
  // A new card an earlier request cached under this name is absent too: the
  // request's own new-card arguments build it.
  const record = (found === undefined || found.isNew === true) && engine.renderAbsentCards
    ? await engine.fetcher.fetchByName(cardName, { new: historyParams?.newCard ?? {} })
    : found;
  if (record === undefined || record.name === undefined) {
    throw new Error(`card not found: ${cardName}`);
  }
  const layout = await resolvePageLayout(engine, record);

  // process_layout.rb show_with_page_layout: a requested view with an
  // explicit modal or board wrapper (explicit_modal_wrapper?) renders
  // outside the layout — the page renders with its usual main view, and the
  // requested view follows as a modal just before </body>
  // (render_outside_of_layout + body_with_modal).
  if (
    requestedView !== undefined &&
    OUTSIDE_LAYOUT_VIEWS.has(requestedView) &&
    layout.layoutName.toLowerCase() !== "modal"
  ) {
    const body = await renderPageBytesWithPageConfigInner(engine, cardName, undefined, historyParams);
    // render!(view, args) with the main args: prepare the view's closure,
    // then render it on a main format (focal: a denial is the loud one).
    await engine.render(record.name.s, requestedView, historyParams);
    const modalRoot = engine.fetchRenderCard(record.name.s);
    let modal = "";
    if (modalRoot !== undefined) {
      const modalFormat = new RenderFormat(modalRoot, engine, { main: true, nestQuietErrors: true });
      // render_outside_of_layout's `render!` runs on the SAME root format
      // (process_layout.rb:44-48): the modal continues the body's numbering.
      modalFormat.seedRootIdCounter(engine.pageRootIdCounter);
      modal = str(modalFormat.renderView(requestedView, { main: true, main_view: true }, null));
    }
    return body.includes("</body>") ? body.replace("</body>", () => `${modal}</body>`) : body + modal;
  }

  // The requested ?view= wins over the layout chunk (rest.rb view_from_params
  // -> format.page -> show(view)); otherwise the layout's {{_main|view}}
  // chunk names the main view; render_with_layout falls back to
  // default_page_view (= default_nest_view = Cardio.config.default_html_view,
  // :content in production) when the layout carries no view. The page surface's
  // config is active here, so the accessor answers "content".
  // An unknown MAIN card (a trashed or never-existing name) substitutes the
  // requested view with :new — card-mod-format set/all/html/error.rb:81-86
  // page_view_for_unknown (`ok?(:create) ? :new : super`): the create form
  // is the page a deleted card's address reloads to (?view=edit). The
  // substitution needs a REQUESTED view (an absent one keeps the layout's
  // own main — the null the query parser hands down is normalized here);
  // the create-permission gate rides the rendered card below
  // (unknownCardCreatable: no permission — or a render too denied to seat
  // the card — re-raises the not-found raise, page_status_for_unknown's
  // 404).
  const recordIsNew = record.isNew === true;
  const requestedSubstituted =
    recordIsNew && requestedView != null && requestedView !== "new";
  const mainView =
    recordIsNew && requestedSubstituted
      ? "new"
      : (requestedView ?? layout.mainViewRaw ?? engine.defaultHtmlViewConfig());

  // The main render + the full prepare sequence (permission state, search
  // parse gates, structure universe...) — the identical preparation and
  // (card, view) render the bare path runs. Output discarded; the page pass
  // re-renders through the main! format below from warm maps.
  //
  // The raise semantics differ between development and production:
  // development runs raise_all_rendering_errors=true (every nested view
  // error re-raises), production renders the quiet render-error span. A
  // view-dispatch raise here (Date::Error, search BadQuery) must NOT fail
  // the page: the assembly's main! render converts nested raises via
  // nestQuietErrors. Focal gate raises (pointer/set-host options chains)
  // only fire for open/content MAIN views — accepted collateral. A lost
  // root (prepare died before enrichment) rethrows.
  let prepareError: Error | undefined;
  try {
    // The HistoryRenderParams thread (the page-path seam — see the
    // renderPageBytes doc): render() seats the render-time history reader
    // when the view is one of the history views; the sync main render
    // below reads it. undefined passes through render()'s own `= {}`
    // default, so non-history pages are untouched.
    await engine.render(record.name.s, mainView, historyParams);
    // The warm pass is not a served render: its output is discarded and the
    // page re-renders the view below from the warm maps. Ruby renders the
    // main view once, before the layout around it
    // (card/lib/card/format/wrapper.rb:15 `@rendered = yield`, then the
    // layout wrapper at :20-28), so a roles nest in the main body is the
    // request's first and the navbar's comes after it. Drop any
    // ensure_roles consumption the warm pass recorded so the layout pass
    // starts from the request's committed state.
    engine.blankSessionRolesFill?.();
    if (recordIsNew && requestedSubstituted) {
      // page_status_for_unknown: the :new substitution renders only when the
      // actor may create (card-mod-format html/error.rb:85-86); without it —
      // or when the denial left no seated card at all — the not-found raise
      // stands (the host answers the 404 page).
      const substitutedRoot = engine.fetchRenderCard(record.name.s);
      if (substitutedRoot === undefined || !engine.unknownCardCreatable(substitutedRoot)) {
        throw new Error(`card not found: ${cardName}`);
      }
    }
  } catch (error) {
    prepareError = error as Error;
  }
  if (engine.demandSeeds !== undefined && engine.demandSeeds.length > 0) {
    // Collect mode: prepare what earlier passes of this request asked for,
    // as existence + enrichment only (no reference chase), then judge them.
    const seeded = await engine.warmupLayoutReferences(
      engine.demandSeeds.map((name) => ({ name, context: name, mode: "leaf" as const })),
      scanWarmDeps,
      () => ensureCodenameMarksResolvable(engine),
      true,
    );
    if (seeded.cards > 0) await engine.refreshVerdicts();
  }
  const rootCard = engine.fetchRenderCard(record.name.s);
  if (rootCard === undefined) {
    throw prepareError ?? new Error(`render card not prepared: ${record.name.s}`);
  }

  // The chrome session's account-links data must exist before the sync
  // layout render: the *account_link navbar view (and the :core view) read
  // the prepared items synchronously. No-op for signed-out/actor-less
  // sessions.
  await engine.prepareSessionAccountLinks();
  // The page body's [[link]] targets must be warm before the sync render:
  // renderLinkChunk's known/wanted (links.rb add_known_or_wanted_class)
  // reads the warm map, and Ruby's Card.known? is a LIVE fetch — so a cold
  // render whose link targets are not yet prepared emits wanted-card for
  // existing cards (the cold prefetch closure walks {{nest}} references
  // only — nest-syntax.ts referencedNames — leaving the structured
  // template's links unwarm). The main card seeds the SAME bounded BFS the
  // layout warm-up uses (scanWarmDeps: nest refs spine, link targets
  // leaf), so the whole rendered content closure resolves with its link
  // targets.
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
  // {{_self+*referred_to_by}} class)
  // or saw them enriched only AFTER its walk (structure-content junction
  // searches applyStructureContent joins late — the {{+*type+by name}}
  // class). The mainBody render below
  // dispatches these nests synchronously through the card_list view, which
  // reads ONLY the pre-executed map (executeSearch →
  // searchResults.get(key) ?? []) — so they rendered search-no-results with
  // zero queries. Ruby executes these inside the view
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
  // Permission recovery: a prepare render
  // that died before the folded batch landed (an oversized junction
  // OR-tuple can push SQLite past its "Expression tree is too large"
  // limit) leaves the read-permission
  // state unresolved and every prepared card unjudged. The sync gate's
  // unjudged-allowed contract would then render the read-denied MAIN body in
  // full where Ruby emits the denial frame. Resolve the state
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
  // prepareEngine; this page surface binds NO loader, so when the prepared
  // closure actually dispatches the view (any prepared card's content
  // carries a `|configs` nest opt, or the main view IS configs), build it
  // here, once per engine, before the sync render. Pages that never reach
  // :configs pay zero queries.
  if (mainView === "configs" || engine.renderClosureNeedsCoreAdminRuntime()) {
    await engine.ensureCoreAdminRuntime();
  }

  // THE LATE-SEAT STRUCTURE SWEEP — main-body boundary:
  // the prepare render's tail warms and the page surface's own seat paths after
  // it (warmupLayoutReferences, prepareNestClosureSearches) seat cards the
  // prepare render's two structure passes never saw. Process every seat of
  // this page BEFORE the main body dispatch reads their content. See
  // RenderEngine.applyLateSeatStructureContent's doc.
  await engine.applyLateSeatStructureContent();
  // The configure_button verdicts for cards seated since the prepare render
  // (search result items, late structure nests): Ruby judges can_configure?
  // on every card the view renders for, not only the page's main card. A
  // no-op when no newly seated card nests the view.
  await engine.ensureConfigureVerdict();

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
  // pages) and reads the page's own head bytes back — on such pages the
  // CodeRay <pre> content IS the page <head> content. headContent is a
  // read-only walk over warmed state, so building it before the main
  // render is order-safe; the same bytes go into the :html_page wrapper
  // below.
  const head = await headContent(engine, record.name, rootCard);
  engine.seatPageHead(rootCard.key, head);

  // render_with_layout: render! the main view with the main-nest opts
  // (view, nest_name "_main", nest_syntax, main,
  // home_view, main_view, layout). Ruby memoizes this as main.rendered
  // (wrapper.rb:15 `@rendered = yield`, then the wrapper pass at :23-27);
  // the layout body's {{_main}} nest then wraps it with wrap_main
  // (<div id="main">). The assignment is the port's with_wrapper seam, and
  // it MUST come after the main render: mid-render, the root format's
  // @rendered holds whatever the last view dispatch left there — the :raw
  // view's raw source while a `{{_main}}` inside the MAIN card's own
  // content is being chunked.
  const skipSync = engine.skipSyncRender?.() === true;
  const mainBody = skipSync ? "" : rootFormat.renderView(
    mainView,
    bareMainOpts !== undefined
      ? { ...bareMainOpts, view: mainView }
      : {
          nest_name: "_main",
          ...(layout.mainNestSyntax !== undefined ? { nest_syntax: layout.mainNestSyntax } : {}),
          main: true,
          home_view: mainView,
          ...(outsideOfLayout ? {} : { main_view: true }),
          layout: layout.layoutName,
        },
    // show_with_page_layout's render! carries NO optional render opt — the
    // main slot gets no "show" viz (unlike the bare
    // view surface where format.render pins show:[view]). null = no viz (a
    // JS default parameter would revive "show" on undefined).
    null,
  );
  rootFormat.rendered = str(mainBody);
  // The bare main-view lane returns HERE: show_without_page_layout renders
  // the view alone — no layout body, no layout nest warm-ups (the main
  // closure above is complete).
  if (bareMainOpts !== undefined) return str(mainBody);

  // Unknown layouts raise AFTER the main render (wrap_with_wrapper ->
  // raise_wrap_error), never before — matching Ruby's order.
  if (layout.kind === "unknown") {
    throw new UnknownLayoutError(layout.layoutName, layout.unknownKey ?? "");
  }

  // wrap_with_card_layout: the layout card's content processed through the
  // page's own format ({{_main}} -> wrap_main { main.rendered }).
  // Prefetch first: the layout's nest targets (header/footer/skin cards)
  // are outside the main card's inclusion closure, and the sync nest path
  // only reads prepared cards. One warm-up render per DISTINCT target
  // (typically *header + *footer, shared across pages — later pages skip);
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
  // THE LATE-SEAT STRUCTURE SWEEP — layout boundary: the
  // layout warm-up above (warmUpLayoutNests) and its search pass seat cards
  // between the main-body render and the layout content render; process
  // them before the layout dispatch reads their content. See
  // RenderEngine.applyLateSeatStructureContent's doc.
  await engine.applyLateSeatStructureContent();
  // The configure_button verdicts for cards seated since the prepare render
  // (search result items, late structure nests): Ruby judges can_configure?
  // on every card the view renders for, not only the page's main card. A
  // no-op when no newly seated card nests the view.
  await engine.ensureConfigureVerdict();
  const interior = engine.skipSyncRender?.() === true
    ? ""
    : layout.kind === "card"
      ? rootFormat.processLayoutContent(layout.layoutCardContent ?? "")
      : codeDefaultLayoutInterior(rootFormat);
  // The body render's id_counter state (the layout's unique_id consumers —
  // the enabled-roles checkboxes included) is what the modal render
  // continues: Ruby's render_outside_of_layout `render!` runs on the SAME
  // root format (process_layout.rb:44-48). The page lane hands the value
  // to its modal sites through the engine's request-scope state.
  engine.pageRootIdCounter = rootFormat.exportRootIdCounter();

  // show.rb: the :html_page wrapper (head + interior). Byte shape per the
  // show.rb wrapper heredoc: the 6/8/10-space indentation is
  // part of the served bytes, and the heredoc's
  // closing line ends with a newline, so the wrapper's trailing newline is
  // part of the served bytes.
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

// ---------------------------------------------------------------------------
// page_layout (process_layout.rb:36-38 + layout_name_from_rule)
// ---------------------------------------------------------------------------

/** Prepare every card the layout body can dispatch on: the layout's nest
 *  targets, their content references, [[link]] targets, and pointer/list
 *  items (plain-text item lists the closure walk never chases — a navbar
 *  dropdown's items). Enrichment lands in the prepared-card
 *  map, then one verdict refresh so the warm subtree denies exactly like
 *  Ruby. Names resolve exactly like the format does: DeckoName
 *  marks (:codename) through the name environment, RELATIVE names against
 *  the REFERENCING card (format.ts resolveNestName's context is the card
 *  whose content nests the reference: layout-level nests resolve against
 *  the page card, a warmed card's own content refs against that card).
 *  Resolving every hop against the page name warmed spurious names
 *  ("*credit"'s +image warmed as "<page>+image"), the real sync
 *  nest fetch missed the prepared-card map, and the cold page's footer
 *  rendered the nest empty - the junction row (*credit+*image) stores a
 *  NULL key column, so its name resolves only through the prepared/
 *  temp-cache path the reference-context walk actually primes.
 *
 *  BOUNDED + BATCHED (the cold-render burst fix — this chase used to walk
 *  nest refs, link targets, AND pointer items transitively to a fixpoint
 *  through one point-query ladder per name, preparing the whole
 *  navbar-connected site at thousands of driver round trips per cold
 *  render): the reference CLASSES are unchanged — every class still
 *  expands to the same fixpoint the baseline reached, because what renders
 *  is not decidable from content syntax ([[target|label]] is an
 *  existence-only anchor in ordinary content but a real nest through the
 *  navbar chunk walk; a pointer item renders as a full bar) — the burst is
 *  killed by BATCHING instead: prefetch.ts resolves the closure in
 *  reference-BFS rounds, ONE driver.batch per round (round trips scale
 *  with reference DEPTH, not card count), 90-param chunking under the
 *  driver's statement ceiling, and the per-name ladder fallback only for
 *  names with no fetched row (placeholder/virtual semantics preserved
 *  byte-exact). Completeness is unchanged: every card the sync render
 *  reads from the prepared map is prepared before the render starts. */
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
  // Request-scoped memo (DeckoName.requestMemo), shared by every pass of a
  // live render: the scan is a function of the card's name, type code and
  // content and the mode. Memoized scans are frozen (callers only read them).
  // Keyed by the content string first (its hash is computed once per string,
  // and a row's content string is shared by every pass), then by the rest.
  const byContent = DeckoName.requestMemo<Map<string, WarmupScan>>(SCAN_WARM_DEPS_MEMO);
  if (byContent === undefined) return scanWarmDepsUncached(card, mode);
  let memo = byContent.get(card.dbContent);
  if (memo === undefined) {
    memo = new Map();
    byContent.set(card.dbContent, memo);
  }
  const memoKey = `${mode}\n${card.typeCode ?? ""}\n${card.name.s}`;
  const hit = memo.get(memoKey);
  if (hit !== undefined) return hit;
  const found = scanWarmDepsUncached(card, mode);
  for (const r of found.refs) Object.freeze(r);
  for (const r of found.leaves ?? []) Object.freeze(r);
  Object.freeze(found.refs);
  if (found.leaves !== undefined) Object.freeze(found.leaves);
  memo.set(memoKey, Object.freeze(found));
  return found;
}

const SCAN_WARM_DEPS_MEMO = {};

function scanWarmDepsUncached(
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
    (card.dbContent ?? "")
      .split(/\n+/)
      .map((s) => s.replace(/\[\[|\]\]/g, "").trim())
      .filter((s) => s !== "");
  if (!LINKS_ARE_LEAVES) mode = "full";

  if (mode === "nav-item") {
    // view :nav_item (navbar-views.ts): a plain card renders as a link; a
    // Pointer/List renders a dropdown whose items are links
    // (nav_link_in_dropdown): existence + title only.
    if (isItems) for (const item of items()) leaves.push({ name: item, context });
    // A Link list is a dropdown too (Abstract::Items), whose items come from
    // its [[target|label]] chunks; explicit URL targets need no card.
    if (card.typeCode === "link_list") {
      for (const m of (card.dbContent ?? "").matchAll(/\[\[([^\][\n]+?)\]\]/g)) {
        const target = (m[1] ?? "").split("|")[0]?.trim() ?? "";
        if (target !== "" && !/^(\/|https?:|mailto:)/.test(target)) leaves.push({ name: target, context });
      }
    }
    return { refs, leaves };
  }

  for (const piece of scanNests(card.dbContent ?? "")) {
    const nest = piece.nest;
    if (nest === undefined || nest.comment !== undefined) continue;
    refs.push({ name: nest.name, context, mode: nestWarmMode(nest.options.view) });
  }
  // A card rendered through :navbar_links nests each [[link]] target with
  // view :nav_item; anywhere else a [[link]] is an existence-only anchor
  // (renderLinkChunk's known/wanted class), so its target is a leaf.
  for (const m of (card.dbContent ?? "").matchAll(/\[\[([^\][\n]+?)\]\]/g)) {
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
const LINKS_ARE_LEAVES = !debugFlag("DECKO_WARMUP_LINKS_SPINE");

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
  // card.rule_card(:layout) (rule/all.rb:19-21): the rule CACHE walk —
  // rule_card_id -> rule_id_lookup over the card's rule lookup keys, keyed
  // by the anchor's CARD id (pattern/base.rb:75-80). The first lookup key
  // the cache answers wins; its content may still be empty -> first_name
  // nil -> the :default code layout (the walk does not continue).
  const rule = await engine.ruleCardForSetting(
    {
      name: record.name,
      id: record.id,
      typeId: record.typeId,
      typeName:
        record.typeId !== undefined
          ? await engine.fetcher.codenames.nameForId(record.typeId)
          : undefined,
      ...(record.isNew === true ? { isNew: true } : {}),
    },
    "layout",
  );
  const layoutName =
    rule === undefined ? undefined : firstItemOfRuleContent(rule.dbContent);
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

  // Layout.code_layout? — the built-in registry. This port classifies only
  // the :default fallback (the empty-rule case); the other built-ins
  // (simple/pre/no_side/modal) fall through to the unknown branch.
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
 *  child — only the lowercase "_main" spelling fires the main path). */
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
 *  Rendered unstripped per the show.rb wrapper precedent. */
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
  // empty-string contributions the basket produces: the blank between
  // meta_tags and favicon_tag, and
  // universal_edit_button itself, which renders "" on a perms :update
  // denial and the
  // x-wiki link when update is allowed. rss_links
  // renders NIL here and Ruby's join drops nils
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
    (await noindex(engine, rootCard)) ? `${META_TAGS}\n<meta content='noindex' name='robots'>` : META_TAGS,
    "", // a mod basket head view renders "" here
    faviconTagBytes(read),
    stylesheetTagsBytes(read),
    await universalEditButtonTag(engine, rootCard),
    await javascriptTags(engine),
    await scriptVariablesTag(engine),
    await scriptCallsTag(engine),
  ].join("\n");
}

/** card-mod-format set/all/html/head.rb:16-18 `noindex?`: `unknown? ||
 *  :noindex.card.include_item?(name)` — the :meta_tags template adds the
 *  robots noindex meta for an absent card and for any card the *noindex
 *  list names. */
async function noindex(engine: RenderEngine, rootCard: RenderCard): Promise<boolean> {
  if (rootCard.unknown === true) return true;
  const list = await globalSettingContent(engine, "noindex");
  if (list === undefined || list.trim() === "") return false;
  const key = rootCard.name.key;
  return list
    .split(/\n+/)
    .map((item) => item.replace(/^\s*\[\[|\]\]\s*$/g, "").trim())
    .some((item) => {
      try {
        return item !== "" && DeckoName.parse(item).key === key;
      } catch {
        return false;
      }
    });
}

/** card-mod-format set/all/html/head.rb:46-51 view :universal_edit_button
 *  (unknown: :blank, denial: :blank, perms: :update): the update-permission
 *  gate is the VIEW's perms check (ok? :update via Auth.as_id — format.rb
 *  error.rb:27-29 ok?), denial renders :blank (the empty head entry); the
 *  allowed branch renders
 *  `tag "link", rel: "alternate", type: "application/x-wiki", title:
 *  "Edit this page!", href: path(view: :edit)` — Rails' tag builder emits
 *  the self-closing form and `path(view: :edit)` is the "/<url_key>/edit"
 *  path form (`<link rel="alternate"
 *  type="application/x-wiki" title="Edit this page!" href="/Home/edit" />`).
 *  `return if card.new?` (head.rb:47): an id-less page root renders "". */
export async function universalEditButtonTag(
  engine: RenderEngine,
  rootCard: RenderCard,
): Promise<string> {
  if (rootCard.id === undefined) return ""; // head.rb:47 return if card.new?
  const updateOk = await engine.updateVerdictForCard?.(rootCard);
  if (updateOk === false) return ""; // perms :update denial -> :blank
  // path(view: :edit): Card::Path marks a known card by its url_key
  // (lib/card/path.rb interpret_mark), so punctuation the key drops is
  // dropped from the href too ("Organizer(s)" -> "Organizer_s").
  return (
    `<link rel="alternate" type="application/x-wiki" title="Edit this page!" ` +
    `href="/${h(rootCard.name.urlKey)}/edit" />`
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
 *  Codename-less decks: Ruby's head assembly
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
 *  JAVASCRIPT comment, main_javascript_tag]. The remote tags are the mods'
 *  manifest "remote" groups. */
async function javascriptTags(engine: RenderEngine): Promise<string> {
  const scriptUrl = await assetOutputUrl(engine, "script");
  return [
    applyScriptIntegrity(REMOTE_SCRIPT_TAGS.replace(STOCK_FONT_AWESOME_TAG, fontAwesomeHeadTag(engine.fontAwesomeAssetMode))),
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
 *  wrapper); decko_script_variables order: rootUrl, doubleClick,
 *  cssPath, signed_in. */
async function scriptVariablesTag(engine: RenderEngine): Promise<string> {
  const cssPath = applyDeploymentCssRevision(await assetOutputUrl(engine, "style"));
  // decko_script_variables order: rootUrl, doubleClick, cssPath,
  // signed_in. signed_in is the SESSION (Auth.signed_in? — Auth.current_id
  // != AnonymousID, auth/current.rb), not the read-verdict actor: the page
  // chrome session (engine.pageSession) carries it; undefined = signed out
  // (signed_in: false).
  const signedIn = engine.pageSession?.signedIn === true;
  // decko.rootUrl is card_url("") (mod/script/set/all/head_javascript.rb:35)
  // = Env.origin + card_path("") (card/lib/card/env/location.rb:19-21 + :6-16,
  // card_path "" -> relative_url_root + "/"). Env.origin is PER RENDER
  // (card/lib/card/env/serializable.rb:20-22: Cardio.config.deck_origin ||
  // "#{protocol}#{request&.host_with_port}"), and this builder is reached on
  // BOTH surfaces (render.ts seats this same headContent for an unseated
  // root whose content nests the head card's :core). The page surface runs
  // it under runWithPageConfig (renderPageBytes) with the production
  // deck_origin = "https://example.com"; the VIEW surface runs it with the
  // railtie default (card/lib/cardio/railtie.rb:28 config.deck_origin = nil)
  // and no controller (card/lib/card/env.rb:17), so origin is "" and
  // card_url("") is the bare "/". engine.envOriginConfig() is that
  // per-surface value (render/deck-origin.ts) — reading it here is what
  // the constant could not do.
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
 *  ` -> \\`, $ -> \\$. */
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
 *  remote_script_tags nest — the installed mods' manifest "remote" groups in
 *  the deck's *all+*script item order (format, ace editor, bootstrap).
 *  Constant for a deck with a fixed mod set (the CDN urls live in the gems'
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
 *  (deployment-follow-live-config.ts scriptIntegrityBySrc): the deployment
 *  head's remote CDN script tags carry integrity="..." after crossorigin and
 *  before an optional referrerpolicy. UNSET = identity (the gem-era tags
 *  without integrity). Exported for the deployment-config test. */
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
 *  absolute fog URL exactly like the head pieces; the bare view surface keeps
 *  the raw "(bucket)/..." bytes (the view-surface contract). Runs LAST so
 *  nested view output is covered wholesale.
 *  The prefix reads the process-wide deployment asset host when set
 *  (mirroring Ruby's process-wide storage config); unset = the fog
 *  CLOUD_URL_PREFIX. Note the two constants' slash shapes: the fog
 *  host carries a trailing slash (empty bucket -> the double slash), the
 *  deployment host does not (a REAL bucket -> single slash), and each is
 *  joined to "/files/" to reproduce exactly its own URL form. */
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
