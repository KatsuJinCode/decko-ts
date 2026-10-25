# mx-B-048: the signed-out sign-in page links to sign up and to reset the password

The roster row `mx-B-048-7b-further-signed-in-capabilit` (family [Family])
reads "the signed-out sign-in page links to sign up and to reset the
password", verdict PASS, bucket DONE, with the evidence basis "verified -
every instrument entry for B-048 is pass (live-acceptance-lane+whole-
harness)". This receipt is the family's own adjudication of that row: the
instrument the registry's own ledger records for it, the Ruby oracle that
pins the surfaces the instrument touches, and a fresh measurement at this
tip.

## What the row is

The sign-in page is what a stranger sees first, so it has to offer both
ways out of being stuck: sign up, and reset a forgotten password. The row
is the check that the anonymous page carries both links, not only the
signed-in chrome's.

## The instrument

The signed-out sign-in page is read in an isolated browser
(tools/edge-signed-in-exercise.mjs:1077-1088): the journey opens a fresh
browser context with no session cookie (:1079-1080), goes to the sign-in
card (:1083), and collects the page's link targets (:1084-1087). It keeps
the hrefs that name the sign-up card (:1085) and the hrefs that name a
reset or forgot-password target (:1086). The row is recorded PASS only when
both lists are non-empty (:1088).

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "the signed-out
sign-in page links to sign up and to reset the password", id ACT-048,
check_ids ["B-048"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE SIGN-IN PAGE IS RUBY'S OWN, AND THE REPOSITORY CARRIES ITS CAPTURED
BYTES. The repository's committed capture of a real Ruby deck's rendered
views (reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl)
holds the arm `probe-view:17:core@set/self/signin.rb`. Its bytes are the
sign-in card's own form, and its buttons block carries both links:

    <div class='form-group signin-buttons'>
    <div class='reset-password-link'>
    <a rel="nofollow" class="slotter"
    href="/*signin/edit?slot%5Bhide%5D%5B%5D=board_link"
    data-remote="true">Reset password</a>
    </div>
    <div class='signin-button'>
    <button name="button" type="submit" class="btn btn-primary">Sign in</button>
    </div>
    <div class='signup-button'>
    <a class="known-card" href="/new/Sign_up">...or sign up!</a>
    </div>
    </div>

So Ruby's own anonymous sign-in page carries a "Reset password" link whose
href is the sign-in card's own edit view with the board link hidden, and a
"...or sign up!" link whose href is the sign-up card's new-card path.

The port renders the same thing. The buttons block is
src/card/render/signin-core-form-view.ts:206-221 (`coreHaml`): the
`.signin-fields` wrapper, then `.form-group signin-buttons` with the
`.reset-password-link`, `.signin-button` and `.signup-button` divisions in
that order. The reset link is src/card/render/signin-core-form-view.ts:125-135
(`resetPasswordLink`): the `rel="nofollow"`, `class="slotter"`, the href
`/*signin/edit?slot%5Bhide%5D%5B%5D=board_link` and the `data-remote` that
comes last. The sign-up link is src/card/render/signin-core-form-view.ts:96-113
(`signupLink`): the known or wanted class from the deck's own card
existence answer, the href `new/<mark url_key>`, and the text. The three
strings are the port's own locale table,
src/card/render/signin-core-form-view.ts:73-75: "...or sign up!", "Reset
password" and "Sign in", which are the three words Ruby captured.

AND THE PORT'S BYTES ARE PINNED TO THE PRODUCTION ORACLE BY A TEST THAT
RUNS IN THE BATTERY. The committed expectation
tests/card/mod-loader/signin-core-form-view.test.ts:116-141 is the
production oracle form verbatim, and it carries BOTH of this row's links:
the reset anchor at :132

    <a rel="nofollow" class="slotter" href="/*signin/edit?slot%5Bhide%5D%5B%5D=board_link" data-remote="true">Reset password</a>

and the sign-up anchor at :138

    <a class="known-card" href="/new/Sign_up">...or sign up!</a>

The test at :165-169 renders the port's own `*signin` `:core` view and
asserts the bytes are equal to that expectation, so the two links cannot
drift from the production oracle without the battery going red.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The two links' own
hrefs, their classes, their texts, the order of the buttons block and the
block's division classes are Ruby's own, and the port renders each of them
byte for byte. The check's own predicate is the harness's own instrument,
and it is deliberately broad: the sign-up filter matches any href naming
the sign-up card (:1085) and the reset filter matches any href containing
"reset", "forgot" or "signin" (:1086), so the filter alone is not evidence
of a reset link. What makes the row oracle-backed is the last entry of the
measured reset list, which is byte-equal to Ruby's own captured reset href,
and the measured sign-up hrefs, which are byte-equal to Ruby's own captured
sign-up href.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round10-20261024/rows-r1/report.md

    source 83ca98cddc093c550bcbc5bf7b7f640e117c54b3, started
    2026-10-24T12:00:41.012Z, completed 2026-10-24T12:21:35.391Z,
    the source files clean
    verdict: PASS
    evidence: {"signup":["/new/Sign_up","/new/Sign_up"],"reset":["/*signin","/*signin/edit","/*signin/board","/*signin/edit?slot%5Bhide%5D%5B%5D=board_link"]}

The anonymous page carried a sign-up href and a reset href, and the reset
href the page offered was Ruby's own captured reset href byte for byte.
The run as a whole graded 253 of 253 checks passed, 0 failed, 0 skipped by
write mode.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
