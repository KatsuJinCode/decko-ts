# mx-B-011: date card page loads

The roster row `mx-B-011-3-edit-a-date-card` (family [Family]) reads "date
card page loads", verdict PASS, bucket DONE, with the evidence basis
"verified — every instrument entry for B-011 is pass (live-acceptance-lane+whole-harness)".
This receipt is the family's own adjudication of that row: the instrument the
registry's own ledger records for it, the Ruby oracle that pins the surfaces
the instrument touches, and a fresh measurement at this tip.

## What the row is

The deck's own date card (`2011_12_14`) answers with a page: the request
succeeds and the page that answers is that card's page.

## The instrument

The harness's "3. edit a Date card" group
(tools/edge-signed-in-exercise/lib/basic-lifecycle-journeys.mjs), the record
"date card page loads". It visits `/2011_12_14` and grades the visit on its
status, and it reads the title the page carries.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "date card page
loads", check_ids ["B-011"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

Ruby's own date card view, capture arm
probe-view:127:core@set/type/date.rb:

    January 11, 2026

The port renders the date card's view through the same long form
(`%B %-d, %Y`), which is `formatDateCore`
(src/card/render/views.ts:2388-2399): the month name comes from
`toLocaleString("en-US", { month: "long" })`, the day carries no leading
zero, and the year is four digits.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round4-20261023/final-r1/report.md

    source 09ca8dd9, started 2026-10-23T16:28:41.399Z
    verdict: PASS
    evidence: {"status":200,"title":"2011 12 14 - Culturesmith"}

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The card the journey opens is the DECK's own card (`2011_12_14`), not a
  fixture this lane created; Ruby's captured arm shows the view's shape on
  its own date card. The view's rendering is what the oracle pins.
- The row's DONE condition in the roster is not changed by this receipt; this
  receipt adds the family's own evidence for the row.
