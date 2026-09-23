# CPU profile runner — `benchmarks/perf/profile-once.mjs`

A one-command wrapper around `node --cpu-prof` that runs any
`<workload>`, parses the `.cpuprofile` V8 flushes on exit, and prints
the workload's wall-ms alongside the **TOP 15 self-time frames**
aggregated by `functionName`. Zero dependencies beyond node builtins.

## What it does

1. Spawns `<program> [args...]` as a child process with V8 flags
   `--cpu-prof --cpu-prof-dir=<abs-path> --cpu-prof-name=<tag>.cpuprofile`.
2. Times the workload (`Date.now()` brackets around the spawn).
3. Waits for V8 to flush the `.cpuprofile` on exit.
4. Parses the JSON, sums `hitCount` per `functionName` across all nodes
   with that name (V8 splits call sites into separate nodes; we collapse
   them), drops `(program)` / `(root)` / `(idle)` / garbage-collector
   frames, sorts descending, takes 15.
5. Prints:

   ```
   wall-ms: <number>
   profile-file: <abs path>
   profile span: <ms> (samples=<n>, nodes=<n>)
   top 15 self-time frames:
     <ticks>  <pct>%  <functionName> @ <url>
   ```

The wrapper exits with the workload's exit code so CI sees the right
status. The `.cpuprofile` is parsed on **every** exit (V8 flushes
profiles on exit regardless of exit code — exit-1 tests still get a
profile).

## Usage

```sh
node benchmarks/perf/profile-once.mjs <program> [args...]
```

The validation harness for the shard-0 huge-content entry is
`benchmarks/perf/render-only.test.ts` (a stripped-down mirror of
`benchmarks/corpus-v2/perf-probes-2026-09-21/warm-entry-probe.test.ts`
— prewarm + one render, no closureWarm audit, no repeats, no
lastRenderStats formatting). The wrapper invocation:

```sh
node benchmarks/perf/profile-once.mjs \
  ./node_modules/vitest/vitest.mjs run --root . \
  benchmarks/perf/render-only.test.ts
```

A measured run on 2026-09-22 (the validation call):

- wall-ms: **47473**
- profile span: **47412.1 ms** (samples=30583, nodes=949)
- target card: `tkxqkflwgtb:closed`
- prewarmMs=23654, renderMs=20186
- top frame: `spawn @ node:child_process` (333 hits, 73.5% of top-15
  total) — V8 profiles the **entire** wrapped process, so the worker's
  forking (vitest pool), the better-sqlite3 binding, the TypeScript
  transform pipeline, and the engine itself all appear. Filter for
  `url` substrings matching your code under `src/` or `tests/` to
  isolate the engine burn — the profiler does not pre-filter because
  the spec asks for the raw top-15 by `functionName` only.

## Why hitCount, not samples or timeDeltas

V8's `.cpuprofile` exposes three sample-shaped signals:

- `samples[]` — leaf node-id at each V8 sampling tick.
- `nodes[].hitCount` — leaf-sample count for that node.
- `nodes[].positionTicks[]` — line-level breakdown of `hitCount`.

`hitCount` is the spec's aggregation key: it is what V8 reports as
self-time on a node. Multiple nodes with the same `functionName`
(different call sites / URLs) get summed. `positionTicks` is added
*on top* of `hitCount` when it exceeds the node's hitCount — V8's line
attribution occasionally breaks down a single hit into many ticks for
hot lines, and the task spec asks for self-time so the granularity
matters.

The exit code of `<workload>` is propagated verbatim; `process.exit(0)`
on clean run, `process.exit(N)` on failure. Tests that throw after
their hot path (the warm-entry-probe has a known `sample` undefined
typo at line 59 that fires after the 31 s render completes) still get
their `.cpuprofile` parsed because V8 flushes on every exit.

## Files

- `benchmarks/perf/profile-once.mjs` — the wrapper (211 lines,
  builtins-only).
- `benchmarks/perf/render-only.test.ts` — the validation harness
  (63 lines, mirrors `warm-entry-probe.test.ts` minus the noise).

## Output files

The `.cpuprofile` is written to `<cwd>/tmp-cpu-profile/`. Each run
gets a unique name `<profile-once>-<pid>-<date-ms>.cpuprofile`. Pass
`--cleanup` to remove the file after parse:

```sh
node benchmarks/perf/profile-once.mjs --cleanup <program> [args...]
```

Otherwise the file stays for inspection in Chrome DevTools
(Performance → Load profile) or for diff against a prior run.