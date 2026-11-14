# Row mx-B-086 - the upload create forms: the port side green at this base, the live side still on the operator's files-area arming

Row: `mx-B-086-cover-b-files-upload-a-file-an` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
matrix-journey, bucket WORKING ON IT at roster build 2026-10-20T04:51:22.800Z).
Check id `B-086`; the action is "F1/F3/F7 upload a file, an image, and upload
as a member through the create forms".

## What the row's gap is

The roster row's own text: the row "takes the live upload probe's verdict and
the probe is NOT green: deploy-night 2026-10-20 left live 96867 untouched on
pre-bundle release 1194026 (LIVE REFUSED - files-area pair never armed), and
tonight's signed-in multipart probe against culturesmith-edge.bunny.run
answered 500 with a zero-byte body for BOTH card[file] (.txt, 44 bytes) and
card[image] (1x1 PNG), created no card (cleanup delete 422, page falls back
to the new-card form), byte-identical to the 2026-10-19 baseline - the upload
fix sits in staging-only bundle 45d1ead3 (staging 96895 deployed to release
1196260, four probes 200, deployed-code hash verified). Still missing: the
guarded live deploy, which is blocked on arming the files-area pair (operator
account-side call - see files-area-arming-decko-storage-pair-absent)."

The gap is a deployment gap, blocked on an operator account-side call.
Tranche 1 verified the port side
(`docs/reports/matrix-journey-row-mx-B-086-upload-create-forms-verification-2026-10-20.md`);
this tranche re-verifies it on a fresh run at this tranche's base, because a
port-side change landed on the branch in between (the set-membership fix,
commit `2ca5e9b3`) and the row's evidence must be read against the current
tree.

## The port side, measured on this branch

A fresh local run of the signed-in exercise on this branch's base
(`eaf5149b`, source files clean, the deck copied onto the engine schema,
headless Chromium, a local loopback stack):

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche2-20261021/full-run-base/report.md

The row's three legs, all PASS:

    cover-b. files: upload a file, an image, empty refused, member (F1, F3, F5, F7) /
      F1 a file can be uploaded through the File create form
      | PASS | {"writeStatus":200,"serverSaid":"<div class='chosen-file'> ... action_id_of_cached_upload ...","afterStatus":200,"stored":true}
    cover-b. files: upload a file, an image, empty refused, member (F1, F3, F5, F7) /
      F3 an image can be uploaded through the Image create form
      | PASS | {"writeStatus":200,"serverSaid":"<div class='chosen-file'> ...","afterStatus":200,"stored":true}
    cover-b. files: upload a file, an image, empty refused, member (F1, F3, F5, F7) /
      F7 a member can upload a file
      | PASS | {"writeStatus":200,"serverSaid":"<div class='chosen-file'> ...","afterStatus":200,"stored":true}

(the F7 leg rides the module's actor switch - checks-cover-b.mjs signs in as
admin, then member, uploads, then restores admin - so the member identity
rests on the module's switch, which the evidence does not carry as a witness
field. That is the same caveat the roster's own F7 row records.)

The run as a whole: 240 / 242 passed, 2 failed - the instrument defect in the
E11b leg and the timing leg, both recorded with their evidence in
`docs/reports/receipts/row-mx-155-base-run-2026-10-21.json`. Neither is on
this row's surface.

## The live side, and why it is not this lane's to close

- The live multipart create answers 500 with a zero-byte body for both
  `card[file]` and `card[image]`, and creates no card (cleanup delete 422,
  the page falls back to the new-card form), byte-identical to the 2026-10-19
  baseline (brandonDojoTech/tmp/live-reprobe-20261020/receipt-1-multipart-uploads-act085-act080.json).
- The fix sits in the staging-only bundle 45d1ead3 (staging 96895, release
  1196260, four probes 200, deployed-code hash verified); the guarded LIVE
  deploy was refused (brandonDojoTech/tmp/deploy-night-20261020/verdict-2026-10-20-live-refused-staging-files-area-pair-not-armed.json).
- The deploy is blocked on the files-area pair being armed: an operator
  account-side call (the roster's own row
  `files-area-arming-decko-storage-pair-absent`; the arm-and-probe script is
  staged at brandonDojoTech/tmp/edge-files-area-arm-20261019/ and has never
  fired).

## Disposition

- The port side of this row is **measured green at this base**: F1, F3 and F7
  all pass in a fresh run on the current tree, each with the write answer,
  the page after the write, and the stored flag.
- The row's remaining gap is the **guarded live deploy**, and that gap is
  **operator-blocked**: the files-area pair must be armed before the deploy
  can be attempted, and then the live probe re-run. Named, with both
  receipts.
- The row's bucket is unchanged: it stays WORKING ON IT. This lane does not
  edit the roster, and nothing in this lane deploys or touches live.

RECEIPT: `docs/reports/receipts/row-mx-B-086-upload-create-forms-2026-10-21.json`.

BATTERY: the local signed-in exercise above (240 / 242; this row's three legs
PASS); no engine source touched by this row's work.
