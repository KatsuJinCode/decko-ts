# Tranche 13: the six rows after the RichText modal are adjudicated, and the family grade holds at 253 of 253

Branch `port/matrix-round6-20261024` (lane copy
`C:/localProjects/decko-ts-matrix-round6-20261024`, created by the
diskSteward worktree tool from `port/matrix-round5-20261023` tip
`75fe7d99`, with `node_modules` riding a junction to the family's shared
install), from the family's tip `75fe7d99` ("The whole-family exercise at
this branch's tip: 253 of 253, the six rows after the date-card modal
adjudicated, the battery green").

The ask had three parts. The next SIX unadjudicated matrix rows in roster
item order beyond mx-B-018 are adjudicated, one commit each, with
oracle-matched or named-instrument evidence. The whole-family exercise runs
once at this branch's final commit and the grade line is reported. The
touched surface's battery runs green.

## 0. What the ask asked, and what this tranche found

1. **The next six unadjudicated rows.** TAKEN, one commit each, with
   oracle-matched or named-instrument evidence. Section 2.
2. **The whole-family exercise at the final commit.** DONE; the grade line is
   **253 of 253 checks passed** - the round-four and round-five baseline
   holds, no regression to name. The certification run's source is
   `f41b7eb8`, the commit that carries this report and the six row commits.
   Section 4.
3. **The battery.** The instrument's own test battery and the oracle pins
   the receipts cite all pass in this lane. Section 3.

## 1. The selection rule, stated so a reader can check it

The roster is the row ledger for this family
(`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
and the roster's own item order is the family's row-id order (the same rule
the round-three, round-four and round-five tranches used to pick their
batches).

The rule was checked against the PRE-STATE, not against the tree as this
tranche left it: the tree at the family's tip `75fe7d99`, read with
`git ls-tree` and `git show`. The roster's family for this lane (family
[Family]) holds 190 items; 27 of them already have a family receipt naming
their exact roster id in that tree; the first UNCOVERED items, in the
roster's own item order, are

    mx-B-019-4-edit-a-richtext-card-tinymce
    mx-B-020-4-edit-a-richtext-card-tinymce
    mx-B-021-4-edit-a-richtext-card-tinymce
    mx-B-022-4-edit-a-richtext-card-tinymce
    mx-B-023-4-edit-a-richtext-card-tinymce
    mx-B-024-4-edit-a-richtext-card-tinymce
    mx-B-025-5-create-a-card-every-way-the-   (the seventh, not taken here)

So the next six unadjudicated rows are **mx-B-019, mx-B-020, mx-B-021,
mx-B-022, mx-B-023 and mx-B-024** - roster indices 568 through 573, the six
rows after the RichText modal row, all of them in the "4. edit a RichText
card (TinyMCE, nest dialog, link button)" group.

The rows already adjudicated when this tranche started are the ones the
family's own receipts name: mx-131, mx-143, mx-154, mx-155, mx-159, mx-190,
mx-B-001 through mx-B-018, mx-B-064, mx-B-081, mx-B-086 and mx-B-110.

## 2. The six rows this tranche closed

| row | the row | the instrument | the oracle | the verdict |
|---|---|---|---|---|
| mx-B-019 | TinyMCE loads for the RichText editor | the RichText group, the editor record (edge-signed-in-exercise.mjs:823) | Ruby's own editor input bytes (the `tinymce-textarea d0-card-content form-control` textarea, captured in edit-views.json); the port renders them at card-mod-edit.ts:836 and :871 | PASS |
| mx-B-020 | saving the RichText card persists (Save answers a write) | the RichText group, the save record (edge-signed-in-exercise.mjs:832) + saveEditForm (:600-630) | arms 136 and 388 (the edit form's action and the modal footer's submit); the update route (write-routes.ts:16-17, :926-933) | PASS |
| mx-B-021 | the saved RichText content is on the page | the RichText group, the content record (edge-signed-in-exercise.mjs:834) | arm 213 (Ruby's base content view, graded-identical); the port's contentView (views.ts:607) | PASS |
| mx-B-022 | the nest ({{}}) button is present in the TinyMCE toolbar | the RichText group, the toolbar record (edge-signed-in-exercise.mjs:848) | the gem's own nest plugin bytes (`addToggleButton("nest",{text:"{{}}",tooltip:"Insert/edit nest"})`, ported verbatim at bunny-edge-tinymce-nest-plugin.ts:5); Ruby's captured `script_tinymce.js` leaf (all-script-assembled-input.js:12047) registers the plugin | PASS |
| mx-B-023 | the {{}} button opens the Nest dialog | the RichText group, the dialog record (edge-signed-in-exercise.mjs:862) | arms 551 and 548 (the nest editor view and its modal sibling, both graded-identical); the port renders the same container and field group (card-mod-tinymce_editor.ts:1029, :1507-1525) | PASS |
| mx-B-024 | typing a card name returns suggestions (/*all+by name.json?view=name_match&term=...) | the RichText group, the suggestion record (edge-signed-in-exercise.mjs:875) | arm 551's `_nest-name` field with `data-options-card="*all+by name"`; the port's port of Ruby's `complete_or_match_search` (vm-staging-server.mjs:2940-2961, the edge handler at bunny-edge-engine-handler.ts:557-570); the port's `name_match` CQL (src/cql/parser.ts:552, :833-840) | PASS |

Each row's receipt is its own file under `docs/reports/`
(`row-mx-B-019-richtext-group-2026-10-24.md` through
`row-mx-B-024-richtext-group-2026-10-24.md`), and each row's commit is its
own commit with an explicit pathspec (91418bb8, 8b9de2a1, 8f07fa90,
c5ccf16d, 430817ae, 3399ee5b). Every receipt names the run it was written
from (the measurement run at `75fe7d99`, started 2026-10-24T02:15:36.530Z,
completed 2026-10-24T02:41:22.957Z, the source files clean) with its
evidence.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, per row, stated plainly in each
receipt. The editor input's bytes, the edit form's action, the modal
footer's submit, the base content view, the nest editor's container and its
`_nest-name` field are Ruby's own, capture-matched in the fixtures the
receipts cite, and the port renders each of them. The TinyMCE library and
the nest toolbar plugin are the gem's own bytes, which the port serves with
one named substitution its own file documents (the port's own asset table
registers the same script leaves, core-admin-runtime.ts:929-948). What is
NOT capture-matched, and is said so in each receipt, is the browser's live
state: the initialized editor, the toolbar's own label, the visible
dialog and its field list, the JSON suggestion array and the write statuses
are what the run measured.

One capture arm is graded-DIFFERS and the mx-B-024 receipt says so in
plain words: probe-view:517:name_match@set/abstract/0_search/views.rb
(tools/compat-report/graded-probes.json:7011-7015, and the diff line at
:162). On the capture deck's probe card BOTH sides answer an error, so that
arm cannot show the suggestion contract. The field's bytes and the port's
own port of `complete_or_match_search` are what that receipt pins.

## 3. The battery the touched surface carries

The touched files are the six receipts; the surface they stand on is the
named instrument and the oracle contracts they cite. The instrument's own
battery, and the pins the receipts cite, all pass in this lane:

    node --test "tools/edge-signed-in-exercise/test/*.test.mjs"
    221 tests, 219 pass, 0 fail, 2 skipped (the opt-in live legs)

    node --test tools/edge-signed-in-exercise/test/junction-edit-modal.oracle.test.mjs
    8 tests, 8 pass, 0 fail

    node --test tools/edge-signed-in-exercise/test/search-as-you-type-suggestions.test.mjs
    11 tests, 10 pass, 0 fail, 1 skipped

    npx vitest run tests/card/mod-loader/card-mod-tinymce_editor.test.ts \
      tests/card/mod-loader/card-mod-tinymce-editor-views.test.ts \
      tests/card/mod-loader/card-mod-tinymce-editor-harness-probe.test.ts \
      tests/card/render/mod-tinymce-style-script-group-pins.test.ts
    4 files, 57 tests, 57 pass, 0 fail

    npx vitest run tests/card/mod-loader/card-mod-edit.test.ts \
      tests/card/mod-loader/card-mod-edit-forms.test.ts \
      tests/card/mod-loader/card-mod-edit-views.test.ts \
      tests/card/mod-loader/card-mod-search.test.ts
    4 files, 67 tests, 67 pass, 0 fail

## 4. The whole-family exercise

Two whole-family runs are recorded in this lane, on the same deck and with
the same tool.

### 4a. The run the six receipts cite

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round6-20261024/rows-r1/report.md

    source 75fe7d99, started 2026-10-24T02:15:36.530Z,
    completed 2026-10-24T02:41:22.957Z, the source files clean
    Result: 253 / 253 passed, 0 failed, 0 skipped by write mode

**THE FAMILY GRADE LINE: 253 of 253 checks passed.** The round-four and
round-five baseline holds; no regression to name. The capability coverage the
family's own grader reads is 70 covered / 20 partial / 1 not covered / 1
disabled upstream / 3 out of scope - the same count the round-three,
round-four and round-five runs read.

**THE TIMINGS LEG IS GREEN.**

    9. timings / no signed-in page exceeded 3 s of server time   PASS  {"slow":[]}
    9. timings / no save exceeded 3 s of server time            PASS  {"slow":[]}
    9. timings / no request returned a 5xx                      PASS  {"fiveHundreds":[]}

    engine requests observed                                 3751

The tool exits 1 on this run, and the round-five run's own report carries
the identical closing line ("Complete capability acceptance: incomplete or
failed. Unrun capabilities are never credited."), so this is the tool's
standing behaviour and not a check failure: its exit is
`failures.length === 0 && !coverageIncomplete`
(tools/edge-signed-in-exercise.mjs:1651), and `coverageIncomplete` is true
whenever any capability is partial, not covered or out of scope. The CHECK
grade is 253 of 253 with zero failures.

### 4b. The certification run at this branch's final commit

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round6-20261024/final/report.md

    source f41b7eb8 (the commit that carries this report and the six row
    commits), started 2026-10-24T02:49:51.823Z,
    completed 2026-10-24T03:09:39.469Z, the source files clean
    Result: 253 / 253 passed, 0 failed, 0 skipped by write mode

**THE FAMILY GRADE LINE AT THIS BRANCH'S FINAL COMMIT: 253 of 253 checks
passed.** The 253-of-253 baseline holds; there is no regression to name and
nothing to fix. The capability coverage is 70 covered / 20 partial / 1 not
covered / 1 disabled upstream / 3 out of scope, the same count the
round-three, round-four and round-five runs read. The timings leg is green
here as well (no signed-in page over 3 s of server time, no save over 3 s, no
5xx), and this run observed 3,938 engine requests.

The run exits 1 for the same standing reason as run 4a, on the tool's
coverage-completeness signal, not on a check failure. The source the run
names is the commit that carries this report and the six row commits
(`f41b7eb8`); the one commit that follows it adds this run's result to
this report's text and changes no code, so the tree the run exercised is the
branch's tip tree apart from this paragraph.

## 5. What this tranche does NOT claim

- **The roster was not folded.** It lives in another repository
  (`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
  and this lane did not write to it, as the round-three, round-four and
  round-five tranches did not. The six rows' receipts add the family's own
  evidence; they do not change any row's DONE condition.
- **The live deployment.** No live request was made by this lane, and no
  row's live instrument was exercised here. Nothing deploys on the decko
  side; the branch is a candidate, and promotion is the operator's yes.
- **The capture-matched status of the name_match view.** Probe 517 is
  graded-differs, and the mx-B-024 receipt says exactly that, naming what it
  pins instead.
- **Nothing here deploys and nothing touches live.**

## 6. The disk cost, in both directions, and the residue

The lane copy added 277,054,333 bytes at creation (the diskSteward
worktree receipt; `node_modules` rides a junction to the family's shared
install, so the checkout is the cost). The untracked artifacts this lane's
two runs and its battery produced, measured at the end of the lane:
`.runtime/` 23,378,579 bytes (both runs' reports, run records and
per-request capture evidence the receipts name), `dist/` 14,435,120 bytes
(the engine distribution the exercise builds; untracked, rebuilt on demand),
`deploy/dist/` 18,245,207 bytes (the deployed bundle the exercise rebuilds
from source; untracked, rebuilt on demand), `.test-results/` 18,595 bytes
(the battery's JUnit record), `tmp/` 32,692 bytes. The tracked tree grew
from 251,867,575 bytes to 251,896,015 bytes with the six receipts, plus
this report. Bytes removed by this lane: the probe run's own partial output
under `.runtime/signed-in-exercise-round6-20261024/rows-r1/`, which the
exercise refuses to overwrite and which this lane deleted before the
measured run; no tracked file was deleted, and no other file was deleted.
The residue named above is evidence the receipts reference, kept.
