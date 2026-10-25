# Row smell-run-private-index-render-comparison

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-run-private-index-render-comparison`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/run-private-index-render-comparison.mjs`
- What this lane did: read the instrument, established that its tooling dependencies are
  working, and established what a fresh run would overwrite.
- Command: not run; the instrument's own one-shot hygiene refuses a repeat.
- Observed, first hand: the instrument runs only in the `normalized` mode and refuses the
  retired raw-imported mode by name. Its inputs are the experiment directory
  `private-normalized-nest-index-a253-20261019/` and the baseline deck under
  `C:/localProjects/decko-edge-verification-b00a4503/.runtime/private-normalized-nest-index-a253-20261019/`.
  That directory holds `completed.json`, `launch.json`, `render-env.json`,
  `render-comparison.json` and `render-comparison-running.json`. The tooling the
  instrument depends on is proven working in this session: the sibling row
  `smell-profile-private-index-render` rendered the same bundle against a rebuilt baseline
  deck in this lane, with the pinned bundle hash verified at boot and all three routes
  answering 200.
- Gap, in one mechanism sentence: a fresh comparison run would write `render-env.json` with
  the exclusive-create flag into a directory where it already exists and would then
  overwrite `render-comparison.json`, which is the completed four-of-four ABBA output of
  record, so the instrument's own one-shot design is what blocks the repeat.

## What would close it

Either a fresh experiment directory and label, so that the comparison can be produced
without touching the output of record, or a decision to accept the completed output of
record as the row's answer and retire the row.
