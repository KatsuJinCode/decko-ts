# S5: an anonymous edit denial, its sign-in link, and the credential form behind it

The roster row `S5` (group session, the [Family] capability family) reads
"Anonymous user opens a card edit modal, sees denial, then follows its
sign-in link to the credential form", sourced from
`cypress signin_redirect_spec`. It was `partial`, with the recorded finding
that the evidence "carries only a 200 on /*signin, no rendered
email/password pair". This receipt is the family's own adjudication of that
row: the pinned Ruby's own bytes for the contract, the port's own bytes
beside them, and the named instrument that grades the row.

## What the row is

A stranger who cannot edit a card has to be told so, and then has to be
offered a way in. The row is the check that the anonymous denial carries
Ruby's own "Sorry!" and a sign-in link, and that following that link
reaches the sign-in card's own credential form with the two fields the form
posts.

## The oracle

THE DENIAL AND THE CREDENTIAL FORM ARE RUBY'S OWN, AND THE REPOSITORY
CARRIES ITS CAPTURED BYTES. The capture reads the pinned gemset and writes
nothing but its own fixture:

    GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
      ruby tests/card/mod-loader/oracle-capture-anonymous-edit-denial-signin.rb

    wrote C:/localProjects/decko-ts-capability-round7-20261024/fixtures/captured/anonymous-edit-denial-signin.json

Four pinned files own the contract:

1. card-mod-format-0.20.0 set/all/html/error.rb owns THE DENIAL.

        def loud_denial
          voo.hide :menu
          frame do
            [wrap_with(:h1, t(:format_sorry)),
             wrap_with(:div, loud_denial_message)]
          end
        end

2. The same file owns THE SIGNED-OUT BRANCH. `loud_denial_message` picks by
   SESSION state: `when Auth.signed_in?` gives the permission sentence, and
   the signed-out branch is `sign_in_or_up_links to_do_unauthorized_task`.

3. The same file owns THE LINK. `sign_in_or_up_links` is the "Please
   <links> to <task>." sentence that joins the sign-in and sign-up links with
   " or ", and `signin_link` is
   `link_to_card :signin, t(:account_sign_in)&.downcase` with the class
   "signin-link" and the path `{ view: :titled }`.

4. card-mod-format-0.20.0 config/locales/en.yml owns THE THREE TEXTS:
   `format_sorry: Sorry!`, `format_please: Please` and `format_or: "or"`.

5. card-mod-account-0.20.0 set/self/signin.rb owns THE CREDENTIAL FORM:
   `view :core` is the `card_form :update, recaptcha: :off, success:
   signin_success` over the haml template, and `signin_field` nests the
   email and the password with the "titled" view and `skip_perms: true`.

The capture keeps the owners' bytes, their line ranges and their files'
SHA-256 digests in fixtures/captured/anonymous-edit-denial-signin.json. It
carries no timestamp, so a re-run is byte-stable.

## The port

The port carries the same contract in its own bytes:

- src/card/render/format.ts renders the denial with the same heading,
  `<h1>Sorry!</h1>`, and the same signed-out sentence with the sign-in
  link: `<div><div>Please <a class="signin-link known-card"
  href="/*signin/titled">sign in</a> or `.
- src/card/render/signin-core-form-view.ts nests the same two fields with
  the same "titled" view:
  `const editStructure = [signinField("email"), signinField("password")];`
  and `{ title: name, view: "titled", nest_name: nestName, skip_perms: true
  },`.

tests/card/mod-loader/card-mod-anonymous-edit-denial-signin.test.ts (16
checks) pins all of it: the captured Ruby's facts, the port's own bytes, and
the row's credit rule.

## The instrument

THE ROW'S OWN GAP IS LANDED, AND THE INSTRUMENT IS NAMED. The harness's own
anonymous leg (tools/edge-signed-in-exercise/checks-cover-b.mjs, the cover-b
module's S5 attempt) reads the CREDENTIAL FORM out of the destination page's
own HTML, through the predicate in
tools/edge-signed-in-exercise/lib/signin-credential-form.mjs. That
predicate is three reads, not a status code:

- the sign-in card's own slot is on the page (the `SELF-Xsignin` class);
- the email input is on the page, by the name the write path parses
  (`card[subcards][+*email][content]`);
- the password input is on the page, by the name the write path parses
  (`card[subcards][+*password][content]`).

So a 200 on a page with no form cannot pass the leg. The verdict also needs
the landing back on the card (accountNameShown, offSigninRoute and
targetCardRendered), so the whole round trip is graded, not just the
arrival. The predicate's own test
(tools/edge-signed-in-exercise/test/signin-credential-form.test.mjs) keeps a
page without the password field, and a page without the sign-in card's slot,
red, and grades the bytes Ruby renders as the positive case.

The row declares that one check, and the repo's own grader
(tools/edge-signed-in-exercise/lib/local-policy.mjs `verifiedCapabilities`)
credits the row only when it passes. The pin asserts that a red check and a
missing result are not credited.

## What this receipt does NOT claim

- Ruby's own spec asserts the modal denial and the explicit sign-in-link
  click. It does NOT assert an automatic redirect, and no redirect is
  claimed here.
- S10's signed-in-route check does assert the credential fields, but that
  is the signed-in surface, not this anonymous leg, and it is not claimed
  here.
- The denial's task phrase comes from the deck's own denied task, so the
  row is graded on the denial, the link and the credential form, not on one
  wording of the task.
- The whole-family exercise at this round's tip is run once, and its
  committed record (docs/runs/edge-signed-in-exercise-round7-measured-2026-10-24.json)
  names this row among the rows it closes. This receipt does not restate
  that run's numbers; the round's own receipt does.
