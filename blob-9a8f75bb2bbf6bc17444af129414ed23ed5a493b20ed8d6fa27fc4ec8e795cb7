# mx-B-016: the original date is restored afterwards (long form)

The roster row `mx-B-016-3-edit-a-date-card` (family [Family]) reads "the
original date is restored afterwards (long form)", verdict PASS, bucket
DONE, and the registry's ledger records every instrument entry for B-016 as
pass (live-acceptance-lane and whole-harness). This receipt is the family's
own adjudication of that row: the instrument the registry's own ledger
records for it, the Ruby oracle that pins the surfaces the instrument
touches, and a fresh measurement at this tip.

## What the row is

The edit legs of the date-card group leave the deck as they found it: after
the new date is shown, the journey reopens the editor, writes the ORIGINAL
stored date back, saves again, and the card's page renders the original
date in the long form. A run that could change a date but could not change
it back would fail this row.

## The instrument

The harness's "3. edit a Date card" group
(tools/edge-signed-in-exercise/lib/basic-lifecycle-journeys.mjs:43-48), the
record "the original date is restored afterwards (long form)". The restore
reopens the card's edit modal, fills the content field with the original
value the field held (read before any change, line 23), saves through the
same `saveEditForm` control, visits `/${dateCard}`, and grades that the
page's html carries `longDate(original)`.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "the original date
is restored afterwards (long form)", check_ids ["B-016"]) records these
instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

The same two Ruby surfaces the round trip rides. The page that must show
the restored date renders the date's core in Ruby's own long form, capture
arm probe-view:127:core@set/type/date.rb:

    January 11, 2026

(port: `formatDateCore`, src/card/render/views.ts:2388-2399, called by the
date core view at src/card/render/views.ts:1382, the byte shape pinned by
tests/card/mod-loader/card-mod-date.test.ts:352-360). The second save rides
Ruby's own edit form and update route, capture arm
probe-view:136:edit_form@set/all/edit_content.rb (`action="/update/..."`),
dispatched by the port at src/server/write-routes.ts:16-17 and :926-933.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The long-form byte
shape and the update route are Ruby's own, as in the sibling receipts. The
restore itself (a second save answering a write, then the page carrying the
original value) is the instrument's own round trip on the deck's own card;
the original value it restores is the value the harness read from the field
before any change (the deck's stored `2011-12-14`).

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round5-20261023/rows-r1/report.md

    source 95bc1700, started 2026-10-23T19:14:55.935Z
    verdict: PASS
    evidence: {"original":"2011-12-14","shown":"December 14, 2011"}

The page the visit answered carried "December 14, 2011", the long form of
the original stored date, after the restore's own save answered.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The card the journey restores is the DECK's own card (`2011_12_14`); the
  run's own database is what the harness's restore value came from. The
  oracle pins the surfaces (long form, update route), not this deck's value.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
