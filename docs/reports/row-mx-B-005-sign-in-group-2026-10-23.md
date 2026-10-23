# mx-B-005: stays signed in after browser Back

The roster row `mx-B-005-1-sign-in-and-stay-signed-in` (family [Family]) reads
"stays signed in after browser Back", verdict PASS, bucket DONE, with the evidence basis
"verified — every instrument entry for B-005 is pass (live-acceptance-lane+whole-harness)". This receipt is the family's own adjudication of that row: the
instrument the registry's own ledger records for it, the Ruby oracle that
pins the surfaces the instrument touches, and a fresh measurement at this
tip.

## What the row is

After the sign-in, the browser's Back button returns to a page that is still
signed in.

## The instrument

The group's record "stays signed in after browser Back". It presses Back and
reads the signed-in marker off the page that answers.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "stays signed in after browser Back",
check_ids ["B-005"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

Ruby's sign-out link, capture arm probe-view:406:sign_out@set/self/account_links.rb,
read by the instrument's own reader and graded against the captured bytes.

The signed-in marker is the port's own; the session cookie's name is the port's
own. Named-instrument facts for this row.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round3-20261023/fixed-r1/report.md

    source 683d1e14, started 2026-10-23T13:34:35.731Z
    verdict: PASS
    evidence: {"url": "https://127.0.0.1:56819/"}

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The parts of the row that are the port's own (the session cookie's name,
  the page's signed-in marker, the harness's seeded account names) are named
  as such above and are not claimed as oracle-matched.
- The row's DONE condition in the roster is not changed by this receipt; this
  receipt adds the family's own evidence for the row.
