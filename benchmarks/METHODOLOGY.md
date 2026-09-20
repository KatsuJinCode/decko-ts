# Benchmark methodology (decko-commons/decko#1282)

This directory is the benchmark program for the decko-ts port. Upstream
proposal decko-commons/decko#1282 commits to two things: (1) response-time
comparison of the Ruby and TypeScript engines on the same decks, and
(2) deep-nesting/recursion curves proving that page renders cost a constant
number of queries regardless of depth. This document maps each commitment to
a concrete measurement, its harness, and its artifacts.

## The iron rule: no cross-environment claims without environment context

Every results file emitted under `benchmarks/results/` carries a full
`environment` block: host CPU model, RAM, OS, engine and language versions,
DB engine, database path and on-disk size, and live card count of the
database under test. A number whose artifact lacks that block is not a
benchmark result and must not be quoted. Cross-environment comparisons
(Ruby vs TS) are only made between artifacts that each carry their own
environment block; the comparison itself always references both blocks.

## Commitment map

### R1 -- queries per render vs nesting depth (the N+1 proof)

Claim under test: Ruby Decko issues more SQL queries per page render as
inclusion nesting depth grows (per-level re-lookup), while the TS engine
costs a constant number of queries regardless of depth.

- Harness (Ruby): `run_ruby_bench.rb` -- seeds inclusion chains (depths
  1, 2, 4, 8, 16, 32) and fans (fan-outs 1, 4, 16) into the existing oracle
  app under the distinctive `BenchR1` prefix, then renders each root N
  times. SQL query count comes from `ActiveSupport::Notifications` on
  `sql.active_record` (SCHEMA events counted separately). Two modes:
  - **cold** (`Card.cache.reset` before every fetch+render): the full query
    path; this is the R1 headline.
  - **warm** (cache-hot render): the process steady state; measured because
    it is what a long-running process actually serves.
- Harness (TS): `run_ts_bench.ts` registers the identical shapes and calls
  the same metrics through a handler registry. Until the render engine
  lands, handlers are PENDING and the harness emits
  `status: "PENDING"` artifacts -- never fabricated numbers.
- Artifact: `results/ruby-nesting-r1-r2.json`, later
  `results/ts-nesting-r1-r2.json`, then a joint
  `results/r1-comparison.json`.
- Known engine fact (measured 2026-09-19, see results JSON): Ruby Decko
  caps nest depth at `Card.config.max_depth` (default 20) and raises
  `Card::Error::UserError` ("Man, you're too deep") beyond it. Shapes past
  the cap are recorded results, not crashes. The port must replicate the
  guard and the benchmark records it either way.

### R2 -- wall-clock per render vs nesting depth

Same runs as R1 (same shapes, same renders); the wall-clock milliseconds
are recorded next to every query count. R2 is never quoted without its
environment block (hardware dominates wall-clock; query counts are
hardware-independent). Artifact: same JSONs as R1.

### R3 -- CQL suite latency at production scale

- Query shapes: the 11 canonical queries in `fixtures/captured/cql-basic.json`
  (exact name, left/right/plus conditions, type with sort/limit/dir, `not`,
  exact content, created_by, empty result, and the `match` sentinel).
- Scale: the sanitized corpus `corpus/bench-corpus.sqlite3` --
  47,235 live cards (49,829 rows incl. trash), 556,526 card_references rows,
  the full inclusion graph with ids preserved. Built by
  `sanitize_corpus.py` from the Culturesmith production dump; verified by
  `verify_sanitized.py`; see `docs/benchmark-corpus-report.md` for the
  fidelity and content-absence proofs. On-disk size of the corpus DB is
  part of the environment block of every R3 artifact.
- Measurement: each query shape is run K times (median reported), with the
  same warm/cold cache distinction as R1. Ruby side runs the shapes through
  `Card.search` in the oracle app; TS side through the CQL engine once it
  can execute them.
- Status: corpus ready; Ruby/TS measurement runs are the next wave.

### R4 -- CPU-ms per request (published energy proxy)

Per request, wall-clock is decomposed into CPU time (process CPU clock over
the request window) in addition to wall ms; both travel in the same results
artifacts as R1/R2 with the same environment metadata. The published-energy
proxy is CPU-ms, which is less host-noisy than wall-clock; every R4 number
must appear next to its R2 wall number so reviewers can see the gap.

## Files

| file | role |
|---|---|
| `sanitize_corpus.py` | dump -> sanitized, structure-preserving SQLite corpus |
| `verify_sanitized.py` | fidelity + content-absence proofs over the corpus |
| `run_ruby_bench.rb` | R1/R2/R4 Ruby harness against the oracle app |
| `run_ts_bench.ts` | R1/R2/R4 TS harness scaffold (PENDING handlers until wave 3) |
| `corpus/` | bench-corpus.sqlite3 + manifest (gitignored; rebuild on demand) |
| `results/` | committed results JSONs, one per run, each with environment block |

## Reproducing

```bash
# corpus (one-time, ~5 min; reads the 1.2 GB dump once)
python benchmarks/sanitize_corpus.py
python benchmarks/verify_sanitized.py

# Ruby R1/R2 (from tools/oracle/decko-oracle-app)
RAILS_ENV=development bundle exec decko runner \
  C:/localProjects/decko-ts/benchmarks/run_ruby_bench.rb
# knobs: BENCH_RENDER_N BENCH_WARMUP BENCH_BACKGROUND BENCH_OUT BENCH_PREFIX

# TS R1/R2 (wave 3: handlers plug in here)
node benchmarks/run_ts_bench.ts      # currently emits PENDING artifacts
```

The Ruby harness seeds only `BenchR1*`-prefixed cards, never touches
existing fixture cards (oracle-harness contract), renders as Anonymous (the
realistic page path), and deletes its cards afterwards, asserting zero
remaining.

## Known limitations / honest scope

- Ruby depth curves are measured at ~500-card DB scale (default
  `BENCH_BACKGROUND=400`), not at the 47k corpus scale; the depth curve is
  depth-controlled by construction, and `BENCH_BACKGROUND` is the knob for
  scale-sensitivity reruns. Corpus-scale CQL latency (R3) is where the
  corpus itself is in the loop.
- Depth 32 exceeds Decko's `max_depth` guard (20): recorded as an engine
  result, so the Ruby depth curve's measurable range is 1..16 (open view).
- `run_ts_bench.ts` is a scaffold: PENDING handlers, no fabricated numbers.
