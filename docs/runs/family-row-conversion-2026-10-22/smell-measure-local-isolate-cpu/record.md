# Row smell-measure-local-isolate-cpu

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-measure-local-isolate-cpu` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/measure-local-isolate-cpu.mjs`
- What this lane did: Ran it, twice: before and after the pinned checkout was restored.
- Command: `node measure-local-isolate-cpu.mjs`
- Observed: Both runs exit 1 with ERR_MODULE_NOT_FOUND for C:/localProjects/decko-edge-verification-53c86269/dist/deploy/bunny-worker-src/bunny-edge-isolate-probe.js, the compiled isolate probe.
- Gap, in one mechanism sentence: the compiled isolate-probe module is a build output that git does not carry, and the pinned checkout has no dist/ of its own, so the CPU diagnostic has no probe to load.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
