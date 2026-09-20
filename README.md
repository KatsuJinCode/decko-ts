# decko-ts

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

- `worker.js` — Cloudflare Workers entry. ESM module that boots the engine
  on the first request and serves HTML/JSON from a D1 binding.
- `wrangler.toml` — D1 binding + nodejs_compat + main = worker.js.
- `src/server/` — host-facing layer: SQL/blob driver interface, adapters
  (Cloudflare D1, libSQL-over-HTTP, local SQLite), schema row types.
- `src/card/` — the card engine core ported from the Ruby card gem:
  name algebra, fetch/cache, history, sets/patterns, rendering.
- `src/cql/` — Card Query Language: parser, AST, SQL translation, execution.
- `db/` — schema (SQLite-compatible DDL derived from the production MySQL
  schema: `db/schema.sqlite.sql` for fresh D1s) and seed (`db/seed.sql`).
- `tools/oracle/` — the Ruby oracle harness: a local decko app + capture
  scripts that record Ruby behavior into `fixtures/captured/`.
- `fixtures/captured/` — the oracle's recorded outputs (committed; they
  are the executable specification).
- `tests/` — vitest. The 839-test suite covers every landed stream.
- `docs/` — port tracker, per-stream notes.

## Test status (live)

```
Test Files  34 passed (34)
     Tests  839 passed (839)
```

Per-stream test counts are noted in `docs/port-tracker.md`. The renderer
includes a depth-sweep test (1..32) that proves the `#1282` claim:
constant queries per render regardless of inclusion depth.

## Ground rules

- The engine never imports vendor SDKs or branches on provider names.
- Typecheck: `npm run typecheck`. Tests: `npm test`. Both must pass
  before any commit lands.
- Ruby truth lives in the installed gems (C:\Ruby33-x64, card-1.110.0,
  decko-0.20.0) and, for the production schema, the Culturesmith mysqldump.
- Nothing from this repo goes to decko-commons upstream until Julian says
  so.

## Migration status

10 streams LANDED (drivers, oracle harness, name algebra, schema, CQL
parser + execution, history, replay harness, benchmark corpus, set-pattern
registry, fetch/cache, renderer with batched inclusion prefetch).

Remaining: rule application (set-module inheritance walks), mod loading,
mod porting (33 installed card-mods), HTML render parity for remaining
views, response-time harness (Ruby vs TS), migration tool. See
`docs/port-tracker.md` for the wave plan + per-stream notes.
