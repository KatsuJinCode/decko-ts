# Corpus replay performance investigation — 2026-09-21

Scratch probes and profiles from the night the 48-shard corpus replay was
unrunnable, kept as the evidence trail for the prefetch planner fix in
`src/card/render/prefetch.ts` (the unary `+` on the recursive arms' trash
terms). The probe scripts are source-faithful copies of the walk SQL and are
NOT wired into any suite; `cpu-profiles/` holds the V8 profile attempt
(startup-only — the hang blocked profile flush).

## The failure shape

With the enriched single-pass seed (full 47,235-row corpus deck + read-rule
universe + structure universe), one cold render on the seeded deck burned
minutes of CPU. The replay smoke crawled at ~1 entry/second and one
statement-level hang blocked the event loop entirely (timers starved,
console interceptors went silent).

## The differential experiments (the proof)

Same data, same statement, only the index set varied — unbounded
`resolved` composition, in-memory better-sqlite3:

| index set | wall time |
| --- | --- |
| left_id + right_id indexes only | 136 ms |
| engine schema index set (adds trash, name, type_id, unique pair) | 6+ minutes (killed) |
| engine index set + unary `+j.trash = 0` in the recursive arms | 150 ms |

Mechanism: without ANALYZE statistics, SQLite costs an equality on an
indexed column at roughly ten rows. `cards_trash_index` on a column that is
0 for ~47k of 47k rows therefore looks like the cheapest access path for
the recursive arms' `j.trash = 0` term, and the planner abandoned the
left_id/right_id seeks for a near-full scan that re-ran on every recursion
step. The unary `+` is a value no-op that makes the term index-ineligible,
so the seek-driving terms win. Depth caps were measured unnecessary:
bounded (cap 2..8) and unbounded compositions all land at 85k-127k rows /
150-490 ms on the corpus deck (`cte-depth-cap-probe.test.ts` numbers).

## Post-fix end-to-end

- seed (47,235 rows + both rule universes + closure): ~2.4-4.7 s
- first cold render (incl. one-time bootstraps): 4.8 s
- full shard-000000 replay (1,000 lines, 4,241 judged entries incl. every
  previously-skipped denied view): ~40 min, all pins green
  (`replay-full-resultss0.json` in benchmarks/results/corpus-v2/)

## Driver-path probe note

The `driver-path-probe.test.ts` "fetchByName hang" was the same statement
trap seen from the outside (sync better-sqlite3 inside the async driver
blocks the event loop; the in-process watchdog file never got a tick).
`fetchByName` itself is 1-3 ms on this deck (fetch-bisect-probe numbers).
