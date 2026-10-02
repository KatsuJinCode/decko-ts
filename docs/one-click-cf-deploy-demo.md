# one-click Cloudflare deploy — DEMO RUNBOOK

The exact commands for the ONE-CLICK CLOUDFLARE DEPLOYMENT demo, in two
parts: (a) the local demo — real workerd, real D1 semantics, ZERO Cloudflare
account, zero network to Cloudflare — and (b) the real one-click demo on a
free Cloudflare account, which needs someone with access to that account to
run. Nothing in part (b) has been executed.

Tool: `scripts/deploy/one-click-deck/one-click-deck.mjs` (see
`docs/one-click-cf-deploy-inventory.md` for the inventory + the exact
write-budget arithmetic).

The guard, in one line: every D1 write step declares its exact row count and
is refused (`--budget-exceeded`, exit 2) if the cumulative day would pass
**80,000 rows = 80% of the free tier's 100,000 rows/day** — including rows
already spent today by other operations (`--spent-today N`). The ledger is
UTC-day-keyed (CF quotas reset 5pm PT / UTC midnight) and records ONLY
execute-mode commits; local workerd writes consume no quota and are never
counted as spent.

---

## Part (a) — the LOCAL demo (no Cloudflare account, do this today)

Prereqs: Node 24, this repo, and `wrangler`. If `wrangler` is not already on
PATH, the first `npx` fetches it from npm — a tooling download, not a CF call.
Do NOT set `CLOUDFLARE_API_TOKEN` in the shell; the tool strips it from its own
children and the dev server needs none.

### a1. See the plan first (dry-run — the default; executes nothing remote)

```sh
node scripts/deploy/one-click-deck/one-click-deck.mjs
```

Run from the repository root.

Prints every step of the flow with its exact D1 write count and the guard
verdict. Expected: seed = 6,200 Scale Pages → 6,241 card rows + 73,617 ref
rows = 79,858; ANALYZE +50 → 79,908 = 79.91% of one UTC day; GUARD VERDICT:
ALL STEPS PASS. (Try `--cards 6600` to watch the prior plan's size get
REFUSED at 85,057 rows = 85.06% — exit 2.)

### a2. Provision the local workerd D1 (schema + fitting-scale seed + ANALYZE)

```sh
node scripts/deploy/one-click-deck/one-click-deck.mjs --local
```

Applies `deploy/migrations/0001-schema.sql` and 16 local seed chunks (15 ×
5,000 + 4,858 single-row INSERTs = 79,858 rows) through `wrangler d1 execute
--local` into `scripts/deploy/one-click-deck/out/local-state/`, then ANALYZE.
No account, no token, no network to Cloudflare. Budget arithmetic is printed
but nothing is recorded as CF-spent. First run takes ~10-15 minutes (18
wrangler invocations; each chunk call is the incident-proven shape, shrunk
for local convenience to 5,000 statements — the remote set is generated
alongside at 800).

### a3. Serve it (local workerd)

```sh
npx wrangler dev --config scripts/deploy/one-click-deck/wrangler.oneclick.toml --persist-to scripts/deploy/one-click-deck/out/local-state
```

Wait for `Ready on http://127.0.0.1:8787`. The binding banner must say
`env.DB (decko-one-click-db)  D1 Database  local`.

### a4. Verify end-to-end (reads only)

```sh
curl -s http://127.0.0.1:8787/_status
```
Expected: `{"ok":true,"engine":"decko-ts","runtime":"cloudflare-workers",
"database":{"ok":true,"d1":true,"card_count":6241},...}` — the card count is
the planned 6,241 exactly.

```sh
curl -s http://127.0.0.1:8787/ | grep -o "Fitting-scale one-click demo deck"
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8787/Scale%20Page%201x"
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8787/Scale%20Page%20173x"
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8787/Depth%20Level%2020"
curl -s -X POST http://127.0.0.1:8787/api/query -H "Content-Type: application/json" -d "{\"cql\":{\"name\":\"Scale Page 173x\"}}"
```

Expected: home renders (200, contains the deck title); Scale Pages render
(200); `/Depth Level 20` renders the mid-chain entry (200 — levels 20→32,
under the Ruby-parity nest cap of 20); the CQL query returns the card record
JSON. NOTE: `/Depth Level 1` (the chain ROOT) returns a 500 whose body is
`nest depth exceeded (Depth Level 22)` — that is Ruby-decko parity
(`Card.config.max_depth = 20`; the root renders at nest depth 0, Level 21
sits at depth 20 = the cap, Level 22 at depth 21 is refused), not a defect;
the demo probes enter mid-chain.

Measured on 2026-09-25 (this machine, final battery): `/_status` 200 with
`card_count: 6241` (0.13s incl. engine boot); home 200 (0.03s); Scale Pages,
`/Depth Level 20`, `/Big Pointer`, `/All Scale Page Probe` all 200 (warm
5-27ms); CQL by name returns `"key":"scale_page_173x"`; CQL Note count =
6,233 (= 6,200 Scale Pages + 32 chain + Home; +8 non-Note scaffold =
6,241 — the CQL count independently confirms the seed arithmetic);
`/__metrics` after the battery: 10 requests, 70 SQL statements, 74,939 rows
read, 0 rows written, 1 cold start. See inventory doc §5 for the full record
including the three defects validation caught and fixed.

Stop the server with Ctrl+C in its terminal. If a stale workerd ever keeps
the `out/local-state` sqlite files locked after a kill, identify the process
by its command line first, confirm it is that dev server, and stop that one
process by its exact process id — never by name.

---

## Part (b) — the REAL one-click demo on a free account (needs account access)

Preconditions, all four required:

1. Someone who owns the target account decides to run it. Part (b) writes to
   a real Cloudflare account; it is not something a tool should start on its
   own.
2. A FREE Cloudflare account + an API token with D1 edit + Workers Scripts
   edit permissions for it.
3. The account id.
4. `--spent-today N` if ANYTHING wrote D1 rows on that account earlier in
   the UTC day (the guard counts them; the target account must be otherwise
   quiet — 79,908 of the 80,000 guarded rows are spoken for).

### b1. Dry-run with the real flags (still touches nothing)

```sh
node scripts/deploy/one-click-deck/one-click-deck.mjs --execute --token <TOKEN> --account-id <ACCOUNT_ID> --spent-today 0
```

Wait — `--execute` with dry-run intent: passing `--dry-run` alongside
downgrades to a dry run (`--execute --dry-run ...`). Read the printed plan;
confirm every GATE line says PASS and the token/account echo looks right.

### b2. The real run

```sh
node scripts/deploy/one-click-deck/one-click-deck.mjs --execute --token <TOKEN> --account-id <ACCOUNT_ID> --spent-today 0
```

What it does, in order, printing each command before running it:

1. `GET /user/tokens/verify` — validates the token (read-only).
2. `POST /accounts/<id>/d1/database` — creates `decko-one-click-db` on the
   FREE plan; rewrites the generated `wrangler.oneclick.toml` with the real
   database id.
3. Schema: `wrangler d1 execute decko-one-click-db --remote --file deploy/migrations/0001-schema.sql` (DDL, 0 data rows).
4. Seed: 100 remote chunks × ≤800 statements (the incident-proven size),
   EACH chunk re-gated before its write; the day total is printed after
   every chunk. Any gate failure = exit 2 `--budget-exceeded`, mid-run safe
   (chunks are plain INSERTs; a refused run leaves the earlier chunks in
   place and the arithmetic records exactly what was written).
5. ANALYZE (gated, 50 rows) — required planner stats.
6. `wrangler deploy` — the Worker `decko-one-click-demo`.
7. Assets: none by design (engine stores everything in D1; no R2, no KV).
8. Verify: `GET https://decko-one-click-demo.<subdomain>.workers.dev/_status`
   then `GET /` (reads only).

Day cost of the whole run: **79,908 rows = 79.91% of one UTC day, one pass**.
The account then rests until the UTC reset — no trickle, no retries.

### b3. After the demo

- `GET /__metrics` on the deployed URL reports the platform's own
  rows_written/rows_read aggregate — compare against the 79,908 arithmetic
  (the convention is table-rows-only; index-entry deltas are absorbed by the
  92-row headroom).
- Teardown later (deletes Worker + D1 database) also CONSUMES WRITES on that
  account's day — a `wrangler delete` for `decko-one-click-demo` +
  `wrangler d1 delete decko-one-click-db` is a decision to be made
  deliberately, planned and gated like any other write, not a casual cleanup.
- Four pre-existing resources are out of scope for this demo and are neither
  created nor touched by it: `decko-ts-demo-db` (the partial-import
  database), worker `decko-ts-demo`, `decko-ts-scale-test-db`, and worker
  `decko-ts-scale-test`. This demo uses fresh names
  (`decko-one-click-demo`, `decko-one-click-db`) for exactly that reason.
