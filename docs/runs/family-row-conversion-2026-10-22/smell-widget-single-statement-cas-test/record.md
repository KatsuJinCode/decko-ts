# Row smell-widget-single-statement-cas-test

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-widget-single-statement-cas-test` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/widget-single-statement-cas.test.mjs`
- What this lane did: Did not run it in this lane: the session's own safety gate refused the command, because the suite removes its own temporary directories as it finishes. The standing 2026-10-20 receipt is left as the record rather than re-created by a copy of the suite.
- Command: `node widget-single-statement-cas.test.mjs (refused by the session's file-deletion gate before it started)`
- Observed: The standing receipt from 2026-10-20 measures the suite at 1 pass and 3 fail, all three sharing one measured cause: the snapshot deck (decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3, 21676 cards) matches the pre-apply capture on 0 of 12 ids for 'before' and 0 of 12 for 'after'.
- Gap, in one mechanism sentence: the snapshot deck the suite admits against is not the pre-apply capture (0 of 12 ids match either way), so the suite's admission count is unmeasurable until a byte-exact pre-apply deck is rebuilt; the module logic is not implicated.
- Pin: none of its own; the standing receipt is tmp/smell-grind-20261020/cas-test-run/ in the evidence repo.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
