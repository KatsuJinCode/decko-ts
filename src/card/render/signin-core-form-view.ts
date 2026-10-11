// The *signin :core view emitter — the sign-in form — ONE source consumed by
// TWO registrations:
//   1. the account mod's manifest (card-mod-account.ts, self/signin html
//      :core) — the loader-bound path;
//   2. the render layer's flat coreView self/signin branch (views.ts) — the
//      HEADLESS pattern (the SELF_SET_TITLE_OVERRIDES precedent): the edge
//      engines run mod-less (ModLoader is never set as the default loader on
//      the edge boot, so a manifest registration never dispatches there),
//      and without this branch the edge rendered the *signin card's EMPTY
//      RichText content where production renders the login form.
//
// Ruby source (card-mod-account-0.20.0 set/self/signin.rb:114-125, read from
// the downloaded gem this pass):
//
//   before :core do
//     voo.edit_structure = [signin_field(:email), signin_field(:password)]
//   end
//
//   view :core, cache: :never do
//     with_nest_mode :edit do
//       card_form :update, recaptcha: :off, success: signin_success do
//         haml :core
//       end
//     end
//   end
//
// The BYTE oracle is production's own anonymous GET /*signin
// (REPO_DIR an internal work log, captured
// 2026-10-03; the form region extracted verbatim as
// signin-form-region-ref.txt in that directory). The hermetic pin
// (tests/card/mod-loader/signin-core-form-view.test.ts) transcribes the
// capture and holds the rendered bytes EQUAL modulo the per-render random
// data-slot-id.
//
// This module deliberately imports NO mod files: only the form substrate
// and the slot emitters (the core-mod.ts import-safety rule — views.ts
// already imports that module).

import {
  emitAttrs,
  h,
  newSlotId,
  slotOptionsJson,
} from "./slot-html.js";
import { cardFormShell } from "../mod-loader/mod-form-substrate.js";
import type { ViewContext } from "./format.js";

/** en.yml (card-mod-account-0.20.0 config/locales/en.yml:19,29,31) — the
 *  button/link texts the haml template renders. */
const SIGNIN_FORM_LOCALE = {
  account_or_sign_up: "...or sign up!",
  account_reset_password: "Reset password",
  account_sign_in: "Sign in",
} as const;

/** The Rails tag-id sanitizer the captured editor input ids carry:
 *  `card[subcards][+*email][content]` -> `card_subcards___email_content`.
 *  Mechanism: ActionView's id from a form-field name drops "]" and turns
 *  every other non-word char ("[", "+", "*") into "_" — three underscores
 *  between "subcards" and the field name in the captured bytes ([, +, *).
 *  The two sign-in field names ("email", "password") are pure lowercase
 *  words, so this exact mapping is all the captured shapes need. */
function signinSubcardInputId(field: string, attr: string): string {
  return `card_subcards___${field}_${attr.replace(/\[/g, "_")}`;
}

/** One edit_structure field's captured editor block: the form-group div,
 *  its label (title span + the help-view slot), and the content-editor
 *  inputs. `password` carries the _pw-input class, the literal placeholder
 *  and the toggle-password span (card-mod-bootstrap's password editor
 *  chrome, captured bytes) and NO value attribute; `email` renders the
 *  subcard's stored content as value (empty on the oracle deck: value=""). */
function signinFieldGroup(
  ctx: ViewContext,
  field: "email" | "password",
  subcard: {
    setKeys: string;
    typeId: number | string | undefined;
    typeName: string | undefined;
    content: string;
  } | undefined,
): string {
  const subName = `${ctx.fmt.card.name.s}+*${field}`;
  const safeRight = field === "email" ? "Xemail" : "Xpassword";
  const rightClass = `RIGHT-${safeRight}`;
  // The structural fallbacks are the account mod's own invariants: both
  // rights assign_type :phrase (right/email.rb:3, right/password.rb:3;
  // type_id 52 on every deck the mod ships on); the set-key list is the
  // Phrase right-card's standard chain (the captured oracle bytes).
  const setKeys = subcard?.setKeys ??
    `ALL ALL_PLUS TYPE-phrase RSTAR ${rightClass} TYPE_PLUS_RIGHT-rich_text-${safeRight}`;
  const typeId = subcard?.typeId !== undefined ? String(subcard.typeId) : "52";
  const typeName = subcard?.typeName ?? "Phrase";
  const contentId = signinSubcardInputId(field, "content");
  const typeIdId = signinSubcardInputId(field, "type_id");
  const contentName = `card[subcards][+*${field}][content]`;
  const typeIdName = `card[subcards][+*${field}][type_id]`;
  // The help-view slot's data-slot payload: the edit-form field help nest's
  // fixed Ruby semantics (view help, the edit_in_form+help show list, the
  // field's titled home view, the field title, the parent name context) —
  // constant across decks; slotOptionsJson orders/escapes it into the
  // captured data-slot bytes.
  const dataSlot = slotOptionsJson({
    view: "help",
    show: ["edit_in_form", "help"],
    home_view: "titled",
    title: field,
    name_context: ctx.fmt.card.name.s,
  });
  const label =
    `<label for="${contentId}"><span class="card-title" title="${field}">${field}</span>\n` +
    `<div${emitAttrs({
      // the subcard's slot id: name.ts safeKey (* -> X, + -> -) + the view —
      // "Xsignin-Xemail-help-view", the captured bytes.
      id: `${ctx.fmt.card.name.safeKey}-X${field}-help-view`,
      class: `card-slot help-view ${setKeys}`,
      "data-card-name": subName,
      "data-card-type-id": typeId,
      "data-card-type-name": typeName,
      "data-card-link-name": subName,
      "data-slot-id": newSlotId(),
      "data-slot": dataSlot,
    })}></div></label>`;
  const editor =
    field === "email"
      ? `<div class="editor content-editor">` +
        `<input class="d0-card-content form-control" placeholder="" type="text"` +
        ` value="${h(subcard?.content ?? "")}" name="${contentName}" id="${contentId}" />\n` +
        `<input autocomplete="off" type="hidden" value="${typeId}" name="${typeIdName}" id="${typeIdId}" /></div></div>`
      : `<div class="editor content-editor">` +
        `<input class="d0-card-content _pw-input form-control" placeholder="Password"` +
        ` autocomplete="off" type="password" name="${contentName}" id="${contentId}" />\n` +
        `<span class='_toggle-password visibility-icon _pw-text-area'>\n` +
        `<i class="_toggle-pw-visibility notranslate material-icons">visibility_off</i>\n` +
        `</span>\n\n` +
        `<input autocomplete="off" type="hidden" value="${typeId}" name="${typeIdName}" id="${typeIdId}" /></div></div>`;
  return (
    `<div class="form-group card-editor ${rightClass}"` +
    emitAttrs({ "data-card-name": subName, "data-card-link-name": subName }) +
    `>${label}\n${editor}`
  );
}

/** set/self/signin.rb:119-125 view :core — the sign-in form bytes (see the
 *  module docstring for the oracle and the Ruby mechanism). */
export function signinCoreHtml(ctx: ViewContext): string {
  const { fmt } = ctx;
  const subcardFor = (field: "email" | "password") => {
    const sub = fmt.engine.fetchRenderCard(`${fmt.card.name.s}+*${field}`);
    if (sub === undefined) return undefined;
    return {
      setKeys: sub.setKeys,
      typeId: sub.typeId,
      typeName: sub.typeName,
      content: sub.dbContent,
    };
  };
  const urlKey = fmt.urlKey();
  // core.haml verbatim: `.signin-fields` wrapping the fieldset, then the
  // buttons div — Haml's literal divs keep their single-quoted classes.
  const hamlBody =
    `<div class='signin-fields'>\n` +
    `<fieldset class="card-editor editor">` +
    signinFieldGroup(ctx, "email", subcardFor("email")) +
    `\n` +
    signinFieldGroup(ctx, "password", subcardFor("password")) +
    `</fieldset>\n` +
    `</div>\n` +
    `<div class='form-group signin-buttons'>\n` +
    `<div class='reset-password-link'>\n` +
    `<a rel="nofollow" class="slotter" href="/${urlKey}/edit?slot%5Bhide%5D%5B%5D=board_link" data-remote="true">${SIGNIN_FORM_LOCALE.account_reset_password}</a>\n` +
    `</div>\n` +
    `<div class='signin-button'>\n` +
    // button_tag t(:account_sign_in), situation: "primary" — Rails'
    // button_tag helper (NOT decko's submit_button): name/type then the
    // bootstrapified class, NO data-disable-with (the captured bytes).
    `<button name="button" type="submit" class="btn btn-primary">${SIGNIN_FORM_LOCALE.account_sign_in}</button>\n` +
    `</div>\n` +
    `<div class='signup-button'>\n` +
    `<a class="known-card" href="/new/Sign_up">${SIGNIN_FORM_LOCALE.account_or_sign_up}</a>\n` +
    `</div>\n` +
    `</div>\n`;
  // card_form :update, recaptcha: :off, success: signin_success
  // (signin.rb:170-174 — { redirect: true, mark: "*previous" }) — the shell
  // order the capture pins: class, id, recaptcha, action, accept-charset,
  // data-remote, method, then utf8 + _method=patch + the success hiddens.
  return cardFormShell(ctx, {
    formClass: "card-form slotter autosave",
    id: `edit_card_${fmt.card.id}`,
    htmlAttrs: [["recaptcha", "off"]],
    action: `/update/${urlKey}`,
    methodSpoof: "patch",
    success: { redirect: true, mark: "*previous" },
    body: hamlBody,
  });
}
