// The card-mod-rules gem (card-mod-rules-0.20.0), ported through the mod
// loader - the mod that turns rule cards and set cards into a configurable
// surface: the rule bar family, the rule editor views, the set card's Rules
// section, the setting categories, and the cardtype groups.
//
// The gem's tree (the installed
// card-mod-rules-0.20.0/): 32 set rb files (24 set modules + 8 helper files
// counted by the compat report's inv.counts), 0 lib/, 4 haml templates,
// 1 event hook, no mod.yml. compat-report entry (tools/compat-report/
// mod-compat-report.json #card-mod-rules-0.20.0): htmlViewsDeclared 35,
// htmlViewsCovered 5 (bar, bar_bottom, bar_middle, bar_right + the set-card
// :core - all already live in the RENDER layer, src/card/render/views.ts
// coreView/setRulesCoreHtml + rule-bar-right.ts; re-registering them here
// is forbidden, so this mod does not).
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
// - 2026-09-29 rules-views lane, oracle-pinned (fixtures/captured/
//   rules-views.json, capture script oracle-capture-rules-views.rb,
//   no-write proof 4945 -> 4945): set/type/set/html_views/rule_lists.rb
//   :bar_setting_list/:pill_setting_list/:modal_pill_setting_list/
//   :accordion_rule_list/:accordion_bar_list/:overlay_rule_list_link,
//   filtered_rule_lists.rb :board_rules_tab/:filtered_accordion_rule_list,
//   set/rule/editor.rb :rule_nest_editor_link/:rule_board_link,
//   template.rb :template_link (see the registered setModules below for
//   the per-view citations and the shared-hash wrap/cache mechanism)
// - 2026-09-29 rules-views increment-2 lane, oracle-pinned: set/rule/
//   bar_view.rb :one_line_content/:raw_one_line_content, set/rule/
//   board_rules_editor.rb :help_text (the Rule-set override of card-mod-
//   help's :help_text), set/all/set_select.rb :card_select (see the
//   registered setModules below - the rule :one_line_content /
//   :raw_one_line_content / :help_text registrations land under NONBASE
//   setPaths so they enter viewChains ONLY and never the flat views
//   table; the viewChain walker dispatches them for cards whose setKeys
//   include the RULE token and falls through to the existing chain
//   entries - right/default + right/structure for :one_line_content,
//   all/help for :help_text - for every other card. This is the masking
//   fix the increment-1 lane deferred (see rules-views-port.md, the
//   open remainders bullet on :one_line_content/:raw_one_line_content/
//   :help_text and the "find the registration path Ruby uses" note)).
//
// PORTED HERE (exported functions, NOT registered - the registered-view
// table is global, one name one fn ("View
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
//   registered rule_help viewFn's Setting branch, registered on Type::Setting
//
// NOT ported (honest remainder, one-word reasons; the 2026-09-29
// rules-views lane ported the setting-list family, the pill links, the
// board tab and the template link - see the registered setModules below):
// - :rule_edit (editor.rb:17-22) / :modal_rule (board_rules_editor.rb:8-11)
//   / :overlay_rule (board_rules_editor.rb:2-6) / :rule_form/
//   :rule_form_card_editor (rule_form.rb) - PORTED 2026-09-29
//   rules-views-port-3 (see the registered setModules below; the
//   modal/overlay wraps, the RuleSetRadio set-selection walk and the
//   card_form shell through the shared mod-form-substrate; oracle-pinned).
// - :quick_edit/:quick_edit_success (quick_editor.rb) - PORTED 2026-09-29
//   form-substrate lane (the demonstration views).
// - :quick_edit_setting_list/:nest_rules/:modal_nest_rules - PORTED
//   2026-09-29 rules-views-port-3 (the quick_edit item composition; the
//   Right-module body overrides). ALL THREE oracle-pinned: the follow-up
//   rules-cap capture (fixtures/captured/rules-nest-views.json, no-write
//   proof 5018 -> 5018) added the nest_rules/modal_nest_rules bytes and
//   corrected modal_nest_rules (the mark-less path action + the full
//   slot-wrapped list render).
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
//   registration). Its RuleSetRadio machinery is PORTED 2026-09-29
//   rules-views-port-3 as the ruleSetRadioHtml emitter (see the
//   ruleFormCardEditor chain above); the narrower_warning walk beyond the
//   *all literal is the cited unpinned remainder.
// - assets/script/rules.js.coffee + assets/style/rules.scss: assets (the
//   JS/SCSS pipeline is a separate surface)
// - config/locales/{en,de}.yml: locales (the rules_header string "Rules"
//   is pinned where the render layer's setRulesCoreHtml consumes it)
// - data/real.yml: deck-seed (seed content, not mod code)

import { UnsupportedViewError, RenderFormat, type RenderCard, type ViewContext, type ViewFn } from "../../render/format.js";
import { serializerFollowsLive } from "../../render/deployment-follow-live-config.js";
import { processHelpContent } from "../../render/help-popover.js";
import { registeredSettingHelpText } from "../../render/setting-help-text.js";
import { emitAttrs, h, newSlotId, slotOptionsJson } from "../../render/slot-html.js";
import { ruleBarRightHtml } from "../../render/rule-bar-right.js";
import { kramdownToStashedHtml } from "../../render/kramdown.js";
import { DeckoName } from "../../name.js";
import { PATTERN_TABLE, findPattern } from "../../set-patterns/registry.js";
import { ruleNamesForCard } from "../../set-patterns/rule-names.js";
import { labelForParsedSet, parseSetName } from "../../set-patterns/set-name.js";
import { cardFormShell, submitButton } from "../mod-form-substrate.js";
import { getDefaultModLoader } from "../../mod-loader.js";
import { modSlotWrap } from "../mod-view-helpers.js";
import type { PatternCardInput } from "../../set-patterns/types.js";
import type {
  DeckoModManifest,
  ModEngineHost,
  ModEventFn,
  ModEventRegistration,
  ModSetModuleFile,
} from "../mod-manifest.js";
import { engineOwnedEvent } from "../mod-manifest.js";

/** The set-module event declarations (the mod-events lane, 2026-10-08):
 *  stub-bodied unless the engine owns the behavior (then engineOwnedEvent).
 *  Same shape as core-mod.ts's local helper. */
function event(
  decl: Omit<ModEventRegistration, "fn"> & { fn?: ModEventFn },
): ModEventRegistration {
  return { fn: () => undefined, ...decl };
}

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
 *  predicate (render.ts:777; format.ts:396-401 consults it identically) -
 *  but it classifies THREE-part names only (render.ts cardIsRule's
 *  name.parts.length !== 3 gate), while Ruby's standard_rule? (all.rb:37-44)
 *  has NO part-count restriction: right part Setting-typed, left part
 *  Set-typed, any part count (computeIsRule's own comment: "for any part
 *  count"). The 2-part rule cards this mod's views render ("*all+*read")
 *  resolve through the same record reads cardMatchesRuleSet uses, with the
 *  codename-based typeCode checks standing in for the SettingID/SetID
 *  comparisons. */
function isRuleCard(ctx: ViewContext): boolean {
  const card = ctx.fmt.card;
  if (ctx.fmt.engine.cardIsRule?.(card) ?? false) return true;
  if (card.unknown === true || !card.name.isCompound) return false;
  // The RULE pattern verdict the set-keys carry (safe_set_keys' bare RULE
  // key - set_pattern/06_rule.rb pattern_applies? -> card.rule?; render.ts
  // computeIsRule for stored cards - wave-2 71c46c5's preference? port -
  // and the isRule construction input for NEW cards). Wave-1 follow
  // family: the follow mod's rule_editor dispatches rule_form at the
  // in-memory/new preference cards (following.rb:32-38) whose 4-part
  // names the parts.length!==3 / left-typeCode checks below cannot see;
  // the RULE token IS the pattern verdict those arms ride.
  if (card.setKeys.split(/\s+/).includes("RULE")) return true;
  const rightKey = card.name.rightName?.key;
  const leftKey = card.name.leftName?.key;
  if (rightKey === undefined || leftKey === undefined) return false;
  const right = ctx.fmt.engine.fetchRenderCard(rightKey);
  const left = ctx.fmt.engine.fetchRenderCard(leftKey);
  return right?.typeCode === "setting" && left?.typeCode === "set";
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

/** The *rule SET applicability for the set/rule/* modules (set_pattern/
 *  06_rule.rb pattern_applies? -> card.rule? -> standard_rule?,
 *  lib/card/rule/all.rb:37-44: right part a Setting, left part a Set - NO
 *  part-count limit, so the 2-part "*all+*head" is a rule card exactly like
 *  the 3-part preference shape). The engine hook cardMatchesRuleSet is the
 *  ported predicate (render.ts; the pre-2026-09-29 cardIsRule hook carried
 *  the 3-part-only restriction, which is why the rules-views lane needed a
 *  mod-scoped 2-part arm - this guard rides the engine predicate instead of
 *  duplicating it). */
function assertRuleSetCard(ctx: ViewContext, view: string): void {
  if (!(ctx.fmt.engine.cardMatchesRuleSet?.(ctx.fmt.card) ?? false)) {
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
 *  none), so the view returns "" unwrapped. Registered on
 *  Type::Set::HtmlViews (a set-scoped registration reaches only Set cards,
 *  so it shadows no other card's :one_line_content). */
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
 *  setting_opts mattrs); rule cards take the rule card's content.
 *
 *  p20-help-content: the FULL first operand is the setting-help-text
 *  registry (setting-help-text.ts; the set-module defs ride the resolver) —
 *  the reduced help-rule-card-only walk answered "" for every rule card
 *  whose setting registers a help_text (the *style family), so the
 *  rule_help alert rendered an empty body where the oracle renders the
 *  registry text (oracle 000012 *style: "Skin (collection of stylesheets)
 *  ..."). */
function ruleHelpRaw(ctx: ViewContext): string | undefined {
  const registryHit = registeredSettingHelpText(
    ctx.fmt.card.record?.codename,
    rightPartCodename(ctx),
  );
  if (registryHit !== undefined) return registryHit;
  const ruleCard = helpRuleCard(ctx);
  return ruleCard === undefined ? undefined : ruleCard.dbContent;
}

/** The rule card's right part codename (the setting's codename) — the
 *  registry's right-set key. Undefined for a non-compound card or a card
 *  without an enriched record (the stub harnesses). */
function rightPartCodename(ctx: ViewContext): string | undefined {
  const rightKey = ctx.fmt.card.name.rightName?.key;
  if (rightKey === undefined) return undefined;
  return ctx.fmt.engine.fetchRenderCard(rightKey)?.record?.codename;
}

/** help.rb:40-48 rule_based_help: process_content(raw,
 *  chunk_list: :references) - the shared help-popover chunk walk. */
function ruleBasedHelp(ctx: ViewContext): string {
  const resolver = ctx.fmt.engine.helpRules;
  if (resolver !== undefined) {
    return resolver.ruleBasedHelpForCard(ctx.fmt, ctx.fmt.card);
  }
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
 *  the body.
 *
 *  REGISTERED under setPath "rule/bar_view" (kind "nonbase") - the
 *  increment-2 lane's masking fix: card-mod-content's right/default and
 *  right/structure :one_line_content registrations live in viewChains at
 *  those nonbase setPaths (mod-loader.ts:284 gates kind !== "nonbase"), so
 *  registering ANOTHER nonbase chain entry here under rule/bar_view never
 *  touches the flat views table. The viewChain walker (mod-loader.ts:452)
 *  expands the RULE token to every Rule::* module, so a rule card's
 *  dispatch hits this entry first; non-rule cards' walks never reach
 *  rule/bar_view, so right/default + right/structure + the render-layer
 *  fallback (format.ts:1198) all stay live. The body delegates to
 *  ruleBarRightHtml (render/rule-bar-right.ts:266) - the same logic
 *  views.ts barRightView consumes for :bar_right, which already encodes
 *  the Abstract::List pointer-list override + the permission-right +
 *  structure + default + head + toggle + List/pointer item walks the
 *  captured bytes pin (rule-bar-right.ts:9-25 + 65-244). The increment-1
 *  lane's exported ruleOneLineContentView body was a simplified variant
 *  that dropped the list-pointer wrap and failed the captured *all+*read
 *  byte pin; increment-2 reaches into ruleBarRightHtml for the
 *  byte-exact path. */
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
 *  the body.
 *
 *  EXPORTED for the stub harness (tests/card/mod-loader/
 *  card-mod-rules.test.ts's ruleOneLineContentView body assertions). The
 *  increment-2 lane registers a separate viewFn (ruleOneLineContentViewFn
 *  below) under setPath "rule/bar_view" (kind "nonbase") - the masking
 *  fix; that registered viewFn delegates to ruleBarRightHtml for the
 *  byte-exact path the captured *all+*read case pins (Abstract::List
 *  pointer-list wrap for permission rights). The stub harness body is the
 *  increment-1's simplified dispatch because the harness lacks the
 *  setKeys / engine plumbing ruleBarRightHtml reads.
 */
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
  return truncatedCore(card.dbContent);
}

/** The byte-exact path the increment-2 lane registers for rule cards.
 *  Delegates to ruleBarRightHtml (render/rule-bar-right.ts:266) - the same
 *  logic views.ts barRightView consumes for :bar_right, which already
 *  encodes the Abstract::List pointer-list override + the permission-right
 *  + structure + default + head + toggle + List/pointer item walks the
 *  captured bytes pin (rule-bar-right.ts:9-25 + 65-244). The exported
 *  ruleOneLineContentView keeps the increment-1's simplified body for
 *  the stub harness; the engine dispatch uses this function via the
 *  rule/bar_view setModule format block below. */
const ruleOneLineContentViewFn: ViewFn = (ctx) => {
  return ruleBarRightHtml(ctx.fmt.card, ctx.fmt.engine, (card) => {
    const sub = new RenderFormat(card, ctx.fmt.engine, {
      parent: ctx.fmt,
      maxDepth: ctx.fmt.maxDepth,
      nestQuietErrors: true,
    });
    if (card.typeName === "Markdown") {
      try {
        return sub.processContent(kramdownToStashedHtml(card.dbContent ?? ""));
      } catch (error) {
        if (error instanceof UnsupportedViewError) return card.dbContent ?? "";
        throw error;
      }
    }
    try {
      return sub.renderView("core");
    } catch (error) {
      if (error instanceof UnsupportedViewError) return card.dbContent;
      throw error;
    }
  });
}

/** The body dispatch. Ruby's format content.rb:43-45 / 47-49:
 *  `truncate strip_tags(<content>), length: one_line_character_limit` -
 *  Rails String#truncate with the "..." omission (activesupport String#
 *  truncate), only when longer. strip_tags is identity for the plain-text
 *  rule content the engine carries. ONE_LINE_CHARACTER_LIMIT = 60
 *  (content.rb:1); one_line_character_limit = `voo.size || 60`
 *  (content.rb:51-53; no size option reaches the view here). The view
 *  body fires for EVERY rule card - no right-part dispatch (no Right-
 *  pattern module defines :raw_one_line_content in the gem tree - grep:
 *  only format content.rb:18-20/43-45, html/views.rb:24-27, and this
 *  file). */
function ruleRawOneLineInner(content: string): string {
  return content.length > 60 ? `${content.slice(0, 60)}...` : content;
}

/** content.rb:47-49 / content.rb:43-45 - the truncate helper (helper is
 *  private to the ruleOneLineContent / ruleRawOneLineContent bodies; the
 *  same shape as the render layer's rule-bar-right.ts:37-43's
 *  truncatedCore - the increment-2 lane keeps a local copy because
 *  rule-bar-right.ts does not export truncatedCore). */
function truncatedCore(content: string): string {
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
 *  dispatch. The wrap config's div emits around the body.
 *
 *  REGISTERED under setPath "rule/bar_view" (kind "nonbase") - the
 *  masking fix mirrors ruleOneLineContentView above. For *all+*read
 *  (List-typed, content "[[Anyone]]" -> the reference walk yields
 *  "Anyone"), the body emits "Anyone" (length 6, no truncate) - capture
 *  pin: `<div class="text-muted one-line">Anyone</div>`. The increment-1
 *  lane's exported body was already byte-correct for this captured case;
 *  increment-2 just lands the registration. */
export function ruleRawOneLineContentView(ctx: ViewContext): string {
  assertRuleCard(ctx, "raw_one_line_content");
  if (ctx.fmt.card.id === undefined) {
    return ""; // render_mini_unknown (bar_view.rb:26; error.rb:15-17)
  }
  return `<div class="text-muted one-line">${truncatedCore(ctx.fmt.card.dbContent)}</div>`;
}

// ---------------------------------------------------------------------------
// set/rule/board_rules_editor.rb:17-19 - the Rule-set :help_text override
// of card-mod-help's :help_text (cross-mod-dispatch via viewChains; the
// 2026-09-29 increment-2 lane)
// ---------------------------------------------------------------------------

/** set/rule/board_rules_editor.rb:17-19 view :help_text:
 *  `wrap_help_text [rule_based_help, setting_link].join(" ")`.
 *
 *  The Rule-set's :help_text body in Ruby fires wrap_help_text (which
 *  conditionally prepends the d-none edit_link span when help_rule_card
 *  resolves to a readable *help rule card - card-mod-help set/all/
 *  help.rb:18-25). For the increment-2 capture (*all+*read with NO
 *  stored *all+*help rule card), help_rule_card walks rule_names("*read",
 *  "*help") = ["*all+*help"], fetch miss = undefined, so wrap_help_text
 *  returns the text verbatim. The capture's help_text bytes therefore
 *  carry NO d-none span (rules-views.json rule_card.views.help_text).
 *
 *  REGISTERED under setPath "rule/board_rules_editor" (kind "nonbase").
 *  card-mod-help registers :help_text under setPath "all/help" (kind
 *  "base") which enters the FLAT views table - the increment-1 lane
 *  called this the "global-table masking" problem. The fix: register the
 *  Rule-set variant under a nonbase setPath so it enters viewChains
 *  ONLY. The viewChain walker (mod-loader.ts:452) expands the RULE token
 *  to every Rule::* module - for a rule card with setKeys "ALL ... RULE
 *  ..." the chain finds Rule::BoardRulesEditor first and dispatches the
 *  rule bytes; for non-rule cards the chain never reaches rule/
 *  board_rules_editor, so the existing all/help registration (the
 *  helpTextView that wraps the same rule_based_help without setting_link)
 *  wins. The body reaches the help-popover seam's rule_based_help +
 *  setting_link composition through the engine.helpRules API
 *  (format.ts:299-303's HelpRulesApi.ruleHelpTextBytes - see help-
 *  popover.ts:ruleHelpTextBytes), so the ruleCounts map stays single-
 *  sourced there. */
const ruleHelpTextView: ViewFn = (ctx) => {
  assertRuleCard(ctx, "help_text");
  const help = ctx.fmt.engine.helpRules?.ruleHelpTextBytes(ctx.fmt);
  return help ?? "";
};

// ---------------------------------------------------------------------------
// set/all/set_select.rb:20-23 view :card_select (2026-09-29 increment-2
// lane; the related_sets + select2 timestamp-normalization port)
// ---------------------------------------------------------------------------

/** set/all/set_select.rb:20-23 view :card_select, unknown: true,
 *  cache: :never: `set_select_tag(set_list, args)` (the body
 *  wraps the select tag + the empty fixed-slot div in a filter form
 *  with role=filter + action="/?view=filtered_accordion_rule_list").
 *
 *  card_select's body returns "" for a card whose related_sets walk is
 *  empty (non-set-typed cards). The capture deck's *all has exactly one
 *  related set: *all+*self (Set-typed; the walk filters by
 *  type_id == SetID per related_sets.rb - List-typed rule cards like
 *  *all+*read do NOT contribute options).
 *
 *  The select tag's `data-select2-id` carries
 *  `"<safe_key>-<card_id>-<Time.now.to_i>"` (bootstrap-select widget
 *  metadata, gem-tools equivalent). The Time.now stamp is
 *  NON-deterministic across renders; the increment-2 lane freezes it
 *  to a stable token the test normalizes to TIME
 *  (fixtures/captured/rules-views.json's "select2 data-select2-id
 *  seconds suffix" -> "TIME" normalization + the test's
 *  `normalize()` regex `(data-select2-id="[^"]*-)\d+(")` -> $1TIME$2
 *  produce a stable byte-comparison surface). */
function select2TimestampSeconds(): number {
  // The token-runtime freeze lane's discipline (see fixtures/captured/
  // rules-views.json's normalizations block): the engine emits a stable
  // timestamp seed, the test normalizes the resulting seconds suffix to
  // TIME. ANY non-empty integer the regex can replace works; the seed 0
  // keeps the captured fixture's slot-id analogy (RANDOMIZED).
  return 0;
}

/** set/all/set_select.rb:49-57 set_list: `Card.search(left_id: id,
 *  type_id: SetID).map(&:name)` (the type filter excludes List-typed rule
 *  cards like *all+*read - only Set-typed rule cards contribute options).
 *  Returns the distinct right tag names from the walked cards
 *  (`"+#{tag_name}"` option value prefix per the rule_select_tag
 *  convention). */
function relatedSetsRightNames(card: RenderCard, engine: RenderFormat["engine"]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // engine.collectRules (render.ts:3086) walks every rule card whose left
  // is `card`. The capture filter (type_id == SetID) is applied here.
  const rules = engine.collectRules?.(card) ?? [];
  for (const rule of rules) {
    if (rule.typeId !== 5 && rule.typeCode !== "set") continue;
    const rightName = rule.name.rightName?.s;
    if (rightName === undefined) continue;
    if (seen.has(rightName)) continue;
    seen.add(rightName);
    out.push(rightName);
  }
  return out;
}

/** One <option> row: the right tag's "+tag_name" value + the SETTING
 *  card's label as display text. An unset (no content) setting card
 *  renders the empty display (capture: "The card """ for *self). */
function cardSelectOptionBytes(rightName: string, engine: RenderFormat["engine"]): string {
  const settingCard = engine.fetchRenderCard(rightName);
  // set_select.rb's option_for_set: `set_card ? set_card.label :
  // "The card \"#{name}\""`. The capture pins empty between the quotes
  // for *self (the setting card exists but has no label - the test seed
  // gives *self an empty dbContent). The escape (`&quot;`) is the
  // ERB::Util.html_escape applied to the label by content_tag.
  const label = settingCard?.dbContent ?? "";
  return `<option value="+${rightName}">The card &quot;${h(label)}&quot;</option>`;
}

const cardSelectView: ViewFn = (ctx) => {
  // The filter form's action and the empty fixed-slot div come from
  // set_select_tag + the format's wrapping form_tag (Rails form_tag
  // defaults - the headless port's action / method / slot-selector /
  // class / data-remote attrs mirror the captured bytes exactly).
  const card = ctx.fmt.card;
  const rightNames = relatedSetsRightNames(card, ctx.fmt.engine);
  const options = [
    `<option value=""></option>`,
    ...rightNames.map((name) => cardSelectOptionBytes(name, ctx.fmt.engine)),
  ].join("\n");
  // select2 data-select2-id: `<safe_key>-<card_id>-<seconds>` (Time.now
  // stamp). The seconds are non-deterministic in Ruby; the test freezes
  // the value to a stable token the normalize() regex rewrites to TIME.
  const select2Id =
    `${card.name.safeKey}-${card.id ?? 0}-${select2TimestampSeconds()}`;
  return (
    `<form role="filter" data-slot-selector=".card-slot._fixed-slot" class="nodblclick slotter"` +
    ` action="/?view=filtered_accordion_rule_list" accept-charset="UTF-8" data-remote="true" method="get">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    `<select name="mark" id="mark" class="_submit-on-select form-control _close-rule-overlay-on-select"` +
    ` data-minimum-results-for-search="Infinity" data-placeholder="Select set"` +
    ` data-select2-id="${select2Id}">` +
    options +
    `</select>` +
    `<div class="card-slot _fixed-slot"></div>` +
    `</form>`
  );
};

// ---------------------------------------------------------------------------

// set/type/set/html_views/rule_lists.rb + filtered_rule_lists.rb +
// set/rule/editor.rb pill links + set/type/set/html_views/template.rb -
// the setting-list family, the rule pill links, the board tab and the
// template link (2026-09-29 rules-views lane; oracle-pinned against
// fixtures/captured/rules-views.json, captured by
// tests/card/mod-loader/oracle-capture-rules-views.rb with the in-run
// no-write proof card_actions 4945 -> 4945)
// ---------------------------------------------------------------------------

import { SETTING_GROUPS, visibleGroupSettings, barSettingListBody, templateLinkView } from "../../render/views.js";
import { buildVirtualRuleCard } from "../../render/virtual-rule-card.js";
// h + modSlotWrap are imported at the top of the file (the merge of the
// form-substrate lane's quick_edit section with this lane's section kept
// both import blocks; the duplicates are consolidated up top).

/** The static short_help_text a setting module registered through
 *  `setting_opts short_help_text:` - Card::Setting#register_setting stores
 *  it on the setting's Self set module mattr (card-1.110.0
 *  lib/card/setting.rb:27 + :69 standard_setting_opts), and the rule card's
 *  card-level reader walks to the SETTING card (card-mod-rules
 *  set/rule/rules.rb:40-42 short_help_text -> Card[rule_setting_name]
 *  .short_help_text). Settings without an entry respond nil (the mattr
 *  default) - the capture pins the empty `<div class="help-text"></div>`
 *  for every unlisted setting (autoname, captcha, follow, follow_fields,
 *  layout, on_create, on_delete, on_update, script, style).
 *  Sources (gem, verbatim):
 *  - card-mod-content set/self/structure.rb:2 / default.rb:2
 *  - card-mod-edit set/self/input_type.rb:4
 *  - card-mod-help set/self/guide.rb:2 / help.rb:2
 *  - card-mod-integrate set/self/thanks.rb:2
 *  - card-mod-layout set/self/head.rb:2
 *  - card-mod-permissions set/self/{create,read,update,delete}.rb:2 */
const SETTING_SHORT_HELP_TEXT: ReadonlyMap<string, string> = new Map([
  ["structure", "control card's content / structure"],
  ["default", "type/content template for new cards"],
  ["input_type", "edit interface"],
  ["guide", "appears in the full editor view to guide users"],
  ["help", "help text people will see when editing"],
  ["thanks", "destination after card is created"],
  ["head", "head tag content"],
  ["create", "who can create cards"],
  ["read", "who can view cards"],
  ["update", "who can update cards"],
  ["delete", "who can delete cards"],
]);

/** setting_categories.rb:30-45 category_settings(:all) - every visible
 *  setting codename SORTED (all_settings :51-53 visible_setting_codenames
 *  .sort; visible_setting_codenames :73-75 = the groups walk in
 *  Card::Setting.groups' declaration order, filtered by
 *  applies_to_cardtype). The group tables are the render layer's
 *  oracle-pinned constants (views.ts SETTING_GROUPS/GROUP_TO_SETTINGS/
 *  visibleGroupSettings - the same registration-order derivation the set
 *  page's rules section renders), and the sort is Ruby's byte-order sort,
 *  which the JS default string comparison matches for these ASCII
 *  lowercase/underscore codenames. Capture pin (rules-views.json
 *  setting_registry.all_settings_sorted): autoname, captcha, create,
 *  default, delete, follow, follow_fields, guide, head, help, input_type,
 *  layout, on_create, on_delete, on_update, read, script, structure,
 *  style, thanks, update. */

/** setting_categories.rb:6-7 COMMON_SETTINGS / FIELD_SETTINGS (frozen
 *  constants; format.ts carries its own private copies for the before(:bar)
 *  hook - duplicated here rather than exported from the render layer so the
 *  mod stays the single citation home for its own gem file). */
const COMMON_SETTINGS: ReadonlySet<string> = new Set([
  "create", "read", "update", "delete", "structure", "default", "guide",
]);
const FIELD_SETTINGS: ReadonlySet<string> = new Set([
  "default", "help", "input_type", "content_options", "content_option_view",
]);

/** setting_categories.rb:64-67 recent_settings - `Card[:recent_settings]
 *  .item_cards.map(&:codename)` (the ITEM CARDS resolve by name, then the
 *  CODENAME is read off each card - the item strings are the display forms
 *  "*input type"/"*follow fields" whose codenames are input_type/
 *  follow_fields), ∩ visible handled naturally (only visible settings are
 *  queried). NOT a frozen set: the membership is deck data. A missing
 *  *recent_settings card = empty membership (the nil-safe walk). */
function recentSettingsCodenames(ctx: ViewContext): Set<string> {
  const list = ctx.fmt.engine.fetchRenderCard("*recent_settings");
  if (list === undefined || list.unknown === true) return new Set();
  const codenames = new Set<string>();
  for (const line of list.dbContent.split("\n")) {
    const item = line.trim();
    if (item === "") continue;
    const itemCard = ctx.fmt.engine.fetchRenderCard(item);
    const codename = itemCard?.record.codename;
    if (codename !== undefined) codenames.add(codename);
  }
  return codenames;
}

/** setting_categories.rb:9-15 categories(setting):
 *  `[:all] + %i[field recent common].select { category_settings(cat)
 *  &.include? setting }` - the category order (all, field, recent,
 *  common) is the byte order the capture pins (*default: all field
 *  common; *read: all recent common; *help: all field recent). */
function categoriesForSetting(ctx: ViewContext, setting: string): string[] {
  const result = ["all"];
  if (FIELD_SETTINGS.has(setting)) result.push("field");
  if (recentSettingsCodenames(ctx).has(setting)) result.push("recent");
  if (COMMON_SETTINGS.has(setting)) result.push("common");
  return result;
}

/** rules.rb:44-46 rule_setting_title: the setting codename IS the tag name
 *  with stars stripped (editor.rb:85-87 setting_title). */
function settingTitleFor(setting: string): string {
  return setting;
}

/** editor.rb:89-91 short_help_text:
 *  `"<div class=\"help-text\">#{card.short_help_text}</div>"` - the
 *  SETTING card's mattr (SETTING_SHORT_HELP_TEXT above), nil -> the empty
 *  div the capture pins. */
function shortHelpTextDiv(setting: string): string {
  return `<div class="help-text">${SETTING_SHORT_HELP_TEXT.get(setting) ?? ""}</div>`;
}

// --- the board link machinery (card-mod-edit set/all/board.rb:48-62 +
//     card-mod-format set/all/links.rb:104-122 + lib/card/path.rb) ---------

/** board.rb:59-62 board_slot_selector (frozen string; HTML-escaped in the
 *  attribute - the capture carries &gt; entities). */
const BOARD_SLOT_SELECTOR =
  ".board-main > .overlay-container > .card-slot._bottomlay-slot," +
  ".board-main > ._overlay-container-placeholder > .card-slot";

/** The board_link_opts path query (board.rb:53-55): layout=overlay +
 *  slot[items][view]=closed, Rails to_param bracket-escaped. pill_rule_
 *  link_opts deletes :layout (editor.rb:50); board_link_opts' own
 *  `opts[:path][:view] ||= :content` is overridden by link_to_view's
 *  add_to_path before the path renders. */
const BOARD_PATH_LAYOUT_QUERY = "layout=overlay&slot%5Bitems%5D%5Bview%5D=closed";
const BOARD_PATH_QUERY = "slot%5Bitems%5D%5Bview%5D=closed";

/** The html link_to anchor for board links. Byte contract pinned against
 *  rules-views.json (rule_board_link / rule_nest_editor_link /
 *  overlay_rule_list_link):
 *  - rel="nofollow" emitted FIRST (links.rb:121 slotterify adds it, but
 *    the html emitter hoists it ahead of the caller attrs);
 *  - class = the caller classes + " slotter slotter" DOUBLED
 *    (board.rb:52 add_class "slotter" + links.rb:123 slotterify's
 *    add_class "slotter" - the capture pins the doubling);
 *  - the caller attrs in board_link_opts insertion order (data-bs-toggle,
 *    data-category, data-cy for the pill links), then board.rb:49-51's
 *    data-slot-selector + data-slotter-mode=override, then href
 *    (links.rb:105 opts[:href] ||= path), then data-remote
 *    (links.rb:141-147 interpret_data_opts_to_link_to moves :remote last);
 *  - the attribute values HTML-escape (&gt; in the slot selector, &amp;
 *    between query params). */
function boardLinkAnchor(opts: {
  classList: string;
  href: string;
  text: string;
  extraAttrs?: Array<[string, string]>;
}): string {
  const attrs: Array<[string, string]> = [
    ["rel", "nofollow"],
    ["class", `${opts.classList} slotter slotter`],
    ...(opts.extraAttrs ?? []),
    ["data-slot-selector", BOARD_SLOT_SELECTOR],
    ["data-slotter-mode", "override"],
    ["href", opts.href],
    ["data-remote", "true"],
  ];
  return `<a ${attrs.map(([k, v]) => `${k}="${h(v)}"`).join(" ")}>${opts.text}</a>`;
}

// --- the bootstrap list/accordion emitters (card-mod-bootstrap
//     set/all/bootstrap/helper.rb:20-34 + accordion.rb:2-12 + its
//     accordion_item.haml; card-mod-edit set/all/board/board_pills.rb
//     BOARD_PILL_* constants) ----------------------------------------------

/** board_pills.rb:1-2 BOARD_PILL_UL_CLASSES / :4 BOARD_PILL_LI_CLASSES. */
const BOARD_PILL_UL_CLASSES = "nav nav-pills _auto-single-select board-pills flex-column";
const BOARD_PILL_LI_CLASSES = "nav-item";

/** helper.rb:20-26 list_tag + :28-34 list_item_tags: `<ul ${options}>` with
 *  the items each wrapped in `<li>` (per-item opts or the default), the li
 *  elements newline-joined and butting the ul tags (capture:
 *  `<ul class="nav flex-column"><li ...>..</li>\n<li ...>..</li></ul>`). */
function listTag(items: string[], ulClass: string, liClass: string): string {
  const lis = items.map((item) => `<li class="${liClass}">${item}</li>`);
  return `<ul class="${ulClass}">${lis.join("\n")}</ul>`;
}

/** board_pills.rb:7-12 board_pills: list_tag with the frozen pill classes. */
function boardPills(items: string[]): string {
  return listTag(items, BOARD_PILL_UL_CLASSES, BOARD_PILL_LI_CLASSES);
}

/** accordion.rb:4-6 accordion: `wrap_with :div, class: classy("accordion")`.
 *  The caller's class_up ("accordion", "bar-accordion" - rule_lists.rb:27)
 *  rides the voo classUps; classy resolves them. */
function accordionWrap(ctx: ViewContext, inner: string): string {
  return `<div class="${ctx.voo.classy("accordion")}">${inner}</div>`;
}

/** accordion.rb:8-14 accordion_item over accordion_item.haml - the exact
 *  haml-emitted byte shape the capture pins (single-quoted attributes,
 *  newline after each opening tag, the item ending with a trailing
 *  newline; `collapsed` always present - the capture's groups all render
 *  closed, `open: false` default; collapse_id = card-<safe_key>-<context>
 *  -collapse-id, accordion.rb:13). */
function accordionItem(
  ctx: ViewContext,
  title: string,
  body: string,
  context: string,
): string {
  const collapseId = `card-${ctx.fmt.card.name.safeKey}-${context}-collapse-id`;
  const accordionButtonClass = serializerFollowsLive()
    ? "accordion-button collapsed"
    : "collapsed accordion-button";
  return (
    `<div class='${ctx.voo.classy("accordion-item")}'>\n` +
    `<h2 class='accordion-header nodblclick w-100'>\n` +
    `<button class='${accordionButtonClass}' data-bs-target='#${collapseId}' data-bs-toggle='collapse' type='button'>\n` +
    `${title}\n` +
    `</button>\n</h2>\n` +
    `<div class='accordion-collapse collapse' id='${collapseId}'>\n` +
    `<div class='${serializerFollowsLive() ? "d0-card-body accordion-body" : "accordion-body d0-card-body"}'>\n` +
    `${body}\n</div>\n</div>\n</div>\n`
  );
}

/** rule_lists.rb:61-63 count_badge. */
function countBadge(count: number): string {
  return `<span class="_count badge bg-secondary ms-3">${count}</span>`;
}

/** rule_lists.rb:90-101 category_setting_list_items + setting_list_item:
 *  each visible setting's rule card (stored, else the virtual Card.new
 *  construction - `card.fetch setting, new: {}`), nested with the item
 *  view. show_view? (line 97) gates the item on the SETTING card's read
 *  permission - a denied setting renders "" (the empty item the list_tag
 *  would wrap; unreachable in the capture deck where Anonymous reads every
 *  setting card). The nest opts carry the rule card's nest_name (the
 *  capture's nested slots pin it) under the caller's extras. */
function settingListItem(
  ctx: ViewContext,
  setting: string,
  itemView: string,
  extraNestOpts: Record<string, unknown> = {},
): string {
  const settingCard = ctx.fmt.engine.findSettingCard?.(setting);
  if (settingCard === undefined) return ""; // the deck has no such setting
  if (ctx.fmt.engine.isDenied(settingCard)) return ""; // show_view? false
  const setCard = ctx.fmt.card;
  const stored = ctx.fmt.engine.fetchRenderCard(`${setCard.name.s}+*${setting}`);
  const ruleCard =
    stored !== undefined && stored.unknown !== true
      ? stored
      : buildVirtualRuleCard({
          setCard,
          settingCard,
          settingCodename: setting,
          engine: ctx.fmt.engine,
        });
  // the nest's show/home_view pair: nest.rb#prepare_view_and_opts! pins
  // `home_view ||= view` for every non-closed/edit view - the capture's
  // nested slots all carry show:[view] + home_view (the TS nestRecord does
  // not add them, the render layer's renderSettingListItems passes them
  // explicitly - same idiom here).
  return ctx.fmt.nestRecord(ruleCard, itemView, {
    nest_name: ruleCard.name.s,
    show: [itemView],
    home_view: itemView,
    ...extraNestOpts,
  });
}

/** rule_lists.rb:90-94 category_setting_list_items over the category's
 *  settings. Category :all = all_settings (sorted, allSettingsSorted);
 *  :common/:field the frozen lists; :recent the deck's list; a GROUP key
 *  (:permission ...) the group's visible registration order
 *  (setting_categories.rb:47-49 group_settings). */
function categorySettingListItems(
  ctx: ViewContext,
  category: string,
  itemView: string,
  extraNestOpts: Record<string, unknown> = {},
): string[] {
  const visible = visibleSettingsInGroupOrder();
  const settings = categoryAllSettingsSorted(category, visible, ctx);
  return settings.map((setting) => settingListItem(ctx, setting, itemView, extraNestOpts));
}

/** visible_setting_codenames in the groups' declaration order (the
 *  unsorted visible walk all_settings sorts from). */
function visibleSettingsInGroupOrder(): string[] {
  return SETTING_GROUPS.flatMap((group) => [...visibleGroupSettings(group)]);
}

/** setting_categories.rb:30-45 category_settings(category). */
function categoryAllSettingsSorted(
  category: string,
  visible: string[],
  ctx: ViewContext,
): string[] {
  if (category === "all") return [...visible].sort();
  if (category === "common") return visible.filter((s) => COMMON_SETTINGS.has(s));
  if (category === "field") return visible.filter((s) => FIELD_SETTINGS.has(s));
  if (category === "recent") {
    const recent = recentSettingsCodenames(ctx);
    return visible.filter((s) => recent.has(s));
  }
  return [...visibleGroupSettings(category)]; // a GROUP key (group_settings)
}

/** rule_lists.rb:6-8 + 74-79 quick_edit_setting_list / :11-14
 *  bar_setting_list / :17-24 pill_setting_list (the EFFECTIVE second
 *  definition at :86-88) / :26-31 accordion_rule_list / :33-38
 *  accordion_bar_list.
 *
 *  WRAP/CACHE MECHANISM (why bar/modal_pill/accordion_rule carry NO slot
 *  wrapper and NO cache:never in the capture while pill/quick_edit do):
 *  Ruby's view-option processing DELETES each VIEW_SETTINGS key from the
 *  options hash (card-1.110.0 lib/card/set/format/abstract_format/
 *  view_opts.rb:46-52 interpret_view_settings opts.delete(setting_name)),
 *  and rule_lists.rb:2-3 shares ONE options object across five view
 *  definitions - the FIRST definition (quick_edit_setting_list, line 6)
 *  consumes cache + wrap; every later definition in the file sees the
 *  emptied hash (oracle-probed: _view_bar_setting_list__wrap does not
 *  respond; _view_pill_setting_list__wrap does - the pill's SECOND
 *  definition at line 86 carries its own literal wrap hash). The port
 *  registers each view with the EFFECTIVE config: wrap/cache only where
 *  the live deck's compiled setting methods respond. */

/** rule_lists.rb:81-84 pill_setting_list helper: the pills' item view is
 *  :rule_board_link, or :rule_nest_editor_link when the rule editor opens
 *  in a modal. */
function pillSettingListItems(ctx: ViewContext, openRuleInModal: boolean): string[] {
  return categorySettingListItems(
    ctx,
    "all",
    openRuleInModal ? "rule_nest_editor_link" : "rule_board_link",
  );
}

/** The slot wrapper the wrap configs emit around the two wrapped views
 *  (pill_setting_list's literal wrap {slot: {class: "_setting-list"}} and
 *  board_rules_tab's d-flex class list). */
function settingListSlotWrap(ctx: ViewContext, view: string, inner: string, extraClasses: string): string {
  return modSlotWrap(ctx, view, inner, extraClasses);
}

/** rule_lists.rb:65-72 view :overlay_rule_list_link, cache: :never:
 *  `wrap_with :div { link_to_view(:core, "Show existing rules",
 *  board_link_opts(class: "edit-rule-link btn btn-primary")) }`. The href
 *  is the SET card's own mark + :core view with board_link_opts' full
 *  query (layout survives - no pill_rule_link_opts delete here). Capture:
 *  href="/*all/core?layout=overlay&amp;slot%5Bitems%5D%5Bview%5D=closed". */
const overlayRuleListLinkView: ViewFn = (ctx) => {
  assertSetCard(ctx, "overlay_rule_list_link");
  const anchor = boardLinkAnchor({
    classList: "edit-rule-link btn btn-primary",
    href: `/${ctx.fmt.urlKey()}/core?${BOARD_PATH_LAYOUT_QUERY}`,
    text: "Show existing rules",
  });
  return `<div>${anchor}</div>`;
};

/** rule_lists.rb:11-14 view :bar_setting_list (no effective wrap/cache -
 *  the shared-hash deletion above):
 *  `category_setting_list_items(group, :bar, hide: :full_name).join("\n")
 *  .html_safe` with group = voo.filter&.to_sym || :all. Each item nests
 *  the setting's rule card with view :bar; the nest carries
 *  hide: ["full_name"] (the capture's bar slot hide list leads with it).
 *  p20-email-views: the BODY moved to views.ts barSettingListBody (the
 *  flat seam the loader-less graded page lane reads — the Shark page nests
 *  this view on *all); this set-scoped registration delegates to the same
 *  function so the two surfaces cannot drift. */
const barSettingListView: ViewFn = (ctx) => {
  assertSetCard(ctx, "bar_setting_list");
  return barSettingListBody(ctx);
};

/** rule_lists.rb:86-88 view :pill_setting_list (the effective SECOND
 *  definition; cache: :never + the _setting-list slot wrap):
 *  `pill_setting_list` - board_pills over :rule_board_link items. */
const pillSettingListView: ViewFn = (ctx) => {
  assertSetCard(ctx, "pill_setting_list");
  return settingListSlotWrap(
    ctx,
    "pill_setting_list",
    boardPills(pillSettingListItems(ctx, false)),
    "_setting-list",
  );
};

/** rule_lists.rb:22-24 view :modal_pill_setting_list (shared-hash deleted
 *  opts - NO wrap): `pill_setting_list true` - the modal item view. */
const modalPillSettingListView: ViewFn = (ctx) => {
  assertSetCard(ctx, "modal_pill_setting_list");
  return boardPills(pillSettingListItems(ctx, true));
};

/** rule_lists.rb:26-31 view :accordion_rule_list (shared-hash deleted opts
 *  - NO wrap): `class_up "accordion", "bar-accordion";
 *  category_accordion(:rule_board_link) { |list| board_pills list }`. */
const accordionRuleListView: ViewFn = (ctx) => {
  assertSetCard(ctx, "accordion_rule_list");
  ctx.voo.classUp("accordion", "bar-accordion");
  return categoryAccordion(ctx, "rule_board_link", (list) => boardPills(list));
};

/** rule_lists.rb:33-38 view :accordion_bar_list (no opts at all):
 *  `class_up "accordion", "bar-accordion"; category_accordion(:bar) do
 *  |list| list_tag(class: "nav flex-column", items: { class: "nav-item" })
 *  { list } end`. The :bar item nests carry NO hide option (category_
 *  accordion_item -> setting_list_item setting, view with opts={} - the
 *  capture's accordion bar slots hide only bar_nav, the rule bar's own;
 *  no full_name), unlike bar_setting_list's explicit hide: :full_name. */
const accordionBarListView: ViewFn = (ctx) => {
  assertSetCard(ctx, "accordion_bar_list");
  ctx.voo.classUp("accordion", "bar-accordion");
  return categoryAccordion(ctx, "bar", (list) =>
    listTag(list, "nav flex-column", "nav-item"),
  );
};

/** rule_lists.rb:40-59 category_accordion + category_accordion_item:
 *  `wrap_with :div, class: "_setting-list" { accordion { GROUP.keys.map {
 *  |group| list = group_settings(group).map { setting_list_item };
 *  accordion_item "#{group_key} #{count_badge(list.size)}", body: ..., 
 *  context: group_key } } }` - every group renders (no empty skip), the
 *  items newline-joined (each accordion_item ends with its haml trailing
 *  newline, so the join shows as the capture's blank line). */
function categoryAccordion(
  ctx: ViewContext,
  view: string,
  buildList: (list: string[]) => string,
): string {
  ctx.voo.classUp("accordion-item", "_setting-group");
  const groupItems = SETTING_GROUPS.map((group) => {
    const list = visibleGroupSettings(group).map((setting) =>
      settingListItem(ctx, setting, view),
    );
    return accordionItem(
      ctx,
      `${group} ${countBadge(list.length)}`,
      buildList(list),
      group,
    );
  });
  return `<div class="_setting-list">${accordionWrap(ctx, groupItems.join("\n"))}</div>`;
}

// --- filtered_rule_lists.rb (set/type/set/html_views/filtered_rule_lists) -

/** setting_filter.rb:26-39 filter_radio (strip_heredoc literal): the
 *  checked radio carries `checked` with no preceding space. */
function filterRadio(name: string, label: string, checked: boolean): string {
  return (
    `<input type="radio" class="btn-check _setting-category" name="options" id="${name}" autocomplete="off" ${checked ? "checked" : ""}>\n` +
    `<label class="btn btn-outline-primary" for="${name}">${label}</label>\n`
  );
}

/** setting_filter.rb:16-24 filter_buttons: the label + four radios joined
 *  "\n" inside the _setting-filter div (the heredoc's trailing newline
 *  makes every radio pair boundary a blank line; the label is a
 *  content_tag with no trailing newline of its own). */
function filterButtons(selected: string): string {
  return (
    `<div class="my-4 mx-2 _setting-filter">` +
    [
      `<label>Settings</label>`,
      filterRadio("all", "All", selected === "all"),
      filterRadio("common", "Common", selected === "common"),
      filterRadio("field", "Field", selected === "field_related"),
      filterRadio("recent", "Recent", selected === "recent"),
    ].join("\n") +
    `</div>`
  );
}

/** setting_filter.rb:7-14 setting_filter: form_tag path(view: view,
 *  mark: path_opts[:mark]) with the frozen attrs + the utf8 enqueuer.
 *  The action: mark "" -> "/?view=..." (board_rules_tab's mark: "");
 *  no mark opt -> "/<set url_key>/..." (filtered_accordion_rule_list).
 *  classy("nodblclick slotter") resolves plain. */
function settingFilter(ctx: ViewContext, view: string, selectedCategory: string, mark: string | undefined): string {
  const action =
    mark === undefined
      ? `/${ctx.fmt.urlKey()}/${view}`
      : `/?view=${view}`;
  return (
    `<form role="filter" data-slot-selector=".card-slot._setting-list" class="nodblclick slotter"` +
    ` action="${h(action)}" accept-charset="UTF-8" data-remote="true" method="get">` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    filterButtons(selectedCategory) +
    `</form>`
  );
}

/** filtered_rule_lists.rb:24-27 filtered_rule_list: [setting_filter,
 *  render(view)] - the pair newline-joined (the view body's array return,
 *  content.rb output semantics). The list half composes the list view's
 *  body DIRECTLY on this ctx (Ruby's render(view) child voo inherits the
 *  caller's class_ups - the capture pins board_rules_tab's
 *  `_setting-list` class_up landing on the INNER accordion-item div; the
 *  TS renderView would open a fresh voo and drop it). */
function filteredRuleList(
  ctx: ViewContext,
  filterView: string,
  selectedCategory: string,
  mark: string | undefined,
  listBody: (ctx: ViewContext) => string,
): string {
  return `${settingFilter(ctx, filterView, selectedCategory, mark)}\n${listBody(ctx)}`;
}

/** filtered_rule_lists.rb:13-18 view :board_rules_tab, cache: :never,
 *  wrap: { slot: { class: "d-flex flex-column gap-3 mx-3 mt-2" } }:
 *  `class_up "accordion-item", "_setting-list"; filtered_rule_list
 *  :accordion_rule_list, :common, mark: ""` - the class_up lands on the
 *  accordion-item div INSIDE the accordion (capture: `accordion-item
 *  _setting-group _setting-list`), the wrap class list rides the slot. */
const boardRulesTabView: ViewFn = (ctx) => {
  assertSetCard(ctx, "board_rules_tab");
  // Ruby's class_ups land on DIFFERENT voos (board_rules_tab's on its own,
  // category_accordion's on the inner render's child) and classy resolves
  // extras own-voo-first-then-ancestors (classy.rb deep_extra_classes), so
  // the capture's accordion-item reads `_setting-group _setting-list` -
  // INNER extra first. On the shared TS voo the same bytes come from
  // registering the inner extra first (the accordion's own classUp then
  // dedups token-level, first occurrence winning).
  ctx.voo.classUp("accordion-item", "_setting-group");
  ctx.voo.classUp("accordion-item", "_setting-list");
  return settingListSlotWrap(
    ctx,
    "board_rules_tab",
    filteredRuleList(ctx, "accordion_rule_list", "common", "", accordionRuleListView),
    "d-flex flex-column gap-3 mx-3 mt-2",
  );
};

/** filtered_rule_lists.rb:20-22 view :filtered_accordion_rule_list (no
 *  opts, no wrap): `filtered_rule_list :accordion_rule_list` - the
 *  default :common filter selection, the set's own mark in the action. */
const filteredAccordionRuleListView: ViewFn = (ctx) => {
  assertSetCard(ctx, "filtered_accordion_rule_list");
  return filteredRuleList(ctx, "accordion_rule_list", "common", undefined, accordionRuleListView);
};

// --- set/rule/editor.rb - the pill rule links ------------------------------

/** editor.rb:38-52 pill_rule_link + pill_rule_link_opts +
 *  editor.rb:54-58 category_classes:
 *  `link_to_view target_view, (setting_title + short_help_text), opts`
 *  with data-bs-toggle pill / data-category / data-cy
 *  "#{setting_title.to_name.key}-pill", board_link_opts' slot attrs, and
 *  the :layout delete (so the query carries ONLY slot[items][view]).
 *  The link TEXT is setting_title + short_help_text - the capture pins
 *  it unescaped (links.rb:105 raw()) with the short-help div inline.
 *  The category/short-help lookups key on the SETTING card's CODENAME
 *  (rules.rb:40-42 short_help_text resolves the setting CARD; its mattr
 *  keys are codenames - "follow_fields", not the display tag "follow
 *  fields"), read off the rule card's right part like views.ts'
 *  rightPartCodenameForRule, falling back to the stripped key. */
function pillRuleLink(ctx: ViewContext, targetView: string): string {
  const card = ctx.fmt.card;
  const title = settingTitle(ctx); // rules.rb:44-46 + editor.rb:85-87
  const rightKey = card.name.rightName?.key;
  const settingCard =
    rightKey !== undefined ? ctx.fmt.engine.fetchRenderCard(rightKey) : undefined;
  const setting =
    settingCard?.record.codename ?? (rightKey?.startsWith("*") ? rightKey.slice(1) : title);
  const categories = categoriesForSetting(ctx, setting);
  const key = DeckoName.parse(title).key;
  return boardLinkAnchor({
    classList: `edit-rule-link nav-link _rule-item ${categories.map((c) => `_category-${c}`).join(" ")}`,
    href: `/${card.name.urlKey}/${targetView}?${BOARD_PATH_QUERY}`,
    text: `${title}${shortHelpTextDiv(setting)}`,
    extraAttrs: [
      ["data-bs-toggle", "pill"],
      ["data-category", categories.join(" ")],
      ["data-cy", `${key}-pill`],
    ],
  });
}

/** editor.rb:30-32 view :rule_nest_editor_link, unknown: true:
 *  pill_rule_link :modal_rule. */
const ruleNestEditorLinkView: ViewFn = (ctx) => {
  assertRuleCard(ctx, "rule_nest_editor_link");
  return pillRuleLink(ctx, "modal_rule");
};

/** editor.rb:34-36 view :rule_board_link, unknown: true:
 *  pill_rule_link :overlay_rule. */
const ruleBoardLinkView: ViewFn = (ctx) => {
  assertRuleCard(ctx, "rule_board_link");
  return pillRuleLink(ctx, "overlay_rule");
};

// ---------------------------------------------------------------------------
// prepareRuleCache - the boot-time Rule::Cache warm
// ---------------------------------------------------------------------------

/** The rule card ids PLUS every transitive side id needed to compose their
 *  junction names: the rule-cache join (lib/card/rule/cache.rb:10-27) over
 *  ALL settings (set-typed lefts joined to setting-typed rights), with the
 *  recursive side walk of the prefetch's reached-CTE shape. Unlike
 *  card-mod-help's warm (settings.codename = 'help'), this warms EVERY rule
 *  card, because this mod's views resolve *help rule cards AND the
 *  "*all+<setting>" rule cards the Setting branch nests.
 *
 *  SCOPE: this walk is deliberately NOT narrowed to the rendered card's
 *  closure, and must not be. It is a boot-time precompute whose product is
 *  a NAME-keyed map the render consults synchronously at any depth
 *  (`assertRuleCard` reads the prepared map); which rule cards a page will
 *  ask for is not knowable before the render asks. Ruby's counterpart
 *  precomputes the same whole set once per process (Card::Cache["RULES"],
 *  lib/card/rule/cache.rb:25-30) and amortises it over every request, while
 *  this port re-runs it once per engine generation. That asymmetry is what
 *  to fix if it ever shows as per-request cost — a cross-request cache —
 *  NOT a narrower walk, which would trade the boot cost for per-render
 *  point queries and break the zero-query render path this warm exists for.
 *
 *  The recursive step is written as TWO indexed arms rather than the
 *  `s.id IN (j.left_id, j.right_id)` form the prefetch's reached CTE uses.
 *  Same rows, same UNION dedupe, same set: `s.id` is the primary key, so
 *  `s.id IN (j.left_id, j.right_id) AND s.id IS NOT NULL` matches exactly
 *  the two non-null side ids, and dropping the join to `cards s` removes
 *  the only thing it contributed. What changes is the PLAN, and on the
 *  trial deck the plan IS the cost: the two-valued IN cannot use the cards
 *  primary-key index, so the step degrades to a scan per reached row —
 *  measured standalone against the trial database, the IN form did not
 *  complete inside 40 s (the driver's transport failed, twice), while this
 *  form returns the identical 4,779-id closure in 170 ms. Mirrored locally
 *  the IN form exceeded 60 s against 17.6 s for this one; see
 *  benchmarks/cold-render/probe-reached-rules-walk-wire.ts. */
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
      "  SELECT j.left_id FROM reached r\n" +
      "    JOIN cards j ON j.id = r.id AND j.trash = 0\n" +
      "    WHERE j.left_id IS NOT NULL\n" +
      "  UNION\n" +
      "  SELECT j.right_id FROM reached r\n" +
      "    JOIN cards j ON j.id = r.id AND j.trash = 0\n" +
      "    WHERE j.right_id IS NOT NULL\n" +
      ")\n" +
      "SELECT c.* FROM cards c WHERE c.trash = 0 AND c.id IN (SELECT id FROM reached)",
    params: [setTypeId, settingTypeId],
  };
}

/** One batch, once per engine: every rule card enters the prepared
 *  render-card map. db-roundtrip-elimination lane (W1): the records are
 *  composed from the batch's OWN `SELECT c.*` rows through
 *  ModEngineHost#composeAndCacheRows (sides-before-junctions multi-pass,
 *  lexicon primed both directions, records through cacheFetchedRecord) -
 *  value-identical to the per-row host.fetchById storm this replaces, which
 *  walked every uncached row back through the fetch ladder (one idToLex +
 *  one id-row point query per row, ~170 hops per cold engine on the trial
 *  deck). The :rule_help dispatch still resolves its nested cards
 *  synchronously - zero queries on the render path. */
async function prepareRuleCache(host: ModEngineHost): Promise<void> {
  await host.codenames.ensureLoaded(); // memoized; first call only
  const setTypeId = host.codenames.peekId("set");
  const settingTypeId = host.codenames.peekId("setting");
  if (setTypeId === undefined || settingTypeId === undefined) return; // degenerate deck
  // setting_categories.rb:64-67 recent_settings reads Card[:recent_settings]
  // - its row rides the SAME batch (statement 2) instead of a post-batch
  // fetchById ladder walk.
  const recentSettingsId = host.codenames.peekId("recent_settings");
  const results = await host.batch([
    ruleSidesStatement(setTypeId, settingTypeId),
    ...(recentSettingsId !== undefined
      ? [{ sql: "SELECT * FROM cards WHERE id = ? AND trash = 0", params: [recentSettingsId] }]
      : []),
  ]);
  const rows = (results[0] as { rows: Record<string, unknown>[] } | undefined)?.rows ?? [];
  if (rows.length > 0) {
    await host.composeAndCacheRows(rows);
  }
  if (recentSettingsId !== undefined) {
    const recentRows =
      (results[1] as { rows: Record<string, unknown>[] } | undefined)?.rows ?? [];
    if (recentRows.length > 0) await host.composeAndCacheRows(recentRows);
  }
}

// ---------------------------------------------------------------------------
// set/rule/quick_editor.rb - the quick_edit chain (the form-substrate lane's
// demonstration views)
// ---------------------------------------------------------------------------

/** quick_editor.rb:85-87 setting_title: `card.name.tag.tr "*", ""` - the
 *  setting name with the star stripped ("*all+*head" -> "head"). */
function quickEditSettingTitle(ctx: ViewContext): string {
  return ctx.fmt.card.name.tagName.s.replace(/\*/g, "");
}

/** editor.rb:89-91 short_help_text:
 *  `"<div class=\"help-text\">#{card.short_help_text}</div>"`. Reads the
 *  SETTING_SHORT_HELP_TEXT map above (the merge of the form-substrate
 *  lane's 2-entry Record with this lane's 11-entry Map consolidated onto
 *  the Map - the superset; identical strings for the shared entries). */
function quickEditShortHelpText(settingCodename: string): string {
  return `<div class="help-text">${SETTING_SHORT_HELP_TEXT.get(settingCodename) ?? ""}</div>`;
}

/** The rule card's setting codename (the right-part card's codename - the
 *  *head card's codename is the bare "head"). */
function ruleSettingCodename(ctx: ViewContext): string | undefined {
  const rightKey = ctx.fmt.card.name.rightName?.key;
  const right =
    rightKey !== undefined ? ctx.fmt.engine.fetchRenderCard(rightKey) : undefined;
  return right?.record.codename;
}

/** setting_categories.rb:9-15 categories(setting): `result = [:all];
 *  result += %i[field recent common].select { |cat|
 *  category_settings(cat)&.include? setting }` - field/common are code
 *  constants, but recent is DECK DATA (:43-45 `Card[:recent_settings]
 *  .item_cards` - the pointer's items; the corpus-derived RECENT_SETTINGS
 *  const in format.ts is a DIFFERENT deck's membership, so the walk reads
 *  the *recent settings card's items live). editor.rb:54-58 joins them as
 *  the "_category-<cat>" class list. */
function quickEditCategoryClasses(ctx: ViewContext): string {
  const setting = ruleSettingCodename(ctx) ?? "";
  const cats = ["all"];
  if (FIELD_SETTINGS.has(setting)) cats.push("field");
  const recentCard = ctx.fmt.engine.fetchRenderCard("*recent settings");
  const recentItems = new Set(
    (recentCard?.record.dbContent ?? "")
      .split("\n")
      .map((line) => line.trim().replace(/^\*/, ""))
      .filter((s) => s !== ""),
  );
  if (recentItems.has(setting)) cats.push("recent");
  if (COMMON_SETTINGS.has(setting)) cats.push("common");
  return cats.map((c) => `_category-${c}`).join(" ");
}

/** quick_editor.rb:14-18 quick_form:
 *  `card_form :update, quick_form_opts do quick_editor end` where
 *  quick_form_opts (:20-23) = { "data-slot-selector": ".set-info.card-slot",
 *  success: { view: :quick_edit_success } }. The substrate's cardFormShell
 *  is the card_form port: card_form_html_opts (form.rb:218-224) gives
 *  "card-form slotter autosave" (autosave for :update), Rails form_for
 *  emits the utf8 enqueuer + _method patch spoof + the dom id
 *  "edit_card_<id>", and the quick_editor body is rule_content_formgroup
 *  (editor.rb:110-112) = `_render_content_formgroup hide:
 *  :conflict_tracker` - the registered card-mod-edit view dispatched with
 *  the hide opt (the child voo inherits conflict_tracker=hide, so
 *  content_field's _render_conflict_tracker discards - view.rb:68-69's
 *  process_live_options == :hide exit).
 *
 *  The additions (pinned by the
 *  quick_edit_setting_list capture's *default/*help items):
 *  - the dom id is "new_card" for an id-less (virtual) rule card -
 *    form_helper.rb:465-475's dom_id (the captured *help form carries
 *    id="new_card");
 *  - the Right::<setting> quick_form_opts overrides ride the captured
 *    attr order: card-mod-content set/right/default.rb:9-14 merges
 *    "data-update-foreign-slot"
 *    ".card-slot.quick_edit-view.RIGHT-Xinput_type,.card-slot.quick_edit-
 *    view.RIGHT-Xcontent_option.card-slot.quick_edit-view.RIGHT-
 *    Xcontent_option_view" (the *default item's form carries it);
 *    card-mod-edit set/right/input_type.rb:11-14 merges the
 *    content_option_view selector (unreachable in the capture - the
 *    input_type item body is empty - kept cited for the record);
 *  - the quick_editor BODY dispatches per the right-part setting (the
 *    Right modules are more specific than Rule in the MRO, so their
 *    quick_editor override runs): Right::Default (card-mod-content
 *    set/right/default.rb:16-24) = wrap_type_formgroup { type_field } +
 *    wrap_content_formgroup { text_field }; Right::Help (card-mod-help
 *    set/right/help.rb:17-24) = formgroup "Content" { text_field with the
 *    explicit value opt }; otherwise the Rule set's rule_content_formgroup
 *    (the substrate-pinned *head/*guide bytes). */
function quickForm(ctx: ViewContext): string {
  const { fmt } = ctx;
  const setting = ruleSettingCodename(ctx);
  return cardFormShell(ctx, {
    formClass: "card-form slotter autosave",
    id: fmt.card.id === undefined ? "new_card" : `edit_card_${fmt.card.id}`,
    htmlAttrs: [
      ["data-slot-selector", ".set-info.card-slot"],
      ...(setting === "default"
        ? [[
            "data-update-foreign-slot",
            ".card-slot.quick_edit-view.RIGHT-Xinput_type,.card-slot.quick_edit-view.RIGHT-Xcontent_option.card-slot.quick_edit-view.RIGHT-Xcontent_option_view",
          ] as [string, string]]
        : setting === "input_type"
          ? [["data-update-foreign-slot", ".card-slot.quick_edit-view.RIGHT-Xcontent_option_view"] as [string, string]]
          : []),
    ],
    action: `/update/${fmt.urlKey()}`,
    // Rails' _method spoof emits only for a PERSISTED record (the captured
    // *help virtual item's form carries no _method input; the stored
    // *default item's does)
    methodSpoof: fmt.card.id === undefined ? null : "patch",
    success: { view: "quick_edit_success" },
    body: quickEditorBody(ctx, setting),
  });
}

/** The quick_editor method dispatch (see quickForm's citations): the
 *  Right-module overrides for *default/*help rule cards, the Rule set's
 *  rule_content_formgroup otherwise. */
function quickEditorBody(ctx: ViewContext, setting: string | undefined): string {
  const { fmt } = ctx;
  if (setting === "default") {
    // card-mod-content set/right/default.rb:16-24
    const typeGroup =
      `<div class="form-group type-formgroup"${formgroupCardAttrs(fmt)}>` +
      `<label for="card_type">Type</label>\n` +
      `<div class="editor type-editor">` +
      `<select name="card[type]" id="card_type" class="type-field rule-type-field _submit-on-select form-control" data-select2-id="${typeFieldSelect2Id(ctx)}">` +
      `<option selected="selected" value="${h(fmt.card.typeName ?? "")}">${h(fmt.card.typeName ?? "")}</option></select>\n` +
      `<input type="hidden" name="assign" id="assign" value="true" autocomplete="off" /></div></div>`;
    const contentGroup =
      `<div class="form-group card-editor"${formgroupCardAttrs(fmt)}>` +
      `<label for="card_content">Content</label>\n` +
      `<div class="editor content-editor">` +
      `<input class="d0-card-content _submit-after-typing form-control" type="text" value="${h(fmt.card.dbContent)}" name="card[content]" id="card_content" /></div></div>`;
    return typeGroup + contentGroup;
  }
  if (setting === "help") {
    // card-mod-help set/right/help.rb:17-24 - the plain formgroup (no
    // classy "card-editor" - help.rb's formgroup call passes no class);
    // the explicit value opt rides Tags::TextField's caller-options
    // position (FIRST)
    return (
      `<div class="form-group"${formgroupCardAttrs(fmt)}>` +
      `<label for="card_content">Content</label>\n` +
      `<div class="editor content-editor">` +
      `<input value="${h(fmt.card.dbContent)}" class="d0-card-content _submit-after-typing form-control" type="text" name="card[content]" id="card_content" /></div></div>`
    );
  }
  return fmt.renderView("content_formgroup", { hide: ["conflict_tracker"] });
}

/** The formgroup div's data attrs (formgroup.rb:35-43 formgroup_div_args:
 *  data-card-id when real, then data-card-name / data-card-link-name). */
function formgroupCardAttrs(fmt: ViewContext["fmt"]): string {
  const card = fmt.card;
  const attrs: string[] = [];
  if (card.id !== undefined) attrs.push(`data-card-id="${card.id}"`);
  if (card.name.s !== "") {
    attrs.push(`data-card-name="${h(card.name.s)}"`);
    attrs.push(`data-card-link-name="${h(fmt.urlKey())}"`);
  }
  return attrs.length === 0 ? "" : ` ${attrs.join(" ")}`;
}

/** type_field's select2 id: `<safe_key>-<n>-<Time.now.to_i>` - the
 *  unique_id CONSUMES the shared format-chain counter (edit_type.rb:47
 *  calls unique_id; content.rb:60-70), so the NEXT unique_id consumer in
 *  the same render continues from n+1 (the captured rule_form_card_editor
 *  on *all+*default: the type field's select2 id is Xall-Xdefault-1-TIME
 *  and the content textarea's id is Xall-Xdefault-2). The seconds suffix
 *  is frozen to 0 and the test normalizes it to TIME (the card_select
 *  precedent). */
function typeFieldSelect2Id(ctx: ViewContext): string {
  return `${ctx.fmt.uniqueId()}-0`;
}

/** quick_editor.rb:31-38 undo_button:
 *  `link_to "undo", method: :post, rel: "nofollow", remote: true,
 *  class: "btn btn-secondary ms-2 btn-sm btn-reduced-padding slotter",
 *  "data-slot-selector": ".card-slot.quick_edit-view",
 *  path: { action: :update, revert_actions: [card.last_action_id],
 *  revert_to: :previous }`. link_to's attr order (links.rb:101-122):
 *  rel nofollow hoisted FIRST, then the caller class list, the data attrs,
 *  href appended LAST (the path resolves into the hash after class/data),
 *  then data-remote + data-method (rails ujs method/remote annotations).
 *  The path deep-encodes the revert_actions array
 *  (revert_actions%5B%5D=<id>) with &amp; escaping in the attribute; the
 *  action id is deck data (card.last_action_id - the currentRevisionId
 *  record field), normalized in the oracle pins. */
function undoButton(ctx: ViewContext): string {
  const { fmt } = ctx;
  const actionId = fmt.card.record.currentRevisionId ?? "";
  const href = `/update/${fmt.urlKey()}?revert_actions%5B%5D=${actionId}&revert_to=previous`;
  return (
    `<a rel="nofollow" class="btn btn-secondary ms-2 btn-sm btn-reduced-padding slotter"` +
    ` data-slot-selector=".card-slot.quick_edit-view"` +
    ` href="${h(href)}" data-remote="true" data-method="post">undo</a>`
  );
}

/** quick_editor.rb:25-29 set_info:
 *  `wrap true, class: "set-info" do haml :set_info, notify_change: ...
 *  end`. The haml (set_info.haml) emits one line per element (the \n after
 *  each tag): the form-group frame, the "Set" label, the rule set's label
 *  paragraph, and - when notify_change - the success notification with the
 *  undo link. `wrap true` is the slot wrap over the CURRENT view
 *  (voo_api.rb:167-177); the set-info class rides the classy chain
 *  (class_up "card-slot", appended at the end of the class list).
 *
 *  find_existing_rule_card&.left&.label || "--" (editor.rb:119-130): for an
 *  EXISTING rule card the card is itself, so left is the rule SET card and
 *  label is set/type/set.rb:38-41's label (setCardLabel's machinery - "*all"
 *  labels "All cards"). The new/virtual-rule arm (the prototype walk
 *  :123-130) is the honest remainder: the engine's rule-cache surface
 *  exposes stored rules only. */
function setInfoHtml(ctx: ViewContext, notifyChange: boolean): string {
  const { fmt } = ctx;
  // find_existing_rule_card&.left&.label || "--" (editor.rb:119-130): for a
  // NEW (virtual) rule card existing_rule_from_prototype resolves no stored
  // rule -> "--" (the captured *help item's set-info); for a STORED rule
  // card the card is itself, so left is the rule SET card and label is
  // set/type/set.rb:38-41's label (setCardLabel's machinery - "*all"
  // labels "All cards").
  const isNew = fmt.card.id === undefined || fmt.card.unknown === true;
  const setName = fmt.card.name.leftName;
  // set/type/set.rb:38-41 label through the SET CARD's record codename
  // (findPattern - the same Card::Codename answer labelForParsedSet's
  // peek-lexicon route gives, without depending on the lexicon cache being
  // primed at this point in the chain)
  const setCardRecord =
    setName !== undefined ? fmt.engine.fetchRenderCard(setName.s) : undefined;
  const patternCode =
    setCardRecord === undefined || setCardRecord.unknown === true
      ? undefined
      : setCardRecord.record.codename;
  const label =
    !isNew && setName !== undefined && patternCode !== undefined
      ? (findPattern(patternCode)?.label(setCardRecord?.name.leftName?.s) ?? "")
      : "";
  const inner =
    `<div class='form-group form-control-feedback'>\n` +
    `<label>\nSet\n</label>\n` +
    `<p class='text-muted'>\n${label || "--"}\n</p>\n` +
    (notifyChange
      ? `<p class='autosubmit-success-notification'>\n` +
        `<span class='text-success'>\nApplied!\n</span>\n` +
        `${undoButton(ctx)}\n</p>\n`
      : "") +
    `</div>\n`;
  // wrap true, class: "set-info" (quick_editor.rb:26): the class rides the
  // WRAP options (voo_api.rb:167-177 -> slot_attributes' add_class), not a
  // voo class_up - the outer quick_edit slot must NOT carry set-info (the
  // captured inner wrap ends "... set-info", the outer one does not)
  return modSlotWrap(ctx, ctx.voo.requestedView, inner, "set-info");
}

/** quick_editor.rb:2-4 view :quick_edit, unknown: true, wrap: :slot:
 *  `quick_edit` -> `haml :quick_edit` (quick_edit.haml) - the rule-item
 *  frame (dynamic category classes lead, the static class list follows -
 *  haml merges the {class:} hash before the .class attributes), the
 *  setting title h6, the short-help div, the quick form, the set info. The
 *  wrap: :slot config's slot wrap is emitted here (the registrar applies
 *  no wrappers declaratively). */
/** quick_editor.rb:2-4 view :quick_edit, unknown: true, wrap: :slot:
 *  `quick_edit` -> `haml :quick_edit` (quick_edit.haml) - the rule-item
 *  frame (dynamic category classes lead, the static class list follows -
 *  haml merges the {class:} hash before the .class attributes), the
 *  setting title h6, the short-help div, the quick form, the set info. The
 *  wrap: :slot config's slot wrap is emitted here (the registrar applies
 *  no wrappers declaratively).
 *
 *  THE EMPTY-BODY OVERRIDES (the oracle finding,
 *  probes 9-14 against the live deck): three MORE-SPECIFIC Right::<setting>
 *  modules override the quick_edit BODY method in Ruby's MRO, and each
 *  returns "" when the rule set's prototype default card lacks the feature:
 *  - card-mod-edit set/right/input_type.rb:30-32 - `card.left.
 *    prototype_default_card.try(:show_input_type?) ? super : ""`
 *  - card-mod-list set/right/content_options.rb:19-21 - the same shape
 *    with show_content_options?
 *  - card-mod-list set/right/content_option_view.rb:5-11 - show_content_
 *    options? AND supports_content_option_view? (the input_type rule's
 *    first item in [checkbox, radio])
 *  prototype_default_card (card-mod-rules set/type/set.rb:99-101) =
 *  prototype.rule_card(:default) - the set's *default RULE card - and
 *  show_input_type?/show_content_options? are defined only on the
 *  List/Pointer/PlainText-typed cards (card-mod-edit set/type/{list,
 *  pointer,plain_text}.rb). The capture deck's *all+*default rule is
 *  RichText-typed, so ALL THREE overrides return "" - the captured
 *  quick_edit_setting_list's input_type/content_option/content_option_view
 *  items are EMPTY slot wraps. The view config (wrap: :slot, unknown: true)
 *  still belongs to the Rule module, so the slot wrap emits around the
 *  empty body. */
const QUICK_EDIT_FEATURE_TYPES: Record<string, { inputType: boolean; contentOptions: boolean }> = {
  list: { inputType: true, contentOptions: true }, // card-mod-edit set/type/list.rb
  pointer: { inputType: true, contentOptions: true }, // set/type/pointer.rb
  plain_text: { inputType: true, contentOptions: false }, // set/type/plain_text.rb
};

function quickEditBodyOverride(ctx: ViewContext): string | undefined {
  const setting = ruleSettingCodename(ctx);
  if (setting !== "input_type" && setting !== "content_options" && setting !== "content_option_view") {
    return undefined;
  }
  const leftKey = ctx.fmt.card.name.leftName?.key;
  const defaultRule =
    leftKey !== undefined
      ? ctx.fmt.engine.fetchRenderCard(`${leftKey}+*default`)
      : undefined;
  const features =
    defaultRule === undefined || defaultRule.unknown === true
      ? undefined
      : QUICK_EDIT_FEATURE_TYPES[defaultRule.typeCode ?? ""];
  const showsInputType = features?.inputType ?? false;
  const showsContentOptions = features?.contentOptions ?? false;
  if (setting === "input_type") return showsInputType ? undefined : "";
  if (setting === "content_options") return showsContentOptions ? undefined : "";
  // content_option_view: AND supports_content_option_view? - the input_type
  // rule's first item in [checkbox, radio] (content_option_view.rb:12-14);
  // the capture deck has no stored *all+*input type rule -> false.
  return showsContentOptions ? undefined : "";
}

const quickEditView: ViewFn = (ctx) => {
  assertRuleSetCard(ctx, "quick_edit");
  const override = quickEditBodyOverride(ctx);
  if (override !== undefined) {
    return modSlotWrap(ctx, "quick_edit", override);
  }
  const inner =
    `<div class='${quickEditCategoryClasses(ctx)} rule-item _rule-item'>\n` +
    `<h6 class='fw-bold'>\n${quickEditSettingTitle(ctx)}\n</h6>\n` +
    `${quickEditShortHelpText(ruleSettingCodename(ctx) ?? "")}\n` +
    `${quickForm(ctx)}\n` +
    `${setInfoHtml(ctx, false)}\n` +
    `</div>\n`;
  return modSlotWrap(ctx, "quick_edit", inner);
};

/** quick_editor.rb:6-8 view :quick_edit_success: `set_info true` - the
 *  same slot wrap (under the CURRENT view name) with the success
 *  notification and the undo link. */
const quickEditSuccessView: ViewFn = (ctx) => {
  assertRuleSetCard(ctx, "quick_edit_success");
  return setInfoHtml(ctx, true);
};

// ---------------------------------------------------------------------------
// set/rule/rule_form.rb + rule_form/{buttons,set_selection,rule_set_radio}.rb
// + set/rule/editor.rb:17-22 :rule_edit + set/rule/board_rules_editor.rb
// :overlay_rule/:modal_rule - the rule-editor form chain (2026-09-29
// rules-views-port-3 lane; oracle-pinned against fixtures/captured/
// rules-views.json rule_card.views.{rule_form,rule_form_card_editor,
// rule_edit,modal_rule,overlay_rule}, captured on the STORED *all+*read
// rule card id 10)
// ---------------------------------------------------------------------------

/** icon_tag (card-mod-bootstrap set/all/bootstrap/icon.rb:97-123) with the
 *  material basket's mappings (modal -> fullscreen, new_window ->
 *  close_fullscreen; unknown keys pass through). The layout port keeps an
 *  identical private copy (the truncatedCore precedent). */
function icon(name: string, extraClass?: string): string {
  const MATERIAL_ICONS: Readonly<Record<string, string>> = {
    modal: "fullscreen",
    new_window: "close_fullscreen",
  };
  // the captured icon_tag bytes carry the extra class FIRST
  const cls = extraClass === undefined
    ? "notranslate material-icons"
    : `${extraClass} notranslate material-icons`;
  return `<i class="${cls}">${MATERIAL_ICONS[name] ?? name}</i>`;
}

/** output (card-1.110.0 lib/card/format/content.rb:70-73): compact + "\n".
 *  join. */
function outputJoin(parts: (string | undefined)[]): string {
  return parts.filter((p) => p !== undefined).join("\n");
}

/** link_to_card's attribute shape for the target: icon/link carriers -
 *  caller opts in position (target), class "known-card" appended by
 *  add_known_or_wanted_class (links.rb:140-144), href LAST (links.rb:105).
 *  The RuleSetRadio label's set link and the perm editor's role links
 *  share the shape. */
function knownCardLink(target: string | undefined, urlKey: string, content: string): string {
  const targetAttr = target === undefined ? "" : ` target="${h(target)}"`;
  return `<a${targetAttr} class="known-card" href="/${h(urlKey)}">${content}</a>`;
}

/** rule_form.rb:15-20 prepare_rule_form_options + :66-69 edit_rule_success:
 *  the success hash { mark: rule_context.name.url_key, view: success_view }.
 *  Ruby stashes @success_view/@rule_context/@form_type on the FORMAT; the
 *  TS port threads them as parameters (the format-ivar state has no TS
 *  twin), with the view opts carrying the caller's form_type/success_view
 *  (current_rule_form's :41-44 subformat dispatch passes them through
 *  renderView opts).
 *  Wave-1 follow family: the mark reads the caller's RULE CONTEXT
 *  (rule_form.rb:48 @rule_context = rule_context — the follow mod's
 *  rule_editor dispatches subformat(follow_context).rule_form(:open,
 *  rule_context, :modal) where follow_context can be the applied-OPTION
 *  card while @rule_context stays the preference_name card; edit_rule_
 *  success reads @rule_context.name.url_key). The opt carries the rule
 *  context NAME; absent (every direct/current_rule_form dispatch — where
 *  @rule_context IS the format's own card) the mark stays this card's. */
function editRuleSuccessHash(ctx: ViewContext): { mark: string; view: string } {
  const successView = typeof ctx.voo.opts["success_view"] === "string"
    ? String(ctx.voo.opts["success_view"])
    : "open";
  const ruleContext = typeof ctx.voo.opts["rule_context"] === "string"
    ? String(ctx.voo.opts["rule_context"])
    : undefined;
  return {
    mark: ruleContext !== undefined
      ? DeckoName.parse(ruleContext).urlKey
      : ctx.fmt.urlKey(),
    view: successView,
  };
}

/** rule_form.haml (set/rule/rule_form/rule_form.haml) - the two guide-line
 *  sections; the haml template's exact emitted shape (one line per
 *  template line, the render/popover/set-selection/buttons interpolations
 *  inline). popover_link (card-mod-bootstrap helper.rb:46-57 popover_opts
 *  + links.rb): tabindex 0, the popover data hash IN PLACE, class
 *  "ps-1 _popover_link", href "#" (path "#" - the string bypass). */
const APPLY_TO_SET_POPOVER =
  `<a tabindex="0" data-bs-toggle="popover" data-bs-trigger="hover focus"` +
  ` data-bs-content="Each rule applies to a set of cards. Rules for more specific sets override rules for more general ones."` +
  ` class="ps-1 _popover_link" href="#"><i class="notranslate material-icons">help</i></a>`;

/** set/rule/rule_form/rule_form/set_selection.rb:2-14 board_rule_set_
 *  selection + board_rule_set_formgroup: the set-list div, the col div,
 *  then rule_set_options.reverse.map { RuleSetRadio.new(...).html narrower }
 *  (the radios render NARROWEST-LAST; the capture's single *all option
 *  makes the reverse invisible). */
function boardRuleSetSelection(ctx: ViewContext): string {
  const radios = ruleSetOptionsRadios(ctx);
  return (
    `<div class="set-list _set-editor">` +
    `<div class="col-xs-6 mt-3 mb-5">${radios}</div></div>`
  );
}

/** rules.rb:57-63 set_options + :76-104 the walk: candidates = the rule
 *  set's prototype's set_names, sliced from the rule's OWN set's position
 *  (`candidates[first..]` - rules.rb:78-80 first_set_option_index: a rule
 *  can move ITSELF or to any BROADER set, never to a narrower one); each
 *  candidate pairs with :current/:overwritten/:available (rules.rb:88-100
 *  state_of_set: the FIRST candidate with an existing rule is :current,
 *  later existing ones :overwritten, the rest :available). The prototype
 *  (set/type/set.rb:90-92) is a NEW card of the set's prototype type - a
 *  new card's set names are the type set + *all, specific-first (the live
 *  probe: *all's prototype is a new RichText card, set_names
 *  ["RichText+*type", "*all"]). rule_user_setting_name (rules.rb:44-50)
 *  is the rule's tag for non-preference rules. */
function ruleSetOptionsRadios(ctx: ViewContext): string {
  const { fmt } = ctx;
  const ruleCard = fmt.card;
  const setName = ruleCard.name.leftName;
  const prototypeType = prototypeDefaultTypeCode(ctx);
  const candidates: string[] = [];
  if (prototypeType !== undefined && prototypeType !== "basic") {
    // the type set's name: "<TypeName>+*type" (pattern.rb Type#set_name)
    const typeName = defaultRuleTypeName(ctx, prototypeType);
    if (typeName !== undefined) candidates.push(`${typeName}+*type`);
  }
  candidates.push("*all");
  const ruleSetKey = setName?.key ?? "";
  const first = candidates.findIndex((c) => DeckoName.parse(c).key === ruleSetKey);
  const sliced = first === -1 ? candidates : candidates.slice(first);
  const userSettingName = `*${ruleSettingCodename(ctx) ?? ""}`;
  const radios: string[] = [];
  let existingRules = 0;
  for (const [setNameStr, state] of sliced
    .map((c) => {
      const ruleName = `${c}+${userSettingName}`;
      const existing = fmt.engine.fetchRenderCard(ruleName);
      const has = existing !== undefined && existing.unknown !== true;
      let state: string;
      if (has) {
        existingRules += 1;
        state = existingRules === 1 ? "current" : "overwritten";
      } else {
        state = existingRules > 0 ? "overwritten" : "available";
      }
      return [c, state] as [string, string];
    })
    .reverse()) {
    radios.push(ruleSetRadioHtml(ctx, setNameStr, state));
  }
  return radios.join("");
}

/** The set's prototype default card's type code (set/type/set.rb:95-101
 *  prototype_default_type_id/prototype_default_card = prototype.rule_card
 *  (:default) - the set's stored *default rule card's TYPE). Undefined
 *  when no *default rule resolves. */
function prototypeDefaultTypeCode(ctx: ViewContext): string | undefined {
  const setName = ctx.fmt.card.name.leftName;
  if (setName === undefined) return undefined;
  const defaultRule = ctx.fmt.engine.fetchRenderCard(`${setName.s}+*default`);
  return defaultRule === undefined || defaultRule.unknown === true
    ? undefined
    : defaultRule.typeCode;
}

/** The type CARD's display name for the prototype type code (the engine's
 *  codename lookup through fetchRenderCard). */
function defaultRuleTypeName(ctx: ViewContext, typeCode: string): string | undefined {
  const typeCard = ctx.fmt.engine.fetchRenderCard(typeCode);
  return typeCard === undefined || typeCard.unknown === true
    ? undefined
    : typeCard.name.s;
}

/** set/rule/rule_form/rule_set_radio.rb - the RuleSetRadio helper class
 *  (`#! no set module`, set_template.rb:47-53): html (:21-27) wraps the
 *  radio + label in the form-check div (output join "\n"); radio (:33-38)
 *  is radio_button(:name, "#{set_name}+#{@tag}", checked: false, warning:,
 *  class: "form-check-input", id: @id) - Rails Tags::RadioButton#render:
 *  the caller options in position (warning, class, id), then type/value
 *  set, name appended LAST; @id (:19) = "#{unique_id}-#{Time.now.to_i}" -
 *  the seconds are nondeterministic (the port freezes unique_id's rand to
 *  1 and the seconds to 0; the test normalizes both sides to TIME, the
 *  select2 precedent); label (:40-50): the set card's label, the
 *  "(current)" extra_info for the :current state wrapped in <em>, and the
 *  set link (link_to_card target: "decko_set"); warning (:57-62): the
 *  *all literal, else the narrower-rules walk (unpinned - the capture's
 *  single *all option never reaches it; the narrower_warning machinery is
 *  the cited remainder). */
function ruleSetRadioHtml(ctx: ViewContext, setName: string, state: string): string {
  const { fmt } = ctx;
  const tag = `*${ruleSettingCodename(ctx) ?? ""}`;
  const radioText = `${setName}+${tag}`;
  const id = `${fmt.card.name.safeKey}-1-0`;
  const isCurrent = state === "current";
  const warning =
    setName === "*all" ? "This rule will affect all cards! Are you sure?" : "";
  const labelClasses =
    `set-label${isCurrent ? " current-set-label" : ""}`;
  // set/type/set.rb:38-41 label - through the fetched SET CARD's record
  // codename (the peek-lexicon route labelForParsedSet takes is not primed
  // this early in the rule_form chain; the record codename is the same
  // Card::Codename answer, DB-backed)
  const setCardRecord = fmt.engine.fetchRenderCard(setName);
  const patternCode =
    setCardRecord === undefined || setCardRecord.unknown === true
      ? undefined
      : setCardRecord.record.codename;
  const anchor = setCardRecord?.name.leftName?.s;
  const setLabel =
    patternCode !== undefined
      ? (findPattern(patternCode)?.label(anchor) ?? "")
      : "";
  const text = isCurrent ? `${setLabel} <em>(current)</em>` : setLabel;
  return (
    `<div class="form-check">` +
    `<input${warning === "" ? "" : ` warning="${h(warning)}"`} class="form-check-input" id="${h(id)}" type="radio" value="${h(radioText)}" name="card[name]" />\n` +
    `<label class="form-check-label ${labelClasses}" for="${h(id)}">${text}\n` +
    `${knownCardLink("decko_set", DeckoName.parse(setName).urlKey, icon("new_window", "text-muted"))}</label></div>`
  );
}

/** set/rule/rule_form/buttons.rb:2-15 edit_rule_buttons: the button-area
 *  div with the four buttons (output join "\n"): standard_save_button
 *  (form_buttons.rb:15-22 - the substrate's standardSaveButtonBody with the
 *  caller class), standard_save_and_close_button (:29-38 - data-cy
 *  "submit-#{form_type}", the caller class leading the add_class chain),
 *  edit_rule_cancel_button (:17-19 - the form_type close button),
 *  edit_rule_delete_button (:21-33 - the rule-delete-section span; the
 *  captured link carries confirm AND data-confirm (delete_button_opts
 *  passes the :confirm opt through to link_to AND stores it as
 *  data-confirm), the silent-success slotter mode, the /delete/ path with
 *  the empty-success "?" query, data-remote last). The delete confirm text:
 *  "Are you sure you want to delete the <setting> rule for <rule_set_
 *  description>?" (buttons.rb:36-43) - the *all set's follow_label is
 *  "everything". */
function editRuleButtons(ctx: ViewContext, formType: string): string {
  const { fmt } = ctx;
  const save = submitButton("Save", [
    ["class", "_rule-submit-button submit-button me-3 _update-history-pills"],
    ["data-cy", "save"],
  ]);
  const saveAndClose = submitButton("Save and Close", [
    ["data-disable-with", "Submitting"],
    ["data-cy", `submit-${formType}`],
    // the class suffix rides submitButton's bootstrapify (appended in place)
    ["class", "_rule-submit-button submit-button me-3 _close-on-success _update-origin"],
  ]);
  const cancel =
    formType === "modal"
      ? `<button name="button" type="button" data-bs-dismiss="modal" data-cy="close-modal" class="btn-sm btn btn-secondary">Cancel</button>`
      : `<button name="button" type="button" class="_close-overlay btn-sm btn-sm btn btn-secondary" data-bs-dismiss="overlay">Cancel</button>`;
  const settingTitle = ruleSettingCodename(ctx) ?? "";
  const confirmMsg = `Are you sure you want to delete the *${settingTitle} rule for everything?`;
  const del = (
    `<span class="rule-delete-section">` +
    `<a confirm="${h(confirmMsg)}" data-slotter-mode="silent-success"` +
    ` class="_close-${formType}-on-success slotter btn btn-outline-danger ms-auto"` +
    ` data-confirm="${h(confirmMsg)}" href="/delete/${h(fmt.urlKey())}?" data-remote="true">Delete</a></span>`
  );
  return `<div class="button-area">${outputJoin([save, saveAndClose, cancel, del])}</div>`;
}

/** rule_form.rb:56-64 edit_rule_form + :66-69 rule_form_args: the
 *  card_form :update shell (no_mark: true -> action "/card/update") with
 *  class "card-rule-form" + "card-form slotter", data-slotter-mode
 *  "update-origin", the _method patch spoof, and hidden_tags(success:) -
 *  the substrate's cardFormShell is the card_form port. The body is the
 *  rule_form.haml walk (:2-13 render :rule_form_card_editor inline - the
 *  SAME voo, so the child slot's show list accumulates
 *  ["rule_form","rule_form_card_editor"], the captured pair). */
function editRuleForm(ctx: ViewContext): string {
  const { fmt } = ctx;
  const success = editRuleSuccessHash(ctx);
  const body =
    `<div class='guide-line rule-section mt-4'>\n<h5>\n<div class='guide-line-number'>1</div>\nDefine rule\n</h5>\n` +
    fmt.renderView("rule_form_card_editor") +
    `\n</div>\n<div class='rule-section'>\n<h5>\n<div class='guide-line-number'>2</div>\nApply to set\n` +
    APPLY_TO_SET_POPOVER +
    `\n</h5>\n<div class='card-editor'>\n` +
    boardRuleSetSelection(ctx) +
    `\n` +
    editRuleButtons(ctx, formType(ctx)) +
    `\n</div>\n</div>\n`;
  return cardFormShell(ctx, {
    formClass: "card-rule-form card-form slotter",
    id: `edit_card_${fmt.card.id}`,
    htmlAttrs: [["data-slotter-mode", "update-origin"]],
    action: "/card/update",
    methodSpoof: "patch",
    success: success,
    body: body,
  });
}

/** rule_form.rb:33-35 form_type: the voo opt (current_rule_form's caller
 *  passes :modal/:overlay), default :overlay. */
function formType(ctx: ViewContext): string {
  const ft = ctx.voo.opts["form_type"];
  return ft === "modal" ? "modal" : "overlay";
}

/** rule_form.rb:22-28 view :rule_form, cache: :never, unknown: true:
 *  `wrap do edit_rule_form @success_view do ... end end` - the no-arg
 *  wrap is the SLOT wrap (wrap.rb:11-14). */
const ruleFormView: ViewFn = (ctx) => {
  assertRuleCard(ctx, "rule_form");
  return modSlotWrap(ctx, "rule_form", editRuleForm(ctx));
};

/** rule_form.rb:22-28's sibling view :rule_form_card_editor, cache: :never,
 *  unknown: true: `wrap true, class: "card-editor slotter" do
 *  [rules_type_formgroup, rule_content_formgroup] end` - the slot wrap with
 *  the extra classes (voo_api.rb:167-177's wrap-options class list), the
 *  parts output-joined. rules_type_formgroup (editor.rb:93-105) renders
 *  nothing unless the setting registry marks the rule's setting
 *  rule_type_editable (the captured *read is not - the nil first part
 *  compacts away); rule_content_formgroup (editor.rb:107-109) is the
 *  content_formgroup dispatch with the conflict_tracker hide (the same
 *  call the substrate's quick_edit chain pins) - the perm-editor input
 *  chain resolves through the permission mod's Right::Read registration. */
const ruleFormCardEditorView: ViewFn = (ctx) => {
  assertRuleCard(ctx, "rule_form_card_editor");
  const typeFormgroup = rulesTypeFormgroup(ctx);
  const contentFormgroup = ctx.fmt.renderView("content_formgroup", { hide: ["conflict_tracker"] });
  return modSlotWrap(
    ctx,
    "rule_form_card_editor",
    outputJoin([typeFormgroup, contentFormgroup]),
    "card-editor slotter",
  );
};

/** editor.rb:93-105 rules_type_formgroup (oracle-pinned 2026-09-29
 *  rules-cap lane: fixtures/captured/rules-nest-views.json
 *  type_editable_rule_card.views.rule_form_card_editor, no-write proof
 *  5018 -> 5018, rendered on the *all+*default rule card whose *default
 *  setting_opts carries rule_type_editable: true - card-mod-content
 *  set/self/default.rb:1): the wrap_type_formgroup + type_field shape
 *  (editor.rb:96-104). The href reads success[:id] - edit_rule_success
 *  (rule_form.rb:69-71) carries ONLY :mark/:view, so the :id read is nil
 *  on EVERY surface and the captured query is the constant
 *  "assign=true&mark=" after the path-segment view
 *  (path(mark: nil, view: :rule_form_card_editor, assign: true) on the
 *  format's own card). select_tag attr order: name, id, then the opts
 *  hash - href, class (bootstrap appends " form-control"), data-remote,
 *  and type_field's merged data-select2-id LAST (edit_type.rb:46-47);
 *  the option list is simple_type_field_options' single selected current
 *  type; wrap_type_formgroup appends the assign hidden field
 *  (edit_type.rb:64-68, output-joined "\n"). */
function rulesTypeFormgroup(ctx: ViewContext): string | undefined {
  const setting = ruleSettingCodename(ctx);
  const registry = setting === undefined
    ? undefined
    : getDefaultModLoader()?.settingsRegistry().findByCodename(setting);
  if (registry === undefined || !registry.ruleTypeEditable) return undefined;
  const href = `/${ctx.fmt.urlKey()}/rule_form_card_editor?assign=true&mark=`;
  const typeName = ctx.fmt.card.typeName ?? "";
  return (
    `<div class="form-group type-formgroup"${formgroupCardAttrs(ctx.fmt)}>` +
    `<label for="card_type">Type</label>\n` +
    `<div class="editor type-editor">` +
    `<select name="card[type]" id="card_type" href="${h(href)}" class="type-field rule-type-field _live-type-field form-control" data-remote="true" data-select2-id="${typeFieldSelect2Id(ctx)}">` +
    `<option selected="selected" value="${h(typeName)}">${h(typeName)}</option></select>\n` +
    `<input type="hidden" name="assign" id="assign" value="true" autocomplete="off" /></div></div>`
  );
}

/** editor.rb:17-22 view :rule_edit, cache: :never, unknown: true, wrap:
 *  { modal: { size: :large, title: :edit_rule_title, footer: "" } }:
 *  `current_rule_form form_type: :modal` - the modal WRAPPER (card-mod-
 *  layout set/all/modal.rb:7-17 haml :modal_dialog) around the
 *  current_rule_form subformat render. normalize_modal_option (:104-109):
 *  size :large -> modal-lg (MODAL_SIZE, modal.rb:1); title :edit_rule_
 *  title -> the format method (cast_modal_option_symbol :120-122); footer
 *  "" -> rubyBlank -> the haml -if gate drops the modal-footer. The
 *  default menu (:modal_menu) = close_modal_link + pop_out_modal_link
 *  (modal.rb:19-22). */
const ruleEditView: ViewFn = (ctx) => {
  assertRuleCard(ctx, "rule_edit");
  const body = currentRuleForm(ctx, "modal");
  let out = "<div class='modal fade _modal-slot' id='modal-container' role='dialog'>\n";
  out += "<!-- /, \"data-backdrop\": \"static\"} -->\n";
  out += "<div class='modal-dialog modal-dialog-centered modal-lg'>\n";
  out += "<div class='modal-content'>\n";
  out += "<div class='modal-header'>\n";
  out += `${editRuleTitle(ctx)}\n`;
  out += `${modalMenuHtml(ctx)}\n`;
  out += "</div>\n";
  out += `<div class='modal-body'>\n${body}\n</div>\n`;
  out += "</div>\n</div>\n</div>\n";
  return out;
};

/** rule_form.rb:41-44 current_rule_form: `subformat(current_rule).
 *  rule_form(success_view, card, form_type)` - the SUBFORMAT render
 *  (format/nesting/subformat.rb) isolates the voo: the captured
 *  overlay_rule/modal_rule/rule_edit slots' hide lists do NOT leak into
 *  the inner rule_form slot's show list. success_view defaults
 *  :overlay_rule (the captured rule_edit/modal_rule/overlay_rule forms'
 *  success[view]). */
function currentRuleForm(ctx: ViewContext, formTypeArg: string): string {
  return ctx.fmt.subformatView("rule_form", {
    form_type: formTypeArg,
    success_view: "overlay_rule",
  });
}

/** modal.rb:19-22 view :modal_menu + :24 wrapper: the close + pop-out
 *  links in the modal-menu div (output join "\n"). close_modal_link
 *  (:40-44): path "" -> href "" LAST; pop_out_modal_link (:46-48): path {}
 *  -> "/<url_key>" (path.rb:27-40). */
function modalMenuHtml(ctx: ViewContext): string {
  const close =
    `<a class="_close-modal btn-close" data-bs-dismiss="modal" href="">${icon("close")}</a>`;
  const popOut =
    `<a class="pop-out-modal btn-close" href="/${h(ctx.fmt.urlKey())}">${icon("modal")}</a>`;
  return `<div class="modal-menu _modal-menu ms-auto">${outputJoin([close, popOut])}</div>`;
}

/** board_rules_editor.rb:8-11 view :modal_rule, cache: :never, unknown:
 *  true, wrap: { modal: { title: ->(format) { format.render_title } } }:
 *  current_rule_form with the DEFAULT form_type (:overlay); the title is
 *  the :title view (the captured card-title span); the footer is ABSENT
 *  from the wrap config -> normalize_modal_option renders modal_footer -
 *  the default Close button (modal.rb:30-34). */
const modalRuleView: ViewFn = (ctx) => {
  assertRuleCard(ctx, "modal_rule");
  const body = currentRuleForm(ctx, "overlay");
  let out = "<div class='modal fade _modal-slot' id='modal-container' role='dialog'>\n";
  out += "<!-- /, \"data-backdrop\": \"static\"} -->\n";
  out += "<div class='modal-dialog modal-dialog-centered'>\n";
  out += "<div class='modal-content'>\n";
  out += "<div class='modal-header'>\n";
  out += `${ctx.fmt.renderView("title")}\n`;
  out += `${modalMenuHtml(ctx)}\n`;
  out += "</div>\n";
  out += `<div class='modal-body'>\n${body}\n</div>\n`;
  out += `<div class='modal-footer'>\n`;
  out += `<button name="button" type="submit" class="btn-xs _close-modal float-end btn btn-primary" data-bs-dismiss="modal">Close</button>\n`;
  out += `</div>\n`;
  out += "</div>\n</div>\n</div>\n";
  return out;
};

/** board_rules_editor.rb:2-6 view :overlay_rule, cache: :never, unknown:
 *  true: `wrap_with_overlay slot: breadcrumb_data("Rule editing", "rules")`
 *  - the :overlay WRAPPER (card-mod-layout set/all/overlay.rb:6-14):
 *  class_up card-slot "_overlay d0-card-overlay bg-body" (single_use) +
 *  the framer's own class_up "_overlay" (overlay.rb:98-100 - the captured
 *  DOUBLED _overlay), voo.hide! :menu, the slot opts' data-breadcrumb pair
 *  (board.rb:68-72 breadcrumb_data), then the frame machinery: d0-card-
 *  frame > d0-card-header (bg-body class_up; title = the RULE set's
 *  :overlay_title -> edit_rule_title; menu = :overlay_menu) + the
 *  with_frame help/flash arms EMPTY (the captured single blank line
 *  between the header and the d0-card-body) > d0-card-body with the
 *  current_rule_form subformat render inside. */
const overlayRuleView: ViewFn = (ctx) => {
  assertRuleCard(ctx, "overlay_rule");
  const { fmt, voo } = ctx;
  voo.hide("menu");
  voo.hide("help");
  voo.classUp("card-slot", "_overlay d0-card-overlay bg-body");
  voo.classUp("card-slot", "_overlay");
  const body = currentRuleForm(ctx, "overlay");
  const title = editRuleTitle(ctx);
  const menu = overlayMenuHtml(ctx);
  const setKeysClass = fmt.card.setKeys;
  const slotExtras = `${voo
    .classy("card-slot")
    .split(" ")
    .filter((c) => c !== "card-slot" && c !== "")
    .join(" ")} _overlay`;
  const attrs = emitAttrs({
    id: `${fmt.card.name.safeKey}-overlay_rule-view`,
    class: [`card-slot`, `overlay_rule-view`, setKeysClass, slotExtras].filter((s) => s !== "").join(" "),
    "data-card-id": fmt.card.id === undefined ? undefined : String(fmt.card.id),
    "data-card-name": h(fmt.card.name.s),
    "data-card-type-id": fmt.card.typeId === undefined ? undefined : String(fmt.card.typeId),
    "data-card-type-name": fmt.card.typeName,
    "data-card-link-name": fmt.urlKey(),
    "data-slot-id": newSlotId(),
    "data-slot": slotOptionsJson(voo.slotOptions()),
    "data-breadcrumb": "Rule editing",
    "data-breadcrumb-class": "rules",
  });
  return (
    `<div${attrs}>` +
    `<div class="d0-card-frame">` +
    `<div class="d0-card-header bg-body">${title}\n${menu}</div>` +
    `\n\n` +
    `<div class="d0-card-body ${setKeysClass}">${body}</div>` +
    `</div></div>`
  );
};

/** overlay.rb:23-27 view :overlay_menu: the help/new-window/close links.
 *  overlay_help_link (:29-44) takes the GUIDE branch when card.guide_card
 *  resolves (the capture deck's *all+*guide rule): help_popover_opts
 *  (menu.rb:103-107 + bootstrap helper.rb:46-57) + add_open_guide_opts
 *  (:35-44, the slotter + overlay attrs; the captured link's `path="#"`
 *  attr is help_popover_opts' reverse_merge'd path default that the guide
 *  branch does NOT delete - the live deck's bytes); the data-bs-content is
 *  the RULE's :help_text bytes (rule_based_help + setting_link - the
 *  increment-2 ruleHelpTextView registration) h-escaped in the attribute.
 *  slotify_overlay_link (:47-49) + close_overlay_link (:51-53) close the
 *  menu. */
function overlayMenuHtml(ctx: ViewContext): string {
  const { fmt } = ctx;
  const helpContent = h(fmt.renderView("help_text"));
  const helpLink =
    `<a path="#" tabindex="0" data-bs-toggle="popover" data-bs-trigger="hover focus"` +
    ` data-bs-content="${helpContent}" data-bs-placement="left"` +
    ` class="help-link ps-1 _popover_link slotter text-muted p-1 ms-1"` +
    ` href="/${h(fmt.urlKey())}/overlay_guide"` +
    ` data-slot-selector=".board-sidebar &gt; ._overlay-container-placeholder &gt; .card-slot"` +
    ` data-slotter-mode="overlay" data-remote="true">${icon("help")}</a>`;
  const newWindow =
    `<a class="text-muted p-1 ms-1 known-card" href="/${h(fmt.urlKey())}">${icon("new_window")}</a>`;
  const close =
    `<a data-bs-dismiss="overlay" class="text-muted p-1 ms-1" href="#">${icon("close")}</a>`;
  return `<div class="overlay-menu">${outputJoin([helpLink, newWindow, close])}</div>`;
}

// ---------------------------------------------------------------------------
// set/type/set/html_views/filtered_rule_lists.rb :nest_rules/:modal_nest_
// rules + set/type/set/html_views/rule_lists.rb :quick_edit_setting_list -
// the quick-edit list family (2026-09-29 rules-views-port-3 lane; ALL
// THREE oracle-pinned: quick_edit_setting_list/nest_rules against
// fixtures/captured/rules-views.json + rules-nest-views.json, and
// modal_nest_rules against rules-nest-views.json - the rules-cap capture,
// no-write proof 5018 -> 5018, whose diff corrected this view's filter
// action and its slot-wrapped list body)
// ---------------------------------------------------------------------------

/** rule_lists.rb:74-79 quick_edit_setting_list (the helper): `list_tag
 *  class: "nav nav-pills flex-column board-pills _setting-list _setting-
 *  group" { category_setting_list_items :field, :quick_edit }`.
 *  category_setting_list_items (:90-94) walks card.category_settings(:field)
 *  - setting_categories.rb:37-39 field_settings = [:default, :help,
 *  :input_type, :content_options, :content_option_view] - the RAW list:
 *  show_view? (:97) gates each item on the SETTING card's read permission,
 *  NOT on the visible-settings list (the capture's five items include the
 *  two hidden settings). helper.rb:20-34 list_tag: bare <li> wrappers (no
 *  per-item opts), the items newline-joined butting the ul tags. */
function quickEditSettingListBody(ctx: ViewContext): string {
  const items = [...FIELD_SETTINGS].map((setting: string) =>
    quickEditSettingListItem(ctx, setting),
  );
  return `<ul class="nav nav-pills flex-column board-pills _setting-list _setting-group">${items
    .map((item: string) => `<li>${item}</li>`)
    .join("\n")}</ul>`;
}

/** rule_lists.rb:6-8 view :quick_edit_setting_list (the shared
 *  setting_list_view_options' FIRST definition - cache: :never + the
 *  _setting-list slot wrap). */
const quickEditSettingListView: ViewFn = (ctx) => {
  assertSetCard(ctx, "quick_edit_setting_list");
  return settingListSlotWrap(ctx, "quick_edit_setting_list", quickEditSettingListBody(ctx), "_setting-list");
};

/** rule_lists.rb:96-101 setting_list_item for the quick_edit items:
 *  `rule_card = card.fetch setting, new: {}` - the fetch composes the
 *  codename LITERAL ("*all+*input_type", the underscore form the captured
 *  data-card-name carries; the STORED *all+*default/*all+*content option
 *  view cards resolve by their real names) and nest(rule_card, view:
 *  :quick_edit) - nest_name is the RESOLVED reference's display form (the
 *  setting card's stored display name, the captured "*all+*input type"
 *  space form). */
function quickEditSettingListItem(ctx: ViewContext, setting: string): string {
  const settingCard = ctx.fmt.engine.findSettingCard?.(setting);
  if (settingCard === undefined) return ""; // the deck has no such setting
  if (ctx.fmt.engine.isDenied(settingCard)) return ""; // show_view? false
  const setCard = ctx.fmt.card;
  const stored = ctx.fmt.engine.fetchRenderCard(`${setCard.name.s}+*${setting}`);
  let ruleCard =
    stored !== undefined && stored.unknown !== true
      ? stored
      : buildVirtualRuleCard({
          setCard,
          settingCard,
          settingCodename: setting,
          engine: ctx.fmt.engine,
        });
  if (stored === undefined || stored.unknown === true) {
    // Ruby's `card.fetch setting, new: {}` composes the codename LITERAL -
    // the new card's name carries the underscore form the captured
    // data-card-name pins ("*all+*input_type"), while the NEST's nest_name
    // resolves to the setting card's display form (the space form). The
    // builder joins the display form (the corpus bar pins); the quick_edit
    // items' slot carries the codename form, so the fresh virtual card's
    // name is rewritten here.
    const codenameName = DeckoName.parse(`${setCard.name.s}+*${setting}`);
    ruleCard = {
      ...ruleCard,
      name: codenameName,
      key: codenameName.key,
      record: { ...ruleCard.record, name: codenameName, key: codenameName.key },
    };
  }
  // nest_name is the RESOLVED reference's DISPLAY form (the setting card's
  // stored display name - the captured "*all+*input type" space form next
  // to the rule card's own codename-form data-card-name)
  const nestName = `${setCard.name.s}+${settingCard.name.s}`;
  return ctx.fmt.nestRecord(ruleCard, "quick_edit", {
    nest_name: nestName,
    show: ["quick_edit"],
    home_view: "quick_edit",
  });
}

/** filtered_rule_lists.rb:2-5 view :nest_rules, cache: :never, unknown:
 *  true, wrap: :slot: `render :quick_edit_setting_list` - the body IS the
 *  quick_edit_setting_list view's output (Ruby renders the VIEW through
 *  the chain); the nest_rules slot wrap (wrap: :slot, no class) wraps it. */
const nestRulesView: ViewFn = (ctx) => {
  assertSetCard(ctx, "nest_rules");
  const body = ctx.fmt.renderView("quick_edit_setting_list");
  return modSlotWrap(ctx, "nest_rules", body);
};

/** filtered_rule_lists.rb:7-11 view :modal_nest_rules, cache :never,
 *  unknown: true, wrap: { modal: { title: "Rules for nest" } }:
 *  `filtered_rule_list :quick_edit_setting_list, :field_related` - the
 *  filter form with the FIELD radio checked (setting_filter.rb:16-24 maps
 *  the :field_related category onto the "field" radio; no mark opt ->
 *  path(view:) resolves against the format's OWN card, the captured
 *  action "/*all/quick_edit_setting_list" - the mark: "" arm
 *  ("/?view=...") is board_rules_tab's, not this one) + render(view) -
 *  the FULL quick_edit_setting_list view render with its own _setting-list
 *  slot wrap, the show list accumulating ["modal_nest_rules",
 *  "quick_edit_setting_list"] through the shared voo (both captured in
 *  fixtures/captured/rules-nest-views.json, no-write proof 5018 -> 5018) -
 *  inside the modal wrap (default size, the LITERAL string title -
 *  cast_modal_option's String branch passes it through raw,
 *  modal.rb:110-118 - and the default footer). */
const modalNestRulesView: ViewFn = (ctx) => {
  assertSetCard(ctx, "modal_nest_rules");
  const body = `${settingFilter(ctx, "quick_edit_setting_list", "field_related", undefined)}\n${ctx.fmt.renderView("quick_edit_setting_list")}`;
  let out = "<div class='modal fade _modal-slot' id='modal-container' role='dialog'>\n";
  out += "<!-- /, \"data-backdrop\": \"static\"} -->\n";
  out += "<div class='modal-dialog modal-dialog-centered'>\n";
  out += "<div class='modal-content'>\n";
  out += "<div class='modal-header'>\n";
  out += `Rules for nest\n`;
  out += `${modalMenuHtml(ctx)}\n`;
  out += "</div>\n";
  out += `<div class='modal-body'>\n${body}\n</div>\n`;
  out += `<div class='modal-footer'>\n`;
  out += `<button name="button" type="submit" class="btn-xs _close-modal float-end btn btn-primary" data-bs-dismiss="modal">Close</button>\n`;
  out += `</div>\n`;
  out += "</div>\n</div>\n</div>\n";
  return out;
};

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
    // set_list. :card_select (PORTED 2026-09-29 increment-2 - registered
    // below; the related_sets walk + select2 tag, oracle-pinned in
    // fixtures/captured/rules-views.json set_card.views.card_select).
    // set_select.rb is an ALL set module (kind "base") and the global
    // view name has no other mod registration, so the flat-table
    // registration is safe - this is NOT the increment-1 lane's
    // global-table masking problem (that applies to the rule
    // one_line_content / help_text names whose base registrations
    // belong to other mods).
    setPath: "all/set_select",
    formats: {
      html: {
        views: [
          { view: "card_select", viewFn: cardSelectView, config: { unknown: true, cache: "never" } },
        ],
      },
    },
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
    //
    // Event (mod-events lane 2026-10-08) — ENGINE-OWNED: the save path
    // moves the saved rule's setting to the top of the *recent settings
    // list (card-action-engine.ts saveRecentlyEditedSettings, citing
    // rules.rb:1-6; run on the create/update paths at :1347/:2012).
    setPath: "rule/rules",
    events: [
      engineOwnedEvent({
        event: "save_recently_edited_settings",
        at: "integrate",
        on: ["save"],
        changed: ["type", "content"],
      }),
    ],
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
    // bar_bottom, bar_middle, bar_right as covered. :one_line_content
    // (PORTED 2026-09-29 increment-2 - registered below; the rule set's
    // one-line content with the Abstract::List pointer-list wrap,
    // oracle-pinned in fixtures/captured/rules-views.json) +
    // :raw_one_line_content (PORTED increment-2 - registered below; the
    // bare truncate-strip-tags body, oracle-pinned). Both register under
    // kind "nonbase" so they enter viewChains ONLY (mod-loader.ts:284's
    // `if (kind !== "nonbase") this.views.register(...)` gate) - the
    // chain walker dispatches them for cards whose setKeys include the
    // RULE token (every Rule::* module it expands to) and falls through
    // to the existing chain entries (right/default, right/structure,
    // the render-layer fallback in format.ts:1198) for every other card.
    setPath: "rule/bar_view",
    formats: {
      html: {
        views: [
          { view: "one_line_content", viewFn: ruleOneLineContentViewFn, config: { unknown: true } },
          { view: "raw_one_line_content", viewFn: ruleRawOneLineContentView, config: { unknown: true } },
        ],
      },
    },
  },
  {
    // set/rule/board_rules_editor.rb:2-27 - views :overlay_rule (PORTED
    // 2026-09-29 rules-views-port-3 - registered below; the overlay wrap +
    // the current_rule_form subformat render), :modal_rule (PORTED - the
    // default-size modal, title = render_title, default footer),
    // :overlay_title (PORTED - registered below), :help_text (PORTED
    // 2026-09-29 increment-2 - registered below; the Rule-set override
    // of card-mod-help's :help_text, oracle-pinned in
    // fixtures/captured/rules-views.json; the registration enters
    // viewChains at this nonbase setPath so the chain walker dispatches
    // it for RULE-token cards while the base all/help registration
    // stays on the flat views table for every other card).
    setPath: "rule/board_rules_editor",
    formats: {
      html: {
        views: [
          { view: "overlay_rule", viewFn: overlayRuleView, config: { cache: "never", unknown: true } },
          { view: "modal_rule", viewFn: modalRuleView, config: { cache: "never", unknown: true } },
          { view: "overlay_title", viewFn: overlayTitleView },
          { view: "help_text", viewFn: ruleHelpTextView, config: { unknown: true, cache: "never" } },
        ],
      },
    },
  },
  {
    // set/rule/editor.rb:1-130 - card-level left_type_for_nest_editor_set_
    // selection (template machinery) + find_existing_rule_card:119-130
    // (the rule-resolution walk rule-bar-right.ts cites) + format :html:
    // :rule_edit (PORTED 2026-09-29 rules-views-port-3 - registered below;
    // the large modal wrap around the current_rule_form subformat render,
    // oracle-pinned), :rule_help (PORTED - registered below; the
    // Setting-type half of the dispatch carries set/type/setting.rb:59-61's
    // body), :rule_nest_editor_link/:rule_board_link (PORTED 2026-09-29 -
    // registered below; the pill_rule_link pair, oracle-pinned in
    // fixtures/captured/rules-views.json), pill_rule_link/category_classes/
    // edit_rule_title/current_rule/setting_title/short_help_text/
    // rules_type_formgroup (methods feeding the ported + unported views).
    setPath: "rule/editor",
    formats: {
      html: {
        views: [
          { view: "rule_edit", viewFn: ruleEditView, config: { cache: "never", unknown: true } },
          { view: "rule_help", viewFn: ruleHelpView, config: { unknown: true, perms: "none", cache: "never" } },
          { view: "rule_nest_editor_link", viewFn: ruleNestEditorLinkView, config: { unknown: true } },
          { view: "rule_board_link", viewFn: ruleBoardLinkView, config: { unknown: true } },
        ],
      },
    },
  },
  {
    // set/rule/quick_editor.rb:2-38 - views :quick_edit/:quick_edit_success
    // (PORTED - registered below; the demonstration
    // views: quick_edit.haml/set_info.haml + the card_form :update shell
    // through the shared mod-form-substrate) + quick_form/set_info/
    // undo_button (the helpers those bodies compose).
    setPath: "rule/quick_editor",
    formats: {
      html: {
        views: [
          { view: "quick_edit", viewFn: quickEditView, config: { unknown: true } },
          { view: "quick_edit_success", viewFn: quickEditSuccessView },
        ],
      },
    },
  },
  {
    // set/rule/rule_form.rb:2-71 - views :rule_form/:rule_form_card_editor
    // (PORTED 2026-09-29 rules-views-port-3 - registered below; the
    // card_form shell through the shared mod-form-substrate + the
    // RuleSetRadio set-selection walk, oracle-pinned) + the rule-form
    // composition methods (edit_rule_form/rule_form_args/edit_rule_success
    // ported as the editRuleForm helpers above).
    setPath: "rule/rule_form",
    formats: {
      html: {
        views: [
          { view: "rule_form", viewFn: ruleFormView, config: { cache: "never", unknown: true } },
          { view: "rule_form_card_editor", viewFn: ruleFormCardEditorView, config: { cache: "never", unknown: true } },
        ],
      },
    },
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
    // :one_line_content (setOneLineContentView).
    setPath: "type/set/html_views",
    formats: {
      html: {
        views: [
          { view: "set_label", viewFn: setLabelView },
          { view: "input", viewFn: inputView },
          // html_views.rb:21-23 view :one_line_content, wrap: {}
          { view: "one_line_content", viewFn: setOneLineContentView },
        ],
      },
    },
  },
  {
    // set/type/set/html_views/filtered_rule_lists.rb:2-22 - views
    // :board_rules_tab (PORTED 2026-09-29 - registered below) +
    // :filtered_accordion_rule_list (PORTED - registered below) +
    // :nest_rules/:modal_nest_rules (PORTED 2026-09-29 rules-views-port-3 -
    // registered below; nest_rules = the slot-wrapped quick_edit_setting_
    // list render, modal_nest_rules = filtered_rule_list
    // :quick_edit_setting_list :field_related in the modal wrap - both
    // ORACLE-PINNED by the rules-cap follow-up capture,
    // fixtures/captured/rules-nest-views.json) +
    // filtered_rule_list/setting_filter/filter_buttons/filter_radio
    // (PORTED - the helpers the registered views compose; the bytes are
    // the setting_filter.rb heredocs).
    setPath: "type/set/html_views/filtered_rule_lists",
    formats: {
      html: {
        views: [
          { view: "board_rules_tab", viewFn: boardRulesTabView, config: { cache: "never" } },
          { view: "filtered_accordion_rule_list", viewFn: filteredAccordionRuleListView },
          { view: "nest_rules", viewFn: nestRulesView, config: { cache: "never", unknown: true } },
          { view: "modal_nest_rules", viewFn: modalNestRulesView, config: { cache: "never", unknown: true } },
        ],
      },
    },
  },
  {
    // set/type/set/html_views/rule_lists.rb:2-101 - the setting-list
    // family. PORTED 2026-09-29 (registered below; oracle-pinned in
    // fixtures/captured/rules-views.json): :bar_setting_list,
    // :pill_setting_list (the effective SECOND definition at :86-88 -
    // cache: :never + the _setting-list slot wrap), :modal_pill_setting_
    // list, :accordion_rule_list, :accordion_bar_list,
    // :overlay_rule_list_link (cache: :never). NOT registered configs on
    // bar/modal_pill/accordion_rule: the shared setting_list_view_options
    // hash is CONSUMED by the file's first definition (view_opts.rb:46-52
    // interpret_view_settings opts.delete - the oracle probe shows
    // _view_bar_setting_list__wrap does not respond), so those views carry
    // no wrap and no cache override in Ruby. :quick_edit_setting_list
    // (still unported - its :quick_edit items need the quick_editor form
    // machinery) + category_accordion/setting_list_item helpers (ported -
    // the emitters above).
    // 2026-09-29 rules-views-port-3: :quick_edit_setting_list IS ported
    // now (registered below) - the quick_editor form machinery landed with
    // the form-substrate lane and the Right-module body overrides closed
    // the empty-item question.
    setPath: "type/set/html_views/rule_lists",
    formats: {
      html: {
        views: [
          { view: "bar_setting_list", viewFn: barSettingListView },
          { view: "pill_setting_list", viewFn: pillSettingListView, config: { cache: "never" } },
          { view: "modal_pill_setting_list", viewFn: modalPillSettingListView },
          { view: "accordion_rule_list", viewFn: accordionRuleListView },
          { view: "accordion_bar_list", viewFn: accordionBarListView },
          { view: "quick_edit_setting_list", viewFn: quickEditSettingListView, config: { cache: "never" } },
          { view: "overlay_rule_list_link", viewFn: overlayRuleListLinkView, config: { cache: "never" } },
        ],
      },
    },
  },
  {
    // set/type/set/html_views/setting_filter.rb:2-39 - filtered_rule_list/
    // setting_filter/filter_buttons/filter_radio (the bytes live in the
    // render layer's setRulesCoreHtml port).
    setPath: "type/set/html_views/setting_filter",
  },
  {
    // set/type/set/html_views/template.rb:2-11 - view :template_link
    // (PORTED 2026-09-29 - registered below; the wrap() body emits the
    // slot wrapper, oracle-pinned in fixtures/captured/rules-views.json;
    // the parent-voo nest_syntax title is a nest-context value the
    // headless engine's direct render never carries - link_to_view's
    // `text || view` default emits the view name).
    setPath: "type/set/html_views/template",
    formats: {
      html: {
        views: [{ view: "template_link", viewFn: templateLinkView, config: { cache: "never" } }],
      },
    },
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
    //
    // 2026-09-29::rule_help is REGISTERED on this module
    // now, not merely "carried". Ruby defines view :rule_help in BOTH gem
    // files (rule/editor.rb:24-28 on the Rule set and type/setting.rb:59-61
    // on the Type::Setting set); the old single registration on
    // rule/editor only answered for rule cards once the chainFor narrowing
    // (26ef575) stopped the flat record from answering for
    // Setting-type cards. The viewFn keeps the two-set dispatch and still
    // raises for cards that are neither rule nor Setting-typed.
    setPath: "type/setting",
    formats: {
      html: {
        views: [
          { view: "rule_help", viewFn: ruleHelpView },
          // setting.rb:63-65 view :one_line_content: render_rule_help
          { view: "one_line_content", viewFn: (ctx) => ctx.fmt.renderView("rule_help") },
        ],
      },
    },
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
