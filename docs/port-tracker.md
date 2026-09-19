# Port tracker

Streams run in waves of parallel agents. Each wave: agents write code +
tests in their OWN directories only, run `npx vitest run` and
`npx tsc --noEmit`, and report. The coordinator reviews, commits, and
plans the next wave. Agents never git-commit and never run npm install
(deps are preinstalled).

## Wave 1 (launched 2026-09-19)

| # | Stream | Owns | Status |
|---|---|---|---|
| 1 | Driver foundation | `src/server/driver.ts` extensions, `src/server/drivers/**`, `tests/server/drivers/**`, `docs/driver-notes.md` | LANDED: local-sqlite + D1 (miniflare-proven, v5/Windows fight solved) + libsql-http (real Hrana v2, transactional batch where provider allows); shared conformance suite passes on all four incl. @libsql/client cross-check; libsql-http batch is non-transactional by provider design (documented) |
| 2 | Ruby oracle harness | `tools/oracle/**`, `fixtures/captured/**`, `docs/oracle-harness.md` | LANDED: all 4 rungs; local SQLite decko app byte-stable (sha-verified); smoke + cql-basic fixtures captured. KEY FINDING: CQL `match` is MySQL/PG-only in Ruby (no SQLite oracle possible — needs a future MySQL rung); port gotchas in docs/oracle-harness.md (json~2.7 pin, tzinfo-data, RichText-named basic cardtype trap, slot-id SecureRandom normalization) |
| 3 | Card name algebra | `src/card/name.ts`, `src/card/name/**`, `tests/card/name/**`, `docs/name-port-notes.md` | running |
| 4 | Schema + SQLite DDL | `db/**`, `src/server/schema.ts`, `docs/schema-notes.md` | LANDED: 12 core tables, DDL proven on better-sqlite3, 10/10 tests (coordinator-reviewed) |
| 5 | CQL parser | `src/cql/**`, `tests/cql/**`, `docs/cql-port-notes.md` | running |

## Wave 1.5 (launched 2026-09-19)

| # | Stream | Owns | Status |
|---|---|---|---|
| 6 | Card history/write path | `src/card/history/**`, `tests/card/history/**`, `docs/history-port-notes.md` | running |
| 7 | Oracle replay harness | `src/testing/**`, `tests/testing/**`, `docs/replay-harness.md` | LANDED: handler contract published (name-engine/cql-engine/render-engine register per-stream; PENDING never fails), slot-id normalization both sides (strict 20-hex), byte-diff with first-diff context, 61/61 own tests, `npm run replay`. Engine streams adopt the contract in their own test files. Deferrals: 11 card/rules-engine entries PENDING until wave 2+; smoke cql_search typed but not replayable (capture recorded no canonical query) |
| 8 | Benchmark corpus + metrics | `benchmarks/**`, `docs/benchmark-corpus-report.md` | running — delivers the #1282 measurement promises: sanitized structure-preserving corpus from the 47k-card production dump (content-free, verified), Ruby queries-per-render depth curves (the N+1 proof), methodology mapping every published commitment to a measured artifact |

## Metrics program (#1282 commitments -> measurements)

- Byte-for-byte parity -> oracle fixtures (LANDED) + replay harness (stream 7)
- Response-time comparison on same decks -> stream 8, R2
- Recursion proof -> stream 8, R1: queries-per-render vs depth, Ruby vs TS (the issue's claim is CONSTANT queries regardless of depth, so the query COUNT is the primary metric, wall-clock secondary)
- Energy claim proxy -> stream 8, R4: CPU-ms per request, environment metadata mandatory per run
- One-click Cloudflare deploy -> measurable when the engine first deploys (wave 3+)
- CQL match parity -> needs a future MySQL oracle rung (SQLite oracle impossible; documented in oracle-harness.md)

## Wave 2+ backlog (planned when wave 1 lands)

- Card fetch/cache layer over the driver (card, card_actions, card_changes,
  card_acts, card_revisions reads/writes).
- Sets, rules, permission resolution (the read_rule machinery the
  Culturesmith migration already mapped from the data side).
- Renderer with batched inclusion prefetch (the scaling fix from #1282:
  constant queries per page render regardless of depth).
- View/format layer parity (:open, :closed, :content, :title...).
- Mod loading + mod compatibility report (feeds the migration tool).
- Migration tool: Ruby dump -> decko-ts import (generalize the proven
  Culturesmith importer).
- Response-time comparison harness (deep-nesting fixtures, Ruby vs TS).
- Mod porting begins (the 33 installed card-mods, priority by Brandon's
  stack: account, bootstrap, ...).

## Definition of done (per stream)

1. `npx tsc --noEmit` clean. 2. `npx vitest run` green. 3. Behavior
grounded in the Ruby source or captured fixtures, with the grounding cited
in the stream's notes doc. 4. Coordinator-reviewed diff committed.
