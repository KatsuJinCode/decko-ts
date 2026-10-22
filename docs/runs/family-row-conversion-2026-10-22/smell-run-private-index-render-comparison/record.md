# Row smell-run-private-index-render-comparison

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-run-private-index-render-comparison` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/run-private-index-render-comparison.mjs`
- What this lane did: Ran it in the mode the script demands, after restoring the pinned checkout.
- Command: `node run-private-index-render-comparison.mjs normalized`
- Observed: The script's stack.mjs import now resolves (the b00a4503 tree is restored), and the run fails one step later: 'build-local-deck: source deck not found: C:/localProjects/decko-edge-verification-53c86269/.runtime/authorized-widget-content-20261018-r2/deck.sqlite3'.
- Gap, in one mechanism sentence: the authorized source deck the comparison stages from is an owned artifact that git does not carry, so the comparison has no deck to render.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
