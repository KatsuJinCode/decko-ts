// deploy/bunny-worker-src/bunny-edge-new-card-form.ts — the /new/:type arm's
// render path: the CREATE FORM for a new card of the requested type, in the
// deck's full Default-Layout chrome.
//
// THE ROUTE (why this exists): decko's engine_routes.rb:22
// `get "new/:type" => "card#read", view: "new"` is the card-creation route
// a deck's own chrome links as /new/Sign_up (the *account_links navbar arm
// and the signin form's "...or sign up!" link), and the edge answered it 404.
// The lineage parsePath now reports { kind: "new", typeName };
// dispatchEngineRequest delegates here.
//
// THE RUBY MECHANISM this port follows (decko 0.20.0, read from the
// installed gem):
//   - the route carries NO mark: card_class.rb:104-133 sets opts[:type] from
//     params[:type] while implicit_mark resolves to "" (the unknown:true
//     :new view needs no name) — the rendered card is a NEW (rowless) card
//     of the requested type;
//   - error.rb:81-87 page_view_for_unknown / page_status_for_unknown: an
//     unknown MAIN card renders view :new at 200 when the viewer may create
//     it, else not_found at 404. The rendered view itself is
//     card-mod-edit set/all/new.rb:4-6 `view :new, perms: :create` —
//     permission failure is Card::Error::PermissionDenied -> 403
//     (error.rb:103-104), the loud_denial frame (:191-197: h1 t(:format_
//     sorry) = "Sorry!" + the sign-in-or-sign-up line for a signed-out
//     viewer, :211-213, format_denied_task = "to create this");
//   - the create verdict is the SAME algebra the render engine's view gates
//     run (src/card/permissions/view-task-rules.ts): the deck's *create rule
//     for the type set, over the `*all+*create` fallback.
//
// FIDELITY CLASS (stated, not implied): there is no recorded reference for
// any /new/:type page, so nothing here is byte-oracle-pinned. The
// ORACLE-PINNED shapes reused: the create-form shell (createFormShell — the
// form-substrate oracle), the email/password field editors (byte-pinned to
// the sign-in form, src/card/render/signin-core-form-view.ts — the account
// mod's shared editor partials), and the frame chrome (the not_found frame
// shape). RECONSTRUCTED from the Ruby source (labeled inline): the frame
// header title, the name formgroup, the hidden type_id, the buttons block,
// the slot-less body region.

import type { FetchEngine } from "../../src/card/fetch.js";
import { DeckoName } from "../../src/card/name.js";
import {
  resolveAnonymousReadPermission,
} from "../../src/card/permissions/index.js";
import {
  taskVerdictForCard,
  viewTaskPermissionStatements,
  viewTaskStateFromResults,
} from "../../src/card/permissions/view-task-rules.js";
import { createFormShell } from "../../src/card/mod-loader/mod-form-substrate.js";
import type { ViewContext } from "../../src/card/render/format.js";
import { ruleContentForCard } from "../../src/card/actions/rule-content-walk.js";
import { h, newSlotId } from "../../src/card/render/slot-html.js";
import {
  EDGE_ERROR_PAGE_GRACE_MS,
  renderDeckoNotFoundErrorPage,
  renderFullChromeErrorPage,
} from "./bunny-edge-error-page.js";
import { layoutPage } from "./bunny-edge-lineage-worker-surface.js";

/** Structural deck surface this module needs (the request core's Deck
 *  shape: only the FetchEngine is consumed). */
export interface NewCardFormDeck {
  fetcher: FetchEngine;
}

/** The escape convention the data-main-success attribute needs: Rails
 *  html-escapes attribute values, so the JSON's quotes land as &quot;
 *  (new.rb:76-78 `new_form_opts { "data-main-success": JSON(redirect: true) }`). */
const MAIN_SUCCESS_ATTR = '{"redirect":true}'.replace(/"/g, "&quot;");

/** The signup form's account-field editors, modeled byte-for-byte on the
 *  recorded sign-in form's shapes (signin-core-form-view.ts
 *  signinFieldGroup — the SAME account-mod editor partials render both
 *  forms), nested under the new holder's +*account subcard as
 *  account_holder.rb account_formgroups fields_for does. The structural fallbacks are the account mod's own
 *  invariants: both rights are Phrase-typed; its ID is deck-local). */
function accountFieldGroup(field: "email" | "password", phraseTypeId: number): string {
  const safeRight = field === "email" ? "Xemail" : "Xpassword";
  const setKeys =
    `ALL ALL_PLUS TYPE-phrase RSTAR RIGHT-${safeRight} TYPE_PLUS_RIGHT-rich_text-${safeRight}`;
  const contentName = `card[subcards][+*account][subcards][+*${field}][content]`;
  const contentId = `card_subcards___account_subcards___${field}_content`;
  const typeIdName = `card[subcards][+*account][subcards][+*${field}][type_id]`;
  const typeIdId = `card_subcards___account_subcards___${field}_type_id`;
  const subName = `+*${field}`;
  const label =
    `<label for="${contentId}"><span class="card-title" title="${field}">${field}</span>\n` +
    `<div id="-${safeRight}-help-view" class="card-slot help-view ${setKeys}"` +
    ` data-card-name="${subName}" data-card-type-id="${phraseTypeId}" data-card-type-name="Phrase"` +
    ` data-card-link-name="${subName}" data-slot-id="${newSlotId()}"` +
    ` data-slot="view=help show=edit_in_form,help"></div></label>`;
  const editor =
    field === "email"
      ? `<div class="editor content-editor">` +
        `<input class="d0-card-content form-control" placeholder="" type="text"` +
        ` value="" name="${contentName}" id="${contentId}" />\n` +
        `<input autocomplete="off" type="hidden" value="${phraseTypeId}" name="${typeIdName}" id="${typeIdId}" /></div></div>`
      : `<div class="editor content-editor">` +
        `<input class="d0-card-content _pw-input form-control" placeholder="Password"` +
        ` autocomplete="off" type="password" name="${contentName}" id="${contentId}" />\n` +
        `<span class='_toggle-password visibility-icon _pw-text-area'>\n` +
        `<i class="_toggle-pw-visibility notranslate material-icons">visibility_off</i>\n` +
        `</span>\n\n` +
        `<input autocomplete="off" type="hidden" value="${phraseTypeId}" name="${typeIdName}" id="${typeIdId}" /></div></div>`;
  return (
    `<div class="form-group card-editor RIGHT-${safeRight}"` +
    ` data-card-name="${subName}" data-card-link-name="${subName}"` +
    `>${label}\n${editor}`
  );
}

/** The new view's body region (the layout's {{_main}} substitution content):
 *  the oracle-pinned not_found frame shape) around the create form —
 *  card-mod-edit set/all/new.rb framed_create_form -> frame_and_form :create
 *  -> [_render_new_fields] where new_fields = [new_view_hidden (empty),
 *  new_view_name (the name prompt: name blank, no autoname rule on the
 *  deck), new_view_type (hidden type_id — the type is PRESET by the route,
 *  new.rb:139 new_type_preset?), content_formgroups (the signup override:
 *  account_formgroups), new_buttons (create + cancel)]. */
export function newCardFormBodyHtml(typeName: string, typeId: number, phraseTypeId: number, thanks: string): string {
  // voo.title = t(:account_sign_up) (set/type/signup/views.rb:6-10) — the
  // frame header title for the anonymous viewer (invitation? requires a
  // signed-in approver).
  const form =
    createFormShell(
      // createFormShell ignores its ctx argument (the shell reads only the
      // opts); the virtual new card has no render format to lend it.
      {} as ViewContext,
      {
        htmlAttrs: [["data-main-success", MAIN_SUCCESS_ATTR], ["data-remote", "true"]],
        // new_success (new.rb:81-83): { mark: card.rule(:thanks) || "_self" }
        // The route resolves the actual deck's rule for this virtual type.
        success: { mark: thanks },
        body:
          `<div class="d-flex justify-content-between">` +
          `<div class="w-100">` +
          // new_view_name: the name prompt formgroup + the hidden
          // name_prompt flag (new.rb:96-110; the deck carries no *autoname
          // rule, so needs_name? is true for the blank-name card).
          `<div class="form-group card-editor">` +
          `<label for="card_name"><span class="card-title" title="Name">Name</span></label>` +
          `<div class="editor name-editor">` +
          `<input class="d0-card-name form-control" type="text" value="" name="card[name]" id="card_name" />` +
          `</div></div>` +
          `<input type="hidden" name="name_prompt" id="name_prompt" value="true" autocomplete="off" />` +
          // new_view_type: the route PRESET the type — the hidden field,
          // never a type select (new.rb:130-137).
          `<input type="hidden" name="card[type_id]" id="card_type_id" value="${typeId}" autocomplete="off" />` +
          // content_formgroups (set/type/signup/views.rb:13-15): the account
          // fields are the form's content.
          accountFieldGroup("email", phraseTypeId) +
          `\n` +
          accountFieldGroup("password", phraseTypeId) +
          // new_buttons (new.rb:157-161): standard_create_button +
          // standard_cancel_button (form_elements.rb:59-64 + form_buttons.rb
          // :36-39; cancel href = path_to_previous = "/" for a fresh
          // anonymous request).
          `<div class="form-group">` +
          `<button name="button" type="submit" class="submit-button create-submit-button btn btn-primary" data-disable-with="Submitting">Submit</button>` +
          `<a class="cancel-button ms-4 btn btn-secondary" data-cy="cancel" data-remote="true" href="/">Cancel</a>` +
          `</div>` +
          `</div></div>`,
      },
    );
  return (
    // The frame: the oracle-pinned not_found frame shape (d0-card-frame card +
    // header + body), titled with the new view's voo.title.
    `<div class="d0-card-frame card">` +
    `<div class="d0-card-header card-header">` +
    `<h1 class="d0-card-header-title">` +
    `<span class="card-title" title="Sign up">Sign up</span></h1></div>\n` +
    `\n` +
    `<div class="d0-card-body card-body card-text">${form}</div>` +
    `</div>`
  );
}

/** The signed-in viewer's new-card form: name, the type preset as a hidden
 *  field, and the content editor for the type (the calendar input for Date,
 *  the TinyMCE textarea otherwise). Creation permission is enforced by the
 *  write surface on submit. */
export function signedInNewCardFormBodyHtml(
  typeName: string,
  typeId: number,
  typeCode: string | undefined,
  cardName = "",
  content = "",
): string {
  const contentEditor =
    typeCode === "date"
      ? `<input class="date-editor form-control" type="date" value="${h(content)}" name="card[content]" id="card_content" />`
      : `<textarea rows="3" class="tinymce-textarea d0-card-content form-control" id="new-card-content" name="card[content]">\n${h(content)}</textarea>`;
  const form = createFormShell({} as ViewContext, {
    htmlAttrs: [["data-main-success", MAIN_SUCCESS_ATTR]],
    success: { mark: "_self" },
    body:
      `<div class="d-flex justify-content-between">` +
      `<div class="w-100">` +
      `<div class="form-group card-editor">` +
      `<label for="card_name"><span class="card-title" title="Name">Name</span></label>` +
      `<div class="editor name-editor">` +
      `<input class="d0-card-name form-control" type="text" value="${h(cardName)}" name="card[name]" id="card_name" />` +
      `</div></div>` +
      `<input type="hidden" name="name_prompt" id="name_prompt" value="true" autocomplete="off" />` +
      `<input type="hidden" name="card[type_id]" id="card_type_id" value="${typeId}" autocomplete="off" />` +
      `<fieldset class="card-editor editor"><div class="editor content-editor">${contentEditor}</div></fieldset>` +
      `<div class="form-group">` +
      `<button name="button" type="submit" class="submit-button create-submit-button btn btn-primary" data-disable-with="Submitting">Submit</button>` +
      `<a class="cancel-button ms-4 btn btn-secondary" data-cy="cancel" href="/">Cancel</a>` +
      `</div>` +
      `</div></div>`,
  });
  const title = h(`New ${typeName}`);
  return (
    `<div class="d0-card-frame card">` +
    `<div class="d0-card-header card-header">` +
    `<h1 class="d0-card-header-title">` +
    `<span class="card-title" title="${title}">${title}</span></h1></div>\n` +
    `\n` +
    `<div class="d0-card-body card-body card-text">${form}</div>` +
    `</div>`
  );
}

/** The signed-in /new/:type answer: the generic new-card form in the
 *  signed-in chrome. */
export async function signedInNewCardRouteResponse(deck: NewCardFormDeck, typeName: string): Promise<Response> {
  const typeKey = DeckoName.parse(typeName);
  let typeRecord: Awaited<ReturnType<FetchEngine["fetchByKey"]>> | undefined;
  try {
    typeRecord = await deck.fetcher.fetchByKey(typeKey.key, { skipVirtual: true });
  } catch {
    typeRecord = undefined;
  }
  if (typeRecord === undefined || typeRecord.name === undefined || typeRecord.id === undefined) {
    return await renderDeckoNotFoundErrorPage(deck, typeName);
  }
  const body = signedInNewCardFormBodyHtml(typeRecord.name.s, typeRecord.id, typeRecord.codename ?? typeKey.key);
  return await renderFullChromeErrorPage(deck, {
    status: 200,
    viewHtml: body,
    cardName: typeKey.urlKey,
    fallbackHtml: layoutPage(`New ${typeRecord.name.s}`, body),
    graceMs: EDGE_ERROR_PAGE_GRACE_MS,
  });
}

/** The loud_denial body region (card-mod-format set/all/html/error.rb
 *  :191-213): the framed "Sorry!" + the signed-out viewer's
 *  sign-in-or-sign-up line with format_denied_task ("to %{denied_task} this"
 *  -> "to create this"). The sign-in/sign-up link bytes are the
 *  not_found builder's (bunny-edge-error-page.ts buildNotFoundSlotHtml). */
export function createDenialBodyHtml(): string {
  return (
    `<div class="d0-card-frame card">` +
    `<div class="d0-card-body card-body card-text">` +
    `<h1>Sorry!</h1>` +
    `<div>Please <a class="signin-link known-card" href="/*signin/titled">sign in</a> or ` +
    `<a class="signup-link known-card" href="/new/Sign_up">sign up</a> to create this.</div>` +
    `</div></div>`
  );
}

/** The /new/:type arm's answer. The type mark resolves through the deck's
 *  own name-key lookup (Ruby: Card.new type: "Sign up" -> type_id 12); an
 *  unresolvable type answers the not_found page (the route arm's labeled
 *  deviation — Ruby's exact unknown-type error shape has no recorded
 *  reference; 404 is
 *  the reference answer class). The create verdict is the anonymous
 *  viewer's ok?(:create) on the virtual card — page_status_for_unknown's
 *  gate. Both the 200 form and the 403 denial ride the same full-chrome
 *  builder the error pages use (the layout wrap is page machinery, not an
 *  error-only shape); the grace bound bounds its chrome queries exactly as
 *  the budget pages'. The chrome title resolves from the TYPE card's stored
 *  name (cardName = the type's URL slug — resolveCardStoredName key-resolves
 *  it), Ruby's "<card name> - <site title>" convention. */
export async function newCardRouteResponse(
  deck: NewCardFormDeck,
  typeName: string,
): Promise<Response> {
  const typeKey = DeckoName.parse(typeName);
  let typeRecord: Awaited<ReturnType<FetchEngine["fetchByKey"]>> | undefined;
  try {
    typeRecord = await deck.fetcher.fetchByKey(typeKey.key, { skipVirtual: true });
  } catch {
    typeRecord = undefined;
  }
  if (typeRecord === undefined || typeRecord.name === undefined || typeRecord.id === undefined) {
    return await renderDeckoNotFoundErrorPage(deck, typeName);
  }
  // The anonymous viewer's ok?(:create) on the virtual card (name "",
  // the requested type) — the same task-verdict algebra the render
  // engine's view gates run.
  const readState = await resolveAnonymousReadPermission(deck.fetcher.driver);
  const taskResults = await deck.fetcher.driver.batch(viewTaskPermissionStatements());
  const taskState = viewTaskStateFromResults(taskResults, readState);
  const allowed = await taskVerdictForCard(
    deck.fetcher,
    {
      name: DeckoName.parse(""),
      isNew: true,
      typeId: typeRecord.id,
      typeName: typeRecord.name.s,
    },
    "create",
    taskState,
  );
  if (allowed !== true) {
    // Card::Error::PermissionDenied (error.rb:103-104) -> 403, the loud
    // denial frame. The fallback page carries the same body in the bare
    // layout shell (the builder's never-500-twice contract).
    return await renderFullChromeErrorPage(deck, {
      status: 403,
      viewHtml: createDenialBodyHtml(),
      cardName: typeKey.urlKey,
      fallbackHtml: layoutPage("Sorry!", createDenialBodyHtml()),
      graceMs: EDGE_ERROR_PAGE_GRACE_MS,
    });
  }
  const phraseTypeId = await deck.fetcher.codenames.id("phrase");
  if (phraseTypeId === undefined) throw new Error("signup form requires the deck's Phrase cardtype");
  const thanks = await ruleContentForCard(deck.fetcher, {
    name: "", typeId: typeRecord.id, typeName: typeRecord.name.s, isNew: true,
  }, "thanks");
  const body = newCardFormBodyHtml(typeRecord.name.s, typeRecord.id, phraseTypeId, thanks === undefined ? "_self" : String(thanks));
  return await renderFullChromeErrorPage(deck, {
    status: 200, viewHtml: body, cardName: typeKey.urlKey,
    fallbackHtml: layoutPage("Sign up", body), graceMs: EDGE_ERROR_PAGE_GRACE_MS,
  });
}
