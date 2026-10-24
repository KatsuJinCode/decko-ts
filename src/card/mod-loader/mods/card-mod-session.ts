// The card-mod-session gem (card-mod-session-0.20.0), ported through the
// mod loader - the mod that adds the Session cardtype, whose content lives
// in the request session hash instead of the database, plus the all-cards
// location-history bookkeeping (the "previous page" redirect target).
//
// The gem's tree (the installed
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
// The gem's declared view count is ZERO
// (htmlViewsDeclared: 0, htmlViewsMissingNames: []) - its only format block
// is a before :core HOOK, not a view. So the port's units are the two set
// modules and the semantics that survive a headless engine:
//   - both set modules registered in the loader's set-module basket (the
//     port of Card::Set module registration - loader.ts phase 2)
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
// - set/type/session.rb:9-19 history?/followable?/recaptcha_on? (each a
//   constant false), :47-53 ok_to_create?/ok_to_update? (constant true),
//   :21-23 session_key ("_card_#{key}"), and :55-57 add_to_trash (merge
//   trash: true into the delete args) - every one a one-line constant or
//   pure transform in Ruby, with nothing to attach to here: the TS engine
//   has no card-method-override surface through which a Session type could
//   displace the base Card#history?/ok_to_create?/... methods, and no
//   caller of the standalone shapes. The Ruby lines above are the record;
//   the method-override seam that adopts them does not exist yet
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
//   CardActionEngine); `abort :success` is Rails' throw
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
//   :core renders its pointer items as NAMES, not full cards.
//   [corrected 2026-10-20, mods tranche 6 - the completeness register's
//   entry 29 reads "The `before :core` hook itself is registered in the same
//   file". Read against this tree that is false: set/type/session.rb
//   registers the two events and nothing else. There is also no seam it
//   COULD be registered into - RenderFormat#runBeforeHook
//   (src/card/render/format.ts:1726) is a hardcoded switch over view names,
//   not a mod-registration surface. The claim is withdrawn on that evidence
//   and the fact is pinned by
//   tests/card/mod-loader/card-mod-session-declarations.test.ts.]
// - lib/card/mod/session.rb:1-3 - the Cardio::Railtie config write has no
//   TS consumer; the VALUE is preserved as ALLOW_ANONYMOUS_COOKIES below
// - config/admin.yml:1-2 - the admin surface (cardtypes shown in admin
//   deck management) has no TS consumer
// - data/real.yml:1-7 (Session cardtype seed) + :10-20 (*recent settings
//   seed; its :type is even commented out in the gem) - seed files are the
//   test; the test below seeds the same Session cardtype card

import { defineMod } from "../mod-dsl.js";

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

const cardModSession = defineMod("card-mod-session", { group: "gem-defaults" }, ({ set }) => {
  // card-mod-session-0.20.0/set/all/location_history.rb - events
  // :discard_deleted_locations (:1-4), :save_current_location (:6-8)
  // and the configure_successful_deletion method (:12-20). All three
  // ride the request Env / success object / controller page cycle -
  // no view registrations (see the header's NOT-ported list).
  //
  // Events — BODY PORTED SERVER-OWNED (the request layer is where Ruby
  // runs them too: Env is request state, and show_page is the controller
  // page cycle):
  // - discard_deleted_locations (:finalize, on: :delete): the write
  //   route's delete path runs discardLocationsFor(visit, name)
  //   (write-routes.ts, "if (saved.verb === 'delete')") BEFORE resolving
  //   the deletion success target — location_history.rb:1-4's order —
  //   and the ajax delete arm runs configure_successful_deletion's
  //   redirect-previous rewrite (write-routes.ts deletesOwnTarget, citing
  //   location_history.rb:12-20). Behavioral pin:
  //   tests/card/session/visitor-session.test.ts (the history semantics,
  //   oracle-tied to env/location_history.rb) and the write-routes
  //   delete-redirect cases.
  // - save_current_location (Ruby `before: :show_page, on: :read`,
  //   location_history.rb:6-8): MECHANISM PORTED AND THE READ PATH IS
  //   WIRED SERVER-SIDE. The mechanism is visitor-session.ts's
  //   saveLocation + shouldSaveLocation (save_location?, :47-51) +
  //   locationHistory (:12-17). Three live callers, each under the same
  //   guard and each citing location_history.rb:6-8:
  //     worker.ts:592-605 — the CF/worker page GET arm;
  //     deploy/bunny-worker-src/bunny-edge-engine-request.ts:1068-1079 —
  //       the Bunny edge page dispatch, the same arm;
  //     src/server/write-routes.ts:2466-2472 — the error-page arm, which
  //       names this event in its comment.
  //   So a plain GET of a card page DOES grow the history, where Ruby's
  //   `before: :show_page` hook would. The declaration records Ruby's
  //   shape only: the mod-event dispatch has no read arm, so the entry
  //   resolves to no save stage (pinned — the name appears in none of
  //   the seven stages) and the body is the server's, not the mod's.
  //   AUDIT 2026-10-20 (events tranche 5, register events-table row) —
  //   the boundary is MEASURED, not approximated, by
  //   tests/card/mod-loader/card-mod-session-save-location-event.test.ts,
  //   which pins the declaration's shape, the guard, the uniq-keeps-first
  //   history semantics, and that none of write-routes.ts /
  //   cloudflare-write-routes.ts / card/render/page.ts / card/render.ts
  //   reaches for pageViewCookie. That absence check is scoped to those
  //   four server/render modules and does NOT cover the two hosts above,
  //   which call saveLocation directly; pageViewCookie's live callers
  //   are the staging/oracle hosts (tools/parity-side-effects/ts-drive.mjs:413,
  //   vm-staging-server.mjs:5056).
  set("all/location_history", ({ event }) => {
    event("discard_deleted_locations", "finalize", { on: "delete" });
    // Ruby: `event :save_current_location, before: :show_page,
    // on: :read` — a READ-path event; the surface's trigger union has
    // no read arm, so `on:` is omitted (no trigger recorded; Ruby's
    // read trigger rides this comment). No stage of its own: Ruby
    // clears @stage for a before: event, and show_page is the page
    // cycle - outside the nine save stages, so the name resolves to no
    // registered event and the entry is a candidate in none of them
    // (the read path runs no card events; the mechanism is ported
    // separately, visitor-session.ts saveLocation).
    event("save_current_location", { before: "show_page" });
  });

  // card-mod-session-0.20.0/set/type/session.rb - the Session
  // cardtype's set module: include_set Pointer (:1), the
  // non_createable_types basket push (:3), the card-method overrides
  // (:5-19, 21-23, 25-35, 47-53, 55-57 - the header's NOT-ported list:
  // the TS engine has no card-method-override surface to attach them
  // to), the store/delete-in-session events (:37-45), and the
  // before :core hook (:59-63). Registered as Type::Session (nonbase
  // bucket).
  set("type/session", ({ event }) => {
    // store_in_session: the write route answers a Session create without
    // writing (write-routes.ts isSessionTypeCreate); the content is not
    // kept, the port having no per-visitor session store.
    event("store_in_session", "prepare_to_store", { on: "save", engineOwned: true });
    // delete_in_session — STUB, named remainder (session.rb:42-45):
    // session_content = nil + abort :success on a Session-card DELETE;
    // the port has no Session-card delete write path (same reason as
    // store_in_session's route arm).
    event("delete_in_session", "prepare_to_store", { on: "delete" });
  });
});

export default cardModSession;
