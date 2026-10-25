# Row smell-measure-clone-trace-batch2

Family row conversion, 2026-10-22. The row's own verification ran after this lane rebuilt the
instrumented clone the row said was missing; the row IS closed.

- Roster row: `smell-measure-clone-trace-batch2`
  (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `reference-harness/browser/measure-clone-trace-batch2.mjs`
- Tree measured: `C:/localProjects/decko-ts-smell-test-measure-20261022` at commit
  `e8b70ad3aa85c75f9247d2cd1af747e4bf740505` (the shipping candidate), engine built there with
  `node tools/dist/build-engine.mjs`; `.runtime/browser-build.json` records `sourceDiffSha256`
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (the clean-tree hash).
- Command: `node reference-harness/browser/measure-clone-trace-batch2.mjs` (exit 0).
- Evidence in this directory: `server-clone.log` (the clone's own server log, including every
  `[b2trace]` line), `clone-rebuild-and-patch.md` (exactly how the clone was rebuilt and what the
  trace patch prints), `server-h2h-real.log` is not part of this row.

## What had to be rebuilt, and what the rebuild is

The row's blocker was exact: the instrumented livecopy clone tree
(`.runtime/exhaustive/probe-pageonly-batch2/livecopy`, with `vm-staging-server.mjs` and a
`dist` carrying a `B2_TRACE` patch in `view-task-rules.js`) does not exist anywhere on disk,
and the patch had been hand-applied and never committed, so the clone leg died at
`reference-harness/browser/lib/engines.mjs:173` with "server exited with 1 before it was ready"
(the clone's own log recorded `Cannot find module .../livecopy/reference-harness/browser/engines/ts-server.mjs`).

This lane rebuilt the clone from the candidate's own build and re-patched it. The rebuild is
described in full in `clone-rebuild-and-patch.md` in this directory, including the exact patch
text, so the instrument is auditable rather than asserted. The patch is THIS LANE's instrument,
not the original hand-applied one, and that is disclosed here rather than presented as the
original.

## What the run measured

The clone booted, the scenario ran, and the trace answers the row's question. The decisive line
is the one for the card under test, Mira's update of the `+*help` child:

```
[b2trace] task=update card=B2CloneProbemvk1malz+*help candidates=["b2_clone_probemvk1malz+*help+*self+*update","rich_text+*help+*type_plu_right+*update","*help+*right+*update","*rstar+*update","phrase+*type+*update","*all_plu+*update","*all+*update"] resolved=[["*all+*update",70],["*all_plu+*update",74],["*help+*right+*update",93],["*rstar+*update",80]]
[vm-staging] POST /update/B2CloneProbemvk1malz+*help -> 403 (5ms)
```

The right-pattern candidate `*help+*right+*update` resolves to a stored rule (id 93) in the live
composition, and the gate then refuses the non-owner's update with 403. The clone's stored rows
for the second content are empty, so the refused write stored nothing.

## Disposition

`DONE`. The row's verification ran end to end on the pinned candidate and produced the evidence
the row asks for: the live composition resolves the right-pattern rule the engine's gate needs,
and the gate's answer is the refusal. The gap the row carried (the unreproducible clone tree) is
closed by the rebuild documented in this directory, and the receipt is the measurement.
