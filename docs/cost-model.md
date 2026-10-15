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

`node benchmarks/cf-scale/measure-workerd-cpu.mjs --deck cf-scale --n 200`

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

`node benchmarks/cf-scale/measure-workerd-cpu.mjs --cold-only --first <path> [--entry <worker file>]`

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
- Cold boot before on-demand loading: the control batch in `benchmarks/cf-scale/probe-expectations.json`
  (5 requests including one boot, recorded 2026-09-24) read 82,004 rows, so a
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
