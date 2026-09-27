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
// exact prepare sequence + parse gates the bare view lane exercises —
// permission state, structure universe, search preparation, pointer/set
// preloads), then the page assembles from the warm maps. One throwaway bare
// render per cold page buys a minimal render.ts diff (the file is shared
// with a parallel round; the only render.ts hunk on this lane is the
// renderPage method itself).
//
// Production-vs-capture environment deltas this module pins (see
// brandonDojoTech/tmp/wrong-goal-hunt/dual-lane-recapture-runbook.md, the
// five production-equivalent settings): default_html_view = :content on the
// page path only (the bare view lane keeps the development default :titled),
// deck_origin https://culturesmith.com, and carrierwave cloud attachments
// resolving to the absolute bucket URL. The page-lane JSONL bytes are the
// contract; every template below is diff-pinned against them.

import type { CardRecord } from "../fetch/card-record.js";
import { DeckoName } from "../name.js";
import { findRule } from "../rules/lookup.js";
import { applyViewOverride } from "../rules/apply.js";
import { scanNests, referencedNames } from "./nest-syntax.js";
import { RenderFormat } from "./format.js";
import type { RenderCard } from "./format.js";
import { h } from "./slot-html.js";
import type { RenderEngine } from "../render.js";

/** The production `Cardio.config.deck_origin` the capture pinned
 *  (runbook production-equivalent setting 4; Env.origin with no request). */
const DECK_ORIGIN = "https://culturesmith.com";

/** The production `Cardio.config.default_html_view` is RESOLVED, not
 *  hardcoded here (merge pass 2): the engine folds the deck's
 *  `*all+*default html view` rule (render.ts parseDeckDefaultNestView) and
 *  validates it (an unregistered value — the anonymized corpus DBs carry
 *  rule 22769 = "fnvmwmg", an anonymizer token — logs loudly and falls
 *  back to the railtie :titled). renderPageBytes reads it through
 *  engine.ensureDeckDefaultHtmlView before the main-view pick. The
 *  lane-era hardcoded "content" was the production rule's VALUE, valid
 *  only for a DB that carries the real rule. */

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
 */
export async function renderPageBytes(
  engine: RenderEngine,
  cardName: string,
): Promise<string> {
  // process_layout.rb: main! (the root format is the main format) then
  // page_layout — the *layout rule walk happens BEFORE the main render.
  const record = await engine.fetcher.fetchByName(cardName);
  if (record === undefined || record.name === undefined) {
    throw new Error(`card not found: ${cardName}`);
  }
  const layout = await resolvePageLayout(engine, record);

  // Layout.main_nest_opts: the {{_main|view}} chunk names the main view;
  // render_with_layout falls back to default_page_view (= default_nest_view,
  // production :content) when the layout carries no view. The fallback is
  // the deck's RESOLVED rule value (validated; railtie :titled when absent
  // or unregistered) — the fold is guaranteed via the async seam because
  // no cold render has run yet at this point.
  const mainView = layout.mainViewRaw ?? (await engine.ensureDeckDefaultHtmlView()) ?? "titled";

  // The main render + the full prepare sequence (permission state, search
  // parse gates, structure universe...) — the identical preparation and
  // (card, view) render the bare path runs. Output discarded; the page pass
  // re-renders through the main! format below from warm maps.
  //
  // The raise semantics differ between the lanes: the bare capture ran
  // development (raise_all_rendering_errors=true — every nested view
  // error re-raises, the view-lane sentinels), the page capture ran
  // production (nested errors -> the quiet render-error span). A view-
  // dispatch raise here (Date::Error, search BadQuery) must NOT fail the
  // page: the assembly's main! render converts nested raises via
  // nestQuietErrors. Focal gate raises (pointer/set-host options chains)
  // only fire for open/content MAIN views (2 corpus pages) — accepted
  // collateral. A lost root (prepare died before enrichment) rethrows.
  let prepareError: Error | undefined;
  try {
    await engine.render(record.name.s, mainView);
  } catch (error) {
    prepareError = error as Error;
  }
  const rootCard = engine.fetchRenderCard(record.name.s);
  if (rootCard === undefined) {
    throw prepareError ?? new Error(`render card not prepared: ${record.name.s}`);
  }

  // The root format: main! context (h1 header, focal gates) + production
  // quiet-error semantics for nested views. The default nest view needs no
  // override — RenderFormat.defaultNestView reads the same engine rule
  // (validated) the main-view pick above used.
  const rootFormat = new RenderFormat(rootCard, engine, {
    main: true,
    nestQuietErrors: true,
  });

  // render_with_layout: render! the main view with the main-nest opts (the
  // captured data-slot JSON: view, nest_name "_main", nest_syntax, main,
  // home_view, main_view, layout). Ruby memoizes this as main.rendered; the
  // layout body's {{_main}} nest then wraps it with wrap_main (<div id="main">).
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
  rootFormat.mainNestBody = await applyMainViewOverride(engine, rootCard, mainView, mainBody);

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
  if (layout.kind === "card") {
    await ensureCodenameMarksResolvable(engine);
    await warmUpLayoutNests(engine, layout.layoutCardContent ?? "", record.name.s);
    await ensureCodenameMarksResolvable(engine);
  }
  const interior =
    layout.kind === "card"
      ? rootFormat.processLayoutContent(layout.layoutCardContent ?? "")
      : codeDefaultLayoutInterior(rootFormat);

  // show.rb: the :html_page wrapper (head + interior). Byte shape pinned by
  // the page-lane capture: the wrapper heredoc's 6/8/10-space indentation is
  // part of the served bytes on every captured page.
  const head = await headContent(engine, record.name);
  return (
    `      <!DOCTYPE HTML>\n` +
    `      <html class="h-100">\n` +
    `        <head>\n` +
    `          ${head}\n` +
    `        </head>\n` +
    `        ${resolveCloudUrls(interior)}\n` +
    `      </html>`
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
 *  targets, their content references and [[link]] targets, and pointer/list
 *  items (plain-text item lists the closure walk never chases — the
 *  *Opportunities dropdown items). Worklist to a fixpoint (bounded by the
 *  finite warmed set); enrichment via prepareItemForRender, then one
 *  verdict refresh so the warm subtree denies exactly like the capture.
 *  Names resolve exactly like the format does: DeckoName marks (:codename)
 *  through the name environment, RELATIVE names against the REFERENCING
 *  card (format.ts resolveNestName's context is the card whose content
 *  nests the reference: layout-level nests resolve against the page card,
 *  a warmed card's own content refs against that card). Resolving every
 *  hop against the page name warmed spurious names ("*credit"'s +image
 *  warmed as "Aikido Oak Cliff+image"), the real sync nest fetch missed
 *  the prepared-card map, and the cold page's footer rendered the nest
 *  empty - the junction row (*credit+*image) stores a NULL key column, so
 *  its name resolves only through the prepared/temp-cache path the
 *  reference-context walk actually primes. */
async function warmUpLayoutNests(
  engine: RenderEngine,
  layoutContent: string,
  pageName: string,
): Promise<void> {
  const warmed = new Set<string>();
  const queue: Array<{ name: string; context: string }> = [];
  for (const piece of scanNests(layoutContent)) {
    if (piece.kind === "nest" && piece.nest !== undefined && piece.nest.name !== "_main") {
      queue.push({ name: piece.nest.name, context: pageName });
    }
  }
  while (queue.length > 0) {
    await ensureCodenameMarksResolvable(engine);
    const batch = queue.splice(0, queue.length);
    for (const { name: raw, context } of batch) {
      let resolved: string;
      try {
        const parsed = DeckoName.parse(raw);
        resolved = parsed.isAbsolute ? parsed.s : parsed.absoluteName(DeckoName.parse(context)).s;
      } catch {
        continue; // unresolved mark: the real nest render reports it
      }
      if (warmed.has(resolved)) continue;
      warmed.add(resolved);
      let card = fetchPrepared(engine, resolved);
      if (card === undefined) {
        try {
          await engine.prepareItemForRender(resolved);
        } catch {
          continue; // unresolvable: the real nest renders the substitution
        }
        card = fetchPrepared(engine, resolved);
        if (card === undefined) continue;
      }
      enqueueWarmDeps(card, queue, resolved);
    }
  }
  await engine.refreshVerdicts();
}

/** fetchRenderCard with the cold-mark parse neutralized (the sync mark
 *  resolution throws CodenameNotFoundError when the temporary-cache reset
 *  has wiped a lexicon entry; ensureCodenameMarksResolvable re-primes). */
function fetchPrepared(engine: RenderEngine, name: string) {
  try {
    return engine.fetchRenderCard(name);
  } catch {
    return undefined;
  }
}

/** The next warm-up generation: nest references, [[link]] targets (the
 *  navbar chunk walk nests link targets), and pointer/list item names.
 *  Every pushed name keeps the REFERENCING card as its resolution context. */
function enqueueWarmDeps(
  card: { dbContent: string; typeCode?: string },
  queue: Array<{ name: string; context: string }>,
  referencingName: string,
): void {
  for (const ref of referencedNames(card.dbContent)) {
    queue.push({ name: ref.name, context: referencingName });
  }
  for (const m of card.dbContent.matchAll(/\[\[([^\][\n]+?)\]\]/g)) {
    const target = (m[1] ?? "").split("|")[0]?.trim() ?? "";
    if (target !== "") queue.push({ name: target, context: referencingName });
  }
  if (card.typeCode === "pointer" || card.typeCode === "list") {
    for (const item of card.dbContent.split(/\n+/).map((s) => s.replace(/\[\[|\]\]/g, "").trim())) {
      if (item !== "") queue.push({ name: item, context: referencingName });
    }
  }
}

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

async function headContent(engine: RenderEngine, name: DeckoName): Promise<string> {
  // head_views order + empty-string contributions (universal_edit_button's
  // denial: :blank renders ""; rss_links renders "" for the anonymous
  // no-rss capture) — the blank separators the captured pages pin.
  return [
    await pageTitleTag(engine, name),
    META_TAGS,
    "", // universal_edit_button (perms :update, denial :blank -> "")
    await faviconTag(engine),
    await stylesheetTags(engine),
    "", // rss_links ("" on the captured surface — the css/comment blank)
    await javascriptTags(engine),
    await scriptVariablesTag(engine),
    await scriptCallsTag(engine),
  ].join("\n");
}

/** html/head.rb view :page_title: [global_setting(:title), safe_name]
 *  joined " - " (name first). global_setting reads the setting CARD's own
 *  db_content (rule.rb:5-9), not a rule walk. */
async function pageTitleTag(engine: RenderEngine, name: DeckoName): Promise<string> {
  const global = await globalSettingContent(engine, "title");
  const parts: string[] = [];
  if (name.s !== "") parts.push(name.s);
  if (global !== undefined && global.trim() !== "") parts.push(global);
  return `<title>${h(parts.join(" - "))}</title>`;
}

/** Card::Rule.global_setting(name): the codename card's db_content
 *  (rule.rb:5-9 — `Card[name]` with the codename mark). */
async function globalSettingContent(
  engine: RenderEngine,
  codename: string,
): Promise<string | undefined> {
  const card = await engine.fetcher.fetchByName(`:${codename}`);
  const content = card?.dbContent;
  return content === undefined || content === null ? undefined : content;
}

const META_TAGS =
  `<meta charset='UTF-8'>\n<meta content='width=device-width, initial-scale=1.0' name='viewport'>`;

/** view :favicon_tag: nest(:favicon, view: :link_tag) — the *favicon image
 *  card's attachment URL at the :small carrierwave variant. */
async function faviconTag(engine: RenderEngine): Promise<string> {
  const favicon = await globalSettingContent(engine, "favicon");
  const src = cloudAttachmentUrl(favicon, "small");
  if (src === undefined) return "";
  return `<link rel="shortcut icon" href="${src}" />`;
}

/** stylesheet_tags: [nest(:style_mods, :remote_style_tags), main_stylesheet_tag].
 *  The remote (mod-manifest CDN) surface is constant for this deck's pinned
 *  gems; the main tag resolves *all+*style+*asset output. */
async function stylesheetTags(engine: RenderEngine): Promise<string> {
  const stylePath = await assetOutputUrl(engine, "style");
  return [
    `<link href="https://fonts.googleapis.com/css2?family=Material+Icons" media="all" rel="stylesheet" type="text/css" />`,
    `<link media="all" rel="stylesheet" type="text/css" href="${stylePath}" />`,
  ].join("\n");
}

/** javascript_tags: [nest(*script, :remote_script_tags), MAIN DECKO
 *  JAVASCRIPT comment, main_javascript_tag]. The remote tags are the pinned
 *  mods' manifest "remote" groups (constant bytes across the corpus). */
async function javascriptTags(engine: RenderEngine): Promise<string> {
  const scriptUrl = await assetOutputUrl(engine, "script");
  return [
    REMOTE_SCRIPT_TAGS,
    `<!-- MAIN DECKO JAVASCRIPT -->`,
    `<script src="${scriptUrl}"></script>`,
  ].join("\n");
}

/** The *all+*<setting>+*asset output card's content, resolved to the fog
 *  cloud URL (asset_outputter.rb asset_output_url). */
async function assetOutputUrl(engine: RenderEngine, settingCodename: string): Promise<string> {
  // The rule card "*all+*<setting>" (the universe default asset card).
  const rule = await engine.fetcher.fetchByName(`*all+*${settingCodename}`);
  if (rule?.name === undefined) return "";
  const output = await engine.fetcher.fetchByName(`${rule.name.s}+*asset output`);
  return cloudAttachmentUrl(output?.dbContent) ?? "";
}

/** (bucket)/<id>/<file>.<ext> -> the absolute fog cloud URL; the :size
 *  variant suffix rides the file name when requested (favicon :small). */
function cloudAttachmentUrl(
  content: string | null | undefined,
  size?: string,
): string | undefined {
  if (content === undefined || content === null) return undefined;
  const trimmed = content.trim();
  const match = /^\([^()\s]+\)\/(.+)$/.exec(trimmed);
  if (match === null) return undefined;
  let path = match[1] ?? "";
  if (size !== undefined) {
    const dot = path.lastIndexOf(".");
    path = dot === -1 ? `${path}-${size}` : `${path.slice(0, dot)}-${size}${path.slice(dot)}`;
  }
  return `${CLOUD_URL_PREFIX}${path}`;
}

/** head_javascript.rb view :script_variables (javascript_tag + the CDATA
 *  wrapper); decko_script_variables order pinned: rootUrl, doubleClick,
 *  cssPath, signed_in. */
async function scriptVariablesTag(engine: RenderEngine): Promise<string> {
  const cssPath = await assetOutputUrl(engine, "style");
  return (
    `<script>\n//<![CDATA[\n` +
    `decko.rootUrl='${DECK_ORIGIN}/';\n` +
    `decko.doubleClick='signed_in';\n` +
    `decko.cssPath='${cssPath}';\n` +
    `decko.signed_in=false;\n` +
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

/** The page-path cloud attachment resolution: attachment URLs inside the
 *  assembled interior (header logo, image cores) must resolve to the
 *  absolute fog URL exactly like the head pieces; the bare view lane keeps
 *  the raw "(bucket)/..." bytes (different capture env — the view-lane
 *  contract). Runs LAST so nested view output is covered wholesale. */
function resolveCloudUrls(html: string): string {
  return html.replace(
    /\([^()\s]+\)\/(\d+\/[^\s"'<>)]+\.[A-Za-z0-9]+)/g,
    `${CLOUD_URL_PREFIX}$1`,
  );
}
