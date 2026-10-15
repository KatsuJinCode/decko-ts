# Cost model: does a deck fit Cloudflare's free plan?

Status: partial. Warm pages that render one card fit the free plan's CPU
limit; the cold-isolate boot does not, and pages that list hundreds of cards
are borderline. Ruby Decko spends 66 times the CPU per page of the port
(below). "$0 hosting" holds only inside the envelope stated at the end, and
only with the cold-boot caveat.

## Free-plan limits that matter

| Limit (Workers Free + D1 Free) | Value |
| --- | --- |
| CPU time per request | 10 ms |
| Requests per day | 100,000 |
| D1 rows read per day | 5,000,000 |
| D1 rows written per day | 100,000 |
| D1 storage | 5 GB total |

CPU time is what Cloudflare bills and limits. Time the Worker spends waiting on
D1 is I/O wait, not CPU.

## How CPU per page was measured

The measuring script, `measure-workerd-cpu.mjs --deck cf-scale --n 200`, belongs
to the cf-scale benchmark set, which is not shipped in this repository; the
method is described here so the measurement can be repeated.

The script bundles `deploy/worker.ts` the way wrangler does, boots it in
miniflare's workerd (the runtime Cloudflare runs), loads
`deploy/migrations/0001-schema.sql` plus `deploy/cf-scale-deck/seed.sql`
(2,287 cards, 532 references) into the local D1 binding, and for each page
issues 5 warm-up requests, then 200 sequential requests, reading the workerd
process's CPU counter before and after. CPU per request is the delta over 200.

workerd freezes its clocks during execution, so no in-isolate timer can
measure CPU. The process counter is an upper bound on billed CPU: locally the
same process also runs the D1 emulation (SQLite) and miniflare's routing
worker. A trivial Worker under the same harness costs 0.55 ms per request
returning 500 bytes, 1.2 ms returning 30 KB, and 3.05 ms when it also issues
one D1 query; that 3 ms is the local plumbing floor every page below carries
and production does not bill.

The Windows CPU counter ticks every 15.6 ms, so N=200 gives about ±0.1 ms
resolution. The measuring machine was under other load; repeated runs of the
same page moved by up to 30%.

## Measured warm CPU per page (cf-scale deck)

Measured 2026-10-14, Windows x64, Node 24.19, miniflare 5 / workerd, after the
URI prefix-scan fix (commit "Memoize URI prefix scans across one content pass").
"Engine CPU in Node" is the same bundle run in Node 24 against an in-memory
SQLite D1 shim, `process.cpuUsage()` over 100 warm requests: the render work
with no workerd plumbing.

| Page | Bytes | workerd process CPU ms/req (upper bound) | Engine CPU in Node ms/req | Fits 10 ms? |
| --- | --- | --- | --- | --- |
| Home `/` | 3,607 | 7.6 – 9.1 | 0.6 | yes |
| Ordinary card | 3,833 | 7.4 – 9.2 | — | yes |
| Card JSON | 495 | 6.6 – 6.8 | 0.5 | yes |
| Denied card | 1,282 | 6.8 – 7.3 | — | yes |
| Mod-view card | 3,775 | 7.7 – 8.4 | — | yes |
| 32-deep nest chain | 35,212 | 10.6 – 12.3 | 3.6 | yes after the ~3 ms floor |
| 16 KB card body | 30,372 | 10.2 (was 38.4 before the fix) | 2.7 (was 22.8) | yes after the floor |
| 500-item pointer | 64,392 | 15.9 – 20.8; 10.0 on 2026-10-14 after the name-key memo | 9.8 (8.7 after the name-key memo) | borderline |

Before the fix, the 16 KB body spent ~20 ms in `findUriMatch`, which rescanned
the whole remaining text with all three URI prefix regexps for every
candidate. The fix remembers each regexp's next match start for the text; the
synthetic-v1 grade stayed rendering 1754/1754 and semantics 2389/2389.

The 500-item pointer page spent most of its time recomputing the key of
every listed name on every request; name keys now persist across requests
(commit "Keep computed name keys across requests"). Its workerd figure has
not been re-measured since; the Node engine figure moved from 9.8 to 8.7 ms,
inside the run-to-run noise of this machine.

## Cold isolate

The worker boot no longer loads the deck. It installs the name-environment
adapters, loads the codename table and the virtual-card rule universe, and
nothing else; each request then loads the cards it renders through the
engine's batched prefetch and point reads (commit "Load cards on demand in
the worker instead of indexing the deck at boot"). `/api/query` still builds
the full name index on its first use, because the CQL name resolver is
synchronous; page routes never pay for it.

A stored `key` that differs from the key this engine computes (the cf-scale
deck stores `Anonymous` as `anonymou`, written without the card gem's
inflection table) is handled by an opt-in lexicon fallback the worker
enables: a simple-name key miss asks once more by stored name and accepts
the row only when that name's computed key equals the requested key.

Rendered output is unchanged: the same 21 requests (the nine benchmark
pages, mark, missing, compound, csv and view routes, `/Anonymous` variants
and two `/api/query` statements) through the previous and the new worker,
each on a fresh isolate, give identical status and bytes once the random
slot ids and the request timestamp are masked. The synthetic-v1 grade is
unchanged (rendering 1754/1754, semantics 2389/2389, persistence 16/16,
side effects 19/19, read writes 8/8, other tables 12/12).

First request on a fresh isolate, measured 2026-10-14 (Windows x64, Node
24.19, miniflare 5 / workerd), four isolates per row:

`node measure-workerd-cpu.mjs --cold-only --first <path> [--entry <worker file>]`
(the cf-scale benchmark set's measuring script, which is not shipped, as
described above)

| First request | workerd process CPU ms (upper bound) | D1 queries | D1 rows read |
| --- | --- | --- | --- |
| `/`, previous worker (full-deck boot) | 109 – 203 | 28 | 2,438 |
| `/`, on-demand worker | 78 (all four runs) | 27 | 151 |
| `/Big Pointer`, previous worker | 172 – 266 | 35 | 3,439 |
| `/Big Pointer`, on-demand worker | 141 – 250 | 35 | 1,153 |

The single-request counter ticks every 15.6 ms, so each figure is a
multiple of that tick. The first request still does not fit 10 ms. What
remains is not the deck index: the same pages cost 6.3 ms (home) and
10.0 ms (500-item pointer) warm under the same harness, so the cold
overshoot is the first execution of a large bundle (V8 compiling and
optimizing code on first use) plus the local D1 emulation of the first
request's 27 – 35 queries, both of which this process counter includes.
Separating the two needs a measurement that does not exist yet: engine CPU
of the first request in Node against the in-memory D1 shim. Until it
exists, "the first request fits the free plan" is not established.

Every later request in the same isolate issues one D1 query (the
data-version freshness check, 1 row read). Cloudflare tolerates occasional
overshoot on the free plan but does not promise it; a deck that depends on
that tolerance is not a guaranteed $0 deck.

## D1 reads per page

Measured with the worker's own `/__metrics` recorder, which forwards D1's
`meta.rows_read`:

- Warm page: 1 query, 1 row read (freshness check), every page above.
- First request on a fresh isolate (on-demand worker): 151 rows for `/`,
  1,153 for the 500-item pointer (table above).
- Cold boot before on-demand loading: the cf-scale benchmark set's recorded control batch
  (not shipped; 5 requests including one boot, recorded 2026-09-24) read 82,004 rows, so a
  boot reads on the order of 80,000 rows on this deck.

Daily budget arithmetic at 5,000,000 rows read:

- Warm traffic alone: 5,000,000 page views; the 100,000 requests/day Worker
  limit binds first.
- A cold start now reads what its first page reads (151 – 1,153 rows on this
  deck) instead of the whole deck, so cold starts no longer bind the daily
  read budget.

## What fits $0 today

- Reads: a deck of this size (~2,300 cards) at up to 100,000 page views a
  day, provided isolates live long enough to keep boots under ~60 a day.
- CPU: ordinary pages, JSON, denied cards, nest chains and long bodies fit
  10 ms warm. Pages that render hundreds of items (the 500-item pointer) are
  borderline. The first request on a fresh isolate does not fit (78 ms upper
  bound for the home page).

## Energy versus Ruby Decko

Measured 2026-10-14 (`benchmarks/energy/README.md` has the method and
caveats): on the 292 anonymous page renders of the synthetic-v1 deck, warm,
Ruby Decko 0.20.0 spent 401 ms of CPU per page and the port 6.1 ms: a ratio
of 66. The Ruby side ran in the oracle adapter, which boots Rails in
development mode and renders under `Rails.env = production`; a
production-booted Ruby server would be somewhat faster, so the ratio is an
upper estimate until that run exists. "An order of magnitude less energy"
is supported by CPU time on this measurement; CPU time is a stand-in for
energy, not a power reading.

## The $0 envelope, as measured

1. Deck size: about 2,300 cards (the cf-scale deck).
2. Traffic: up to 100,000 page views a day (the Workers request limit binds
   before D1 reads, at 1 row per warm page).
3. Pages: single-card pages, JSON, denied cards, a 32-deep nest chain and a
   16 KB body fit 10 ms warm. List pages naming ~500 cards do not reliably fit.
4. Cold starts: the first request costs 78 ms (home) to 141 – 250 ms (500-item
   pointer) of workerd process CPU, an upper bound, and reads only what that
   page reads; the free plan does not guarantee that a request this far over
   10 ms is served.

## Monthly cost on Cloudflare, Bunny and a Ruby host

The figures below are generated by `tools/cost-model/model.mjs` from `tools/cost-model/inputs.json`. Every price in that file carries its source URL and the date it was read; every measured figure names the repo file and text or JSON field it comes from. `node tools/cost-model/model.mjs` prints these tables; `node tools/cost-model/model.mjs --write-doc` regenerates this block; `tests/tools/cost-model.test.ts` fails if the block is stale or a citation no longer matches the repo.

The uncached query-plan estimate was remeasured locally on 2026-10-15:
the home render uses 23 statements and an estimated 2,321 rows after indexes
and ANALYZE. The index-phase byte comparisons and the normal measurement
check passed. These are plan estimates, not new production CPU or billing
measurements. The machine-local corpus backfill addendum was not run.

<!-- BEGIN GENERATED: tools/cost-model/model.mjs -->
### Headline

Warm page (home `/`), 30-day month, 3,607 bytes per view, prices read 2026-10-14.

| Platform | Monthly page views | Monthly cost |
| --- | ---: | ---: |
| Cloudflare Workers Free | up to 3,000,000 | $0 |
| Bunny | up to 2,000,000 | $1.00 (the account minimum) |
| Bunny | 10,000,000 | $4.20 |
| Cloudflare Workers Paid | 10,000,000 | $6.22 |

### Cost by traffic level

Warm is the measured per-page figure. Uncached is the cold per-render query plan (rows and statements from `tools/cf-cost`); its CPU is assumed equal to warm.

| Views per month | Workers Free fits (warm) | Workers Paid, warm | Workers Paid, uncached | Bunny, warm | Bunny, uncached | Ruby on CX23 (servers) |
| ---: | :---: | ---: | ---: | ---: | ---: | ---: |
| 100,000 | yes | $5.00 | $5.00 | $1.00 | $1.00 | $6.15 (1) |
| 1,000,000 | yes | $5.00 | $5.00 | $1.00 | $1.13 | $6.15 (1) |
| 3,000,000 | yes | $5.00 | $5.00 | $1.27 | $3.36 | $6.15 (1) |
| 10,000,000 | no | $6.22 | $6.22 | $4.20 | $11.16 | $12.29 (2) |
| 50,000,000 | no | $25.50 | $116.55 | $20.94 | $55.74 | $49.17 (8) |

### Free-plan ceilings

- Warm: 3,000,000 views a month, limited by requests. The requests cap is 3,000,000 (100,000 a day for 30 days); D1 rows read at 1 row per view stays far under the 5,000,000-a-day quota.
- Uncached: 64,627 views a month, limited by d1_rows_read, because the D1 quota of 5,000,000 rows a day covers about 2,154 home renders a day at 2,321 rows each.
- A warm view costs one D1 query. An uncached view costs the statements in the plan estimate (23 for the home page).

### How each figure is computed

- Workers Paid: $5 plan, plus $0.30 per million requests over 10,000,000, plus $0.02 per million CPU milliseconds over 30,000,000, plus D1 rows read over 25,000,000,000 a month. Bandwidth is free on Workers.
- Bunny: $0.20 per million Edge Scripting requests (billed per started million), $0.02 per started 1,000 CPU-seconds, $0.30 per billion D1 rows read, $0.01 per GB of CDN bandwidth, and the $1 account minimum as a floor on the total.
- Ruby on CX23: 2 shared vCPUs, 20 TB outbound traffic included, EUR 5.49 a month, converted at 1.1195 USD per EUR. Servers are added when the Ruby CPU per page (401.1 ms) needs more than 50% of a host's vCPU time. Database, backups and operations are not costed.

### Inputs

Measured (repo file):

- Warm home page: 7.6-9.1 ms workerd CPU per view (upper bound, includes the 3.05 ms harness floor), 3,607 bytes. Source: docs/cost-model.md.
- Warm D1: 1 query and 1 row read per page. Source: docs/cost-model.md.
- Cold home first request: 78 ms CPU, 27 queries, 151 rows. Source: docs/cost-model.md. Cold boots are assumed at 60 a day (the free-envelope ceiling the doc states).
- Uncached render, home: 23 statements and 2,321 rows, a plan estimate and not rows-examined telemetry. Source: tools/cf-cost/measure-render-reads-results.json.
- Ruby Decko 0.20.0: 401.1 ms CPU per page against the port's 6.07 ms. Source: docs/cost-model.md; precise figure at commit 102916e7.
- Deck: 2,287 cards, 532 references, 1,638,469 bytes of seed SQL, no blobs. Source: deploy/cf-scale-deck/deck-manifest.json.

Prices (source URL, read 2026-10-14):

- Workers and plan limits: https://developers.cloudflare.com/workers/platform/pricing/, https://developers.cloudflare.com/workers/platform/limits/.
- D1: https://developers.cloudflare.com/workers/platform/pricing/, https://developers.cloudflare.com/d1/platform/pricing/.
- R2: https://www.cloudflare.com/pricing.md (not used, the deck has no blobs).
- Bunny: https://bunny.net/docs/scripting/pricing, https://bunny.net/pricing/, https://bunny.net/database/.
- Hetzner CX23: https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/, specs https://www.hetzner.com/news/new-cloud-plans/.
- Exchange rate: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html (2026-10-14).

Assumed (not measured): a 30-day month; every view is a home page; warm CPU is the upper bound; uncached CPU equals warm; the Ruby host runs at 50% of its shared vCPUs; writes are zero; Bunny Database is priced at its listed rates although it is in public preview.
<!-- END GENERATED: tools/cost-model/model.mjs -->

### Measured and assumed

Measured in this repository: the warm per-page CPU and bytes of the home page (workerd, upper bound, Windows, 2026-10-14); one D1 query and one row read per warm page; the first-request cost on a fresh isolate; the uncached per-render statements and rows, as a plan estimate and not telemetry; the Ruby Decko CPU per page (401 ms against the port's 6.1 ms, measured on a desktop CPU in development mode); and the deck size (2,287 cards, no blobs).

Read from published pages through the search gateway, 2026-10-14: Workers and D1 prices and free-plan limits, Bunny Edge Scripting, Bunny Database and CDN prices, the $1 Bunny account minimum, the Hetzner CX23 price and specification, and the ECB EUR to USD rate. The gateway reported these from the cited pages; the saved page text could not be read on this machine, so the values are not diffed against the page bytes.

Assumed, and each one moves the figures: a 30-day month; every view is a home page; warm CPU is the upper bound, which includes about 3 ms of local harness that production does not bill, so production CPU is lower; uncached renders reuse the warm CPU because no uncached CPU has been measured; the Ruby host can use half of its two shared vCPUs; writes are zero; Bunny Database is priced at its listed rates although its page says it is in public preview and free; and the Ruby host figure counts servers and traffic only, not the database, backups or operations.

The one result that changes the free-plan story: a warm view costs one D1 row, but an uncached home render reads about 2,300 rows. At the free plan's 5,000,000 D1 rows a day that is roughly 2,150 renders a day, not the 100,000 requests a day the warm figures suggest. A deck that depends on the warm path is a $0 deck only while its renders stay cached.

## Measured on Cloudflare's production runtime, 2026-10-15

The CPU figures above are the local `workerd` upper bound. The following were
measured by deploying `deploy/worker.ts` from `0f7a5f0c` (which is a811967b
plus 9 commits, "a811967b or later") as Worker `decko-test-cpu` on a
Cloudflare account, bound to a scratch D1 database `decko-test-cpu-scale-db`
holding `deploy/migrations/0001-schema.sql` and `deploy/cf-scale-deck/seed.sql`
(the same 2,287-card deck). Per-request CPU was read from `wrangler tail`
(`cpuTime` on each request event), not from the local script. The Worker was
deployed to `workers.dev`; all nine pages of `benchmarks/cf-scale/measure-workerd-cpu.mjs`
returned HTTP 200. Requests: 11 per page, 99 in total, concurrency 4, sent
within about 25 seconds. Every request succeeded; there were no errors and no
exceptions.

| | CPU ms per request | |
|---|---:|---|
| Median (p50) over 99 requests | 12 | |
| 95th percentile | 150 | |
| Mean | 40.6 | |
| Min / max | 2 / 251 | |
| Requests over 10 ms of CPU | 58 of 99 | |

Per page (11 requests each, p50 / p95 of CPU ms):

| Page | p50 | p95 | max |
|---|---:|---:|---:|
| `/` (home) | 11 | 120 | 120 |
| `/Scale Page 1x` | 11 | 112 | 112 |
| `/Scale Page 1500x` | 14 | 69 | 69 |
| `/Depth Root` | 42 | 118 | 118 |
| `/Big Pointer` | 147 | 251 | 251 |
| `/Large Doc 1` | 20 | 128 | 128 |
| `/Mod Probe 1` | 11 | 106 | 106 |
| `/Restricted Page 7` | 6 | 61 | 61 |
| `/Scale Page 1x.json` | 7 | 43 | 43 |

The first requests in time order cost 81, 112, 13, 116, 167 and 62 ms (cold
isolates); the last twelve cost between 4 and 20 ms. Isolates stay warm
while traffic continues, so the cold-boot cost recurs on the first request
after an idle period.

Consequences for the post's free-plan claim. The post says the engine renders
a page "in {{free_plan_cpu_ms_p50}} ms of CPU at the median and
{{free_plan_cpu_ms_p95}} ms at the 95th percentile" against the 10 ms
Workers Free limit. Measured on production runtime, the median is 12 ms and
the 95th percentile is 150 ms, and 58 of 99 requests exceeded 10 ms of CPU.
None of those requests failed. That means either the account is not on the
Free plan, or the Free limit is not enforced at 10 ms as published. The
account's plan could not be read: the API token returns 403 for
`/accounts/{id}/subscriptions`, and the free-plan row's own evidence (the
`cf_free_views_per_month` model, 3,000,000 requests a month against a 100,000
a day cap) is what the account's behaviour has to be read against. The plan
question is unresolved and must be settled before the CPU figures are
published.

Per-page, the ordinary-card pages (`/`, `/Scale Page 1x`, `/Mod Probe 1`) fit
10 ms at the median; `/Depth Root`, `/Large Doc 1` and above do not; `/Big
Pointer` is 14 times over. This matches the local table's shape (home and
ordinary pages fit; list pages do not) but not its absolute values, which are
about a tenth of the production figures for list pages.

### D1 rows read per uncached home render, on the real Worker

Measured through the D1 HTTP API on the same account. Each iteration wrote
the deck's freshness stamp with one `UPDATE` on the scratch database
(`updated_at = updated_at` on the first card, which changes the stamp without
changing content), then requested `/` so the render could not use its kept
page. A control pass did the bumps without requesting. The stamp write costs
3 rows read and 3 rows written, exactly and every time; D1 analytics
(`d1AnalyticsAdaptiveGroups`, summed over the window minus the control)
gives the render's rows read.

| Method | Renders | Rows read | Rows per render | Read queries per render |
|---|---:|---:|---:|---:|
| 30 consecutive renders, one stamp bump before each | 30 | 4,835 | 161 | 20 |
| 4 renders spaced about 7 s apart, one bump before each | 4 | 5,190 | 1,298 | 22 |
| 3 renders, one bump before each | 3 | 2,675 | 892 | 21 |

The three measurements disagree by a factor of eight. The likely cause is
isolate warmth: the 30-render pass may have stayed on one isolate, while the
spaced passes may have landed on cold isolates. This is a hypothesis and has
not been checked against the cache code, and it has not been tested by
pinning requests to one isolate. It is the first thing to confirm before any
of these figures is published.

Therefore the local figure of 2,323 rows per uncached render is not
reproduced on this path for a warm isolate (161), and is in the same order of
magnitude as the cold-isolate figure (892 to 1,298). The post's cost model
uses 2,323 for the uncached ceiling of 64,571 page views a month; the hosted
measurement supports the uncached figure as an upper bound and says nothing
against it, but the warm 161-row figure means a busy site's real reads sit
far below the model. The per-request exact count (with the Worker's
`/__metrics` endpoint, which needs the `METRICS_TOKEN` binding the deploy
does not set) was not obtained.

Wall-clock time to first byte on the same 99 requests: p50 311 ms, p95
1,590 ms. These are wall time, not CPU, and include network and cold-start
time.

### Deploy to Cloudflare button, exercised through the API, 2026-10-15

The button itself needs a browser, so its steps were run against the account
through the Cloudflare API and `wrangler` (both with the account's API
token), using the repository's root `wrangler.toml` exactly as the button
reads it. Scratch resources were named `decko-test-button` (Worker and D1
database) and `decko-test-delayed`, `decko-test-delayed-jobs` (the queues the
root config names, renamed to meet a naming rule; the two unrenamed copies
wrangler had created from the root config were deleted).

What the button path provisions, from the root `wrangler.toml`:

- one Worker, `decko-ts`, `main = "worker.ts"`, `compatibility_date =
  2026-08-01`, `compatibility_flags = ["nodejs_compat"]`;
- one D1 database, binding `DB`, name `decko-ts`, `database_id` a placeholder
  the deploy replaces;
- two Cloudflare Queues, `DELAYED_JOBS` (producer, `decko-ts-delayed-jobs`)
  and `DELAYED` (a consumer of `decko-ts-delayed`, with a cron trigger on the
  consumer);
- one R2 bucket binding `FILES`, bucket name `decko-ts-files`;
- three plain variables: `DECKO_WRITE_PATH = "1"`, `DECKO_FIRST_RUN = "1"`,
  `DECKO_DELAYING = "true"`.

So the R2 bucket, the queue and the cron trigger the post describes do exist
in the config. The post's "one-time setup token" does not.

What happened, in order:

1. All 12 migrations in `deploy/migrations/` applied to a fresh D1 database
   (the runner reported `No migrations to apply` on the second call).
2. `wrangler deploy` created both Queues automatically, then failed:
   `R2 bucket 'decko-ts-files' not found. Verify the bucket exists in your
   account` (code 10085). Wrangler does not create the R2 bucket, and the
   account's API token returns 403 for `/accounts/{id}/r2/buckets`, so it
   could not be created from this token either. The button as documented
   would fail at this step on this account.
3. A probe with only the R2 binding removed (queues, D1 and vars unchanged)
   deployed and served `https://decko-test-button.decko-brandon.workers.dev`.

What the deployed site did:

| Request | Response |
|---|---|
| `GET /` | 200, deck home page |
| `GET /setup` | 200, the first-run setup form, with a `setup_token` field |
| `POST /setup` with a wrong token | 403, the form again, nothing created |
| `POST /update/Note_001` (anonymous) | 403 |
| `POST /update/Test` (anonymous) | 403 |
| `PUT /update/Test` (anonymous) | 403 |
| `DELETE /delete/Test` (anonymous) | 422, `USERERROR: Card::Error::UserError` |

Card rows in the database after all of this: 44 (the migration seed only);
`SELECT count(*) FROM deck_setup_tokens` is 0; the Worker's secret list is
empty. So no setup token was issued by the button path, and no
`DECKO_SETUP_TOKEN` secret was set: with both sources absent, `/setup` can
only ever refuse, and the site cannot reach a state where the first owner
holds a token. The anonymous write verbs were refused with 403 even though
the root config sets `DECKO_WRITE_PATH = "1"`; with no account created,
sign-in cannot succeed, so this does not yet show whether a button deploy is
writable once an owner exists. The 422 on `DELETE` (a deck-level user error
rather than a gate refusal) and the migration-seeded account substrate mean
that question needs a run with a token supplied by other means.

All scratch resources were removed afterwards (queue consumers, then Worker,
then queues, then D1 database). A read-only listing confirms the account
holds only `decko-brandon` (D1) and `decko-brandon-trial` (Worker), which
were not touched.

### Account usage for this run, read through the API

Baseline (empty window before the run) and end, over the whole run, through
the GraphQL analytics API:

| | Baseline | End |
|---|---:|---:|
| Worker requests | 0 | 158 |
| Worker CPU (µs) | 0 | 6,431,172 |
| D1 rows read | 0 | 262,514 |
| D1 rows written | 0 | 60,248 |
| D1 read queries | 0 | 13,864 |
| D1 write queries | 0 | 3,795 |

Expected against measured. The engine's own render cost was the unknown
part, so nothing on rows read was predicted in advance: 180,002 reads came
from the 99 graded-page requests, the 30-render and 4-render passes and
about a dozen single requests; 80,166 from the conformance suites; 2,346 from
the button path. Writes: 51,866 were the schema and the synthetic deck
(the seed's own `meta` said 51,585 rows written and the account counted
51,656 including the schema); 7,294 were the conformance scratch database;
1,088 were the button path's migrations. Free-plan D1 writes are capped at
100,000 rows per account per day, so this run spent about 60% of it. Reads
cost nothing against the write allowance, as expected. The Workers request
count of 158 is about three times the 99-request measurement, because the
smoke tests, the uncached-render passes and the button probes were also
requests; all 158 came from the two scratch Workers.
