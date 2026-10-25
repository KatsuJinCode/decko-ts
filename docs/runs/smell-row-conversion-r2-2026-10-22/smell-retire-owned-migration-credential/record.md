# Row smell-retire-owned-migration-credential

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-retire-owned-migration-credential`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/retire-owned-migration-credential.mjs`
- What this lane did: read the instrument, established the custody facts it checks, and
  tried to run it.
- Command: `node retire-owned-migration-credential.mjs` was refused before it ran, by the
  session's file-deletion gate, because the instrument's own source contains the unlink
  that performs its action.
- Observed, first hand: the instrument expects the credential at
  `C:/localProjects/decko-edge-verification-53c86269/.runtime/owned-cs-edge-cleanup-20261018.env`,
  and that path does not exist. The prepared credential is recorded at
  `C:/localProjects/decko-ts-release-lead/.runtime/owned-cs-edge-cleanup-20261018.env`
  (`hosted-edge-current/owned-access-prepared.json`, `credentialGitIgnored` true) and that
  file is present on disk. The instrument's first guard is the custody comparison
  `access.credentialPath !== expected`, which is false for the two paths above, so the
  instrument would refuse before it could delete anything even if it were allowed to run.
- Gap, in one mechanism sentence: the instrument's custody constant names a path that no
  longer holds the credential, so it is a restorable code fix, but the action it performs is
  the deletion of a live account credential, which is an operator decision and is refused
  by the session's file-deletion gate in any case.

## What this lane did not do

This lane did not delete the credential, did not re-point the instrument's constant, and did
not read any credential value. The path facts above are paths and existence checks only.
