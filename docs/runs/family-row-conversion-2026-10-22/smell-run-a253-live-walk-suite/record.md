# Row smell-run-a253-live-walk-suite

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-run-a253-live-walk-suite` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/run-a253-live-walk-suite.mjs`
- What this lane did: Ran it, after restoring the pinned checkout and moving the consumed output directory aside in a copy of the evidence tree.
- Command: `node run-a253-live-walk-suite.mjs (run in a copy of the evidence tree)`
- Observed: The git guard passes (the checkout is at a25329a8 and clean) and the suite itself starts, then the node process dies before any test runs: Error: Cannot find module 'C:/localProjects/decko-edge-verification-53c86269/.runtime/nest-cache-hidden-children-v2.cjs' from the preload.
- Gap, in one mechanism sentence: the suite preloads a gitignored .runtime artifact of the pinned checkout, and git does not carry it, so the suite has no preload to run under.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
