// The card-mod-layout gem (card-mod-layout-0.20.0), ported through the mod
// loader.
//
// The gem's tree (the installed
// card-mod-layout-0.20.0/): 23 set files (patterns abstract/all/right/self/
// type), 5 lib/ files (the Card::Layout support class), 3 haml templates, 3
// event hooks, config/admin.yml + locales, data/ seeds, and NO mod.yml
// (verified by find - the registration surface is admin.yml only). The T6
// compat report pins 2/25 html views covered (bar_bottom + core, in the
// render layer); this port registers 16 of the 23 missing view names.
//
// SET-SCOPED DISPATCH: the loader's view table is FLAT (one fn per view name,
// mod-registrar.ts ViewRegistrationTable), while Ruby dispatches views
// through the card's set-module chain. The port uses two shapes:
// - all-pattern views (set/all/*.rb) apply to every card in Ruby too, so a
//   flat registration IS Ruby's dispatch for them (the modal, overlay and
//   navbar families).
// - set-specific views (right/head :core + :head_content, self/head :input +
//   :bar_bottom, type/html :core) register as ONE composed fn whose in-fn set
//   predicate selects the override bytes; everything else falls through to
//   the base implementation captured at module-load time (module evaluation
//   always precedes any loader.load() registration, so the captured consts
//   are the pre-mod base), or raises the unsupported-view error where Ruby's
//   dispatch would (render.rb#view_method) for views that exist only on the
//   set (:head_content, :input).
//
// NOT ported (honest remainder, per file):
// - set/self/account_links.rb :my_card + :core - both bodies branch on
//   Card::Auth state (signed_in? / current roles / ok? :create on new
//   cards) and no Auth runtime exists headlessly. The FOUR LINK views
//   (:sign_in / :sign_out / :sign_up / :invite) ARE ported by the
//   mod-views-b lane (2026-09-28, rendered-unpinned) - their bodies are
//   plain `link_to_card` anchors, the auth state only reaches them through
//   the `perms:` gate, and the engine's view-permission gate leaves an
//   un-implemented method predicate unverified-ALLOWED, so the bytes are
//   the signed-OUT reader's. See the view block below.
// - set/right/enabled_roles.rb (:edit_inline super() + checkbox input +
//   validate_role_enabling/clear_roles_cache events) - the edit framework is
//   unported  and the events are write-path
// - set/right/head.rb :one_line_content - body is card-mod-format's
//   raw_one_line_content (truncate/strip_tags text helpers); NOW PORTED
//   (rightHeadOneLineContentView) using text-helpers.ts#truncate +
//   nest-syntax.ts#stripTags
// - set/self/head.rb :core (escape_in_main { nest root.card, view: :head }) -
//   view :head and the root/main page machinery are unported; *head's core
//   falls through to the base (documented divergence)
// - set/self/dropdown_divider.rb - its :nav_item/:nav_link_in_dropdown
//   overrides are set-scoped (Self set of *dropdown divider); registering
//   them in the flat table would corrupt every other card's navbar rendering
// - set/self/alerts.rb + set/self/foot.rb - `def content` overrides (the
//   deprecated-comment content); a card-method override with no view surface
//   in this engine (db_content is read directly)
// - set/abstract/account_dropdown.rb, set/abstract/items.rb,
//   set/abstract/list.rb, set/abstract/items/options_api.rb - method-only
//   set modules (Auth-dependent dropdown, item/nest arrays, options rules);
//   abstract/items' :nav_item dropdown variant overrides the all-pattern one
//   ONLY for pointer/list cards (include chains) - the all-pattern nav_item
//   registered below is the navbar_links.rb definition
// - set/all/layouts.rb + set/all/process_layout.rb - the layout DSL
//   (`layout :simple` code-layout registrations, page_layout/main! render
//   path; process_layout's basket[:cache_seed_names] write has no TS
//   consumer); lib/card/layout.rb's Layout registry has no TS consumer
// - set/type/layout_type.rb :core - ALREADY ported in the render layer
//   (src/card/render/code-highlighting/index.ts routes typeCode
//   "layout_type" through the html scanner); its update_layout_registry
//   event is a write-path side effect with no TS consumer
// - set/right/layout.rb - assign_type :pointer only (no registrations)
// - assets/ (coffee/scss), config/locales, data/ - separate surfaces
// - lib/card/layout*.rb - the Card::Layout class family (render/code layout
//   dispatch, main-nest-chunk search); no TS consumer yet
//
// BYTE-SHAPE VERIFICATION (this port ran the derivations, it did not just
// read them): the modal_dialog.haml template was rendered through the REAL
// haml-5.2.2 gem with card-1.110.0 lib/card/set/format/haml_paths.rb:8-10's
// exact engine call - which pins the haml `//` comment line as a literal
// HTML comment and the single-quoted sorted-attr shell; the popover and
// modal_link attribute orders were rendered through the REAL
// actionview-7.2.3.2 TagHelper, pinning ActiveSupport reverse_merge!'s
// defaults-first order (reverse_merge.rb:6-18) and Rails' in-place :data
// flattening - the same order the captured corpus pins on the :menu help
// link bytes. No captured oracle exists for this mod's views; every expected
// byte traces to a cited helper source or one of those two live-gem runs.

import { DeckoName } from "../../name.js";
import { emitAttrs, h } from "../../render/slot-html.js";
import { scanNests, stripTags } from "../../render/nest-syntax.js";
import { highlight } from "../../render/code-highlighting/index.js";
import { HTML_VIEWS } from "../../render/views.js";
import {
  ONE_LINE_CHARACTER_LIMIT,
  truncate,
} from "../../render/text-helpers.js";
import {
  UnsupportedViewError,
  wrappedTitleInner,
  type RenderCard,
  type RenderFormat,
  type ViewContext,
  type ViewFn,
} from "../../render/format.js";
import {
  abstractItemsNavItemView,
  dropdownDividerView,
  myCardDropdownInnerHtml,
  navbarItemsOverridden,
  navbarLinksForMethodOverride,
} from "../../render/navbar-views.js";
import { rawItemStrings } from "../../render/pointer-list.js";
import { ruleNamesForCard } from "../../set-patterns/rule-names.js";
import type { PatternCardInput } from "../../set-patterns/types.js";
import type { DeckoModManifest } from "../mod-manifest.js";
import type { ModEngineHost } from "../mod-manifest.js";
import { warmRuleCards } from "./rule-card-warm.js";

// The base implementations captured BEFORE any registration replaces the
// table entry (see the set-scoped dispatch note in the header).
const baseCore: ViewFn = HTML_VIEWS["core"];
const baseBarBottom: ViewFn = HTML_VIEWS["bar_bottom"];

// ---------------------------------------------------------------------------
// shared emitters (byte shapes from the cited helpers)
// ---------------------------------------------------------------------------

/** card-mod-bootstrap set/all/bootstrap/icon.rb - material_icon_tag:120-123 +
 *  universal_icon_tag:130-135 (add_class "notranslate" then
 *  "material-icons") + the material map entries icon.rb:1-38 (close: :close,
 *  help: :help, modal: :fullscreen, new_window: :close_fullscreen). icon_lookup
 *  (icon.rb:143-152) resolves these keys in the material basket; unknown keys
 *  pass through (:151). The byte shape the corpus pins via the :menu view. */
const MATERIAL_ICONS: Readonly<Record<string, string>> = {
  close: "close",
  help: "help",
  modal: "fullscreen",
  new_window: "close_fullscreen",
};

function icon(name: string): string {
  return `<i class="notranslate material-icons">${MATERIAL_ICONS[name] ?? name}</i>`;
}

/** Rails content_tag: `<tag${insertion-order attrs}>content</tag>` - the
 *  emitters views.ts uses; emitAttrs is Rails-ordered (insertion order,
 *  double quotes, h()-escaped values, nil values skipped). */
function contentTag(
  tag: string,
  attrs: Record<string, string | number | undefined>,
  content: string,
): string {
  return `<${tag}${emitAttrs(attrs)}>${content}</${tag}>`;
}

/** output (card-1.110.0 lib/card/format/content.rb:70-73):
 *  Array.wrap(content).flatten.compact.join "\n". */
function output(parts: (string | undefined)[]): string {
  return parts.filter((p) => p !== undefined).join("\n");
}

/** Ruby-blank (ActiveSupport String#blank?). */
function rubyBlank(s: string): boolean {
  return /^\s*$/.test(s);
}

/** path({}) / path(mark: card): Card::Path#standard
 *  (card-mod-format lib/card/path.rb:27-40 - the mark, i.e. the card's
 *  url_key per interpret_mark :63-68) + contextualize_path
 *  (card-1.110.0 lib/card/env/location.rb:6-16 prepends the site root "/").
 *  path("") and path("#") are the STRING bypass (path.rb:36 - a non-Hash
 *  returns unchanged, no contextualization). */
function cardPath(urlKey: string): string {
  return `/${urlKey}`;
}

// ---------------------------------------------------------------------------
// set/all/modal.rb - the modal family
// ---------------------------------------------------------------------------

/** modal.rb:1 MODAL_SIZE (the size -> bootstrap class suffix map). String
 *  option values (nest options are strings, view/options.rb) never match
 *  these symbol keys, so add_modal_size_class (modal.rb:90-95) appends
 *  "modal-#{nil}" = "modal-" for ANY non-blank size that is not the :medium
 *  symbol - only normalize_modal_size_class's :medium short-circuit
 *  (modal.rb:92) skips the append. Reproduced literally. */
const MODAL_SIZE: Readonly<Record<string, string>> = {
  small: "sm",
  medium: "",
  large: "lg",
  full: "full",
  xl: "xl",
};

/** modal.rb:81-88 modal_dialog_classes: ["modal-dialog",
 *  "modal-dialog-centered"] plus the size class when a size option is
 *  present (opts.present? governs only whether the size branch runs;
 *  add_modal_size_class returns early for blank sizes, modal.rb:92). */
function modalDialogClasses(size: unknown): string {
  const classes = ["modal-dialog", "modal-dialog-centered"];
  if (size === undefined || size === null || size === "") return classes.join(" ");
  classes.push(`modal-${MODAL_SIZE[String(size)] ?? ""}`);
  return classes.join(" ");
}

/** modal.rb:40-44 view :close_modal_link, unknown: true:
 *  link_to icon_tag(:close), path: "", class: "_close-modal btn-close",
 *  "data-bs-dismiss": "modal". links.rb:101-106 html link_to: :path is
 *  deleted first, :href is a NEW key appended LAST (path.rb:36 - the String
 *  "" bypasses Card::Path entirely), so the attribute order is class,
 *  data-bs-dismiss, href. */
const closeModalLinkView: ViewFn = () =>
  `<a class="_close-modal btn-close" data-bs-dismiss="modal" href="">${icon("close")}</a>`;

/** modal.rb:46-48 view :pop_out_modal_link, unknown: :blank:
 *  link_to icon_tag(:modal), path: {}, class: "pop-out-modal btn-close".
 *  path({}) IS Card::Path work: standard -> base -> the mark
 *  (lib/card/path.rb:27-40, 63-68) + card_path's root prefix
 *  (card-1.110.0 lib/card/env/location.rb:6-16) = "/<url_key>" - href
 *  appended last by link_to. */
const popOutModalLinkView: ViewFn = ({ fmt }) =>
  `<a class="pop-out-modal btn-close" href="${cardPath(fmt.urlKey())}">${icon("modal")}</a>`;

/** modal.rb:26-28 view :modal_title, unknown: true: "". */
const modalTitleView: ViewFn = () => "";

/** modal.rb:30-34 view :modal_footer, unknown: true:
 *  button_tag "Close", class: "btn-xs _close-modal float-end",
 *  "data-bs-dismiss" => "modal". Rails button_tag merges
 *  {name: "button", type: "submit"} BEFORE the caller's options
 *  (actionview-7.2.3.2 form_tag_helper.rb:573 - defaults first, user keys
 *  appended); bootstrapify_button (card-mod-bootstrap set/all/bootstrap/
 *  form.rb:33-36) appends "btn btn-primary" to the class (situation default
 *  :primary). Verified against the live actionview gem. */
const modalFooterView: ViewFn = () =>
  `<button name="button" type="submit" class="btn-xs _close-modal float-end btn btn-primary" data-bs-dismiss="modal">Close</button>`;

/** modal.rb:19-22 view :modal_menu, unknown: true, wrap: :modal_menu:
 *  [render_close_modal_link, render_pop_out_modal_link(optional: :show)] -
 *  the array rides output() (newline-joined). The wrapper
 *  (modal.rb:24 wrapper :modal_menu, :div, class: "modal-menu _modal-menu
 *  ms-auto") is a content_tag div - the view fn emits the wrap bytes itself
 *  (the config{} below records the wrap setting; the render pipeline applies
 *  no wrappers). */
const modalMenuView: ViewFn = (ctx) =>
  contentTag(
    "div",
    { class: "modal-menu _modal-menu ms-auto" },
    output([
      ctx.fmt.renderView("close_modal_link"),
      ctx.fmt.renderView("pop_out_modal_link", {}, "show"),
    ]),
  );

/** modal.rb:36-38 view :modal_link: modal_link _render_title, size:
 *  voo.size. modal_link (modal.rb:66-70) -> modal_link_opts (:72-79):
 *  add_class "slotter"; reverse_merge! path/data-slotter-mode/
 *  data-modal-class/remote - ActiveSupport reverse_merge! REPLACES the hash
 *  with other.merge(self) (reverse_merge.rb:17-18), so the merged defaults
 *  come FIRST and the original opts (size, class) after; link_to then
 *  deletes :path, appends :href, and interpret_data_opts_to_link_to
 *  (links.rb:146-152) appends data-remote LAST. modal_dialog_classes(opts)
 *  is computed BEFORE the merge (opts[:size] still present). Attribute
 *  order data-slotter-mode, data-modal-class, [size], class, href,
 *  data-remote - verified against the live actionview gem. path({layout:
 *  :modal}) = mark + "?layout=modal" (lib/card/path.rb:84-87 query +
 *  :19-25). */
const modalLinkView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  const size = voo.opts["size"];
  return contentTag(
    "a",
    {
      "data-slotter-mode": "modal",
      "data-modal-class": modalDialogClasses(size),
      size: typeof size === "string" && size !== "" ? size : undefined,
      class: "slotter",
      href: `${cardPath(fmt.urlKey())}?layout=modal`,
      "data-remote": "true",
    },
    ctx.fmt.renderView("title"),
  );
};

/** modal.rb:7-17 the :modal wrapper (wrapper :modal) + modal.rb:15-17
 *  view :modal, wrap: :modal do "" end. The wrapper renders haml
 *  :modal_dialog (set/all/modal/modal_dialog.haml): normalize_modal_option
 *  (:103-108) renders the modal_title/modal_menu/modal_footer sub-views for
 *  absent opts; voo.show? :modal_header / :modal_menu default SHOW
 *  (visibility.rb show? is true unless hidden); the footer's
 *  footer.present? gate (haml -if). BYTE-VERIFIED by rendering the GEM'S
 *  TEMPLATE through the real haml-5.2.2 gem with haml_paths.rb:8-10's
 *  engine call: single-quoted alphabetically-sorted attributes
 *  (class, id, role), flush-left tags and closings, one \n per line (an
 *  empty `= title`/`= body` line is a bare newline), and the template's
 *  `//` comment line renders as the literal HTML comment
 *  `<!-- /, "data-backdrop": "static"} -->`. The wrapper's opts are the
 *  wrap-config hash (empty on this surface) - the size classes here are the
 *  plain two. */
const modalView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  const title = fmt.renderView("modal_title");
  const menu = fmt.renderView("modal_menu");
  const footer = fmt.renderView("modal_footer");
  let out = "<div class='modal fade _modal-slot' id='modal-container' role='dialog'>\n";
  out += "<!-- /, \"data-backdrop\": \"static\"} -->\n";
  out += `<div class='${modalDialogClasses(voo.opts["size"])}'>\n`;
  out += "<div class='modal-content'>\n";
  if (voo.show("modal_header")) {
    out += "<div class='modal-header'>\n";
    out += `${title}\n`;
    if (voo.show("modal_menu")) out += `${menu}\n`;
    out += "</div>\n";
  }
  out += "<div class='modal-body'>\n\n</div>\n"; // the view body is ""
  if (!rubyBlank(footer)) out += `<div class='modal-footer'>\n${footer}\n</div>\n`;
  out += "</div>\n</div>\n</div>\n";
  return out;
};

// ---------------------------------------------------------------------------
// set/all/overlay.rb - the overlay views
// ---------------------------------------------------------------------------

/** card-mod-format set/all/html/menu.rb:103-107 help_popover_opts +
 *  card-mod-bootstrap set/all/bootstrap/helper.rb:46-57 popover_opts:
 *  base opts {data-bs-placement: left, class: "help-link"}; add_class
 *  "ps-1 _popover_link" (in place); blank text -> "&nbsp;" (:48); then
 *  reverse_merge! path "#", tabindex 0, and the popover data hash -
 *  reverse_merge! puts the DEFAULTS FIRST (path, tabindex, data) and the
 *  original opts after (data-bs-placement, class). Rails content_tag
 *  flattens the :data hash IN PLACE (actionview-7.2.3.2 tag_helper.rb
 *  tag_options :data branch). Attribute order: tabindex, data-bs-toggle,
 *  data-bs-trigger, data-bs-content, data-bs-placement, class, href - the
 *  order the captured corpus pins on the :menu help link (the same
 *  popover_opts chain) and the live actionview gem reproduced. The text is
 *  the help-rule chain - fmt.menuHelpContentBytes() is that chain's port
 *  (help-popover.ts); the raw "&nbsp;" attribute-escapes to &amp;nbsp;. */
function overlayHelpLinkAttrs(fmt: ViewContext["fmt"]): Record<string, string | number | undefined> {
  const rawHelp = fmt.menuHelpContentBytes();
  const helpContent = rubyBlank(rawHelp) ? "&nbsp;" : rawHelp;
  return {
    tabindex: 0,
    "data-bs-toggle": "popover",
    "data-bs-trigger": "hover focus",
    "data-bs-content": helpContent,
    "data-bs-placement": "left",
    class: "help-link ps-1 _popover_link",
  };
}

/** overlay.rb:35-44 add_open_guide_opts - the slotter attrs merged when
 *  card.guide_card resolves (merge! APPENDS remote/href/data-slot-selector/
 *  data-slotter-mode after the existing keys; overlay_menu_link's add_class
 *  appends "text-muted p-1 ms-1" and the slotter class IN PLACE in the
 *  class value). href = path(mark: card, view: :overlay_guide) =
 *  "/<url_key>/overlay_guide" (lib/card/path.rb:35-39 mark/view base). */
function overlayHelpLinkGuideAttrs(fmt: ViewContext["fmt"]): Record<string, string | number | undefined> {
  return {
    ...overlayHelpLinkAttrs(fmt),
    class: "help-link ps-1 _popover_link slotter text-muted p-1 ms-1",
    href: `${cardPath(fmt.urlKey())}/overlay_guide`,
    "data-slot-selector": ".board-sidebar > ._overlay-container-placeholder > .card-slot",
    "data-slotter-mode": "overlay",
    "data-remote": "true",
  };
}

/** overlay.rb:29-33 view :overlay_help_link, cache: :never, unknown: true:
 *  opts = help_popover_opts; add_open_guide_opts opts (fires only when
 *  card.guide_card resolves - see guideCard below); overlay_menu_link :help,
 *  opts. smart_link_to sees no :view/:card/:resource key (links.rb:55-61) ->
 *  link_to -> href as above (the guide branch's :href pre-empts the path-#
 *  default, links.rb:102 `||=`). */
const overlayHelpLinkView: ViewFn = ({ fmt }) =>
  contentTag("a", guideCard(fmt) === undefined
    ? { ...overlayHelpLinkAttrs(fmt), class: `${overlayHelpLinkAttrs(fmt)["class"]} text-muted p-1 ms-1`, href: "#" }
    : overlayHelpLinkGuideAttrs(fmt), icon("help"));

/** overlay.rb:47-49 slotify_overlay_link: overlay_menu_link :new_window,
 *  card: card - smart_link_to sees :card -> link_to_card (links.rb:111-116):
 *  add_known_or_wanted_class (:140-144) APPENDS known-card to the
 *  overlay_menu_link class; href is the mark path, appended last. */
function overlayNewWindowLink(fmt: ViewContext["fmt"]): string {
  return contentTag(
    "a",
    { class: "text-muted p-1 ms-1 known-card", href: cardPath(fmt.urlKey()) },
    icon("new_window"),
  );
}

/** overlay.rb:51-53 close_overlay_link: overlay_menu_link :close, path: "#",
 *  "data-bs-dismiss": "overlay" - opts {path, data-bs-dismiss} then
 *  add_class appends the class; link_to deletes :path and appends href:
 *  order data-bs-dismiss, class, href. */
function overlayCloseLink(): string {
  return contentTag(
    "a",
    { "data-bs-dismiss": "overlay", class: "text-muted p-1 ms-1", href: "#" },
    icon("close"),
  );
}

/** overlay.rb:23-27 view :overlay_menu: wrap_with :div, class:
 *  "overlay-menu" do [render_overlay_help_link, slotify_overlay_link,
 *  close_overlay_link] end - the array is output()-joined. */
const overlayMenuView: ViewFn = ({ fmt }) =>
  contentTag(
    "div",
    { class: "overlay-menu" },
    output([
      fmt.renderView("overlay_help_link"),
      overlayNewWindowLink(fmt),
      overlayCloseLink(),
    ]),
  );

/** overlay.rb:19-21 view :overlay_title: _render_title (the :title view). */
const overlayTitleView: ViewFn = (ctx) => ctx.fmt.renderView("title");

/** overlay.rb:76-81 overlay_header (overlay.rb:15-17 view :overlay_header,
 *  unknown: true): title ||= _render_overlay_title; class_up "d0-card-header",
 *  "bg-body"; class_up "d0-card-header-title", "d-flex" (set on the voo; the
 *  bytes below never classy d0-card-header-title - header_wrap wraps the
 *  parts directly); header_wrap (card-mod-format set/all/html/header.rb:9-13)
 *  = wrap_with :div, class: classy("d0-card-header"), content =
 *  output([title, _render_overlay_menu]). (header_wrap.haml is unused by
 *  this chain - the header.rb METHOD is the definition.) */
const overlayHeaderView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  voo.classUp("d0-card-header", "bg-body");
  voo.classUp("d0-card-header-title", "d-flex");
  const title = fmt.renderView("overlay_title");
  const menu = fmt.renderView("overlay_menu");
  return contentTag("div", { class: voo.classy("d0-card-header") }, output([title, menu]));
};

// ---------------------------------------------------------------------------
// the *guide rule resolution overlay_help_link's add_open_guide_opts needs
// ---------------------------------------------------------------------------

/** overlay.rb:36 `return unless card.guide_card` - card-mod-help
 *  set/all/guide.rb:47-52 determine_guide_card: `rule_card(:guide)` (the
 *  rule-cache walk, rule/all.rb:9-15 - candidates in pattern precedence
 *  through the prepared render-card map, the same walk card-mod-help's
 *  helpRuleCard uses), a POINTER rule's first_card (:51), gated by
 *  ok?(:read) (:52). Undefined when no readable guide rule exists. */
function guideCard(fmt: ViewContext["fmt"]): ReturnType<ViewContext["fmt"]["engine"]["fetchRenderCard"]> {
  const card = fmt.card;
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
      leftKey !== undefined ? fmt.engine.fetchRenderCard(leftKey) : undefined;
    input.leftTypeName = left?.typeName;
  }
  for (const candidate of ruleNamesForCard(input, "*guide")) {
    const record = fmt.engine.fetchRenderCard(candidate);
    if (record === undefined) continue; // candidate rule does not exist
    if (fmt.engine.isDenied(record)) continue; // guide.rb:52 ok?(:read)
    if (record.typeCode === "pointer") {
      // guide.rb:51 first_card - the pointer rule's first item
      const firstItem = firstPointerItem(record.dbContent);
      return firstItem === undefined ? undefined : fmt.engine.fetchRenderCard(firstItem);
    }
    return record;
  }
  return undefined;
}

/** A pointer card's first item name (the pointer-list line shape). */
function firstPointerItem(content: string): string | undefined {
  for (const line of content.split("\n")) {
    const trimmed = line.trim().replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
    if (trimmed !== "") return trimmed;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// prepareEngine - the boot-time *guide rule warm (the Rule::Cache analog).
// The statement and the multi-pass composition live once in
// rule-card-warm.ts (ruleSidesStatement + warmRuleCards).
// ---------------------------------------------------------------------------

/** One batch, once per engine: every *guide rule card enters the prepared
 *  render-card map (multi-pass junction composition - sides first, then
 *  their junctions). After this the :overlay_help_link guide branch
 *  resolves rule cards synchronously. */
async function prepareGuideRules(host: ModEngineHost): Promise<void> {
  await host.codenames.ensureLoaded(); // memoized; first call only
  const setTypeId = host.codenames.peekId("set");
  const settingTypeId = host.codenames.peekId("setting");
  if (setTypeId === undefined || settingTypeId === undefined) return; // degenerate deck
  await warmRuleCards(host, setTypeId, settingTypeId, ["guide"]);
}

// ---------------------------------------------------------------------------
// set/all/navbar_links.rb - the navbar family (all-pattern: flat
// registration IS Ruby's dispatch)
// ---------------------------------------------------------------------------

/** The :title bytes a navbar link renders (base.rb:39-43 link_view /
 *  navbar_links.rb:33 render_title -> the html :title view). A chunk LABEL
 *  rides the nest's title option (link.rb:31-33 options title:) and the
 *  title view renders it - the corpus-pinned label shape the :link view uses
 *  (views.ts:589-591); without a label the real :title view dispatches. The
 *  label arm IS wrapped_title (title.rb:38-42), joint span included
 *  (format.ts#wrappedTitleInner). */
function titleBytes(ctx: ViewContext): string {
  const label = ctx.voo.opts["title"];
  if (typeof label === "string" && label !== "") {
    return `<span class="card-title" title="${h(label)}">${wrappedTitleInner(h(label))}</span>`;
  }
  return ctx.fmt.renderView("title");
}

/** navbar_links.rb:28-30 wrap_with_nav_item: `wrap_with :li, content,
 *  class: "nav-item"`. */
function navItem(content: string): string {
  return `<li class="nav-item">${content}</li>`;
}

/** navbar_links.rb:24-26 view :nav_item (the all-pattern definition):
 *  `wrap_with_nav_item link_view(class: "nav-link")` - base.rb:39-43
 *  link_view sets opts[:known] = card.known? then link_to_card card.name,
 *  _render_title, opts (links.rb:111-116): the known/wanted class joins in
 *  place ("nav-link known-card"), href is the mark path appended last. */
const navItemView: ViewFn = ({ fmt, voo }) => {
  const known = fmt.card.unknown !== true;
  const cls = known ? "nav-link known-card" : "nav-link wanted-card";
  return navItem(
    contentTag("a", { class: cls, href: cardPath(fmt.urlKey()) }, titleBytes({ fmt, voo })),
  );
};

/** navbar_links.rb:32-34 view :nav_link_in_dropdown: link_to_card card,
 *  render_title, class: "dropdown-item". html link_to_card appends the
 *  known/wanted class (links.rb:140-144) then href; the text is the :title
 *  view. */
const navLinkInDropdownView: ViewFn = ({ fmt, voo }) => {
  const known = fmt.card.unknown !== true;
  const cls = known ? "dropdown-item known-card" : "dropdown-item wanted-card";
  return contentTag("a", { class: cls, href: cardPath(fmt.urlKey()) }, titleBytes({ fmt, voo }));
};

/** navbar_links.rb:60-63 navbar_link_chunk: name targets NEST the referee
 *  at the navbar view with the chunk's title option (link.rb:71-75
 *  render_name_link -> options.merge(view: view)); explicit targets
 *  (/|https?:|mailto:) render the resource link (link.rb:66-69 ->
 *  links.rb:44-47 link_to_resource + :154-157 add_resource_opts: the
 *  resource type joins the class list, external links gain target=_blank,
 *  href appended last, text falls back to the href at links.rb:103) and
 *  wrap in the li only for view :nav_item (:62 explicit_link? check). */
function navbarLinkChunk(
  ctx: ViewContext,
  target: string,
  label: string | undefined,
  view: string,
  linkClass: string,
): string {
  if (/^(\/|https?:|mailto:)/.test(target)) {
    const type = /^https?:/.test(target)
      ? "external-link"
      : /^\//.test(target)
        ? "internal-link"
        : "email-link";
    const href = target; // internal links re-root via card_path (location.rb:11-13); absolute/scheme paths pass through
    const text = label ?? href;
    const link = contentTag(
      "a",
      {
        class: `${linkClass} ${type}`,
        target: type === "external-link" ? "_blank" : undefined,
        href,
      },
      h(text),
    );
    return view === "nav_item" ? navItem(link) : link;
  }
  return ctx.fmt.nest({
    syntax: target,
    name: target,
    options: {
      view,
      title: label ?? DeckoName.parse(target).fullyStripped.s, // link.rb:32 fully_stripped fallback
      extra: {},
    },
    comment: undefined,
  });
}

/** link.rb:99-109 divider_index: the first "|" NOT inside a {{nest}} span. */
function dividerIndex(rawSyntax: string): number {
  if (!rawSyntax.includes("|")) return -1;
  let masked = rawSyntax;
  for (const incl of rawSyntax.match(/\{\{[^}]*\}\}/g) ?? []) {
    masked = masked.split(incl).join("x".repeat(incl.length));
  }
  return masked.indexOf("|");
}

/** The [[...]] link chunks inside one literal text segment (link.rb:13-15
 *  full_re /\A\[\[([^\]]+)\]\]/; target_and_link_text :89-97). A "[["
 *  without "]]" never matches and renders verbatim. */
function linkChunksInText(
  ctx: ViewContext,
  text: string,
  view: string,
  linkClass: string,
): string[] {
  const out: string[] = [];
  let rest = text;
  for (;;) {
    const start = rest.indexOf("[[");
    if (start === -1) {
      out.push(rest);
      break;
    }
    out.push(rest.slice(0, start));
    const match = /^\[\[([^\]]+)\]\]/.exec(rest.slice(start));
    if (match === null) {
      out.push(rest.slice(start, start + 2)); // unclosed "[[": literal
      rest = rest.slice(start + 2);
      continue;
    }
    const syntax = match[1] ?? "";
    const divider = dividerIndex(syntax);
    const target = (divider === -1 ? syntax : syntax.slice(0, divider)).trim();
    const label =
      divider === -1 ? undefined : (syntax.slice(divider + 1).trim() || undefined);
    if (target !== "") out.push(navbarLinkChunk(ctx, target, label, view, linkClass));
    rest = rest.slice(start + match[0].length);
  }
  return out;
}

/** navbar_links.rb:10-21 navbar_items: `process_content nil, chunk_list:
 *  :references do |chunk| ... end` - the decko chunker scans {{nest}} and
 *  [[link]] chunks left-to-right; the block RESULT substitutes each chunk
 *  in place and the literals pass through, yielding ONE STRING
 *  (Card::Content#process_chunks + #to_s - no separators added; the
 *  output()-"\n"-join applies to view-body arrays, not here). Nest chunks
 *  re-nest with the navbar view (:65-67 navbar_nest_chunk -> content_nest
 *  chunk.options.merge view:); link chunks go through navbar_link_chunk.
 *  The scan shape is the shared processHelpContent walk
 *  (help-popover.ts:91-118). */
function navbarItems(ctx: ViewContext, view: string, linkClass: string): string {
  const pieces = scanNests(ctx.fmt.card.dbContent);
  let out = "";
  for (const piece of pieces) {
    if (piece.kind === "text" || piece.nest === undefined) {
      // text segments may still carry [[link]] chunks - walk them here
      out += linkChunksInText(ctx, piece.text, view, linkClass).join("");
      continue;
    }
    if (piece.nest.comment !== undefined) {
      out += ctx.fmt.nest(piece.nest); // content.rb:20-21 comment passthrough
      continue;
    }
    out += ctx.fmt.nest({ ...piece.nest, options: { ...piece.nest.options, view } });
  }
  return out;
}

/** navbar_links.rb:2-6 view :navbar_links, perms: :none: `wrap_with :ul,
 *  class: "navbar-nav" do navbar_items end` - the block content is the
 *  substituted content string (see navbarItems). */
const navbarLinksView: ViewFn = (ctx) =>
  navbarItemsOverridden(ctx.fmt)
    ? navbarLinksForMethodOverride(ctx)
    : `<ul class="navbar-nav">${navbarItems(ctx, "nav_item", "nav-link")}</ul>`;

/** set/type/html.rb:3-9 view :navbar_links, perms: :none (deprecated; for
 *  old Html-typed "*main menu" cards): `wrap_with :ul, class: "navbar-nav"`
 *  around `item_links` (card-mod-collection set/all/item.rb:128-132: every
 *  item card nested with view :link), each wrapped in an `li.nav-item`,
 *  joined with "\n". The items are the content lines (item.rb
 *  raw_item_strings: split on newlines, [[ ]] stripped); blank lines name
 *  no card and are skipped. */
const htmlNavbarLinksView: ViewFn = (ctx) => {
  const links = rawItemStrings(ctx.fmt.card.dbContent)
    .filter((item) => item !== "")
    .map((item) => {
      const parsed = DeckoName.parse(item);
      const name = parsed.isAbsolute ? parsed.s : parsed.absoluteName(ctx.fmt.card.name).s;
      return ctx.fmt.nest({ name, syntax: name, options: { view: "link", extra: {} }, comment: undefined });
    });
  return `<ul class="navbar-nav">${links.map((link) => `<li class="nav-item">${link}</li>`).join("\n")}</ul>`;
};

// ---------------------------------------------------------------------------
// the set-scoped head family (right/head.rb, self/head.rb, type/html.rb)
// ---------------------------------------------------------------------------

/** The Right::Head set predicate (right pattern, anchor *head): the card's
 *  right part is the *head card. The canonical key keeps the leading "*"
 *  (the port's key convention, format.ts rightPartCodenameForRule note). */
function isRightHeadCard(card: RenderCard): boolean {
  return card.name.isCompound && card.name.rightName?.key === "*head";
}

/** The Self::Head set predicate: the card IS *head. */
function isSelfHeadCard(card: RenderCard): boolean {
  return card.name.key === "*head";
}

/** right/head.rb:16-18 view :core: process_content(::CodeRay.scan(
 *  render_raw, :html).div) - the html scanner's DIV template is the
 *  render layer's highlight(raw, "html") (code-highlighting/index.ts,
 *  byte-matched to the coderay fixtures). Registered on Right::Head ONLY:
 *  Ruby's :core for this gem lives in that one file — the seed-sweep
 *  lane's "also type/html.rb:13-17" claim misread the gem (that file's
 *  lines 13-17 are the format-do chunk_list block; set/type/html.rb
 *  defines NO view :core), and the extra Html-type predicate arm coderayed
 *  every Html-typed card's body once the mod deck was bound at a serving
 *  surface (the session2-gap-8 wiring exposed it: the
 *  page chrome's {{:header|core}} nest — the *header card, Html-typed —
 *  rendered the navbar as CodeRay source). An Html-typed card's :core
 *  dispatches to the BASE format core, the live site's own shape.
 *  self/head's :core (self/head.rb:9-17) is NOT ported (the header
 *  remainder). */
const layoutCoreView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  if (isRightHeadCard(fmt.card)) {
    return fmt.processContent(highlight(fmt.renderRaw(), "html"));
  }
  return baseCore(ctx);
};

/** right/head.rb:8-10 view :head_content, cache: :yes:
 *  process_content render_raw. The view exists ONLY on the Right::Head set;
 *  outside it Ruby's dispatch raises the unsupported-view UserError
 *  (render.rb#view_method) - the guard reproduces that at the only place
 *  the flat table allows (render.rb checks set modules before dispatch). */
const headContentView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  if (!isRightHeadCard(fmt.card)) {
    throw new UnsupportedViewError("head_content", fmt.card.name.s);
  }
  return fmt.processContent(fmt.renderRaw());
};

/** right/head.rb:12-14 view :one_line_content: `raw_one_line_content` - the
 *  card-mod-format helper (set/all/content.rb:43-45): `truncate strip_tags
 *  (render_raw), length: one_line_character_limit`, where the limit is
 *  `voo.size || ONE_LINE_CHARACTER_LIMIT` (60, content.rb:51-53). The
 *  truncate helper (src/card/render/text-helpers.ts:203-211) is the Rails
 *  String#truncate port (filters.rb:70-83) - length 60 with the "..."
 *  omission when truncation happened; strip_tags (nest-syntax.ts:24-26,
 *  nest.rb's `string.gsub(/<[^>]*>/, "")`) drops the HTML tags the head-
 *  rule raw carries (the *head setting's rule dbContent, e.g.
 *  `<meta name="..." content="...">`). SET SCOPE: the gem defines this
 *  view on Right::Head (set/right/head.rb:12-14) - but the view NAME is
 *  not exclusive to that set: the All-set html block (card-mod-format-
 *  0.20.0 set/all/html/views.rb:29-32) defines :one_line_content for
 *  every card, so OUTSIDE Right::Head Ruby's dispatch resolves to that
 *  arm (the text-muted wrap; the plain-probe arm of fixtures/captured/
 *  layout-one-line.json captures exactly that) - it does not raise.
 *  The raise below is the TS port's set-scope registration guard (the
 *  set-scoped port convention; the resolution seam is mod-registrar.ts
 *  ViewRegistrationTable + the chain-aware SetModuleViewTable), kept
 *  unchanged. Corrected 2026-10-01 (the layout-fixture-adjudication
 *  lane's finding; the former "outside it Ruby's dispatch raises the
 *  unsupported-view UserError" claim misread the All-set html arm as
 *  absent - unlike :head_content, which IS exclusive to this set). */
const rightHeadOneLineContentView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  if (!isRightHeadCard(fmt.card)) {
    throw new UnsupportedViewError("one_line_content", fmt.card.name.s);
  }
  const sizeOpt = voo.opts["size"];
  const length = typeof sizeOpt === "number" ? sizeOpt : ONE_LINE_CHARACTER_LIMIT;
  return truncate(stripTags(fmt.renderRaw()), length, "...");
};

// ---------------------------------------------------------------------------
// set/self/head.rb - the *head card's own set
// ---------------------------------------------------------------------------

/** self/head.rb:19-21 view :input: "Content can't be edited." - only on the
 *  Self::Head set (the guard = the unsupported-view raise outside it). */
const headInputView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  if (!isSelfHeadCard(fmt.card)) {
    throw new UnsupportedViewError("input", fmt.card.name.s);
  }
  return "Content can't be edited.";
};

/** self/head.rb:23-25 view :bar_bottom: "" on the *head card; every other
 *  card falls through to the base :bar_bottom (the render layer's bar
 *  family). Composed per the set-scoped dispatch note. */
const headBarBottomView: ViewFn = (ctx) =>
  isSelfHeadCard(ctx.fmt.card) ? "" : baseBarBottom(ctx);

// ---------------------------------------------------------------------------
// set/self/account_links.rb - the four account LINK views (ported by the
// mod-views-b lane, 2026-09-28; RENDERED-UNPINNED - no oracle capture of any
// of them exists; the shapes below are derived from the Ruby source).
//
//   view :sign_up,  link_options(:show_signup_link?) do
//     link_to_card :signup, account_link_text(:sign_up),
//                  class: nav_link_class("signup-link"),
//                  path: { action: :new, mark: :signup }
//   end
//   view :sign_in,  link_options(:not_signed_in?) do
//     link_to_card :signin, account_link_text(:sign_in),
//                  class: nav_link_class("signin-link")
//   end
//   view :sign_out, link_options(:signed_in?) do
//     link_to_card :signin, account_link_text(:sign_out),
//                  class: nav_link_class("signout-link"),
//                  path: { action: :delete }
//   end
//   view :invite,   link_options(:show_invite_link?) do
//     link_to_card :signup, account_link_text(:invite),
//                  class: nav_link_class("invite-link"),
//                  path: { action: :new, mark: :signup }
//   end
//
// The byte chain, and what each link does to it:
//  (1) `link_to_card` (card-mod-format set/all/links.rb:111-116) calls
//      `add_known_or_wanted_class opts, name` (links.rb:140-144) which
//      APPENDS "known-card" or "wanted-card" to the class - add_class is
//      `alias_method :append_class, :add_class` (card-1.110.0
//      lib/card/format/content.rb:43-49), so the caller's class comes first
//      and the known/wanted chip comes last.
//  (2) `add_to_path opts, mark: Card::Name[cardish]` (links.rb:33-36) MERGES
//      :mark into opts[:path] - it never overwrites the caller's :path
//      entries, so :sign_out's `path: {action: :delete}` becomes
//      `{action: :delete, mark: signin}`.
//  (3) `link_to` (links.rb:99-106): `opts[:href] ||= path opts.delete(:path)`
//      runs FIRST, so :href is appended AFTER the caller-supplied :class -
//      the anchor is `<a class="..." href="...">` - and `text = raw(text ||
//      href)` keeps the given text (raw marks it html_safe, so it is NOT
//      escaped inside the anchor; the anchor's own attributes still are).
//  (4) `account_link_text purpose` (account_links.rb:78-80) is
//      `voo.title || t("account_#{purpose}")`; the en strings live in
//      card-mod-account-0.20.0 config/locales/en.yml (account_sign_in:31
//      "Sign in", account_sign_out:33 "Sign out", account_sign_up:34
//      "Sign up", account_invite:17 "Invite"). This engine does not model
//      voo.title (an un-ported Voo heir key, format.ts:110), so the port
//      always takes the `t(...)` arm.
//  (5) `nav_link_class type` (account_links.rb:82-84) is
//      `"nav-link #{classy(type)}"`; classy with no registered class_up
//      returns the argument unchanged, so the class is exactly
//      "nav-link <type>-link".
//
// NOT PORTED from this file (named, not skipped): :my_card's ROLES arm is
// the named remainder (the can_disable_roles? gate + the
// interactive_roles_dropdown nest — the session roles runtime; the view
// itself IS registered 2026-09-29, the account_dropdown arm, see the view
// block below), and the file's :core (line 8-13 -
// `Auth.signed_in?` decides logged-in/logged-out and the body is
// `navbar_items.join "\n"`, which nests the four link views above).
// The PERMS gate is also not enforced: `link_options` (line 28-30) sets
// `perms: :show_signup_link? | :not_signed_in? | :signed_in? |
// :show_invite_link?`, and the engine's view-permission gate implements
// only the `can_configure?` method predicate (format.ts:486-489) - an
// un-implemented predicate leaves the view unverified-ALLOWED, so all four
// views render regardless of sign-in state. The bytes below are therefore
// the bytes for a signed-OUT reader.
// ---------------------------------------------------------------------------

/** DeckoName.url_key for the account cards these views link to. `signin` /
 *  `signup` are the codename'd account cards; their url_key is the
 *  lowercase form (nothing to escape), so the engine's urlKey is the same
 *  string. `action` is the trailing path segment `path({action: :new,
 *  mark: :signup})` produces. */
function accountCardHref(name: string, action?: string): string {
  const urlKey = DeckoName.parse(name).urlKey;
  return action === undefined ? `/${h(urlKey)}` : `/${h(urlKey)}/${h(action)}`;
}

/** links.rb:140-144 add_known_or_wanted_class: `Card.known?(name)`. The
 *  engine's equivalent is whether the name resolves to a seeded card (the
 *  same fetch-miss-means-wanted convention card-mod-search.ts
 *  #gotoAutocompleteIcon already uses). */
function knownOrWantedClass(fmt: RenderFormat, name: string): string {
  return fmt.engine.fetchRenderCard(name) === undefined ? "wanted-card" : "known-card";
}

function accountLinkView(
  target: string,
  linkClass: string,
  text: string,
  action?: string,
): ViewFn {
  return (ctx) => {
    const cls = `nav-link ${linkClass} ${knownOrWantedClass(ctx.fmt, target)}`;
    return `<a class="${h(cls)}" href="${h(accountCardHref(target, action))}">${h(text)}</a>`;
  };
}

const signInView = accountLinkView("signin", "signin-link", "Sign in");
const signUpView = accountLinkView("signup", "signup-link", "Sign up", "new");
const signOutView = accountLinkView("signin", "signout-link", "Sign out", "delete");
const inviteView = accountLinkView("signup", "invite-link", "Invite", "new");

// ---------------------------------------------------------------------------
// the :my_card and :edit_inline views (the R21 port,
// 2026-09-29 — the last two unregistered layout views)
// ---------------------------------------------------------------------------

/** account_links.rb:56-58 view :my_card (link_options perms :signed_in?,
 *  denial :blank) — `can_disable_roles? ? interactive_roles_dropdown :
 *  account_dropdown`.
 *
 *  The account_dropdown arm composes from the PREPARED session state
 *  (pageSessionMyCardHtml — the same golden-backed btn-group the navbar
 *  renders, account_dropdown.rb:7-12 via navbar-views.ts). Signed-out or
 *  unprepared sessions render "" (the denial :blank shape — the same
 *  drop-from-the-compact the navbar's compact performs).
 *
 *  NAMED REMAINDER (the ladder's degraded-labeled rung): the
 *  can_disable_roles? gate (Auth.current_roles.size > 1 && Codename
 *  .exist?(:enabled_roles)) and its interactive_roles_dropdown arm (the
 *  nest of +*enabled_roles, view: :edit_inline) need the session ROLES
 *  runtime, which the port's page session does not carry — every
 *  authenticated golden capture shows the account_dropdown arm (the
 *  capture sessions hold no roles), so this view renders that arm; the
 *  roles arm's bytes stay gem-source-defined (account_links.rb:60-70 +
 *  enabled_roles.rb) until the roles runtime lands. */
const myCardView: ViewFn = (ctx) => ctx.fmt.engine.pageSessionMyCardHtml ?? "";

/** right/enabled_roles.rb:26-43 — view :edit_inline (perms :none, unknown:
 *  true, cache: :never, wrap: :slot, super()) whose checkbox_input override
 *  renders `wrap_with(:div, class: "pointer-checkbox-list") { account_dropdown }`
 *  after card.ensure_roles fills empty content.
 *
 *  The port composes the account_dropdown from the prepared session state
 *  (the SAME golden-backed shape the :my_card view renders; a signed-out
 *  engine composes the Anonymous-actor shape — Auth.current for anonymous
 *  IS the Anonymous card, rendered-unpinned). ensure_roles is a WRITE
 *  (content fill on first read) — the render path cannot write; the port
 *  renders the card's current content (an empty enabled_roles card renders
 *  an empty checkbox list), named remainder.
 *
 *  NAMED REMAINDER: the role checkboxes (account_dropdown_role_items —
 *  Auth.current_roles mapped through the role_checkbox haml
 *  `.pointer-checkbox.dropdown-item` div: a `_submit-on-change` checkbox +
 *  link_to_card per role, checked = the card's item_names) need the session
 *  roles runtime; the port renders the dropdown's two fixed items. */
const enabledRolesEditInlineView: ViewFn = (ctx) => {
  const sessionHtml =
    ctx.fmt.engine.pageSessionMyCardHtml ??
    myCardDropdownInnerHtml(
      "Anonymous",
      { actor: true, accountSettings: false, signin: true },
      [],
    );
  return `<div class="pointer-checkbox-list">${sessionHtml}</div>`;
};

// ---------------------------------------------------------------------------
// the manifest (one entry per PORTED gem file; setPaths as in the gem tree;
// the loader sorts entries by set path within each pattern group)
// ---------------------------------------------------------------------------

const cardModLayout: DeckoModManifest = {
  name: "layout",
  gemName: "card-mod-layout",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-layout-0.20.0/set/all/modal.rb (MODAL_CLOSE_OPTS
      // modal.rb:2-4 has no other consumer in the ported surface -
      // modal_close_button/modal_submit_button are methods)
      setPath: "all/modal",
      formats: {
        html: {
          views: [
            { view: "modal", viewFn: modalView, config: { wrap: "modal" } },
            { view: "modal_menu", viewFn: modalMenuView, config: { unknown: true, wrap: "modal_menu" } },
            { view: "modal_title", viewFn: modalTitleView, config: { unknown: true } },
            { view: "modal_footer", viewFn: modalFooterView, config: { unknown: true } },
            { view: "modal_link", viewFn: modalLinkView },
            { view: "close_modal_link", viewFn: closeModalLinkView, config: { unknown: true } },
            { view: "pop_out_modal_link", viewFn: popOutModalLinkView, config: { unknown: "blank" } },
          ],
        },
      },
    },
    {
      // card-mod-layout-0.20.0/set/all/navbar_links.rb (the all-pattern
      // definitions; abstract/items' pointer-dropdown :nav_item variant and
      // self/dropdown_divider's overrides are set-scoped - see the header)
      setPath: "all/navbar_links",
      formats: {
        html: {
          views: [
            { view: "navbar_links", viewFn: navbarLinksView, config: { perms: "none" } },
            { view: "nav_item", viewFn: navItemView },
            { view: "nav_link_in_dropdown", viewFn: navLinkInDropdownView },
          ],
        },
      },
    },
    {
      // card-mod-layout-0.20.0/set/abstract/items.rb:1-5 view :nav_item
      // (wrap_with_nav_item nav_dropdown): Pointer and List cards reach it
      // through include_set Abstract::List -> Abstract::Items.
      setPath: "abstract/items",
      formats: {
        html: {
          views: [{ view: "nav_item", viewFn: abstractItemsNavItemView }],
        },
      },
    },
    {
      // card-mod-layout-0.20.0/set/self/dropdown_divider.rb:3-11.
      setPath: "self/dropdown_divider",
      formats: {
        html: {
          views: [
            { view: "nav_item", viewFn: dropdownDividerView },
            { view: "nav_link_in_dropdown", viewFn: dropdownDividerView },
          ],
        },
      },
    },
    {
      // card-mod-layout-0.20.0/set/all/overlay.rb (the :overlay WRAPPER
      // itself - overlay.rb:6-13 - needs the frame/wrap_body machinery and
      // is not ported; the four standalone views are)
      setPath: "all/overlay",
      formats: {
        html: {
          views: [
            { view: "overlay_header", viewFn: overlayHeaderView, config: { unknown: true } },
            { view: "overlay_title", viewFn: overlayTitleView },
            { view: "overlay_menu", viewFn: overlayMenuView },
            {
              view: "overlay_help_link",
              viewFn: overlayHelpLinkView,
              config: { cache: "never", unknown: true },
            },
          ],
        },
      },
    },
    {
      // card-mod-layout-0.20.0/set/right/head.rb (its :core override rides
      // the composed layoutCoreView registered here; :one_line_content is
      // the right/head.rb:12-14 truncate(strip_tags(render_raw)) body, now
      // portable via src/card/render/text-helpers.ts#truncate +
      // nest-syntax.ts#stripTags)
      setPath: "right/head",
      formats: {
        html: {
          views: [
            { view: "head_content", viewFn: headContentView, config: { cache: "yes" } },
            { view: "one_line_content", viewFn: rightHeadOneLineContentView },
            { view: "core", viewFn: layoutCoreView },
          ],
        },
      },
    },
    {
      // card-mod-layout-0.20.0/set/self/account_links.rb - the four
      // account LINK views plus :my_card (the R21
      // port — the account_dropdown arm; the roles arm is the named
      // remainder on the view). The file's :core is NOT registered
      // (auth runtime — see the view block above; the composed
      // accountLinksCoreHtml rides navbar-views.ts's registration).
      setPath: "self/account_links",
      formats: {
        html: {
          views: [
            // account_links.rb:33-35 view :sign_up, perms :show_signup_link?
            { view: "sign_up", viewFn: signUpView, config: { cache: "never" } },
            // account_links.rb:39-41 view :sign_in, perms :not_signed_in?
            { view: "sign_in", viewFn: signInView, config: { cache: "never" } },
            // account_links.rb:44-48 view :sign_out, perms :signed_in?
            { view: "sign_out", viewFn: signOutView, config: { cache: "never" } },
            // account_links.rb:50-54 view :invite, perms :show_invite_link?
            { view: "invite", viewFn: inviteView, config: { cache: "never" } },
            // account_links.rb:56-58 view :my_card, perms :signed_in?,
            // denial :blank
            {
              view: "my_card",
              viewFn: myCardView,
              config: { cache: "never", denial: "blank" },
            },
          ],
        },
      },
    },
    {
      // card-mod-layout-0.20.0/set/right/enabled_roles.rb — the
      // :edit_inline view (the R21 port; the role
      // checkboxes are the named remainder on the view).
      setPath: "right/enabled_roles",
      formats: {
        html: {
          views: [
            {
              view: "edit_inline",
              viewFn: enabledRolesEditInlineView,
              config: { cache: "never", unknown: true },
            },
          ],
        },
      },
    },
    {
      // card-mod-layout-0.20.0/set/self/head.rb (the :core override is NOT
      // ported - nest root.card, view: :head needs the unported :head view
      // and root/main machinery; *head's core falls through to base)
      setPath: "self/head",
      formats: {
        html: {
          views: [
            { view: "input", viewFn: headInputView },
            { view: "bar_bottom", viewFn: headBarBottomView },
          ],
        },
      },
      settingOpts: {
        group: "webpage",
        position: 1,
        ruleTypeEditable: false,
        shortHelpText: "head tag content",
        helpText: "head tag content",
      },
    },
    {
      // card-mod-layout-0.20.0/set/self/layout.rb
      setPath: "self/layout",
      settingOpts: {
        group: "webpage",
        position: 3,
        ruleTypeEditable: false,
        helpText: "HTML structure of card's page [[http://decko.org/layouts | more]]",
      },
    },
    {
      // card-mod-layout-0.20.0/set/type/html.rb: the deprecated
      // :navbar_links override for html-typed menu cards, and nothing else
      // (no :core: an Html-typed card's core is the base format's, as in
      // Ruby, where All::Base owns it). Layout-typed cards reach this module
      // too (set/type/layout_type.rb:5 include_set Type::Html; see
      // concrete-set-includes.ts).
      setPath: "type/html",
      formats: {
        html: {
          views: [{ view: "navbar_links", viewFn: htmlNavbarLinksView, config: { perms: "none" } }],
        },
      },
    },
  ],
  prepareEngine: prepareGuideRules,
};

export default cardModLayout;
