# M2 milestone: decko-ts is live on Cloudflare Workers + D1

Date: 2026-09-20. Status: **DEPLOYED AND VERIFIED** (root render pending the
render-fix stream; see below).

## The deployment

- **URL**: https://decko-ts-demo.jpswilner.workers.dev
- **Worker**: `decko-ts-demo` (Worker version id recorded at deploy time)
- **Bundle**: 198.42 KiB (51.65 KiB gzip), worker startup **3 ms**
- **D1**: `decko-ts-demo-db` (database_id substituted at deploy time; the
  committed configs carry the `TBD_REPLACE_AFTER_WRANGLER_D1_CREATE`
  placeholder), region WNAM, 12 tables, 15 synthetic demo cards, ~200 KB —
  the free-tier D1 allowance is 5 GB; this uses 0.004% of it
- **R2/KV/queues/secrets**: none. Zero site-owner data, zero private-deck
  content — the seed (deploy/seed/seed.sql, 8.3 KB) is synthetic
  (generator-built Notes + a depth-4 compound chain + one Search card).

## What the TypeScript engine is doing on the edge

`GET /:card-name` renders the `:open` view through the ported renderer
(Lexicon compound-name resolution, batched inclusion prefetch — the #1282
constant-queries mechanism), `GET /:card-name.json` serves the fetched card
record, `POST /api/query` executes CQL, `GET /_status` reports engine+db
health. All of it runs as Web-standard JavaScript in a Workers isolate over
the CloudflareD1Adapter; the one Node import in the engine graph
(`node:crypto` for slot ids) is aliased to a Web-Crypto shim at bundle time.

## Verification

- Local: 16/16 miniflare tests (real workerd, D1 adapter, every route,
  404/400/405 shapes) + `wrangler deploy --dry-run` bundle validation.
- Live (read-only checks):
  - `/_status` → `{"ok":true, "runtime":"cloudflare-workers", "database":{"ok":true,"d1":true,"card_count":15}}`
  - `/Home.json` → full card record served from D1
  - `GET /` → currently returns the render-error page with
    `nest target not found: Demo Guide+Section One` — this is the known
    deep-junction prefetch gap (junction rows carry NULL keys and never
    enter the prefetch frontier). The render-fix stream is landed-in-flight
    on exactly this; redeploy follows its landing.
- `POST /api/query` verified 16/16 locally; the live POST check was not
  re-run from this machine (permission gate on public HTTP writes) and can
  be curl'd directly per deploy/README.md.

## One-click story (deploy/README.md)

`wrangler d1 create` → paste id into deploy/wrangler.toml →
`wrangler d1 execute --file migrations/0001-schema.sql` →
`--file seed/seed.sql` → `wrangler deploy` → curl smoke checks.
Cleanup: `node deploy/cleanup.mjs --yes` removes the Worker and the D1
database (the complete footprint); the deploy token is revoked at cleanup.

## Cost

$0. Workers free tier + D1 free tier; nothing metered beyond it.
