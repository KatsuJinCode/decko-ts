import { str } from "../../render/format.js";
import { quietDenial } from "../../permissions/view-perms.js";
// The card-mod-account gem (card-mod-account-0.20.0), ported through the
// mod loader - the mod that adds user accounts, signin, signup, the +*account
// cardtype, password reset, and the related closure lifecycle.
//
// The gem's tree (the installed
// card-mod-account-0.20.0/): 22 set rb files across the all/abstract/right/
// self/type/type_plus_right patterns, 6 HAML templates, and one lib file
// (Cardio config keys for password validation). Most of the gem is Rails-
// runtime machinery - events (validate_email, encrypt_password,
// reset_password, etc.), Auth integration (signin/signout, bot authority
// via Auth.as_bot, Auth::Token.encode/decode), email delivery
// (send_account_email -> Card[name].deliver self, to: email), and form
// helpers (card_form, check_box_tag, haml :template). Ported here the
// views whose bytes do not depend on any of that infrastructure:
//
// - set/right/account/views.rb:14-16 :token_days (an integer from
//   Card.config.token_expiry / 1.day, which the railtie sets to 2.days —
//   cardio/railtie.rb:12; verified_days / reset_password_days are aliases
//   per views.rb:18-20)
// - set/right/account/views.rb:65-67 :token_expiry (html block, the
//   "<p><em>#{token_expiry_sentence}</em></p>" literal string)
// - set/self/signin.rb:139-142 :open_content (html block, _render_core -
//   delegates to :core via ctx.fmt.renderView("core"))
// - set/self/signin.rb:144-146 :one_line_content ("")
// - set/abstract/account_holder.rb:126 :closed_account (template: :haml
//   rendered to its two-line static HTML)
// - set/type_plus_right/user/email.rb:7-9 :raw (card.content_email when
//   real, "" when virtual)
//
// Set-module structure (every other set file from the gem, recorded so the
// basket reflects the gem's tree even when the file defines no ported
// view): all/account, all/password_input, abstract/account_field,
// abstract/account_holder (carries :closed_account), right/account,
// right/account/events, right/account/views (carries :token_days +
// aliases), right/email, right/password, right/roles, right/salt,
// right/status, self/anonymous, self/decko_bot, self/role, self/signin
// (carries :one_line_content), type/role, type/signup,
// type/signup/views, type/user, type_plus_right/cardtype/account,
// type_plus_right/role/members, type_plus_right/user/email (carries :raw).
//
// NOT ported (honest remainder, updated the follow views port 2026-09-28):
// - signin reset_password_success + edit_buttons ARE PORTED now
//   (lane-follow; the styleform lane 2026-10-10 completes
//   reset_password_success's frame: the view now renders through the
//   shared framedView helper - full chrome, oracle-pinned by the
//   synthetic-v2 corpus op).
// - signin edit (:154-157): the base :edit form super() target is
//   card-mod-edit's (still unported); reset_password_voo's
//   edit_structure rides the same machinery.
// - signin core IS PORTED now (the edge signin form fix 2026-10-03 —
//   signinCoreView, the sign-in form against the live-wire oracle; the
//   multi-card editor machinery its Ruby body rides stays unported, so
//   the emitter reproduces the captured shape directly, deriving the
//   per-deck values from the deck's rows where the render cache holds
//   them). :open stays unported (the base :open super() target);
//   :title rides the render layer's SELF_SET_TITLE_OVERRIDES (see
//   oneLineContentView's comment).
// - signup new/new_buttons/content_formgroups: rails (the base :new
//   form, standard_create_button + multi_card_editor - card-mod-edit's
//   surface; account_formgroups recurses into the account right's
//   :content_formgroups whose before-block edit_structure machinery is
//   form.rb's). :core IS ported (R17 - the invite-links haml core, see
//   signupCoreView; set/type/signup/core.haml + views.rb:30-33 +
//   helpers).
// - right/account closure RAISES (stock Ruby): the haml's deletion walk
//   calls the PRIVATE closure_deletions from outside the receiver
//   (account_holder.rb:81/87-89; closure.haml:25 on card.accounted), so
//   every render passing perms :delete raises NoMethodError - the port
//   raises it (closureView). The deletion walk itself stays ported in
//   accountFollowBundle for the follow surface.
// - right/account verify_url/reset_password_url: rails (card_url + the
//   async-HMAC x sync-ViewFn boundary the token-runtime recorded result names).
//   The Auth::Token half of the gap CLOSED 2026-09-28:
//   src/card/auth/token.ts is a byte-parity port of
//   card-1.110.0/lib/card/auth/token.rb, developed against the real jwt gem's
//   own output (the captured auth-token oracle, not in the public package) — that pin is development
//   evidence, excluded from the public package with its fixture and suite,
//   not a check a clean clone can run — and the signing secret
//   is injected as RenderEngine.tokenConfig, pinned in
//   vm-staging-server.mjs from DECKO_TOKEN_SECRET. What is left here is not
//   the secret or the token — it is that a ViewFn is SYNCHRONOUS
//   (src/card/render/format.ts:291) while HMAC is async, plus the
//   card_url/path/haml/perms machinery these two views wrap. That is the
//   same structural boundary the async view work owns for the five head views.
//   The URL BUILDER half CLOSED 2026-09-29:
//   src/card/auth/account-verify-reset-flows.ts buildAccountTokenUrl is the
//   token_url port (path.rb action_base + the activesupport-verified
//   to_param query + card_url) — the FLOW consumes it; the two VIEWS stay
//   unregistered here until the async-ViewFn seam lands (a ViewFn cannot
//   await).
// - right/account :token_expiry html block IS ported (see tokenExpiryView).
// - right/password core/raw: rails (input_type/form autocomplete;
//   raw returns i18n :account_encrypted)
// - right/salt raw: rails (i18n :account_private_data)
// - right/role cql_content: rails (search-type cql dispatch)
// - abstract/account_holder account_tab/configs/account_details_items:
//   rails (board_pill_sections, Auth.as_bot, all_admin_configs_grouped_by)
// - user setup: rails (needs_setup?, Auth.as_bot, frame_and_form)
// - type/role link_with_checkbox IS PORTED now (the follow views port; the
//   disabled_roles subformat card_form + the check_box_tag shape from
//   form_tag_helper.rb:455-460; the actor comes from the seam session).
//   configs (:12-24): rails (all_admin_configs_grouped_by - the core
//   mod's admin surface, 13 views unported there)
// - 30 events (validate_email, encrypt_password, reset_password,
//   generate_token, set_stamper, update_role_cache, etc.): rails (event
//   machinery, Env.params, Auth, SecureRandom, Card.cache,
//   validate/store/integrate/finalize phases). EXCEPTION — the sign-in
//   event pair ported 2026-09-27 (write-path slice 1) in
//   src/card/auth/signin.ts, where the session layer lives: :signin +
//   :signin_success (set/self/signin.rb:12-19, the salted-SHA-1
//   authenticate ladder of Card::Auth, auth.rb:20-39 — NOT bcrypt) and
//   :signout (set/self/signin.rb:25-29). The card_write_events here stay
//   view- and render-shaped; the authenticate events are engine behavior
//   over the auth store, not views.
// - lib/card/mod/account.rb (Cardio::Railtie.config password keys +
//   6 HAML templates): rails (config surface, haml asset pipeline)
// - assets/script/toggle_visibility.js.coffee + assets/style/account.scss:
//   rails (coffee/scss asset pipeline)

import {
  RenderFormat,
  Voo,
  type ViewContext,
  type ViewFn,
} from "../../render/format.js";
import { h } from "../../render/slot-html.js";
import { safeSetKeys } from "../../render/set-keys.js";
// set/self/signin.rb:119-125 view :core — the sign-in form. The emitter
// lives in the render layer (signin-core-form-view.ts) because it is consumed
// by TWO registrations: this manifest entry (the loader-bound path) and the
// render layer's flat coreView self/signin branch (the loader-less
// dispatch), so the two paths render the same form.
import { signinCoreHtml } from "../../render/signin-core-form-view.js";
import { modSlotWrap, superView } from "../mod-view-helpers.js";
import { setModuleShortname } from "../mod-registrar.js";
import { createCardBodyShell, framedView } from "./card-mod-edit.js";
import { preparedSetupVerdict } from "../../auth/first-run-setup-verdict-seam.js";
// set/type/role.rb's :configs view body — the all/admin.rb machinery is the
// core mod's (core-mod.ts: allConfigs/groupedBy/section emitters), so the
// view fn lives there and both registrations (this manifest's Type::Role
// and the flat HTML_VIEWS entry the mod-less graded harness dispatches)
// share the single source. No import cycle: core-mod imports no mod files.
import { roleConfigsView } from "./core-mod.js";
import {
  buttonTag,
  cardFormOpen,
  CARD_FORM_CLOSE,
  checkBoxTag,
  followPath,
  linkTo,
  output,
} from "../../follow/follow-form-shapes.js";
import { isNewCard } from "../../fetch/card-record.js";
import { resetPasswordUrlView, verifyUrlView } from "../../render/views.js";
import { NoMethodError, rubyDefaultInspect } from "../../render/format.js";
import { DeckoName } from "../../name.js";
import { CodenameNotFoundError } from "../../name/errors.js";
import { getNameEnvironment } from "../../name/environment.js";
import {
  BOARD_PILL_UL_CLASSES,
  BOARD_SLOT_SELECTOR,
} from "./card-mod-edit.js";
import { DEFAULT_TOKEN_EXPIRY_SECONDS } from "../../auth/token.js";
import {
  engineOwnedEvent,
  type DeckoModManifest,
  type ModEventCard,
  type ModEventRegistration,
  type ModEventFn,
  type ModSetModuleFile,
} from "../mod-manifest.js";

/** The set-module event declarations below (the set-module event,
 *  2026-10-08): a stub-bodied declaration unless the engine has no
 *  counterpart (then `engineOwnedEvent` - the behavior lives in engine
 *  code, the declaration only records Ruby's set membership + metadata).
 *  Same shape as core-mod.ts's local helper; the per-event owner or
 *  stub reason rides the declaration's comment. */
function event(
  decl: Omit<ModEventRegistration, "fn"> & { fn?: ModEventFn },
): ModEventRegistration {
  return { fn: () => undefined, ...decl };
}

// ---------------------------------------------------------------------------
// view bodies (Ruby source cited per block)
// ---------------------------------------------------------------------------

/** set/right/account/views.rb:14-16 view :token_days, denial: :blank:
 *  `Card.config.token_expiry / 1.day`.
 *
 *  CORRECTED 2026-09-28 from 7 to 2. The value is not a
 *  decko convention — it is read straight off the railtie, and the railtie
 *  says 2: card-1.110.0/lib/cardio/railtie.rb:12 `config.token_expiry =
 *  2.days`. The previous comment claimed card-mod-account "does not set it"
 *  and that "the bootstrap mod sets it per deployment"; both halves are
 *  true and together they do not produce 7. `grep -rn token_expiry` over
 *  the whole installed gem set (card-1.110.0 + card-mod-account-0.20.0)
 *  returns exactly four hits: this assignment (railtie.rb:12), the one read
 *  in token.rb:33, and the two account views that render it. There is no
 *  other assignment, so Card.config.token_expiry is 2 days in a stock
 *  deck and :token_days is "2".
 *
 *  The number is no longer hardcoded: it is DEFAULT_TOKEN_EXPIRY_SECONDS
 *  (src/card/auth/token.ts), the same value Auth::Token.expiration uses to
 *  stamp `exp`, so the sentence on the page and the lifetime of the link it
 *  describes cannot drift apart. The integer renders as a string (Ruby's
 *  Integer#to_s). */
function tokenDaysValue(): number {
  return DEFAULT_TOKEN_EXPIRY_SECONDS / 86400;
}

/** set/right/account/views.rb:14-16 base body - the INTEGER (the view
 *  block's raw answer; the render boundary records it as a JSON number,
 *  and every interpolation - the :token_expiry sentence below - to_s's
 *  it). */
const tokenDaysView: ViewFn = () => tokenDaysValue();

/** set/right/account/views.rb:18-19 view :verify_days, :token_days
 *  (DEPRECATED) - the alias dispatches to token_days. The mod loader
 *  registers one view name per ModViewDefinition; both names register
 *  the same view function so the dispatch is symmetric. */
const verifyDaysView: ViewFn = (ctx) => tokenDaysView(ctx);

/** set/right/account/views.rb:20 view :reset_password_days, :token_days
 *  (DEPRECATED). Same alias shape as verify_days. */
const resetPasswordDaysView: ViewFn = (ctx) => tokenDaysView(ctx);

/** set/right/account/views.rb:65-67 view :token_expiry (html block):
 *  `"<p><em>#{token_expiry_sentence}</em></p>"`. token_expiry_sentence =
 *  `"Link will expire in #{render_token_days} days"` (views.rb:40-42); the
 *  :token_days view (views.rb:14-16) returns Card.config.token_expiry /
 *  1.day - 2, per railtie.rb:12 (see tokenDaysValue for the correction).
 *  The HTML wrap is the literal string the HAML inline block emits. The
 *  base block's token_expiry (views.rb:10-12, `"(#{token_expiry_sentence}"`)
 *  is NOT registered here: HTML dispatch wins, and the base block's content
 *  is the rubric for non-html formats we don't model. */
const tokenExpiryView: ViewFn = () =>
  `<p><em>Link will expire in ${tokenDaysValue()} days</em></p>`;

// ===========================================================================
// surfaces-batch3 (2026-09-30): the html block's remaining render views.
// ===========================================================================

/** set/right/account/views.rb:50-53 (html block) view :core:
 *  `[account_field_nest(:email, "email"),
 *     account_field_nest(:password, "password")]` — an array body, so
 *  output() joins the parts with a newline (content.rb:70-73,
 *  Array.wrap(content).flatten.compact.join "\n" — the join the
 *  head/header port pinned). account_field_nest (views.rb:55-57) is
 *  `field_nest field, title: title, view: :labeled`; nesting.rb:27-31
 *  field_nest resolves `card.name.field(field)` (the LEFT card's child —
 *  the +*account junction's fields live on its left, the member card) and
 *  nests it with the given title + view. The member-page account area:
 *  two labeled field nests, email then password.
 *
 *  NAMED REMAINDER of the same file (NOT this view): :verify_url and
 *  :reset_password_url (views.rb:2-8) — their bodies are exactly
 *  buildAccountTokenUrl's output
 *  (src/card/auth/account-verify-reset-flows.ts:483-486), but a ViewFn is
 *  synchronous while the HMAC encode is async; the flows substitute their
 *  own tokens until the async-view boundary lands. The before
 *  :content_formgroups hook (views.rb:60-62) is the edit-form machinery's
 *  (E1's) surface. */
const accountCoreView: ViewFn = (ctx) => {
  // account_field_nest(:email)/(:password): field :email names the SETTING
  // card - Card::Name#field stars codenamed fields (nesting.rb docstring),
  // so the nests are +*email/+*password (the labeled rows' values are the
  // real rows' cores: the email text and the password raw's "encrypted").
  // card.name.field(field) (format/nesting.rb field_nest: `fullname =
  // card.name.field(field)`): the nest is the ABSOLUTE field name, so the
  // slot carries "<account holder>+*email", not the relative mark.
  const fieldNest = (field: string, title: string): string =>
    ctx.fmt.nest({
      syntax: `${ctx.fmt.card.name.s}+*${field}|view:labeled|title:${title}`,
      name: `${ctx.fmt.card.name.s}+*${field}`,
      options: { view: "labeled", title, extra: {} },
      comment: undefined,
    });
  return [fieldNest("email", "email"), fieldNest("password", "password")].join(
    "\n",
  );
};

/** set/right/password.rb:53-55 view :raw — `t :account_encrypted`; en.yml:6
 *  carries `encrypted: encrypted` under the account scope, so the bytes are
 *  the literal string. The password hash is NEVER rendered. */
const passwordRawView: ViewFn = () => "encrypted";

/** set/right/salt.rb:13-15 view :raw — `t :account_private_data`; en.yml:28
 *  carries `private_data: Private data` under the account scope, so the bytes
 *  are the literal string. The salt is NEVER rendered, to any reader: the
 *  same rule the password's own :raw follows (password.rb:53-55). */
const saltRawView: ViewFn = () => "Private data";

/** all/password_input.rb:2-4 password_input + password_input.haml, through
 *  right/password.rb:86-88's `def input_type; :password end` (the editor
 *  dispatch reaches password_field's editor the same way editor.rb's
 *  input_method routes every set-module input). The bytes are the
 *  live-oracle probe receipt: class "d0-card-content _pw-input form-control"
 *  (the caller's class string, then the bootstrap FIELD_HELPERS " form-control"
 *  append), placeholder "Password", autocomplete "off" (autocomplete?:
 *  right/password.rb:90-95 - the *signin+*account parent HACK arm answers
 *  "on", every other card "off"), type password, then the haml's
 *  toggle-password span with the hide_password icon through icon_lookup to
 *  visibility_off. The name/id ride the form prefix (form.rb:147-160). */
const passwordInputView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  const namePrefix =
    typeof voo.opts["form_name_prefix"] === "string"
      ? (voo.opts["form_name_prefix"] as string)
      : "card";
  const idPrefix = namePrefix === "card" ? "card" : namePrefix.replace(/\]/g, "").replace(/[^-a-zA-Z0-9:.]/g, "_");
  const autocomplete =
    fmt.parent?.card.name.s === "*signin+*account" ? "on" : "off";
  return (
    `<input class="d0-card-content _pw-input form-control" placeholder="Password" autocomplete="${autocomplete}" type="password" name="${namePrefix}[content]" id="${idPrefix}_content" />\n` +
    `<span class='_toggle-password visibility-icon _pw-text-area'>\n` +
    `<i class="_toggle-pw-visibility notranslate material-icons">visibility_off</i>\n` +
    `</span>\n`
  );
};

/** set/right/password.rb:81-83 (html block) view :core, wrap: :em —
 *  `render_raw` wrapped in the em tag. The port emits the wrap in-body
 *  (byte-identical to Ruby's wrap: :em for the html format; the loader's
 *  config.wrap field is declaration-only today). */
const passwordCoreView: ViewFn = () => "<em>encrypted</em>";

/**
 * set/all/password_input.rb:2-4 + set/all/password_input.haml:2-4 — the
 * password field the `+*password` set's editor renders:
 *
 *     = password_field :content, class: "d0-card-content _pw-input",
 *                                        placeholder: "Password",
 *                                        autocomplete: "off"
 *
 * and set/right/password.rb:86-88 (html block) `def input_type; :password;
 * end` is what routes the `:input` view here: card-mod-edit's all/editor.rb
 * :32-36 `try(input_method(input_type))` reaches `password_input` FIRST, ahead
 * of `input_defined_by_card` and the rich-text default.
 *
 * WHY THIS VIEW IS A SECURITY VIEW, not a form byte. Rails renders a password
 * field with NO value attribute, always: Tags::PasswordField#render
 * (actionview-7.2.3.2/lib/action_view/helpers/tags/password_field.rb:5-9)
 * opens with `@options = { value: nil }.merge!(@options)`, and
 * TagBuilder#tag_options drops nil-valued attributes. Every other input arm
 * in all/editor.rb DOES carry the content — text_field_input (:51-53),
 * text_area_input (:46-49), hidden_input (:55-57), the tinymce textarea
 * (:42-44) — so a `+*password` card that fell through to one of them put the
 * stored PBKDF2 DIGEST in the HTML attribute/element body. The demo-deck
 * adversarial finding (GET /victim+*account+*password/input returned the
 * digest) is that fall-through, and this view is the fix.
 *
 * BYTE BASIS: gem-derived, like passwordRawView above. The attribute order is
 * Rails', derived from the two helpers above rather than guessed:
 *   - `bootstrap_options` (card-mod-bootstrap set/all/bootstrap/form.rb:22-25)
 *     appends " form-control" to the caller's class;
 *   - `{ value: nil }.merge!(caller opts)` puts a nil `value` FIRST, then
 *     class, placeholder, autocomplete;
 *   - TextField#render (tags/text_field.rb:7-14) appends `type` (already
 *     absent, so `||= field_type` -> "password"), leaves the nil `value` in
 *     place, and calls `add_default_name_and_id` LAST — so name and id are the
 *     final two attributes.
 * tag_options then skips the nil `value`, which is the whole point: the
 * attribute is absent, not empty.

/** set/self/signin.rb:139-142 view :open_content (html block): literally
 *  `_render_core` - the html format's `_render_<view>` machinery
 *  (mod/format.rb#render_view) delegates to the requested view in this
 *  format. `_render_core` is Ruby's method delegation
 *  (format/method_delegation.rb:41-47 `method_missing` -> :14-18
 *  `api_render` -> `render!`), which opens its OWN `wrap_and_render`
 *  rescue scope (format/render.rb:7-14, :96-100): an error raised inside
 *  the delegated core becomes that render's RETURN VALUE on a nested
 *  format (the quiet render-error span, labelled "(core view)"), and only
 *  the depth-0 focal format re-raises (error.rb:65-73). `renderDelegated`
 *  is that seam; plain `renderView` is not, and using it here let an
 *  error escape a whole nest chain instead of rendering as the quiet span.
 *  The Ruby comment ("annoying step designed to avoid table of contents.
 *  sigh") is the bug-bridge for the set-based TOC walk; the bytes are the
 *  ones _render_core would have returned, which on *signin is the plain
 *  processContent(renderRaw) path (no Search/pointer/list/set/Date/CodeRay
 *  branch fires for typeId: 14 settings). */
const openContentView: ViewFn = (ctx) => ctx.fmt.renderDelegated("core");

// set/self/signin.rb:134-137 view :title (`voo.title ||=
// t(:account_sign_in_title)`) - NOT registered here: the headless view-surface
// grading engine runs with NO ModLoader bound, so a setModule registration
// never dispatches. The bytes are served by the render layer's
// SELF_SET_TITLE_OVERRIDES branch (views.ts, the rule tooltips
// 2026-09-29) - the same headless pattern as openView's discussion
// comment_box check.

/** set/self/signin.rb:144-146 view :one_line_content: literally `""`. The
 *  no-wrap config means the body renders bare (no slot wrapper); the
 *  empty body returns the empty string. */
const oneLineContentView: ViewFn = () => "";

// session + the form shapes. Bytes are RENDERED-UNPINNED (no oracle
// captures exist for these names - verified against the capture shards).
// The actor boundary is EXPLICIT: every Auth.current walk resolves through
// engine.pageSession (the session field) via the follow seam
// (src/card/follow/follow-render-seam.ts) - never a global.
// ===========================================================================

/** The seam accessor (undefined = signed out; the seam's session was
 *  resolved from engine.pageSession only). */
function accountFollowBundle(ctx: ViewContext) {
  return ctx.fmt.engine.followRenderBundle?.();
}

/** en.yml (card-mod-account-0.20.0 config/locales/en.yml) - the t(:...)
 *  strings these bodies render. */
const ACCOUNT_LOCALE = {
  account_check_email: "Check your email for a link to reset your password",
  account_reset_password: "Reset password",
  account_close_account: "Permanently Close Account",
  // en.yml:36-37 (the folded scalar): "Are you CERTAIN you want to
  // PERMANENTLY delete the account associated with %{accounted}?"
  account_confirm_delete_account_prefix:
    "Are you CERTAIN you want to PERMANENTLY delete the account associated with ",
} as const;

/** set/self/signin.rb:148-151 view :reset_password_success -
 *  `frame { t :account_check_email }` - the standard frame (frame.rb:9-27
 *  via card-mod-edit.ts framedView: with_frame's voo.hide :help -
 *  the slot payload's hide list - add_name_context, the bootstrap
 *  class_ups d0-card-header card-header / d0-card-body card-body card-text
 *  / d0-card-frame card, the header with the :title override's
 *  "Sign In" span + the card menu, the hidden help arm compacted out, the
 *  flash "" line, the body div). Oracle-pinned by the synthetic-v2 corpus
 *  (view:anonymous:*signin:reset_password_success: the h2 title + the
 *  three-link card menu + the "Check your email..." body inside
 *  d0-card-frame card). */
const resetPasswordSuccessView: ViewFn = (ctx) =>
  framedView(ctx, "reset_password_success", () =>
    ACCOUNT_LOCALE.account_check_email,
  );

/** set/self/signin.rb:165-168 view :edit_buttons -
 *  `button_tag t(:account_reset_password), situation: "primary", class:
 *  "_close-modal-on-success"`. bootstrapify_button folds the situation
 *  into class FIRST (form.rb:33-36: [class, "btn", "btn-\#{situation}"]). */
const signinEditButtonsView: ViewFn = () =>
  buttonTag(ACCOUNT_LOCALE.account_reset_password, {
    class: "_close-modal-on-success",
    situation: "primary",
  });

/** set/type/role.rb:8-10 view :link_with_checkbox, cache: :never ->
 *  role_checkbox (:26-32):
 *    name = card.disabled? ? "add_item" : "drop_item"
 *    subformat(Auth.current.field(:disabled_roles)).card_form :update do
 *      [check_box_tag(name, card.id, !card.disabled?, class: "_edit-item"),
 *       render_link]
 *    end
 *  Auth.current IS the session actor (the pageSession boundary). The
 *  disabled_roles card is "<actor>+*disabled roles"; disabled? reads its
 *  item ids (roles.rb:4-6 - the +*disabled roles list). render_link is
 *  the card's :link view (the standard anchor). card_form :update on a
 *  NEW card: the form_for dom id is "new_card" (Rails' unpersisted-record
 *  dom id). */
const linkWithCheckboxView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  const bundle = accountFollowBundle(ctx);
  const actorName =
    bundle?.session?.actorName ?? "Anonymous"; // Auth.current (AnonymousID arm)
  // Auth.current.field(:disabled_roles) resolves the SYMBOL tag through the
  // codename table (Card#fetch -> Card.id_or_name -> Card::Name.compose ->
  // from_cardish(Symbol) -> Codename.name!, card-1.110.0 lib/card/name.rb:77)
  // - the deck carries no disabled_roles codename, so role_checkbox's first
  // call (card.disabled?, roles.rb:4-6) raises Card::Error::CodenameNotFound
  // inside the view body; in the serving posture the root rescue is quiet
  // (html_format.rb:16-18), so the verbatim span is the whole view (the
  // corpus's Contractor link_with_checkbox pin). The former hardcoded star
  // string skipped the codename table and rendered the checkbox bytes.
  const disabledRolesTag = getNameEnvironment()?.codename?.name("disabled_roles");
  if (disabledRolesTag === undefined) throw new CodenameNotFoundError("unknown codename: disabled_roles");
  const rolesName = `${actorName}+${disabledRolesTag}`;
  const rolesCard = ctx.fmt.engine.fetchRenderCard(rolesName);
  const disabledIds = (rolesCard?.dbContent ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const disabled = disabledIds.includes(String(fmt.card.id));
  const name = disabled ? "drop_item" : "add_item";
  const box = checkBoxTag(
    name,
    String(fmt.card.id),
    !disabled,
    "_edit-item",
  );
  const link = fmt.renderView("link");
  const form =
    cardFormOpen({
      formId: rolesCard?.id !== undefined ? `edit_card_${rolesCard.id}` : "new_card",
      action: followPath(
        rolesCard?.name?.urlKey ?? rolesName.replace(/ /g, "_"),
        { action: "update" },
      ),
      // card_form_html_opts (form.rb:218-224): "card-form" + slotter +
      // autosave (action == :update), persistence-independent
    }) + box + link + CARD_FORM_CLOSE;
  const subVoo = new Voo(undefined, "link_with_checkbox", {});
  return modSlotWrap({ fmt, voo: subVoo }, "link_with_checkbox", form);
};

/** set/right/account/views.rb:22 view :closure, perms: :delete,
 *  template: :haml, wrap: :slot - closure.haml. The template's deletion
 *  walk at (haml):25 — `- card.accounted.closure_deletions.each do
 *  |deletee|` — calls closure_deletions from OUTSIDE its receiver:
 *  account_holder.rb:81 marks it `private` (:87-89), and card.accounted is
 *  a DIFFERENT Card than the template's self, so stock Ruby raises
 *  NoMethodError "private method `closure_deletions' called for
 *  #<Card:0x...>" on every render that passes the perms: :delete gate
 *  (the stock synthetic-v2 capture pins it on
 *  view:admin:Ada Admin+*account:closure, where the quiet non-focal rescue
 *  renders the admin debug span around it). The haml below line 25 (the
 *  deletion list, the close button) never renders in stock Ruby, so the
 *  port reaches the same call and fails on the same condition: the
 *  receiver `card.accounted` (the +*account card's left) is resolved first;
 *  a missing left is Ruby's `nil.closure_deletions` (undefined method for
 *  nil), and a present one is an explicit-receiver call to a private
 *  method. The receiver is named by the engine's own identity
 *  (rubyDefaultInspect, card id as the identity), not a heap address. The deletion WALK
 *  itself stays ported in accountFollowBundle (the follow surface reads
 *  it); close_account's own internal call (:77) is in-object and never hits
 *  the visibility boundary.
 *
 *  Ruby source of the failure: card-mod-account-0.20.0
 *  set/right/account/closure.haml:25 (the explicit-receiver call), raised
 *  through activemodel-7.2.4 attribute_methods.rb:509 method_missing. */
const closureView: ViewFn = (ctx) => {
  const card = ctx.fmt.card;
  const accountedId = card.record.leftId;
  const accountedName = card.name.left;
  if (accountedId === undefined || accountedName === undefined) {
    throw new NoMethodError("undefined method `closure_deletions' for nil");
  }
  // account_holder.rb:81 `private` precedes `def closure_deletions`
  // (:87-89); an explicit receiver cannot call it.
  throw new NoMethodError(
    "private method `closure_deletions' called for " +
      rubyDefaultInspect("Card", accountedId),
  );
};

/** set/abstract/account_holder.rb:126 view :closed_account, template:
 *  :haml, served by set/abstract/closed_account.haml:
 *  ```
 *  %h2 Account Closed
 *
 *  %p
 *    The sign-in account once associated with this card has been removed, the card
 *    has been anonymized, and its data fields have been deleted.
 *  ```
 *  HAML emission: `%h2 X` -> `<h2>X</h2>` + "\n" (the whitespace-only
 *  source line emits nothing), `%p` opens the tag and its indented
 *  TWO-LINE text block renders on the FOLLOWING lines with the block's
 *  internal line breaks preserved and the shared indentation stripped, the
 *  closing tag on its own line, one trailing newline (the corpus's
 *  closed_account bytes: <h2>...</h2>\n<p>\n...removed, the
 *  card\nhas been...deleted.\n</p>\n). The view renders
 *  bare (no slot wrap) - account_holder.rb:125 opens the `format :html do`
 *  block but carries no `wrap:` config on this view. */
const closedAccountView: ViewFn = () =>
  "<h2>Account Closed</h2>\n" +
  "<p>\n" +
  "The sign-in account once associated with this card has been removed, the card\n" +
  "has been anonymized, and its data fields have been deleted.\n" +
  "</p>\n";

/** set/type_plus_right/user/email.rb:1-3 `def virtual?; new?; end` -
 *  the User+email card is virtual when the card is unsaved. set/type_plus_
 *  right/user/email.rb:7-9 view :raw: `card.content_email || card.account_
 *  email || ""`. `content_email` = `content if real?` - real cards read
 *  db_content, virtual ones return "". `account_email` walks
 *  `left&.account&.email` (the user card's +account right's +email right)
 *  - a multi-hop fetch the headless engine does not model, so the port
 *  falls through to "". This matches Ruby's empty-string fallback when
 *  both helpers return nil. The engine layer carries the card's
 *  dbContent, so the real-card branch is the one this port exercises. */
const userEmailRawView: ViewFn = ({ fmt }: ViewContext) => {
  const card = fmt.card;
  if (card.id === undefined) return ""; // virtual (new? = unsaved)
  return card.dbContent;
};

/** set/type/signup/core.haml + set/type/signup/views.rb:30-33 view :core,
 *  template: :haml (R17 port — was listed under "rails" because of the haml
 *  template; the template is two statements over @lines/@body and renders
 *  pure static HTML around the processed body):
 *
 *  ```
 *  - unless card.new_card? # necessary?
 *    .invite-links
 *      = lines.map { |h| "<div>#{h}</div>" }.join "\n"
 *      = body
 *  ```
 *  with `@lines = [signup_line] + account_lines` (views.rb:31) and
 *  `@body = process_content _render_raw` (views.rb:32).
 *
 *  signup_line (views.rb:35-37):
 *  `["<strong>#{safe_name}</strong>", ("was" if invited?),
 *  "signed up on #{format_date card.created_at}"].compact.join " "` —
 *  invited? = !self_signup? (views.rb:39-41) and self_signup? =
 *  `card.creator_id == AnonymousID` (views.rb:43-45): self-signed-up
 *  cards (the corpus's 53 of 55 live Sign up cards, creator_id 15 =
 *  Anonymous) read "signed up on"; the 2 admin-created ones
 *  (two cards an admin account created) read "was signed up on".
 *  format_date (card-1.110.0 lib/card/format/content.rb:29-41) localizes
 *  with :card_date_seconds = `'%B %e, %Y %H:%M:%S'` (en.yml:30) — %e is
 *  the SPACE-padded day ("November 18, 2023 16:24:47"; the captured
 *  bytes show the raw DB datetime string '2023-11-18 16:24:47'
 *  verbatim, so the port formats the SQL string literally, no TZ math).
 *
 *  account_lines (views.rb:54-61): `card.account? ? verification_lines :
 *  [t(:account_missing_account)]`; verification_lines =
 *  `[verification_sent_line, verification_link_line].compact`. For the
 *  captured corpus (viewer Anonymous — the engine's signed-out state):
 *  verification_sent_line needs `account.email_card.ok?(:read)` — the
 *  +account+email child is Administrator-read, denied for Anonymous ->
 *  nil; verification_link_line needs non-empty verification_links, and
 *  all three links (approve_with_token/approve_without_token/deny) are
 *  gated on can_approve?/ok?(:delete) — all false signed-out -> nil.
 *  So verification_lines = [] for every captured card (pinned: all 55
 *  signup expected bytes carry exactly ONE lines-div, the signup_line).
 *  The port computes sent_line through the engine's prepared read verdict
 *  (engine.isDenied on the fetched +account+email card; an unfetchable
 *  card is unreadable) and the link line through the engine's prepared
 *  approve/delete verdicts (verificationLinkLine; a signed-in member who
 *  may create Person cards sees the two approval links). The missing-account branch emits the
 *  en.yml:18 literal "ERROR: signup card missing account".
 *
 *  DISPATCH (both routes call THIS function): the verifier/probe render
 *  path never binds a mod loader, so — matching the account_links core
 *  pattern — views.ts#coreView base-dispatches it by typeCode ("signup",
 *  the type card's codename) with the typeName fallback, and the mod
 *  manifest registers the same function under the type set for loaded-
 *  loader compositions.
 */
export const signupCoreHtml = (ctx: ViewContext): string => {
  const { fmt } = ctx;
  const engine = fmt.engine;
  const card = fmt.card;
  // `- unless card.new_card?` — new cards render nothing (unknown/
  //  nest-miss cards are the engine's new-card shapes; fetched real
  //  cards are never new).
  if (card.unknown === true || isNewCard(card.record)) return "";
  const createdAt = card.record.createdAt;
  const creatorId = card.record.creatorId;
  // Ruby AnonymousID = Card["Anonymous"].id (the codename card; the
  // corpus names it "Anonymous" — prepare-phase enriched, render.ts).
  const anonymousId = engine.fetchRenderCard("Anonymous")?.id;
  const invited = creatorId !== undefined && anonymousId !== undefined && creatorId !== anonymousId;
  // safe_name: the html-escaped name (Rails' html_safe wrapper).
  const signupLine =
    `<strong>${h(card.name.s)}</strong>` +
    (invited ? " was" : "") +
    ` signed up on ${formatCardDateSeconds(createdAt)}`;
  const accountLines = signupAccountLines(ctx);
  const body = fmt.processContent(fmt.renderRaw());
  // HAML line discipline: each template statement's bytes end with a
  // newline — the body line and the closing </div> carry a trailing "\n"
  // (the content view's slot wrap close then lands AFTER the final
  // newline; expected tail "...\n</div>\n</div>\n</div>").
  return (
    `<div class='invite-links'>\n` +
    [signupLine, ...accountLines].map((line) => `<div>${line}</div>`).join("\n") +
    `\n${body}` +
    `\n</div>\n`
  );
};

/** views.rb:54-61 account_lines (see signupCoreView). */
function signupAccountLines(ctx: ViewContext): string[] {  const { fmt } = ctx;
  const engine = fmt.engine;
  // The trait fetch composes the STAR name: card.account -> "<card>
  // +*account" (right 100 = *account; the r17-junction-fetch-probe.rb
  // oracle probe — Card.fetch("<card>+account") is
  // nil and the tag card "account" does not exist). The prepare phase
  // enriches both children for the signup root (render.ts).
  const account = engine.fetchRenderCard(`${fmt.card.name.s}+*account`);
  if (account === undefined || account.unknown === true) {
    return ["ERROR: signup card missing account"];
  }
  const email = engine.fetchRenderCard(`${fmt.card.name.s}+*account+*email`);
  const sent =
    email !== undefined && email.unknown !== true && !engine.isDenied(email)
      ? `A verification email has been sent to ${h(email.dbContent)}`
      : undefined;
  const linkLine = verificationLinkLine(ctx);
  return [sent, linkLine].filter((line): line is string => line !== undefined);
}

/** views.rb verification_link_line: the non-empty verification_links
 *  joined " " — approve with a token ("Resend" when the account status is
 *  "unverified", else "Send") and without one, both gated on can_approve?,
 *  then "Deny and delete" gated on ok?(:delete). The gates are the engine's
 *  prepared verdicts (signupApprovalVerdict); unprepared means no links. */
function verificationLinkLine(ctx: ViewContext): string | undefined {
  const { fmt } = ctx;
  const verdict = fmt.engine.signupApprovalVerdict?.(fmt.card);
  if (verdict === undefined) return undefined;
  const url = h(fmt.urlKey());
  const links: string[] = [];
  if (verdict.approve) {
    const status = fmt.engine.fetchRenderCard(`${fmt.card.name.s}+*account+*status`);
    const action = status !== undefined && status.unknown !== true && status.dbContent.trim() === "unverified"
      ? "Resend"
      : "Send";
    links.push(
      `<a class="known-card" href="/update/${url}?card%5Btrigger%5D=approve_with_verification">${action} verification email</a>`,
      `<a class="known-card" href="/update/${url}?card%5Btrigger%5D=approve_without_verification">Approve without verification</a>`,
    );
  }
  if (verdict.delete) links.push(`<a class="known-card" href="/delete/${url}">Deny and delete</a>`);
  return links.length === 0 ? undefined : links.join(" ");
}

/** en locale card_date_seconds: '%B %e, %Y %H:%M:%S' (%e = space-padded
 *  day-of-month). The SQL datetime string 'YYYY-MM-DD HH:MM:SS' is split
 *  literally — the capture proves no timezone shift (the probe card's
 *  DB '2023-11-18 16:24:47' -> "November 18, 2023 16:24:47"). */
function formatCardDateSeconds(sql: string | undefined): string {
  if (sql === undefined || sql === "") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(sql);
  if (m === null) return "";
  const month = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][Number(m[2]) - 1];
  if (month === undefined) return "";
  const day = String(Number(m[3])).padStart(2, " ");
  return `${month} ${day}, ${m[1]} ${m[4]}:${m[5]}:${m[6]}`;
}

// ---------------------------------------------------------------------------
// the manifest
// ---------------------------------------------------------------------------

/** The mod's set module file list, paths as in the gem tree. Files with
 *  no ported view still get an entry so the basket records their
 *  existence (loader.ts#registerSetModule: every setModules entry
 *  contributes one RegisteredSetModule to the basket regardless of its
 *  format blocks). */
// ===========================================================================
// mod-porting wave1 (2026-10-03): the census's account views. Oracle:
// tools/mod-porting-harness/ruby-oracles/card-mod-account/
// account-census-views.rb (5 scenarios, static-ruby under the real
// interpreter - no live captures exist for any signup/forgot/tab form);
// probe: card-mod-account-harness-probe.test.ts.
// ===========================================================================

// --- set/type/signup/views.rb (the signup form family) ----------------------

/** views.rb:2-4 invitation?: `Auth.signed_in? && card.can_approve?`.
 *  can_approve? (set/type/signup.rb:12-14) = `Card.new(type_id:
 *  Card.default_accounted_type_id).ok? :create`: the viewer may create the
 *  accounted (User) type. The engine's approval-verdict seam prepares that
 *  create verdict per Sign up root (render.ts prepareSignupApprovalVerdicts,
 *  through signupApprovalVerdict); unprepared (no seam) reads false, so a
 *  view lane without the prepare phase keeps the signed-out arm. */
function signupInvitation(fmt: ViewContext["fmt"]): boolean {
  return (
    fmt.engine.viewer?.signedIn === true &&
    fmt.engine.signupApprovalVerdict?.(fmt.card)?.approve === true
  );
}

/** views.rb:6-9 view :new, cache: :never:
 *    voo.title = invitation? ? t(:account_invite) : t(:account_sign_up)
 *    super()
 *  The super() dispatch rides the mod-view-helpers superView (the MRO
 *  chain's next :new registration - card-mod-edit's live newView,
 *  framed_create_form). en.yml:17 "Invite" / en.yml:34 "Sign up"; the title
 *  rides the voo opt the title view reads (titleNoLinkView's voo.opts["title"]
 *  - the live writer Ruby's define_setter gives voo.title). */
const signupNewView: ViewFn = (ctx) => {
  // voo.title = is a live writer (voo_api.rb define_setter), not a slot option:
  // the title reads it, and the slot JSON never carries it.
  ctx.voo.liveTitle = signupInvitation(ctx.fmt) ? "Invite" : "Sign up";
  // the registration's set module: the nested child file's shortname,
  // Type::Signup::Views (keyed by the type's codename, signup)
  return superView(ctx, setModuleShortname("type/signup/views"), "new");
};

/** views.rb:15-18 view :new_buttons, cache: :never:
 *    button_formgroup do
 *      [standard_create_button, invite_button].compact
 *    end
 *  invite_button (:21-23) is the "Send Invitation" primary button when
 *  invitation? holds, else nil (compact drops it). The create button is
 *  form_buttons.rb:184-186 (submit_button class "submit-button
 *  create-submit-button", data-disable-with "Submitting" - the same bytes
 *  the edit mod's own newButtonsView pins for the standard_create_button
 *  element). button_formgroup (card-mod-edit set/all/form.rb:86-88): the
 *  "form-group button-form-group" div, its buttons joined "\n". */
const signupNewButtonsHtml = (invitation = false): string => {
  const create =
    `<button name="button" type="submit" data-disable-with="Submitting" class="submit-button create-submit-button btn btn-primary">Submit</button>`;
  const invite = invitation
    ? `<button name="button" type="submit" class="btn btn-primary">Send Invitation</button>`
    : undefined;
  return (
    `<div class="form-group button-form-group">` +
    [create, invite].filter((b) => b !== undefined).join("\n") +
    `</div>`
  );
};

const signupNewButtonsView: ViewFn = ({ fmt }) => signupNewButtonsHtml(signupInvitation(fmt));

// --- set/abstract/account_holder.rb view :account_tab ------------------------

/** account_holder.rb:168-170 account_content_items. */
const ACCOUNT_CONTENT_ITEMS: ReadonlyArray<readonly [string, string]> = [
  ["Created", "*created"],
  ["Edited", "*edited"],
];

/** account_holder.rb:151-166 account_details_items - the item tuples with
 *  their path opts (the field marks expand through the trait fetch:
 *  :account/:roles/:follow/:created/:edited are codename-marked rights -
 *  "<card>+*account" etc.). */
const ACCOUNT_DETAILS_ITEMS: ReadonlyArray<
  readonly [string, string, Record<string, unknown>?]
> = [
  [
    "Email and Password",
    "*account",
    { path: { slot: { hide: ["help_link", "board_link"] } } },
  ],
  ["Roles", "*roles", { path: { view: "content" } }],
  ["Notifications", "*follow"],
  [
    "API",
    "*account",
    {
      path: {
        view: "api_key",
        items: { view: "content" },
        slot: { hide: ["help_link", "board_link"] },
      },
    },
  ],
  ["Close Account", "*account", { path: { view: "closure" } }],
];

/** board.rb:59-62 board_slot_selector + :42-51 board_link_opts - the pill
 *  link's base opts (the edit mod exports the selector constant; the UL
 *  classes ride with it). */
const BOARD_PILL_BASE_OPTS = {
  slotSelector: BOARD_SLOT_SELECTOR,
};

/** Rails Hash#to_param over the pill's path hash: sorted keys, nested
 *  [a][b], arrays as [a][], Rack-escaped (the follow mod's followButton
 *  precedent; the related tab's pinned href shape
 *  slot%5Bitems%5D%5Bview%5D=closed). "&amp;" - the HTML attribute escape. */
function pillPathQuery(path: Record<string, unknown>): string {
  const pairs: Array<[string, string]> = [];
  const flat = (
    prefix: string,
    value: Record<string, unknown> | readonly string[] | string,
  ): void => {
    if (Array.isArray(value)) {
      for (const item of value) pairs.push([`${prefix}[]`, String(item)]);
    } else if (typeof value === "object" && value !== null) {
      for (const k of Object.keys(value).sort()) {
        flat(
          `${prefix}[${k}]`,
          (value as Record<string, unknown>)[k] as Record<string, unknown> | readonly string[] | string,
        );
      }
    } else {
      pairs.push([prefix, String(value)]);
    }
  };
  for (const k of Object.keys(path).sort()) {
    const v = path[k];
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      flat(k, v as Record<string, unknown>);
    } else if (Array.isArray(v)) {
      for (const item of v) pairs.push([`${k}[]`, String(item)]);
    } else {
      pairs.push([k, String(v)]);
    }
  }
  return pairs
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)
          .replace(/%20/g, "+")
          .replace(/%2B/g, "%2B")}=${encodeURIComponent(v).replace(/%20/g, "+")}`,
    )
    .join("&amp;");
}

function deepMergePaths(
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(extra)) {
    const b = out[k];
    const e = extra[k];
    out[k] =
      b !== null && typeof b === "object" && !Array.isArray(b) && e !== null && typeof e === "object" && !Array.isArray(e)
        ? deepMergePaths(b as Record<string, unknown>, e as Record<string, unknown>)
        : e;
  }
  return out;
}

/** board_pills.rb:20-30 board_pill_item_opts + board.rb:68-71
 *  breadcrumb_data ("Account".underscore = "account") + links.rb:101-106
 *  link_to_card (href LAST). The pill data-cy: text.to_name.key
 *  (cardname.rb generate_key: underscore + Rails singularize - the account
 *  vocabulary's singulars: roles->role, notifications->notification; the
 *  rest unchanged). The mark: "<card>+<trait>" url key. */
function accountBoardPillItem(
  cardName: string,
  text: string,
  trait: string,
  extraPath: Record<string, unknown> | undefined,
  known: boolean,
): string {
  const cyTable: Record<string, string> = {
    roles: "role",
    notifications: "notification",
  };
  const cyBase = text.toLowerCase().replace(/ /g, "_");
  const cy = `${cyTable[cyBase] ?? cyBase}-pill`;
  // board_link_opts' path: layout=overlay, slot[items][view]=closed,
  // view ||= content; the item's extra path DEEP-merges over it (the
  // extra slot.hide row joins the base slot.items row).
  const base: Record<string, unknown> = {
    layout: "overlay",
    slot: { items: { view: "closed" } },
    view: "content",
  };
  const merged = deepMergePaths(base, (extraPath ?? {}) as Record<string, unknown>);
  // the path's :view rides the SEGMENT (the related tab's pinned
  // "/<mark>/content?..." shape), the rest the sorted to_param query
  const viewSegment = String(merged.view);
  const rest = { ...merged };
  delete rest.view;
  const query = pillPathQuery(rest);
  const href = query === ""
    ? `/${DeckoName.parse(`${cardName}+${trait}`).urlKey}/${viewSegment}`
    : `/${DeckoName.parse(`${cardName}+${trait}`).urlKey}/${viewSegment}?${query}`;
  return (
    // board_pills.rb:35-37 wrap_each_with(:li, class: "nav-item") — the
    // pill anchors ride the li wrapper and the known-card class (the
    // accounted card's own traits are known); board_link_opts' remote flag
    // lands LAST, after the href (the graded account_tab row's attr order).
    `<li class="nav-item">` +
    `<a data-slot-selector="${h(BOARD_PILL_BASE_OPTS.slotSelector)}"` +
    ` data-slotter-mode="override" class="slotter nav-link ${known ? "known-card" : "wanted-card"}"` +
    ` data-bs-toggle="pill" data-breadcrumb="Account" data-breadcrumb-class="account"` +
    ` data-cy="${cy}" href="${href}" data-remote="true">${text}</a></li>`
  );
}

/** account_holder.rb:132-137 view :account_tab:
 *    board_pill_sections "Account" do
 *      [["Settings", account_details_items],
 *       ["Content", account_content_items]]
 *    end
 *  board_pill_sections (board_pills.rb:32-37): wrap_with :ul (the
 *  BOARD_PILL_UL_CLASSES constant) over the sections joined "\n"; each
 *  section (:35-37): wrap_with(:h6, title, class: "ms-1 mt-3") +
 *  wrap_each_with(:li, class: "nav-item") (the pills joined "\n").
 *  default_board_tab (:128-130): the accounted card's own tab (the
 *  current_account? arm the engine's board renders resolve through their
 *  own registrations). */
const accountTabHtml = (cardName: string, isKnown: (name: string) => boolean = () => true): string => {
  const settings = ACCOUNT_DETAILS_ITEMS.map(([text, trait, extra]) =>
    accountBoardPillItem(cardName, text, trait, extra?.path as Record<string, unknown> | undefined, isKnown(`${cardName}+${trait}`)),
  );
  const content = ACCOUNT_CONTENT_ITEMS.map(([text, trait]) =>
    accountBoardPillItem(cardName, text, trait, undefined, isKnown(`${cardName}+${trait}`)),
  );
  const section = (title: string, pills: readonly string[]): string =>
    `<h6 class="ms-1 mt-3">${title}</h6>${pills.join("\n")}`;
  return (
    `<ul class="${BOARD_PILL_UL_CLASSES}">` +
    section("Settings", settings) +
    "\n" +
    section("Content", content) +
    `</ul>`
  );
};

const accountTabView: ViewFn = ({ fmt }) =>
  accountTabHtml(fmt.card.name.s, (name) => fmt.engine.peekBoardPillKnown?.(name) ?? true);

/** The wave-1 account views' PROBE SURFACE - the composition cores the
 *  harness probe replays the static-ruby oracle against; the same functions
 *  the view bodies call. */
export const accountProbeSurface = {
  /** views.rb:6-9 the signed-out title arm (the reachable one). */
  signupNewTitle(): string {
    return "Sign up";
  },
  /** views.rb:15-18 the create-only formgroup (invite nil signed-out). */
  signupNewButtonsHtml,
  /** account_holder.rb:132-137 the pill sections over the verbatim walks. */
  accountTabHtml,
  /** signin.rb:159-163 the reset_password_voo contract. */
  signinEditVoo(): {
    title: string;
    editStructure: ReadonlyArray<{ name: string; title: string; view: string; skipPerms: boolean }>;
    hide: readonly string[];
  } {
    return {
      title: "Forgot Password",
      // signin_field :198-202 field :email -> the SETTING card *email
      // (Card::Name#field stars codenamed fields: home.field_nest :self =>
      // 'Home+*self', nesting.rb docstring; the recorded reset form's input
      // name is card[subcards][+*email][content])
      editStructure: [{ name: "+*email", title: "email", view: "titled", skipPerms: true }],
      hide: ["help"],
    };
  },
};

// --- mod-completion-100 (2026-10-03): the census walk + setup views ---------
// Oracle: tools/mod-porting-harness/ruby-oracles/card-mod-account/
// account-walk-views.rb (4 scenarios, static-ruby under the real
// interpreter - the REAL cardname field marks + real Haml for
// setup_help.haml); probe: card-mod-account-harness-probe.test.ts.

/** account_holder.rb:143-145 account_formgroups:
 *    Auth.as_bot { subformat(card.account)._render :content_formgroups,
 *    structure: true }
 *  the DIRECT subformat render (NOT a nest - the nest machinery's
 *  modal_nest_view would substitute the view under the ambient nest mode;
 *  Ruby's _render bypasses it, which is why the setup form's walk survives
 *  the with_nest_mode :edit wrapper). The as_bot widening rides the seeded
 *  read grants (the established basis). */
function accountFormgroups(ctx: ViewContext): string {
  const { fmt } = ctx;
  // card.account (account_holder.rb:143): Card.fetch [name, :account] with
  // new: {} semantics - a signup card has no +*account row yet, and Ruby's
  // fetch builds the NEW +*account card (its type the *account card's own,
  // RichText) rather than answering nil. The fabricated record overrides
  // the *account template's id/record (the new card has no row) while
  // keeping the template's type and set keys.
  const existing = fmt.engine.fetchRenderCard(`${fmt.card.name.s}+*account`);
  const accountCard =
    existing !== undefined && existing.unknown !== true
      ? existing
      : (() => {
          const template = fmt.engine.fetchRenderCard("*account");
          if (template === undefined) return undefined;
          const name = DeckoName.parse(`${fmt.card.name.s}+*account`);
          return {
            ...template,
            name,
            key: name.key,
            id: undefined,
            unknown: true,
            record: { ...template.record, id: undefined, name, key: name.key, isNew: true },
            // THE SET KEYS ARE THE JUNCTION CARD'S, not the template's: the
            // *account template's own keys carry SELF-Xaccount (the codename
            // card's self anchor) and no RIGHT- token, while the new
            // +*account subcard is a JUNCTION whose right side keys to the
            // account codename - RIGHT-Xaccount is what brings
            // Right::Account::Views (the before :content_formgroups hook
            // that sets the edit_structure) into the subformat's chain.
            // Ruby's new-card patterns (pattern/all.rb:40-42) drop the self
            // pattern and key the junction + right patterns off the name;
            // safeSetKeys is the engine's own new-card computation (the
            // seat at render.ts uses exactly it). leftTypeName undefined =
            // the left signup card has no row yet - Ruby's quick_type
            // default applies, as for any new junction whose left is
            // unfetchable (lib/card/set/pattern/class_methods.rb:59-71).
            setKeys: safeSetKeys({
              name,
              typeId: template.typeId,
              typeName: template.typeName,
              leftTypeName: undefined,
              isNew: true,
            }),
          } as ViewContext["fmt"]["card"];
        })();
  if (accountCard === undefined) {
    return "";
  }
  const sub = new RenderFormat(accountCard, fmt.engine, { parent: fmt, maxDepth: fmt.maxDepth, nestQuietErrors: fmt.nestQuietErrors });
  // Rails' fields_for nests the subform under the parent form's prefix:
  // the +*account subcard's own fields_for prefix is
  // card[subcards][+*account], so its fields render
  // card[subcards][+*account][subcards][+*email][content] - the recorded
  // oracle signup form pins exactly that input name.
  const accountRelative = accountCard.name.from(fmt.card.name);
  return str(sub.renderView("content_formgroups", {
    structure: "true",
    form_name_prefix: `card[subcards][${accountRelative}]`,
  }));
}

/** set/type/signup/views.rb:11-13 view :content_formgroups:
 *    [account_formgroups, (multi_card_editor? ? multi_card_edit(true) :
 *    "")].join
 *  account_formgroups (account_holder.rb:143-145) renders the +*account
 *  trait's content_formgroups under structure: true; the +*account card's
 *  own registration (the before hook, below) sets voo.edit_structure and
 *  dispatches the edit mod's walk. The signup card's own
 *  multi_card_editor? reads false (no voo structure, no edit_structure, no
 *  structure rule, edit_fields empty) - the second arm answers "". */
const signupContentFormgroupsView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  // account_formgroups: Auth.as_bot { subformat(card.account)._render(
  // :content_formgroups, structure: true) } - the as_bot widening rides the
  // probe's seeded read grants (the established basis); structure: true
  // rides the nest opts (the subformat's voo.structure)
  const accountFormgroupsBytes = accountFormgroups(ctx);
  // multi_card_editor? on the signup card: every arm nil/empty
  const multiCardArm = "";
  return output([accountFormgroupsBytes, multiCardArm]);
};

/** set/right/account/views.rb:59-61 the before :content_formgroups hook +
 *  the chain dispatch:
 *    before :content_formgroups do
 *      voo.edit_structure = [[:email, { title: "email" }],
 *                            [:password, { title: "password" }]]
 *    end
 *  The tuple's relative marks normalize through the edit mod's walk
 *  (card.name.field over the +*account card): :email names the SETTING
 *  card, so field stars it - Card::Name#field's own docstring
 *  (home.field_nest :self => nest for 'Home+*self') and the recorded form's
 *  input names (card[subcards][+*email][content]) both pin
 *  "<card>+*account+*email", NOT "<card>+*account+email".
 *  The dispatch rides superView to the edit mod's contentFormgroupsView
 *  (the multi-card walk the the mod-completion pass ported there). */
const accountBeforeContentFormgroupsView: ViewFn = (ctx) => {
  ctx.voo.liveEditStructure = [
    ["+*email", { title: "email" }],
    ["+*password", { title: "password" }],
  ];
  return superView(ctx, setModuleShortname("right/account/views"), "content_formgroups");
};

/** set/type/user/setup_help.haml (verbatim, real-Haml oracle bytes): the
 *  h3 + the pb-2 roles note + the delivery-off alert-warning block. The
 *  warning block is the Card.config.action_mailer.perform_deliveries ==
 *  false arm — and the GRADED corpus oracle carries it (the same fact the
 *  admin-warning row pinned in the earlier slice: the capture
 *  environment's mailer config answers delivery-off; the corpus gate is
 *  the arbiter, so the false-delivery arm is the rendered one). */
const SETUP_HELP_BYTES =
  `<h3>First, set up an account.</h3>
` +
  `<div class='pb-2'>
` +
  `As the first account holder for this deck, you will automatically have several
` +
  `permissioned roles. You can configure these roles at any time.
` +
  `</div>
` +
  `<div class='alert-warning p-3'>
` +
  `WARNING: Email delivery is turned off.
` +
  `Change settings in config/application.rb to send sign up notifications.
` +
  `</div>
`;

/** user.rb:46-53 setup_hidden_fields: hidden_tags over the card + success
 *  hashes; type_id = Card.default_accounted_type_id (the Sign Up codename
 *  card's id - the runtime resolves the codename card); trigger
 *  ["check_setup"] (the array's [] suffix); success {redirect: true,
 *  mark: path(mark: "")} - path(mark: "") answers "/" (Card::Path's
 *  markless base + the html contextualize root). The byte chain is the
 *  oracle's hiddenFieldsBytes line (the nil-value-omits rule never fires
 *  here - every value is present). */
function setupHiddenFields(ctx: ViewContext): string {
  // Card.default_accounted_type_id — the USER cardtype's id (the graded
  // corpus row pins card[type_id] value="18"; the earlier Sign Up read
  // answered the signup cardtype's id).
  const typeId = ctx.fmt.engine.fetchRenderCard("User")?.id;
  const hiddenFieldTag = (name: string, value: string): string =>
    `<input type="hidden" name="${h(name)}" id="${h(name.replace(/]/g, "").replace(/\[/g, "_"))}" value="${h(value)}" autocomplete="off" />`;
  const out = [
    hiddenFieldTag("card[type_id]", String(typeId ?? "")),
    hiddenFieldTag("card[trigger][]", "check_setup"),
    hiddenFieldTag("success[redirect]", "true"),
    hiddenFieldTag("success[mark]", "/"),
  ];
  return out.join("");
}

/** user.rb:10-19 view :setup, unknown: true, perms: :needs_setup?,
 *  cache: :never:
 *    with_nest_mode :edit do
 *      voo.title = "Your deck is ready to go!"
 *      voo.show! :help
 *      voo.hide! :menu
 *      voo.help = haml :setup_help
 *      Auth.as_bot { setup_form }
 *    end
 *  setup_form (:27-33): frame_and_form :create { [setup_hidden_fields,
 *  _render_name_formgroup, account_formgroups, setup_form_buttons] }.
 *
 *  THE PERMS GATE (the wave-1 named remainder, now wired): Ruby's render
 *  pipeline calls Card::Auth.needs_setup? synchronously; the TS census is
 *  async SQL, so the gate reads the PREPARED verdict
 *  (first-run-setup-verdict-seam.ts - setupWindowState is the census's
 *  port). No prepared verdict = closed (the conservative census answer).
 *  Closed renders Ruby's perms denial (the standard task-denied span). */
const setupView: ViewFn = (ctx) => {
  const { fmt, voo } = ctx;
  const verdict = preparedSetupVerdict();
  if (verdict === undefined || verdict.open !== true) {
    // error.rb:28 interpolates @denied_task, which is `crud?(task) && task`
    // (permission.rb:49): FALSE for a method-predicate perms gate, and the
    // interpolation of false is "". So Ruby's setup denial reads
    // "... permission (false)" - the parens carry the boolean, not a task.
    return quietDenial("false");
  }
  return fmt.withNestMode("edit", () => {
    // voo.title = / voo.help = are LIVE writers (voo_api.rb:30-32
    // define_setter) — readable through the accessor, invisible in the
    // OWNING slot JSON; :help is an heir key, so the child help-view voo
    // inherits it into its normalized options and ITS slot JSON carries
    // the text (the graded corpus row pins both halves). Writing them
    // into voo.opts serialized them on the outer setup slot too.
    voo.liveTitle = "Your deck is ready to go!"; // LOCALIZE
    // voo.show! :help / voo.hide! :menu are the FORCE writers
    // (visibility.rb:39-45 `viz views, setting, true`) - they override any
    // earlier setting, unlike plain show/hide (first write wins).
    voo.setViz("help", "show");
    voo.setViz("menu", "hide");
    // voo.help = haml :setup_help (the oracle's helpBytes line)
    voo.liveHelp = SETUP_HELP_BYTES;
    // Auth.as_bot { setup_form } - frame_and_form :create over the body
    // (the as_bot widening rides the seeded grants). The body renders
    // INSIDE the frame's block: frame.rb:21's add_name_context runs before
    // the body (the graded field slots carry name_context), so the
    // account field renders must build after it.
    return framedView(ctx, "setup", () => {
      const body = output([
        setupHiddenFields(ctx),
        str(fmt.renderView("name_formgroup")),
        // account_formgroups (the walk; the +email/+password field cards'
        // editors render through the subformat's nest machinery under the
        // inherited nest_mode :edit)
        accountFormgroups(ctx),
        // setup_form_buttons (user.rb:35-39): button_formgroup { setup_button }
        // - setup_button = submit_button text "Set up", disable_with
        // "Setting up" (form_elements.rb:59-66; the pinned bootstrap shape)
        `<div class="form-group button-form-group"><button name="button" type="submit" data-disable-with="Setting up" class="btn btn-primary">Set up</button></div>`,
      ]);
      const form = createCardBodyShell(ctx, { body });
      return form;
    });
  });
};

// --- set/self/signin.rb view :edit (the FORGOT-PASSWORD form) ----------------

/** signin.rb:154-157 view :edit:
 *    reset_password_voo
 *    Auth.as_bot { super() }
 *  reset_password_voo (:159-163): voo.title ||= t(:account_forgot_password)
 *  ("Forgot Password", en.yml:16); voo.edit_structure = [signin_field(:email)]
 *  (signin_field :198-202: the "+email" field nest tuple - title "email",
 *  view "titled", skip_perms); voo.hide :help. The super() dispatch rides
 *  superView to the edit mod's live editView.
 *
 *  DISCLOSED CONSUMING-SIDE GAP: voo.edit_structure drives WHICH fields the
 *  edit form renders - the structure-driven form arm is the edit mod's own
 *  disclosed remainder (card-mod-edit.ts formgroup.rb:9-11 note: "the
 *  explicit-edit-fields arm is voo.edit_structure (unset in the engine)").
 *  This body threads the voo exactly as Ruby does; the edit form the super()
 *  reaches renders the implicit arm (the standard field walk), not the
 *  email-only form. The voo contract is oracle-pinned
 *  (signin_edit_reset_password_voo). */
const signinEditView: ViewFn = (ctx) => {
  const voo = accountProbeSurface.signinEditVoo();
  // :159 ||= t(:account_forgot_password) - the title rides the voo opt the
  // title view reads (titleNoLinkView's voo.opts["title"])
  // voo.title ||= t(:account_forgot_password) is a live writer (voo_api.rb
  // define_setter): the title view reads it, the slot JSON never carries it.
  if (ctx.voo.opts["title"] === undefined) ctx.voo.liveTitle = voo.title;
  ctx.voo.liveEditStructure = voo.editStructure.map((f: { name: string; title: string; view: string; skipPerms: boolean }) => [
    f.name, { title: f.title, view: f.view, skip_perms: f.skipPerms },
  ]);
  for (const hidden of voo.hide) ctx.voo.hide(hidden);
  return superView(ctx, setModuleShortname("self/signin"), "edit");
};

const setModules: ModSetModuleFile[] = [
  // pattern: all (loader.rb#parts_from_path: "all/foo" -> "All::Foo")
  {
    setPath: "all/account",
    // set_stamper: the act writer stamps creator_id/updater_id with the
    // acting account (history/write-path.ts). generate_token has no stage
    // (a helper the token flows call; auth/token.ts).
    events: [
      engineOwnedEvent({ event: "generate_token" }),
      engineOwnedEvent({ event: "set_stamper", at: "prepare_to_validate" }),
    ],
  },
  { setPath: "all/password_input" },
  // pattern: abstract
  { setPath: "abstract/account_field" },
  {
    // set/abstract/account_holder.rb:125-170 format :html do block -
    // :closed_account (port), :account_tab (NOT ported: rails),
    // :show_account_tab?/:account_formgroups/:account_details_items/
    // :account_content_items/:default_board_tab (helpers, not views).
    // Wave-1 (2026-10-03): :account_tab joins - the board pill sections
    // over the verbatim item walks (the pill composition the oracle pins;
    // the board constants ride the edit mod's exports).
    setPath: "abstract/account_holder",
    events: [
      // set/abstract/account_holder.rb:125-170 declares the event, but NO
      // engine code implements it: the event name appears nowhere in src/
      // but this declaration (grep over src/, 2026-10-19). STUB, named
      // remainder - there is no engine owner to cite.
      event({
        event: "validate_account_holder_name_change",
        at: "validate",
        on: ["update"],
        changed: ["name"],
      }),
    ],
    formats: {
      html: {
        views: [
          { view: "closed_account", viewFn: closedAccountView },
          { view: "account_tab", viewFn: accountTabView },
        ],
      },
    },
  },
  // pattern: right
  { setPath: "right/account" },
  {
    // set/right/account/events.rb — the whole verification/reset chain.
    // Engine ownership: the flows the events implement run in
    // src/card/auth/account-verify-reset-flows.ts (the request/confirm
    // ladders, the template renders, the SMTP delivery) and
    // src/card/auth/account-fields.ts (the create-time field events);
    // src/card/actions/card-action-engine.ts:3803-3807 (closeAccount) runs
    // delete_account's close_account walk. The three send_*_email events
    // come from the gem's dynamic `%i[password_reset_email
    // verification_email welcome_email].each { event :"send_#{email}" }`
    // loop (events.rb:33-35) — the recount regex only sees literal
    // `event :name` declarations, so they sit outside the 30-name
    // denominator; they are declared anyway (Ruby has them; the dispatch
    // seam triggers them, engine card-action-engine.ts input.triggeredIntegrate).
    setPath: "right/account/events",
    events: [
      // events.rb:3-5 — engine: account-fields.ts planAccountFields
      // (generateSalt on create).
      engineOwnedEvent({
        event: "set_default_salt",
        at: "prepare_to_validate",
        on: ["create"],
      }),
      // events.rb:7-9 — engine: account-fields.ts planAccountFields
      // (default status "active"/"unverified"/"unapproved").
      engineOwnedEvent({
        event: "set_default_status",
        at: "prepare_to_validate",
        on: ["create"],
      }),
      // events.rb:15-17, trigger: :required — engine:
      // account-verify-reset-flows.ts (the confirm arm: token decode ->
      // reset_password_success/failure).
      engineOwnedEvent({
        event: "reset_password",
        at: "prepare_to_validate",
        on: ["update"],
        trigger: "required",
      }),
      // events.rb:19-24, trigger: :required — engine:
      // account-verify-reset-flows.ts (verify_and_activate ladder,
      // activatable's no-subcards guard).
      engineOwnedEvent({
        event: "verify_and_activate",
        at: "prepare_to_validate",
        on: ["update"],
        trigger: "required",
      }),
      // events.rb:26-28, when: :password_redirect? — STUB, named
      // remainder: the body is a redirect channel (success << {id:,
      // view: "edit"}) and the engine's save path has no success/redirect
      // composition surface to mutate (grep over src/card/actions finds
      // none); the redirect after a password save is route-layer work.
      event({
        event: "password_redirect",
        at: "finalize",
        on: ["update"],
        when: "password_redirect?",
      }),
      // events.rb:33-35 (the dynamic three), trigger: :required — engine:
      // account-verify-reset-flows.ts renders + delivers each template.
      engineOwnedEvent({ event: "send_password_reset_email", at: "integrate", trigger: "required" }),
      engineOwnedEvent({ event: "send_verification_email", at: "integrate", trigger: "required" }),
      engineOwnedEvent({ event: "send_welcome_email", at: "integrate", trigger: "required" }),
      // events.rb:40-43 (no stage) — engine: account-verify-reset-flows.ts
      // runs activate_account inside verify_and_activate_success (status ->
      // "active" + trigger_event! :send_welcome_email).
      engineOwnedEvent({ event: "activate_account" }),
      // events.rb:45-47 — engine: card-action-engine.ts:3803-3807
      // (closeAccount: anonymize + closure deletions; the delete_account
      // comment at :4176, the call at :4217).
      engineOwnedEvent({
        event: "delete_account",
        at: "prepare_to_validate",
        on: ["delete"],
      }),
      // events.rb:49-51, when: :current_account? — STUB, named remainder:
      // signing the session out when the deleted account IS the acting
      // session's account has no engine surface (the visitor-session
      // lifecycle is route-layer; no delete-path hook exists).
      event({
        event: "signout_upon_delete",
        at: "integrate",
        on: ["delete"],
        when: "current_account?",
      }),
    ],
  },
  {
    // set/right/account/views.rb:1-47 base block (verify_url,
    // reset_password_url, token_expiry, token_days + verify_days/
    // reset_password_days aliases, closure) + :49-68 html block
    // (core + before :content_formgroups + token_expiry html override).
    // Ported: token_days + its two deprecated aliases, the html
    // block's token_expiry (the literal HTML string), and — surfaces-batch3
    // — the html block's :core (the email+password field nests).
    // :verify_url/:reset_password_url render their page arm (the denied
    // blank); the token URL itself is built on the send path.
    setPath: "right/account/views",
    formats: {
      html: {
        views: [
          // the before :content_formgroups hook (views.rb:59-61) + the chain
          // dispatch to the edit mod's walk
          { view: "content_formgroups", viewFn: accountBeforeContentFormgroupsView },
          { view: "core", viewFn: accountCoreView },
          // views.rb:2-8 :verify_url / :reset_password_url: the page arm
          // (the token URL is built by the send path, see views.ts). Called
          // through a closure: views.ts reaches this module through an
          // import cycle, so its bindings are read at render time.
          { view: "verify_url", viewFn: (ctx) => verifyUrlView(ctx), config: { cache: "never", denial: "blank" } },
          { view: "reset_password_url", viewFn: (ctx) => resetPasswordUrlView(ctx), config: { denial: "blank" } },
          { view: "token_days", viewFn: tokenDaysView },
          { view: "verify_days", viewFn: verifyDaysView },
          { view: "reset_password_days", viewFn: resetPasswordDaysView },
          { view: "token_expiry", viewFn: tokenExpiryView },
          { view: "closure", viewFn: closureView, config: { perms: "delete", wrap: "slot" } },
        ],
      },
    },
  },
  {
    // set/right/email.rb:5 `assign_type :phrase` (advanced_api.rb:5-8 —
    // the trait's cards are Phrase-typed; the +*account page's phantom
    // +*password field slot pins type-id 52 Phrase).
    // Events (set-module event 2026-10-08): the three email validations run
    // inside src/card/auth/account-fields.ts planAccountFields (:140) —
    // normalizeEmail (account-fields.ts:71-74) is downcase_email (it also
    // does validate_email's strip); emailIsValid (account-fields.ts:76, the
    // grammar EMAIL_REGEX at :54) is validate_email; planAccountFields'
    // emailTaken probe (account-fields.ts:114, called at :155) is
    // validate_unique_email's Auth.as_bot cql search.
    setPath: "right/email",
    assignsType: "phrase",
    events: [
      // validate_email — engine: account-fields.ts:76 (emailIsValid; the
      // address grammar EMAIL_REGEX at :54).
      engineOwnedEvent({ event: "validate_email", at: "validate", on: ["save"] }),
      // validate_unique_email — engine: account-fields.ts:114 (the emailTaken
      // probe seam), called at :155.
      engineOwnedEvent({
        event: "validate_unique_email",
        after: "validate_email",
        on: ["save"],
      }),
      // downcase_email — engine: account-fields.ts:71-74 (normalizeEmail:
      // downcase, then validate_email's strip).
      engineOwnedEvent({ event: "downcase_email", at: "prepare_to_validate", on: ["save"] }),
    ],
  },
  {
    // set/right/password.rb:53-55 view :raw (base, returns t :account_
    // encrypted — en.yml:6 "encrypted") + :81-95 html block (view :core
    // wrap: :em renders raw; helper methods input_type/autocomplete?).
    // surfaces-batch3: BOTH views ported (the visible half of every
    // password field — a labeled render shows the "encrypted" stand-in,
    // never the hash).
    // The THIRD view ported, :input — the one the
    // `input_type :password` override (:86-88) routes the editor to, and the
    // one whose absence let the PBKDF2 digest reach the page. See
    // passwordInputView for the byte derivation and the Rails
    // value-always-nil mechanism. Still unported: the `autocomplete?`
    // helper (password.rb:90-94), whose only arm beyond "off" is a HACK for
    // the *signin form.
    // Events (set-module event 2026-10-08): the four password events run in
    // account-fields.ts passwordErrors (account-fields.ts:56-69 — the
    // validate_password_length arm at :59; validate_password_chars over
    // PASSWORD_REGEX :31 + PASSWORD_REQUIREMENTS :40 + REQUIREMENT_LABEL
    // :45, consumed at :60) and encryptPassword (account-fields.ts:80-83,
    // encrypt_password, Auth.encrypt); validate_password_present (blank
    // update aborts) is card-action-engine.ts:3116-3119 (a blank +*password
    // update stores nothing; the event's own doc is the passwordFieldContent
    // block at :1715-1722) and first-run-setup.ts:470-477 (the setup form's
    // password_blank arm).
    // Ruby :3 `assign_type :phrase` (merged from the tip's batch side).
    setPath: "right/password",
    assignsType: "phrase",
    events: [
      // encrypt_password — engine: account-fields.ts:80-83 (encryptPassword,
      // Auth.encrypt).
      engineOwnedEvent({
        event: "encrypt_password",
        at: "store",
        on: ["save"],
        changed: ["content"],
      }),
      // validate_password_length — engine: account-fields.ts:56-69
      // (passwordErrors; the length arm at :59).
      engineOwnedEvent({ event: "validate_password_length", at: "validate", on: ["save"] }),
      // validate_password_chars — engine: account-fields.ts:31 (PASSWORD_REGEX)
      // + :40 (PASSWORD_REQUIREMENTS) + :45 (REQUIREMENT_LABEL), consumed by
      // passwordErrors at :60.
      engineOwnedEvent({ event: "validate_password_chars", at: "validate", on: ["save"] }),
      // validate_password_present — engine: card-action-engine.ts:3116-3119
      // (a blank +*password update stores nothing) + first-run-setup.ts:470-477
      // (the setup form's password_blank arm).
      engineOwnedEvent({
        event: "validate_password_present",
        at: "prepare_to_validate",
        on: ["update"],
      }),
    ],
    formats: {
      html: {
        views: [
          { view: "raw", viewFn: passwordRawView },
          { view: "core", viewFn: passwordCoreView },
          // right/password.rb:86-88 def input_type: :password + the
          // all/password_input set module's password_input (the haml
          // password_field + the toggle-password span) - the editor the
          // account form's +*password field renders. The bytes are the
          // live-oracle probe receipt (tmp/int/probe-password-input.rb):
          // class "d0-card-content _pw-input form-control", placeholder
          // "Password", autocomplete "off", type password, and the
          // visibility_off icon span.
          { view: "input", viewFn: passwordInputView },
        ],
      },
    },
  },
  { setPath: "right/roles" },
  {
    // set/right/salt.rb:13-15 view :raw (base, returns t :account_private_
    // data). :3 `assign_type :phrase`.
    setPath: "right/salt",
    assignsType: "phrase",
    formats: {
      base: {
        views: [{ view: "raw", viewFn: saltRawView }],
      },
    },
  },
  {
    // set/right/status.rb:6-10 html format input_type method override.
    // No ported views. :4 `assign_type :phrase`.
    setPath: "right/status",
    assignsType: "phrase",
  },
  // pattern: self
  { setPath: "self/anonymous" },
  { setPath: "self/decko_bot" },
  { setPath: "self/role" },
  {
    // set/self/signin.rb:114-203 format :html do block - :before :core,
    // :core (template :haml), :open, :title, :open_content,
    // :one_line_content, :reset_password_success, :edit, :edit_buttons
    // + helper methods. Ported: :core (signin.rb:119-125, the sign-in
    // form — the edge signin form fix 2026-10-03; without it the
    // /*signin titled body rendered the card's EMPTY RichText content and
    // the edge cached the heading-only page), open_content (the
    // _render_core delegation - delegates to :core via
    // ctx.fmt.renderView("core")) and one_line_content (the empty body).
    // Events (set-module event 2026-10-08): the four signin events run in
    // src/card/auth/signin.ts — authenticateAccount (signin.ts:278) with the
    // authenticate_or_abort error ladder (signin.ts:284) is the signin
    // event's body (signin.rb:10-12); signin_success (signin.ts:415-421 —
    // abort after success, no row write: the only write is the session row)
    // and signout (signin.ts:460-475, the reset_session surface at :462 —
    // Auth.signin Anonymous + Env.reset_session + abort) are the same
    // module's flow; send_reset_password_token (:27-31) is
    // account-verify-reset-flows.ts sendResetPasswordToken (the request
    // arm: blank/unknown/inactive email ladders).
    setPath: "self/signin",
    events: [
      // signin.rb:27-31 `event :send_reset_password_token, before:
      // :signin, on: :update, trigger: :required` — Ruby's before: keeps
      // @stage nil (options.rb:76) and hangs the event on signin's
      // callback chain (set/event/callbacks.rb:14-21); the event's stage
      // IS signin's (:validate), which the dispatcher resolves by name.
      engineOwnedEvent({
        event: "send_reset_password_token",
        before: "signin",
        on: ["update"],
        trigger: "required",
      }),
      // signin — engine: signin.ts:278 (authenticateAccount; the
      // authenticate_or_abort error ladder at :284).
      engineOwnedEvent({ event: "signin", at: "validate", on: ["update"] }),
      // signin_success — engine: signin.ts:415-421 (the signinAccount doc:
      // "signin_success aborts the save", so no card row and no act is
      // written).
      engineOwnedEvent({ event: "signin_success", after: "signin" }),
      // signout — engine: signin.ts:460-475 (signoutAccount; the
      // reset_session surface at :462).
      engineOwnedEvent({ event: "signout", at: "validate", on: ["delete"] }),
    ],
    formats: {
      html: {
        views: [
          { view: "core", viewFn: (ctx) => signinCoreHtml(ctx), config: { cache: "never" } },
          { view: "open_content", viewFn: openContentView },
          { view: "one_line_content", viewFn: oneLineContentView },
          { view: "reset_password_success", viewFn: resetPasswordSuccessView },
          { view: "edit_buttons", viewFn: signinEditButtonsView },
          // Wave-1 (2026-10-03): :edit joins - the FORGOT-PASSWORD form's
          // voo contract (title "Forgot Password", the +email edit_
          // structure tuple, hide help) + the superView dispatch to the
          // edit mod's editView. The consuming-side edit_structure gap is
          // the edit mod's disclosed remainder (the view body's comment).
          { view: "edit", viewFn: signinEditView },
        ],
      },
    },
  },
  // pattern: type
  {
    // set/type/role.rb:7-37 format :html do block - :link_with_checkbox,
    // :configs + helper role_checkbox/related_by_content_items. The :configs
    // body (roleConfigsView) lives in core-mod.ts next to the all/admin.rb
    // machinery it drives; the flat HTML_VIEWS registry carries the SAME fn
    // so the mod-less graded harness dispatches identical bytes.
    // Not ported: rails (card_form, check_box_tag, list_section).
    setPath: "type/role",
    formats: {
      html: {
        views: [
          { view: "link_with_checkbox", viewFn: linkWithCheckboxView, config: { cache: "never" } },
          { view: "configs", viewFn: roleConfigsView },
        ],
      },
    },
  },
  {
    // set/type/signup.rb + set/type/signup/views.rb, Type::Signup. Ruby keys
    // the module by the type card's codename (signup), not by its name
    // ("Sign up", set-key token TYPE-sign_up); the chain walker resolves the
    // token through that codename (set-keys-to-modules.ts
    // anchoredModuleCandidates). The views themselves, :core included, live
    // on the nested views module below, where Ruby defines them (a token
    // whose own module lacks the view expands to the modules nested under
    // it).
    setPath: "type/signup",
    // Events (set-module event 2026-10-08; signup.rb:20-38). Engine
    // ownership: the approval ladder is account-verify-reset-flows.ts —
    // auto_approve_with_verification (:20-22, when: :can_approve?) runs on
    // the CREATE path (request_verification: +*status "unverified" +
    // trigger send_verification_email, account-verify-reset-flows.ts:630-645
    // — the doc block names the event at :632);
    // approve_without_verification (signup.rb:28-35, trigger: :required)
    // rides the same activate_account + send_welcome_email machinery
    // (account-verify-reset-flows.ts:675-681 — the doc names the event at
    // :680); can_approve? itself is card-action-engine.ts:1753-1755
    // canCreateDefaultAccountedType (the engineEventCardState answer at
    // :4586-4597).
    events: [
      engineOwnedEvent({
        event: "auto_approve_with_verification",
        at: "validate",
        on: ["create"],
        when: "can_approve?",
      }),
      // signup.rb:24-34 (the UPDATE approval pair), trigger: :required —
      // STUB, named remainder: NOT engine-owned. The audit's cited ranges
      // (account-verify-reset-flows.ts:674-678, 992) implement neither this
      // event nor its sibling, and no engine event body implements the
      // trigger: the behavior the port has lives at the ROUTE layer
      // (src/server/write-routes.ts:1987-1993 dispatches the trigger;
      // approveSignup :2597-2637 writes +*status "unverified" and sends the
      // verification token) — route-layer work, not the engine's event
      // machinery, so there is no engine owner to cite.
      event({
        event: "approve_with_verification",
        at: "validate",
        on: ["update"],
        trigger: "required",
      }),
      // approve_without_verification — engine:
      // account-verify-reset-flows.ts:680 (the sendAccountWelcomeEmail doc
      // names the event; the welcome-email delivery the approval fires).
      engineOwnedEvent({
        event: "approve_without_verification",
        at: "validate",
        on: ["update"],
        trigger: "required",
      }),
      // signup.rb:36-38 — STUB, named remainder: Ruby switches the acting
      // session to the freshly created id for the integrate stage
      // (Auth.current_id = id, "needs justification!" per the gem). The
      // port's save path has no mid-act actor switch; the engine's actor
      // model is fixed per engine instance (card-action-engine.ts Actor).
      event({ event: "act_as_current_for_integrate_stage", at: "integrate", on: ["create"] }),
    ],
  },
  {
    // set/type/signup/views.rb — the NESTED child file (Ruby's SetTemplate
    // nests its contents INTO Type::Signup, set_template.rb:11-19), reached
    // through the nested expansion under the codename path "type/signup".
    // Registration-only
    // entry (the basket completeness pin "every set module from the gem
    // tree is in the basket"); its views are the signup FORM family and
    // stay the honest rails remainder named on the parent entry: view :new
    // (cache: :never, the invitation?-branch title), :content_formgroups
    // (account_formgroups + multi_card_editor), :new_buttons
    // (standard_create_button + invite_button), :core haml override (the
    // signup_line + account_lines template that would shadow the R17
    // ported core). the second surfaces batch, 2026-09-30.
    // Wave-1 (2026-10-03): :new + :new_buttons join - the title composition
    // (the invitation arm the disclosed admin-approval basis leaves
    // unreachable) + superView to the edit mod's live :new, and the
    // create-button formgroup (the invite_button arm nil signed-out).
    // mod-completion-100 (2026-10-03): :content_formgroups joins - the
    // account_formgroups subformat dispatch (structure: true rides the nest
    // opts; the +*account card's own registration carries the before hook)
    // over the signup card's empty multi_card_editor? arm; the walk itself
    // lives on the edit mod's contentFormgroupsView (the explicit
    // edit_structure arm this pass ported there). The oracle:
    // account-walk-views.rb signup_content_formgroups_walk.
    setPath: "type/signup/views",
    formats: {
      html: {
        views: [
          { view: "new", viewFn: signupNewView, config: { cache: "never" } },
          { view: "new_buttons", viewFn: signupNewButtonsView, config: { cache: "never" } },
          { view: "content_formgroups", viewFn: signupContentFormgroupsView },
          // views.rb:27-29 view :core, template: :haml, cache: :never
          // (core.haml: the invite-links div + signup_line + processed raw
          // body; see signupCoreView). Ruby defines it in this nested file,
          // so Type::Signup::Views owns it.
          { view: "core", viewFn: (ctx) => signupCoreHtml(ctx) },
        ],
      },
    },
  },
  {
    // set/type/user.rb:7-48 format :html do block - view :setup
    // (unknown: true, perms: :needs_setup?, cache: :never) + helpers.
    // NOT PORTED (the named remainder, wave-1 recorded result): the view is
    // double-gated - perms :needs_setup? is a DECK-STATE census predicate
    // (Card::Auth.needs_setup? = zero non-shipped +*account junctions) the
    // sync view gate cannot answer without a prepared census verdict seam,
    // mod-completion-100 (2026-10-03): :setup joins - the body rides the
    // edit mod's real machinery (name_formgroup render, the account
    // formgroups walk through the nest machinery under with_nest_mode
    // :edit, the frame_and_form shell) and the PERMS GATE reads the
    // PREPARED census verdict (first-run-setup-verdict-seam.ts;
    // setupWindowState in first-run-setup.ts is the census's port - the
    // route/bootstrap hand it to the sync gate). The oracle:
    // account-walk-views.rb setup_voo_and_form_chain + needs_setup_predicate.
    setPath: "type/user",
    // The first-user setup runs in auth/first-run-setup.ts.
    events: [
      engineOwnedEvent({ event: "check_setup", before: "check_permissions", on: ["create"], trigger: "required" }),
      engineOwnedEvent({ event: "setup_first_user", at: "finalize", on: ["create"], when: "setup?" }),
      // type/user.rb:66-68, when: :setup? — STUB, named remainder: the port
      // DECLINES the event. The setup journey ends by redirecting to the
      // sign-in surface rather than auto-signing-in
      // (first-run-setup.ts:618-622; SIGN_IN_PATH :874, the result's
      // signInAt :816), and the event name appears nowhere in src/ but the
      // header's Ruby note (first-run-setup.ts:27) and this declaration — no
      // engine implementation exists, so there is no engine owner to cite.
      event({
        event: "signin_after_setup",
        at: "integrate",
        on: ["create"],
        when: "setup?",
      }),
    ],
    formats: {
      html: {
        views: [{ view: "setup", viewFn: setupView, config: { cache: "never", unknown: true, perms: "needs_setup" } }],
      },
    },
  },
  // pattern: type_plus_right
  { setPath: "type_plus_right/cardtype/account" },
  {
    // set/type_plus_right/role/members.rb:1-7 include_set Abstract::IdList,
    // assign_type :list, event :update_role_cache. No views.
    // Event (set-module event 2026-10-08) — STUB with an engine-architecture
    // reason, not an omission: Ruby's body refreshes a CACHE
    // (Self::Role.update_rolehash(left.id, item_ids), members.rb:5-7) that
    // read-time permission checks consult. The port derives the role lists
    // from the reference rows FRESH at every read
    // (permissions/read-rules.ts:245-265 — role_ids_from_role_member_cards
    // reads the same rows generate_rolehash would) — there is no cache to
    // refresh, so the event has no behavior to run. The declaration records
    // Ruby's set membership + metadata (plain stub - NOT engineOwnedEvent:
    // no engine code implements it; the architecture makes it moot).
    setPath: "type_plus_right/role/members",
    events: [event({ event: "update_role_cache", at: "finalize" })],
  },
  {
    // set/type_plus_right/user/email.rb:1-17 def virtual? + view :raw
    // + content_email/account_email helpers. Ported: :raw (the virtual?
    // /content_email two-branch fallback).
    setPath: "type_plus_right/user/email",
    formats: {
      html: {
        views: [{ view: "raw", viewFn: userEmailRawView }],
      },
    },
  },
];

/** The account mod's `when:` predicates, reached by Ruby's `send`
 *  (set/event/all.rb:82). Each cites the Ruby source it is ported from.
 *
 *  - can_approve? is resolved by the engine (card-action-engine.ts
 *    engineEventCardState), which already answers it for signup's own arm.
 *  - setup? is the act's @setup_approved flag on the User card the signup
 *    flow just created (type/user.rb:53, predicate at :72).
 *  - current_account? / password_redirect? read the account id the save is
 *    on against Auth.current_id (abstract/account_holder.rb:23,
 *    right/account/events.rb:83). */
export const accountModEventPredicates = {
  /** can_approve? (set/type/signup.rb:12-14): the actor may create a card
   *  of the default accounted type. */
  "can_approve?": (card: ModEventCard): boolean => card.canApprove === true,
  /** setup? (set/type/user.rb:72): `@setup_approved == true` — this User
   *  card was created through the signup/setup flow. Gates
   *  :setup_first_user (:59) and :signin_after_setup (:66). */
  "setup?": (card: ModEventCard): boolean => card.setupApproved === true,
  /** current_account? (set/abstract/account_holder.rb:23): `id &&
   *  Auth.current_id == id`. Gates :signout_upon_delete
   *  (right/account/events.rb:49). */
  "current_account?": (card: ModEventCard): boolean =>
    card.id !== undefined &&
    card.authCurrentId !== null &&
    card.authCurrentId !== undefined &&
    card.id === card.authCurrentId,
  /** password_redirect? (right/account/events.rb:83): `Auth.current_id ==
   *  accounted_id && password.blank?` — the signed-in holder of this
   *  account has no password set, i.e. the invitation/password-setup
   *  redirect. Gates :password_redirect (:26). */
  "password_redirect?": (card: ModEventCard): boolean =>
    card.authCurrentId !== null &&
    card.authCurrentId !== undefined &&
    card.id !== undefined &&
    card.id === card.authCurrentId &&
    (card.password ?? "") === "",
} as const;

const cardModAccount: DeckoModManifest = {
  name: "account",
  gemName: "card-mod-account",
  group: "gem",
  setModules,
};

export default cardModAccount;
