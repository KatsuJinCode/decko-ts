# Row smell-verify-hosted-widget-views

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-verify-hosted-widget-views` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/verify-hosted-widget-views.mjs`
- What this lane did: Did not run it: the same twelve-route live fetch loop, against the hosted edge.
- Command: `not run, live hosted-edge fetch loop`
- Observed: First-hand fact: the script's createRequire anchor (the 53c86269 package.json) is restored now, so the anchor blocker is gone; what remains is the live loop and the receipt of record remote-widget-cas/hosted-content-view-readback.json, which exists and records pass:true from the original run and is an input the retire-credential script reads today.
- Gap, in one mechanism sentence: a re-verification would issue twelve live named-view fetches to the hosted edge, so the standing passing receipt remains the record.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
