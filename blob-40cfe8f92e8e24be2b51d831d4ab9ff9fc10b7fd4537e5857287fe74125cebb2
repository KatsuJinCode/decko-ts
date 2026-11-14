# Row mx-B-086, the upload create forms: the four legs re-verified green at the tranche-6 tip

Row: `mx-B-086-cover-b-files-upload-a-file-an` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
[Family], bucket WORKING ON IT, verdict FAIL). Instrument-coverage-matrix
action 84 (ACT-085), check id `B-086`, capability ids F1, F3, F5, F7: "F1
upload a file, F3 upload an image, F5 an empty file is refused, F7 a member
uploads a file".

This is tranche 6 of the family (branch
`port/matrix-journey-tranche6-20261021`, base `f583811d`, the tip the ask
named). The ask for this row: verify the port side with a named runnable
check, fix genuine defects, report under `docs/reports/`, one commit per
row.

## The named runnable check, run at this base

The row's own instrument, the `cover-b` module of the signed-in exercise,
driven over this row's four declared capability ids on the same run that
serves the sibling row mx-B-081's leg:

    node tools/edge-signed-in-exercise.mjs --only cover-b --case E8,F1,F3,F5,F7 \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche6-20261021/coverb-slice-r2/report.md

The E8 in the case list is the sibling row's capability id, and one run
served both rows' legs. What that means for the scale of this row's
evidence, stated plainly: this is the cover-b CASE SLICE at this row's own
four checks, not the whole 242-check exercise the family run measures.

**Result: 8 / 8 checks passed, 0 failed.** The run record is
`.runtime/matrix-journey-tranche6-20261021/coverb-slice-r2/report.md` and
its machine-readable twin `report.md.json`. The process exit code is **1**,
by the tool's own rule and not by any failure:
`tools/edge-signed-in-exercise.mjs:1503` exits 0 only when no check failed
AND the capability coverage is complete, and a case slice never completes
it. The run printed "capability coverage: 3 covered, 1 partial, 87 not
covered, 3 out of scope (of 95)", and every check in the slice passed. The
exit code was captured in this lane's own command line, not inferred.

Run provenance, read from `report.md.json`:

- source `8f2ca2c27506cd83f7e8d4798d6c49cfaa6e2da8` (this tranche's tip
  at the time of the run), source files clean
- bundle SHA256
  `b96ac0014d08fe0e5d2443a43d59830c0e97b3d8447c90df55af1906ef6de3cc`
  (rebuilt from this tree's own source; byte-identical to the hash tranches
  4 and 5 recorded, as expected, because this tranche changed no engine
  source)
- selection `{only: "cover-b", case: "E8,F1,F3,F5,F7", diagnosticOnly: true}`
- the loopback stack this run booted, write mode `full` (the local stack
  stages a throwaway deck copy; nothing reaches the live site)
- a throwaway copy of the pinned 21676-card deck, two throwaway local
  accounts, headless Chromium
- completed `2026-10-21T21:57:11.161Z`

## The deck fingerprint is unchanged

    sha256sum C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3
    -> 6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78

## The four legs, green

Verbatim from `report.md.json`:

- **F1 a file can be uploaded through the File create form**, PASS.
  `{"writeStatus":200, "serverSaid":"<div class='chosen-file'> <input
  name='card[action_id_of_cached_upload]' type='hidden' value='3'> ...",
  "afterStatus":200, "stored":true}`
- **F3 an image can be uploaded through the Image create form**, PASS. The
  same shape, the cached upload id `5`, `afterStatus` 200, `stored` true.
- **F5 an empty file is refused**, PASS.
  `{"writeStatus":422, "errorShown":true, "createdAnyway":false}` - the leg
  that keeps the other three honest: the write is refused, the error
  surface is shown, and no card is created anyway.
- **F7 a member can upload a file**, PASS. The same chosen-file block
  shape, the cached upload id `7`, `afterStatus` 200, `stored` true.

The two cleanup legs and the final browser asset audit pass on the same run
(the owned local stack closed; all 4 journey-created cards removed, 0
remaining against a baseline of 53052; 1 browser context, 0 asset
failures).

## The row's state after this verification

- **No genuine defect surfaced on the row's surfaces.** The port's upload
  path is not the 500 the 2026-10-20 live probe measured, because that 500
  is the live host serving a pre-bundle release. This tranche changed no
  code on this row's path, so there was nothing to fix and no
  oracle-matched test to add. The commit for this row is this report alone.
- **The row stays WORKING ON IT, and the blocker is unchanged and named:**
  the DONE condition is the guarded deploy of bundle 45d1ead3 to live
  96867, blocked on arming the files-area pair (an operator account-side
  call). Nothing in this tranche deploys and nothing touches live.
- **DONE-eligibility is unchanged.** The verdict stays FAIL: the row cannot
  be paired as PASS with bucket DONE while its DONE condition stands on a
  live deploy no tranche may perform.
