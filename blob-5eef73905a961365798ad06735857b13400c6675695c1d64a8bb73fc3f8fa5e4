# mx-B-017: create a RichText card via /new/RichText and land on it

The roster row `mx-B-017-4-edit-a-richtext-card-tinymce` (family [Family])
reads "create a RichText card via /new/RichText and land on it", verdict
PASS, bucket DONE, and the registry's ledger records every instrument entry
for B-017 as pass (live-acceptance-lane and whole-harness). This receipt is
the family's own adjudication of that row: the instrument the registry's own
ledger records for it, the Ruby oracle that pins the surfaces the instrument
touches, and a fresh measurement at this tip.

## What the row is

The signed-in create path: a person opens /new/RichText, names the card,
submits the form, the create answers as a WRITE, and the new RichText card
exists (its own page answers). A create that answers nothing, or a card
that does not exist after the form was submitted, is the failure this row
names.

## The instrument

The harness's "4. edit a RichText card (TinyMCE, nest dialog, link button)"
group (tools/edge-signed-in-exercise.mjs:780-807), the record "create a
RichText card via /new/RichText and land on it" (:806). The body (:797-805)
visits `/new/RichText`, fills `form.card-form input[name="card[name]"]`
with this run's own scratch name, clicks the form's submit, reads the run's
request ledger for the non-GET line, and grades
`writeStatus !== null && writeStatus < 400 && exists` where `exists` is a
GET of the new card's own page answering 200.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "create a RichText
card via /new/RichText and land on it", check_ids ["B-017"]) records these
instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

Ruby's own new-card form, capture arm probe-view:163:new@set/all/new.rb:

    <form class="card-form slotter" id="edit_card_1" data-main-success="{&quot;redirect&quot;:true}" action="/card/create" accept-charset="UTF-8" data-remote="true" method="post">

with the submit control

    <button name="button" type="submit" data-disable-with="Submitting" class="submit-button create-submit-button btn btn-primary">

The port renders the create form through the same contract
(src/card/mod-loader/mod-form-substrate.ts:280-300, `createFormShell`:
dom id "new_card", action "/card/create" at :293, citing new.rb:43-49
create_form and card_form_url_and_action :232-240), and the create route is
Ruby's own: engine_routes.rb routes `POST /type/<type>` to create with that
type (src/server/write-routes.ts:12, routes.rb:33) and
`POST|PATCH (card)/create(/<mark>)` to create (:17).

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The create form's
action bytes (`/card/create`), its slotter class and its submit button are
Ruby's own, capture-matched above and rendered through the port's cited
create-form shell. The captured arm renders the new view for the capture
deck's own card and hides the name formgroup (its data-slot carries
"hide":["name_formgroup"], the name riding a hidden input); the run's
/new/RichText page shows the name field the journey fills. The visible-name
difference is the view state, not the create contract; the action and the
submit bytes are what the oracle pins. The write status, the landed URL and
the exists check are the instrument's own named facts.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round5-20261023/rows-r1/report.md

    source 95bc1700, started 2026-10-23T19:14:55.935Z
    verdict: PASS
    evidence: {"formStatus":200,"writeStatus":200,"serverTotalMs":310,"landed":"https://127.0.0.1:53404/Harness_richtext_mvlco79k","exists":true}

The create answered 200 (310 ms of server time), the browser landed on the
new card's own page, and a GET of that card answered 200.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The card this leg creates is this run's own scratch card
  (`Harness_richtext_<stamp>`); Ruby's captured arm shows the new form's
  bytes on its own card. The form's contract bytes are what the oracle pins.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
