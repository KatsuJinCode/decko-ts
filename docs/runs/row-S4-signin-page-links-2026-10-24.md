# S4: the signed-out sign-in page links to sign up and to reset the password

The roster row `S4` (group session, the [Family] capability family) reads
"Sign-in link to sign up, and link to reset password", sourced from
`cypress signin_spec 'links to /new/Sign_up', 'links to reset password'`. It
was `partial`, with the recorded finding "Reset-link regex also accepts
generic signin links; destination not verified". This receipt is the
family's own adjudication of that row: the pinned Ruby's own bytes for the
contract, the port's own bytes beside them, and the named instrument that
grades the row.

## What the row is

A stranger who cannot sign in is stuck on the sign-in page, so that page has
to carry both ways out: sign up, and reset a forgotten password. The row is
the check that the ANONYMOUS page carries both links, and that each link
goes where it says it goes.

## The oracle

THE TWO LINKS ARE RUBY'S OWN, AND THE REPOSITORY CARRIES ITS CAPTURED
BYTES. The capture reads the pinned gemset and writes nothing but its own
fixture:

    GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
      ruby tests/card/mod-loader/oracle-capture-signin-page-links.rb

    wrote C:/localProjects/decko-ts-capability-round7-20261024/fixtures/captured/signin-page-links.json

Six pinned files own the contract:

1. card-mod-account-0.20.0 set/self/signin.rb owns THE TWO LINKS.

        def signup_link
          link_to_card :signup, t(:account_or_sign_up),
                       path: { action: :new, mark: :signup }
        end

        def reset_password_link
          link_to_view :edit, t(:account_reset_password),
                       path: { slot: { hide: :board_link } }
        end

2. card-mod-account-0.20.0 set/self/signin/core.haml owns THE BLOCK. The
   `.form-group.signin-buttons` division holds `.reset-password-link`,
   `.signin-button` and `.signup-button`, in that order.

3. card-mod-account-0.20.0 config/locales/en.yml owns THE THREE TEXTS:
   `account_or_sign_up: '...or sign up!'`, `account_reset_password: Reset
   password` and `account_sign_in: Sign in`.

4. card-mod-format-0.20.0 set/all/links.rb owns THE ANCHOR SHAPES:
   `link_to` puts the path into the href (`opts[:href] ||= path
   opts.delete(:path)`), `link_to_card` adds the known/wanted class (`add_class
   opts, (known ? "known-card" : "wanted-card")`), and `link_to_view` is a
   remote link with `rel: "nofollow"` and the "slotter" class.

5. card-mod-format-0.20.0 lib/card/path.rb owns THE TWO DESTINATIONS:
   `"#{action}/#{mark}#{query}"` for the new-card route, and
   `"#{mark}/#{view}"` for the edit view.

6. card-mod-format-0.20.0 lib/card/path/cast_params.rb owns THE SLOT HIDE
   SERIALIZATION: `cast_path_value_as_array` is `Array.wrap value`, so a
   scalar slot hide becomes a one-element array and the key carries the `[]`
   suffix.

The capture keeps the owners' bytes, their line ranges and their files'
SHA-256 digests in fixtures/captured/signin-page-links.json. It carries no
timestamp, so a re-run is byte-stable.

## The port

The port carries the same contract in its own bytes
(src/card/render/signin-core-form-view.ts):

- the three texts, from the port's own locale table: `"...or sign up!"`,
  `"Reset password"` and `"Sign in"`.
- the sign-up link, as `new/<mark url_key>` with the known/wanted class:
  `const cls = known ? "known-card" : "wanted-card";` and the link call
  `linkTo(SIGNIN_FORM_LOCALE.account_or_sign_up, cardPath(`new/${markUrlKey}`), {`.
- the reset link, as the remote nofollow slotter whose href carries the
  slot hide: ``const href = cardPath(`${ctx.fmt.urlKey()}/edit?slot%5Bhide%5D%5B%5D=board_link`);``
  and the anchor `<a rel="nofollow" class="slotter" href="${href}" data-remote="true">`.
- the buttons division, in Ruby's own order.

tests/card/mod-loader/card-mod-signin-page-links.test.ts (17 checks) pins
all of it: the captured Ruby's facts, the port's own bytes, and the row's
credit rule.

## The instrument

THE ROW'S OWN GAP IS LANDED, AND THE INSTRUMENT IS NAMED. The harness's own
signed-out attempt (tools/edge-signed-in-exercise.mjs, the "S2/S3/S4
signed-out sign-in page" attempt) grades the row with the predicate in
tools/edge-signed-in-exercise/lib/signin-page-links.mjs, which reads each
link by TEXT and DESTINATION together:

- the sign-up link needs the "...or sign up!" text and the `/new/<mark>`
  shape;
- the reset link needs the "Reset password" text and the
  `<mark>/edit?slot%5Bhide%5D%5B%5D=board_link` shape.

So the page's ordinary "Sign in" nav link, which the replaced regex
(`/reset|forgot|signin/i`) read as the reset link, can no longer satisfy the
row. The predicate's own test
(tools/edge-signed-in-exercise/test/signin-page-links.test.mjs) keeps exactly
that case red, grades the bytes Ruby renders as the positive case, and
refuses a look-alike whose query is mangled.

The row declares that one check, and the repo's own grader
(tools/edge-signed-in-exercise/lib/local-policy.mjs `verifiedCapabilities`)
credits the row only when it passes. The pin asserts that a red check is not
credited and that no result at all is not credited.

## What this receipt does NOT claim

- The sign-in form's own fields and the sign-in WRITE are the S3 row's
  contract and are not claimed here.
- The mark in each destination is the deck's own url_key (the signup card's
  on this deck), so the predicate matches the shape rather than one literal.
- The anchor's rendered bytes stay pinned against the port's production
  capture in tests/card/mod-loader/signin-core-form-view.test.ts, which this
  row's capture complements rather than replaces.
- The whole-family exercise at this round's tip is run once, and its
  committed record (docs/runs/edge-signed-in-exercise-round7-measured-2026-10-24.json)
  names this row among the rows it closes. This receipt does not restate
  that run's numbers; the round's own receipt does.
