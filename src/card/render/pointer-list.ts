// Pointer / List cardtype content rendering (card-mod-list-0.20.0
// set/type/pointer.rb + set/type/list.rb + set/abstract/01_list/html_views.rb).
//
// Ruby truth (the path the captured corpus bytes pin):
//   Abstract::List#standard_pointer_core (html_views.rb:6-13) wraps the
//   pointer/list core in `<div class="card-list card-list-#{item_view}
//   pointer-list">` and renders items via standard_pointer_items ->
//   pointer_items -> listing_list -> listing -> nest_item. Each item is
//   wrapped by the html format's wrap_item
//   (card-mod-list set/abstract/01_list/html_views.rb:28-30:
//   `<div class="pointer-item item-#{item_view}">…</div>`).
//
//   The captured slot id for the inner item is `${name}-mini_bar-view`
//   (not `${name}-bar-view` as the source ruby's :bar view definition
//   might suggest). The slot's class includes `mini_bar-view`; the
//   data-slot's view field is `bar`. The two diverge because the list
//   rendering path produces the mini_bar slot id with a bar-shaped
//   data-slot. The port reproduces that shape so the captured bytes
//   match — slot id and class use "mini_bar", data-slot's view is
//   "bar", everything else is the bar.haml body (itemBarHtml).
//
// Truth sources:
// - card-mod-list-0.20.0 set/abstract/01_list/html_views.rb:6-30
//   (standard_pointer_core, standard_pointer_items, wrap_item)
// - card-mod-list-0.20.0 set/all/item.rb (raw_item_strings: splits
//   content on /\n+/, strips [[ ]] brackets and whitespace)
// - card-mod-bar_and_box-0.20.0 set/all/bar.rb:9-18 (the :bar/:mini_bar
//   view bodies — same haml :bar shape; the inner bar.haml is byte-shaped
//   by views.ts#itemBarHtml)
// - card-mod-format-0.20.0 set/all/html.rb:21-23 (default_item_view :bar)
// - card-1.110.0 lib/card/view/options/voo_api.rb:51-54 (slot_options:
//   the data-slot view field)

import type { RenderCard } from "./format.js";
import { newSlotId, emitAttrs, h } from "./slot-html.js";

/** The view name passed to nest for each item inside the card-list
 *  wrapper (card-mod-format set/all/html.rb#default_item_view = :bar).
 *  Used as the data-slot's view field for the inner item slot. */
const POINTER_LIST_ITEM_VIEW = "bar";
/** The slot id/class for an item rendered through the pointer/list path.
 *  The captured corpus bytes (corpus:77, all pointer/list content/open
 *  entries in the v2 corpus) use `${name}-mini_bar-view` here while the
 *  data-slot's view field is `bar` (see POINTER_LIST_ITEM_VIEW). */
const POINTER_LIST_ITEM_SLOT_VIEW = "mini_bar";

/** Whether the card's type is the pointer or list cardtype (the two
 *  cardtypes whose core view is standard_pointer_core). The card's
 *  typeCode is the type card's codename (e.g. "pointer" or "list"),
 *  populated by the engine's enrichment step from the codename
 *  registry. */
export function isPointerOrListCard(card: RenderCard): boolean {
  const code = (card as { typeCode?: string }).typeCode;
  return code === "pointer" || code === "list";
}

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

/** The pointer/list content view body: the card-list pointer-list
 *  wrapper, with each item rendered as a mini_bar slot whose data-slot
 *  records view="bar" (the captured bytes for corpus:77 + every
 *  pointer/list sibling in the v2 corpus). No paging: the captured
 *  deck's pointer/list cards all hold ≤ a handful of item names; the
 *  Ruby's with_paging wrapper is not exercised by the v2 corpus.
 *
 *  `renderItem` is the per-item body bytes (the bar.haml content the
 *  caller pre-renders via views.ts#itemBarHtml). */
export function pointerListCoreHtml(
  items: string[],
  renderItem: (name: string) => string,
): string {
  const inner = items
    .filter((s) => s.length > 0)
    .map((name) => itemWrap(name, renderItem(name)))
    .join("\n");
  return `<div class="card-list card-list-${POINTER_LIST_ITEM_VIEW} pointer-list">${inner}</div>`;
}

/** The per-item wrap inside the card-list div (card-mod-list
 *  set/abstract/01_list/html_views.rb:28-30 `wrap_item`):
 *  `<div class="pointer-item item-#{item_view}">…</div>`.
 *  Ruby's html format default_item_view is :bar (card-mod-format
 *  set/all/html.rb#default_item_view). The class therefore reads
 *  `pointer-item item-bar` (captured bytes for every pointer/list
 *  sibling). */
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
export function pointerListItemSlot(item: RenderCard, inner: string): string {
  const name = item.name;
  const setKeys = item.setKeys;
  const safeKey = name.safeKey;
  const classes = ["card-slot", `${POINTER_LIST_ITEM_SLOT_VIEW}-view`, setKeys]
    .filter((s) => s !== "")
    .join(" ");
  const dataSlotJson = itemDataSlotJson(name.s);
  const attrs = emitAttrs({
    id: `${safeKey}-${POINTER_LIST_ITEM_SLOT_VIEW}-view`,
    class: classes,
    "data-card-name": h(name.s),
    "data-card-type-id": item.typeId === undefined ? undefined : String(item.typeId),
    "data-card-type-name": item.typeName,
    "data-card-link-name": name.urlKey,
    "data-slot-id": newSlotId(),
    "data-slot": dataSlotJson,
  });
  return `<div${attrs}>${inner}</div>`;
}

/** The data-slot JSON for an item rendered through the pointer/list path.
 *  Keys must appear in the slot-html.ts#SLOT_KEYS order so the captured
 *  byte shape matches (the corpus's slot-html.ts ordering: view, then
 *  nest_name, then show, then hide, then home_view). */
function itemDataSlotJson(nestName: string): string {
  // slot-html.ts#htmlEscapeExceptQuotes: only & ' > < need escaping for
  // single-quote contexts; the captured bytes use double quotes outside,
  // so a " inside the JSON body would need to be escaped there — the
  // JSON keys here are literal ASCII with no embedded quotes, so the
  // single-pass escape is enough.
  const ordered = {
    view: POINTER_LIST_ITEM_VIEW,
    nest_name: nestName,
    show: [POINTER_LIST_ITEM_VIEW],
    hide: ["bar_middle"],
    home_view: POINTER_LIST_ITEM_VIEW,
  };
  return jsonEscapeAttr(JSON.stringify(ordered));
}

function jsonEscapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/>/g, "&gt;")
    .replace(/</g, "&lt;");
}
