// The card-mod-follow gem (card-mod-follow-0.20.0), ported through the
// mod loader. The follow mod is large (32 set rb files + 2 HAML templates
// + 2 lib files) and overwhelmingly Rails-runtime: the notification
// pipeline (set/all/notify.rb events: silence_notifications,
// notify_followers_after_save, stash_followers,
// notify_followers_after_delete) drives Card::Director + ActiveJob
// (delayed_job's integrate_with_delay hook) + ActionMailer's deliver;
// the follower_stash walks the search-index for nested includes
// (Card.search included_by: card.name); the follow rule walk uses
// Card.search + Rule.preference; the follow_item / follow_status /
// follow_button / follow_editor views drive card_form / haml /
// link_to_card / submit_button / hidden_tags / nest. None of those
// surfaces live in a headless render engine.
//
// Ported here the views whose bodies do NOT depend on Rails-runtime and
// whose semantics can be reproduced with the TS render surface: the two
// literal-string `one_line_content` overrides, the `core` super()-passthrough
// on followers, the `edit` re-dispatch on User+follow, the literal-HTML
// status alerts on following, the literal confirm_update_all warning on
// the deprecated follow_defaults editor, and the two setting_opts
// registrations. Every set module from the gem tree is listed so the
// basket records the full gem structure (registrar.rb's source_location
// walk).
//
// Ported (8 of 12 mod-specific html views):
// - right/followers.rb:14 view :core, cache: :never - super() passthrough
//   to the format's base :core view; cache: :never so per-render
//   follower counts stay current (right/followers.rb:13).
// - right/following.rb:13-22 view :status - literal HTML alert divs.
//   The `if rcard = current_follow_rule_card` branch walks
//   card.left.preference :follow + rcard.item_cards.map { item.title }
//   (preference.rb + item_cards), both Rails-runtime; in the headless
//   port `current_follow_rule_card` is undefined (no preference walk),
//   so the view emits the literal `"No following preference"` fallback.
// - right/following.rb:24-26 view :one_line_content - `""`. Empty string.
// - type_plus_right/user/follow.rb:23-25 view :one_line_content - `""`.
//   Empty string. (Two one_line_content overrides; each renders the same
//   empty body for its respective set module.)
// - type_plus_right/user/follow.rb:27-29 view :edit - render :open.
//   Single-line dispatch to the :open view (the type_plus_right anchor
//   surfaces the open content for the dashboard's edit link).
// - self/follow_defaults.rb:24-30 view :confirm_update_all - haml
//   literal: an `<div class="alert alert-info">` wrapping an h1 + p.
//   The alert helper adds the class chain (alert alert-info); the
//   `wrap do X end` is `<div>X</div>` (voo_api.rb:167-177). Inlined
//   to a literal `<div class="alert alert-info"><h1>...</h1><p>...</p>
//   </div>` (no Rails view helper to call).
// - self/follow.rb setting_opts - the *follow setting (group :other,
//   position 7, preference: true). Setting registry surfaces it as a
//   preference (mod-registrar.ts SettingRegistry.preferenceIs).
// - self/follow_fields.rb setting_opts - the *follow_fields setting
//   (group :other, position 5, rule_type_editable: false).
//
// Setting registration (2 of 2):
// - set/self/follow.rb:1 setting_opts group: :other, position: 7,
//   rule_type_editable: false, preference: true. Ported.
// - set/self/follow_fields.rb:1 setting_opts group: :other, position: 5,
//   rule_type_editable: false. Ported.
//
// NOT ported (honest remainder, see viewsMissing):
// - all/follow.rb + the all/follow/* helpers (followed_by, follower_ids,
//   follow_link, follow_link_views, start_follow_link, stop_follow_link):
//   follow_link_class is a Rails-runtime helper (link_to, link_opts,
//   path, modal_link, render_link_text, FollowLink class with
//   :data-update-foreign-slot, :data-bs-toggle, :data-bs-target modal);
//   followed_by walks the indirect follow graph through the left card
//   chain + follow_fields rule lookup; follower_ids caches via
//   Card.cache (Rails.cache); follow_link_views's :follow_button +
//   format :json :follow_status both build link_to with rails path
//   helpers. The card-mod-comment super()-passthrough and the
//   card-mod-edit :template_nest else-branch show how the
//   link_to_card / path helpers would slot in if the live runtime
//   surfaces were ported.
// - all/notify.rb events (silence_notifications, notify_followers_
//   after_save, stash_followers, notify_followers_after_delete) +
//   FollowerStash (lib/card/follower_stash.rb): all write-path /
//   notification-path code. The headless render engine has no save
//   path; follower lookup would need Card.search included_by: walks.
// - all/notify/base_views.rb + html_views.rb views (:list_of_changes,
//   :subedits, :subedit_notice, :followed, :follower, :last_action_verb,
//   :unfollow_url): follow notification email template (data/real.yml
//   "follower notification email") walks active_notice inherited from
//   the email format, which is not ported; :unfollow_url calls card_url
//   (Rails URL helper); :followed calls Card.fetch + follow_option_card.
// - right/account.rb send_change_notice: deliver email through
//   follower_notification_email template + Auth.as; rails-runtime
//   (ActionMailer, Auth.as scope).
// - right/contextual_class.rb + right/disappear.rb + right/message.rb:
//   card_reader for the contextual_class/disappear/message settings the
//   notification_template format :html do block reads (alert_class,
//   disappear?, mformat.contextual_content). These are settings surface
//   methods used by the email template - not render views themselves.
// - right/follow.rb view :follow_status, :follow_item + form helpers
//   (card_form, hidden_tags, follow_item_button/link, link_to_card) +
//   permit/ok_to_update?/ok_to_create? permission gates. The haml
//   follow_status.haml template renders the link_to_card + button_tag
//   combo (rails-runtime).
// - right/follow_fields.rb event :follow_fields_changed - write path
//   (integrate phase); not exercised by the render surface.
// - self/always.rb + self/created.rb + self/edited.rb + self/never.rb
//   (Abstract::FollowOption subclasses): follow_opts + follow_test +
//   follower_candidate_ids block registrations. These are CLASS-side
//   helpers that build the @options hash in lib/card/follow_option.rb;
//   no view registrations and the class-side state is the
//   lib/card/follow_option.rb registry which the headless port does
//   not consume.
// - self/follow_defaults.rb (DEPRECATED) views :edit_buttons (calls
//   render_confirm_update_all + button_formgroup + 3 submit buttons -
//   rails-runtime). The :confirm_update_all view is ported (above).
// - type/cardtype.rb + type/notification_template.rb + type/set.rb +
//   type/user.rb: methods (follow_label, follow_set_card, list_direct_
//   followers?, directly_followed_by?, follow_rule_name) + format
//   :html do blocks (related_by_type_items, alert_message) + event
//   :cache_expired_for_new_set. The cardtype / set methods are
//   consumed by the follow_rule walk + the cardtype-typed follow_link
//   (rails-runtime); the notification_template format :html do block
//   drives the email template alert_message (write path).
// - type_plus_right/user/follow.rb view :core, :follow_tab, :ignore_tab,
//   :errors + all the following_rules_and_options / ignore_rules /
//   rules_and_options_by_set_pattern / a_set_pattern_hash / merge_
//   option_hashes / current_following_rule_options_hash / suggested_
//   following_rule_options_hash / valid_set_card helpers + the
//   follow_editor.haml template + the type_plus_right set module's
//   pointer item_names override. The whole tab structure depends on
//   Card::Rule.preference_names + Card.suggestions + tabs helper +
//   subformat(rule_card).follow_item (rails-runtime).
// - assets/script/follow.js.coffee + assets/style/follow.scss:
//   stylesheet and JS asset mods - separate surface.
// - data/real.yml:1-50 seed cards (*follow, *following, *followers,
//   *follow fields, *always, *never, *follow defaults, follow
//   suggestions, *contextual class, *message, *disappear, follower
//   notification email + the *all+*follow_fields=nests junction +
//   the email template's from/subject/html_message/text_message
//   fields): the test stream seeds its own codename cards; the email
//   template is a write-path surface.

import type { ViewContext, ViewFn } from "../../render/format.js";
import { HTML_VIEWS } from "../../render/views.js";
import type {
  DeckoModManifest,
  ModSetModuleFile,
} from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// captured base views - the "super()" references Ruby's set-module DSL
// walks up the include chain to find. The TS mod loader replaces the entry
// in HTML_VIEWS when the mod loads (registrar.ts ViewRegistrationTable:
// undo.set(view, this.views[view]) preserves the original, then
// this.views[view] = newView); the references below were captured BEFORE
// any mod loaded, so they always point at the original core view body.
// ---------------------------------------------------------------------------

const BASE_CORE: ViewFn | undefined = HTML_VIEWS["core"];

// ---------------------------------------------------------------------------
// set/right/followers.rb:13-15 view :core, cache: :never do super() end.
//
// include_set Abstract::List - the list surface (item_names from
// left.follow_set_card.prototype.follower_names, content from
// left ? item_names.to_pointer_content : ""). For the headless port
// the body is the literal super() passthrough: the base :core view
// renders the card's content verbatim (it does not call item_names /
// followers - those are method definitions, not view bodies). The
// cache: :never config prevents a per-card follower-count cache hit
// from going stale; the TS render layer does not implement cache: :never
// directly (the cache layer is another stream), but the view-config
// table records the option for the eventual cache-layer integration.
// ---------------------------------------------------------------------------

const followersCoreView: ViewFn = (ctx) => {
  if (BASE_CORE === undefined) return "";
  return BASE_CORE(ctx);
};

// ---------------------------------------------------------------------------
// set/right/following.rb:13-22 view :status.
//
// The view's body branches on current_follow_rule_card (card.left.preference
// :follow). That helper walks Rule.preference (lib/card/rule/preference.rb
// -> Card.search type: :list, left: card.left.id) - a search-index call
// that the headless render engine does not make. The branch produces
// alert divs for every followed option on the rule card:
//
//   <div class="alert alert-success" role="alert">
//     <strong>#{rcard.rule_set.follow_label}</strong>: #{item.title}
//    </div>
//
// In the headless port, current_follow_rule_card is undefined (no
// preference walk), so the view emits the literal "No following
// preference" fallback the same way Ruby's else branch does. This is
// the byte shape an unfollowed card renders at the :status view; the
// rule-present branch is honest remainder (Rails-runtime).
// ---------------------------------------------------------------------------

const followingStatusView: ViewFn = () => "No following preference";

// ---------------------------------------------------------------------------
// set/right/following.rb:24-26 view :one_line_content do "" end.
//
// Two-line empty override - the standard "hide the content on this card"
// idiom. The one_line_content view is rendered as the :content slot's
// single-line content variant (slot-html.ts#slotOptions: view="content"
// inside a list-type card renders the one_line_content variant); the
// +*following card is a virtual pointer whose content is dynamic, and
// the empty string makes the pointer show its items without a body line.
// ---------------------------------------------------------------------------

const followingOneLineContentView: ViewFn = () => "";

// ---------------------------------------------------------------------------
// set/type_plus_right/user/follow.rb:23-25 view :one_line_content do "" end.
//
// Empty override for the [User]+*follow card - same idiom as the
// following card (a virtual pointer whose content is dynamic; the
// empty one_line_content keeps the pointer's mini_bar view from
// rendering a body line below the items).
// ---------------------------------------------------------------------------

const userFollowOneLineContentView: ViewFn = () => "";

// ---------------------------------------------------------------------------
// set/type_plus_right/user/follow.rb:27-29 view :edit do render :open end.
//
// The +*follow card is the follow dashboard for a User (a virtual
// pointer to the set of [Set]+[User]+:follow preference cards). The
// :open view renders the dashboard's tabs (Follow / Ignore) - calling
// render :open from :edit lets the dashboard's tabbed interface show
// directly through the edit slot without a separate edit form. The
// :open view dispatch is a single renderView call.
// ---------------------------------------------------------------------------

const userFollowEditView: ViewFn = ({ fmt }) => fmt.renderView("open");

// ---------------------------------------------------------------------------
// set/self/follow_defaults.rb:24-30 view :confirm_update_all.
//
// The Ruby body wraps an alert helper inside a `wrap do ... end`:
//
//   view :confirm_update_all do
//     wrap do
//       alert "info" do
//         %(
//           <h1>Are you sure you want to change the default follow rules?</h1>
//           <p>You may choose to update all existing users.
//              This may take a while. </p>
//         )
//       end
//     end
//   end
//
// `wrap do X end` is voo_api.rb:167-177 - `<div>X</div>` (no attrs).
// `alert "info" do X end` is the bootstrap alert helper (helper.rb -
// adds class "alert alert-info" to the wrapper). Inlined to a literal
// `<div class="alert alert-info"><h1>...</h1><p>...</p></div>`. The
// inner markup is the literal string the view produces (the h1 + p +
// the trailing whitespace inside the haml literal).
// ---------------------------------------------------------------------------

const confirmUpdateAllView: ViewFn = () =>
  `<div class="alert alert-info"><h1>Are you sure you want to change the default follow rules?</h1>` +
  `<p>You may choose to update all existing users.` +
  ` This may take a while. </p></div>`;

// ---------------------------------------------------------------------------
// the manifest (one entry per gem file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

/** The "passive" set-modules - files whose views are documented as
 *  not-yet-ported above. We still register them so the set-module basket
 *  reflects the gem's full set/ tree; the formats.html.views array is
 *  empty so no views are added to the live views table. */
const passiveSetModule = (setPath: string): ModSetModuleFile => ({
  setPath,
  formats: { html: { views: [] } },
});

const cardModFollow: DeckoModManifest = {
  name: "follow",
  gemName: "card-mod-follow",
  group: "gem-defaults",
  setModules: [
    // pattern: abstract (loader.rb#parts_from_path: "abstract/foo" -> "Abstract::Foo")
    {
      // card-mod-follow-0.20.0/set/abstract/follow_option.rb - the
      // Abstract::FollowOption mixin (lib/card/follow_option.rb). Defines
      // the @test, @follower_candidate_ids, @options hashes + the
      // restrictive_follow_opts / follow_opts / follow_test /
      // follower_candidate_ids class methods. The four self/follow_option
      // subclasses (always/created/edited/never) consume this mixin. No
      // views - CLASS-side state only.
      setPath: "abstract/follow_option",
      formats: { html: { views: [] } },
    },
    // pattern: all
    {
      // card-mod-follow-0.20.0/set/all/follow.rb - followable?, follow_label,
      // list_direct_followers?, follow_option?, follow_set_card,
      // follow_rule_name, follow_rule_card, follow_rule?, restrictive_option?,
      // description. Methods only, no views. The class-side ClassMethods
      // block (restrictive_follow_opts, follow_opts, follow_test,
      // follower_candidate_ids) is the @options registry hook the
      // follow_option.rb mixin uses.
      setPath: "all/follow",
      formats: { html: { views: [] } },
    },
    passiveSetModule("all/follow/followed_by"),
    passiveSetModule("all/follow/follower_ids"),
    passiveSetModule("all/follow/follow_link"),
    {
      // card-mod-follow-0.20.0/set/all/follow/follow_link_views.rb -
      // format :html do follow_button + follow_modal_link + view
      // :follow_button, cache: :never; format :json do view
      // :follow_status. The :follow_button view's body is the literal
      // link_to call on FollowLink#button (rails-runtime); the
      // :follow_status json view returns the link_opts hash. NOT
      // ported: rails-runtime (link_to, button helper, opts with
      // :data-update-foreign-slot, :data-hover-text).
      setPath: "all/follow/follow_link_views",
      formats: { html: { views: [] } },
    },
    passiveSetModule("all/follow/start_follow_link"),
    passiveSetModule("all/follow/stop_follow_link"),
    {
      // card-mod-follow-0.20.0/set/all/notify.rb - the notification event
      // hooks (silence_notifications, notify_followers_after_save,
      // stash_followers, notify_followers_after_delete) + the
      // silent_change?, notable_change?, current_act_card?, act_followers
      // methods. The events fire on the write path (save/delete); the
      // methods drive the email-delivery pipeline. NOT ported:
      // write-path (Card::Director, ActiveJob, ActionMailer).
      setPath: "all/notify",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-follow-0.20.0/set/all/notify/base_views.rb - the base
      // format's notification views (:list_of_changes, :subedits,
      // :subedit_notice, :followed, :follower, :last_action_verb,
      // :unfollow_url). All depend on the notification_act / active_notice
      // state the email format sets up. NOT ported: rails-runtime (the
      // notification email template, action walk).
      setPath: "all/notify/base_views",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-follow-0.20.0/set/all/notify/html_views.rb - format
      // :html do block: wrap_list / wrap_list_item / wrap_subedit_item
      // overrides (HTML <ul>/<li>/<li> wrappers for the notification
      // email). NOT ported: the email-template surface (write path).
      setPath: "all/notify/html_views",
      formats: { html: { views: [] } },
    },
    // pattern: right
    {
      // card-mod-follow-0.20.0/set/right/account.rb - send_change_notice,
      // changes_visible?, notify_of_act. The User+account set module's
      // format-method that drives the email-delivery pipeline through
      // Card[:follower_notification_email].deliver. NOT ported:
      // write-path (ActionMailer.deliver, Auth.as scope).
      setPath: "right/account",
      formats: { html: { views: [] } },
    },
    passiveSetModule("right/contextual_class"),
    passiveSetModule("right/disappear"),
    {
      // card-mod-follow-0.20.0/set/right/follow.rb - the [Set]+*follow
      // set module: assign_type :list, options_card, add_follow_item?,
      // ok_to_update?, ok_to_create?, raw_help_text, permit. Event
      // :cache_expired_for_new_preference. Format :html do view
      // :follow_status (haml :follow_status) + view :follow_item +
      // follow_item helper + follow_item_hidden_tags / button / icon /
      // link helpers + rule_form_args override. NOT ported:
      // rails-runtime (card_form, hidden_tags, button_tag, icon_tag,
      // link_to_card, haml :follow_status). The raw_help_text method
      // ("Get notified about changes") is consumed by the Setting
      // registry's rightRawHelpText field (setting.rb:112-114) when
      // both the Self set and the Right set define it; here the
      // method lives on the Right side and is not view-portable.
      setPath: "right/follow",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-follow-0.20.0/set/right/followers.rb - include_set
      // Abstract::List + format :html do view :core, cache: :never do
      // super() end + content method (left ? item_names.to_pointer_content
      // : "") + item_names helper (left ?
      // left.follow_set_card.prototype.follower_names : []) + virtual?.
      // Ported: :core (the literal super() passthrough).
      setPath: "right/followers",
      formats: {
        html: {
          views: [
            {
              view: "core",
              viewFn: followersCoreView,
              config: { cache: "never" },
            },
          ],
        },
      },
    },
    {
      // card-mod-follow-0.20.0/set/right/following.rb - assign_type
      // :list + virtual?. Format :html do view :core (renders
      // rule_editor if Auth.signed_in, else nests card.left.followers
      // titled with items link), view :status (literal alert divs),
      // view :one_line_content (""), view :rule_editor (subformat
      // rule_form), preference_name, edit_rule_success,
      // current_follow_rule_card helpers.
      // Ported: :status (the "No following preference" fallback) +
      // :one_line_content ("").
      setPath: "right/following",
      formats: {
        html: {
          views: [
            { view: "status", viewFn: followingStatusView },
            { view: "one_line_content", viewFn: followingOneLineContentView },
          ],
        },
      },
    },
    {
      // card-mod-follow-0.20.0/set/right/follow_fields.rb - assign_type
      // :list + event :follow_fields_changed. NOT ported: write-path
      // event + the assignment, no views.
      setPath: "right/follow_fields",
      formats: { html: { views: [] } },
    },
    passiveSetModule("right/message"),
    // pattern: self
    {
      // card-mod-follow-0.20.0/set/self/always.rb - includes
      // Abstract::FollowOption + follow_opts position: 2 +
      // follow_test { |_follower_id, _accounted_ids| true } + title
      // ("Following") + label ("follow"). Class-side registration only.
      setPath: "self/always",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-follow-0.20.0/set/self/created.rb - includes + restrictive_
      // follow_opts position: 1 + follower_candidate_ids { |card| [card.
      // creator_id] } + title ("Following content you created") + label
      // ("follow if I created") + description override. Class-side.
      setPath: "self/created",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-follow-0.20.0/set/self/edited.rb - includes + restrictive_
      // follow_opts position: 2 + follower_candidate_ids { |card|
      // card.id ? Card.search(editor_of: card.id, return: :id) : [] } +
      // title + label + description. Class-side.
      setPath: "self/edited",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-follow-0.20.0/set/self/follow.rb - setting_opts
      // group: :other, position: 7, rule_type_editable: false,
      // preference: true. Ported: the setting_opts registration.
      // The preference: true flag adds the codename to the Setting
      // registry's preferences set (setting.rb:95-99); the engine's
      // SettingRegistry.preferenceIs() surfaces it.
      setPath: "self/follow",
      settingOpts: {
        group: "other",
        position: 7,
        ruleTypeEditable: false,
        preference: true,
      },
    },
    {
      // card-mod-follow-0.20.0/set/self/follow_defaults.rb (DEPRECATED).
      // Event :update_follow_rules :finalize (write-path - bulk update
      // for *all users*); follow_defaults + follow_option helpers; view
      // :edit_buttons (button_formgroup + 3 submit buttons -
      // rails-runtime) + view :confirm_update_all.
      // Ported: :confirm_update_all (the alert literal).
      setPath: "self/follow_defaults",
      formats: {
        html: {
          views: [{ view: "confirm_update_all", viewFn: confirmUpdateAllView }],
        },
      },
    },
    {
      // card-mod-follow-0.20.0/set/self/follow_fields.rb - includes
      // Abstract::FollowOption + follow_opts position: 3 + follow_test
      // { |_follower_id, _accounted_ids| false } + title ("Ignoring") +
      // label ("ignore") + setting_opts group: :other, position: 5,
      // rule_type_editable: false. Ported: the setting_opts registration.
      // The follow_opts / follow_test class-side state goes into
      // FollowOption's @options / @test hashes (lib/card/follow_option.rb)
      // which the headless port does not consume.
      setPath: "self/follow_fields",
      settingOpts: {
        group: "other",
        position: 5,
        ruleTypeEditable: false,
      },
    },
    {
      // card-mod-follow-0.20.0/set/self/never.rb - includes +
      // restrictive_follow_opts position: 3 + follow_test block +
      // title + label. Class-side.
      setPath: "self/never",
      formats: { html: { views: [] } },
    },
    // pattern: type
    {
      // card-mod-follow-0.20.0/set/type/cardtype.rb - follow_label,
      // followed_by?, follow_set_card, list_direct_followers?, plus the
      // format :html do block's related_by_type_items override (adds
      // the "{name} cards" link to the type card's related-items
      // section). NOT ported: the methods feed the rule walk;
      // related_by_type_items is consumed by card-mod-bar_and_box's
      // related_section.rb helpers (rails-runtime).
      setPath: "type/cardtype",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-follow-0.20.0/set/type/notification_template.rb - the
      // notification_template cardtype's deliver + alert_message +
      // disappear? + alert_class methods + format :html do block
      // (alert_message format helper - drives the email template).
      // NOT ported: write-path (the email template's alert message).
      setPath: "type/notification_template",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-follow-0.20.0/set/type/set.rb - event
      // :cache_expired_for_new_set + follow_label + list_direct_followers?
      // + follow_rule_name + followed_by? + follow_set_card +
      // all_members_followed? + broader_set_followed_by? +
      // directly_followed_by?. NOT ported: write-path event +
      // rule-walk methods.
      setPath: "type/set",
      formats: { html: { views: [] } },
    },
    {
      // card-mod-follow-0.20.0/set/type/user.rb - the User cardtype's
      // follow follow_name option method (drops *never, adds option,
      // saves). NOT ported: write-path.
      setPath: "type/user",
      formats: { html: { views: [] } },
    },
    // pattern: type_plus_right
    {
      // card-mod-follow-0.20.0/set/type_plus_right/user/follow.rb -
      // FOLLOW_TABS constant + include_set Abstract::List + virtual? +
      // item_names (Card::Rule.preference_names user.name, "follow") +
      // suggestions + current_user? + format :html do views (:one_line_
      // content, :edit, :core, :follow_tab, :ignore_tab, :errors) +
      // following_rules_and_options / ignoring_rules_and_options /
      // rules_and_options_by_set_pattern / a_set_pattern_hash / etc.
      // helpers + the follow_editor.haml template + the
      // follow_editor_helper.rb helper file.
      // Ported: :one_line_content (""), :edit (render :open dispatch).
      // The :core / :follow_tab / :ignore_tab / :errors views all depend
      // on the tabs helper + subformat(rule_card).follow_item + Card::
      // Rule.preference_names walks (rails-runtime).
      setPath: "type_plus_right/user/follow",
      formats: {
        html: {
          views: [
            { view: "one_line_content", viewFn: userFollowOneLineContentView },
            { view: "edit", viewFn: userFollowEditView },
          ],
        },
      },
    },
    passiveSetModule("type_plus_right/user/follow/follow_editor_helper"),
  ],
};

export default cardModFollow;
