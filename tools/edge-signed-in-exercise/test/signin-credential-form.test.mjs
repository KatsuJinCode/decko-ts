// The S5 credential-form leg — "then follows its sign-in link to the
// credential form" — graded against the bytes the port renders for the
// sign-in card and against the pages that must NOT satisfy it.
//
//   node --test tools/edge-signed-in-exercise/test/signin-credential-form.test.mjs
//
// The positive fixture is the port's production-capture golden for the
// :core sign-in form (tests/card/mod-loader/signin-core-form-view.test.ts's
// ORACLE_FORM, transcribed verbatim from the production reference page's
// form region), which carries the sign-in card's own slot and both fields.
//
// Registry row cap-S5 (tools/edge-signed-in-exercise/capabilities.json, id
// S5) recorded the gap this closes: the evidence carried "only a 200 on
// /*signin, no rendered email/password pair", so the check could not tell a
// rendered credential form from a page that answered 200 with nothing to type
// into. Tests 2 and 3 are the pages that used to be indistinguishable from a
// pass.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SIGNIN_FIELD_NAMES,
  credentialForm,
  hasCredentialForm,
} from "../lib/signin-credential-form.mjs";

/** The production capture's form region (ORACLE_FORM in
 *  tests/card/mod-loader/signin-core-form-view.test.ts), with the card's own
 *  slot wrapper the capture's page carries around it. */
const RUBY_SIGNIN_PAGE = `<div class="d0-card-body d0-card-content ALL TYPE-rich_text STAR SELF-Xsignin" data-card-name="*signin" data-card-id="19957">
<form class="card-form slotter autosave" id="edit_card_19957" recaptcha="off" action="/update/*signin" accept-charset="UTF-8" data-remote="true" method="post">
<div class='signin-fields'>
<fieldset class="card-editor editor">
<div class="form-group card-editor RIGHT-Xemail" data-card-name="*signin+*email">
<div class="editor content-editor"><input class="d0-card-content form-control" placeholder="" type="text" value="" name="card[subcards][+*email][content]" id="card_subcards___email_content" /></div></div>
<div class="form-group card-editor RIGHT-Xpassword" data-card-name="*signin+*password">
<div class="editor content-editor"><input class="d0-card-content _pw-input form-control" placeholder="Password" autocomplete="off" type="password" name="card[subcards][+*password][content]" id="card_subcards___password_content" /></div></div>
</fieldset>
</div>
<div class='form-group signin-buttons'>
<div class='reset-password-link'>
<a rel="nofollow" class="slotter" href="/*signin/edit?slot%5Bhide%5D%5B%5D=board_link" data-remote="true">Reset password</a>
</div>
<div class='signup-button'>
<a class="known-card" href="/new/Sign_up">...or sign up!</a>
</div>
</div>
</form></div>`;

test("the sign-in card's page carries all three legs Ruby drives", () => {
  assert.deepEqual(credentialForm(RUBY_SIGNIN_PAGE), {
    signinCardSlot: true,
    emailField: true,
    passwordField: true,
  });
  assert.deepEqual(hasCredentialForm(RUBY_SIGNIN_PAGE), {
    ok: true,
    legs: { signinCardSlot: true, emailField: true, passwordField: true },
  });
});

test("a 200 with no credential form is not the credential form", () => {
  // What the S5 leg used to record: the destination answered, and nothing
  // said what it contained. A page with no form at all must fail.
  const empty = { ok: false };
  assert.deepEqual(hasCredentialForm("<html><body><p>Not Found</p></body></html>"), {
    ...empty,
    legs: { signinCardSlot: false, emailField: false, passwordField: false },
  });
});

test("one missing leg is a missing credential form", () => {
  // The password field alone is not a form a person can sign in with, and
  // the email field alone is not either — each leg is named so a failure says
  // which one broke.
  const withoutPassword = RUBY_SIGNIN_PAGE.replace(
    `name="${SIGNIN_FIELD_NAMES.password}"`,
    `name="something-else"`,
  );
  assert.equal(hasCredentialForm(withoutPassword).ok, false);
  assert.equal(hasCredentialForm(withoutPassword).legs.passwordField, false);
  assert.equal(hasCredentialForm(withoutPassword).legs.emailField, true);

  const withoutSlot = RUBY_SIGNIN_PAGE.replace("SELF-Xsignin", "SELF-Xsomething");
  assert.equal(hasCredentialForm(withoutSlot).ok, false);
  assert.equal(hasCredentialForm(withoutSlot).legs.signinCardSlot, false);
});

test("the field names are the ones the write path parses", () => {
  // write-routes.ts handleSigninUpdate reads parsed.subcards["+*email"] and
  // ["+*password"] — the form and the login action cannot drift apart, and
  // this is where that coupling is written down.
  assert.deepEqual(SIGNIN_FIELD_NAMES, {
    email: "card[subcards][+*email][content]",
    password: "card[subcards][+*password][content]",
  });
});
