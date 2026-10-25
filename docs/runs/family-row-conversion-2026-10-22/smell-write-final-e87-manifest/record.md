# Row smell-write-final-e87-manifest

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-write-final-e87-manifest` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/write-final-e87-manifest.mjs`
- What this lane did: Switched the restored 53c86269 checkout to the pinned commit the script demands and ran it, in a copy of the evidence tree.
- Command: `node write-final-e87-manifest.mjs (run in a copy of the evidence tree)`
- Observed: Exit 1 with ENOENT for C:/localProjects/decko-edge-verification-53c86269/.runtime/private-final-e87db8f8-bundle/bunny-edge-engine.bundle.js.
- Gap, in one mechanism sentence: the pinned private bundle the manifest hashes is a build output that git does not carry, so the manifest cannot be written from the restored tree.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
