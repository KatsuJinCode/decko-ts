# Row smell-verify-hosted-widget-content

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-verify-hosted-widget-content` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/verify-hosted-widget-content.mjs`
- What this lane did: Did not run it: the script's 12-route fetch round is in-memory only but it IS twelve live fetches to the hosted edge, and it writes its receipt over the receipt of record at the end of that round.
- Command: `not run, live hosted-edge fetch loop`
- Observed: First-hand fact: the receipt of record remote-widget-cas/hosted-readback.json exists and records the original run's result; the script's fetch loop runs BEFORE its write, so a re-run would make the live calls first and overwrite the record second.
- Gap, in one mechanism sentence: a re-verification would issue twelve live fetches to the hosted edge and then overwrite the receipt of record, so the standing receipt remains the record.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
