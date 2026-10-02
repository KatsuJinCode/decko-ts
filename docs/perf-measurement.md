# decko-ts performance measurement — how we measure

The "how we measure" doc decko-commons/decko#1282 committed to (Gate 4
nesting benchmark, Gate 6 Cloudflare metrics). Every number below cites
the file or run that produced it. No marketing voice; measurements only.

## 1. The four-parity measurement story

Four layers of behavioral parity with the Ruby oracle
(`docs/oracle-harness.md`, oracle app at
`tools/oracle/decko-oracle-app/` against card 1.110.0 / decko 0.20.0 /
SQLite + portable MariaDB for the `match` rung). Each layer has a
mechanical measure, a recorded provenance doc, and an authoritative
artifact path.

| parity layer | what "parity" means here | authoritative measure | recorded in |
| --- | --- | --- | --- |
| **A. persistence** | card save/delete/rename/revision/reference state reproduces Ruby's `Card::Act` + `Card::Action` + `Card::Change` + `Card::Reference` chain | corpus replay through the landed TS handlers; write conformance over the 8 Ruby scenarios; migration determinism on the 606k-row deck | `docs/parity-ledger-2026-09-22.md` rows "fetch layer + key parity", "write conformance", "migration parity + determinism" |
| **B. semantics** | names, rules, permissions, types, nests, views, CQL produce the same answers Ruby would | oracle-replay harness (`docs/replay-harness.md`); `replayEntries(entries, registry)` byte-compares TS output vs captured Ruby truth; CQL MySQL `match` rung + structure-corpus full 465-entry sweep | `docs/parity-ledger-2026-09-22.md` PROVEN table; `tests/card/render/structure-corpus-replay.test.ts`; `tests/cql/oracle-match-replay.test.ts` |
| **C. rendering** | HTML / JSON / CSV / XML output is byte-identical to Ruby's | corpus-v2 replay (`benchmarks/corpus-v2/replay-shard.bench.ts`) — replays 48 shards, 47,235 live cards, every captured card record AND every captured rendered view, byte-comparing to the Ruby oracle; denied views are judged against the captured anonymous viewer; nothing is skipped | shard smoke 2026-09-22: 999/999 card records resolved (857 byte-exact + 142 structure-pending); 3,242 rendered views → 2,831 byte-exact (87.3%) with the rest classified into the documented failure classes, every one of them fixed and proven (`docs/parity-ledger-2026-09-22.md` "Failure classes found → their resolutions") |
| **D. side effects** | events, emails, jobs, notifications, permissions, cache invalidation reproduce Ruby observed side effects | notify suite (`tests/card/notify/follow-notify.test.ts` etc.) against `fixtures/captured/follow-notification.json` (mail bytes) — proven byte-exact; permissions suite (`tests/card/render/permission-corpus-replay.test.ts`) proven byte-exact on read-permission denial bytes; `tests/card/actions/notify-save-path-wiring.test.ts` covers the engine seams + deck template resolver + interpolation resolved/unresolved split (commit `7a1ca6c`) | `docs/parity-ledger-2026-09-22.md` rows "read-permission denial bytes", "follow-notification mail bytes (real capture)"; `docs/notify-port-notes.md`; `docs/permissions-port-notes.md` |

The standing ledger is `docs/parity-ledger-2026-09-22.md`: a point-in-time
record whose PROVEN rows name the command or file that produced each
measurement. Regression protection is the standing test net
(`tests/standing-net.json`), not a once-only re-run.

## 2. The performance harness

The committed run target for the perf harness:

```
npx vitest run benchmarks/perf/render-perf-harness.test.ts
```

**Status (landed 2026-09-23, all four budgets green):**
`benchmarks/perf/render-perf-harness.test.ts` exists and passes —
`overall_pass = true`, harness wall 27.1 s (was 70.8 s before the
reference-key fix below). Measured workloads
(`benchmarks/results/perf/render-perf.json`):

| workload | measured | budget |
| --- | --- | --- |
| warm-render-sample (60 shard-0 entries, pass-2 avg) | **6.05 ms/entry** | 25 |
| pathological-class (id=641 `tgpqpf+uiqxodma` :closed) | **9 ms** | 2000 |
| statement-discipline (warm render statements) | **7** | 10 |
| closureWarm-coverage (cold cards after prewarm) | **0** | 0 |

The harness is a budget tripwire, not a byte-parity oracle and not part
of `npm test` (`benchmarks/perf/README-perf-harness.md`).

Run by hand today, alongside the harness, the additional
probes and instruments are:

| instrument | path | what it measures |
| --- | --- | --- |
| warm per-entry probe | `benchmarks/corpus-v2/perf-probes-2026-09-21/warm-entry-probe.test.ts:11` | prewarm ms + per-entry wall-ms + `lastRenderStats` (batches, statements, fallbackRounds, cards); `closureWarm` cold-card audit |
| cold/warm depth sweep (M3) | `tests/card/render/depth-sweep.test.ts:32` | every depth 1..42, RTs, statements, cold + warm wall-ms; writes `benchmarks/results/depth-sweep-ts.json` |
| slow-entry profiler | `benchmarks/corpus-v2/render-perf-diagnosis-probes-2026-09/slow-entry-profiling.test.ts` | per-entry SQL-vs-JS split, prefetch re-run detector, slowest SQL shapes, EXPLAIN QUERY PLAN of the walk |
| shard replay (M1) | `benchmarks/corpus-v2/replay-shard.bench.ts` | full corpus replay; per-entry timing in the result JSON |

## 3. The CPU profile runner

**`benchmarks/perf/profile-once.mjs`** (landed 2026-09-23) — re-spawns
any program under `node --cpu-prof`, parses the flushed `.cpuprofile`,
and prints the top 15 self-time frames with `(program)/(root)/(idle)`/
garbage-collector frames filtered:

```
node benchmarks/perf/profile-once.mjs ./node_modules/vitest/vitest.mjs \
  run --root . benchmarks/perf/render-only.test.ts
```

`benchmarks/perf/render-only.test.ts` is the paired workload (prewarm +
one render of the huge-content `tkxqkflwgtb:closed` entry, nothing else).
Caveat, documented in `benchmarks/perf/README-cpu-profile-runner.md`:
vitest's transform pipeline bundles the engine into one chunk and V8
loses original function names, so engine frames do not surface by name
through vitest — run a plain `.mjs` workload (or filter the profile by
URL) to isolate engine hot functions.

Older scratch runners under
`benchmarks/corpus-v2/perf-probes-2026-09-21/`:

- `cte-planner-profile.mjs` — runs the recursive-CTE `resolved`
  composition directly against `benchmarks/corpus-v2/bench-corpus-v2.sqlite3`
  in three phases selected by `process.argv[2]`:
  - `plan` → `EXPLAIN QUERY PLAN` over the CTE (lines 31–38).
  - `count` → materializes the resolved set, prints `ms` + `rows`
    (lines 39–42).
  - `count-cross` → same with `CROSS JOIN` arms (forced join order),
    to expose planner reordering (lines 43–63).
  - `jsize` → junction/simple-keyed counts and top hubs (lines 64–73).

  Run: `node benchmarks/corpus-v2/perf-probes-2026-09-21/cte-planner-profile.mjs <phase> <cap>`
  (e.g. `node .../cte-planner-profile.mjs plan 2`).
- `cte-nullkeys-profile.mjs` — companion scratch; consult the file
  header for the exact phase set.

Both are scratch instruments: `slow-entry-profiling.test.ts:1-7`
records that they are read-only against the corpus DB and exist
alongside the production fix. V8 `.cpuprofile` artifacts from prior
runs live under
`benchmarks/corpus-v2/perf-probes-2026-09-21/cpu-profiles/`
(currently two captures dated 2026-09-21 22:04:42). For a fresh
profile, take a Node 20+ `--cpu-prof` run against
`benchmarks/corpus-v2/perf-probes-2026-09-21/slow-entry-profiling.test.ts`
(which already builds a `RenderEngine` over a seeded shard-0 subset and
calls `engine.render(name, view)` per entry) and load the resulting
`.cpuprofile` in the Chrome DevTools Performance tab or `node --prof`.

## 4. M3 query-cost result (the depth sweep)

Authoritative artifact: `benchmarks/results/depth-sweep-ts.json`
(written by `tests/card/render/depth-sweep.test.ts:103-128`).

Measured 2026-09-23T02:03:44.978Z. Environment: local better-sqlite3
over production-schema DDL; synthetic chains.

| axis | result | source |
| --- | --- | --- |
| TS round_trips (cold) | **5**, every depth 1..42 | `depth-sweep-ts.json` `ts_constant.round_trips`; structural assertion at `tests/card/render/depth-sweep.test.ts:94` |
| TS statements (cold) | **11**, every depth 1..42 | `depth-sweep-ts.json` `ts_constant.statements`; structural assertion at `tests/card/render/depth-sweep.test.ts:98` |
| TS round_trips + statements (warm) | **0 + 0** on second render of same chain in same engine instance | `depth-sweep-ts.json` rows `warmRoundTrips` + `warmStatements`; structural assertion at `tests/card/render/depth-sweep.test.ts:100` |
| Ruby baseline | `depth + 3`: {1:4, 2:5, 4:7, 8:11, 16:19} | `depth-sweep-ts.json` `ruby_measured_truth.table`; measured by `benchmarks/run_ruby_bench.rb` and recorded in `benchmarks/results/ruby-nesting-r1-r2.json`. Depth 32 hard-capped by `Card.config.max_depth=20` with `'Man, you're too deep'` `UserError` (`depth-sweep-ts.json` `ruby_measured_truth.formula`). |
| Cold wall-ms on synthetic chain | 4.842 – 23.868 ms across depths 1..42 | `depth-sweep-ts.json` rows `coldWallMs` |
| Warm wall-ms on synthetic chain | 0.298 – 4.767 ms across depths 1..42 | `depth-sweep-ts.json` rows `warmWallMs` |

TS reduces query count relative to Ruby at the measured depths
(`depth-sweep-ts.json` `ts_reduces_query_count_by`):

| depth | Ruby | TS | ratio (Ruby/TS) |
| --- | --- | --- | --- |
| 1 | 4 | 5 | 0.8 |
| 2 | 5 | 5 | 1.0 |
| 4 | 7 | 5 | 1.4 |
| 8 | 11 | 5 | 2.2 |
| 16 | 19 | 5 | 3.8 |

So TS is constant in depth; Ruby's per-render cost grows as `depth+3`.
Constant composition (from `tests/card/render/depth-sweep.test.ts:90-98`):
5 round-trips = root fetch + closure batch + 3 rule-lookup candidates
(`*self+*open`, `*all+*open`, …). 11 statements = 1 root + 2
closure-batch walk statements + 3 folded read-permission statements +
1 folded codename codehash (rule id resolution) + 1 folded
structure-rule universe + 3 rule lookups. The rule chain walk is
per-`(card, view)` cached after first render; warm renders therefore
stay at 0/0. The round-trip + statement totals do not vary with depth;
`depth-sweep-ts.json` is the source of truth for the constants.

## 5. Gate 6: worker-metrics recorder

`deploy/src/worker-metrics.ts` is the per-request + isolate-aggregate
metrics recorder specified by Gate 6 of the upstream proposal
(`docs/upstream-1282-external-critical-review-fulltext.md`
lines 137–139). Wired into the Cloudflare Worker fetch handler
(`deploy/worker.ts`); the architecture comment is at
`deploy/src/worker-metrics.ts:6-22`:

```
Worker fetch handler
  -> recorder.startRequest(route)
  -> recorder.observeQuery({...})  for each engine query
  -> recorder.endRequest(status, wallMs)               (always, even on error)
  -> recorder.getAggregate() for GET /__metrics
```

Public surface (file:line):

| symbol | purpose | line |
| --- | --- | --- |
| `MetricsRecorder` | per-request + aggregate counters + two histograms | `worker-metrics.ts:311` |
| `RequestMetrics` | one-request shape: `seq`, `route`, `status`, `wallMs`, `cpuMs`, `rowsRead`, `rowsWritten`, `queryCount`, `coldStart`, plus estimate counters | `worker-metrics.ts:84` |
| `AggregateMetrics` | isolate snapshot: `sinceIso`, totals, both histograms with p50/p95, `coldStarts`, `memory: { available: false, reason: "..." }`, `recent` tail | `worker-metrics.ts:116` |
| `Histogram` + `histObserve` + `histQuantile` | fixed-bucket wall-time histograms with linear-interpolation quantiles | `worker-metrics.ts:159-222` |
| `HISTOGRAM_BUCKET_EDGES_MS` | bucket edges `[0,1,2,5,10,20,50,100,200,500,1000,2000,5000]` ms; `HISTOGRAM_MAX_MS = 5000` | `worker-metrics.ts:150-157` |
| `wrapDriverWithMetrics(driver, recorder)` | wraps `CloudflareD1Adapter`; preserves engine return shape, observes between driver-return and caller; errors count toward `queryCount` | `worker-metrics.ts:466-551` |
| `estimateRows(sql, rowsAffected, returnedRowCount)` | SELECT returns `0 / 0 exact:false` (the real rows-read is unknowable from outside D1); INSERT/UPDATE/DELETE/REPLACE returns `0 / max(0, rowsAffected) exact:false` | `worker-metrics.ts:256-286` |
| `renderMetricsHeader(metrics)` | compact `X-Render-Metrics` header: `cpu=`, `wall=`, `rowsRead=`, `rowsWritten=`, `queries=`, `cold=`, `estReads=`, `estWrites=` | `worker-metrics.ts:560-573` |
| `buildMetricsResponse(request, recorder)` | `GET /__metrics` JSON endpoint; 405 on non-GET | `worker-metrics.ts:580-599` |
| `MetricsRoute` | closed set of route tags: `/`, `/_status`, `/api/query`, `/__metrics`, `/<card-name>`, `/<card-name>.json`, `other` | `worker-metrics.ts:59-66` |

Honest disclosures (file header, `worker-metrics.ts:24-48`):

1. **CPU vs wall time.** Cloudflare Workers has no in-isolate CPU-time
   API (V8 isolates do not expose process times; `performance.now()` is
   the only monotone clock). The recorder returns `cpuMs === wallMs`
   on this runtime and labels the equivalence in the `accounting`
   block so a reader is not misled. The shape is API-compatible with
   the Gate 6 list and a future CPU-capable runtime can swap in real
   numbers without changing the wire.
2. **D1 rows-read/rows-written.** The wrapper prefers
   `CloudflareD1Adapter SQLQueryResult.rowsRead / rowsWritten` (which
   forward `meta.rows_read` / `meta.rows_written` when the runtime
   surfaces them — production D1 does). When the provider omits the
   value (workerd's local D1 emulation, or a future runtime change),
   the estimator fires and the observation is flagged `exact: false`.
   `SELECT` reports `0` for `rowsRead` because the real scan count is
   unknowable from outside D1 (the file header is explicit: "honest
   answer: 0 (don't lie)").
3. **Memory.** `performance.memory` is Node-only; `measureUserAgentSpecificMemory`
   requires cross-origin isolation. The aggregate's `memory` field is
   fixed `{ available: false, reason: "..." }` so callers always see a
   real shape they can pin.
4. **Isolate lifetime.** Isolates are ephemeral; the warm cache
   promise means a single isolate can serve thousands of requests,
   but cold isolates start over. `sinceIso` resets whenever the
   recorder is created; the endpoint says so explicitly.

The recorder is wire-tested end-to-end under workerd by
`tests/deploy/deploy-worker-miniflare.test.ts` (M2 deploy acceptance:
bundles `deploy/worker.ts` with the same `node:crypto` alias
`deploy/wrangler.toml` declares, boots miniflare, applies
`deploy/migrations/0001-schema.sql` + `deploy/seed/seed.sql`, and
exercises every route over HTTP).

## 6. Known-open (honest, no claims)

- **RESOLVED 2026-09-23 — the pathological huge-content class.**
  Root-caused and fixed in two commits:
  1. `applyStructureContent` awaited up to 4 fetches per compound card
     even on cache hits (~150k microtask hops per render, measured
     26–33 s on the 47k-card deck); the sync
     `structurePatternInputForSync` path replaced it — cold-equivalent
     `applyStructureContent` 33,495 ms → **1,072 ms**, full closed-view
     render 27,339 ms → **896 ms**, warm 7–24 ms
     (`tests/card/render/closed-view-structure-content-bench.test.ts`,
     byte parity asserted modulo the random data-slot-id).
  2. `cardReferenceKeys` kept nest view options in reference keys
     (`*head|core`), so `closureWarm` missed every template reference
     and 26/1000 shard-0 cards stayed cold, forcing cold closure walks
     (the harness's "one outlier per run" at 4.6–5.5 s); the resolved
     card is the pre-pipe name — cold cards after prewarm: **0**, warm
     sample avg 6.05 ms/entry
     (`src/card/render.ts` `cardReferenceKeys`,
     `benchmarks/results/perf/render-perf.json`).
  Shard-0 replay regression check after both fixes: renders 2850/3242
  realFail 391 — identical classifications to the pre-fix commit
  (byte-neutral, perf-only). The `warm-entry-probe.test.ts`
  `ReferenceError: sample is not defined` (line 59) is also fixed; the
  probe collects cleanly again.
- **Perf harness — LANDED 2026-09-23** (§ 2), all four budgets green.
- **Sandbox/prewarm boundary — RESOLVED** by the same reference-key
  fix (closureWarm-coverage budget: 0 cold).
- **Oracle render parity coverage at capstone.** The 87.3%
  byte-exact figure for shard-0 is a snapshot from the smoke run
  (`docs/parity-ledger-2026-09-22.md` lines 38–40). The capstone 48-shard
  run replaces it once W1–W6 land; per capstone doctrine it runs once,
  not as a development loop. Number above is the most recent measured
  state.

## How to read this doc

- Numbers: every number cites the artifact it came from. If the
  citation is `depth-sweep-ts.json` or `ruby-nesting-r1-r2.json`,
  those files are the source of truth and this doc only summarizes.
- Methods: the four-parity story in § 1 is the verification
  architecture; § 2 is the perf instrument that should exist; § 3
  is the manual CPU profiler entry points; § 4 is the M3 result;
  § 5 is the Gate 6 recorder.
- Status: the perf harness is landed (§ 2); the pathological class is
  fixed (§ 6, first bullet, with the two mechanisms and their measured
  before/after).

## 7. Live deployment measurement (first numbers)

2026-09-23, worker version `d9a3e8c7` deployed as the `decko-ts-demo`
Worker on the demo account — the synthetic 15-card demo deck (zero real
content, per the CF data rule). Client numbers from a workstation include
network RTT to the edge.

| measure | value |
| --- | --- |
| server-side engine wall (warm) | **p50 0.5 ms / p95 0.95 ms** (`/__metrics`) |
| full page render, client | p50 247 ms / p95 583 ms |
| record JSON, client | p50 227 ms |
| CQL query, client | p50 250 ms |
| cold first hit | 559 ms |
| errors | 0 of 56 requests |
| D1 rows read | 1160 across the probe isolate, 0 written |

Toy scale — the real-scale numbers come from the anonymized-deck
deployment (tools/corpus-anonymizer round).
