# Cost model: does a deck fit Cloudflare's free plan?

Status: partial. The warm-render CPU figures and the D1 read figures below are
measured. The cold-isolate boot does not yet fit the free plan's CPU limit, and
the energy comparison against Ruby Decko has not been measured yet. Nothing in
this document should be quoted as "$0 hosting" until both are resolved.

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
| 500-item pointer | 64,392 | 15.9 – 20.8 | 9.8 | no: borderline at best |

Before the fix, the 16 KB body spent ~20 ms in `findUriMatch`, which rescanned
the whole remaining text with all three URI prefix regexps for every
candidate. The fix remembers each regexp's next match start for the text; the
synthetic-v1 grade stayed rendering 1754/1754 and semantics 2389/2389.

## Cold isolate

The first request an isolate serves boots the deck: it loads every card row
into in-isolate caches. Measured: 172 – 188 ms of workerd process CPU for that
one request on the cf-scale deck. That is far over 10 ms. Every later request
in the same isolate reuses the caches and issues one D1 query (the
data-version freshness check, 1 row read).

Cloudflare tolerates occasional overshoot on the free plan but does not
promise it; a deck that depends on that tolerance is not a guaranteed $0
deck. Making the boot fit is the open engineering item: load the deck lazily
(per card reached) instead of whole, or ship the warm caches as a prebuilt
snapshot so the boot is a parse, not a scan.

## D1 reads per page

Measured with the worker's own `/__metrics` recorder, which forwards D1's
`meta.rows_read`:

- Warm page: 1 query, 1 row read (freshness check), every page above.
- Cold boot: the control batch in `benchmarks/cf-scale/probe-expectations.json`
  (5 requests including one boot, recorded 2026-09-24) read 82,004 rows, so a
  boot reads on the order of 80,000 rows on this deck.

Daily budget arithmetic at 5,000,000 rows read:

- Warm traffic alone: 5,000,000 page views; the 100,000 requests/day Worker
  limit binds first.
- Each cold boot costs ~80,000 rows, so the budget covers ~60 boots a day with
  no other reads. Isolate lifetime decides whether that is enough: at
  100,000 requests/day and ~60 boots, each isolate must serve ~1,600 requests
  on average.

## What fits $0 today

- Reads: a deck of this size (~2,300 cards) at up to 100,000 page views a
  day, provided isolates live long enough to keep boots under ~60 a day.
- CPU: ordinary pages, JSON, denied cards, nest chains and long bodies fit
  10 ms warm. Pages that render hundreds of items (the 500-item pointer) do
  not reliably fit. The cold boot does not fit.

## Energy versus Ruby Decko

Not measured yet. The method planned: render the same pages with the Ruby
oracle app (`reference-harness/oracle/app`) and with the port, read process
CPU-seconds per warm page for each, and report the ratio with both setups
described. No ratio should be quoted until that run exists.
