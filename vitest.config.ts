import { defineConfig } from "vitest/config";

// 2026-09-30, p20-suite-speed lane. History of this file:
// - 8578394 (2026-09-21) created it to enforce teardownTimeout and stop
//   hanging workers (orphan incident, issue #13): pool:"forks" +
//   poolOptions.forks.singleFork:true.
// - The vitest 5.0.1 upgrade silently killed that config: vitest 4 REMOVED
//   test.poolOptions (deprecation notice fired on every run:
//   node_modules/vitest/dist/chunks/index.DzobfTyw.js:14308), and vitest 5
//   dropped **/dist/** from defaultExclude
//   (node_modules/vitest/dist/chunks/defaults.D2ip7f-X.js), so a bare run
//   executes the tsc-compiled mirror of the whole suite a second time
//   (tsconfig outDir=dist over src/tests/benchmarks): 382 files / 4,838
//   tests instead of the 195-file suite — 23 min 26 s serial baseline
//   (2026-09-30, tmp/wrong-goal-hunt/p20-suite-speed-lane.md).
// - The old singleFork intent (serial files, no leftover workers) is spelled
//   fileParallelism:false in v4/v5 syntax. This config instead adopts
//   BOUNDED parallelism (pool:"forks", maxWorkers:4) — adopted only after the
//   measured gates in the lane receipt: full-run orphan sweep clean + peak
//   RAM recorded. fileParallelism:false is the documented fallback if those
//   gates ever fail.
// - 2026-09-30, p21-suite-definition lane: benchmarks/corpus-v2/replay-shard
//   (the 48-shard corpus replay, one it() looping all shards) is 88-99% of
//   suite wall time — renamed to replay-shard.bench.ts and excluded here so
//   the default suite is the other 194 files (~36 s). Run it explicitly via
//   the recipe in its header (benchmarks/corpus-v2/replay-shard.bench.ts).
export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 15000,
    teardownTimeout: 5000,
    pool: "forks",
    maxWorkers: 4,
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "benchmarks/corpus-v2/replay-shard.bench.ts",
    ],
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
