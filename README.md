# Decko TypeScript Port

An independent TypeScript port of Decko (targeting card 1.110.0 and decko 0.20.0) and upstream Ruby optimization suite (`ruby/card-mod-batched-nests/`), built to eliminate the `N+1` nested-render query storms and `O(N)` permission-rule write cascades that bottleneck large-scale Decko deployments.

---

## Headline Scaling & Efficiency Gains (Up to `1,114x` Fewer Queries & `O(1)` Rule Saves)

| Workload / Bottleneck | Stock Ruby Decko 0.20.0 (Cold) | Upstream Ruby + `card-mod-batched-nests` | Phase 2 Cold Isolate (`live_page_bundles`) | Phase 2 Warm Edge (`L1` / `L2` Cache) | Net Efficiency Gain |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Deep Nested Tree (`tree d3xf10`, 1,111 cards, 3 levels)** | **1,114** SQL queries | **9** SQL queries (`123.8x` fewer) or **1** with bundle | **1** database round trip | **0** database queries | **`1,114x` fewer cold DB trips (`0` warm)** |
| **4-Level Nested Tree (`tree d4xf4`, 341 cards)** | **344** SQL queries | **8** SQL queries (`43.0x` fewer) or **1** with bundle | **1** database round trip | **0** database queries | **`344x` fewer cold DB trips (`0` warm)** |
| **Wide Dashboard Fan-Out (`fan f200`, 201 cards)** | **204** SQL queries | **4** SQL queries (`51.0x` fewer) or **1** with bundle | **1** database round trip | **0** database queries | **`204x` fewer cold DB trips (`0` warm)** |
| **20-Deep Inclusion Chain (`chain d20`, `c0 -> ... -> c19`)** | **23** sequential queries (`O(depth)`) | **1** query with `live_page_bundles` | **1** database round trip (`O(1)`) | **0** database queries | **`O(depth)` to `O(1)` (`23 -> 1` cold trip)** |
| **Standard Dynamic Page (`/Home` + layout + rules)** | **12–16+** sequential SQL queries | **4–6** SQL queries (or **1** with bundle) | **1** database round trip | **0** database queries | **`12–16x` fewer cold DB trips (`0` after auto-warm)** |
| **`*read` Permission-Rule Save (Large Deck)** | **`O(N)` table cascade** (10,000s of row updates per save) | **`O(1)`** (`1` flag row write via `LazyWatermark`) | **`O(1)` (`1` flag row write on save)** + lazy read reconcile | N/A (write path) | **10,000s of row writes -> `1` row write (`O(1)`)** |

---

## Project Phases & Roadmap

### Phase 1 — Completed: Full Ruby-to-TypeScript Parity & Multi-Database Substrate
- **100% Synthetic Fixture Parity (`Synthetic-v1`):** 1,754 / 1,754 rendering cases, 2,389 / 2,389 semantic cases, 16 / 16 persistence cases, and 19 / 19 side-effect cases verified against the Ruby oracle.
- **52 / 52 Live Browser Journeys:** End-to-end Playwright + Chromium browser verification across editing, CQL search, nested inclusions, permission rules, and layouts.
- **Multi-Database & Edge Runtime Support:** Pluggable adapters across PostgreSQL, MySQL, SQLite, PGlite WebAssembly, Cloudflare D1, and Bunny Database (LibSQL/Hrana).

### Phase 2 — Completed: Edge Performance Optimizations & One-Click Cloud Deployment
- **1-Trip Cold Page Bundles (`live_page_bundles`, `BUNDLE_SCHEMA_VERSION = 2`):** Collapses cold-isolate dynamic card page database round trips from 12–16 sequential queries down to **1 database round trip**, with automatic database trigger invalidation on card and reference writes.
- **Lazy Permission-Rule Watermarks (`RuleWatermarkStore`):** Replaces eager full-table permission propagation on writes with `O(1)` rule-mutation watermarks, lazy read-time verification, and 30-day automatic watermark compaction.
- **3-Tier Edge Render Cache (`L1` / `L2` / `L3`):** In-memory isolate cache (`L1`), regional edge Cache API (`L2`), and database-backed global render cache (`L3` `edge_render_cache`), with automatic post-deploy cache warming so the first visitor receives an immediate cache hit.
- **Lean Worker Bundling & Tree-Shaking:** Enforces strict bundle size budgets (`1,329,252` bytes on Cloudflare against the `1,400,000`-byte lean read cap and `10 MiB` platform limit; `6,220,413` bytes full engine / `1,308,751` bytes read worker on Bunny against the `7,600,000`-byte boot-safe limit) with static assets and heavy browser editors offloaded to R2/CDN storage.
- **One-Click Cloudflare & Bunny Deployment & 1-Round-Trip Provisioning (Issue #1282):** Single-command provisioning, schema migration, seed loading, worker bundling, cache arming, and post-deploy route auto-warming for both Cloudflare Workers + D1 and Bunny Edge Scripting + Bunny Database (`singleTripApplySeed` applies schema + 71-card seed + 25 SQLite virtual-table triggers in 1 database batch; `singleTripSaveCard` commits card mutations + referers + `live_page_bundles` invalidation in 1 atomic batch; edge-native `/*admin` status/task board and `/:card` view rendering).

### Phase 3 — Planned: AI-Assisted Creation, WYSIWYG Builder & Non-Technical Creator Experience
- **WYSIWYG Visual Deck & Card Builder:** Direct in-page visual editing for layouts, card structures, formatting rules, and nested views so non-technical creators can design and customize a deck without writing HTML, CSS, or CQL syntax.
- **AI-Assisted Deck Generation & Content Workflows:** Built-in AI assistants for scaffolding card types, generating CQL queries from plain English, summarizing or restructuring card trees, and drafting content directly inside the editor.
- **Zero-Code Creator Convenience Features:** Guided setup wizards, one-click theme and template libraries, inline media management, and visual permission controls so anyone can launch and run their own Decko site without technical administration.

---

## Headline Verification Results

Verification of this port is backed by in-tree test records, execution ledgers, and raw reports stored in `verification/` and `.test-results/`. Detailed test specifications, per-case tables, and provenance are consolidated in [VERIFICATION.md](VERIFICATION.md).

- **Synthetic Fixture Parity (Synthetic-v1):**
  - **Rendering:** 1,754 / 1,754 (100%)
  - **Semantics:** 2,389 / 2,389 (100%)
  - **Persistence:** 16 / 16 (100%)
  - **Side Effects:** 19 / 19 (100%)
  - *Fixture Manifest:* [reference-harness/fixtures/synthetic-v1/MANIFEST.json](reference-harness/fixtures/synthetic-v1/MANIFEST.json)
- **Canonical Browser Journeys (Live Playwright + Chromium against Phase 2):**
  - **52 / 52** passed (100%), **0** failed, **0** owed
  - *Receipts:* [verification/synthetic-v1.json](verification/synthetic-v1.json), [verification/browser-gate-52.json](verification/browser-gate-52.json), [verification/browser-ledger.jsonl](verification/browser-ledger.jsonl), `.test-results/journeys-52-1794152962/`
- **Runtime Database Matrices:**
  - **PostgreSQL 16:** 5 / 5 passed
  - **MySQL 8.4.11:** 5 / 5 passed
  - **SQLite:** 5 / 5 passed
  - **PGlite WebAssembly:** 3 / 5 passed (2 concurrency assertions skipped by design)
  - **Edge Database (Hosted LibSQL):** 5 / 5 passed (`verification/database-matrix.log`; `verification/database-matrix.json` records the earlier 3 / 5 pre-retry run)
  - *Receipts:* [verification/database-matrix.log](verification/database-matrix.log), [verification/database-matrix.json](verification/database-matrix.json)
- **Phase 2 & Deploy Gate Suites:**
  - **Repository Unit & Deploy Suites:** 2,796 / 2,796 Vitest tests across 188 files + 72 / 72 Node tests across 8 files (100%)
  - **Deploy Gate (`node tools/test-gates.mjs run deploy`):** 1,044 / 1,044 Vitest tests across 119 files + 72 / 72 Node tests across 8 files (100%)
  - **Phase 2 One-Trip & Lazy Rule Watermark Suites:** 64 / 64 Vitest tests across 8 files (100%)
  - **Edge Bundle Budget Guard (`reference-harness/runner/test/edge-bundle-budget.test.mjs`):** 6 / 6 Node tests (100%)

For complete verification methodologies, build attributions, and the excluded-inputs ledger, see [VERIFICATION.md](VERIFICATION.md).

---

## Phase 2 Edge Optimizations & One-Click Edge Deployment

Phase 2 ships both the **edge engine** builds (`deploy/cf-worker-src/` for Cloudflare Workers + D1 and `deploy/bunny-worker-src/` for Bunny Edge Scripting + LibSQL) and the **one-click Cloudflare and Bunny deployment tools** (`scripts/deploy/one-click-deck/one-click-deck.mjs`, `scripts/deploy/one-click-bunny/one-click-bunny.mjs`, and `deploy/provisioning/provision-bunny-deck.mjs`), with all Phase 2 optimizations wired into both the edge engine workers and `deploy/worker.ts` / `worker.ts`:

### Phase 2 Optimizations

1. **1-Trip Cold Page Bundle Index (`live_page_bundles` & `BUNDLE_SCHEMA_VERSION = 2`):**
   - On the first render of a dynamic card page, `liveRenderPage` / `LiveStoreDriver` (`src/card/live/live-render.ts`, `src/card/live/live-store-driver.ts`) captures the card-and-reference working set into `live_page_bundles` (provisioned by `deploy/migrations/0015-live-page-bundles.sql`), keyed by `(keep_key, stamp)`, and invalidates it automatically through `deck_data_version` and the `trg_live_page_bundles_*` triggers.
   - Subsequent cold-isolate renders load the working set in **1 database round trip** instead of `12–16` sequential round trips (or hundreds to thousands of N+1 round trips on deeply nested decks).
   - Full and delta bundles carry `v: BUNDLE_SCHEMA_VERSION` (`2`) and explicit `kind: "full" | "delta"`; `diffLivePageBundle` checks full row content equality, and orphan delta bundles without a substrate bundle are safely discarded.
2. **Lazy Permission-Rule Watermarks (`src/card/permissions/lazy-rule-watermark.ts`, re-exported at `src/card/permissions/index.ts`):**
   - Replaces eager full-table `read_rule_id` propagation on card writes with an `O(1)` rule-mutation watermark (`RuleWatermarkStore`, `enableLazyRuleWatermarks`) and lazy read-time verification.
   - Equivalence is proved by `tests/card/permissions/lazy-rule-watermark-proof.test.ts` (exhaustive 64-state sweep of all 6 permission-rule specificity tiers + 2,500-step adversarial state-machine fuzzer against an eager oracle) and `tests/card/permissions/lazy-rule-watermark.test.ts`.
3. **Multi-Tier Edge Render Cache (`L1` / `L2` / `L3`):**
   - **Bunny Edge Scripting:** `serveWithEdgeCache` (`L2`, regional Cache API in `deploy/bunny-worker-src/bunny-edge-content-cache.ts`) and `GlobalRenderCache` (`L3`, global database render cache in `deploy/bunny-worker-src/bunny-edge-global-render-cache.ts`).
   - **Cloudflare Workers:** `serveWithEdgeCache` (`L2`, Workers Cache API) and `GlobalRenderCache` (`L3`, D1 `edge_render_cache` table) in `deploy/src/worker-edge-cache.ts`.
   - Armed in `wrangler.toml`, `deploy/wrangler.toml`, and `scripts/deploy/one-click-deck/wrangler.oneclick.toml` via `DECKO_EDGE_CACHE="1"`, `DECKO_EDGE_GLOBAL_CACHE="1"`, `DECKO_LIVE_BUNDLES="1"`, and `DECKO_LAZY_RULE_WATERMARKS="1"`.
   - **Invalidation Model:** Cloudflare `L2`/`L3` (`readEdgeCacheStamp` = `deck_data_version.version + MAX(deck_rule_flags.epoch)`) and Bunny `L3` (`decko_edge_render_cache`, purged by `trg_edge_render_cache_rule_flag_ins` and write-surface `DELETE`) invalidate immediately on card and `*read` rule mutations; Bunny `L2` (`caches.default`, which does not replicate across Bunny regions) invalidates immediately on the writing isolate via `bumpRuntimeEdgeCacheEpoch()` and bounds cross-region `L2` staleness via its regional `s-maxage` TTL (default 300s) without adding a database round trip on `L2` hits.
   - Authenticated and per-visitor requests bypass the shared cache in both directions.
4. **Lean Edge Bundle & Budget Guards (`tools/vendor/edge-bundle-budget.mjs`):**
   - `tools/bundle-cf-edge-engine.mjs` enforces both `assertCloudflareScriptBudget` (`<= 10,485,760` bytes / 10 MiB) and `assertLeanReadWorkerBudget` (`<= 1,400,000` bytes, currently **1,329,252 bytes** / 1.27 MiB, with zero base64 favicon or dormant compiler bloat).
   - `tools/bundle-bunny-edge-engine.mjs` enforces `assertBunnyScriptBudget` (`<= 7,600,000` UTF-8 bytes boot-safe limit, currently **6,220,413 bytes** full engine / **1,308,751 bytes** read worker).
5. **Post-Deploy Auto-Warming (`autoWarmDeck` / `autoWarmBunnyDeck`):**
   - Both `one-click-deck.mjs` and `one-click-bunny.mjs` automatically issue warm-up requests against `/` and `/Home` at the end of deployment so `live_page_bundles`, `edge_render_cache` (`L3`), and edge caches (`L1`/`L2`) are populated before the first visitor arrives.

### Measured Efficiency Gains: Unoptimized / Stock Ruby 0.20.0 vs. Phase 2

On a traditional server connected to a local database socket, sequential `N+1` queries add microseconds each. On serverless edge runtimes (Cloudflare Workers + D1 or Bunny Edge Scripting + Bunny Database over HTTP/Hrana), an unoptimized port is degenerate: each remote database round trip adds `5–25+ ms` of network latency and consumes worker subrequest quotas, while an eager permission-rule cascade across a large deck updates tens of thousands of rows in a single save and exhausts Cloudflare D1's `100,000` rows/day free-tier write limit.

The table below summarizes the measured round-trip, write-amplification, and bundle-size reductions across stock Ruby Decko 0.20.0, upstream Ruby `main` with our backported nest-prefetch + machinery batching prototype, TypeScript Phase 1 cold closure, and Phase 2 on Cloudflare and Bunny (full provenance in [docs/scaling-comparison-deep-nesting.md](docs/scaling-comparison-deep-nesting.md), `benchmarks/results/runs/`, and `tests/card/`):

| Workload / Metric | Stock Ruby Decko 0.20.0 (Cold Cache) | Upstream Ruby `main` + Backported Nest Prefetch | TypeScript Cold Closure (No Prior Bundle) | Phase 2 Cold Isolate (`live_page_bundles` / `L3`) | Phase 2 Warm Edge Hit (`L1` / `L2`) | Net Reduction vs. Unoptimized Baseline |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`tree d3xf10` Render** (1,111 nested cards, 3 levels deep) | **1,114** SQL round trips | **9** SQL round trips (`123.8x` fewer) | **7** round trips / 46 stmts (`159.1x` fewer) | **1** database round trip (`1,114x` fewer) | **0** database round trips | **`1,114 -> 1` round trip (`99.91%` fewer cold DB trips; `0` warm)** |
| **`tree d4xf4` Render** (341 nested cards, 4 levels deep) | **344** SQL round trips | **8** SQL round trips (`43.0x` fewer) | **8** round trips / 30 stmts (`43.0x` fewer) | **1** database round trip (`344x` fewer) | **0** database round trips | **`344 -> 1` round trip (`99.71%` fewer cold DB trips; `0` warm)** |
| **`fan f200` Render** (201 cards: 1 root nesting 200 children) | **204** SQL round trips | **4** SQL round trips (`51.0x` fewer) | **5** round trips / 24 stmts (`40.8x` fewer) | **1** database round trip (`204x` fewer) | **0** database round trips | **`204 -> 1` round trip (`99.51%` fewer cold DB trips; `0` warm)** |
| **`chain d20` Render** (20-deep inclusion chain `c0 -> ... -> c19`) | **23** SQL round trips (`O(depth)`) | **22** SQL round trips (unindexed chain) | **3** round trips at any depth `d1..d20` (`O(1)`) | **1** database round trip (`23x` fewer) | **0** database round trips | **`23 -> 1` round trip (`O(depth)` to `O(1)` constant trips)** |
| **Standard Dynamic Page Render** (`/Home` with layout, structure, rules & views) | **12–16+** sequential SQL round trips | **4–6** SQL round trips | **3–5** batched round trips | **1** database round trip | **0** database round trips | **`12–16 -> 1` cold DB round trip (`0` after post-deploy auto-warm)** |
| **`*read` Permission-Rule Save** (production-scale deck) | **`O(N)` eager cascade** (tens of thousands of card row updates per save) | **`O(N)`** (without watermark table) | **`O(N)`** (without watermark table) | **`O(1)` (`1` flag row written on save)** + lazy read reconcile & bounded chunked compaction (`batchSize: 250–500`, `O(⌈K/400⌉)` updates for `K` affected cards; `<= 12` queries on standard `< 400`-card decks) | N/A (write path) | **Tens of thousands of row writes -> `1` row write per rule mutation** |
| **Edge Worker Script Payload** (Cloudflare Workers & Bunny Edge Scripting) | N/A (Ruby MRI runtime) | N/A (Ruby MRI runtime) | **6,220,413 bytes** (`5.93 MiB` full engine with compilers & embedded assets) | **1,329,252 bytes** (Cloudflare lean read worker) / **1,308,751 bytes** (Bunny lean read worker) | Served from isolate memory | **`78.6%` smaller on Cloudflare / `79.0%` smaller on Bunny** |

*Measurement provenance:* Deep-nesting query counts are median-of-7 cold runs after cache reset (`benchmarks/results/runs/deep-nesting-ruby-a746a48527c9f965.json`, `benchmarks/results/runs/deep-nesting-ruby-433a5529609786ab.json`, `benchmarks/results/runs/deep-nesting-ts-d091e98c75041d98.json`); constant-depth closure is verified in `tests/card/render/depth-sweep.test.ts`; 1-trip bundle persistence and invalidation are verified in `tests/card/one-trip/live-page-bundles.test.ts` and `tests/deploy/worker-edge-cache.test.ts`; `O(1)` rule watermarks are verified in `tests/card/permissions/lazy-rule-watermark.test.ts` and `tests/card/permissions/lazy-rule-watermark-proof.test.ts`; bundle sizes are verified by `reference-harness/runner/test/edge-bundle-budget.test.mjs`.

---

## Cross-Language Extensibility: Keeping Upstream Ruby First-Class & Supporting Future Ports

This project is architected so that **upstream Ruby Decko (`card` / `decko`) remains a first-class citizen** and **future ports in any language (Rust, Go, Python, Elixir, etc.) can adopt the exact same performance substrate and verification suite without reinventing them**:

1. **Database-Level Optimization Substrate (Pure SQL Tables, Triggers & Versioned JSON):**
   - Every Phase 2 data optimization lives in standard SQL tables and triggers ([deploy/migrations/0015-live-page-bundles.sql](deploy/migrations/0015-live-page-bundles.sql) and [deploy/migrations/0013-nest-index-meta.sql](deploy/migrations/0013-nest-index-meta.sql)) rather than opaque in-memory TypeScript structures:
     - **`deck_data_version` & `trg_live_page_bundles_*`:** Database triggers automatically increment `stamp` and invalidate `live_page_bundles` on `cards` inserts/deletes, `card_references` writes, and any `cards` update that modifies any of the 15 non-rule bundle payload columns (or `read_rule_id` / `read_rule_class` when `deck_rule_flags` is empty), while preserving bundles and compensating `deck_data_version` on pure no-op updates and lazy-rule-only updates while `deck_rule_flags` is active.
     - **`live_page_bundles` (`BUNDLE_SCHEMA_VERSION = 2`):** Stores plain JSON working-set snapshots (`cards` rows + `card_references` rows keyed by `(keep_key, stamp)`). Upstream Ruby Decko or any future port can hydrate `Card::Lexicon` / `Card::Cache` from `live_page_bundles` in the same single `SELECT` query, and both TypeScript and Ruby discard any orphan `kind: "delta"` bundle lacking a matching substrate bundle.
     - **`deck_rule_flags`, `deck_card_rule_watermarks` & `deck_rule_watermark_meta`:** Defines the language-neutral flag-on-write (`O(1)` insert into `deck_rule_flags`), lazy read-time `read_rule_id` reconciliation, and bounded chunked compaction protocol (auto-enabled in TypeScript when `deck_rule_flags` exists, and enabled in Ruby via `Card.config.lazy_rule_watermarks = true`).
     - **`edge_render_cache` (`L3`):** Stores rendered `(cache_key, stamp, status, content_type, body)` rows in SQL so a Ruby server, a TypeScript worker, or a future language runtime can share or pre-warm the same rendered page cache.
     - **Stored Nest Closure (`card_references` `ref_type = 'I'`):** Reuses Decko's own `card_references` table to index inclusion edges, enabling `O(1)` depth prefetching in both SQLite/D1 and PostgreSQL/MySQL.
2. **Shipped Upstream Ruby Gem (`ruby/card-mod-batched-nests/` & [docs/ruby-support.md](docs/ruby-support.md)):**
   - Rather than leaving upstream Ruby behind, this repository ships **`ruby/card-mod-batched-nests/`**, a drop-in Ruby Decko 0.20.0 (`card 1.110.0`) card-mod gem organized under upstream `card/lib/card/` file paths so it can also be opened directly as a pull request against `decko-commons/decko`:
     - **Phase 1 Batched Nest & Machinery Prefetch (`Card::Cache::Prefetch`, `PrefetchRelated`, `KnownRows`, `PrefetchRules`, `Card::Format::Nesting::Prefetch`, `Card::Lexicon::Prefetch`):** Reduces stock Ruby's SQL queries from **1,114 to 9** on `tree d3xf10` (`123.8x`), **344 to 8** on `tree d4xf4` (`43x`), **204 to 4** on `fan f200` (`51x`), and **147,229 to 52,070** across all 3,804 renders of `synthetic-v2` with **0 byte-identity diffs** and **4,198 / 4,198** passing checks on `synthetic-v1` (including all 16 persistence save steps, 19 side-effect mutations, and 12 write-table checks).
     - **Phase 2 1-Trip Closure Bundle (`Card::Cache::LivePageBundle`, `lib/card/cache/live_page_bundle.rb`):** Reads and writes the shared `live_page_bundles` + `deck_data_version` SQL tables (`BUNDLE_SCHEMA_VERSION = 2`), hydrating a page's entire card + lexicon closure (including 20-level linear nest chains `chain d20`) in **1 SQL query** (`Card::Cache.with_live_page_bundle`) on a cold Ruby process in steady state (when no `deck_rule_flags` are pending).
     - **Phase 2 `O(1)` Lazy Rule Watermarks (`Card::Rule::LazyWatermark`, `lib/card/rule/lazy_watermark.rb`):** Replaces stock Decko's `O(N)` `Card::Set::Right::Read#update_read_ruled_cards` table-wide scan on `*read` rule saves with a single `O(1)` epoch flag row in `deck_rule_flags` (`raise_read_rule_flag!`) and lazy read-time reconciliation (`reconcile_read_rule_if_stale!`) against `deck_card_rule_watermarks` and `deck_rule_watermark_meta`.
3. **Live Shared-Database Coexistence Between Ruby & Other Ports ([DEPLOYMENT.md](DEPLOYMENT.md)):**
   - Runtimes can run side-by-side against the same PostgreSQL, MySQL, or SQLite database using `DECKO_PASSWORD_HASH=legacy-sha1`, `DECKO_SERIALIZER_ERA=live`, and `DECKO_HAML_SLOT_STYLE=hash`, with full Ruby-to-port mapping documented in [RUBY-MAP.md](RUBY-MAP.md).
4. **Language-Neutral Reference Harness & Oracle Protocol ([reference-harness/SPEC.md](reference-harness/SPEC.md)):**
   - Stock Ruby Decko is the canonical oracle that generates `reference-harness/fixtures/synthetic-v1/`.
   - All `1,754` rendering fixtures, `2,389` semantic fixtures, `16` persistence fixtures, and `19` side-effect fixtures are stored as language-neutral JSON + SQLite files (`deck.json`, `ops/*.jsonl`, `expected/*.jsonl`).
   - Any future port in any language plugs into `reference-harness/runner/run.mjs` and `grade.mjs` by implementing a single JSON-over-stdio adapter (`reference-harness/adapters/<engine>/adapter.json`), and validates full end-to-end UX against the same 52 live Playwright browser journeys (`reference-harness/browser/run-journeys.mjs`).

### Building the Edge Engine

```sh
# Cloudflare Workers + D1 (enforces <= 1,400,000-byte lean read budget & <= 10 MiB CF script budget)
node tools/bundle-cf-edge-engine.mjs
#   -> deploy/dist/cf-edge-engine.bundle.js (1,329,252 bytes)

# Bunny Edge Scripting + LibSQL (defaults to a fresh deploy/dist/bunny-pkg-<ts> directory when run with no flags)
node tools/bundle-bunny-edge-engine.mjs
# or with explicit flags:
node tools/bundle-bunny-edge-engine.mjs --out-dir <empty-dir> --wasm-asset-base https://your-cdn-host/wasm/
```

### One-Click Cloudflare Deploy

```sh
node scripts/deploy/one-click-deck/one-click-deck.mjs                       # dry run: prints the plan (redacts credentials)
node scripts/deploy/one-click-deck/one-click-deck.mjs --local                # local workerd D1, no account
node scripts/deploy/one-click-deck/one-click-deck.mjs \
  --execute --token <CF_API_TOKEN> --account-id <ACCOUNT_ID> \
  --i-understand-this-writes-to-my-cloud-account
```

- **Dry run by default:** Executes nothing remote and redacts any token or account ID in output (`[REDACTED]`).
- **Write-budget gate:** Every D1 write step is checked against the 80,000-row guard (80% of the 100,000 rows/day Cloudflare free tier) before execution.
- **Ships Phase 2 + Static Assets:** Applies `0001-schema.sql` + `0010-deck-data-version-all-card-tables.sql` + `0015-live-page-bundles.sql`, arms `DECKO_EDGE_CACHE=1`, `DECKO_EDGE_GLOBAL_CACHE=1`, `DECKO_LIVE_BUNDLES=1`, `DECKO_LAZY_RULE_WATERMARKS=1`, and uploads the compiled skin (`scripts/deploy/one-click-deck/demo-static-assets/`).

### One-Click Bunny Deploy

```sh
node scripts/deploy/one-click-bunny/one-click-bunny.mjs                      # dry run: prints the plan
node scripts/deploy/one-click-bunny/one-click-bunny.mjs --bundle-only        # build & verify Bunny bundles locally
node scripts/deploy/one-click-bunny/one-click-bunny.mjs \
  --execute --api-key <BUNNY_API_KEY> --script-id <SCRIPT_ID> --pullzone-id <PULLZONE_ID> \
  --i-understand-this-writes-to-my-bunny-account
# Or full greenfield Bunny Database + Edge Script + Pull Zone provisioning:
node deploy/provisioning/provision-bunny-deck.mjs --payload <payload.json>
```

---

## Running Tests

This repository includes the full Vitest and Node test suites (`tests/`), the 52-journey Playwright browser harness (`reference-harness/browser/run-journeys.mjs`), and the test gate runner (`tools/test-gates.mjs`):

- **Deploy Gate (119 Vitest files + 8 Node test files):** `node tools/test-gates.mjs run deploy`
- **Live 52-Journey Browser Suite:** `node reference-harness/browser/run-journeys.mjs --engine reference-harness/browser/engines/ts.json --fixture reference-harness/fixtures/synthetic-v1 --journeys reference-harness/browser/journeys/synthetic-v1.json --out .test-results/journeys-52`
- **52-Journey Ledger Gate:** `node verify-52-of-52-no-owed-list-gate.mjs`

Detailed instructions and prerequisites are in [TESTING.md](TESTING.md).

---

## License

- Licensed under the **GNU General Public License v3.0 or later (GPL-3.0-or-later)**.
- See [NOTICE](NOTICE) and [LICENSE](LICENSE) for copyright attribution and full license terms.
- Bundled third-party source in `third-party-source/` contains TinyMCE 5.10.7 licensed under the **GNU Lesser General Public License v2.1 (LGPL-2.1)** (see `third-party-source/tinymce-5.10.7/upstream/LICENSE.TXT`).
