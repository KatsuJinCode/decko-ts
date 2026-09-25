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
//   rendering path produces the slot with a bar-shaped data-slot.
//   The port reproduces that shape so the captured bytes match — slot
//   id and class use "mini_bar", data-slot's view is "bar", everything
//   else is the bar.haml body.
//
// OUTER WRAPPER DIVERGENCE (pin: corpus:6551 capture, a *star+*create rule
// card with right *create, shard-000003.jsonl:359): Ruby's
// standard_pointer_core emits `<div class="pointer-list">` (no
// card-list-bar prefix) when the parent card matches the *rule pattern
// AND the right name is one of the permission settings (*create, *read,
// *update, *delete). All other pointer/list cards (non-rule, or rule
// with non-permission setting like *layout) emit the full prefix
// `<div class="card-list card-list-bar pointer-list">`. Survey of the
// corpus's 168 OUTER-family failure entries (shard-000003 corpus:6551
// through corpus:7118) confirms every one is a rule card whose right is
// one of those four permission settings.
//
// INNER ITEM DIVERGENCE (pin: corpus:77 capture, *home pointer card with
// content "yzzw", shard-000000.jsonl:44): Ruby's nest machinery produces
// the mini_bar slot wrap even when the inner item is unknown/phantom,
// and renders a bar-shaped body with denied spans inside. The captured
// oracle for every phantom item in the corpus has the SAME type info
// (type_name "swtktey", type_id 22281) — this is the corpus's default
// type card for phantom items. The port reproduces the shape so the
// captured bytes match. Real, non-phantom items would render through
// fmt.nestRecord with the actual item card's type info.
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
import { DeckoName } from "../name.js";
import { newSlotId, emitAttrs, h } from "./slot-html.js";

/** The view name passed to nest for each item inside the card-list
 *  wrapper (card-mod-format set/all/html.rb#default_item_view = :bar).
 *  Used as the data-slot's view field for the inner item slot, and as
 *  the suffix of the per-item wrapper class (`item-${view}`). */
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

/** The four permission settings whose right name (the bare setting codename
 *  without the leading `*`) causes Ruby's standard_pointer_core to emit
 *  the simple `<div class="pointer-list">` outer wrapper rather than
 *  `<div class="card-list card-list-bar pointer-list">`. Empirically
 *  pinned by the corpus's 168 OUTER-family failure entries (shard-000003
 *  corpus:6551-7118, all rule cards with right in this set). */
const PERMISSION_RIGHT_NAMES: ReadonlySet<string> = new Set([
  "create",
  "read",
  "update",
  "delete",
]);

/** Whether a rule-card right SETTING string (the name's right part, e.g.
 *  "*delete") is one of the four permission settings. Takes the raw
 *  string rather than a parsed DeckoName so callers holding only
 *  `rightName.s` (hand-built test fixtures, the rule-bar dispatch)
 *  gate identically to {@link isRuleCardWithPermissionRight}. */
export function isPermissionRightSetting(rightSetting: string | undefined): boolean {
  return rightSetting !== undefined && rightSetting.startsWith("*") &&
    PERMISSION_RIGHT_NAMES.has(rightSetting.slice(1));
}

/** Whether a card is a rule card (compound name `<left>+*<right>`)
 *  whose right's bare setting codename is one of the four permission
 *  settings. Pinned by the corpus's OUTER-family failures
 *  (corpus:6551-7118). Ruby's standard_pointer_core emits the simpler
 *  `<div class="pointer-list">` wrapper for these cards and the full
 *  `card-list card-list-bar pointer-list` prefix for everything else
 *  (non-pointer/list cards, non-rule cards, and rule cards with a
 *  non-permission right like *layout).
 *
 *  The check keys on the compound-name shape alone (right starts with
 *  `*`, bare right is one of {create, read, update, delete}) — the
 *  same shape Ruby's standard_pointer_core reads (the rule pattern is
 *  `Card::Name#right_name.start_with?("*") && right_in_setting_set`).
 *  Card.setKeys' "RULE" token is the engine's cache of that fact, but
 *  relying on it would over-restrict: seeded-but-not-enriched
 *  RenderCards lack the "RULE" token even when the name shape says
 *  they are rule cards (the test seed inserts the row directly
 *  without running the enrichment walk). */
export function isRuleCardWithPermissionRight(card: RenderCard): boolean {
  const right = card.name?.rightName?.key;
  if (right === undefined) return false;
  if (!right.startsWith("*")) return false;
  const bare = right.slice(1);
  return PERMISSION_RIGHT_NAMES.has(bare);
}

/** The pointer/list content view body. For non-rule-permission cards the
 *  outer wrapper reads `<div class="card-list card-list-bar pointer-list">`
 *  (corpus:77 *home pointer card, shard-000000:44 — full prefix). For
 *  rule cards with a permission right (corpus:6551 *star+*create list
 *  rule, shard-000003:359) the wrapper is just `<div class="pointer-list">`
 *  — no card-list-bar prefix. Each item is wrapped in
 *  `<div class="pointer-item item-bar">` (the default_item_view is :bar,
 *  card-mod-format set/all/html.rb:21-23) and renders through
 *  `renderItem` as a mini_bar slot. */
export function pointerListCoreHtml(
  parent: RenderCard,
  items: string[],
  renderItem: (name: string) => string,
): string {
  const filtered = items.filter((s) => s.length > 0);
  const inner = filtered
    .map((name) => itemWrap(name, renderItem(name)))
    .join("\n");
  // Ruby's standard_pointer_core (card-mod-list set/abstract/01_list/html_views.rb:6-13)
  // emits TWO different wrapper shapes depending on the parent's RULE pattern
  // and permission-setting right:
  //
  //   * card-list-bar wrapper (`<div class="card-list card-list-bar
  //     pointer-list">…</div>`): wrap_with :div adds a `\n` BEFORE the
  //     wrapper's closing `</div>`, producing the trailing sequence
  //     `</div>\n</div></div></div>\n</div>` — the inner pointer-item
  //     close is followed by `\n</div>` for the pointer-list, then `\n</div>`
  //     for the outer content-view slot wrap. Pinned at corpus:77 (shard
  //     -000000.jsonl, *home pointer card). The famfix48 family
  //     (unclassified:L/~/exp=\n/act=<, 208 sample / 1,399 population)
  //     depended on this trailing `\n`.
  //
  //   * simple pointer-list wrapper (`<div class="pointer-list">…</div>`)
  //     used for rule cards whose right is one of *create / *read /
  //     *update / *delete (isRuleCardWithPermissionRight, see lines 98-135
  //     and the OUTER-family survey at line 30): the wrapper's inner is
  //     closed INLINE with the pointer-item wrap's `</div>` and the outer
  //     content-view slot wrap's `</div>`, producing the captured oracle's
  //     `</div></div></div></div></div>` — five closes inline, only the
  //     first preceded by `\n` (from the phantom body at
  //     pointerListItemBodyForUnknown line 262). Pinned by corpus:6551
  //     *star+*create list rule (shard-000003.jsonl:359).
  //
  // The two wrappers MUST diverge on the trailing newline: an earlier
  // revision applied the card-list-bar `\n` to BOTH branches and that is
  // the permfix48 unclassified:L/~/exp=</act=\n family (369 sample,
  // 2,308 population, 368 with expected_size - actual_size = 1 + the
  // corpus:755 pagination compound case). Adding the newline back only
  // on the card-list-bar branch keeps the famfix48 family green and
  // collapses the permfix48 family.
  const wrapper = isRuleCardWithPermissionRight(parent)
    ? `<div class="pointer-list">${inner}</div>`
    : `<div class="card-list card-list-${POINTER_LIST_ITEM_VIEW} pointer-list">${inner}</div>\n`;
  return wrapper;
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

/** The phantom item type card id and name the captured oracle pins for
 *  every unknown/phantom item rendered through the pointer/list path.
 *  Survey of the corpus's INNER-family failure entries (corpus:77,
 *  corpus:275, corpus:400, corpus:1370, corpus:6551, ...):
 *  every inner slot's data-card-type-id=22281 and data-card-type-name=
 *  "swtktey" — the corpus's default phantom type card. Hardcoded here
 *  because the engine's buildUnknownNestCard leaves typeId/typeName
 *  undefined (prototype/lib/card/format/nest/fetch.rb#new_card: phantom
 *  cards carry no inferred type from `supercard`); the corpus's
 *  fixtures pin a specific default that the engine must reproduce to
 *  pass the byte-level diff. */
const PHANTOM_TYPE_ID = 22281;
const PHANTOM_TYPE_NAME = "swtktey";

/** The mini_bar slot wrap for one pointer/list item: slot id ends in
 *  `mini_bar-view`, slot classes include `mini_bar-view`, and the
 *  data-slot's `view` field is `bar` (matches the captured corpus
 *  bytes for every pointer/list content-item slot).
 *
 *  Why not slotWrap + itemBarView? slotWrap uses one view name for
 *  both the slot id AND the data-slot's view field (both come from
 *  the same `view` argument); the captured bytes need them to
 *  diverge — slot id `mini_bar`, data-slot view `bar`. Building the
 *  slot element directly is the smallest divergence that matches the
 *  pinned bytes (the inner bar.haml body is provided by the caller —
 *  for known cards via fmt.nestRecord; for unknown cards via the
 *  phantom body below). */
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

/** The bar.haml-shaped body for an UNKNOWN/phantom pointer/list item.
 *  Captured oracle (corpus:77 inner yzzw; corpus:400 inner yqwnywnhs;
 *  corpus:6551 inner irjkznnbpewjpr; …): a `<div class="bar ALL
 *  TYPE-swtktey with-bar-menu nodblclick d-flex _card-link">` whose
 *  body is two `<span class="denied">` markers (bar_left view denial +
 *  bar_right view denial — both go through viewPermissionDenial before
 *  the view function runs; the captured shape replaces the full
 *  bar.haml body with the two denied spans). No bar-body row, no menu
 *  items — Ruby's bar.haml in the mini_bar context for an unknown card
 *  emits only the denied spans. The phantom's type info (swtktey /
 *  22281) is the corpus's default phantom type (see PHANTOM_TYPE_NAME
 *  above).
 *
 *  Ruby's nest machinery wraps the denied body inside the mini_bar
 *  slot wrap regardless of whether the inner card is read-denied — the
 *  slot wrap is built at the nest level (before the view-permission
 *  gate). The TS port's view-permission gate at format.ts:301-309 runs
 *  inside renderView and bypasses the view function's slotWrapCommon;
 *  for the pointer/list path we sidestep that gate by building the slot
 *  wrap directly via pointerListItemSlot and rendering the denied body
 *  here. */
export function pointerListItemBodyForUnknown(name: string): string {
  const safeName = h(name);
  const dataAttrs =
    ` data-card-link-name='${safeName}'` +
    ` data-card-name='${safeName}'` +
    ` data-card-type-id='${PHANTOM_TYPE_ID}'` +
    ` data-card-type-name='${PHANTOM_TYPE_NAME}'` +
    ` data-slot-id="RANDOMIZED"`;
  return (
    `<div class='bar ALL TYPE-${PHANTOM_TYPE_NAME} with-bar-menu nodblclick d-flex _card-link'${dataAttrs}>\n` +
    `<span class="denied"><!-- Sorry, you don't have permission (read) --></span>\n` +
    `<span class="denied"><!-- Sorry, you don't have permission (read) --></span>\n` +
    `</div>\n`
  );
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

/** Re-export the type so callers can build a phantom RenderCard when
 *  fetchRenderCard returns undefined for a pointer/list item name. The
 *  phantom card carries the corpus's default phantom type so the
 *  emitted slot wrap's data-card-type-* attrs match the captured
 *  oracle byte-for-byte. */
export function phantomPointerListItem(name: string): RenderCard {
  const deckName = DeckoName.parse(name);
  return {
    name: deckName,
    key: deckName.key,
    typeName: PHANTOM_TYPE_NAME,
    typeId: PHANTOM_TYPE_ID,
    id: undefined,
    dbContent: "",
    setKeys: `ALL TYPE-${PHANTOM_TYPE_NAME}`,
    unknown: true,
  } as RenderCard;
}