# Deploying on Cloudflare

The engine runs on Cloudflare Workers as a writable deck. A deploy is one
Worker and four resources on your account: a D1 database (the deck), an R2
bucket (its files), a queue and a daily cron trigger (its periodic sweep).
Two routes lead there — the deploy button, which provisions everything for
you, and a manual deployment for an account you already have. Either ends by
printing the deck's one-time setup link.

---

## The deploy button

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/KatsuJinCode/decko-ts-public)

Clicking it asks you to sign in and to confirm names for the GitHub
repository Cloudflare creates in your account, the Worker and its resources,
and then:

1. copies the source into your GitHub account;
2. reads the root `wrangler.toml` and creates what it binds: the D1 database
   (`DB`), the R2 bucket (`FILES`) and the queue (`DELAYED`), writing the real
   ids into the config in your copy, and registers the cron trigger from
   `[triggers]`;
3. runs `npm run deploy`: applies the migrations under `deploy/migrations/`,
   deploys the Worker, and issues the setup token
   (`tools/deploy/issue-setup-token.mjs`);
4. gives you a `workers.dev` URL. The build log ends with the setup link,
   `https://<your deck's address>/setup?token=...`.

Open the link with your deck's address in it. `/setup` creates the owner
account; after that you sign in at `/_signin` and can create, edit and delete
cards and upload files.

Cloudflare documents automatic provisioning for button deploys of D1, R2 and
Queues among other resources, and applies the cron schedules a deploy's
`[triggers]` declares (Cloudflare, "Deploy buttons" and "Cron Triggers",
checked 2026-10-14). A button deploy needs the source repository to be public.

**The setup link.** The deck is public as soon as the deploy finishes, and
Ruby Decko's first-run window is open to whoever reaches `/setup` first while
the deck has no accounts. On this host `/setup` additionally requires the
token the deploy printed (`src/card/auth/setup-token.ts`): its SHA-256 is stored
in `deck_setup_tokens` (migration `0012`), the raw token never is, and
creating the owner account deletes it. A missing or wrong token creates
nothing and answers `403`. `npm run setup-token` issues a fresh link and
replaces the old one; re-running the deploy does the same. The same gate
also accepts a token you choose, set as the secret `DECKO_SETUP_TOKEN` and
entered in the form's setup token field; nothing needs setting for the
printed link to work (docs/SECURITY.md, divergence 5).

**Rehearsing the button without an account.** Only the copy, the resource
creation and the upload need Cloudflare.
`node tools/deploy/rehearse-deploy-button.mjs` runs everything else with the
real wrangler on this machine: it checks every binding the button provisions,
builds the bundle with `wrangler deploy --dry-run`, applies
`deploy/migrations/` to a fresh local D1 (twice, to show the second run
applies nothing), issues the setup token against the local database, and over
`wrangler dev` runs the first-owner journey — `/setup` refused without the
token, the owner created with it and the token spent, sign-in, a card
created, a file uploaded and read back from the local R2 bucket, and the cron
trigger firing a sweep the queue consumer runs. Every wrangler process runs
with an empty configuration home, no API token and the
`tools/deploy/no-external-network.mjs` preload, which refuses any connection
off the machine and lists the attempts in the result. It prints a JSON result
and exits 0 only when every step passed.

**Writes on D1.** Write-enabled D1 is for evaluation and single-user use, not
a supported multiuser deployment: D1 has no interactive transactions, so
while a save runs a concurrent reader can see its partial rows, and a save
that fails was briefly visible before it vanished
([decision 0007](decisions/0007-atomic-saves-and-transaction-contract.md)).
Setting `DECKO_WRITE_PATH` and `DECKO_FIRST_RUN` to `"0"` and redeploying
makes the deck serve reads only.

No secret or API token is stored in the repository.

---

## Manual deployment

```bash
npx wrangler login
npx wrangler d1 create decko-ts            # paste the printed id into wrangler.toml
npx wrangler r2 bucket create decko-ts-files
npx wrangler queues create decko-ts-delayed
npm run deploy                             # migrations, deploy, setup link
```

`npm run deploy` applies the migrations, deploys the Worker and prints the
setup link. The migration command references the binding `DB` rather than the
database name, so it keeps working if you rename the database on the deploy
page.

For local development, `npx wrangler dev` boots a local D1, R2 bucket and
queue through miniflare with the same engine; local migrations are applied
with the same command plus `--local`, and
`node tools/deploy/issue-setup-token.mjs --local` issues a local setup link.

### What `wrangler.toml` holds

| Key | Value |
| --- | --- |
| `main` | `worker.ts` — the TypeScript source. The bundler resolves `.js` specifiers to sibling `.ts` files, so one maintained entry point serves both the button and manual deploys. |
| `compatibility_date` | Deliberately pinned. A newer date can change runtime behaviour, and this engine's acceptance criterion is byte parity with the Ruby reference, so bumping it is a parity decision rather than a packaging one. |
| `compatibility_flags` | `nodejs_compat` |
| `[[d1_databases]]` | `binding = "DB"`, `database_name = "decko-ts"`, and a **placeholder** `database_id` that a button deploy or a manual create replaces. `migrations_dir` points at `deploy/migrations`. |
| `[[r2_buckets]]` | `binding = "FILES"`, `bucket_name = "decko-ts-files"`: uploads, image renditions and compiled stylesheets, served back under `/files/` behind each card's read rule. |
| `[[queues.producers]]`, `[[queues.consumers]]` | `binding = "DELAYED"` on the queue `decko-ts-delayed`: delayed work, consumed by the Worker's `queue` handler (`src/server/edge-delayed-work.ts`). |
| `[triggers]` | `crons = ["17 3 * * *"]`: once a day the `scheduled` handler enqueues the sweep of expired sessions and upload drafts older than a day. |
| `[vars]` | `DECKO_WRITE_PATH = "1"` (sign-in form, card create / update / delete) and `DECKO_FIRST_RUN = "1"` (the token-gated `/setup` window). |

### Migrations

`deploy/migrations/` is applied in filename order.

| Migration | What it does |
| --- | --- |
| `0001-schema.sql` | The core schema, generated from the canonical schema file. Never edited by hand. |
| `0002-card-text-binary-lookup-indexes.sql` | Adds the binary key and codename lookup indexes. Written with `IF NOT EXISTS`, so it is a no-op on a fresh database. |
| `0003-demo-seed.sql` | A small demo deck: `Home`, `Hello World`, `About`. |
| `0003-deck-data-version-stamp.sql` | The data-version table the triggers maintain. |
| `0004-demo-account-substrate.sql` | The account substrate: the `*account` card and its field cards, the `User` card type, and the bot and anonymous actor cards. Idempotent. Without it the deck has no account system and the setup route correctly reports that. |
| `0005-auth-sessions.sql` | The session table, so a signed-in session survives across requests. |
| `0006-demo-role-substrate.sql` | The role card type, the members list card, and the account roles. |
| `0008-cards-serving-path-indexes.sql` | Indexes on the card serving path. |
| `0009-demo-account-read-rules.sql` | The `*all+*read` catch-all and the Help Desk grants on the account fields, which keep an anonymous requester out of the owner's password digest, salt and email address. |
| `0012-first-run-setup-token.sql` | `deck_setup_tokens`: the SHA-256 of the one-time setup token the deploy issues. |

A fresh deploy therefore comes up with schema, content and an account system,
and re-running the migrations is a no-op.

### The Worker entry

The button deploys `worker.ts` from the repository root, a thin HTTP shell
over the engine. The same handler is also packaged for edge hosts other than
Cloudflare by `tools/bundle-cf-edge-engine.mjs`, which bundles
`deploy/cf-worker-src/cf-edge-engine-entry.ts` to
`deploy/dist/cf-edge-engine.bundle.js` and reports the size and digest. That
entry reuses the shared edge request handler, wraps the D1 binding in a driver
that times and counts every call, and captures the binding from the request
handler's environment on first use — the Workers runtime hands bindings to the
request handler, not to module scope.

---

## D1's limits and how the engine lives within them

D1 is stricter than the SQLite builds the engine also runs on. Three of its
limits shape the SQL the engine emits, and each has a mechanical workaround
that preserves meaning rather than truncating work.

### A compound `SELECT` may have at most five terms

`src/card/live/request-store.ts` declares `MAX_COMPOUND_TERMS = 5`. A union
built from more terms than that is emitted as several common table
expressions of at most five terms each, with the original name as their union;
above five groups those are unioned under a further name.

The rows and their order are unchanged, because every statement that reads
these expressions tests membership only.

### A statement may bind at most one hundred parameters

`src/server/drivers/d1.ts` declares `D1_MAX_BOUND_PARAMETERS = 100`. Above
that, the driver rewrites every placeholder as an exact SQL literal. The
rewrite is quote- and comment-aware, and declines to run — leaving the
statement bound as it was — for numbered or named parameters, for a count
mismatch, or for any value with no exact literal.

The live request store has a second answer: lists are bound as a single JSON
parameter expanded by SQLite's `json_each`, so a statement carries a fixed
small number of parameters however wide the ring is. That rewrite was checked
row-identical, in content and order, against the per-value placeholder form on
real captured parameter sets.

### An expression may nest at most one hundred deep

Also `d1.ts`, as `D1_MAX_EXPR_DEPTH = 100`. SQLite parses a flat `OR` chain
left-deep, one level per term, so a junction lookup over a large page's pairs
exceeds the depth limit. The driver regroups long flat `OR` chains into a
balanced tree, so depth grows with the logarithm of the term count rather than
with the term count. Terms, their order and the placeholders' order are all
preserved, and `OR` is associative, so the statement means the same thing.

---

## The trickle importer

`tools/d1-trickle/` imports a large deck into D1 in bounded daily slices.
D1's free plan caps row writes per day, and a deck of tens of thousands of
cards cannot be inserted in one pass without exhausting that day's allowance
— so the importer plans the work into units and spends the daily budget a
slice at a time. How many days an import needs is a property of the deck
(total rows to write) and of the share of the daily cap the operator
configures; the cap itself is Cloudflare's figure, changes over time, and is
read from Cloudflare's published D1 limits page rather than restated here.

**Costs and energy.** This repository contains no cost measurements and no
energy measurements for any deployment topology. What a deployment invoices
depends on that deployment's request volume, CPU time, storage and egress;
Cloudflare's published, dated rates (Workers paid plan, D1 rows read/written)
are the source for any bill estimate, and no estimate in this repository
should be read as a measurement.

**Input.** A local SQLite copy of the deck, which a snapshot tool can produce
from a running libSQL database through a read-only claim check. Tables that
should never be copied — sessions, credentials, caches and derived one-trip
tables — are created empty.

**Subcommands.** `plan` (build the plan and the closure manifest), `run`
(import), `status`, `verify` (check what is consistent), and `create-db`.

**Budget.** The daily row-write limit and the share of it the importer will
spend are both flags, and the run stops before the next unit would cross the
threshold. Units go in plan order.

**Resumption.** A per-target state directory holds the plan, a checkpoint of
which units are done and how many rows each UTC day has spent, the manifest of
which pages can already be served, and an append-only run log. The next run
resumes at the first unit not done. A unit is marked in flight before it is
sent, so a crash resends it; the inserts ignore conflicts, so re-sent rows
cost nothing.

**Statement limits.** The importer respects D1's per-statement size and
bound-parameter caps, keeping each statement under the size ceiling with
headroom for the insert prefix.

**Access.** Cloudflare is reached through an API token and account id read
from a credentials file whose keys are named on the command line — never
through a logged-in tool session. Secrets are masked in output. Exit codes
distinguish a usage error from a failure, and from a verification that found
the target not consistent.

### What "closed" means for a page

A page is **closed** when it renders byte-identically over the set of cards the
importer has determined it needs. It becomes servable once the units up to its
required unit are done. A page whose requirements are deck-wide stays unservable
until the whole deck is in. The manifest reports how many units are done, how
many are planned, how many pages are servable, and how many are still waiting.

While an import is running, responses carry a partial-deck marker and a
`noindex` directive, so a half-imported deck is not indexed as a finished one.

---

## Observing a deployment

| Route or header | What it tells you |
| --- | --- |
| `GET /_status` | Engine, runtime, database health and card count. |
| `GET /__metrics` | Per-request and isolate-aggregate counters, with wall-time histograms. |
| `X-Render-Metrics` | A compact per-request summary: CPU, wall time, rows read and written, query count, whether the request was a cold start, and the estimated counters. |
| `X-Decko-Db-Trips` | How many database round trips this request made. |
| `Server-Timing` | Where the time went. See [operations.md](operations.md). |

**`X-Decko-Db-Trips` counts trips, not statements.** One trip is one call to
the database binding, and each call carries a batch of that trip's statements.
The `Server-Timing` `stmt` field counts statements, so cost per trip is the
`db` duration divided by this header. The count is exact when requests do not
overlap within an isolate.

Two honest limits on the metrics. Workers exposes no in-process CPU clock, so
the CPU figure equals wall time and is labelled as such rather than presented
as a real measurement. And rows read cannot be counted from outside the
database for a `SELECT`, so the recorded figure is zero where the runtime does
not surface one, with an explicit "estimated" flag when a fallback was used
instead. See [operations.md](operations.md) for the full accounting.

---

## Teardown

The teardown script prints its plan, then deletes the Worker and the D1
database once confirmed. Deleting resources consumes write budget on the
account, so it is gated and planned like any other write rather than run as
casual cleanup.