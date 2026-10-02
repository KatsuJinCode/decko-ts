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
// NOT ported (honest remainder, updated lane follow2 2026-09-29):
// - all/follow/followed_by + follower_ids: the READ half the views need
//   IS ported now (src/card/follow/follow-rule-walk.ts reusing the notify
//   lane's algebra from src/card/notify/follower-resolver.ts) INCLUDING
//   the *nests arm of followed_field? (the inclusion search through
//   card_references, lane follow2); the WRITE halves that remain are the
//   follower_ids CACHE (Card.cache / Rails.cache) and the notify lane's
//   own indirect-follower walk (follower-resolver.ts's header gap - the
//   notify lane reads this same machinery through its own port).
// - follow_link.rb modal_link (:14-22): the data-bs-toggle/data-bs-target
//   modal machinery (bootstrap-modal surface).
// - all/follow/follow_link_views.rb format :json view :follow_status
//   (:11-14): the GEM BODY CALLS A MISSING METHOD - `follow_link_class
//   .link_opts` fires link_opts on the FollowLink CLASS, but
//   follow_link.rb:36 defines link_opts only as an INSTANCE method; Ruby
//   raises NoMethodError as written. Porting the raise would pin a guess
//   about intent (no oracle capture exists); named here, not guessed.
// - all/notify.rb events + the notify base/html views (:list_of_changes,
//   :subedits, :subedit_notice, :followed, :follower, :last_action_verb,
//   :unfollow_url): the notification EMAIL-template surface - the bodies
//   read active_notice inherited from the email render context,
//   Action.value walks, and card_url (all named by the token-runtime
//   receipt too); the write-path events are the notify stream's.
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
// - right/follow.rb: view :follow_status + :follow_item ARE PORTED now
//   - the forms ride src/card/follow/follow-form-shapes.ts
//   (the captured edit-form bytes + form_tag_helper shapes); the permit/
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
//   2026-09-30: BOTH views are now ported (followDefaults
//   EditButtonsView below, registered at the self/follow_defaults manifest
//   entry) - and BOTH are UNREACHABLE for their own card, in Ruby exactly
//   as here. 09_self.rb anchors the SELF pattern on card.name, and
//   Cardname#safe_key (cardname-0.20.0 lib/cardname/variants.rb:19) is
//   `key.tr("*","X")` over the SINGULARIZED key, so the card
//   "*follow defaults" carries the token SELF-Xfollow_default while this
//   file declares the constant FollowDefaults. Live capture (benchmarks/
//   capture-readonly-follow-defaults-and-core-shape.rb -> fixtures/
//   captured/readonly-follow-defaults-and-core-shape.json, card_actions
//   5018 == 5018 around every render): safe_set_keys "ALL TYPE-list STAR
//   SELF-Xfollow_default", ancestors grep(/FollowDefault/) = [], and :core
//   / :confirm_update_all / :edit_buttons all render the anonymous denial
//   span. Same marker class as the api_key RIGHT-X star below - the port
//   raises UnsupportedViewError, which is Ruby-true.
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
//   follow_item body the right/follow set module registers. STILL NOT
//   PORTED here: view :core (:39-43 - the signed-in arm dispatches the
//   rules mod's :rule_editor through subformat; card-mod-rules owns
//   rule_form, still unported) and view :errors (:65-78 - the body's
//   meaning is card.errors state the headless engine does not model;
//   registering the no-errors arm would mask card-mod-format's :errors
//   chain entry on the one branch that gives the view its purpose). The
//   suggestions arm of the editor walk (follow_editor_helper.rb:83-90,
//   Card[:follow_suggestions] merge) IS PORTED now (lane follow2 - the
//   seam's suggestedFollowingRuleOptions + mergeOptionHashes, gated on
//   current_user?; the set-only suggestion arm stays unported: Ruby's
//   a_set_only_suggestion yields to a no-block call site and raises
//   LocalJumpError as written).
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
  type RenderCard,
  type ViewContext,
  type ViewFn,
} from "../../render/format.js";
import { modSlotWrap } from "../mod-view-helpers.js";
import { HTML_VIEWS, lastActionVerbNotifyView } from "../../render/views.js";
import { DeckoName } from "../../name.js";
import type {
  DeckoModManifest,
  ModSetModuleFile,
} from "../mod-manifest.js";
import { followOptionDescription } from "../../follow/follow-options.js";
import {
  buttonTag,
  cardFormOpen,
  CARD_FORM_CLOSE,
  followPath,
  hiddenTags,
  linkTo,
  output,
  successTags,
} from "../../follow/follow-form-shapes.js";
import type {
  FollowRenderBundle,
  FollowTabRow,
} from "../../follow/follow-render-seam.js";

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

// ===========================================================================
// lane-follow (2026-09-28): the follow views whose bodies the follow-rule
// read/walk + the form shapes + the actor-session seam render. Every body
// below cites its gem lines; the bytes are RENDERED-UNPINNED (the capture
// corpus carries no Ruby-oracle bytes for any follow view name - verified
// against tmp/raw-ground-truth/expected/recapture-raw-shard-*.jsonl).
// ===========================================================================

// --- shared body helpers ---------------------------------------------------

/** The slot wrap (set/all/html/wrap.rb:6-13 `wrap slot=true`) for bodies
 *  composed outside a ViewFn (the subformat rows): a fresh voo, the shared
 *  modSlotWrap emitter (byte-identical to the core slotWrap by
 *  construction - mod-view-helpers.ts header). */
function slotWrap(fmt: RenderFormat, view: string, inner: string): string {
  return modSlotWrap({ fmt, voo: new Voo(undefined, view, {}) }, view, inner);
}

/** set/type/set.rb:9-15 follow_label: subclass_for_set.short_label(
 *  name.left_name); set/all/follow.rb:6-8 default: `name`. The pattern
 *  short labels live in src/card/set-patterns/labels.ts (selfShortLabel
 *  returns the anchor unchanged; 09_self.rb:5-7 short_label = name). */
function followLabelOfRuleSet(ruleSetName: string): string {
  const name = DeckoName.parse(ruleSetName);
  const tag = name.tagName;
  if (tag !== undefined && tag.s.startsWith("*") && !name.isSimple) {
    return name.leftName?.s ?? ruleSetName; // the short_label(anchor) arm
  }
  return ruleSetName; // all/follow.rb:6-8 the plain-card arm
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
 *  lines - the deck stores BARE option names (corpus truth: "Make
 *  Contact+*self+Brandon WilliamsCraig+*follow" content "*always"). */
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
 *  :check) is the material-icons <i> (the literal name passes through). */
function followItemButton(card: RenderCard, condition: string): string {
  const add =
    card.id === undefined || !followRuleItems(card).includes(condition);
  const cls = add ? "btn-item-add" : "btn-item-delete btn-primary";
  const icon = add ? "add" : "check";
  return buttonTag(`<i class="notranslate material-icons">${icon}</i>`, {
    class: `btn-sm btn-item ${cls}`,
    ariaLabel: "Left Align",
  });
}

/** right/follow.rb:107-123 follow_item_link: link_to_card(target, text);
 *  text = option_card.description(rule_set) || rule_set.follow_label
 *  (follow_option.rb abstract description + the created/edited overrides
 *  live in follow-options.ts). */
function followItemLink(ruleSetName: string, condition: string): string {
  const target = followItemLinkTarget(ruleSetName);
  const setLabel = followLabelOfRuleSet(ruleSetName);
  const text = condition.startsWith("*")
    ? followOptionDescription(condition.slice(1), setLabel)
    : setLabel;
  return linkTo(text, followPath(DeckoName.parse(target).urlKey));
}

/** right/follow.rb:67-78 follow_item condition, button=true - the body the
 *  :follow_item view and the User+*follow editor rows render:
 *  card_form action: :update, success: {view: :follow_item} (form.rb:193-200)
 *  = success hidden tags + the [hidden_tags, (button), link].compact body
 *  newline-joined (content.rb:68-70), wrapped by `wrap do ... end` - the
 *  slot div (set/all/html/wrap.rb:6-13, slot=true). */
function followItemHtml(
  fmt: RenderFormat,
  condition: string,
  button: boolean,
  wrapView: string,
): string {
  const card = fmt.card;
  const form =
    cardFormOpen({
      formId: card.id !== undefined ? `edit_card_${card.id}` : "new_card",
      action: followPath(card.name.urlKey, { action: "update" }),
    }) +
    successTags({ view: "follow_item" }) +
    output([
      followItemHiddenTags(card, condition),
      button ? followItemButton(card, condition) : undefined,
      followItemLink(ruleSetNameOf(card.name.s), condition),
    ]) +
    CARD_FORM_CLOSE;
  return slotWrap(fmt, wrapView, form);
}

/** The seam accessor - undefined when the engine carries no follow seam
 *  (the signed-out arms apply). The EXPLICIT ACTOR BOUNDARY: the session
 *  inside the bundle was resolved from engine.pageSession and nothing else. */
function followBundle(ctx: ViewContext): FollowRenderBundle | undefined {
  return ctx.fmt.engine.followRenderBundle?.();
}

// --- set/right/follow.rb ----------------------------------------------------

/** right/follow.rb:58-60 view :follow_status, cache: :never -
 *  `wrap { haml :follow_status }`; follow_status.haml walks
 *  card.item_names and renders follow_item(option == "*never" ?
 *  "*always" : option) per item, then link_to_view :rule_form,
 *  "more options", class: "btn update-follow-link slotter",
 *  "data-card_key": card.set_prototype.key. The href is the mark+view
 *  segment path (lib/card/path.rb:42-47); set_prototype.key is the set
 *  anchor's key (the rules mod owns the full prototype machinery; this
 *  reads the anchor name only - the anchor IS the prototype's name for
 *  every set shape these rule cards carry). */
const followStatusView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  const card = fmt.card;
  const rows = followRuleItems(card)
    .map(
      (option) =>
        `  <li class="list-group-item">${followItemHtml(
          fmt,
          option === "*never" ? "*always" : option,
          true,
          "follow_status", // the helper's wrap reads @current_view
        )}</li>`,
    )
    .join("\n");
  const setName = ruleSetNameOf(card.name.s);
  const anchorKey =
    DeckoName.parse(setName).leftName?.key ?? DeckoName.parse(setName).key;
  const moreOptions = linkTo(
    "more options",
    followPath(card.name.urlKey, { view: "rule_form" }),
    {
      class: "btn update-follow-link slotter",
      "data-card_key": anchorKey,
    },
  );
  const body =
    `<h4>Get notified about changes</h4>\n` +
    `<ul class="delete-list list-group">\n${rows}\n</ul>\n` +
    `${moreOptions}`;
  return slotWrap(fmt, "follow_status", body);
};

/** right/follow.rb:63-65 view :follow_item -
 *  `follow_item Env.params[:condition]`; a headless engine has no request
 *  params (the searchKeyword seam's documented convention), so condition
 *  is nil and follow_item's `condition ||= "*always"` arm applies
 *  (right/follow.rb:68). The button param rides the voo opts (Ruby's
 *  follow_item(condition, button=true) second arg when the editor rows
 *  call it). */
const followItemView: ViewFn = (ctx) => {
  const condition =
    typeof ctx.voo.opts["condition"] === "string"
      ? (ctx.voo.opts["condition"] as string)
      : "*always";
  const button = ctx.voo.opts["follow_button"] !== false;
  return followItemHtml(ctx.fmt, condition, button, "follow_item");
};

// --- set/all/follow/follow_link_views.rb (the FollowLink family) ------------

/** follow_link.rb:24-34 FollowLink#button + :36-40 link_opts + :42-46
 *  render_link_text + the subclasses (start_follow_link.rb:4-12 - *always /
 *  "follow" / "send" / ""; stop_follow_link.rb:4-14 - *never / "following" /
 *  "stop sending" / "unfollow" hover / "btn-item-delete"). card.followed?
 *  picks the class (follow_link_views.rb:2-4) - the seam's followed verdict
 *  under the SESSION actor. link_to (links.rb:101-106, href LAST); remote:
 *  true emits data-remote="true"; path (:54-59): mark =
 *  follow_set_card.follow_rule_name(Auth.current.name) (the seam's
 *  followMark), action :update, success {mark: card.name, view:
 *  success_view}, card {content: "[[#{rule_content}]]"} - Hash#to_param
 *  query (sorted keys, Rack escape). */
const followButtonView: ViewFn = (ctx) => {
  const { fmt } = ctx;
  const bundle = followBundle(ctx);
  const followed = bundle?.followed === true;
  const ruleContent = followed ? "*never" : "*always";
  const linkText = followed ? "following" : "follow";
  const action = followed ? "stop sending" : "send";
  const hoverText = followed ? "unfollow" : undefined;
  const cssClass = followed ? "btn-item-delete" : "";
  const mark = bundle?.followMark ?? "";
  const query: Record<string, string> = {
    "card[content]": `[[${ruleContent}]]`,
    "success[mark]": fmt.card.name.s,
    "success[view]": "follow_section",
  };
  const href = followPath(DeckoName.parse(mark).urlKey, {
    action: "update",
    query,
  });
  const classes = ["follow-link", cssClass, "slotter btn btn-sm btn-primary"]
    .filter((c) => c !== "")
    .join(" ");
  return linkTo(
    `<span class="follow-verb">${linkText}</span>`,
    href,
    {
      class: classes,
      title: `${action} emails about changes to ${bundle?.followLabel ?? fmt.card.name.s}`,
      "data-remote": "true",
      "data-update-foreign-slot":
        ".d0-card-body > .card-slot.RIGHT-Xfollower.content-view",
      "data-hover-text": hoverText,
    },
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
  const lis = rows.map((row) => {
    const ruleCard = ctx.fmt.engine.fetchRenderCard(row.ruleCardName);
    if (ruleCard === undefined) {
      // the walk enriched every row; a miss means the card vanished
      // between prepare and render - Ruby would raise on nil subformat;
      // the haml's nil rule_card arm is "no entries"
      return `  <li class="list-group-item">no entries</li>`;
    }
    const sub = new RenderFormat(ruleCard, ctx.fmt.engine, { parent: fmt });
    return `  <li class="list-group-item">${followItemHtml(
      sub,
      row.option,
      showButton,
      "follow_item",
    )}</li>`;
  });
  const list =
    lis.length > 0
      ? `<ul class="delete-list list-group">\n${lis.join("\n")}\n</ul>`
      : `<ul class="delete-list list-group">\n  no entries\n</ul>`;
  return `<div class="pointer-list-editor">\n${list}\n</div>`;
}

/** user/follow.rb:45-47 view :follow_tab, cache: :never -
 *  haml :follow_editor, items_method: :following_rules_and_options. */
const followTabView: ViewFn = (ctx) =>
  followEditorBody(ctx, followBundle(ctx)?.followTabRows ?? []);

/** user/follow.rb:49-51 view :ignore_tab, cache: :never -
 *  haml :follow_editor, items_method: :ignoring_rules_and_options. */
const ignoreTabView: ViewFn = (ctx) =>
  followEditorBody(ctx, followBundle(ctx)?.ignoreTabRows ?? []);

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
  const submitAndUpdate = buttonTag("Submit and update all users", {
    name: "card[trigger]",
    value: "update_follow_rules",
    class: "follow-updater",
    data: { "disable-with": "Updating" },
  });
  const simple = buttonTag("Submit", { class: "follow" });
  const cancel = linkTo(
    "Cancel",
    followPath(fmt.card.name.urlKey, {
      view: "edit",
      query: { id: String(fmt.card.id) },
    }),
  );
  return (
    confirm +
    `\n<div class="form-group button-form-group">` +
    output([submitAndUpdate, simple, cancel]) +
    `</div>`
  );
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
      // chain walk's base tail (mod-loader.ts viewChain) - the
      // email-text-remainders lane, 2026-10-01. The email mod's
      // email_text :last_action DELEGATES to this verb
      // (email_text.rb:12 `_render_last_action_verb`; see
      // card-mod-email.ts emailTextLastActionView for the full chain
      // read). :last_action_verb is ported single-source
      // (render/views.ts#lastActionVerbNotifyView - the same fn the flat
      // record carries). The REST of the family stays unregistered here:
      // :list_of_changes/:subedits/:subedit_notice/:followed/:follower/
      // :unfollow_url read the notification_act / active_notice state
      // the email-delivery path sets up (rails-runtime; the flat record
      // carries the ported bodies where they exist).
      setPath: "all/notify/base_views",
      formats: {
        base: {
          views: [
            {
              view: "last_action_verb",
              viewFn: lastActionVerbNotifyView,
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
      // Ported: :confirm_update_all (the alert literal) AND :edit_buttons
      // (the confirm + button_formgroup + the three buttons). Neither is
      // REACHABLE for this card - the singularized self-anchor token vs the
      // FollowDefaults constant; the capture is cited in the honest
      // remainder above. The port's raise is Ruby-true.
      setPath: "self/follow_defaults",
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
            { view: "follow_tab", viewFn: followTabView, config: { cache: "never" } },
            { view: "ignore_tab", viewFn: ignoreTabView, config: { cache: "never" } },
          ],
        },
      },
    },
    passiveSetModule("type_plus_right/user/follow/follow_editor_helper"),
  ],
};

export default cardModFollow;
