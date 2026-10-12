// The *signin :core view — the sign-in form — pinned byte-for-byte.
//
// THE BUG THIS PIN LOCKS SHUT: without self/signin :core
// (card-mod-account-0.20.0 set/self/signin.rb:119-125 — card_form :update,
// recaptcha: :off, success: signin_success, wrapping the core.haml
// template), GET /*signin renders the *signin card's base RichText
// content — EMPTY, since *signin stores no body content — in the titled
// body: an operator clicking "Sign In" gets no email field, no password
// field, no submit. The gem's :core override is what renders the form.
//
// What is DERIVED at render time (not stored): the card id in the form
// dom id, the subcards' type/set keys (from the render cache when the
// prefetch holds them; the account mod's own invariants —
// right/email.rb and right/password.rb assign_type :phrase — when it
// does not, which is the cold-render case: fetchRenderCard is
// cache-only), and the email field's stored content as the input value.
// The ONLY byte this file normalizes is the per-render random
// data-slot-id (SecureRandom hex(10), the repo-wide RANDOMIZED
// convention).
//
// Ruby line citations in the expectations match the
// rubygems.org card-mod-account-0.20.0 gem.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModAccount from "../../../src/card/mod-loader/mods/card-mod-account.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // the codename/type anchors the set-key walk resolves through — the ids
  // the pinned form bytes carry (RichText type_id 3, Phrase type_id 52),
  // so the derived subcard bytes agree with the expectations below.
  await seedCard(s, { id: 3, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 52, name: "Phrase", codename: "phrase" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });

  // *signin: RichText (type_id 3), EMPTY content — the seeded shape that
  // makes a render without the mod's :core override a blank body.
  await seedCard(s, {
    id: 19957,
    name: "*signin",
    codename: "signin",
    typeId: 3,
    dbContent: "",
  });
  // the *email / *password rights and the two subcards the form's editor
  // fields address (the write path reads the same subcards on sign-in).
  await seedCard(s, { id: 130, name: "email", codename: "email", typeId: 14 });
  await seedCard(s, { id: 131, name: "password", codename: "password", typeId: 14 });
  await seedCard(s, {
    id: 19958,
    leftId: 19957,
    rightId: 130,
    typeId: 52, // Phrase — the type the pinned bytes carry for both subcards
    dbContent: "",
  });
  await seedCard(s, {
    id: 19959,
    leftId: 19957,
    rightId: 131,
    typeId: 52,
    dbContent: "",
  });

  loader = new ModLoader([{ manifest: cardModAccount }]);
  await loader.load();
  bindModLoaderToEngine(s, loader);
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

/** The repo-wide slot-id normalization (card-mod-api_key.test.ts). */
function normalize(html: string): string {
  return html.replace(/data-slot-id=(["'])[0-9a-fA-F]+\1/g, 'data-slot-id="RANDOMIZED"');
}

/** The expected :core bytes: the sign-in form the gem's self/signin view
 *  renders. The seeded card id IS 19957, so the derived form dom id
 *  (edit_card_19957) matches the pinned bytes exactly; data-slot-id is the
 *  one normalized byte. */
const ORACLE_FORM = `<form class="card-form slotter autosave" id="edit_card_19957" recaptcha="off" action="/update/*signin" accept-charset="UTF-8" data-remote="true" method="post"><input name="utf8" type="hidden" value="&#x2713;" autocomplete="off" /><input type="hidden" name="_method" value="patch" autocomplete="off" /><input type="hidden" name="success[redirect]" id="success_redirect" value="true" autocomplete="off" /><input type="hidden" name="success[mark]" id="success_mark" value="*previous" autocomplete="off" /><div class='signin-fields'>
<fieldset class="card-editor editor"><div class="form-group card-editor RIGHT-Xemail" data-card-name="*signin+*email" data-card-link-name="*signin+*email"><label for="card_subcards___email_content"><span class="card-title" title="email">email</span>
<div id="Xsignin-Xemail-help-view" class="card-slot help-view ALL ALL_PLUS TYPE-phrase RSTAR RIGHT-Xemail TYPE_PLUS_RIGHT-rich_text-Xemail" data-card-name="*signin+*email" data-card-type-id="52" data-card-type-name="Phrase" data-card-link-name="*signin+*email" data-slot-id="RANDOMIZED" data-slot="{&quot;view&quot;:&quot;help&quot;,&quot;show&quot;:[&quot;edit_in_form&quot;,&quot;help&quot;],&quot;home_view&quot;:&quot;titled&quot;,&quot;title&quot;:&quot;email&quot;,&quot;name_context&quot;:&quot;*signin&quot;}"></div></label>
<div class="editor content-editor"><input class="d0-card-content form-control" placeholder="" type="text" value="" name="card[subcards][+*email][content]" id="card_subcards___email_content" />
<input autocomplete="off" type="hidden" value="52" name="card[subcards][+*email][type_id]" id="card_subcards___email_type_id" /></div></div>
<div class="form-group card-editor RIGHT-Xpassword" data-card-name="*signin+*password" data-card-link-name="*signin+*password"><label for="card_subcards___password_content"><span class="card-title" title="password">password</span>
<div id="Xsignin-Xpassword-help-view" class="card-slot help-view ALL ALL_PLUS TYPE-phrase RSTAR RIGHT-Xpassword TYPE_PLUS_RIGHT-rich_text-Xpassword" data-card-name="*signin+*password" data-card-type-id="52" data-card-type-name="Phrase" data-card-link-name="*signin+*password" data-slot-id="RANDOMIZED" data-slot="{&quot;view&quot;:&quot;help&quot;,&quot;show&quot;:[&quot;edit_in_form&quot;,&quot;help&quot;],&quot;home_view&quot;:&quot;titled&quot;,&quot;title&quot;:&quot;password&quot;,&quot;name_context&quot;:&quot;*signin&quot;}"></div></label>
<div class="editor content-editor"><input class="d0-card-content _pw-input form-control" placeholder="Password" autocomplete="off" type="password" name="card[subcards][+*password][content]" id="card_subcards___password_content" />
<span class='_toggle-password visibility-icon _pw-text-area'>
<i class="_toggle-pw-visibility notranslate material-icons">visibility_off</i>
</span>

<input autocomplete="off" type="hidden" value="52" name="card[subcards][+*password][type_id]" id="card_subcards___password_type_id" /></div></div></fieldset>
</div>
<div class='form-group signin-buttons'>
<div class='reset-password-link'>
<a rel="nofollow" class="slotter" href="/*signin/edit?slot%5Bhide%5D%5B%5D=board_link" data-remote="true">Reset password</a>
</div>
<div class='signin-button'>
<button name="button" type="submit" class="btn btn-primary">Sign in</button>
</div>
<div class='signup-button'>
<a class="known-card" href="/new/Sign_up">...or sign up!</a>
</div>
</div>
</form>`;

describe("self/signin :core — the sign-in form (edge-signin-form-fix lane)", () => {
  it("renders the live-oracle form bytes on the :core view", async () => {
    const s = storage!;
    const html = await s.engine.render("*signin", "core");
    expect(normalize(html)).toBe(ORACLE_FORM);
  });

  it("open_content delegates to core (signin.rb:139-142), so the titled body carries the form", async () => {
    const s = storage!;
    expect(normalize(await s.engine.render("*signin", "open_content"))).toBe(
      normalize(await s.engine.render("*signin", "core")),
    );
    const titled = normalize(await s.engine.render("*signin", "titled"));
    // the titled wrap the layout's {{_main|titled}} chunk produces, with the
    // form (not the empty content) as the body
    expect(titled).toContain(
      `<div class="d0-card-body d0-card-content ALL TYPE-rich_text STAR SELF-Xsignin">` +
        `<form class="card-form slotter autosave" id="edit_card_19957"`,
    );
    expect(titled).toContain(ORACLE_FORM);
    expect(titled).toContain(
      `<span class="card-title" title="Sign In">Sign In</span>`,
    );
  });

  it("the form's name grammar IS the write path's parsed sign-in grammar", async () => {
    // the inputs the pinned bytes carry are exactly the names
    // handleSigninUpdate reads (write-routes.ts parsed.subcards["+*email"] /
    // ["+*password"]) — the form and the login action cannot drift apart.
    const html = await storage!.engine.render("*signin", "core");
    expect(html).toContain(`name="card[subcards][+*email][content]"`);
    expect(html).toContain(`name="card[subcards][+*password][content]"`);
    expect(html).toContain(`action="/update/*signin"`);
    expect(html).toContain(`<input type="hidden" name="_method" value="patch"`);
  });

  it("no authenticity_token (embed_authenticity_token_in_remote_forms=false)", () => {
    return expect(storage!.engine.render("*signin", "core")).resolves.not.toContain(
      "authenticity_token",
    );
  });

  it("the base :content view still renders the card's stored content (the form is a :core override, not a content rewrite)", async () => {
    // pins the blast radius: only :core (and its open_content delegation)
    // changed — plain cards' :content still renders stored content, so
    // existing content-render pins keep their meaning.
    const s = storage!;
    await seedCard(s, { id: 19960, name: "Plain Signin Body", dbContent: "stored body bytes" });
    expect(await s.engine.render("Plain Signin Body", "content")).toContain(
      "stored body bytes",
    );
  });
});
