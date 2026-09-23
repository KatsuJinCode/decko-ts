# Decko Core

Private workspace for the runtime-independent Decko project, with TypeScript
and first-class Ruby support as the architectural direction. The repository
slug remains `decko-ts` while active development continues.

Read the [project contract and work board](docs/core/README.md) and
[commit, push and publication gates](docs/core/governance.md). These govern
future work and supersede conflicting TS-only direction in older notes.

## TypeScript implementation history

TypeScript port of the Decko card engine. Target: full compatibility with
Ruby Decko (card 1.110.0 / decko 0.20.0) for ANY deck — any combination of
mods, cards, and settings. The running Ruby engine is the oracle; the
acceptance criterion is byte-for-byte output parity. Upstream proposal:
decko-commons/decko#1282 (held on this fork until parity + flawless
production run, per the proposal's question 3 recommendation).

---

## Deploy to Cloudflare (one-click)

The M2 deliverable is the one-click Cloudflare demo — same engine code
running on Workers + D1 with a `wrangler deploy` to ship it.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/KatsuJinCode/decko-ts)

> The button above deploys a fresh D1 + Worker stack to your Cloudflare
> account. After the deploy, the URL prints in your terminal.

### Manual deploy recipe (~2 min)

```bash
git clone https://github.com/KatsuJinCode/decko-ts
cd decko-ts
npm install
npx wrangler login                                    # opens browser to your CF account
npx wrangler d1 create decko-ts                       # copy database_id into wrangler.toml
npx wrangler d1 execute decko-ts --file db/schema.sqlite.sql --remote
npx wrangler d1 execute decko-ts --file db/seed.sql --remote
npx wrangler deploy
# → prints https://decko-ts.<account>.workers.dev
```

### Smoke

```bash
curl https://decko-ts.<account>.workers.dev/                  # Home card HTML
curl https://decko-ts.<account>.workers.dev/Hello+World       # the leaf card
curl https://decko-ts.<account>.workers.dev/Hello+World/content
curl https://decko-ts.<account>.workers.dev/api/status        # JSON engine metadata
curl https://decko-ts.<account>.workers.dev/api/card/About    # JSON card metadata
```

### Local dev (no Cloudflare account needed)

```bash
npx wrangler dev
```

Miniflare 5 boots a local D1 in workerd; the engine stays the same.

---

## Layout

- `worker.js` + `wrangler.toml` (repo root) — the one-click Cloudflare
  Workers entry: ESM module that boots the engine on the first request and
  serves HTML/JSON from a D1 binding. This is what the Deploy button ships.
- `deploy/` — the development deploy path: `deploy/worker.ts` (same engine,
  plus per-request metrics: `GET /__metrics`), `deploy/wrangler.toml`,
  DDL migrations (`deploy/migrations/`), seed tooling (`deploy/seed.mjs`,
  `deploy/seed/`), and the local launch/teardown helpers.
- `src/server/` — host-facing layer: SQL/blob driver interface, adapters
  (Cloudflare D1, libSQL-over-HTTP, local SQLite), schema row types.
- `src/card/` — the card engine core ported from the Ruby card gem:
  name algebra, fetch/cache, history, sets/patterns, rendering, the mod
  loader with per-card MRO view dispatch (`src/card/mod-loader/`).
- `src/cql/` — Card Query Language: parser, AST, SQL translation, execution.
- `db/` — schema (SQLite-compatible DDL derived from the production MySQL
  schema: `db/schema.sqlite.sql` for fresh D1s) and seed (`db/seed.sql`).
- `tools/oracle/` — the Ruby oracle harness: a local decko app + capture
  scripts that record Ruby behavior into `fixtures/captured/`.
- `tools/migrate/` — the generalized dump importer (Ruby deck dump →
  decko-ts storage), proven on a 1.2 GB production dump.
- `tools/corpus-anonymizer/` + `benchmarks/` — the corpus program:
  structure-preserving content-free benchmark deck (47k cards / 180k views),
  the anonymized 2x-scale artifact builder, replay + perf harnesses.
- `tools/hygiene/` — publication gates: secret/identity scan (worktree +
  full git object DB), incomplete-work marker scan, docs link check.
- `fixtures/captured/` — the oracle's recorded outputs (committed; they
  are the executable specification).
- `tests/` — vitest suites per subsystem (card, cql, server, deploy,
  migrate, testing, tools) plus worker/Miniflare smoke tests.
- `docs/` — port tracker, per-stream notes, publication plan.

## Test status

Measured 2026-09-23, full `tests/` tree (`npx vitest run tests/`):

```
Test Files  149 passed | 1 skipped (150)
     Tests  2423 passed | 2 skipped (2425)
```

Both skips are documented pending-external (live PostgreSQL, CLI engine
verification). The render-perf harness budgets are currently RED
(warm-render-sample 127.6ms/entry vs 25 budget; 47 cold cards vs 0) — a
regression introduced by the 09-23 fix rounds, under active repair; the
receipt lives at `benchmarks/results/perf/render-perf.json`.

`npm test` runs the card-engine suite (the largest tree); the full tree
runs with `npx vitest run`. Per-stream test counts are noted in
`docs/port-tracker.md`. The renderer includes a depth-sweep test (1..32)
that proves the `#1282` claim: constant queries per render regardless of
inclusion depth.

## Ground rules

- The engine never imports vendor SDKs or branches on provider names.
- Typecheck: `npm run typecheck`. Tests: `npm test` (full tree:
  `npx vitest run`). Both must pass before any commit lands.
- Ruby truth lives in the installed gems on the build machine (Ruby 3.3,
  card-1.110.0, decko-0.20.0) and, for the production schema, the
  SourceDeck mysqldump (identity withheld; see the data rule in
  `docs/port-tracker.md`).
- Data rule: real production-deck content never leaves the build machine.
  Sanitized, content-free structural artifacts (the corpus, the anonymized
  scale deck) are the only derivatives that exist anywhere else.
- Nothing from this repo goes to decko-commons upstream until Julian says
  so.

## Migration status

Landed: drivers (D1/libSQL/SQLite), oracle harness, name algebra, schema,
CQL parser + execution, history, replay harness, benchmark corpus, set-pattern
registry, fetch/cache, renderer with batched inclusion prefetch, rule
application, mod loading with chain-aware per-card view dispatch, request
metrics, the perf harness, and the generalized dump importer.

Full-corpus render parity (the with-mods full-48 replay, 2026-09-23):
164,586 / 180,442 captured views byte-identical (91.4%); remaining
difference mass is classified into three families (permission sentinels,
name-leak positions, mini-bar bytes) with fix rounds queued — see
`docs/final-rounds-to-publication-plan.md` and
`tools/corpus-failure-classes/failure-buckets-withmods48.json`.

Remaining to publication: the three corpus families above, mod view
deepening (1 mod fully ported, 30 registered with partial view coverage),
the PostgreSQL read rung, the one-command migration launch path, and the
publication hygiene rounds (in progress: `tools/hygiene/`). See
`docs/port-tracker.md` for the wave plan + per-stream notes.
