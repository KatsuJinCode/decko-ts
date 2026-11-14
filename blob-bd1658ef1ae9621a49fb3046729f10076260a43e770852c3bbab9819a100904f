// The ANONYMOUS EDIT DENIAL AND ITS SIGN-IN LINK pin (registry row cap-S5,
// "Anonymous user opens a card edit modal, sees denial, then follows its
// sign-in link to the credential form").
//
// ORACLE-PINNED: fixtures/captured/anonymous-edit-denial-signin.json,
// captured from the pinned gemset (card-mod-format-0.20.0 and
// card-mod-account-0.20.0) by
// tests/card/mod-loader/oracle-capture-anonymous-edit-denial-signin.rb.
//
// What the contract is, in the pinned bytes:
//
//   1. card-mod-format-0.20.0 set/all/html/error.rb - THE DENIAL:
//      `loud_denial` is `voo.hide :menu; frame { [wrap_with(:h1,
//      t(:format_sorry)), wrap_with(:div, loud_denial_message)] }`, so the
//      denial's heading is Ruby's own "Sorry!", and `loud_denial_message`
//      picks by SESSION state, with the signed-out branch
//      `sign_in_or_up_links to_do_unauthorized_task`.
//   2. card-mod-format-0.20.0 set/all/html/error.rb - THE LINK: the
//      `sign_in_or_up_links` sentence joins the sign-in and sign-up links
//      with " or ", and `signin_link` is the anchor with the "signin-link"
//      class whose path is `{ view: :titled }`.
//   3. card-mod-format-0.20.0 config/locales/en.yml - THE THREE TEXTS:
//      format_sorry is "Sorry!", format_please is "Please" and format_or is
//      "or".
//   4. card-mod-account-0.20.0 set/self/signin.rb - THE CREDENTIAL FORM:
//      `view :core` is the `card_form :update` over the haml template, and
//      `signin_field` nests the email and the password with the "titled"
//      view.
//
// The port side is the denial view (src/card/render/format.ts) and the
// sign-in form's own emitter (src/card/render/signin-core-form-view.ts).
//
// The instrument is the harness's own anonymous leg
// (tools/edge-signed-in-exercise/checks-cover-b.mjs), which grades the
// credential form through the predicate in
// tools/edge-signed-in-exercise/lib/signin-credential-form.mjs: the
// sign-in card's own slot AND the two field names the write path parses.
// That predicate is what the row's recorded finding asked for - the
// evidence used to carry only a 200 on /*signin, with no rendered
// email/password pair.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifiedCapabilities } from "../../../tools/edge-signed-in-exercise/lib/local-policy.mjs";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const capture = JSON.parse(
  readFileSync(
    new URL(
      "./../../../fixtures/captured/anonymous-edit-denial-signin.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const portFormat = readFileSync(
  new URL("./../../../src/card/render/format.ts", import.meta.url),
  "utf8",
);
const portForm = readFileSync(
  new URL("./../../../src/card/render/signin-core-form-view.ts", import.meta.url),
  "utf8",
);
const credentialPredicate = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/lib/signin-credential-form.mjs",
    import.meta.url,
  ),
  "utf8",
);
const coverB = readFileSync(
  new URL(
    "./../../../tools/edge-signed-in-exercise/checks-cover-b.mjs",
    import.meta.url,
  ),
  "utf8",
);
const roster = JSON.parse(
  readFileSync(
    new URL(
      "./../../../tools/edge-signed-in-exercise/capabilities.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const ROW_CHECK =
  "S5 Anonymous user opens a card edit modal, sees denial, then follows its sign-in link to the card";

describe("the pinned Ruby's own bytes for the denial and its sign-in link", () => {
  it("the denial's heading is Ruby's own", () => {
    expect(capture.facts.loud_denial_method).toBe("def loud_denial");
    expect(capture.facts.loud_denial_heading).toBe(
      "wrap_with(:h1, t(:format_sorry))",
    );
    expect(capture.facts.loud_denial_body).toBe(
      "wrap_with(:div, loud_denial_message)",
    );
    expect(capture.facts.sorry_text).toBe("Sorry!");
  });

  it("the signed-out branch offers the sign-in links", () => {
    expect(capture.facts.loud_denial_message_method).toBe(
      "def loud_denial_message",
    );
    expect(capture.facts.loud_denial_signed_in_branch).toBe(
      "when Auth.signed_in?",
    );
    expect(capture.facts.loud_denial_signed_out_branch).toBe(
      "sign_in_or_up_links to_do_unauthorized_task",
    );
  });

  it("the sentence joins the two links with Ruby's own words", () => {
    expect(capture.facts.sign_in_or_up_links_method).toBe(
      "def sign_in_or_up_links to_task",
    );
    expect(capture.facts.sign_in_or_up_links_body).toBe(
      'links = [signin_link, signup_link].compact.join " #{t(:format_or)} "',
    );
    expect(capture.facts.sign_in_or_up_links_sentence).toBe(
      "\"#{[t(:format_please), links, to_task].join(' ')}.\"",
    );
    expect(capture.facts.please_text).toBe("Please");
    expect(capture.facts.or_text).toBe("or");
  });

  it("the link is the signin-link class, pointed at the titled view", () => {
    expect(capture.facts.signin_link_method).toBe("def signin_link");
    expect(capture.facts.signin_link_call).toBe(
      "link_to_card :signin, t(:account_sign_in)&.downcase,",
    );
    expect(capture.facts.signin_link_class).toBe(
      'class: "signin-link", path: signin_link_path',
    );
    expect(capture.facts.signin_link_path_method).toBe(
      "def signin_link_path",
    );
    expect(capture.facts.signin_link_path_view).toBe("{ view: :titled }");
  });

  it("the credential form is the update form over the two titled fields", () => {
    expect(capture.facts.signin_core_view).toBe(
      "view :core, cache: :never do",
    );
    expect(capture.facts.signin_core_form).toBe(
      "card_form :update, recaptcha: :off, success: signin_success do",
    );
    expect(capture.facts.signin_core_haml).toBe("haml :core");
    expect(capture.facts.signin_field_method).toBe("def signin_field name");
    expect(capture.facts.signin_field_tuple).toBe(
      '[nest_name, { title: name.to_s, view: "titled",',
    );
    expect(capture.facts.signin_field_view).toBe(
      "nest_name: nest_name, skip_perms: true }]",
    );
  });

  it("the capture names the gemsets it photographed", () => {
    expect(capture.oracle.loud_denial.gem).toBe("card-mod-format-0.20.0");
    expect(capture.oracle.sorry_locale.gem).toBe("card-mod-format-0.20.0");
    expect(capture.oracle.signin_core_view.gem).toBe(
      "card-mod-account-0.20.0",
    );
    expect(capture.oracle.signin_field.gem).toBe("card-mod-account-0.20.0");
    for (const owner of Object.values(capture.oracle) as Array<{
      file_sha256: string;
    }>) {
      expect(owner.file_sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("the port carries the pinned bytes", () => {
  it("the port's denial carries Ruby's own heading", () => {
    expect(portFormat).toContain(
      'const body = `<div class="${bodyClasses} card-body card-text"><h1>Sorry!</h1>\\n${message}</div>`;',
    );
  });

  it("the port's signed-out denial carries the sign-in link", () => {
    expect(portFormat).toContain(
      '`<div><div>Please <a class="signin-link known-card" href="/*signin/titled">sign in</a> or ` +',
    );
  });

  it("the port's sign-in form nests the email and the password with the titled view", () => {
    expect(portForm).toContain(
      'const editStructure = [signinField("email"), signinField("password")];',
    );
    expect(portForm).toContain(
      '{ title: name, view: "titled", nest_name: nestName, skip_perms: true },',
    );
  });
});

describe("the harness's S5 leg cannot pass vacuously", () => {
  it("the cover-b module records the row's check", () => {
    expect(coverB).toContain(`record("${ROW_CHECK}",`);
  });

  it("the credential form is read from the destination page's own HTML", () => {
    expect(coverB).toContain(
      "const credential = hasCredentialForm(await page.content());",
    );
    expect(coverB).toContain(
      "backLegs.credentialFormRendered = credential.ok;",
    );
  });

  it("the credential form is three reads, not a 200", () => {
    expect(credentialPredicate).toContain(
      'const SIGNIN_CARD_SLOT = /class="[^"]*\\bSELF-Xsignin\\b/;',
    );
    expect(credentialPredicate).toContain(
      'email: "card[subcards][+*email][content]",',
    );
    expect(credentialPredicate).toContain(
      'password: "card[subcards][+*password][content]",',
    );
    expect(credentialPredicate).toContain(
      "return { ok: legs.signinCardSlot && legs.emailField && legs.passwordField, legs };",
    );
  });

  it("the verdict needs the credential form AND the landing back on the card", () => {
    expect(coverB).toContain(
      "back = signInStatus !== null && signInStatus < 400 && !returnNavigation.error && backLegs.credentialFormRendered && backLegs.accountNameShown && backLegs.offSigninRoute && backLegs.targetCardRendered;",
    );
  });

  it("the roster declares the row's check and nothing else", () => {
    const row = roster.capabilities.find((c: { id: string }) => c.id === "S5");
    expect(row).toBeDefined();
    expect(row.status).toBe("covered");
    expect(row.checks).toEqual([ROW_CHECK]);
  });

  it("the grader credits the row only when the check passes", () => {
    const row = roster.capabilities.find((c: { id: string }) => c.id === "S5");
    expect(
      verifiedCapabilities([row], [{ check: ROW_CHECK, pass: true }]).find(
        (c: { id: string }) => c.id === "S5",
      )?.status,
    ).toBe("covered");
    expect(
      verifiedCapabilities([row], [{ check: ROW_CHECK, pass: false }]).find(
        (c: { id: string }) => c.id === "S5",
      )?.status,
    ).not.toBe("covered");
    expect(
      verifiedCapabilities([row], []).find((c: { id: string }) => c.id === "S5")
        ?.status,
    ).not.toBe("covered");
  });
});

describe("the capture lives where the rig writes it", () => {
  it("the fixture file is on disk at the path the rig names", () => {
    expect(capture.contract).toContain("credential form");
    expect(
      readFileSync(
        repoRoot + "fixtures/captured/anonymous-edit-denial-signin.json",
        "utf8",
      ),
    ).toContain('"signin_link_class"');
  });
});
