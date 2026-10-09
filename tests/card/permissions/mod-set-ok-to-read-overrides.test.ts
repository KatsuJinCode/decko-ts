// The mod set-module ok_to_read? overrides -- the READ-verdict layer the
// generic stored-read-rule path misses (an earlier over-deny family).
//
// Ruby resolves a read verdict through Card#ok_to_read?, and ok_to_read? is
// not one method: THIRTEEN mod set files define their own ok_to_read? for the
// cards their set matches, each REPLACING (or wrapping via `super`) the
// generic stored-rule check (card-mod-permissions-0.20.0
// set/all/permissions.rb:139-146). The port computed only the generic path,
// so every card listed below rendered the quiet denial span where Ruby's
// set-module override grants:
//
//   set/right/head.rb:3            (card-mod-layout)    true
//   set/right/script.rb:3          (card-mod-script)    true
//   set/right/enabled_roles.rb:5   (card-mod-layout)    true
//   set/self/version.rb:3          (card core)          true
//   set/self/signin.rb:37          (card-mod-account)   true
//   set/self/account_links.rb:3    (card-mod-layout)    true
//   set/type_plus_right/set/style.rb:9 (card-mod-style) true
//   set/right/account.rb:28        (card-mod-account)   own_account? || super
//   set/right/password.rb:17       (card-mod-account)   own_account? || super
//   set/right/api_key.rb:24        (card-mod-api_key)   own_account? || super
//   set/right/email.rb:39          (card-mod-account)   own_email? || always_ok? else DENY (no super)
//   set/right/asset_output.rb:5    (card-mod-assets)    left.ok_to_read?
//
// own_account? (right/account.rb:20-22 -> abstract/account_holder.rb:18-20):
// the LEFT card responds only when it is an AccountHolder (sets self::anonymous,
// self::decko_bot, type::signup, type::user -- account_holder includes at
// set/self/anonymous.rb:1 etc.); the answer is `left.key == Auth.as_card.key`.
// own_email? (right/email.rb:45-47): `name.part_names[0].key ==
// Auth.as_card.key` -- no AccountHolder requirement.
//
// Ruby oracle, confirmed against the capture deck directly:
// Anonymous+*account (stored rule grants Help Desk only) ok?(:read)=true;
// Anonymous+*account+*email (stored rule idem) true; FrAi+*right+*head /
// GBA+*right+*head (stored "Anyone Signed In" rule) true; the CONTROL FOR
// CHILDREN'S CLASS (plain card, *self rule granting five roles)
// ok?(:read)=false -- the generic path still denies.
//
// SAFETY (the suite contract): every branch here is a verbatim port of the
// cited gem file. The overrides only ever fire for the exact set populations
// Ruby's set files match (pattern application is by name key, so a tag key
// comparison IS Ruby's set membership). Nothing else widens.
//
// Deck layout (ids stable so stored rule ids are readable):
//    1 *all codename all typeId 2        2 Set codename set
//    3 *read codename read               4 Basic
//    5 Anyone codename anyone            6 Anonymous codename anonymous
//    7 Role A                            8 *all+*read [[Anyone]]
//   15 *type codename type              16 *self codename self
//   17 *all plus codename all_plus      18 *right codename right
//   21 *all plus+*read [[_left]]        22 _left
//   30 Locked Doc (Basic, stored rule 37 -> Role A only: generic DENY)
//   36 Locked Doc+*self (Set)           37 Locked Doc+*self+*read [[Role A]]
//   38 Readable Doc (Basic, stored rule 8 -> Anyone)
//   45 Jane Person (typeId 70 Person codename user)
//   48 Plain Doc (Basic -- NOT an AccountHolder)
//   70 Person codename user (cardtype)
//   setting cards: 58 *head, 59 *email, 60 *account, 61 *script, 62 *style,
//     63 *version, 65 *signin, 66 *account links, 69 *enabled roles,
//     75 *api key, 78 *password, 80 *asset output, 82 *default
//   junction rows (each stored rule 37 = generic deny unless noted):
//     40 Locked Doc+*head            -> ALLOW (right::head)
//     41 Locked Doc+*script          -> ALLOW (right::script)
//     42 Anonymous+*account          -> ALLOW (own_account?)
//     43 Anonymous+*account+*email   -> ALLOW (own_email?)
//     44 Jane Person+*account        -> ALLOW (super -> stored [[Anyone]])
//     46 Jane Person+*email          -> DENY (right::email, non-own: no super)
//     47 Plain Doc+*account          -> ALLOW (super; left not a holder)
//     68 Locked Doc+*enabled roles   -> ALLOW (right::enabled_roles)
//     72 Styling Set (typeId 2)      73 Styling Set+*style -> ALLOW
//     74 Jane Person+*api key        -> DENY (super -> stored deny)
//     76 Anonymous+*account+*api key -> ALLOW (own_account? chains through
//                                       the +*account card)
//     77 Anonymous+*account+*password-> ALLOW (own_account? chain)
//     79 Readable Doc+*asset output  -> ALLOW (left.ok_to_read?)
//     81 Locked Doc+*asset output    -> DENY (left denies; stored [[Anyone]]
//                                       is overridden AWAY)

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DeckoName } from "../../../src/card/name.js";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { quietDenial } from "../../../src/card/permissions/index.js";
import { readPermissionOverride, updatePermissionOverride } from "../../../src/card/permissions/read-override.js";

const SET_TYPE_ID = 2;
const BASIC_TYPE_ID = 4;

let storage: RenderTestStorage | undefined;

async function seedDeck(s: RenderTestStorage): Promise<void> {
  await seedCard(s, { id: 1, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Set", codename: "set" });
  await seedCard(s, { id: 3, name: "*read", codename: "read" });
  await seedCard(s, { id: 4, name: "Basic" });
  await seedCard(s, { id: 5, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 6, name: "Anonymous", codename: "anonymous" });
  await seedCard(s, { id: 7, name: "Role A" });
  // *all+*read -> [[Anyone]] (rule 8, the deck's readable catch-all)
  await seedCard(s, { id: 8, leftId: 1, rightId: 3, dbContent: "[[Anyone]]" });
  await seedReference(s, 8, 5, "anyone");
  await seedCard(s, { id: 15, name: "*type", codename: "type" });
  await seedCard(s, { id: 16, name: "*self", codename: "self" });
  await seedCard(s, { id: 17, name: "*all plus", codename: "all_plus" });
  await seedCard(s, { id: 18, name: "*right", codename: "right" });
  // *all plus+*read -> [[_left]] : the corpus's compound-wide delegator, so
  // the LIVE walk on rule-less compound cards follows the left chain.
  await seedCard(s, { id: 21, leftId: 17, rightId: 3, dbContent: "[[_left]]" });
  await seedCard(s, { id: 22, name: "_left" });
  await seedReference(s, 21, 22, "_left");

  // The locked anchor: stored rule 37 (Role A only) -> generic deny.
  await seedCard(s, {
    id: 30, name: "Locked Doc", typeId: BASIC_TYPE_ID,
    dbContent: "locked body", readRuleId: 37, readRuleClass: "*self",
  });
  await seedCard(s, { id: 36, leftId: 30, rightId: 16, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 37, leftId: 36, rightId: 3, dbContent: "[[Role A]]" });
  await seedReference(s, 37, 7, "role_a");
  // The readable anchor.
  await seedCard(s, {
    id: 38, name: "Readable Doc", typeId: BASIC_TYPE_ID,
    dbContent: "readable body", readRuleId: 8, readRuleClass: "*all",
  });

  // Setting cards the override matching keys against.
  const settings: Array<[number, string, string]> = [
    [58, "*head", "head"],
    [59, "*email", "email"],
    [60, "*account", "account"],
    [61, "*script", "script"],
    [62, "*style", "style"],
    [69, "*enabled roles", "enabled_roles"],
    [75, "*api key", "api_key"],
    [78, "*password", "password"],
    [80, "*asset output", "asset_output"],
    [82, "*default", "default"],
  ];
  for (const [id, name, codename] of settings) await seedCard(s, { id, name, codename });

  // Unconditional-true overrides: stored rule 37 (generic deny) overridden.
  await seedCard(s, {
    id: 40, leftId: 30, rightId: 58, dbContent: "head bytes",
    readRuleId: 37, readRuleClass: "*right",
    typeId: BASIC_TYPE_ID,
  });
  await seedCard(s, {
    id: 41, leftId: 30, rightId: 61, dbContent: "script bytes",
    readRuleId: 37, readRuleClass: "*right",
    typeId: BASIC_TYPE_ID,
  });
  await seedCard(s, {
    id: 68, leftId: 30, rightId: 69, dbContent: "roles bytes",
    readRuleId: 37, readRuleClass: "*right",
    typeId: BASIC_TYPE_ID,
  });

  // Anonymous's own account family (the capture deck's over-deny pages).
  await seedCard(s, {
    id: 42, leftId: 6, rightId: 60, dbContent: "anon account row",
    readRuleId: 37, readRuleClass: "*right",
    typeId: BASIC_TYPE_ID,
  });
  await seedCard(s, {
    id: 43, leftId: 42, rightId: 59, dbContent: "anon@example.test",
    readRuleId: 37, readRuleClass: "*right",
    typeId: BASIC_TYPE_ID,
  });
  await seedCard(s, {
    id: 76, leftId: 42, rightId: 75, dbContent: "anon api key",
    readRuleId: 37, readRuleClass: "*right",
    typeId: BASIC_TYPE_ID,
  });
  await seedCard(s, {
    id: 77, leftId: 42, rightId: 78, dbContent: "anon password hash",
    readRuleId: 37, readRuleClass: "*right",
    typeId: BASIC_TYPE_ID,
  });

  // Jane Person (AccountHolder via type::user) + the deny-direction pair.
  await seedCard(s, { id: 70, name: "Person", codename: "user", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 45, name: "Jane Person", typeId: 70 });
  await seedCard(s, {
    id: 44, leftId: 45, rightId: 60, dbContent: "jane account row",
    readRuleId: 8, readRuleClass: "*right",
    typeId: BASIC_TYPE_ID,
  });
  await seedCard(s, {
    id: 46, leftId: 45, rightId: 59, dbContent: "jane@example.test",
    readRuleId: 8, readRuleClass: "*right",
    typeId: BASIC_TYPE_ID,
  });
  await seedCard(s, {
    id: 74, leftId: 45, rightId: 75, dbContent: "jane api key",
    readRuleId: 37, readRuleClass: "*right",
    typeId: BASIC_TYPE_ID,
  });
  // Plain Doc: left NOT an AccountHolder -> own_account? falsy -> super.
  await seedCard(s, { id: 48, name: "Plain Doc", typeId: BASIC_TYPE_ID });
  await seedCard(s, {
    id: 47, leftId: 48, rightId: 60, dbContent: "plain account row",
    readRuleId: 8, readRuleClass: "*right",
    typeId: BASIC_TYPE_ID,
  });

  // type_plus_right::set::style (set "Set+*style"): left type IS Set.
  await seedCard(s, { id: 72, name: "Styling Set", typeId: SET_TYPE_ID });
  await seedCard(s, {
    id: 73, leftId: 72, rightId: 62, dbContent: "style bytes",
    readRuleId: 37, readRuleClass: "*type plus right",
    typeId: BASIC_TYPE_ID,
  });

  // asset_output: the verdict is the LEFT card's.
  await seedCard(s, {
    id: 79, leftId: 38, rightId: 80, dbContent: "readable asset output",
    readRuleId: 37, readRuleClass: "*right",
    typeId: BASIC_TYPE_ID,
  });
  await seedCard(s, {
    id: 81, leftId: 30, rightId: 80, dbContent: "locked asset output",
    readRuleId: 8, readRuleClass: "*right",
    typeId: BASIC_TYPE_ID,
  });

  // Self-set overrides on the anchor cards themselves.
  await seedCard(s, {
    id: 63, name: "*version", codename: "version",
    dbContent: "version text", readRuleId: 37, readRuleClass: "*self",
    typeId: BASIC_TYPE_ID,
  });
  await seedCard(s, {
    id: 65, name: "*signin", codename: "signin",
    dbContent: "signin text", readRuleId: 37, readRuleClass: "*self",
    typeId: BASIC_TYPE_ID,
  });
  await seedCard(s, {
    id: 66, name: "*account links", codename: "account_links",
    dbContent: "account links text", readRuleId: 37, readRuleClass: "*self",
    typeId: BASIC_TYPE_ID,
  });

  // The rules-editor nav host: a readable set card (live walk -> *all plus
  // [[_left]] -> Readable Doc -> *all+*read). Its VIRTUAL rule bars inherit
  // tag-scoped *right-pattern rules:
  //   85 *default+*right+*read [[Role A]]  -> the +*default bar denies
  //   87 *head+*right+*read   [[Role A]]   -> the +*head bar would deny
  //                                           generically; right::head
  //                                           overrides to allow.
  await seedCard(s, { id: 84, leftId: 38, rightId: 16, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 86, leftId: 82, rightId: 18, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 85, leftId: 86, rightId: 3, dbContent: "[[Role A]]" });
  await seedReference(s, 85, 7, "role_a");
  await seedCard(s, { id: 88, leftId: 58, rightId: 18, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 87, leftId: 88, rightId: 3, dbContent: "[[Role A]]" });
  await seedReference(s, 87, 7, "role_a");
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck(storage);
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("unconditional-true read overrides (head/script/enabled_roles, layout+script mods)", () => {
  it("renders a +*head card whose stored rule denies (right::head true)", async () => {
    const s = storage!;
    expect(await s.engine.render("Locked Doc+*head", "content")).toContain("head bytes");
  });

  it("renders a +*script card whose stored rule denies (right::script true)", async () => {
    const s = storage!;
    expect(await s.engine.render("Locked Doc+*script", "content")).toContain("script bytes");
  });

  it("renders a +*enabled roles card whose stored rule denies", async () => {
    const s = storage!;
    expect(await s.engine.render("Locked Doc+*enabled roles", "content")).toContain(
      "roles bytes",
    );
  });
});

describe("account-family read overrides (card-mod-account)", () => {
  // p22-permover: the +*account card's :content dispatches the mod's core
  // view (set/right/account/views.rb:50-53 — the two labeled account-field
  // nests, ported onto the base coreView keyed on the right::account set),
  // so the stored db_content row ("anon account row" et al.) is no longer
  // the content surface for ANY +*account card — Ruby's set module hides it
  // identically. The override verdicts probe through the new shape: the
  // ALLOW verdict = the card renders at all (not the quiet denial span) and
  // the field slots render; a defer-to-stored-rule verdict = the same
  // non-denied render (the stored rule's grant still admits the page).
  it("allows Anonymous its own +*account (own_account?, right::account)", async () => {
    const s = storage!;
    const rendered = await s.engine.render("Anonymous+*account", "content");
    expect(rendered).not.toBe(quietDenial());
    // The account core view rendered (the labeled +*email field nest), and
    // the field's own content is visible — own_email? allows the holder's
    // email field inside the allowed account card.
    expect(rendered).toContain('data-card-name="Anonymous+*account+*email"');
    expect(rendered).toContain("anon@example.test");
  });

  it("allows Anonymous its own +*account+*email (own_email?, right::email)", async () => {
    const s = storage!;
    expect(await s.engine.render("Anonymous+*account+*email", "content")).toContain(
      "anon@example.test",
    );
  });

  it("chains own_account? through the +*account card for +*api key and +*password", async () => {
    const s = storage!;
    expect(await s.engine.render("Anonymous+*account+*api key", "content")).toContain(
      "anon api key",
    );
    // The own_account? chain ADMITS the render (the card is not denied —
    // that is the chain this pin asserts), but a password card never shows
    // its stored digest: card-mod-account right/password.rb view :core wraps
    // `:em { render_raw }` ("The password hash is NEVER rendered"), and the
    // mod-less harness's flat core carries the same refusal as the
    // `<em>encrypted</em>` placeholder. The chain's proof here is the render
    // being neither the quiet denial nor the sign-in form.
    const rendered = await s.engine.render("Anonymous+*account+*password", "content");
    expect(rendered).not.toBe(quietDenial());
    expect(rendered).not.toContain("anon password hash");
    expect(rendered).toContain("<em>encrypted</em>");
  });

  it("denies another holder's +*email even when the stored rule grants Anyone (right::email has no super)", async () => {
    const s = storage!;
    // Jane's +*email carries stored rule 8 ([[Anyone]]): the generic path
    // would allow; Ruby's right::email override denies every non-own viewer.
    expect(await s.engine.render("Jane Person+*email", "content")).toBe(quietDenial());
  });

  it("defers to the stored rule for another holder's +*account (own_account? || super)", async () => {
    const s = storage!;
    // own_account? is falsy for Anonymous viewing Jane's account, so the
    // override defers and the stored [[Anyone]] rule grants: the account
    // card renders (the mod core's labeled field slots, not the denial).
    // Jane's +*email slot inside it stays DENIED (right::email has no
    // super — the final-deny the next-adjacent test pins standalone).
    const rendered = await s.engine.render("Jane Person+*account", "content");
    expect(rendered).not.toBe(quietDenial());
    // The fixture seeds no +*email row for Jane, so the field slot renders
    // the phantom shape whose data-card-name carries the url_key form
    // (wrap.rb:50-53 slot_cardname, unsaved compound).
    expect(rendered).toContain('data-card-name="Jane_Person+*account+*email"');
  });

  it("denies another holder's +*api key via super (stored rule denies)", async () => {
    const s = storage!;
    expect(await s.engine.render("Jane Person+*api key", "content")).toBe(quietDenial());
  });

  it("defers when the left card is not an AccountHolder (accounted&.try -> nil)", async () => {
    const s = storage!;
    // Plain Doc is a Basic card: no set module defines own_account? on it,
    // so right::account's own_account? is falsy and super (stored rule)
    // decides -- stored [[Anyone]] allows: the card renders (the mod core's
    // labeled field slots; the +*email/+*password field rows are unseeded
    // here, so those slots render the unknown-card labeled shape).
    const rendered = await s.engine.render("Plain Doc+*account", "content");
    expect(rendered).not.toBe(quietDenial());
    expect(rendered).toContain('data-card-name="Plain_Doc+*account+*email"');
  });
});

describe("type_plus_right::set::style (card-mod-style)", () => {
  it("renders a Set+*style rule card whose stored rule denies", async () => {
    const s = storage!;
    expect(await s.engine.render("Styling Set+*style", "content")).toContain("style bytes");
  });
});

describe("right::asset_output (card-mod-assets): left.ok_to_read?", () => {
  it("allows the asset output of a readable left despite its own denying rule", async () => {
    const s = storage!;
    expect(await s.engine.render("Readable Doc+*asset output", "content")).toContain(
      "readable asset output",
    );
  });

  it("denies the asset output of a denied left even when its own rule grants Anyone", async () => {
    const s = storage!;
    // Stored rule 8 ([[Anyone]]) on the +*asset output row would allow; Ruby
    // replaces the verdict with the left card's.
    expect(await s.engine.render("Locked Doc+*asset output", "content")).toBe(quietDenial());
  });
});

describe("self-set read overrides (version/signin/account_links)", () => {
  it("allows the *version card itself despite its denying stored rule", async () => {
    const s = storage!;
    // The verdict is this suite's subject. The BYTES are version.rb's own
    // content override (mod/core/set/self/version.rb:5 `def content;
    // Cardio::Version.release; end` — rendered, not the denial span, and
    // not the seeded dbContent either: the set module replaces `content`
    // for this card in Ruby too).
    const html = await s.engine.render("*version", "content");
    expect(html).not.toContain("don't have permission");
    expect(html).toContain("card-slot");
  });

  it("allows the *signin card itself despite its denying stored rule", async () => {
    const s = storage!;
    // The verdict is this lane's subject. The BYTES are signin.rb's own
    // :core override (card-mod-account set/self/signin.rb:119-125 — the
    // sign-in form; edge-signin-form-fix lane 2026-10-03 ported it and the
    // html :content view wraps core, so the form is the readable body here
    // in Ruby too) — rendered, not the denial span, and not the seeded
    // dbContent either.
    const html = await s.engine.render("*signin", "content");
    expect(html).not.toContain("don't have permission");
    expect(html).toContain('action="/update/*signin"');
    expect(html).toContain('type="password"');
  });

  it("allows the *account links card itself despite its denying stored rule", async () => {
    const s = storage!;
    // The verdict is this suite's subject; the BYTES are account_links.rb's
    // own core override (set/self/account_links.rb:8 `view :core` renders
    // the #logging navbar, and :content wraps core) — never the denial
    // span and not the seeded dbContent.
    const html = await s.engine.render("*account links", "content");
    expect(html).not.toContain("don't have permission");
    expect(html).toContain('id="logging"');
  });
});

describe("the generic path still denies without an override (the probe control)", () => {
  it("keeps the plain locked card denied (FOR CHILDREN'S CLASS control shape)", async () => {
    const s = storage!;
    expect(await s.engine.render("Locked Doc", "content")).toBe(quietDenial());
  });

  it("keeps a stored-denied compound without an override denied", async () => {
    const s = storage!;
    // Locked Doc+*self is a Set card under the locked anchor; no override
    // matches (tag *self) -- the live _left walk inherits the lock.
    expect(await s.engine.render("Locked Doc+*self", "content")).toBe(quietDenial());
  });
});

describe("virtual rule cards under a readable set (the FOR CHILDREN'S CLASS+*self nav shape)", () => {
  let html = "";
  beforeAll(async () => {
    // The set card's :content renders the rules-editor nav; each visible
    // setting builds a VIRTUAL rule card (no row) whose verdict must come
    // from the same override-aware walk. "Readable Doc+*self+*default"
    // resolves the tag-scoped *default+*right+*read ([[Role A]]) and denies;
    // "Readable Doc+*self+*head" resolves *head+*right+*read ([[Role A]])
    // too -- right::head overrides it to allow.
    html = await storage!.engine.render("Readable Doc+*self", "content");
  }, 60_000);

  it("renders the +*head virtual rule bar where the generic walk denies", () => {
    // The bar's data-card-name attribute carries the CANONICAL name shape
    // (spaces -> underscores), as in the corpus navs.
    const headIdx = html.indexOf('data-card-name="Readable_Doc+*self+*head"');
    expect(headIdx).toBeGreaterThan(-1);
    // The li OPENING immediately before the head bar carries the rendered
    // bar, not the denial span (lastIndexOf, not a leftmost lazy regex:
    // the nav legitimately renders OTHER denied bars earlier in the list).
    const liOpen = html.lastIndexOf('<li class="nav-item">', headIdx);
    expect(liOpen).toBeGreaterThan(-1);
    expect(html.slice(liOpen, headIdx)).not.toContain('class="denied"');
  });

  it("still denies the virtual bars no override grants", () => {
    expect(html).toContain('class="denied"');
    expect(html).not.toContain('data-card-name="Readable_Doc+*self+*default"');
  });
});

describe("update-task overrides (the universal_edit_button family)", () => {
  /** The viewer key comes from the seeded Anonymous card so the test tracks
   *  whatever inflection config is active (default rules: "anonymou"). */
  async function updateOverride(name: string): Promise<boolean | undefined> {
    const s = storage!;
    const anon = await s.fetcher.fetchById(6);
    return updatePermissionOverride(DeckoName.parse(name), {
      viewerKey: anon?.key,
      fetchByKey: (key) => s.fetcher.fetchByKey(key),
      fetchById: (id) => s.fetcher.fetchById(id),
    });
  }

  it("allows updating one's own +*account (right::account ok_to_update?, clean arm)", async () => {
    expect(await updateOverride("Anonymous+*account")).toBe(true);
  });

  it("allows updating one's own +*account+*email through the AccountField chain", async () => {
    // account_field.rb:3-5: the left is the account card iff its right_id
    // is the *account card; then its own_account? chains to the holder.
    expect(await updateOverride("Anonymous+*account+*email")).toBe(true);
  });

  it("defers for an account field WITHOUT the +*account middle (account_card nil)", async () => {
    // Jane Person+*email: the left ("Jane Person") has no right_id, so
    // account_card is nil and Ruby runs super (generic permit(:update)).
    expect(await updateOverride("Jane Person+*email")).toBeUndefined();
  });

  it("defers, without raising, for an account field whose +*account card does not resolve (deliberate)", async () => {
    // Ruby's Abstract::AccountField#account_card reads `left.right_id`; when
    // the "<holder>+*account" left does not resolve, left is nil and ok?
    // raises NoMethodError (the semantics census's four account fields of
    // one user). The port does not copy the crash: it gives the answer Ruby
    // intends for a field with no account card, super (the generic
    // permission check), for update and for read alike.
    expect(await updateOverride("Ghost Holder+*account+*email")).toBeUndefined();
    expect(await updateOverride("Ghost Holder+*account+*status")).toBeUndefined();
    const s = storage!;
    const anon = await s.fetcher.fetchById(6);
    expect(
      await readPermissionOverride(DeckoName.parse("Ghost Holder+*account+*password"), {
        viewerKey: anon?.key,
        fetchByKey: (key) => s.fetcher.fetchByKey(key),
        fetchById: (id) => s.fetcher.fetchById(id),
        leftReadVerdict: async () => undefined,
      }),
    ).toBeUndefined();
  });

  it("DENIES changing one's own account status (right::status own-status lock)", async () => {
    expect(await updateOverride("Anonymous+*account+*status")).toBe(false);
  });

  it("defers for another holder's +*account (own_account? false -> super)", async () => {
    expect(await updateOverride("Jane Person+*account")).toBeUndefined();
  });

  it("allows a holder to update its own card, defers for another's (account_holder.rb:59)", async () => {
    expect(await updateOverride("Anonymous")).toBe(true);
    expect(await updateOverride("Jane Person")).toBeUndefined();
  });

  it("defers for tags no update override covers (right::head etc.)", async () => {
    expect(await updateOverride("Locked Doc+*head")).toBeUndefined();
  });
});
