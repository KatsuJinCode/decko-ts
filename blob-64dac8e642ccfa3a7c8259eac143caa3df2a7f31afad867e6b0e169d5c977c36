# keymap-lane probes (2026-09-23): per-render compound-key resolution

Instruments for the D1 read-cost fix that replaced the whole-deck
`WITH RECURSIVE resolved` universe (4 sites: read-rules.ts, view-task-rules.ts,
set-read-rule.ts, render/prefetch.ts) with per-key resolution. None of these
files are imported by any source; they run only when invoked directly.

- `cte-rows-read-probe.test.ts` — the before/after battery: boots the
  2,279-card Cloudflare targeted deck exactly like the tests
  (db/schema.sqlite.sql + deploy/cf-scale-deck/seed.sql), counts statements /
  recursive CTEs / batches / returned rows per cold and warm render of the
  depth-32 chain root, a plain page, a pointer page, and a denied page; EQPs
  the removed walk statement and the new fragment-restricted resolver; and
  reads universe facts off the corpus db. better-sqlite3 exposes no
  rows-examined counter, so rows-read is accounted per the
  tmp/cf-cost-index-baseline-battery.test.ts concept (EQP-gated upper bound);
  D1-exact meta.rows_read is the lead's remote re-test window
  (X-Render-Metrics rowsRead=).
  Run: npx vitest run benchmarks/corpus-v2/keymap-lane-probes-2026-09/cte-rows-read-probe.test.ts
- `round-shape-scratch.test.ts` — prints the statement log + prefetch stats
  for depth-2/3/4 junction chains, the measured source of the updated pins in
  tests/card/render/junction-depth-closure.test.ts.

Parity baselines (benchmarks/results/corpus-v2/):
- `replay-full-resultskeymap-baseline.json` — 5 compound-heavy shards
  (shard-000004/15/36/37/38) on the PRE-fix tree: records realFail 0,
  renders realFail 1,190 (pre-existing tree classes).
- `replay-full-resultskeymap-after.json` — the same shards on the fixed
  tree; parity gate = identical counts.
