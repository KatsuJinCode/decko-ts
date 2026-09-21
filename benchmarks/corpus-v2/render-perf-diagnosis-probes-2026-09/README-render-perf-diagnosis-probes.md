# Render-perf diagnosis probes (archived 2026-09-21)

One-off diagnostic scripts from the junction-inclusion-prefetch performance
defect (corpus renders taking up to 172 s per entry). The defect was
root-caused and fixed (span-chain walk replacing the numbers-table scan;
see `docs/render-fix-notes.md` for the measured before/after) — these
scripts were the instruments, not the fix, and are kept for provenance.

- `probe-walk-sql.mjs`, `stmt6.txt`, `stmt7.txt` — the recursive-CTE walk
  SQL iterations (resolved/frontier/reached shapes) dumped for inspection.
- `probe-batch.mjs`, `probe-transaction.mjs` — driver batching and
  transaction semantics probes (round-trip counting behavior).
- `diagnose-slow-entry.mjs` / `diagnose-slow-entry.test.ts` — full shard-0
  slow-entry classifier (which entries were slow and why).
- `slow-entry-profiling.test.ts` — subset profiler attributing time to SQL
  vs JS per statement, with prefetch re-run detection.
- `depth2b-clean.log` — sample clean run of the depth-2 constant-shape gate
  after the fix.

None of these are imported by any source, test, or landing gate. They run
only if invoked directly. Not part of the M1/M2/M3/M4 milestone surfaces.
