// The anonymous sign-up and the sign-in that follows it, graded on Ruby's
// own form, its own seed card and its own mail.
//
// THE ROW. cap-A4 ("Sign up for a new account (anonymous), then sign in",
// tools/edge-signed-in-exercise/capabilities.json id A4) is carried as
// not_covered, and its own finding says why: "no A4-named check exists in
// any tools/edge-signed-in-exercise checks-*.mjs module or core group, and
// no A4-named result exists in either baseline capture... Unblock: write
// the anonymous signup-then-sign-in check into tools/edge-signed-in-exercise
// and re-capture so A4 credits."
//
// So there is no old check to improve. There is no row to re-scope. The
// work is to write the check, and to write it against Ruby's own bytes
// rather than against a guess about what a sign-up form should look like.
//
// WHAT RUBY'S SIGN-UP FORM IS. The committed real-Ruby capture
// reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl
// arm `probe-view:23:new@set/type/signup/views.rb` is Ruby's own :new view
// of set/type/signup/views.rb, rendered by the Ruby oracle, and it carries:
//
//   <form class="card-form slotter" id="edit_card_952"
//         data-main-success='{"redirect":true}' action="/card/create"
//         accept-charset="UTF-8" data-remote="true" method="post">
//   <input type="hidden" name="success[mark]" id="success_mark"
//          value="signup_success" ... />
//   <input type="hidden" name="card[name]" id="card_name"
//          value="Probe Signup" ... />
//   <input class="d0-card-content form-control" type="text" ...
//          name="card[subcards][+*account][subcards][+*email][content]"
//          id="card_subcards___account_subcards___email_content" />
//   <input class="d0-card-content _pw-input form-control" type="password" ...
//          name="card[subcards][+*account][subcards][+*password][content]"
//          id="card_subcards___account_subcards___password_content" />
//   <button name="button" type="submit" ...
//           class="submit-button create-submit-button btn btn-primary">Submit</button>
//
// Four things in that capture are the CONTRACT, and each is graded here:
//
//   1. THE FIELDS. The name, the email and the password carry the input
//      names above. The name is a HIDDEN field pre-filled from the request
//      (the :new view hides the name_formgroup), so a person reaches the
//      form with the name in the URL - which is how the form is filled, and
//      how a check must fill it.
//   2. THE ACTION. The form posts to /card/create.
//   3. THE SUCCESS MARK. The hidden success[mark] is "signup_success", the
//      codename of the SEED card the create lands on.
//   4. THE SUBMIT. The button is the one carrying the create-submit-button
//      class, and its text is "Submit" (signup.feature:26, "And I press
//      'Submit'").
//
// WHAT THE SUCCESS PAGE IS. The card the create lands on is the deck's own
// seed card "Signup Success" (codename signup_success), whose content the
// committed capture carries (fixtures/captured/search-list-views.json,
// targets.search_anchor_star_search.items[397]):
//
//   <div>
//     Thank you for signing up with {{:title|core}}.
//     You should receive a response in your email.
//   </div>
//
// and signup.feature:27 says what a person sees: "Then I should see
// 'Signup Success'".
//
// WHAT THE MAIL IS. The verification email's own template
// (card-mod-account-0.20.0 data/real.yml:210-231) is
//
//   :subject: verification link for {{:title|core}}
//   :html_message: |-
//     <div style="text-align:center">
//       <h1>Thank you for signing up with {{:title|core}}!</h1>
//       <p>
//         Please <a href="{{_|verify_url}}">follow this link</a>
//         to verify this email address and activate your account.
//       </p>
//       <p><em>Link will remain valid for {{_|verify_days}} days.</em></p>
//     </div>
//
// and the committed real-Ruby mail capture
// (fixtures/captured/six-oracle-mails.json, the signup_verification_email
// scenario) carries the mail Ruby actually delivered: the subject
// "verification link for My Deck", the "follow this link" anchor, and the
// verify url "/update/Jane_Oracle_Signup+*account?card[trigger]=verify_and_activate&token=...".
//
// AND THE SIGN-IN. signup.feature:37-46 is the last half: sign out, then
// sign in with the email and the password, and "Wanna B" is shown and
// signed in. The sign-in form's own shape is Ruby's
// set/self/signin/core.haml: the fields, the reset-password link, the
// sign-in button and the sign-up button.
//
// ANTI-VACUITY.
//   1. A form that is missing a field is a named failure, not a skipped
//      grade: the check names WHICH field the form did not carry.
//   2. The success page must show the card's NAME and the seed's own
//      sentence, so a page that merely says "thanks" is not this card.
//   3. The mail's subject is compared with the template's shape (the title
//      the caller supplies), and the body must carry the "follow this link"
//      anchor - a mail with a subject and no link is not this mail.
//   4. The verify link must be an UPDATE of the ACCOUNT card carrying the
//      verify_and_activate trigger and a token, so a link to some other
//      card is not this link.
//   5. The signed-in claim needs BOTH the page naming the account and the
//      session carrying a cookie: a page that shows the name while the
//      session is anonymous is not a sign-in.
//
// WHAT THIS DOES NOT CLAIM. It does not claim that the sign-up is
// APPROVED - Ruby's own seed says "When [[Anyone]] can [[*create|create]]
// a [[User]] card, each [[Sign up]] can be auto-approved with a
// verification email" (card-mod-account data/real.yml:108), and a deck
// where nobody can create a User card sends no verification mail at all.
// The caller sets that permission up and records it as evidence; the
// predicate grades the flow once the permission is there.

/** The input names Ruby's sign-up form carries (the committed capture arm
 *  probe-view:23:new@set/type/signup/views.rb). */
export const SIGNUP_FORM_FIELDS = Object.freeze({
  name: "card[name]",
  email: "card[subcards][+*account][subcards][+*email][content]",
  password: "card[subcards][+*account][subcards][+*password][content]",
});

/** The form's action (the capture's form tag) and the success mark it
 *  carries - the codename of the seed card the create lands on. */
export const SIGNUP_FORM_ACTION = "/card/create";
export const SIGNUP_SUCCESS_MARK = "signup_success";

/** The seed card's name, as signup.feature:27 asserts it. */
export const SIGNUP_SUCCESS_NAME = "Signup Success";

/** The seed card's own sentence (the committed capture's db_content). */
export const SIGNUP_SUCCESS_SENTENCE = "Thank you for signing up with";

/** The verification email's subject shape (card-mod-account
 *  data/real.yml:215): "verification link for <title>". */
export const VERIFICATION_SUBJECT_PREFIX = "verification link for";

/** The template's link text (data/real.yml:220). */
export const VERIFICATION_LINK_TEXT = "follow this link";

/** The trigger the verify url carries (the port's
 *  account-verify-reset-flows.ts, the verify_and_activate arm; Ruby's
 *  right/account/events.rb:19-24). */
export const VERIFY_TRIGGER = "verify_and_activate";

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The input names a page's form carries, read off the form's own tags. */
export function signupFormFields(html) {
  const source = String(html ?? "");
  const form = /<form\b[^>]*action="\/card\/create"[^>]*>/i.exec(source);
  const scope = form === null ? source : source.slice(form.index);
  const names = new Set();
  for (const match of scope.matchAll(/<input\b[^>]*\bname="([^"]+)"/gi)) names.add(match[1]);
  return { names: [...names], hasForm: form !== null };
}

/**
 * The FORM leg: the sign-up form carries Ruby's fields, Ruby's action,
 * Ruby's success mark and Ruby's submit button.
 *
 * Returns {ok, failures, fields}.
 */
export function signupFormContract(html) {
  const failures = [];
  const source = String(html ?? "");
  const { names, hasForm } = signupFormFields(source);
  if (!hasForm) failures.push("signupFormMissing");
  for (const [key, name] of Object.entries(SIGNUP_FORM_FIELDS)) {
    if (!names.includes(name)) failures.push(`signupFieldMissing:${key}`);
  }
  // The success mark: the create lands on the seed card.
  if (!/name="success\[mark\]"[^>]*value="signup_success"/i.test(source)) {
    failures.push("signupSuccessMarkMissing");
  }
  // The submit button Ruby's own form carries.
  if (!/class="[^"]*create-submit-button[^"]*"[^>]*>\s*Submit\s*<\/button>/i.test(source)) {
    failures.push("signupSubmitMissing");
  }
  return { ok: failures.length === 0, failures, fields: names };
}

/**
 * The SUCCESS leg: the create landed on the deck's own "Signup Success"
 * seed card, and the page says what that card says.
 *
 * The page does NOT name the new account: Ruby's create lands on the seed
 * card, whose content is the seed's own sentence. The new account's name is
 * what the SIGNED-IN leg grades, after the verification link.
 */
export function signupSuccessContract(html) {
  const failures = [];
  const source = String(html ?? "");
  if (!source.includes(SIGNUP_SUCCESS_NAME)) failures.push("signupSuccessNameMissing");
  if (!source.includes(SIGNUP_SUCCESS_SENTENCE)) failures.push("signupSuccessSentenceMissing");
  return { ok: failures.length === 0, failures };
}

/** The verify url the delivered mail carries, from the html part's anchor
 *  and from the text part's own line. */
export function findVerificationUrl(mail) {
  const html = String(mail?.htmlBody ?? "");
  const text = String(mail?.textBody ?? "");
  const anchor = /<a\b[^>]*href="([^"]*)"[^>]*>\s*follow this link\s*<\/a>/i.exec(html);
  if (anchor !== null) return { url: anchor[1], from: "html" };
  const line = /\/update\/[^\s"']+/.exec(text);
  if (line !== null) return { url: line[0], from: "text" };
  return { url: null, from: null };
}

/**
 * The MAIL leg: the verification mail carries Ruby's subject shape and
 * Ruby's link.
 *
 * `expected.siteTitle` is the deck's title, the value the template's
 * `{{:title|core}}` renders.
 */
export function verificationMailContract(mail, expected) {
  const failures = [];
  const subject = String(mail?.subject ?? "");
  if (!subject.startsWith(VERIFICATION_SUBJECT_PREFIX)) failures.push("verificationSubjectWrong");
  if (expected?.siteTitle !== undefined && subject !== `${VERIFICATION_SUBJECT_PREFIX} ${expected.siteTitle}`) {
    failures.push("verificationSubjectTitleWrong");
  }
  const html = String(mail?.htmlBody ?? "");
  const text = String(mail?.textBody ?? "");
  if (!html.includes(VERIFICATION_LINK_TEXT) && !text.includes(VERIFICATION_LINK_TEXT)) {
    failures.push("verificationLinkTextMissing");
  }
  const link = findVerificationUrl(mail);
  if (link.url === null) failures.push("verificationUrlMissing");
  return { ok: failures.length === 0, failures, link };
}

/**
 * The VERIFY LINK leg: the link is an update of the account card, carrying
 * the verify_and_activate trigger and a token.
 *
 * Ruby's delivered url is
 * "/update/Jane_Oracle_Signup+*account?card[trigger]=verify_and_activate&token=...".
 */
export function verifyLinkContract(url, expected) {
  const failures = [];
  const raw = String(url ?? "");
  if (raw === "") failures.push("verifyUrlMissing");
  let parsed;
  try {
    parsed = new URL(raw, "http://signup.local");
  } catch {
    failures.push("verifyUrlUnreadable");
    return { ok: false, failures, path: null, params: {} };
  }
  const params = {};
  for (const [key, value] of parsed.searchParams.entries()) params[key] = value;
  if (!parsed.pathname.startsWith("/update/")) failures.push("verifyTargetNotAnUpdate");
  const account = decodeURIComponent(parsed.pathname.replace("/update/", ""));
  if (!account.endsWith("+*account")) failures.push("verifyTargetNotTheAccountCard");
  if (expected?.accountName !== undefined && account !== expected.accountName) {
    failures.push("verifyAccountNameMismatch");
  }
  if (params["card[trigger]"] !== VERIFY_TRIGGER) failures.push("verifyTriggerMissing");
  if (typeof params.token !== "string" || params.token.length === 0) failures.push("verifyTokenMissing");
  return { ok: failures.length === 0, failures, path: parsed.pathname, account, params };
}

/**
 * The SIGNED-IN leg: the page names the account and the session is the
 * account's.
 *
 * `page`   {html, hasSessionCookie, signedIn}
 */
export function signedInContract(page, expected) {
  const failures = [];
  const html = String(page?.html ?? "");
  if (expected?.name !== undefined && !html.includes(expected.name)) failures.push("signedInNameMissing");
  if (page?.hasSessionCookie !== true) failures.push("signedInNoSessionCookie");
  if (page?.signedIn !== true) failures.push("signedInPageNotSignedIn");
  return { ok: failures.length === 0, failures };
}

/** The check names each leg records, so the evidence names its own leg. */
export const SIGNUP_CHECKS = Object.freeze({
  form: "the sign-up form carries Ruby's name, email and password fields, its create action and its success mark",
  success: "the sign-up lands on the deck's own Signup Success card",
  mail: "the new account is sent the verification mail Ruby's template writes",
  link: "the verification link is an update of the account card carrying the verify trigger and a token",
  signIn: "the new account can sign in with its own email and password",
});
