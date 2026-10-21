# Row mx-B-081 - the nest image editor: the port side green at this base, the live side still on the operator's files-area arming

Row: `mx-B-081-cover-b-edit-editor-buttons-li` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
matrix-journey, bucket WORKING ON IT at roster build 2026-10-20T04:51:22.800Z).
Check id `B-081`; the action is "E8 the nest image editor inserts a nest with
view and size options".

## What the row's gap is

The roster row's own text: the row "takes the live upload probe's verdict
like ACT-085 (the image01 placeholder only becomes a real image through the
upload tab) and the probe is NOT green: tonight's signed-in multipart
card[image] create (1x1 PNG) at live 96867 release 1194026 (pre-bundle)
answered 500 with a zero-byte body and created no card, byte-identical to the
2026-10-19 baseline - the fix sits in staging-only bundle 45d1ead3 (staging
96895 release 1196260, verified). Still missing: the guarded live deploy,
blocked on arming the files-area pair (operator account-side call - see
files-area-arming-decko-storage-pair-absent)."

So the gap is not a port gap: it is a deployment gap, and the deployment gap
is blocked on an operator account-side call. Tranche 1 verified the port side
(`docs/reports/matrix-journey-row-mx-B-081-nest-image-editor-verification-2026-10-20.md`);
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

The row's leg:

    cover-b. edit: editor buttons (link, nest image) (E6, E8) /
      E8 the nest image editor inserts a nest with view and size options
      | PASS | {"actor":"admin","actorId":53041,
                "image":{"id":79,"name":"*logo"},
                "wire":{"expected":"harness_imgbtn_mvhyilst-1",
                        "actual":"harness_imgbtn_mvhyilst-1","resolves":true},
                "preview":"{{ *logo / view: titled; size: small }}",
                "insertedHasSnippet":true,"saveStatus":200}

The run as a whole: 240 / 242 passed, 2 failed - the two failures are the
instrument defect in the E11b leg and the timing leg, both recorded with
their evidence in
`docs/reports/receipts/row-mx-155-base-run-2026-10-21.json`. Neither is on
this row's surface.

## The live side, and why it is not this lane's to close

- The live multipart create for `card[image]` answers 500 with a zero-byte
  body and creates no card, byte-identical to the 2026-10-19 baseline
  (brandonDojoTech/tmp/live-reprobe-20261020/receipt-1-multipart-uploads-act085-act080.json).
- The fix that answers it sits in the staging-only bundle 45d1ead3, deployed
  to staging 96895 (release 1196260, four probes 200, deployed-code hash
  verified); the guarded LIVE deploy was refused
  (brandonDojoTech/tmp/deploy-night-20261020/verdict-2026-10-20-live-refused-staging-files-area-pair-not-armed.json).
- The deploy is blocked on the files-area pair being armed: an operator
  account-side call (the roster's own row
  `files-area-arming-decko-storage-pair-absent`; the failsafe-proven arm and
  probe script is staged at brandonDojoTech/tmp/edge-files-area-arm-20261019/
  and has never fired).

## Disposition

- The port side of this row is **measured green at this base**: the E8 leg
  passes in a fresh run on the current tree, with the wire, the preview and
  the save answer in the evidence.
- The row's remaining gap is the **guarded live deploy**, and that gap is
  **operator-blocked**: it needs the files-area pair armed before the deploy
  can be attempted, and then a re-run of the live probe. Named, with both
  receipts.
- The row's bucket is unchanged: it stays WORKING ON IT. This lane does not
  edit the roster, and nothing in this lane deploys or touches live.
- One thing this lane DID find, on another row's surface, is in the W4
  report (`docs/reports/row-mx-155-follow-views-base-format-input-chain-2026-10-21.md`):
  the list family's base-format input view, which answered 500 for a User
  card's "+follow" part, now renders through Ruby's view chain.

RECEIPT: `docs/reports/receipts/row-mx-B-081-nest-image-editor-2026-10-21.json`.

BATTERY: the local signed-in exercise above (240 / 242; this row's leg PASS);
no engine source touched by this row's work.
