# Row smell-verify-staging-probe-restoration

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-verify-staging-probe-restoration` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/verify-staging-probe-restoration.mjs`
- What this lane did: Did not run it: the script reads the Bunny account API key and makes two live compute metadata GETs, and its one-shot output already exists.
- Command: `not run, live Bunny account API call`
- Observed: First-hand fact: the one-shot output staging-probe-restoration-independent-20261019.json exists, and the script's fetch precedes its exclusive-create write, so a re-run would make the live calls and then die on the existing output.
- Gap, in one mechanism sentence: a re-verification would make two live account-level metadata calls, and its one-shot output is already consumed, so the standing receipt remains the record.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
