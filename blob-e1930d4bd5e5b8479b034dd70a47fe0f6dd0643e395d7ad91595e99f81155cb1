# Row mx-B-086, the upload create forms: the four legs re-verified green at the tranche-5 base

Row: `mx-B-086-cover-b-files-upload-a-file-an` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
[Family], bucket WORKING ON IT). Instrument-coverage-matrix action 84
(ACT-086), capability ids F1, F3, F5, F7: "upload a file, an image, and
upload as a member through the create forms". (The registry's static
extraction truncated this check name.)

This is tranche 5 of the family (branch
`port/matrix-journey-tranche5-20261021`, verified at commit `e22c388e`).
The ask for this row: verify the port side with a named runnable check, fix
genuine defects, report under `docs/reports/`, one commit per row.

## The named runnable check, run at this base

The row's own instrument, the `cover-b` module of the signed-in exercise,
driven over exactly this row's four declared capability ids:

    node tools/edge-signed-in-exercise.mjs --only cover-b \
      --case E8,F1,F3,F5,F7 \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche5-20261021/coverb-slice/report.md

The `E8` in the case list is the sibling row mx-B-081's capability id; both
rows ride the same module and one run served both, as tranches 3 and 4 also
did. Stated plainly, so the scale is not overclaimed: this is the cover-b
CASE SLICE at this row's own four checks, not the whole 242-check exercise.

Result: **8 / 8 checks passed**, 0 failed, 0 skipped by write mode. Run
record `.runtime/matrix-journey-tranche5-20261021/coverb-slice/report.md`
and its machine-readable twin `report.md.json`. Process exit code 1 by the
tool's own coverage rule (`tools/edge-signed-in-exercise.mjs:1505` exits
non-zero unless the FULL capability coverage completed, which a case slice
never does); every CHECK passed.

Run provenance, read from `report.md.json`: source
`e22c388e592df57d5b13872e345c5d298d7f4e35`, source files clean, bundle
SHA256 `b96ac0014d08fe0e5d2443a43d59830c0e97b3d8447c90df55af1906ef6de3cc`
rebuilt from this tree's own source, selection
`{only: "cover-b", case: "E8,F1,F3,F5,F7"}`, liveWalk the loopback stack
this run booted with write mode `full` (the local stack stages a throwaway
copy of the deck; nothing reaches the live site), two throwaway local
accounts, headless Chromium, a throwaway copy of the pinned 21676-card deck.

## The four legs, green

Evidence verbatim from `report.md.json`:

| leg | verdict | evidence |
|---|---|---|
| F1 a file can be uploaded through the File create form | PASS | writeStatus 200; the server answered with the `chosen-file` block carrying `card[action_id_of_cached_upload]`; afterStatus 200; stored true |
| F3 an image can be uploaded through the Image create form | PASS | writeStatus 200; same `chosen-file` block shape; afterStatus 200; stored true |
| F5 an empty file is refused | PASS | writeStatus 422; errorShown true; createdAnyway false |
| F7 a member can upload a file | PASS | writeStatus 200; afterStatus 200; stored true |

F5 is the leg that keeps the other three honest: the refusal is 422, the
error surface is shown, AND no card was created anyway.

The two cleanup legs and the final browser asset audit pass on the same run
(the owned local stack closed; 4 journey-created cards removed, 0 remaining
against a baseline of 53052; 1 browser context, 0 asset failures).

## The deck fingerprint is unchanged

    sha256sum C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3
    -> 6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78

The same hash the mx-190 receipts bind the port's whole count to, and the
same hash this tranche's mx-B-081 row measured.

## The row's state after this verification

- **No genuine defect surfaced on this row's surface.** All four legs are
  green at this base, this tranche changed no code on this row's path, so
  there was nothing to fix and no oracle-matched test to add. The commit for
  this row is this report alone.
- **The row stays WORKING ON IT, and the blocker is unchanged and named:**
  the DONE condition is the guarded deploy of the bundle to live, blocked on
  the operator arming the files-area pair. The port's upload path is not the
  500 the earlier live probe measured, because the live host serves a
  pre-bundle release. Nothing here deploys and nothing touches live.
- **DONE-eligibility is unchanged.** The verdict stays FAIL: the row cannot
  be paired as PASS with bucket DONE while its DONE condition stands on a
  guarded deploy no tranche may perform.