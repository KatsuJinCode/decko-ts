# mx-B-002: member signs in through the sign-in form and stays signed in

The roster row `mx-B-002-1-sign-in-and-stay-signed-in` (family [Family]) reads
"member signs in through the sign-in form and stays signed in", verdict PASS, bucket DONE, with the evidence basis
"verified — every instrument entry for B-002 is pass (live-acceptance-lane+whole-harness)". This receipt is the family's own adjudication of that row: the
instrument the registry's own ledger records for it, the Ruby oracle that
pins the surfaces the instrument touches, and a fresh measurement at this
tip.

## What the row is

The member signs in through the same form, with the member's own credentials,
and lands signed in.

## The instrument

The same group's second record, "member signs in through the sign-in form and
stays signed in". The harness clears the cookies first, so the verdict cannot be
a stale session from the admin's sign-in: the member's own credential has to
produce the session and the landing page.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "member signs in through the sign-in form and stays signed in",
check_ids ["B-002"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

The same two arms as the admin row: Ruby's sign-in form
(probe-view:17:core@set/self/signin.rb, action="/update/*signin") and Ruby's
sign-out link (probe-view:406:sign_out@set/self/account_links.rb). The sign-in
form carries the email and password fields for BOTH actors - Ruby's own bytes
show the field names card[subcards][+*email][content] and
card[subcards][+*password][content] - so the member's form is the same form.

The session cookie's name and the page's signed-in marker are the port's own
facts, as in the admin row.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round3-20261023/fixed-r1/report.md

    source 683d1e14, started 2026-10-23T13:34:35.731Z
    verdict: PASS
    evidence: {"hasSessionCookie": true, "signedIn": true}

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The parts of the row that are the port's own (the session cookie's name,
  the page's signed-in marker, the harness's seeded account names) are named
  as such above and are not claimed as oracle-matched.
- The row's DONE condition in the roster is not changed by this receipt; this
  receipt adds the family's own evidence for the row.
