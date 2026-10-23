# Row smell-read-private-index-progress

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-read-private-index-progress`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/read-private-index-progress.mjs`
- What this lane did: ran the row's own instrument and recorded where it stops.
- Command: `node read-private-index-progress.mjs` (run in the copy of the evidence tree).
- Observed: the instrument fails at its first read with
  `TypeError: Cannot open database because the directory does not exist`, raised by
  better-sqlite3 while opening
  `C:/localProjects/decko-edge-verification-b00a4503/.runtime/private-nest-index-a253-20261019/deck.sqlite3`.
- Gap, in one mechanism sentence: the deck the row reads is the built clone that carried the
  `decko_nest_edges` index cache from the index experiment, and that artifact was deleted
  with the checkout's `.runtime` tree, so the row's subject no longer exists on disk and a
  rebuilt baseline is a different artifact from the recorded one.

## What this lane did rebuild, and why it is not the same artifact

This lane rebuilt a local baseline deck for the sibling row
`smell-profile-private-index-render` from the byte-restored a253 deck, using the pinned
checkout's own builder. That deck is a fresh baseline: it carries the rows and the engine's
schema, and it carries no nest-index cache, so it is not the experimental artifact of record
this row reads. The build log of the original index experiment survives in the experiment
directory, so a new instance of the experiment can be produced; that is new evidence
production, not a re-measurement of the recorded one.
