# Row mx-B-081 - the nest image editor (E8): port side verified, live side blocked

Row: `mx-B-081-cover-b-edit-editor-buttons-li` in the completeness roster
(`docs/registry/completeness-roster.json`, family matrix-journey, bucket
WORKING ON IT at roster build 2026-10-20T04:51:22.800Z).
Check id `B-081`; surface "cover-b. edit: editor buttons (link, nest image)
(E6, E8)"; the action is "E8 the nest image editor inserts a nest with view
and size options".

## What the row asked for

The row's blocker text says the port side is unchanged ("local basis
unchanged: grind tranche-1 cover-b E8 PASS at d8050251") and that the
remaining work is on the deployed side: tonight's signed-in multipart
`card[image]` create answered 500 with a zero-byte body at live 96867
release 1194026, the fix sits in the staging-only bundle 45d1ead3
(staging 96895, release 1196260), and the guarded live deploy is blocked on
the operator arming the files-area pair.

## The measurement this lane ran

A fresh local run of the same instrument the row's basis names, on this
branch's base:

- command: `node tools/edge-signed-in-exercise.mjs --out
  .runtime/matrix-journey-tranche-20261020/full-run-before/report.md`
- source commit `8268a1459090bac925cf7d82131f585650f72c20` (source files
  clean), bundle SHA256
  `c75e149eceaf074a4fb1cc58b274b42470cfe0df869eb87210e50f7ed35bc378`
- local stack, a throwaway copy of the pinned deck (21676 cards), two
  throwaway accounts, headless Chromium
- result: **240 / 242 passed**, 2 failed

The row's own leg, verbatim from the run report:

    cover-b. edit: editor buttons (link, nest image) (E6, E8) / E8 the nest
    image editor inserts a nest with view and size options | PASS |
    {"actor":"admin","actorId":53041,"image":{"id":79,"name":"*logo"},
     "wire":{"expected":"harness_imgbtn_mvhs1yjd-1",
     "actual":"harness_imgbtn_mvhs1yjd-1","resolves":true},
     "preview":"{{ *logo / view: titled; size: small }}",
     "insertedHasSnippet":true,"saveStatus":20...

The editor inserts the nest, the inserted snippet carries the view and size
options, and the write answers 200. The port side of this row matches the
source: the E8 leg PASSES on this tree.

The run's two failures are named, and neither is this row's surface:

- `checks module catalog-edit-create (checks-catalog-edit-create.mjs) / E11b
  the +summary junction's own edit modal targets the junction card with its
  stored content: {"threw":"database is not defined"}` - a pre-existing red
  at this base; the repair rides branch `fix/e11b-module-context-20261020`
  ("bind database/page/visit/record from ctx"), which is not in this
  branch's base.
- `9. timings / no signed-in page exceeded 3 s of server time` - a
  performance check on a local run (one page measured 3233 ms), not a
  correctness failure of this row.

The final browser asset audit in the same run: PASS ("no script,
stylesheet, font or image failed across the exercised browser contexts").

## Disposition

- The port side of row `mx-B-081` is **verified matching** at this branch's
  base by a fresh run of the named instrument (the E8 leg above). The
  renderer's nest-image path, the wire value, the preview and the write all
  answer as the source does.
- The remaining work on this row is **not** port work: it is the guarded
  deploy of the bundle that carries the multipart-upload fix to live
  96867, and that deploy is blocked on the operator arming the files-area
  pair. Nothing in this lane deploys, and the arming is an account-side
  operator call (roster row `files-area-arming-decko-storage-pair-absent`).
- Named remainder, by path:
  - live multipart probe receipt:
    `C:/localProjects/brandonDojoTech/tmp/live-reprobe-20261020/receipt-1-multipart-uploads-act085-act080.json`
  - deploy-night verdict (live refused, staging deployed):
    `C:/localProjects/decko-ts-release-lead/tmp/deploy-night-20261020/verdict-2026-10-20-live-refused-staging-files-area-pair-not-armed.json`
  - staging deploy receipt:
    `C:/localProjects/decko-ts-release-lead/tmp/deploy-night-20261020/receipt-staging-96895.deploy-night-20261020.json`
- The row's own DONE condition therefore stays open on the deploy, and the
  row's bucket is unchanged by this commit. What this commit adds is the
  fresh port-side measurement at this base, which the row's text recorded
  only as a carried-forward basis.

## Battery

- `node tools/edge-signed-in-exercise.mjs` (the run above): 240 / 242
  passed; the two failures named above and attributed.
- The engine source is untouched by this commit.
