# Row smell-profile-private-index-render

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-profile-private-index-render` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/profile-private-index-render.mjs`
- What this lane did: Ran it, before and after the pinned checkout was restored.
- Command: `node profile-private-index-render.mjs`
- Observed: Before the restore: exit 1, ERR_MODULE_NOT_FOUND for the b00a4503 stack.mjs. After the restore the script's own argument guard answers 'Owned private sample required': the deck path must start with C:/localProjects/decko-edge-verification-b00a4503/.runtime/<experiment>/ and no such owned experiment deck is on disk.
- Gap, in one mechanism sentence: the owned experiment deck the profile would render is not on disk, and the pinned bundle it renders from is a build output git does not carry.
- Pin: none; the row carries no pin of its own.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
