# Row smell-audit-candidate-production-flags

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-audit-candidate-production-flags` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/audit-candidate-production-flags.mjs`
- What this lane did: Did not run it: past its own gate it reads a Bunny account API key from the account secrets file and calls the live compute API for two script ids, which is an account-level live call and not this row's to make. Verified the pin that holds the row's evidence instead.
- Command: `npx vitest run tools/edge-signed-in-exercise/test/local-policy.test.mjs`
- Observed: The pin asserts the port's own policy surface, including the write path the row's audit reads.
- Gap, in one mechanism sentence: the probe needs a Bunny account API key and a live compute API call, and no credential was read and no live call was made by this lane.
- Pin: tools/edge-signed-in-exercise/test/local-policy.test.mjs (the tranche-2 pin, carried on this branch).

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
