# mx-B-015: the page shows the new date (long form)

The roster row `mx-B-015-3-edit-a-date-card` (family [Family]) reads "the
page shows the new date (long form)", verdict PASS, bucket DONE, and the
registry's ledger records every instrument entry for B-015 as pass
(live-acceptance-lane and whole-harness). This receipt is the family's own
adjudication of that row: the instrument the registry's own ledger records
for it, the Ruby oracle that pins the surfaces the instrument touches, and a
fresh measurement at this tip.

## What the row is

After the save answers, the card's own page renders the NEW date in the
long form (the month spelled out, the day without a leading zero, the
four-digit year): the write is not merely accepted, its content is what the
card now shows.

## The instrument

The harness's "3. edit a Date card" group
(tools/edge-signed-in-exercise/lib/basic-lifecycle-journeys.mjs:41-42), the
record "the page shows the new date (long form)". After the save, it visits
`/2011_12_14` again and grades that the page's html carries
`longDate(newDate)`, the long-form rendering of the date the journey wrote
(tools/edge-signed-in-exercise.mjs:631: `toLocaleDateString("en-US", {
timeZone: "UTC", month: "long", day: "numeric", year: "numeric" })`).

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "the page shows the
new date (long form)", check_ids ["B-015"]) records these instrument
entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

Ruby's own date card view, capture arm probe-view:127:core@set/type/date.rb:

    January 11, 2026

Ruby renders the date's core with `Date.parse(content).strftime("%B %-d,
%Y")`, and the port renders the same long form through `formatDateCore`
(src/card/render/views.ts:2388-2399: the month from
`toLocaleString("en-US", { month: "long" })`, the day carrying no leading
zero, the year four digits), which the date type's core view calls
(src/card/render/views.ts:1382). The format's byte shape is pinned by the
engine's own test
(tests/card/mod-loader/card-mod-date.test.ts:352-360, the Oracle Date
Probe's :core renders "March 15, 2026").

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The long form's
byte shape (`<Month> <day>, <year>`) is Ruby's own, capture-matched above
and pinned by the test. The VALUE in this row's evidence differs from the
capture's by design: the capture deck's date card holds January 11, 2026,
while this run wrote 2011-12-15 and the page answered "December 15, 2011".
What the oracle pins is the format; what the instrument measured is this
run's own value on this deck's own card.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round5-20261023/rows-r1/report.md

    source 95bc1700, started 2026-10-23T19:14:55.935Z
    verdict: PASS
    evidence: {"newDate":"2011-12-15","shown":"December 15, 2011"}

The page the visit answered carried "December 15, 2011", the long form of
the date the journey wrote.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The card the journey saves is the DECK's own card (`2011_12_14`); Ruby's
  captured arm shows the long form on its own date card. The format's byte
  shape is what the oracle pins.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
