// The card-mod-follow mod loader integration test: the mod loaded
// through the loader registers its views and the rendered bytes match
// the Ruby source semantics.
//
// Proof shape (A/B per ported view):
//   WITHOUT the mod: render the view on the seeded probe card raises the
//     unsupported-view error (render.ts#view_method - the view does not
//     exist on the live registry).
//   WITH the mod: the view renders the port's documented bytes; the
//     set-modules basket records the full gem tree; the setting_opts
//     registrations surface on the Setting registry; the *follow
//     codename is registered as a preference.
//
// Probe cards:
//   - Oracle Following Probe+following (junction): right side = following
//     setting so the right/following set module's :status + :one_line_
//     content are reachable
//   - Oracle Followers Probe+followers (junction): right side = followers
//     setting so the right/followers set module's :core super() is
//     reachable
//   - Oracle User Probe+follow (junction): right side = follow setting
//     so the type_plus_right/user/follow set module's :one_line_content
//     + :edit are reachable
//   - *follow_defaults (the self anchor for the deprecated editor that
//     defines :confirm_update_all)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import cardModFollow from "../../../src/card/mod-loader/mods/card-mod-follow.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename cards (the codename registry reads cards.codename; their
  // type ids matter to the rule-cache join: set-typed vs setting-typed).
  await seedCard(s, { id: 2, name: "RichText" }); // cardtypes' type card
  // the User cardtype card (the TYPE anchor of the type_plus_right/user
  // sets; the corpus recapture carries this card with codename "user").
  await seedCard(s, { id: 4, name: "User", codename: "user", typeId: 2 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });

  // the *follow setting card (right anchor for Right::Follow and the
  // right anchor for TypePlusRight::User::Follow + the codename the
  // SettingRegistry surfaces as a preference).
  await seedCard(s, {
    id: 110,
    name: "follow",
    codename: "follow",
    typeId: 14,
  });

  // the *following list card (right anchor for Right::Following)
  await seedCard(s, {
    id: 120,
    name: "following",
    codename: "following",
    typeId: 14,
  });

  // the *followers list card (right anchor for Right::Followers)
  await seedCard(s, {
    id: 130,
    name: "followers",
    codename: "followers",
    typeId: 14,
  });

  // the *follow_defaults list card (self anchor for Self::FollowDefaults;
  // holds the :confirm_update_all view)
  await seedCard(s, {
    id: 140,
    name: "*follow defaults",
    codename: "follow_defaults",
    typeId: 14,
    dbContent: "*all\n*always",
  });

  // Oracle Following Probe (left side of the +following junction)
  await seedCard(s, {
    id: 200,
    name: "Oracle Following Probe",
    dbContent: "following probe body",
  });
  await seedCard(s, {
    id: 201,
    leftId: 200,
    rightId: 120, // +following right
    typeId: 14, // setting type (junctions are setting-typed)
    dbContent: "following junction body",
  });

  // Oracle Followers Probe (left side of the +followers junction)
  await seedCard(s, {
    id: 210,
    name: "Oracle Followers Probe",
    dbContent: "followers probe body",
  });
  await seedCard(s, {
    id: 211,
    leftId: 210,
    rightId: 130, // +followers right
    // typeId 2 (RichText), NOT 14 — mm-I-R, the same oracle-capture
    // correction the help suite's guide/popover probes took. With the
    // Setting type (14 is this fixture's *setting cardtype card) the port
    // answered card-mod-rules' SETTING cardtype :core
    // (set/type/setting.rb:39-55, the "All X rules that apply to"
    // listing), so right/followers.rb:13-15's super() never reached the
    // junction's own body. Ruby's deck has no such card: the live capture
    // (benchmarks/capture-readonly-rule-card-core-type-shape.rb →
    // fixtures/captured/readonly-rule-card-core-type-shape.json,
    // card_actions 5018 == 5018 around every render) shows all 450
    // junction rows in the oracle app's development deck carry type_id
    // 4/2/5/337/43/... and never the Setting type id (Card::SettingID =
    // 278 in that deck; the *read setting itself is the Setting row).
    typeId: 2,
    dbContent: "followers junction body",
  });

  // Oracle User Probe (left side of the User+follow junction).
  // seed-sweep 2026-09-29: the probe now CARRIES the User type its
  // name claims - typeId 2 (RichText) left the type_plus_right/user/follow
  // set module unreachable (the TYPE_PLUS_RIGHT anchor resolves from the
  // LEFT card's type name, so a RichText-typed probe anchors
  // "rich_text+Xfollow" and misses TypePlusRight::User::Follow). Deck
  // truth (corpus recapture: codename "user" cardtype): the probe is a
  // User card.
  await seedCard(s, {
    id: 300,
    name: "Oracle User Probe",
    typeId: 4, // the User cardtype
    dbContent: "user probe body",
  });
  await seedCard(s, {
    id: 301,
    leftId: 300,
    rightId: 110, // +follow right (User+follow)
    typeId: 14,
    dbContent: "follow junction body",
  });

  // The write-rule fallback the :edit arm needs (the card-mod-comment
  // recipe, 9b8a80a): real decks bootstrap *all+*update off the *all set
  // (card-mod-permissions-0.20.0/data/real.yml :14-19 all-fields block;
  // recorded corpus rule 6570). With NO update rule the write verdict
  // fail-closes — who_can -> [] -> among? -> false (permissions.rb:47-49,
  // :100-118) — and altered_view denies BEFORE the dispatch this suite
  // pins (permission.rb:19-23 ahead of render.rb:59-63): the :edit arm
  // rendered its <span class="denied"> denial instead of the
  // type_plus_right/user/follow.rb:27-29 render :open body. [[Anyone]]:
  // one step wider than real.yml's Anyone Signed In default — the exact
  // configuration where the suite isolates view DISPATCH rather than the
  // permission matrix (account_holder.rb:31-37: every actor passes the
  // Anyone arm).
  await seedCard(s, { id: 310, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 311, name: "Anyone", codename: "anyone" });
  await seedCard(s, {
    id: 312,
    name: "*all+*update",
    leftId: 10,
    rightId: 310,
    typeId: 13,
    dbContent: "[[Anyone]]",
  });
  await seedReference(s, 312, 311, "anyone");
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("card-mod-follow through the mod loader (A/B)", () => {
  it("WITHOUT the mod: the mod-specific views raise UnsupportedViewError", async () => {
    const s = storage!;
    // The :confirm_update_all view is mod-specific (self/follow_defaults
    // defines it; the base HTML_VIEWS table has no entry). Same for
    // :one_line_content on the right/following and type_plus_right/
    // user/follow set modules — the baseline :one_line_content is
    // present in HTML_VIEWS so the unsupported-view check would not
    // trip. The :status view on right/following is mod-specific.
    await expect(s.engine.render("*follow defaults", "confirm_update_all")).rejects.toThrow(
      UnsupportedViewError,
    );
  });

  // The SELF token of *follow defaults carries the singularized name key
  // (SELF-Xfollow_default); the chain walker keys self modules by the
  // anchor's codename (follow_defaults), as Ruby's Pattern::Base#module_key
  // does, so Self::FollowDefaults applies.
  it("WITH the mod: :confirm_update_all renders the literal alert markup (self/follow_defaults.rb:24-30)", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModFollow }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    const html = await s.engine.render("*follow defaults", "confirm_update_all");
    // Corpus-adjudicated bytes (2026-10-09, the synthetic-v2 view pin):
    // the Ruby body is `wrap { alert(:info) { %( ... ) } }` - the SLOT
    // wrap (the card-slot div with the view/set-key classes and the
    // data-slot payload, whose show list the view-lane root enrollment
    // fills), the bootstrap alert helper's role="alert", and the %( )
    // literal's source whitespace verbatim (10-space h1/p indents, the
    // 13-space continuation, the 8-space line before the closing tag).
    // The corpus render also disproves the wave-1 "unreachable" note for
    // this view: it dispatches for its card.
    expect(html).toContain(
      `<div id="Xfollow_default-confirm_update_all-view" class="card-slot confirm_update_all-view`,
    );
    expect(html).toContain(`SELF-Xfollow_default"`);
    expect(html).toContain(`<div class="alert alert-info" role="alert">`);
    expect(html).toContain(`\n          <h1>Are you sure you want to change the default follow rules?</h1>`);
    expect(html).toContain(`\n             This may take a while. </p>\n        </div></div>`);
  });

  it("WITH the mod: :status on +*following renders the literal 'No following preference' fallback (right/following.rb:13-22)", async () => {
    const s = storage!;
    // The status view's if-branch walks card.left.preference :follow
    // (Rails runtime); the headless port's no-preference-walk state
    // takes the else branch and emits the literal fallback.
    const html = await s.engine.render("Oracle Following Probe+following", "status");
    expect(html).toBe("No following preference");
  });

  it("WITH the mod: :one_line_content on +*following renders the empty string (right/following.rb:24-26)", async () => {
    const s = storage!;
    const html = await s.engine.render("Oracle Following Probe+following", "one_line_content");
    expect(html).toBe("");
  });

  it("WITH the mod: :one_line_content on User+follow renders the empty string (type_plus_right/user/follow.rb:23-25)", async () => {
    const s = storage!;
    const html = await s.engine.render("Oracle User Probe+follow", "one_line_content");
    expect(html).toBe("");
  });

  it("WITH the mod: :edit on User+follow dispatches to :open (type_plus_right/user/follow.rb:27-29)", async () => {
    const s = storage!;
    // render :open produces a non-empty slot wrap (card-slot + open-view
    // classes); the edit view's literal render :open dispatch is the
    // exact body, so the result carries the open view's bytes.
    const html = await s.engine.render("Oracle User Probe+follow", "edit");
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("card-slot");
    expect(html).toContain("open-view");
  });

  it("WITH the mod: :core on +*followers dispatches to the base :core (right/followers.rb:13-15, super())", async () => {
    const s = storage!;
    // The :core override is a literal super() call to the base :core
    // view. The base :core renders the card's content; the +*followers
    // junction's dbContent is "followers junction body", so the
    // resulting bytes include that body verbatim.
    const html = await s.engine.render("Oracle Followers Probe+followers", "core");
    expect(html).toContain("followers junction body");
  });

  it("WITH the mod: every set module from the gem tree is in the basket", () => {
    const basket = loader!.setModules();
    // abstract: follow_option
    expect(basket.abstract.map((m) => m.shortname)).toContain("Abstract::FollowOption");
    // the base pattern: setPathPattern splits on "/", so every all/follow/*
    // file has pattern "all" - the first segment - and lands in the base
    // bucket alongside All::Follow (loader.rb#parts_from_path: pattern =
    // first segment).
    expect(basket.base.map((m) => m.shortname)).toContain("All::Follow");
    expect(basket.base.map((m) => m.shortname)).toContain("All::Follow::FollowedBy");
    expect(basket.base.map((m) => m.shortname)).toContain("All::Follow::FollowerIds");
    expect(basket.base.map((m) => m.shortname)).toContain("All::Follow::FollowLink");
    expect(basket.base.map((m) => m.shortname)).toContain("All::Follow::FollowLinkViews");
    expect(basket.base.map((m) => m.shortname)).toContain("All::Follow::StartFollowLink");
    expect(basket.base.map((m) => m.shortname)).toContain("All::Follow::StopFollowLink");
    expect(basket.base.map((m) => m.shortname)).toContain("All::Notify");
    expect(basket.base.map((m) => m.shortname)).toContain("All::Notify::BaseViews");
    expect(basket.base.map((m) => m.shortname)).toContain("All::Notify::HtmlViews");
    // right nonbase
    const right = [...basket.nonbase.values()].flat().map((m) => m.shortname);
    expect(right).toContain("Right::Account");
    expect(right).toContain("Right::ContextualClass");
    expect(right).toContain("Right::Disappear");
    expect(right).toContain("Right::Follow");
    expect(right).toContain("Right::Followers");
    expect(right).toContain("Right::Following");
    expect(right).toContain("Right::FollowFields");
    expect(right).toContain("Right::Message");
    // self nonbase
    const self = [...basket.nonbase.values()].flat().map((m) => m.shortname);
    expect(self).toContain("Self::Always");
    expect(self).toContain("Self::Created");
    expect(self).toContain("Self::Edited");
    expect(self).toContain("Self::Follow");
    expect(self).toContain("Self::FollowDefaults");
    expect(self).toContain("Self::FollowFields");
    expect(self).toContain("Self::Never");
    // type nonbase
    const type = [...basket.nonbase.values()].flat().map((m) => m.shortname);
    expect(type).toContain("Type::Cardtype");
    expect(type).toContain("Type::NotificationTemplate");
    expect(type).toContain("Type::Set");
    expect(type).toContain("Type::User");
    // type_plus_right nonbase
    expect(type).toContain("TypePlusRight::User::Follow");
  });

  it("WITH the mod: the mod loader's load report lists every ported view", () => {
    const report = loader!.load();
    expect(report.registeredViews).toContain("confirm_update_all");
    expect(report.registeredViews).toContain("status");
    expect(report.registeredViews).toContain("one_line_content");
    expect(report.registeredViews).toContain("edit");
    expect(report.registeredViews).toContain("core");
  });

  it("WITH the mod: the *follow setting_opts registers as a preference (self/follow.rb:1)", () => {
    const settings = loader!.settingsRegistry();
    // The SettingRegistry#preferenceIs method surfaces codenames whose
    // setting_opts was called with preference: true (mod-registrar.ts:
    // 187-189 mirrors setting.rb:95-99 register_preference).
    expect(settings.preferenceIs("follow")).toBe(true);
  });

  it("WITH the mod: the *follow_fields setting_opts is registered without preference (self/follow_fields.rb:1)", () => {
    const settings = loader!.settingsRegistry();
    expect(settings.preferenceIs("follow_fields")).toBe(false);
  });

  it("WITH the mod: a card's baseline :content render still works (the mod adds views, it does not alter core)", async () => {
    const s = storage!;
    const html = await s.engine.render("Oracle Following Probe+following", "content");
    // baseline :content is the format/views.ts#contentView; the mod
    // does NOT redefine :content for any of its set modules, so the
    // existing core content renders unchanged. We assert it renders
    // WITHOUT throwing and produces a non-empty slot.
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("card-slot");
  });
});
