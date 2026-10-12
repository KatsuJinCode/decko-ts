# decko-ts — one-click Cloudflare Workers + D1 deploy

The one-click deploy target: a [decko-ts](../README.md) engine, a
synthetic demo deck, and this directory. One Worker, one D1 database, no
other resources. Everything in this directory is self-contained — the
local proof runs the real workerd via miniflare with NO Cloudflare account
(see `../tests/deploy/deploy-worker-miniflare.test.ts`).

## Files

| file | role |
| --- | --- |
| `wrangler.toml` | Worker + D1 binding config (`main = worker.ts`) |
| `worker.ts` | thin Workers HTTP entry over the engine (Web-standard only) |
| `src/worker-metrics.ts` | per-request + isolate-aggregate metrics recorder; backs `GET /__metrics` and the `X-Render-Metrics` header |
| `shims/node-crypto-shim.ts` | bundle-time replacement for the engine's one `node:crypto` import |
| `sync-migrations.mjs` | regenerates `migrations/0001-schema.sql` from `db/schema.sqlite.sql` |
| `migrations/0001-schema.sql` | the core schema, D1-ready (generated) |
| `migrations/0002-card-text-binary-lookup-indexes.sql` | backfill of the BINARY key/codename indexes for already-provisioned databases; fresh databases never run it (not generated) |
| `migrations/0003-deck-data-version-stamp.sql` | the `deck_data_version` freshness stamp and its six triggers on `cards` + `card_references` (the `[ENGINE-FRESHNESS]` block of `db/schema.sqlite.sql`). **One of two 0003 files** — see the numbering note below. Idempotent (`IF NOT EXISTS` / `INSERT OR IGNATE`), so it is order-safe against a regenerated `0001` |
| `migrations/0003-demo-seed.sql` | the 4-card demo deck, generated from `db/seed.sql`; this is what the ROOT `wrangler.toml` one-click chain applies. **The other 0003 file** — see the numbering note below |
| `migrations/0004-demo-account-substrate.sql` | the account substrate (`*account` + its four field cards, the `User` cardtype, the Decko Bot and Anonymous actor cards, and Decko Bot's own account). Idempotent — applying it twice inserts nothing. Generated |
| `seed-account-system.mjs` | regenerates `migrations/0004-demo-account-substrate.sql` |
| `migrations/0006-demo-role-substrate.sql` | the role substrate (the `Role` cardtype, `*members`, and all six card-mod-account roles). Idempotent. Generated |
| `seed-role-substrate.mjs` | regenerates `migrations/0006-demo-role-substrate.sql` |
| `migrations/0009-demo-account-read-rules.sql` | the account read rules: the `*all+*read` catch-all (granting Anyone) plus the five `<field>+*right+*read` grants real.yml gives the Help Desk role. Without them the demo deck serves an anonymous requester the owner's password digest, salt and email address. **Applies after 0006** — every row is a `card_references` entry whose referee is the Help Desk role card, and applied earlier those references would name a referee that does not exist. Idempotent. Generated |
| `seed-account-read-rules.mjs` | regenerates `migrations/0009-demo-account-read-rules.sql` |
| `seed.mjs` | regenerates `seed/seed.sql` (synthetic demo deck) |
| `seed/seed.sql` | 15 synthetic cards, < 10 KB (generated) |
| `launch.mjs` | earlier one-command orchestrator, superseded by `scripts/deploy/one-click-deck/`; dry-run/`--local` only, carries no write-budget gate of its own |
| `cleanup.mjs` | deletes the Worker + D1 database (`--yes` to execute) |
| `wrangler.scale.toml` | the separate scale-test Worker + D1 binding (`decko-ts-scale-test`); carries a placeholder `database_id` |
| `cf-scale-deck/seed.sql` | the scale-test deck (2,279 cards + 531 refs), generated |
| `bunny-worker-src/` | the Bunny.net edge variant of the same engine surface — the other edge, not Cloudflare |
| `bunny-origin/` | the VM origin for the Bunny path (server, nginx confs, systemd unit) |

### The migration numbering, which is not a clean sequence

Two gaps and one collision are deliberate. Read this before adding a migration;
the obvious "fix" for each is a bookkeeping break on already-provisioned
databases.

- **Two `0003` files.** `0003-deck-data-version-stamp.sql` and
  `0003-demo-seed.sql` share a number. They are ordered by filename, which is
  the order the deploy chain applies them, and `src/server/deploy-migrations.ts`
  (`DEPLOY_MIGRATION_ORDER`) pins that order. **Do not renumber either one** to
  tidy the sequence: a provisioned database has already recorded `0003` as
  applied, and changing which file that means re-runs the wrong migration.
- **`0007` is reserved and no file carries it.** Already-provisioned
  mirrors record the stamp backfill under the name
  `0007-deck-data-version-stamp.sql` (an alias the migration runner accepts, see
  `DECK_DATA_VERSION_STAMP_APPLIED_ALIASES` in
  `src/server/deploy-migrations.ts`), so a second file numbered 0007 here would
  make their ledgers ambiguous to read. That is why the account read rules
  landed as **`0009`** rather than taking the free `0007`.
- **`0005` and `0008`** are real migrations in the directory
  (`0005-auth-sessions.sql`, `0008-cards-serving-path-indexes.sql`) and are not
  listed in the table above, which documents the generated demo-deck chain. The
  authoritative list is `DEPLOY_MIGRATION_ORDER`, and
  `tests/deploy/deploy-migrations-manifest-contract.test.ts` pins it.

### Which chain is which (they are NOT interchangeable)

This directory's own step list below applies `migrations/0001` +
`migrations/0002` + `seed/seed.sql` — the 15-card DEV deck, whose ids are
1..5, 10..18, 20. The one-click Deploy button applies the ROOT
`wrangler.toml` chain instead: `migrations/0001` + `0002` + `0003` + `0004`,
the 4-card deck plus the account substrate. The two seed files occupy the SAME
ids, so never apply both to one database. `0004`'s own ids start at 1101 so it
is safe on top of either.

## One-click deploy (operator: run from `deploy/`)

Requires `npx wrangler login` once (browser). Every command below runs from
this `deploy/` directory.

```sh
# 0. create the database; wrangler prints its id.
#    The name must match `database_name` in wrangler.toml.
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
curl -s https://YOUR_SUBDOMAIN/_status
#    {"ok":true, ... "database":{"ok":true,"card_count":15}}

curl -s https://YOUR_SUBDOMAIN/ | grep "compound depth 4"
#    the Home card renders its inclusion chain 4 levels deep

curl -s https://YOUR_SUBDOMAIN/Home.json
#    the Home card record as JSON

curl -s -X POST https://YOUR_SUBDOMAIN/api/query \
  -H "Content-Type: application/json" \
  -d '{"cql":{"type":"Note","sort":"name"}}'
#    JSON rows: the nine Note cards (six plain + three junctions)
```

Worker routes: `GET /` and `GET /:card-name` (rendered `:open` view HTML),
`GET /:card-name.json` (record JSON), `POST /api/query` (`{"cql":{...}}` ->
CQL result JSON), `GET /_status` (engine + database health).

## Cleanup (zero leftovers)

The one exception to "run everything from this directory": the cleanup
script names the two resources it removes explicitly (`wrangler delete
--name decko-ts-demo`, `wrangler d1 delete decko-ts-demo-db`), so the
deletions do not depend on which `wrangler.toml` cwd resolves. It is
written repo-root-relative here; from inside `deploy/`, drop the `deploy/`
prefix. It is also the only script here that talks to a real account, and
only with `--yes`.

```sh
node deploy/cleanup.mjs          # prints the plan, touches nothing
node deploy/cleanup.mjs --yes    # deletes the Worker and the D1 database
```

Resources removed: Worker `decko-ts-demo`, D1 database `decko-ts-demo-db`.
That is the complete footprint — no KV, no R2, no queues, no secrets.

## Storage budget

D1 on the free plan: **5 GB of storage per account**, in databases of
**500 MB each** (Cloudflare's published D1 limits, checked 2026-10-02 at
`developers.cloudflare.com/d1/platform/limits/`). This deploy writes the
schema DDL plus an **8 KB** seed — effectively zero against either ceiling.
The demo deck is synthetic and always will be: no real member content is
deployed to Cloudflare, ever (milestone data rule). **R2 is not used at
all** — the engine stores everything in SQL, and this deploy binds no
object storage, so there are no file uploads and no assets bucket.

## Local proof (no account)

`npx vitest run tests/deploy` bundles `deploy/worker.ts` exactly the way
wrangler does (module alias included), boots it under miniflare's real
workerd with the migration + seed applied through the D1 binding, and
asserts every route. The D1 adapter itself is miniflare-proven separately
(`tests/server/drivers/d1-miniflare.test.ts`, docs/decisions/0003-edge-native-driver-interfaces.md).

## Regenerating generated files

```sh
node deploy/sync-migrations.mjs   # after db/schema.sqlite.sql changes
node deploy/seed.mjs              # after editing the demo deck definition
```

`seed.mjs` carries a self-imposed size tripwire: it exits non-zero if the
generated `seed/seed.sql` reaches 1 MB (currently 8,346 bytes). That 1 MB
is this repo's own demo-deck budget, not a platform limit — the D1 free
plan allows far more per database. `sync-migrations.mjs` has no size check
and no error handling at all: it copies `db/schema.sqlite.sql` (minus
`PRAGMA` lines) and `db/seed.sql` byte-for-byte into `migrations/`, prints
both sha256 pairs, and resolves its paths relative to its own location, so
it runs from any directory.
