# mx-B-019: TinyMCE loads for the RichText editor

The roster row `mx-B-019-4-edit-a-richtext-card-tinymce` (family [Family])
reads "TinyMCE loads for the RichText editor", verdict PASS, bucket DONE, and
the registry's ledger records every instrument entry for B-019 as pass
(live-acceptance-lane and whole-harness). This receipt is the family's own
adjudication of that row: the instrument the registry's own ledger records
for it, the Ruby oracle that pins the surfaces the instrument touches, and a
fresh measurement at this tip.

## What the row is

Opening a RichText card's edit modal and clicking into the content field
loads the TinyMCE editor on THAT field: the TinyMCE global is present, the
editor instance for the field's own id is the initialized instance, and it is
the active editor. A page where TinyMCE never loads, an editor left
uninitialized, or an active editor that belongs to a different field is the
failure this row names.

## The instrument

The harness's "4. edit a RichText card (TinyMCE, nest dialog, link button)"
group (tools/edge-signed-in-exercise.mjs:781-807), the record "TinyMCE loads
for the RichText editor" (:823). The body (:811-822) first focuses the
field's editor through `focusRichEditor`
(tools/edge-signed-in-exercise/lib/rich-editor.mjs:12-32), which resolves the
field's own id from the visible modal's `textarea.tinymce-textarea` and waits
for THAT id's editor to be initialized; the page then reads
`window.tinymce`, `window.tinymce.get(id)`, `window.tinymce.activeEditor` and
the editor container's stylesheet links, and grades
`editor.tinymcePresent && editor.activeEditor`.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "TinyMCE loads for the
RichText editor", check_ids ["B-019"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

The field the editor loads on is Ruby's own editor input, captured in
fixtures/captured/edit-views.json (targets.basic_note, a RichText card, view
`bot.edit_in_form`):

    <textarea rows="3" class="tinymce-textarea d0-card-content form-control" id="oracle_basic-1" name="card[content]">

and the port renders that same input byte for byte
(src/card/mod-loader/mods/card-mod-edit.ts:836 and :871,
`<textarea rows="3" class="tinymce-textarea d0-card-content form-control"
id="${id}" name="${namePrefix}[content]">`). The port's own citation names
the gem's source of those bytes (card-mod-edit.ts:740-745:
card-mod-tinymce_editor set/all/tinymce_editor.rb:9-13
`tinymce_editor_input: text_area :content, rows: 3, class:
"tinymce-textarea d0-card-content", id: unique_id`, plus the bootstrap
FIELD_HELPERS wrapper that appends " form-control").

The editor library itself is Ruby's own captured asset: the script leaf
`script_tinymce.js` in the captured script input
(fixtures/captured/all-script-assembled-input.js:12047, TinyMCE 5.10.7). The
port's asset table registers that same leaf and the nest editor's own
scripts for the mod (src/card/mod-loader/mods/core-admin-runtime.ts:929-948,
the `tinymce_editor` group's `group: local` script list:
image_editor.js.coffee, link_editor.js.coffee, nest_editor.js.coffee,
nest_editor_name.js.coffee, nest_editor_options.js.coffee,
nest_editor_rules.js.coffee, script_tinymce.js, tinymce_config.js.coffee),
and the port compiles the captured leaves into the served bundle
(src/card/assets/compiled-script-bundle.ts:44, and compileScriptBundle at :87-92).

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The editor field's
own bytes (the `tinymce-textarea d0-card-content form-control` textarea) are
Ruby's own and capture-matched above, and the port renders them through its
cited editor-input contract. The TinyMCE library bytes are Ruby's own
captured asset, served by the port's own asset group. What is NOT
capture-matched is the browser's live editor instance: the `tinymcePresent`,
`activeEditor` and `skinCss` facts are what the instrument measured in the
browser at this tip, and the count of the editor container's stylesheet links
is the instrument's own named fact.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round6-20261024/rows-r1/report.md

    source 75fe7d99, started 2026-10-24T02:15:36.530Z
    verdict: PASS
    evidence: {"tinymcePresent":true,"activeEditor":true,"skinCss":0,"textarea":"card[content]"}

TinyMCE was present, the editor for the field's own id was initialized and
was the active editor, and the field was the card's `card[content]`
textarea.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The card the journey opens is this run's own created RichText card
  (`Harness_richtext_mvlrp0g7`); Ruby's captured arms show the editor input's
  bytes on their own card. The bytes are what the oracle pins.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
