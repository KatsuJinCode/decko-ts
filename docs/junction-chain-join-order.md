# Stable junction-chain widening plans

The render seating wave resolves compound names of depth three and greater
through their left junctions and simple parts. Its ordinary inner joins let
SQLite reorder independent part tables ahead of the asked card. Without
planner statistics, one serving-schema plan multiplied broad part-table scans
before applying the OR of requested name tuples.

The joins now use SQLite's explicit `CROSS JOIN ... ON` ordering, as the read-rule
closure already does: iterate the asked card first, then resolve its ancestors
and parts by ID. Predicates, bound keys, returned columns, DISTINCT behavior,
chunk size and request count are unchanged. PostgreSQL's existing dialect
adapter translates these hints back into constrained inner joins. The source
change adds no indexes, statistics generation or deployment work.

## Local differential, 2026-10-15

The source was the existing approved 21,670-card deck, SHA256
`623f5fcbfdbdde6e38d6a5b179e33a23c04cd1f4ec35c85779f2ee5ee6c66afd`.
The bounded diagnostic copied it, verified the copied hash, and added the
engine schema's 16 cards indexes on that owned copy only. It did not rebuild,
import or rewrite site data. The source hash was unchanged afterwards.

The captured four-part lookup has 15 tuples / 60 bound keys. On SQLite 3.53.4:

| Planner state | Original query | Fixed query |
|---|---:|---:|
| No sqlite_stat1 | 104,179.5 ms | 108.4 ms |
| After ANALYZE | 145.0 ms | 97.0 ms |

All four responses are byte-identical: the compact result contains zero cards.
This is a pathological missing-chain lookup, not evidence that matching rows
were exercised on the real site. The regression fixture separately exercises
16 matching four-part chains through the actual seating wave, comparing every
returned column with the original join both without and with ANALYZE. It also
checks all 16 rendered bodies and the fixed query plan's ID lookups.

The raw backup without the serving indexes did not reproduce the stall
(65.7 ms original, 51.0 ms fixed). The failure depends on the combination of
schema indexes and absent statistics; the measured repair avoids that
combination's join-order dependency.

## Verification and limits

- 24 focused tests pass: junction-chain plan differential, existing junction
  closure, and PostgreSQL/PGlite driver tests. The new differential additionally
  verifies translation of the actual six constrained joins to PostgreSQL.
- TypeScript checking passes.
- Synthetic-v1 on both `ts` and `ts-composed` passes: rendering 1754/1754,
  semantics 2389/2389, persistence 16/16, side effects 19/19, read writes 8/8,
  other-table steps 12/12. No expectations or normalization rules changed.

These are local development checks, not a candidate release or live-site
acceptance. Bunny's SQLite version, indexes and statistics were not queried.
There were no Bunny/D1 calls, deployments, account changes or raw-deck imports.

`junction-chain-join-evidence.json` records the hashes, query plans, timings
and synthetic summaries. To repeat the bounded query diagnostic, run
`node tools/perf/check-chain-join-plan.mjs <approved-local-deck>
<captured-sql-plus-params> <report.json> db/schema.sqlite.sql`.
It runs each query once per planner state and removes its owned copy in finally.
The supplied capture must contain SQL followed by its JSON parameter array.
The source capture SHA256 for this measurement is recorded in the evidence;
the site's actual name tuples are not embedded in the implementation.

SQLite's documented ordering semantics:
https://www.sqlite.org/optoverview.html#manual_control_of_query_plans_using_cross_join
