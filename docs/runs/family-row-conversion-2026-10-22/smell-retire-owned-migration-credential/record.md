# Row smell-retire-owned-migration-credential

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-retire-owned-migration-credential` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/retire-owned-migration-credential.mjs`
- What this lane did: Did not run it: past its guards the script DELETES a live credential file, which is a destructive act and an operator decision, not this lane's.
- Command: `not run, destructive file removal of a live credential`
- Observed: First-hand fact from the script: its custody guard compares the prepared record's credentialPath against a constant that still names the old 53c86269 path, while the prepared record now names decko-ts-release-lead/.runtime/owned-cs-edge-cleanup-20261018.env, which exists. The retirement recorded in owned-access-retired.json covered the OLD-era credential; the re-issued one is prepared and not retired.
- Gap, in one mechanism sentence: the instrument pins a stale custody path, so it refuses before it can retire anything, and the retirement it is built for deletes a live credential, which is outside this lane.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
