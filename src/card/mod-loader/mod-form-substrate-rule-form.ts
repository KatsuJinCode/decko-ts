// The rule_form view family composed over the form substrate: :rule_form
// (card-mod-rules set/rule/rule_form.rb:2-13), its board_rule_set_selection /
// RuleSetRadio walk (set/rule/rule_form/set_selection.rb:2-21 + the
// `#! no set module` helper class rule_form/rule_set_radio.rb), and
// :modal_rule's wrap arm (set/rule/board_rules_editor.rb:8-11 + card-mod-
// layout set/all/modal/modal_dialog.haml:6-13's voo.show? gates).
//
// Two arms here are the ones the rule-form port left open: the RuleSetRadio
// narrower_warning walk, and the modal wrap's voo.show? gates for a hidden
// header. Both are pinned on live renders: a set walk with five candidates
// (four radios in non-*all :current/:overwritten states - the
// narrower_warning_message's @narrower_rules entries are ALL "" (the
// uncapitalized_label shadowing bug, set/type/set.rb:43, already documented
// in set-name.ts), so the warnings read "for ." / "for  and ." /
// "for , , and .") and modal_rule with hide: :modal_header.
//
// EXPORTED-UNREGISTERED: the views are NOT added to card-mod-rules'
// setModules - the rules-views composition owns the registrations and its
// own pins for these view names, and a second registration here would
// collide at the merge. The composition functions are the merge-ready
// bodies (the registering tree binds them through the same manifest shape
// the tests use - the byte contract does not change with the registration
// home). The one disclosed seam: the rule_form_card_editor section
// (rulesTypeFormgroup + rule_content_formgroup -> the perm-editor :input
// chain) resolves through renderView when the consuming tree registers it;
// callers on trees without that registration inject the section's bytes
// (the tests do).

import { h } from "../render/slot-html.js";
import { RenderFormat, Voo, type ViewContext, type ViewFn } from "../render/format.js";
import { DeckoName } from "../name.js";
import { modSlotWrap } from "./mod-view-helpers.js";
import {
  parseSetName,
  labelForParsedSet,
  uncapitalizedLabelForParsedSet,
} from "../set-patterns/set-name.js";
import { setNamesForCard } from "../set-patterns/card-patterns.js";
import type { PrototypeArgs } from "../set-patterns/types.js";
import {
  cardFormShell,
  iconTag,
  modalDialogWrap,
  overlayCloseButton,
  popoverLink,
  radioButtonTag,
  ruleDeleteButtonLink,
  standardSaveAndCloseButtonBody,
  standardSaveButtonBody,
  successTags,
  toSentence,
} from "./mod-form-substrate.js";

type SetState = "current" | "overwritten" | "available";

export interface RuleFormDeps {
  /** the deck's default type NAME - Card.new's type for the walk's
   *  prototype (set/type/set.rb:73-79 set_prototype; the type is deck data,
   *  like the *recent settings membership). A deck whose default type is
   *  RichText - the common case - therefore has RichText+*type in every walk
   *  candidate list. */
  prototypeTypeName?: string;
  /** the default type card's ID - the *type pattern applies on typeId
   *  (03_type.rb pattern_applies?); the engine's fetchRenderCard is
   *  cache-only, so callers supply the seeded id (deck data). */
  prototypeTypeId?: number;
  /** the rule_form_card_editor section's bytes for trees that do not
   *  register that view (the disclosed seam). */
  editorHtml?: string;
  /** the success view (rule_form.rb:16 @success_view ||= :open for the
   *  view arm; modal.rb:55 current_rule_form passes :overlay_rule - the
   *  modal body's success[view] value). */
  successView?: string;
  /** the existence resolver for the walk's Card.exist? checks and the
   *  links' known/wanted classes (links.rb:140-143) - deck data, like the
   *  prototype type. Default: the engine's cache-only fetchRenderCard. */
  known?: (nameKey: string) => boolean;
}

/** rules.rb:36-38 rule_setting_name (the name's tag) + :48-54
 *  rule_user_setting_name (the user-less form = the tag itself). */
function ruleTag(card: RenderFormat["card"]): string {
  return card.name.rightName?.s ?? "";
}

/** The default existence resolver: the engine's cache-only fetchRenderCard
 *  (the closure-warmed map). Callers with deck-data existence pass
 *  deps.known. */
function defaultKnownFn(fmt: RenderFormat): (nameKey: string) => boolean {
  return (nameKey: string) => fmt.engine.fetchRenderCard(nameKey) !== undefined;
}

/** rules.rb:81-93 state_of_set over the sliced candidates. */
function setOptionsWalk(
  fmt: RenderFormat,
  deps: RuleFormDeps,
): Array<[string, SetState]> {
  const setName = fmt.card.name.leftName?.s ?? "";
  const tag = ruleTag(fmt.card);
  const knownFn = deps.known ?? defaultKnownFn(fmt);
  // set/type/set.rb:73-79 set_prototype: trunk.prototype - the SET's own
  // pattern prototype_args build the prototype card: the *right set's
  // prototype is "*dummy+<anchor>" (07_right.rb prototype_args), the
  // *all plus set's is the compound blank "+", a *type set's is a nameless
  // card of the anchor type. The TYPE rides the deck's default (deps -
  // deck data, like the *recent settings membership) unless the pattern
  // set one. New cards skip the *self pattern (patternsForCard's slice).
  const parsedSet = parseSetName(setName);
  const args: PrototypeArgs = parsedSet.spec
    ? parsedSet.spec.prototypeArgs(parsedSet.anchorName?.s)
    : { name: parsedSet.anchorName?.s ?? "" };
  const prototypeTypeName = args.type ?? deps.prototypeTypeName ?? "RichText";
  // 03_type.rb#pattern_applies?: !!card.type_id - the *type candidate needs
  // the TYPE CARD's id (the walk candidates carry its NAME via typeName).
  const prototypeTypeId =
    deps.prototypeTypeId ??
    fmt.engine.fetchRenderCard(DeckoName.parse(prototypeTypeName).key)?.typeId;
  const prototype = {
    name: args.name ?? "",
    typeName: prototypeTypeName,
    typeId: prototypeTypeId,
    isNew: true,
  };
  const candidates = setNamesForCard(prototype);
  // rules.rb:67-71 first_set_option_index: new_card? ? 0 : the own set's
  // position in the candidates.
  const setKey = DeckoName.parse(setName).key;
  const ownIndex = candidates.findIndex((c) => DeckoName.parse(c).key === setKey);
  const first = fmt.card.id === undefined ? 0 : ownIndex;
  const sliced = candidates.slice(first === -1 ? 0 : first);
  const known = (candidate: string): boolean =>
    knownFn(DeckoName.parse(`${candidate}+${tag}`).key);
  let existingCount = 0;
  return sliced.map((candidate): [string, SetState] => {
    if (known(candidate)) {
      existingCount += 1;
      return [candidate, existingCount === 1 ? "current" : "overwritten"];
    }
    return [candidate, existingCount > 0 ? "overwritten" : "available"];
  });
}

/** links.rb:140-143 add_known_or_wanted_class - Card.known?(mark) =
 *  fetch(mark).present?; the anchor href rides the url_key (spaces to
 *  underscores, case and stars kept - variants.rb #url_key; so
 *  "*all plus+*read" links as href="/*all_plus+*read"). */
function urlKeyOf(name: string): string {
  return name.replace(/ /g, "_");
}

function cardLink(name: string, text: string, attrs: {
  target: string;
  known: boolean;
}): string {
  return (
    `<a target="${attrs.target}" class="${attrs.known ? "known-card" : "wanted-card"}"` +
    ` href="/${h(urlKeyOf(name))}">${text}</a>`
  );
}

/** rule_set_radio.rb:22-77 RuleSetRadio#html: the form-check div, the radio
 *  (radio_button :name, "#{set}+#{tag}", checked: false, warning:,
 *  class "form-check-input", id unique_id-Time.now.to_i) and the label
 *  (wrap_with :label, class "form-check-label #{classes}", for: id do
 *  [text, link] end - the pair joins "\n"). warning (:63-77): the *all
 *  LITERAL regardless of state; else the narrower walk (:79-94) - a
 *  current/overwritten state APPENDS the set's uncapitalized_label (always
 *  "" - the shadowing bug) to the SHARED accumulator, and an :overwritten
 *  radio carries the narrower_warning_message (to_sentence over the
 *  accumulator; the plural "s" when size > 1). extra_info (:48-57):
 *  :current -> "(current)" plain; :overwritten/:exists -> the
 *  link_to_card("#{set}+#{tag}", "(#{state})", target: "_blank") em;
 *  :available -> none. */
function ruleSetRadioHtml(
  fmt: RenderFormat,
  opts: {
    setName: string;
    tag: string;
    state: SetState;
    narrowerRules: string[];
    seconds: string;
    knownFn: (nameKey: string) => boolean;
  },
): string {
  const id = `${fmt.uniqueId()}-${opts.seconds}`;
  let warning: string | undefined;
  if (opts.setName === "*all") {
    warning = "This rule will affect all cards! Are you sure?";
  } else if (opts.state === "current" || opts.state === "overwritten") {
    opts.narrowerRules.push(uncapitalizedLabelForParsedSet(parseSetName(opts.setName)));
    if (opts.state === "overwritten") {
      const plural = opts.narrowerRules.length > 1 ? "s" : "";
      warning =
        "This rule will not have any effect on this card unless you delete " +
        `the narrower rule${plural} for ${toSentence(opts.narrowerRules)}.`;
    }
  }
  const radio = radioButtonTag("name", `${opts.setName}+${opts.tag}`, {
    warning,
    class: "form-check-input",
    id,
  });
  const labelClasses = ["set-label", opts.state === "current" ? "current-set-label" : undefined]
    .filter((c): c is string => c !== undefined)
    .join(" ");
  let text = labelForParsedSet(parseSetName(opts.setName));
  if (opts.state === "current") {
    text += " <em>(current)</em>";
  } else if (opts.state === "overwritten") {
    const ruleName = `${opts.setName}+${opts.tag}`;
    const known = opts.knownFn(DeckoName.parse(ruleName).key);
    text += ` <em>${cardLink(ruleName, `(${opts.state})`, { target: "_blank", known })}</em>`;
  }
  const setKnown = opts.knownFn(DeckoName.parse(opts.setName).key);
  const iconLink = cardLink(opts.setName, iconTag("new_window", "text-muted"), {
    target: "decko_set",
    known: setKnown,
  });
  return (
    `<div class="form-check">` +
    `${radio}\n` +
    `<label class="form-check-label ${labelClasses}" for="${h(id)}">${text}\n${iconLink}</label></div>`
  );
}

/** set_selection.rb:2-21 board_rule_set_selection + board_rule_set_formgroup:
 *  wrap_with :div, class "set-list _set-editor" { wrap_with :div, class
 *  "col-xs-6 mt-3 mb-5" { rule_set_options.reverse.map { RuleSetRadio...
 *  .html narrower } } } - the REVERSED walk renders broadest-first, and the
 *  @narrower_rules accumulator shared across the radios fills in that order,
 *  so the first :overwritten radio's message names one rule, the next two,
 *  the next three. */
function boardRuleSetSelectionHtml(
  fmt: RenderFormat,
  deps: RuleFormDeps,
  seconds: string,
): string {
  const tag = ruleTag(fmt.card);
  const narrowerRules: string[] = [];
  const knownFn = deps.known ?? defaultKnownFn(fmt);
  const radios = setOptionsWalk(fmt, deps)
    .reverse()
    .map(([setName, state]) =>
      ruleSetRadioHtml(fmt, { setName, tag, state, narrowerRules, seconds, knownFn }),
    );
  return (
    `<div class="set-list _set-editor"><div class="col-xs-6 mt-3 mb-5">` +
    `${radios.join("\n")}</div></div>`
  );
}

/** card-mod-follow set/type/set.rb:9-15 follow_label (the pattern spec's
 *  short_label) - the delete confirm's "for all &quot;+*accounts&quot;?" /
 *  "for everything?" arms. */
function followLabel(setName: string): string {
  const parsed = parseSetName(setName);
  return parsed.spec ? parsed.spec.shortLabel(parsed.anchorName?.s) : "";
}

/** rule_form/buttons.rb:2-42 edit_rule_buttons + edit_rule_cancel_button +
 *  edit_rule_delete_button + delete_confirm: the button-area div with
 *  standard_save_button(class: "_rule-submit-button"), standard_save_and_
 *  close_button(class: "_rule-submit-button", close: form_type), the
 *  "#{form_type}_close_button" Cancel (overlay_close_button "Cancel",
 *  situation: "secondary", class: "btn-sm") and the delete section (real
 *  cards only; the confirm reads "the #{rule_setting_name} rule for
 *  #{rule_set.follow_label}"). The array joins "\n" inside the div. */
function editRuleButtonsHtml(
  ctx: ViewContext,
  formType: "overlay" | "modal",
): string {
  const fmt = ctx.fmt;
  const save =
    standardSaveButtonBody(ctx, [
      ["class", "_rule-submit-button"],
    ]) ?? "";
  const saveAndClose = standardSaveAndCloseButtonBody({
    close: formType,
    callerClass: "_rule-submit-button",
  });
  const cancel = overlayCloseButton("Cancel", {
    situation: "secondary",
    callerClass: "btn-sm",
  });
  let deleteSection = "";
  if (fmt.card.id !== undefined) {
    const settingName = ruleTag(fmt.card);
    const setName = fmt.card.name.leftName?.s ?? "";
    const confirm =
      `Are you sure you want to delete the ${settingName} rule for ${followLabel(setName)}?`;
    deleteSection =
      `<span class="rule-delete-section">` +
      ruleDeleteButtonLink({
        confirm,
        urlKey: fmt.urlKey(),
        callerClass: `_close-${formType}-on-success`,
        dataSlotterMode: "silent-success",
      }) +
      `</span>`;
  }
  return (
    `<div class="button-area">` +
    [save, saveAndClose, cancel, deleteSection].join("\n") +
    `</div>`
  );
}

/** The rule_form body (rule_form.rb:2-13 wrap do edit_rule_form do
 *  [hidden_tags(success:), haml(:rule_form)].join end end + :15-24
 *  prepare_rule_form_options + :54-71 edit_rule_form/rule_form_args/
 *  edit_rule_success + the rule_form.haml template). card_form {action:
 *  :update, no_mark: true}: the update shell with action "/card/update"
 *  (no mark segment), the _method patch spoof, and NO success hiddens in
 *  the shell - the success hash rides hidden_tags INSIDE the block
 *  (success[mark] = the rule context's name url_key - stars and case kept,
 *  spaces to underscores - success[view] = the success view, :open
 *  default). The haml template's divs carry single-quoted attrs, the Rails
 *  helpers double quotes. The editor section dispatches
 *  renderView("rule_form_card_editor") when the consuming tree registers
 *  it; callers without it inject the section's bytes. */
export function ruleFormHtml(ctx: ViewContext, deps: RuleFormDeps = {}): string {
  const fmt = ctx.fmt;
  // rule_form.rb:15-24 prepare_rule_form_options + :66-71 edit_rule_success:
  // @success_view ||= :open (the modal arm's current_rule_form passes
  // :overlay_rule - modal.rb:54-59).
  const successView = deps.successView ?? "open";
  const mark = fmt.card.name.s.replace(/ /g, "_");
  const formType: "overlay" | "modal" = "overlay";
  const editorHtml = deps.editorHtml ?? fmt.renderView("rule_form_card_editor");
  const seconds = String(Math.floor(Date.now() / 1000));
  // rule_form.haml: the two guide-line sections (haml emits one newline per
  // template line; the nested renders inline directly after their lines;
  // the template's final newline precedes the </form>).
  const inner =
    successTags({ mark, view: successView }) +
    `<div class='guide-line rule-section mt-4'>\n` +
    `<h5>\n` +
    `<div class='guide-line-number'>1</div>\n` +
    `Define rule\n` +
    `</h5>\n` +
    editorHtml +
    `<div class='rule-section'>\n` +
    `<h5>\n` +
    `<div class='guide-line-number'>2</div>\n` +
    `Apply to set\n` +
    popoverLink(
      "Each rule applies to a set of cards. Rules for more specific sets override rules for more general ones.",
    ) +
    `\n</h5>\n` +
    `<div class='card-editor'>\n` +
    boardRuleSetSelectionHtml(fmt, deps, seconds) +
    `\n` +
    editRuleButtonsHtml(ctx, formType) +
    `\n</div>\n</div>\n`;
  return cardFormShell(ctx, {
    formClass: "card-rule-form card-form slotter",
    id: `edit_card_${fmt.card.id}`,
    htmlAttrs: [["data-slotter-mode", "update-origin"]],
    action: "/card/update",
    methodSpoof: "patch",
    success: undefined,
    body: inner,
  });
}

/** board_rules_editor.rb:8-11 view :modal_rule (wrap { modal { title:
 *  render_title } }) + modal.rb:54-59 current_rule_form: the body renders
 *  the :rule_form body on a SUBFORMAT of current_rule (find_existing_rule_
 *  card - rule/editor.rb:119-130: the rule card itself when it exists; the
 *  new-card arm is a disclosed remainder) - a fresh voo chain (the inner
 *  slot's show list is ["rule_form"] alone) with
 *  the parent format for context/nest-mode inheritance
 *  (format/nesting/subformat.rb shape) - with success_view :overlay_rule
 *  and the view's own slot wrap (Ruby's subformat.rule_form call runs the
 *  full view body, whose in-body `wrap do` produces it). The modal wrap:
 *  title = render_title, menu = render(:modal_menu) (the view emits its own
 *  wrapper div, modal.rb:24), footer = render(:modal_footer) (the Close
 *  button), no size opt (the default "modal-dialog modal-dialog-centered"),
 *  and the voo.show? gates for header/menu (modal_dialog.haml:6-13 - the
 *  hide: :modal_header arm leaves the header ABSENT). The haml
 *  template's output carries the trailing newline. deps.editorHtmlFor is
 *  the disclosed editor seam (see RuleFormDeps.editorHtml). */
export function modalRuleHtml(
  ctx: ViewContext,
  deps: { editorHtmlFor?: (name: string) => string; known?: (nameKey: string) => boolean } = {},
): string {
  const { fmt, voo } = ctx;
  // format/nesting/subformat.rb subformat(card): a new format on the same
  // card whose parent is this format (nest-mode inheritance) and whose voo
  // state is fresh. The voo's viz carries the requested view (renderView's
  // process_visibility first-touch - the inner slot's show list is
  // ["rule_form"]).
  const sub = new RenderFormat(fmt.card, fmt.engine, { parent: fmt, maxDepth: fmt.maxDepth });
  const subVoo = new Voo(undefined, "rule_form", {});
  subVoo.viz.set("rule_form", "show");
  const subCtx: ViewContext = { fmt: sub, voo: subVoo };
  const editorHtml = deps.editorHtmlFor?.(fmt.card.name.s);
  const bodyHtml = modSlotWrap(
    subCtx,
    "rule_form",
    ruleFormHtml(subCtx, { editorHtml, successView: "overlay_rule", known: deps.known }),
  );
  return (
    modalDialogWrap({
      show: (view: string) => voo.show(view),
      titleHtml: fmt.renderView("title"),
      menuHtml: voo.show("modal_menu") ? fmt.renderView("modal_menu") : undefined,
      footerHtml: fmt.renderView("modal_footer"),
      bodyHtml,
    }) + "\n"
  );
}

export const modalRuleView: ViewFn = (ctx) => modalRuleHtml(ctx);

/** The registered-shape viewFn for :rule_form. Ruby wraps in-body
 *  (rule_form.rb:5 `wrap do`) - the same slot wrap the quick_edit
 *  demonstration view emits through modSlotWrap (the byte-identical
 *  slot-wrap emitter; the wrap: :slot declaration's bytes). */
export const ruleFormView: ViewFn = (ctx) =>
  modSlotWrap(ctx, "rule_form", ruleFormHtml(ctx));
