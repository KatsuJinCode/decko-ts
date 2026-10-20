// The S4 harness predicate — "the signed-out sign-in page links to sign up
// and to reset the password" — graded against the bytes Ruby renders and the
// bytes that used to satisfy it by accident.
//
//   node --test tools/edge-signed-in-exercise/test/signin-page-links.test.mjs
//
// The positive fixture is the port's own production-capture golden for the
// :core sign-in form (tests/card/mod-loader/signin-core-form-view.test.ts's
// ORACLE_FORM, transcribed verbatim from the production reference page's
// form region), reduced to the two anchors the check reads. Those two anchors
// are what card-mod-account-0.20.0 set/self/signin.rb:176-188 emits, and what
// Ruby's spec/cypress/e2e/user/signin_spec.coffee asserts by href.
//
// Registry row cap-S4 (tools/edge-signed-in-exercise/capabilities.json, id
// S4) recorded the gap this closes: "Reset-link regex also accepts generic
// signin links; destination not verified." The predicate it replaces matched
// any href containing /reset|forgot|signin/i, so a page whose only
// signin-ish link was the nav's own "Sign in" scored a pass. Test 2 is that
// case, and it must fail the predicate — a check that cannot tell the two
// apart cannot grade the capability it was written for.

import { test } from "node:test";
import assert from "node:assert/strict";
import { anchors, hasBothSignInPageLinks, signInPageLinks } from "../lib/signin-page-links.mjs";

// The production capture's form region, verbatim (ORACLE_FORM in
// tests/card/mod-loader/signin-core-form-view.test.ts).
const RUBY_FORM_ANCHORS = `
<div class='reset-password-link'>
<a rel="nofollow" class="slotter" href="/*signin/edit?slot%5Bhide%5D%5B%5D=board_link" data-remote="true">Reset password</a>
</div>
<div class='signup-button'>
<a class="known-card" href="/new/Sign_up">...or sign up!</a>
</div>`;

/** A page carrying the ordinary nav chrome around the form: the nav's own
 *  "Sign in" link is what the replaced regex used to read as the reset link. */
function page(body) {
  return `<!DOCTYPE html><html><body><nav><a class="nav-link signin-link known-card" href="/*signin">Sign in</a></nav>${body}</body></html>`;
}

test("both links are found on the bytes Ruby renders", () => {
  const links = signInPageLinks(page(RUBY_FORM_ANCHORS));
  assert.equal(links.signup, "/new/Sign_up");
  assert.equal(links.reset, "/*signin/edit?slot%5Bhide%5D%5B%5D=board_link");
  assert.deepEqual(hasBothSignInPageLinks(page(RUBY_FORM_ANCHORS)), { ok: true, links });
});

test("the nav's own Sign in link is NOT the reset link (the cap-S4 defect)", () => {
  // The replaced predicate's regex (/reset|forgot|signin/i) matched this href,
  // so a page with no reset link at all scored a pass.
  const onlyNav = page("");
  assert.equal(signInPageLinks(onlyNav).reset, null);
  assert.equal(hasBothSignInPageLinks(onlyNav).ok, false);

  // And a page carrying the sign-up link alone still fails: both legs are
  // graded, one of them by its destination.
  const signupOnly = page('<a class="known-card" href="/new/Sign_up">...or sign up!</a>');
  assert.equal(hasBothSignInPageLinks(signupOnly).ok, false);
});

test("text alone is not a link and a destination alone is not either", () => {
  const wrongDestination = page(
    '<a href="/*signin">Reset password</a><a href="/new/Sign_up">...or sign up!</a>',
  );
  assert.equal(signInPageLinks(wrongDestination).reset, null);

  const wrongText = page(
    '<a href="/*signin/edit?slot%5Bhide%5D%5B%5D=board_link">Sign in</a>' +
      '<a href="/new/Sign_up">...or sign up!</a>',
  );
  assert.equal(signInPageLinks(wrongText).reset, null);
});

test("the reset href's slot-hide query is matched whole, not by prefix", () => {
  // path.rb:32-40 renders the query through CastParams, so the value is
  // `slot[hide][]=board_link` percent-encoded. A look-alike that keeps the
  // key but changes the card (or drops the `[]` suffix) is a different route
  // and must not satisfy the check.
  const lookAlike = page(
    '<a href="/*account/edit?slot%5Bhide%5D%5B%5D=board_link">Reset password</a>',
  );
  // The mark is the sign-in card's own url_key on this deck; the predicate
  // accepts any mark's shape because both Ruby derivations compute it from
  // the card being viewed — so this one IS read as the link (that is the
  // shape rule), and what must be rejected is the same href with the query
  // mangled.
  assert.equal(signInPageLinks(lookAlike).reset, "/*account/edit?slot%5Bhide%5D%5B%5D=board_link");

  const mangled = page(
    '<a href="/*signin/edit?slot%5Bhide%5D=board_link">Reset password</a>',
  );
  assert.equal(signInPageLinks(mangled).reset, null);
});

test("anchors are read with their text, tag-stripped and whitespace-folded", () => {
  const found = anchors(
    '<nav><a class="nav-link" href="/*signin">Sign in</a></nav>' +
      '<a href="/new/Sign_up"><span>...or</span> sign up!</a>',
  );
  assert.deepEqual(found, [
    { href: "/*signin", text: "Sign in" },
    { href: "/new/Sign_up", text: "...or sign up!" },
  ]);
});
