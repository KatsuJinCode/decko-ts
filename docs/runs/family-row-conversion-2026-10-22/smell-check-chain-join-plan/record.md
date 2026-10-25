# Row smell-check-chain-join-plan

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-check-chain-join-plan` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `tools/perf/check-chain-join-plan.mjs (this branch)`
- What this lane did: Did not run the tool's own measurement: it needs the capture that carries its parameter array and the 21670-card deck, and neither is on disk. Verified the pin that holds the row's evidence instead.
- Command: `npx vitest run tests/tools/chain-join-join-rewrite-evidence-is-internally-consistent.test.ts`
- Observed: 1 file passed, 6 tests passed. The pin runs the pre-fix tool read from git against the same all-CROSS capture and reaches the deck read, while the fixed tool refuses by name.
- Gap, in one mechanism sentence: the tool's own measurement needs the capture with its parameter array and the 21670-card deck, and neither exists, so every timing in this row is read out of the committed report rather than produced by a run.
- Pin: tests/tools/chain-join-join-rewrite-evidence-is-internally-consistent.test.ts (6 tests, passing on this branch).

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
