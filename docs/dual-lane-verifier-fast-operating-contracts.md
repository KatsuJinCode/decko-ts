# dual-lane-verifier-fast: operating contracts

The behavioral contracts behind `tools/dual-lane-verifier-fast.mjs` —
the fast runner for the dual-lane ground-truth verifier (capture + grade
of the ~10,274-entry expected-v2 corpus against the decko-ts engine).
The tool header states what it does; this page states the contracts and
the failure modes they rule out.

## Kill scoping

Children are killed only by PIDs the runner itself recorded from its own
`spawn()` calls. Two kill paths exist with disjoint root sets:

- `killPhaseTree(pid)` — the per-phase deadline path. Rooted at the
  breaching phase's own recorded PID. Before killing, it snapshots the
  target phase's descendant PIDs (a recursive parent-walk over one
  process table, rooted at that phase's PID alone), taskkills the
  phase's shell PID with `/T /F`, sweeps every snapshot descendant by
  its own PID, then re-checks and reports any residue.
- `killOwnTree()` — whole-runner shutdown only: SIGINT/SIGTERM,
  runner-error, and the residual re-check on the stalled exit. Its root
  set is every child registered via `recordLiveChild`.

INVARIANT: every PID a deadline kill can touch is the breaching phase's
own recorded PID or a process-table DESCENDANT of it — the walk only
descends. A sibling phase's shell is a child of this runner, never a
descendant of another phase's shell, so it is unreachable by
construction, and the kill code never enumerates other phases' PIDs.

Why the process-table sweep exists: `taskkill /T` on the shell PID alone
can miss a grandchild chain that is still spawning (the shell → npx →
vitest → vitest-workers chain observed in practice: the shell died, the
workers survived). The snapshot walks a real process-table listing whose
column separator is an explicit TAB, so the sweep is verifiable: the
KILL-DESCENDANT and KILL-RESIDUE log lines correspond to actual table
rows. A format string that never produced tabs would make the sweep a
silent no-op that always reports clean — that failure mode is covered by
`tools/dual-lane-verifier-fast.kill-scoping.test.mjs`, which exercises
the real kill machinery against real process trees of the same shape the
runner spawns.

## Weight-aware per-phase deadline

The effective deadline of a phase is
`max(--deadline-min, 1.5 × the phase's recorded weight)`, the recorded
weights being a completed full-corpus grade's per-phase durations
(seconds). The flat `--deadline-min` remains the floor; unknown shards
contribute weight 0 (they fall back to the floor); `--flat-deadline`
restores the exact flat behavior for fast stall proofs. Rationale: a
pairing that sits permanently at the flat deadline's edge fails on any
slowdown, losing the whole run to one phase breach.

Per-shard weights split each recorded pair weight evenly across its two
shards. That split is a STATED ASSUMPTION, not a measurement.

## Balanced pairing (group=2, default 48 shards)

Over the full default shard set the schedule is re-paired
heaviest-shard-with-lightest-shard so no phase carries two heavyweight
shards and no phase holds an outsized compute share. `--files` subsets
and `group != 2` keep sorted consecutive grouping, because shards
outside the recorded weight table have no weight. Phase artifacts are
keyed by the phase's shard list (sha8), so a re-paired schedule can
never resume-skip against a previous schedule's per-index artifacts.

## Staged-spec integrity

The canonical verifier spec lives at
`tools/oracle/verify-dual-lane.test.ts`. When the default `--spec` path
(`tmp/raw-ground-truth/scripts/verify-dual-lane.test.ts`, inside the
per-worktree gitignored instrument tree) is used, the runner stages the
canonical copy: a missing copy is staged, a byte-identical copy is kept,
a DIFFERING copy refuses the run. A silently overwritten instrument is
how measurements go wrong. Explicit `--spec` paths are used verbatim.

## Phases and exit codes

A phase = one child vitest invocation grading a small group of shards
(default 2 shards per child, so each child stays inside its heap cap).
Scheduling is purely event-driven off child exit; there are no idle
timers anywhere in the runner.

| code | meaning |
|------|---------|
| 0    | all phases completed AND every `--floors` lane met its floor |
| 1    | completed but floors missed, or a phase crashed / produced no parseable aggregate, or coverage incomplete |
| 2    | a phase breached its hard deadline (stalled); the stalled phase's last output is printed |
| 130  | interrupted (Ctrl-C); own child tree killed first |
