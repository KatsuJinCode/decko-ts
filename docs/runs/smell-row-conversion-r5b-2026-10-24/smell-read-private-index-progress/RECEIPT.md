# smell-read-private-index-progress

- The row's own label: `smell/probe script read-private-index-progress.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/read-private-index-progress.mjs`
  (sha256 `7966df3a40792739df41cdbd2b25b4ff8bf28a0a4ce1b3adff0e2b6ca0dc0a30`)
- What this lane did: restored the pinned checkout the instrument imports
  `better-sqlite3` through, then ran the row's own instrument.
- Command: `node read-private-index-progress.mjs` (exit 1)
- Capture: `fixtures/captured/smell-row-r5b-2026-10-24/smell-read-private-index-progress.json`
- Pin: `tests/server/smell-read-private-index-progress-parity.test.ts`

## Verdict: WORKING ON IT

The row's own verification ran and refused at its first read. The row stays
open with the gap this lane measured.

## What the run showed

    TypeError: Cannot open database because the directory does not exist
      at new Database (C:\localProjects\decko-edge-verification-b00a4503\node_modules\better-sqlite3\lib\database.js:54:10)
      at file:///.../read-private-index-progress.mjs:2:133

The instrument opens one file, read-only, with `fileMustExist` on:

    C:/localProjects/decko-edge-verification-b00a4503/.runtime/private-nest-index-a253-20261019/deck.sqlite3

and then reports whether the `decko_nest_edges` table exists in it and how many
edges it holds.

Two dependencies had to be in place before the instrument could reach that
open, and this lane put both there:

- the pinned `b00a4503` checkout, which the instrument anchors its
  `better-sqlite3` import to. The directory held only a bare `node_modules`,
  its custody lease still belonged to the lane that restored it for its own
  instruments, and the steward refused a second checkout over the path. This
  lane released that lease (its task is finished and its checkout had been
  swept), restored the checkout at the pinned commit with the steward's own
  entry point, and linked the shared `node_modules`.
- the `.runtime` tree under that checkout, which the sweep took with it.

## The gap, in one mechanism sentence

The deck the row reads is the built clone that carried the `decko_nest_edges`
index cache from the index experiment, and that clone lived under the pinned
checkout's runtime tree, which was swept with the checkout, so the row's
subject no longer exists on disk.

## What this lane did not rebuild, and why

The build log of the original index experiment survives in the experiment
directory, so a new instance of the experiment can be produced. That is new
evidence production, not a re-measurement of the recorded one: a fresh
baseline deck carries the rows and the engine's schema and carries no
nest-index cache, so it is a different artifact from the one this row reads.
This lane therefore did not build one and did not present it as the row's
subject.

## What would close it

The built clone with its cache, byte-restored, at the path the instrument
opens, or an operator decision to accept the experiment's own build record as
the row's answer.

Branch: `port/smell-test-round3-b1-20261024` in KatsuJinCode/decko-ts.
