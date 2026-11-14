// What the sign-in card's own page must carry for a person to be able to
// sign in from it — the leg Ruby's own spec drives after the anonymous
// denial modal's sign-in link is followed.
//
//   spec/cypress/e2e/user/signin_redirect_spec.coffee
//     cy.main_slot().click_edit()
//     cy.get(".modal-content").should "contain", "Sorry!"
//     cy.get(".modal-content a.signin-link").click(force: true)
//     cy.get(".SELF-Xsignin")                  <- the sign-in card's own slot
//     cy.field "*email"     .type "joe@admin.com"
//     cy.field "*password"  .type "joe_pass{enter}"
//
// So "the destination shows the credential form" is three reads, not one:
// the sign-in card's slot, and the two fields the form posts. The field
// NAMES are the port's own grammar — `card[subcards][+*email][content]` and
// `card[subcards][+*password][content]`, the names write-routes.ts's
// handleSigninUpdate reads — rendered by
// src/card/render/signin-core-form-view.ts (signin.rb:198-203's
// `"".to_name.field(name)` tuples, view :core at :119-125) and pinned against
// a production capture in
// tests/card/mod-loader/signin-core-form-view.test.ts.
//
// Registry row cap-S5's recorded gap: "The capability sentence ends at 'the
// credential form', which this check does not assert - the evidence carries
// only a 200 on /*signin, no rendered email/password pair." This is the read
// that closes it, and it runs against the page's own HTML so a 200 on a page
// with no form cannot pass it.

/** The field names the sign-in form posts (write-routes.ts parses exactly
 *  these two keys). */
export const SIGNIN_FIELD_NAMES = {
  email: "card[subcards][+*email][content]",
  password: "card[subcards][+*password][content]",
};

/** The slot classes a rendered card carries; Ruby reads `.SELF-Xsignin`, and
 *  the port renders the same class list (its slot class names use X for `*`,
 *  the spelling tests/card/mod-loader/signin-core-form-view.test.ts's capture
 *  pins). */
const SIGNIN_CARD_SLOT = /class="[^"]*\bSELF-Xsignin\b/;

/**
 * The three legs, read from the destination page's HTML.
 * `signinCardSlot` — the sign-in card's own slot is on the page.
 * `emailField` / `passwordField` — the credential form's two inputs are on
 * the page, by the names the write path parses.
 */
export function credentialForm(html) {
  const page = String(html);
  return {
    signinCardSlot: SIGNIN_CARD_SLOT.test(page),
    emailField: page.includes(`name="${SIGNIN_FIELD_NAMES.email}"`),
    passwordField: page.includes(`name="${SIGNIN_FIELD_NAMES.password}"`),
  };
}

/** The predicate the check grades: all three legs. */
export function hasCredentialForm(html) {
  const legs = credentialForm(html);
  return { ok: legs.signinCardSlot && legs.emailField && legs.passwordField, legs };
}
