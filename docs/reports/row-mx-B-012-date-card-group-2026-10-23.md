# mx-B-012: edit opens as a modal from the card page (no duplicated page behind it)

The roster row `mx-B-012-3-edit-a-date-card` (family [Family]) reads "edit
opens as a modal from the card page (no duplicated page behind it)", verdict
PASS, bucket DONE, with the evidence basis
"verified — every instrument entry for B-012 is pass (live-acceptance-lane+whole-harness)".
This receipt is the family's own adjudication of that row: the instrument the
registry's own ledger records for it, the Ruby oracle that pins the surfaces
the instrument touches, and a fresh measurement at this tip.

## What the row is

Clicking a card's edit link opens the editor IN the page, as a modal: the
page the person was on stays the page, and one modal is open over it. A
duplicated page behind the modal (a second copy of the card rendered in the
background) is the failure this row names.

## The instrument

The harness's "3. edit a Date card" group
(tools/edge-signed-in-exercise/lib/basic-lifecycle-journeys.mjs), the record
"edit opens as a modal from the card page (no duplicated page behind it)". It
opens the card's edit link the way a person does (the link's own href,
dispatched as a click), waits for the modal to be in the DOM, and grades the
number of modal elements the page carries.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "edit opens as a modal
from the card page (no duplicated page behind it)", check_ids ["B-012"])
records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

Ruby's own edit form, capture arm
probe-view:136:edit_form@set/all/edit_content.rb:

    <div id="decko_bot-edit_form-view" class="card-slot edit_form-view ... data-card-id="1" ...><form class="card-form slotter autosave" id="edit_card_1" ... action="/update/Decko_Bot" ...>

and Ruby's own modal, capture arm
probe-view:380:close_modal_link@set/all/modal.rb:

    <a class="_close-modal btn-close" data-bs-dismiss="modal" href=""><i class="notranslate material-icons">close</i></a>

The port renders the modal's close link byte for byte
(src/card/mod-loader/mods/card-mod-edit.ts:1498) and the edit form through
the same contract the junction-edit-modal reader grades against
(tools/edge-signed-in-exercise/lib/junction-edit-modal.mjs, pinned by
tools/edge-signed-in-exercise/test/junction-edit-modal.oracle.test.mjs).

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round4-20261023/final-r1/report.md

    source 09ca8dd9, started 2026-10-23T16:28:41.399Z
    verdict: PASS
    evidence: {"modals":1,"href":"/2011_12_14/edit"}

One modal, and the href it came from is the card's own edit route.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The card the journey opens is the DECK's own card (`2011_12_14`); Ruby's
  captured arms show the edit form's and the modal's bytes on their own card.
  The bytes are what the oracle pins.
- The row's DONE condition in the roster is not changed by this receipt; this
  receipt adds the family's own evidence for the row.
