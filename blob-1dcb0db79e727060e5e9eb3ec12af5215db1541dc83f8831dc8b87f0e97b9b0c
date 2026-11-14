# render-perf-harness — the standing render-performance measurement surface

A vitest-driven harness with **named workloads**, each bracketed with
`Date.now`, asserting a **budget**, and writing one structured result to
[`benchmarks/results/perf/render-perf.json`](../results/perf/render-perf.json)
so the next round (and the coordinator's repo-wide tsc) can diff numbers
against the previous round.

## Why this exists

The render-fix stream (2026-09-20) closed the uniform-slow-corpus-render
defect — pre-fix worst entry 172 s,
post-fix worst 697.8 ms, full shard-0 average ~199 ms. That gave the engine
its first measured baseline. The standing question the next round needs to
answer is: **did the next change regress anything?** Without a named
harness that asserts budgets and writes structured output, the answer
would have to be re-derived from scratch every time. This file is the
single source of that answer.

## Run it

```
node node_modules/vitest/vitest.mjs run --root . \
  benchmarks/perf/render-perf-harness.test.ts
```

Wall budget: ~90 s. Seed (~7 s) and prewarm (~10 s on a cold engine)
dominate; the workload phases themselves are under 5 s.

The harness is **not** part of `npm test` (the project's `package.json` test
script runs `vitest run tests/card/`). It runs only when invoked directly.
The coordinator's repo-wide tsc still typechecks it because the project's
`tsconfig.json` includes `benchmarks/**/*.ts`.

## Workloads

Every workload **logs its numbers AND asserts its budget**, so the suite
doubles as a regression gate. A red budget is the signal the gate is
meant to catch — the number is printed either way; nothing is hidden.

### 1. `warm-render-sample`

**What it measures.** Per-entry render cost on a fully prewarmed engine
for the first 60 shard-0 entries, each rendered twice. Pass-1 warms the
in-memory caches (engine closures, render-card map); pass-2 is what we
record — the warm path the engine should hold.

**Budget: < 25 ms/entry** (average over pass-2).

The engine's own constant-shape promise is that a warm render is map
lookups + HTML assembly. The render-fix stream's post-fix measurement
recorded a 199 ms/entry average over the full shard-0 cold path; the warm
path is at least an order of magnitude cheaper. 25 ms/entry is the upper
bound that catches "closure fell back to JS" regressions without being so
tight it flaked on CI.

**Output row shape.**
```json
{
  "name": "warm-render-sample",
  "measured": 1.234,
  "unit": "ms/entry (pass-2 avg)",
  "budget": 25,
  "pass": true,
  "details": {
    "entries": 60,
    "pass1Errors": 0,
    "pass2Errors": 0,
    "warmTotalMs": 4123,
    "median": 1.0,
    "p95": 4.0,
    "max": 12.0
  }
}
```

### 2. `pathological-class`

**What it measures.** Single-render wall-ms of a deliberately
huge-content shard-0 card's `:closed` view on the fully-prewarmed engine.

**Target: card id=641 (`tgpqpf+uiqxodma`).** Picked because it is the
largest `db_content` among shard-0 entries whose captured `:closed` view
is real rendered HTML — not the 76-byte "permission denied" stub the
read-rule layer emits. (`content=15,987 bytes, :closed view=2,540 bytes`,
measured from `fixtures/corpus/shard-000000.jsonl`.)

**Budget: < 2,000 ms.** This is the budget **after** the render-fix
stream landed; pre-fix the uniform-slow defect would have put this at
~4 s+; post-fix the same workload on the full shard-0 average was 199 ms.
2,000 ms is the budget that asserts the fix is still holding AND catches
any future regression that pushes the worst case back into the
multi-second range. **A red budget is asserted and printed** — we never
hide a regression by relaxing the assertion.

**Output row shape.**
```json
{
  "name": "pathological-class",
  "measured": 137,
  "unit": "ms (single render, warm)",
  "budget": 2000,
  "pass": true,
  "details": {
    "id": 641,
    "name": "tgpqpf+uiqxodma",
    "view": "closed",
    "htmlBytes": 2540,
    "lastRenderStats": { "batches": 0, "statements": 0, "fallbackRounds": 0, "cards": 0 },
    "error": null
  }
}
```

### 3. `statement-discipline`

**What it measures.** `lastRenderStats.statements` on a warm render. The
engine's #1282 promise is "constant queries": a warm render is pure map
lookups + HTML assembly, so `statements` should be 0.

**Budget: ≤ 10.** Generous on purpose — a healthy engine reports 0 here.
10 is the threshold at which the budget starts catching "the closure fell
back to JS and ran a SQL walk on every render" regressions while not
flaking on incidental one-statement lookups the engine may legitimately
issue (e.g. a freshly-added codename lookup the prewarm did not prime).

`lastRenderStats` is the public read-only getter on `RenderEngine`
([`src/card/render.ts:168`](../../src/card/render.ts)).

**Output row shape.**
```json
{
  "name": "statement-discipline",
  "measured": 0,
  "unit": "statements (warm render)",
  "budget": 10,
  "pass": true,
  "details": {
    "name": "tkxqkflwgtb",
    "view": "closed",
    "lastRenderStats": { "batches": 0, "statements": 0, "fallbackRounds": 0, "cards": 0 }
  }
}
```

### 4. `closureWarm-coverage`

**What it measures.** After `prewarmStaticDeck` finishes, walk every
shard-0 line's record through the engine's `closureWarm` and count how
many return `false`. `closureWarm` is the private method
([`src/card/render.ts:862`](../../src/card/render.ts)) that returns true
when the engine has the card AND every key its structure could reference
already enriched into the render-card map. The prewarm's contract is that
this returns true for every card after it runs.

**Budget: 0 cold cards.** Anything left cold is the next regression
vector — either a card the prewarm forgot to enrich, or a code path the
prewarm's structural-cast seam does not yet cover.

The cast is the established pattern — see
[`benchmarks/corpus-v2/prewarm-static-deck.ts:39-42`](../corpus-v2/prewarm-static-deck.ts)
for the same seam in the prewarm itself. The mod-engine-host install site
uses the same pattern.

**Output row shape.**
```json
{
  "name": "closureWarm-coverage",
  "measured": 0,
  "unit": "cold cards on shard-0",
  "budget": 0,
  "pass": true,
  "details": {
    "shardLinesScanned": 1000,
    "coldSample": []
  }
}
```

## Result file

`benchmarks/results/perf/render-perf.json` — one object, four `workloads`,
all numbers. Overwritten on every run. Schema:

```jsonc
{
  "measured_at": "ISO timestamp",
  "environment": "human-readable engine + driver description",
  "workload_set": "render-perf/2026-09-22",
  "overall_pass": true | false,
  "total_wall_ms": 12345,
  "workloads": [ /* one WorkloadRow per workload */ ],
  "notes": [ /* free-form timing + provenance strings */ ]
}
```

## What this harness is NOT

- **Not a byte-parity oracle.** The harness measures time and SQL counts
  only. Byte parity with Ruby is the responsibility of the corpus replay
  tests under `tests/card/render/` and `benchmarks/corpus-v2/replay-shard.bench.ts`
  (the replay driver is out of the default suite; see its header to run it).
- **Not a stand-in for the slow-entry profiling.** The
  `benchmarks/corpus-v2/render-perf-diagnosis-probes-2026-09/` directory
  still carries the deep-dive scripts (SQL statement shapes, EXPLAIN QUERY
  PLAN dumps, per-render attribution) — the diagnostic instruments, not
  a gate. Use them when a workload turns red; the harness tells you *that*
  something regressed, the diagnostics tell you *what*.
- **Not part of `npm test`.** It runs only when invoked directly. The
  coordinator's repo-wide tsc still typechecks it (`tsconfig.json`
  includes `benchmarks/**/*.ts`).

## Adding a workload

1. Add a workload block in the `it(...)` body that brackets its body
   with `Date.now()`, records numbers into a `WorkloadRow`, and pushes it
   onto `allRows`.
2. Add a matching `expect(...)` at the bottom (the regression gate).
3. Document the budget and the target entry in this README.
4. Do NOT edit rendered HTML — byte parity is non-negotiable. A fix that
   changes rendered bytes is wrong, full stop.
