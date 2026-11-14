# Row mx-B-086 - the upload create forms: the port side re-verified green at the tranche-4 base

Row: `mx-B-086-cover-b-files-upload-a-file-an` in the completeness roster
(`brandonDojoTech/docs/registry/completeness-roster.json`, family
matrix-journey, bucket WORKING ON IT). Instrument-coverage-matrix action 84,
check B-086, capabilities F1/F3/F7: "upload a file, an image, and upload as
a member through the create forms".

This is tranche 4 of the family (branch
`port/matrix-journey-tranche4-20261021`, this row verified at commit
`4a94f50e`). The named runnable check is the same fresh full signed-in
exercise run that re-verifies row mx-B-081 at this base
(`docs/reports/row-mx-B-081-nest-image-editor-verification-2026-10-21-tranche4.md`
- one run, both rows' legs read from it).

## The row's legs in that run (report.md:147-150)

- **F1** a file can be uploaded through the File create form - PASS -
  write 200, the mount key `card[action_id_of_cached_upload]` stored
  (value 139), the row comes back (after 200, stored true).
- **F3** an image can be uploaded through the Image create form - PASS -
  write 200, the mount key stored (value 141), after 200, stored true.
- **F5** (the neighbouring empty-file refusal) - PASS - write 422, the
  error shown, no card created.
- **F7** a member can upload a file - PASS - write 200, the mount key
  stored (value 143), after 200, stored true.

Run totals: 240 / 242 checks passed (source `1294f3ed`, bundle SHA256
`b96ac0014d08fe0e5d2443a43d59830c0e97b3d8447c90df55af1906ef6de3cc`), with
the run's two failures named in the mx-B-081 tranche-4 report (the E11b
instrument defect and the timings leg) - neither is this row's surface.

## The row's state after this verification

- No genuine defect surfaced on the row's surfaces: F1/F3/F5/F7 are green
  at the new base and need no port change. The port's upload path is not
  the 500 the 2026-10-20 live probe measured: that 500 is the live host
  serving a pre-bundle release.
- The row's DONE condition is unchanged: the guarded deploy of bundle
  45d1ead3 to live 96867, blocked on arming the files-area pair (operator
  account-side call; the roster row
  files-area-arming-decko-storage-pair-absent). Nothing in this tranche
  deploys and nothing touches live.

Receipt:
`docs/reports/receipts/row-mx-B-086-upload-create-forms-verification-2026-10-21-tranche4.json`.
