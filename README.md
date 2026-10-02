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
acceptance criterion is byte-for-byte output parity. That target is not
reached yet: as of the with-mods corpus replay of 2026-09-23, 167,674 of
180,442 captured views render byte-identically — 92.9%, with the remaining
gap broken down under [Migration status](#migration-status) below. Upstream
proposal: decko-commons/decko#1282 (held on this fork until parity +
flawless production run, per the proposal's question 3 recommendation).

---

## Deploy to Cloudflare (one-click)

This is a **Deploy to Cloudflare** button. Click it and the same engine you
read about below runs on Cloudflare Workers against a D1 database in your own
account. You need no terminal, no Node install, and no Cloudflare setup first.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/KatsuJinCode/decko-ts)

### What you see, step by step

1. **You sign in, and you pick the names.** Cloudflare opens a setup page.
   You sign in to your Cloudflare account, then choose — or accept the
   default for — three names: the new repository Cloudflare will create in
   your GitHub account, the Worker, and the D1 database.
2. **Cloudflare copies the source into your account.** Your own copy of this
   repo lands in your GitHub account, so what gets deployed is yours, and you
   can keep developing it.
3. **Cloudflare creates the database.** It reads `wrangler.toml`, finds the
   one D1 binding, creates a fresh database on your account, and writes the
   real database id into the config in your copy. Nothing is shared with
   anyone else's account.
4. **Cloudflare creates the schema, the demo content, and the account
   system, then deploys.** It installs the repo and runs the migrations in
   `deploy/migrations/`: the core schema, a four-card demo deck, then the
   account substrate (card-mod-account's account cards plus the Decko Bot and
   Anonymous actor cards) so the deck has an account to sign in against. Then
   it bundles and deploys the Worker.
5. **You get a URL.** The Worker shows up in your Cloudflare dashboard under
   **Workers & Pages** with a `https://<worker-name>.<your-subdomain>.workers.dev`
   address. Open it and you are in the deck.

Nothing above needs a Cloudflare API token typed into the repo. There are no
secrets in `wrangler.toml` — the deployed Worker reads exactly one thing from
its environment, the D1 binding.

### What you get: a browse-only demo deck

Four cards, already there, that you can read:

| URL | what it is |
| --- | --- |
| `/` | the `Home` card |
| `/Hello+World` | a card with body text |
| `/About` | a card that includes `Hello World` one level down |
| `/api/status` | JSON describing the running engine |
| `/api/card/About` | the same card as a JSON record |

You can browse every card and follow the inclusions, and you can ask for any
card as JSON. **You cannot create or edit cards from the deployed demo**: the
Worker this button ships reads, and has no write path — that is a deliberate
boundary, not a missing feature. The database is yours, so you can add cards
to it yourself with the CLI, or extend `worker.ts` to write; the engine's
write path (rules, history, saves) is where the real product starts, and it is
not what this button turns on.

### Turning the write path on (opt in, off by default)

A deploy from the button is **read-only**: it can show every card and answer
JSON for any of them, and it will refuse every attempt to change anything with
a plain `403`. The Worker does have a full write path — sign-in with a real
D1-backed session, a first-run setup window, and card create / update / delete
— but it is switched off unless you set one of two values in `wrangler.toml`
and redeploy. Nothing is on unless you turn it on, and no secret is involved:
`DECKO_WRITE_PATH = "1"` turns on sign-in and card writes, and
`DECKO_FIRST_RUN = "1"` opens `/setup`, the one-time window that creates your
deck's first account (it needs the write path as well, because creating that
account is itself a card write, and it closes by itself once the account
exists).

```toml
# wrangler.toml
[vars]
DECKO_WRITE_PATH = "1"
DECKO_FIRST_RUN  = "1"
```

Then `npm run deploy` again. `/setup` walks you through creating the owner
account, `/_signin` signs you in, and from then on the write routes accept
your session. Sign-in stores only a SHA-256 digest of the session token in
D1 — the token itself is never written down — and hands you an `HttpOnly`,
`SameSite=Lax`, `Secure` cookie that carries it.

One honest thing to know before you try a card write: the demo deck that
migration `0004` seeds ships **no create / update / delete rights at all**, so
the engine's permission walk refuses every save with a `403`, correctly, for
everybody including you. The route, the session, and the permission check are
all working; the deck is simply not given permission to change itself. Adding
that permission is deck content, so it is yours to add rather than something
this deploy does for you.

### If you would rather use the CLI
The button automates the same two commands, run from the repo root after
`npx wrangler login`:

```bash
npx wrangler d1 create decko-ts   # then paste the returned id into wrangler.toml
npm run deploy                     # = d1 migrations apply DB --remote && wrangler deploy
```

Doing it by hand, the paste in step 1 is yours to make — the id in
`wrangler.toml` is a default for the button to overwrite, not a real database.

`npm run deploy` applies everything in `deploy/migrations/` — schema, indexes,
demo cards, account substrate — and then deploys. The migration command names
the **binding** (`DB`), not the database name, so it keeps working after you
rename the database.

### Smoke (against a deployed Worker)

```bash
curl https://<worker>.<subdomain>.workers.dev/                # Home card HTML
curl https://<worker>.<subdomain>.workers.dev/Hello+World     # the leaf card
curl https://<worker>.<subdomain>.workers.dev/Hello+World/content
curl https://<worker>.<subdomain>.workers.dev/api/status      # JSON engine metadata
curl https://<worker>.<subdomain>.workers.dev/api/card/About  # JSON card metadata
```

### Local dev (no Cloudflare account needed)

```bash
npm install
npx wrangler dev
```

Miniflare 5 boots a local D1 in workerd; the engine stays the same. The local
D1 starts empty — apply the migrations to it first if you want the demo cards
locally:

```bash
npx wrangler d1 migrations apply DB --local
```

### One-click teardown

A deploy leaves a Worker and a D1 database in your account. This removes
them — and only them.

```bash
node scripts/deploy/one-click-teardown.mjs        # 1. list what it would remove
node scripts/deploy/one-click-teardown.mjs --yes  # 2. print the plan + a fingerprint
node scripts/deploy/one-click-teardown.mjs --yes --confirm-plan <fingerprint>   # 3. remove it
```

**1 — the list.** Read-only. It reads the same `wrangler.toml` the deploy
reads, then asks your account what exists under the exact names in that file —
the Worker named there, the D1 database named in its `[[d1_databases]]` block.
It prints each one with its name, its id, and the date it was created, plus
the exact `wrangler` command a removal would run. It removes nothing, and it
never lists a resource whose name your config doesn't declare.

**2 and 3 — the removal.** `--yes` on its own prints the plan and stops,
handing you a fingerprint of it. You pass that fingerprint back. You can't
type a fingerprint you haven't read, so the list gets reviewed before anything
is deleted. Then it runs, in this order:

```bash
npx wrangler delete <worker-name> --config <config>                       # the Worker
npx wrangler d1 delete <database_name> --skip-confirmation --config <config>   # the D1 database
```

The Worker goes first because its D1 binding points at the database.
`--force` is never passed: if some other Worker depends on this one, wrangler's
own refusal is the answer and the tool reports it rather than overriding it.

To tear down a different deploy, point `--config` at its config:

```bash
node scripts/deploy/one-click-teardown.mjs -c scripts/deploy/one-click-deck/wrangler.oneclick.toml
node scripts/deploy/one-click-teardown.mjs -c deploy/wrangler.scale.toml
```

Some deploys have no config file to point at. The frozen demo pair — the
Worker `decko-ts-demo` and the D1 database `decko-ts-demo-db`, which holds the
partial ~1.2M-row import and whose names live only in `deploy/cleanup.mjs` and
`docs/one-click-cf-deploy-inventory.md` — has no committed wrangler config, so
`--config` has nothing to read. Name the pair directly instead:
`--worker-name decko-ts-demo --db-name decko-ts-demo-db`. Without `--config`,
no config file is consulted at all, and everything else — the read-only list,
the fingerprint double-gate, the exact-match refusals — is the same path as the
config version. Passed together with `--config`, the overrides must agree with
what the config declares; a disagreement is refused
(`--override-conflicts-with-config`), never merged.

Add `--json` for the same list as JSON. Anything unclear — a name that doesn't
match, two databases with one name, an answer the tool couldn't read — is
refused with a reason, never deleted.

---

## Layout

- `worker.ts` + `wrangler.toml` (repo root) — the one-click Cloudflare
  Workers entry: ESM module that boots the engine on the first request and
  serves HTML/JSON from a D1 binding. This is what the Deploy button ships.
  There is no build step: `wrangler.toml` names this file directly and
  Wrangler bundles it (and the `.js`-suffixed imports it makes) itself, so
  `npx wrangler deploy` works on a fresh clone with nothing installed but
  dependencies.
- `deploy/` — the development deploy path: `deploy/worker.ts` (same engine,
  plus per-request metrics: `GET /__metrics`), `deploy/wrangler.toml`,
  DDL migrations (`deploy/migrations/` — the chain the Deploy button applies
  to the deployer's database: schema, indexes, demo cards, account substrate),
  seed tooling (`deploy/seed.mjs` regenerates the demo deck,
  `deploy/seed-account-system.mjs` regenerates the account substrate,
  `deploy/seed/`), and the local launch/teardown helpers.
- `scripts/deploy/one-click-teardown.mjs` — the one-click teardown: lists what
  a deploy created, and removes exactly that on `--yes --confirm-plan`. Tests:
  `tests/deploy/one-click-teardown.test.ts`; the Cloudflare response shapes it
  parses: `fixtures/deploy-teardown/`.
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

The standing verification net (`tests/standing-net.json`, 68 manifest
files), run via `node tools/test-queue/run-standing-net.mjs` on
2026-10-01:

```
Test Files  66 passed | 2 skipped (68)
     Tests  696 passed | 4 expected fail | 12 skipped (712)
```

This is the tree's one standing total; per-stream counts in
`docs/port-tracker.md` are historical landing-time records, not a
current measure. All four render-perf budgets are green solo (warm
4.8ms/entry vs 25 budget, 0 cold cards; receipt
`benchmarks/results/perf/render-perf.json`).

`npm test` runs the card-engine suite (the largest tree); the full tree
runs with `npx vitest run`. The renderer includes a depth-sweep test (1..32)
that proves the `#1282` claim: constant queries per render regardless of
inclusion depth.

## Ground rules

- The engine never imports vendor SDKs or branches on provider names.
- Typecheck: `npm run typecheck`. Tests: `npm test` (full tree:
  `npx vitest run`). Both must pass before any commit lands.
- Ruby truth lives in the installed gems on the build machine (Ruby 3.3,
  card-1.110.0, decko-0.20.0) and, for the production schema, the
  private production deck's mysqldump (identity withheld; see the data
  rule in `docs/port-tracker.md`).
- Data rule: real production-deck content never leaves the build machine.
  Sanitized, content-free structural artifacts (the corpus, the anonymized
  scale deck) are the only derivatives that exist anywhere else.
- Nothing from this repo goes to decko-commons upstream without the
  project owner's explicit approval (see `docs/core/governance.md`).

## Migration status

Landed: drivers (D1/libSQL/SQLite), oracle harness, name algebra, schema,
CQL parser + execution, history, replay harness, benchmark corpus, set-pattern
registry, fetch/cache, renderer with batched inclusion prefetch, rule
application, mod loading with chain-aware per-card view dispatch, request
metrics, the perf harness, and the generalized dump importer.

Full-corpus render parity (the with-mods corpus replay, 2026-09-23):
167,674 / 180,442 captured views byte-identical (92.9%; that day's runs
progressed 91.4% → 92.4% → 92.9%). The rule-count, name-leak, mini-bar, and
structure-wrapper families are eliminated corpus-wide; the remaining mass
is dominated by the permission family (~58%: denied sentinels and the
read-rule universe) plus two freshly re-signatured structure buckets —
see `tools/corpus-failure-classes/failure-buckets.json`.

Remaining to publication: the three corpus families above, mod view
deepening (1 mod fully ported, 30 registered with partial view coverage),
the PostgreSQL read rung, the one-command migration launch path, and the
publication hygiene rounds (in progress: `tools/hygiene/`). See
`docs/port-tracker.md` for the wave plan + per-stream notes.
