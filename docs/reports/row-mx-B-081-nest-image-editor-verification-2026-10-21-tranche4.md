# Row mx-B-081 - the nest image editor: the port side re-verified green at the tranche-4 base

Row: `mx-B-081-cover-b-edit-editor-buttons-li` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
matrix-journey, bucket WORKING ON IT). Instrument-coverage-matrix action 79,
check B-081, capability E8: "the nest image editor inserts a nest with view
and size options".

This is tranche 4 of the family (branch
`port/matrix-journey-tranche4-20261021`, this row verified at commit
`1294f3ed`, the branch tip that carries the tranche-3 base `c18e3f44` and
this tranche's mx-155 following-junction work). The ask for the non-gap
rows: verify the port side with a named runnable check and fix genuine
defects.

## The named runnable check, run fresh at this base

The row's own instrument, the full signed-in exercise over the pinned deck
(a throwaway copy; the harness cleans its journey-created cards):

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche4-20261021/full-run/report.md

Run totals: **240 / 242 checks passed**; capability coverage 66 covered,
20 partial, 5 not covered, 3 out of scope (of 95). Run record: source
`1294f3edcc851b67fc245c53f70c40b1660cd6a3`, source files clean, bundle
SHA256 `b96ac0014d08fe0e5d2443a43d59830c0e97b3d8447c90df55af1906ef6de3cc`
(rebuilt from this tree's source), 21676-card deck copy, headless
Chromium.

The row's leg (report.md:137):

> cover-b. edit: editor buttons (link, nest image) (E6, E8) / E8 the nest
> image editor inserts a nest with view and size options - PASS -
> `{"actor":"admin","actorId":53041,"image":{"id":79,"name":"*logo"},
> "wire":{"expected":"harness_imgbtn_mvifyovt-1",
> "actual":"harness_imgbtn_mvifyovt-1","resolves":true},
> "preview":"{{ *logo / view: titled; size: small }}",
> "insertedHasSnippet":true,"saveStatus":20...}`

The inserted wire value resolves, the preview carries the view and size
options, and the write answers 200. The neighbouring E5 legs (the Nest
dialog's Apply: insertion and save persistence) pass in the same run.

## The run's two failures, neither this row's surface

1. **E11b** - "the +summary junction's own edit modal targets the junction
   card with its stored content" throws `database is not defined`. The
   committed INSTRUMENT's own defect, pre-existing at this base; the repair
   rides `fix/e11b-module-context-20261020`, which is not in this branch's
   base. Unchanged from the tranche-2 and tranche-3 runs.
2. **The 9.timings leg** - one page measured 4501 ms of server time
   (`/Harness_CB_History_mvig0ye2/board_act?act_id=115&`; db 6385 ms of
   statement time under the seat, render 4497 ms). A performance check,
   not a correctness failure; the same leg is red at this base in the
   tranche-2 and tranche-3 runs (4845 ms there).

## The row's state after this verification

- No genuine defect surfaced on the row's surface: E8 is green at the new
  base and needs no port change.
- The row's DONE condition is unchanged and is not port work: the guarded
  live deploy of the bundle that carries the multipart-upload fix to live
  96867, blocked on arming the files-area pair (operator account-side
  call; the roster row files-area-arming-decko-storage-pair-absent).
  Nothing in this tranche deploys and nothing touches live.

Receipt:
`docs/reports/receipts/row-mx-B-081-nest-image-editor-verification-2026-10-21-tranche4.json`.
