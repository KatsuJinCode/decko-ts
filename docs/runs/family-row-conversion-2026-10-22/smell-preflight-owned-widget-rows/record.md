# Row smell-preflight-owned-widget-rows

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-preflight-owned-widget-rows` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/preflight-owned-widget-rows.mjs`
- What this lane did: Did not run it: the script queries the LIVE cs-edge-deck production database over the network before its guarded write, and its one-shot output already exists.
- Command: `not run, live production-database query`
- Observed: First-hand fact: the one-shot output owned-widget-rows-preflight.json exists, and the script opens it with the exclusive-create flag, so a re-run would hit the live database first and then die on the existing output.
- Gap, in one mechanism sentence: the row needs a fresh one-shot output path AND an operator yes for a live production-database query, and neither is this lane's to give.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
