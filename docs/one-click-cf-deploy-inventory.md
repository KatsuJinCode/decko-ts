# one-click Cloudflare deploy — inventory + write-budget arithmetic

What exists in decko-ts for the ONE-CLICK CLOUDFLARE DEPLOYMENT (tier 1 of the
two-product shape: CF token in → a fresh decko on a free account), what the
2026-09-23 incident left frozen, the step-by-step flow the one-click tool
performs, and the exact D1 free-tier write arithmetic per step.

Companion docs: `docs/one-click-cf-deploy-demo.md` (the runbook: local demo
with zero account, then the real demo when given the go).
Tool: `scripts/deploy/one-click-deck/one-click-deck.mjs`.

---

## 1. CF assets that already exist (inventory, 2026-09-25)

### Deploy harness — `deploy/` (the M2 one-click harness)

| asset | state | notes |
| --- | --- | --- |
| `deploy/wrangler.toml` | exists, BOUND TO A FROZEN DB | `main = worker.ts`, no `nodejs_compat` (worker graph is web-standard-only; the engine's one `node:crypto` import is replaced at bundle time by `[alias]` → `shims/node-crypto-shim.ts`). `database_id = ac0f6b00-757d-4b09-b131-997a9a3fb4d7` = decko-ts-demo-db — the polluted demo DB from the incident. DO NOT deploy this config until the freeze lifts and a fresh DB is chosen. |
| `deploy/worker.ts` | done, miniflare-proven | Thin Workers HTTP entry over the engine. Routes: `GET /`, `GET /:card-name`, `GET /:card-name.json`, `POST /api/query`, `GET /_status`, `GET /__metrics`. Per-isolate engine boot; warm render issues zero queries. |
| `deploy/shims/node-crypto-shim.ts` | done | Bundle-time `node:crypto` replacement (`randomBytes(10).toString("hex")` → 20 lowercase hex, the `SecureRandom.hex(10)` contract). |
| `deploy/migrations/0001-schema.sql` | done (generated) | D1-ready core schema: 13 CREATE TABLE + 33 CREATE INDEX. Generated from `db/schema.sqlite.sql` by `deploy/sync-migrations.mjs`. Includes the 2026-09-23 BINARY-collation twin indexes (`cards_key_binary_index`, `cards_codename_binary_index`) — fresh DBs get them from 0001. |
| `deploy/migrations/0002-card-text-binary-lookup-indexes.sql` | done | Backfill of those indexes for ALREADY-PROVISIONED DBs only; fresh one-click databases never run it. |
| `deploy/seed.mjs` → `deploy/seed/seed.sql` | done | 15 synthetic cards, ~8 KB, zero refs. The small-deck option for a user-facing template. Depth-4 compound chain + CQL search card. |
| `deploy/launch.mjs` | exists, NOT budget-guarded | Earlier one-command orchestrator (`--dry-run` default / `--execute` / `--local` miniflare). Superseded for budget purposes by `scripts/deploy/one-click-deck/` — it has NO write-budget gate, which is the class of tool that caused the incident. Do not use it against the account. |
| `deploy/cleanup.mjs` | exists | Deletes Worker `decko-ts-demo` + D1 `decko-ts-demo-db` (`--yes`). FROZEN — cleanup itself consumes writes against the frozen DB. |
| `deploy/wrangler.scale.toml` | exists, FROZEN resources | Scale-test worker `decko-ts-scale-test`, DB `decko-ts-scale-test-db` (c5061dce). Both created during the authorized targeted run; CF-side resources, untouched. |
| `deploy/cf-scale-deck/seed.sql` | done | Targeted-test deck: **2,279 cards + 531 refs = 2,810 rows** per its generated manifest (`deck-manifest.json`). (The 2026-09-23 memory says 2,278 + 531 = 2,809; the manifest the generator wrote says 2,279/2,810 — manifest wins, one scaffold card more than the memory recorded.) |
| `deploy/src/worker-metrics.ts` | done | `/__metrics` aggregates: request histogram, SQL counts, D1 rows read/written per isolate. |
| `deploy/dist/bunny-worker.bundle.js` + `deploy/bunny-worker-src/bunny-worker.ts` | done | The Bunny.net edge variant of the same engine surface (the OTHER edge, not Cloudflare). |
| `deploy/bunny-origin/` | done | VM origin for the Bunny path: `bunny-origin-server.mjs` + nginx conf + systemd unit (`decko-bunny-origin.service`), serves the deck on Brandon's portal VM. |

### The incident tooling — `tools/migrate/` (what burned the budget)

| asset | role | incident scars encoded in it |
| --- | --- | --- |
| `tools/migrate/import-deck.mjs` | chunks a deck SQL dump into D1-sized statement batches | wraps chunks in `BEGIN TRANSACTION/COMMIT` — the D1 REMOTE endpoint rejects explicit transaction statements; must be stripped before `--remote` |
| `tools/migrate/d1-chunker.mjs` | emits table-alphabetical chunks | `card_references` sorts BEFORE `cards`, so a tail-failure pattern means the `cards` table is failing |
| `tools/migrate/import.mjs` | `splitSqlStatements` + local apply | the splitter the one-click seed generator's chunks are verified against |
| `tools/migrate/d1-validator.mjs`, `parse-dump.mjs`, `generalized-import.mjs`, `migrate-generalized.mjs` | the generalized Ruby-dump → D1 migration lane (tier-2 product machinery) | the ~800-statement sub-split size exists because ~6.7 MB / 5,000-stmt fat calls hit `D1_RESET_DO` deterministically on the remote endpoint |

These are the tools the blind full-scale import ran through on 2026-09-23
(~1.2M rows written, ~5-6M reads of COUNT verifications). They still exist and
are correct tooling; the missing piece then was a budget gate, which is what
`scripts/deploy/one-click-deck/write-budget.mjs` now is for the one-click flow.

### Local-proof assets (no account needed)

| asset | what it proves |
| --- | --- |
| `tests/deploy/deploy-worker-miniflare.test.ts` | The REAL `deploy/worker.ts` bundled the way wrangler bundles it (same `[alias]` shim), booted under miniflare's real workerd with the real migration + seed applied through the D1 binding, every route asserted over HTTP. This is the standing local proof that the worker graph boots on workerd on this Windows machine. |
| `tests/server/drivers/d1-miniflare.test.ts` | The D1 adapter itself under workerd (miniflare 5 via `convertV4MiniflareOptions` — v5 rejects raw option shapes; that door is the proven one). |
| `benchmarks/cf-scale/targeted-test-deck.mjs` + `verify-targeted-deck.test.ts` | The AUTHORIZED dimension-driven minimal deck (committed 4c1c14e) and its local verifier (8/8 green before any remote contact). The verifier pins that rendering the 32-deep chain from its root raises `nest depth exceeded (Depth Level 21)` — Ruby parity (`Card.config.max_depth = 20`, railtie.rb:17; `RUBY_MAX_DEPTH` in src/card/render.ts). One-click seeds must not chase the full chain from Home. |
| `node_modules`: `miniflare@5.20260918.0-alpha`, `workerd` (win32 binary present) | Local workerd works on win32 — no native-dep blocker. |
| `wrangler` | NOT in package.json. A global wrangler 4.135.0 is on PATH (winget Node dir); `npx wrangler` resolves to it without any network fetch. A machine without global wrangler fetches it from npm on first `npx` use (a tooling download, not a CF call). |

### The Bunny contrast — `vm-staging-server.mjs`

The non-Cloudflare path the same engine already runs in production-ish shape:
a read-only Node HTTP staging server (port 3100) on Brandon's portal VM
(170.9.231.182) serving the scrubbed corpus through `LocalSqliteDriver`, with
full-page layout via per-card `*layout` rules and compiled skin assets. Where
the CF one-click story is "token in → fresh D1 + Worker on a free account",
the Bunny story is "existing VM origin + Bunny edge scripting in front". Same
engine, different edge; the one-click tool does not touch it.

---

## 2. What the incident left frozen (decide from this, touch nothing)

From the 2026-09-23 incident record (memory
`project-decko-ts-cf-fullscale-load-2026-09-23`):

- **All CF-account writes are frozen pending Julian's explicit go.** No
  `wrangler deploy`, no `d1 execute --remote`, no API writes, no cleanup
  (cleanup itself consumes writes).
- **decko-ts-demo-db (ac0f6b00)** holds a partial import: cards ~1,824/93,700,
  refs ~1,110,000/1,112,560, plus whatever the killed 138-sub-chunk pass
  landed. The deployed worker `decko-ts-demo.jpswilner.workers.dev` serves
  errors from that partial state.
- **decko-ts-scale-test-db (c5061dce)** + worker `decko-ts-scale-test` exist
  from the AUTHORIZED targeted run (2,810 rows, ~2.8% of one day) — that run
  was legal; the full-scale import was not.
- Quotas reset 5pm PT (UTC midnight). D1 free tier: **100,000 rows written /
  day**, **5,000,000 rows read / day**, 5 GB storage.
- Standing rule: **never suggest the paid plan. Ever.**

The one-click tool is built to be safe under this freeze: its default mode is
dry-run (zero remote calls), `--local` touches only local workerd state, and
`--execute` (the real account run) refuses to start without an explicit token
+ account id passed in the current invocation — and stays unexecuted until the
go.

---

## 3. The recomputed write arithmetic (exact, from the schema)

### The schema's per-card row floor

The D1 schema (`deploy/migrations/0001-schema.sql`, 13 tables) mandates
exactly **1 row per card**: the `cards` row. Everything else is optional at
seed time:

| table | rows written by a seed | why |
| --- | --- | --- |
| `cards` | 1 per card | the only mandatory row |
| `card_references` | deck-dependent | the inclusion/link graph; density is a property of the DECK, not the schema |
| `card_acts`, `card_actions`, `card_changes`, `card_revisions` | 0 | write-path/history tables; the seed inserts directly into `cards` and bypasses them |
| `card_virtuals` | 0 | materialized cache, populated by the engine |
| `delayed_jobs`, `sessions`, `schema_migrations`, `ar_internal_metadata`, `transform_migrations` | 0 | infra tables |

So the prior plan's "~6,600 cards ≈ 85% of one day" arithmetic is NOT
schema-derived; it assumes the incident corpus's reference density on top of
the card rows. That assumption is what gets recomputed below — it is the
whole difference between a deck that fits the guard and one that does not.

### The corpus density basis (the only one ever used)

From the incident import (93,700 cards + 1,112,560 refs = 1,206,260 rows —
the 13-day write):

- refs per card = 1,112,560 / 93,700 = **11.873639…** refs/card
- total rows per card = 1 + 11.873639 = **12.873639…**

### The exact numbers at three sizes

| size | card rows (41 fixed + N Scale Pages) | refs = round(N × 11.873639) | seed rows | + ANALYZE est. 50 | % of the 100k/day | verdict vs the 80,000 guard |
| --- | --- | --- | --- | --- | --- | --- |
| **N = 6,600** (the prior plan's "~6.6k ≈ 85%") | 6,641 | 78,366 | 85,007 | 85,057 | **85.06%** | **REFUSED** — 5,057 rows over the guard |
| **N = 6,200** (the tool's default) | 6,241 | 73,617 | 79,858 | 79,908 | **79.91%** | **PASS** — 92 rows of headroom |
| **N = 6,207** (mathematical ceiling, zero headroom) | 6,248 | 73,700 | 79,948 | 79,998 | 80.00% | PASS by 2 rows — documented, not offered as a default; 2 rows is not headroom |
| N = 6,208 (one past the ceiling) | 6,249 | 73,712 | 79,961 | 80,011 | 80.01% | REFUSED |

Check lines, reproducible:

```
6,600: round(6600 × 1112560/93700) = round(78,366.02) = 78,366; 6,641 + 78,366 = 85,007; 85,007 + 50 = 85,057; 85,057/100,000 = 85.06%  → over 80,000
6,200: round(6200 × 1112560/93700) = round(73,616.56) = 73,617; 6,241 + 73,617 = 79,858; 79,858 + 50 = 79,908; 79,908/100,000 = 79.91%  → under 80,000
```

**The headline correction to the prior arithmetic:** the "~6.6k cards ≈ 85%"
deck does NOT fit under the approved 20%-headroom gate. The prior figure
ignored (a) the 41 scaffold cards and (b) ANALYZE's sqlite_stat1 rows, and
the guard is 80,000, not 85,000. The guard-fitting one-click seed is
**6,200 Scale Pages = 79,908 rows including ANALYZE = 79.91% of one UTC day,
one pass, no mid-day retries, one end-of-run verification.**

### Per-step budget arithmetic for the one-click flow

Daily limit 100,000 rows written (UTC day); guard = 80% = 80,000; the tool
gates cumulatively, including `--spent-today` rows written by other
operations.

| step | writes | cumulative | % of day | verdict |
| --- | --- | --- | --- | --- |
| 1. verify CF API token (`GET /user/tokens/verify`) | 0 | 0 | 0% | no gate |
| 2. create D1 database (`POST /d1/database`) | 0 | 0 | 0% | no gate (resource creation, no table rows) |
| 3. apply schema `0001-schema.sql` | 0 data rows (DDL: 13 tables, 33 indexes) | 0 | 0% | no gate |
| 4. fitting-scale seed, 100 chunks × ≤800 single-row INSERTs | 79,858 | 79,858 | 79.86% | GATE PASS (per-chunk gated: chunks 1-98 pass; arithmetic identical — the gate recomputes per chunk so a re-run after a partial day refuses mid-way instead of guessing) |
| 5. ANALYZE (planner stats; REQUIRED — without it the planner probes `cards_trash_index` per lookup) | est. 50 (sqlite_stat1: one row per index, 33 indexes, conservatively rounded) | 79,908 | 79.91% | GATE PASS |
| 6. deploy Worker (`wrangler deploy`) | 0 D1 rows | 79,908 | 79.91% | no gate |
| 7. assets | 0 — none by design | 79,908 | 79.91% | no gate |
| 8. verify URL (`GET /_status`, `GET /`) | 0 writes; reads ≈ 6,241 rows for the COUNT + render — 0.12% of the 5M/day read budget | 79,908 | 79.91% | no gate |

Accounting conventions (stated, not hidden): one single-row INSERT = 1 row
written, so chunk row counts are exact by construction; the arithmetic counts
TABLE ROWS only, the same convention as the incident arithmetic — if D1's
`rows_written` metric also counts index-entry writes, the 20% headroom absorbs
the delta and `GET /__metrics` after the run reports the platform's own number.

---

## 4. The one-click flow, step by step (what `--execute` does when the go comes)

Implemented in `scripts/deploy/one-click-deck/one-click-deck.mjs`:

| file | role |
| --- | --- |
| `one-click-deck.mjs` | the single command. Default = dry-run (prints every step + its exact write count + guard verdict, executes nothing remote). `--local` = the local demo. `--execute --token T --account-id A` = the real run. Exit 2 = `--budget-exceeded`, exit 3 = `--platform-ops-blocked`. |
| `write-budget.mjs` | the gate: declares the service limit (100,000/day), the guard (80%), the ledger (UTC-day-keyed JSON, so re-runs accumulate), `check()` → declare/arithmetic/pass-fail per step, refusal marker `--budget-exceeded`. |
| `seed-fitting-scale.mjs` | the fitting-scale deck generator: deterministic (pure index math, no RNG), single-row INSERTs only, exact row counts per chunk, emits BOTH chunk granularities (`local-5000/` for workerd-local, `remote-800/` — the incident-proven remote-safe size) + `manifest.json` with the full budget math. |
| `platform-ops.mjs` | dual-path platform operations (win32 npx.cmd via shell; linux/darwin plain npx; anything else → LOUD `PLATFORM-OPS` error naming the missing branch). All HTTP is Node `fetch` — no curl dependency. |
| `wrangler.oneclick.toml` | GENERATED, idempotent: worker `decko-one-click-demo`, main → `deploy/worker.ts`, same `[alias]` crypto shim, D1 binding `decko-one-click-db`. `database_id` starts as a syntactically-valid placeholder (fine for local workerd — local D1 never contacts the account); `--execute` rewrites it with the real id from `d1 create`. Deliberately SEPARATE from `deploy/wrangler.toml` so the frozen demo DB binding is never touched. |

Flow: token in → verify token → create D1 → schema → fitting-scale seed
(gated per chunk) → ANALYZE → deploy worker → assets (none by design: the
engine stores everything in D1; no R2, no KV, no `[assets]` directory) →
verify `https://decko-one-click-demo.<subdomain>.workers.dev/_status` and `/`.

The generated artifacts live under `scripts/deploy/one-click-deck/out/`
(gitignored): seed chunks, `manifest.json`, the local workerd state, the
UTC-day budget ledger.

---

## 5. Local demo status (the proof that needs no account) — VALIDATED

Results of the final local run on 2026-09-25 (this machine, win32):

- `node scripts/deploy/one-click-deck/one-click-deck.mjs --local` provisions
  local workerd D1 end-to-end: schema (13 tables / 33 indexes) + 16 local
  seed chunks (15 × 5,000 + 4,858 single-row INSERTs = **79,858 rows**,
  exact) + ANALYZE, with `CLOUDFLARE_*` variables STRIPPED from every child
  env and `WRANGLER_SEND_METRICS=false` — zero contact with Cloudflare.
- `npx wrangler dev --config scripts/deploy/one-click-deck/wrangler.oneclick.toml
  --persist-to scripts/deploy/one-click-deck/out/local-state` boots wrangler
  4.135.0's local workerd (win32 workerd binary — no native-dep blocker) on
  `http://127.0.0.1:8787`, binding `env.DB (decko-one-click-db)` LOCAL.
- Final validation battery (all measured over HTTP):
  - `GET /_status` → 200, `{"ok":true,"engine":"decko-ts",
    "database":{"ok":true,"card_count":6241}}` — equals the planned 6,241
    card rows exactly (0.13s including engine boot).
  - `GET /` → 200 (0.03s), home card renders its content and inclusions.
  - `GET /Scale Page 1x`, `/Scale Page 173x`, `/Depth Level 20`,
    `/Big Pointer` (the 500-item pointer), `/All Scale Page Probe` (the
    search card) → all 200, warm renders 5-27ms.
  - `POST /api/query {"cql":{"name":"Scale Page 173x"}}` → the card record
    (`"key":"scale_page_173x"`); `{"cql":{"type":"Note","return":"count"}}`
    → **6,233** = 6,200 Scale Pages + 32 chain + Home; plus 8 non-Note
    scaffold cards = 6,241 — the CQL count independently confirms the seed
    arithmetic.
  - `GET /__metrics` → 10 requests, 70 SQL statements, 74,939 rows read
    total (includes the full-deck CQL count scans), **0 rows written** at
    runtime, 1 cold start.
- Known-and-correct behavior (not a blocker): rendering the 32-deep chain
  FROM ITS ROOT raises `nest depth exceeded (Depth Level 22)` (root at nest
  depth 0; Level 21 renders at depth 20 = the cap; Level 22 at depth 21 is
  refused) — Ruby-decko parity (`Card.config.max_depth = 20`), pinned by
  `benchmarks/cf-scale/verify-targeted-deck.test.ts` at its own entry shape.
  The seed's Home card therefore includes one Scale Page, not the chain root;
  the chain stays in the deck as the depth dimension, entered mid-chain.

Validation caught three real seed/gate defects, each fixed in the generator
and re-provisioned (local state wiped, chunks regenerated, DB re-applied —
never worked around):

1. **Home chased the full 32-chain** → 500 at the depth cap. Fixed: Home
   includes one Scale Page; the chain remains as a mid-chain-enterable
   dimension.
2. **Scale Page canonical keys were wrong**: stored `scale_page_173`, but the
   engine's `simpleKey` canonicalization of "Scale Page 173x" is
   `scale_page_173x` — URL routing and CQL resolve by KEY, so every Scale
   Page 404'd (verified against `src/card/name.ts` `simpleKey`/`stableKey`,
   the same canonicalization `deploy/seed.mjs` applies). Fixed:
   `scalePageKey` now emits the engine-canonical form.
3. **The budget ledger counted local commits as CF-spent**: a second
   `--local` run the same UTC day refused with a projected 159,766 CF-day
   rows although local workerd writes consume ZERO quota — the ledger would
   have lied in both directions. Fixed: only `--execute` commits enter the
   ledger.

Operational note from the same session: stopping the `wrangler dev` task
leaves the workerd child orphaned, holding sqlite locks on
`out/local-state`. Each time, the chain was identified by command line
(`Get-CimInstance Win32_Process`), confirmed as this session's own dev
server, and stopped by explicit PID — never by name. The runbook carries the
same instruction.

---

## 6. What remains for the real demo (when Julian says go)

1. A CF API token with D1 + Workers permissions for a FREE account, and the
   account id — passed in the current turn (`--token` / `--account-id`; the
   known account id 981606791acca1fb9c23c9b8aa3c762a is ours, and per the
   2026-09-19 ruling "we can use our Cloudflare").
2. `--spent-today N` if anything else wrote to that account earlier in the
   UTC day — the guard counts it.
3. Run the real demo exactly as scripted in `docs/one-click-cf-deploy-demo.md`
   (§ real demo). Every D1 write step re-checks the gate; refusal is exit 2.
4. NOT done by this work, by design: zero remote CF calls were made — no
   deploy, no remote D1, no API writes; the frozen DBs and the partial
   import are untouched; cleanup stays frozen.
