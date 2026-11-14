# Row mx-B-081 - the nest image editor: the port side re-verified green at the tranche-3 base

Row: `mx-B-081-cover-b-edit-editor-buttons-li` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
matrix-journey, bucket WORKING ON IT). Instrument-coverage-matrix action 79,
check B-081, capability E8: "the nest image editor inserts a nest with view
and size options".

This is tranche 3 of the family (branch
`port/matrix-journey-tranche-20261020`, this row verified at commit
`51356bd4`, the tip that carries the mx-155 follow-view work and the mx-190
re-verification). The ask for the non-gap rows: verify the port side with a
named runnable check and fix genuine defects.

## The named runnable check, run at this base

The row's own instrument, the full signed-in exercise over the pinned deck
(a throwaway copy; the harness cleans its journey-created cards):

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche3-20261021/full-run/report.md

Run totals: **240 / 242 checks passed**; capability coverage 66 covered,
20 partial, 5 not covered, 3 out of scope (of 95).

The row's leg (report.md:137):

> cover-b. edit: editor buttons (link, nest image) (E6, E8) / E8 the nest
> image editor inserts a nest with view and size options - PASS -
> `{"actor":"admin","actorId":53041,"image":{"id":79,"name":"*logo"},
> "wire":{"expected":"harness_imgbtn_mvibqomn-1",
> "actual":"harness_imgbtn_mvibqomn-1","resolves":true},
> "preview":"{{ *logo / view: titled; size: small }}",
> "insertedHasSnippet":true,"saveStatus":200,...}`

The inserted wire value resolves, the preview carries the view and size
options, and the write answers 200. The neighbouring E5 legs (the Nest
dialog's Apply: insertion and save persistence) pass in the same run.

## The run's two failures, neither this row's surface

1. **E11b** - "the +summary junction's own edit modal targets the junction
   card with its stored content" throws `database is not defined`. The
   committed INSTRUMENT's own defect, pre-existing at this base; the repair
   rides `fix/e11b-module-context-20261020`, which is not in this branch's
   base. Unchanged from the tranche-2 runs.
2. **The 9.timings leg** - one page measured 4845 ms of server time
   (`/Harness_CB_History_mvibsy8x/board_act?act_id=115`). A performance
   check, not a correctness failure; the same leg is red at this base in
   the tranche-2 runs.

## The row's state after this verification

- No genuine defect surfaced on the row's surface: E8 is green at the new
  base and needs no port change.
- The row's DONE condition is unchanged and is not port work: the guarded
  live deploy of the bundle that carries the multipart-upload fix to live
  96867, blocked on arming the files-area pair (operator account-side
  call; the roster row files-area-arming-decko-storage-pair-absent).
  Nothing in this tranche deploys and nothing touches live.

Receipt: `docs/reports/receipts/row-mx-B-081-nest-image-editor-verification-2026-10-21-tranche3.json`.
