# Hosted conformance

`tools/hosted-conformance/run.mjs` runs the write-path suites against hosted
databases: Cloudflare D1 (through Cloudflare's D1 HTTP API), Turso/libSQL,
and Bunny Database. For each target it creates a scratch database, runs the
suites against it one test file at a time, removes the scratch database, and
prints one pass/fail row per suite. It exits non-zero when any suite or any
create/teardown step fails.

## Running it

```bash
node tools/hosted-conformance/run.mjs --target all
```

`--target d1,turso` limits the targets. A target whose variables are not set
is reported `SKIPPED (no credentials: <names>)` for every suite; it is never
left out silently.

| Target | Variables | Scratch database |
|---|---|---|
| `d1` | `DECKO_HOSTED_D1_ACCOUNT_ID`, `DECKO_HOSTED_D1_API_TOKEN` (an API token with D1 edit permission) | Created with `POST /accounts/{account}/d1/database`, deleted with `DELETE /accounts/{account}/d1/database/{uuid}` |
| `turso` | `DECKO_HOSTED_TURSO_ORG`, `DECKO_HOSTED_TURSO_API_TOKEN` (Platform API token); optional `DECKO_HOSTED_TURSO_GROUP` (default `default`) | Created with `POST /v1/organizations/{org}/databases`, a database token minted with `POST .../databases/{name}/auth/tokens`, deleted with `DELETE .../databases/{name}` |
| `bunny` | `DECKO_HOSTED_BUNNY_URL` (`https://<id>.lite.bunnydb.net`), `DECKO_HOSTED_BUNNY_TOKEN` (full-access database token) | Supplied by the operator and must be empty; the runner refuses a database that holds any table, view or trigger, and drops everything the suites created afterwards. The database itself is not deleted. |

Bunny is operator-supplied because, as of 2026-10-14, the create and delete
database endpoints (`/database/v2/databases`) appear only in a third-party
index of Bunny's API, not in Bunny's own reference, and database tokens are
documented as made in the dashboard or the Bunny CLI. Scratch database names
start with `decko-conformance-`.

## What it runs

| Suite | File | Cases run |
|---|---|---|
| transaction conformance | `tests/hosted/hosted-transactions.test.ts` (the shared `tests/server/drivers/transaction-conformance.ts`) | all |
| atomic saves | `tests/card/actions/atomic-saves.test.ts` | the `hosted` backend's cases |
| concurrent saves | `tests/card/actions/concurrent-saves.test.ts` | two driver objects over the scratch database |
| multi-user read isolation | `tests/card/actions/d1-multi-user-saves.test.ts` | a read during a failing save; concurrent writers with failing saves and readers |

The shared suites add their hosted cases only when `DECKO_HOSTED_TARGET` is
set (`tests/hosted/hosted-backend.ts`), and the runner selects them with the
test-name filter `hosted`. Each case starts from an emptied scratch database.
On D1 the engine's own `CloudflareD1Adapter` runs over
`tests/hosted/d1-rest.ts`, which sends each batch as the HTTP API's `batch`
array; Cloudflare documents that array as one transaction that rolls back
entirely on a failure, which is the atomicity the adapter requires.

Not yet run against hosted databases, and reported `NOT RUN` with the reason
in every table:

- **write probe** (`tests/tools/persist-write-probe.test.ts`): drives a file
  copy of the oracle deck through `LocalSqliteDriver`.
- **scenario battery** (`tests/tools/side-effects-scenario-battery.test.ts`):
  drives file copies of the deck in a child process.
- **sign-in** (`tests/card/auth/`): its test storage reads the database
  synchronously through better-sqlite3.

Each needs its storage made driver-selectable before it can run here.

## Local verification

```bash
node tools/hosted-conformance/run.mjs --local
```

runs the same flow with no network: a fake D1 HTTP API backed by Miniflare's
local D1 (workerd), a fake Turso Platform API that starts the in-repo Hrana
test server (`tests/server/drivers/mock-hrana-server.ts`, real SQLite) per
database, and that Hrana server in place of a Bunny database. sqld itself is
not installed here and was not run.

Result on 2026-10-14 (`node tools/hosted-conformance/run.mjs --local`, exit 0):
every suite that runs passes on all three targets (transaction conformance
7, atomic saves 11, concurrent saves 3, multi-user read isolation 2), every
scratch database is removed, and no stand-in database is left behind.

An earlier run found that concurrent writers on libSQL and Bunny failed:
while one connection held the write lock, another's `BEGIN IMMEDIATE` failed
at once with `database is locked`. `LibSqlHttpAdapter` and `BunnyDbDriver`
now retry a busy `BEGIN` with backoff up to the transaction lock timeout
(`retryWhileBusy`, `src/server/driver.ts`), and
`tests/card/actions/concurrent-saves.test.ts` runs two driver objects over
the Hrana test server for both, which fails without the retry. Whether
sqld, Turso and Bunny report a held lock the same way is what the hosted run
shows.

Nothing in this runner has yet been run against a hosted service.
