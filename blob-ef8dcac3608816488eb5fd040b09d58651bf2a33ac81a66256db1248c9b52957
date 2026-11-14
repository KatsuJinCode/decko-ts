# Row mx-B-086 - upload a file, an image, and upload as a member (F1/F3/F7): port side verified, live side blocked

Row: `mx-B-086-cover-b-files-upload-a-file-an` in the completeness roster
(`docs/registry/completeness-roster.json`, family matrix-journey, bucket
WORKING ON IT at roster build 2026-10-20T04:51:22.800Z).
Check id `B-086`; surface "cover-b. files: upload a file, an image, empty
refused, member (F1, F3, F5, F7)"; the action is "F1/F3/F7 upload a file,
an image, and upload as a member through the create forms".

## What the row asked for

The row's blocker text says the row takes the live upload probe's verdict,
and the probe is not green: deploy-night 2026-10-20 left live 96867 on
pre-bundle release 1194026 (the live deploy was refused - the files-area
pair was never armed), and tonight's signed-in multipart probe against the
edge answered 500 with a zero-byte body for both `card[file]` (.txt, 44
bytes) and `card[image]` (1x1 PNG), creating no card. The upload fix sits
in the staging-only bundle 45d1ead3 (staging 96895, release 1196260, four
probes 200, deployed-code hash verified). The missing piece is the guarded
live deploy, blocked on the operator arming the files-area pair.

The port side was carried as "local basis unchanged: grind tranche-1
cover-b F1/F3/F7 PASS at d8050251".

## The measurement this lane ran

A fresh local run of the same instrument on this branch's base:

- command: `node tools/edge-signed-in-exercise.mjs --out
  .runtime/matrix-journey-tranche-20261020/full-run-before/report.md`
- source commit `8268a1459090bac925cf7d82131f585650f72c20` (source files
  clean), bundle SHA256
  `c75e149eceaf074a4fb1cc58b274b42470cfe0df869eb87210e50f7ed35bc378`
- local stack, a throwaway copy of the pinned deck (21676 cards), two
  throwaway accounts (one with the administrator role, one with none),
  headless Chromium
- result: **240 / 242 passed**, 2 failed

The row's own legs, verbatim from the run report:

    cover-b. files: upload a file, an image, empty refused, member
    (F1, F3, F5, F7) / F1 a file can be uploaded through the File create
    form | PASS | {"writeStatus":200,"serverSaid":"<div class='chosen-file'>
    <input name='card[action_id_of_cached_upload]' type='hidden' value='139'>
    ...","afterStatus":200,"stored":true}

    cover-b. files: upload a file, an image, empty refused, member
    (F1, F3, F5, F7) / F3 an image can be uploaded through the Image create
    form | PASS | {"writeStatus":200,...,"value='141'...","afterStatus":200,
    "stored":true}

    cover-b. files: upload a file, an image, empty refused, member
    (F1, F3, F5, F7) / F7 a member can upload a file | PASS |
    {"writeStatus":200,...,"value='143'...","afterStatus":200,"stored":true}

The neighbouring leg F5 (an empty file is refused, 422, no card created)
also PASSES, and the upload-image-change module's own legs (F6 store and
serve, F6 replace, F6 resubmit unchanged, F9 the standalone image page
decodes, F2 removing a pending upload) all PASS in the same run.

So the port side of this row matches the source: the create forms upload,
the write answers 200, and the stored row is served back. The port's
upload path is not the 500 the live probe measured - that 500 is the live
host serving a pre-bundle release.

## Disposition

- The port side of row `mx-B-086` is **verified matching** at this branch's
  base by a fresh run of the named instrument (F1, F3, F5, F7 above).
- The remainder is **not** port work: the guarded deploy of bundle
  45d1ead3 to live 96867, blocked on the operator arming the files-area
  pair. Nothing in this lane deploys, and the arming is an account-side
  operator call (roster row `files-area-arming-decko-storage-pair-absent`).
- Named remainder, by path:
  - live multipart probe receipt:
    `C:/localProjects/brandonDojoTech/tmp/live-reprobe-20261020/receipt-1-multipart-uploads-act085-act080.json`
  - deploy-night verdict (live refused, staging deployed):
    `C:/localProjects/decko-ts-release-lead/tmp/deploy-night-20261020/verdict-2026-10-20-live-refused-staging-files-area-pair-not-armed.json`
  - staging deploy receipt:
    `C:/localProjects/decko-ts-release-lead/tmp/deploy-night-20261020/receipt-staging-96895.deploy-night-20261020.json`
- The row's bucket is unchanged: its DONE condition still waits on the
  guarded live deploy.

## Battery

- `node tools/edge-signed-in-exercise.mjs` (the run above): 240 / 242
  passed; the two failures are named in the row mx-B-081 receipt and are
  not this row's surface.
- The engine source is untouched by this commit.
