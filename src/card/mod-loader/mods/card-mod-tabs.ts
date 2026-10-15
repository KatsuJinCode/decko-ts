// The card-mod-tabs gem (card-mod-tabs-0.20.0), ported through the mod
// loader - the bootstrap tab/pill panels: the lazy-loading :tabs/:pills
// views every card carries (All set module) plus the static variants.
//
// The gem's tree (the installed
// card-mod-tabs-0.20.0/): two set files (set/all/tabs.rb,
// set/abstract/tabs.rb), two lib/ files (Card::Tab, Card::LazyTab), two haml
// templates (set/all/tabs/tab_panel.haml, set/abstract/tab_badge.haml), one
// coffee asset, no mod.yml (the gem relies on the name convention).
//
// Ported here byte-verifiably against the live decko 0.20.0 oracle
// (data-slot-id/data-card-id normalized, and
// the tab ids' root-format counter masked - see the test):
//
// - set/all/tabs.rb:41-43 view :tabs + :72-74 :pills (construct_tabs,
//   :45-54): the tab list comes from the card's reference chunks
//   (card-mod-content set/all/chunk.rb:21-26 each_item_name_with_options) - pointer/list
//   cards route through Abstract::List's OVERRIDE (card-mod-list
//   set/abstract/01_list.rb:24-26: item_names with EMPTY option hashes,
//   which is why the oracle's pointer-probe data-urls carry the bare "?"
//   query). The first chunk is the active tab; its pane content renders
//   eagerly, the rest lazy-load through data-url.
// - set/all/tabs.rb:29-39 the tabs helper + set/all/tabs/tab_panel.haml
//   bytes (emission order pinned by the oracle output: Haml sorted single-quote
//   attrs on the two wrapper divs, Rails content_tag insertion order on
//   the li/anchor/pane tags, one newline per emitted element, no
//   indentation).
// - lib/card/lazy_tab.rb + lib/card/tab.rb (the tab objects; only the
//   LazyTab path is reachable - the Tab klass is selected by
//   construct_static_tabs, which raises, see below).
// - set/all/tabs.rb:76-78 view :tabs_static + :80-82 :pills_static -
//   PARITY RAISE: in stock decko 0.20.0 BOTH VIEWS RAISE for every input.
//   construct_static_tabs (:84-90) calls `item_view_options(args)` and no
//   `args` method exists anywhere on Card::Format (format.rb:36-37
//   delegates basket/session/params only) or its helper chain - the call
//   falls through MethodDelegation#method_missing (lib/card/format/
//   method_delegation.rb:38-46) to the ActionView instance, which does not
//   answer :args either. Oracle: every probed static render raises
//   `NoMethodError: undefined method `args' for
//   #<Card::Format::CardActionView...>`. The port's
//   views throw the parity error - bytes no decko 0.20.0 instance ever
//   produced are NOT invented here.
//
// NOT ported (honest remainder, with one-word reasons):
// - set/abstract/tabs.rb view :tabs (cache: :never, :4-8) + the tab_map
//   machinery (:10-88, incl. tab_badge/tab_title + tab_badge.haml via
//   card-mod-bootstrap's BsBadge badge_haml_opts): include-scoped - only
//   cards whose set modules `include_set Abstract::Tabs` reach it, and
//   this gem ships no includer (the includers live in other mods, e.g.
//   card-mod-search's search types). Registered as a passive basket entry:
//   the loader's flat view table would give the abstract :tabs to EVERY
//   card (abstract loads after all, later registration wins), claiming a
//   fidelity the mod does not have. Oracle: the probe card's format class
//   has NO _view_tabs__cache (all probe format configs false) - the
//   abstract module's settings are invisible off the
//   include chain.
// - [[link]] chunks in construct_tabs' reference walk: the engine's chunk
//   machinery (src/card/render/nest-syntax.ts header) parses nest chunks
//   only; a Link chunk's tab would need its options shape (card-mod-content
//   lib/card/content/chunk/link.rb:31-33 `{title: link_text ||
//   fully_stripped}`) which the engine does
//   not produce. Not exercised by the oracle probes (they carry nests).
// - assets/script/tab.js.coffee - asset pipeline (the client-side lazy
//   loader: show.bs.tab pushState + $.ajax into the pane).
// - pointer/list items referenced by PLAIN TEXT (not nests): the sync
//   render path sees them only if the prefetch closure covered them
//   (the same constraint views.ts#renderPointerListItem lives with);
//   a cold miss builds the unknown card, matching Ruby's
//   Card.fetch(new: {}) - unknown FIRST items route through the
//   unknown-card view chain in both engines.

import type { RenderCard, ViewContext, ViewFn } from "../../render/format.js";
import { DeckoName } from "../../name.js";
import { scanNests } from "../../render/nest-syntax.js";
import { rawItemStrings } from "../../render/pointer-list.js";
import { safeSetKeys } from "../../render/set-keys.js";
import type { CardRecord } from "../../fetch/card-record.js";
import { h, cgiEscape } from "../../render/slot-html.js";
import { NoMethodError, rubyDefaultInspect, stableIdentity } from "../../render/format.js";
import type {
  DeckoModManifest,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// the reference walk - chunk.rb:21-26 vs the Abstract::List override
// ---------------------------------------------------------------------------

/** The cardtypes whose class includes Abstract::List (card-mod-list
 *  set/type/pointer.rb, set/type/list.rb both `include_set Abstract::List`);
 *  the engine's enrichment carries the type card's codename as typeCode
 *  (same convention as card-mod-list.ts LIST_FAMILY). */
const LIST_FAMILY = new Set(["pointer", "list"]);

/** One reference chunk's tab input: the (absolutized) referee name plus the
 *  options hash each_item_name_with_options yields (chunk.rb:23: Nest
 *  chunks carry their parsed options, everything else yields {}). */
interface RefChunk {
  name: string;
  options: Record<string, string>;
}

/** card-mod-list set/abstract/01_list.rb:24-26 (the pointer/list override):
 *  `item_names.each { |name| yield name, {} }` - EMPTY option hashes (the
 *  oracle's pointer-probe data-urls carry the bare "?" query for exactly
 *  this reason). item_names (card-mod-collection set/all/item.rb:15-22,
 *  262): raw_item_strings -> clean_item_name, context defaulting to the
 *  card's own name, so relative items absolutize against it. */
function familyRefChunks(card: RenderCard): RefChunk[] {
  return rawItemStrings(card.dbContent)
    .filter((s) => s !== "")
    .map((item) => ({
      name: DeckoName.parse(item).absoluteName(card.name).s,
      options: {},
    }));
}

/** card-mod-content set/all/chunk.rb:21-26 (the chunk-based walk every
 *  non-list card uses):
 *  `reference_chunks(content).each { yield chunk.referee_name, options }`
 *  over the raw content. The TS engine's chunk machinery is
 *  nest-syntax.ts#scanNests (nest chunks only - see the header); comment
 *  nests are rejected (chunk.rb:13-15 named=true selects chunks with a
 *  referee_name). The chunk's options ride
 *  too: card-mod-content lib/card/content/chunk/nest.rb:23 `@options = interpret_options
 *  .merge nest_name: name, nest_syntax: in_brackets` - the AUTHORED name
 *  and the full authored syntax, while the tab name is the RESOLVED
 *  referee (reference.rb absolutizes against the referencing card). */
function chunkRefChunks(card: RenderCard): RefChunk[] {
  const out: RefChunk[] = [];
  for (const piece of scanNests(card.dbContent)) {
    const nest = piece.nest;
    if (nest === undefined || nest.comment !== undefined) continue;
    const options: Record<string, string> = {};
    for (const [key, value] of Object.entries(nest.options)) {
      if (typeof value === "string") options[key] = value;
      // nested :items option lists ride Ruby's hash too; they are not
      // scalar-string representable here and no oracle probe exercises them
    }
    options["nest_name"] = nest.name;
    options["nest_syntax"] = nest.syntax;
    out.push({
      name: DeckoName.parse(nest.name).absoluteName(card.name).s,
      options,
    });
  }
  return out;
}

/** The dispatch Ruby gets from method lookup: the card-level
 *  each_item_name_with_options resolves through Abstract::List on
 *  pointer/list cards, through set/all/chunk.rb everywhere else. */
function eachItemNameWithOptions(fmt: ViewContext["fmt"]): RefChunk[] {
  return LIST_FAMILY.has(fmt.card.typeCode ?? "")
    ? familyRefChunks(fmt.card)
    : chunkRefChunks(fmt.card);
}

// ---------------------------------------------------------------------------
// item machinery - card-mod-collection set/all/item.rb
// ---------------------------------------------------------------------------

/** fetch_item_card (item.rb:241-243): `Card.fetch name, new:
 *  new_unknown_item_args(args)` (item.rb:245-248 - {} or {type:}) - a miss
 *  produces a NEW unknown card (never nil). The prepared-map miss builds
 *  that card locally (the format.ts buildUnknownNestCard shape - mod ports
 *  cannot reach the private engine method; same shape as
 *  card-mod-list.ts#fetchItemCardOrUnknown). */
function fetchItemCardOrUnknown(fmt: ViewContext["fmt"], name: string): RenderCard {
  const known = fmt.engine.fetchRenderCard(name);
  if (known !== undefined) return known;
  const parsed = DeckoName.parse(name);
  const record: CardRecord = {
    id: undefined,
    codename: undefined,
    leftId: undefined,
    rightId: undefined,
    typeId: undefined,
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
    name: parsed,
    key: parsed.key,
    isNew: true,
    fromTrash: false,
    uncacheable: false,
  };
  fmt.engine.reportUnknownCard?.(parsed.key);
  return {
    record,
    name: parsed,
    key: parsed.key,
    typeName: undefined,
    typeId: undefined,
    typeCode: undefined,
    id: undefined,
    dbContent: "",
    setKeys: safeSetKeys({ name: parsed, typeId: undefined, typeName: undefined, leftTypeName: undefined }),
    unknown: true,
  };
}

/** item.rb:139-143 voo_items_view + card-mod-format set/all/html.rb:21-23
 *  default_item_view: `voo.items[:view] || :bar`. */
function implicitItemView(ctx: ViewContext): string {
  const items = ctx.voo.opts["items"] as Record<string, string> | undefined;
  const view = items?.["view"];
  return typeof view === "string" && view !== "" ? view : "bar";
}

/** item.rb:149-155 item_view_options: `(voo.items || {}).clone.merge(
 *  new_options)`, then `options[:view] ||= implicit_item_view`. Ruby's
 *  Hash#merge keeps the receiver's key positions and appends the argument's
 *  new keys; the query byte order does not read the insertion order (Rails'
 *  nested to_param sorts - see pathQuery), only the VIEW override matters:
 *  the chunk's explicit view wins over the voo's. */
function itemViewOptions(ctx: ViewContext, newOptions: Record<string, string>): Record<string, string> {
  const items = ctx.voo.opts["items"] as Record<string, string> | undefined;
  const options = { ...(items ?? {}), ...newOptions };
  if (options["view"] === undefined || options["view"] === "") {
    options["view"] = implicitItemView(ctx);
  }
  return options;
}

// ---------------------------------------------------------------------------
// path machinery - nesting.rb:34-37 nest_path + card-mod-format lib/card/
// path.rb + set/all/path.rb:35-40, 70-72
// ---------------------------------------------------------------------------

// cgiEscape is the shared slot-html.ts encoder (Ruby CGI.escape over UTF-8
// bytes) — this file's private codepoint-hex copy predated the shared
// helper and diverged from the oracle on every non-ASCII name.

/** Rails Hash#to_param over the path query opts: nested values flatten as
 *  `key%5Bsub%5D=value` pairs with the keys SORTED alphabetically (Ruby 3.3
 *  + activesupport 7.2 verified: {slot: {b: "2", a: "1"}}.to_param ==
 *  "slot%5Ba%5D=1&slot%5Bb%5D=2"; {slot: {}}.to_param == "", which is why
 *  the pointer probe's query is the bare "?"). The card[name] pair (the
 *  handle_unknown payload) sorts before slot ("card" < "slot"). */
function pathQuery(slot: Record<string, string>, cardName: string | undefined): string {
  const pairs: string[] = [];
  if (cardName !== undefined) pairs.push(`card%5Bname%5D=${cgiEscape(cardName)}`);
  for (const key of Object.keys(slot).sort()) {
    pairs.push(`slot%5B${cgiEscape(key)}%5D=${cgiEscape(slot[key])}`);
  }
  return `?${pairs.join("&")}`;
}

/** nesting.rb:34-37 nest_path -> card-mod-format lib/card/path.rb#standard
 *  (:27-30: base + extension + query + anchor; no action/format/anchor
 *  here) -> path.rb:32-40 base (`mark/view` - both always present) ->
 *  contextualize_path (card-mod-format set/all/path.rb:70-72 html:
 *  card_path, card-1.110.0 lib/card/env/location.rb:11-15: site-relative
 *  "/" prefix, relative_url_root ""). handle_unknown (path.rb:89-109): a mark that is
 *  neither standardish (url_key == name.tr(" ", "_")) nor known carries
 *  card[name]= in the query so no name info is lost. */
function nestPath(fmt: ViewContext["fmt"], name: string, tabOptions: Record<string, string>): string {
  const slot: Record<string, string> = {};
  for (const [key, value] of Object.entries(tabOptions)) {
    if (key !== "view") slot[key] = value;
  }
  const parsed = DeckoName.parse(name);
  const view = tabOptions["view"] ?? "";
  const base = `${parsed.urlKey}/${view}`;
  let cardName: string | undefined;
  if (parsed.urlKey !== name.replace(/ /g, "_") && fmt.engine.fetchRenderCard(parsed.key) === undefined) {
    cardName = name;
  }
  return `/${base}${pathQuery(slot, cardName)}`;
}

// ---------------------------------------------------------------------------
// the tab ids - lib/card/format/content.rb:59-67 id_counter/unique_id
// ---------------------------------------------------------------------------

/** id_counter lives on the ROOT format (lib/card/format/content.rb:59-64;
 *  :60 `return @parent.id_counter if @parent`) and unique_id is the HOST
 *  card's safe_key plus the root's counter (content.rb:66-67). The counter
 *  is the ROOT FORMAT'S - ONE PER REQUEST, shared by every unique_id
 *  consumer (the tabs, the pointer editors' checkbox names, the set
 *  editor's radio ids) - RenderFormat#uniqueId owns it (format.ts, the
 *  same content.rb port). The tabs' former private WeakMap here forked
 *  that counter: on pages whose main body renders tabs, the layout
 *  chrome's own unique_id consumers (the my_card roles checkboxes) drew
 *  from a counter the tabs had never touched - the oracle pins
 *  pointer_checkbox-<actor>-Xenabled_role-3 on the [User]+*follow page
 *  (the main body's two tab ids are 1 and 2, the navbar's checkbox 3),
 *  which the fork rendered as -1. */

function tabId(fmt: ViewContext["fmt"], name: string): string {
  // tab.rb:77 "tab-#{unique_id}-#{name.to_name.safe_key}"
  return `tab-${fmt.uniqueId()}-${DeckoName.parse(name).safeKey}`;
}

// ---------------------------------------------------------------------------
// the tab label - construct_tab's `nest(name, view: :title, title: ...)` /
// set/all/tabs.rb:59
// ---------------------------------------------------------------------------

/** The html :title bytes when the chunk carries an explicit title option:
 *  standard_title (card-mod-format set/all/title.rb:6-8) reached through
 *  the html :title view (title.rb:12-14 -> :title_no_link :20-22) ->
 *  title_in_context (lib/card/format/context_names.rb:49-54; absolute
 *  simple names pass through) with the html h-escape override
 *  (title.rb:32-36) -> wrapped_title (title.rb:38-42: classy
 *  "card-title" span carrying the title attribute, parts joined with
 *  wrapped_joint's joint span :44-46). Without a title option
 *  the label renders through the SHARED :title view (a real subformat
 *  nest, title bytes from the name - the shared view's bytes are the
 *  render layer's pinned surface). Ruby's :title survives the unknown-card
 *  substitution (base view's perms: :none setting persists through the
 *  html redefinition; format.ts PERMS_NONE_VIEWS pins the same), so known
 *  and unknown items label identically in both engines. */
function tabLabelBytes(
  ctx: ViewContext,
  itemCard: RenderCard,
  tabOptions: Record<string, string>,
): string {
  const title = tabOptions["title"];
  if (title === undefined) return ctx.fmt.nestRecord(itemCard, "title", {});
  const escaped = h(title);
  const body = escaped.split("+").join('<span class="joint">+</span>');
  return `<span class="card-title" title="${escaped}">${body}</span>`;
}

/** construct_tab's active-pane content: `nest(name, tab_options)` -
 *  nestRecord rides the resolved card (nest.rb#prepare_view_and_opts!:
 *  nest_name ||= card.name, home_view = the view) with the remaining
 *  chunk options on the voo (nest_syntax/title/...; the oracle's active
 *  pane data-slot pins exactly view/nest_name/nest_syntax/show/
 *  home_view/title). */
function tabContentBytes(
  ctx: ViewContext,
  itemCard: RenderCard,
  tabOptions: Record<string, string>,
): string {
  const view = tabOptions["view"] ?? "content";
  const opts: Record<string, unknown> = {
    nest_name: tabOptions["nest_name"] ?? itemCard.name.s,
  };
  for (const [key, value] of Object.entries(tabOptions)) {
    if (key !== "view" && key !== "nest_name") opts[key] = value;
  }
  return ctx.fmt.nestRecord(itemCard, view, opts);
}

// ---------------------------------------------------------------------------
// construct_tabs - set/all/tabs.rb:45-65
// ---------------------------------------------------------------------------

interface TabState {
  paths: Map<string, { title: string; path: string }>;
  active: { name: string; content: string } | undefined;
}

/** construct_tab (:56-65): paths[name] = {title, path}; the FIRST chunk
 *  becomes the active tab with its content rendered eagerly
 *  (`return unless tabs[:active].empty?`). */
function constructTab(state: TabState, ctx: ViewContext, name: string, explicitOptions: Record<string, string>): void {
  const tabOptions = itemViewOptions(ctx, explicitOptions);
  const itemCard = fetchItemCardOrUnknown(ctx.fmt, name);
  state.paths.set(name, {
    title: tabLabelBytes(ctx, itemCard, tabOptions),
    path: nestPath(ctx.fmt, name, tabOptions),
  });
  if (state.active !== undefined) return;
  state.active = { name, content: tabContentBytes(ctx, itemCard, tabOptions) };
}

/** construct_tabs (:45-54): `voo.items[:view] ||= :content`, walk the
 *  reference chunks, then the lazy tab panel. */
function constructTabs(ctx: ViewContext, tabType: string): string {
  const state: TabState = { paths: new Map(), active: undefined };
  // :47 voo.items[:view] ||= :content (the voo's items group)
  let items = ctx.voo.opts["items"] as Record<string, string> | undefined;
  if (items === undefined || items === null) {
    items = {};
    ctx.voo.opts["items"] = items;
  }
  if (items["view"] === undefined || items["view"] === "") items["view"] = "content";
  for (const chunk of eachItemNameWithOptions(ctx.fmt)) {
    constructTab(state, ctx, chunk.name, chunk.options);
  }
  return tabsPanel(ctx, state.paths, state.active?.name, tabType, state.active?.content ?? "");
}

// ---------------------------------------------------------------------------
// the tabs helper + tab_panel.haml - set/all/tabs.rb:29-39 + tab_panel.haml
// ---------------------------------------------------------------------------

/** One tab object (lib/card/tab.rb:25-30 initialize; the LazyTab klass is
 *  the only reachable one - see the header). */
interface TabObject {
  name: string;
  active: boolean;
  /** config = {title:, path:} - construct_tab's paths entry (lazy_tab.rb:5
   *  url = config[:path]; :8-10 view fallback unused when :path present). */
  title: string;
  path: string;
  /** lib/card/tab.rb:76-78 tab_id, memoized on first use; ids are assigned
   *  in tab order because haml renders the buttons before the panes
   *  (tab_panel.haml:3-7). */
  id: string;
}

/** tab.rb:7-13 tab_objects + :17-20 active: the requested name matched by
 *  name equality (key comparison), else keys.first. Shared with the follow
 *  mod's :core (type_plus_right/user/follow.rb:39-43 calls the same `tabs`
 *  helper over its static FOLLOW_TABS hash - the helper lives in this gem). */
export function tabObjects(
  fmt: ViewContext["fmt"],
  tabHash: Map<string, { title: string; path: string }>,
  activeName: string | undefined,
): TabObject[] {
  const keys = [...tabHash.keys()];
  const requestedKey = activeName === undefined ? undefined : DeckoName.parse(activeName).key;
  const activeKey =
    keys.find((k) => DeckoName.parse(k).key === requestedKey) ?? keys[0];
  return keys.map((name) => ({
    name,
    active: name === activeKey,
    title: tabHash.get(name)!.title,
    path: tabHash.get(name)!.path,
    // tab.rb:77 "tab-#{unique_id}-#{name.to_name.safe_key}" - assigned in
    // tab order (button render order) below
    id: tabId(fmt, name),
  }));
}

/** LazyTab#tab_button + Tab#tab_button (lazy_tab.rb:12-17 -> tab.rb:32-37)
 *  and the anchor chain (lazy_tab.rb:24-27 -> tab.rb:65-74 -> links.rb:
 *  101-108). Attribute ORDER is Ruby's hash mechanics: button_attrib starts
 *  {} (tab.rb:48), LazyTab merges data-url FIRST (lazy_tab.rb:21, the
 *  html_safe value stays UNescaped in the attribute - the oracle pins the
 *  raw "&"), add_class appends class (tab.rb:33 "active" for the active tab,
 *  lazy_tab.rb:25 "load" unless active?, tab.rb:66 "nav-link"), the merge
 *  adds role/data-bs-toggle/data-tab-name, and :path -> :href lands LAST
 *  (links.rb:102 deletes :path then assigns :href - a Ruby append). The li
 *  is content_tag(:li, link, role: :presentation, class: "nav-item
 *  tab-li-<key>") (tab.rb:34-36). One trailing newline per emitted element
 *  (the haml `= tab.tab_button` loop). */
function tabButton(tab: TabObject): string {
  const classes = [tab.active ? "active" : "load", "nav-link"].join(" ");
  const href = `#${tab.id}`;
  return (
    `<li role="presentation" class="nav-item tab-li-${DeckoName.parse(tab.name).key}">` +
    `<a data-url="${tab.path}" class="${classes}" role="tab" data-bs-toggle="tab"` +
    ` data-tab-name="${h(tab.name)}" href="${href}">${tab.title}</a></li>\n`
  );
}

/** LazyTab#tab_pane + Tab#tab_pane (lazy_tab.rb:33-36: the active tab's
 *  pane takes the block content; tab.rb:39-45: pane_attr {role:, id:}
 *  then add_class "tab-pane tab-pane-<name>" - the RAW name, spaces
 *  included (the oracle pins the raw name, spaces and all, in the class) -
 *  and " active" when active). */
function tabPane(tab: TabObject, blockContent: string): string {
  const cls = `tab-pane tab-pane-${tab.name}${tab.active ? " active" : ""}`;
  const content = tab.active ? blockContent : "";
  return `<div role="tabpanel" id="${tab.id}" class="${h(cls)}">${content}</div>\n`;
}

/** all/tabs.rb:29-39 `tabs` (klass LazyTab via load: :lazy) rendering
 *  set/all/tabs/tab_panel.haml. The haml bytes (oracle-pinned): sorted
 *  single-quote attributes on the two wrapper divs, no indentation, one
 *  newline per element; classy('nav') contributes the bare "nav" (no
 *  class_ups on this surface). Shared with the follow mod's :core - the
 *  follow set module calls this same `tabs` helper (user/follow.rb:40). */
export function tabsPanel(
  ctx: ViewContext,
  tabHash: Map<string, { title: string; path: string }>,
  activeName: string | undefined,
  tabType: string,
  blockContent: string,
): string {
  const tabs = tabObjects(ctx.fmt, tabHash, activeName);
  let out = "<div class='tabbable tab-panel' role='tabpanel'>\n";
  out += `<ul class='${ctx.voo.classy("nav")} nav-${tabType}' role='tablist'>\n`;
  for (const tab of tabs) out += tabButton(tab);
  out += "</ul>\n<div class='tab-content'>\n";
  for (const tab of tabs) out += tabPane(tab, blockContent);
  out += "</div>\n</div>\n";
  return out;
}

// ---------------------------------------------------------------------------
// the views - set/all/tabs.rb format :html block
// ---------------------------------------------------------------------------

/** all/tabs.rb:41-43 view :tabs -> construct_tabs "tabs". No view settings
 *  (the oracle: _view_tabs__cache false - the cache:
 *  :never the compat surface knows belongs to the ABSTRACT module's
 *  include-scoped :tabs, not this one). */
const tabsView: ViewFn = (ctx) => constructTabs(ctx, "tabs");

/** all/tabs.rb:72-74 view :pills -> construct_tabs "pills" (nav-pills). */
const pillsView: ViewFn = (ctx) => constructTabs(ctx, "pills");

/** The static-variant parity raise (all/tabs.rb:84-90). The each-block body
 *  is the only raise site: construct_static_tabs line 87 calls
 *  `item_view_options(args)`; no args method exists on the format chain
 *  (format.rb:36-37 delegates basket/session/params; method_delegation.rb:
 *  38-46 falls through to the ActionView instance which lacks :args), so a
 *  NON-EMPTY item list raises NoMethodError on every render. Oracle: the
 *  probed cards WITH items carry that NoMethodError. An
 *  EMPTY item list never enters the block: the render
 *  falls to `tabs tabs, nil, tab_type:` — the bare tabbable frame
 *  (tab_panel.haml with no tab buttons and no panes) — which the oracle
 *  pins on the Ada Admin rows (a User-typed card whose content
 *  carries no items). */
function staticTabsArgsMiss(ctx: ViewContext): never {
  // The format answers no `args` member. Ruby's method_missing falls through
  // to the ActionView instance, which lacks it too; the port performs the same
  // member read and gets the same miss. The raise is NoMethodError with Ruby's
  // message shape; the receiver is the view instance the delegation lands on.
  const args = (ctx.fmt as unknown as { args?: unknown }).args;
  if (args !== undefined) return itemViewOptions(ctx, {}) as never;
  throw new NoMethodError(
    `undefined method 'args' for ${rubyDefaultInspect("Card::Format::CardActionView", stableIdentity(ctx.fmt.card.name.s))}`,
  );
}

/** all/tabs.rb:84-90 construct_static_tabs: `tabs = {}; card.item_cards.each
 *  { |item| tabs[item.name] = nest item, item_view_options(args) };
 *  tabs tabs, nil, tab_type: tab_type`. The item enumeration here is the
 *  card's own item list (item.rb item_names over the content lines —
 *  item_names' clean/compact drops the blank strings a blank content's
 *  split leaves, so an empty/blank content answers []). */
function constructStaticTabs(ctx: ViewContext, tabType: "tabs" | "pills"): string {
  const items = rawItemStrings(ctx.fmt.card.dbContent ?? "").filter((i) => i !== "");
  if (items.length > 0) {
    staticTabsArgsMiss(ctx);
  }
  return tabsPanel(ctx, new Map(), undefined, tabType, "");
}

/** all/tabs.rb:76-78 view :tabs_static -> construct_static_tabs "tabs". */
const tabsStaticView: ViewFn = (ctx) => constructStaticTabs(ctx, "tabs");

/** all/tabs.rb:80-82 view :pills_static -> construct_static_tabs "pills". */
const pillsStaticView: ViewFn = (ctx) => constructStaticTabs(ctx, "pills");

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths mirror the gem tree)
// ---------------------------------------------------------------------------

const cardModTabs: DeckoModManifest = {
  name: "tabs",
  gemName: "card-mod-tabs",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-tabs-0.20.0/set/all/tabs.rb - the four html views; no
      // view settings (the oracle's probe format configs all false)
      setPath: "all/tabs",
      formats: {
        html: {
          views: [
            { view: "tabs", viewFn: tabsView },
            { view: "pills", viewFn: pillsView },
            { view: "tabs_static", viewFn: tabsStaticView },
            { view: "pills_static", viewFn: pillsStaticView },
          ],
        },
      },
    },
    {
      // card-mod-tabs-0.20.0/set/abstract/tabs.rb - the include-scoped
      // Abstract::Tabs module: view :tabs (cache: :never) + the tab_map/
      // tab_badge/tab_title machinery. Passive entry (basket fidelity
      // only) - see the header for why the flat view table must not
      // receive its :tabs override.
      setPath: "abstract/tabs",
      formats: { html: { views: [] } },
    },
  ],
};

export default cardModTabs;
