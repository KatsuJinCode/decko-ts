import { defineConfig } from "vitest/config";

// Runs ONLY the corpus-v2 shard-replay benchmark (replay-shard.bench.ts in
// this directory) — the 48-shard corpus replay driver that is deliberately
// OUTSIDE the default suite: one it() looping all shards was 88-99% of suite
// wall time, so the p21-suite-definition lane (2026-09-30) renamed it out of
// the default glob and vitest.config.ts excludes it by path. vitest has no
// --include CLI flag (its --exclude is additive-only), so this sibling config
// is the explicit-run mechanism.
//
//   npx vitest run --config benchmarks/corpus-v2/replay-shard.vitest.config.ts
//
// Shard subsetting (unchanged semantics) still works through the env vars the
// driver itself reads:
//   set CORPUS_SHARD=shard-000000.jsonl&& npx vitest run --config benchmarks/corpus-v2/replay-shard.vitest.config.ts
//   set CORPUS_SHARDS=shard-000003.jsonl,shard-000004.jsonl&& npx vitest run --config benchmarks/corpus-v2/replay-shard.vitest.config.ts
//
// test options mirror the landed suite config (vitest.config.ts, p20-suite-speed
// lane) except include/exclude: this file collects exactly the one benchmark.
export default defineConfig({
  test: {
    include: ["benchmarks/corpus-v2/replay-shard.bench.ts"],
    testTimeout: 30000,
    hookTimeout: 15000,
    teardownTimeout: 5000,
    pool: "forks",
    maxWorkers: 4,
    exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
