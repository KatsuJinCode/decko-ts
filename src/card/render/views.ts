// The html-format view registry: TypeScript ports of the view definitions the
// captured fixtures exercise (:open, :closed, :content, :title and the
// internal views they delegate to). Every view cites its Ruby source; the
// byte shapes (attribute order, quoting, whitespace) are pinned by
// fixtures/captured/smoke.json - HAML templates emit sorted single-quoted
// attributes, Rails helpers emit insertion-order double-quoted attributes,
// and the fixtures record which is which.
//
// View sources:
// - :open / :closed   card-mod-bar_and_box-0.20.0 set/all/bar.rb
//                     (build_accordion_bar, prepare_bar, bar_bottom, card_stub)
// - accordion markup  card-mod-bootstrap-0.20.0 set/all/bootstrap/accordion.rb
//                     + accordion_item.haml
// - bar body markup   card-mod-bar_and_box set/all/bar_body.haml
// - :content          card-mod-format-0.20.0 set/all/html/views.rb
//                     (before(:content) -> prepare_content_slot; menu and
//                     edit button render optional: :hide)
// - :title            card-mod-format set/all/title.rb + html block
//                     (wrapped_title, wrapped_joint - note Ruby's
//                     wrap_with :span, joint, classy("joint") loses the
//                     class to content_tag's block content: the joint span
//                     renders BARE, faithfully reproduced)
// - :titled           card-mod-format set/all/html/views.rb (+ header.rb
//                     default_header: main? ? :h1 : :h2 - the one-level-down
//                     heading shift)
// - :menu             card-mod-format set/all/html/menu.rb (help popover via
//                     bootstrap helper.rb#popover_opts, edit_link, board_link)
//                     + help-popover.ts (the help-rule resolution the
//                     data-bs-content value needs)
// - :core/:card_list  card-mod-search-0.20.0 set/abstract/search_views.rb
//                     (search_result_view -> :card_list) + 0_search/views.rb
//                     (html card_list item wrapping) + card-mod-collection
//                     set/all/item.rb#nest_item (item options: size + view)
// - :bar (items)      card-mod-bar_and_box set/all/bar.rb#view(:bar) + bar.haml
//                     + bar_menu.haml

import { DeckoName } from "../name.js";
import { emitAttrs, emitHamlAttrs, h, newSlotId, slotOptionsJson } from "./slot-html.js";
import type { RenderCard, RenderFormat, ViewContext, ViewFn } from "./format.js";
import { isPointerOrListCard, rawItemStrings } from "./pointer-list.js";
import { readMiniBarCols } from "./bar-cols.js";

// ---------------------------------------------------------------------------
// shared emitters
// ---------------------------------------------------------------------------

/** wrap.rb#slot_id. */
function slotId(card: RenderCard, view: string): string {
  return `${card.name.safeKey}-${view}-view`;
}

/** wrap.rb#wrap_classes + slot_attributes: id, class, data (insertion order
 *  - Rails content_tag). `extraClass` carries slot_attr class additions
 *  (the content view's d0-card-content class_up lands via classy extras
 *  instead - see the content view). */
function slotWrap(ctx: ViewContext, view: string, inner: string): string {
  const { fmt, voo } = ctx;
  const card = fmt.card;
  const classes = voo.classy(["card-slot", `${view}-view`, card.setKeys]);
  const attrs = emitAttrs({
    id: slotId(card, view),
    class: classes,
    "data-card-id": card.id === undefined ? undefined : String(card.id),
    "data-card-name": h(card.name.s),
    "data-card-type-id": card.typeId === undefined ? undefined : String(card.typeId),
    "data-card-type-name": card.typeName,
    "data-card-link-name": fmt.urlKey(),
    "data-slot-id": newSlotId(),
    "data-slot": slotOptionsJson(voo.slotOptions()),
  });
  return `<div${attrs}>${inner}</div>`;
}

/** title.rb html block: show_view?(:title_link, :hide) is hide by default
 *  (nothing viz's :title_link) -> render_title_no_link -> wrapped_title
 *  (standard_title). The joint span renders bare - see the module doc. */
const titleView: ViewFn = ({ fmt }) => {
  const escaped = fmt.standardTitle(); // title_in_context: h(name)
  const parts = escaped.split("+").join("<span>+</span>"); // wrapped_title parts.join wrapped_joint
  return `<span class="card-title" title="${escaped}">${parts}</span>`;
};

// ---------------------------------------------------------------------------
// the card menu (menu.rb) - help popover + edit link + board link
// ---------------------------------------------------------------------------

function icon(name: string): string {
  return `<i class="notranslate material-icons">${name}</i>`;
}

function linkToCard(href: string, text: string, attrs: Record<string, string | number | undefined>): string {
  return `<a${emitAttrs(attrs)}>${text}</a>`;
}

/** menu.rb#name_parts_links + #help_title:
 *  "#{name_parts_links} (#{render_type}) #{full_page_link unless card.simple?}". */
function helpTitle(ctx: ViewContext): string {
  const { fmt } = ctx;
  const parts = fmt.card.name.parts
    .map((part) => `<a class="known-card" href="/${h(DeckoName.parse(part).urlKey)}">${h(part)}</a>`)
    .join("+");
  const type = fmt.card.typeName ?? "";
  const typeLink = `<a class="cardtype known-card" href="/${h(DeckoName.parse(type).urlKey)}">${h(type)}</a>`;
  let title = `${parts} (${typeLink}) `;
  if (!fmt.card.name.isSimple) {
    title += `<a class="full-page-link known-card" href="/${h(fmt.urlKey())}">${icon("open_in_full")} </a>`;
  }
  return title;
}

/** menu.rb view :menu (denial/unknown branches deferred - known cards only
 *  in the captured deck). menu_link_classes: "nodblclick" + " _show-on-hover"
 *  (show_view?(:hover_link) default show).
 *
 *  The data-bs-content value comes from the format's helpRules resolver
 *  (help-popover.ts - the full help.rb/popover_opts chain); without an
 *  installed resolver (and for Ruby-blank help text) it is the "&nbsp;"
 *  placeholder helper.rb:48 substitutes - escaped to &amp;nbsp; by the
 *  attribute emitter, the byte shape the corpus pins for help-less cards. */
const menuView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  const url = fmt.urlKey();
  const rawHelp = fmt.menuHelpContentBytes();
  const helpContent = /^\s*$/.test(rawHelp) ? "&nbsp;" : rawHelp;
  const help =
    `<a tabindex="0" data-bs-toggle="popover" data-bs-trigger="hover focus" data-bs-content="${h(helpContent)}"` +
    ` data-bs-placement="left" class="help-link ps-1 _popover_link _card-menu-popover"` +
    ` data-bs-title="${h(helpTitle(ctx))}" href="#">${icon("help")}</a>`;
  const edit =
    `<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip" data-bs-placement="bottom"` +
    ` data-slotter-mode="modal" data-modal-class="modal-lg" href="/${h(url)}/edit" data-remote="true">${icon("edit")} </a>`;
  const board =
    `<a rel="nofollow" class="board-link slotter" title="Advanced" data-bs-toggle="tooltip" data-bs-placement="bottom"` +
    ` href="/${h(url)}/board" data-remote="true">${icon("space_dashboard")} </a>`;
  const menuClasses = `card-menu nodblclick${voo.show("hover_link") ? " _show-on-hover" : ""}`;
  return `<div class="${menuClasses}">${help}\n${edit}\n${board}</div>`;
};

// ---------------------------------------------------------------------------
// :content (html/views.rb)
// ---------------------------------------------------------------------------

const contentView: ViewFn = ({ fmt }) => {
  // wrap do [render_menu(optional: :hide), render_core, render_edit_button(...)] end
  // both optionals are :hide in the captured context -> the body is render_core
  // (which dispatches to the search card_list for Search-type cards).
  return slotWrapCommon(fmt, "content", fmt.renderView("core"));
};

function slotWrapCommon(fmt: ViewContext["fmt"], view: string, inner: string): string {
  const voo = fmt.voo;
  if (voo === undefined) throw new Error("slotWrapCommon outside a render");
  return slotWrap({ fmt, voo }, view, inner);
}

// ---------------------------------------------------------------------------
// :core (base.rb + search_views.rb) and the search :card_list
// ---------------------------------------------------------------------------

const coreView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  if (fmt.card.typeName === "Search") {
    // search_views.rb#search_result_view -> :card_list (html)
    return fmt.renderView("card_list");
  }
  if (isPointerOrListCard(fmt.card)) {
    // Abstract::List#standard_pointer_core (card-mod-list
    // set/abstract/01_list/html_views.rb:6-13): the pointer / list
    // cardtype content renders as a card-list pointer-list wrapper
    // with each item rendered as a mini_bar slot whose data-slot
    // records view="bar". The byte shape is pinned by corpus:77 and
    // every pointer/list sibling in fixtures/corpus/shard-*.jsonl.
    return renderPointerListCore(fmt);
  }
  return fmt.processContent(fmt.renderRaw());
};

/** Render the pointer/list content view body: the card-list pointer-list
 *  wrapper, with each item rendered as a mini_bar slot whose data-slot
 *  records view="bar". Matches Ruby's standard_pointer_core +
 *  standard_pointer_items + listing_list + nest_item (with view=:bar,
 *  slot id = mini_bar-view for items rendered through this path).
 *  See src/card/render/pointer-list.ts for the byte-shape contract. */
function renderPointerListCore(fmt: RenderFormat): string {
  const items = rawItemStrings(fmt.card.dbContent).filter((s) => s.length > 0);
  const inner = items
    .map((name) => {
      // Ruby's nest_item -> nest with view=:bar. The item card might
      // not be in the prefetched render-card map (an item referenced
      // by plain text in db_content, not via {{...}}, is not in the
      // reference closure the prefetch walks); enrich it on demand
      // through the engine's async enrichment so fetchRenderCard sees
      // it on the next read.
      const cached = fmt.engine.fetchRenderCard(name);
      const item = cached ?? fmt.engine.prepareItemForRender?.(name);
      if (item === undefined) {
        // Truly missing card (Ruby: unknown nest target). Render an
        // empty slot to keep the card-list wrapper shape intact.
        return "";
      }
      return fmt.nestRecord(item, "bar", {
        nest_name: item.name.s,
        show: ["bar"],
        hide: ["bar_middle"],
        home_view: "bar",
      });
    })
    .filter((s) => s !== "")
    .map((slotHtml) => pointerItemWrap(slotHtml))
    .join("\n");
  return `<div class="card-list card-list-bar pointer-list">${inner}</div>`;
}

/** card-mod-list set/abstract/01_list/html_views.rb:28-30 `wrap_item`:
 *  `<div class="pointer-item item-bar">…</div>`. Ruby's html format
 *  default_item_view is :bar (card-mod-format set/all/html.rb), so the
 *  class reads `pointer-item item-bar` (captured bytes for every
 *  pointer/list sibling). */
function pointerItemWrap(inner: string): string {
  return `<div class="pointer-item item-bar">${inner}</div>`;
}

const cardListView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  const items = fmt.engine.executeSearch(fmt);
  if (items.length === 0) return fmt.renderView("no_search_results");
  const rendered = items.map((item) => {
    // collection item.rb#nest_item: options = voo.items + (size: voo.size);
    // view ||= implicit_item_view (html default_item_view = :bar).
    const html = fmt.nestRecord(item, "bar", { size: null });
    return `<div class="search-result-item item-bar">${html}</div>`;
  });
  // trailing newline: the captured card_list closes its list div on its own
  // line (fixture byte-pinned)
  return `<div class="card-list card-list-bar search-result-list">${rendered.join("\n")}</div>\n`;
};

const noSearchResultsView: ViewFn = () => `<div class="search-no-results"></div>`;

// ---------------------------------------------------------------------------
// :link (card-mod-format set/all/base.rb) - the [[...]] link-chunk target
// ---------------------------------------------------------------------------

/** base.rb:35-37 view :link + :39-43 link_view: `opts[:known] =
 *  card.known?; link_to_card card.name, _render_title, opts`. The anchor
 *  class is known-card / wanted-card (links.rb add_known_or_wanted_class),
 *  the text is the :title view. A link-chunk LABEL overrides the title view
 *  through the nest's title option (link.rb:31-33 options title:
 *  link_text) - that label path inlines the title bytes here because the
 *  shared :title view does not read voo.title yet (wave-3); the no-label
 *  path renders the real :title view, which is the whole corpus surface. */
const linkView: ViewFn = ({ fmt, voo }) => {
  const known = fmt.card.unknown !== true;
  const cls = known ? "known-card" : "wanted-card";
  const label = typeof voo.opts["title"] === "string" ? (voo.opts["title"] as string) : undefined;
  const inner =
    label !== undefined
      ? `<span class="card-title" title="${h(label)}">${h(label)}</span>`
      : fmt.renderView("title");
  return `<a class="${cls}" href="/${h(fmt.urlKey())}">${inner}</a>`;
};

// ---------------------------------------------------------------------------
// :open / :closed (bar.rb) + accordion (bootstrap)
// ---------------------------------------------------------------------------

/** bar.rb#prepare_bar for the two-col case (bar_cols 9, 3 by default; the
 *  *rule set module overrides to 6, 6 — see bar-cols.ts): class_up the bar
 *  set keys, bar-left/right cols, hide bar-middle. */
function prepareBar(ctx: ViewContext): void {
  const { fmt, voo } = ctx;
  const [leftCol, rightCol] = readMiniBarCols(fmt.card);
  voo.classUp("bar", fmt.card.setKeys); // class_up "bar", full_page_card.safe_set_keys
  voo.classUp("bar-left", `col-${leftCol}`);
  voo.classUp("bar-right", `col-${rightCol}`);
  voo.hide("bar_middle"); // prepare_bar without three_cols: voo.hide :bar_middle
}

/** bar_body.haml: the bar-left/bar-middle/bar-right columns. */
function barBodyHtml(ctx: ViewContext): string {
  const { fmt, voo } = ctx;
  let out = `<div class='${voo.classy("bar-body")} row g-0'>\n`;
  if (voo.show("bar_left")) {
    out += `<div class='${voo.classy("bar-left")}'>\n${fmt.renderView("bar_left")}\n</div>\n`;
  }
  if (voo.show("bar_middle")) {
    out += `<div class='${voo.classy("bar-middle")}'>\n${fmt.renderView("bar_middle")}\n</div>\n`;
  }
  if (voo.show("bar_right")) {
    out += `<div class='${voo.classy("bar-right")}'>\n${fmt.renderView("bar_right")}\n</div>\n`;
  }
  out += `</div>\n`;
  return out;
}

/** bar.rb#card_stub: the lazy-load placeholder for the closed body. */
function cardStub(fmt: ViewContext["fmt"], view: string): string {
  return `<div class="card-slot card-slot-stub" data-stub-url="/${h(fmt.urlKey())}/${view}"></div>`;
}

/** bar.rb#bar_bottom: open bars render bar_bottom now (-> :content);
 *  closed bars stub it. */
function barBottomHtml(ctx: ViewContext, open: boolean): string {
  const { fmt } = ctx;
  if (!open) return cardStub(fmt, "bar_bottom");
  return fmt.renderView("bar_bottom");
}

/** bar.rb#build_accordion_bar + accordion_item.haml, byte-shaped (the
 *  blank line after bar-body is the haml `= title` line's newline). */
function accordionBarHtml(ctx: ViewContext, open: boolean): string {
  const { fmt, voo } = ctx;
  prepareBar(ctx);
  // class_up "accordion-item", "bar #{classy 'bar'}"
  voo.classUp("accordion-item", `bar ${voo.classy("bar")}`);
  const collapseId = `card-${fmt.card.name.safeKey}-closed-collapse-id`;
  const buttonClasses = [open ? undefined : "collapsed", "accordion-button"]
    .filter((s) => s !== undefined)
    .join(" ");
  const collapseClasses = [open ? "show" : undefined, "accordion-collapse", "collapse"]
    .filter((s) => s !== undefined)
    .join(" ");
  const body = open ? fmt.renderView("bar_bottom") : cardStub(fmt, "bar_bottom");
  return (
    `<div class='${voo.classy("accordion-item")}'>\n` +
    `<h2 class='accordion-header nodblclick w-100'>\n` +
    `<button class='${buttonClasses}' data-bs-target='#${collapseId}' data-bs-toggle='collapse' type='button'>\n` +
    barBodyHtml(ctx) +
    `\n</button>\n` +
    `</h2>\n` +
    `<div class='${collapseClasses}' id='${collapseId}'>\n` +
    `<div class='accordion-subheader bg-light p-2 text-end'>\n` +
    `${fmt.renderView("menu")}\n` +
    `</div>\n` +
    `<div class='accordion-body d0-card-body'>\n` +
    `${body}\n` +
    `</div>\n` +
    `</div>\n` +
    `</div>\n`
  );
}

const closedView: ViewFn = (ctx) => {
  const inner = accordionBarHtml(ctx, false);
  return slotWrapCommon(ctx.fmt, "closed", inner);
};

const openView: ViewFn = (ctx) => {
  const inner = accordionBarHtml(ctx, true);
  return slotWrapCommon(ctx.fmt, "open", inner);
};

// ---------------------------------------------------------------------------
// internal bar views
// ---------------------------------------------------------------------------

const barLeftView: ViewFn = ({ fmt }) => fmt.renderView("title");
const barMiddleView: ViewFn = () => "";
const barRightView: ViewFn = () => "";

/** bar.rb view :bar_bottom -> render :content, home_view: :content. */
const barBottomView: ViewFn = ({ fmt }) => fmt.renderView("content", { home_view: "content" });

// ---------------------------------------------------------------------------
// :titled (html/views.rb + header.rb)
// ---------------------------------------------------------------------------

const titledView: ViewFn = ({ fmt, voo }) => {
  // wrap do [naming { render_header }, render_flash, wrap_body { render_titled_content }] end
  const header = headerHtml({ fmt, voo });
  const core = fmt.renderView("titled_content");
  const bodyClasses = ["d0-card-body", "d0-card-content", fmt.card.setKeys].join(" ");
  const inner =
    `<div class="d0-card-header">${header}</div>\n\n` +
    `<div class="${bodyClasses}">${core}</div>`;
  return slotWrapCommon(fmt, "titled", inner);
};

/** header.rb view :header + header_wrap; header_title wraps the title in
 *  default_header (main? ? :h1 : :h2) - the one-level-down heading shift. */
function headerHtml(ctx: ViewContext): string {
  const { fmt, voo } = ctx;
  const tag = fmt.isMain ? "h1" : "h2";
  const titleTag = `<${tag} class="${voo.classy("d0-card-header-title")}">${fmt.renderView("title")}</${tag}>`;
  return `${titleTag}\n${fmt.renderView("menu")}`;
}

const titledContentView: ViewFn = ({ fmt }) => fmt.renderView("core");

// ---------------------------------------------------------------------------
// the search-item :bar (bar.rb view :bar + bar.haml + bar_menu.haml)
// ---------------------------------------------------------------------------

/** bar.haml + bar_menu.haml, byte-shaped. */
function itemBarHtml(ctx: ViewContext): string {
  const { fmt, voo } = ctx;
  prepareBar(ctx);
  if (voo.show("bar_menu")) voo.classUp("bar", "with-bar-menu");
  const card = fmt.card;
  const url = fmt.urlKey();
  const dataAttrs = emitHamlAttrs({
    "data-card-id": card.id === undefined ? undefined : String(card.id),
    "data-card-link-name": url,
    "data-card-name": h(card.name.s),
    "data-card-type-id": card.typeId === undefined ? undefined : String(card.typeId),
    "data-card-type-name": card.typeName,
    "data-slot-id": newSlotId(),
  });
  const menu = itemBarMenuHtml(url);
  return (
    `<div class='${voo.classy("bar")} nodblclick d-flex _card-link'${dataAttrs}>\n` +
    `${barBodyHtml(ctx)}\n` +
    `${menu}\n\n` +
    `</div>\n`
  );
}

/** bar_menu.haml with bar.rb#bar_menu_items. */
function itemBarMenuHtml(url: string): string {
  const fullPage =
    `<a class="full-page-link known-card" href="/${h(url)}">${icon("open_in_full")} page</a>`;
  const modal =
    `<a data-slotter-mode="modal" data-modal-class="modal-dialog modal-dialog-centered modal-xl" size="xl"` +
    ` class="_modal-page-link slotter" href="/${h(url)}?layout=modal" data-remote="true">${icon("fullscreen")} modal</a>`;
  const edit =
    `<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip" data-bs-placement="bottom"` +
    ` data-slotter-mode="modal" data-modal-class="modal-lg" href="/${h(url)}/edit" data-remote="true">${icon("edit")} edit</a>`;
  const board =
    `<a rel="nofollow" class="board-link slotter" title="Advanced" data-bs-toggle="tooltip" data-bs-placement="bottom"` +
    ` data-slotter-mode="modal-replace" href="/${h(url)}/board" data-remote="true">${icon("space_dashboard")} advanced</a>`;
  return (
    `<div class='bar-menu _over-card-link _card-link-clickable'>\n` +
    `<div class='bar-menu-dropdown dropdown'>\n` +
    `<div aria-expanded='false' aria-haspopup='true' class='bar-menu-button btn dropdown-toggle' data-bs-toggle='dropdown'>\n` +
    `${icon("more_horiz")}\n` +
    `</div>\n` +
    `<div aria-labelledby='.bar-menu-button' class='bar-menu-list dropdown-menu'>\n` +
    `<div class='dropdown-item'>\n${fullPage}\n</div>\n` +
    `<div class='dropdown-item'>\n${modal}\n</div>\n` +
    `<div class='dropdown-item'>\n${edit}\n</div>\n` +
    `<div class='dropdown-item'>\n${board}\n</div>\n` +
    `</div>\n</div>\n</div>`
  );
}

const itemBarView: ViewFn = (ctx) => {
  const inner = itemBarHtml(ctx);
  // Ruby's pointer/list content rendering nests items with view=:bar but
  // wraps each in a slot whose id ends in `mini_bar-view` (the bar view
  // body runs, @current_view is set to the view name via the bar view's
  // own wrap, but the captured slot id the corpus pins for items rendered
  // from inside a pointer/list content view is `name-mini_bar-view`).
  // The slot id here uses "mini_bar"; the data-slot's `view` field
  // stays "bar" (overridden via slotViewOverride so the captured byte
  // shape matches - same pattern the rest of the surface uses for the
  // "tiny divergence" between slot id and data-slot view).
  ctx.voo.slotViewOverride = "bar";
  return slotWrapCommon(ctx.fmt, "mini_bar", inner);
};

// ---------------------------------------------------------------------------
// unknown-card views (nest fetch misses render these)
// ---------------------------------------------------------------------------

/** card-mod-format-0.20.0 set/all/html/error.rb:15-17:
 *  `view :unknown do createable { wrap { unknown_link "#{unknown_icon}
 *  #{render_title}" } } end`. createable renders only for viewers with
 *  :create on the new card (error.rb:19-21); the captured deck's anonymous
 *  viewer is denied (fixtures carry NO unknown-link bytes anywhere - the
 *  createable branch would emit `wrap { link_to_view :new_in_modal, ... }`),
 *  so the captured surface of this view is the empty string. */
const unknownView: ViewFn = () => "";

/** base.rb (card-mod-format) view :blank: literally "" (base.rb:109-111). */
const blankView: ViewFn = () => "";

/** html/error.rb:21-23 `view :mini_unknown, unknown: true do
 *  createable { unknown_link unknown_icon } end` - same createable denial
 *  as :unknown on the captured surface. */
const miniUnknownView: ViewFn = () => "";

/** bar.rb:15-18 `view :mini_bar, cache: :yes, unknown: true do
 *  prepare_bar mini_bar_cols; build_bar end` - the same prepare_bar + haml
 *  :bar shape as :bar (bar_cols 9,3 == mini_bar_cols 9,3, bar.rb:5-6), so
 *  the item-bar machinery renders it with the mini_bar slot wrap.
 *  ORACLE CAVEAT: no captured corpus bytes pin an unknown card's mini_bar
 *  (closed-view nests stub their bodies; the captured deck nests unknown
 *  cards only at the default :titled view) - the shape follows the :bar
 *  renderer, unverified against Ruby bytes. */
const miniBarView: ViewFn = (ctx) => {
  const inner = itemBarHtml(ctx);
  return slotWrapCommon(ctx.fmt, "mini_bar", inner);
};

// ---------------------------------------------------------------------------
// registry
// ---------------------------------------------------------------------------

/** The html-format view registry (Set::Format.view_method_name dispatch).
 *  Views NOT in this registry raise the unsupported-view UserError. */
export const HTML_VIEWS: Record<string, ViewFn> = {
  title: titleView,
  content: contentView,
  core: coreView,
  card_list: cardListView,
  no_search_results: noSearchResultsView,
  open: openView,
  closed: closedView,
  titled: titledView,
  titled_content: titledContentView,
  menu: menuView,
  link: linkView,
  bar: itemBarView,
  mini_bar: miniBarView,
  bar_left: barLeftView,
  bar_middle: barMiddleView,
  bar_right: barRightView,
  bar_bottom: barBottomView,
  unknown: unknownView,
  blank: blankView,
  mini_unknown: miniUnknownView,
};
