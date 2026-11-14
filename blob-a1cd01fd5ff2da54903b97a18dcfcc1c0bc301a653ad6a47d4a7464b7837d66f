# mx-B-014: saving the new date answers a write (Save)

The roster row `mx-B-014-3-edit-a-date-card` (family [Family]) reads "saving
the new date answers a write (Save)", verdict PASS, bucket DONE, and the
registry's ledger records every instrument entry for B-014 as pass
(live-acceptance-lane and whole-harness). This receipt is the family's own
adjudication of that row: the instrument the registry's own ledger records
for it, the Ruby oracle that pins the surfaces the instrument touches, and a
fresh measurement at this tip.

## What the row is

Pressing the modal's save control after changing the date produces a WRITE
the server answers: the form posts to the card's own update route and the
response is under 400. A save that answers nothing, or a form that has no
action to post to, is the failure this row names.

## The instrument

The harness's "3. edit a Date card" group. The save itself is
`saveEditForm` (tools/edge-signed-in-exercise.mjs:600-630): it takes the
modal's visible form, reads the form's own `action` attribute, refuses an
action that leaves the owned local origin, arms on the non-GET response to
that exact path, clicks the form's own submit button, and reports the
response's status and the write's server total. The record
"saving the new date answers a write (Save)" is
(tools/edge-signed-in-exercise/lib/basic-lifecycle-journeys.mjs:40) and
grades `saved.status !== null && saved.status < 400`.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "saving the new date
answers a write (Save)", check_ids ["B-014"]) records these instrument
entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

The form the save submits is Ruby's own edit-form bytes, capture arm
probe-view:136:edit_form@set/all/edit_content.rb:

    <form class="card-form slotter autosave" id="edit_card_1" ... action="/update/Decko_Bot" accept-charset="UTF-8" data-remote="true" method="post">

and the save control is Ruby's own modal footer, capture arm
probe-view:388:modal_footer@set/all/modal.rb:

    <button name="button" type="submit" class="btn-xs _close-modal float-end btn btn-primary" data-bs-dismiss="modal">Close</button>

The route the form posts is Ruby's own: engine_routes.rb:46-47 routes
`POST|PUT|PATCH (card)/update(/<mark>)` to update, and the port dispatches
exactly that grammar (src/server/write-routes.ts:16-17 for the route table,
src/server/write-routes.ts:926-933 for the explicit-match dispatch whose
comment names the captured oracle edit form's own action). The status
under 400 and the server total are the instrument's own named facts: they
are what the run measured, not bytes the oracle pins.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round5-20261023/rows-r1/report.md

    source 95bc1700, started 2026-10-23T19:14:55.935Z
    verdict: PASS
    evidence: {"status":200,"action":"/update/2011_12_14","serverTotalMs":913}

The save answered 200 on the card's own update route (the action the form
itself carries), in 913 ms of server time.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The card the journey saves is the DECK's own card (`2011_12_14`); Ruby's
  captured arms show the edit form's and the footer button's bytes on their
  own card. The bytes are what the oracle pins.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
