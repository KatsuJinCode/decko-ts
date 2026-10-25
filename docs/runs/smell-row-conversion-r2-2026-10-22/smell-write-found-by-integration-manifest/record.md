# Row smell-write-found-by-integration-manifest

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-write-found-by-integration-manifest`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/write-found-by-integration-manifest.mjs`
- What this lane did: ran the row's own instrument and recorded where it stops.
- Command: `node write-found-by-integration-manifest.mjs` (run in the copy of the evidence
  tree).
- Observed: the instrument fails on its first read with
  `Error: ENOENT: no such file or directory, open
  'C:\localProjects\decko-edge-verification-b00a4503\.runtime\private-cql-6f960810-bundle\bunny-edge-engine.bundle.js'`.
- Gap, in one mechanism sentence: the bundle the manifest hashes and the two sibling
  evidence directories it reads are artifacts that are not on this machine, so the manifest
  cannot be written from the restored tree.

## What is missing, exactly

The instrument reads four things before it writes anything:

- `found-by-real-deck-equivalence-r2/receipt.json`, a sibling evidence directory, absent from
  this machine;
- `scoped-layout-6f960810-r2/completed.json` and `scoped-layout-6f960810-r2/report.md.json`,
  a second sibling evidence directory, also absent;
- `found-by-type-id-correctness.log`, which is present in the evidence tree;
- the pinned bundle `C:/localProjects/decko-edge-verification-b00a4503/.runtime/private-cql-6f960810-bundle/bunny-edge-engine.bundle.js`,
  which is a build output.

The bundle alone is regenerable: the 2026-10-20 dependency-restoration lane rebuilt it
byte-exact at the `6f960810` source and recorded the hash it matched. The two sibling
evidence directories are the blocker that regeneration does not touch, because they are
captured evidence of a scoped run and a real-deck equivalence run, not build outputs.

## What this lane did not do

This lane did not flip the pinned checkout to the `6f960810` commit, did not rebuild the
cql bundle, and did not write a manifest. The manifest of record,
`found-by-type-integration/manifest.json`, remains the record.
