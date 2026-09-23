// The card-mod-account gem (card-mod-account-0.20.0), ported through the
// mod loader - the mod that adds user accounts, signin, signup, the +*account
// cardtype, password reset, and the related closure lifecycle.
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
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
//   Card.config.token_expiry / 1.day, default 7; verified_days /
//   reset_password_days are aliases per views.rb:18-20)
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
// NOT ported (honest remainder, with one-word reasons):
// - signin core/edit/edit_buttons/open/title/reset_password_success:
//   rails (forms, nest_mode, card_form, haml :core)
// - signup new/new_buttons/content_formgroups/core: rails (card_form,
//   multi_card_editor, haml :core, settings :title mutations)
// - right/account closure/verify_url/reset_password_url/token_expiry:
//   rails (Auth::Token.encode, card_url, path, haml :closure,
//   ok?-predicate perms directives)
// - right/password core/raw: rails (input_type/form autocomplete;
//   raw returns i18n :account_encrypted)
// - right/salt raw: rails (i18n :account_private_data)
// - right/role cql_content: rails (search-type cql dispatch)
// - abstract/account_holder account_tab/configs/account_details_items:
//   rails (board_pill_sections, Auth.as_bot, all_admin_configs_grouped_by)
// - user setup: rails (needs_setup?, Auth.as_bot, frame_and_form)
// - type/role link_with_checkbox/configs: rails (card_form,
//   check_box_tag, all_admin_configs_grouped_by, list_section)
// - 30 events (validate_email, encrypt_password, reset_password,
//   signin, signout, generate_token, set_stamper, update_role_cache,
//   etc.): rails (event machinery, Env.params, Auth, SecureRandom,
//   Card.cache, validate/store/integrate/finalize phases)
// - lib/card/mod/account.rb (Cardio::Railtie.config password keys +
//   6 HAML templates): rails (config surface, haml asset pipeline)
// - assets/script/toggle_visibility.js.coffee + assets/style/account.scss:
//   rails (coffee/scss asset pipeline)

import type { ViewContext, ViewFn } from "../../render/format.js";
import type {
  DeckoModManifest,
  ModSetModuleFile,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// view bodies (Ruby source cited per block)
// ---------------------------------------------------------------------------

/** set/right/account/views.rb:14-16 view :token_days, denial: :blank:
 *  `Card.config.token_expiry / 1.day`. decko's default token expiry is 7
 *  days (card-mod-account.rb does not set it; the bootstrap mod sets it
 *  per deployment - src/server/** has no token_expiry seam, so this port
 *  pins the documented decko default). The integer renders as a string
 *  (Ruby's Integer#to_s). */
function tokenDaysValue(): string {
  return "7";
}

/** set/right/account/views.rb:14-16 base body - the integer-as-string. */
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
 *  1.day - the decko default 7. The HTML wrap is the literal string the
 *  HAML inline block emits. The base block's token_expiry (views.rb:10-12,
 *  `"(#{token_expiry_sentence}"`) is NOT registered here: HTML dispatch
 *  wins, and the base block's content is the rubric for non-html formats
 *  we don't model. */
const tokenExpiryView: ViewFn = () =>
  "<p><em>Link will expire in 7 days</em></p>";

/** set/self/signin.rb:139-142 view :open_content (html block): literally
 *  `_render_core` - the html format's `_render_<view>` machinery
 *  (mod/format.rb#render_view) delegates to the requested view in this
 *  format. The TS equivalent is ctx.fmt.renderView("core"). The Ruby
 *  comment ("annoying step designed to avoid table of contents. sigh") is
 *  the bug-bridge for the set-based TOC walk; the bytes are the ones
 *  _render_core would have returned, which on *signin is the plain
 *  processContent(renderRaw) path (no Search/pointer/list/set/Date/CodeRay
 *  branch fires for typeId: 14 settings). */
const openContentView: ViewFn = (ctx) => ctx.fmt.renderView("core");

/** set/self/signin.rb:144-146 view :one_line_content: literally `""`. The
 *  no-wrap config means the body renders bare (no slot wrapper); the
 *  empty body returns the empty string. */
const oneLineContentView: ViewFn = () => "";

/** set/abstract/account_holder.rb:126 view :closed_account, template:
 *  :haml, served by set/abstract/closed_account.haml:
 *  ```
 *  %h2 Account Closed
 *  %p
 *    The sign-in account once associated with this card has been removed, the card
 *    has been anonymized, and its data fields have been deleted.
 *  ```
 *  HAML block-tag emission: `%h2 X` -> `<h2>X</h2>` with a trailing
 *  newline, then `%p` with whitespace-stripped text -> `<p>TEXT</p>`. The
 *  view renders bare (no slot wrap) - account_holder.rb:125 opens the
 *  `format :html do` block but carries no `wrap:` config on this view. */
const closedAccountView: ViewFn = () =>
  "<h2>Account Closed</h2>\n" +
  "<p>The sign-in account once associated with this card has been removed, " +
  "the card has been anonymized, and its data fields have been deleted.</p>";

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

// ---------------------------------------------------------------------------
// the manifest
// ---------------------------------------------------------------------------

/** The mod's set module file list, paths as in the gem tree. Files with
 *  no ported view still get an entry so the basket records their
 *  existence (loader.ts#registerSetModule: every setModules entry
 *  contributes one RegisteredSetModule to the basket regardless of its
 *  format blocks). */
const setModules: ModSetModuleFile[] = [
  // pattern: all (loader.rb#parts_from_path: "all/foo" -> "All::Foo")
  { setPath: "all/account" },
  { setPath: "all/password_input" },
  // pattern: abstract
  { setPath: "abstract/account_field" },
  {
    // set/abstract/account_holder.rb:125-170 format :html do block -
    // :closed_account (port), :account_tab (not ported: rails),
    // :show_account_tab?/:account_formgroups/:account_details_items/
    // :account_content_items/:default_board_tab (helpers, not views)
    setPath: "abstract/account_holder",
    formats: {
      html: {
        views: [{ view: "closed_account", viewFn: closedAccountView }],
      },
    },
  },
  // pattern: right
  { setPath: "right/account" },
  { setPath: "right/account/events" },
  {
    // set/right/account/views.rb:1-47 base block (verify_url,
    // reset_password_url, token_expiry, token_days + verify_days/
    // reset_password_days aliases, closure) + :49-68 html block
    // (core + before :content_formgroups + token_expiry html override).
    // Ported: token_days + its two deprecated aliases, plus the html
    // block's token_expiry (the literal HTML string).
    setPath: "right/account/views",
    formats: {
      html: {
        views: [
          { view: "token_days", viewFn: tokenDaysView },
          { view: "verify_days", viewFn: verifyDaysView },
          { view: "reset_password_days", viewFn: resetPasswordDaysView },
          { view: "token_expiry", viewFn: tokenExpiryView },
        ],
      },
    },
  },
  { setPath: "right/email" },
  {
    // set/right/password.rb:53-55 view :raw (base, returns t :account_
    // encrypted) + :81-95 html block (view :core wrap: :em renders raw,
    // helper methods input_type/autocomplete?). Not ported: rails.
    setPath: "right/password",
  },
  { setPath: "right/roles" },
  {
    // set/right/salt.rb:13-15 view :raw (base, returns t :account_private_
    // data). Not ported: rails i18n.
    setPath: "right/salt",
  },
  {
    // set/right/status.rb:6-10 html format input_type method override.
    // No ported views.
    setPath: "right/status",
  },
  // pattern: self
  { setPath: "self/anonymous" },
  { setPath: "self/decko_bot" },
  { setPath: "self/role" },
  {
    // set/self/signin.rb:114-203 format :html do block - :before :core,
    // :core (template :haml), :open, :title, :open_content,
    // :one_line_content, :reset_password_success, :edit, :edit_buttons
    // + helper methods. Ported: open_content (the _render_core
    // delegation - delegates to :core via ctx.fmt.renderView("core"))
    // and one_line_content (the empty body).
    setPath: "self/signin",
    formats: {
      html: {
        views: [
          { view: "open_content", viewFn: openContentView },
          { view: "one_line_content", viewFn: oneLineContentView },
        ],
      },
    },
  },
  // pattern: type
  {
    // set/type/role.rb:7-37 format :html do block - :link_with_checkbox,
    // :configs + helper role_checkbox/related_by_content_items. Not
    // ported: rails (card_form, check_box_tag, list_section).
    setPath: "type/role",
  },
  { setPath: "type/signup" },
  {
    // set/type/signup/views.rb:1-99 format :html do block - :new,
    // :content_formgroups, :new_buttons, :core + helpers. Not ported:
    // rails.
    setPath: "type/signup/views",
  },
  {
    // set/type/user.rb:7-48 format :html do block - view :setup
    // (unknown: true, perms: :needs_setup?, cache: :never) + helpers.
    // Not ported: rails.
    setPath: "type/user",
  },
  // pattern: type_plus_right
  { setPath: "type_plus_right/cardtype/account" },
  {
    // set/type_plus_right/role/members.rb:1-7 include_set Abstract::IdList,
    // assign_type :list, event :update_role_cache. No views.
    setPath: "type_plus_right/role/members",
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

const cardModAccount: DeckoModManifest = {
  name: "account",
  gemName: "card-mod-account",
  group: "gem",
  setModules,
};

export default cardModAccount;
