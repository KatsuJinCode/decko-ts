# decko-ts — one-click Cloudflare Workers + D1 deploy

The M2 harness (docs/port-tracker.md): a [decko-ts](../README.md) engine, a
synthetic demo deck, and this directory. One Worker, one D1 database, no
other resources. Everything in this directory is self-contained — the
local proof runs the real workerd via miniflare with NO Cloudflare account
(see `../tests/deploy/deploy-worker-miniflare.test.ts`).

## Files

| file | role |
| --- | --- |
| `wrangler.toml` | Worker + D1 binding config (`main = worker.ts`) |
| `worker.ts` | thin Workers HTTP entry over the engine (Web-standard only) |
| `shims/node-crypto-shim.ts` | bundle-time replacement for the engine's one `node:crypto` import |
| `sync-migrations.mjs` | regenerates `migrations/0001-schema.sql` from `db/schema.sqlite.sql` |
| `migrations/0001-schema.sql` | the core schema, D1-ready (generated) |
| `seed.mjs` | regenerates `seed/seed.sql` (synthetic demo deck) |
| `seed/seed.sql` | 15 synthetic cards, < 10 KB (generated) |
| `cleanup.mjs` | deletes the Worker + D1 database (`--yes` to execute) |

## One-click deploy (operator: run from `deploy/`)

Requires `npx wrangler login` once (browser). Every command below runs from
this `deploy/` directory.

```sh
# 0. create the database; wrangler prints its id
npx wrangler d1 create decko-ts-demo-db

# 1. paste that id into wrangler.toml -> [[d1_databases]] database_id

# 2. apply the schema (self-contained inside deploy/)
npx wrangler d1 execute decko-ts-demo-db --remote --file migrations/0001-schema.sql

# 2b. ALREADY-PROVISIONED databases only (0001 never re-runs for them):
#     backfill the BINARY key/codename lookup indexes
npx wrangler d1 execute decko-ts-demo-db --remote --file migrations/0002-card-text-binary-lookup-indexes.sql

# 3. load the synthetic demo deck
npx wrangler d1 execute decko-ts-demo-db --remote --file seed/seed.sql

# 3b. planner stats — REQUIRED after seed (useless on empty tables). Without
#     this the SQLite planner probes cards_trash_index (whole deck) for every
#     " AND trash = 0" predicate instead of seeking the key/codename indexes.
npx wrangler d1 execute decko-ts-demo-db --remote --command "ANALYZE"

# 4. deploy the Worker (wrangler bundles worker.ts + the engine)
npx wrangler deploy
```

Smoke checks (replace `YOUR_SUBDOMAIN` — `npx wrangler whoami` / deploy
output print it):

```sh
curl -s https://decko-ts-demo.YOUR_SUBDOMAIN.workers.dev/_status
#    {"ok":true, ... "database":{"ok":true,"card_count":15}}

curl -s https://decko-ts-demo.YOUR_SUBDOMAIN.workers.dev/ | grep "compound depth 4"
#    the Home card renders its inclusion chain 4 levels deep

curl -s https://decko-ts-demo.YOUR_SUBDOMAIN.workers.dev/Home.json
#    the Home card record as JSON

curl -s -X POST https://decko-ts-demo.YOUR_SUBDOMAIN.workers.dev/api/query \
  -H "Content-Type: application/json" \
  -d '{"cql":{"type":"Note","sort":"name"}}'
#    JSON rows: the nine Note cards (six plain + three junctions)
```

Worker routes: `GET /` and `GET /:card-name` (rendered `:open` view HTML),
`GET /:card-name.json` (record JSON), `POST /api/query` (`{"cql":{...}}` ->
CQL result JSON), `GET /_status` (engine + database health).

## Cleanup (zero leftovers)

```sh
node deploy/cleanup.mjs          # prints the plan, touches nothing
node deploy/cleanup.mjs --yes    # deletes the Worker and the D1 database
```

Resources removed: Worker `decko-ts-demo`, D1 database `decko-ts-demo-db`.
That is the complete footprint — no KV, no R2, no queues, no secrets.

## Storage budget

D1 free tier: **5 GB total**, 5 GB per-database. This deploy uses the
schema DDL plus an **8 KB** seed — effectively zero. The demo deck is
synthetic and always will be: no real member content is deployed to
Cloudflare, ever (milestone data rule). **R2 is not used at all** — the
engine stores everything in SQL, and this deploy binds no object storage,
so there are no file uploads and no assets bucket.

## Local proof (no account)

`npx vitest run tests/deploy` bundles `deploy/worker.ts` exactly the way
wrangler does (module alias included), boots it under miniflare's real
workerd with the migration + seed applied through the D1 binding, and
asserts every route. The D1 adapter itself is miniflare-proven separately
(`tests/server/drivers/d1-miniflare.test.ts`, docs/driver-notes.md).

## Regenerating generated files

```sh
node deploy/sync-migrations.mjs   # after db/schema.sqlite.sql changes
node deploy/seed.mjs              # after editing the demo deck definition
```

Both fail loudly if the seed exceeds its 1 MB budget (it is ~8 KB).
