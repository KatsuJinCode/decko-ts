# smell-apply-remote-widget-cas

- The row's own label: `smell/probe script apply-remote-widget-cas.mjs`
- Instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/apply-remote-widget-cas.mjs`
- Roster verdict at the time of this lane: NOT-RUNNABLE, bucket WORKING ON IT,
  blocker WORKING ON IT (re-measured 2026-10-23, round two).
- This lane's disposition: NAMED, not closed. The row's verification is a live
  production compare-and-swap write whose admission is consumed and whose
  credential is retired; producing it again is an operator decision.

## What this lane re-verified first hand, in this session

- The instrument reads its credential from
  `C:/localProjects/decko-edge-verification-53c86269/.runtime/owned-cs-edge-cleanup-20261018.env`
  before any request, and refuses unless the token is unexpired
  (`BUNNY_DATABASE_TOKEN_EXPIRES` at least one minute ahead). That file does
  not exist on this machine (`ls`: "No such file or directory", this session).
- The instrument is one-shot by construction: it writes
  `remote-widget-cas/apply-intent.json` with the exclusive-create flag, and
  that file stands in the evidence tree (this session's directory read).
- The write it exists to perform already executed once, and the receipt of
  record stands beside the intent:
  `remote-widget-cas/apply-receipt.json` reads `pass: true`,
  `returnedWriteRows: 12`, `reportedAffectedRows: 12`,
  `allTwelveAfterMatch: true`, `otherFieldsUnchanged: true`,
  `monotonicVersionMatches: true`, `casRefused: false`,
  `contentWritten: true`, `versionBefore: 52`, `versionsAfter: [{id: 1,
  version: 64}]` (this session's read of the file).
- The instrument's admission plan pins the write on exactly those preconditions
  (twelve rows still carrying their before content, version 52 with one
  version row), so the same statement would now be refused by its own guard:
  the twelve contents were replaced and the version moved to 64.

## The mechanism that blocks the close

Three separate facts, each verified above: the owned credential the instrument
reads was deliberately retired and is gone; the one-shot intent file is
already written; and the admission's preconditions no longer hold anywhere,
because the authorized write executed and moved the database it admits on.
Re-running the row's verification needs a newly minted production credential
plus a fresh admission plan, and minting production credentials is an
operator decision. The executed write's receipt of record already stands as
the evidence that the authorized change was applied; there is no remaining
work this row's instrument could verify.

## What this lane did not do

It made no request to any database, read no credential material (the
credential's absence was established by path, not by content), and did not
modify the evidence tree.

Branch: `port/workbatch-g-20261025` in KatsuJinCode/decko-ts, base
`deploy/full-candidate-20261101` tip `c17906db`.
