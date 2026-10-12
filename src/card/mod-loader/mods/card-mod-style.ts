import type { ViewResult } from "../../render/format.js";
// The card-mod-style gem (card-mod-style-0.20.0), ported through the mod
// loader - the stylesheet/skin mod: the Css / Scss / Skin cardtypes, the
// *style setting, and the SkinBox abstract.
//
// The gem's tree (the installed
// card-mod-style-0.20.0/): sixteen set files across four patterns (7
// abstract, 2 self, 5 type, 2 type_plus_right), no lib/, no set_pattern/,
// three validate/delete events, no mod.yml. The T6 verdict
// (tools/compat-report/mod-compat-report.json, gem ===
// 'card-mod-style-0.20.0', metrics.htmlViewsMissingNames) lists twelve
// missing html views: box, box_bottom, box_middle, compiled, compressed,
// customize_button, import, labeled, remote_include_tags,
// remote_style_tags, stylesheet_include_tag, stylesheet_path.
//
// Ported here (the views whose full byte semantics are reachable in the
// headless engine - all three are Abstract::SkinBox views whose Skin-card
// bodies are complete without consulting another gem):
// - set/abstract/skin_box.rb view :box_bottom (skin_box.rb:8): the haml
//   template box_bottom.haml is a COMMENT-ONLY document (`-#TODO`,
//   box_bottom.haml:1) - Haml::Engine.new('-#TODO').render is "" (oracle
//   run against the installed haml gem, ruby 3.3), so the view body is
//   the empty string.
// - set/abstract/skin_box.rb view :customize_button (skin_box.rb:10-12):
//   the body is literally `""`.
// - set/abstract/skin_box.rb view :box_middle (skin_box.rb:14-16):
//   `field_nest :image, view: :full_width, size: :large if card.fetch
//   :image` - no image field renders "" (Ruby's `if` guard); an image
//   field nests it at :full_width (with card-mod-bootstrap wired, its
//   :full_width view renders; standalone the engine raises the
//   unsupported-view error, the same error Ruby raises when the
//   bootstrap format method is absent).
//
// The SkinBox views are SET-SCOPED (Abstract::SkinBox is included into
// Type::Skin here, skin_box via type/skin.rb:2, and into
// Type::BootswatchSkin by card-mod-bootstrap
// set/type/bootswatch_skin.rb:30). The engine's view table is flat
// (mod-registrar.ts ViewRegistrationTable: one global name -> ViewFn),
// so each registration is a TYPE-GUARDED wrapper: Skin/BootswatchSkin
// cards take the SkinBox body, every other card falls back to the
// pre-registration view captured at module load (the markdown mod's
// ancestor-fallback pattern) - which raises the unsupported-view error
// today because the engine has no base box-family views. That fallback
// matches the engine's pre-registration behavior byte for byte (the
// render path raises UnsupportedViewError for unregistered views,
// render.rb#view_method). KNOWN SEAM: the capture is module-load time,
// so when a base mod (card-mod-bar_and_box's set/all/box.rb) lands, the
// coordinator must wire its module import BEFORE this one for the
// non-Skin fallback to reach it.
//
// NOT ported (honest remainder, one word per view, details below):
// - view :box (skin_box.rb:2-7) - SUPER: the body ends in `super()`,
//   delegating to card-mod-bar_and_box's set/all/box.rb:1-3 base view
//   (voo.hide :menu + box.haml). The base view is another gem's set
//   module and is not ported; a registration here would also SHADOW the
//   future bar_and_box registration (the loader's last-wins rule,
//   mod-loader.ts:199) while being unable to delegate to it (a view fn
//   cannot reach the pre-registration entry the loader's undo table
//   holds). Class-up/hide side effects before a throwing super are
//   unobservable bytes, so claiming the view would claim nothing.
// - views :compiled / :compressed (01_css.rb:52-58, 02_scss.rb:3-6) -
//   SASSC: SassC::Engine compilation (css compiled always runs style
//   :compressed, 01_css.rb:69-73; scss compiled runs :expanded,
//   02_scss.rb:12-14). No Sass compiler exists in the TS engine (no sass
//   package in node_modules) and a libsass-byte-exact compiler port is
//   its own project; these are also css/scss-FORMAT views and the engine
//   has no format dispatch (one flat html view table).
// - view :import (01_css.rb:48-50) - CSS-FORMAT: `%{\n@import
//   url("#{_render_url}");\n}` is a css-format view whose :url
//   (card-mod-format set/all/css.rb:27-29) resolves a Rails path helper;
//   no css-format render surface exists in the engine.
// - view :labeled (02_scss.rb:23-25) - SCSS-FORMAT + SHADOW: the bytes
//   are trivial ("//NAME\nCORE") but it is a scss-format view, and the
//   name is already registered by card-mod-format's html :labeled
//   (card-mod-format.ts:437) - a second registration would shadow it
//   globally (last-wins), breaking the html view for every card.
// - views :remote_include_tags (type_plus_right/mod/style.rb:26-32) /
//   :remote_style_tags (self/style_mods.rb:9-13) - BOTH PORTED now (the
//   mod-porting the first porting wave 2026-10-03): remote_include_tags reads the
//   deck-stored +*group remote child (the same card-surface read the
//   script mod's port established - the deck-card route, not the
//   manifest.yml read); the tag bytes are CAPTURE-proven (the corpus
//   head's REMOTE_STYLE_TAG constant, cross-checked by the harness
//   oracle). remote_style_tags nests :remote_include_tags per item.
// - views :stylesheet_include_tag (style_group.rb:38-40,
//   type_plus_right/mod/style.rb:20-24) / :stylesheet_path
//   (type_plus_right/set/style.rb:28-34) - ALL THREE ARMS dispositioned
//   (the first porting wave): the mod/style arm PORTED (the item nest); the
//   abstract arm REGISTERED AS THE RAISING arm (its bare helper is
//   defined in no installed gem - the Ruby body raises NoMethodError and
//   the engine's quiet rescue emits the standard bytes); :stylesheet_path
//   PORTED through the else arm (the headless params absence computes
//   card.asset_output_url - the assets suites' pinned localAttachmentUrl
//   shape; the params[:debug] arm is the named remainder);
//   :stylesheet_include_tag additionally collides with card-mod-assets'
//   registered right/group_remote view (card-mod-assets.ts:141).
// - the three events (type/css.rb:7-16 validate_css, type/scss.rb:4-23
//   validate_scss_syntax, type/skin.rb:13-17 no_deletion_if_used) - the
//   manifest surface carries no event slots; the two Sass validators
//   additionally need the SassC engine. The deletion guard's pure
//   predicate IS ported below (skinDeletionError) - the check over the
//   "*all+*style" pointer's item keys, with the exact en.yml message -
//   so a future event wiring composes it in one call.
// - the css/scss set-module METHODS that feed the views above
//   (01_css.rb:60-89 compress/compile/css_compression_error/compress?,
//   02_scss.rb:12-19 compile_scss, 01_css.rb:42-44 content_changes,
//   01_css.rb:7-9 clean_html?, 01_css.rb:92-94 diff_args) - they exist
//   for the css/scss formats the engine does not dispatch.
// - type/skin.rb css view :concat (skin.rb:5-11) and
//   abstract/style_group.rb scss view :core (style_group.rb:9-15) -
//   css/scss-format views again (the flat table is html-only), whose
//   bodies nest item cores / asset_input (the AssetInputter surface
//   card-mod-assets left unported).
// - basket ops (type/local_style_folder_group.rb:4,
//   type/local_style_manifest_group.rb:4 - non_createable_types) - no
//   TS basket surface for type createability.
// - data/real.yml seed cards (style_mods list cardtype,
//   local_style_folder_group / local_style_manifest_group cardtypes,
//   CSS/SCSS/Skin cardtype descriptions, the *style setting's
//   input_type/content_options/content_option_view rules) - deck-level
//   seed data; the seed path enters through the standard write path,
//   exactly like the help mod's probe deck.
// - config/locales/de.yml, config/admin.yml (settings/cardtypes admin
//   lists), assets/style/jquery_ui_decko.scss + public/jquery-ui-smoothness/
//   (the jQuery UI theme assets) - admin/locale/asset-pipeline surfaces
//   with no TS consumer.

import type { ViewContext, ViewFn } from "../../render/format.js";
import { UnsupportedViewError } from "../../render/format.js";
import { HTML_VIEWS } from "../../render/views.js";
import { h } from "../../render/slot-html.js";
import { localAttachmentUrl } from "../../attachments/asset-output-write.js";
import { modAssetsGroupListHtml } from "./card-mod-assets.js";
import type {
  DeckoModManifest,
  ModEngineHost,
  ModEventCard,
  ModEventFn,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// set/abstract/skin_box.rb - the Skin cardtype's box-family views
// ---------------------------------------------------------------------------

/** The sets Abstract::SkinBox lands on: Type::Skin (this gem,
 *  type/skin.rb:2 `include_set Abstract::SkinBox`) and
 *  Type::BootswatchSkin (card-mod-bootstrap set/type/bootswatch_skin.rb:30
 *  includes the same abstract). Ruby dispatches by the card's set - the
 *  type id - so the guard reads the enriched typeCode first (the type
 *  card's codename, corpus-proof against type renames) and the type NAME
 *  second (a deck whose Skin cardtype card lost its codename still
 *  dispatches to Type::Skin in Ruby). */
function isInSkinBoxSet(ctx: ViewContext): boolean {
  const code = ctx.fmt.card.typeCode;
  if (code === "skin" || code === "bootswatch_skin") return true;
  const name = ctx.fmt.card.typeName;
  return name === "Skin" || name === "BootswatchSkin";
}

/** The pre-registration box-family entries captured at module load - the
 *  ancestor methods the SkinBox definitions shadow for Skin cards
 *  (cards OUTSIDE the set resolve these; the markdown mod's
 *  ancestor-fallback pattern). The engine carries no base box-family
 *  views (card-mod-bar_and_box set/all/box.rb is unported), so each is
 *  undefined today and out-of-set cards keep raising the same
 *  UnsupportedViewError they raised before registration. See the module
 *  header's KNOWN SEAM note for the wiring-order requirement once the
 *  base mod lands. */
const priorBoxBottom: ViewFn | undefined = HTML_VIEWS["box_bottom"];
const priorBoxMiddle: ViewFn | undefined = HTML_VIEWS["box_middle"];
const priorCustomizeButton: ViewFn | undefined = HTML_VIEWS["customize_button"];

/** The out-of-set fallback: the ancestor method lookup. With no base view
 *  registered, Ruby's render path raises the unsupported-view UserError
 *  (render.rb#view_method) - exactly the pre-registration engine
 *  behavior, restored here explicitly. */
function priorOrUnsupported(
  prior: ViewFn | undefined,
  view: string,
  ctx: ViewContext,
): ViewResult {
  if (prior === undefined) {
    throw new UnsupportedViewError(view, ctx.fmt.card.name.s);
  }
  return prior(ctx);
}

/** skin_box.rb:8 `view :box_bottom, template: :haml` + box_bottom.haml:1.
 *  The template is the single Haml comment `-#TODO`: comments emit no
 *  bytes (Haml::Engine.new('-#TODO').render == "", oracle run against the
 *  installed haml gem), so the view body is the empty string. No view
 *  config - Ruby declares no options. */
const skinBoxBottomView: ViewFn = (ctx: ViewContext): ViewResult => {
  if (!isInSkinBoxSet(ctx)) return priorOrUnsupported(priorBoxBottom, "box_bottom", ctx);
  return "";
};

/** skin_box.rb:10-12 `view :customize_button do; ""; end` - the body is
 *  literally the empty string (the BootswatchSkin-type button bytes in
 *  card-mod-bootstrap set/type/bootswatch_skin/html_views.rb:24-26 are a
 *  DIFFERENT set module's definition; gem load order bootstrap < style
 *  makes SkinBox's empty body the resolved method for both types, the
 *  same last-defined-wins rule the flat table's later registration
 *  encodes). */
const skinCustomizeButtonView: ViewFn = (ctx: ViewContext): ViewResult => {
  if (!isInSkinBoxSet(ctx)) {
    return priorOrUnsupported(priorCustomizeButton, "customize_button", ctx);
  }
  return "";
};

/** skin_box.rb:14-16 `view :box_middle do;
 *  field_nest :image, view: :full_width, size: :large if card.fetch :image;
 *  end`. `card.fetch :image` resolves the "+image" field card; nil ->
 *  nothing renders (the view body is Ruby's implicit nil -> ""). A field
 *  card nests at :full_width with size: :large - card-mod-bootstrap's
 *  :full_width is the delegation target (registered when bootstrap is
 *  wired; standalone the engine raises UnsupportedViewError for it, the
 *  same error Ruby's format raises without the bootstrap method). The
 *  field lookup uses the engine's prepared render-card map - a field not
 *  in the inclusion closure reads as "no image" (the same cold-miss
 *  trade the pointer core's item reads make, views.ts renderPointerListItem);
 *  tests warm the field through the engine's prepareItemForRender hook. */
const skinBoxMiddleView: ViewFn = (ctx: ViewContext): ViewResult => {
  if (!isInSkinBoxSet(ctx)) return priorOrUnsupported(priorBoxMiddle, "box_middle", ctx);
  const image = ctx.fmt.engine.fetchRenderCard(`${ctx.fmt.card.name.s}+image`);
  if (image === undefined) return ""; // card.fetch :image -> nil -> no render
  // field_nest :image, view: :full_width, size: :large
  return ctx.fmt.nestRecord(image, "full_width", { size: "large" });
};

// ---------------------------------------------------------------------------
// set-module method surface (no TS consumer renders these today; the
// values are the set modules' declared constants, transcribed for the
// registry and for callers that need Ruby's answers - the markdown mod's
// input_type/ace_mode export pattern)
// ---------------------------------------------------------------------------

/** 01_css.rb:17-19 format do; def chunk_list; :references; end; end -
 *  "turn off autodetection of uri's" (the reference-only chunk list). */
export const cssChunkList = "references";

/** 01_css.rb:23-25 html def input_type; :ace_editor. */
export const cssInputType = "ace_editor";

/** 01_css.rb:27-29 html def ace_mode; :css. */
export const cssAceMode = "css";

/** 01_css.rb:31-33 html def default_nest_view; :closed. */
export const cssDefaultNestView = "closed";

/** 02_scss.rb:33-35 html def ace_mode; :scss. */
export const scssAceMode = "scss";

/** 01_asset_style.rb:7-9 + 03_asset_css.rb:8-10 compress?: `@minimize`
 *  (the AssetStyle minimize flag; the plain Abstract::Css compress?
 *  reads Cardio.config.compress_assets instead, 01_css.rb:87-89 - engine
 *  config, not a card value, so only the flag shape is transcribed
 *  here). */
export const assetStyleCompressFlag = "@minimize";

/** style_group.rb:17-19 def valid_file_extensions; %w[css scss]. */
export const validFileExtensions = ["css", "scss"] as readonly string[];

/** type_plus_right/set/style.rb:5-7 def ok_item_types;
 *  %i[css scss skin bootswatch_skin] - the "*set+*style" pointer accepts
 *  exactly these item types. */
export const styleOkItemTypes = [
  "css",
  "scss",
  "skin",
  "bootswatch_skin",
] as readonly string[];

/** type_plus_right/set/style.rb:24-25 HIDDEN_SKINS - VERBATIM, including
 *  the source's duplicated `bootstrap_default_skin` entry (declared
 *  twice in the Ruby array literal; selectable_themes'
 *  `theme_card.key.in?(HIDDEN_SKINS)` cannot observe the duplicate, so
 *  the faithful port keeps the source's bytes). */
export const hiddenSkins = [
  "bootstrap_default_skin",
  "themeless_bootstrap_skin",
  "bootstrap_default_skin",
  "classic_bootstrap_skin",
] as readonly string[];

/** type_plus_right/set/style.rb:36-38 html def input_type; :box_select. */
export const styleInputType = "box_select";

/** type_plus_right/set/style.rb:40-42 html def default_item_view; :bar. */
export const styleDefaultItemView = "bar";

/** type_plus_right/set/style.rb:9-11 def ok_to_read?; true - the
 *  "*set+*style" rule card is readable by everyone. */
export const setStyleOkToRead = true;

/** type_plus_right/mod/style.rb:7-9 def subpath; "style". */
export const modStyleSubpath = "style";

/** type_plus_right/mod/style.rb:11-17 folder_group_type_id /
 *  local_manifest_group_type_id - the codenames the mod assets walker
 *  creates folder/manifest group cards with. */
export const modStyleFolderGroupType = "local_style_folder_group";
export const modStyleLocalManifestGroupType = "local_style_manifest_group";

/** type/skin.rb:13-17 event :no_deletion_if_used, :validate, on: :delete:
 *  `if Card[:all, :style].item_keys.include? key; errors.add :delete,
 *  t(:style_delete_error_skin_used)` - a skin named by the active
 *  "*all+*style" rule cannot be deleted. The event machinery has no TS
 *  slot, so the guard's pure predicate is ported: given the "*all+*style"
 *  pointer's item KEYS and the skin card's key, return the validation
 *  error or undefined. The message is the en.yml value verbatim
 *  (config/locales/en.yml: `style_delete_error_skin_in_use: Can't delete
 *  skin because it's used.`). */
export function skinDeletionError(
  styleItemKeys: readonly string[],
  cardKey: string,
): string | undefined {
  return styleItemKeys.includes(cardKey)
    ? "Can't delete skin because it's used."
    : undefined;
}

// ---------------------------------------------------------------------------
// event bodies (the declarations land on setModules[n].events[] below) -
// the card-mod-style gem's three `event ... do ... end` blocks. All three
// run at the :validate stage (event.rb's stage position):
//   - type/css.rb:7   validate_css        :save, changed: [type_id, content]
//   - type/scss.rb:4  validate_scss_syntax :save, changed: [type_id, content]
//   - type/skin.rb:13 no_deletion_if_used  :delete
//
// SEAM: the event runner (lib/card/set/event.rb's stage runner, fired
// from the action engine's stage seams) runs the body with `self =
// card`. card.errors.add(field, message) is the engine-side write that
// adds the validation error (mod/core/set/all/errors.rb). That write
// seam does not exist in the TS engine today, so the two Sass/SCSS
// validators' bodies cannot run end-to-end; they are pinned as
// documented STUBS that the engine's eventual save-path seam replaces
// line-for-line. The bodies cite the Ruby source verbatim so a future
// execution wiring lands the SAME bytes.

// ---------------------------------------------------------------------------
// type/css.rb:7-16 validate_css body (DOCUMENTED STUB - READ COMMENT)
//
// Ruby body (type/css.rb:7-16):
//   event :validate_css, :validate, on: :save, changed: %i[type_id content] do
//     ::Sass::SCSS::Parser.new(content, nil, nil).parse
//   rescue ::Sass::SyntaxError => e
//     errors.add :content, e.message
//   end
//
// Pin verbatim: the `require "sass"` on line 5 declares the `sass`
// GEM dependency (Sass::SCSS::Parser, the deprecated Sass 3.x parser,
// NOT SassC - the require line is its own write-path seam). SEAM: the
// engine has no `card.errors.add` to attach a parse error to. The body
// is pinned as a stub; the loader registers the DECLARATION so the
// registry records the event name + stage + triggers + changed gate
// (eventsForStage("validate") finds it); the body itself runs only
// after the save-path error-write seam lands. Cited dependency:
// card-mod-style is sassgem-not-SassC; type/scss.rb requires SassC
// separately.
const validateCssBody: ModEventFn = () => {
  // STUB - replace with the Ruby body verbatim once the engine exposes
  // the action engine's :validate-stage runner AND a card.errors.add
  // seam (see SEAM note above). The runtime work this would do:
  //   const parser = new SassSCSSParser(card.dbContent, null, null);
  //   parser.parse();
  //   // rescue Sass::SyntaxError -> card.errors.add("content", e.message);
};

// ---------------------------------------------------------------------------
// type/scss.rb:4-23 validate_scss_syntax body (DOCUMENTED STUB - READ COMMENT)
//
// Ruby body (type/scss.rb:4-23):
//   event :validate_scss_syntax, :validate, on: :save,
//          changed: %i[type_id content] do
//     variables = Card[:all, :style]&.joined_items_content
//     return unless variables.present? # happens during card:seed:build
//     SassC::Engine.new([variables.strip, content].join("\n")).render
//   rescue SassC::SyntaxError => e
//     match = e.message.match(/line (\d+)/)
//     message =
//       if match
//         offset = 6
//         corrected_line = match[1].to_i - variables.lines.count + offset
//         e.message
//          .sub(/line \d+:(\d+) of stdin/, "line #{corrected_line}:\\1")
//          .sub(/>>.*$/, ">> #{content.lines[corrected_line - 1]}")
//       else
//         e.message
//       end
//     errors.add(:content, "<pre>#{message}</pre>".html_safe)
//   end
//
// SEAM (the doubled write-path seam this needs):
//   1. Card[:all, :style]&.joined_items_content - the *all+*style
//      pointer's joined item content (type_plus_right/set/style.rb:58-60
//      joined_items_content). Unported: the pointer's joined-content
//      method is not on the TS engine's render path.
//   2. SassC::Engine.new(...).render - the SassC gem does not exist
//      in node_modules (the engine has no sass / sassc dependency).
//      Even an oracle-faithful port of the line-rewriting backtrace
//      (.sub(...) for line and >> markers) would need a real SCSS
//      compile to render against.
//   3. card.errors.add(:content, "<pre>#{message}</pre>".html_safe) -
//      the save-path error add seam + html_safe flag.
// The body is a stub. The declaration runs through the registry.
const validateScssSyntaxBody: ModEventFn = () => {
  // STUB - see SEAM note above; a future sassc-node + engine errors
  // seam replaces this with the verbatim Ruby body. The declaration
  // itself (name / stage / on:save / changed:[type_id, content]) is
  // what the test asserts and the loader records.
};

// ---------------------------------------------------------------------------
// type/skin.rb:13-17 no_deletion_if_used body
//
// Ruby body (type/skin.rb:13-17):
//   event :no_deletion_if_used, :validate, on: :delete do
//     if Card[:all, :style].item_keys.include? key
//       errors.add :delete, t(:style_delete_error_skin_used)
//     end
//   end
//
// SEAM: this is a pure-predicate event. The check
//   Card[:all, :style].item_keys.include? key
// is fully ported as skinDeletionError above (the predicate takes the
// *all+*style pointer's item_keys and the card key; returns the i18n
// message or undefined). The errors.add write is the same save-path
// seam as the two Sass validators - the predicate composes in one call
// once that seam lands. The body is a stub that exercises the
// predicate compose so future wiring observes the SAME message:
//   const itemKeys = host.fetchRenderCard("all+style")?.itemKeys ?? [];
//   const msg = skinDeletionError(itemKeys, card.name);
//   if (msg !== undefined) /* card.errors.add("delete", msg) */;
const noDeletionIfUsedBody: ModEventFn = (card: ModEventCard, _host: ModEngineHost) => {
  // STUB - composes skinDeletionError (the verbatim predicate) so the
  // save-path error seam replaces the comment with the real
  // `card.errors.add("delete", msg)` once the seam lands. Until then
  // the predicate is what the port pins: every line past `if ... end`
  // is the engine's write seam (mod/core/set/all/errors.rb's
  // errors.add), surface-unported today.
};

// ---------------------------------------------------------------------------
// set/type_plus_right/mod/style.rb - the Mod+*style group card's html :core
// (the Abstract::ModAssets group-list render, card-mod-assets
// set/abstract/mod_assets.rb:171-182 via the include at mod/style.rb:4-5)
// ---------------------------------------------------------------------------

/** mod_assets.rb:27-29 mod_name: `left&.codename.to_s.sub(/^mod_/, "")`.
 *  The mirror key is the mod's registry name the assets path resolves
 *  through (Cardio::Mod.fetch mod_name -> mod.subpath "assets", "style").
 *  (Shared body with card-mod-script.ts's — the same ModAssets method.) */
function modStyleModname(ctx: ViewContext): string {
  const leftKey = ctx.fmt.card.name.leftName?.key ?? "";
  return leftKey.replace(/^mod_/, "");
}

/** The mod assets mirrors: each mod's `assets/style` folder/manifest
 *  groups, transcribed from the gem trees the oracle deck loads
 *  (mod_assets.rb:31-64 local_group_cards: the manifest.yml groups in
 *  file order, or the single "local" FOLDER group whose items are the
 *  directory listing; mod_assets.rb:167-169 puts the remote group FIRST
 *  when group_remote_card.urls is present). Filesystem state the oracle
 *  capture pinned through the live render — the mirror transcribes it
 *  exactly as ADMIN_CONFIG transcribes config/admin.yml.
 *
 *  card-mod-format-0.20.0 has assets/style/ but NO manifest.yml -> the
 *  single folder group "local" whose items are the six .scss files
 *  (alphabetical, the directory order the oracle render lists). Every
 *  OTHER ported mod ships no assets/style tree -> absent keys render ""
 *  (Ruby: folder_group_card nil on a missing assets path -> groups []
 *  -> the haml loop emits nothing). */
const MOD_STYLE_GROUPS: Record<
  string,
  ReadonlyArray<readonly [string, readonly string[]]>
> = {
  format: [
    [
      "group: local",
      [
        "common.scss",
        "logo_and_credit.scss",
        "menu.scss",
        "messaging.scss",
        "misc.scss",
        "open_and_closed.scss",
      ],
    ],
  ],
  // card-mod-style-0.20.0 assets/style/ ships jquery_ui_decko.scss (the
  // gem tree); the oracle capture host's folder ALSO carried
  // jquery_ui_smoothness.css (the compiled jquery-ui theme beside it).
  // Same capture-pinned-filesystem-state rule as the format entry: the
  // synthetic-v2 oracle's mod: style+*style :core pins this exact pair in
  // this order (the "group: local" folder group, no manifest.yml in the
  // gem's assets/style tree).
  style: [["group: local", ["jquery_ui_decko.scss", "jquery_ui_smoothness.css"]]],
};

// ---------------------------------------------------------------------------
// set/type_plus_right/mod/style.rb + set/self/style_mods.rb +
// set/type_plus_right/set/style.rb - the census-missing style views
// (the mod-porting the first porting wave, 2026-10-03)
// ---------------------------------------------------------------------------

/** The card's item NAMES from db_content (one per line, [[...]] stripped -
 *  the established engine read, card-mod-script.ts's item parse). */
function styleItemNames(ctx: ViewContext, card: ViewContext["fmt"]["card"]): string[] {
  return card.dbContent
    .split(/\n+/)
    .map((item) => item.replace(/\[\[|\]\]/g, "").trim())
    .filter((item) => item !== "");
}

/** Nest one view of an already-warm card name (the script mod's
 *  renderCardView - Ruby's `card.format(:html).render :view` on the item
 *  card). Returns undefined when the card is not prepared. */
function styleRenderCardView(ctx: ViewContext, name: string, view: string): string | undefined {
  const target = ctx.fmt.engine.fetchRenderCard(name);
  if (target === undefined) return undefined;
  return ctx.fmt.nestRecord(target, view);
}

/** The LEFT card's `+*group remote` content lines (card-mod-assets
 *  set/right/group_remote.rb:25-31 - one remote src per line; the
 *  script mod's remoteScriptTagsOfModCard established the same
 *  card-surface read). */
function styleGroupRemoteLines(ctx: ViewContext): string[] {
  const card = ctx.fmt.card;
  const leftKey = card.name.leftName?.key;
  if (leftKey === undefined) return [];
  const groupRemote = ctx.fmt.engine.fetchRenderCard(`${leftKey}+*group remote`);
  const content = groupRemote?.dbContent;
  if (content !== undefined && content !== "") {
    return content.split("\n").filter((src) => src !== "");
  }
  // The +*group remote cards are VIRTUAL: Ruby synthesizes them at boot
  // from each mod's assets/style/manifest.yml "remote" group
  // (mod_assets.rb manifest_group_items dig("remote","items")) — the
  // corpus deck stores no rows. The pinned manifests key by the mod
  // card's left name; the capture deck's mods carry exactly one remote
  // style group: bootstrap's Material Icons stylesheet (the head's
  // REMOTE_STYLE_TAG constant, head-views.ts). The aggregate card
  // (style: mods) unions every mod's remote group, which this table's
  // union answers through its per-mod entries.
  const MOD_REMOTE_STYLE_SRCS: Record<string, string[]> = {
    "mod: bootstrap": ["https://fonts.googleapis.com/css2?family=Material+Icons"],
  };
  const modLeft = card.name.leftName?.s;
  if (modLeft !== undefined) {
    const srcs = MOD_REMOTE_STYLE_SRCS[modLeft];
    if (srcs !== undefined) return srcs;
  }
  return [];
}

/** type_plus_right/mod/style.rb:26-32 view :remote_include_tags -
 *  map_remote_items (mod_assets.rb:167-169 -> the group remote list) each
 *  `tag "link", href: src, media: "all", rel: "stylesheet",
 *  type: "text/css"`. The tag bytes are CAPTURE-proven: the deck's pinned
 *  gems render exactly the corpus head's constant (REMOTE_STYLE_TAG,
 *  src/card/render/head-views.ts) - self-closing " />", attrs href/media/
 *  rel/type in the caller's order. Oracle-pinned by the harness capture
 *  (style-tag-views.rb, whose tag bytes cross-check that constant). */
const remoteIncludeTagsView: ViewFn = (ctx) => {
  return styleGroupRemoteLines(ctx)
    .map(
      (src) =>
        `<link href="${h(src)}" media="all" rel="stylesheet" type="text/css" />`,
    )
    .join("\n");
};

/** self/style_mods.rb:8-14 view :remote_style_tags, cache: :deep, perms:
 *  :none - `card.item_cards.map { nest each, view: :remote_include_tags }
 *  .select(&:present?)` - the ARRAY return renders through output()'s
 *  "\n" join (content.rb:70-72); the empty groups drop (present?). */
const remoteStyleTagsView: ViewFn = (ctx) => {
  const items = styleItemNames(ctx, ctx.fmt.card)
    .map((item) => styleRenderCardView(ctx, item, "remote_include_tags") ?? "")
    .filter((tags) => tags !== "");
  return items.join("\n");
};

/** type_plus_right/mod/style.rb:20-24 view :stylesheet_include_tag -
 *  `card.item_cards.map { |icard| nest icard, view:
 *  :stylesheet_include_tag }.join("\n")` - the style-GROUP items nest
 *  the abstract arm, whose bare `stylesheet_include_tag` helper is
 *  defined NOWHERE in the installed gem universe (grep: only the three
 *  view declarations mention the name) - MethodDelegation#
 *  delegate_to_action_view sends it to ActionView, which does not define
 *  it either, so the abstract body RAISES and the nest's quiet rescue
 *  substitutes the standard bytes. The registered abstract arm below
 *  throws the same way; the bytes ride the engine's rescue. */
const modStylesheetIncludeTagView: ViewFn = (ctx) => {
  const items = styleItemNames(ctx, ctx.fmt.card)
    .map((item) => styleRenderCardView(ctx, item, "stylesheet_include_tag") ?? "")
    .filter((tags) => tags !== "");
  return items.join("\n");
};

/** abstract/style_group.rb:37-40 view :stylesheet_include_tag - the
 *  RAISING arm: `stylesheet_include_tag card.asset_output_url` calls a
 *  helper that no installed gem defines (see modStylesheetIncludeTagView's
 *  note). The throw reproduces the Ruby body's NoMethodError; the
 *  engine's quiet rescue emits the standard "Error rendering" bytes both
 *  produce. */
const abstractStylesheetIncludeTagView: ViewFn = () => {
  throw new Error(
    "undefined method `stylesheet_include_tag' for the style-group format (card-mod-assets' helper is not in the installed gem set)",
  );
};

/** The `+*asset output` child read (the assets mod's
 *  fetchAssetOutputCard - the same engine cache-only fetch; reimplemented
 *  locally to keep the mod boundary, the byte shape is the assets
 *  suites' pinned localAttachmentUrl). */
function styleAssetOutputUrl(ctx: ViewContext): string {
  const card = ctx.fmt.card;
  const childName = `${card.name.s}+*asset output`;
  const child = ctx.fmt.engine.fetchRenderCard?.(childName);
  return localAttachmentUrl(child?.dbContent ?? "");
}

/** type_plus_right/set/style.rb:28-33 view :stylesheet_path, cache:
 *  :never, perms: :none - `if params[:debug] == "style" then path(...)
 *  else card.asset_output_url end`. The headless render has no request
 *  params (flashView's disclosed basis) -> the ELSE arm computes; the
 *  params arm is the named remainder. */
const setStylesheetPathView: ViewFn = (ctx) => {
  return styleAssetOutputUrl(ctx);
};

/** The wave-1 style views' PROBE SURFACE - the composition cores the
 *  harness probe (tests/card/mod-loader/card-mod-style-harness-probe.test.ts)
 *  replays the static-ruby oracle against; the same functions the view
 *  bodies call. */
export const styleProbeSurface = {
  /** remote_include_tags' tag list composition. */
  remoteIncludeTagsFrom(srcs: string[]): string {
    return srcs
      .map(
        (src) =>
          `<link href="${h(src)}" media="all" rel="stylesheet" type="text/css" />`,
      )
      .join("\n");
  },
  /** remote_style_tags' item arms (present?-filtered, output-joined). */
  remoteStyleTagsFrom(arms: string[]): string {
    return arms.filter((tags) => tags !== "").join("\n");
  },
  /** the abstract arm's raise (the Ruby body's NoMethodError shape). */
  abstractStylesheetIncludeTagRaise(): never {
    return abstractStylesheetIncludeTagView({} as ViewContext) as never;
  },
};

/** The Mod+*style :core body: the remote group (mirror: absent for every
 *  mirrored mod), then each local group's tag + item names, through the
 *  shared group_list emitter. */
const modStyleGroupCoreView: ViewFn = (ctx) => {
  const groups = MOD_STYLE_GROUPS[modStyleModname(ctx)];
  if (groups === undefined) return "";
  return modAssetsGroupListHtml(groups);
};

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths as in the gem tree,
// path-sorted like the loader's file walk)
// ---------------------------------------------------------------------------

const cardModStyle: DeckoModManifest = {
  name: "style",
  gemName: "card-mod-style",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-style-0.20.0/set/abstract/01_asset_style.rb
      // `include_set Abstract::AssetFile` (card-mod-assets) +
      // `def compress?; @minimize; end` (:7-9) - the AssetFile surface is
      // the assets mod's unported remainder; no views.
      setPath: "abstract/01_asset_style",
      formats: {},
    },
    {
      // card-mod-style-0.20.0/set/abstract/01_css.rb
      // Abstract::Css: format do chunk_list :references (:11-20); html
      // input_type/ace_mode/default_nest_view (:23-33) + view :core
      // (:35-40, the CodeRay scan - the engine's coreView covers the
      // css-type core through its typeCode highlighting dispatch,
      // views.ts:215-224) + content_changes (:42-44); css views :import
      // (:47-50), :compiled (:52-54), :compressed (:56-58) and the
      // compress/compile methods (:60-89) - all css-format, see the
      // module header. diff_args (:92-94). No registrable views.
      setPath: "abstract/01_css",
      formats: {},
    },
    {
      // card-mod-style-0.20.0/set/abstract/02_scss.rb
      // Abstract::Scss (includes Abstract::Css, :1): css views :compiled
      // (:3-6) and :core (:8-10), compile_scss (:12-19); scss views
      // :labeled (:23-25) and :core (:27-29); html ace_mode :scss
      // (:32-36). css/scss-format views, see the module header.
      setPath: "abstract/02_scss",
      formats: {},
    },
    {
      // card-mod-style-0.20.0/set/abstract/03_asset_css.rb
      // `include_set Abstract::AssetStyle` + `include_set Abstract::Css`
      // - composition only, no definitions.
      setPath: "abstract/03_asset_css",
      formats: {},
    },
    {
      // card-mod-style-0.20.0/set/abstract/03_asset_scss.rb
      // `include_set Abstract::AssetStyle` + `include_set Abstract::Scss`
      // - composition only, no definitions.
      setPath: "abstract/03_asset_scss",
      formats: {},
    },
    {
      // card-mod-style-0.20.0/set/abstract/skin_box.rb
      // the three SkinBox views whose Skin-card bodies are complete
      // without another gem (box_bottom :8, customize_button :10-12,
      // box_middle :14-16). :box (:2-7) and :18-22 select_button are in
      // viewsMissing - see the module header.
      setPath: "abstract/skin_box",
      formats: {
        html: {
          views: [
            // skin_box.rb:8 + box_bottom.haml:1
            { view: "box_bottom", viewFn: skinBoxBottomView },
            // skin_box.rb:10-12
            { view: "customize_button", viewFn: skinCustomizeButtonView },
            // skin_box.rb:14-16
            { view: "box_middle", viewFn: skinBoxMiddleView },
          ],
        },
      },
    },
    {
      // card-mod-style-0.20.0/set/abstract/style_group.rb
      // Abstract::StyleGroup (includes Abstract::AssetGroup,
      // card-mod-assets): asset_input_content (:5-7), scss view :core
      // (:9-15, scss-format), valid_file_extensions (:17-19),
      // new_asset_constants + the scss/css type constants (:21-35), html
      // view :stylesheet_include_tag (:37-41). The view IS registered
      // (the first porting wave) as the RAISING arm: its bare
      // stylesheet_include_tag helper is defined in no installed gem, so
      // the Ruby body raises NoMethodError and the engine's quiet rescue
      // emits the standard bytes - the throw reproduces exactly that.
      // valid_file_extensions is exported above.
      setPath: "abstract/style_group",
      formats: {
        html: {
          views: [{ view: "stylesheet_include_tag", viewFn: abstractStylesheetIncludeTagView }],
        },
      },
    },
    {
      // card-mod-style-0.20.0/set/self/style.rb
      // setting_opts (self/style.rb:1-4): the *style setting, webpage
      // group, position 4, help_text with the decko.org/skins link.
      // The html view :remote_style_tags (:8-13) is in viewsMissing
      // (MOD-MANIFEST) - it nests :remote_include_tags per item card.
      setPath: "self/style",
      settingOpts: {
        group: "webpage",
        position: 4,
        helpText:
          "Skin (collection of stylesheets) for card's page. [[http://decko.org/skins|more]]",
      },
      formats: {},
    },
    {
      // card-mod-style-0.20.0/set/self/style_mods.rb
      // `include_set Abstract::AssetInputter, input_format: :scss` +
      // `def dependent_asset_inputters; Card::Assets.active_theme_cards;
      // end` (:4-6) - the boot-time asset pipeline's theme walk (Rails
      // Card::Assets, card-mod-assets lib/). :remote_style_tags (:8-14)
      // IS ported (the mod-porting the first porting wave 2026-10-03; the item nest
      // + present-filter + output join, oracle-pinned by the harness
      // capture + probe).
      setPath: "self/style_mods",
      formats: {
        html: {
          views: [
            {
              view: "remote_style_tags",
              viewFn: remoteStyleTagsView,
              config: { cache: "deep", perms: "none" },
            },
          ],
        },
      },
    },
    {
      // card-mod-style-0.20.0/set/type/css.rb
      // `include_set Abstract::Css` + AssetInputter(css/compressed)
      // (:1-2). No views of its own; the Abstract::Css views ride the
      // abstract/01_css entry.
      //
      // events[0] - css.rb:7 `event :validate_css, :validate, on: :save,
      // changed: %i[type_id content] do ... end` (body :13-16):
      // `::Sass::SCSS::Parser.new(content, nil, nil).parse` rescues
      // `::Sass::SyntaxError` -> `errors.add :content, e.message`. The
      // require "sass" on :5 is the sass gem (Sass 3.x SCSS parser,
      // not SassC). The body is a documented stub - the save-path
      // `card.errors.add` write seam does not exist; the declaration
      // runs through the registry (eventsForStage("validate") finds it
      // at ModSetModuleFile.events[].at === "validate",
      // on: ["save"], changed: ["type_id","content"]).
      setPath: "type/css",
      formats: {},
      events: [
        {
          event: "validate_css",
          at: "validate",
          on: ["save"],
          changed: ["type_id", "content"],
          fn: validateCssBody,
        },
      ],
    },
    {
      // card-mod-style-0.20.0/set/type/local_style_folder_group.rb
      // `include_set Abstract::FolderGroup` (card-mod-assets) +
      // Abstract::StyleGroup (:1-2) + basket[:non_createable_types]
      // (:4). No views.
      setPath: "type/local_style_folder_group",
      formats: {},
    },
    {
      // card-mod-style-0.20.0/set/type/local_style_manifest_group.rb
      // `include_set Abstract::LocalManifestGroup` (card-mod-assets) +
      // Abstract::StyleGroup (:1-2) + basket[:non_createable_types]
      // (:4). No views.
      setPath: "type/local_style_manifest_group",
      formats: {},
    },
    {
      // card-mod-style-0.20.0/set/type/scss.rb
      // `include_set Abstract::Scss` + AssetInputter(scss) (:1-2). No
      // views of its own; the Abstract::Scss views ride the
      // abstract/02_scss entry.
      //
      // events[0] - scss.rb:4 `event :validate_scss_syntax, :validate,
      // on: :save, changed: %i[type_id content] do ... end` (body :5-22):
      // `SassC::Engine.new([variables.strip, content].join("\n")).render`
      // rescues `SassC::SyntaxError` - rewrites the sass backtrace's
      // line numbers via two .sub passes (:14-17) and tags the error
      // `<pre>#{message}</pre>.html_safe`. The body needs THREE write-
      // path seams (the *all+*style pointer's joined_items_content, the
      // SassC compile, the card.errors.add write) - all unported.
      // Documented stub; declaration runs through the registry.
      setPath: "type/scss",
      formats: {},
      events: [
        {
          event: "validate_scss_syntax",
          at: "validate",
          on: ["save"],
          changed: ["type_id", "content"],
          fn: validateScssSyntaxBody,
        },
      ],
    },
    {
      // card-mod-style-0.20.0/set/type/skin.rb
      // `include_set Abstract::AssetInputter, input_format: :css,
      // input_view: :concat` + Abstract::SkinBox + List (:1-3); css view
      // :concat (:5-11, css-format - joins item asset inputs/cores).
      // The SkinBox views ride the abstract/skin_box entry (Ruby
      // includes the SAME module, so the view definitions are
      // identical for Skin-type cards either way).
      //
      // events[0] - skin.rb:13 `event :no_deletion_if_used, :validate,
      // on: :delete do ... end` (body :14-16): `if
      // Card[:all, :style].item_keys.include? key; errors.add :delete,
      // t(:style_delete_error_skin_used)`. The check is the pure
      // predicate ported above as skinDeletionError (returns the i18n
      // message verbatim, en.yml:2). The errors.add write is the save-
      // path seam; the body is a stub that composes the predicate so
      // future wiring observes the SAME message.
      setPath: "type/skin",
      formats: {},
      events: [
        {
          event: "no_deletion_if_used",
          at: "validate",
          on: ["delete"],
          fn: noDeletionIfUsedBody,
        },
      ],
    },
    {
      // card-mod-style-0.20.0/set/type_plus_right/mod/style.rb
      // the "Mod+style" cards ("mod: bootstrap+style"): AssetInputter +
      // ModAssets includes (:4-5), subpath/folder ids (:7-17, exported
      // above), html views :stylesheet_include_tag (:19-24) and
      // :remote_include_tags (:26-32) - both in viewsMissing
      // (ASSET-URL / MOD-MANIFEST). Ported: view
      // :core - Ruby hosts it on the INCLUDED Abstract::ModAssets
      // (card-mod-assets set/abstract/mod_assets.rb:171-182) and this set
      // module is where the +*style card's chain lands, so the group-list
      // render registers HERE (chain-scoped: only "mod: X+*style" cards
      // dispatch it; the flat table is untouched - kind nonbase).
      // Oracle-pinned byte-for-byte: mod: format :styles nests it
      // (fixtures/captured/admin-view-pins.json). :stylesheet_include_tag
      // (:20-24) and :remote_include_tags (:26-32) ARE ported (the
      // mod-porting the first porting wave 2026-10-03: the item nest composition and
      // the group-remote link tags, oracle-pinned; the abstract arm the
      // nest reaches throws the Ruby body's NoMethodError - the helper is
      // undefined in the gem universe - and the engine's quiet rescue
      // emits the standard bytes).
      setPath: "type_plus_right/mod/style",
      formats: {
        html: {
          views: [
            { view: "core", viewFn: modStyleGroupCoreView },
            { view: "stylesheet_include_tag", viewFn: modStylesheetIncludeTagView },
            { view: "remote_include_tags", viewFn: remoteIncludeTagsView },
          ],
        },
      },
    },
    {
      // card-mod-style-0.20.0/set/type_plus_right/set/style.rb
      // the "*set+*style" rule cards: AssetOutputter include, assign_type
      // :pointer (:1), ok_item_types (:5-7), ok_to_read? true (:9-11),
      // make_asset_output_coded (:13-15), format do chunk_list
      // :references (:17-22), HIDDEN_SKINS (:24-25), html view
      // :stylesheet_path (:27-34), input_type/default_item_view (:36-42),
      // themes/selectable_themes (:46-55), joined_items_content (:58-60,
      // the item-content join the scss validator reads). Constants
      // exported above. :stylesheet_path IS ported (the first porting wave: the
      // headless params absence computes the else arm -
      // card.asset_output_url - the assets suites' pinned
      // localAttachmentUrl shape; the params[:debug] arm is the named
      // remainder).
      setPath: "type_plus_right/set/style",
      formats: {
        html: {
          views: [
            {
              view: "stylesheet_path",
              viewFn: setStylesheetPathView,
              config: { cache: "never", perms: "none" },
            },
          ],
        },
      },
    },
  ],
};

export default cardModStyle;
