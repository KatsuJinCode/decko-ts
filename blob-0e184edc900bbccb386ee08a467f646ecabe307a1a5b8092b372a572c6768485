// The two links Ruby's own sign-in spec asserts on the signed-out page, read
// the way Ruby asserts them: by the anchor's TEXT and its exact destination.
//
//   spec/cypress/e2e/user/signin_spec.coffee
//     it "links to /new/Sign_up"
//       cy.contains "or sign up!"   -> href "/new/Sign_up"
//     it "links to reset password"
//       cy.contains "Reset password" -> href
//         "/*signin/edit?slot%5Bhide%5D%5B%5D=board_link"
//
// The destinations come from the Ruby views themselves:
//   card-mod-account-0.20.0 set/self/signin.rb:176-188
//     signup_link        link_to_card :signup, t(:account_or_sign_up),
//                        path: { action: :new, mark: :signup }
//                        -> card-mod-format lib/card/path.rb:19-25
//                           new_cardtype: "new/<mark url_key>"
//     reset_password_link link_to_view :edit, t(:account_reset_password),
//                        path: { slot: { hide: :board_link } }
//                        -> path.rb:32-40 "mark/view" plus the CastParams
//                           query; a scalar hide becomes a one-element array,
//                           so the key serializes with the `[]` suffix —
//                           `slot%5Bhide%5D%5B%5D=board_link`
//
//   The port renders both (src/card/render/signin-core-form-view.ts
//   signupLink / resetPasswordLink), and
//   tests/card/mod-loader/signin-core-form-view.test.ts pins the emitted
//   bytes against a production capture. What was missing is the HARNESS
//   check: registry row cap-S4's own finding reads "Reset-link regex also
//   accepts generic signin links; destination not verified" — the old
//   predicate matched any href containing /reset|forgot|signin/i, so the
//   page's own "Sign in" nav link satisfied it and the destination was never
//   read. This module is that predicate, and it reads the destination.
//
// The mark part of the reset href is matched by shape, not by literal: the
// value is the sign-in card's own url_key on this deck and the signup card's
// on another, exactly as the two Ruby derivations compute them.

/** An anchor's visible text with the tags dropped and the whitespace folded
 *  (the anchor's own content; child markup is not text of its own). */
function anchorText(inner) {
  return inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Every anchor on the page, as {href, text} in document order. */
export function anchors(html) {
  const found = [];
  for (const match of String(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const attrs = match[1];
    const href = /\bhref\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? null;
    if (href === null) continue;
    found.push({ href, text: anchorText(match[2]) });
  }
  return found;
}

/** Ruby's create-cardtype route: path.rb:19-25 renders "new/<url_key>" and
 *  nothing else starts with `/new/`. */
const SIGNUP_HREF = /^\/new\/[^/?#]+$/;

/** Ruby's link_to_view edit route with the slot hide: path.rb:32-40 plus
 *  CastParams' `slot: { hide: :array }` serialization — the card mark, then
 *  `/edit`, then the query with the `[]` suffix on the key. The query may
 *  carry further slots after this one, so it is a prefix match. */
const RESET_HREF = /^\/[^/?#]+\/edit\?slot%5Bhide%5D%5B%5D=board_link(?:&|$)/;

/**
 * The sign-up and reset-password links the signed-out sign-in page carries,
 * or null for each one the page does not carry.
 *
 * Both are matched on text AND destination together: an anchor whose text
 * matches but whose href does not is not that link, and vice versa, so the
 * page's ordinary "Sign in" link can never stand in for the reset link (the
 * defect this replaces).
 */
export function signInPageLinks(html) {
  const page = anchors(html);
  const signup =
    page.find((a) => /or sign up!/i.test(a.text) && SIGNUP_HREF.test(a.href))?.href ?? null;
  const reset =
    page.find((a) => /reset password/i.test(a.text) && RESET_HREF.test(a.href))?.href ?? null;
  return { signup, reset };
}

/** The check's own predicate: both links present. */
export function hasBothSignInPageLinks(html) {
  const links = signInPageLinks(html);
  return { ok: links.signup !== null && links.reset !== null, links };
}
