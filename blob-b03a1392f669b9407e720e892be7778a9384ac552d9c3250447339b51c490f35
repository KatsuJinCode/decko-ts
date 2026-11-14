# Row mx-B-081, the nest image editor: the port side re-verified green at the tranche-6 tip

Row: `mx-B-081-cover-b-edit-editor-buttons-li` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
[Family], bucket WORKING ON IT, verdict FAIL). Instrument-coverage-matrix
action 79 (ACT-081), check id `B-081`, capability id E8: "E8 the nest image
editor inserts a nest with view and size options".

This is tranche 6 of the family (branch
`port/matrix-journey-tranche6-20261021`, base `f583811d`, the tip the ask
named). The ask for this row: verify the port side with a named runnable
check, fix genuine defects, report under `docs/reports/`, one commit per
row.

## The named runnable check, run at this base

The row's own instrument, the `cover-b` module of the signed-in exercise,
driven over exactly this row's declared capability id:

    node tools/edge-signed-in-exercise.mjs --only cover-b --case E8,F1,F3,F5,F7 \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche6-20261021/coverb-slice-r2/report.md

The command was run with the case list `E8,F1,F3,F5,F7`, because the sibling
row mx-B-086's four legs ride the same module and the same run. What that
means for the scale of this row's evidence, stated plainly: this is the
cover-b CASE SLICE (the row's own check at the row's own surface), not the
whole 242-check exercise the family run measures.

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
  (rebuilt from this tree's own source). It is byte-identical to the hash
  tranches 4 and 5 recorded, and that is the expected result: this tranche
  changed no engine source, only the browser harness, one harness library,
  one test file and one vitest config line.
- selection `{only: "cover-b", case: "E8,F1,F3,F5,F7", diagnosticOnly: true}`
- the loopback stack this run booted, write mode `full` (the local stack
  stages a throwaway deck copy; nothing reaches the live site)
- a throwaway copy of the pinned 21676-card deck, two throwaway local
  accounts, headless Chromium
- completed `2026-10-21T21:57:11.161Z`

## The deck fingerprint is unchanged

    sha256sum C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3
    -> 6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78

The same hash the mx-190 receipts bind the port's whole count to, and the
same hash tranches 4 and 5 recorded.

## The row's leg, green

`E8 the nest image editor inserts a nest with view and size options`, PASS.
Its evidence, verbatim from `report.md.json`:

    actor admin (53041); image *logo (id 79)
    wire      expected harness_imgbtn_mvinihg8-1, actual harness_imgbtn_mvinihg8-1, resolves true
    preview   {{ *logo | view: titled; size: small }}
    insertedHasSnippet true, saveStatus 200, storedHasSnippet true, freshStatus 200
    src       the deck's configured asset host; decoded true

Every clause the row's contract names is witnessed: the inserted wire value
resolves to the image the dialog was given, the preview carries BOTH the
view and the size options, the write answers 200, the stored row carries
the snippet, a fresh read answers 200, and the served image decodes.

The two cleanup legs and the final browser asset audit pass on the same run
(the owned local stack closed; all 4 journey-created cards removed, 0
remaining against a baseline of 53052; 1 browser context, 0 asset
failures).

## The row's state after this verification

- **No genuine defect surfaced on this row's surface.** The row's own check
  is green at this base, and this tranche changed no code on this row's
  path, so there was nothing to fix and no oracle-matched test to add. The
  commit for this row is this report alone.
- **The row stays WORKING ON IT, and the blocker is unchanged and named:**
  the DONE condition is the guarded live deploy (the files-area pair armed
  by the operator, the deploy reaching live, and a re-run of this leg
  serving the resolved row). That is an operator account-side call. Nothing
  here deploys and nothing touches live.
- **DONE-eligibility is unchanged.** The verdict stays FAIL: the row cannot
  be paired as PASS with bucket DONE while its DONE condition stands on a
  live deploy no tranche may perform.
