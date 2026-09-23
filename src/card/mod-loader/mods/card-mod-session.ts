// The card-mod-session gem (card-mod-session-0.20.0), ported through the
// mod loader - the mod that adds the Session cardtype, whose content lives
// in the request session hash instead of the database, plus the all-cards
// location-history bookkeeping (the "previous page" redirect target).
//
// The gem's tree (C:/Ruby33-x64/lib/ruby/gems/3.3.0/gems/
// card-mod-session-0.20.0/): two set files, one lib file, one admin config,
// one seed file:
//   set/all/location_history.rb   - events :discard_deleted_locations
//                                   (:finalize, on: :delete) and
//                                   :save_current_location (before:
//                                   :show_page, on: :read) +
//                                   configure_successful_deletion
//   set/type/session.rb           - include_set Pointer, the
//                                   non_createable_types basket push, the
//                                   Session card's method overrides, events
//                                   :store_in_session/:delete_in_session,
//                                   and a format :html before :core hook
//   lib/card/mod/session.rb       - config.allow_anonymous_cookies = true
//   config/admin.yml              - "session" in the admin cardtypes list
//   data/real.yml                 - Session cardtype + *recent settings
//                                   seeds
//
// The compat report (tools/compat-report/mod-compat-report.json, entry
// gem === "card-mod-session-0.20.0") declares ZERO html views for this gem
// (htmlViewsDeclared: 0, htmlViewsMissingNames: []) - its only format block
// is a before :core HOOK, not a view. So the port's units are the two set
// modules and the semantics that survive a headless engine:
//   - both set modules registered in the loader's set-module basket (the
//     port of Card::Set module registration - loader.ts phase 2)
//   - the Session card's PURE method overrides, preserved as exported
//     functions below (session.rb:9-19, 21-23, 47-53, 55-57)
//   - lib/card/mod/session.rb's config value as an exported constant
//
// NOT ported (honest remainder - every piece needs a Rails write-path /
// request runtime the headless engine does not have):
// - set/all/location_history.rb:1-4 event :discard_deleted_locations,
//   :finalize, on: :delete - runs Env.discard_locations_for (the request
//   Env has no TS surface) + configure_successful_deletion when
//   success.target == self; the TS port has no delete-event or success
//   object surface (same remainder class as card-mod-api_key's
//   prepare_to_validate events and card-mod-comment's add_comment event)
// - set/all/location_history.rb:6-8 event :save_current_location, before:
//   :show_page, on: :read - Env.save_location runs on the controller
//   page-show path (decko's cards_controller show), which the headless
//   render engine does not exercise
// - set/all/location_history.rb:12-20 configure_successful_deletion -
//   reads Env.ajax? / Env.params[:is_main] and mutates the success object
//   (success.card/view/redirect/target); all four are controller-runtime
//   state with no TS counterpart
// - set/type/session.rb:25-27 session_content + :29-31 session_content= +
//   :5-7 virtual? + :33-35 content override - ALL read/write
//   Env.session[session_key], the request-level key-value session hash.
//   The TS port's only session surface is the auth bearer-token store
//   (src/card/auth/session-store.ts, the auth_sessions table) - there is
//   no per-request hash a card could store content in, and no
//   card-method-override surface through which a Session type could
//   displace the base content reader
// - set/type/session.rb:37-40 event :store_in_session, :prepare_to_store,
//   on: :save (session_content = db_content; abort :success) and :42-45
//   event :delete_in_session, :prepare_to_store, on: :delete
//   (session_content = nil; abort :success) - the save/delete event cycle
//   does not exist in the TS port (the write path is the actions layer's
//   CardActionEngine, another stream); `abort :success` is Rails' throw
//   :success control flow
// - set/type/session.rb:1 include_set Pointer - the include chain has no
//   manifest slot (same as card-mod-api_key's include_set
//   Abstract::AccountField); the Pointer set's item semantics would be
//   pulled into the Session type chain at load time in Ruby
// - set/type/session.rb:3 basket[:non_createable_types] << :session - no
//   generic Card basket exists in TS (same note card-mod-rules records for
//   set/type/setting.rb's non_createable_types push); the semantic is
//   "decks cannot create Session-typed cards from the cardtype UI"
// - set/type/session.rb:59-63 format :html do before :core do
//   voo.items[:view] = :name end end - a before-view HOOK (not a view
//   definition), so it has no ModFormatBlock slot; voo.items (the nest
//   items options) has no TS surface either. Ruby effect: a Session card's
//   :core renders its pointer items as NAMES, not full cards
// - lib/card/mod/session.rb:1-3 - the Cardio::Railtie config write has no
//   TS consumer; the VALUE is preserved as ALLOW_ANONYMOUS_COOKIES below
// - config/admin.yml:1-2 - the admin surface (cardtypes shown in admin
//   deck management) has no TS consumer
// - data/real.yml:1-7 (Session cardtype seed) + :10-20 (*recent settings
//   seed; its :type is even commented out in the gem) - seed files are the
//   test stream's job; the test below seeds the same Session cardtype card

import type { DeckoModManifest } from "../mod-manifest.js";

// ---------------------------------------------------------------------------
// set/type/session.rb - the Session card's PURE method overrides.
//
// These are preserved as exported functions because they are the whole of
// session.rb's semantics that a headless engine can carry: every one is a
// constant or a pure function of its arguments in Ruby. The TS engine has
// no card-method-override surface (a set module cannot displace the base
// Card#history? etc. here), so nothing dispatches to them yet - they are
// the cited, testable transcription of the Ruby methods, ready for the
// method-override seam when it lands.
// ---------------------------------------------------------------------------

/** session.rb:9-11 `def history?; false; end` - Session cards have no
 *  acts/changes history (nothing is stored, so there is nothing to
 *  revision). */
export function sessionCardHistory(): false {
  return false;
}

/** session.rb:13-15 `def followable?; false; end` - no follow triggers:
 *  a card whose content is per-user session state cannot notify others. */
export function sessionCardFollowable(): false {
  return false;
}

/** session.rb:17-19 `def recaptcha_on?; false; end` - never recaptcha a
 *  session-scoped write (the recaptcha check lives on persisted saves). */
export function sessionRecaptchaOn(): false {
  return false;
}

/** session.rb:47-49 `def ok_to_create?; true; end` - creating a Session
 *  card is always permitted (its content never reaches the database, so
 *  the create permission machinery is bypassed). */
export function sessionOkToCreate(): true {
  return true;
}

/** session.rb:51-53 `def ok_to_update?; true; end` - same bypass for
 *  updates. */
export function sessionOkToUpdate(): true {
  return true;
}

/** session.rb:21-23 `def session_key; "_card_#{key}"` - the session-hash
 *  key a Session card's content rides: the literal prefix "_card_" joined
 *  to the card's canonical key (DeckoName.key, e.g. "My Notes" ->
 *  "my_note"). Keyed per card so two Session cards cannot collide in one
 *  session. */
export function sessionKey(key: string): string {
  return `_card_${key}`;
}

/** session.rb:55-57 `def add_to_trash args; yield args.merge trash: true
 *  end` - Session cards trash by merging trash: true into the args the
 *  delete machinery yields with (Ruby yields to the caller's block; a
 *  pure transform here returns the merged args, which is the observable
 *  half of that contract). Non-mutating: Ruby's Hash#merge returns a NEW
 *  hash, leaving the receiver untouched. */
export function sessionAddToTrash<T extends object>(args: T): T & { trash: true } {
  return { ...args, trash: true };
}

// ---------------------------------------------------------------------------
// lib/card/mod/session.rb - the Railtie config value
// ---------------------------------------------------------------------------

/** lib/card/mod/session.rb:1-3
 *  `Cardio::Railtie.config.tap do |config|
 *     config.allow_anonymous_cookies = true
 *   end`
 *  Anonymous visitors get session cookies (so their Session cards work
 *  without an account). The Railtie write has no TS consumer; the value is
 *  the file's whole semantic. */
export const ALLOW_ANONYMOUS_COOKIES = true;

// ---------------------------------------------------------------------------
// the manifest (one entry per set file; setPaths as in the gem tree)
// ---------------------------------------------------------------------------

const cardModSession: DeckoModManifest = {
  name: "session",
  gemName: "card-mod-session",
  group: "gem-defaults",
  setModules: [
    {
      // card-mod-session-0.20.0/set/all/location_history.rb - events
      // :discard_deleted_locations (:1-4), :save_current_location (:6-8)
      // and the configure_successful_deletion method (:12-20). All three
      // ride the request Env / success object / controller page cycle -
      // no view registrations, no TS surface (see the header's NOT-ported
      // list). The entry records the set module's existence the way
      // Ruby's SetLoader registers the file
      // (registrar: All::LocationHistory, base bucket).
      setPath: "all/location_history",
    },
    {
      // card-mod-session-0.20.0/set/type/session.rb - the Session
      // cardtype's set module: include_set Pointer (:1), the
      // non_createable_types basket push (:3), the method overrides ported
      // as the exported functions above (:5-19, 21-23, 25-35, 47-53,
      // 55-57), the store/delete-in-session events (:37-45), and the
      // before :core hook (:59-63). Only the pure methods had a headless
      // home; the rest is the header's NOT-ported list. Registered as
      // Type::Session (nonbase bucket).
      setPath: "type/session",
    },
  ],
};

export default cardModSession;
