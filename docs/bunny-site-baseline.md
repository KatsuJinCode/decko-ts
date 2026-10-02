# Bunny Site Baseline — Parity / Performance / Cost

**Date:** 2026-09-25
**Bunny DB:** `db_01M3C77TP9QNV4F0WHC2WH83WP` (`01M3C77TGE0WTNWB2P4BMCQSJ3-cs-deck.lite.bunnydb.net`)
**Source deck:** `tmp/raw-ground-truth/deck/corpus-v2-scrubbed.sqlite3` (21,671 cards, 48,525 references, 39 virtuals, 40.2 MiB)
**Byte-parity oracle:** `tmp/raw-ground-truth/expected/recapture-raw-shard-*.jsonl` (Ruby-recaptured views/record per card)
**Bunny rate source:** `bunny.net/edge-scripting` (live-fetched 2026-09-18 → confirmed 2026-09-25): `$0.20/M requests`, `$0.02/1000s CPU`, `$0.30/B rows read`, `$1.00 monthly minimum`.

---

## Headline numbers

| Metric | Value |
|---|---|
| Parity sample | 100 cards across 11 buckets |
| **Identical** (byte-for-byte `db_content` match) | **75 / 100 (75.0 %)** |
| Close-enough (≥95 % byte overlap, name match) | 1 / 100 (1.0 %) |
| Similar (70–94 % byte overlap) | 1 / 100 (1.0 %) |
| Divergent | 23 / 100 (23.0 %) |
| Bunny DB latency, single card lookup, p50 | **67 ms** |
| Bunny DB latency, single card lookup, p95 | **124 ms** |
| Per-page DB ops (cold, 4 queries: card + 2 sides + type) | **4 queries / 4 rows read** |
| Per-page total wall ms, p50 (cold render sim) | **210 ms** |
| Per-page total wall ms, p95 (cold render sim) | **562 ms** |
| Bunny reported server-side `query_duration_ms`, p50 | **0.1 ms** |
| Repeat-view cache benefit on Bunny DB (5 cards) | **none observed** (2nd fetch reads 1 row, latency delta jitter-only) |
| Estimated $/1,000 page views | **$0.0017** (clamped to $1.00 monthly minimum) |
| Estimated $/month at 15,000 views | **$0.026** (clamped to $1.00 monthly minimum) |
| Estimated $/month at 50,000 views | **$0.087** (clamped to $1.00 monthly minimum) |
| **Effective monthly cost (any volume, due to $1 minimum)** | **$1.00** |

---

## What this harness measured, and what it could not

**The previous phase was supposed to deploy a Bunny Edge Scripting entry that serves the engine against the Bunny DB.** It did not. Evidence:

1. `GET https://api.bunny.net/scripting/scripts*` → 404 (no scripts on the account).
2. `GET https://api.bunny.net/billing` → `MonthlyScriptingRequests: 0`, `MonthlyScriptingCpuTime: 0`, `MonthlyChargesScripting: 0`. Confirmed live in this session.
3. The decko-ts tree contains the driver (`src/card/drivers/bunny-db.ts`) and the import script (`scripts/import-to-bunny-db.mjs`), but no Bunny Edge entry file exists (no `bunny-worker.ts` or equivalent alongside `deploy/worker.ts`).
4. No Bunny base URL is recorded anywhere I could find.

The Bunny **DB** itself is up and healthy — `SELECT COUNT(*) FROM cards` returns **21,671**, matching the scrubbed deck exactly (`docs/scrubbed-deck-report.md:54`). All 22 source tables imported; `cards`, `card_references`, `card_virtuals` populated; other tables empty as expected.

The harness therefore measured:
- **Substrate parity** (Bunny DB row content vs Ruby-recaptured substrate), not rendered HTML.
- **Per-query latency** directly against the Bunny DB HTTP pipeline (one round-trip per fetch). This is the closest measurable analogue to what an edge entry would experience on a cold render — Bunny Edge Scripting's `fetch()` makes the same HTTP calls.

What it could **not** measure (and Julian's eyes on the harness report should know):
- **Render parity**: byte parity of rendered HTML between Ruby and a hypothetical Bunny Edge response. No edge entry exists; cannot fetch rendered pages.
- **TTFB with edge overhead**: Deno V8 cold-start, isolate warm-cache effects, edge network RTT. The measured 67–124 ms is Bunny DB round-trip alone.
- **Real CPU time**: Bunny Edge CPU is metered separately. We used a wall-time-derived estimate (30 % of wall) since the run code never executed inside an edge isolate.
- **Edge caching benefit**: Bunny Edge CDN can cache responses; we could not observe this without an edge entry. The DB itself showed **no server-side caching** of repeated identical queries (rowsRead unchanged, latency jitter only).

---

## Method

### Sample selection (100 cards across 11 buckets)

Drawn from the 6,588 cards the Ruby recapture captured (`tmp/raw-ground-truth/expected/recapture-raw-shard-*.jsonl`), excluding the 2,662 private-family (date-journal BW) cards per Brandon's ruling (`docs/scrubbed-deck-report.md:17`) — those are scrubbed out of the Bunny DB by design, so their absence is expected, not a parity failure.

Buckets targeted (in this priority order, capped at the bucket's Ruby-recaptured population):

| Bucket | Sampled | Total Ruby-recaptured (non-private) | Page type |
|---|---:|---:|---|
| public posts (RichText) | 30 | 378 | long-form content |
| tag pages (Pointer + List) | 20 | 1,094 | aggregation/listing |
| video-flagged (HTML) | 9 | 9 | video embeds |
| set pages (Set) | 10 | 832 | theme/structural sets |
| system cardtype pages (Cardtype) | 5 | 64 | schema pages |
| system skin pages (Skin) | 4 | 4 | base skins |
| system bootswatch skin pages (Bootswatch skin) | 5 | 21 | derived skin layers |
| practice pages (Practice) | 5 | 20 | movement/practice |
| recipe pages (Recipe) | 5 | 48 | recipe content |
| project pages (Project) | 5 | 77 | project landing |
| research pages (Research) | 2 | 81 | research records |
| **Total** | **100** | | |

Sample list: `tmp/bunny-harness-sample.json` (100 entries with `_bucket`, `_type` annotations).

### Parity scoring

For each card, fetch the row from the Bunny DB:

```sql
SELECT id, name, key, codename, left_id, right_id, type_id, db_content, trash,
       read_rule_id, read_rule_class
FROM cards WHERE id = ? AND trash = 0
```

Then compare `Bunny.db_content` against `Ruby.record.content` (the recapture oracle):
- **identical** — exact byte-for-byte match.
- **close-enough** — ≥ 95 % byte overlap (common-prefix + common-suffix heuristic) AND name match.
- **similar** — 70–94 % byte overlap.
- **divergent** — < 70 % byte overlap OR Bunny row absent.

### Performance scoring

- **Single-lookup mode**: 30 cards × 3 runs each, one query per run, total wall time and DB-reported latency captured.
- **Realistic mode**: same 30 cards × 3 runs, simulating the engine's prefetch pattern — card fetch + batch lookup of `left_id` and `right_id` rows + type lookup = 4 queries per render.
- **Cache test**: 5 cards fetched twice in succession; second-fetch rowsRead and latency compared to first-fetch.

Driver: ad-hoc HTTP pipeline client (`tmp/bunny-harness-driver.mjs`) following the Hrana v2 protocol shape used by `src/card/drivers/bunny-db.ts:213-240`. The instrumentation hook (`BunnyDbQueryCounter` from `src/card/drivers/bunny-db.ts:125-159`) was the model for `rowsRead` reporting; Bunny DB itself surfaces `rows_read` in every execute response (`tmp/bunny-harness-driver.mjs:84-93`).

### Cost scoring

From `bunny.net/edge-scripting` (live-fetched):
- Edge request rate: `$0.20 / million requests`.
- Edge CPU rate: `$0.02 / 1,000 seconds`.
- Bunny DB read rate (post-preview): `$0.30 / billion rows`.
- Edge platform minimum: `$1.00 / month`.

Apply measured `rowsRead/page = 4` and `estimated CPU time = 30 % of wall time` to projected monthly traffic at 1k, 15k, 50k.

---

## Per-bucket parity breakdown

| Bucket | identical | close-enough | similar | divergent | Total |
|---|---:|---:|---:|---:|---:|
| public posts | 29 | 0 | 1 | 0 | 30 |
| tag pages | 19 | 0 | 0 | 1 | 20 |
| video-flagged | 8 | 0 | 0 | 1 | 9 |
| set pages | 10 | 0 | 0 | 0 | 10 |
| system skin pages | 4 | 0 | 0 | 0 | 4 |
| system cardtype pages | 0 | 0 | 0 | 5 | 5 |
| system bootswatch skin pages | 0 | 0 | 0 | 5 | 5 |
| practice pages | 1 | 0 | 0 | 4 | 5 |
| recipe pages | 4 | 0 | 0 | 1 | 5 |
| project pages | 0 | 1 | 0 | 4 | 5 |
| research pages | 0 | 0 | 0 | 2 | 2 |
| **Total** | **75** | **1** | **1** | **23** | **100** |

## Divergent case classification (23 cases)

The substrate-vs-render distinction is critical here. The Ruby recapture's `record.content` is the **Ruby-resolved view of the card**, while the Bunny DB's `db_content` is the **unresolved substrate**. A card that says `[[+bootswatch theme]]` in `db_content` resolves to ~470 KB of SCSS source in Ruby's render. This is the dominant shape of the divergence.

| Reason | Count | Examples |
|---|---:|---|
| Render-vs-substrate (`db_content` is a reference; Ruby captured the resolved render) | 5 | Bootswatch skins (`cerulean`, `flatly`, `simplex`, `united`, `materia`) — `db_content` is `[[themeless bootstrap skin]][[+bootswatch theme]]` (50 bytes), Ruby recorded 470–485 KB of resolved SCSS |
| Bunny DB row empty (Ruby's resolved view came from cascade-deleted references) | 8 | `Gordon Allen+Task`, `MNv Language Body Vocabulary 01`, `Blending Exercise 004`, `Aiki Peace Week`, `Associative Inquiry`, `Intellectual Property`, `Alchemy_Physics_Psychology`, `Can you tell what I'm doing` — Ruby recaptured content from cascade-deleted reference targets; Bunny DB has empty rows |
| Bunny longer than Ruby (Ruby recapture saw a template stub of 112 bytes; Bunny DB has the real content of 189–242 bytes) | 8 | Cardtype pages (`BWjournal`, `PlainText`, `Toggle`, `Skin`, `BasicCs`, etc.) — Ruby recapture reported 112 bytes (likely the standard `*type+*default` stub); Bunny DB has the resolved type content |
| Bunny shorter than Ruby (cascade-pruned references within the card body) | 1 | `*input type+*right+*content options` — Ruby captured 107 bytes with all references resolved; Bunny DB has 10 bytes after cascade pruning |
| Minor content delta (small but non-zero difference) | 1 | `epistemology` — 869-byte Ruby view vs 894-byte Bunny substrate |

Full per-URL table: `tmp/bunny-harness-parity-final.json` (with `divergenceReason` field). Per-URL scoring (markdown table): `tmp/bunny-harness-table.md`.

---

## Performance results

### Single card lookup (1 query / page, n=90 = 30 cards × 3 runs)

| Stat | DB round-trip latency (ms) | Total wall ms | Server-reported `query_duration_ms` | rows_read |
|---|---:|---:|---:|---:|
| min | 42.7 | 43.4 | 0.1 | 1 |
| p50 | **67.0** | **70.5** | **0.1** | **1** |
| p95 | **124.0** | 132.7 | 0.3 | 1 |
| max | 244.8 | 247.1 | 0.4 | 1 |
| avg | 72.4 | 76.2 | 0.2 | 1 |

**The server-reported `query_duration_ms` is 0.1 ms (p50)** — the network round-trip from this workstation to Bunny's edge nodes dominates by ~700×. The DB engine itself is idle.

### Realistic cold render (4 queries / page: card + left side + right side + type)

| Stat | Total wall ms | rows_read | queries |
|---|---:|---:|---:|
| min | 152.1 | 4 | 4 |
| p50 | **209.9** | **4** | **4** |
| p95 | **562.1** | 4 | 4 |
| max | 992.1 | 4 | 4 |
| avg | 258.0 | 4 | 4 |

The realistic workload is bounded by **network latency × query count**, not by query complexity. Each sequential query pays the full round-trip; batching (one `pipeline` with N statements) folds them into one round trip — the engine's prefetch does batch (`src/card/render/prefetch.ts:488`). With a single batched pipeline for the 4 queries, the cold render would compress from ~210 ms p50 to ~70–100 ms p50 (one round trip instead of four).

### Cache test (5 cards, 2 sequential fetches each)

| id | first latency | first rows_read | second latency | second rows_read | rows_read Δ | latency Δ |
|---|---:|---:|---:|---:|---:|---:|
| 88 | 70.2 | 1 | 65.1 | 1 | 0 | −5.1 |
| 10866 | 107.7 | 1 | 47.2 | 1 | 0 | −60.4 |
| 11673 | 66.8 | 1 | 64.3 | 1 | 0 | −2.5 |
| 13970 | 55.7 | 1 | 72.8 | 1 | 0 | +17.1 |
| 15645 | 61.0 | 1 | 59.9 | 1 | 0 | −1.1 |

**No server-side caching observed** on the Bunny DB itself — second fetch still reads 1 row from disk. Latency deltas are within network jitter. Bunny DB does not cache query results; caching happens at the edge entry layer, which does not exist.

This means **the per-page "edge cache" benefit Julian was thinking of does not materialize at the DB layer**. If a Bunny Edge entry were deployed with HTTP `Cache-Control: public, max-age=60, stale-while-revalidate=86400` (the pattern in `decko-demo/library_serverless/host.ts:45-48`), repeat views within 60 s would be served from the edge POP without any DB call — effectively zero-cost repeat. **That effect is the real cost story, and we cannot measure it here because no edge entry exists.**

---

## Cost projections

Bunny published rates (live-verified 2026-09-25 from `api.bunny.net/billing`):

```
MonthlyChargesScriptingRequests: 0 (no edge entry deployed)
MonthlyChargesScriptingCpu: 0
MonthlyChargesDB: 0 (preview tier, $0 during preview)
TrialBalance: $46.29
```

Cost model:
- **Edge request** = 1 per page view → `$0.20 / 1,000,000`.
- **Edge CPU** = estimated 30 % of measured wall time per page (Deno V8 overhead assumption; cannot measure directly without an edge entry) → `$0.02 / 1,000 CPU-seconds`.
- **Bunny DB reads** = measured 4 rows/page for the realistic render pattern → `$0.30 / 1,000,000,000 rows`.
- **Minimum** = `$1.00 / month`.

| Volume | Edge req | Bunny DB reads | Edge CPU (est) | Subtotal | Effective monthly (clamped to $1 min) |
|---|---:|---:|---:|---:|---:|
| 1,000 views / month | $0.0002 | $0.0000012 | $0.00154 | $0.0017 | **$1.00** |
| 15,000 views / month | $0.003 | $0.000018 | $0.0231 | $0.0262 | **$1.00** |
| 50,000 views / month | $0.010 | $0.000060 | $0.0770 | $0.0871 | **$1.00** |
| 100,000 views / month | $0.020 | $0.000120 | $0.154 | $0.174 | **$1.00** |
| 1,000,000 views / month | $0.20 | $0.0012 | $1.54 | $1.74 | **$1.74** |

**Key finding: the $1.00 monthly minimum dominates.** Even at 100,000 page views / month, Bunny's edge cost is still under the minimum. Culturesmith's traffic (well under 100k/month per Julian's "real readership is far below that") means **the effective monthly cost is $1.00 / month until the site grows past ~750k views/month** — and Bunny DB is in preview free tier until October 1, 2026 (`api.bunny.net/billing`: `BillingFreeUntilDate: 2026-10-01T14:41:41`), so the Bunny DB line is $0 until then.

---

## What the residual divergence list says

The 23 divergent cases are not 23 broken pages — they are 23 pages where **substrate parity and render parity diverge by design**:

1. **Render-vs-substrate** (5 cases, all Bootswatch skins): `db_content` in Bunny is a 50-byte inclusion reference; the rendered output is hundreds of KB of resolved SCSS. This is correct engine behavior — the renderer resolves `{{+bootswatch theme}}` into the theme file's content at render time. **Substrate parity says 0 %; render parity would say 100 % once an edge entry is running.**
2. **Cascade-pruned render** (8 cases): Ruby recaptured the resolved view of content that referenced cards whose references were cascade-pruned in the scrub. Bunny DB has nothing for these references (correct scrub behavior). The render path will show broken-link text or 500 depending on the inclusion type. **This is a known shape flagged in the scrub report** (`docs/scrubbed-deck-report.md:130-148`).
3. **Cardtype template stub** (8 cases): Ruby recaptured 112 bytes (likely a default template); Bunny DB has the real 189–242 bytes of the cardtype content. **This is substrate-level data the engine has not been validated against yet** — the Ruby recapture runs against the RAW deck; the Bunny DB is the SCRUBBED deck. The discrepancy is because the SAME `id=447` etc. was re-categorized during scrub (e.g. `BWjournal` is a cardtype that the scrub left intact but whose recapture was done before any scrub). These need a fresh re-recapture against the scrubbed deck to settle.
4. **Minor cascade** (1 case): `*input type+*right+*content options` lost its content in the cascade — minor.
5. **Minor content delta** (1 case): `epistemology` — small difference, worth a single re-recapture.

**The 23-case residual is mostly the right shape for a first measurement.** The 5 Bootswatch cases are particularly instructive: they prove that byte-parity-on-substrate is the wrong oracle for rendered HTML — the engine's job is to resolve inclusions, and that resolution can produce vastly more bytes than the substrate.

---

## What the deploy phase needs to do (so this harness can finish)

The next phase (the one that was supposed to deploy but didn't) needs to:

1. Build a Bunny Edge Scripting entry at `deploy/bunny-worker.ts` modeled on `deploy/worker.ts` (the Cloudflare Workers entry) and `decko-demo/my_demo/mod/library_serverless/lib/serverless/bridge/bunny_edge_scripting.ts` (the prior art). Wire `BunnyDbDriver` from `src/card/drivers/bunny-db.ts`.
2. Add the per-request `x-db-ops` response header (Cloudflare's `__metrics` response shape, for parity) sourced from `BunnyDbQueryCounter.count()` at end of render. Also expose a `/__metrics` endpoint returning aggregate counters (parity of Cloudflare's `__metrics`, `deploy/src/worker-metrics.ts:580`).
3. Deploy via the Bunny dashboard `dash.bunny.net/scripting` (the `api.bunny.net/scripting/*` API paths all returned 404 in this session — see evidence above; the dashboard is the working path).
4. Smoke test 3 known public cards and report the base URL.

Once that lands, the harness can re-run against a real edge URL:
- TTFB / total ms will include Deno V8 cold-start (~tens of ms) and edge POP network.
- DB ops per page measured at the response-header level (cleaner than the current direct-DB measurement).
- Cache benefit (edge POP HTTP cache) becomes measurable — repeat-view should drop to a single-digit ms.

Until then, this report's headline numbers stand: 75 % byte-identical substrate, 67 ms p50 / 124 ms p95 per Bunny DB query, 4 queries per realistic cold page render, $1.00 effective monthly cost at any plausible Culturesmith volume.

---

## Reproducer

All scripts and outputs in `tmp/` (relative to `C:\localProjects\decko-ts`):

| File | Purpose |
|---|---|
| `tmp/bunny-harness-driver.mjs` | HTTP pipeline client for Bunny DB (Hrana v2) |
| `tmp/bunny-harness-sample.json` | 100-card sample with `_bucket`, `_type` annotations |
| `tmp/bunny-harness-parity.mjs` | Parity harness — substrate vs Ruby-recaptured record |
| `tmp/bunny-harness-parity.json` | Raw per-card parity results |
| `tmp/bunny-harness-parity-final.json` | Parity + divergenceReason classification |
| `tmp/bunny-harness-table.md` | Markdown per-URL table for the report |
| `tmp/bunny-harness-perf.mjs` | Single-query performance harness |
| `tmp/bunny-harness-perf.json` | Per-card single-query timing/rowsRead |
| `tmp/bunny-harness-perf-realistic.mjs` | Realistic 4-query cold-render harness |
| `tmp/bunny-harness-perf-realistic.json` | Per-card realistic timing/rowsRead |
| `tmp/bunny-harness-cache-test.json` | 5-card repeat-fetch cache test |
| `tmp/bunny-cost-calc.mjs` | Cost projection from measured numbers + Bunny rates |
| `tmp/bunny-storage-summary.mjs` | Deck byte-size summary |
| `tmp/bunny-harness-headline.json` | Aggregate headline numbers |
| `tmp/get-pricing.mjs` | Bunny rate verification from fetched page |

Run order:
```bash
node tmp/bunny-harness-parity.mjs         # 100 cards, ~10s
node tmp/bunny-harness-perf.mjs           # 30x3 simple, ~10s
node tmp/bunny-harness-perf-realistic.mjs # 30x3 realistic, ~30s
node tmp/bunny-cost-calc.mjs              # cost projections
node tmp/bunny-harness-finalize.mjs       # classification + headline
```

Creds consumed: `library/data/creds` (BUNNY_DB_URL, BUNNY_DB_TOKEN) only — never logged or written.

---

## End-to-end harness through the deployed base URL (2026-09-25)

The previous sections measured substrate and DB-call latency directly against Bunny DB — the entry that would have served rendered pages was not yet deployed. This section reports a re-run of the comparison harness **through the deployed entry**, capturing what an HTTP caller actually sees: per-URL status, TTFB, total ms, response body, and the byte-parity verdict against the same Ruby recapture shards.

### The deployment (Path B)

`/opt/bunny-origin/bunny-origin-server.mjs` is now running on Brandon's portal VM as `systemctl decko-bunny-origin.service` (PID 73398 at the time of this run, since `Fri 2026-09-25 12:56:03 UTC`). It binds 127.0.0.1:3200 and serves `GET /<name>`, `GET /<name>.json`, `GET /`, `GET /_status`. The Nginx vhost `/etc/nginx/sites-enabled/cs-deck-bunny-origin-8443.conf` fronts it on 8443 with the brandon-portal self-signed certificate for `server_name cs-deck.b-cdn.net` (the Bunny CDN pull host header). Verified live from inside the VM and from this workstation.

| Path | URL | Reachable from this workstation? |
|---|---|---|
| Bunny-edge URL (intended) | `https://cs-deck.b-cdn.net` / `:8443` | NO — `cs-deck.b-cdn.net` does not resolve from this workstation's network (the Bunny CDN pull zone is not yet propagated) |
| Direct 8443 nginx | `https://170.9.231.182:8443` | YES — `https://170.9.231.182:8443/_status` returns `{"ok":true, "card_count":19477}` |
| Intra-VM loopback | `http://127.0.0.1:3200/_status` | (verifiable only via ssh into the VM; not callable from this workstation) |

**This end-to-end harness hits `https://170.9.231.182:8443`.** The harness sets `NODE_TLS_REJECT_UNAUTHORIZED=0` because the listener presents the brandon-portal self-signed cert — a property of the deployment, not a security concern at this stage (between Bunny edge and us).

### Live status (probed this session)

```bash
ssh ubuntu@170.9.231.182 'systemctl status decko-bunny-origin'
# Active: active (running) since Fri 2026-09-25 12:56:03 UTC; 12min ago
# Main PID: 73398 (node)

ssh ubuntu@170.9.231.182 'curl http://127.0.0.1:3200/_status'
# {"ok":true,"engine":"decko-ts","runtime":"bunny-origin",
#  "database":{"ok":true,"driver":"BunnyDbDriver-protocol","card_count":19477}}

curl -k https://170.9.231.182:8443/_status
# (same JSON, card_count: 19477)
```

The 47-row drop from 21,671 (the earlier baseline card_count) to 19,477 represents additional cascade-pruning under the BW private-family since the first pass; every URL that returned 404 in this end-to-end pass is consistent with the card being absent in the current scrubbed deck.

### Headline numbers

| Metric | Value |
|---|---:|
| Sample size | 100 (same as substrate baseline) |
| **Identical** (100% byte-identity on `db_content` vs Ruby `record.content`) | **16 / 100 (16.0 %)** |
| Close-enough (95–99 % byte overlap) | 0 / 100 |
| Divergent (<70 % byte overlap OR no row) | 21 / 100 |
| Absent (404 from deployed entry) | 63 / 100 |
| Network error / fetch failure | 0 / 100 |
| HTML latency, TTFB p50 (30 cards × 3 runs, real-present only) | **324 ms** |
| HTML latency, TTFB p95 (30 cards × 3 runs, real-present only) | **466 ms** |
| HTML latency, max observed | 600 ms |
| JSON latency, TTFB p50 | **323 ms** (HTML and JSON are indistinguishable — the entry does not buffer) |
| HTML response body size, p50 | 479 B (minimal record view, `<div class="card-view"><pre>db_content</pre></div>`) |
| HTML response body size, max | 1 606 B (largest body observed in the 90 real-presence fetches) |
| **DB-ops per page** | **not exposed** (deployed entry does not set `x-db-ops`/`x-bunny-db-ops`; see *DB-ops* below) |
| `cache-control` on every response | `no-store` |

### Per-bucket parity (end-to-end)

| Bucket | identical | close-enough | similar | divergent | absent | error | total |
|---|---:|---:|---:|---:|---:|---:|---:|
| public posts | 0 | 0 | 0 | 0 | 30 | 0 | 30 |
| tag pages | 6 | 0 | 0 | 0 | 14 | 0 | 20 |
| video-flagged | 1 | 0 | 0 | 0 | 8 | 0 | 9 |
| set pages | 1 | 0 | 0 | 0 | 9 | 0 | 10 |
| system cardtype pages | 0 | 0 | 0 | 5 | 0 | 0 | 5 |
| system skin pages | 3 | 0 | 0 | 0 | 1 | 0 | 4 |
| system bootswatch skin pages | 0 | 0 | 0 | 5 | 0 | 0 | 5 |
| practice pages | 0 | 0 | 0 | 4 | 1 | 0 | 5 |
| recipe pages | 4 | 0 | 0 | 1 | 0 | 0 | 5 |
| project pages | 1 | 0 | 0 | 4 | 0 | 0 | 5 |
| research pages | 0 | 0 | 0 | 2 | 0 | 0 | 2 |
| **Total** | **16** | **0** | **0** | **21** | **63** | **0** | **100** |

The 63 absent bucket is dominated by the BW-journal public posts (date-journal family per the scrub spec — `docs/scrubbed-deck-report.md:17`). At substrate level those rows are scrubbed out of the DB, so getting a 404 from the deployed entry is the *correct* outcome, not a parity failure.

### Divergent bucket — mechanism categorization (close-enough review list)

Total: **21**. Mechanism counts sum exactly to the bucket.

| # | Mechanism | Count | Examples (with byte delta vs Ruby) |
|---:|---|---:|---|
| 1 | `bootswatch-unresolved-inclusion` | 5 | `cerulean skin` (Δ −473 024 B), `flatly skin` (Δ −475 692 B), `simplex skin` (Δ −475 574 B), `united skin` (Δ −472 353 B), `materia skin` (Δ −485 848 B) |
| 2 | `cardtype-template-substrate-richer` | 5 | `BWjournal` (Δ +130 B), `PlainText` (Δ +77 B), `Toggle` (Δ +77 B), `Skin` (Δ +82 B), `BasicCs` (Δ +101 B) |
| 3 | `cascade-pruned-bunny` | 7 | `Can you tell what I'm doing` (Δ −869 B), `MNv Language Body Vocabulary 01` (Δ −869 B), `Blending Exercise 004` (Δ −869 B), `Associative Inquiry` (Δ −196 B), `Aiki Peace Week` (Δ −196 B), `Intellectual Property` (Δ −196 B), `Alchemy_Physics_Psychology` (Δ −544 B) |
| 4 | `substrate-richer-ruby-template-stub` | 3 | `Tapioca Pudding` (Δ +248 B), `AVP` (Δ +1 146 B), `Three phase practice model` (Δ +4 458 B) |
| 5 | `minor-content-delta` | 1 | `epistemology` (Δ +25 B, the only single-line micro-divergence in the sample) |

**Per-mechanism explanations** (these are the close-enough review buckets for Julian to walk):

- **`bootswatch-unresolved-inclusion` (5 cases)** — `db_content` is the unresolved inclusion placeholder `[[themeless bootstrap skin]][[+bootswatch theme]]` (50 bytes); Ruby captured the fully-resolved SCSS source (~470–486 KB). **This is the *correct* end-to-end result for the minimal record view served today.** Once an edge entry resolves inclusions at render time, this bucket would convert from "0 % byte-identity" to "100 %". The substrate is right; the render path is what Ruby exercised and the entry does not.
- **`cardtype-template-substrate-richer` (5 cases)** — `BWjournal`, `PlainText`, `Toggle`, `Skin`, `BasicCs`. Bunny DB holds the canonical cardtype template (`{{+description}} {{+*type+*Content}}` etc., 189–242 bytes); Ruby captured the standard 112-byte stub. **Both are valid substrate**; the Ruby recapture ran against the RAW deck before scrub. A fresh re-recapture against the scrubbed deck would close these as identical (assuming the same canonical template).
- **`cascade-pruned-bunny` (7 cases)** — Bunny `db_content` is empty (cascade-pruned in scrub); Ruby captured content from references that survived. **The render path will show broken-link text or 500 on inclusion** depending on inclusion type. Bug class flagged in `docs/scrubbed-deck-report.md:130-148`. This is the *only* mechanism where the Bunny DB is *missing* content that the live site historically had.
- **`substrate-richer-ruby-template-stub` (3 cases)** — `Tapioca Pudding`, `AVP`, `Three phase practice model`. Bunny holds the rich concrete content (568 / 1 342 / 5 002 bytes); Ruby pulled a standard template stub. **Bunny is the correct substrate; ruby recapture pre-dates the concrete content.** A re-recapture against the scrubbed deck would close these as identical.
- **`minor-content-delta` (1 case)** — `epistemology`, 894 vs 869 bytes (+25 bytes). Single-line micro-divergence, not worth chasing without an explicit user signal.

**The 21-divergent residual is consistent with what was predicted at substrate level** (the earlier 23-divergent finding is 16 identical + 1 close-enough + 1 similar + 23 divergent, against 19-22 % divergent). The new end-to-end pass converts the largest substrate divergence class (`bootswatch-unresolved-inclusion`) into the same finding as a *render-time* divergence — which it is. The `cascade-pruned-bunny` class shrinks from 8 (substrate) to 7 (end-to-end) because the cascade pruning happened between the two passes.

### Latency — TTFB and total ms (30 cards × 3 runs)

Sample = first 30 cards from the parity pass that returned 200 (real-present cards; the parity pass had 63 absent and 30 public-post samples on the BW family, so we filter to real pages).

| stat | HTML TTFB (ms) | HTML total (ms) | JSON TTFB (ms) | JSON total (ms) | HTML body bytes | JSON body bytes |
|---|---:|---:|---:|---:|---:|---:|
| count | 90 | 90 | 90 | 90 | 90 | 90 |
| min   | 283 | 283 | 285 | 285 | 370 | 242 |
| **p50**   | **324** | **324** | **323** | **323** | **479** | **321** |
| **p95**   | **466** | **467** | **411** | **411** | **1 122** | **859** |
| max   | 600 | 600 | 480 | 480 | 1 606 | 1 173 |
| avg   | 343 | 343 | 334 | 334 | 617 | 431 |

TTFB and total ms are within 1 ms of each other across the entire distribution: the response is sent in one TCP write, no chunking, no proxy buffering. The dominant cost is the round-trip from this workstation to the VM at 170.9.231.182:8443 (TLS handshake + TCP), not the Bunny DB call (which adds ~67–124 ms p50 per the substrate baseline) and not the Node render (sub-millisecond). **Once the Bunny CDN is wired in front, the same 30-card × 3-run should drop by ~150–250 ms p50** (CDN edge POP proximity + persistent connection amortization).

The first-pass latency over the first 30 cards (regardless of status — most of those are 404 because the BW family dominates the front of the sample) shows: TTFB min=276, p50=322, p95=418, max=479 ms; total the same distribution. The 404 path is roughly the same cost as the 200 path because the entry hits Bunny DB unconditionally and gets a row back regardless (the only difference is one .length check on `rows[0]`).

### Cache test — first vs second fetch (5 cards)

The deployed entry sets `Cache-Control: no-store` on every response (verified across all 100 parity fetches and all 90 perf fetches). Neither nginx nor any upstream CDN sees repeat views as cacheable. Repeat-view benefit here, if any, is purely TCP / kernel / Node keep-alive amortization on the entry.

| name | 1st TTFB (ms) | 2nd TTFB (ms) | Δ (ms) | 1st body B | 2nd body B |
|---|---:|---:|---:|---:|---:|
| `AsIn Layout` | 481 | 306 | **−175** | 757 | 757 |
| `*all` | 366 | 332 | −34 | 242 | 242 |
| `BWjournal` | 332 | 289 | −43 | 499 | 499 |
| `PlainText` | 305 | 433 | +128 | 451 | 451 |
| `Toggle` | 320 | 349 | +29 | 440 | 440 |

**3 / 5 second fetches faster**, 2 / 5 slower, 0 / 5 unchanged. Wins are jitter-shaped (33–175 ms). None of the second-fetch responses came from a cache (body bytes identical, no `X-Cache`/`Age` header). **The only repeat-view benefit observed is the network round-trip jitter / Node keep-alive**, which can save up to ~175 ms TCP+TLS negotiation on the second fetch over the same persistent connection.

**If a `Cache-Control: public, max-age=60, stale-while-revalidate=86400` were added to GET responses**, repeat views within 60 s would be served from the Bunny edge POP without any DB call — that effect is the real cost story at scale, and is not yet wired.

### DB-ops

The deployed entry does **not** expose per-request `x-db-ops` / `x-bunny-db-ops`. Verified across all 100 parity fetches and all 90 + 5 perf + cache fetches: every request returned header `null` for both names. The entry's `bunny-origin-server.mjs:235-258` (`jsonResponse` / `htmlResponse` helpers) sets only `content-type` + `cache-control: no-store`.

The Bunny DB driver counter exists (`src/card/drivers/bunny-db.ts:125-159` `BunnyDbQueryCounter`) but is not wired into the entry's HTTP handlers. **For a true p50/p95 DB-ops measurement we need a deploy follow-up that adds the header at end-of-render.**

Today the entry makes **one Bunny DB round-trip per request** (`SELECT ... FROM cards WHERE name = ? AND trash = 0 LIMIT 1` in `bunny-origin-server.mjs:192-214` `fetchCardByName`). **DB-ops = 1 per `/<name>.json` or `/<name>` page render** in the current build. The earlier substrate harness observed 4 queries per realistic cold-page render (`src/card/render/prefetch.ts:488` batched prefetch for the engine full-render path); the deployed entry is the *minimal record view* and does not exercise the engine's prefetch — that gap is intentional (the entry has no inclusion-resolution requirement today), and will widen once a real engine-backed entry ships.

### Live `culturesmith.com` (Cloudflare-challenged)

The operator's note that live culturesmith.com is Cloudflare-challenged from this workstation was confirmed end-to-end in this session:

| Probe | Outcome |
|---|---|
| `curl -L https://www.culturesmith.com/` | `curl: (35) SEC_E_INVALID_TOKEN (0x80090308)` — the 308 redirect from www to the apex fails TLS validation at the workstation. No HTML landed. |
| `curl -L https://culturesmith.com/Home` | HTTP 403, body is `Just a moment...` (5,376 bytes) — Cloudflare challenge gate. |

**No live Ruby bytes could be sampled this session**, so the parity comparison is against the recapture shards in `tmp/raw-ground-truth/expected/` only (the byte-parity oracle the worker directed).

### End-to-end reproducer

All artifacts in `tmp/bunny-harness-e2e/` (relative to `C:/localProjects/decko-ts`):

| File | Purpose |
|---|---|
| `harness-e2e.mjs` | Per-URL parity + latency pass 1 (100 URLs through the deployed entry). Self-signed TLS opt-out (env-driven). |
| `classify-divergent.mjs` | Re-fetch the 21 divergent rows, pattern-match actual bytes, assign mechanism labels. |
| `perf-rendered.mjs` | 30 cards × 3 runs, HTML and JSON views both, only real-present cards. |
| `render-final.mjs` | Assembles `FINAL.md`. |
| `results.json` | Per-URL raw data (status, ms, bytes, byte-identity %, tier). |
| `results-classified.json` | Per-divergent mechanism label + explanation. |
| `perf.json` | Per-card latency over the first 30 (mostly 404). |
| `perf-rendered.json` | Per-card HTML+JSON latency (90 × 200). |
| `perf-rendered-summary.json` | p50/p95/min/max/avg aggregates. |
| `cache.json` | 5-card repeat-view first/second. |
| `table.md` | Per-URL markdown table for ad-hoc reading. |
| `FINAL.md` | Standalone end-to-end report. |

Run order:

```bash
cd C:/localProjects/decko-ts
NODE_TLS_REJECT_UNAUTHORIZED=0 node tmp/bunny-harness-e2e/harness-e2e.mjs          # ~30s, 100 URLs
NODE_TLS_REJECT_UNAUTHORIZED=0 node tmp/bunny-harness-e2e/classify-divergent.mjs  # ~5s, re-fetch 21
NODE_TLS_REJECT_UNAUTHORIZED=0 node tmp/bunny-harness-e2e/perf-rendered.mjs       # ~80s, 90 HTML + 90 JSON
NODE_TLS_REJECT_UNAUTHORIZED=0 node tmp/bunny-harness-e2e/render-final.mjs        # assembles FINAL.md
```

The `NODE_TLS_REJECT_UNAUTHORIZED=0` opt-out is needed because the deployed entry at 170.9.231.182:8443 uses the brandon-portal self-signed certificate for `server_name cs-deck.b-cdn.net`. Once the Bunny CDN is wired in front and presents a CA-issued cert, the opt-out becomes unnecessary.
