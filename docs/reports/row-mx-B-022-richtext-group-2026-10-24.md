# mx-B-022: the nest ({{}}) button is present in the TinyMCE toolbar

The roster row `mx-B-022-4-edit-a-richtext-card-tinymce` (family [Family])
reads "the nest ({{}}) button is present in the TinyMCE toolbar", verdict
PASS, bucket DONE, and the registry's ledger records every instrument entry
for B-022 as pass (live-acceptance-lane and whole-harness). This receipt is
the family's own adjudication of that row: the instrument the registry's own
ledger records for it, the Ruby oracle that pins the surfaces the instrument
touches, and a fresh measurement at this tip.

## What the row is

The RichText editor's own toolbar carries the nest button: the control that
opens the nest dialog. A toolbar without that control, or an editor that
never loaded its toolbar, is the failure this row names.

## The instrument

The harness's "4. edit a RichText card (TinyMCE, nest dialog, link button)"
group (tools/edge-signed-in-exercise.mjs:781-807), the record "the nest
({{}}) button is present in the TinyMCE toolbar" (:848). The body (:838-847)
reopens the card's edit, focuses the editor again, then walks the loaded
editor's own toolbar buttons and anchors
(`button, a` inside `editorContainer`) for the one whose title, aria-label,
text or `data-mce-name` matches `/nest|\{\{\}\}/i`. The record grades
`nestButton !== null` and records the label it found.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "the nest ({{}}) button
is present in the TinyMCE toolbar", check_ids ["B-022"]) records these
instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

The button is the gem's own TinyMCE nest plugin. The port carries the gem's
plugin bytes verbatim and cites where they come from
(deploy/bunny-worker-src/bunny-edge-tinymce-nest-plugin.ts:1-5: "Decko's
TinyMCE 'nest' plugin (the {{}} nest and [[]] link toolbar buttons), based on
card-mod-tinymce_editor-0.20.0 public/plugins/nest/plugin.min.js. Ruby
serves it from the mod's public folder; the published TinyMCE distribution
does not carry it"). In those bytes the plugin registers the button:

    t.ui.registry.addToggleButton("nest",{text:"{{}}",tooltip:"Insert/edit nest",onAction:n(t)})

The plugin is what Ruby's own captured script registers: the `script_tinymce.js`
leaf in the captured script input
(fixtures/captured/all-script-assembled-input.js:12047, TinyMCE 5.10.7) adds
the nest plugin and puts `nest` in the Insert menu
(the same file: `decko.addNestPlugin(conf)` at :12115, the `addNestPlugin`
body at :12120-12124 with `conf.plugins += " nest"`, and the Insert menu at
:12126-12131, `items: "deckolink nest image | hr"`).

The port's own asset table registers the same leaf and the nest editor's own
scripts for the mod (src/card/mod-loader/mods/core-admin-runtime.ts:931-947,
the `tinymce_editor` group's `group: local` script list, which names
`script_tinymce.js` and the four `nest_editor*.js.coffee` leaves).

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The button's own
bytes (the `nest` toggle button, its `{{}}` text and its "Insert/edit nest"
tooltip) are the gem's own plugin bytes, which the port serves verbatim.
The plugin's registration in the TinyMCE config is Ruby's own captured
script. What is NOT capture-matched is the browser's live toolbar DOM: the
label the instrument found there is what the run measured.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round6-20261024/rows-r1/report.md

    source 75fe7d99, started 2026-10-24T02:15:36.530Z
    verdict: PASS
    evidence: {"nestButton":"Insert/edit nest"}

The toolbar carried the nest control, and its own label is the gem plugin's
tooltip, "Insert/edit nest".

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The card the journey opens is this run's own created RichText card
  (`Harness_richtext_mvlrp0g7`); the plugin bytes are the gem's own, served
  by the port for every card.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
