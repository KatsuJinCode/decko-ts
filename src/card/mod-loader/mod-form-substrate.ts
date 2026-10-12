// The Rails form-builder substrate for mod ports: the byte emitters the
// ported form views compose, extracted so mods OTHER than card-mod-edit can
// drive the same shapes (the rules-views, tinymce-views and edit-remainders
// passes all documented the same blocker: card_form / button_formgroup /
// standard_save_button / create_form existed only as module-private
// card-mod-edit.ts functions, unreachable from other mods' view bodies).
//
// Every emitter cites its Ruby source; the byte shapes are pinned against
// oracle captures (fixtures/captured/form-substrate.json for the
// quick_edit/new_image_buttons chains; fixtures/captured/edit-forms.json for
// the edit-side buttons this substrate reproduces byte-identically).
//
// Ruby mechanism notes the byte order rests on:
// - card-1.110.0 lib/card/format/method_delegation.rb:33-69: the html format
//   delegates missing methods (form_for, button_tag, hidden_field_tag,
//   link_to) to an ActionView instance - these ARE the Rails helpers.
// - actionview-7.2.3.2 form_tag_helper.rb:566-579 button_tag:
//   `{ "name" => "button", "type" => "submit" }.merge!(options)` - name/type
//   FIRST, the caller's options in THEIR insertion order after.
// - card-mod-bootstrap set/all/bootstrap/form.rb:14-17 + 31-36:
//   bootstrapify_button deletes :situation and appends
//   "btn btn-#{situation}" to the class IN PLACE (the class attribute keeps
//   its position in the hash).
// - ActiveSupport reverse_merge!(other) = other.merge!(self): the DEFAULT
//   keys (submit_button's situation:/data:, form.rb:210) come FIRST, the
//   caller's keys keep their relative order after them. That is why the
//   data-disable-with attribute (inside data:) precedes every caller attr,
//   and why standard_save_and_close_button's data-cy precedes its class
//   (its reverse_merge ran BEFORE submit_button's).
// - TagHelper#tag_options (tag_helper.rb:261-309): options iterate in hash
//   order; a data: hash expands INLINE where it sits.
// - form_tag_helper.rb:984-1009 html_options_for_form + 1011-1039
//   extra_tags_for_form + url_helper.rb:762-765 method_tag: the <form> attr
//   order is [class/id from apply_form_for_options!'s reverse_merge
//   (form_helper.rb:465-475), the caller's html keys, action,
//   accept-charset, data-remote, method], followed by the utf8 enqueuer
//   (form_tag_helper.rb:976-979, the literal &#x2713; bytes) and the
//   _method spoof input. decko config
//   embed_authenticity_token_in_remote_forms = false (the captured forms
//   carry no authenticity_token - tokens ride the meta tag).
// - all/form_elements.rb:16-43 success_tags/hidden_tags/process_hidden_
//   value: the success hash deep-encodes into Rails params names
//   (success[slot][hide]), arrays append "[]" to the base; each tag is
//   hidden_field_tag (form_tag_helper.rb:264-268: type, name, id, value,
//   autocomplete="off" LAST; a nil value OMITS the value attribute).

import { h } from "../render/slot-html.js";
import type { ViewContext } from "../render/format.js";

// ---------------------------------------------------------------------------
// buttons - all/form_elements.rb:59-64 submit_button + bootstrap
//           form.rb:14-17 button_tag + form_tag_helper.rb:566-579
// ---------------------------------------------------------------------------

/**
 * submit_button text, args -> button_tag: name="button" type="submit" first,
 * then the caller's ordered attrs (data-disable-with rides the data: hash
 * first per the reverse_merge mechanism above), class appended with
 * "btn btn-primary" IN PLACE (bootstrapify_button), data-disable-with
 * defaulting to "Submitting" (form_elements.rb:62).
 *
 * orderedAttrs: the caller's attrs as [key, value] pairs in the exact hash
 * order the Ruby chain produced for the call site (the two captured shapes:
 * standard_save_button's [class, data-cy] after any caller extras, and
 * standard_save_and_close_button's [data-cy, class]).
 */
export function submitButton(text: string, orderedAttrs: Array<[string, string]>): string {
  const attrs: string[] = [`name="button"`, `type="submit"`];
  let hasDisableWith = false;
  for (const [key, value] of orderedAttrs) {
    if (key === "class") {
      attrs.push(`class="${value} btn btn-primary"`);
    } else {
      attrs.push(`${key}="${value}"`);
    }
    if (key === "data-disable-with") hasDisableWith = true;
  }
  if (!hasDisableWith) {
    // form_elements.rb:62: data.disable_with ||= "Submitting" - the data:
    // hash was reverse_merge'd FIRST, so the attribute leads the caller's
    attrs.splice(2, 0, `data-disable-with="Submitting"`);
  }
  return `<button ${attrs.join(" ")}>${h(text)}</button>`;
}

/**
 * all/form_buttons.rb:15-22 standard_save_button: `return if
 * voo&.hide?(:save_button)`; add_class "submit-button me-3
 * _update-history-pills"; text "Save"; "data-cy" "save"; then any caller
 * extras (new_image_buttons passes no_origin_update: true, which Rails
 * emits verbatim as an attribute - the captured
 * no_origin_update="true" bytes). Returns undefined when hidden (the
 * output() join compacts it away).
 */
export function standardSaveButtonBody(
  ctx: Pick<ViewContext, "voo">,
  callerAttrs: Array<[string, string]> = [],
): string | undefined {
  if (!ctx.voo.show("save_button")) return undefined;
  // Ruby opts order: [no_origin_update (caller), class (add_class), data-cy].
  // add_class APPENDS to an existing caller class in place (form_buttons.rb
  // :17 mutates the caller's :class hash entry - edit_rule_buttons passes
  // class: "_rule-submit-button" and the captured bytes carry
  // "_rule-submit-button submit-button me-3 _update-history-pills").
  const attrs: Array<[string, string]> = [];
  let classEmitted = false;
  for (const [key, value] of callerAttrs) {
    if (key === "class") {
      attrs.push(["class", `${value} submit-button me-3 _update-history-pills`]);
      classEmitted = true;
    } else {
      attrs.push([key, value]);
    }
  }
  if (!classEmitted) {
    attrs.push(["class", "submit-button me-3 _update-history-pills"]);
  }
  attrs.push(["data-cy", "save"]);
  return submitButton("Save", attrs);
}

/** all/form_buttons.rb:29-38 standard_save_and_close_button (the :edit
 *  form's second button - reverse_merge order puts data-cy BEFORE class).
 *  Pinned by the edit-forms capture; lives here so the substrate is the one
 *  home of the button byte contract. */
export function standardSaveAndCloseButton(): string {
  return submitButton("Save and Close", [
    ["data-cy", "submit-modal"],
    ["class", "submit-button me-3 _close-on-success _update-origin"],
  ]);
}

// ---------------------------------------------------------------------------
// button_formgroup - all/form.rb:38-40
// ---------------------------------------------------------------------------

/** `wrap_with :div, class: "form-group #{classy 'button-form-group'}"` -
 *  classy resolves the class_up extras (new_in_modal_buttons' class_up
 *  "button-form-group" "d-flex" rides the same chain). */
export function buttonFormGroup(ctx: ViewContext, inner: string): string {
  return `<div class="form-group ${ctx.voo.classy("button-form-group")}">${inner}</div>`;
}

// ---------------------------------------------------------------------------
// formgroup - all/formgroup.rb:16-44 + all/form.rb:242-246 editor_wrap
// ---------------------------------------------------------------------------

/**
 * formgroup title, opts, block: `wrap_with :div, formgroup_div_args do
 * [formgroup_label(input, title, help), editor_wrap(input, &block)] end` -
 * the pair joins "\n" (the captured newline between label and editor div).
 *
 * divArgs: formgroup_div_args (:35-40) - class "form-group #{html_class}",
 * data-card-id when real, then data-card-name / data-card-link-name when
 * the name is present (h-escaped, :42-44).
 */
export function formgroup(
  fmt: ViewContext["fmt"],
  title: string,
  opts: { input: string; class?: string; help?: false },
  inner: string,
): string {
  const card = fmt.card;
  const attrs: string[] = [`class="form-group${opts.class ? ` ${opts.class}` : ""}"`];
  if (card.id !== undefined) attrs.push(`data-card-id="${card.id}"`);
  if (card.name.s !== "") {
    attrs.push(`data-card-name="${h(card.name.s)}"`);
    attrs.push(`data-card-link-name="${h(fmt.urlKey())}"`);
  }
  // formgroup_label (:24-33): parts [title (shown by default), help (nil
  // for help: false)] -> form.label(:content, raw(parts)) ->
  // `<label for="card_content">`
  const label = `<label for="card_${opts.input}">${title}</label>`;
  // editor_wrap (:242-246): `<div class="editor #{type}-editor">`
  return `<div ${attrs.join(" ")}>${label}\n<div class="editor ${opts.input}-editor">${inner}</div></div>`;
}

// ---------------------------------------------------------------------------
// card_form - all/form.rb:193-240 (card_form/hidden_form_tags/
//             card_form_opts/card_form_html_opts) + form_elements.rb:16-43
// ---------------------------------------------------------------------------

/** all/form_elements.rb:16-20 success_tags: `return "" unless opts.present?;
 *  hidden_tags success: opts` - the success hash rides the top "success"
 *  key. 22-43 hidden_tags/process_hidden_value: deep-encode into Rails
 *  params names. Key order is insertion order; nil values OMIT the value
 *  attribute (hidden_field_tag, form_tag_helper.rb:264-268); arrays append
 *  "[]" to the base name. The tag id is sanitize_to_id(name)
 *  (form_tag_helper.rb:1058-1060: delete "]" then tr "[" -> "_"). */
export function successTags(
  success: Record<string, unknown> | undefined,
): string {
  if (success === undefined) return "";
  return hiddenTags({ success: success });
}

/** all/form_elements.rb:22-43 hidden_tags/process_hidden_value. */
function hiddenTags(hash: Record<string, unknown>, base?: string): string {
  let out = "";
  for (const [key, value] of Object.entries(hash)) {
    const name = base === undefined ? key : `${base}[${key}]`;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      out += hiddenTags(value as Record<string, unknown>, name);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        out += hiddenTags({ "": item }, `${name}[]`);
      }
    } else {
      const id = name.replace(/\]/g, "").replace(/\[/g, "_");
      const valueAttr = value === null ? "" : ` value="${h(String(value))}"`;
      out += `<input type="hidden" name="${h(name)}" id="${h(id)}"${valueAttr} autocomplete="off" />`;
    }
  }
  return out;
}

export interface CardFormShellOpts {
  /** the form's css class (card_form_html_opts :218-224: "card-form" +
   *  "slotter" unless redirect, + "autosave" for :update). */
  formClass: string;
  /** the dom id: Rails form_for's dom_id - "edit_card_<id>" for a persisted
   *  record, "new_card" for a new one (form_helper.rb:465-475). */
  id: string;
  /** the caller's html attrs in THEIR hash order (quick_form_opts'
   *  "data-slot-selector" leads the edit_form's data-slot-error-selector
   *  etc. - captured order). */
  htmlAttrs: Array<[string, string]>;
  /** the action path (card_form_url_and_action :232-240: path(action:...) -
   *  "/update/<mark>" / "/card/create"). */
  action: string;
  /** "patch" emits the _method spoof (update); null for create (post). */
  methodSpoof: "patch" | null;
  /** hidden_form_tags (:202-205): the success hash's hidden tags BEFORE the
   *  body. */
  success: Record<string, unknown> | undefined;
  /** The recaptcha mod's hidden_form_tags OVERRIDE suffix
   *  (card-mod-recaptcha set/all/recaptcha.rb:89-93: `return super unless
   *  recaptcha?(opts); super + recaptcha_token(action)`) - the widget bytes
   *  the loaded mod's format block appends after the success tags, because
   *  card_form composes `hidden + output(yield(cform))` (form.rb:195).
   *  The bytes compose through the mod's recaptchaHiddenFormTags
   *  composite; ABSENT (every form whose consult decided off, and every
   *  caller predating the seam) = the base byte shape, unchanged. */
  recaptchaTokenHtml?: string;
  body: string;
}

/**
 * card_form action, opts: @form_root = true; hidden_form_tags; form_for
 * card, {url:, html:, remote: true}. The emitted shell:
 * `<form class=... id=... [caller attrs] action=... accept-charset="UTF-8"
 * data-remote="true" method="post">` + utf8 enqueuer + _method spoof + the
 * success hiddens + the body + `</form>` (html_options_for_form +
 * extra_tags_for_form + form_tag_with_body, form_tag_helper.rb:984-1051).
 * No authenticity_token (embed_authenticity_token_in_remote_forms=false).
 */
export function cardFormShell(_ctx: ViewContext, opts: CardFormShellOpts): string {
  const attrs: string[] = [`class="${opts.formClass}"`, `id="${opts.id}"`];
  for (const [key, value] of opts.htmlAttrs) attrs.push(`${key}="${value}"`);
  attrs.push(`action="${opts.action}"`);
  attrs.push(`accept-charset="UTF-8"`);
  attrs.push(`data-remote="true"`);
  attrs.push(`method="post"`);
  return (
    `<form ${attrs.join(" ")}>` +
    `<input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" />` +
    (opts.methodSpoof === null
      ? ""
      : `<input type="hidden" name="_method" value="${opts.methodSpoof}" autocomplete="off" />`) +
    successTags(opts.success) +
    (opts.recaptchaTokenHtml ?? "") +
    opts.body +
    `</form>`
  );
}

/**
 * The create arm (new.rb:43-49 create_form -> card_form :create): no
 * _method spoof, dom id "new_card", action "/card/create"
 * (card_form_url_and_action :232-240 path(action: :create)).
 */
export function createFormShell(
  ctx: ViewContext,
  opts: {
    htmlAttrs: Array<[string, string]>;
    success: Record<string, unknown> | undefined;
    body: string;
    recaptchaTokenHtml?: string;
  },
): string {
  // form_for's own persistence keying: a PERSISTED record's create-action
  // form (user.rb:29-32 setup_form's frame_and_form :create over the real
  // Quinn Contractor card) names the form edit_card_<id> and sends the
  // _method=patch spoof, exactly like an update form — the graded setup
  // row pins both. The :new family renders NEW records and keeps the
  // new_card/post shape. The bunny /new/:type route renders a virtual new
  // card with NO render format at all ({} as ViewContext) — no format, no
  // persisted record, so the absent card answers the :new shape.
  const persisted = ctx.fmt?.card?.id !== undefined;
  return cardFormShell(ctx, {
    formClass: "card-form slotter",
    id: persisted ? `edit_card_${ctx.fmt.card.id}` : "new_card",
    htmlAttrs: opts.htmlAttrs,
    action: "/card/create",
    methodSpoof: persisted ? "patch" : null,
    success: opts.success,
    recaptchaTokenHtml: opts.recaptchaTokenHtml,
    body: opts.body,
  });
}

// ---------------------------------------------------------------------------
// round 2 (form-substrate-2): the rule_form family's primitives - the
// behaviors the two recorded results (rules-views-port-3.md,
// the corresponding port note) named as the open form-parity arms. Everything here is
// oracle-pinned by fixtures/captured/form-substrate-2.json
// (oracle-capture-form-substrate-2.rb, no-write proof card_actions
// 5018 -> 5018).
// ---------------------------------------------------------------------------

/** ActiveSupport array/conversions.rb:60 to_sentence with the DEFAULT
 *  connectors: words_connector ", ", two_words_connector " and ",
 *  last_word_connector ", and ". The RuleSetRadio narrower_warning message
 *  joins the accumulated @narrower_rules with it - on the capture deck the
 *  entries are ALL "" (uncapitalized_label's shadowing bug - the TS port is
 *  set-name.ts's uncapitalizedLabelForParsedSet), so the captured warnings
 *  read "for ." / "for  and ." / "for , , and ." - the to_sentence bytes over
 *  empty strings are exactly what the fixture pins. */
export function toSentence(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  const head = items.slice(0, -1).join(", ");
  return `${head}, and ${items[items.length - 1]}`;
}

/** bootstrap icon.rb:96-104 icon_tag + 120-123 material_icon_tag + 144-153
 *  universal_icon_tag: add_class "material-icons" then add_class
 *  "notranslate" - the CALLER's class key keeps its position, so the extra
 *  class comes FIRST ("text-muted notranslate material-icons", the captured
 *  RuleSetRadio label icon). The glyph resolves through icon_lookup's
 *  basket (card-mod-bootstrap's ICON_BASKET.material - the entries this
 *  substrate's consumers use are kept here; icon_lookup's fallback is the
 *  key itself). */
const SUBSTRATE_MATERIAL_GLYPHS: Readonly<Record<string, string>> = {
  new_window: "close_fullscreen",
  help: "help",
  close: "close",
};

export function iconTag(key: string, extraClass?: string): string {
  const glyph = SUBSTRATE_MATERIAL_GLYPHS[key] ?? key;
  const cls = `notranslate material-icons`;
  return `<i class="${extraClass ? `${extraClass} ${cls}` : cls}">${glyph}</i>`;
}

/** bootstrap helper.rb:41-56 popover_link + popover_opts: icon_tag(:help)
 *  text; popover_opts add_class "ps-1 _popover_link" FIRST (opts = {class}),
 *  then reverse_merge! {path: "#", tabindex: 0, data: {bs-toggle, bs-trigger,
 *  bs-content}} = {path,tabindex,data}.merge!({class}) - insertion order
 *  path, tabindex, data, class; link_to emits the href LAST (links.rb:101-106
 *  deletes :path, appends :href). The captured bytes carry title-less shape
 *  (no data-bs-title key). */
export function popoverLink(text: string): string {
  return (
    `<a tabindex="0" data-bs-toggle="popover" data-bs-trigger="hover focus"` +
    ` data-bs-content="${h(text)}" class="ps-1 _popover_link" href="#">` +
    `${iconTag("help")}</a>`
  );
}

/** Rails ActionView radio_button via decko's FIELD_HELPERS delegation
 *  (card-mod-edit set/all/form_elements.rb:5-15 - format.radio_button(*args)
 *  = form.radio_button(*args), the FORM BUILDER binding object_name "card")
 *  -> actionview tags/radio_button.rb + base.rb: the caller's options in
 *  their hash order (RuleSetRadio's [checked:, warning:, class:, id:] -
 *  checked:false is CONSUMED by RadioButton's checked? logic and emits no
 *  attribute), then the tag's own [type, value, name] appended - the
 *  captured order warning?, class, id, type, value, name="card[name]". */
export function radioButtonTag(
  method: string,
  value: string,
  opts: { warning?: string; class?: string; id: string },
): string {
  const attrs: string[] = [];
  if (opts.warning !== undefined) attrs.push(`warning="${h(opts.warning)}"`);
  if (opts.class !== undefined) attrs.push(`class="${h(opts.class)}"`);
  attrs.push(`id="${h(opts.id)}"`);
  attrs.push(`type="radio"`);
  attrs.push(`value="${h(value)}"`);
  attrs.push(`name="card[${h(method)}]"`);
  return `<input ${attrs.join(" ")} />`;
}

/** all/form_buttons.rb:29-38 standard_save_and_close_button, the
 *  parameterized form (the round-1 zero-arg emitter above is the :edit
 *  pin's shape): close = opts.delete(:close) || :modal; add_class
 *  "submit-button me-3 _close-on-success"; add_class "_update-origin"
 *  unless no_origin_update; reverse_merge! text/data-cy - so data-cy
 *  ("submit-#{close}") precedes the merged class, after
 *  submit_button's data-disable-with. edit_rule_buttons passes
 *  class: "_rule-submit-button", close: form_type (:overlay/:modal). */
export function standardSaveAndCloseButtonBody(
  opts: { close: string; callerClass?: string },
): string {
  const mergedClass = opts.callerClass
    ? `${opts.callerClass} submit-button me-3 _close-on-success _update-origin`
    : "submit-button me-3 _close-on-success _update-origin";
  return submitButton("Save and Close", [
    ["data-cy", `submit-${opts.close}`],
    ["class", mergedClass],
  ]);
}

/** card-mod-layout set/all/overlay.rb:3-5 OVERLAY_CLOSE_OPTS + :55-60
 *  overlay_close_button: button_opts = opts.merge(OVERLAY_CLOSE_OPTS)
 *  (class "_close-overlay btn-sm", data-bs-dismiss "overlay", type
 *  "button"); classes = opts.delete(:class) then add_class AFTER the merge -
 *  the caller's class APPENDS to "_close-overlay btn-sm" (edit_rule_cancel_
 *  button passes class: "btn-sm" -> the captured doubled "btn-sm btn-sm");
 *  button_tag's {name, type} defaults merge FIRST (type replaced by the
 *  overlay's "button" IN PLACE), bootstrapify_button deletes :situation and
 *  appends "btn btn-#{situation}" to the class. Captured order: name, type,
 *  class, data-bs-dismiss. */
export function overlayCloseButton(
  text: string,
  opts: { situation?: string; callerClass?: string } = {},
): string {
  const cls = `_close-overlay btn-sm${opts.callerClass ? ` ${opts.callerClass}` : ""}${
    opts.situation ? ` btn btn-${opts.situation}` : " btn btn-primary"
  }`;
  return `<button name="button" type="button" class="${cls}" data-bs-dismiss="overlay">${h(text)}</button>`;
}

/** all/form_buttons.rb:53-77 delete_button + delete_button_opts +
 *  delete_confirm + delete_success: add_class "slotter btn btn-outline-
 *  danger ms-auto" (IN PLACE - the caller's class keeps its lead position),
 *  "data-confirm" = the confirm string (the caller's :confirm key STAYS -
 *  symbol vs string keys coexist, the captured duplicate), path {action:
 *  :delete} (+ the caller's success {} rides it - the captured trailing "?"
 *  is the empty query), remote: true -> data-remote. link_to emits
 *  caller-then-added order with href last-but-data-remote (the captured
 *  order: confirm, data-slotter-mode, class, data-confirm, href,
 *  data-remote). The caller (edit_rule_delete_button) wraps the link in
 *  `<span class="rule-delete-section">`. */
export function ruleDeleteButtonLink(opts: {
  confirm: string;
  urlKey: string;
  callerClass?: string;
  dataSlotterMode?: string;
}): string {
  const attrs: string[] = [];
  attrs.push(`confirm="${h(opts.confirm)}"`);
  if (opts.dataSlotterMode !== undefined) {
    attrs.push(`data-slotter-mode="${h(opts.dataSlotterMode)}"`);
  }
  const cls = `${opts.callerClass ?? ""} slotter btn btn-outline-danger ms-auto`;
  attrs.push(`class="${h(cls)}"`);
  attrs.push(`data-confirm="${h(opts.confirm)}"`);
  attrs.push(`href="/delete/${h(opts.urlKey)}?"`);
  attrs.push(`data-remote="true"`);
  return `<a ${attrs.join(" ")}>Delete</a>`;
}

/** card-mod-layout set/all/modal/modal_dialog.haml:1-18 (the wrapper :modal
 *  of card-mod-layout set/all/modal.rb:7-13) - the modal wrap machinery the
 *  rule_form family's modal_rule/rule_edit views ride. Byte contract (the
 *  form-substrate-2 capture pins BOTH arms):
 *  - the container/comment/dialog/content quartet is haml-emitted (SINGLE
 *    quoted attrs); the commented-out backdrop line renders VERBATIM as the
 *    html comment `<!-- /, "data-backdrop": "static"} -->`;
 *  - `voo.show? :modal_header` gates the whole header block (the capture's
 *    hide: :modal_header arm renders none of it);
 *  - `voo.show? :modal_menu` gates the menu div inside the header;
 *  - `.modal-body` always renders; `footer.present?` gates .modal-footer
 *    (modal_rule's normalize_modal_option :footer renders :modal_footer ->
 *    the Close button; footer "" is present?-false -> no footer, the
 *    rule_edit arm, uncaptured here);
 *  - size: modal_dialog_classes (:81-95) - no size opt = "modal-dialog
 *    modal-dialog-centered". */
export function modalDialogWrap(opts: {
  show: (view: string) => boolean;
  titleHtml: string;
  /** the :modal_menu render (card-mod-layout's modalMenuView emits the
   *  wrapper :modal_menu div itself - modal.rb:24); included only when
   *  voo.show? :modal_menu. */
  menuHtml: string | undefined;
  footerHtml: string | undefined;
  bodyHtml: string;
  size?: string;
}): string {
  const dialogClass =
    opts.size === undefined || opts.size === ""
      ? "modal-dialog modal-dialog-centered"
      : `modal-dialog modal-dialog-centered modal-${opts.size}`;
  const header = opts.show("modal_header")
    ? `<div class='modal-header'>\n${opts.titleHtml}\n` +
      (opts.show("modal_menu") && opts.menuHtml !== undefined
        ? `${opts.menuHtml}\n`
        : "") +
      `</div>\n`
    : "";
  const footer =
    opts.footerHtml !== undefined && opts.footerHtml !== ""
      ? `<div class='modal-footer'>\n${opts.footerHtml}\n</div>\n`
      : "";
  return (
    `<div class='modal fade _modal-slot' id='modal-container' role='dialog'>\n` +
    `<!-- /, "data-backdrop": "static"} -->\n` +
    `<div class='${dialogClass}'>\n` +
    `<div class='modal-content'>\n` +
    header +
    `<div class='modal-body'>\n` +
    opts.bodyHtml +
    `\n</div>\n` +
    footer +
    `</div>\n</div>\n</div>`
  );
}
