// The card-mod-list gem (card-mod-list-0.20.0), ported through the mod
// loader - the pointer/list item surface (the editor + one-line views).
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/card-mod-list-0.20.0/):
// eighteen set files under set/, no lib/, no set_pattern/, no mod.yml (the
// gem relies on the name convention). The html views live in
// set/abstract/01_list.rb (:view_list), set/abstract/01_list/html_views.rb
// (:core, :one_line_content, :input, :list + the per-editor helpers) and
// set/type/nest_list.rb + set/type/link_list.rb (the type-specific editors).
// The :core view is NOT ported here - it is already in the render layer
// (src/card/render/pointer-list.ts + views.ts, the captured-corpus surface;
// the compat report counts it covered). Everything here is byte-pinned
// against the live decko 0.20.0 oracle (fixtures/captured/list-mod-loader.json,
// captured via tests/card/mod-loader/oracle-capture-list-mod.rb from
// tools/oracle/decko-oracle-app; data-slot-id/data-card-id normalized).
//
// PORTED views (oracle-pinned bytes):
// - :one_line_content (set/abstract/01_list/html_views.rb:19-26) - the
//   pointer/list override; the card-mod-format html view's `wrap:
//   { div: { class: "text-muted" } }` + `unknown: :mini_unknown` settings
//   (set/all/html/views.rb:24-27) persist through the override (the live
//   registry probe: _view_one_line_content__wrap/__unknown both true) - the
//   body emits the text-muted div itself
// - :list (set/abstract/01_list/html_views.rb:44-46, cache: :never) - the
//   pointer list editor (list_input haml)
// - :input (set/abstract/01_list/html_views.rb:32-34 +
//   set/type/nest_list.rb:26 + set/type/link_list.rb:28) - hidden content
//   field + the editor dispatch; the three type surfaces fold into ONE
//   view fn because the loader's view table is flat (Ruby dispatches them
//   as three set-module formats; here the typeCode picks the branch - the
//   abstract/:list branch via the *input_type rule, per card-mod-edit
//   set/all/editor.rb:6-13 + 50-52, with Abstract::List's
//   default_input_type :list override, html_views.rb:40-42)
// - :nest_list_input (set/type/nest_list.rb:21-23, cache: :never)
// - the type set modules (type/link_list.rb, type/nest_list.rb) register as
//   bookkeeping entries whose view bodies folded into the :input dispatcher
//
// NOT ported (honest remainder):
// - :view_list (set/abstract/01_list.rb:39-44) - its five sections render
//   :content with voo.items[:view] = bar/box/closed/titled/labeled; the
//   engine has no :box/:labeled views and the :content view does not honor
//   item views, AND the section bytes embed relative timestamps ("Created
//   by Decko Bot 2 minutes ago" in the capture) - not byte-pinnable
// - set/abstract/01_list/events.rb + set/abstract/delist.rb - the five
//   events (add_and_drop_items, insert_item_event, validate_item_type,
//   validate_item_uniqueness, delist). The three whose stages fit the
//   ModEventStage union (mod-manifest.ts:151-159) are pinned as
//   DECLARATIONS in the manifest events[] fields (the registry records
//   name/stage/on/when + a stub fn; the action engine's stage seam is not
//   wired in this port - see listEventFns below). The two :validate-stage
//   events (validate_item_type, validate_item_uniqueness) are BLOCKERS:
//   "validate" is not in the ModEventStage union, and mod-manifest.ts is
//   out of scope for this lane.
// - non-html formats (set/abstract/01_list/other_views.rb csv/js/data/json/
//   css/rss views) - the engine is html-format only
// - the :input editor variants beyond radio + list - checkbox/select/
//   multiselect embed the random `unique_id` and the select options
//   machinery (card-mod-layout options_api.rb), autocomplete needs the
//   autocomplete editor surface; a card whose *input_type rule names one of
//   those gets a loud error, never wrong bytes
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
//   help_text/restricted_to_type) is oracle-pinned
// - assets/script/*.js.coffee + assets/style/list.scss - asset pipeline
//   surface; config/locales - i18n surface; data/ - seed migrations

import type { RenderCard, ViewContext, ViewFn } from "../../render/format.js";
import { UnsupportedViewError } from "../../render/format.js";
import { DeckoName } from "../../name.js";
import { ruleNamesForCard } from "../../set-patterns/rule-names.js";
import type { PatternCardInput } from "../../set-patterns/types.js";
import { safeSetKeys } from "../../render/set-keys.js";
import { h } from "../../render/slot-html.js";
import { rawItemStrings } from "../../render/pointer-list.js";
import type { CardRecord } from "../../fetch/card-record.js";
import type {
  DeckoModManifest,
  ModEngineHost,
  ModEventFn,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// set membership - the Abstract::List family vs the sibling list types
// ---------------------------------------------------------------------------

/** The cardtypes whose class includes Abstract::List (set/type/pointer.rb,
 *  set/type/list.rb both `include_set Abstract::List`). The engine's
 *  enrichment carries the type card's codename as typeCode. */
const LIST_FAMILY = new Set(["pointer", "list"]);

/** The capture pins the sibling types' dispatch: view (:list) is
 *  "not supported" on Nest list and Link list cards (list-mod-loader.json
 *  rendered "CAPTURE_ERROR: Card::Error::UserError: view (list) not
 *  supported for ..."), because they include Abstract::Items +
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
 *  refs; the TS name algebra never raises, so those pass through -
 *  unpinned by the capture, see the header.) */
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
  for (const candidate of ruleNamesForCard(input, setting)) {
    const record = ctx.fmt.engine.fetchRenderCard(candidate);
    if (record === undefined) continue; // candidate rule does not exist
    if (ctx.fmt.engine.isDenied(record)) continue; // ok?(:read) false
    return record;
  }
  return undefined;
}

/** options_card_name (card-mod-layout set/abstract/items/options_api.rb:51-53
 *  + 44-48): `rule_card(:content_options) || right_type_options ||
 *  Card[:all]`, url-keyed. The right-type field branch (right_type_options)
 *  is a junction-field concern no captured surface exercises; without a
 *  *content_options rule the fallback is the *all card ("*all" - the
//  captured data-options-card bytes on every list editor row). */
function optionsCardUrlKey(ctx: ViewContext): string {
  const rule = ruleCard(ctx, "*content_options");
  if (rule !== undefined) return rule.name.urlKey;
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
 *  through icon_lookup to the "close" glyph - the capture pins both. */
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
    // Ruby: the view only exists on Abstract::List - the capture pins the
    // "view (list) not supported" UserError on the sibling types
    throw new UnsupportedViewError("list", ctx.fmt.card.name.s);
  }
  return listInputHtml(ctx);
};

// ---------------------------------------------------------------------------
// set/abstract/01_list/html_views.rb:32-34 view :input
// (+ set/type/nest_list.rb:26, set/type/link_list.rb:28 overrides; the
//  dispatch folds the three set-module formats into one typeCode switch)
// ---------------------------------------------------------------------------

/** hidden_content_field (card-mod-format set/all/content.rb:57-59:
 *  `hidden_field :content, class: "d0-card-content"`); the byte shape
 *  (form-control class merge, autocomplete="off", the attribute order,
 *  the raw multi-line value) is capture-pinned. */
function hiddenContentField(ctx: ViewContext): string {
  return (
    `<input class="d0-card-content form-control" autocomplete="off" type="hidden" ` +
    `value="${h(ctx.fmt.card.dbContent)}" name="card[content]" id="card_content" />`
  );
}

/** The Abstract::List editor dispatch (card-mod-edit set/all/editor.rb:50-52:
 *  `try(input_method(input_type)) || ... || send(input_method(
 *  default_input_type))` with Abstract::List's default_input_type :list,
 *  html_views.rb:40-42). input_type_from_rule (editor.rb:11-13) strips
 *  [ ] and underscores spaces. Only the radio + list editors are ported;
 *  any other rule value fails loudly (see header). */
function listFamilyInputHtml(ctx: ViewContext): string {
  const rule = ruleCard(ctx, "*input_type");
  const inputType =
    rule?.dbContent
      ?.replace(/[[\]]/g, "")
      .replace(/ /g, "_")
      .trim() ?? "";
  if (inputType === "radio") return radioInputHtml(ctx);
  if (inputType === "" || inputType === "list") return listInputHtml(ctx);
  throw new Error(
    `input editor "${inputType}" (the card's *input_type rule) is not ported ` +
      `- see src/card/mod-loader/mods/card-mod-list.ts header`,
  );
}

/** The radio editor (html_views.rb:68-70 + radio_input.haml). options_hash
 *  (card-mod-layout options_api.rb:3-17): the options card's item names
 *  PLUS the card's own selected items, uniq'd in order; radio_button_tag
 *  bytes are ActionView 7.2; input_name is "pointer_radio_button-#{card.key}"
 *  (radio_input.haml); option_label (options_api.rb:73-77) wraps the label
 *  as form-check-label; the label TEXT nests the option card at
 *  :smart_label when it exists (options_api.rb:79-83) - unported, so an
 *  existing option card fails loudly while a missing one renders the plain
 *  name (the captured surface). */
function radioInputHtml(ctx: ViewContext): string {
  const card = ctx.fmt.card;
  const optionsRule = ruleCard(ctx, "*content_options");
  if (optionsRule === undefined) {
    throw new Error(
      "radio input without a *content_options rule is not ported (the " +
        "options fallback walk needs the search surface)",
    );
  }
  const optionNames = filteredItems(
    rawItemStrings(optionsRule.dbContent),
    0,
    0,
  );
  for (const selected of itemNames(card, undefined)) {
    if (!optionNames.includes(selected)) optionNames.push(selected); // item.rb:10-14 union
  }
  const firstName = itemNames(card, undefined)[0];
  const inputName = `pointer_radio_button-${card.key}`;
  const rows = optionNames
    .map((option) => {
      const key = DeckoName.parse(option).key;
      const checked = option === firstName ? ` checked="checked"` : "";
      if (ctx.fmt.engine.fetchRenderCard(option) !== undefined) {
        throw new Error(
          `radio option labels for EXISTING cards nest :smart_label ` +
            `(card-mod-layout options_api.rb:79-83) - not ported (${option})`,
        );
      }
      return (
        `<li class='pointer-radio radio form-check'>\n` +
        `<input type="radio" name="${inputName}" id="pointer-radio-${key}" value="${h(option)}" ` +
        `class="pointer-radio-button form-check-input "${checked} />\n` +
        `<label class="form-check-label" for="pointer-radio-${key}">${h(option)}</label>\n` +
        `</li>\n`
      );
    })
    .join("");
  return `<ul class='pointer-radio-list'>\n${rows}</ul>\n`;
}

/** The nest list editor (set/type/nest_list.rb:42-48 + haml
 *  :nest_list_input + the _reference_list_input_row partial). items_for_input
 *  (:37-40): the nest chunks' raw names zipped with raw_options - the RAW
 *  "key:value" string between the pipes (card-mod-content
 *  lib/card/content/chunk/nest.rb:16-18, 108-109). The autocomplete field's
 *  data-options-card is `%i[all by_name].to_name` (card-mod-search
 *  set/all/autocomplete.rb:31-34) - the codename-resolved junction
 *  "*all+by name" in the capture; resolved through the prepared map with
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
          nameFieldClass:
            "pointer-item-text form-control _autocomplete _reference pointer-item-text form-control group-text-middle",
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
  const items = linkListItemsForInput(ctx.fmt.card.dbContent);
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
          nameFieldClass:
            "pointer-item-text form-control _autocomplete _reference pointer-item-text form-control group-text-middle",
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
function linkListItemsForInput(content: string): [string, string | undefined][] {
  const pairs: [string, string | undefined][] = [];
  for (const match of content.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const inner = match[1] ?? "";
    const pipe = inner.indexOf("|");
    if (pipe === -1) pairs.push([inner, inner]);
    else pairs.push([inner.slice(0, pipe), inner.slice(pipe + 1)]);
  }
  return pairs.length === 0 ? [["", ""]] : pairs;
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
 *  type's editor bytes, concatenated with no separator (capture-pinned). */
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
    throw baseViewNotPorted("input", ctx.fmt);
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
// prepareEngine - the boot-time rule warm (the Rule::Cache analog)
// ---------------------------------------------------------------------------

/** The *input_type + *content_options rule card ids PLUS every transitive
 *  side id needed to compose their junction names (the same recursive
 *  reached-CTE shape as the card-mod-help port's *help warm). */
function listRuleSidesStatement(setTypeId: number, settingTypeId: number): {
  sql: string;
  params: unknown[];
} {
  const ruleJoin =
    "FROM cards rules\n" +
    "  JOIN cards sets ON rules.left_id = sets.id\n" +
    "  JOIN cards settings ON rules.right_id = settings.id\n" +
    "WHERE sets.type_id = ? AND settings.type_id = ? " +
    "AND settings.codename IN ('input_type', 'content_options')\n" +
    "  AND rules.trash = 0 AND sets.trash = 0 AND settings.trash = 0";
  return {
    sql:
      "WITH RECURSIVE reached(id) AS (\n" +
      `  SELECT rules.id ${ruleJoin}\n` +
      "  UNION\n" +
      "  SELECT s.id FROM reached r\n" +
      "    JOIN cards j ON j.id = r.id AND j.trash = 0\n" +
      "    JOIN cards s ON s.id IN (j.left_id, j.right_id) AND s.id IS NOT NULL\n" +
      ")\n" +
      "SELECT c.* FROM cards c WHERE c.trash = 0 AND c.id IN (SELECT id FROM reached)",
    params: [setTypeId, settingTypeId],
  };
}

/** One batch, once per engine: every *input_type / *content_options rule
 *  card enters the prepared render-card map (multi-pass junction
 *  composition, sides first - the card-mod-help port's shape verbatim). */
async function prepareListRules(host: ModEngineHost): Promise<void> {
  await host.codenames.ensureLoaded(); // memoized; first call only
  const setTypeId = host.codenames.peekId("set");
  const settingTypeId = host.codenames.peekId("setting");
  if (setTypeId === undefined || settingTypeId === undefined) return; // degenerate deck
  const results = await host.batch([listRuleSidesStatement(setTypeId, settingTypeId)]);
  type FetchedRow = {
    id: number;
    leftId: number | null;
    rightId: number | null;
    name: string | null;
  };
  const rows = (results[0] as { rows: FetchedRow[] } | undefined)?.rows ?? [];
  if (rows.length === 0) return;

  interface PreparedRecord {
    id: number;
    leftId: number | null;
    rightId: number | null;
    name: string | null;
    record: NonNullable<Awaited<ReturnType<ModEngineHost["fetchById"]>>>;
  }
  const byId = new Map<number, PreparedRecord>();
  for (const row of rows) {
    const record = await host.fetchById(row.id);
    if (record === undefined) continue;
    byId.set(row.id, {
      id: row.id,
      leftId: record.leftId ?? null,
      rightId: record.rightId ?? null,
      name: record.name?.s ?? null,
      record,
    });
  }

  // multi-pass junction composition (sides before junctions)
  const names = new Map<number, string>();
  let pending = [...byId.values()];
  for (let pass = 0; pass < 64 && pending.length > 0; pass++) {
    const still: PreparedRecord[] = [];
    for (const row of pending) {
      let composed: string | undefined = row.name ?? undefined;
      if (composed === undefined && row.leftId !== null && row.rightId !== null) {
        const left = names.get(row.leftId);
        const right = names.get(row.rightId);
        if (left !== undefined && right !== undefined) composed = `${left}+${right}`;
      }
      if (composed === undefined) {
        still.push(row);
        continue;
      }
      names.set(row.id, composed);
    }
    if (still.length === pending.length) break; // unresolvable sides stay
    pending = still;
  }

  for (const row of byId.values()) {
    const composed = names.get(row.id);
    if (composed === undefined) continue;
    if (row.name === null) {
      row.record.name = DeckoName.parse(composed);
      row.record.key = DeckoName.parse(composed).key;
    }
    await host.cacheFetchedRecord(row.record);
  }
}

// ---------------------------------------------------------------------------
// event declarations - the set-module `event` DSL (lib/card/set/event.rb).
// Five events across set/abstract/01_list/events.rb (1, 8, 13, 29) and
// set/abstract/delist.rb:2. The ModEventStage union (mod-manifest.ts:
// 151-159) carries: prepare_to_validate / prepare_to_store / store /
// finalize / integrate / integrate_with_delay / extend / extend_with_delay.
// Ruby adds :initialize / :validate / :after_integrate (card-1.110.0
// lib/card/director/stages.rb:5-8) - those stages are NOT in the TS union
// and mod-manifest.ts is out of scope. Three events pin (the two
// :validate-stage events are recorded as blockers below).
//
// The event registry records declarations only; the action engine's stage
// seam (eventsForStage at src/card/mod-loader.ts:78) does not fire them in
// this port. The fn bodies are honest stubs: Env.params / add_item /
// drop_item / insert_item / item_cards / errors.add / referers / subcard
// have no TS surface.
// ---------------------------------------------------------------------------

/** Env.params lookup for the list event fns - Ruby's Env.params (card-core
 *  mod/core/env.rb) is request-time state; ModEngineHost (mod-manifest.ts:
 *  295-327) does not expose it. The port returns undefined for every key
 *  so the fns record their access without attempting write-path semantics
 *  (the write path is not ported). Exported as the host-side adapter the
 *  task asks for. */
export function listEventParams(
  host: ModEngineHost,
  key: string,
): string | string[] | undefined {
  // No port surface for request params; the stub below documents what each
  // Ruby body would have read. The host argument is reserved for a future
  // composition seam (e.g. an `eventParams()` host method).
  void host;
  void key;
  return undefined;
}

/** events.rb:1-6 add_and_drop_items (prepare_to_validate, on: save) - the
 *  Ruby body reads Env.params["add_item"|"drop_item"] and calls the card
 *  methods add_item / drop_item. The fn preserves the (card, host) shape
 *  the ModEventFn signature demands; the semantics need the write path. */
const addAndDropItems: ModEventFn = (_card, host) => {
  listEventParams(host, "add_item");
  listEventParams(host, "drop_item");
};

/** events.rb:8-11 insert_item_event (prepare_to_validate, on: save, when:
 *  :item_to_insert) - the Ruby body calls insert_item with item_to_insert
 *  (item_to_insert -> Env.params["insert_item"]). The `when` predicate
 *  resolves at the execution seam. */
const insertItemEvent: ModEventFn = (_card, host) => {
  listEventParams(host, "insert_item");
  listEventParams(host, "item_index");
};

/** delist.rb:2-9 delist (prepare_to_store, on: delete) - the Ruby body
 *  walks `referers`, gates on delistable? + Abstract::List + real?, and
 *  calls drop_item + subcard on each. The set membership + subcard
 *  machinery is not ported. */
const delistEvent: ModEventFn = (_card, _host) => {
  // see header: write path / set membership / subcard not ported
};

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

const cardModList: DeckoModManifest = {
  name: "list",
  gemName: "card-mod-list",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-list-0.20.0/set/abstract/01_list.rb
      // view :view_list (:39-44) is NOT ported - see the header (box/labeled
      // item views + relative timestamps). Item semantics
      // (item_references?, swap_names, standardize_content, count) are card
      // methods with no view surface; the collection item.rb machinery this
      // file builds on is ported in the helpers above.
      setPath: "abstract/01_list",
    },
    {
      // card-mod-list-0.20.0/set/abstract/01_list/events.rb - of the four
      // events in this file, two pin as declarations (events.rb:1
      // add_and_drop_items, events.rb:8 insert_item_event - both
      // :prepare_to_validate). The two :validate-stage events
      // (events.rb:13 validate_item_type, events.rb:29
      // validate_item_uniqueness) are BLOCKERS - the ModEventStage union
      // (mod-manifest.ts:151-159) lacks the :validate stage. The pinned
      // fns are stubs (write path not ported); the registry records the
      // name/stage/on/when verbatim.
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
              // the override (live registry probe: both true); the wrap's
              // text-muted div is emitted in the body
              config: { unknown: "mini_unknown" },
            },
            {
              view: "list",
              viewFn: listView,
              // source: view :list, cache: :never (html_views.rb:44). The
              // live-registry probe did not surface _view_list__cache;
              // the source is carried here.
              config: { cache: "never" },
            },
            {
              view: "input",
              viewFn: inputView,
              // the card-mod-edit editor settings persist through the
              // override (live registry probe: _view_input__unknown and
              // _view_input__cache both true; editor.rb:50)
              config: { unknown: true, cache: "never" },
            },
          ],
        },
      },
    },
    {
      // card-mod-list-0.20.0/set/abstract/01_list/other_views.rb - the
      // base-format :core + the csv/js/data/json/css/rss views; the engine
      // is html-only and the html :core stays in the render layer
      setPath: "abstract/01_list/other_views",
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
      // (the basket codes as pointer content); no card-method surface
      setPath: "self/input_type/right/content_options",
    },
    {
      // card-mod-list-0.20.0/set/type/link_list.rb - item/title methods +
      // the :input override (folded into the inputView dispatcher above;
      // the loader's flat view table cannot hold per-type :input overrides)
      setPath: "type/link_list",
    },
    {
      // card-mod-list-0.20.0/set/type/list.rb - include_set Abstract::List
      setPath: "type/list",
    },
    {
      // card-mod-list-0.20.0/set/type/nest_list.rb - item/option methods +
      // view :nest_list_input + the :input override (folded into the
      // inputView dispatcher)
      setPath: "type/nest_list",
      formats: {
        html: {
          views: [
            {
              view: "nest_list_input",
              viewFn: nestListInputView,
              config: { cache: "never" },
            },
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
