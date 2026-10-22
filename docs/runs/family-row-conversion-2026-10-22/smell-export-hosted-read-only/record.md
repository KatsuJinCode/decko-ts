# Row smell-export-hosted-read-only

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-export-hosted-read-only` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/export-hosted-read-only.mjs`
- What this lane did: Ran it once, before the pinned checkout was restored, and did not run it again after: with the harness module restored the script proceeds to a multi-route live fetch of the hosted edge, which the live-host rule for this lane does not allow.
- Command: `node export-hosted-read-only.mjs (before the restore: exit 1, ERR_MODULE_NOT_FOUND for the b00a4503 harness-browser.mjs)`
- Observed: Before the restore the script died at its line-2 import, before any traffic. After the restore the only thing between it and the live edge is the route fetch loop.
- Gap, in one mechanism sentence: the row's verification is a multi-route live export of the hosted edge, which this lane does not make.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
