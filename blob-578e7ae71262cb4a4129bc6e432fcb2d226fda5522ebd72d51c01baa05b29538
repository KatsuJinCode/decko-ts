# mx-B-018: RichText edit opens as a modal

The roster row `mx-B-018-4-edit-a-richtext-card-tinymce` (family [Family])
reads "RichText edit opens as a modal", verdict PASS, bucket DONE, and the
registry's ledger records every instrument entry for B-018 as pass
(live-acceptance-lane and whole-harness). This receipt is the family's own
adjudication of that row: the instrument the registry's own ledger records
for it, the Ruby oracle that pins the surfaces the instrument touches, and a
fresh measurement at this tip.

## What the row is

Clicking a RichText card's edit link opens the editor IN the page, as a
modal over the card the person was on. A full page navigation away from the
card, or a page with no modal in it, is the failure this row names. This is
the RichText sibling of the date card's modal row (mx-B-012).

## The instrument

The harness's "4. edit a RichText card (TinyMCE, nest dialog, link button)"
group (tools/edge-signed-in-exercise.mjs:808-810), the record "RichText edit
opens as a modal". The edit opens through `openEdit` (:578-597), which
dispatches the edit link's own href the way a person's click does, waits
for `#edit_card, .modal`, and counts the modal elements the page carries;
the record grades `richEdit.modals > 0` and records the href it came from.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "RichText edit opens
as a modal", check_ids ["B-018"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

Ruby's own modal surfaces, the same arms the date card's modal row pins.
Ruby's own modal container, capture arm probe-view:392:modal@set/all/modal.rb:

    <div class='modal fade _modal-slot' id='modal-container' role='dialog'>...

Ruby's own modal close link, capture arm
probe-view:380:close_modal_link@set/all/modal.rb:

    <a class="_close-modal btn-close" data-bs-dismiss="modal" href=""><i class="notranslate material-icons">close</i></a>

Ruby's own edit form inside it, capture arm
probe-view:136:edit_form@set/all/edit_content.rb:

    <div id="decko_bot-edit_form-view" class="card-slot edit_form-view ... data-card-id="1" ...><form class="card-form slotter autosave" id="edit_card_1" ... action="/update/Decko_Bot" ...>

The port renders the modal's wrapper bytes (modal.rb:7-17 haml
:modal_dialog, documented at
src/card/mod-loader/mods/card-mod-edit.ts:1551-1558 and emitted by the edit
view's wrapper), the modal's close link byte for byte
(src/card/mod-loader/mods/card-mod-edit.ts:1497-1499), and the edit form
through the same contract the junction-edit-modal reader grades against
(tools/edge-signed-in-exercise/lib/junction-edit-modal.mjs, pinned by
tools/edge-signed-in-exercise/test/junction-edit-modal.oracle.test.mjs).

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round5-20261023/rows-r1/report.md

    source 95bc1700, started 2026-10-23T19:14:55.935Z
    verdict: PASS
    evidence: {"modals":1,"href":"/Harness_richtext_mvlco79k/edit"}

One modal, and the href it came from is the card's own edit route.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The card the journey opens is this run's own created RichText card
  (`Harness_richtext_<stamp>`); Ruby's captured arms show the edit form's
  and the modal's bytes on their own card. The bytes are what the oracle
  pins.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
