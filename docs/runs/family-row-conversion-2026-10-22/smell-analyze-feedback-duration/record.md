# Row smell-analyze-feedback-duration

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-analyze-feedback-duration` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/analyze-feedback-duration.mjs`
- What this lane did: Ran the probe, first bare and then with the owned run label it demands. Also restored the pinned checkout the row's own unblock names, which changes one of this row's pins (see the pin note).
- Command: `node analyze-feedback-duration.mjs ; node analyze-feedback-duration.mjs strengthened-full-a25329a8`
- Observed: Bare: exit 1 with 'Exact owned run required'. With the label: exit 1 with ENOENT for strengthened-full-a25329a8/report.md.memory.jsonl, the capture's memory journal, which is not in the evidence tree.
- Gap, in one mechanism sentence: the capture's memory journal and the stage telemetry capture directories are not on disk, so the telemetry half of the analysis has no input to read.
- Pin: tests/tools/feedback-duration-probe-scan-root-survives-in-the-port-tree.test.ts, UPDATED in this lane: its assertion that the machine path the probe names is absent went stale the moment this lane restored that checkout, which is the row's own stated unblock. The assertion is now the property that survives the restore: the measurement reads this tree's own copy of tools/edge-signed-in-exercise, never the restored checkout. Run on this branch: 3 tests passed.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
