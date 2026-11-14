// cap-A4 - the anonymous sign-up and the sign-in that follows it, pinned
// against the Ruby bytes.
//
// WHAT IS PINNED, AND WHERE EACH PIN LIVES.
//
// 1. RUBY'S OWN SIGN-UP FORM. The committed real-Ruby capture
//    reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl
//    arm `probe-view:23:new@set/type/signup/views.rb` is Ruby's own :new view
//    of set/type/signup/views.rb as the Ruby oracle rendered it: the form
//    tag, the hidden success[mark], the hidden name field, the email and
//    password inputs and the Submit button. The predicate must read THOSE
//    bytes and find every field, so the names the browser check fills are
//    Ruby's names and not a guess.
//
// 2. RUBY'S OWN VERIFICATION MAIL. The committed capture
//    fixtures/captured/six-oracle-mails.json (the signup_verification_email
//    scenario) is the mail the real Ruby oracle delivered: the subject
//    "verification link for My Deck", the "follow this link" anchor and the
//    verify url. The mail and link legs must grade it green.
//
// 3. RUBY'S OWN "Signup Success" SEED CARD. The committed capture
//    fixtures/captured/search-list-views.json
//    (targets.search_anchor_star_search.items[397]) carries the deck's seed
//    card "Signup Success" with its content, which is what the create lands
//    on (the form's success[mark] is its codename).
//
// 4. THE RUBY SOURCE THE TEMPLATE AND THE VIEWS COME FROM. The capture
//    carries the rendered bytes, not the rules that produced them, so the
//    contract clauses are pinned on committed Ruby SOURCE, vendored verbatim
//    from the gem and sha256-pinned here:
//      fixtures/vendor/card-mod-account-0.20.0/data/real.yml
//        the verification_email template and the Sign up cardtype's rules
//      fixtures/vendor/card-mod-account-0.20.0/set/type/signup/views.rb
//        the :new, :content_formgroups, :new_buttons and :core views
//      fixtures/vendor/card-mod-account-0.20.0/set/right/account/views.rb
//        the account card's own field structure
//      fixtures/vendor/card-mod-account-0.20.0/set/self/signin/core.haml
//        the sign-in form's fields and its buttons
//
// WHAT IS NOT CLAIMED. No signed-in run happens here, so nothing below
// says the live sign-up passes. These are the form's shape, the seed card
// and the mail, graded on Ruby's own bytes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import {
  signupFormFields,
  signupFormContract,
  signupSuccessContract,
  findVerificationUrl,
  verificationMailContract,
  verifyLinkContract,
  signedInContract,
  SIGNUP_FORM_FIELDS,
  SIGNUP_FORM_ACTION,
  SIGNUP_SUCCESS_MARK,
  SIGNUP_SUCCESS_NAME,
  VERIFICATION_SUBJECT_PREFIX,
  VERIFY_TRIGGER,
  SIGNUP_CHECKS,
} from "../lib/signup-then-signin.mjs";

const VENDOR = new URL("../../../fixtures/vendor/card-mod-account-0.20.0/", import.meta.url);
const PROBE_CAPTURE = new URL(
  "../../../reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl",
  import.meta.url,
);
const ORACLE_MAILS = new URL("../../../fixtures/captured/six-oracle-mails.json", import.meta.url);
const SEED_CAPTURE = new URL("../../../fixtures/captured/search-list-views.json", import.meta.url);

const readVendor = (rel) => readFileSync(new URL(rel, VENDOR));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const VENDORED = {
  "data/real.yml": "c0fd3b97d35c1087726488bca92c8d72638f27ee520e60c64576f2bd3563399c",
  "set/type/signup/views.rb": "57dd1a5d2c587e81062a44ffd1985767e4d30d340218afb1f5e3377a2a3b0e7c",
  "set/right/account/views.rb": "c3a79e250aabedd0a8ef7c2e93d75c674252820a727e920a074ac8144769fbd3",
  "set/self/signin/core.haml": "c052ca4acf685d5ccb3a75ef92dddabe1caef659cfe9c23a643e42f370df0a08",
};

const oracleMails = JSON.parse(readFileSync(ORACLE_MAILS, "utf8"));
const seedCapture = JSON.parse(readFileSync(SEED_CAPTURE, "utf8"));

/** The real Ruby's own rendered sign-up form. */
function rubySignupForm() {
  for (const line of readFileSync(PROBE_CAPTURE, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    const entry = JSON.parse(line);
    if (entry.id === "probe-view:23:new@set/type/signup/views.rb") return entry.result.html;
  }
  throw new Error("committed Ruby capture has no sign-up form arm");
}

/** The real Ruby's own delivered verification mail. */
function rubyVerificationMail() {
  const arm = oracleMails.scenarios.signup_verification_email;
  assert.ok(arm !== undefined, "committed oracle capture has no signup_verification_email scenario");
  const mail = arm.delivered[0];
  return { subject: mail.subject, textBody: mail.text_body, htmlBody: mail.html_body };
}

/** The deck's own "Signup Success" seed card, as the committed capture
 *  carries it. */
function rubySignupSuccessCard() {
  const items = seedCapture.targets.search_anchor_star_search.items;
  const card = items.find((item) => item.codename === "signup_success");
  assert.ok(card !== undefined, "committed capture has no signup_success card");
  return card;
}

test("the vendored Ruby account source is the gem's bytes, sha256 pinned", () => {
  for (const [rel, digest] of Object.entries(VENDORED)) {
    assert.equal(sha256(readVendor(rel)), digest, `${rel} drifted from card-mod-account-0.20.0`);
  }
});

test("the pinned Ruby source carries the sign-up contract this row grades", () => {
  const real = readVendor("data/real.yml").toString("utf8");
  // data/real.yml:210-231 - the verification_email template. Its subject
  // and its link text are what the mail leg grades.
  assert.match(real, /:codename: verification_email/);
  assert.match(real, /:subject: verification link for \{\{:title\|core\}\}/);
  assert.match(real, /Please <a href="\{\{_\|verify_url\}\}">follow this link<\/a>/);
  assert.match(real, /to verify this email address and activate your account\./);
  // data/real.yml:172-196 - the Sign up cardtype. Its create rule is
  // "Anyone", which is what makes the sign-up link appear at all, and the
  // seed says what the approval needs.
  assert.match(real, /- :name: Sign up\n  :type: :cardtype\n  :codename: signup/);
  assert.match(real, /:create: Anyone/);
  assert.match(real, /When \[\[Anyone\]\] can \[\[\*create\|create\]\] a \[\[User\]\] card, each \[\[Sign up\]\] can be auto-approved with a verification email\./);

  const signup = readVendor("set/type/signup/views.rb").toString("utf8");
  // The :new view (the form's own view), the field groups and the buttons.
  assert.match(signup, /view :new, cache: :never do/);
  assert.match(signup, /view :content_formgroups do/);
  assert.match(signup, /view :new_buttons, cache: :never do/);
  assert.match(signup, /standard_create_button, invite_button/);

  const account = readVendor("set/right/account/views.rb").toString("utf8");
  // The account card's own field structure: the email and the password are
  // the two fields the sign-up form carries.
  assert.match(account, /:email/);
  assert.match(account, /:password/);

  const signin = readVendor("set/self/signin/core.haml").toString("utf8");
  // set/self/signin/core.haml - the sign-in form's own shape, and the
  // sign-up button the flow starts from.
  assert.match(signin, /\.signin-fields\n  = _render_content_formgroups/);
  assert.match(signin, /\.signup-button\n    = signup_link/);
});

test("the real Ruby sign-up form carries every field this row grades", () => {
  const html = rubySignupForm();
  const { names, hasForm } = signupFormFields(html);
  assert.equal(hasForm, true);
  for (const [key, name] of Object.entries(SIGNUP_FORM_FIELDS)) {
    assert.ok(names.includes(name), `Ruby's form has no ${key} field (${name})`);
  }
  const verdict = signupFormContract(html);
  assert.deepEqual(verdict.failures, [], JSON.stringify(verdict.failures));
  assert.equal(verdict.ok, true);
});

test("Ruby's form posts to the create action and carries the success mark", () => {
  const html = rubySignupForm();
  assert.ok(html.includes(`action="${SIGNUP_FORM_ACTION}"`));
  assert.ok(html.includes(`name="success[mark]"`));
  assert.ok(html.includes(`value="${SIGNUP_SUCCESS_MARK}"`));
});

test("a form missing a field fails by naming the field", () => {
  const html = rubySignupForm();
  const stripped = html.replace(/name="card\[subcards\]\[\+\*account\]\[subcards\]\[\+\*password\]\[content\]"/, 'name="something_else"');
  const verdict = signupFormContract(stripped);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.failures.includes("signupFieldMissing:password"));
  assert.ok(!verdict.failures.includes("signupFieldMissing:email"));
});

test("a form with no submit button fails signupSubmitMissing", () => {
  const html = rubySignupForm();
  const stripped = html.replace(/create-submit-button/, "not-a-submit");
  const verdict = signupFormContract(stripped);
  assert.ok(verdict.failures.includes("signupSubmitMissing"));
});

test("a form with the wrong success mark fails signupSuccessMarkMissing", () => {
  const html = rubySignupForm();
  const stripped = html.replace(`value="${SIGNUP_SUCCESS_MARK}"`, 'value="somewhere_else"');
  const verdict = signupFormContract(stripped);
  assert.ok(verdict.failures.includes("signupSuccessMarkMissing"));
});

test("the deck's own Signup Success seed card grades green as the landing page", () => {
  const card = rubySignupSuccessCard();
  assert.equal(card.name, SIGNUP_SUCCESS_NAME);
  assert.equal(card.codename, SIGNUP_SUCCESS_MARK);
  // The seed's own content, with the deck title substituted the way
  // {{:title|core}} renders.
  const rendered = String(card.db_content).replace("{{:title|core}}", "My Deck");
  const page = `<title>${card.name}</title><div id="main">${rendered}</div>`;
  const verdict = signupSuccessContract(page);
  assert.deepEqual(verdict.failures, [], JSON.stringify(verdict.failures));
  assert.equal(verdict.ok, true);
});

test("a landing page that does not name the seed card fails signupSuccessNameMissing", () => {
  const card = rubySignupSuccessCard();
  const rendered = String(card.db_content).replace("{{:title|core}}", "My Deck");
  const page = `<div id="main">${rendered}</div>`;
  const verdict = signupSuccessContract(page);
  assert.ok(verdict.failures.includes("signupSuccessNameMissing"));
  assert.ok(!verdict.failures.includes("signupSuccessSentenceMissing"));
});

test("the real Ruby verification mail grades green on the mail leg", () => {
  const mail = rubyVerificationMail();
  assert.equal(mail.subject, `${VERIFICATION_SUBJECT_PREFIX} My Deck`);
  const verdict = verificationMailContract(mail, { siteTitle: "My Deck" });
  assert.deepEqual(verdict.failures, [], JSON.stringify(verdict.failures));
  assert.equal(verdict.ok, true);
  // The link the mail carries, read out of the html part's anchor.
  assert.equal(verdict.link.from, "html");
  assert.ok(verdict.link.url.includes(`card%5Btrigger%5D=${VERIFY_TRIGGER}`) || verdict.link.url.includes(`card[trigger]=${VERIFY_TRIGGER}`));
});

test("a mail with the wrong subject fails by name", () => {
  const mail = rubyVerificationMail();
  const wrong = { ...mail, subject: "verification link for Another Deck" };
  const verdict = verificationMailContract(wrong, { siteTitle: "My Deck" });
  assert.ok(verdict.failures.includes("verificationSubjectTitleWrong"));
  const none = verificationMailContract({ ...mail, subject: "welcome" }, {});
  assert.ok(none.failures.includes("verificationSubjectWrong"));
});

test("a mail with no link fails verificationUrlMissing", () => {
  const mail = rubyVerificationMail();
  const stripped = { ...mail, htmlBody: "<div>no link here</div>", textBody: "no link here" };
  const verdict = verificationMailContract(stripped, { siteTitle: "My Deck" });
  assert.ok(verdict.failures.includes("verificationLinkTextMissing"));
  assert.ok(verdict.failures.includes("verificationUrlMissing"));
});

test("the real Ruby verify url grades green on the link leg", () => {
  const mail = rubyVerificationMail();
  const link = findVerificationUrl(mail);
  const verdict = verifyLinkContract(link.url, { accountName: "Jane_Oracle_Signup+*account" });
  assert.deepEqual(verdict.failures, [], JSON.stringify(verdict.failures));
  assert.equal(verdict.ok, true);
  assert.equal(verdict.account, "Jane_Oracle_Signup+*account");
  assert.equal(verdict.params["card[trigger]"], VERIFY_TRIGGER);
  assert.ok(typeof verdict.params.token === "string" && verdict.params.token.length > 0);
});

test("a verify url that targets another card fails verifyTargetNotTheAccountCard", () => {
  const verdict = verifyLinkContract("/update/Jane_Oracle_Signup?card[trigger]=verify_and_activate&token=abc", {});
  assert.ok(verdict.failures.includes("verifyTargetNotTheAccountCard"));
});

test("a verify url with no trigger and no token fails by name", () => {
  const verdict = verifyLinkContract("/update/Jane+*account", {});
  assert.ok(verdict.failures.includes("verifyTriggerMissing"));
  assert.ok(verdict.failures.includes("verifyTokenMissing"));
});

test("a verify url that is not an update fails verifyTargetNotAnUpdate", () => {
  const verdict = verifyLinkContract("/Jane+*account?card[trigger]=verify_and_activate&token=abc", {});
  assert.ok(verdict.failures.includes("verifyTargetNotAnUpdate"));
});

test("the signed-in leg needs the name on the page AND a session", () => {
  const good = signedInContract({ html: "<div>Wanna B</div>", hasSessionCookie: true, signedIn: true }, { name: "Wanna B" });
  assert.deepEqual(good.failures, []);
  const noCookie = signedInContract({ html: "<div>Wanna B</div>", hasSessionCookie: false, signedIn: true }, { name: "Wanna B" });
  assert.ok(noCookie.failures.includes("signedInNoSessionCookie"));
  const noName = signedInContract({ html: "<div>someone else</div>", hasSessionCookie: true, signedIn: true }, { name: "Wanna B" });
  assert.ok(noName.failures.includes("signedInNameMissing"));
  const anonymous = signedInContract({ html: "<div>Wanna B</div>", hasSessionCookie: true, signedIn: false }, { name: "Wanna B" });
  assert.ok(anonymous.failures.includes("signedInPageNotSignedIn"));
});

test("the check names name their own legs", () => {
  assert.match(SIGNUP_CHECKS.form, /Ruby's name, email and password fields/);
  assert.match(SIGNUP_CHECKS.success, /Signup Success card/);
  assert.match(SIGNUP_CHECKS.mail, /verification mail/);
  assert.match(SIGNUP_CHECKS.link, /verify trigger/);
  assert.match(SIGNUP_CHECKS.signIn, /sign in with its own email and password/);
});
