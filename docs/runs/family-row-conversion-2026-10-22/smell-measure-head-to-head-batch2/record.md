# Row smell-measure-head-to-head-batch2

Family row conversion, 2026-10-22. The row's own verification ran after this lane rebuilt the
instrumented clone the row said was missing; the row IS closed.

- Roster row: `smell-measure-head-to-head-batch2`
  (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `reference-harness/browser/measure-head-to-head-batch2.mjs`
- Tree measured: `C:/localProjects/decko-ts-smell-test-measure-20261022` at commit
  `e8b70ad3aa85c75f9247d2cd1af747e4bf740505` (the shipping candidate), engine built there with
  `node tools/dist/build-engine.mjs`; `.runtime/browser-build.json` records `sourceDiffSha256`
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (the clean-tree hash).
- Command: `node reference-harness/browser/measure-head-to-head-batch2.mjs` (exit 0).
- Evidence in this directory: `head-to-head-output.txt` (the instrument's own two lines, one per
  leg), `server-h2h-real.log` and `server-h2h-clone.log` (each leg's server log).

## What had to be rebuilt

The row's blocker was the same unreproducible instrumented clone the sibling clone-trace row
carries: the clone leg died at `reference-harness/browser/lib/engines.mjs:173` with "server
exited with 1 before it was ready". This lane rebuilt the clone from the candidate's own build
and re-patched it; the rebuild and the exact patch text are written down in
`../smell-measure-clone-trace-batch2/clone-rebuild-and-patch.md` in this repository, and the
patch is this lane's own instrument, disclosed as such.

The row also needed its output directory to exist: the instrument writes
`.runtime/exhaustive/probe-pageonly-batch2/engine-b2-clone.json` and both server logs under
that path without creating it, so the run fails with `ENOENT` on the log path before it starts.
The directory was created in the measurement checkout.

## What the run measured

Both legs ran, same script, same scenario, one process, and they agree:

```
[h2h] real: childCreate=303 miraUpdate=403 body=<!DOCTYPE html><html><head><title>Error (permission-denied)</title></head><body><pre>Sorry! You need permission to do that.</pre><!-- actor  storedSecondRows=0
[h2h] clone: childCreate=303 miraUpdate=403 body=<!DOCTYPE html><html><head><title>Error (permission-denied)</title></head><body><pre>Sorry! You need permission to do that.</pre><!-- actor  storedSecondRows=0
```

The admin seeds the holder and its `+*help` child (303), Mira's update of the child is refused
with 403 and the permission-denied body, and no row holds the second content
(`storedSecondRows` 0). The real engine and the instrumented clone answer identically, which is
the row's whole point: the live composition and the staged copy do not diverge.

## Disposition

`DONE`. The row's verification ran end to end on the pinned candidate, both legs completed, and
the two answers are identical: the create is accepted, the non-owner's update is refused with
the permission-denied body, and the refused write stored nothing. The gap the row carried (the
unreproducible clone tree) is closed by the rebuild documented next door, and this receipt is the
measurement.

One boundary stated so it is not read as more than it is: this row is a self-comparison between
the port's live engine and a clone of the same port. It is not a comparison against the Ruby
oracle.
