# mx-B-020: saving the RichText card persists (Save answers a write)

The roster row `mx-B-020-4-edit-a-richtext-card-tinymce` (family [Family])
reads "saving the RichText card persists (Save answers a write)", verdict
PASS, bucket DONE, and the registry's ledger records every instrument entry
for B-020 as pass (live-acceptance-lane and whole-harness). This receipt is
the family's own adjudication of that row: the instrument the registry's own
ledger records for it, the Ruby oracle that pins the surfaces the instrument
touches, and a fresh measurement at this tip.

## What the row is

Typing into the RichText editor and pressing the modal's save control
produces a WRITE the server answers: the form posts to the card's own update
route and the response is under 400. A save that answers nothing, or a form
that has no action to post to, is the failure this row names.

## The instrument

The harness's "4. edit a RichText card (TinyMCE, nest dialog, link button)"
group (tools/edge-signed-in-exercise.mjs:781-807), the record "saving the
RichText card persists (Save answers a write)" (:832). The save itself is
`saveEditForm` (tools/edge-signed-in-exercise.mjs:600-630): it takes the
modal's visible form, reads the form's own `action` attribute, refuses an
action that leaves the owned local origin, arms on the non-GET response to
that exact path, clicks the form's own submit button, and reports the
response's status and the write's server total. The record grades
`richSave.status !== null && richSave.status < 400`. The body first moves
the caret to the end of the typed content (:827-830) so the save carries the
text the journey typed.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "saving the RichText
card persists (Save answers a write)", check_ids ["B-020"]) records these
instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

The form the save submits is Ruby's own edit-form bytes, capture arm
probe-view:136:edit_form@set/all/edit_content.rb:

    <form class="card-form slotter autosave" id="edit_card_1" ... action="/update/Decko_Bot" accept-charset="UTF-8" data-remote="true" method="post">

and the save control is Ruby's own modal footer, capture arm
probe-view:388:modal_footer@set/all/modal.rb:

    <button name="button" type="submit" class="btn-xs _close-modal float-end btn btn-primary" data-bs-dismiss="modal">Close</button>

The RichText field inside that form is Ruby's own editor input, captured in
fixtures/captured/edit-views.json (targets.basic_note, a RichText card, view
`bot.edit_in_form`):

    <textarea rows="3" class="tinymce-textarea d0-card-content form-control" id="oracle_basic-1" name="card[content]">

which the port renders byte for byte
(src/card/mod-loader/mods/card-mod-edit.ts:836 and :871).

The route the form posts is Ruby's own: engine_routes.rb:46-47 routes
`POST|PUT|PATCH (card)/update(/<mark>)` to update, and the port dispatches
exactly that grammar (src/server/write-routes.ts:16-17 for the route table,
src/server/write-routes.ts:926-933 for the explicit-match dispatch whose
comment names the captured oracle edit form's own action). The status under
400 and the server total are the instrument's own named facts: they are what
the run measured, not bytes the oracle pins.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round6-20261024/rows-r1/report.md

    source 75fe7d99, started 2026-10-24T02:15:36.530Z
    verdict: PASS
    evidence: {"status":200,"serverTotalMs":511,"serverSaid":"<div id=\"harness_richtext_mvlrp0g7-titled-view\" class=\"card-slot titled-view ALL TYPE-rich_text SELF-harness_richtext_mvlrp0g7\" data-card-id=\"53053\" data-card-name=\"Harness_richtext_mvlrp0g7\" data-card-ty |

The save answered 200 on the card's own update route (the action the form
itself carries), and the response body is the card's own titled view.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The card the journey saves is this run's own created RichText card
  (`Harness_richtext_mvlrp0g7`); Ruby's captured arms show the edit form's
  and the footer's bytes on their own card. The bytes are what the oracle
  pins.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
