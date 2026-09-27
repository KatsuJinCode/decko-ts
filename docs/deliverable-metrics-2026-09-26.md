# Deliverable metrics — resources & latency, consolidated measurement

**Date measured:** 2026-09-26 21:20–21:45 US local (2026-09-27 04:20–04:45 UTC).
**Scope:** the decko-ts deliverable — edge latency of the hosted site, side-by-side
against the live site, engine efficiency re-verified on today's tree, and the
resource footprint of each stack. Every number below was produced by a command
run during this session; raw data and the scripts that computed it live in
`tmp/deliverable-metrics-2026-09-26/` (paths at the end).

---

## 1. Edge latency — `https://cs-deck.b-cdn.net` (ours, Bunny CDN front)

**Method.** `curl -sS -o /dev/null -D <header-file> -w "%{http_code},%{time_namelookup},%{time_connect},%{time_appconnect},%{time_starttransfer},%{time_total},%{size_download}"` per request, from this workstation. Pages = `/` plus the 12 browsable content pages (list source: `tmp/round9-engine-pages/`, 12 files — the same set the SCORECARD's "12 browsable pages" counts). 3 runs per page, all HTTP 200 (39/39).

- **Cold** = fresh unique `?cb=<unique>` per run (cache-busted), fresh connection per run (one `curl` invocation per request).
- **Warm** = same `?cb=` hit 3× inside one `curl` invocation, so runs 2–3 reuse the TCP/TLS connection.

**Finding that changes the cold/warm story:** Bunny does **not** cache these responses. All 39 cold-pass header captures show `CDN-Cache: MISS` and origin `Cache-Control: no-store` (`tmp/deliverable-metrics-2026-09-26/edge-headers/`, 39 files); a 3× repeat probe of the same URL also returned MISS every time. So there is no CDN-cache hit state to measure — "warm" below means *connection reuse only*, not an edge cache hit. (Making repeat views free at the edge would start with the origin emitting cacheable `Cache-Control` on GETs.)

### Per-page results (ms; percentiles over each page's 3 runs, linear-interpolation method)

| Page | cold TTFB p50 | cold TTFB p95 | cold total p50 | cold total p95 | warm TTFB p50 | warm TTFB p95 |
|---|---:|---:|---:|---:|---:|---:|
| / (root) | 307.8 | 405.9 | 320.2 | 417.9 | 878.8* | 1099.4* |
| Home | 332.9 | 366.7 | 344.5 | 388.4 | 138.3 | 458.9 |
| About | 310.9 | 524.9 | 327.3 | 533.7 | 138.7 | 462.1 |
| Aikido_Oak_Cliff | 353.2 | 414.0 | 406.7 | 460.4 | 114.2 | 277.2 |
| Brandon_WilliamsCraig | 371.3 | 723.2 | 633.1 | 821.2 | 115.7 | 308.6 |
| Conflict_Done_Well | 306.7 | 412.0 | 382.7 | 480.9 | 120.0 | 288.6 |
| Latest_News | 325.5 | 805.2 | 453.3 | 970.1 | 158.7 | 342.1 |
| Make_Contact | 320.1 | 511.9 | 352.7 | 515.4 | 126.5 | 279.5 |
| Recommendations | 332.3 | 446.7 | 494.3 | 520.5 | 433.9 | 764.5 |
| What_Do_We_Need_To_Know | 312.2 | 728.9 | 369.9 | 761.8 | 127.0 | 285.7 |
| Wikirate | 335.8 | 369.5 | 425.4 | 461.4 | 138.2 | 263.1 |
| blog | 816.4 | 2438.3 | 1007.2 | 2522.3 | 228.9 | 378.3 |
| help | 411.0 | 502.5 | 411.4 | 517.4 | 123.8 | 289.7 |

\* The root's warm p50 is inflated by run 1 (fresh TLS 0.653 s), which is inside the 3-run window by construction. The warm-connection population that excludes each page's first run is the number below.

### Overall (all 13 URLs)

| Population | n | TTFB p50 | TTFB p95 | total p50 | total p95 |
|---|---:|---:|---:|---:|---:|
| Cold (fresh cb, fresh connection) | 39 | **335.8 ms** | **820.7 ms** | 425.1 ms | 1009.3 ms |
| Warm (same cb, reused connection) | 39 | 155.4 ms | 809.0 ms | 189.4 ms | 842.8 ms |
| Warm-connection only (runs 2–3) | 26 | **122.8 ms** | **428.3 ms** | 144.5 ms | 482.3 ms |

---

## 2. Live-site comparison — `https://culturesmith.com`

**Method.** curl is Cloudflare-blocked from this workstation (403 "Just a moment…" — confirmed again in `docs/bunny-site-baseline.md` §Live). Used the **agent-browser** skill instead: the local browser session passes Cloudflare. For each page × 3 runs: `agent-browser open <handle> <url>`, then `eval` of `performance.getEntriesByType('navigation')[0]` — `responseStart − startTime` = browser TTFB (includes DNS + TCP + TLS + redirect for a fresh navigation), `loadEventEnd − startTime` = load. All 15 navigations were `type: navigate`, `protocol: h2`, `redirects: 0`, correct page titles (raw: `tmp/deliverable-metrics-2026-09-26/live-nav.jsonl`).

### Per-page (ms)

| Page | live TTFB p50 | live TTFB p95 | live load p50 | live load p95 | TTFB samples |
|---|---:|---:|---:|---:|---|
| Home | 652 | 859 | 804 | 1016 | 637, 652, 882 |
| About | 570 | 704 | 766 | 1217 | 719, 570, 555 |
| blog | 1022 | 1423 | 1197 | 1706 | 1468, 1022, 1004 |
| Brandon_WilliamsCraig | 1287 | 1492 | 1770 | 2357 | 1287, 1515, 1168 |
| Aikido_Oak_Cliff | 766 | 948 | 1192 | 2781 | 968, 766, 712 |
| **Overall** | **882** | **1482** | **1192** | **2583** | n=15 |

(The very first navigation of the session — browser cold to the domain — was Home at **1791 ms TTFB** / 2161 ms load.)

### Side-by-side — ours vs live (TTFB)

| Population | ours (Bunny CDN front) | live (Cloudflare → origin) | ratio (live/ours) |
|---|---:|---:|---:|
| Same 5 pages, fresh connection per request | **370.4 ms p50 / 1357.1 ms p95** (n=15) | **882 ms p50 / 1482 ms p95** (n=15) | 2.4× p50, 1.1× p95 |
| Same 5 pages, reused connection | **120.8 ms p50 / 208.2 ms p95** (n=10) | 882 ms p50 / 1482 ms p95 | 7.3× p50, 7.1× p95 |
| All 13 ours URLs vs live 5 | 335.8 ms p50 / 820.7 ms p95 | 882 ms p50 / 1482 ms p95 | 2.6× p50, 1.8× p95 |

The closest like-for-like pair is fresh-navigation vs fresh-connection (both pay DNS+TCP+TLS once): **ours 370 ms p50 vs live 882 ms p50 — ~2.4× faster**. The reused-connection pair (120.8 vs 882, ~7×) is the "site is cached in a browser session" shape a repeat visitor actually experiences; live keeps paying a ~600–1500 ms origin-render cost per navigation even with the connection warm, ours does not. The prior scorecard line ("TTFB p50 98.6 ms vs live 1,250 ms") is consistent in shape with today's warm-connection p50 (122.8 ms) and live p50 (882–1250 ms depending on method), but those specific numbers were not re-derived here; today's tables replace them.

---

## 3. Engine efficiency — re-verified on today's tree

### 3a. Queries per render — depth sweep (M3)

**Command:** `npx vitest run tests/card/render/depth-sweep.test.ts` — **passed** (1 test, 1.19 s), fresh result written to `benchmarks/results/depth-sweep-ts.json` (measured_at 2026-09-27T04:31Z). Local better-sqlite3 over production-schema DDL, synthetic inclusion chains; Ruby truth = `benchmarks/results/ruby-nesting-r1-r2.json` (ruby-decko-oracle, card 1.110.0 / decko 0.20.0, measured 2026-09-19; formula depth+3).

| depth | Ruby queries (measured) | TS round-trips (cold) | TS statements (cold) | TS warm RT / SQL | TS warm wall ms |
|---:|---:|---:|---:|---:|---:|
| 1 | 4 | 7 | 13 | 0 / 0 | 0.181 |
| 2 | 5 | 7 | 14 | 0 / 0 | 0.355 |
| 4 | 7 | 9 | 16 | 0 / 0 | 0.337 |
| 8 | 11 | **13** | **20** | **0 / 0** | 0.462 |

Full sweep (depths 1–20 measured, no gaps): RT = 7 + max(0, depth−2), statements = 13 + max(0, depth−1), warm = 0 RT / 0 SQL at **every** depth (test-asserted).

**Honest correction to the scorecard's M3 cell.** The scorecard claims "constant ~2 round-trips at ANY depth (Ruby: depth+3, ~5.5× more at depth 8)". Today's instrument does **not** show that: the cold full-render path is *level-linear* in round trips (one batch per inclusion level beyond depth 2 — the trade, documented in the test's structural-assertion comments, for rows-read dropping from O(deck × passes) to O(page)), and at depth 8 TS issues **13** round-trips vs Ruby's 11 (ratio 0.85 — TS *more* round trips, not 5.5× fewer). What today's tree does prove on this axis: **warm renders are free of queries at any depth (0/0, asserted)**, and wall-clock stays single-digit-ms warm at every depth. The "constant ~2 / 5.5×" claim matches neither the current test pin nor today's run; it should be corrected in the scorecard, not quoted.

### 3b. Warm render ms — closed-view bench

**Command:** `node node_modules/vitest/vitest.mjs run --root . tests/card/render/closed-view-structure-content-bench.test.ts` — **passed with byte parity** (11.0 s). 47,113-card shard over the corpus deck, closed view of a huge-content card:

| measure | today | reference (test header / ask) |
|---|---:|---:|
| prewarm | 4513 ms | — |
| first render (settle) | 2338 ms | — |
| cold-equivalent closed-view render | **1097 ms** (run 2: 1003 ms) | ~700 ms ask / 896 ms test header |
| warm closed-view render | **32 ms** | 21 ms test header / "warm 9 ms" ask |

### 3c. Perf harness (budget tripwire) — **one budget RED today**

**Command:** `node node_modules/vitest/vitest.mjs run --root . benchmarks/perf/render-perf-harness.test.ts` — **FAILED** (result JSON still written; `benchmarks/results/perf/render-perf.json`, measured_at 2026-09-27T04:33Z, `overall_pass: false`):

| workload | measured | budget | pass |
|---|---:|---:|---|
| warm-render-sample (60 entries, pass-2 avg) | **28.45 ms/entry** (median 27, p95 41) | 25 | **NO** |
| pathological-class (641 `tgpqpf+uiqxodma:closed`, warm) | **30 ms** (1 batch / 7 statements) | 2000 | yes |
| statement-discipline (warm render statements) | **7** | 10 | yes |
| closureWarm-coverage (cold cards after prewarm) | **0** | 0 | yes |

The warm budget was green at landing (6.05 ms on 2026-09-23) and is red today on this workstation (28.45 ms). That is a 4.7× regression vs the recorded number — machine-load variance or a real tree regression; this session did not bisect it. It does **not** support the "warm render single-digit ms" claim on today's tree/machine; treat "warm render" as **tens of ms (28 ms sample avg / 32 ms closed-view bench)** until the budget is re-run green.

### 3d. Local workerd demo (one-click deck, `--local`)

**Boot:** local workerd state was already provisioned (`scripts/deploy/one-click-deck/out/local-state`, seed 79,858 rows, `reprovision3.log`). Booting with the current `wrangler.oneclick.toml` opened an **empty** D1 (`no such table: cards`): mechanism — miniflare keys the local D1 sqlite per `database_id`, and the toml's id was rewritten to the real remote id by today's `--execute` run (`execute-run-20260927T040343Z.log`), orphaning the populated local file (verified populated: `…D1DatabaseObject/a36f84ea….sqlite`, 6241 cards). Fix: a config **copy** with the original placeholder id (`scripts/deploy/one-click-deck/wrangler.oneclick-localdemo-placeholder-id.toml` — new file, disclosed deviation from "doc is the only write"); booted `npx wrangler dev --config <copy> --persist-to out/local-state` → "Ready on http://127.0.0.1:8787".

**`/_status` (live capture):**
```json
{"ok":true,"engine":"decko-ts","runtime":"cloudflare-workers",
 "view":"miniflare-proven (see tests/deploy/deploy-worker-miniflare.test.ts)",
 "database":{"ok":true,"d1":true,"card_count":6241},
 "deck":{"booted_at":"2026-09-27T04:38:58.352Z"}}
```

**Page timings** (5 pages × 3 runs, client-side curl on localhost; `workerd-pages.csv`): all `/`-root, `/Home`, `/Scale Page 1x`, `/Scale Page 173x` → 200, client total p50 217.4 ms / p95 252.3 ms — dominated by a ~210 ms loopback-connect artifact of the measurement shell (DNS 0.03 ms but TCP connect 0.21 s even with `--noproxy`), **not** server time. The authoritative server-side numbers are `/__metrics`:

**`/__metrics` (after 16 requests):** `requestCount: 16`, `errors: 3`, `queryCount: 54`, `rowsRead: 68,690`, `rowsWritten: 0`, `coldStarts: 1`, **wall p50 0.5 ms / p95 0.95 ms** (all 16 requests inside the 0–1 ms histogram bucket; `cpuMs` identical — Workers exposes no separate CPU clock, per the recorder's own disclosure). Per-request samples from the tail: `/_status` = 1 query (6241 rows); the one render that errored = 32 queries; `/__metrics` itself = 0.

**Errors, honest:** `/Depth Level 1` (a synthetic seed card, not one of the 12 content pages) returned **500** on all 3 hits. Reported as observed; not debugged in this session.

**Shutdown:** stopped by verified PID — full chain enumerated with `Get-CimInstance Win32_Process` (bash → npx → node wrangler dev → cmd → node → esbuild + 2× workerd), then `taskkill /PID <top> /T /F` on the two verified chain roots (25412, then detached inner root 43912). Verified: no wrangler/workerd/node of this chain remained, port 8787 had no listener (only client-side TIME_WAITs).

---

## 4. Resource fraction — what each stack runs on

**Ours (cs-deck.b-cdn.net serving path)** — all facts read this session via `ssh ubuntu@170.9.231.182` (`systemctl status …`, `/etc/nginx/sites-enabled/cs-deck-bunny-origin-8443.conf`, `/._status`):

| layer | fact | source |
|---|---|---|
| edge | Bunny CDN pull zone 6689521; observed edge `Server: BunnyCDN-LA1-954` | response headers captured this session (`edge-headers/`) |
| TLS/proxy | nginx vhost `cs-deck-bunny-origin-8443.conf`, `server_name cs-deck.b-cdn.net` → `proxy_pass http://127.0.0.1:3201` | vhost file on VM |
| app | **1 Node process** — `decko-bunny-render.service`, `/usr/bin/node …/vm-staging-server.mjs corpus-v2-scrubbed.sqlite3 3201`, Main PID 2877618 | systemctl status |
| **RAM** | **119.5 MB RSS (peak 121.9 MB)**, 7 tasks, CPU 15.9 s since 04:13:32 UTC | systemctl status |
| DB | **no DB process** — read-only SQLite file (`corpus-v2-scrubbed.sqlite3`, 21,671 cards per `/_status`) | `/_status` + unit exec line |
| host | **1 VM**: `brandon-portal-vm`, Ubuntu 24.04.5 LTS, 2 vCPU, 11 GiB RAM (1.2 GiB used total, incl. unrelated services) | `nproc`, `free -h`, `/etc/os-release` on VM |
| siblings (same VM, same deploy family) | `decko-bunny-origin.service` (minimal record view, :3200) 49.4 MB RSS; `decko-staging.service` 59.2 MB (peak 129 MB) | systemctl status |

Also demonstrated this session (§3d): the same engine runs as a Cloudflare Worker on local workerd — zero VM, zero DB process, D1+sqlite file — and is one-click deployable to CF's free tier (scorecard: demo'd live at `decko-one-click-demo.jpswilner.workers.dev`).

**Live (culturesmith.com):** Cloudflare edge in front (browser negotiated `h2`; direct curl is challenge-blocked), Rails + Postgres origin per the ask's brief — consistent with decko being a Rails/Ruby app (the oracle measured in §3a runs `card_gem 1.110.0` / `decko_gem 0.20.0` on SQLite). No origin CPU/RAM numbers were (or could be) read this session — none are invented here.

**Fraction, stated plainly:** ours serves Brandon's full browsable deck from **one Node process at ~120 MB RSS on a shared 2-vCPU VM with no database process**, while the live stack keeps a Rails+Postgres origin warm enough to answer every navigation in ~0.6–1.5 s. The engine itself renders in 0.5–1 ms server-side (workerd `__metrics`) to ~30 ms warm (in-process benches).

---

## 5. Headline table

| Metric | ours | live / Ruby | source |
|---|---|---|---|
| Page TTFB p50 (fresh navigation/connection) | **370.4 ms** (5 pg) / 335.8 ms (13 URL) | **882 ms** (live, browser) | §1, §2 |
| Page TTFB p95 (fresh) | 1357.1 ms (5 pg) / 820.7 ms (13 URL) | 1482 ms (live) | §1, §2 |
| Page TTFB p50 (warm connection) | **120.8 ms** (5 pg) / 122.8 ms (13 URL) | 882 ms — live pays ~6–13× even warm | §1, §2 |
| Edge cache | none exists (`CDN-Cache: MISS` 39/39; origin `no-store`) — repeat views not yet free at edge | Cloudflare front (h2) | §1 |
| Queries/render depth 8 (cold, synthetic chain) | TS **13 RT / 20 SQL** — Ruby 11 (depth+3). NOT constant; NOT 5.5× fewer | Ruby depth+3 | §3a |
| Queries/render warm (any depth) | **0 RT / 0 SQL** (depth-sweep, test-asserted); 1 batch / 7 statements (corpus warm probe) | — | §3a, §3c |
| Warm render | **32 ms** closed-view bench; warm sample **28.45 ms/entry — budget RED (25)** | — | §3b, §3c |
| Cold render (47k-card deck, closed view) | ~1000–1100 ms in-process; server-side render wall on workerd **p50 0.5 ms / p95 0.95 ms** per request | — | §3b, §3d |
| Stack footprint | 1 VM (2 vCPU/11 GiB, shared) + **1 Node process, 119.5 MB RSS**, no DB process; or 0 VMs on CF Workers | Rails+Postgres origin (ask-given; origin metrics unreadable) | §4 |

## 6. Limitations (honest)

- **n=3 per page everywhere.** Percentiles over 3 samples are coarse — p95 of 3 points is interpolation between the top two; the blog 2.6 s cold outlier moves aggregates visibly. Directional claims (2–7× on TTFB) are robust to it; two-digit precision is not.
- **No CDN-cache effect was measurable — because none exists.** Origin sends `Cache-Control: no-store`, so every "warm" number is connection reuse only. The often-imagined "free repeat view at the edge" is future work (cacheable GETs), not a measured property.
- **Method asymmetry in the side-by-side.** Ours was measured with curl (HTTP/1.1 via Bunny), live with a real browser (h2 via Cloudflare, which also solves the JS challenge). Fresh-connection-vs-fresh-navigation is the fairest pair; browser connection reuse benefits live less than it benefits ours (live stays ~6–13× slower warm). Bytes also differ: ours serves ~22 KB Home HTML vs live's ~6.4 KB compressed — the 80.1% content-match shortfall means the comparison is not same-payload.
- **Single region, single workstation.** All measurements from one US machine against one Bunny LA edge POP and one Cloudflare POP. Real visitors from other geographies will see different absolutes (edge proximity), likely similar ratios.
- **Machine-load sensitivity.** The perf harness warm budget (green 6.05 ms at landing, red 28.45 ms today on this workstation) shows these micro-numbers move with machine state; the tree may also genuinely have regressed — not bisected here. The closed-view bench moved similarly (21→32 ms warm, 896→1097 ms cold).
- **The scorecard's M3 cell ("constant ~2 RT, 5.5× at depth 8") is contradicted by today's instrument** (§3a) and needs correcting before it is quoted to Ethan. What survives verification: warm renders are query-free at any depth, and wall-clock stays far under the Ruby oracle's per-render query cost.
- **The local workerd 500s** on `Depth Level 1` are reported as observed; the synthetic demo deck is not the content deck, and the 12 real pages were exercised at the edge (§1), not locally.

## 7. Raw data inventory (`tmp/deliverable-metrics-2026-09-26/`)

| file | what |
|---|---|
| `edge-cold.csv`, `edge-warm.csv` | per-request timing fields, all 13 URLs × 3 runs × 2 passes |
| `edge-headers/*.txt` (39) | response headers incl. `CDN-Cache: MISS`, `Cache-Control: no-store` |
| `edge-stats.mjs` | percentile computation for the edge CSVs |
| `live-nav.jsonl`, `live-nav-parsed.json`, `live-stats.mjs`, `live-read.js` | live browser navigation-timing raw + parser |
| `workerd-pages.csv` | local demo page timing raw |
| `list-workerd-processes.ps1` | process enumeration used for verified-PID stops |
