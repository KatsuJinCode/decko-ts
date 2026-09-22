// Pointer / List cardtype content rendering (card-mod-list-0.20.0
// set/type/pointer.rb + set/type/list.rb + set/abstract/01_list/html_views.rb).
//
// Ruby truth (the path the captured corpus bytes pin):
//   Abstract::List#standard_pointer_core (html_views.rb:6-13) wraps the
//   pointer/list core in <div class="card-list card-list-#{item_view}
//   pointer-list"> and renders items via standard_pointer_items ->
//   pointer_items -> listing_list -> listing -> nest_item. Each item is
//   wrapped by the html format's wrap_item
//   (set/abstract/01_list/html_views.rb:28-30: `<div class="pointer-item
//   item-#{item_view}">…</div>`).
//
//   The captured slot id for the inner item is `name-mini_bar-view`
//   (not `name-bar-view` as the source ruby's :bar view definition might
//   suggest). The slot's class includes `mini_bar-view`; the data-slot's
//   view field is `bar`. The two diverge because the list rendering
//   path produces the mini_bar slot id with a bar-shaped data-slot. The
//   port reproduces that shape so the captured bytes match — slot id
//   and class use "mini_bar", data-slot's view is "bar", everything
//   else is the bar.haml body (itemBarHtml).
//
// Truth sources:
// - card-mod-list-0.20.0 set/abstract/01_list/html_views.rb:6-30
//   (standard_pointer_core, standard_pointer_items, wrap_item)
// - card-mod-list-0.20.0 set/abstract/01_list.rb (item_strings:
//   splits content on /\n+/, strips [[ ]] and whitespace, the port's
//   rawItemStrings)
// - card-mod-bar_and_box-0.20.0 set/all/bar.rb:9-18 (the :bar/:mini_bar
//   view bodies — same haml :bar shape; the inner bar.haml is byte-shaped
//   by views.ts#itemBarHtml)
// - card-1.110.0 lib/card/view/options/voo_api.rb:51-54 (slot_options:
//   the data-slot view field)
// - card-1.110.0 mod/core/set/all/content.rb (the db_content raw accessor
//   the engine stores in RenderCard.dbContent)

import type { RenderCard, RenderFormat, ViewContext, ViewFn } from "./format.js";
import { newSlotId, emitAttrs, h } from "./slot-html.js";

/** The html format's `default_item_view` (card-mod-format-0.20.0
 *  set/all/html.rb:21-22): the view name passed to nest for each item
 *  inside the card-list wrapper. Ruby's pointer/list rendering nests
 *  with view=:bar by default; the slot id the captured bytes pin is
 *  `mini_bar-view` (not `bar-view`) for these items. */
const POINTER_LIST_ITEM_VIEW = "bar";
/** The slot id for an item rendered through the pointer/list path. The
 *  captured corpus bytes (corpus:77, all `pointer` / `list` type entries
 *  under content / open views) use `name-mini_bar-view` here, while the
 *  data-slot's view field is `bar` (see POINTER_LIST_ITEM_VIEW). */
const POINTER_LIST_ITEM_SLOT_VIEW = "mini_bar";

/** Split db_content into item strings the way Ruby does it
 *  (card-mod-list set/all/item.rb#raw_item_strings): content.to_s.split(/\n+/),
 *  each item stripped of [[ / ]] brackets and surrounding whitespace.
 *  Empty / whitespace-only items survive the split and pass through
 *  verbatim (the corpus's single-line "yzzw" content yields ["yzzw"]). */
export function rawItemStrings(content: string): string[] {
  return content
    .toString()
    .split(/\n+/)
    .map((i) => stripItem(i));
}

/** card-mod-list set/all/item.rb#strip_item: `gsub(/\[\[|\]\]/, "").strip`. */
function stripItem(item: string): string {
  return item.replace(/\[\[|\]\]/g, "").trim();
}

/** Whether the rendered card has pointer or list cardtype (the two
 *  cardtypes whose core view is standard_pointer_core). Caller passes
 *  the cardtype's codename (Ruby card.type_code, retrieved via
 *  the engine's codename registry from card.type_id). The codename
 *  engine module exposes nameForId / peekNameForId; the render path
 *  reads it synchronously through peekNameForId (see render.ts for
 *  the prefetched codehash). */
export function isPointerOrListType(typeCode: string | undefined): boolean {
  return typeCode === "pointer" || typeCode === "list";
}

/** The pointer/list content view body: the card-list pointer-list
 *  wrapper, with each item rendered as a mini_bar slot whose data-slot
 *  records view="bar" (the captured bytes for corpus:77 + every pointer/
 *  list sibling in the v2 corpus). No paging: the captured deck's
 *  pointer/list cards all hold ≤ a handful of item names; the Ruby's
 *  with_paging wrapper is not exercised by the v2 corpus. */
export function pointerListCoreHtml(
  fmt: RenderFormat,
  itemViewFn: (item: RenderCard) => string,
): string {
  const items = rawItemStrings(fmt.card.dbContent).filter((s) => s.length > 0);
  const inner = items.map((name) => itemWrap(name, itemViewFn(name))).join("\n");
  return `<div class="card-list card-list-${POINTER_LIST_ITEM_VIEW} pointer-list">${inner}</div>`;
}

/** The per-item wrap inside the card-list div (card-mod-list
 *  set/abstract/01_list/html_views.rb:28-30 `wrap_item`):
 *  `<div class="pointer-item item-#{item_view}">…</div>`.
 *  Ruby's item_view for the html format is :bar (card-mod-format
 *  set/all/html.rb#default_item_view). The class therefore reads
 *  `pointer-item item-bar` (captured bytes for every pointer/list
 *  entry). */
function itemWrap(name: string, inner: string): string {
  return `<div class="pointer-item item-${POINTER_LIST_ITEM_VIEW}">${inner}</div>`;
}

/** Build the slot element directly for an item: slot id ends in
 *  `mini_bar-view`, slot classes include `mini_bar-view`, and the
 *  data-slot's `view` field is `bar` (matches the captured corpus
 *  bytes for every pointer/list content-item slot).
 *
 *  Why not slotWrap + itemBarView? slotWrap uses one view name for
 *  both the slot id AND the data-slot's view field (both come from
 *  the same `view` argument); the captured bytes need them to
 *  diverge — slot id `mini_bar`, data-slot view `bar`. Building the
 *  slot element directly is the smallest divergence that matches the
 *  pinned bytes (the inner bar.haml body is reused via itemBarHtml). */
export function pointerListItemSlot(
  item: RenderCard,
  typeId: number | undefined,
  inner: string,
): string {
  const name = item.name;
  const setKeys = item.setKeys;
  const safeKey = name.safeKey;
  const classes = ["card-slot", `${POINTER_LIST_ITEM_SLOT_VIEW}-view`, setKeys]
    .filter((s) => s !== "")
    .join(" ");
  const dataSlot = {
    view: POINTER_LIST_ITEM_VIEW,
    nest_name: name.s,
    show: [POINTER_LIST_ITEM_VIEW],
    hide: ["bar_middle"],
    home_view: POINTER_LIST_ITEM_VIEW,
  };
  const attrs = emitAttrs({
    id: `${safeKey}-${POINTER_LIST_ITEM_SLOT_VIEW}-view`,
    class: classes,
    "data-card-name": h(name.s),
    "data-card-type-id": typeId === undefined ? undefined : String(typeId),
    "data-card-type-name": item.typeName,
    "data-card-link-name": name.urlKey,
    "data-slot-id": newSlotId(),
    "data-slot": slotOptionsForItem(),
  });
  return `<div${attrs}>${inner}</div>`;

  function slotOptionsForItem(): string {
    // Order matches slot-html.ts SLOT_KEYS (shark first): view, nest_name,
    // nest_syntax, wrap, show, hide, unknown; then heir (main, home_view,
    // ...). The captured bytes emit exactly these keys in this order.
    const ordered: Record<string, unknown> = {
      view: dataSlot.view,
      nest_name: dataSlot.nest_name,
      show: dataSlot.show,
      hide: dataSlot.hide,
      home_view: dataSlot.home_view,
    };
    return escapeAttr(JSON.stringify(ordered));
  }
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/>/g, "&gt;")
    .replace(/</g, "&lt;");
}

// re-export for clarity; consumers (views.ts) import the helpers above
// via this module's barrel
export type { RenderCard, RenderFormat, ViewContext, ViewFn };
