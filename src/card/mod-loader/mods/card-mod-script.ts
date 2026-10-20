// The card-mod-script gem (card-mod-script-0.20.0), ported through the mod
// loader.
//
// The gem's tree (the installed
// card-mod-script-0.20.0/): sixteen set files (7 abstract, 1 all, 1 right,
// 1 self, 4 type, 2 type_plus_right), two lib/ modules, two config/
// initializers, and data/real.yml. The compat report
// (tools/compat-report/mod-compat-report.json, gem ===
// 'card-mod-script-0.20.0', classification.metrics.htmlViewsMissingNames)
// lists six missing html views: compressed, javascript_include_tag,
// javascript_tags, remote_script_tags, script_calls, script_variables.
//
// Five of the six are ported here (the engine's flat view registry serves
// the html format only, so the Ruby set-module layering that shares one
// view name across patterns is reproduced as dispatch INSIDE the viewFn):
// - script_variables, script_calls, javascript_tags (all/head_javascript.rb)
// - javascript_include_tag (three Ruby layers merged: all/head_javascript.rb:
//   29-31 fallback, abstract/00_script.rb:78-80 script-family,
//   right/script.rb:8-12 *script-list walk)
// - remote_script_tags (two Ruby layers merged: type_plus_right/set/
//   script.rb:12-23 rule-card walk, type_plus_right/mod/script.rb:18-26
//   mod-remote walk; other cards raise UnsupportedViewError like Ruby)
//
// ORACLE PIN: the byte facts below are pinned against the decko oracle
// app (RAILS_ENV=development `bundle exec decko runner`); values quoted
// inline are its rendered bytes. Pinned facts used in this file:
// - script_variables bytes:
//   "<script>\n//<![CDATA[\ndocko.rootUrl='/';\ndocko.doubleClick='signed_in';"
//   + "\ndocko.cssPath='/files/<id>/<digest>.css';\ndocko.signed_in=true;\n"
//   + "\n//]]>\n</script>" (runner ran as bot -> signed_in true; the
//   headless engine's anonymous default is false)
// - script_calls wrapper + trailing trigger_slot_ready line (the oracle's
//   content additionally carries two cross-mod basket entries,
//   setAceConfig/setTinyMCEConfig, added by card-mod-ace_editor and
//   card-mod-tinymce_editor through basket[:script_calls] - not ported, see
//   below)
// - javascript_tags join shape: remote_script_tags bytes + "\n" +
//   "<!-- MAIN DECKO JAVASCRIPT -->" + "\n" + main tag
// - main tag: '<script src="/files/<id>/<digest>.js"></script>'
// - javascript_include_tag fallback bytes:
//   "\n<!-- javascript_include_tag not overridden for NAME -->\n"
// - script-family bytes: '<script src="/<url_key>.js"></script>'
//   (path(format: :js) -> "/#{url_key}.js")
// - remote_script_tags mod-branch bytes: one Rails script tag per remote
//   item, joined "\n"; the oracle's tags carry crossorigin/referrerpolicy
//   attributes that come from the mods' manifest.yml config hashes (a
//   filesystem surface - see below)
// - Card.config.double_click == :signed_in (lib/card/mod/script.rb:1,
//   "Cardio::Railtie.config.double_click = :signed_in");
//   Env.origin == "" for a requestless runner, so card_url("") == "/"
//   (card-1.110.0 lib/card/env/location.rb:19-21)
//
// NOT ported (honest remainder):
// - view :compressed (abstract/00_script.rb:9-12) and the js-format :core
//   overrides (01_java_script.rb:6-8 _render_raw, 02_coffee_script.rb:22-24
//   CoffeeScript.compile) live in `format :js` / the base format - the TS
//   engine has an html format only (src/card/render/format.ts), and
//   registering those view names flat would claim html-format support Ruby
//   does not give. The compat report's viewsByFormat.html entry for
//   "compressed" is a parser artifact; the only Ruby definition is the js
//   one.
// - the html :core override (00_script.rb:73-76, CodeRay-highlighted div)
//   IS ported: java_script cards reach it through the langForTypeCode
//   dispatch (views.ts core branch, renderRaw -> highlight(:js) ->
//   processContent with the family's :nest_only chunk list). The byte-port
//   runs on the code-highlighting module's java_script scanner (the same
//   state machine the html scanner delegates <script> bodies to).
//   coffee_script's html :core is NOT this file's
//   highlight path (Abstract::CoffeeScript's base-format view :core compiles
//   first - 02_coffee_script.rb:23-25); it stays unported (no render
//   surface exercises it headlessly).
// - lib/cardio/utils/ansi2_html.rb: consumed only by the
//   validate_javascript_syntax error message (type/java_script.rb:8) - no
//   reachable consumer headlessly.
// - right/script.rb:1-5 assign_type :list + ok_to_read? true and the
//   card-method layers of the abstract modules (compress?, bare_compile,
//   valid_file_extensions, new_asset_constants, subpath, ...): card
//   behavior the manifest format does not carry (no events/methods field).
// - basket[:script_calls] entries (all/head_javascript.rb:5): the oracle
//   deck carries setAceConfig/setTinyMCEConfig entries added by OTHER mods
//   at load time. The headless port reads an empty basket -> only
//   trigger_slot_ready renders. Cross-mod basket population has no manifest
//   surface.
// - the mod-branch remote items' tag ATTRIBUTES (crossorigin,
//   referrerpolicy): they live in each mod's manifest.yml "remote" group
//   config hashes (card-mod-assets set/abstract/mod_assets.rb:73-75
//   manifest_group_items). The card surface (the +*group remote card's
//   content, group_remote.rb:29-31) carries the src list only - the port
//   emits src-only tags from that surface, the established substitution
//   card-mod-assets.ts:64-77 made for the same manifest surface.
// - lib/javascript/*.js assets, data/real.yml seeds, config/early/
//   init_execjs.rb (a require), the README: no render-path surface.

import { applyFontAwesomeAssetConfiguration, fontAwesomeHeadTag, STOCK_FONT_AWESOME_TAG } from "../../render/font-awesome.js";
import { UnsupportedViewError, type ViewContext, type ViewFn } from "../../render/format.js";
import { applyDeploymentCssRevision } from "../../render/head-views.js";
import { attachmentUrl } from "../../render/views.js";
import { h } from "../../render/slot-html.js";
import { deckoRootUrl } from "../../render/deployment-follow-live-config.js";
import { serializerFollowsLive } from "../../render/deployment-follow-live-config.js";
import { DeckoName } from "../../name.js";
import { ruleNamesForCard } from "../../set-patterns/rule-names.js";
import { modAssetsGroupListHtml } from "./card-mod-assets.js";
import type { PatternCardInput } from "../../set-patterns/types.js";
import type {
  DeckoModManifest,
  ModEngineHost,
  ModEventFn,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// shared helpers - the param_or_rule_card + asset-output seams
// ---------------------------------------------------------------------------

/** card-mod-format set/all/html/head.rb:79-81 param_or_rule_card:
 *  `params[setting]&.card || root.card.rule_card(setting)`. The headless
 *  engine has no request params, so the port is the rule_card walk:
 *  ruleNamesForCard in pattern precedence (lib/card/rule/all.rb:9-15 shape,
 *  the same seam card-mod-help.ts#helpRuleCard walks) against the prepared
 *  render-card map (map miss = rule card does not exist). */
function paramOrRuleCard(ctx: ViewContext, settingCodename: string) {
  const card = ctx.fmt.card;
  if (card.unknown === true) return undefined;
  const input: PatternCardInput = {
    name: card.name.s,
    id: card.id,
    typeId: card.typeId,
    typeName: card.typeName,
  };
  if (card.name.isCompound) {
    const leftKey = card.name.leftName?.key;
    const left =
      leftKey !== undefined ? ctx.fmt.engine.fetchRenderCard(leftKey) : undefined;
    input.leftTypeName = left?.typeName;
  }
  for (const candidate of ruleNamesForCard(input, `*${settingCodename}`)) {
    const record = ctx.fmt.engine.fetchRenderCard(candidate);
    if (record === undefined) continue;
    if (ctx.fmt.engine.isDenied(record)) continue; // ok?(:read) false
    return record;
  }
  return undefined;
}

/** card-mod-assets set/abstract/asset_outputter.rb:78-82 asset_output_url:
 *  `asset_output_card.file&.url`. The file card (card_accessor :asset_output,
 *  asset_outputter.rb:4) stores the carrierwave identifier in db_content
 *  (oracle deck: the "*all+*script+*asset output" card's db_content is
 *  "<id>/<digest>.js") and the local file store serves it under /files/
 *  (card-mod-carrierwave lib/carrier_wave/file_card_uploader.rb:111) -
 *  the oracle's URLs ("/files/<id>/<digest>.js") are exactly that
 *  composition. Undefined
 *  when the output card is absent (Ruby: file nil -> url nil). */
function assetOutputUrl(ctx: ViewContext, cardName: string): string | undefined {
  const outputCard = ctx.fmt.engine.fetchRenderCard(`${cardName}+*asset output`);
  const content = outputCard?.dbContent;
  if (content === undefined || content === "") return undefined;
  // FileCardUploader#url returns web content unchanged and derives a fog
  // URL for cloud identifiers. Prefixing either with /files/ corrupts the
  // actual script URL when this mod view is nested by a layout card.
  if (/^(?:https?:|\()/.test(content.trim())) {
    return attachmentUrl(content, undefined, undefined, ctx.fmt.engine.imageCdnHost);
  }
  return `/files/${content}`;
}

/** The right part is the *script setting card (Right::Script / the
 *  type_plus_right "*script" anchors match by the junction's right key). */
function rightIsScript(card: ViewContext["fmt"]["card"]): boolean {
  return card.name.isCompound && card.name.rightName?.key === "*script";
}

/** The left part's type codename (the type_plus_right patterns key on the
 *  left card's type: Set for rule cards, Mod for mod asset cards). Undefined
 *  when the left side is not a fetched card. */
function leftTypeCode(ctx: ViewContext): string | undefined {
  const card = ctx.fmt.card;
  if (!card.name.isCompound) return undefined;
  const leftKey = card.name.leftName?.key;
  if (leftKey === undefined) return undefined;
  return ctx.fmt.engine.fetchRenderCard(leftKey)?.typeCode;
}

/** Nest one view of an already-warm card name through the engine's live
 *  registry (Ruby's `card.format(:html).render :view` on the item card).
 *  Returns undefined when the card is not prepared (the caller's compact). */
function renderCardView(ctx: ViewContext, name: string, view: string): string | undefined {
  const target = ctx.fmt.engine.fetchRenderCard(name);
  if (target === undefined) return undefined;
  return ctx.fmt.nestRecord(target, view);
}

// ---------------------------------------------------------------------------
// set/all/head_javascript.rb - the deck-head script views
// ---------------------------------------------------------------------------

/** head_javascript.rb:48-50 trigger_slot_ready - the literal slot-ready
 *  bootstrap line. */
const TRIGGER_SLOT_READY =
  "$('document').ready(function() { $('.card-slot').trigger('decko.slot.ready'); })";

/** Rails ActionView javascript_tag wrapper (actionview-7.2.3.2
 *  lib/action_view/helpers/javascript_helper.rb:75-93 javascript_tag +
 *  javascript_cdata_section, TagHelper content_tag): `<script>` +
 *  "\n//<![CDATA[\n" + content + "\n//]]>\n" + `</script>`. The oracle pins
 *  the exact bytes for script_variables/script_calls. */
function javascriptTag(content: string): string {
  return `<script>\n//<![CDATA[\n${content}\n//]]>\n</script>`;
}

/** head_javascript.rb:33-40 decko_script_variables, in the fixed hash order:
 *  rootUrl / doubleClick / cssPath / signed_in.
 *  - decko.rootUrl: card_url("") (head_javascript.rb:35). location.rb:19-21
 *    card_url = Env.origin + card_path(rel); the oracle's requestless
 *    origin is "" -> "/". The engine has no request origin - the port emits the same
 *    requestless-root bytes.
 *  - decko.doubleClick: Card.config.double_click, set to :signed_in by this
 *    gem's lib/card/mod/script.rb:1 (the Railtie config line);
 *    script_variable_to_js's else branch single-quotes it
 *    (head_javascript.rb:58-59) -> 'signed_in'.
 *  - decko.cssPath: main_stylesheet_path = nest(param_or_rule_card(:style),
 *    view: :stylesheet_path) (card-mod-format head.rb:75-77). The
 *    :stylesheet_path view is card-mod-style's (set/type_plus_right/set/
 *    style.rb:28-34 -> card.asset_output_url), so the bytes come from the
 *    live view registry - rendered here through the real nest so the
 *    composition with card-mod-style produces the oracle's
 *    "/files/..." bytes. A deck with no *style rule is an unpinned Ruby
 *    state (nest of nil); the port omits the line (documented divergence,
 *    never exercised by real decks, which always seed *style rules).
 *  - decko.signed_in: Auth.signed_in? (card-1.110.0 lib/card/auth/
 *    current.rb:45-47, current_id != AnonymousID). The engine has no auth
 *    surface - the anonymous default false. (The oracle runner ran as bot:
 *    true.) */
function deckoScriptVariables(ctx: ViewContext): string {
  const lines: string[] = [];
  // card_url("") = Env.origin + card_path("": the VIEW lane runs the
  // railtie default (deck_origin nil) UNLESS the host config set the deck
  // origin — engine.envOriginConfig() is the
  // per-surface value (the page path's scriptVariablesTag precedent).
  const rootUrl = deckoRootUrl() ?? `${ctx.fmt.engine.envOriginConfig?.() ?? ""}/`;
  lines.push(`decko.rootUrl='${rootUrl}';`);
  lines.push("decko.doubleClick='signed_in';");
  const styleRule = paramOrRuleCard(ctx, "style");
  if (styleRule !== undefined) {
    const cssPath = ctx.fmt.nestRecord(styleRule, "stylesheet_path");
    lines.push(`decko.cssPath='${applyDeploymentCssRevision(cssPath)}';`);
  }
  // Auth.signed_in? (auth/current.rb) — the PAGE CHROME session
  // (engine.pageSession), not the read-verdict actor; undefined = signed
  // out (the anonymous surface's false, byte-identical). Signed-in
  // sessions render true.
  lines.push(`decko.signed_in=${ctx.fmt.engine.pageSession?.signedIn === true};`);
  return lines.join("\n") + "\n";
}

/** head_javascript.rb:9-15 view :script_variables, unknown: true,
 *  cache: :never, perms: :none - javascript_tag over the "k=v;\n" lines. */
const scriptVariablesView: ViewFn = (ctx) => {
  return javascriptTag(deckoScriptVariables(ctx));
};

/** head_javascript.rb:17-23 view :javascript_tags, unknown: true,
 *  cache: :force, perms: :none:
 *  `return unless (asset_card = param_or_rule_card :script)` -> nil renders
 *  "" ; else the array [nest(asset_card, view: :remote_script_tags),
 *  "<!-- MAIN DECKO JAVASCRIPT -->", main_javascript_tag(asset_card)] -
 *  the render machinery joins array view results with "\n" (oracle bytes:
 *  single "\n" between the three parts). main_javascript_tag (:42-44) =
 *  javascript_include_tag asset_card.asset_output_url -> Rails'
 *  `<script src="..."></script>`. When the asset output card is absent
 *  (Ruby: file&.url nil -> the tag has no URL - unpinned sub-state) the
 *  main tag is omitted. */
const javascriptTagsView: ViewFn = (ctx) => {
  const assetCard = paramOrRuleCard(ctx, "script");
  if (assetCard === undefined) return "";
  const parts: string[] = [];
  parts.push(ctx.fmt.nestRecord(assetCard, "remote_script_tags"));
  parts.push("<!-- MAIN DECKO JAVASCRIPT -->");
  const outputUrl = assetOutputUrl(ctx, assetCard.name.s);
  if (outputUrl !== undefined) {
    parts.push(`<script src="${h(outputUrl)}"></script>`);
  }
  return parts.join("\n");
};

/** Rails escape_javascript (action_view/helpers/javascript_helper.rb
 *  JAVASCRIPT_ESCAPE_MAP order): \\ -> \\\\, </ -> <\\/, newlines -> \\n,
 *  " -> \\", ' -> \\', \` -> \\`, $ -> \\$.
 *  (The page path's copy — page.ts escapeJavascript — is module-private;
 *  same bytes.) */
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

/** head_javascript.rb:25-27 view :script_calls: the mod script_calls
 *  basket — ace editor pushes setAceConfig over the *ace global setting's
 *  content; tinymce_editor pushes setTinyMCEConfig over *tiny_mce — then
 *  trigger_slot_ready, joined "\n\n" inside the CDATA script. The configs
 *  are the two setting cards' contents through escape_javascript (the
 *  sync card-surface read; the *ace / *tiny_mce cards hold the config
 *  JSONs). */
const scriptCallsView: ViewFn = (ctx) => {
  const ace = ctx.fmt.engine.fetchRenderCard("*Ace")?.dbContent ?? "";
  const tinymce = ctx.fmt.engine.fetchRenderCard("*tinyMCE")?.dbContent ?? "";
  const configs = [
    `decko.setAceConfig('${escapeJavascript(ace)}')`,
    `decko.setTinyMCEConfig('${escapeJavascript(tinymce)}')`,
    TRIGGER_SLOT_READY,
  ].join("\n\n");
  return javascriptTag(configs);
};

/** view :javascript_include_tag - three Ruby definitions merged into the
 *  pattern-precedence dispatch the set-module chain performs:
 *  1. right/script.rb:8-12 (Right::Script): item_cards.map { |script|
 *     script.format(:html).render :javascript_include_tag } - one recursive
 *     render per list item, joined "\n".
 *  2. abstract/00_script.rb:78-80 (Abstract::Script, the JavaScript /
 *     CoffeeScript cardtypes' include chain): javascript_include_tag
 *     path(format: :js) -> "<script src=\"/#{url_key}.js\"></script>"
 *     (card-mod-format set/all/path.rb:68-73 html paths are site-root
 *     relative).
 *  3. all/head_javascript.rb:29-31 (All::HeadJavaScript, the base):
 *     "\n<!-- javascript_include_tag not overridden for #{card.name} -->\n".
 *  All three carry cache: :never; the all-layer adds unknown: true. */
const javascriptIncludeTagView: ViewFn = (ctx) => {
  const card = ctx.fmt.card;
  // 1. the +*script list walk (right pattern outranks type in the set chain)
  if (rightIsScript(card)) {
    const items = card.dbContent
      .split(/\n+/)
      .map((item) => item.replace(/\[\[|\]\]/g, "").trim())
      .filter((item) => item !== "");
    return items
      .map((item) => renderCardView(ctx, item, "javascript_include_tag") ?? "")
      .join("\n");
  }
  // 2. the Abstract::Script family (type/java_script.rb:3 +
  //    type/coffee_script.rb:3 include chains -> Abstract::Script)
  if (card.typeCode === "java_script" || card.typeCode === "coffee_script") {
    return `<script src="/${card.name.urlKey}.js"></script>`;
  }
  // 3. the all-pattern fallback
  return `\n<!-- javascript_include_tag not overridden for ${card.name.s} -->\n`;
};

// ---------------------------------------------------------------------------
// set/type_plus_right/{set,mod}/script.rb - the remote_script_tags layers
// ---------------------------------------------------------------------------

/** type_plus_right/set/script.rb:18-23 remote_script_tags (the Set+*script
 *  rule-card layer): card.item_cards.map { |mod| remote_script_tags mod }
 *  .compact, joined "\n"; remote_script_tags(card) (:18's helper at :18-23
 *  in the same file, lines 18-23) renders the item's :remote_script_tags
 *  and, when present, wraps it "\n<!-- #{card.name.left} (remote) -->".
 *  Items resolve through the prepared map (this mod's prepareEngine warms
 *  every *script rule card, which is what the real deck's items are);
 *  unresolved items are skipped (Ruby's compact). */
function remoteScriptTagsOfRuleCard(ctx: ViewContext): string {
  const card = ctx.fmt.card;
  const items = card.dbContent
    .split(/\n+/)
    .map((item) => item.replace(/\[\[|\]\]/g, "").trim())
    .filter((item) => item !== "");
  const parts: string[] = [];
  for (const item of items) {
    const tags = renderCardView(ctx, item, "remote_script_tags");
    if (tags === undefined || tags === "") continue;
    const left = DeckoName.parse(item).leftName?.s ?? item;
    parts.push(`<!-- ${left} (remote) -->\n${tags}`);
  }
  return parts.join("\n");
}

/** type_plus_right/mod/script.rb:18-26 (the Mod+*script layer):
 *  remote_include_tags.compact.join "\n" over map_remote_items
 *  (card-mod-assets set/abstract/mod_assets.rb:167-169 -> the left card's
 *  +*group remote card). The group_remote card's content is the remote src
 *  list one per line (card-mod-assets set/right/group_remote.rb:25-31), so
 *  the port reads the card surface the way card-mod-assets.ts:73-77 does;
 *  each src becomes Rails' javascript_include_tag bytes
 *  `<script src="..."></script>` (the oracle's tags' extra attributes come
 *  from the manifest config hashes - filesystem state, see the header).
 *  No group remote card or empty list -> "". */
/** The mods' manifest.yml "remote" groups (mod_assets.rb
 *  manifest_group_items, dig("remote","items")) in the oracle's tag bytes:
 *  the tag attributes are each manifest item's config hash minus integrity
 *  (the oracle's script tags carry crossorigin / referrerpolicy only).
 *  Keyed by the mod card's left name — the same data page.ts's
 *  REMOTE_SCRIPT_TAGS pins for the page head, this table serves the view
 *  lane's per-mod blocks. */
const MOD_REMOTE_SCRIPT_TAGS: Record<string, string[]> = {
  "mod: format": [
    `<script src="https://code.jquery.com/jquery-3.5.1.min.js" crossorigin="anonymous"></script>`,
    `<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`,
  ],
  "mod: ace editor": [
    `<script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js" crossorigin="anonymous"></script>`,
  ],
  "mod: bootstrap": [
    `<script src="https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>`,
    `<script src="https://kit.fontawesome.com/1366963381.js" crossorigin="anonymous"></script>`,
  ],
};

function remoteScriptTagsOfModCard(ctx: ViewContext): string {
  const card = ctx.fmt.card;
  const leftKey = card.name.leftName?.key;
  if (leftKey === undefined) return "";
  const groupRemote = ctx.fmt.engine.fetchRenderCard(`${leftKey}+*group remote`);
  const content = groupRemote?.dbContent;
  if (content !== undefined && content !== "") {
    return applyFontAwesomeAssetConfiguration(content
      .split("\n")
      .filter((src) => src !== "")
      .map((src) => `<script src="${src}"></script>`)
      .join("\n"), ctx.fmt.engine.fontAwesomeAssetMode);
  }
  // The +*group remote cards are VIRTUAL: Ruby synthesizes them at boot
  // from each mod's assets/script/manifest.yml "remote" group
  // (mod_assets.rb manifest_group_items dig("remote","items")) — the
  // reference deck stores no rows. The pinned manifests (format: jquery +
  // jquery-ujs; ace editor: ace; bootstrap: select2 + fontawesome-kit)
  // are static CDN state; the tag attributes are the manifest config
  // hashes minus integrity (the oracle's tags carry crossorigin /
  // referrerpolicy only).
  const pinned = MOD_REMOTE_SCRIPT_TAGS[card.name.leftName?.s ?? ""];
  return pinned === undefined ? "" : pinned.join("\n").replace(STOCK_FONT_AWESOME_TAG, fontAwesomeHeadTag(ctx.fmt.engine.fontAwesomeAssetMode));
}

/** view :remote_script_tags - the two type_plus_right layers. Ruby defines
 *  the view ONLY for Set+*script and Mod+*script cards; any other card
 *  raises the unsupported-view error, so the merged viewFn re-raises for
 *  cards outside the two patterns (the flat registry would otherwise
 *  over-claim). */
const remoteScriptTagsView: ViewFn = (ctx) => {
  const card = ctx.fmt.card;
  if (!rightIsScript(card)) {
    throw new UnsupportedViewError("remote_script_tags", card.name.s);
  }
  const leftCode = leftTypeCode(ctx);
  if (leftCode === "set") return remoteScriptTagsOfRuleCard(ctx);
  if (leftCode === "mod") return remoteScriptTagsOfModCard(ctx);
  // left side is neither Set nor Mod (or not fetched): no Ruby set module
  // defines the view for it
  throw new UnsupportedViewError("remote_script_tags", card.name.s);
};

// ---------------------------------------------------------------------------
// prepareEngine - the boot-time *script / *style rule warm
// ---------------------------------------------------------------------------

/** The rule cards whose right side is a setting with codename 'script' or
 *  'style', plus every transitive side (the help-mod CTE shape,
 *  card-mod-help.ts#helpRuleSidesStatement, widened to the two codenames the
 *  script views resolve at render time: param_or_rule_card(:script /
 *  :style)). The join keys on the right-side setting alone - no set-typed
 *  left requirement - because the *script rule walk must warm BOTH the
 *  set-anchored rules ("*all+*script") AND the mod-anchored ones
 *  ("mod: X+*script", whose left cards are Mod-typed; the real deck lists
 *  them as the rule card's items). */
export function scriptRuleSidesStatement(settingTypeId: number): {
  sql: string;
  params: unknown[];
} {
  return {
    sql:
      "WITH RECURSIVE reached(id) AS (\n" +
      "  SELECT rules.id\n" +
      "  FROM cards rules\n" +
      "    JOIN cards settings ON rules.right_id = settings.id\n" +
      "WHERE settings.type_id = ?\n" +
      "  AND settings.codename IN ('script', 'style')\n" +
      "  AND rules.trash = 0 AND settings.trash = 0\n" +
      "  UNION\n" +
      "  SELECT s.id FROM reached r\n" +
      "    JOIN cards j ON j.id = r.id AND j.trash = 0\n" +
      "    JOIN cards s ON s.id IN (j.left_id, j.right_id) AND s.id IS NOT NULL\n" +
      ")\n" +
      "SELECT c.* FROM cards c WHERE c.trash = 0 AND c.id IN (SELECT id FROM reached)",
    params: [settingTypeId],
  };
}

/** The card FIELDS of everything the first statement reached: the *script /
 *  *style rules' +*asset output children (asset_outputter.rb:4) and the mod
 *  cards' +*group remote children (the mod-branch remote src surface). */
function scriptRuleChildrenStatement(settingTypeId: number): {
  sql: string;
  params: unknown[];
} {
  const base = scriptRuleSidesStatement(settingTypeId);
  // same reached CTE, then the children pass over it
  const cte = base.sql.slice(0, base.sql.indexOf("SELECT c.* FROM cards"));
  return {
    sql:
      cte +
      "SELECT c.* FROM cards c\n" +
      "WHERE c.trash = 0 AND c.left_id IN (SELECT id FROM reached)",
    params: base.params,
  };
}

/** One batch, once per engine: the rule cards, their sides, and their
 *  fields enter the prepared render-card map. db round-trip elimination
 *: records are composed from the batch's OWN `SELECT c.*` rows
 *  through ModEngineHost#composeAndCacheRows - value-identical to the
 *  per-row host.fetchById storm this replaces (one idToLex + one id-row
 *  point query per uncached row), same sides-before-junctions multi-pass,
 *  same cacheFetchedRecord write path. After this the script views resolve
 *  every card they touch synchronously - zero queries on the render path. */
async function prepareScriptRules(host: ModEngineHost): Promise<void> {
  await host.codenames.ensureLoaded(); // memoized; first call only
  const settingTypeId = host.codenames.peekId("setting");
  if (settingTypeId === undefined) return; // degenerate deck
  const results = await host.batch([
    scriptRuleSidesStatement(settingTypeId),
    scriptRuleChildrenStatement(settingTypeId),
  ]);
  const rows: Record<string, unknown>[] = [];
  for (const result of results) {
    const resultRows = (result as { rows: Record<string, unknown>[] } | undefined)?.rows ?? [];
    rows.push(...resultRows);
  }
  if (rows.length > 0) await host.composeAndCacheRows(rows);
  // The script_calls basket's two config sources (the *Ace / *tinyMCE
  // global setting cards): the views read them through the sync
  // card-surface fetch, so they enter the prepared map here
  // (fetchByName warms the fetch cache; cacheFetchedRecord seats the
  // enriched render-card row the sync surface reads).
  for (const name of ["*Ace", "*tinyMCE"]) {
    const record = (await host.fetchByName?.(name)) as { id?: number | null } | null | undefined;
    if (record !== undefined && record !== null && record.id !== undefined && record.id !== null) {
      await host.cacheFetchedRecord(record);
    }
  }
}

// ---------------------------------------------------------------------------
// set/type_plus_right/mod/script.rb - the Mod+*script group card's html :core
// (the Abstract::ModAssets group-list render, card-mod-assets
// set/abstract/mod_assets.rb:171-182 via the include at mod/script.rb:4-5)
// ---------------------------------------------------------------------------

/** mod_assets.rb:27-29 mod_name: `left&.codename.to_s.sub(/^mod_/, "")` —
 *  the mirror key (Cardio::Mod.fetch mod_name -> mod.subpath "assets",
 *  "script"). (Shared body with card-mod-style.ts's — the same ModAssets
 *  method.) */
function modScriptModname(ctx: ViewContext): string {
  const leftKey = ctx.fmt.card.name.leftName?.key ?? "";
  return leftKey.replace(/^mod_/, "");
}

/** The mod script-asset mirrors: each mod's `assets/script` manifest
 *  groups, transcribed from the gem trees the oracle deck loads
 *  (mod_assets.rb:43-64: the manifest.yml groups in file order; the
 *  remote group rides FIRST — mod_assets.rb:167-169 puts
 *  `["group: remote", group_remote_card.urls]` ahead of the local groups
 *  when urls are present). Item names are the asset FILE cards' names =
 *  File.basename of each manifest path (asset_group.rb:22-30
 *  new_asset_file_card), which is why "jquery/jquery-ui.min.js" renders
 *  "jquery-ui.min.js" and the ../../vendor paths lose their directories.
 *  Filesystem state pinned through the oracle's live render —
 *  the mirror transcribes it exactly as ADMIN_CONFIG transcribes
 *  config/admin.yml.
 *
 *  card-mod-format-0.20.0 assets/script/manifest.yml (the only ported mod
 *  with a script manifest): remote (2 src URLs), jquery (5), decko (6).
 *  Every OTHER ported mod ships no assets/script tree -> absent keys
 *  render "" (Ruby: item_cards [] -> groups [] -> the haml loop emits
 *  nothing). */
const MOD_SCRIPT_GROUPS: Record<
  string,
  ReadonlyArray<readonly [string, readonly string[]]>
> = {
  format: [
    [
      "group: remote",
      [
        "https://code.jquery.com/jquery-3.5.1.min.js",
        "https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js",
      ],
    ],
    [
      "group: jquery",
      [
        "jquery-ui.min.js",
        "jquery.ui.autocomplete.html.js",
        "jquery.autosize.js",
        "jquery.fileupload.js",
        "jquery.iframe-transport.js",
      ],
    ],
    [
      "group: decko",
      [
        "decko.js.coffee",
        "decko_jquery.js.coffee",
        "slot.js.coffee",
        "slotter.js.coffee",
        "slot_ready.js.coffee",
        "clicks_and_hovers.js.coffee",
      ],
    ],
  ],
};

/** The Mod+*script :core body: the mirror's groups (remote first) through
 *  the shared group_list emitter. */
const modScriptGroupCoreView: ViewFn = (ctx) => {
  const groups = MOD_SCRIPT_GROUPS[modScriptModname(ctx)];
  if (groups === undefined) return "";
  return modAssetsGroupListHtml(groups);
};

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// type/coffee_script.rb + type/java_script.rb - the two validate events
// ---------------------------------------------------------------------------

/** The validate-stage body stub for both validate_*_syntax events
 *  (type/coffee_script.rb:5-9, type/java_script.rb:5-9). The Ruby bodies
 *  call ::CoffeeScript.compile / Uglifier.compile on `content`, then
 *  `errors.add :content, <formatted message>` on the ExecJS::RuntimeError /
 *  Uglifier::Error - the write-path "errors" seam that names the field and
 *  carries the message into the save validation surface (card-1.110.0
 *  lib/card/error.rb). The TS engine has no errors.add seam yet (the
 *  action engine's validate path is hardcoded, card-action-engine.ts:256-258;
 *  no eventsForStage consult), so the body is a documented stub: it
 *  resolves `card.dbContent`, names the field it would annotate, and
 *  records the compiler/runtime seam the future execution wiring must
 *  compose. Calls into the actual compiler packages (coffeescript,
 *  uglifier) and the missing errors.add surface are documented in the
 *  body comments below. */
const validateSyntaxField = "content";

/** type/coffee_script.rb:5-9 event :validate_coffeescript_syntax, :validate,
 *  on: :save, changed: %i[type_id content] do
 *    ::CoffeeScript.compile content
 *  rescue ExecJS::RuntimeError => e
 *    errors.add :content, e.message.remove("[stdin]:")
 *  end
 *
 *  BODY PORTED ENGINE-OWNED: the action engine's validate walk runs the
 *  compile itself (card-action-engine.ts validateCssSaveTree, the
 *  coffee_script arm) — this.coffeeCompiler(content, false) is
 *  ::CoffeeScript.compile content, a failed compile refuses the save the
 *  way errors.add does, and the message carries Ruby's
 *  `e.message.remove("[stdin]:")` bytes rebuilt from the same-version
 *  compiler's diagnostic (the coffeescript npm package IS in dependencies
 *  at 1.12.2, the gemset's coffee-script-source version; oracle-run both
 *  sides on the same input: identical "unexpected if" text, 1-based
 *  line:col). The skipsEvent gate honors the act's skip lists under the
 *  same event name this registration declares. This fn stays a no-op:
 *  the walk is the body's owner, and a mod-side compile would double-run
 *  it. */
const validateCoffeescriptSyntaxFn: ModEventFn = (card, _host) => {
  void validateSyntaxField;
  void card;
};

/** type/java_script.rb:5-9 event :validate_javascript_syntax, :validate,
 *  on: :save, changed: %i[type_id content] do
 *    Uglifier.compile content, harmony: true
 *  rescue Uglifier::Error => e
 *    errors.add :content, "<pre>#{Cardio::Utils.ansi2html(e.message)}</pre>".html_safe
 *  end
 *
 *  BODY PORTED ENGINE-OWNED: the optional host-backed implementation runs
 *  in the action engine's pre-store subtree guard (validateCssSaveTree's
 *  java_script arm — this.javascriptValidator(content), the diagnostic
 *  wrapped in <pre> exactly as the Ruby body wraps ansi2html(e.message),
 *  refused as a :content CardActionError). Node production boot and
 *  harness use the same real vendored Uglifier provider. Edge hosts pass
 *  its static-initialization equivalent; the diagnostic TEXT is the host
 *  parser's vocabulary, as Ruby's is its ExecJS runtime's. */
const validateJavascriptSyntaxFn: ModEventFn = () => {};

/** A set file whose ported bytes are registration bookkeeping only (the
 *  module basket entry Ruby's SetLoader creates; its card methods / events
 *  have no manifest surface - see the header's NOT-ported list and the
 *  per-entry comments). */
function passiveSetModule(setPath: string): {
  setPath: string;
  formats: { html: { views: [] } };
} {
  return { setPath, formats: { html: { views: [] } } };
}

const cardModScript: DeckoModManifest = {
  name: "script",
  gemName: "card-mod-script",
  group: "gem-defaults",
  setModules: [
    // card-mod-script-0.20.0/set/abstract/00_script.rb - Abstract::Script:
    // view :javascript_include_tag (:78-80). It shares the merged body
    // registered on all/head_javascript below (that body dispatches the
    // script-family branch itself), so the bytes are the same and
    // Abstract::Script owns the view for the cards that include it, as in
    // Ruby. The settings Ruby resolves for it are the all-layer's (the
    // _view_* setting methods are inherited through method resolution).
    // The html :core override (CodeRay) and the js-format :compressed/:core
    // views are not ported.
    {
      setPath: "abstract/00_script",
      formats: {
        html: {
          views: [
            {
              view: "javascript_include_tag",
              viewFn: javascriptIncludeTagView,
              config: { unknown: true, cache: "never", perms: "none" },
            },
          ],
        },
      },
    },
    // set/abstract/01_asset_script.rb - Abstract::AssetScript (AssetFile
    // include + compress? from @minimize): no view/setting surface.
    passiveSetModule("abstract/01_asset_script"),
    // set/abstract/01_java_script.rb - Abstract::JavaScript (Script include,
    // js :core _render_raw): js-format, not registrable.
    passiveSetModule("abstract/01_java_script"),
    // set/abstract/02_coffee_script.rb - Abstract::CoffeeScript (bare_compile
    // + compile_coffee via CoffeeScript.compile): js-side compiler surface.
    passiveSetModule("abstract/02_coffee_script"),
    // set/abstract/03_asset_java_script.rb - AssetScript + JavaScript includes.
    passiveSetModule("abstract/03_asset_java_script"),
    // set/abstract/04_asset_coffee_script.rb - AssetScript + CoffeeScript.
    passiveSetModule("abstract/04_asset_coffee_script"),
    // set/abstract/script_group.rb - ScriptGroup (asset_input_content js core,
    // new_asset_constants, valid_file_extensions): card methods, no surface.
    passiveSetModule("abstract/script_group"),
    // set/all/head_javascript.rb - All::HeadJavaScript: the deck-head script
    // views + the javascript_include_tag base layer (the merged three-layer
    // registration; right/script and abstract/00_script's Ruby definitions
    // are the dispatch's first two branches).
    {
      setPath: "all/head_javascript",
      formats: {
        html: {
          views: [
            // head_javascript.rb:9-15
            {
              view: "script_variables",
              viewFn: scriptVariablesView,
              config: { unknown: true, cache: "never", perms: "none" },
            },
            // head_javascript.rb:17-23
            {
              view: "javascript_tags",
              viewFn: javascriptTagsView,
              config: { unknown: true, cache: "force", perms: "none" },
            },
            // head_javascript.rb:25-27
            {
              view: "script_calls",
              viewFn: scriptCallsView,
              config: { unknown: true, perms: "none" },
            },
            // head_javascript.rb:29-31 (base) + 00_script.rb:78-80 +
            // right/script.rb:8-12 (dispatch layers). The registered config
            // is the all-layer's (unknown: true rides only the base
            // definition in Ruby; the flat config table cannot express the
            // per-layer difference - the script-family/right layers carry
            // cache: :never only).
            {
              view: "javascript_include_tag",
              viewFn: javascriptIncludeTagView,
              config: { unknown: true, cache: "never", perms: "none" },
            },
          ],
        },
      },
    },
    // set/right/script.rb - Right::Script: assign_type :list, ok_to_read?,
    // raw_help_text, and view :javascript_include_tag (:8-12, the list
    // layer of the merged body above, registered here so Right::Script
    // owns it).
    {
      setPath: "right/script",
      formats: {
        html: {
          views: [
            {
              view: "javascript_include_tag",
              viewFn: javascriptIncludeTagView,
              config: { unknown: true, cache: "never", perms: "none" },
            },
          ],
        },
      },
    },
    // set/self/script.rb - Self::Script: setting_opts (setting.rb group/position).
    {
      setPath: "self/script",
      settingOpts: {
        group: "webpage",
        position: 5,
      },
    },
    // set/type/coffee_script.rb - Type::CoffeeScript (Script include +
    // validate_coffeescript_syntax save event - type/coffee_script.rb:5-9,
    // adopted below).
    {
      setPath: "type/coffee_script",
      events: [
        {
          // type/coffee_script.rb:5-9 event :validate_coffeescript_syntax,
          // :validate, on: :save, changed: %i[type_id content] do
          //   ::CoffeeScript.compile content
          // rescue ExecJS::RuntimeError => e
          //   errors.add :content, e.message.remove("[stdin]:")
          // end
          // BODY PORTED ENGINE-OWNED: validateCssSaveTree's coffee_script
          // arm runs this.coffeeCompiler (the npm coffeescript@1.12.2
          // package, the gemset's coffee-script-source version) on a
          // content/type-changing save and refuses with the stripped
          // Ruby-shaped diagnostic; skipsEvent honors this name.
          event: "validate_coffeescript_syntax",
          at: "validate",
          on: ["save"],
          changed: ["type_id", "content"],
          fn: validateCoffeescriptSyntaxFn,
        },
      ],
    },
    // set/type/java_script.rb - Type::JavaScript (Script include +
    // validate_javascript_syntax save event - type/java_script.rb:5-9,
    // adopted below).
    {
      setPath: "type/java_script",
      events: [
        {
          // type/java_script.rb:5-9 event :validate_javascript_syntax,
          // :validate, on: :save, changed: %i[type_id content] do
          //   Uglifier.compile content, harmony: true
          // rescue Uglifier::Error => e
          //   errors.add :content,
          //     "<pre>#{Cardio::Utils.ansi2html(e.message)}</pre>".html_safe
          // end
          // ENGINE-OWNED (corrected 2026-10-20, events tranche 5; the
          // prior comment here read "SEAM: body is a no-op stub ...
          // uglifier + Cardio::Utils.ansi2html are unported", and both
          // halves of that are false today):
          // - Uglifier IS the exact vendored parser
          //   (card/assets/uglify-harmony-static.ts, harmony: true via
          //   uglify-harmony-options.ts);
          // - Cardio::Utils.ansi2html IS ported
          //   (uglify-harmony-diagnostics.ts builds the SGR caret context
          //   and rewrites it to Ruby's span spelling, citing
          //   ansi2_html.rb);
          // - the `errors.add :content` write path IS ported:
          //   CardActionEngine.validateCssSaveTree
          //   (card-action-engine.ts:2873-2882) throws the :content
          //   CardActionError with Ruby's `<pre>...</pre>` wrapper, gated
          //   on the act's skip lists under this event's name and on
          //   Ruby's changed: %i[type_id content] re-check.
          // The fn stays the honest stub because the body runs in the
          // engine's validate walk, not through the seam — the same
          // reason the coffeescript sibling's fn is a stub after its own
          // port. The engine arm is CONDITIONAL on a host wiring a
          // javascriptValidator; the edge host wires the static one
          // (cloudflare-write-routes.ts).
          // Pinned by tests/card/mod-loader/
          // card-mod-script-javascript-validate-event.test.ts, which
          // fails if the "unported" claim returns.
          event: "validate_javascript_syntax",
          at: "validate",
          on: ["save"],
          changed: ["type_id", "content"],
          fn: validateJavascriptSyntaxFn,
        },
      ],
    },
    // set/type/local_script_folder_group.rb - FolderGroup + ScriptGroup +
    // non_createable_types basket.
    passiveSetModule("type/local_script_folder_group"),
    // set/type/local_script_manifest_group.rb - LocalManifestGroup +
    // ScriptGroup + non_createable_types basket.
    passiveSetModule("type/local_script_manifest_group"),
    // set/type_plus_right/mod/script.rb - Mod+*script (AssetInputter +
    // ModAssets): the remote_script_tags mod layer + the :core group-list
    // render.
    //
    // This module CARRIES the view. Ruby
    // defines view :remote_script_tags in BOTH gem files
    // (type_plus_right/set/script.rb:12-16 on Set+*script AND
    // type_plus_right/mod/script.rb:18-26 on Mod+*script - both non-nested
    // files, so each is its own Ruby module); a merged registration on one
    // set path stops answering for Mod+*script cards once the
    // chainFor narrowing keyed dispatch off the
    // card's own TYPE_PLUS_RIGHT token, which names THIS module for a
    // "mod: X+*script" card. The viewFn keeps the per-layer dispatch
    // (leftTypeCode set -> rule-card walk, mod -> group-remote src list)
    // and still raises for cards outside the two patterns.
    //
    // view :core joins the module — Ruby hosts it on
    // the INCLUDED Abstract::ModAssets (card-mod-assets
    // set/abstract/mod_assets.rb:171-182, the group_list haml); this set
    // module is where the +*script card's chain lands, so the render
    // registers HERE (chain-scoped, kind nonbase — the flat table is
    // untouched). Oracle-pinned byte-for-byte: mod: format :scripts nests
    // it.
    {
      setPath: "type_plus_right/mod/script",
      formats: {
        html: {
          views: [
            { view: "remote_script_tags", viewFn: remoteScriptTagsView },
            { view: "core", viewFn: modScriptGroupCoreView },
          ],
        },
      },
    },
    // set/type_plus_right/set/script.rb - Set+*script (AssetOutputter): the
    // merged remote_script_tags registration (the last of the two tpr files
    // in path order; the flat registry keeps one entry per view name).
    {
      setPath: "type_plus_right/set/script",
      formats: {
        html: {
          views: [
            // type_plus_right/set/script.rb:12-16 + type_plus_right/mod/
            // script.rb:18-20, merged with the pattern dispatch
            { view: "remote_script_tags", viewFn: remoteScriptTagsView },
          ],
        },
      },
    },
  ],
  prepareEngine: prepareScriptRules,
};

export default cardModScript;
