# mx-B-043: signing back in works

The roster row `mx-B-043-7-rename-history-search-change` (family
[Family]) reads "signing back in works", verdict PASS, bucket DONE, with the
evidence basis "verified - every instrument entry for B-043 is pass
(live-acceptance-lane+whole-harness)". This receipt is the family's own
adjudication of that row: the instrument the registry's own ledger records
for it, the Ruby oracle that pins the surfaces the instrument touches, and a
fresh measurement at this tip.

## What the row is

The last step of the sign-out journey: after the session was revoked, the
same account must be able to sign in again through the site's own sign-in
form, and the page it lands on must read as signed in. A site that signs you
out forever passes every sign-out check and still fails this one.

## The instrument

The sign-out-and-back-in journey ends with the sign-back-in attempt
(tools/edge-signed-in-exercise.mjs:1070-1071). The attempt signs in by
filling the deck's own sign-in form as a person does
(tools/edge-signed-in-exercise.mjs:520-535: it clears the cookies first, so
the verdict cannot be an existing cookie mistaken for a fresh login; it
fills `card[subcards][+*email][content]` and
`card[subcards][+*password][content]`; it waits for the POST to
`/update/*signin`; and it submits the form whose action is `/update/*signin`).
The record is PASS only when the new session carries the session cookie AND
the landing page reads as signed in (:1071).

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "signing back in
works", id ACT-043, check_ids ["B-043"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE SIGN-IN FORM IS RUBY'S OWN, AND THE REPOSITORY CARRIES ITS CAPTURED
BYTES. The repository's committed capture of a real Ruby deck's rendered
views (reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl)
holds the arm `probe-view:17:core@set/self/signin.rb`. Its bytes are a
`card-form` whose action is the sign-in card's own update route:

    <form class="card-form slotter autosave" id="edit_card_269"
    recaptcha="off" action="/update/*signin" accept-charset="UTF-8"
    data-remote="true" method="post">

with the two credential inputs the instrument fills

    <input class="d0-card-content form-control" placeholder="" type="text"
    value="" name="card[subcards][+*email][content]"
    id="card_subcards___email_content" />
    <input class="d0-card-content _pw-input form-control"
    placeholder="Password" autocomplete="off" type="password"
    name="card[subcards][+*password][content]"
    id="card_subcards___password_content" />

and the submit button the instrument clicks

    <button name="button" type="submit" class="btn btn-primary">Sign in</button>

The same capture set carries the sign-in card's own key (`probe-view:26:open@
set/self/signin.rb`, the card named `*signin`) and its title
(`probe-view:29:title@set/self/signin.rb`, "Sign In"). The instrument's own
reader for these surfaces says the same in its own words at
tools/edge-signed-in-exercise/lib/sign-in-surfaces.mjs:14-45 and :104-113.

The port runs the same thing. The port's sign-in form is
src/card/render/signin-core-form-view.ts:176-192: `signinCoreHtml` builds
the same `card-form slotter autosave` shell with `recaptcha="off"`, the
method spoof `patch` (Ruby's `_method` hidden field) and the action
`/update/${fmt.urlKey()}` (:187), which for the sign-in card is
`/update/*signin`. The sign-in card's own update route is
src/server/write-routes.ts:1410-1416 (`handleSigninUpdate`), which reads
the two subcard contents (:1417-1418), refuses a blank field the way
Ruby's own sign-in does (:1435-1441), and authenticates through
`signinAccount` (:1443), whose port body is src/card/auth/signin.ts:422.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The sign-in form's
tag, its class, its action path, its two credential input names, the
password input's type, the submit button, the sign-in card's key and the
sign-in card's title are Ruby's own, and the port renders each of them. The
session cookie's NAME (`decko_ts_session`,
src/server/write-routes.ts:363) and the page's signed-in marker
(`decko.signed_in`, src/card/render/page.ts:1272) are the port's and the
harness's own facts, named here as named-instrument facts and NOT claimed as
oracle-matched; the harness says the same in its own words at
tools/edge-signed-in-exercise/lib/sign-in-surfaces.mjs:39-45. The check's
own predicate (the new session carries the cookie and the landing page
reads as signed in) is the harness's own instrument.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round10-20261024/rows-r1/report.md

    source 83ca98cddc093c550bcbc5bf7b7f640e117c54b3, started
    2026-10-24T12:00:41.012Z, completed 2026-10-24T12:21:35.391Z,
    the source files clean
    verdict: PASS
    evidence: {"hasSessionCookie":true,"signedIn":true}

The account signed in again through the site's own form after the session
had been revoked, and the page it landed on read as signed in. The run as a
whole graded 253 of 253 checks passed, 0 failed, 0 skipped by write mode.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
