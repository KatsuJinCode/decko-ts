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
| `bunny` | `DECKO_HOSTED_BUNNY_URL` (`https://<id>.lite.bunnydb.net`, a trailing slash is accepted), `DECKO_HOSTED_BUNNY_TOKEN` (full-access database token) | Supplied by the operator and must be empty; the runner refuses a database that holds any table, view or trigger, and drops everything the suites created afterwards. The database itself is not deleted. |
| `d1-binding` | `DECKO_HOSTED_D1_NAME`, `DECKO_HOSTED_D1_ID`, `DECKO_HOSTED_ALLOW_RESET=1` (wrangler's own login) | A throwaway D1 database supplied by the operator, reached through a wrangler remote binding; emptied by the suites, not deleted. |

Bunny is operator-supplied. Bunny's own API reference does not document
database management, but the account API key can do it: `POST
/database/v1/groups`, `POST /database/v1/databases` (`{slug, group}`; a slug
over 16 characters answers HTTP 500), `PUT
/database/v2/databases/{id}/auth/generate` (`{"authorization":"full-access"}`)
for the token, and `DELETE` on the database and group (used on 2026-10-14;
`deploy/provisioning/provision-bunny-deck.mjs` uses the same calls). Scratch
D1 and Turso database names start with `decko-conformance-`.

## What it runs

| Suite | File | Cases run |
|---|---|---|
| transaction conformance and save scenarios | `tests/hosted/hosted-write-path.test.ts` (the shared `tests/server/drivers/transaction-conformance.ts` and the save scenarios) | all |
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

## Hosted results

Bunny Database, 2026-10-14 (`node tools/hosted-conformance/run.mjs --target
bunny` on a scratch database in `us-east-1`, primary region `LA`, no
replicas; 526 s; exit 1):

| Suite | Result |
|---|---|
| transaction conformance and save scenarios | PASS, 17 of 17 |
| atomic saves | PASS, 11 of 11 |
| concurrent saves | FAIL, 1 of 3: two unguarded updates both apply |
| multi-user read isolation | FAIL, 1 of 2: concurrent writers with failing saves |
| scratch database emptied | PASS |

Both failures are `BunnyDb pipeline statement 0 failed: Transaction timed
out (code TRANSACTION_TIMEOUT)`. With two writers contending, Bunny ends the
waiting transaction with this code instead of answering `database is
locked`, so `retryWhileBusy` does not retry it. That run also found two
harness defects, since fixed: the runner did not accept the trailing slash
on the URL Bunny returns, and the actions test storage read a seeded card's
id with `last_insert_rowid()` in a separate request, which over HTTP can run
on another connection and return 0.

`BunnyDbDriver` now treats `TRANSACTION_TIMEOUT` in answer to `BEGIN
IMMEDIATE` as a held lock and retries it within the transaction lock
timeout; the same code on any later statement surfaces as a failed save.
`tests/card/drivers/bunny-db-transaction-timeout.test.ts` and a
concurrent-saves scenario reproduce Bunny's answer on the Hrana test server.

Bunny Database, 2026-10-14, after that change (same command, a new scratch
database in `us-east-1`, primary region `LA`, no replicas; 410 s; exit 1;
the database and its group were deleted afterwards):

| Suite | Result |
|---|---|
| transaction conformance and save scenarios | PASS, 17 of 17 |
| atomic saves | PASS, 11 of 11 |
| concurrent saves | PASS, 3 of 3 |
| multi-user read isolation | FAIL, 1 of 2: concurrent writers with failing saves |
| scratch database emptied | PASS |

The remaining failure is again `Transaction timed out (code
TRANSACTION_TIMEOUT)`, in the case with four writers and two readers.

### Measured 2026-10-15: Brandon's account, counters, save timing

Scope: one budgeted session on Brandon's own Bunny account (paid per
operation). Scratch databases were created for the run and deleted afterwards
by exact name. Nothing on Brandon's existing resources changed.

**Conformance with counters** (`node tools/hosted-conformance/run.mjs --target
bunny` on `feat/hosted-runner-counters` at `85dd897d`, a scratch database in
`us-east-1`, primary region `LA`, no replicas; 2026-10-15 14:25 to 14:36 UTC;
exit 0; result record kept outside the repository):

| Suite | Result | Writers | Writes | Lost writes | Left-over rows | Read-back errors |
|---|---|---|---|---|---|---|
| transaction conformance and save scenarios | PASS, 17 of 17 | 1 | 84 | 40 | 0 | 0 |
| atomic saves | PASS, 11 of 11 (44 skipped by the `hosted` filter) | 1 | 56 | 50 | 0 | 0 |
| concurrent saves | PASS, 3 of 3 (18 skipped) | 2 | 89 | 0 | 0 | 0 |
| multi-user read isolation | PASS, 2 of 2 (2 skipped) | 4 | 64 | 31 | 0 | 0 |

Totals: 33 passed, 64 skipped, 0 failed. Writers 4 (most in flight in one
case), writes 293, lost writes 121, suites passed 4 of 4.

Reading the lost-write figure: the counter in the runner's own definition
(see Counters above) counts every write statement whose transaction did not
commit. The failure-injection cases roll back on purpose, so most of the 121
are expected. The check that detects data actually lost, rolled-back rows
still present in the database, is 0 in every suite, and read-back errors and
partial batch failures are 0. The lost-write column is therefore not evidence
of data loss.

The multi-user read isolation suite passed in this run. It failed in the
2026-10-14 run above. This run used `85dd897d`, which is not the integration
head, and the cause of the difference is not separated here.

The write probe, scenario battery and sign-in suite did not run (not yet
driver-selectable, as the runner prints).

**Save timing from the edge** (`tools/bunny-edge-save-timing`, built from
`perf/bunny-save-pipeline` at `bbc1c8f9`, deployed as a Bunny Edge Script
against a scratch database seeded with the synthetic minimum deck of 14 cards,
run once, and deleted with its pull zone; 2026-10-15). The first attempt
failed before any save ran: the tool prepended a second `https://` to the
hostname Bunny already returns, and the fix is in the commit that adds this
section.

| Save | Round trips | Total ms | In-transaction ms | In-transaction round trips |
|---|---|---|---|---|
| create-plain | 28 | 344 | 316 | 26 |
| create-links | 25 | 307 | 259 | 23 |
| create-subcard | 58 | 452 | 420 | 54 |
| update-content | 18 | 139 | 118 | 16 |
| update-content-links | 19 | 153 | 137 | 17 |
| update-rename | 28 | 219 | 201 | 26 |
| update-noop | 8 | 58 | 57 | 8 |

Totals: 184 round trips, 1,672 ms across the seven saves. The subcard save
(create-subcard, which creates a parent and a child) took 452 ms and 58 round
trips against Bunny's 5-second limit. This measurement is against a 14-card
synthetic seed, not Brandon's deck, so it is a lower bound on a real save's
cost, not an estimate of one.

**Not done in this session**

- Time to first byte (p50 and p95 over about 50 graded requests): not run. It
  needs a deployed engine on a scratch database, which this session did not
  reach within its time budget.
- One-click deploy, live proof (`fix/bunny-deploy-from-real-site` at
  `6f5e5a6a`): not run. It creates two scripts and two pull zones on the
  account, and the time budget did not cover a cold-start comparison and
  teardown.
- Planner statistics on cs-deck (one `ANALYZE` to restore `sqlite_stat1`):
  not run. No database token for cs-deck is stored in
  `library/data/secrets.env`. Obtaining one means generating a new auth token
  on cs-deck, which can invalidate the token the live site uses, so that step
  is waiting on the operator's decision.

**Account state**

Before and after the session (read through the account API): edge scripts
unchanged (five, the same IDs), pull zones unchanged (six, the same IDs),
databases unchanged (cs-deck and cs-edge-deck). Billed usage for the month
rose by $0.0000061, against a predicted ceiling of $0.001. Scratch databases
(`dkmeas1015`, `dkmeas1016`) and their groups were deleted, and the listing
after deletion shows only the protected resources.
Running that case alone on fresh scratch databases (2026-10-14, four runs,
failing in two) showed where: on a statement inside an open save
transaction (`DELETE FROM card_references WHERE referer_id = ?`), 5,067 ms
after its `BEGIN`. Bunny documents a 5-second limit on an interactive
transaction ("with a 5-second timeout",
bunny.net/docs/database/connect/typescript). Each statement of a save is
one round trip, and saves from this machine to the database measured 1.7
to 4.0 s, so under four writers one occasionally runs past the limit.
`BunnyDbDriver` reports the transaction's age and the refused statement in
that error.

A save Bunny ends this way fails whole, as a Ruby Decko save fails when
the database raises inside its ActiveRecord transaction. The multi-user
case now expects that on Bunny: such a save's content is never read and is
not in the history, no other error is admitted, and at least one save must
commit. The same runs found that the case's reader read the card and its
newest change in two statements, which on a non-atomic batch (libSQL,
Bunny) can pair two different committed states; it now reads both in one
statement. With both changes the case passed on a fresh scratch database.

Not addressed: a save that needs more round trips, or runs farther from
the database, can still exceed Bunny's 5-second limit and fail. Fewer round
trips per save is the remedy.

D1 and Turso have not been run through this runner against hosted services.
