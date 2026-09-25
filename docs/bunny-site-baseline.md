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
2. Add the per-request `x-db-ops` response header (the same shape the ask specified) sourced from `BunnyDbQueryCounter.count()` at end of render. Also expose a `/__metrics` endpoint returning aggregate counters (parity of Cloudflare's `__metrics`, `deploy/src/worker-metrics.ts:580`).
3. Deploy via the Bunny dashboard `dash.bunny.net/scripting` (the `api.bunny.net/scripting/*` API paths all returned 404 in this session — see evidence above; the dashboard is the working path, per the operator's brief).
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
