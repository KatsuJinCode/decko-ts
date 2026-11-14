# mx-B-001: admin signs in through the sign-in form and stays signed in

The roster row `mx-B-001-1-sign-in-and-stay-signed-in` (family [Family]) reads
"admin signs in through the sign-in form and stays signed in", verdict PASS, bucket DONE, with the evidence basis
"verified — every instrument entry for B-001 is pass (live-acceptance-lane+whole-harness)". This receipt is the family's own adjudication of that row: the
instrument the registry's own ledger records for it, the Ruby oracle that
pins the surfaces the instrument touches, and a fresh measurement at this
tip.

## What the row is

The admin signs in through the deck's own sign-in form and lands signed in on
/, with the session cookie present and the page carrying the signed-in chrome.

## The instrument

The harness's "1. sign in, and stay signed in" group,
tools/edge-signed-in-exercise.mjs, the record "admin signs in through the sign-in
form and stays signed in". The group signs in through the form a person would
use: it opens /*signin, fills Ruby's own fields, submits, and then reads three
facts off the landing page - the session cookie, the page's signed-in marker and
the sign-out link.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "admin signs in through the sign-in form and stays signed in",
check_ids ["B-001"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

Ruby's sign-in form, capture arm
probe-view:17:core@set/self/signin.rb:

    <form class="card-form slotter autosave" id="edit_card_269" recaptcha="off"
    action="/update/*signin" accept-charset="UTF-8" data-remote="true" method="post">

and Ruby's sign-out link, capture arm probe-view:406:sign_out@set/self/account_links.rb:

    <a class="nav-link signout-link known-card" href="/delete/*signin">Sign out</a>

The port renders the sign-out anchor byte for byte
(src/card/render/navbar-views.ts:369), and the oracle test reads both arms out of
the committed capture by id and grades them with the instrument's own reader
(tools/edge-signed-in-exercise/test/sign-in-surfaces.oracle.test.mjs).

The session cookie's NAME is the port's own (src/server/write-routes.ts:363,
decko_ts_session) and so is the page's signed-in marker (decko.signed_in). Those
two facts are named-instrument facts for this row and are not claimed as
oracle-matched; the form, the card's key and the sign-out link are Ruby's own.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round3-20261023/fixed-r1/report.md

    source 683d1e14, started 2026-10-23T13:34:35.731Z
    verdict: PASS
    evidence: {"hasSessionCookie": true, "landedOn": "https://127.0.0.1:56819/", "signedIn": true, "hasSignOut": true}

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The parts of the row that are the port's own (the session cookie's name,
  the page's signed-in marker, the harness's seeded account names) are named
  as such above and are not claimed as oracle-matched.
- The row's DONE condition in the roster is not changed by this receipt; this
  receipt adds the family's own evidence for the row.
