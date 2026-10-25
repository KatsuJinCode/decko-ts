# Row smell-prepare-owned-database-access

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-prepare-owned-database-access` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/prepare-owned-database-access.mjs`
- What this lane did: Did not run it: lines 7-11 of the script PUT bunny.net/auth/generate and write a one-hour full-access database token, and minting a live account credential is an operator decision, not this lane's.
- Command: `not run, live credential mint`
- Observed: First-hand fact: a live credential already exists at decko-ts-release-lead/.runtime/owned-cs-edge-cleanup-20261018.env, prepared and NOT retired (the row smell-retire-owned-migration-credential owns that).
- Gap, in one mechanism sentence: preparing owned database access mints a live account credential, and the already-prepared credential can be used instead, so nothing is gained by a second mint.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
