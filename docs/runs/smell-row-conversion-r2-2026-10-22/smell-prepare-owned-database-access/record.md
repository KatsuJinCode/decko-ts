# Row smell-prepare-owned-database-access

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-prepare-owned-database-access`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/prepare-owned-database-access.mjs`
- What this lane did: read the instrument and established what it would do, and what state
  the credential it manages is in.
- Command: not run; the instrument mints a live account credential.
- Observed, first hand: the instrument writes to
  `C:/localProjects/decko-ts-release-lead/.runtime/owned-cs-edge-cleanup-20261018.env` and
  refuses to run when that file already exists, with the message that an owned credential is
  already prepared and a duplicate token must not be generated. The file is present, so the
  instrument's own guard is satisfied in the state that needs no minting. The instrument
  reads the account key from `C:/localProjects/brandonDojoTech/library/data/secrets.env`
  and asks the Bunny account API for a full-access one-hour database token, whose path and
  permissions are recorded in `hosted-edge-current/owned-access-prepared.json`
  (`credentialPath`
  `C:/localProjects/decko-ts-release-lead/.runtime/owned-cs-edge-cleanup-20261018.env`,
  `credentialGitIgnored` true). No credential value was read into any output and none is
  recorded here.
- Gap, in one mechanism sentence: minting a live account credential is an operator
  decision, and the credential this row exists to prepare is already prepared and in
  custody, so there is nothing for this lane to mint.

## What would close it

Either the operator retires the current credential so the row can mint a fresh one, or the
row is retired in favour of the standing prepared access, whose custody record is already
on file.
