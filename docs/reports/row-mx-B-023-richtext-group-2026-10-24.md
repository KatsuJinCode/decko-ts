# mx-B-023: the {{}} button opens the Nest dialog

The roster row `mx-B-023-4-edit-a-richtext-card-tinymce` (family [Family])
reads "the {{}} button opens the Nest dialog", verdict PASS, bucket DONE, and
the registry's ledger records every instrument entry for B-023 as pass
(live-acceptance-lane and whole-harness). This receipt is the family's own
adjudication of that row: the instrument the registry's own ledger records
for it, the Ruby oracle that pins the surfaces the instrument touches, and a
fresh measurement at this tip.

## What the row is

Clicking the nest toolbar control opens the Nest dialog over the editor: a
visible `_nest-editor` panel with the fields the nest editor carries. A
button that opens nothing, or a panel that is never visible, is the failure
this row names.

## The instrument

The harness's "4. edit a RichText card (TinyMCE, nest dialog, link button)"
group (tools/edge-signed-in-exercise.mjs:781-807), the record "the {{}}
button opens the Nest dialog" (:862). The body (:850-861) clicks the
toolbar control the previous row located, waits for a visible
`._nest-editor`, then reads the visible dialog's own fields and grades
`dialog.open`. The record carries the field list it found.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "the {{}} button opens
the Nest dialog", check_ids ["B-023"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

The dialog is Ruby's own nest editor view, capture arm
probe-view:551:nest_editor@set/all/reference_editor/nest_editor.rb
(graded-identical in the registry's own ledger,
tools/compat-report/graded-probes.json:7181-7185, `html:nest_editor@set/all/
reference_editor/nest_editor.rb`: "graded-identical"), whose own bytes are:

    <div class='_nest-editor'>
    <div class='card-header d-flex'>
    <h5 class='mt-1'>
    Nest
    </h5>
    ...
    <label for='nest_name'>Card</label>
    ...
    <input type="text" name="nest_name" id="nest_name" value="" class="form-control _nest-name _autocomplete " data-left-name="Decko Bot" data-left-type="RichText" data-options-card="*all+by name" />

The modal sibling arm is probe-view:548:modal_nest_editor@set/all/
reference_editor/nest_editor.rb (graded-identical,
tools/compat-report/graded-probes.json:7166-7170).

The port renders the same container and the same field group:
src/card/mod-loader/mods/card-mod-tinymce_editor.ts:1029 opens
`<div class='_nest-editor'>` with the "Nest" header, and
`nestEditorPartial` (src/card/mod-loader/mods/card-mod-tinymce_editor.ts:1507-1541)
renders the `Card` label, the help link and the `_nest-name` input with its
`data-options-card="*all+by name"` (:1520-1525).

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The dialog's own
bytes (the `_nest-editor` container, its header, the `Card` label and the
`_nest-name` field) are Ruby's own and capture-matched above, and the port
renders them. What is NOT capture-matched is the browser's live dialog: the
fact that it became visible and the field list in it are the instrument's own
named facts, measured at this tip.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round6-20261024/rows-r1/report.md

    source 75fe7d99, started 2026-10-24T02:15:36.530Z
    verdict: PASS
    evidence: {"open":true,"fields":["nest_name","value","value","value","value","preview"]}

The nest control opened a visible Nest dialog, and the dialog carried the
name field the oracle pins.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The card the journey opens is this run's own created RichText card
  (`Harness_richtext_mvlrp0g7`); Ruby's captured arms show the nest editor's
  bytes on their own card. The bytes are what the oracle pins.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
