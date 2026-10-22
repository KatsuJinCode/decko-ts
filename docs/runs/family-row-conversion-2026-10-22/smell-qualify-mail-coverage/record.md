# Row smell-qualify-mail-coverage

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-qualify-mail-coverage` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/qualify-mail-coverage.mjs`
- What this lane did: Ran it, after restoring the pinned checkout the row names as its unblock.
- Command: `node qualify-mail-coverage.mjs`
- Observed: The three harness modules the script imports now resolve (local-policy.mjs, checks-content-flows.mjs and capabilities.json are all in the restored pinned checkout), and the script fails one step later with ENOENT for C:/localProjects/decko-ruby-reference/decko/features/update_includers.feature.
- Gap, in one mechanism sentence: the qualification's evidence is the Ruby source tree's feature files, and that tree is not on this machine, so the mail coverage cannot be qualified against the Ruby source here.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
