// Pointer / List cardtype content rendering (card-mod-list-0.20.0
// set/type/pointer.rb + set/type/list.rb + set/abstract/01_list/html_views.rb).
//
// Ruby truth:
//   Abstract::List#standard_pointer_core (html_views.rb:6-13) wraps the
//   pointer/list core in `<div class="card-list card-list-#{item_view}
//   pointer-list">` and renders items via standard_pointer_items ->
//   pointer_items -> listing_list -> listing -> nest_item. Each item is
//   wrapped by the html format's wrap_item
//   (card-mod-list set/abstract/01_list/html_views.rb:28-30:
//   `<div class="pointer-item item-#{item_view}">…</div>`).
//
//   The inner item's slot id is `${name}-mini_bar-view`
//   (not `${name}-bar-view` as the source ruby's :bar view definition
//   might suggest). The slot's class includes `mini_bar-view`; the
//   data-slot's view field is `bar`. The two diverge because the list
//   rendering path produces the slot with a bar-shaped data-slot.
//   The port reproduces that shape — slot
//   id and class use "mini_bar", data-slot's view is "bar", everything
//   else is the bar.haml body.
//
// OUTER WRAPPER DIVERGENCE: Ruby's
// standard_pointer_core emits `<div class="pointer-list">` (no
// card-list-bar prefix) when the parent card matches the *rule pattern
// AND the right name is one of the permission settings (*create, *read,
// *update, *delete). All other pointer/list cards (non-rule, or rule
// with non-permission setting like *layout) emit the full prefix
// `<div class="card-list card-list-bar pointer-list">`.
//
// INNER ITEM DIVERGENCE: Ruby's nest machinery produces
// the mini_bar slot wrap even when the inner item is unknown/phantom,
// and renders a bar-shaped body with denied spans inside. The deck's
// default type card supplies the phantom item's type info (see the
// PhantomItemType doc below); the port reproduces Ruby's shape. Real,
// non-phantom items render through fmt.nestRecord with the actual item
// card's type info.
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

import type { PhantomItemType, RenderCard } from "./format.js";
import { serializerFollowsLive } from "./deployment-follow-live-config.js";
import { DeckoName } from "../name.js";
import { isNewCard, type CardRecord } from "../fetch/card-record.js";
import { newSlotId, emitAttrs, emitHamlAttrs, h } from "./slot-html.js";
import { hamlSlotInHash } from "./haml-slot-style.js";

/** The view name passed to nest for each item inside the card-list
 *  wrapper (card-mod-format set/all/html.rb#default_item_view = :bar).
 *  Used as the data-slot's view field for the inner item slot, and as
 *  the suffix of the per-item wrapper class (`item-${view}`). */
const POINTER_LIST_ITEM_VIEW = "bar";
/** The slot id/class for an item rendered through the pointer/list path.
 *  It is `${name}-mini_bar-view` while the
 *  data-slot's view field is `bar` (see POINTER_LIST_ITEM_VIEW). */
const POINTER_LIST_ITEM_SLOT_VIEW = "mini_bar";

/** Whether the card's type is the pointer or list cardtype (the two
 *  cardtypes whose core view is standard_pointer_core) — plus the Skin
 *  cardtype, the third cardtype that inherits the same core:
 *  card-mod-style-0.20.0 set/type/skin.rb:3 `include_set List` puts
 *  Type::Skin on the SAME Abstract::List module, so a Skin card's html
 *  :core renders the identical card-list pointer-list wrapper.
 *  BootswatchSkin is
 *  deliberately ABSENT: its type module (card-mod-bootstrap
 *  set/type/bootswatch_skin.rb) does NOT include List — its content is
 *  the CONTENT_PARTS method join and its page core is the bootstrap
 *  mod's haml view, not the list machinery.
 *
 *  The card's typeCode is the type card's codename (e.g. "pointer" or
 *  "list"), populated by the engine's enrichment step from the codename
 *  registry. The two rule-card call sites (rule-bar-right, the open-view
 *  content dispatch) are unaffected: a rule card's typeCode is the
 *  setting's default type, never "skin". */
export function isPointerOrListCard(card: RenderCard): boolean {
  const code = (card as { typeCode?: string }).typeCode;
  return code === "pointer" || code === "list" || code === "skin";
}

/** Split db_content into item strings the way Ruby does it
 *  (card-mod-list set/all/item.rb#raw_item_strings): content.to_s.split(/\n+/),
 *  each item stripped of [[ / ]] brackets and surrounding whitespace.
 *  Empty / whitespace-only items survive the split and pass through
 *  verbatim. */
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

/** The nest-fetch name resolution for ONE pointer/list item line — the item
 *  strings are nest references, and Ruby's nest machinery resolves them
 *  through Card::Name's contextual algebra (nest/fetch.rb new_card:
 *  `view_opts[:nest_name] = Card::Name[cardish].to_s`; contextual.rb
 *  absolutize_contextual_parts) BEFORE the fetch. Absolute lines pass
 *  through unchanged; relative lines absolutize against the HOST card's
 *  name; SESSION-relative lines resolve through Card::Name.session
 *  (environment.ts session — "Anonymous" when signed out).
 *  A relative item like "_user" must therefore resolve to the session
 *  user's card: an unresolved literal "_user" would collide with the
 *  User cardtype's key ("user") and render THAT card's denial.
 *
 *  Tolerance matches the sync render path's other mark parses: an
 *  unresolvable ID/codename mark throws at DeckoName.parse; the raw line
 *  is kept so the downstream phantom path renders its own tolerance shape
 *  instead of failing the render. */
export function resolvePointerItemName(item: string, hostName: DeckoName): string {
  try {
    const parsed = DeckoName.parse(item);
    // item.rb clean_item_name absolutizes every line; an absolute name only
    // changes there when a blank extreme takes the context
    // (contextual.rb absolutize_extremes): "Alpha Family+" under
    // "Beta Project" names "Alpha Family+Beta Project".
    const parts = parsed.parts;
    const blankExtreme = parts.length > 1 && (parts[0] === "" || parts[parts.length - 1] === "");
    if (parsed.isAbsolute && !blankExtreme) return item;
    return parsed.absoluteName(hostName).s;
  } catch {
    return item;
  }
}

/** The four permission settings whose right name (the bare setting codename
 *  without the leading `*`) causes Ruby's standard_pointer_core to emit
 *  the simple `<div class="pointer-list">` outer wrapper rather than
 *  `<div class="card-list card-list-bar pointer-list">`. */
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
 *  settings. Ruby's standard_pointer_core emits the simpler
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

/** The right-setting key whose html `default_item_view` is `:name` rather
 *  than the deck-wide `:bar`: `*input_type`, the underscore-slugged KEY form
 *  of `*input type`. Read off `DeckoName#rightName.key`, the same field
 *  `isRuleCardWithPermissionRight` reads for `*read` / `*delete`.
 *
 *  `decko/mod/edit/set/right/input_type.rb:3-5` is a `set/right/*` module,
 *  so Cardio's set-module precedence puts it ABOVE
 *  `card-mod-format set/all/html.rb:20-22` (whose `default_item_view` is
 *  `:bar`) for every card whose right name is `*input type` — the
 *  `assign_type :pointer` line above it makes those cards List/Pointer
 *  typed, so `standard_pointer_core` runs on them and reads the override.
 *
 *  The override is what makes those cards emit `<div class="card-list
 *  card-list-name pointer-list"><div class="pointer-item item-name">NAME
 *  </div></div>`: `implicit_item_view` (decko/mod/collection set/all/item.rb
 *  :134-140) is `voo_items_view || default_item_view`, and both
 *  `standard_pointer_core`'s wrapper class
 *  (decko/mod/list set/abstract/01_list/html_views.rb:6-13,
 *  `"card-list card-list-#{item_view_options[:view]} pointer-list"`) and
 *  `wrap_item` (same file :28-30, `"item-#{item_view}"`) read that value. */
const INPUT_TYPE_RIGHT_KEY = "*input_type";

/** Whether the pointer/list HOST's html default item view is `:name`
 *  (the `set/right/input_type` override) rather than the deck-wide
 *  `:bar`. Same shape test as {@link isRuleCardWithPermissionRight}: the
 *  name's right part, not the setKeys "RULE" token (a seeded-but-not-
 *  enriched RenderCard carries no RULE token while its name still says
 *  the rule). */
export function isInputTypeRuleCard(card: RenderCard): boolean {
  return card.name?.rightName?.key === INPUT_TYPE_RIGHT_KEY;
}

/** The pointer/list content view body. For non-rule-permission cards the
 *  outer wrapper reads `<div class="card-list card-list-bar pointer-list">`.
 *  For
 *  rule cards with a permission right the wrapper is just `<div class="pointer-list">`
 *  — no card-list-bar prefix. Each item is wrapped in
 *  `<div class="pointer-item item-bar">` (the default_item_view is :bar,
 *  card-mod-format set/all/html.rb:21-23) and renders through
 *  `renderItem` as a mini_bar slot. */
export function pointerListCoreHtml(
  parent: RenderCard,
  items: string[],
  renderItem: (name: string) => string,
  itemView: string = POINTER_LIST_ITEM_VIEW,
  /** Ruby's paging split: the ITEMS are the with_paging limit/offset slice
   *  (html_views.rb:12 standard_pointer_items extracts limit/offset from
   *  paging_args), while show_paging? and the nav's paging-context read the
   *  SEPARATE count search (card-mod-search set/abstract/0_search.rb:52-54,
   *  offset 0 / limit 0). Call sites that hand over an ALREADY-LIMITED item
   *  list (the Mod cardtype page's pre-executed type-member search seat)
   *  pass the seated full count here so `count > POINTER_PAGING_LIMIT`
   *  fires and the context renders "of <full count>". Absent, count stays
   *  filtered.length (every existing call site: unpaginated content). */
  countOverride?: number,
  /** html_views.rb:16 standard_pointer_items:
   *  `pointer_items(...).join(voo.separator || "\n")` — the voo's
   *  `separator:` opt (a keymap[:both] shark key, options.rb:65) rides the
   *  A10 nest-option bridge; undefined falls back to the newline join.
   *  Ruby's `||` falls back on nil only, so an authored empty string joins
   *  with "". */
  separator = "\n",
): string {
  const filtered = items.filter((s) => s.length > 0);
  // Ruby's pointer core runs INSIDE with_paging (html_views.rb:6-13
  // standard_pointer_core -> paging_views.rb:20-25 with_paging) — the item
  // list is sliced to limit/offset and a paging nav follows the card-list
  // div whenever show_paging? holds. Headless render: no Env params and
  // no voo CQL, so contextual_param falls through to
  // default_limit 20 (card-mod-list set/abstract/01_list/other_views.rb:3-5)
  // and offset 0 (paging.rb:8-10). show_paging? (paging_views.rb:2-9):
  // limit >= 1, NOT fewer_results_than_limit? (offset 0 and limit > count),
  // and limit < count — i.e. the nav appears exactly when count > 20.
  // The mechanism wraps ALL pointer/list cores, not only LIST-typed
  // cards: the html_views.rb citation covers every pointer/list core,
  // paged POINTER cores and LIST cores alike — the nav emitter is
  // byte-identical for the headless page-0 case.
  const count = countOverride ?? filtered.length;
  const paged =
    parent.name !== undefined && count > POINTER_PAGING_LIMIT;
  const listed = paged ? filtered.slice(0, POINTER_PAGING_LIMIT) : filtered;
  const inner = listed
    .map((name) => itemWrap(name, renderItem(name), itemView))
    .join(separator);
  // Ruby's standard_pointer_core (card-mod-list set/abstract/01_list/html_views.rb:6-13)
  // emits TWO different wrapper shapes depending on the parent's RULE pattern
  // and permission-setting right:
  //
  //   * card-list-bar wrapper (`<div class="card-list card-list-bar
  //     pointer-list">…</div>`): wrap_with :div adds a `\n` BEFORE the
  //     wrapper's closing `</div>`, producing the trailing sequence
  //     `</div>\n</div></div></div>\n</div>` — the inner pointer-item
  //     close is followed by `\n</div>` for the pointer-list, then `\n</div>`
  //     for the outer content-view slot wrap.
  //
  //   * simple pointer-list wrapper (`<div class="pointer-list">…</div>`)
  //     used for rule cards whose right is one of *create / *read /
  //     *update / *delete (isRuleCardWithPermissionRight): the wrapper's inner is
  //     closed INLINE with the pointer-item wrap's `</div>` and the outer
  //     content-view slot wrap's `</div>`, producing
  //     `</div></div></div></div></div>` — five closes inline, only the
  //     first preceded by `\n` (from the phantom body at
  //     pointerListItemBodyForUnknown line 262).
  //
  // The two wrappers MUST diverge on the trailing newline: applying the
  // card-list-bar `\n` to BOTH branches changes every simple-wrapper
  // render's byte shape (an extra `\n` before the slot close). Keeping the
  // newline on the card-list-bar branch only reproduces both Ruby shapes.
  //
  // The paging nav rides ONLY the card-list wrapper branch: those are the
  // renders whose Ruby path is standard_pointer_core's with_paging. The
  // simple rule-card shape has its own Ruby view (small rule lists, always
  // under the limit) and is left byte-identical. When the nav follows, the
  // output-join "\n" (card-1.110.0 lib/card/format/content.rb:70-73
  // `output` joins the array with "\n") supplies the separator the
  // unpaginated wrapper's trailing "\n" carried, and the nav's own trailing
  // "\n" keeps the slot-close shape (`</nav>\n</div>`).
  const ruleShape = isRuleCardWithPermissionRight(parent);
  const wrapper = ruleShape
    ? `<div class="pointer-list">${inner}</div>`
    : `<div class="card-list card-list-${itemView} pointer-list">${inner}</div>`;
  if (!paged) {
    return ruleShape ? wrapper : `${wrapper}\n`;
  }
  return `${wrapper}\n${pointerPagingNav(parent, count)}\n`;
}

/** card-mod-list set/abstract/01_list/other_views.rb:3-5 def default_limit: 20. */
const POINTER_PAGING_LIMIT = 20;
/** paging_views.rb:31 `PagingLinks.new(total_pages, current_page).build 5` —
 *  the html paging window (page links shown on each side of the current
 *  page). Headless renders always sit on page 0 (offset 0), so the window
 *  start is always 0 and the leading first-page/ellipse links never fire. */
const POINTER_PAGING_WINDOW = 5;
/** paging_links.rb:4 MAX_PAGES = 100 — the final-page link is dropped past
 *  it (add_final_page?, paging_links.rb:54-56). */
const POINTER_PAGING_MAX_PAGES = 100;

/** The `view :paging` nav bytes (card-mod-collection set/abstract/paging/
 *  paging.haml, rendered when show_paging? holds). Single-quoted class
 *  attributes (the deck's HAML attr wrapper), the lis on ONE line
 *  (`= paging_links.join`), and the paging-context numbers one per line
 *  (one haml expression per line). Headless current_page is always 0
 *  (paging.rb:32-34 offset/limit), so:
 *  - « previous_page is false -> the nil-page DIV form, the aria-label
 *    option dropped (paging_views.rb:48-50 page_link);
 *  - the window is pages 0..min(5, total_pages), page 0 active
 *    (PAGE_LI_CLASS :current -> "page-item active");
 *  - » next_page is always truthy (show_paging? implies total_pages >= 1)
 *    -> the anchor form carrying aria-label="Next" FIRST (Rails attr order
 *    over the merged options hash).
 *  The paging-context reads offset+1, last_item_on_page
 *  (min(count, offset+limit), paging.rb:47-49), count_with_params. */
function pointerPagingNav(parent: RenderCard, count: number): string {
  const limit = POINTER_PAGING_LIMIT;
  const total = Math.floor((count - 1) / limit);
  const base = `/${parent.name.urlKey}`;
  const href = (page: number) => `${base}?limit=${limit}&amp;offset=${page * limit}`;
  const lis: string[] = [];
  lis.push(
    '<li class="page-item"><div class="page-link">' +
      '<span aria-hidden="true">&laquo;</span></div></li>',
  );
  const windowEnd = Math.min(POINTER_PAGING_WINDOW, total);
  for (let page = 0; page <= windowEnd; page++) {
    lis.push(
      `<li class="page-item${page === 0 ? " active" : ""}">` +
        `<a class="card-paging-link slotter page-link" href="${href(page)}"` +
        ` data-remote="true">${page + 1}</a></li>`,
    );
  }
  if (total > windowEnd + 1) {
    lis.push(
      '<li class="page-item disabled"><div class="page-link"><span>...</span></div></li>',
    );
  }
  if (total <= POINTER_PAGING_MAX_PAGES && total > windowEnd) {
    lis.push(
      `<li class="page-item"><a class="card-paging-link slotter page-link"` +
        ` href="${href(total)}" data-remote="true">${total + 1}</a></li>`,
    );
  }
  lis.push(
    `<li class="page-item"><a aria-label="Next"` +
      ` class="card-paging-link slotter page-link" href="${href(1)}"` +
      ` data-remote="true"><span aria-hidden="true">&raquo;</span></a></li>`,
  );
  const lastItem = Math.min(count, limit);
  return (
    `<nav class='nav justify-content-between align-items-center'>\n` +
    `<ul class='pagination paging'>\n${lis.join("")}\n</ul>\n` +
    `<div class='paging-context'>\n1\n-\n${lastItem}\nof\n${count}\n</div>\n</nav>`
  );
}

/** The per-item wrap inside the card-list div (card-mod-list
 *  set/abstract/01_list/html_views.rb:28-30 `wrap_item`):
 *  `<div class="pointer-item item-#{item_view}">…</div>`.
 *  Ruby's html format default_item_view is :bar (card-mod-format
 *  set/all/html.rb#default_item_view). The class therefore reads
 *  `pointer-item item-bar`; a caller overriding the item view
 *  (01_list.rb:39-44 mutates voo.items[:view] per arm) changes the class
 *  with it (item-box / item-titled / item-labeled). */
function itemWrap(name: string, inner: string, itemView: string = POINTER_LIST_ITEM_VIEW): string {
  return `<div class="pointer-item item-${itemView}">${inner}</div>`;
}

/** The phantom item's TYPE identity (id, display name, class-chip key).
 *
 *  WHY IT IS A DECK CONFIGURATION AND NOT A CONSTANT: in Ruby this
 *  identity is the DECK's own
 *  `*all+*default` template type — `Card.fetch(name, new: {})` resolves
 *  type_id through that deck's rule row (states.rb:44-50 + the *default
 *  template chain) — so it differs per deck. Hard-coding one deck's
 *  values made every other deck's unknown pointer items render another
 *  deck's type chip and data-card-type-* attributes.
 *
 *  It is engine configuration now (RenderEngineLike.phantomItemType, beside
 *  imageCdnHost — same "host-deployment config, undefined = stock shape"
 *  contract). undefined is NOT a fallback to some other deck's type: it is
 *  the shape a deck with no `*all+*default` rule produces, where Ruby's
 *  template walk answers nil and the new card carries no type at all — no
 *  TYPE- chip, no data-card-type-id, no data-card-type-name. The engine's
 *  buildUnknownNestCard leaves typeId/typeName undefined for the same reason
 *  (card 1.110.0 lib/card/format/nest/fetch.rb#new_card: phantom cards carry no
 *  inferred type from `supercard`). */
export type { PhantomItemType } from "./format.js";

/** The mini_bar slot wrap for one pointer/list item: slot id ends in
 *  `mini_bar-view`, slot classes include `mini_bar-view`, and the
 *  data-slot's `view` field is `bar`.
 *
 *  `slotTypeName` is the HOST's item_type_name (card-mod-collection
 *  item.rb:157-162 determine_item_view_options_type folds
 *  `options[:type] = card.item_type_name` into the item nest; the value
 *  rides voo.slot_options into the slot JSON). undefined = no host item
 *  type — the type-less slot JSON.
 *
 *  Why not slotWrap + itemBarView? slotWrap uses one view name for
 *  both the slot id AND the data-slot's view field (both come from
 *  the same `view` argument); this path needs them to
 *  diverge — slot id `mini_bar`, data-slot view `bar`. Building the
 *  slot element directly is the smallest divergence that matches Ruby
 *  (the inner bar.haml body is provided by the caller —
 *  for known cards via fmt.nestRecord; for unknown cards via the
 *  phantom body below). */
export function pointerListItemSlot(
  item: RenderCard,
  inner: string,
  slotTypeName?: string,
): string {
  const name = item.name;
  const setKeys = item.setKeys;
  const safeKey = name.safeKey;
  const classes = ["card-slot", `${POINTER_LIST_ITEM_SLOT_VIEW}-view`, setKeys]
    .filter((s) => s !== "")
    .join(" ");
  const dataSlotJson = itemDataSlotJson(name.s, slotTypeName);
  // card-mod-format wrap.rb:50-53 #slot_cardname (see views.ts#slotCardname):
  // an unsaved compound card displays name.url_key. Phantom items are
  // unsaved by definition (record-less, or a record built new); saved
  // real items display their stored name verbatim.
  const unsaved = item.record === undefined || isNewCard(item.record);
  const cardname = unsaved && name.isCompound ? name.urlKey : name.s;
  const attrs = emitAttrs({
    id: `${safeKey}-${POINTER_LIST_ITEM_SLOT_VIEW}-view`,
    class: classes,
    "data-card-name": cardname,
    "data-card-type-id": item.typeId === undefined ? undefined : String(item.typeId),
    "data-card-type-name": item.typeName,
    "data-card-link-name": name.urlKey,
    "data-slot-id": newSlotId(),
    "data-slot": dataSlotJson,
  });
  return `<div${attrs}>${inner}</div>`;
}

/** The class chain for a phantom item: `ALL TYPE-<key>` when the deck
 *  configures a phantom type, and the bare `ALL` when it does not (no type
 *  chip at all — the shape a deck with no `*all+*default` rule renders).
 *  The chip token is the type's simpleKey form, which is configuration
 *  (`typeKey`) rather than something derived from the display name. */
function phantomSetKeys(phantomType: PhantomItemType | undefined): string {
  return phantomType === undefined ? "ALL" : `ALL TYPE-${phantomType.typeKey}`;
}

/** The bar.haml-shaped body for an UNKNOWN/phantom pointer/list item:
 *  a `<div class="bar ALL TYPE-<typeKey> with-bar-menu nodblclick d-flex
 *  _card-link">`-shaped element (when the deck configures a phantom type)
 *  whose
 *  body is two `<span class="denied">` markers (bar_left view denial +
 *  bar_right view denial — both go through viewPermissionDenial before
 *  the view function runs, so the full
 *  bar.haml body collapses to the two denied spans). No bar-body row, no
 *  menu items — Ruby's bar.haml in the mini_bar context for an unknown card
 *  emits only the denied spans. The phantom's type info comes from the
 *  deck configuration (see the PhantomItemType doc).
 *
 *  Ruby's nest machinery wraps the denied body inside the mini_bar
 *  slot wrap regardless of whether the inner card is read-denied — the
 *  slot wrap is built at the nest level (before the view-permission
 *  gate). The TS port's view-permission gate at format.ts:301-309 runs
 *  inside renderView and bypasses the view function's slotWrapCommon;
 *  for the pointer/list path we sidestep that gate by building the slot
 *  wrap directly via pointerListItemSlot and rendering the denied body
 *  here. */
export function pointerListItemBodyForUnknown(
  name: string,
  identity?: { setKeys?: string; typeName?: string; typeId?: number },
  deckPhantomType?: PhantomItemType,
): string {
  // The phantom's type identity is the DECK's configuration (the header
  // above), with the caller's resolved `identity` taking precedence — the
  // read-denied KNOWN-item path emits the fetched card's real set keys and
  // type attrs (the slot + body shapes are identical; only the identity
  // tokens differ). With neither, the item renders with NO type chip and NO
  // type attributes: the shape a deck with no `*all+*default` template type
  // produces, not another deck's type.
  const setKeys = identity?.setKeys ?? phantomSetKeys(deckPhantomType);
  const typeName = identity?.typeName ?? deckPhantomType?.typeName;
  const typeId = identity?.typeId ?? deckPhantomType?.typeId;
  // The attr pair shape: `data-card-link-name='<url-key>'`
  // `data-card-name='<name>'`
  // — the LINK attr is the url-key form, the NAME attr the display form.
  // A resolved session-relative mark follows the same rule — parse
  // resolves, urlKey slugs. This parse can raise
  // only for a mark the name environment cannot resolve, and the phantom
  // path already parsed this exact string in phantomPointerListItem
  // before reaching the body, so no new throw surface.
  // data-card-link-name carries the name's url_key form (whitespace runs
  // fold to ONE underscore, case preserved — links.rb:75-80 link_to_card's
  // mark path, the same urlKey every other link-name emitter uses:
  // barDivHtml views.ts, pointerListItemSlot, boxView). Multi-word names
  // show the folding ("Simple Skin" -> simple_skin); data-card-name keeps
  // slotCardname's rule:
  // the raw stored/authored name (these phantoms are simple names).
  //
  // This body is the bar.haml SHAPE, so its data attrs cross the same
  // Haml escape_attrs boundary barDivHtml's do — emitHamlAttrs owns that
  // escape (slot-html.ts cites haml-5.2.2
  // lib/haml/attribute_builder.rb:51-59) and the name arrives h()-escaped
  // because that is what Ruby's slot_cardname returns (wrap.rb:50-54).
  // Routing the four attrs through the shared emitter instead of
  // hand-interpolating them keeps the denied body and the live bar on one
  // contract.
  const safeLinkName = DeckoName.parse(name).urlKey;
  // The slot id rides the same Haml `data:` hash, so it is single-quoted
  // like the other four (stock Ruby's bar.haml passes wrap_data — slot id
  // included — as one hash); in the separate style it is a double-quoted
  // attribute after the hash, like the live bar emitters.
  const slotId = newSlotId();
  const hamlInHash = hamlSlotInHash();
  const dataAttrs = emitHamlAttrs({
    "data-card-link-name": safeLinkName,
    "data-card-name": h(name),
    "data-card-type-id": typeId,
    "data-card-type-name": typeName,
    ...(hamlInHash ? { "data-slot-id": slotId } : {}),
  });
  return (
    `<div class='${serializerFollowsLive() ? `nodblclick d-flex _card-link bar ${h(setKeys)} with-bar-menu` : `bar ${h(setKeys)} with-bar-menu nodblclick d-flex _card-link`}'${dataAttrs}${hamlInHash ? "" : ` data-slot-id="${slotId}"`}>\n` +
    `<span class="denied"><!-- Sorry, you don't have permission (read) --></span>\n` +
    `<span class="denied"><!-- Sorry, you don't have permission (read) --></span>\n` +
    `</div>\n`
  );
}

/** The data-slot JSON for an item rendered through the pointer/list path.
 *  Keys must appear in the slot-html.ts#SLOT_KEYS order
 *  (view, then
 *  nest_name, then show, then hide, then home_view, then the host's
 *  item `type` — keymap "both" order, item.rb:157-162's type value). */
function itemDataSlotJson(nestName: string, typeName?: string): string {
  // slot-html.ts#htmlEscapeExceptQuotes: only & ' > < need escaping for
  // single-quote contexts; the attribute is emitted inside double quotes,
  // so a " inside the JSON body would need to be escaped there — the
  // JSON keys here are literal ASCII with no embedded quotes, so the
  // single-pass escape is enough.
  const ordered: Record<string, unknown> = {
    view: POINTER_LIST_ITEM_VIEW,
    nest_name: nestName,
    show: [POINTER_LIST_ITEM_VIEW],
    hide: ["bar_middle"],
    home_view: POINTER_LIST_ITEM_VIEW,
  };
  if (typeName !== undefined) ordered["type"] = typeName;
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
 *  phantom card carries the item type its HOST resolves (item.rb:245-248
 *  new_unknown_item_args: `itype = args[:type] || item_type_name; itype ?
 *  { type: itype } : {}` — the typed identity argument below); with no host
 *  type it falls back to the DECK's configured `*all+*default` template type
 *  (the `deckPhantomType` argument — Ruby's ensure_type_id template walk),
 *  and with neither the phantom carries no type at all. */
export function phantomPointerListItem(
  name: string,
  typed?: { typeName: string; typeId: number },
  deckPhantomType?: PhantomItemType,
): RenderCard {
  const deckName = DeckoName.parse(name);
  const typeName = typed?.typeName ?? deckPhantomType?.typeName;
  const typeId = typed?.typeId ?? deckPhantomType?.typeId;
  // Typed identities carry the type's KEY form in the class chain — the
  // class reads `card-slot mini_bar-view ALL TYPE-<key>` for the
  // rule-typed unknown items. The no-host-identity arm uses the deck's
  // configured phantom type's key (the *all+*default template's own class
  // token), and with no configured type the chip is absent entirely.
  const setKeys =
    typed !== undefined
      ? `ALL TYPE-${DeckoName.parse(typed.typeName).key}`
      : phantomSetKeys(deckPhantomType);
  // The record is a proper unsaved record (Ruby's Card.new on the fetch
  // miss) so the slot builders' slot_cardname rule reads a real new?
  // state instead of special-casing a record-less cast.
  const record: CardRecord = {
    id: undefined,
    codename: undefined,
    leftId: undefined,
    rightId: undefined,
    typeId,
    dbContent: undefined,
    trash: false,
    creatorId: undefined,
    updaterId: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    currentRevisionId: undefined,
    readRuleClass: undefined,
    readRuleId: undefined,
    referencesExpired: undefined,
    name: deckName,
    key: deckName.key,
    isNew: true,
    fromTrash: false,
    uncacheable: false,
  };
  return {
    record,
    name: deckName,
    key: deckName.key,
    typeName,
    typeId,
    id: undefined,
    dbContent: "",
    setKeys,
    unknown: true,
  } as RenderCard;
}