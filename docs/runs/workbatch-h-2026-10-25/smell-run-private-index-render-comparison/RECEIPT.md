# smell-run-private-index-render-comparison: the instrument's inputs are gone, named

- The row's own label: "smell/probe script run-private-index-render-comparison.mjs"
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/run-private-index-render-comparison.mjs`
- The prior receipts for this row:
  `docs/runs/smell-row-conversion-r5b-2026-10-24/smell-run-private-index-render-comparison/`
  and the round six summary `docs/runs/smell-row-conversion-r6-2026-10-25/README.md`
- The tree: `c17906dbb39220a3dd1bcd58847d0fa0d1c9696b`.

## Verdict: named, not closed. The instrument's own inputs are no longer on this machine.

## The mechanism, in one sentence

The instrument's exclusive create refuses one line before its four runs and
before the write that would overwrite the completed output of record, and two
of its inputs, the built clone and the preload the runs need, were swept with
the pinned checkout's runtime tree.

## What this lane measured

    $ ls C:/localProjects/decko-edge-verification-53c86269/.runtime/
    ls: cannot access '...': No such file or directory

    $ ls C:/localProjects/decko-edge-verification-b00a4503/.runtime/private-normalized-nest-index-a253-20261019/
    baseline.sqlite3

The pinned checkout the instrument stages from is gone entirely, so the
source deck it reads, the built clone it compares against and the preload the
four runs need are all absent. What remains under the other checkout is the
restored baseline deck alone (42,221,568 bytes, written 2026-10-24), which
the round five-b lane restored byte for byte.

The completed output of record (the comparison file, the environment file and
the running file, all written 2026-10-18) lived in the directory that is
gone, so the guard the round five-b lane recorded, the exclusive create that
refuses one line before the four runs, is no longer the only thing standing
between a repeat and the output of record: the repeat cannot run at all.

## What would close it

Either a fresh experiment directory and a fresh label, with the instrument's
missing inputs rebuilt, so the comparison can be produced without touching
an output of record, or a decision to accept the completed output of record
as the row's answer and retire the row. The second needs the output of
record, which this lane did not rebuild: it is a build output of a pushed
source, not a source file.

## What this lane did not do

It did not overwrite any output of record, did not send the probe's live
database traffic, and made no request to any hosted edge.
