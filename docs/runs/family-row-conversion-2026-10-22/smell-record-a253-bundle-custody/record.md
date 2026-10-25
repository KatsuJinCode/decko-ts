# Row smell-record-a253-bundle-custody

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-record-a253-bundle-custody` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/record-a253-bundle-custody.mjs`
- What this lane did: Ran it, after restoring the pinned checkout the row names as its unblock, in a copy of the evidence tree so the receipt of record was not overwritten.
- Command: `node record-a253-bundle-custody.mjs (run in a copy of the evidence tree)`
- Observed: The line-2 git guard passes now (the restored checkout is at a25329a8 and clean), and the script fails on the pinned bundle with ENOENT for C:/localProjects/decko-edge-verification-53c86269/.runtime/private-final-f044d5af-bundle/bunny-edge-engine.bundle.js.
- Gap, in one mechanism sentence: the pinned private bundle the custody record hashes is a build output that git does not carry, so the custody check has nothing to hash.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
