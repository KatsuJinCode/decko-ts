// The *signin :core view emitter — the sign-in form — ONE source consumed by
// TWO registrations:
//   1. the account mod's manifest (card-mod-account.ts, self/signin html
//      :core) — the loader-bound path;
//   2. the render layer's flat coreView self/signin branch (views.ts) — the
//      HEADLESS pattern (the SELF_SET_TITLE_OVERRIDES precedent): the edge
//      engines run mod-less (ModLoader is never set as the default loader on
//      the edge boot, so a manifest registration never dispatches there).
//
// Ruby source (card-mod-account-0.20.0 set/self/signin.rb:114-125 +
// set/self/signin/core.haml, read from the downloaded gem):
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
//   # signin.rb:198-203
//   def signin_field name
//     nest_name = "".to_name.field(name)
//     [nest_name, { title: name.to_s, view: "titled",
//                   nest_name: nest_name, skip_perms: true }]
//   end
//
//   # signin.rb:181-188 / 176-178
//   def signup_link
//     link_to_card :signup, t(:account_or_sign_up),
//                  path: { action: :new, mark: :signup }
//   end
//   def reset_password_link
//     link_to_view :edit, t(:account_reset_password),
//                  path: { slot: { hide: :board_link } }
//   end
//   def signin_button
//     button_tag t(:account_sign_in), situation: "primary"
//   end
//
// The form body is the haml template (core.haml) - `.signin-fields` wrapping
// `_render_content_formgroups`, then the buttons div - and the fields
// themselves ride the EDIT MOD's machinery, not a transcribed editor block:
// `edit_structure`'s tuples normalize in multi_card_edit (form.rb:115-122) and
// each nest renders under nest mode :edit as editor_in_multi_card
// (form.rb:81-84 + :105-112 + formgroup.rb:16-44). The port dispatches
// `renderView("content_formgroups")` — the same call the account family's
// `before :content_formgroups` hooks make (card-mod-account.ts
// accountBeforeContentFormgroupsView) — so one walk serves the sign-in form,
// the +*account trait form and the board fieldset.
//
// This module deliberately imports NO mod files: only the form substrate
// (mod-form-substrate) and the name/lexicon facts. The `content_formgroups`
// dispatch is the render pipeline's own view resolution (views.ts's flat
// registry carries the same viewFn the edit mod registers), so the mod-less
// edge path and the loader-bound path run the same walk.

import { linkTo } from "../follow/follow-form-shapes.js";
import { cardFormShell } from "../mod-loader/mod-form-substrate.js";
import { DeckoName } from "../name.js";
import { CodenameNotFoundError } from "../name/errors.js";
import { getNameEnvironment } from "../name/environment.js";
import { cardPath } from "./format.js";
import type { ViewContext } from "./format.js";

/** en.yml (card-mod-account-0.20.0 config/locales/en.yml:29,31,19) — the
 *  button/link texts the haml template renders. */
const SIGNIN_FORM_LOCALE = {
  account_or_sign_up: "...or sign up!",
  account_reset_password: "Reset password",
  account_sign_in: "Sign in",
} as const;

/** signin.rb:181-183 signup_link — `link_to_card :signup, t(...), path:
 *  { action: :new, mark: :signup }`. THREE derivations, none a literal:
 *
 *  - the cardish `:signup` is a SYMBOL, so Card::Name[:signup]
 *    (card-1.110.0 lib/card/name.rb from_cardish) resolves it through the
 *    deck's codename table - the signup card's own NAME ("Sign up" on the
 *    corpus/production decks), never the symbol back;
 *  - links.rb:111-116 html link_to_card adds the known/wanted class from
 *    `Card.known?(name)` - known-card when the signup card exists, the
 *    wanted-card class otherwise;
 *  - Card::Path (card-mod-format-0.20.0 lib/card/path.rb:19-25 new_cardtype)
 *    renders `action/mark` = "new/<mark url_key>" - the mark's url_key, not
 *    its name.
 *
 *  A deck with no signup codename raises CodenameNotFound inside the view
 *  body; the render pipeline's quiet rescue (html_format.rb:16-18) turns that
 *  into the standard error bytes, so the throw reproduces that shape.
 */
function signupLink(ctx: ViewContext): string {
  const name = getNameEnvironment()?.codename?.name("signup");
  if (name === undefined) throw new CodenameNotFoundError("unknown codename: signup");
  // links.rb:140-144 add_known_or_wanted_class: Card.known?(name) - the card
  // EXISTS (real or virtual). The name lexicon holds every deck card's
  // name<->id registration (Card::Lexicon), so existence is its id answer;
  // the render cache alone misses cards outside the prefetch.
  const known =
    ctx.fmt.engine.fetchRenderCard(name) !== undefined ||
    getNameEnvironment()?.lexicon?.id(DeckoName.parse(name).key) !== undefined;
  const cls = known ? "known-card" : "wanted-card";
  const markUrlKey = DeckoName.parse(name).urlKey;
  // link_to (links.rb:101-106): the caller's opts in hash order (the class),
  // then href LAST (opts[:href] ||= path ...).
  return linkTo(SIGNIN_FORM_LOCALE.account_or_sign_up, cardPath(`new/${markUrlKey}`), {
    class: cls,
  });
}

/** signin.rb:186-188 reset_password_link — `link_to_view :edit,
 *  t(:account_reset_password), path: { slot: { hide: :board_link } }`.
 *  Card::Path's base arm (path.rb:32-40) renders `mark/view` and the query
 *  carries the slot hide through CastParams (path/cast_params.rb:5
 *  `slot: { hide: :array }`): a scalar becomes a one-element array, so the
 *  key serializes with the `[]` suffix - the `%5Bhide%5D%5B%5D=board_link`
 *  query. links.rb:119-122 html link_to_view slots the link
 *  (`remote: true, rel: "nofollow"`, class "slotter") and
 *  links.rb:134-137 interpret_data_opts_to_link_to turns remote into
 *  data-remote, emitted after href. */
function resetPasswordLink(ctx: ViewContext): string {
  const href = cardPath(`${ctx.fmt.urlKey()}/edit?slot%5Bhide%5D%5B%5D=board_link`);
  // link_to (links.rb:101-105): the caller's opts in hash order
  // (reverse_merge! remote/rel then add_class "slotter" - the interpreted
  // data-remote is set last, :134-137), href LAST of the opts because
  // opts[:href] ||= path is set before interpret_data_opts runs.
  return (
    `<a rel="nofollow" class="slotter" href="${href}" data-remote="true">` +
    `${SIGNIN_FORM_LOCALE.account_reset_password}</a>`
  );
}

/** signin.rb:176-178 signin_button — `button_tag t(:account_sign_in),
 *  situation: "primary"`. button_tag's own defaults (form_tag_helper.rb:566-
 *  579) are name/type FIRST; bootstrapify_button (card-mod-bootstrap
 *  set/all/bootstrap/form.rb:31-36) deletes :situation and appends
 *  "btn btn-primary" to the class IN PLACE. NOT decko's submit_button, so
 *  there is NO data-disable-with (form_elements.rb:59-64's default). */
function signinButton(): string {
  // form_tag_helper.rb:566-579 button_tag: { name: "button", type: "submit" }
  // merged first, then the bootstrapified class (form.rb:33-36). NOT
  // submit_button: no data-disable-with (form_elements.rb:62's default).
  return (
    `<button name="button" type="submit" class="btn btn-primary">` +
    `${SIGNIN_FORM_LOCALE.account_sign_in}</button>`
  );
}

/** signin.rb:198-203 signin_field: `"".to_name.field(name)` - the field
 *  mark relative to the form card (field_name over an empty base yields
 *  "+email"), with the explicit-edit tuple `{ title: name.to_s, view:
 *  "titled", nest_name:, skip_perms: true }`. The edit mod's
 *  normalized_edit_field_mark resolves the mark against the form card's name
 *  (the +*email stars resolve through the deck's setting codename, the same
 *  path the +*account trait form walks). */
function signinField(name: string): [string, Record<string, unknown>] {
  // "".to_name.field(:email): the symbol is a codename, which Card::Name
  // resolves through Card::Codename.name! (card-1.110.0 lib/card/name.rb);
  // the field tag is the deck's setting card name ("*email").
  const tag = getNameEnvironment()?.codename?.name(name);
  if (tag === undefined) throw new CodenameNotFoundError(`unknown codename: ${name}`);
  const nestName = `+${tag}`;
  return [
    nestName,
    { title: name, view: "titled", nest_name: nestName, skip_perms: true },
  ];
}

/** signin.rb:119-125 view :core — with_nest_mode :edit { card_form :update,
 *  recaptcha: :off, success: signin_success { haml :core } } with the
 *  `before :core` hook's edit_structure already seated on the voo. */
export function signinCoreHtml(ctx: ViewContext): string {
  const { fmt } = ctx;
  // before :core (signin.rb:116): the voo's edit_structure, so the
  // content_formgroups dispatch takes multi_card_edit's EXPLICIT arm.
  const editStructure = [signinField("email"), signinField("password")];
  ctx.voo.liveEditStructure = editStructure;
  const body = fmt.withNestMode("edit", () => coreHaml(ctx));
  return cardFormShell(ctx, {
    formClass: "card-form slotter autosave",
    id: `edit_card_${fmt.card.id}`,
    htmlAttrs: [["recaptcha", "off"]],
    action: `/update/${fmt.urlKey()}`,
    methodSpoof: "patch",
    success: signinSuccess(ctx),
    body,
  });
}

/** core.haml — `.signin-fields` wrapping `_render_content_formgroups`, then
 *  the buttons div (`.reset-password-link`, `.signin-button`,
 *  `.signup-button`). Haml: each line emits its output followed by "\n";
 *  static tags keep their literal quoting. */
function coreHaml(ctx: ViewContext): string {
  const { fmt } = ctx;
  // `_render_content_formgroups` (form.rb:4-7 view :content_formgroups):
  // `wrap_with :fieldset, edit_slot, class: classy("card-editor", "editor")`
  // - edit_slot's multi_card_edit arm renders the edit_structure fields.
  // The structure rides this view's own voo (the seat the account family's
  // before :content_formgroups hooks write).
  const fields = fmt.renderView("content_formgroups");
  return (
    `<div class='signin-fields'>\n` +
    `${fields}\n` +
    `</div>\n` +
    `<div class='form-group signin-buttons'>\n` +
    `<div class='reset-password-link'>\n` +
    `${resetPasswordLink(ctx)}\n` +
    `</div>\n` +
    `<div class='signin-button'>\n` +
    `${signinButton()}\n` +
    `</div>\n` +
    `<div class='signup-button'>\n` +
    `${signupLink(ctx)}\n` +
    `</div>\n` +
    `</div>\n`
  );
}

/** signin.rb:170-174 signin_success — `{ redirect: true, mark: "*previous" }`
 *  merged with the request's `success` param hash (symbolized). The param
 *  hash is the request-parsing surface; the port has no request hash at this
 *  seam, so only the static half rides (the same half every recorded oracle
 *  carries). */
function signinSuccess(_ctx: ViewContext): Record<string, unknown> {
  return { redirect: true, mark: "*previous" };
}
