# smell-prepare-owned-database-access

- The row's own label: `smell/probe script prepare-owned-database-access.mjs`
- Instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/prepare-owned-database-access.mjs`
- Roster verdict at the time of this lane: NOT-RUNNABLE, bucket WORKING ON IT,
  blocker WORKING ON IT (re-measured 2026-10-23, round two).
- This lane's disposition: NAMED, not closed. The credential the row exists to
  prepare is already prepared and stands in custody, the instrument refuses a
  duplicate mint by its own design, and minting another live credential is an
  operator decision.

## What this lane re-verified first hand, in this session

- The instrument writes its credential to
  `C:/localProjects/decko-ts-release-lead/.runtime/owned-cs-edge-cleanup-20261018.env`
  and refuses to run while that file exists, with the message "Owned
  credential already prepared; refusing duplicate token generation" (its own
  lines 2-3). It git-check-ignores the destination before writing.
- The credential file exists at exactly that path (this session's path read;
  existence only, no content read).
- The custody record
  `hosted-edge-current/owned-access-prepared.json` stands in the evidence
  tree (this session's path read), recording the preparation of that
  credential: a one-hour full-access token for the account-verified database,
  `credentialGitIgnored: true`.
- The write this credential was prepared to enable has already executed: the
  CAS receipt of record (`remote-widget-cas/apply-receipt.json`, read this
  session for the sibling row `smell-apply-remote-widget-cas`) records the
  twelve-content write passing on 2026-10-18 with the version moving 52 to 64.

## The mechanism that blocks the close

The row's instrument cannot run again without first destroying the standing
prepared credential, because refusing a duplicate mint is its own designed
guard; retiring a live credential and minting a fresh one are operator
decisions. And there is nothing left for a fresh credential to enable: the
CAS migration the row prepared access for has already executed and its
admission is consumed. The round-two receipt named the two closers, an
operator mint or a retirement of the row in favour of the standing prepared
access; the second arm is the roster owner's disposition, and this lane
records the mechanism instead of taking a disposition that belongs above it.

## What this lane did not do

It read no credential content (the file was verified by path only), minted no
token, and retired no credential.

Branch: `port/workbatch-g-20261025` in KatsuJinCode/decko-ts, base
`deploy/full-candidate-20261101` tip `c17906db`.
