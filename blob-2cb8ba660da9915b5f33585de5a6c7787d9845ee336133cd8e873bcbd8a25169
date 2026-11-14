# mx-B-050: sign-in with an empty password is refused (no session)

The roster row `mx-B-050-7b-further-signed-in-capabilit` (family [Family])
reads "sign-in with an empty password is refused (no session)", verdict PASS,
bucket DONE, with the evidence basis "verified - every instrument entry for
B-050 is pass (live-acceptance-lane+whole-harness)". This receipt is the
family's own adjudication of that row: the instrument the registry's own
ledger records for it, the Ruby oracle that pins the surfaces the
instrument touches, and a fresh measurement at this tip.

## What the row is

The empty password is the other half of the blank-field refusal. The row is
the check that a submit with nothing in the password box is refused, and
that the visitor is not signed in by it.

## The instrument

The refusal is driven in the same isolated browser with no session cookie
(tools/edge-signed-in-exercise.mjs:1077-1118). After the wrong-password leg,
the journey reloads the sign-in card (:1104), fills the admin email (:1105)
and leaves the password input empty (:1106), then waits for the form's own
write (:1107-1110) and reads the context's cookies (:1112). The row is
recorded PASS only when the response is 400 or more, or no response was
made at all, and no session cookie was set (:1113-1114).

The registry's own ledger for this row
(C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json,
action "sign-in with an empty password is refused (no session)", id ACT-050,
check_ids ["B-050"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, http-verb, native-local-bundle: pass

The capability checklist's own row for this surface is S3, "Sign in requires
email and password (form validation)"
(tools/edge-signed-in-exercise/capabilities.json), and its recorded finding
is "Empty password tested; empty email not tested."

## The oracle

RUBY'S OWN REFUSAL IS CAPTURED IN THIS REPOSITORY, WITH ITS STATUS AND
ITS ALERT BYTES. The committed Ruby write-battery capture
(reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json,
step "signin-blank-password") records the status 422 and this body:

    <div class="alert alert-warning alert-dismissible  card-error-msg" role="alert"><button type="button" data-bs-dismiss="alert" class="btn-close" aria-label="Close"></button>
    <h4 class="alert-heading error">Problems with *signin</h4>
    password can&#39;t be blank</div>

Two things in those bytes matter for this row. The status is 422, the same
status the wrong-password refusal uses. And the message carries NO key: it
is the bare text "password can't be blank", with no `<strong>KEY:</strong>`
prefix, because Ruby's blank-field abort is the one refusal that has no
errors key. The step's delta is zero on every table, so Ruby saved no card
and minted no session for it either.

The request that produced that capture is the repository's own parity
scenario: tools/parity-side-effects/scenarios.json:94-108 is the step
"signin-blank-password", a PATCH of `/update/*signin` whose body carries
`card[subcards][+*email][content]` and `card[subcards][+*password][content]`
with an empty password, which are exactly the two inputs the instrument
fills. That scenario carries NO "deliberate" block, so the repository
records no declared difference for this step.

RUBY'S OWN SOURCE OWNS THE LADDER AND THE STRING. The account mod's
sign-in card (card-mod-account-0.20.0/set/self/signin.rb, read from the
pinned oracle gem set at
C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems) at :45-49 aborts
before any authentication when the password is blank
(`abort_unless pword, :password_missing`), and at :62-64 that abort is
`abort :failure, t("account_#{error_key}")`, the abort message without an
errors key. The locale string is
(card-mod-account-0.20.0/config/locales/en.yml:27)
`account_password_missing: password can't be blank`.

THE PORT OWNS THE SAME LADDER, WITH THE SAME STRING AND THE SAME ABSENCE
OF A KEY. src/card/auth/signin.ts:243 carries the Ruby locale string
verbatim (`password_missing: "password can't be blank"`), and :293 walks
the same order, returning the blank-password failure before any account is
looked up. src/server/write-routes.ts:1438-1440 answers the blank-field
submit with the bare message and no key, and :1286-1299 renders a keyless
failure as the plain message paragraph.

The port's own battery pins the string:
tests/card/auth/signin-endpoint.test.ts:449-458 asserts that a blank
password is answered with `password can't be blank`. That test drives the
JSON sign-in endpoint, which answers 401; the form route the instrument
drives answers 422, and it is the form route the Ruby capture recorded.

## What is oracle-matched and what is not, stated plainly

Oracle-matched: the refusal is a 422; no session is minted; the message is
Ruby's own "password can't be blank" string, byte for byte; the message
carries no key, as Ruby's blank-field abort carries no key; the error
sits in the sign-in card's own alert block under the heading "Problems
with *signin".

Not oracle-matched, and stated rather than glossed over: the markup around
the message differs. Ruby renders the bare message as a text node directly
under the heading; the port wraps it in a `<p>` paragraph. The alert's class
list differs the same way it does in the mx-B-049 receipt: Ruby's list
carries a double space before `card-error-msg` and the block carries
newlines, while the port renders one line with one space.

Also named as the port's own facts rather than oracle-matched: the session
cookie's name (`decko_ts_session`, src/server/write-routes.ts:363). The
instrument's own predicate is deliberately broad: it accepts a 400-or-more
status OR no response at all (:1113), so a refusal that never reached the
server would also pass. This run's evidence shows the request was made and
answered, so the refusal was the server's.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round11-20261024/rows-r1/report.md

    source 71d4f686007e9f26e75cbfe66db964bd2ccc08cd, started
    2026-10-24T22:21:12.528Z, completed 2026-10-24T22:42:55.803Z,
    the source files clean
    verdict: PASS
    evidence: {"status":422,"noRequest":false,"hasSession":false}

The empty password was refused with 422, the request was made and answered
(noRequest is false), and no session was set. The run as a whole graded 253
of 253 checks passed, 0 failed, 0 skipped by write mode.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
- The capability checklist's own finding for S3 is not closed here: the
  empty EMAIL case is still untested, and this row does not claim it.
