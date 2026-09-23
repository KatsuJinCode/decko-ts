// The card-mod-rules gem (card-mod-rules-0.20.0), ported through the mod
// loader - the mod that turns rule cards and set cards into a configurable
// surface: the rule bar family, the rule editor views, the set card's Rules
// section, the setting categories, and the cardtype groups.
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
// card-mod-rules-0.20.0/): 32 set rb files (24 set modules + 8 helper files
// counted by the compat report's inv.counts), 0 lib/, 4 haml templates,
// 1 event hook, no mod.yml. compat-report entry (tools/compat-report/
// mod-compat-report.json #card-mod-rules-0.20.0): htmlViewsDeclared 35,
// htmlViewsCovered 5 (bar, bar_bottom, bar_middle, bar_right + the set-card
// :core - all already live in the RENDER layer, src/card/render/views.ts
// coreView/setRulesCoreHtml + rule-bar-right.ts; the ask's placement rule
// forbids imitating that, so this mod does not re-register them).
//
// PORTED HERE (registered - none of these names is registered by the core
// HTML_VIEWS table or by another ported mod, so registration clobbers
// nothing; every viewFn carries the set guard Ruby's set-module inclusion
// gives it, and out-of-set renders raise the UnsupportedViewError that
// render.rb#view_method produces for a view the card's set does not
// define - the card-mod-permissions mod's established guard idiom):
// - set/type/set/html_views.rb:13-15 :set_label
// - set/type/set/html_views.rb:17-19 :input (the literal message)
// - set/self/cardtype.rb:2-9 :grouped_list (the GROUP constant walk;
//   custom_types ports Auth.createable_types as [] - the headless engine
//   has no auth surface, and the empty list makes the "Custom" group skip
//   exactly as Ruby's `next if type_list.empty?` does)
// - set/rule/editor.rb:24-28 :rule_help + set/type/setting.rb:59-61
//   :rule_help (one registered viewFn with Ruby's two-set dispatch:
//   Setting-type cards nest "*all"+<setting> and render ITS rule_help;
//   rule cards render the rule-instruction alert over the card-mod-help
//   rule_based_help chain, here reimplemented with citations because
//   card-mod-help.ts keeps those helpers module-private)
// - set/rule/board_rules_editor.rb:13-15 :overlay_title (edit_rule_title)
//
// PORTED HERE (exported functions, NOT registered - the registered-view
// table is global, one name one fn (docs/mod-loader-port-notes.md "View
// dispatch is global, not set-scoped"), and these are overrides of views
// the core table or another mod already registers; registering would
// replace them for EVERY card. The bodies + tests pin the bytes so the
// coordinator's set-scoped dispatch pass can register them verbatim - the
// card-mod-permissions mod's permissionCoreView precedent):
// - set/rule/html_views.rb:2-12 :core override (SearchTypeID rule cards
//   render raw; else super) -> ruleCoreView, taking the displaced base
//   :core as a parameter so a future registration cannot self-recurse
// - set/rule/bar_view.rb:15-22 :one_line_content -> ruleOneLineContentView
//   (the inner dispatch mirrors the render layer's rule-bar-right.ts, which
//   already composes these bytes for :bar_right)
// - set/rule/bar_view.rb:24-29 :raw_one_line_content ->
//   ruleRawOneLineContentView (the rule set's raw variant; no Right-pattern
//   module defines :raw_one_line_content, so the rule body always runs -
//   content.rb:43-45's truncate(strip_tags(render_raw), 60))
// - set/type/set/html_views.rb:21-23 :one_line_content ->
//   setOneLineContentView (the bare "")
// - set/type/setting.rb:63-65 :one_line_content is render_rule_help - the
//   exact bytes the registered rule_help viewFn's Setting branch produces,
//   so it is tested through that function (no separate export)
//
// NOT ported (honest remainder, one-word reasons):
// - :accordion_rule_list/:accordion_bar_list/:board_rules_tab/
//   :filtered_accordion_rule_list (set/type/set/html_views/*.rb):
//   bootstrap-helpers (accordion/accordion_item - card-mod-bootstrap's
//   set/all/bootstrap/accordion.rb is a passive set module in the TS port)
// - :bar_setting_list/:pill_setting_list/:modal_pill_setting_list/
//   :quick_edit_setting_list/:overlay_rule_list_link (rule_lists.rb):
//   bootstrap-helpers (list_tag/board_pills/board_link_opts) or, for the
//   quick_edit item view, item-views (the items themselves are unported)
// - :nest_rules/:modal_nest_rules (filtered_rule_lists.rb): item-views
//   (they render :quick_edit_setting_list) + bootstrap-modal
// - :help_text (board_rules_editor.rb:17-19): count-query (setting_link
//   reads card.rule_setting.count, a Card.search COUNT with no synchronous
//   engine surface); it is also a rule-set OVERRIDE of card-mod-help's
//   registered :help_text - cross-mod-dispatch
// - :rule_edit (editor.rb:17-22) / :modal_rule (board_rules_editor.rb:8-11)
//   / :overlay_rule (board_rules_editor.rb:2-6): bootstrap-modal /
//   bootstrap-overlay (the modal/overlay wrap machinery) + the unported
//   :rule_form beneath them
// - :rule_form/:rule_form_card_editor (rule_form.rb): form-machinery
//   (card_form/hidden_tags + the rule_form.haml template)
// - :quick_edit/:quick_edit_success (quick_editor.rb): form-haml
//   (card_form + quick_edit.haml/set_info.haml)
// - :rule_nest_editor_link/:rule_board_link (editor.rb:30-36):
//   bootstrap-helpers (board_link_opts) + registry-reach (the link text
//   reads the SETTING card's short_help_text, a code-registered mattr -
//   card-1.110.0 lib/card/setting.rb:41-69 - whose TS home is the loader's
//   SettingRegistry, unreachable from a viewFn)
// - :card_select (set_select.rb:20-23): form-helpers (form_tag/select_tag/
//   options_for_select + the path machinery card-mod-format left unported)
// - :template_link (template.rb:3-6): path-helpers (link_to_view's href
//   shape needs the unported path surface)
// - the event save_recently_edited_settings (set/rule/rules.rb:1-6):
//   events (the manifest models no event bus; the mod-loader-port-notes
//   "Events ... are not modeled" note)
// - the card-level method files (rules.rb's rule_set_name/rule_user/etc,
//   rstar/rule_user.rb, related_sets.rb, type/set.rb's anchor/prototype/
//   label machinery, setting_categories.rb's category walks, right/*.rb's
//   cql_content, type_plus_right/*.rb, virtual_set.rb, recent_settings.rb's
//   history?/followable?): methods (their rule-naming half already lives
//   engine-side in src/card/set-patterns/rule-names.ts - ruleSetCardName/
//   ruleSettingCardName cite rules.rb:12-18/36-38 - and the category
//   constants live in src/card/render/format.ts COMMON_SETTINGS/
//   FIELD_SETTINGS citing setting_categories.rb:6-7; the rest are
//   card-method surfaces with no TS consumer in the render path)
// - set/rule/rule_form/rule_set_radio.rb: no-set-module (the `#! no set
//   module` marker, set_template.rb:47-53 - a helper class, not a
//   registration; it is also form-machinery)
// - assets/script/rules.js.coffee + assets/style/rules.scss: assets (the
//   JS/SCSS pipeline is a separate surface)
// - config/locales/{en,de}.yml: locales (the rules_header string "Rules"
//   is pinned where the render layer's setRulesCoreHtml consumes it)
// - data/real.yml: deck-seed (seed content, not mod code)

import { UnsupportedViewError, type RenderCard, type ViewContext, type ViewFn } from "../../render/format.js";
import { processHelpContent } from "../../render/help-popover.js";
import { DeckoName } from "../../name.js";
import { PATTERN_TABLE } from "../../set-patterns/registry.js";
import { ruleNamesForCard } from "../../set-patterns/rule-names.js";
import type { PatternCardInput } from "../../set-patterns/types.js";
import type {
  DeckoModManifest,
  ModEngineHost,
  ModSetModuleFile,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// set guards (the set-module inclusion Ruby gives these views)
// ---------------------------------------------------------------------------

/** The Set-pattern applicability for the *type/set module (set/type/set.rb):
 *  the card's type is the Set cardtype. The enriched typeCode is the
 *  codename-registry read (RenderCard.typeCode; views.ts coreView uses the
 *  same `typeCode === "set"` test for the same set module). */
function isSetCard(ctx: ViewContext): boolean {
  return ctx.fmt.card.typeCode === "set";
}

/** The *rule pattern applicability (mod/core/set_pattern/06_rule.rb
 *  #pattern_applies?: card.rule? - lib/card/rule/all.rb:32-51, right part is
 *  a Setting and left part is a Set). The engine's cardIsRule is the ported
 *  predicate (render.ts:777; format.ts:396-401 consults it identically). */
function isRuleCard(ctx: ViewContext): boolean {
  return ctx.fmt.engine.cardIsRule?.(ctx.fmt.card) ?? false;
}

/** The guard every registered view runs first: out-of-set renders raise the
 *  unsupported-view error the way render.rb#view_method does for a view the
 *  card's set does not define. */
function assertSetCard(ctx: ViewContext, view: string): void {
  if (!isSetCard(ctx)) {
    throw new UnsupportedViewError(view, ctx.fmt.card.name.s);
  }
}

function assertRuleCard(ctx: ViewContext, view: string): void {
  if (!isRuleCard(ctx)) {
    throw new UnsupportedViewError(view, ctx.fmt.card.name.s);
  }
}

// ---------------------------------------------------------------------------
// set/type/set/html_views.rb - the set-card views
// ---------------------------------------------------------------------------

/** set/type/set/html_views.rb:13-15 view :set_label:
 *  `wrap_with :strong, card.label, class: "set-label"`. card.label
 *  (set/type/set.rb:38-41) is subclass_for_set.label(anchor_name): the
 *  concrete pattern whose code is the set card's tag codename, labeled with
 *  the set card's left name. wrap_with passes content through the
 *  content_tag BLOCK (card-mod-format set/all/html/wrap.rb:128-136 ->
 *  content_within_wrap), which does not HTML-escape - the label's quotes
 *  (`All "RichText" cards`) emit verbatim. */
const setLabelView: ViewFn = (ctx) => {
  assertSetCard(ctx, "set_label");
  return `<strong class="set-label">${setCardLabel(ctx)}</strong>`;
};

/** set/type/set.rb:38-41 label + :29-32 subclass_for_set (the concrete
 *  pattern whose pattern_code is the set card's tag codename; the tag card's
 *  codename is the bare pattern code, data/real.yml:1-7 convention). */
function setCardLabel(ctx: ViewContext): string {
  const card = ctx.fmt.card;
  const tagKey = card.name.tagName?.key;
  const tagCard =
    tagKey !== undefined ? ctx.fmt.engine.fetchRenderCard(tagKey) : undefined;
  const patternCode = tagCard?.record.codename;
  const spec =
    patternCode !== undefined
      ? PATTERN_TABLE.find((candidate) => candidate.code === patternCode)
      : undefined;
  const anchor = card.name.leftName?.s;
  return spec?.label(anchor) ?? "";
}

/** set/type/set/html_views.rb:17-19 view :input:
 *  `"Cannot currently edit Sets"` (LOCALIZE) - the literal message. */
const inputView: ViewFn = (ctx) => {
  assertSetCard(ctx, "input");
  return "Cannot currently edit Sets";
};

/** set/type/set/html_views.rb:21-23 view :one_line_content, wrap: {}:
 *  the bare empty string. `wrap: {}` is an EMPTY wrap hash - no wrapper
 *  applies (voo_api.rb:167-177 iterates the wrap list; {} contributes
 *  none), so the view returns "" unwrapped. EXPORTED, not registered: the
 *  name :one_line_content is registered by card-mod-content (its
 *  right/default + right/structure bodies) and the render layer composes
 *  the rule-card variant; a third global registration would clobber both. */
export function setOneLineContentView(ctx: ViewContext): string {
  assertSetCard(ctx, "one_line_content");
  return "";
}

// ---------------------------------------------------------------------------
// set/self/cardtype.rb - the cardtype card's grouped type list
// ---------------------------------------------------------------------------

/** set/all/cardtype_groups.rb:2-12 GROUP (frozen constant). */
const CARDTYPE_GROUPS: Readonly<Record<string, readonly string[]>> = {
  Text: ["RichText", "PlainText", "Markdown", "Phrase", "HTML"],
  Data: ["Number", "Toggle", "Date", "URI"],
  Upload: ["File", "Image"],
  Custom: [],
  Organize: ["List", "Pointer", "Search", "Link list", "Nest list"],
  Template: ["Notification template", "Email template", "Twitter template"],
  Admin: ["Cardtype", "User", "Role", "Sign up", "Session", "Set", "Setting"],
  Styling: ["Layout", "Skin", "Bootswatch skin", "CSS", "SCSS"],
  Scripting: ["JSON", "JavaScript", "CoffeeScript"],
};

/** set/all/cardtype_groups.rb:23-31 custom_types:
 *  `Auth.createable_types` minus the types GROUP_MAP already classifies.
 *  The headless engine has no Auth surface (no session, no roles); the
 *  ported createable list is therefore the empty list, which makes the
 *  "Custom" group skip exactly as Ruby's `next if type_list.empty?` does
 *  for the frozen empty array (cardtype_groups.rb:6). */
function customTypes(): readonly string[] {
  return [];
}

/** set/self/cardtype.rb:2-9 view :grouped_list:
 *  `GROUP.keys.map { |group| type_list = ...; next if type_list.empty?;
 *  [wrap_with(:h5, group), wrap_with(:p, listing_list(type_list))] }
 *  .flatten.join "\n"`.
 *  listing_list (card-mod-collection set/all/item.rb:164-176 - the helper
 *  set module the cardtype card's format includes in Ruby) nests each item
 *  with the default nest view (:titled - format/nesting.rb#implicit_nest_view
 *  -> default_html_view) and joins with "\n" (content.rb#output:
 *  Array.wrap(content).flatten.compact.join "\n"); wrap_item is the no-wrap
 *  base. A missing type card nests as an unknown card whose :titled
 *  substitutes to :unknown ("" - format/error.rb:23, the view is not in
 *  any unknown view config). */
const groupedListView: ViewFn = (ctx) => {
  // Self::Cardtype applicability: the card NAMED "cardtype" (the Self
  // pattern's anchor is the card's own name - set_pattern/09_self.rb).
  if (ctx.fmt.card.name.key !== "cardtype") {
    throw new UnsupportedViewError("grouped_list", ctx.fmt.card.name.s);
  }
  const sections: string[] = [];
  for (const [group, types] of Object.entries(CARDTYPE_GROUPS)) {
    const typeList = group === "Custom" ? customTypes() : types;
    if (typeList.length === 0) continue; // cardtype.rb:5 next if type_list.empty?
    const listing = typeList.map((typeName) => listingItem(ctx, typeName));
    sections.push(`<h5>${group}</h5>`);
    sections.push(`<p>${listing.join("\n")}</p>`);
  }
  return sections.join("\n");
};

/** card-mod-collection set/all/item.rb:164-176 listing_list/listing/
 *  wrap_item: one nested item, default view, no wrap. A fetch miss is the
 *  unknown-card nest ("" via the :unknown substitution). */
function listingItem(ctx: ViewContext, typeName: string): string {
  const target = ctx.fmt.engine.fetchRenderCard(typeName);
  if (target === undefined) return "";
  return ctx.fmt.nestRecord(target, "titled");
}

// ---------------------------------------------------------------------------
// set/rule/editor.rb + set/type/setting.rb - the rule_help dispatch
// ---------------------------------------------------------------------------

/** set/rule/editor.rb:24-28 view :rule_help, unknown: true, perms: :none,
 *  cache: :never (rule set) + set/type/setting.rb:59-61 view :rule_help
 *  (Setting-type set). One registered viewFn carrying Ruby's two-set
 *  dispatch, in the Rule set's precedence: rule cards (right = setting,
 *  left = set - rule cards are themselves Setting-TYPED, and Ruby's *rule
 *  pattern outranks *type in the concrete lookup order, mod/core/
 *  set_pattern/06_rule.rb vs 03_type.rb) render the rule-instruction alert
 *  over the card-mod-help rule_based_help chain; other Setting-type cards
 *  nest "*all"+<setting> and render THAT rule card's :rule_help (the "*all
 *  +<setting>" rule is the broadest rule for the setting - setting.rb:57-58's
 *  comment: the +*help content renders in template mode when rendered
 *  directly, so the help text renders in the context of the *all rule
 *  card). */
const ruleHelpView: ViewFn = (ctx) => {
  const card = ctx.fmt.card;
  if (isRuleCard(ctx)) {
    return ruleHelpAlert(ctx); // editor.rb:24-28 (the rule set)
  }
  if (card.typeCode === "setting") {
    // type/setting.rb:60 nest [:all, card.name], view: :rule_help.
    // The nest target name is "*all" + "+" + the setting card's name
    // (e.g. "*all+*create"). A fetch miss is an unknown-card nest: the
    // nested :rule_help is not in the unknown-view configs, so
    // view_for_unknown substitutes :unknown ("" - format/error.rb:23).
    const ruleCard = ctx.fmt.engine.fetchRenderCard(`*all+${card.name.s}`);
    if (ruleCard === undefined) return "";
    return ctx.fmt.nestRecord(ruleCard, "rule_help");
  }
  throw new UnsupportedViewError("rule_help", card.name.s);
};

/** set/rule/editor.rb:24-28:
 *  `wrap_with :div, class: "alert alert-info rule-instruction" do
 *  rule_based_help end`. */
function ruleHelpAlert(ctx: ViewContext): string {
  const help = ruleBasedHelp(ctx);
  return `<div class="alert alert-info rule-instruction">${help}</div>`;
}

// the rule_based_help chain - card-mod-help set/all/help.rb:32-48 and its
// helpers, reimplemented here because card-mod-help.ts keeps them
// module-private. Same citations as the help mod's port.

/** help.rb:36-38 raw_help_text: `card.try(:raw_help_text) ||
 *  card.help_rule_card&.content`. The static setting-level defs the first
 *  operand serves live on the settings' Self/Right sets (the other mods'
 *  setting_opts mattrs); rule cards take the rule card's content. */
function ruleHelpRaw(ctx: ViewContext): string | undefined {
  const ruleCard = helpRuleCard(ctx);
  return ruleCard === undefined ? undefined : ruleCard.dbContent;
}

/** help.rb:40-48 rule_based_help: process_content(raw,
 *  chunk_list: :references) - the shared help-popover chunk walk. */
function ruleBasedHelp(ctx: ViewContext): string {
  const raw = ruleHelpRaw(ctx);
  if (raw === undefined) return "";
  return processHelpContent(ctx.fmt, raw);
}

/** help.rb:1-4 help_rule_card: `rule_card(:help)` gated by ok?(:read).
 *  rule_card walks the card's set names in pattern precedence joined to
 *  "*help" (lib/card/rule/all.rb:9-15); candidates resolve against the
 *  engine's prepared render-card map (prepareRuleCache warms every rule
 *  card - the Rule::Cache analog, lib/card/rule/cache.rb:10-27), so a map
 *  miss = the rule card does not exist. */
function helpRuleCard(ctx: ViewContext): RenderCard | undefined {
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
  for (const candidate of ruleNamesForCard(input, "*help")) {
    const record = ctx.fmt.engine.fetchRenderCard(candidate);
    if (record === undefined) continue; // candidate rule does not exist
    if (ctx.fmt.engine.isDenied(record)) continue; // ok?(:read) false
    return record;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// set/rule/board_rules_editor.rb - the overlay title
// ---------------------------------------------------------------------------

/** set/rule/board_rules_editor.rb:13-15 view :overlay_title: the
 *  edit_rule_title body (set/rule/editor.rb:64-69):
 *  `output [wrap_with(:h5, setting_title, class: "title fw-bold")]` -
 *  output of a single element (content.rb:70-72 Array.wrap...join "\n") is
 *  the element itself. */
const overlayTitleView: ViewFn = (ctx) => {
  assertRuleCard(ctx, "overlay_title");
  return editRuleTitle(ctx);
};

/** set/rule/editor.rb:64-69 edit_rule_title. */
function editRuleTitle(ctx: ViewContext): string {
  return `<h5 class="title fw-bold">${settingTitle(ctx)}</h5>`;
}

/** set/rule/editor.rb:85-87 setting_title: `card.name.tag.tr "*", ""` -
 *  the rule card's tag name with stars stripped ("*all+*create" ->
 *  "create"). */
function settingTitle(ctx: ViewContext): string {
  const tag = ctx.fmt.card.name.tagName?.s ?? ctx.fmt.card.name.s;
  return tag.replaceAll("*", "");
}

// ---------------------------------------------------------------------------
// set/rule/html_views.rb - the rule-set :core override (EXPORTED)
// ---------------------------------------------------------------------------

/** set/rule/html_views.rb:2-12 view :core:
 *  `if card.type_id == SearchTypeID then render_raw else super() end` -
 *  search rule cards' queries reference _left, which is meaningless in the
 *  rule card's own context, so the query SYNTAX renders instead of the
 *  search results. EXPORTED, not registered: :core is the engine's
 *  highest-traffic view and the base registration belongs to the render
 *  layer; a global re-registration would replace it for EVERY card (the
 *  card-mod-permissions permissionCoreView precedent). `baseCore` is the
 *  displaced base view Ruby's super() dispatches to - a parameter here so
 *  a future set-scoped registration can never recurse into itself. */
export function ruleCoreView(ctx: ViewContext, baseCore: ViewFn): string {
  assertRuleCard(ctx, "core");
  // The SearchTypeID test: same read the render layer's before(:bar) hook
  // uses (format.ts:377 - codename "search_type", typeName fallback).
  const typeCode = ctx.fmt.card.typeCode;
  if (typeCode === "search_type" || ctx.fmt.card.typeName === "Search") {
    return ctx.fmt.renderRaw();
  }
  return baseCore(ctx);
}

// ---------------------------------------------------------------------------
// set/rule/bar_view.rb - the rule one_line_content (EXPORTED)
// ---------------------------------------------------------------------------

/** set/rule/bar_view.rb:15-22 view :one_line_content,
 *  wrap: { div: { class: "text-muted one-line" } }, unknown: true:
 *  `return render_mini_unknown unless existing_rule_card;
 *  with_nest_mode(:compact) { one_line_content }`.
 *  existing_rule_card (editor.rb:5-7 -> find_existing_rule_card:119-121) is
 *  the card ITSELF for persisted cards; the prototype walk for new cards is
 *  engine state the headless port does not model, so an id-less rule card
 *  takes the render_mini_unknown branch (:mini_unknown,
 *  card-mod-format set/all/html/error.rb:15-17 - the createable gate yields
 *  "" when create is unavailable, the headless engine's only reachable
 *  branch for an unmodeled prototype). The wrap config's div emits around
 *  the body. EXPORTED, not registered: the render layer already composes
 *  these bytes for :bar_right (rule-bar-right.ts) and card-mod-content
 *  registers the name for its right/* sets. */
export function ruleOneLineContentView(ctx: ViewContext): string {
  assertRuleCard(ctx, "one_line_content");
  if (ctx.fmt.card.id === undefined) {
    return ""; // render_mini_unknown (bar_view.rb:17; error.rb:15-17)
  }
  const rightSetting = ctx.fmt.card.name.rightName?.s;
  return `<div class="text-muted one-line">${ruleOneLineInner(ctx, rightSetting)}</div>`;
}

/** The body dispatch. Ruby resolves the view BODY and each view SETTING
 *  independently through the format's set-module chain: view bodies are
 *  defined as `_view_<name>` methods (card-1.110.0 set/format.rb:172-174
 *  view_method_name; view_definition.rb:17-20 define_method) and settings
 *  as `<view>_<setting>` methods (view_opts.rb:59-64), so the most-derived
 *  module defining EACH piece wins (set-module inclusion order: broadest
 *  pattern first, format.rb:62-67 include_set_format_modules + pattern/
 *  all.rb:44-53 - Right-pattern modules include after the Rule pattern's,
 *  card-1.110.0 mod/core/set_pattern registry inserts at index 0, class_
 *  methods.rb:13-18). For the one_line_content name:
 *  - right::*default: card-mod-content set/right/default.rb:4-7 body
 *    `"#{card.type_name} : #{raw.present? ? raw : '<em>empty</em>'}"` (the
 *    wrap div still comes from bar_view.rb:16 - Right::Default defines no
 *    wrap setting, so the chain's next definition supplies it);
 *  - right::*structure: set/right/structure.rb:14-16 body
 *    `"#{_render_type} : #{_render_raw}"`;
 *  - every other rule card: Rule::BarView's own body runs
 *    `with_nest_mode(:compact) { one_line_content }` (bar_view.rb:19-21) -
 *    the BARE method call, which skips the `_view_` chain and resolves to
 *    the only plain `def one_line_content` on the chain, card-mod-format
 *    set/all/content.rb:47-49: `truncate strip_tags(render_core),
 *    length: one_line_character_limit` - ONE_LINE_CHARACTER_LIMIT = 60
 *    (content.rb:1), one_line_character_limit = `voo.size || 60`
 *    (content.rb:51-53; no size option reaches the view here). compact
 *    nest mode is identity for the plain-text content every pinned case
 *    carries (rule-bar-right.ts:21-25). */
function ruleOneLineInner(ctx: ViewContext, rightSetting: string | undefined): string {
  const card = ctx.fmt.card;
  if (rightSetting === "*default") {
    const raw = card.dbContent;
    // right/default.rb:5 raw.present? - Rails blank? semantics: "" or
    // whitespace-only renders the <em>empty</em> marker.
    return `${card.typeName ?? ""} : ${raw.trim() === "" ? "<em>empty</em>" : raw}`;
  }
  if (rightSetting === "*structure") {
    return `${card.typeName ?? ""} : ${card.dbContent}`;
  }
  return truncatedToRuleOneLineLimit(card.dbContent);
}

/** content.rb:47-49 / content.rb:43-45: `truncate strip_tags(<content>),
 *  length: 60` - Rails String#truncate with the "..." omission, only when
 *  longer (activesupport String#truncate). strip_tags is identity for the
 *  plain-text rule content the engine carries. */
function truncatedToRuleOneLineLimit(content: string): string {
  return content.length > 60 ? `${content.slice(0, 60)}...` : content;
}

/** set/rule/bar_view.rb:24-29 view :raw_one_line_content,
 *  wrap: { div: { class: "text-muted one-line" } }, unknown: true:
 *  `return render_mini_unknown unless existing_rule_card;
 *  raw_one_line_content`. Same guard and wrap as :one_line_content, but
 *  the bare `raw_one_line_content` call resolves to card-mod-format
 *  set/all/content.rb:43-45: `truncate strip_tags(render_raw),
 *  length: one_line_character_limit` (60, content.rb:1) - and NO
 *  Right-pattern module defines :raw_one_line_content (grep over the gem
 *  tree: only format content.rb:18-20/43-45, html/views.rb:24-27 and this
 *  file), so the rule body runs for EVERY rule card - no right-part
 *  dispatch. EXPORTED, not registered, for the same global-table reason as
 *  ruleOneLineContentView (the render layer owns the name's base
 *  registration, format.ts:726's unknown-view config cites
 *  html/views.rb:24). */
export function ruleRawOneLineContentView(ctx: ViewContext): string {
  assertRuleCard(ctx, "raw_one_line_content");
  if (ctx.fmt.card.id === undefined) {
    return ""; // render_mini_unknown (bar_view.rb:26; error.rb:15-17)
  }
  return `<div class="text-muted one-line">${truncatedToRuleOneLineLimit(ctx.fmt.card.dbContent)}</div>`;
}

// ---------------------------------------------------------------------------
// prepareRuleCache - the boot-time Rule::Cache warm
// ---------------------------------------------------------------------------

/** The rule card ids PLUS every transitive side id needed to compose their
 *  junction names: the rule-cache join (lib/card/rule/cache.rb:10-27) over
 *  ALL settings (set-typed lefts joined to setting-typed rights), with the
 *  recursive side walk of the prefetch's reached-CTE shape. Unlike
 *  card-mod-help's warm (settings.codename = 'help'), this warms EVERY rule
 *  card, because this mod's views resolve *help rule cards AND the
 *  "*all+<setting>" rule cards the Setting branch nests. */
function ruleSidesStatement(setTypeId: number, settingTypeId: number): {
  sql: string;
  params: unknown[];
} {
  const ruleJoin =
    "FROM cards rules\n" +
    "  JOIN cards sets ON rules.left_id = sets.id\n" +
    "  JOIN cards settings ON rules.right_id = settings.id\n" +
    "WHERE sets.type_id = ? AND settings.type_id = ?\n" +
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

/** One batch, once per engine: every rule card enters the prepared
 *  render-card map (composition shape identical to card-mod-help.ts's
 *  prepareHelpRules - sides fetched by id, junction names composed
 *  multi-pass, records cached through the host). After this the :rule_help
 *  dispatch resolves its nested cards synchronously - zero queries on the
 *  render path. */
async function prepareRuleCache(host: ModEngineHost): Promise<void> {
  await host.codenames.ensureLoaded(); // memoized; first call only
  const setTypeId = host.codenames.peekId("set");
  const settingTypeId = host.codenames.peekId("setting");
  if (setTypeId === undefined || settingTypeId === undefined) return; // degenerate deck
  const results = await host.batch([ruleSidesStatement(setTypeId, settingTypeId)]);
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

  // Assign the composed name onto junction records and cache them (the
  // fetch ladder's assign_name semantics - a record reached by id carries
  // no name mark, so the composed name is assigned here).
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
// the manifest (one entry per gem set file; setPaths as in the gem tree;
// set/rule/rule_form/rule_set_radio.rb is `#! no set module` and gets none)
// ---------------------------------------------------------------------------

const setModules: ModSetModuleFile[] = [
  // pattern: abstract
  {
    // set/abstract/virtual_set.rb:1-3 - def virtual?; new?; end (a card
    // method the right/* set modules include; no registrations).
    setPath: "abstract/virtual_set",
  },
  // pattern: all
  {
    // set/all/cardtype_groups.rb:2-31 - the GROUP constant + GROUP_MAP +
    // format :html custom_types. The constants live in this file's
    // CARDTYPE_GROUPS/customTypes (consumed by the Self::Cardtype
    // :grouped_list view below - Ruby's Self::Cardtype reads them through
    // module scope, All::CardtypeGroups::GROUP).
    setPath: "all/cardtype_groups",
  },
  {
    // set/all/related_sets.rb:1-8 - related_sets (card method; not ported:
    // methods - Card.fetch walk with no TS consumer in the render path).
    setPath: "all/related_sets",
  },
  {
    // set/all/set_select.rb:20-46 format :html (view :card_select +
    // set_select/card_select/set_select_tag/set_alert) + :49-57 card-level
    // set_list. Not ported: form-helpers (the :card_select view is on the
    // compat report's missing list).
    setPath: "all/set_select",
  },
  // pattern: right (the virtual-set modules - include_set
  // Abstract::VirtualSet + assign_type :set + cql_content)
  {
    // set/right/right.rb:1-7 - cql_content { right: "_left" }.
    setPath: "right/right",
  },
  {
    // set/right/self.rb:1-11 - cql_content { name: "_left" } +
    // prototype_default_card.
    setPath: "right/self",
  },
  {
    // set/right/type.rb:1-7 - cql_content { type: "_left" }.
    setPath: "right/type",
  },
  {
    // set/right/type_plus_right.rb:1-11 - cql_content + related_sets
    // override.
    setPath: "right/type_plus_right",
  },
  // pattern: rstar
  {
    // set/rstar/rule_user.rb:1-7 - rule_user_name/rule_user (preference
    // cards' user part; the naming half lives in rule-names.ts, which
    // cites rules.rb).
    setPath: "rstar/rule_user",
  },
  // pattern: rule
  {
    // set/rule/rules.rb:1-109 - the save_recently_edited_settings event
    // (not ported: events - no event bus) + the rule card's decomposition
    // methods (rule_set_name:12-18, rule_setting_name:36-38, rule_user_
    // setting_name:48-54, set_options:57-63, set_prototype:73-79, ...).
    // The naming half already lives engine-side:
    // src/card/set-patterns/rule-names.ts ruleSetCardName (rules.rb:12-18)
    // and ruleSettingCardName (rules.rb:36-38).
    setPath: "rule/rules",
  },
  {
    // set/rule/html_views.rb:2-12 - the rule-set :core override
    // (SearchTypeID -> render_raw, else super). Ported as the EXPORTED
    // ruleCoreView (NOT registered - :core is the render layer's global
    // registration; see the function's citation).
    setPath: "rule/html_views",
  },
  {
    // set/rule/bar_view.rb:2-53 - mini_bar_cols/bar_cols (bar-and-box
    // render-layer surface), views :bar/:one_line_content/
    // :raw_one_line_content/:bar_bottom/:bar_middle/:bar_right. The bar
    // family is ALREADY COVERED by the render layer (views.ts itemBarView +
    // barRightView -> rule-bar-right.ts, and format.ts:366-382's before(:bar)
    // class_up citing bar_view.rb:10) - the compat report counts bar,
    // bar_bottom, bar_middle, bar_right as covered. :one_line_content is
    // the EXPORTED ruleOneLineContentView. :raw_one_line_content (24-29)
    // is the EXPORTED ruleRawOneLineContentView.
    setPath: "rule/bar_view",
  },
  {
    // set/rule/board_rules_editor.rb:2-27 - views :overlay_rule (not
    // ported: bootstrap-overlay), :modal_rule (bootstrap-modal),
    // :overlay_title (PORTED - registered below), :help_text (not ported:
    // count-query + cross-mod-dispatch).
    setPath: "rule/board_rules_editor",
    formats: {
      html: {
        views: [{ view: "overlay_title", viewFn: overlayTitleView }],
      },
    },
  },
  {
    // set/rule/editor.rb:1-130 - card-level left_type_for_nest_editor_set_
    // selection (template machinery) + find_existing_rule_card:119-130
    // (the rule-resolution walk rule-bar-right.ts cites) + format :html:
    // :rule_edit (not ported: bootstrap-modal), :rule_help (PORTED -
    // registered below; the Setting-type half of the dispatch carries
    // set/type/setting.rb:59-61's body), :rule_nest_editor_link/
    // :rule_board_link (not ported: bootstrap-helpers + registry-reach),
    // pill_rule_link/category_classes/edit_rule_title/current_rule/
    // setting_title/short_help_text/rules_type_formgroup (methods feeding
    // the unported views).
    setPath: "rule/editor",
    formats: {
      html: {
        views: [{ view: "rule_help", viewFn: ruleHelpView, config: { unknown: true, perms: "none", cache: "never" } }],
      },
    },
  },
  {
    // set/rule/quick_editor.rb:2-38 - views :quick_edit/:quick_edit_success
    // (not ported: form-haml) + quick_form/set_info/undo_button (form
    // machinery; the haml templates quick_edit.haml/set_info.haml are the
    // byte sources).
    setPath: "rule/quick_editor",
  },
  {
    // set/rule/rule_form.rb:2-71 - views :rule_form/:rule_form_card_editor
    // (not ported: form-machinery) + the rule-form composition methods.
    setPath: "rule/rule_form",
  },
  {
    // set/rule/rule_form/buttons.rb:2-44 - edit_rule_buttons/cancel/
    // delete/submit button builders (not ported: form-machinery).
    setPath: "rule/rule_form/buttons",
  },
  {
    // set/rule/rule_form/set_selection.rb:2-21 - board_rule_set_selection/
    // rule_set_options (not ported: form-machinery + the RuleSetRadio
    // helper class from the no-set-module file rule_set_radio.rb).
    setPath: "rule/rule_form/set_selection",
  },
  // pattern: self
  {
    // set/self/cardtype.rb:2-9 - view :grouped_list (PORTED - registered
    // below; reads the all/cardtype_groups constants).
    setPath: "self/cardtype",
    formats: {
      html: {
        views: [{ view: "grouped_list", viewFn: groupedListView }],
      },
    },
  },
  {
    // set/self/recent_settings.rb:1-9 - include_set Abstract::List +
    // history?/followable? false (not ported: methods - predicates with no
    // TS consumer).
    setPath: "self/recent_settings",
  },
  // pattern: type
  {
    // set/type/cardtype.rb:1-5 - related_sets override (not ported:
    // methods).
    setPath: "type/cardtype",
  },
  {
    // set/type/set.rb:1-113 - include_set Type::SearchType + the set
    // card's anchor/pattern/label/prototype machinery (label:38-41 IS
    // ported - setCardLabel above cites it; inheritable?/broader_sets/
    // visible_settings/setting_codenames_by_group/related_sets/
    // label_and_url_key are not: methods).
    setPath: "type/set",
  },
  {
    // set/type/set/html_views.rb:2-23 - before :open (:2-4 - the render
    // layer's before-hook seam is format.ts runBeforeHook, which ports no
    // set :open hook), :core (ALREADY COVERED - views.ts setRulesCoreHtml
    // pins the exact bytes), :set_label (PORTED), :input (PORTED),
    // :one_line_content (EXPORTED setOneLineContentView).
    setPath: "type/set/html_views",
    formats: {
      html: {
        views: [
          { view: "set_label", viewFn: setLabelView },
          { view: "input", viewFn: inputView },
        ],
      },
    },
  },
  {
    // set/type/set/html_views/filtered_rule_lists.rb:2-22 - views
    // :nest_rules/:modal_nest_rules/:board_rules_tab/
    // :filtered_accordion_rule_list (not ported: bootstrap-helpers /
    // item-views) + filtered_rule_list/setting_filter/filter_buttons/
    // filter_radio (the filter form whose bytes the render layer's
    // setRulesCoreHtml already emits).
    setPath: "type/set/html_views/filtered_rule_lists",
  },
  {
    // set/type/set/html_views/rule_lists.rb:2-101 - the setting-list
    // family (:quick_edit_setting_list/:bar_setting_list/:pill_setting_
    // list/:modal_pill_setting_list/:accordion_rule_list/
    // :accordion_bar_list/:overlay_rule_list_link + category_accordion/
    // setting_list_item helpers) - not ported: bootstrap-helpers (and the
    // quick_edit item view beneath them).
    setPath: "type/set/html_views/rule_lists",
  },
  {
    // set/type/set/html_views/setting_filter.rb:2-39 - filtered_rule_list/
    // setting_filter/filter_buttons/filter_radio (the bytes live in the
    // render layer's setRulesCoreHtml port).
    setPath: "type/set/html_views/setting_filter",
  },
  {
    // set/type/set/html_views/template.rb:2-11 - view :template_link
    // (not ported: path-helpers).
    setPath: "type/set/html_views/template",
  },
  {
    // set/type/set/setting_categories.rb:1-67 - SETTING_OPTIONS/
    // COMMON_SETTINGS/FIELD_SETTINGS constants + categories/
    // category_settings/group_settings/recent_settings walks. The two
    // frozen category sets live engine-side (format.ts COMMON_SETTINGS/
    // FIELD_SETTINGS, citing this file:6-7; the before(:bar) class_up
    // consumes them); the rest: methods.
    setPath: "type/set/setting_categories",
  },
  {
    // set/type/setting.rb:1-71 - basket[:non_createable_types] (no TS
    // basket), format :data :core + count/set_classes_with_rules/
    // scoping_rule_card/rules_for_set_class (CQL searches - no synchronous
    // engine surface), format :html :core (the "All X rules that apply to"
    // listing - not ported: engine-search), :rule_help (carried by the
    // registered ruleHelpView's Setting branch), :one_line_content
    // (render_rule_help - the same dispatch's bytes, tested through the
    // registered view), format :json items_for_export (no json format).
    setPath: "type/setting",
  },
  // pattern: type_plus_right
  {
    // set/type_plus_right/set/setting.rb:1-8 - assign_type :list +
    // item_cards/rule_item_card (list semantics; no TS consumer).
    setPath: "type_plus_right/set/setting",
  },
  {
    // set/type_plus_right/set/structure.rb:1-9 - nest_snippet override
    // (the nest-editor's snippet machinery; not ported: methods).
    setPath: "type_plus_right/set/structure",
  },
];

const cardModRules: DeckoModManifest = {
  name: "rules",
  gemName: "card-mod-rules",
  group: "gem",
  setModules,
  prepareEngine: prepareRuleCache,
};

export default cardModRules;
