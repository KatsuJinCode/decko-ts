# mx-B-007: stays signed in after leaving the site and returning

The roster row `mx-B-007-1-sign-in-and-stay-signed-in` (family [Family]) reads
"stays signed in after leaving the site and returning", verdict PASS, bucket
DONE, with the evidence basis
"verified — every instrument entry for B-007 is pass (live-acceptance-lane+whole-harness)".
This receipt is the family's own adjudication of that row: the instrument the
registry's own ledger records for it, the Ruby oracle that pins the surfaces
the instrument touches, and a fresh measurement at this tip.

## What the row is

After the sign-in, the browser leaves the site entirely (about:blank) and
comes back: the page that answers is still signed in. The session survives
the round trip out of the page and back.

## The instrument

The harness's "1. sign in, and stay signed in" group,
tools/edge-signed-in-exercise.mjs, the record "stays signed in after leaving
the site and returning". It navigates to about:blank, navigates back to the
deck's root, and reads the signed-in marker off the page that answers.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "stays signed in after
leaving the site and returning", check_ids ["B-007"]) records these instrument
entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

Ruby's sign-out link, capture arm
probe-view:406:sign_out@set/self/account_links.rb:

    <a class="nav-link signout-link known-card" href="/delete/*signin">Sign out</a>

The port renders the sign-out anchor byte for byte
(src/card/render/navbar-views.ts:369), which the oracle test asserts against
the port's own source line.

The session cookie's NAME (`decko_ts_session`,
src/server/write-routes.ts:363), the page's signed-in marker
(`decko.signed_in`) and the harness's own seeded account names (`Harness
Admin`, `Harness Member`) are the PORT's and the HARNESS's own facts: they
are named-instrument facts for this row and are not claimed as oracle-matched.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round4-20261023/final-r1/report.md

    source 09ca8dd9, started 2026-10-23T16:28:41.399Z
    verdict: PASS
    evidence: {"url": "https://127.0.0.1:65272/"}

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The parts of the row that are the port's own (the session cookie's name,
  the page's signed-in marker, the harness's seeded account names) are named
  as such above and are not claimed as oracle-matched.
- The row's DONE condition in the roster is not changed by this receipt; this
  receipt adds the family's own evidence for the row.
