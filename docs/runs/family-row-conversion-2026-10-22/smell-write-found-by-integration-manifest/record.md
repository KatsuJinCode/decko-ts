# Row smell-write-found-by-integration-manifest

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-write-found-by-integration-manifest` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/write-found-by-integration-manifest.mjs`
- What this lane did: Ran it in a copy of the evidence tree that carries the sibling evidence directories it reads.
- Command: `node write-found-by-integration-manifest.mjs (run in a copy of the evidence tree)`
- Observed: Exit 1 on its first read: the sibling evidence directories scoped-layout-6f960810-r2 and found-by-real-deck-equivalence-r2 are not on this machine, and the pinned bundle it hashes, C:/localProjects/decko-edge-verification-b00a4503/.runtime/private-cql-6f960810-bundle/bunny-edge-engine.bundle.js, is a build output that is not there either.
- Gap, in one mechanism sentence: the manifest's inputs are two sibling evidence directories and a pinned bundle, none of which are on disk, so the write is unreachable.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
