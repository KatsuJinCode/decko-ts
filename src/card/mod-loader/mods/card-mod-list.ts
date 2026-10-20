// The card-mod-list gem (card-mod-list-0.20.0), ported through the mod
// loader - the pointer/list item surface (the editor + one-line views).
//
// The gem's tree (the installedcard-mod-list-0.20.0/):
// eighteen set files under set/, no lib/, no set_pattern/, no mod.yml (the
// gem relies on the name convention). The html views live in
// set/abstract/01_list.rb (:view_list), set/abstract/01_list/html_views.rb
// (:core, :one_line_content, :input, :list + the per-editor helpers) and
// set/type/nest_list.rb + set/type/link_list.rb (the type-specific editors).
// The :core view is NOT ported here - it is already in the render layer
// (src/card/render/pointer-list.ts + views.ts). Everything here is byte-pinned
// against the oracle's rendered shapes (data-slot-id/data-card-id
// normalized).
//
// PORTED views:
// - :one_line_content (set/abstract/01_list/html_views.rb:19-26) - the
//   pointer/list override; the card-mod-format html view's `wrap:
//   { div: { class: "text-muted" } }` + `unknown: :mini_unknown` settings
//   (set/all/html/views.rb:24-27) persist through the override - the
//   body emits the text-muted div itself
// - :list (set/abstract/01_list/html_views.rb:44-46, cache: :never) - the
//   pointer list editor (list_input haml)
// - :select / :multiselect / :autocomplete (set/abstract/01_list/
//   html_views.rb:56-58's loop, :72-75 + :109-112, :93-97 and :60-62) -
//   three of the five editor views; GEM-SOURCE-DERIVED bytes, verified
//   against output DERIVED BY RUNNING the on-disk
//   actionview-7.2.3.2 gems (and haml-5.2.2 for the autocomplete template)
//   with the exact call shapes (the select-editor suite)
// - :input (set/abstract/01_list/html_views.rb:32-34 +
//   set/type/nest_list.rb:26 + set/type/link_list.rb:28) - hidden content
//   field + the editor dispatch; the three type surfaces fold into ONE
//   view fn because the loader's view table is flat (Ruby dispatches them
//   as three set-module formats; here the typeCode picks the branch - the
//   abstract/:list branch via the *input_type rule, per card-mod-edit
//   set/all/editor.rb:6-13 + 50-52, with Abstract::List's
//   default_input_type :list override, html_views.rb:40-42)
// - :nest_list_input (set/type/nest_list.rb:21-23, cache: :never)
// - the type set modules (type/link_list.rb, type/nest_list.rb) register
//   their :input overrides with the shared :input dispatcher as the body
// - :view_list (set/abstract/01_list.rb:39-44) - PORTED (gem-source-derived:
//   no rendered reference exists for it).
//   Its five sections render :content with the item view overridden to
//   bar/box/closed/titled/labeled. NAMED GAP inside it: this engine has no
//   :box or :labeled view, so those two sections fall through the loader
//   chain to whatever the base provides; the other three render. No
//   rendered reference pins the relative-timestamp arm, so it is not
//   claimed here.
//
// NOT ported (honest remainder):
// - set/abstract/01_list/events.rb + set/abstract/delist.rb - the five
//   events (add_and_drop_items, insert_item_event, validate_item_type,
//   validate_item_uniqueness, delist) pin as DECLARATIONS in the manifest
//   events[] fields (the registry records name/stage/on/when + a stub fn;
//   the action engine's stage seam is not wired in this port - see
//   listEventFns below; the two :validate-stage events are adopted now -
//   the ModEventStage union carries
//   the full Ruby director stage list including :validate,
//   mod-manifest.ts:152-163).
// - non-html formats (set/abstract/01_list/other_views.rb csv/js/data/json/
//   css/rss views) - the engine is html-format only
// - the :input editor variants beyond radio/list/checkbox/select/
//   multiselect/autocomplete (all five of html_views.rb:56-58's loop ARE
//   ported - their view fns + the checkbox-editor/select-editor suites) -
//   the click-wrapped bar/box (multi)select variants embed the
//   click_select_input.haml surface, and the editors' browser JS
//   (select2, submit-on-change) is the asset-pipeline surface; a card
//   whose *input_type rule names one of those gets a loud error,
//   never wrong bytes
// - non-family fallbacks: on cards outside the pointer/list family Ruby
//   dispatches card-mod-format's base :one_line_content (truncated core)
//   and card-mod-edit's base :input editors - neither base surface is
//   ported, so the guards here fail loudly instead
// - set/abstract/codename_list.rb, set/abstract/id_list.rb,
//   set/all/supports_content_options.rb (the list_input_options basket has
//   no TS consumer), set/right/* (quick_edit/quick_editor need the edit
//   surface), the setting_opts `applies:` lambdas (self/content_options.rb,
//   self/content_option_view.rb) - the ModSettingOpts schema has no applies
//   field; the registered state (group/position/rule_type_editable/
//   help_text/restricted_to_type) is the gem's own declaration
// - assets/script/*.js.coffee + assets/style/list.scss - asset pipeline
//   surface; config/locales - i18n surface; data/ - seed migrations

import type { RenderCard, ViewContext, ViewFn } from "../../render/format.js";
import { UnsupportedViewError } from "../../render/format.js";
import { DeckoName } from "../../name.js";
import { CodenameNotFoundError } from "../../name/errors.js";
import { warmRuleCards } from "./rule-card-warm.js";
import { inputView as editorBaseInputView } from "./card-mod-edit.js";
import { ruleNamesForCard } from "../../set-patterns/rule-names.js";
import type { PatternCardInput } from "../../set-patterns/types.js";
import { safeSetKeys } from "../../render/set-keys.js";
import { h } from "../../render/slot-html.js";
import { rawItemStrings } from "../../render/pointer-list.js";
import {
  FOLLOW_OPTION_CARD_NAMES,
  followOptionLabel,
} from "../../follow/follow-options.js";
import type { CardRecord } from "../../fetch/card-record.js";
import type {
  DeckoModManifest,
  ModEngineHost,
  ModEventCard,
  ModEventFn,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// set membership - the Abstract::List family vs the sibling list types
// ---------------------------------------------------------------------------

/** The cardtypes whose class includes Abstract::List (set/type/pointer.rb,
 *  set/type/list.rb both `include_set Abstract::List`). The engine's
 *  enrichment carries the type card's codename as typeCode. */
const LIST_FAMILY = new Set(["pointer", "list"]);

/** The sibling list types' dispatch: view (:list) raises
 *  "view (list) not supported" (Card::Error::UserError) on Nest list and
 *  Link list cards, because they include Abstract::Items +
 *  Abstract::ReferenceList but NOT Abstract::List. */
function listFamilyCard(fmt: ViewContext["fmt"]): boolean {
  return LIST_FAMILY.has(fmt.card.typeCode ?? "");
}

/** The honest not-ported failure for non-family surfaces (see header).
 *  UnsupportedViewError would claim Ruby has no such view - it does, on
 *  the base format (not ported here). */
function baseViewNotPorted(view: string, fmt: ViewContext["fmt"]): Error {
  return new Error(
    `${view}: ${fmt.card.name.s} is not a pointer/list-family card; the ` +
      `base-format view (card-mod-format/card-mod-edit) is not ported`,
  );
}

// ---------------------------------------------------------------------------
// item machinery - card-mod-collection set/all/item.rb + 01_list overrides
// ---------------------------------------------------------------------------

/** item_names (item.rb:15-22): item_strings -> clean_item_name. context
 *  defaults to the pointer card's own name (item.rb:262), so relative
 *  items absolutize against it; context :raw (item.rb:260) keeps the
 *  authored string. (Ruby's rescue NotFound drops invalid id/codename
 *  refs; the TS name algebra never raises, so those pass through.) */
function itemNames(card: RenderCard, context: "raw" | undefined): string[] {
  const items = rawItemStrings(card.dbContent);
  if (context === "raw") return items;
  return items.map((item) => DeckoName.parse(item).absoluteName(card.name).s);
}

/** filtered_items (item.rb:250-256): `items[offset, limit.zero? ? size :
 *  limit] || []` - a zero limit means unlimited. */
function filteredItems(items: string[], limit: number, offset: number): string[] {
  if (limit <= 0 && offset <= 0) return items;
  return items.slice(offset, limit > 0 ? offset + limit : undefined);
}

/** fetch_item_card (item.rb:241-243): `Card.fetch name, new: {}` - a miss
 *  produces a NEW unknown card (never nil, never a raise). The prepared-map
 *  miss builds that card locally (the format.ts buildUnknownNestCard shape -
 *  mod ports cannot reach the private engine method). */
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

/** all_item_cards (item.rb:236-239) + listing_list/listing/wrap_item
 *  (item.rb:164-172 + the list mod's html wrap_item, html_views.rb:28-30):
 *  nest each item card at the item view and wrap it in
 *  `<div class="pointer-item item-#{item_view}">`. nest_item (item.rb:122-126)
 *  passes item_view_options = { view } (no voo items on this surface, no
 *  item_type -> no type option, item.rb:149-155, 157-162). */
function pointerItems(
  ctx: ViewContext,
  itemView: string,
  limit: number,
  offset: number,
): string[] {
  const names = filteredItems(itemNames(ctx.fmt.card, undefined), limit, offset);
  return names.map((name) => {
    const itemCard = fetchItemCardOrUnknown(ctx.fmt, name);
    const rendered = ctx.fmt.nestRecord(itemCard, itemView, {});
    return `<div class="pointer-item item-${itemView}">${rendered}</div>`;
  });
}

/** implicit_item_view (item.rb:134-137): voo.items[:view] ||
 *  default_item_view; the html format's default_item_view is :bar
 *  (card-mod-format set/all/html.rb:21-23). The voo items group rides the
 *  render options hash (the flat voo carries what Ruby keeps on voo.items). */
function implicitItemView(ctx: ViewContext): string {
  const items = ctx.voo.opts["items"];
  const view = items !== undefined && items !== null
    ? (items as { view?: unknown }).view
    : undefined;
  return typeof view === "string" && view !== "" ? view : "bar";
}

// ---------------------------------------------------------------------------
// rule lookup - the rule_card walk (lib/card/rule/all.rb:9-15), fed from
// the prepareEngine warm (the Rule::Cache analog, lib/card/rule/cache.rb:
// 10-27, same shape as the card-mod-help port's *help warm)
// ---------------------------------------------------------------------------

function ruleCard(
  ctx: ViewContext,
  setting: string,
): ReturnType<ViewContext["fmt"]["engine"]["fetchRenderCard"]> {
  const card = ctx.fmt.card;
  const input: PatternCardInput = {
    name: card.name.s,
    id: card.id,
    typeId: card.typeId,
    typeName: card.typeName,
    isNew: card.record.isNew === true,
  };
  if (card.name.isCompound) {
    const leftKey = card.name.leftName?.key;
    const left =
      leftKey !== undefined ? ctx.fmt.engine.fetchRenderCard(leftKey) : undefined;
    input.leftTypeName = left?.typeName;
  }
  for (const candidate of ruleNamesForCard(input, setting)) {
    const record = ctx.fmt.engine.fetchRenderCard(candidate);
    if (record === undefined || record.unknown === true) continue; // candidate rule does not exist
    if (ctx.fmt.engine.isDenied(record)) continue; // ok?(:read) false
    return record;
  }
  return undefined;
}

/** options_card_name (card-mod-layout set/abstract/items/options_api.rb:51-53
 *  + 44-48): `rule_card(:content_options) || right_type_options ||
 *  Card[:all]`, url-keyed. url_key RETAINS CASE (cardname variants.rb:4-12
 *  "URI-friendly version of name. retains case"), so the rendered value is
 *  the name itself for these arms.
 *
 *  right_type_options (options_api.rb:72-74 + 76-78): when the compound
 *  card's RIGHT is a Cardtype, the options card is
 *  `Card.fetch [right.name, :type, :by_name]` — the right's type-set by_name
 *  virtual search (fetch new:{} answers the virtual card, whose NAME is the
 *  value the haml renders), e.g. a "<Topic>+Tag" card (right "Tag", a
 *  Cardtype) renders data-options-card="Tag+*type+by_name". */
function optionsCardUrlKey(ctx: ViewContext): string {
  const rule = ruleCard(ctx, "*content_options");
  if (rule !== undefined) return rule.name.urlKey;
  const card = ctx.fmt.card;
  if (card.name.isCompound) {
    const rightName = card.name.rightName?.s;
    const right = rightName === undefined ? undefined : ctx.fmt.engine.fetchRenderCard(rightName);
    if (right?.typeCode === "cardtype" && right.name !== undefined) {
      return DeckoName.parse(`${right.name.s}+*type+by_name`).urlKey;
    }
  }
  const all = ctx.fmt.engine.fetchRenderCard("*all");
  return all?.name.urlKey ?? "*all";
}

// ---------------------------------------------------------------------------
// set/abstract/01_list/html_views.rb:19-26 view :one_line_content
// ---------------------------------------------------------------------------

/** html_views.rb:20-21: `item_view = implicit_item_view&.to_sym;
 *  item_view = item_view == :name ? :name : :link`; :24 pointer_items(view:
 *  item_view, limit: 10, offset: 0).join ", "; :22 wrap_with :div, class:
 *  "pointer-list one-line-pointer-list". The card-mod-format html view's
 *  persisted wrap config adds the text-muted div
 *  (set/all/html/views.rb:24-27). The :name item branch renders the base
 *  :name view, which the engine does not carry - renderView fails loudly. */
const oneLineContentView: ViewFn = (ctx) => {
  if (!listFamilyCard(ctx.fmt)) throw baseViewNotPorted("one_line_content", ctx.fmt);
  const implicit = implicitItemView(ctx);
  const itemView = implicit === "name" ? "name" : "link";
  const items = pointerItems(ctx, itemView, 10, 0);
  const body = `<div class="pointer-list one-line-pointer-list">${items.join(", ")}</div>`;
  return `<div class="text-muted">${body}</div>`;
};

// ---------------------------------------------------------------------------
// set/abstract/01_list/html_views.rb:44-46 view :list, cache: :never
// (list_input :48-54 + haml :list_input)
// ---------------------------------------------------------------------------

/** items_for_input (html_views.rb:115-118): `card.item_names context: :raw`,
 *  `items.empty? ? [""] : items`. */
function itemsForInput(ctx: ViewContext): string[] {
  const items = itemNames(ctx.fmt.card, "raw");
  return items.length === 0 ? [""] : items;
}

/** icon_tag bytes for the material library (card-mod-bootstrap
 *  set/all/bootstrap/icon.rb:97-105 -> material_icon_tag); :remove resolves
 *  through icon_lookup to the "close" glyph. */
function icon(name: string): string {
  return `<i class="notranslate material-icons">${name}</i>`;
}

/** list_input (html_views.rb:48-54): items, ul_classes =
 *  classy("pointer-list-editor", "pointer-list-ul"), options_card =
 *  options_card_name; haml :list_input. The text_field_tag bytes are
 *  ActionView 7.2 (`type/name/id/value` + the options hash in order),
 *  placeholder_text is "" (card-mod-edit set/all/editor.rb:60-61). */
function listInputHtml(ctx: ViewContext): string {
  const items = itemsForInput(ctx);
  const ulClasses = ctx.voo.classy("pointer-list-editor", "pointer-list-ul");
  const optionsCard = optionsCardUrlKey(ctx);
  const rows = items
    .map(
      (item) =>
        `<li class='pointer-li mb-1'>\n` +
        `<span class='input-group'>\n` +
        `<span class='input-group-text handle'>\n` +
        `${icon("reorder")}\n` +
        `</span>\n` +
        `<input type="text" name="pointer_item" id="pointer_item" value="${h(item)}" class="pointer-item-text form-control" data-options-card="${h(optionsCard)}" placeholder="" />\n` +
        `<button class='pointer-item-delete btn btn-secondary' type='button'>\n` +
        `${icon("close")}\n` +
        `</button>\n` +
        `</span>\n` +
        `</li>\n`,
    )
    .join("");
  return (
    `<ul class='${ulClasses}'>\n` +
    rows +
    `</ul>\n` +
    `<span class='input-group'>\n` +
    `<button class='_pointer-item-add btn btn-secondary' type='submit'>\n` +
    `${icon("add")}\n` +
    `add another\n` +
    `</button>\n` +
    `</span>\n`
  );
}

const listView: ViewFn = (ctx) => {
  if (!listFamilyCard(ctx.fmt)) {
    // Ruby: the view only exists on Abstract::List - the sibling types
    // raise the "view (list) not supported" UserError
    throw new UnsupportedViewError("list", ctx.fmt.card.name.s);
  }
  return listInputHtml(ctx);
};

/** view :checkbox (html_views.rb:50-52's loop + :60-62 checkbox_input) -
 *  the standalone view an `:input_type` rule naming checkbox dispatches
 *  to, and the shape editor.rb's input_method reaches. The Abstract::List
 *  membership gate is the same one :list carries (the view is declared by
 *  the same set module). */
const checkboxView: ViewFn = (ctx) => {
  if (!listFamilyCard(ctx.fmt)) {
    throw new UnsupportedViewError("checkbox", ctx.fmt.card.name.s);
  }
  return checkboxInputHtml(ctx);
};

/** view :select / view :multiselect (html_views.rb:56-58's loop + :72-75
 *  select_input + :93-97 multiselect_input) - registered real views of the
 *  set module exactly like :checkbox above, with the same Abstract::List
 *  membership gate. */
const selectView: ViewFn = (ctx) => {
  if (!listFamilyCard(ctx.fmt)) {
    throw new UnsupportedViewError("select", ctx.fmt.card.name.s);
  }
  return selectInputHtml(ctx);
};

const multiselectView: ViewFn = (ctx) => {
  if (!listFamilyCard(ctx.fmt)) {
    throw new UnsupportedViewError("multiselect", ctx.fmt.card.name.s);
  }
  return multiselectInputHtml(ctx);
};

/** view :autocomplete (html_views.rb:56-58's loop + :60-62
 *  autocomplete_input) - the fifth editor view of the loop. */
/** view :radio (html_views.rb:56-58's loop + :68-70 radio_input) - the
 *  loop's third editor view, with the same Abstract::List membership gate
 *  as :checkbox. */
const radioView: ViewFn = (ctx) => {
  if (!listFamilyCard(ctx.fmt)) {
    throw new UnsupportedViewError("radio", ctx.fmt.card.name.s);
  }
  return radioInputHtml(ctx);
};

const autocompleteView: ViewFn = (ctx) => {
  if (!listFamilyCard(ctx.fmt)) {
    throw new UnsupportedViewError("autocomplete", ctx.fmt.card.name.s);
  }
  return autocompleteInputHtml(ctx);
};

// ---------------------------------------------------------------------------
// set/abstract/01_list/html_views.rb:32-34 view :input
// (+ set/type/nest_list.rb:26, set/type/link_list.rb:28 overrides; the
//  dispatch folds the three set-module formats into one typeCode switch)
// ---------------------------------------------------------------------------

/** hidden_content_field (card-mod-format set/all/content.rb:57-59:
 *  `hidden_field :content, class: "d0-card-content"`); the byte shape
 *  (form-control class merge, autocomplete="off", the attribute order,
 *  the raw multi-line value) follows the form-builder output. The input NAME rides the
 *  form prefix (form.rb:147-160 form_prefix — "card" for the form's own
 *  card, "card[subcards][+related]" for a structured-form field card,
 *  card-mod-edit multiCardEdit). */
function hiddenContentField(ctx: ViewContext): string {
  const prefix = typeof ctx.voo.opts["form_name_prefix"] === "string"
    ? (ctx.voo.opts["form_name_prefix"] as string)
    : "card";
  const idPrefix = prefix === "card" ? "card" : prefix.replace(/\]/g, "").replace(/[\[+]/g, "_");
  return (
    `<input class="d0-card-content form-control" autocomplete="off" type="hidden" ` +
    `value="${h(ctx.fmt.card.dbContent)}" name="${prefix}[content]" id="${idPrefix}_content" />`
  );
}

/** The Abstract::List editor dispatch (card-mod-edit set/all/editor.rb:50-52:
 *  `try(input_method(input_type)) || ... || send(input_method(
 *  default_input_type))` with Abstract::List's default_input_type :list,
 *  html_views.rb:40-42). input_type_from_rule (editor.rb:11-13) strips
 *  [ ] and underscores spaces. All five of html_views.rb:56-58's editor
 *  loop are ported (radio rides this dispatch; checkbox/select/
 *  multiselect/autocomplete are registered views too); any other rule
 *  value fails loudly (see header). */
function listFamilyInputHtml(ctx: ViewContext): string {
  const rule = ruleCard(ctx, "*input_type");
  const inputType =
    rule?.dbContent
      ?.replace(/[[\]]/g, "")
      .replace(/ /g, "_")
      .trim() ?? "";
  if (inputType === "radio") return radioInputHtml(ctx);
  if (inputType === "checkbox") return checkboxInputHtml(ctx);
  if (inputType === "select") return selectInputHtml(ctx);
  if (inputType === "multiselect") return multiselectInputHtml(ctx);
  if (inputType === "autocomplete") return autocompleteInputHtml(ctx);
  if (inputType === "" || inputType === "list") return listInputHtml(ctx);
  throw new Error(
    `input editor "${inputType}" (the card's *input_type rule) is not ported ` +
      `- see src/card/mod-loader/mods/card-mod-list.ts header`,
  );
}

/** right/follow.rb:16-21 `options_card` override - a follow rule card's
 *  options are NOT a *content_options rule (none exists for any follow
 *  set): Right::Follow overrides options_card to a virtual list of
 *  `option_cards` = Card::FollowOption.cards (lib/card/follow_option.rb:
 *  20-22, the registry the four self/*.rb set modules populate in :all
 *  order). The editor's own selected items union in (options_api.rb:10-15).
 *  The radio labels ride the option cards' set-module `label` methods
 *  (self/always.rb:6-8 "follow", self/created.rb:9-11, self/edited.rb,
 *  self/never.rb:6-8 "ignore") through options_api.rb:73-83's smart_label
 *  nest. */
function isFollowRuleCard(card: RenderCard): boolean {
  if (!card.name.isCompound) return false;
  return card.name.rightName?.key === "*follow";
}

/** options_hash (card-mod-layout set/abstract/items/options_api.rb:4-6)
 *  through the engine's prepared walk (render.ts optionsCardPairs: the
 *  options_card chain resolves there and its search member seats in the
 *  async prepare phase — the sync editor views only read the pairs). */
function editorOptionPairs(ctx: ViewContext, editor: string): Array<[string, string]> {
  // Right::Follow's options_card override answers BEFORE the walk: the
  // FollowOption registry + the card's own selected items, as [name,
  // name] pairs (the labels resolve per-option in the radio body).
  if (isFollowRuleCard(ctx.fmt.card)) {
    const optionNames = [...FOLLOW_OPTION_CARD_NAMES];
    for (const selected of itemNames(ctx.fmt.card, undefined)) {
      // Ruby's item_names on blank content is [] (split drops the empty
      // field) - a blank new rule card unions nothing into the options
      if (selected === "") continue;
      if (!optionNames.includes(selected)) optionNames.push(selected); // item.rb:10-14 union
    }
    return optionNames.map((name) => [name, name]);
  }
  const pairs = ctx.fmt.engine.optionsCardPairs?.(ctx.fmt.card);
  if (pairs === undefined) {
    throw new Error(
      editor +
        " input: the engine does not carry the options walk (optionsCardPairs)",
    );
  }
  return pairs;
}

/** option_label (options_api.rb:70-77 + option_label_text :79-85): the
 *  label wraps the option card nested at the content_option_view rule's
 *  view or :smart_label when the option card EXISTS; a missing option
 *  renders the plain name. The content_option_view rule arm is unported
 *  (a deck rule the fixture never carries) and throws loudly. */
function optionLabelText(ctx: ViewContext, option: string): string {
  const optionCard = ctx.fmt.engine.fetchRenderCard(option);
  if (optionCard === undefined || optionCard.unknown === true) return h(option);
  const viewRule = ruleCard(ctx, "*content_option_view");
  if (viewRule !== undefined && viewRule.dbContent !== "smart_label") {
    throw new Error(
      `option label view rule ${viewRule.dbContent} is not ported - only ` +
        `:smart_label (options_api.rb:77)`,
    );
  }
  return ctx.fmt.nestRecord(optionCard, "smart_label", {});
}

/** The radio editor (html_views.rb:68-70 + radio_input.haml). options_hash
 *  (card-mod-layout options_api.rb:3-17): the options card's item names
 *  PLUS the card's own selected items, uniq'd in order; radio_button_tag
 *  bytes are ActionView 7.2; input_name is "pointer_radio_button-#{card.key}"
 *  (radio_input.haml); option_label (options_api.rb:73-77) wraps the label
 *  as form-check-label; the label TEXT nests the option card at
 *  :smart_label when it exists (options_api.rb:79-83). */
function radioInputHtml(ctx: ViewContext): string {
  const card = ctx.fmt.card;
  const pairs = editorOptionPairs(ctx, "radio");
  // radio_input.haml: an empty options hash renders "no options" in the list
  if (pairs.length === 0) return "<ul class='pointer-radio-list'>\nno options\n</ul>\n";
  const firstName = itemNames(card, undefined)[0];
  const inputName = `pointer_radio_button-${card.key}`;
  // the follow rule's option labels resolve through the option cards'
  // set-module `label` methods; the
  // general walk nests an EXISTING option card at :smart_label
  // (optionLabelText).
  const followRule = isFollowRuleCard(card);
  const rows = pairs
    .map(([, option]) => {
      const key = DeckoName.parse(option).key;
      const checked = option === firstName ? ` checked="checked"` : "";
      const label = followRule
        ? h(followOptionLabel(DeckoName.parse(option).tagName?.s.replace(/^\*/, "") ?? ""))
        : optionLabelText(ctx, option);
      return (
        `<li class='pointer-radio radio form-check'>\n` +
        `<input type="radio" name="${inputName}" id="pointer-radio-${key}" value="${h(option)}" ` +
        `class="pointer-radio-button form-check-input "${checked} />\n` +
        `<label class="form-check-label" for="pointer-radio-${key}">${label}</label>\n` +
        `</li>\n`
      );
    })
    .join("");
  return `<ul class='pointer-radio-list'>\n${rows}</ul>\n`;
}

/** The CHECKBOX editor (html_views.rb:60-62 `view :checkbox { send
 *  "checkbox_input" }` + `def checkbox_input raw haml(:checkbox_input,
 *  submit_on_change: @submit_on_change) end` + the checkbox_input.haml
 *  template). The five editor views are declared by one loop in Ruby
 *  (html_views.rb:50-52 `%i[autocomplete checkbox radio select
 *  multiselect].each { |editor_view| view(editor_view) { send
 *  "#{editor_view}_input" } }`), so :checkbox is a REAL view of this set
 *  module in Ruby, not an :input branch - it is registered as one here too,
 *  and the :input dispatch (listFamilyInputHtml) routes the *input_type
 *  rule's value to the same body, exactly as Ruby's editor dispatch reaches
 *  `input_method(input_type)`.
 *
 *  checkbox_input.haml, line by line:
 *    `.pointer-checkbox-list` - the wrapper div
 *    `- id = "pointer-checkbox-#{option_name.to_name.key}"`
 *    `- checked = card.item_names.include? option_name`
 *    `.pointer-checkbox` - one div per option
 *    `= check_box_tag "pointer_checkbox-#{unique_id}", option_name, checked,
 *       id: id, class: "pointer-checkbox-button #{'_submit-on-change' if
 *       submit_on_change}"`
 *    `= option_label option_label, id`
 *
 *  check_box_tag bytes (actionview-7.2.3.2 helpers/form_tag_helper.rb:455-464):
 *  `html_options = { "type" => "checkbox", "name" => name, "id" =>
 *  sanitize_to_id(name), "value" => value }.update(options.stringify_keys)`
 *  then `html_options["checked"] = "checked" if checked`, then `tag :input,
 *  html_options`. Consequences pinned here: the id the hash builds is
 *  OVERWRITTEN by the :id option but KEEPS its third position (Hash#update
 *  rewrites the value, never moves the key), `class` is a NEW key so it is
 *  appended, and `checked` is appended last - the tag_helper emits
 *  hash-insertion order (tag_helper.rb, no sort), so the attribute order is
 *  type / name / id / value / class [checked]. `_submit-on-change` is an
 *  instance variable no caller in these mods assigns (@submit_on_change is
 *  never set), so the class is the bare
 *  "pointer-checkbox-button" - same reasoning the ported radio class
 *  "pointer-radio-button form-check-input" follows.
 *
 *  options_hash / option_label: the SAME two helpers the radio editor above
 *  walks (card-mod-layout set/abstract/items/options_api.rb:3-19
 *  options_hash, :73-77 option_label, :79-85 option_label_text) - the walk
 *  lives in the engine (render.ts optionsCardPairs, seated in the prepare
 *  phase) and the label nest in optionLabelText, shared with radioInputHtml. */
function checkboxInputHtml(ctx: ViewContext): string {
  const card = ctx.fmt.card;
  const pairs = editorOptionPairs(ctx, "checkbox");
  const selected = itemNames(card, undefined);
  const rows = pairs
    .map(([, option]) => {
      const key = DeckoName.parse(option).key;
      const id = `pointer-checkbox-${key}`;
      const checked = selected.includes(option) ? ` checked="checked"` : "";
      return (
        `<div class='pointer-checkbox'>\n` +
        `<input type="checkbox" name="pointer_checkbox-${ctx.fmt.uniqueId()}" id="${id}" value="${h(option)}" ` +
        // Rails' tag :input self-closes (trailing " />").
        `class="pointer-checkbox-button "${checked} />\n` +
        `<label class="form-check-label" for="${id}">${optionLabelText(ctx, option)}</label>\n` +
        `</div>\n`
      );
    })
    .join("");
  return `<div class='pointer-checkbox-list'>\n${rows}</div>\n`;
}

/** The SELECT + MULTISELECT editors (html_views.rb:56-58's loop;
 *  select_input :72-75, multiselect_input :93-97, select_input_options
 *  :109-112). GEM-SOURCE-DERIVED bytes, additionally DERIVED BY RUNNING the
 *  on-disk actionview-7.2.3.2 gems (select_tag + options_for_select with
 *  these exact call shapes; the suites pin that output).
 *
 *  options_hash (card-mod-layout set/abstract/items/options_api.rb:3-17,
 *  the non-JSON arm this mod's radio/checkbox editors already walk):
 *  option_hash_from_names = option_names.each_with_object({}) { |name,
 *  hash| hash[name] = name } - label == value == the option NAME;
 *  option_names = (standard_option_names + item_names).uniq (:10-15). The
 *  chain (rule_card(:content_options) || right_type_options || Card[:all],
 *  options_api.rb:47-49) walks in the engine (render.ts optionsCardSource,
 *  seated in the prepare phase); the JSON-typed options card arm rides the
 *  same pairs (optionsCardPairs' json arm).
 *
 *  options_for_select (form_options_helper.rb:358-379): per element,
 *  html_attributes[:selected] ||= option_value_selected?(value, selected)
 *  lands BEFORE html_attributes[:value] = value (:369-371), and tag_options
 *  (tag_helper.rb:261-305) emits hash-insertion order with "selected" a
 *  BOOLEAN_ATTRIBUTES member (tag_helper.rb:21-31) - false is skipped,
 *  true emits the bare boolean form - so a chosen option reads
 *  `<option selected="selected" value="X">` (the gem's own rdoc example
 *  shows value first; the rdoc is stale, the sources do not).
 *  option_value_selected? (:808-810) is an exact string match against the
 *  option VALUE.
 *
 *  select_tag (form_tag_helper.rb:201-232): the content_tag hash is
 *  { "name" => html_name, "id" => sanitize_to_id(name) }.update(options.
 *  stringify_keys) - the BASE hash's name/id keep their positions and the
 *  stringified options' NEW keys append. SINGLE select: :class appends ->
 *  order name / id / class. MULTI select: multiple + :class append ->
 *  order name / id / multiple / class, with html_name "#{name}[]"
 *  (:204-205) and the id keeping the bare name ("multiple" boolean-emits
 *  from BOOLEAN_ATTRIBUTES). Both orders here are the RUN OUTPUT of the
 *  on-disk gems, not an inference from Hash#update. */
function optionsForSelect(pairs: Array<[string, string]>, selected: string[]): string {
  return pairs
    .map(([label, value]) =>
      `<option${selected.includes(value) ? ` selected="selected"` : ""} value="${h(value)}">${h(label)}</option>`,
    )
    .join("\n");
}

/** raw_item_strings (card-mod-collection set/all/item.rb:201-203:
 *  `content.to_s.split(/\n+/).map { |i| strip_item i }`) with Ruby's own
 *  String#split semantics: split DISCARDS trailing empty fields
 *  ("".split(/\n+/) -> [], "a\n".split(/\n+/) -> ["a"]), while a
 *  whitespace-only
 *  line survives the split as a non-empty field and strips to "" - KEPT.
 *  The shared rawItemStrings helper (pointer-list.ts) models JS split, whose
 *  trailing empties stay; this editor path
 *  normalizes locally rather than editing the shared surface. strip_item is
 *  item.rb's `gsub(/\[\[|\]\]/, "").strip` (the same body pointer-list.ts
 *  carries). */
function rubyItemNames(content: string): string[] {
  const rawFields = content.split(/\n+/);
  while (rawFields.length > 0 && rawFields[rawFields.length - 1] === "") rawFields.pop();
  return rawFields.map((i) => i.replace(/\[\[|\]\]/g, "").trim());
}

/** The options-card item walk the two editors share (options_api.rb:3-17):
 *  the engine's options_hash pairs (label, name) plus the card's own items
 *  for the selected set. The *content_options-rule-only throw of the
 *  previous version is gone: the chain (rule_card(:content_options) ||
 *  right_type_options || Card[:all], options_api.rb:47-49) walks in the
 *  engine (render.ts optionsCardSource, seated in the prepare phase). */
function editorOptionNames(ctx: ViewContext, editor: string): {
  optionNames: string[];
  selectedItems: string[];
} {
  const card = ctx.fmt.card;
  const pairs = editorOptionPairs(ctx, editor);
  const optionNames = pairs.map(([, name]) => name);
  const selectedItems = rubyItemNames(card.dbContent).map(
    (item) => DeckoName.parse(item).absoluteName(card.name).s,
  );
  return { optionNames, selectedItems };
}

/** select_input (html_views.rb:72-75) + select_input_options (:109-112):
 *  `options = { "-- Select --" => "" }.merge card.options_hash` - the blank
 *  arm is the FIRST pair and Hash#merge lets a literal "-- Select --"
 *  option overwrite its value - then `options_for_select options,
 *  card.first_name` (item_names.first; nil for an empty card selects
 *  nothing). */
function selectInputHtml(ctx: ViewContext): string {
  const { optionNames, selectedItems } = editorOptionNames(ctx, "select");
  // select_input_options (html_views.rb:109-112): the blank arm is the
  // FIRST pair and Hash#merge lets an option with the same key overwrite
  // its value in place.
  const pairs: Array<[string, string]> = [["-- Select --", ""]];
  for (const name of optionNames) {
    const existing = pairs.findIndex(([label]) => label === name);
    if (existing === -1) pairs.push([name, name]); // option_hash_from_names, options_api.rb:9-12
    else pairs[existing][1] = name;
  }
  const firstName = selectedItems.length > 0 ? selectedItems[0] : undefined;
  const options = optionsForSelect(
    pairs,
    firstName === undefined ? [] : [firstName],
  );
  const groupName = `pointer_select-${ctx.fmt.uniqueId()}`;
  return (
    `<select name="${groupName}" id="${groupName}" ` +
    `class="pointer-select form-control">` +
    options +
    `</select>`
  );
}

/** multiselect_input (html_views.rb:93-97):
 *  `select_tag "pointer_multiselect-#{unique_id}",
 *  options_for_select(card.options_hash, card.item_names), multiple: true,
 *  class: "pointer-multiselect form-control"` - every own item whose value
 *  the option list carries emits selected="selected". */
function multiselectInputHtml(ctx: ViewContext): string {
  const { optionNames, selectedItems } = editorOptionNames(ctx, "multiselect");
  const pairs = optionNames.map((name) => [name, name] as [string, string]);
  const options = optionsForSelect(pairs, selectedItems);
  const groupName = `pointer_multiselect-${ctx.fmt.uniqueId()}`;
  return (
    `<select name="${groupName}[]" id="${groupName}" ` +
    `multiple="multiple" class="pointer-multiselect form-control">` +
    options +
    `</select>`
  );
}

/** autocomplete_input (html_views.rb:60-62): `autocomplete_field
 *  items_for_input.first, options_card_name` - card-mod-search
 *  set/all/autocomplete.rb:14-19 renders haml :autocomplete_input
 *  (card-mod-search set/all/autocomplete/autocomplete_input.haml, 3 lines)
 *  with item = items_for_input.first (the [""] fallback, html_views.rb:
 *  115-118), options_card = the CONTENT OPTIONS card's url key
 *  (options_card_name, options_api.rb:51-53 - the rule card itself, not
 *  the search mod's hardcoded *all+by_name) and extra_classes = "" (the
 *  default), so the class value keeps its TRAILING SPACE. placeholder_text
 *  is "" (card-mod-edit set/all/editor.rb:60-62). The bytes below are the
 *  RUN OUTPUT of the on-disk haml-5.2.2 + actionview-7.2.3.2 gems with
 *  this exact template (text_field_tag, form_tag_helper.rb:263-265: type /
 *  name / id / value then the options keys appended - class,
 *  data-options-card, placeholder). The haml div keeps single-quoted
 *  attributes, the helper input double-quoted ones. */
function autocompleteInputHtml(ctx: ViewContext): string {
  const items = itemsForInput(ctx);
  const optionsCard = optionsCardUrlKey(ctx);
  const value = items.length > 0 ? items[0] : "";
  return (
    `<div class='pointer-list-editor pointer-list-ul'>\n` +
    `<input type="text" name="pointer_item" id="pointer_item" value="${h(value)}" ` +
    `class="pointer-item-text form-control _autocomplete " ` +
    `data-options-card="${h(optionsCard)}" placeholder="" />\n` +
    `</div>\n`
  );
}

/** The item rows' name-field class chain for the _reference_list_input_row
 *  partial. Ruby builds it twice over (card-mod-search set/all/autocomplete.rb
 *  :21-25 name_autocomplete_field prepends the
 *  "pointer-item-text form-control _autocomplete" base and the row caller
 *  passes "_reference pointer-item-text form-control group-text-middle" as
 *  extra_classes), so the base tokens repeat - the Ruby chain carries
 *  exactly this doubled form, so the constant keeps the doubled
 *  form. Both the nest-list and the link-list editors share it. */
const REFERENCE_NAME_FIELD_CLASS =
  "pointer-item-text form-control _autocomplete _reference pointer-item-text form-control group-text-middle";

/** The nest list editor (set/type/nest_list.rb:42-48 + haml
 *  :nest_list_input + the _reference_list_input_row partial). items_for_input
 *  (:37-40): the nest chunks' raw names zipped with raw_options - the RAW
 *  "key:value" string between the pipes (card-mod-content
 *  lib/card/content/chunk/nest.rb:16-18, 108-109). The autocomplete field's
 *  data-options-card is `%i[all by_name].to_name` (card-mod-search
 *  set/all/autocomplete.rb:31-34) - the codename-resolved junction
 *  "*all+by name"; resolved through the prepared map with
 *  the seed-stable constants as fallback. */
function nestListInputHtml(ctx: ViewContext): string {
  const items = nestListItemsForInput(ctx.fmt.card.dbContent);
  const ulClasses = ctx.voo.classy("pointer-list-editor", "_nest-list-ul");
  const optionsCard = autocompleteOptionsCard(ctx);
  const header =
    `<div class='nest-form-header'>\n` +
    referenceListInputRow({
      prefix: "{{",
      postfix: "}}",
      firstLabel: "Name",
      secondLabel: "Options",
      showEditButton: false,
    }) +
    `\n</div>\n`;
  const rows = items
    .map(
      ([name, rawOptions], index) =>
        `<li class='pointer-li mb-2 _nest-form' data-index='${index}'>\n` +
        referenceListInputRow({
          prefix: "{{",
          postfix: "}}",
          nameValue: name,
          titleValue: rawOptions,
          nameFieldClass: REFERENCE_NAME_FIELD_CLASS,
          titleFieldClass:
            "_title _nest-options pointer-item-text form-control group-text-middle",
          showEditButton: true,
        }) +
        `\n</li>\n`,
    )
    .join("");
  return (
    header +
    `<ul class='${ulClasses}'>\n` +
    rows.replaceAll("__OPTIONS_CARD__", optionsCard) +
    `</ul>\n` +
    addAnotherSpan()
  );
}

/** link_list_input (set/type/link_list.rb:43-56 + haml :link_list_input):
 *  the same row partial with [[ ]] delimiters, "Link target"/"Link text"
 *  headers, no edit button, and item_titles(false) for the title inputs -
 *  the link chunk's title = link_text || the fully-stripped name
 *  (card-mod-content lib/card/content/chunk/link.rb:32). */
function linkListInputHtml(ctx: ViewContext): string {
  const items = linkListItemsForInput(ctx, ctx.fmt.card.dbContent);
  const ulClasses = ctx.voo.classy("pointer-list-editor", "pointer-link-list-ul");
  const optionsCard = autocompleteOptionsCard(ctx);
  const header =
    `<div class='nest-form-header'>\n` +
    referenceListInputRow({
      // the haml's HEADER row passes nest delimiters even for links
      // (set/type/link_list_input.haml: prefix: "{{", postfix: "}}") -
      // only the item rows use [[ ]]
      prefix: "{{",
      postfix: "}}",
      firstLabel: "Link target",
      secondLabel: "Link text",
      showEditButton: false,
    }) +
    `\n</div>\n`;
  const rows = items
    .map(
      ([name, title], index) =>
        `<li class='pointer-li mb-2 _nest-form' data-index='${index}'>\n` +
        referenceListInputRow({
          prefix: "[[",
          postfix: "]]",
          nameValue: name,
          titleValue: title,
          nameFieldClass: REFERENCE_NAME_FIELD_CLASS,
          titleFieldClass: "_title pointer-item-text form-control group-text-middle",
          showEditButton: false,
        }) +
        `\n</li>\n`,
    )
    .join("");
  return (
    header +
    `<ul class='${ulClasses}'>\n` +
    rows.replaceAll("__OPTIONS_CARD__", optionsCard) +
    `</ul>\n` +
    addAnotherSpan()
  );
}

function autocompleteOptionsCard(ctx: ViewContext): string {
  const all = ctx.fmt.engine.fetchRenderCard("*all")?.name.s ?? "*all";
  const byName = ctx.fmt.engine.fetchRenderCard("by name")?.name.s ?? "by name";
  return `${all}+${byName}`;
}

/** nest_list items_for_input (nest_list.rb:37-40): the {{...}} chunks in
 *  content order - the name part and the raw options string (nil when no
 *  pipe), exactly Chunk::Nest#interpret's split("|", 2). Empty content
 *  yields [["", ""]]. */
function nestListItemsForInput(content: string): [string, string | undefined][] {
  const pairs: [string, string | undefined][] = [];
  for (const match of content.matchAll(/\{\{([^}]*)\}\}/g)) {
    const inner = match[1] ?? "";
    const pipe = inner.indexOf("|");
    if (pipe === -1) pairs.push([inner, undefined]);
    else pairs.push([inner.slice(0, pipe), inner.slice(pipe + 1)]);
  }
  return pairs.length === 0 ? [["", ""]] : pairs;
}

/** link_list items_for_input (link_list.rb:45-48): the [[...]] reference
 *  chunks - referee_name (the part before the pipe) zipped with
 *  item_titles(false) (link_list.rb:8-14): the chunk title = link_text ||
 *  the fully-stripped name (link.rb:32). Empty content yields [["", ""]]. */
function linkListItemsForInput(
  ctx: ViewContext,
  content: string,
): [string, string | undefined][] {
  const pairs: [string, string | undefined][] = [];
  for (const match of content.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const inner = match[1] ?? "";
    const pipe = inner.indexOf("|");
    const target = pipe === -1 ? inner : inner.slice(0, pipe);
    // item_names context: :raw (item.rb clean_item_name) reads the item as a
    // Card::Name: a codename mark (":getting_started_links") names the card
    // that holds the codename, so the input shows that card's name.
    const name = resolveItemMark(ctx, target);
    if (pipe === -1) pairs.push([name, name]);
    else pairs.push([name, inner.slice(pipe + 1)]);
  }
  return pairs.length === 0 ? [["", ""]] : pairs;
}

/** Card::Name's codename mark (lib/card/name.rb): ":codename" resolves to the
 *  registered name of the card holding it. Any other item is its own name.
 *  An unknown codename raises, as Card::Name does (CodenameNotFoundError). */
function resolveItemMark(ctx: ViewContext, target: string): string {
  const mark = /^:([A-Za-z0-9_?!]+)$/.exec(target);
  if (mark === null) return target;
  const id = ctx.fmt.engine.peekIdByCodename?.(mark[1] as string);
  const name = id === undefined ? undefined : ctx.fmt.engine.peekRegisteredNameForId?.(id);
  if (name === undefined) {
    throw new CodenameNotFoundError(`codename doesn't exist: ${mark[1]}`);
  }
  return name;
}

/** The _reference_list_input_row partial (set/type/_reference_list_input_row.haml),
 *  byte-shaped. The name field is name_autocomplete_field (card-mod-search
 *  set/all/autocomplete.rb:31-34: text_field_tag "pointer_item" with the
 *  _autocomplete class chain and the *all+by_name options card); the title
 *  field is text_field_tag "pointer_item_title" (no value attribute when
 *  the value is nil - ActionView skips nil tag values). */
function referenceListInputRow(opts: {
  prefix: string;
  postfix: string;
  firstLabel?: string;
  secondLabel?: string;
  nameValue?: string;
  titleValue?: string | undefined;
  nameFieldClass?: string;
  titleFieldClass?: string;
  showEditButton: boolean;
}): string {
  const nameField = opts.firstLabel !== undefined
    ? `<span class="form-control border-0 control-label">${opts.firstLabel}</span>\n`
    : `<input type="text" name="pointer_item" id="pointer_item" value="${h(opts.nameValue ?? "")}" class="${opts.nameFieldClass}" placeholder="" data-options-card="__OPTIONS_CARD__" />\n`;
  const titleValueAttr = opts.titleValue === undefined
    ? ``
    : ` value="${h(opts.titleValue)}"`;
  const titleField = opts.secondLabel !== undefined
    ? `<span class="form-control border-0 control-label">${opts.secondLabel}</span>\n`
    : `<input type="text" name="pointer_item_title" id="pointer_item_title"${titleValueAttr} class="${opts.titleFieldClass}" />\n`;
  const editButton = !opts.showEditButton
    ? ``
    : `<div class='input-group-append ml-2'>\n` +
      `<span class='input-group-text p-0 border-primary'>\n` +
      `<button class='btn btn-primary _open-nest-editor' type='button'>\n` +
      `${icon("edit")}\n` +
      `</button>\n` +
      `</span>\n` +
      `</div>\n`;
  return (
    `<div class='input-group'>\n` +
    `<span class='input-group-text handle'>\n` +
    `${icon("reorder")}\n` +
    `</span>\n` +
    `<span class='input-group-text text-muted group-text-left input-nest-syntax'>\n` +
    `${opts.prefix}\n` +
    `</span>\n` +
    nameField +
    `<span class='input-group-text text-muted group-text-middle input-nest-syntax'>\n` +
    `|\n` +
    `</span>\n` +
    titleField +
    `<span class='input-group-text text-muted group-text-end input-nest-syntax'>\n` +
    `${opts.postfix}\n` +
    `</span>\n` +
    `<div class='input-group-append'>\n` +
    `<span class='input-group-text p-0'>\n` +
    `<button class='pointer-item-delete btn btn-secondary' type='button'>\n` +
    `${icon("close")}\n` +
    `</button>\n` +
    `</span>\n` +
    `</div>\n` +
    editButton +
    `</div>\n`
  );
}

/** The add-another button that closes list_input/link_list_input/
 *  nest_list_input (the tail of each haml template). */
function addAnotherSpan(): string {
  return (
    `<span class='input-group'>\n` +
    `<button class='_pointer-item-add btn btn-secondary' type='submit'>\n` +
    `${icon("add")}\n` +
    `add another\n` +
    `</button>\n` +
    `</span>\n`
  );
}

/** html_views.rb:32-34 / nest_list.rb:24-26 / link_list.rb:27-29:
 *  `_render_hidden_content_field + super()` - the hidden field then the
 *  type's editor bytes, concatenated with no separator.
 *
 *  THE NON-FAMILY ARM DELEGATES (was: threw). `include_set Abstract::List`
 *  (set/abstract/01_list/html_views.rb) is what puts THIS :input in a list
 *  card's chain; a card outside the family never enters that module, so
 *  Ruby's chain reaches card-mod-edit's set/all/editor.rb:32-36
 *  `view :input, unknown: true, cache: :never do try(input_method(
 *  input_type)) || input_defined_by_card || send(input_method(
 *  default_input_type)) end` instead. Before this arm delegated, the chain
 *  walker still handed it every non-family card — the flat abstract
 *  registration is deliberately kept flat (mod-registrar.ts DIVERGENCE 2: no
 *  include_set seam) — and the create form's `content_field` -> `_render_input`
 *  raised a 500. MEASURED: the stock Ruby oracle answers
 *  `/Ada_Admin+follow/input` with 200 and the rich-text editor
 *  (`<textarea rows="3" class="tinymce-textarea d0-card-content …">`), which
 *  is card-mod-edit's `rich_text_input` (:42-44) under the deck's configured
 *  editor; `miranda member + follow` (an unsaved junction card, so the create
 *  form is the page) reached the same view and rendered the create form. */
const inputView: ViewFn = (ctx) => {
  const typeCode = ctx.fmt.card.typeCode ?? "";
  let editor: string;
  if (typeCode === "nest_list") {
    editor = nestListInputHtml(ctx);
  } else if (typeCode === "link_list") {
    editor = linkListInputHtml(ctx);
  } else if (listFamilyCard(ctx.fmt)) {
    editor = listFamilyInputHtml(ctx);
  } else {
    // Not in the Abstract::List family: Ruby's chain lands on the base
    // editor, so the base editor's body IS the answer (no hidden content
    // field — that is this module's `super()` prefix, absent off-family).
    return editorBaseInputView(ctx);
  }
  return hiddenContentField(ctx) + editor;
};

// ---------------------------------------------------------------------------
// set/type/nest_list.rb:21-23 view :nest_list_input, cache: :never
// ---------------------------------------------------------------------------

const nestListInputView: ViewFn = (ctx) => {
  if ((ctx.fmt.card.typeCode ?? "") !== "nest_list") {
    // Ruby: the view exists only on Type::NestList
    throw new UnsupportedViewError("nest_list_input", ctx.fmt.card.name.s);
  }
  return nestListInputHtml(ctx);
};

// ---------------------------------------------------------------------------
// prepareEngine - the boot-time rule warm (the Rule::Cache analog). The
// statement and the multi-pass composition live once in rule-card-warm.ts
// (ruleSidesStatement + warmRuleCards).
// ---------------------------------------------------------------------------

/** One batch, once per engine: every *input_type / *content_options rule
 *  card enters the prepared render-card map (multi-pass junction
 *  composition, sides first). */
async function prepareListRules(host: ModEngineHost): Promise<void> {
  await host.codenames.ensureLoaded(); // memoized; first call only
  const setTypeId = host.codenames.peekId("set");
  const settingTypeId = host.codenames.peekId("setting");
  if (setTypeId === undefined || settingTypeId === undefined) return; // degenerate deck
  await warmRuleCards(host, setTypeId, settingTypeId, [
    "input_type",
    "content_options",
  ]);
}

// ---------------------------------------------------------------------------
// event declarations - the set-module `event` DSL (lib/card/set/event.rb).
// Five events across set/abstract/01_list/events.rb (1, 8, 13, 29) and
// set/abstract/delist.rb:2. The ModEventStage union (mod-manifest.ts:
// 152-163) carries the full Ruby director stage list including
// :initialize / :validate / :after_integrate / :integrate_with_delay /
// :extend / :extend_with_delay; all five gem events pin as declarations
// here.
//
// CORRECTED 2026-10-20 (events tranche 5; the previous note here read
// "the action engine's stage seam does not fire them in this port" —
// that was true when written and is FALSE now). The seam IS wired:
// CardActionEngine.dispatchEventStage runs at 20 stage points and is
// composed from write-routes.ts's servingModEventRuntime.
//
// What is still true, and what the fns honestly say, is that the BODIES of
// add_and_drop_items and insert_item_event run INLINE in the write route
// rather than through a registered fn — listItemContent
// (write-routes.ts) applies Ruby's operations in Ruby's order against the
// content the request assigned (Ruby's events read the card AFTER
// assign_attributes). Moving them into the dispatch would run them at a
// different point in the save, after the content they act on is already
// fixed. So those two rows are PORTED-BY-WRITE-PATH with an honest stub
// fn; validate_item_type / validate_item_uniqueness below and delist
// remain the named not-ported bodies (item_cards / duplicate_item_names /
// ok_item_types / errors.add / referers / subcard / t(...) have no TS
// surface).
// ---------------------------------------------------------------------------

/** events.rb:1-6 add_and_drop_items (prepare_to_validate, on: save) - the
 *  Ruby body reads Env.params["add_item"|"drop_item"] and calls the card
 *  methods add_item / drop_item.
 *  PORTED-BY-WRITE-PATH (audit 2026-10-20, events tranche 5): the body
 *  runs inline in write-routes.ts's listItemContent, appending the adds
 *  then dropping by name identity, in Ruby's order. The fn stays the
 *  honest no-op because moving it into the dispatch would run it after
 *  the content it acts on is fixed. Pinned by
 *  tests/card/mod-loader/card-mod-list-item-events.test.ts (declaration +
 *  the route's four parsed params + the operation order) and by the body
 *  tests in tests/server/write-routes-id-mark-save.test.ts. */
const addAndDropItems: ModEventFn = () => {
  // not ported: the write path is absent (see the section header above)
};

/** events.rb:8-11 insert_item_event (prepare_to_validate, on: save, when:
 *  :item_to_insert) - the Ruby body calls insert_item with item_to_insert
 *  (item_to_insert -> Env.params["insert_item"]). The `when` predicate
 *  resolves at the execution seam.
 *  PORTED-BY-WRITE-PATH (audit 2026-10-20, events tranche 5): the body
 *  runs inline in write-routes.ts's listItemContent — remove the name
 *  wherever it sits, then insert at (item_index || 0).to_i, which is
 *  item_assignment.rb:47-51. The fn stays the honest no-op for the same
 *  reason as addAndDropItems above. Pinned by
 *  tests/card/mod-loader/card-mod-list-item-events.test.ts and by the body
 *  test in tests/server/write-routes-id-mark-save.test.ts. */
const insertItemEvent: ModEventFn = () => {
  // not ported: the write path is absent (see the section header above)
};

/** delist.rb:2-9 delist (prepare_to_store, on: delete) - the Ruby body walks
 *  `referers` (reference/all.rb:13-15 - the card_references rows pointing at
 *  self), gates each on `delistable? && is_a?(Abstract::List) && real?`, and
 *  calls drop_item (item_assignment.rb:32-35 - rewrite the list content
 *  without the item) + `subcard referer` (the modified referer saves within
 *  the SAME act, with its own events).
 *
 *  SKIPPED-BY-NAME (residue lane 2026-10-20), two verified facts:
 *
 *  1. The event is UNREACHABLE in the pinned gemset: nothing includes
 *     Abstract::Delist (exhaustive grep of the gemset - zero references to
 *     the module name), and set_condition_applies? (card-1.110.0
 *     lib/card/set/event/all.rb:26-29) fires the event only when the
 *     declaring set module is in the card's set-module chain. Declared,
 *     never fires - for any card.
 *  2. The port's walk mirrors that deadness exactly: the registration
 *     (setPath "abstract/delist", below) resolves set membership through
 *     the serving runtime's setMember (write-routes.ts:1663 - right/*,
 *     right/enabled_roles, type_plus_right/*, type/* only), so the
 *     dispatcher answers set-not-applicable for every save - the same
 *     observable behavior as Ruby's dead event.
 *
 *  The BODY itself is also not portable without divergence: `subcard
 *  referer` folds the referer's content rewrite into the ACT as its own
 *  save (validations, reference janitors, act rows) - the port's event seam
 *  is single-card (ModEventContext carries no subcard surface; see the
 *  section header above), and a substitute direct db_content UPDATE would
 *  bypass exactly the machinery Ruby's subcard save runs. Per the parity
 *  law: named, not faked. The fn stays the honest stub. */
const delistEvent: ModEventFn = (_card, _host) => {
  // see header: write path / set membership / subcard not ported
};

/** events.rb:13-23 validate_item_type (validate, on: save, when:
 *  validate_item_type?) - the Ruby body reads `ok_item_types`
 *  (events.rb:35-37 - nil default, overridden on Type::Style /
 *  Type::Script + the bootswatch_skin+stylesheets rule), wraps it via
 *  Array.wrap, maps each by codename, then walks `item_cards` adding an
 *  error `:content` per item whose `type_code` is not in `ok_types`
 *  (events.rb:14-22). The error message uses t(:list_invalid_item_type)
 *  (the i18n surface). The fn preserves the (card, host) shape the
 *  ModEventFn signature demands; the semantics need the validation
 *  WRITE-PATH SEAM: `errors.add` on the acting card, `ok_item_types` /
 *  `item_cards` card methods, the i18n `t` helper. None of those have a
 *  TS surface in this port. Documented stub. */
const validateItemType: ModEventFn = (_card, host) => {
  // validation write-path seam absent: ok_item_types / item_cards /
  // errors.add / t(:list_invalid_item_type) not ported (events.rb:13-23).
  void host;
};

/** events.rb:29-33 validate_item_uniqueness (validate, on: save, when:
 *  unique_items?) - the Ruby body returns unless `duplicate_item_names`
 *  is present, then `errors.add :content` with t(:list_duplicate_items_
 *  names). The `unique_items?` predicate and `duplicate_item_names`
 *  helper live in card-mod-collection set/all/item_assignment.rb (the
 *  include side); the events.rb:25-28 inline comment notes that at
 *  present this validator MAY NEVER raise because `#standardize_items`
 *  (card-mod-permissions set/abstract/permission.rb) already dedupes.
 *  Documented stub: the validation write-path seam (errors.add + the
 *  i18n t helper + the collection method surface) is absent. */
const validateItemUniqueness: ModEventFn = (_card, host) => {
  // validation write-path seam absent: duplicate_item_names / unique_items?
  // / errors.add / t(:list_duplicate_items_names) not ported (events.rb:29-33).
  void host;
};

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// set/abstract/01_list.rb:39-44 - view :view_list (gem-source-derived:
// no rendered reference exists for it)
//
//   format :html do
//     view :view_list do
//       %i[bar box closed titled labeled].map do |view|
//         voo.items[:view] = view
//         wrap_with :p, [content_tag(:h3, "#{view} items"), render_content]
//       end
//     end
//   end
//
// Three Ruby details shape the bytes:
//  (1) `voo.items[:view] = view` MUTATES the current voo before each
//      render_content, so the pointer/list :core that render_content reaches
//      reads THAT view as its item view (item.rb:157-162 item_view_options).
//      The TS form passes the item view as a child render option - the Voo
//      constructor's items-heir branch (format.ts:126-131) skips inheritance
//      exactly when opts.items is supplied, so the child sees the override
//      and the parent is left untouched (the mutation Ruby's performs is not
//      read again after the loop).
//  (2) `wrap_with :p, ARRAY` (card-mod-format set/all/html/wrap.rb:117-120)
//      is the NO-BLOCK form: `content_tag(:p, {}) { content_within_wrap
//      ARRAY }` - a PLAIN p with no slot attributes, its interior produced
//      by Card::Format::Content#output (card-1.110.0
//      lib/card/format/content.rb:70-73): `Array.wrap(content).flatten
//      .compact.join "\n"`. So the h3 and the content are joined by "\n".
//  (3) the view BODY returns that Array of five <p> strings; the view
//      dispatch runs it through the same `output`, so the five blocks are
//      joined by "\n" as well. (A ViewFn returns a string in this engine -
//      format.ts:531 `return viewFn({fmt: this, voo})` - so the join is
//      done here rather than by the dispatch.)
// ---------------------------------------------------------------------------

const VIEW_LIST_ITEM_VIEWS = ["bar", "box", "closed", "titled", "labeled"] as const;

const viewListView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  if (!listFamilyCard(fmt)) {
    // Ruby declares this on Abstract::List, so a non-list-family card has
    // no reachable definition (render.rb#view_method) - same contract the
    // module's other set-guarded views use.
    throw new UnsupportedViewError("view_list", fmt.card.name.s);
  }
  return VIEW_LIST_ITEM_VIEWS.map((view) => {
    const content = fmt.renderView("content", { items: { view } });
    return `<p><h3>${view} items</h3>\n${content}</p>`;
  }).join("\n");
};

/** other_views.rb:59-61 (json block) view :links: literally `[]`.
 *
 * The list family's override of the data format's general :links view
 * (card-mod-format-0.20.0 set/all/data.rb:74-82, which maps a card's
 * `link_chunks` through `path mark:, format: :json`). A LIST card has no
 * link chunks of its own — its items are separate cards — so Ruby
 * returns the empty array, and the json :molecule the data format builds
 * (`atom.merge items: _render_items, links: _render_links, ...`,
 * data.rb:101-109) gets `links: []` for a list.
 *
 * That is exactly what the port's json molecule already writes:
 * render/format-families.ts#jsonMolecule sets `molecule["links"] = []`
 * (:415, inside the jsonMolecule walk :404-427). So what was missing was
 * the DECLARATION — the flat view name was unregistered, and a card asked
 * for :links under the json format had no view to dispatch. Registering it
 * closes that, and the value stays the same `[]` the molecule hardcodes.
 * The general data-format arm (the link_chunks walk) is what a NON-list
 * card's molecule needs, and it remains the named divergence the register
 * records; this registration does not change it.
 *
 * The body returns the ARRAY, not JSON text: the json format's view
 * protocol stringifies a non-string answer — the same seam the landed
 * collection :paging_urls registration uses (card-mod-collection.ts
 * :588-598 returns a Hash-shaped object for the same reason). */
const listJsonLinksView: ViewFn = () => [];

// ---------------------------------------------------------------------------
// the when: predicates (set/abstract/01_list/events.rb)
// ---------------------------------------------------------------------------

/** The set-module methods Ruby's `when:` conditions reach with `send`
 *  (card/lib/card/set/event/all.rb:82) from the Abstract::List event
 *  declarations. The deck-boot composition merges them into
 *  ModEventRuntime.predicates (default-mod-deck.ts).
 *
 *  Two of the three read `ok_item_types`, whose base definition is nil
 *  (events.rb:35-37) and whose three overrides live in OTHER mods'
 *  set modules (mod/style set/type_plus_right/set/style.rb:5-7,
 *  mod/script set/type_plus_right/set/script.rb:3-5, mod/bootstrap
 *  set/type_plus_right/bootswatch_skin/stylesheets.rb:3-5). The list mod's
 *  own state source therefore answers the QUESTION ("does this card
 *  constrain its item types?") by resolving which of those three sets the
 *  card carries, not by restating any one override - see the okItemTypes
 *  resolver below and mod-event-state-sources.ts's listSource. */
export const listModEventPredicates = {
  /** item_to_insert (events.rb:43-45): `Env.params["insert_item"]` - the
   *  request named an item to splice into the list at `item_index`
   *  (events.rb:8-11). Not a `?` method: Ruby sends it and takes its
   *  TRUTHINESS as the condition (when_condition_applies? returns the
   *  method's value, all.rb:79-85), so an empty-string param still
   *  reaches the body - which is Ruby's arm too, since the body only
   *  skips on a nil index. */
  item_to_insert: (card: ModEventCard): boolean =>
    card.params?.["insert_item"] !== undefined && card.params?.["insert_item"] !== null,
  /** validate_item_type? (events.rb:39-41): `ok_item_types.present?`. The
   *  base returns nil (events.rb:35-37), so the predicate is false for
   *  every plain list card and true only for the three type-constraining
   *  sets. Reads the resolved answer off the card rather than
   *  re-deriving it here, so the walk has one definition. */
  "validate_item_type?": (card: ModEventCard): boolean => card.hasOkItemTypes === true,
} as const;

// the manifest (one entry per gem file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

const cardModList: DeckoModManifest = {
  name: "list",
  gemName: "card-mod-list",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-list-0.20.0/set/abstract/01_list.rb - the html
      // :view_list demo view (01_list.rb:39-44). Item semantics
      // (item_references?, swap_names, standardize_content, count) are card
      // methods with no view surface; the collection item.rb machinery this
      // file builds on is ported in the helpers above.
      setPath: "abstract/01_list",
      formats: {
        html: {
          views: [{ view: "view_list", viewFn: viewListView }],
        },
      },
    },
    {
      // card-mod-list-0.20.0/set/abstract/01_list/events.rb - the four
      // events in this file pin as declarations (all five gem-side `event`
      // calls; see the file's fifth event on abstract/delist below).
      //   events.rb:1  add_and_drop_items        prepare_to_validate, on: save
      //   events.rb:8  insert_item_event         prepare_to_validate, on: save,
      //                                          when: :item_to_insert
      //   events.rb:13 validate_item_type        validate, on: save,
      //                                          when: :validate_item_type?
      //   events.rb:29 validate_item_uniqueness  validate, on: save,
      //                                          when: :unique_items?
      // The :validate stage is in the ModEventStage union (mod-manifest.ts:
      // 152-163 - the full Ruby director stage list); the two previously-
      // blocked events pin here as well. The pinned fns are stubs (the
      // validation write path - errors.add / i18n t / ok_item_types /
      // item_cards / duplicate_item_names - has no TS surface); the
      // registry records the name/stage/on/when verbatim.
      setPath: "abstract/01_list/events",
      events: [
        {
          event: "add_and_drop_items",
          at: "prepare_to_validate",
          on: ["save"],
          fn: addAndDropItems,
        },
        {
          event: "insert_item_event",
          at: "prepare_to_validate",
          on: ["save"],
          when: "item_to_insert",
          fn: insertItemEvent,
        },
        {
          event: "validate_item_type",
          at: "validate",
          on: ["save"],
          when: "validate_item_type?",
          fn: validateItemType,
        },
        {
          event: "validate_item_uniqueness",
          at: "validate",
          on: ["save"],
          when: "unique_items?",
          fn: validateItemUniqueness,
        },
      ],
    },
    {
      // card-mod-list-0.20.0/set/abstract/01_list/html_views.rb
      // (the :core view stays in the render layer - pointer-list.ts)
      setPath: "abstract/01_list/html_views",
      formats: {
        html: {
          views: [
            {
              view: "one_line_content",
              viewFn: oneLineContentView,
              // the card-mod-format html view's settings persist through
              // the override; the wrap's
              // text-muted div is emitted in the body
              config: { unknown: "mini_unknown" },
            },
            {
              view: "list",
              viewFn: listView,
              // source: view :list, cache: :never (html_views.rb:44).
              config: { cache: "never" },
            },
            {
              view: "checkbox",
              viewFn: checkboxView,
              // source: view :checkbox (html_views.rb:50-52's loop, :60-62) -
              // no settings declared, so the loader defaults apply.
            },
            {
              view: "radio",
              viewFn: radioView,
              // source: view :radio (html_views.rb:56-58's loop, :68-70)
            },
            {
              view: "select",
              viewFn: selectView,
              // source: view :select (html_views.rb:56-58's loop, :72-75) -
              // no settings declared, so the loader defaults apply.
            },
            {
              view: "multiselect",
              viewFn: multiselectView,
              // source: view :multiselect (html_views.rb:56-58's loop,
              // :93-97) - no settings declared, so the loader defaults apply.
            },
            {
              view: "autocomplete",
              viewFn: autocompleteView,
              // source: view :autocomplete (html_views.rb:56-58's loop,
              // :60-62) - no settings declared, so the loader defaults apply.
            },
            {
              view: "input",
              viewFn: inputView,
              // the card-mod-edit editor settings persist through the
              // override (editor.rb:50)
              config: { unknown: true, cache: "never" },
            },
          ],
        },
      },
    },
    {
      // card-mod-list-0.20.0/set/abstract/01_list/other_views.rb - the
      // base-format :core + the csv/js/data/json/css/rss views; the engine
      // is html-only and the html :core stays in the render layer.
      //
      // The json block's :links (:59-61, `[]`) IS registered — see
      // listJsonLinksView's header. It was the file's one named absence
      // on this set module, and the register's own correction records
      // that the ANSWER was already landed (render/format-families.ts
      // :415, `molecule["links"] = []`) with only the registration
      // missing. The json block's :content (`card.item_names`, :47-49)
      // stays unregistered: the json format's :molecule consumes the item
      // list directly (data.rb:101-109's `_render_items`), so no dispatch
      // reaches a bare :content view on the json key — the same
      // "no reader" position the register records for the csv/js/data/
      // css/rss arms this file also leaves unregistered.
      setPath: "abstract/01_list/other_views",
      formats: {
        json: {
          views: [{ view: "links", viewFn: listJsonLinksView }],
        },
      },
    },
    {
      // card-mod-list-0.20.0/set/abstract/codename_list.rb - card methods
      // over the module baskets; no TS basket consumer
      setPath: "abstract/codename_list",
    },
    {
      // card-mod-list-0.20.0/set/abstract/delist.rb - the delist delete
      // event (delist.rb:2) pins as a declaration at :prepare_to_store.
      // The fn body walks referers + subcard (not ported); the registry
      // records the declaration only.
      setPath: "abstract/delist",
      events: [
        {
          event: "delist",
          at: "prepare_to_store",
          on: ["delete"],
          fn: delistEvent,
        },
      ],
    },
    {
      // card-mod-list-0.20.0/set/abstract/id_list.rb - id-storage item
      // semantics + the reference-insert write path; no write path in the
      // engine
      setPath: "abstract/id_list",
    },
    {
      // card-mod-list-0.20.0/set/abstract/reference_list.rb - chunk_list
      // + the header_field helper (byte-folded into referenceListInputRow)
      setPath: "abstract/reference_list",
    },
    {
      // card-mod-list-0.20.0/set/all/supports_content_options.rb - the
      // list_input_options basket + delistable?/supports_content_options?
      // predicates; the basket has no TS consumer
      setPath: "all/supports_content_options",
    },
    {
      // card-mod-list-0.20.0/set/right/content_option_view.rb -
      // assign_type :phrase + the quick_edit override (edit surface)
      setPath: "right/content_option_view",
    },
    {
      // card-mod-list-0.20.0/set/right/content_options.rb -
      // assign_type :list + the quick_editor override (edit surface)
      setPath: "right/content_options",
    },
    {
      // card-mod-list-0.20.0/set/self/content_option_view.rb
      setPath: "self/content_option_view",
      settingOpts: {
        group: "editing",
        position: 6,
        ruleTypeEditable: false,
        helpText:
          "Label view for radio button and checkbox items.  " +
          "[[http://decko.org/Pointer|more]]",
        restrictedToType: ["list", "pointer", "session"],
        // the `applies:` lambda (prototype.supports_content_options? &&
        // rule_card(:input_type)&.supports_content_option_view?) has no
        // ModSettingOpts field - not ported
      },
    },
    {
      // card-mod-list-0.20.0/set/self/content_options.rb
      setPath: "self/content_options",
      settingOpts: {
        group: "editing",
        position: 5,
        ruleTypeEditable: true,
        helpText:
          "Value options for [[List]] and [[Pointer]] and cards. " +
          "Can itself be a List or a [[Search]]. " +
          "[[http://decko.org/Pointer|more]]",
        restrictedToType: ["list", "pointer", "session"],
        // the `applies:` lambda (prototype.rule_card(:input_type)
        // &.supports_content_options?) has no ModSettingOpts field
      },
    },
    {
      // card-mod-list-0.20.0/set/self/input_type/right/content_options.rb -
      // the *input_type+*right+*content_options card's content override
      // (the basket codes as pointer content); no card-method surface.
      // The RENDER-path registration of that override lives in the
      // built-in default ContentOverrideRegistry
      // (render/content-overrides.ts, setPath "self/*input_type+*right+
      // *content_options" in the card's KEY form) per the bootstrap
      // precedent: the loader-less engine never registers a
      // manifest contentOverrides entry.
      setPath: "self/input_type/right/content_options",
    },
    {
      // card-mod-list-0.20.0/set/type/link_list.rb - item/title methods +
      // view :input, cache: :never (:27-29). Registered here so Type::LinkList
      // owns the view as in Ruby; the body is the shared inputView
      // dispatcher (its link_list branch). The unknown setting is inherited
      // through Ruby's method resolution (the _view_input__unknown method of
      // the editor module), so the config matches the abstract registration.
      setPath: "type/link_list",
      formats: {
        html: {
          views: [{ view: "input", viewFn: inputView, config: { unknown: true, cache: "never" } }],
        },
      },
    },
    {
      // card-mod-list-0.20.0/set/type/list.rb - include_set Abstract::List
      setPath: "type/list",
    },
    {
      // card-mod-list-0.20.0/set/type/nest_list.rb - item/option methods +
      // view :nest_list_input + the :input override
      setPath: "type/nest_list",
      formats: {
        html: {
          views: [
            {
              view: "nest_list_input",
              viewFn: nestListInputView,
              config: { cache: "never" },
            },
            // nest_list.rb:24-26 view :input (the shared dispatcher's
            // nest_list branch; settings inherited as on link_list).
            { view: "input", viewFn: inputView, config: { unknown: true, cache: "never" } },
          ],
        },
      },
    },
    {
      // card-mod-list-0.20.0/set/type/pointer.rb - include_set Abstract::List
      setPath: "type/pointer",
    },
  ],
  prepareEngine: prepareListRules,
};

export default cardModList;
