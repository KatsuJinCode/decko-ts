# Tranche 12: the six rows after the date-card modal are adjudicated, and the family grade holds at 253 of 253

Branch `port/matrix-round5-20261023` (lane copy
`C:/localProjects/decko-ts-matrix-round5-20261023`, created by the fleet's
lane-copy tool from `port/matrix-round4-20261023` tip `95bc1700`, with
`node_modules` shared through a junction), from the family's tip `95bc1700`
("The landing report states the disk cost in both directions, and names the
residue").

The ask had three parts. The next SIX unadjudicated matrix rows in roster
item order beyond mx-B-012 are adjudicated, one commit each, with
oracle-matched or named-instrument evidence. The whole-family exercise runs
once at this branch's tip and the grade line is reported. The touched
surface's battery runs green.

## 0. What the ask asked, and what this tranche found

1. **The next six unadjudicated rows.** TAKEN, one commit each, with
   oracle-matched or named-instrument evidence. Section 2.
2. **The whole-family exercise at the tip.** DONE; the grade line is
   **253 of 253 checks passed** - the round-four baseline holds, no
   regression to name. Section 4.
3. **The battery.** The instrument's own test battery and the oracle pins
   the receipts cite all pass. Section 3.

## 1. The selection rule, stated so a reader can check it

The roster is the row ledger for this family
(`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
and the roster's own item order is the family's row-id order (the same rule
the round-three and round-four tranches used to pick their batches). The
family's own receipts adjudicated twenty-two rows before this tranche:
mx-131, mx-143, mx-154, mx-155, mx-159, mx-190, mx-B-001 through mx-B-012,
mx-B-064, mx-B-081, mx-B-086 and mx-B-110. The next six rows in that order
that no family receipt had adjudicated (no `row-mx-B-01N` receipt exists in
the tree for them, and none of the sixteen-plus-six named above reaches
them) are mx-B-013, mx-B-014, mx-B-015, mx-B-016, mx-B-017 and mx-B-018 -
roster indices 562 through 567, the four remaining "3. edit a Date card"
rows and the first two "4. edit a RichText card (TinyMCE, nest dialog, link
button)" rows.

## 2. The six rows this tranche closed

| row | the row | the instrument | the oracle | the verdict |
|---|---|---|---|---|
| mx-B-013 | content field is a date picker showing the stored date | the date-card group, the date-picker record (basic-lifecycle-journeys.mjs:21-35) | the gem's calendar_input bytes (card-mod-edit.ts:838-843, cited from card-mod-date set/all/calendar.rb:9-14); the stored-date equality is the instrument's own | PASS |
| mx-B-014 | saving the new date answers a write (Save) | the date-card group, the save record (basic-lifecycle-journeys.mjs:40) + saveEditForm (edge-signed-in-exercise.mjs:600-630) | arms 136 and 388 (the edit form's action and the modal footer's submit); the update route (write-routes.ts:16-17, :926-933) | PASS |
| mx-B-015 | the page shows the new date (long form) | the date-card group, the long-form record (basic-lifecycle-journeys.mjs:41-42) | arm 127 (Ruby's date core, "January 11, 2026"); formatDateCore (views.ts:2388-2399), pinned by card-mod-date.test.ts:352-360 | PASS |
| mx-B-016 | the original date is restored afterwards (long form) | the date-card group, the restore record (basic-lifecycle-journeys.mjs:43-48) | arms 127 and 136 (the long form and the update route); the restore round trip is the instrument's own | PASS |
| mx-B-017 | create a RichText card via /new/RichText and land on it | the RichText group, the create record (edge-signed-in-exercise.mjs:797-807) | arm 163 (the new form's action "/card/create" and its submit); createFormShell (mod-form-substrate.ts:280-300); the create route (write-routes.ts:12, :17) | PASS |
| mx-B-018 | RichText edit opens as a modal | the RichText group, the modal record (edge-signed-in-exercise.mjs:808-810) | arms 392, 380 and 136 (the modal container, the close link, the edit form); closeModalLink (card-mod-edit.ts:1497-1499) | PASS |

Each row's receipt is its own file under `docs/reports/`
(`row-mx-B-013-date-card-group-2026-10-23.md` through
`row-mx-B-018-richtext-group-2026-10-23.md`), and each row's commit is its
own commit with an explicit pathspec (7384e307, e7dc00de, d17ba3f4,
f34010b7, 02dac899, fee8f5c3). Every receipt names the run it was written
from (the measurement run at `95bc1700`, started 2026-10-23T19:14:55.935Z,
completed 2026-10-23T19:40:18.779Z, the source files clean) with its
evidence.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, per row, stated plainly in each
receipt. The long form, the edit form's action, the modal's close link, the
modal container and the create form's action are Ruby's own bytes, and the
port renders each of them (src/card/render/views.ts:2388-2399,
src/card/mod-loader/mods/card-mod-edit.ts:1497-1499 and :838-843,
src/card/mod-loader/mod-form-substrate.ts:280-300). The date picker's
input[type=date] is cited from the card-mod-date gem's calendar_input
through the port's own source citation: NO committed capture arm carries a
date card's edit form (the capture deck's probe card is a RichText card and
no fixture's html carries type="date"), and the receipts say exactly that.
The write statuses, the stored-date equality against the run's own database
row, the landed URL and the modal count are the instrument's and the
harness's own named facts.

## 3. The battery the touched surface carries

The touched files are the six receipts; the surface they stand on is the
named instrument and the oracle contracts they cite. The instrument's own
battery, and the pins the receipts cite, all pass in this lane:

    node --test "tools/edge-signed-in-exercise/test/*.test.mjs"
    221 tests, 219 pass, 0 fail, 2 skipped (the opt-in live legs)

    node --test tools/edge-signed-in-exercise/test/junction-edit-modal.oracle.test.mjs
    8 tests, 8 pass, 0 fail

    node --test tools/edge-signed-in-exercise/test/server-time-budget.test.mjs
    23 tests, 23 pass, 0 fail

    npx vitest run tests/card/mod-loader/card-mod-date.test.ts tests/card/render/date-cardtype-view.test.ts
    2 files, 48 tests, 48 pass, 0 fail

## 4. The run at this branch's tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round5-20261023/final/report.md

    source fee8f5c3, started 2026-10-23T19:50:56.104Z,
    completed 2026-10-23T20:13:09.226Z, the source files clean
    Result: 253 / 253 passed, 0 failed, 0 skipped by write mode

**THE FAMILY GRADE LINE: 253 of 253 checks passed.** The round-four
baseline holds; no regression to name. The capability coverage the family's
own grader reads is 70 covered / 20 partial / 1 not covered / 1 disabled
upstream / 3 out of scope - the same count the round-three and round-four
runs read.

**THE TIMINGS LEG IS GREEN.**

    9. timings / no signed-in page exceeded 3 s of server time   PASS  {"slow":[]}
    9. timings / no save exceeded 3 s of server time            PASS  {"slow":[]}
    9. timings / no request returned a 5xx                      PASS  {"fiveHundreds":[]}

    slowest raw server total (before the CPU adjustment)   2526 ms
    engine requests labelled                               3972

## 5. What this tranche does NOT claim

- **The roster was not folded.** It lives in another repository
  (`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
  and this lane did not write to it, as the round-three and round-four
  tranches did not. The six rows' receipts add the family's own evidence;
  they do not change any row's DONE condition.
- **The live deployment.** No live request was made by this lane, and no
  row's live instrument was exercised here. Nothing deploys on the decko
  side; the branch is a candidate, and promotion is the operator's yes.
- **The capture-matched status of the date picker.** The input[type=date]
  surface is cited from the gem source the port documents, not
  capture-matched; the fixture set holds no date card's edit form. Named
  plainly in the mx-B-013 receipt.
- **Nothing here deploys and nothing touches live.**

## 6. The disk cost, in both directions, and the residue

The lane copy added 251,834,563 bytes at creation (the lane-copy receipt;
`node_modules` rides a junction to the family's shared install, so the
checkout is the cost). The untracked artifacts this lane's two runs
produced: `.runtime/` 11,813,089 bytes (the two runs' reports, run records
and per-request capture evidence the receipts name), `dist/` 14,435,120
bytes (the engine distribution the exercise builds; untracked, rebuilt on
demand), `.test-results/` 13,602 bytes (the battery's JUnit record). Bytes
removed by this lane: none; no tracked file was modified, and no file was
deleted. The residue named above is evidence the receipts reference, kept.
