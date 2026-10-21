import { str } from "../../render/format.js";
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
// NOT ported (honest remainder, updated for the follow read path):
// - all/follow/followed_by + follower_ids: the READ half the views need
//   IS ported now (src/card/follow/follow-rule-walk.ts reusing the notify
//   pass's algebra from src/card/notify/follower-resolver.ts) INCLUDING
//   the *nests arm of followed_field? (the inclusion search through
//   card_references, the follow read path); the WRITE halves that remain are the
//   follower_ids CACHE (Card.cache / Rails.cache) and the notify module's
//   own indirect-follower walk (follower-resolver.ts's header gap - the
//   notify module reads this same machinery through its own port).
// - Register entry 16 correction: follow_modal_link has no caller in the
//   pinned gemset (recursive rb/haml census). Its helper body is not a
//   missing reachable view. The HTML follow_button IS registered below.
//   JSON follow_status remains a named skip: both concrete classes raise
//   NoMethodError for link_opts. The Ruby-source capture pins that fact.
// - all/follow/follow_link_views.rb format :json view :follow_status
//   (:11-14): the GEM BODY CALLS A MISSING METHOD - `follow_link_class
//   .link_opts` fires link_opts on the FollowLink CLASS, but
//   follow_link.rb:36 defines link_opts only as an INSTANCE method; Ruby
//   raises NoMethodError as written. Porting the raise would encode a
//   guess about intent; named here, not guessed.
// - all/notify.rb events + the notify base/html views (:list_of_changes,
//   :subedits, :followed, :unfollow_url): the notification EMAIL-template
//   surface - the bodies read active_notice inherited from the email render
//   context, Action.value walks, and card_url; the write-path events are
//   the notify stream's.
//   :subedit_notice + :follower ARE PORTED now (the
//   manifest's base-format registrations - subedit_notice through the
//   history seam, follower the page arm).
// - all/notify.rb events (silence_notifications, notify_followers_
//   after_save, stash_followers, notify_followers_after_delete) +
//   FollowerStash (lib/card/follower_stash.rb): all write-path /
//   notification-path code. The headless render engine has no save
//   path; follower lookup would need Card.search included_by: walks.
// - all/notify/base_views.rb + html_views.rb views (:list_of_changes,
//   :subedits, :followed, :last_action_verb, :unfollow_url): follow
//   notification email template (data/real.yml "follower notification
//   email") walks active_notice inherited from the email format, which is
//   not ported; :unfollow_url calls card_url (Rails URL helper);
//   :followed calls Card.fetch + follow_option_card. :subedit_notice +
//   :follower are the manifest's base registrations now
//   (subeditNoticeView / followerNotifyView).
// - right/account.rb send_change_notice: deliver email through
//   follower_notification_email template + Auth.as; rails-runtime
//   (ActionMailer, Auth.as scope).
// - right/contextual_class.rb + right/disappear.rb + right/message.rb:
//   card_reader for the contextual_class/disappear/message settings the
//   notification_template format :html do block reads (alert_class,
//   disappear?, mformat.contextual_content). These are settings surface
//   methods used by the email template - not render views themselves.
// - right/follow.rb: view :follow_status + :follow_item ARE PORTED now
//   - the forms ride src/card/follow/follow-form-shapes.ts
//   (the edit-form bytes + form_tag_helper shapes); the permit/
//   ok_to_update?/ok_to_create? gates (:27-33, :43-49) are write-path
//   permission overrides, not view bodies - the read-side render gate is
//   the engine's standard view-permission machinery.
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
//   BOTH views are now ported (followDefaults
//   EditButtonsView below, registered at the self/follow_defaults manifest
//   entry) - and BOTH are UNREACHABLE for their own card, in Ruby exactly
//   as here. 09_self.rb anchors the SELF pattern on card.name, and
//   Cardname#safe_key (cardname-0.20.0 lib/cardname/variants.rb:19) is
//   `key.tr("*","X")` over the SINGULARIZED key, so the card
//   "*follow defaults" carries the token SELF-Xfollow_default while this
//   file declares the constant FollowDefaults. The set-key walk therefore
//   reads "ALL TYPE-list STAR SELF-Xfollow_default" with no FollowDefaults
//   ancestor, and :core / :confirm_update_all / :edit_buttons all render
//   the anonymous denial span. Same marker class as the api_key RIGHT-X
//   star below - the port raises UnsupportedViewError, which is Ruby-true.
// - type/cardtype.rb + type/notification_template.rb + type/set.rb +
//   type/user.rb: methods (follow_label, follow_set_card, list_direct_
//   followers?, directly_followed_by?, follow_rule_name) + format
//   :html do blocks (related_by_type_items, alert_message) + event
//   :cache_expired_for_new_set. The cardtype / set methods are
//   consumed by the follow_rule walk + the cardtype-typed follow_link
//   (rails-runtime); the notification_template format :html do block
//   drives the email template alert_message (write path).
// - type_plus_right/user/follow.rb: view :follow_tab + :ignore_tab ARE
//   PORTED now - the row walk is the seam's followEditorRows
//   (follow/follow-render-seam.ts) and the rows render the same
//   follow_item body the right/follow set module registers. :errors IS
//   PORTED now (the no-errors arm registered - the reachable arm; the
//   permission arm's pieces live in userFollowErrorsPermissionArm; the
//   super() arm dispatches card-mod-format's all-set body). STILL NOT
//   PORTED here: view :core (:39-43 - the signed-in arm dispatches
//   :rule_editor through render_rule_editor - rule_editor IS ported now
//   on the right/following registration; :core's tabs + nest arms ride
//   the same seams) and the suggestions arm of the editor walk
//   (follow_editor_helper.rb:83-90, Card[:follow_suggestions] merge)
//   IS PORTED now (the follow read path - the seam's suggestedFollowingRuleOptions
//   + mergeOptionHashes, gated on current_user?; the set-only suggestion
//   arm stays unported: Ruby's a_set_only_suggestion yields to a no-block
//   call site and raises LocalJumpError as written).
// - assets/script/follow.js.coffee + assets/style/follow.scss:
//   stylesheet and JS asset mods - separate surface.
// - data/real.yml:1-50 seed cards (*follow, *following, *followers,
//   *follow fields, *always, *never, *follow defaults, follow
//   suggestions, *contextual class, *message, *disappear, follower
//   notification email + the *all+*follow_fields=nests junction +
//   the email template's from/subject/html_message/text_message
//   fields): the test stream seeds its own codename cards; the email
//   template is a write-path surface.

import {
  RenderFormat,
  Voo,
  virtualSearchKnownName,
  type RenderCard,
  type ViewContext,
  type ViewFn,
} from "../../render/format.js";
import { modSlotWrap, viewWrapInherited } from "../mod-view-helpers.js";
import { HTML_VIEWS, lastActionVerbNotifyView } from "../../render/views.js";
import { DeckoName } from "../../name.js";
import { safeSetKeys } from "../../render/set-keys.js";
import { h } from "../../render/slot-html.js";
import { actionTypeFromCode } from "../../history/action.js";
import type { HistoryRenderReader } from "../../history/render-seam.js";
import type { HistoryActionRow } from "./card-mod-history.js";
import type {
  CardRecord,
} from "../../fetch/card-record.js";
import { followRuleNameFor, followSetCardName } from "../../follow/follow-rule-walk.js";
import { ruleNamesForCard } from "../../set-patterns/rule-names.js";
import type { PatternCardInput } from "../../set-patterns/types.js";import {
  engineOwnedEvent,
  type DeckoModManifest,
  type ModEventCard,
  type ModEventFn,
  type ModEventRegistration,
  type ModSetModuleFile,
} from "../mod-manifest.js";
import { parseSetName } from "../../set-patterns/set-name.js";

/** The set-module event declarations:
 *  stub-bodied, with the per-event reason on the declaration. Same shape
 *  as core-mod.ts's local helper. */
function event(
  decl: Omit<ModEventRegistration, "fn"> & { fn?: ModEventFn },
): ModEventRegistration {
  return { fn: () => undefined, ...decl };
}
import {
  cardFormOpen,
  CARD_FORM_CLOSE,
  followPath,
  hiddenTags,
  linkTo,
  output,
} from "../../follow/follow-form-shapes.js";
import type {
  FollowRenderBundle,
  FollowTabRow,
} from "../../follow/follow-render-seam.js";
import { errorsBaseView as formatErrorsView } from "./card-mod-format.js";
import { tabsPanel } from "./card-mod-tabs.js";
import { editModalWrapper, followButton } from "./card-mod-edit.js";
import { toPointerContent, type ContentFn } from "../../render/content-overrides.js";

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
// set/right/followers.rb:13-15 `def content` + :17-19 `def item_names`.
//
//   def content
//     left ? item_names.to_pointer_content : ""
//   end
//
//   def item_names _args={}
//     left ? left.follow_set_card.prototype.follower_names : []
//   end
//
// Both are set-module CONTENT overrides (the `def content` hook the render
// layer consults BEFORE dbContent — content-overrides.ts's ContentFn), and
// the list they name is computed in the follow render seam
// (follow-render-seam.ts `followerNames`, resolved through the same
// `resolveFollowers` walk the "N followers" pill reads, so the two cannot
// disagree). `to_pointer_content` is content-overrides.ts's helper
// (card-1.110.0 config/initializers/01_core_extensions/array.rb:4-12: strip,
// drop one leading "[[" and one trailing "]]", join "\n").
//
// MEASURED against the stock Ruby oracle on the synthetic-v1 fixture:
// `/<card>+*followers` renders `titled` with the follower names as the
// pointer list ("Mira Member" — the deck-wide `*all+Mira Member+*follow` rule,
// fixture rows 909/910), and `/<card>+followers` (the UNSTARRED name, a
// different card) renders the create form, exactly as this port does.
// ---------------------------------------------------------------------------

const followersContentFn: ContentFn = (fmt) => {
  const bundle = fmt.engine.followRenderBundle?.();
  const names = bundle?.followerNames ?? [];
  // `left ? ... : ""` — a followers card with no left has no names.
  if (names.length === 0) return toPointerContent(names);
  return toPointerContent(names);
};

/** type_plus_right/user/follow.rb:13-19 `def item_names` — the `<user>+*follow`
 *  card's content is the pointer list over the user's follow PREFERENCE RULE
 *  CARDS (`Card::Rule.preference_names user.name, "follow"`), resolved in the
 *  follow render seam. This is the "all followed cards" content the board's
 *  follow_overview_button opens (card-mod-edit set/board/follow_section.rb
 *  :17-23 -> `link_to_card([Auth.current, :follow], "all followed cards")`).
 *
 *  MEASURED against the stock Ruby oracle: `/Ada Admin+*follow` renders the
 *  Follow/Ignore tabs, and `/<User>+*follow/content` renders the pointer list
 *  over the user's preference cards. */
const userFollowContentFn: ContentFn = (fmt) =>
  toPointerContent(fmt.engine.followRenderBundle?.()?.followPreferenceNames ?? []);

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

const followingOneLineContentView: ViewFn = (ctx) => viewWrapInherited(ctx, "one_line_content", "");

// ---------------------------------------------------------------------------
// set/type_plus_right/user/follow.rb:23-25 view :one_line_content do "" end.
//
// Empty override for the [User]+*follow card - same idiom as the
// following card (a virtual pointer whose content is dynamic; the
// empty one_line_content keeps the pointer's mini_bar view from
// rendering a body line below the items). The base view (card-mod-format
// set/all/html/views.rb:29-32) carries `wrap: { div: { class: "text-muted"
// } }`, and Ruby's override REPLACES only the body - the inherited wrap
// still renders, so the empty override answers `<div class="text-muted">
// </div>`, the same unconditional wrapper allHtmlViewsOneLineContentView
// composes (an empty body inside the same div).
// ---------------------------------------------------------------------------

const userFollowOneLineContentView: ViewFn = (ctx) => viewWrapInherited(ctx, "one_line_content", "");

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

// The override's body is `render :open`; the inherited edit wrap (modal, see
// editModalWrapper) is applied around it, so the answer is the modal.
const userFollowEditView: ViewFn = ({ fmt }) => editModalWrapper(fmt, str(fmt.renderView("open")));

// ---------------------------------------------------------------------------
// set/self/follow_defaults.rb:24-30 view :confirm_update_all.
//
// The body is `wrap do alert(:info) do %(...) end end` -
//
//   view :confirm_update_all do
//     wrap do
//       alert :info do
//         %(
//           <h1>Are you sure you want to change the default follow rules?</h1>
//           <p>You may choose to update all existing users.
//              This may take a while. </p>
//         )
//       end
//     end
//   end
//
// `wrap` is the slot wrap (wrap.rb:11-14 - the card-slot div with the
// view/set-key classes and the data-slot payload, whose show list the
// root render's enrollment fills); the bootstrap alert helper adds
// role="alert" beside the class chain; the %( ) literal keeps the source
// whitespace verbatim (10-space h1/p indents, the 13-space continuation,
// the 8-space line before the helper's closing tag).
// ---------------------------------------------------------------------------

const confirmUpdateAllView: ViewFn = (ctx) => {
  const alert =
    `<div class="alert alert-info" role="alert">` +
    `\n          <h1>Are you sure you want to change the default follow rules?</h1>` +
    `\n          <p>You may choose to update all existing users.` +
    `\n             This may take a while. </p>\n        ` +
    `</div>`;
  return modSlotWrap(ctx, "confirm_update_all", alert);
};

// ===========================================================================
// the follow views port: the follow views whose bodies the follow-rule
// read/walk + the form shapes + the actor-session seam render. Every body
// below cites its gem lines; the bytes derive from the gem source and the
// TS render surface (no upstream rendered reference exists for any follow
// view name).
// ===========================================================================

// --- shared body helpers ---------------------------------------------------

/** set/type/set.rb follow_label: subclass_for_set.short_label(anchor_name)
 *  - the per-pattern short labels (labels.ts via the set-name parser: the
 *  pattern resolves through the tag card's codename). The *all set's short
 *  label is "everything" (01_all.rb) - the follow_item link's text
 *  for the *all set. Empty string when no pattern registers (the Ruby nil klass arm
 *  returns "" from label/short_label dispatch). */
function setFollowLabel(ruleSetName: string): string {
  const parsed = parseSetName(ruleSetName);
  return parsed.spec ? parsed.spec.shortLabel(parsed.anchorName?.s) : "";
}

/** rules.rb:73-75 set_prototype: `rule_set.prototype` - Pattern#
 *  prototype_args(anchor) over each set_pattern file (01_all.rb:9 {} -
 *  unnamed; 02_all_plus.rb:11 {name: "+"}; 03_type.rb:15 {type: anchor} -
 *  unnamed; 04_star.rb:9 {name: "*dummy"}; 05_rstar.rb:11
 *  {name: "*dummy+*dummy"}; 06_rule.rb:11 {name: "*all+*create"};
 *  07_right.rb:18 {name: "*dummy+<anchor>"}; 08_type_plus_right.rb:23
 *  {name: "+<anchor.tag>"}; 09_self.rb:13 {name: anchor}). The key of the
 *  unnamed prototypes is "" (the *all rule set's prototype key). */
function setPrototypeKey(ruleSetName: string): string {
  const parsed = parseSetName(ruleSetName);
  const anchor = parsed.anchorName?.s ?? "";
  const tag = DeckoName.parse(anchor).tagName?.s ?? anchor;
  const prototypeName: Record<string, string | undefined> = {
    all: undefined,
    all_plus: "+",
    type: undefined,
    star: "*dummy",
    rstar: "*dummy+*dummy",
    rule: "*all+*create",
    right: `*dummy+${anchor}`,
    type_plus_right: `+${tag}`,
    self: anchor,
  };
  const name = prototypeName[parsed.patternCode ?? ""];
  return name === undefined ? "" : DeckoName.parse(name).key;
}

/** right/follow.rb:111-115 follow_item_link_target: the rule set's
 *  human mark - `set.tag.codename == :self ? setname.left :
 *  setname.field("by name")`. The non-self arm composes
 *  "<setname>+by name" (Name#field). */
function followItemLinkTarget(ruleSetName: string): string {
  const name = DeckoName.parse(ruleSetName);
  const tag = name.tagName;
  if (tag !== undefined && tag.s === "*self" && !name.isSimple) {
    return name.leftName?.s ?? ruleSetName;
  }
  return `${ruleSetName}+by name`;
}

/** The rule set of a follow preference "Set+User+*follow":
 *  Card::Rule#rule_set - the leading set part (parts[0..-3]); for a
 *  2-part "Set+*follow" rule the set is the left. */
function ruleSetNameOf(ruleCardName: string): string {
  const name = DeckoName.parse(ruleCardName);
  const parts = name.partNames;
  if (parts.length >= 3) {
    return parts.slice(0, parts.length - 2).map((p) => p.s).join("+");
  }
  return name.leftName?.s ?? ruleCardName;
}

/** right/follow.rb:23-25 add_follow_item?: `new_card? ||
 *  !include_item?(condition)`. The items are the rule card's content
 *  lines - the deck stores BARE option names (a "Set+User+*follow" rule
 *  card's content is an option line like "*always"). */
function followRuleItems(card: RenderCard): string[] {
  return card.dbContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** right/follow.rb:86-89 follow_item_hidden_tags: condkey =
 *  add_follow_item?(condition) ? :add_item : :drop_item;
 *  hidden_tags condition: condition, condkey => condition. */
function followItemHiddenTags(card: RenderCard, condition: string): string {
  const addFollowItem =
    card.id === undefined || !followRuleItems(card).includes(condition);
  const condkey = addFollowItem ? "add_item" : "drop_item";
  return hiddenTags({ condition, [condkey]: condition });
}

/** right/follow.rb:91-105 follow_item_button + :99-101 class + :103-105
 *  icon: button_tag type: :submit, "aria-label": "Left Align", class:
 *  "btn-sm btn-item <add|delete class>"; bootstrapify_button appends
 *  "btn btn-primary" (situation default, form.rb:33-36); icon_tag(:add |
 *  :check) is the material-icons <i>. The attribute order:
 *  name="button", type, aria-label, class. */
function followItemButton(card: RenderCard, condition: string): string {
  const add =
    card.id === undefined || !followRuleItems(card).includes(condition);
  const cls = add ? "btn-item-add" : "btn-item-delete btn-primary";
  const icon = add ? "add" : "check";
  return (
    `<button name="button" type="submit" aria-label="Left Align"` +
    ` class="btn-sm btn-item ${cls} btn btn-primary">` +
    `<i class="notranslate material-icons">${icon}</i></button>`
  );
}

/** right/follow.rb:107-123 follow_item_link: link_to_card(target, text);
 *  text = follow_item_link_text (:116-119): BOTH arms answer the rule set's
 *  follow_label (the option card's description(set) IS set.follow_label,
 *  abstract/follow_option.rb:5-7, and the no-option-card arm reads
 *  card.rule_set.follow_label directly); target = follow_item_link_target
 *  (:111-114): `set.tag.codename == :self ? setname.left :
 *  setname.field("by name")`. The known/wanted class is links.rb:140-144
 *  add_known_or_wanted_class with no :known opt, i.e. Card.known? =
 *  `real? || virtual?` (card core set/all/states.rb:65-67): the by_name
 *  right joins the VirtualSearch family (virtual_search.rb:11-12 def
 *  virtual?; new?; end), so a "*all+by_name" target is virtual-known on a
 *  row miss and renders known-card. */
function followItemLink(fmt: RenderFormat, ruleSetName: string): string {
  const target = followItemLinkTarget(ruleSetName);
  const targetName = DeckoName.parse(target);
  const targetCard = fmt.engine.fetchRenderCard(targetName.key);
  const known =
    (targetCard !== undefined && targetCard.unknown !== true) ||
    virtualSearchKnownName(target, fmt.engine) !== undefined;
  return linkTo(setFollowLabel(ruleSetName), followPath(targetName.urlKey), {
    class: known ? "known-card" : "wanted-card",
  });
}

/** right/follow.rb:67-78 follow_item condition, button=true - the FORM body
 *  the :follow_item view and the User+*follow editor rows render (without
 *  the wrap; callers apply the slot wrap). card_form action: :update,
 *  success: {view: :follow_item} - the success rides the ACTION QUERY
 *  (card_form_url_and_action, ?success%5Bview%5D=follow_item),
 *  no success hidden tag; the form class is "card-form slotter"
 *  (follow_item's form carries NO autosave); the body is [hidden_tags,
 *  (button), link] newline-joined (content.rb:68-70 output). */
function followItemFormBytes(
  fmt: RenderFormat,
  condition: string,
  button: boolean,
): string {
  const card = fmt.card;
  return (
    cardFormOpen({
      formId: card.id !== undefined ? `edit_card_${card.id}` : "new_card",
      action: followPath(card.name.urlKey, {
        action: "update",
        query: { "success[view]": "follow_item" },
      }),
      classes: "card-form slotter",
    }) +
    output([
      followItemHiddenTags(card, condition),
      button ? followItemButton(card, condition) : undefined,
      followItemLink(fmt, ruleSetNameOf(card.name.s)),
    ]) +
    CARD_FORM_CLOSE
  );
}

/** right/follow.rb:67-78 follow_item condition, button=true - the body the
 *  :follow_item view and the User+*follow editor rows render, wrapped by
 *  `wrap do ... end` - the slot div (set/all/html/wrap.rb:6-13). The wrap
 *  reads the RENDER's live voo (Ruby: the same format's @voo - the root
 *  render's enrollment is what puts the "show" list into the data-slot
 *  payload). */
function followItemHtml(
  ctx: ViewContext,
  condition: string,
  button: boolean,
  wrapView: string,
): string {
  return modSlotWrap(ctx, wrapView, followItemFormBytes(ctx.fmt, condition, button));
}

/** The seam accessor - undefined when the engine carries no follow seam
 *  (the signed-out arms apply). The EXPLICIT ACTOR BOUNDARY: the session
 *  inside the bundle was resolved from engine.pageSession and nothing else. */
function followBundle(ctx: ViewContext): FollowRenderBundle | undefined {
  return ctx.fmt.engine.followRenderBundle?.();
}

// --- set/right/follow.rb ----------------------------------------------------

/** right/follow.rb:58-60 view :follow_status, cache: :never -
 *  `wrap { haml :follow_status }`; follow_status.haml (the whole template):
 *
 *      %h4
 *        Get notified about changes
 *      %ul.delete-list.list-group
 *        - card.item_names.each do |option|
 *          %li.list-group-item
 *            = follow_item(option == "*never" ? "*always" : option)
 *      = link_to_view :rule_form, "more options",
 *                     class: "btn update-follow-link slotter",
 *                     "data-card_key": card.set_prototype.key
 *
 *  Haml bytes: the h4 text on its own lines, single-quoted class
 *  attributes, every item in its own li, no indentation. The rows call the
 *  follow_item FORMAT METHOD on the same format (not a subformat render),
 *  so each nested wrap reads @current_view follow_status - the nested
 *  slots' id/class/data-slot all say follow_status-view (the oracle's
 *  nested slots carry it). link_to_view adds rel nofollow + data-remote
 *  and its own "slotter" (the passed class already carries one, so the
 *  emitted class list is the double "slotter slotter"); set_prototype.key
 *  for the *all rule set is "" (rules.rb:73 + 01_all.rb:9). */
const followStatusView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  const card = fmt.card;
  const rows = followRuleItems(card)
    .map(
      (option) =>
        `<li class='list-group-item'>\n${followItemHtml(
          ctx,
          option === "*never" ? "*always" : option,
          true,
          "follow_status",
        )}\n</li>`
    )
    .join("\n");
  const setName = ruleSetNameOf(card.name.s);
  const moreOptions =
    `<a rel="nofollow" class="btn update-follow-link slotter slotter"` +
    ` data-card_key="${h(setPrototypeKey(setName))}"` +
    ` href="${followPath(card.name.urlKey, { view: "rule_form" })}"` +
    ` data-remote="true">more options</a>`;
  const body =
    `<h4>\nGet notified about changes\n</h4>\n` +
    `<ul class='delete-list list-group'>${rows === "" ? "" : `\n${rows}`}\n</ul>\n` +
    `${moreOptions}\n`;
  return modSlotWrap(ctx, "follow_status", body);
};

/** right/follow.rb:63-65 view :follow_item -
 *  `follow_item Env.params[:condition]`; a headless engine has no request
 *  params (the searchKeyword seam's documented convention), so condition
 *  is nil and follow_item's `condition ||= "*always"` arm applies
 *  (right/follow.rb:68). The button param rides the voo opts (Ruby's
 *  follow_item(condition, button=true) second arg when the editor rows
 *  call it). The wrap reads the render's live voo (the "show" list in the
 *  data-slot payload). */
const followItemView: ViewFn = (ctx) => {
  const condition =
    typeof ctx.voo.opts["condition"] === "string"
      ? (ctx.voo.opts["condition"] as string)
      : "*always";
  const button = ctx.voo.opts["follow_button"] !== false;
  return followItemHtml(ctx, condition, button, "follow_item");
};

// --- set/all/follow/follow_link_views.rb (the FollowLink family) ------------

/** follow_link.rb:24-34 FollowLink#button + :36-40 link_opts + :42-46
 *  render_link_text + the subclasses (start_follow_link.rb:4-12 - *always /
 *  "follow" / "send" / ""; stop_follow_link.rb:4-14 - *never / "following" /
 *  "stop sending" / "unfollow" hover / "btn-item-delete"). card.followed?
 *  picks the class (follow_link_views.rb:2-4) - the seam's followed verdict
 *  under the SESSION actor. The bytes are the card-mod-edit port's
 *  followButton builder - the SAME FollowLink#button anchor the
 *  follow_section embed renders (one builder for both surfaces, so they
 *  cannot drift). The actor
 *  arm: Ruby's Auth.current.name is "Anonymous" under no session (the
 *  follow rule mark carries it). */
const followButtonView: ViewFn = (ctx) => {
  const bundle = followBundle(ctx);
  return followButton(
    {
      session: { actorName: bundle?.session?.actorName ?? "Anonymous" },
      followed: bundle?.followed === true,
      followLabel: bundle?.followLabel ?? ctx.fmt.card.name.s,
    },
    ctx.fmt.card.name.s,
  );
};

// --- set/type_plus_right/user/follow.rb (the follow/ignore editor) ----------

/** follow_editor.haml (whole template):
 *    .pointer-list-editor
 *      %ul.delete-list.list-group
 *        - send items_method do |rule_card, option|
 *          %li.list-group-item
 *            -if rule_card
 *              = subformat(rule_card).follow_item option, show_button?
 *            -else
 *              no entries
 *  The rows come from the seam (following_rules_and_options /
 *  ignoring_rules_and_options - follow_editor_helper.rb:7-19; the
 *  preference walk ran in prepareFollowRender, which enriched every row's
 *  rule card so the sync fetchRenderCard hits). show_button? (:53-55):
 *  card.current_user? || Auth.always_ok? - the session actor is the
 *  card's left (current_user?: Auth.signed_in? && Auth.current_id ==
 *  left.id; the headless engine's always_ok arm is the bot render). */
function followEditorBody(
  ctx: ViewContext,
  rows: readonly FollowTabRow[],
): string {
  const { fmt } = ctx;
  const bundle = followBundle(ctx);
  const showButton =
    bundle?.session !== undefined &&
    (bundle.session.actorName === fmt.card.name.leftName?.s ||
      bundle.session.actorId === 1); // Auth.always_ok? (the bot actor arm)
  // follow_editor.haml: every walk row renders an <li> - a missing rule card
  // or the walk's empty `yield nil` arm (follow_editor_helper.rb:45) renders
  // the literal "no entries" text INSIDE the li (haml: the -if/-else arms).
  // Haml emission: no indentation, single-quoted class attributes, one
  // newline per synthesized line (the empty tab's "no entries" li
  // included).
  const lis = rows.map((row) => {
    const ruleCard = ctx.fmt.engine.fetchRenderCard(row.ruleCardName);
    if (ruleCard === undefined) {
      // the walk enriched every row; a miss means the card vanished
      // between prepare and render - Ruby would raise on nil subformat;
      // the haml's nil rule_card arm is "no entries"
      return `<li class='list-group-item'>\nno entries\n</li>`;
    }
    const sub = new RenderFormat(ruleCard, ctx.fmt.engine, { parent: fmt });
    return `<li class='list-group-item'>\n${followItemHtml(
      { fmt: sub, voo: new Voo(undefined, "follow_item", {}) },
      row.option,
      showButton,
      "follow_item",
    )}\n</li>`;
  });
  const list =
    lis.length > 0
      ? `<ul class='delete-list list-group'>\n${lis.join("\n")}\n</ul>`
      : `<ul class='delete-list list-group'>\n<li class='list-group-item'>\nno entries\n</li>\n</ul>`;
  // Haml output always ends with one newline after the last synthesized tag
  // ("</div>\n"), and inside
  // the tab pane it separates the editor from the pane's closing tag.
  return `<div class='pointer-list-editor'>\n${list}\n</div>\n`;
}

/** user/follow.rb:45-47 view :follow_tab, cache: :never -
 *  haml :follow_editor, items_method: :following_rules_and_options. */
const followTabView: ViewFn = (ctx) =>
  followEditorBody(ctx, followBundle(ctx)?.followTabRows ?? []);

/** user/follow.rb:49-51 view :ignore_tab, cache: :never -
 *  haml :follow_editor, items_method: :ignoring_rules_and_options. */
const ignoreTabView: ViewFn = (ctx) =>
  followEditorBody(ctx, followBundle(ctx)?.ignoreTabRows ?? []);

/** user/follow.rb:1-2 FOLLOW_TABS - the static tab hash: view configs only,
 *  no titles (the label falls to the tab name) and no paths (LazyTab builds
 *  format.path(view:) - path.rb:32-40 mark/view, no query). */
const FOLLOW_TABS: ReadonlyArray<{ name: string; view: string }> = [
  { name: "Follow", view: "follow_tab" },
  { name: "Ignore", view: "ignore_tab" },
];

/** user/follow.rb:39-43 view :core - `tabs FOLLOW_TABS, "Follow",
 *  load: :lazy do render_follow_tab end`. The tab machinery bytes ride the
 *  card-mod-tabs port's panel builder (all/tabs.rb:29-39 + tab_panel.haml -
 *  the same gem helper, LazyTab klass via load: :lazy): the tab ids consume
 *  the ROOT format's id counter in button order (Follow, Ignore), the lazy
 *  tab data-urls are the mark/view paths, and the ACTIVE pane's content is
 *  the rendered :follow_tab view while the lazy pane stays empty
 *  (lazy_tab.rb:33-36). No slot wrap: the view body IS the tab panel
 *  (the oracle's :core opens at the tabbable div). */
const userFollowCoreView: ViewFn = (ctx) => {
  const urlKey = ctx.fmt.card.name.urlKey;
  const hash = new Map(
    FOLLOW_TABS.map((e) => [e.name, { title: e.name, path: `/${urlKey}/${e.view}` }]),
  );
  return tabsPanel(ctx, hash, "Follow", "tabs", str(ctx.fmt.renderView("follow_tab")));
};

// --- set/self/follow_defaults.rb (the deprecated editor) --------------------

/** follow_defaults.rb:49-55 view :edit_buttons -
 *  render_confirm_update_all + button_formgroup { [submit_and_update_button,
 *  simple_submit_button, cancel_to_edit_button] }.
 *  button_formgroup (card-mod-edit set/all/form.rb:86-88): wrap_with :div,
 *  class: "form-group button-form-group".
 *  submit_and_update_button (:57-63) / simple_submit_button (:65-67) /
 *  cancel_to_edit_button (:69-71): cancel_button href: path(view: :edit,
 *  id: card.id) - the mark+view path with id as a QUERY param
 *  (cast_params.rb:5 casts only slot keys). cancel_button's
 *  `return unless voo.show? :cancel_button` default-shows (viz defaults
 *  visible). */
const followDefaultsEditButtonsView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  const confirm = fmt.renderView("confirm_update_all");
  // button_tag emits its name/type defaults first, then the options in the
  // order the Ruby call site's hash carries them (data-disable-with rides the
  // data: hash ahead of value and class). The attribute order is pinned by the
  // Ruby oracle, so the tags are assembled from ordered pairs here.
  const submitAndUpdate = orderedButton("Submit and update all users", [
    ["name", "card[trigger]"],
    ["type", "submit"],
    ["data-disable-with", "Updating"],
    ["value", "update_follow_rules"],
    ["class", "follow-updater btn btn-primary"],
  ]);
  const simple = orderedButton("Submit", [
    ["name", "button"],
    ["type", "submit"],
    ["class", "follow btn btn-primary"],
  ]);
  // cancel_button (card-mod-edit set/all/form_elements.rb:67-75): the href the
  // caller gave, then class (btn btn-secondary + the slotter strategy), then
  // data-remote.
  const cancelHref = followPath(fmt.card.name.urlKey, {
    view: "edit",
    query: { id: String(fmt.card.id) },
  });
  const cancel = `<a href="${cancelHref}" class="btn btn-secondary slotter" data-remote="true">Cancel</a>`;
  // wrap_with :div (button_formgroup) adds no leading newline; the confirm
  // block ends the line the group opens on.
  return (
    confirm +
    `<div class="form-group button-form-group">` +
    output([submitAndUpdate, simple, cancel]) +
    `</div>`
  );
};

/** button_tag with its attribute pairs in the caller's emitted order. */
function orderedButton(text: string, attrs: Array<[string, string]>): string {
  return `<button ${attrs.map(([k, v]) => `${k}="${v}"`).join(" ")}>${text}</button>`;
}

// ===========================================================================
// the remaining follow views.
// subedit_notice + follower live in all/notify/base_views.rb's BARE
// `format do` block (the BASE format, filed on Card::Format itself -
// registrar.rb:79-84) and register under the manifest's "base" key like
// last_action_verb, surfaced through the anchorless chain walk's base tail.
// rule_editor is right/following.rb's html view; errors is
// type_plus_right/user/follow.rb's html view (which SHADOWS card-mod-
// format's all-set :errors for User+*follow cards - set specificity, the
// same dispatch the engine's chain walk resolves).
// ===========================================================================

// --- set/all/notify/base_views.rb (the notify base views) -------------------

/** The history render seam when the render carries one (render.ts
 *  HISTORY_SEAM_VIEWS gates "subedit_notice" in; the base tail's anchorless
 *  chain dispatch runs the same render()). */
function notifyHistoryReader(ctx: ViewContext): HistoryRenderReader | undefined {
  return ctx.fmt.engine.historyRenderReader?.();
}

/** base_views.rb:1-3 RELEVANT_FIELDS_BY_ACTION - the fields each action
 *  type's list-of-changes walk reads. The keys are the VIEW field names
 *  Ruby interpolates into the row bytes ("#{field}:"), not the tracked
 *  columns (:cardtype reads the :type_id change). */
const RELEVANT_FIELDS_BY_ACTION: Record<
  "create" | "update" | "delete",
  readonly ("name" | "cardtype" | "content")[]
> = {
  create: ["cardtype", "content"],
  update: ["name", "cardtype", "content"],
  delete: ["content"],
};

/** base_views.rb:84-89 edit_info_for + :91-96 notification_action_label +
 *  :109-111 wrap_list_item over the seam's precomputed action values.
 *  changes.rb:8-12 value(field): the action's OWN change - a field the
 *  action did not touch has none and the row compacts away (:89's `return
 *  nil unless`). The :delete arm reads the PREVIOUS value (:87-88). The
 *  :cardtype row displays the INTERPRETED value (changes.rb interpret_
 *  value: the type id's cardname - the reader's typeNameForId). The label
 *  case has NO :create arm (Ruby's nil interpolates as the empty string,
 *  hence the row's three-space indent). */
function editInfoRow(
  reader: HistoryRenderReader,
  action: HistoryActionRow,
  field: "name" | "cardtype" | "content",
): string | undefined {
  const actionType = actionTypeFromCode(action.action_type ?? -1);
  if (actionType === undefined) return undefined;
  const tracked = field === "cardtype" ? "type_id" : field;
  const own = reader.value(action, tracked);
  if (own === undefined || own === null) return undefined;
  let value: string | number | boolean = own;
  if (actionType === "delete") {
    const previous = reader.previousValue(action, tracked);
    if (previous !== undefined && previous !== null) value = previous;
  }
  const shown =
    field === "cardtype"
      ? reader.typeNameForId(Number(value)) ?? String(value)
      : String(value);
  const label =
    actionType === "update" ? "new" : actionType === "delete" ? "deleted" : undefined;
  // the bare ITEM (base_views.rb:92 `wrap_list_item "  #{label} #{field}:
  // #{value}"` - the item carries no trailing newline; the per-format
  // wrap_list_item adds it: base "#{item}\n", html "<li>#{item}</li>\n").
  return `  ${label ?? ""} ${field}: ${shown}`;
}

/** base_views.rb:57-59 name_before_action:
 *  `(action.value(:name) && action.previous_value(:name)) || card.name` -
 *  the OLD name when the action renamed the card, else the card's name. */
function nameBeforeAction(
  reader: HistoryRenderReader,
  action: HistoryActionRow,
  cardName: string,
): string {
  const value = reader.value(action, "name");
  const previous =
    actionTypeFromCode(action.action_type ?? -1) === "create"
      ? undefined
      : reader.previousValue(action, "name");
  return value !== undefined && value !== null && previous !== undefined && previous !== null
    ? String(previous)
    : cardName;
}

/** base_views.rb:6-11 view :list_of_changes' BODY (the rows only - the
 *  registered flat-record :list_of_changes keeps the email views' page-arm
 *  contract; THIS walk is the subedit_notice body's internal
 *  render_list_of_changes dispatch, Ruby-true through the seam). The rows
 *  wrap per format: the HTML override (notify/html_views.rb:10-12)
 *  wrap_list_item is "<li>#{item}</li>\n", the base (:109-111) the bare
 *  item (its trailing \n included). */
function listOfChangesRowsFrom(
  ctx: ViewContext,
  reader: HistoryRenderReader,
  action: HistoryActionRow,
): string {
  const actionType = actionTypeFromCode(action.action_type ?? -1);
  if (actionType === undefined) {
    // RELEVANT_FIELDS_BY_ACTION[nil] raises in Ruby; the engine's quiet
    // rescue renders the standard nested-error bytes.
    throw new Error("subedit_notice: unknown action_type code");
  }
  const html = ctx.fmt.formatName === "html";
  return RELEVANT_FIELDS_BY_ACTION[actionType]
    .map((field) => editInfoRow(reader, action, field))
    .filter((row) => row !== undefined)
    .map((row) => (html ? `<li>${row}</li>\n` : `${row}\n`))
    .join("");
}

/** base_views.rb:25-31 view :subedit_notice, cache: :never:
 *    action = notification_action voo.action_id
 *    wrap_subedit_item do
 *      %(#{name_before_action action} #{action.action_type}d\n) +
 *        render_list_of_changes(action_id: action.id)
 *    end
 *  notification_action (:121-123): the voo's action_id fetches that action
 *  (Action.fetch), else card.last_action (the seam's cardLastAction, the
 *  same prepared bundle the history views read). wrap_subedit_item
 *  (:113-115) is "\n#{yield}\n". The seam-less host render (no history
 *  seam wired) cannot read actions: "" - the SAME basis the flat record's
 *  list_of_changes page arm documents (render/views.ts). A card with no
 *  actions leaves notification_action nil and Ruby's body raises on the
 *  nil deref - the quiet rescue bytes at nest level. */
const subeditNoticeView: ViewFn = (ctx) => {
  const reader = notifyHistoryReader(ctx);
  if (reader === undefined) return "";
  const rawActionId = ctx.voo.opts["action_id"];
  const actionId =
    rawActionId !== undefined && rawActionId !== null && String(rawActionId) !== ""
      ? Number(rawActionId)
      : undefined;
  const action =
    actionId !== undefined && Number.isFinite(actionId)
      ? reader.actionById(actionId)
      : reader.cardLastAction;
  if (action === undefined) {
    // card.last_action nil (no acts) - the body's #{action.action_type}
    // raises NoMethodError on nil in Ruby; the nest's quiet rescue emits
    // the standard bytes, so the body throws and the engine rescues.
    throw new Error(
      `subedit_notice: no notification action for ${ctx.fmt.card.name.s}`,
    );
  }
  const actionType = actionTypeFromCode(action.action_type ?? -1);
  if (actionType === undefined) {
    throw new Error("subedit_notice: unknown action_type code");
  }
  const header = `${nameBeforeAction(reader, action, ctx.fmt.card.name.s)} ${actionType}d\n`;
  // the inner render_list_of_changes(action_id: action.id) re-fetches THE
  // SAME action (base_views.rb:25-31 passes action_id: action.id to the
  // inner dispatch)
  const inner = header + listOfChangesRowsFrom(ctx, reader, action);
  // wrap_subedit_item per format: the HTML override (notify/html_views.rb:
  // 14-16) is "<li>#{yield}</li>\n", the base format's (base_views.rb:
  // 113-115) "\n#{yield}\n".
  return ctx.fmt.formatName === "html" ? `<li>${inner}</li>\n` : `\n${inner}\n`;
};

/** base_views.rb:6-11 view :list_of_changes, denial: :blank, cache: :never.
 *  notification_action (base_views.rb:121-123): the voo's action_id fetches
 *  that action, else card.last_action - headless renders answer
 *  card.last_action (the seam's cardLastAction). The rows wrap per format
 *  (the HTML <li> override above). Ruby's body raises on a nil action (no
 *  acts); the quiet rescue bytes - the port throws for the same posture. */
const listOfChangesNotifyView: ViewFn = (ctx) => {
  const reader = notifyHistoryReader(ctx);
  if (reader === undefined) return "";
  const action = reader.cardLastAction;
  if (action === undefined) {
    throw new Error(
      `list_of_changes: no notification action for ${ctx.fmt.card.name.s}`,
    );
  }
  return listOfChangesRowsFrom(ctx, reader, action);
};

/** base_views.rb:13-22 view :subedits, perms: :none, cache: :never:
 *  `return unless notification_act` - the NOTIFICATION ACT is the email
 *  send path's state, never set on a page render; the body answers Ruby's
 *  nil. The two render boundaries carry that nil differently: at a
 *  TOP-LEVEL render the view answers "" (Ruby's own empty-body answer for
 *  this view), while a nest inside processed content keeps the AUTHORED
 *  SYNTAX through Chunk::Abstract#result's @text fallback -
 *  `{{_|subedits}}`. The posture reaches the view
 *  through the chunk dispatch's authoredNestText opt (render/format.ts
 *  contentNest): inside a content nest the opt carries the chunk's @text
 *  and the view answers it verbatim; at every other boundary the opt is
 *  absent and the view answers "". The composed tree's nest
 *  subformat carries no voo.parent to discriminate. The actions_affecting
 *  walk and the wrap_subedits list stay unported behind that state (they
 *  need the email send path). */
const subeditsNotifyView: ViewFn = (ctx) => {
  const authored = ctx.voo.opts["authoredNestText"];
  return typeof authored === "string" ? authored : "";
};

/** base_views.rb:41-43 view :follower, perms: :none, compact: true:
 *  `active_notice(:follower) || "follower"`. @active_notice is the
 *  notification SEND path's ivar (base_views.rb:71-76 `inherit
 *  :active_notice` reads the parent format chain); no page render seeds
 *  it - the SAME disclosed basis the flat record's followed/unfollow_url
 *  arms carry (render/views.ts) - so the literal fallback is the page arm.
 *  Registered in the BASE format; perms :none rides the engine's
 *  PERMS_NONE registry (permissions/view-perms.ts, follower already in). */
const followerNotifyView: ViewFn = () => "follower";

// --- set/right/following.rb view :rule_editor --------------------------------

/** The Pointer type fallback (virtual-rule-card.ts's map): Ruby's
 *  `Card.fetch preference_name, new: { type_id: PointerID }` new-card arm
 *  stamps the POINTER codename's id from the deck's registry - the same
 *  value the virtual-rule-card fallback map carries when the Pointer card
 *  is not warm. */
const POINTER_TYPE = { typeId: 34843, typeName: "Pointer", typeCode: "pointer" } as const;

/** The live deck's Pointer cardtype: the deck-fetched Pointer card's id when
 *  it is warm (the codename card is in every deck), else the fallback. */
function pointerTypeOf(ctx: ViewContext): {
  typeId: number;
  typeName: string;
  typeCode: string;
} {
  const pointer = ctx.fmt.engine.fetchRenderCard("Pointer");
  if (pointer !== undefined && pointer.id !== undefined && pointer.unknown !== true) {
    return { typeId: pointer.id, typeName: "Pointer", typeCode: "pointer" };
  }
  return POINTER_TYPE;
}

/** The TPR anchor's left type for the view's NEW rule card
 *  (pattern/class_methods.rb:59-71 left_type -> quick_type): the new
 *  card's parts are unfetched (rule.left is nil on a new card), so
 *  the superleft arm answers nil and quick_type decides -
 *  Card.fetch(left_name, skip_modules: true, new: {}).type_name. The
 *  skip-modules arm excludes the set-module assign_type answers
 *  (X+*self's Right::Self -> Set never applies), so the type falls to
 *  type_id_from_template (type.rb:78-80) - the applicable *default rule
 *  card's OWN type. The first existing *default candidate on the follow
 *  rule's left is the ALL-set default `*all+*default`, itself a RichText
 *  card - hence the TYPE_PLUS_RIGHT-rich_text-Xfollow set-key token. */
function quickTypeLeftTypeName(ctx: ViewContext, ruleName: string): string {
  const leftName = DeckoName.parse(ruleName).leftName;
  if (leftName === undefined) return "RichText"; // Card.default_type_id's cardtype
  const input: PatternCardInput = { name: leftName.s, isNew: true };
  for (const candidate of ruleNamesForCard(input, "*default")) {
    const rule = ctx.fmt.engine.fetchRenderCard(candidate);
    if (rule === undefined) continue; // candidate default rule does not exist
    if (rule.typeName !== undefined) return rule.typeName;
  }
  return "RichText";
}

/** A NEW-card RenderCard (Card.fetch mark, new: {...}): id-less, isNew,
 *  empty content, pointer type. setKeys through the same safeSetKeys input
 *  the enrichment builds (the RULE token from the preference? predicate -
 *  render.ts computeIsRule's shape: right part a Setting, [0..-3] a Set,
 *  the [-2] preferer a User). */
function newCardRenderCard(
  mark: string,
  opts: { typeId: number; typeName: string; typeCode: string },
  leftTypeName: string | undefined,
  isRule: boolean,
): RenderCard {
  const name = DeckoName.parse(mark);
  const record: CardRecord = {
    id: undefined,
    codename: undefined,
    leftId: undefined,
    rightId: undefined,
    typeId: opts.typeId,
    dbContent: "",
    trash: false,
    creatorId: undefined,
    updaterId: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    currentRevisionId: undefined,
    readRuleClass: undefined,
    readRuleId: undefined,
    referencesExpired: undefined,
    name,
    key: name.key,
    isNew: true,
    fromTrash: false,
    uncacheable: false,
  };
  return {
    record,
    name,
    key: name.key,
    typeName: opts.typeName,
    typeId: opts.typeId,
    typeCode: opts.typeCode,
    id: undefined,
    dbContent: "",
    setKeys: safeSetKeys({
      name,
      typeId: opts.typeId,
      typeName: opts.typeName,
      leftTypeName,
      isRule,
      isNew: true,
    }),
  };
}

/** following.rb:40-43 preference_name + :49-51 current_follow_rule_card +
 *  :32-38 view :rule_editor, cache: :never:
 *    rule_context = Card.fetch preference_name, new: { type_id: PointerID }
 *    wrap_with :div, class: "edit-rule" do
 *      follow_context = current_follow_rule_card || rule_context
 *      subformat(follow_context).rule_form :open, rule_context, :modal
 *    end
 *  current_follow_rule_card is the APPLIED rule's CONTENT STRING (rule/
 *  all.rb:17-19 - never a card), so the string arm of subformat
 *  (format/nesting/subformat.rb:57-61 subformat_card -> Card.fetch arg,
 *  new: {}) fetches the OPTION CARD ("*always"/"*never"/...) as the
 *  rule_form target while rule_context stays the preference_name card.
 *  The seam (FOLLOW_SEAM_VIEWS "rule_editor") resolves the session actor,
 *  the applied content, and pre-warms both target cards into the render
 *  map (render.ts). The rule_form dispatch itself is the rules mod's
 *  ported surface (card-mod-rules.ts ruleFormView - form_type/success_
 *  view/rule_context ride the voo opts; editRuleSuccessHash reads the
 *  rule_context mark per rule_form.rb:48+66-69). */
const ruleEditorView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  const bundle = followBundle(ctx);
  const leftName = fmt.card.name.leftName?.s;
  if (leftName === undefined) {
    // card.left nil -> preference_name's nil deref in Ruby; the view only
    // reaches junction cards through the chain (registered on the RIGHT
    // set pattern), so this is the degenerate direct-render corner.
    throw new Error("rule_editor: card.left missing");
  }
  const prefName =
    bundle?.ruleEditorPreferenceName ??
    (() => {
      // the seam-less fallback: the plain-card follow set + "Anonymous"
      // (Auth.current.name, current.rb:24 - Card[AnonymousID] is the
      // Anonymous card in every deck)
      const leftCard = fmt.engine.fetchRenderCard(leftName);
      const setName = followSetCardName(leftName, leftCard?.typeCode);
      return followRuleNameFor(setName, "Anonymous");
    })();
  let ruleContext = fmt.engine.fetchRenderCard(prefName);
  if (ruleContext === undefined) {
    // Card.fetch preference_name, new: { type_id: PointerID } - the deck
    // holds no such rule card yet; the in-memory pointer card
    ruleContext = newCardRenderCard(
      prefName,
      pointerTypeOf(ctx),
      quickTypeLeftTypeName(ctx, prefName),
      true,
    );
  }
  const applied = bundle?.leftFollowPreference;
  const targetName = applied ?? prefName;
  let target = fmt.engine.fetchRenderCard(targetName);
  if (target === undefined) {
    // subformat's string arm: Card.fetch "<content>", new: {} - the option
    // card missing from the deck (no follow-option seeds): the new-card arm
    target = DeckoName.parse(targetName).isSimple
      ? newCardRenderCard(
          targetName,
          // the Setting cardtype (virtual-rule-card.ts's cited Setting id)
          { typeId: 278, typeName: "Setting", typeCode: "setting" },
          undefined,
          false,
        )
      : newCardRenderCard(targetName, pointerTypeOf(ctx), quickTypeLeftTypeName(ctx, targetName), true);
  }
  const sub = new RenderFormat(target, fmt.engine, { parent: fmt });
  return (
    `<div class="edit-rule">` +
    sub.renderView("rule_form", {
      success_view: "open",
      form_type: "modal",
      rule_context: prefName,
      // right/follow.rb:119-121 rule_form_args override - the follow
      // rule's form hooks the follow_section foreign slot (the same opt
      // channel rule_form's success_view/form_type/rule_context ride)
      data_update_foreign_slot: ".card-slot.follow_section-view",
    }) +
    `</div>`
  );
};

// --- set/type_plus_right/user/follow.rb view :errors -------------------------

/** user/follow.rb:65-78 view :errors, perms: :none - the SIGN-IN frame arm:
 *  voo.title = "Problems with #{card.name}", class_up "d0-card-frame",
 *  "card card-warning card-inverse", frame { "Please #{link_to_card
 *  :signin, 'sign in'}" }. The frame chrome is the established framedView
 *  composition (bootstrap class_ups + standard_frame + with_frame - the
 *  demo view's, format family); this core returns the arm's PIECES
 *  (title/classy/body).
 *  The arm runs only on a FAILED-SAVE re-render (card.errors carries the
 *  permission denial) - the write path the headless engine does not model
 *  (RenderCard carries no error state), so the REGISTERED view body's
 *  reachable arm is the no-errors "" below; this core exists for the test
 *  seam + the eventual write-path consumer. */
function userFollowErrorsPermissionArm(cardName: string): {
  title: string;
  classy: string;
  body: string;
} {
  return {
    title: `Problems with ${cardName}`,
    classy: "card card-warning card-inverse", // class_up appends
    body: `Please <a href="/Sign_in">sign in</a>`, // link_to_card :signin - the account seeds' "Sign in" card, links.rb:101-106 (href LAST)
  };
}

/** user/follow.rb:65-78 view :errors, perms: :none:
 *    return unless card.errors.any?
 *    ...permission_denied -> the sign-in frame... else super()
 *  card.errors is ActiveRecord error state - the headless engine's render
 *  path carries none (a fetched card never holds errors), so `return
 *  unless card.errors.any?` is the arm EVERY engine render hits: nil. The
 *  view answers nil (ViewResult null), which the render boundary carries
 *  verbatim as {"html":null} (the composed adapter's renderRaw).
 *  The permission arm (userFollowErrorsPermissionArm) is the failed-save
 *  re-render's; the super() arm dispatches the chain's all-set definition
 *  (card-mod-format set/all/error.rb:28-30, "Problem:\n\n" + error_
 *  messages - imported here: the type_plus_right registration SHADOWS it
 *  for User+*follow cards, set specificity, and Ruby's super() walks to
 *  exactly that definition). Registering the view is Ruby-true: the chain
 *  dispatch already picks the most specific set module. */
const userFollowErrorsView: ViewFn = (ctx) => {
  // the engine models no card-error state: errors.any? is false, so the
  // `return unless` arm answers nil.
  void ctx;
  return null;
};

/** The follow views' TEST SEAM - the composition cores the test file
 *  (the follow harness probe suite, not in the public package) exercises against the Ruby semantics; the same functions
 *  the view bodies call. */
export const followProbeSurface = {
  /** base_views.rb:41-43 the follower fallback (the page arm). */
  followerFrom(): string {
    return str(followerNotifyView({} as ViewContext));
  },
  /** base_views.rb:25-31 the subedit_notice composition over a documented
   *  action shape (an Action double): the test hands the
   *  header name + the changed-field rows the seam reader would return. */
  subeditNoticeFrom(input: {
    headerName: string;
    actionType: "create" | "update" | "delete";
    rows: readonly { field: "name" | "cardtype" | "content"; shown: string; label: string }[];
  }): string {
    const rows = input.rows
      .map((r) => `  ${r.label} ${r.field}: ${r.shown}\n`)
      .join("");
    return `\n${input.headerName} ${input.actionType}d\n${rows}\n`;
  },
  /** following.rb:32-38 the wrap + dispatch contract: the test hands the
   *  target/rule-context marks; the echo documents the dispatch contract
   *  (the rules mod's ruleFormView owns the form bytes). */
  ruleEditorDispatchFrom(input: {
    targetName: string;
    ruleContextName: string;
  }): { targetName: string; ruleContextName: string; successView: string; formType: string } {
    return {
      targetName: input.targetName,
      ruleContextName: input.ruleContextName,
      successView: "open",
      formType: "modal",
    };
  },
  /** user/follow.rb:65-78 the permission arm's pieces. */
  userFollowErrorsPermissionArm(cardName: string): {
    title: string;
    classy: string;
    body: string;
  } {
    return userFollowErrorsPermissionArm(cardName);
  },
  /** user/follow.rb:76-78 the super() arm: the chain's all-set BASE
   *  definition (card-mod-format set/all/error.rb:28-30) - the body the
   *  type_plus_right registration shadows for User+*follow cards. Not
   *  reachable from an engine render (the view's first line returns
   *  unless card.errors.any?, and the engine models no error state); it
   *  is the oracle's scenario-11 contract. */
  errorsSuperBytes(): string {
    return str(formatErrorsView({} as ViewContext));
  },
};

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

/** The set-module predicates the follow mod's `when:` conditions reach with
 *  `send` (set/event/all.rb:82), merged into the deck table
 *  (default-mod-deck.ts). */
export const followModEventPredicates = {
  /** silence_notifications? (mod/follow/set/all/notify.rb:9-11):
   *  `!(Card::Env.controller || force_notifications)`. force_notifications
   *  is a mattr_accessor (notify.rb:3) that nothing in the port sets, so
   *  only the controller arm varies. The engine's saves serve controller
   *  requests (envController true), so this is false and notifications
   *  stay on, as they do in Ruby's request saves. */
  "silence_notifications?": (card: ModEventCard): boolean =>
    card.envController !== true && card.forceNotifications !== true,
  /** notable_change? (notify.rb:36-41): `!silent_change? &&
   *  current_act_card? && (Card::Auth.current_id != DeckoBotID) &&
   *  followable?`.
   *
   *  The `followable?` arm is Ruby's per-card-type notification opt-out;
   *  the port has no such type-level setting, and its notify pipeline
   *  carries the same absence (follow-notify.ts's isNotable states the
   *  drop). Absent = followable, so the answer is what it is for every
   *  card type the port has.
   *
   *  DECKO_BOT_ID is 1 (auth/boot-seed.ts:132): a change made by the bot
   *  itself does not notify, or the deck would notify itself in a loop. */
  "notable_change?": (card: ModEventCard): boolean =>
    card.silentChange !== true &&
    card.isActCard !== false &&
    card.authCurrentId !== DECKO_BOT_ID,
  /** expire_preferences? (set/all/follow/follower_ids.rb:15): the act's
   *  `@expire_preferences_scheduled` flag, set by
   *  schedule_preference_expiration (:11). Gates
   *  :expire_preferences_cache (:19), which drops the followers' rule
   *  caches. The flag rides the act; the port's follower rule walk
   *  invalidates on save regardless, so a save that scheduled nothing
   *  has no cache to expire and the predicate is false. */
  "expire_preferences?": (card: ModEventCard): boolean =>
    card.expirePreferences === true,
} as const;

/** DeckoBotID — the deck's system account, id 1 (auth/boot-seed.ts:132). */
const DECKO_BOT_ID = 1;

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
    {
      ...passiveSetModule("all/follow/follower_ids"),
      // Ruby caches follower ids and the preference index and expires them
      // on these saves. The port keeps NO follower cache: notify/follower-resolver.ts
      // rebuilds the preference index per resolution — preferenceRows (:279)
      // issues the preference SQL on every resolveFollowers (:480) walk, and
      // the module holds no state across calls. There is therefore nothing
      // for these two events to expire.
      //
      // Both are declared as NAMED REMAINDERS (event(), not engineOwnedEvent):
      // no engine code implements a cache-expiry step here, so an
      // engineOwnedEvent would assert an owner the port does not have. The
      // observable effect is identical either way — the next notification
      // sees fresh followers, which is what Ruby's expiry produced.
      events: [
        event({ event: "cache_expired_for_type_change", at: "store", on: ["update"], changed: ["type_id", "name"] }),
        event({ event: "expire_preferences_cache", at: "finalize", when: "expire_preferences?" }),
      ],
    },
    passiveSetModule("all/follow/follow_link"),
    {
      // card-mod-follow-0.20.0/set/all/follow/follow_link_views.rb -
      // format :html do follow_button + follow_modal_link + view
      // :follow_button, cache: :never; format :json do view
      // :follow_status. The :follow_button view's body is the literal
      // link_to call on FollowLink#button, ported by followButtonView.
      // JSON follow_status calls an INSTANCE method on the CLASS and
      // raises NoMethodError in both branches, captured by the tranche-6
      // oracle. No successful hash answer exists in the pinned source.
      setPath: "all/follow/follow_link_views",
      formats: {
        html: {
          views: [{ view: "follow_button", viewFn: followButtonView, config: { cache: "never" } }],
        },
      },
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
      // The notify events run in the engine (notify/follow-notify.ts, the
      // save path's follow hook; the delete arm reads the trashed card;
      // notify/follower-stash.ts): one mail per follower about the act,
      // at integrate_with_delay for saves and integrate for deletes.
      // Notifications reach only the host's transport, so a save outside a
      // request (no transport) sends nothing, which is the effect of
      // silence_notifications.
      events: [
        // silence_notifications (notify.rb:9-11 `event :silence_notifications,
        // :initialize, when: :silence_notifications?`) — engine: the
        // predicate that gates it lives in THIS mod file, not in
        // notify/follow-notify.ts — followModEventPredicates
        // "silence_notifications?" (card-mod-follow.ts:1302-1309:
        // `!(envController || force_notifications)`; envController rides the
        // save-path event the engine builds at card-action-engine.ts:4516 and
        // :4770). notify/follow-notify.ts carries no silence_notifications arm —
        // the name occurs nowhere in that file. Its `silent*` matches are
        // the silent_change? machinery (:122 doc, :126, :269), prose about
        // SKIPPING a send (:155, :179) and the Ruby header (:9); isNotable
        // (:125-129) gates on event.silent, which is silent_change? — a
        // different event.
        engineOwnedEvent({ event: "silence_notifications", at: "initialize", when: "silence_notifications?" }),
        engineOwnedEvent({
          event: "notify_followers_after_save",
          at: "integrate_with_delay",
          on: ["save"],
          priority: 20,
          when: "notable_change?",
        }),
        engineOwnedEvent({ event: "stash_followers", at: "store", on: ["delete"], when: "notable_change?" }),
        engineOwnedEvent({ event: "notify_followers_after_delete", at: "integrate", on: ["delete"], when: "notable_change?" }),
      ],
    },
    {
      // card-mod-follow-0.20.0/set/all/notify/base_views.rb - the BASE
      // format's notification views (:list_of_changes, :subedits,
      // :subedit_notice, :followed, :follower, :last_action_verb,
      // :unfollow_url). The bare `format do` block (base_views.rb:1) files
      // these modules on Card::Format ITSELF (register_all_set_format keyed
      // on the base format class, card-1.110.0 lib/card/set/format.rb:
      // 142-144; process_base_format_modules, registrar.rb:79-84, mixes
      // them into the class EVERY format inherits) - the notify verb is
      // visible to EmailTextFormat/TextFormat/every format, shadowed by an
      // own-format registration only (html's history verb,
      // card-mod-history set/all/history/views.rb:55-65, wins IN html).
      // Registered under the manifest's documented "base" format key
      // (mod-manifest.ts:286-288) and surfaced through the anchorless
      // chain walk's base tail (mod-loader.ts viewChain).
      // The email mod's
      // email_text :last_action DELEGATES to this verb
      // (email_text.rb:12 `_render_last_action_verb`; see
      // card-mod-email.ts emailTextLastActionView for the full chain
      // read). :last_action_verb is ported single-source
      // (render/views.ts#lastActionVerbNotifyView - the same fn the flat
      // record carries). :subedit_notice + :follower
      // join the base registrations - :subedit_notice through the history
      // seam (render.ts HISTORY_SEAM_VIEWS gates it; the REAL rows from
      // card.last_action/Action.fetch - base_views.rb:25-31), :follower
      // the page arm of `active_notice(:follower) || "follower"` (:41-43,
      // the send-path ivar is the same disclosed basis the flat record's
      // followed/unfollow_url arms carry). :list_of_changes
      // (card.last_action's rows, the HTML
      // <li> override) and :subedits (the nil notification_act arm, "") -
      // both join the base registrations. STILL unregistered:
      // :followed/:unfollow_url - they read the active_notice state the
      // email-delivery path sets up (rails-runtime; the flat record
      // carries the ported bodies where they exist - the page-arm
      // contracts the flat record documents).
      setPath: "all/notify/base_views",
      formats: {
        base: {
          views: [
            {
              view: "last_action_verb",
              viewFn: lastActionVerbNotifyView,
              config: { cache: "never" },
            },
            {
              view: "subedit_notice",
              viewFn: subeditNoticeView,
              config: { cache: "never" },
            },
            {
              view: "list_of_changes",
              viewFn: listOfChangesNotifyView,
              config: { cache: "never", denial: "blank" },
            },
            {
              view: "subedits",
              viewFn: subeditsNotifyView,
              config: { cache: "never", perms: "none" },
            },
            {
              view: "follower",
              viewFn: followerNotifyView,
              config: { cache: "never" },
            },
          ],
        },
      },
    },
    {
      // card-mod-follow-0.20.0/set/all/notify/html_views.rb - format
      // :html do block: wrap_list / wrap_list_item / wrap_subedit_item
      // overrides (HTML <ul>/<li>/<li> wrappers for the notification
      // email). NOT ported: the email-template surface (write path).
      // The html VIEWS ride the same set module (the base-format views
      // surface through the chain walk where no own-format arm exists):
      // list_of_changes' action rows and subedits' nil-act arm render
      // here, where the flat-record page arms (render/views.ts) answered ""
      // and the {{_|subedits}} literal is the NEST posture's
      // authored-syntax answer.
      setPath: "all/notify/html_views",
      formats: {
        html: {
          views: [
            {
              view: "list_of_changes",
              viewFn: listOfChangesNotifyView,
              config: { cache: "never", denial: "blank" },
            },
            {
              view: "subedits",
              viewFn: subeditsNotifyView,
              config: { cache: "never", perms: "none" },
            },
          ],
        },
      },
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
      // cache_expired_for_new_preference —
      // STUB with an architecture reason (right/follow.rb:7-9): the body
      // is Card.follow_caches_expired (clears the FOLLOWER_IDS +
      // preference caches); the port's follower resolution
      // (notify/follower-resolver.ts) queries the reference + preference
      // rows FRESH per call — there is no cache to expire.
      // AUDIT 2026-10-20 (events tranche 5, register events-table row):
      // the no-op IS the Ruby-faithful disposition, and it is measured,
      // not asserted —
      // tests/card/mod-loader/card-mod-follow-cache-expired-events.test.ts
      // pins the clauses, the when: :preference? gate, and the
      // EQUIVALENCE both this event and follow_fields_changed exist to
      // guarantee (a preference-row change is visible to the NEXT
      // follower read; the port gets that by never memoizing). No Ruby
      // engine ran for this row; the equivalence is inferred from the two
      // one-line bodies and Ruby's cache contract, stated as such.
      events: [
        event({ event: "cache_expired_for_new_preference", at: "integrate", when: "preference?" }),
      ],
      formats: {
        html: {
          views: [
            { view: "follow_status", viewFn: followStatusView, config: { cache: "never" } },
            { view: "follow_item", viewFn: followItemView, config: { cache: "never" } },
          ],
        },
      },
    },
    {
      // card-mod-follow-0.20.0/set/right/followers.rb - include_set
      // Abstract::List + format :html do view :core, cache: :never do
      // super() end + content method (left ? item_names.to_pointer_content
      // : "") + item_names helper (left ?
      // left.follow_set_card.prototype.follower_names : []) + virtual?.
      // Ported: :core (the literal super() passthrough), the `def content`
      // override (followersContentFn) and the `virtual?` override
      // (followers.rb:22-24 `def virtual?; new?; end`).
      setPath: "right/followers",
      virtual: true,
      // include_set Abstract::List (followers.rb:5) — the abstract list set's
      // OWN `assign_type :list`, reached through the include. The TS mod
      // loader keeps set-module registrations flat (mod-registrar.ts
      // DIVERGENCE 2: no include_set seam), so the assignment is declared
      // here, on the file that pulls the module in. MEASURED against the
      // stock Ruby oracle: `/Home+*followers` is TYPE-list, and its pointer
      // list is what renders the follower names.
      assignsType: "list",
      // followers.rb:5 `include_set Abstract::List` and :8-10 `view :core,
      // cache: :never do super() end` — the file declares NO assign_type of
      // its own and hands :core straight to the list set, so the card RETAINS
      // its list type and the Abstract::List core renders with the overridden
      // raw as its ITEM SOURCE (views.ts's list item walk reads
      // resolveContentOverride(fmt) ?? dbContent). supersedesType: false is
      // that reading; left at the default true the override bytes would
      // REPLACE the pointer-list core instead of feeding it.
      contentOverrides: [{ fn: followersContentFn, supersedesType: false }],
      // The anchor is the STARRED codename card `*followers`, whose Decko key
      // is `*follower` — so the pure-name cardBelongsToSet compares
      // `right/followers` against `*follower` and never matches (MEASURED).
      // Ruby asks "is Right::Followers in this card's chain?" instead
      // (base.rb:21-29 module_key over :40-44 anchor_codenames), which the
      // card's own set keys answer: `RIGHT-Xfollower` -> `*follower` ->
      // codename `followers` -> `Right::Followers`.
      membership: "set-module-chain",
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
      // :one_line_content (""). :rule_editor is ported too -
      // the wrap + preference_name + applied-string dispatch (the rules
      // mod's ruleFormView owns the form bytes; the seam's rule_editor
      // branch resolves the actor + the applied content + the warm).
      // :status + :rule_editor carry unknown: true -
      // in Ruby EVERY X+*following card is virtual-known (the set
      // module's own `def virtual?; new?; end`, right/following.rb:4-6),
      // so alter_unknown never fires and the views always dispatch; the
      // headless engine's fetch does not model the set-module virtual
      // mechanism (documented remainder), and the unknown-capable config
      // is what lets the same dispatch happen here (the unknown card's
      // denial check still runs - permission.rb:22-23).
      setPath: "right/following",
      // right/following.rb:4-6 `def virtual?; new?; end`
      virtual: true,
      // assign_type :list (following.rb:1) — verbatim.
      assignsType: "list",
      formats: {
        html: {
          views: [
            { view: "status", viewFn: followingStatusView, config: { unknown: true } },
            { view: "one_line_content", viewFn: followingOneLineContentView },
            {
              view: "rule_editor",
              viewFn: ruleEditorView,
              config: { cache: "never", unknown: true },
            },
          ],
        },
      },
    },
    {
      // card-mod-follow-0.20.0/set/right/follow_fields.rb - assign_type
      // :list + event :follow_fields_changed.
      // Event — STUB, same architecture
      // reason as right/follow's cache_expired_for_new_preference
      // (follow_fields.rb:3-5: the body is Card.follow_caches_expired;
      // the port resolves followers fresh per call). AUDIT 2026-10-20
      // (events tranche 5): same disposition, same measurement — the
      // card-mod-follow-cache-expired-events.test.ts equivalence arm
      // covers this row too (the *never -> *always flip is visible to
      // the next read with no expiry call).
      setPath: "right/follow_fields",
      events: [event({ event: "follow_fields_changed", at: "integrate" })],
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
      // Ported: :confirm_update_all (the alert literal) AND :edit_buttons
      // (the confirm + button_formgroup + the three buttons). Neither is
      // REACHABLE for this card - the singularized self-anchor token vs the
      // FollowDefaults constant; the set-key walk is documented in the
      // honest remainder above. The port's raise is Ruby-true.
      setPath: "self/follow_defaults",
      // update_follow_rules — STUB, named
      // remainder (self/follow_defaults.rb:17-30, the card's own header
      // says DEPRECATED): the triggered body rewrites every user's follow
      // rule for the listed sets (Auth.as_bot bulk Card.search + per-user
      // rule saves); the port has no bulk-rule-rewrite surface and the
      // mechanism is deprecated upstream.
      // AUDIT 2026-10-20 (events tranche 5, register events-table row)
      // SKIPS THIS ROW BY NAME on two VERIFIED facts, not on the
      // deprecation note alone:
      // (1) UNREACHABLE THROUGH THE SERVING PATH: `trigger: :required`
      // fires only when the act's trigger list names the event
      // (set/event/skip_and_trigger.rb:86-90), and the trigger name
      // arrives from card[trigger] — the button at :24-30 posts exactly
      // that. The port's write route parses five named triggers
      // (send_reset_password_token, reset_password,
      // verify_and_activate, approve_with_verification,
      // approve_without_verification — write-routes.ts:1432/:1760/:1989/
      // :1996) and update_follow_rules is NOT among them, so the trigger
      // list the act carries can never name this event on a served save.
      // (2) THE BODY HAS NO DIVERGENCE-FREE PORT: it drops "*never" +
      // "*always", adds the option card, and saves EVERY user's follow
      // rule — a nested bulk write whose per-rule saves must ride the
      // engine's own write path (validations, references, act rows). The
      // mod-event seam is single-card; a direct db_content UPDATE would
      // bypass exactly the machinery Ruby's save! runs.
      // Per the parity law: named, never faked — the fn stays the
      // honest stub carrying this evidence.
      events: [
        event({ event: "update_follow_rules", at: "finalize", on: ["save"], trigger: "required" }),
      ],
      formats: {
        html: {
          views: [
            { view: "confirm_update_all", viewFn: confirmUpdateAllView },
            { view: "edit_buttons", viewFn: followDefaultsEditButtonsView },
          ],
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
      // set.rb:1 expires the follower caches for a new set. The port keeps none
      // (notify/follower-resolver.ts rebuilds the preference index per
      // resolveFollowers call) — a NAMED REMAINDER, not engineOwnedEvent, for
      // the same reason as all/follow/follower_ids above: no engine cache to
      // expire, same observable outcome.
      events: [event({ event: "cache_expired_for_new_set", at: "store", on: ["create"] })],
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
      // Ported: :one_line_content (""), :edit (render :open dispatch),
      // :follow_tab + :ignore_tab (the seam's followEditorRows walk),
      // :core (the FOLLOW_TABS tab machinery - the
      // card-mod-tabs `tabs` helper over the static hash, active pane
      // rendering :follow_tab; the oracle's :core opens at the
      // tabbable tab-panel div, not the pointer list).
      // :errors is ported - the no-errors arm (the ONLY
      // arm a headless render reaches: the engine models no ActiveRecord
      // error state, so `return unless card.errors.any?` returns nil -> "")
      // registered as the reachable arm; the permission arm's pieces live in
      // userFollowErrorsPermissionArm and the super() arm
      // dispatches card-mod-format's all-set body (the chain definition
      // this registration shadows for User+*follow cards - set
      // specificity, Ruby-true). The remaining unported helper surface
      // (rules_and_options_by_set_pattern / a_set_pattern_hash class-side
      // walks) feeds the already-ported tabs.
      setPath: "type_plus_right/user/follow",
      // include_set Abstract::List (user/follow.rb:7) — the abstract list
      // set's own `assign_type :list`, reached through the include (see the
      // right/followers note). MEASURED: `/Ada Admin+*follow` is TYPE-list.
      assignsType: "list",
      // user/follow.rb:8-10 `def virtual?; new?; end` — every unsaved
      // `<User>+*follow` card is KNOWN, so the address renders the Follow /
      // Ignore tabs instead of the create form (MEASURED against the stock
      // Ruby oracle on the synthetic-v1 fixture).
      virtual: true,
      // user/follow.rb:13-19 `def item_names` — the pointer list over the
      // user's follow preference rule cards, i.e. the "all followed cards"
      // content the board's follow_overview_button opens.
      contentOverrides: [{ fn: userFollowContentFn, supersedesType: false }],
      // Same starred-anchor reason as right/followers above: the anchor is
      // the STARRED codename card `*follow` (key `*follow`), so the pure-name
      // cardBelongsToSet has no `type_plus_right` arm to reach it at all.
      membership: "set-module-chain",
      formats: {
        html: {
          views: [
            { view: "one_line_content", viewFn: userFollowOneLineContentView },
            { view: "edit", viewFn: userFollowEditView },
            { view: "core", viewFn: userFollowCoreView },
            { view: "follow_tab", viewFn: followTabView, config: { cache: "never" } },
            { view: "ignore_tab", viewFn: ignoreTabView, config: { cache: "never" } },
            { view: "errors", viewFn: userFollowErrorsView, config: { perms: "none" } },
          ],
        },
      },
    },
    passiveSetModule("type_plus_right/user/follow/follow_editor_helper"),
  ],
};

export default cardModFollow;
