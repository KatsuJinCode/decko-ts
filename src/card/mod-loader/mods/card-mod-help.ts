import { str } from "../../render/format.js";
// The card-mod-help gem (card-mod-help-0.20.0), ported through the mod
// loader - the reference port proving the mechanism end to end.
//
// The gem's tree (the installed
// card-mod-help-0.20.0/): six set files, no lib/, no set_pattern/, no
// events. Ported here byte-verifiably: set/all/help.rb (the :help,
// :help_text, :lead views), set/all/guide.rb
// (the :guide view - markdown :core dependency resolved by
// card-mod-markdown.ts; the gem declares no rendered reference for it,
// so the port-level test asserts the view dispatches and emits the
// guide-text class list, the d-none edit-link span shape, and the
// nested guide content through the markdown :core path), set/right/help.rb
// (the :popover view - delegates to card-mod-bootstrap's
// popoverLink helper, helper.rb:41-44; the helper is imported as-is from
// card-mod-bootstrap.ts (popoverLink, card-mod-bootstrap.ts:166); the
// port-level tests assert the emitted anchor bytes), and the
// two setting_opts files (set/self/help.rb, set/self/guide.rb).
//
// NOT yet ported :
// - set/right/guide.rb - set module only defines a card-level
//   `raw_help_text` method (card-mod-help set/right/guide.rb:3-7); no
//   view declared; the SettingHelpText registry already serves the
//   text (render/setting-help-text.ts#registeredSettingHelpText).
// - assets/style/help.scss - stylesheet mods are a separate surface
// - config/admin.yml - the admin surface (settings/views lists) has no TS
//   consumer

import type { ViewContext, ViewFn } from "../../render/format.js";
import { ruleNamesForCard } from "../../set-patterns/rule-names.js";
import type { PatternCardInput } from "../../set-patterns/types.js";
import type {
  DeckoModManifest,
  ModEngineHost,
} from "../mod-manifest.js";
import { modSlotWrap } from "../mod-view-helpers.js";
import { processHelpContent } from "../../render/help-popover.js";
import { parseNestOptions } from "../../render/nest-syntax.js";
import { warmRuleCards } from "./rule-card-warm.js";
// popoverLink (set/all/bootstrap/helper.rb:41-44) - the icon_tag :help +
// data-bs-toggle=popover anchor helper card-mod-help set/right/help.rb:4-6's
// `view :popover do popover_link _render_core end` consumes. Imported from
// card-mod-bootstrap.ts as-is (the one shared implementation).
import { popoverLink } from "./card-mod-bootstrap.js";

// ---------------------------------------------------------------------------
// set/all/help.rb - the card-level methods, then the format :html block
// ---------------------------------------------------------------------------

/** help.rb:1-4 help_rule_card: `rule_card(:help)` gated by ok?(:read).
 *  rule_card walks the card's set names in pattern precedence joined to
 *  "*help" (lib/card/rule/all.rb:9-15); the candidates resolve against the
 *  engine's prepared render-card map (the mod's prepareEngine prefetched
 *  every *help rule card in the deck - the Rule::Cache analog,
 *  lib/card/rule/cache.rb:10-27), so a map miss = the rule card does not
 *  exist. */
function helpRuleCard(ctx: ViewContext): ReturnType<ViewContext["fmt"]["engine"]["fetchRenderCard"]> {
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

/** help.rb:36-38 raw_help_text: `card.try(:raw_help_text) ||
 *  card.help_rule_card&.content`. The static setting-level defs the first
 *  operand serves are set-module methods this surface's probe cards do not
 *  carry (they live in the settings' self/right sets); undefined falls to
 *  the rule card's content. */
function rawHelpText(ctx: ViewContext): string | undefined {
  const ruleCard = helpRuleCard(ctx);
  return ruleCard === undefined ? undefined : ruleCard.dbContent;
}

/** help.rb:40-48 rule_based_help: process_content(raw, chunk_list:
 *  :references) - nests and [[link]] chunks render through the format's
 *  real machinery (help-popover.ts#processHelpContent is that chunk walk,
 *  shared rather than duplicated). */
function ruleBasedHelp(ctx: ViewContext): string {
  const raw = rawHelpText(ctx);
  if (raw === undefined) return "";
  return processHelpContent(ctx.fmt, raw);
}

/** help.rb:32-34 help_text: `voo.help || rule_based_help`. */
function helpText(ctx: ViewContext): string {
  const vooHelp = ctx.voo.opts["help"];
  if (typeof vooHelp === "string" && vooHelp !== "") return vooHelp;
  return ruleBasedHelp(ctx);
}

/** help.rb:18-25 wrap_help_text: a READABLE help rule card prepends its
 *  edit_link (nest rule_card, view: :edit_link; the rule card's edit_link
 *  override targets :rule_edit - card-mod-rules set/rule/editor.rb:60-62).
 *  The link bytes are menu.rb's edit_link shape
 *  (card-mod-format set/all/html/menu.rb) with the rule_edit view:
 *  `link_text || "#{menu_icon} {text}"` with empty text leaves the icon
 *  plus one trailing space. */
function wrapHelpText(ctx: ViewContext, text: string): string {
  const ruleCard = helpRuleCard(ctx);
  if (ruleCard === undefined) return text;
  const href = `/${ruleCard.name.urlKey}/rule_edit`;
  const editLink =
    `<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip"` +
    ` data-bs-placement="bottom" data-slotter-mode="modal" data-modal-class="modal-lg"` +
    ` href="${href}" data-remote="true"><i class="notranslate material-icons">edit</i> </a>`;
  return `<span class='d-none'>${editLink}</span>${text}`;
}

/** help.rb:6-12 view :help, unknown: true, cache: :never, wrap: :slot:
 *  `help = help_text; return "" unless help.present?; wrap_with :div,
 *  wrap_help_text(help), class: classy("help-text")`. The `wrap: :slot`
 *  config wraps the view in the render pipeline's slot wrapper EVEN WHEN the
 *  body returns blank (format/render.rb:96-97 runs with_wrapper around
 *  final_render unconditionally) - a rule-less card still renders the
 *  empty slot div. */
export const helpView: ViewFn = (ctx) => {
  const help = helpText(ctx);
  const body = /^\s*$/.test(help)
    ? ""
    // classy("help-text") — the class_ups ride the voo chain (frame.rb's
    // with_class_up "help-text", "alert alert-info" lands on the OWNING
    // voo; the child voo the delegated :help render builds reads it
    // through deepExtraClasses — the emitted class list is
    // "help-text alert alert-info" when that class_up is set).
    : `<div class="${ctx.voo.classy("help-text")}">${wrapHelpText(ctx, help)}</div>`;
  return modSlotWrap(ctx, "help", body);
};

/** help.rb:14-16 view :help_text, unknown: true, cache: :never:
 *  `wrap_help_text help_text`. No wrap config -> bare bytes ("" without a
 *  rule; the d-none span + text with one).
 *
 *  EXPORTED: the view is also the compiled-in HTML_VIEWS["help_text"]
 *  registration (render/views.ts imports this fn). Same seam and same
 *  reason as helpView/guideView/leadView above: set/all/* declarations
 *  are base-format registrations in Ruby (registrar.rb:79-84), visible to
 *  every card with or without a loaded deck, while the production worker
 *  binds no deck (defaultDeckLoader has no production caller) and falls
 *  through computeResolvedView to the flat record. Leaving :help_text
 *  mod-only left it raising the worker's 422 loader-less — the
 *  headless-help-text-flat-dispatch.test.ts pin. Single source: the mod
 *  registration and the compiled-in entry are the SAME function, so a
 *  loader-bound engine (chain[0] = All::Help wins the chain walk) and the
 *  mod-less harness cannot drift.
 *
 *  NOT the set-scoped sibling: card-mod-rules-0.20.0
 *  set/rule/board_rules_editor.rb:17-19 overrides :help_text for RULE-set
 *  cards (`wrap_help_text [rule_based_help, setting_link].join(" ")`);
 *  card-mod-rules.ts registers that body NONBASE (ruleHelpTextView) so
 *  only a bound deck's chain walk reaches it, and the flat all-set row
 *  does not mask it (mod-loader.ts:452 expands the RULE token to every
 *  Rule::* module and takes the most-specific-set-first). */
export const helpTextView: ViewFn = (ctx) => wrapHelpText(ctx, helpText(ctx));

/** help.rb:27-30 view :lead: `class_up "card-slot", "lead";
 *  _view_content`. _view_content calls the content view's method DIRECTLY
 *  (no render! pass, so no before(:content) hook - the oracle bytes carry
 *  no d0-card-content) - here: the core bytes in the lead slot wrap, the
 *  classy extra landing at the class list's end (the classUp chain).
 *
 *  EXPORTED: the view is also the
 *  compiled-in HTML_VIEWS["lead"] registration (render/views.ts imports
 *  this fn). Several consumers run the engine WITHOUT a bound
 *  mod loader, so dispatch falls to the flat record (render.ts
 *  computeResolvedView's fallback) — without the compiled-in entry every
 *  `+:description|lead` nest rendered "view (lead) not
 *  supported" render-error alerts. Single source: the mod registration and
 *  the compiled-in entry
 *  are the SAME function, so a loader-bound engine (chain[0] = All::Help
 *  wins the chain walk) and the mod-less harness cannot drift. */
export const leadView: ViewFn = (ctx) => {
  ctx.voo.classUp("card-slot", "lead");
  return modSlotWrap(ctx, "lead", str(ctx.fmt.renderView("core")));
};

// ---------------------------------------------------------------------------
// set/right/help.rb - the :popover view
// ---------------------------------------------------------------------------

/** help.rb:4-6 view :popover, no view config (no `unknown:`, no
 *  `cache: :never`, no `wrap:`): `popover_link _render_core`. The body
 *  delegates to card-mod-bootstrap's popover_link helper (helper.rb:
 *  41-44) - the TS implementation is the popoverLink export from
 *  card-mod-bootstrap.ts:166 (consumed as-is).
 *  _render_core in Ruby is the same dispatch as
 *  `ctx.fmt.renderView("core")` in TS (format.ts#renderView:275-275).
 *
 *  The popoverLink anchor's bytes (helper.rb:41-57):
 *    `<a tabindex="0" data-bs-toggle="popover" data-bs-trigger="hover focus"
 *         data-bs-content="<text>" class="ps-1 _popover_link" href="#">
 *         <i class="notranslate material-icons">help</i></a>`
 *  with `<text>` = _render_core's bytes. The default icon linkText
 *  (popoverLink:193 `if linkText === "" linkText = popoverIcon("help")`)
 *  fires because help.rb:4-6 passes no linkText arg.
 *
 *  The view fires on COMPOUND names only (Right pattern is compound_only =
 *  true, mod/core/set_pattern/07_right.rb:2). The port-level tests assert
 *  the emitted bytes for a card with and without a *help rule. */
const popoverView: ViewFn = (ctx) => {
  // help.rb:5 `popover_link _render_core` -> helper.rb:41 popover_link
  // text. The renderView dispatch goes through the format's standard
  // view pipeline (render/format.ts:275-284) and returns the :core view
  // bytes - the same string popover_link receives as text.
  return popoverLink(str(ctx.fmt.renderView("core")));
};

// ---------------------------------------------------------------------------
// set/all/guide.rb - the guide rule walker, helper methods, then :guide
// ---------------------------------------------------------------------------

/** guide.rb:1-3 card-level guide_card (memoized via @guide_card ||=
 *  determine_guide_card). The format-level methods below call
 *  card.guide_card via Ruby's `delegate :guide_card, to: :card`
 *  (guide.rb:42). For the TS port this is a direct rule-walk: same
 *  cache-checked resolution as helpRuleCard but for *guide rules. */
function guideRuleCard(ctx: ViewContext): ReturnType<ViewContext["fmt"]["engine"]["fetchRenderCard"]> {
  const card = ctx.fmt.card;
  // A new card has rules too (determine_guide_card's rule_card :guide runs
  // on Card.new — the :new form's alert guide); its walk drops the *self
  // candidate (pattern/all.rb: new cards skip the first concrete pattern).
  const input: PatternCardInput = {
    name: card.name.s,
    id: card.id,
    typeId: card.typeId,
    typeName: card.typeName,
    ...(card.id === undefined ? { isNew: true } : {}),
  };
  if (card.name.isCompound) {
    const leftKey = card.name.leftName?.key;
    const left =
      leftKey !== undefined ? ctx.fmt.engine.fetchRenderCard(leftKey) : undefined;
    input.leftTypeName = left?.typeName;
  }
  for (const candidate of ruleNamesForCard(input, "*guide")) {
    const record = ctx.fmt.engine.fetchRenderCard(candidate);
    if (record === undefined) continue; // guide rule does not exist
    if (ctx.fmt.engine.isDenied(record)) continue; // guide.rb:52 ok?(:read)
    return record;
  }
  return undefined;
}

/** guide.rb:34-40 guide_text: `return "" unless guide_card; with_nest_mode
 *  :normal { nest guide_card, view: :core }`. The TS port calls the
 *  format.nest shape directly (format.ts:450-484) with a one-option Nest:
 *  `view: "core"`. nest_name/nest_syntax ride the option_map; the target
 *  name is the guide card's qualified name. */
function guideText(ctx: ViewContext): string {
  const guideCard = guideRuleCard(ctx);
  if (guideCard === undefined) return "";
  return ctx.fmt.nest({
    syntax: `{{${guideCard.name.s}|view:core}}`,
    name: guideCard.name.s,
    options: parseNestOptions("view:core"),
    comment: undefined,
  });
}

/** guide.rb:27-32 prepend_guide_edit_link: `return guide_text unless
 *  guide_card.ok?(:update)`. The TS port consults taskAllowed on the
 *  engine (the same seam viewPermissionDenial uses for :read, format.ts
 *  via view-permissions); update permission here is checked through the
 *  engine's optional taskAllowed hook (unified :update gate). The seam is
 *  deny-by-default (render-seam.ts: a verdict the engine has not
 *  established denies), so the d-none span wraps only on an AFFIRMATIVE
 *  update verdict — the link appears for a viewer with update permission
 *  and is absent for one without — exactly
 *  like help.rb's `card.help_rule_card&.ok?(:read)` gate on
 *  wrap_help_text. */
function prependGuideEditLink(ctx: ViewContext, text: string): string {
  const guideCard = guideRuleCard(ctx);
  if (guideCard === undefined) return text;
  const taskAllowed = ctx.fmt.engine.taskAllowed?.(guideCard, "update");
  if (taskAllowed !== true) return text;
  // guide.rb:30 nests the guide card with view: :edit_link; the guide card
  // is a Rule-typed card and the Rule set overrides edit_link_view to
  // :rule_edit (card-mod-rules-0.20.0 set/rule/editor.rb:60-61), so the
  // link_to_view target is the RULE editor:
  // href="/<rule card url_key>/rule_edit" (e.g. "*all+*guide" ->
  // "/*all+*guide/rule_edit") — NOT the non-rule "/<name>/edit" default
  // edit_link shape.
  const href = `/${guideCard.name.urlKey}/rule_edit`;
  const editLink =
    `<a rel="nofollow" class="edit-link slotter" title="Edit" data-bs-toggle="tooltip"` +
    ` data-bs-placement="bottom" data-slotter-mode="modal" data-modal-class="modal-lg"` +
    ` href="${href}" data-remote="true"><i class="notranslate material-icons">edit</i> </a>`;
  return `<span class='d-none'>${editLink}</span>${text}`;
}

/** guide.rb:6-16 view :guide, unknown: true, cache: :never, wrap: :slot:
 *  `guide` -> wraps with `<div class="guide-text">` (or empty string when
 *  guide_text is blank). The d-none edit_link prefix applies when the
 *  guide_card responds to ok?(:update). */
function guideInnerHtml(ctx: ViewContext): string {
  const text = guideText(ctx);
  if (text === "") return "";
  return `<div class="guide-text">${prependGuideEditLink(ctx, text)}</div>`;
}

export const guideView: ViewFn = (ctx) => modSlotWrap(ctx, "guide", guideInnerHtml(ctx));

// ---------------------------------------------------------------------------
// prepareEngine - the boot-time *help rule warm (the Rule::Cache analog).
// The statement and the multi-pass composition live once in
// rule-card-warm.ts (ruleSidesStatement + warmRuleCards); this boot warms
// *help and *guide in two sequential batches. Adding the *guide warm here
// keeps card-mod-help self-contained: card-mod-layout also warms *guide
// rules via its own prepareEngine, so a deck that loads both mods issues
// the warm twice (the second pass is a no-op since the rule cards are
// already in the prepared render-card map).
// ---------------------------------------------------------------------------

/** The card-mod-help prepareEngine: warm *help rules (helpRuleCard) AND
 *  *guide rules (guideRuleCard) in two sequential batches. Both rule walks
 *  share the same prepared render-card map the engine exposes via
 *  fetchRenderCard. */
async function prepareHelpAndGuideRules(host: ModEngineHost): Promise<void> {
  await host.codenames.ensureLoaded(); // memoized; first call only
  const setTypeId = host.codenames.peekId("set");
  const settingTypeId = host.codenames.peekId("setting");
  if (setTypeId === undefined || settingTypeId === undefined) return; // degenerate deck
  await warmRuleCards(host, setTypeId, settingTypeId, ["help"]);
  await warmRuleCards(host, setTypeId, settingTypeId, ["guide"]);
}

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

const cardModHelp: DeckoModManifest = {
  name: "help",
  gemName: "card-mod-help",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-help-0.20.0/set/all/help.rb
      setPath: "all/help",
      formats: {
        html: {
          views: [
            { view: "help", viewFn: helpView, config: { unknown: true, cache: "never", wrap: "slot" } },
            { view: "help_text", viewFn: helpTextView, config: { unknown: true, cache: "never" } },
            { view: "lead", viewFn: leadView },
          ],
        },
      },
    },
    {
      // card-mod-help-0.20.0/set/all/guide.rb: the :guide view (unknown:
      // true, cache: :never, wrap: :slot - identical config to :help). The
      // view body's bytes run the guide card's Markdown core through
      // nest(view: :core); that path is provided by card-mod-markdown
      // (Type::Markdown::HtmlFormat#core, card-mod-markdown.ts:87-90).
      setPath: "all/guide",
      formats: {
        html: {
          views: [
            { view: "guide", viewFn: guideView, config: { unknown: true, cache: "never", wrap: "slot" } },
          ],
        },
      },
    },
    {
      // card-mod-help-0.20.0/set/self/help.rb
      setPath: "self/help",
      settingOpts: {
        group: "editing",
        position: 1,
        ruleTypeEditable: true,
        shortHelpText: "help text people will see when editing",
        helpText:
          "[[http://decko.org/custom_help_text|Help text]] people will see when editing.",
      },
    },
    {
      // card-mod-help-0.20.0/set/self/guide.rb
      setPath: "self/guide",
      settingOpts: {
        group: "editing",
        position: 3,
        ruleTypeEditable: true,
        shortHelpText: "appears in the full editor view to guide users",
      },
    },
    {
      // card-mod-help-0.20.0/set/right/help.rb: the :popover view
      // (help.rb:4-6). The view body delegates to card-mod-bootstrap's
      // popover_link helper (helper.rb:41-44) - the TS port is the
      // popoverLink export (card-mod-bootstrap.ts:166) imported as-is at
      // the top of this file; the port-level tests assert the emitted
      // anchor bytes.
      setPath: "right/help",
      formats: {
        html: {
          views: [
            { view: "popover", viewFn: popoverView },
          ],
        },
      },
    },
  ],
  prepareEngine: prepareHelpAndGuideRules,
};

export default cardModHelp;
