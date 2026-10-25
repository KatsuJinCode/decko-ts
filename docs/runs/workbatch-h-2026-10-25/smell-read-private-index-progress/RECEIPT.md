# smell-read-private-index-progress: the row's subject is not on this machine

- The row's own label: "smell/probe script read-private-index-progress.mjs"
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/read-private-index-progress.mjs`
- The prior receipts for this row:
  `docs/runs/family-row-conversion-2026-10-22/smell-read-private-index-progress/`,
  `docs/runs/smell-row-conversion-r5b-2026-10-24/smell-read-private-index-progress/`,
  and the round six summary `docs/runs/smell-row-conversion-r6-2026-10-25/README.md`
- The tree: `c17906dbb39220a3dd1bcd58847d0fa0d1c9696b`, the newest pushed tip
  of `deploy/full-candidate-20261101`, which is the tip this branch starts
  from.

## Verdict: named, not closed. The subject artifact does not exist on disk.

## The mechanism, in one sentence

The instrument opens one deck, read only, with `fileMustExist`, and reports
whether the `decko_nest_edges` table exists in it and how many edges it
holds; that deck is the built clone that carried the index experiment's
cache, it lived under the pinned checkout's runtime tree, and that tree is
gone.

## What this lane measured

    $ ls C:/localProjects/decko-edge-verification-b00a4503/.runtime/
    private-cql-6f960810-bundle/
    private-normalized-nest-index-a253-20261019/

    $ ls C:/localProjects/decko-edge-verification-b00a4503/.runtime/private-nest-index-a253-20261019/
    ls: cannot access '...private-nest-index-a253-20261019/': No such file or directory

The directory the instrument opens is absent, so the instrument cannot reach
its own first read. The round five-b lane recorded the same refusal with the
error text (`TypeError: Cannot open database because the directory does not
exist`), and the round six summary named the same reason.

## What would close it

The built clone with its `decko_nest_edges` cache, byte restored, at the path
the instrument opens. Re-running the index experiment produces a NEW
artifact, not the recorded one, so it is not this row's subject and this lane
did not present it as one. The alternative closure is an operator decision to
accept the experiment's own build record as the row's answer.
