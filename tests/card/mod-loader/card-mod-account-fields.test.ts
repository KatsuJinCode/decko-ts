// card-mod-account's remaining render half of the right/account +
// right/password set files (surfaces-batch3):
//
//   - right/account/views.rb:50-57 (html block) view :core — the account
//     field nests: `[account_field_nest(:email, "email"),
//     account_field_nest(:password, "password")]` where
//     account_field_nest = `field_nest field, title: title, view: :labeled`
//     (nesting.rb:27-31 field_nest: fullname = card.name.field(field); nest
//     fullname, opts). The +*account :core is the member-page account area.
//
//   - right/password.rb:53-55 view :raw — `t :account_encrypted` (en.yml:6,
//     the string "encrypted"); right/password.rb:81-83 (html block)
//     view :core, wrap: :em — `render_raw` wrapped in <em>. These are the
//     visible half of every password field (a labeled render of a
//     +password card shows the mod's "encrypted" stand-in, never the hash).
//
// Proof shape (A/B per ported view, the file's own convention):
//   WITHOUT the mod the views raise UnsupportedViewError (right/password is
//   registered PASSIVE today — the manifest entry carries no views — and
//   right/account/views carries no :core), WITH the mod they render.
//
// Byte basis: GEM-DERIVED (structural + locale bytes). No capture shard
// renders +*account :core (account cards are read-denied to anonymous
// readers, so the oracle's expected-v2 carries denial chrome for them, not
// these bodies); right/password's "encrypted" is the gem's own en.yml
// string, transcribed verbatim.
//
// NAMED REMAINDERS of the same two files, NOT ported here with their
// mechanisms (so no reader mistakes them for done):
//   - right/account/views.rb:2-8 :verify_url / :reset_password_url — the
//     view bodies are exactly buildAccountTokenUrl's output
//     (src/card/auth/account-verify-reset-flows.ts:483-486), but a ViewFn
//     is synchronous while the HMAC token encode is async — the named
//     async-view boundary. The flows substitute their own tokens today.
//   - right/account/views.rb:60-62 before :content_formgroups — sets
//     voo.edit_structure for the edit-form machinery (E1's surface).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import cardModAccount from "../../../src/card/mod-loader/mods/card-mod-account.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

/** The probe deck, seeded on a fresh storage with the given read viewer.
 *  card-mod-account's Right::Email overrides ok_to_read? (set/right/email.rb:
 *  39-43 `own_email? || Auth.always_ok?` else deny_because — NO super), and
 *  own_email? (email.rb:45-47) is `name.part_names[0].key == Auth.as_card.key`.
 *  So a +*email card is readable ONLY to the account it is a field of: the
 *  deck's Fields Probe Member (id 120). `viewer` must be set BEFORE the
 *  engine's first render — the read verdict memoizes Auth.as_card.key for
 *  the engine's lifetime (render.ts resolveViewerKey), so a viewer assigned
 *  after a first render does not take. */
async function deckFor(viewer?: RenderTestStorage["engine"]["viewer"]): Promise<RenderTestStorage> {
  const s = await createRenderTestStorage();
  if (viewer !== undefined) s.engine.viewer = viewer;

  // codename/type scaffolding (the same shape the account A/B suite seeds)
  await seedCard(s, { id: 2, name: "RichText" }); // cardtypes' type card
  await seedCard(s, { id: 4, name: "User", codename: "user", typeId: 2 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });

  // the *account setting card (right anchor of Right::Account)
  await seedCard(s, { id: 111, name: "*account", codename: "account", typeId: 14 });
  // the +*email / +*password right cards (the starred setting names —
  // account.rb's card_accessor fields resolve through the codename lookup:
  // field(:email) stars the mark, runtime-probed
  // ("".to_name.field(:email) == "+*email"))
  await seedCard(s, { id: 130, name: "*email", codename: "email", typeId: 14 });
  await seedCard(s, { id: 140, name: "*password", codename: "password", typeId: 14 });

  // Fields Probe Member (a User) with its account fields. DECK SHAPE
  // (raw deck read-only SELECT, cards k JOIN k.left_id = junction — the
  // real deck's account fields are the STARRED children of the +*account
  // junction ("Mira Member+*account": +*email Phrase id 619, +*password
  // Phrase id 620, +*status/+*salt PlainText): field_nest's
  // card.name.field(:email) = "<junction>+*email".
  await seedCard(s, { id: 120, name: "Fields Probe Member", typeId: 4, dbContent: "member body" });
  await seedCard(s, {
    id: 121,
    name: "Fields Probe Member+*account+*email",
    leftId: 110, // the +*account junction — the field of the junction
    rightId: 130,
    typeId: 2,
    dbContent: "probe@example.com",
  });
  await seedCard(s, {
    id: 141,
    name: "Fields Probe Member+*account+*password",
    leftId: 110, // the +*account junction
    rightId: 140,
    typeId: 2,
    dbContent: "fake-hash-not-a-real-password",
  });
  // the +*account junction (right = the *account setting)
  await seedCard(s, {
    id: 110,
    leftId: 120,
    rightId: 111,
    typeId: 14,
    dbContent: "account junction body",
  });
  return s;
}

/** A member-viewed deck with card-mod-account loaded (the email-content
 *  tests' surface; closed by the caller). */
async function memberDeck(): Promise<RenderTestStorage> {
  const s = await deckFor({ signedIn: true, actorId: 120 });
  const modLoader = new ModLoader([{ manifest: cardModAccount }]);
  modLoader.load();
  bindModLoaderToEngine(s, modLoader);
  await modLoader.installInto(modEngineHost(s.engine, s.fetcher));
  return s;
}

beforeAll(async () => {
  // The shared deck is the ANONYMOUS viewer's, as before: the password
  // views below render through the generic read rule (right/password.rb:17
  // is `own_account? || super`, and an anonymous viewer is not the account
  // holder). The email-content tests build their own member-viewed deck.
  storage = await deckFor();
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("card-mod-account field views (right/account :core + right/password raw/core)", () => {
  // CORRECTED A/B (the red run itself taught this): :core is a base view on
  // every card — without the mod the +account junction's SETTING-typed
  // right gives the Setting cardtype's rules listing (the same probe-shape
  // truth batch A-C recorded for Setting-typed junctions). The junction
  // child's :raw has NO flat registration on its chain (observed: raises
  // UnsupportedViewError) — the mod's Right::Password registration is what
  // makes the view exist there, so the A/B for raw/core is raises → bytes.
  it("WITHOUT the mod: the +*password child raw raises (the mod registration is what makes the view exist)", async () => {
    const s = storage!;
    // The starred deck shape's base :core already renders both children's
    // labeled slots with their titles (verified 2026-10-09 while landing the
    // starred field marks), so a body-level A/B no longer distinguishes;
    // the child raw view is the surface that needs the mod registration.
    await expect(
      s.engine.render("Fields_Probe_Member+*account+*password", "raw"),
    ).rejects.toThrow(UnsupportedViewError);
    // ...and :input falls through to card-mod-edit's all/editor :input,
    // which DOES carry the content (the leak the round-9 :input
    // registration closes — see the :input pins at the end of this file).
    const input = await s.engine.render(
      "Fields Probe Member+*account+*password",
      "input",
    );
    expect(input).toContain("fake-hash-not-a-real-password");
  });

  it("WITH the mod: +*account :core renders the email+password field nests (views.rb:50-57)", async () => {
    // Rendered as the account holder (memberDeck): right/email.rb:39-43
    // denies a +*email card to every viewer but the account itself, and the
    // field nests render the email child's :labeled — so the anonymous
    // viewer sees denial chrome for the whole nest row, not the nests.
    const s = await memberDeck();
    try {
      const actual = await s.engine.render("Fields Probe Member+*account", "core");
      // The two programmatic field nests (output() joins the array body with
      // a newline — content.rb:70-73; the slot markup itself is multi-line).
      // Each nest renders the child card's :labeled view in a slot carrying
      // the field_nest's title, and the slots appear in Ruby's order
      // (email first, then password). The slot IDs and the data-slot opts are
      // the warming-independent invariants (whether the nested child renders
      // resolved or fabricated-unknown depends on the prefetch cache — see
      // the NAMED SEAM note).
      const emailIdx = actual.indexOf("field_probe_member-Xaccount-Xemail-labeled-view");
      const passwordIdx = actual.indexOf(
        "field_probe_member-Xaccount-Xpassword-labeled-view",
      );
      expect(emailIdx).toBeGreaterThan(-1);
      expect(passwordIdx).toBeGreaterThan(emailIdx);
      expect(actual).toContain("labeled-view");
      expect(actual).toContain(
        '&quot;title&quot;:&quot;email&quot;',
      );
      expect(actual).toContain(
        '&quot;title&quot;:&quot;password&quot;',
      );
      expect(actual).toContain("&quot;nest_name&quot;:&quot;+*email&quot;");
      expect(actual).toContain("&quot;nest_name&quot;:&quot;+*password&quot;");
      // The child card's own renders are complete: its :core is the
      // linkified email body (RichText URI scan), its :labeled carries the
      // row id + content.
      const childCore = await s.engine.render(
        "Fields Probe Member+*account+*email",
        "core",
      );
      expect(childCore).toContain('href="mailto:probe@example.com"');
      const childLabeled = await s.engine.render(
        "Fields Probe Member+*account+*email",
        "labeled",
      );
      expect(childLabeled).toContain('data-card-id="121"');
      expect(childLabeled).toContain("probe@example.com");
    } finally {
      s.close();
    }
  });

  it("WITH the mod: +password :raw renders the en.yml string (right/password.rb:53-55)", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModAccount }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    // t(:account_encrypted) — card-mod-account en.yml:6 "encrypted: encrypted"
    // under the account scope. The hash content is NEVER rendered.
    expect(await s.engine.render("Fields_Probe_Member+*account+*password", "raw")).toBe("encrypted");
  });

  it("WITH the mod: +password :core wraps the raw in <em> (right/password.rb:81-83)", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModAccount }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    // view :core, wrap: :em do render_raw end — the wrap: :em config wraps
    // the body in the em tag (the port emits the wrap in-body; the loader's
    // config.wrap field is declaration-only today).
    expect(await s.engine.render("Fields_Probe_Member+*account+*password", "core")).toBe(
      "<em>encrypted</em>",
    );
  });

  // The round-9 security pin. GET /:account+*password/input returned the
  // stored PBKDF2 digest on the demo deck, because the right/password set
  // registered only :raw and :core: an :input render fell through to
  // card-mod-edit's all/editor :input, whose every arm carries the card's
  // content (text_field's value=, the tinymce textarea's body). Ruby routes
  // it to password_input (right/password.rb:86-88 `input_type :password`
  // reaches editor.rb:33 `try(input_method(input_type))` FIRST), and Rails
  // renders a password field with the value attribute always nil
  // (Tags::PasswordField#render).
  //
  // The A/B pair below: the assertion lives in the FIRST test, the only
  // window in this file where no mod is bound (every later test installs one
  // into the shared engine), so the pin is not vacuous.
  it("WITH the mod: +password :input is the VALUELESS password field (password_input.haml)", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModAccount }]);
    loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    const input = await s.engine.render(
      "Fields Probe Member+*account+*password",
      "input",
    );
    // The security assertion: the stored hash is not in the bytes, and the
    // input carries no value attribute at all (not an empty one — Rails'
    // tag_options drops nil-valued attributes, so `value=` must not appear).
    expect(input).not.toContain("fake-hash-not-a-real-password");
    expect(input).not.toMatch(/\bvalue=/);
    // The gem's own bytes: bootstrap_options' " form-control" append, the
    // caller's class/placeholder/autocomplete, Rails' type, then name+id —
    // and the haml's toggle-password affordance after the input (the
    // live-oracle probe receipt; this file's earlier version had it as a
    // named remainder before the probe pinned the full bytes).
    expect(input).toBe(
      '<input class="d0-card-content _pw-input form-control" placeholder="Password" ' +
        'autocomplete="off" type="password" name="card[content]" id="card_content" />\n' +
        "<span class='_toggle-password visibility-icon _pw-text-area'>\n" +
        '<i class="_toggle-pw-visibility notranslate material-icons">visibility_off</i>\n' +
        "</span>\n",
    );
  });

  it("WITH the mod: the OTHER account field keeps its content-bearing input (the pin is password-specific)", async () => {
    // Right::Email's own ok_to_read? override (right/email.rb:39-43,
    // own_email? || always_ok? else DENY) admits only the account holder, so
    // the pin renders on the member's deck — the same viewer Ruby would
    // show this field to.
    const s = await memberDeck();
    try {
      // right/email.rb declares no input_type override and no input view, so
      // an email field's :input is the editor's ordinary text field WITH its
      // value. If this ever fails the way the password pin did, the :input
      // registration has widened past the password set.
      const emailInput = await s.engine.render(
        "Fields Probe Member+*account+*email",
        "input",
      );
      expect(emailInput).toContain("probe@example.com");
    } finally {
      s.close();
    }
  });
});
