# Deploy notes — the M2 one-click Cloudflare Workers + D1 harness

What this stream shipped, what runs where, and the honest compatibility
findings. The operator recipe lives in `deploy/README.md`; the executable
acceptance is `tests/deploy/deploy-worker-miniflare.test.ts` (16 tests, real
workerd, no Cloudflare account).

## Architecture — what runs where

```
deploy/worker.ts (the ONLY new runtime code)
  |- CloudflareD1Adapter (src/server/drivers/d1.ts)   one adapter, per-isolate
  |- FetchEngine (src/card/fetch.ts)                  two-level cache, per-isolate
  |- RenderEngine (src/card/render.ts)                batched inclusion prefetch
  |- executeQuery (src/cql/execute.ts)                CQL -> parameterized SQL
  `- primeCqlNameResolver (worker-local)              sync name->id map for CQL
```

- **The worker is a thin shell.** It owns routing, status/error JSON, and one
  engine seam: the CQL sync name resolver. Everything else is the landed
  engine running unchanged — the same classes the Node tests drive through
  LocalSqliteDriver, here over the D1 binding.
- **Deck lifecycle: one per isolate.** The first request boots the engine;
  later requests reuse the warm caches (the #1282 promise: warm re-render,
  zero queries). A failed boot is not cached — the next request retries.
- **Routes:** `GET /` and `GET /:card-name` (rendered `:open` HTML),
  `GET /:card-name.json` (card record JSON), `POST /api/query`
  (`{"cql":{...}}` -> CQL result JSON), `GET /_status` (engine + db health).
  URL convention: `+` in a path segment is the decko junction joint; a space
  inside a name part must travel as `%20`
  (`/Demo%20Guide+Section%20One+Detail+History`).
- **What runs on real Cloudflare:** one Worker + one D1 database. No KV, no
  R2, no queues, no secrets, no cron triggers.

### The CQL name resolver (the one seam this entry supplies)

CQL's name-valued conditions (`type: "Note"`, `left: "Demo Guide"`) are
interpreted to ids during parsing through a SYNCHRONOUS resolver
(`ParseOptions.resolveCardId`, the port of `Card::Lexicon.id`). Without one,
a name condition collapses to the Ruby `-999` sentinel and silently matches
nothing (`src/cql/parser.ts` `idFromVal`). The render path primes its own
`idsByKey` during prefetch; `POST /api/query` has no prefetch, so the worker
primes an equivalent map once per isolate: one query loads
`id/name/left_id/right_id` of every non-trashed card, junction names are
composed recursively (left-associative, cycle-guarded, the
`DbLexicon.lexToName` shape), and everything is indexed by canonical key.

**Budget honesty:** this is O(all cards) memory in the isolate. For the demo
deck (15 rows) it is nothing; at corpus scale (47k cards) a production entry
would swap in a real sync-lexicon strategy. It is written as one replaceable
function (`primeCqlNameResolver`) for exactly that reason.

## Compatibility findings (reported, NOT edited — src/ is not this stream's territory)

### 1. `node:crypto` on the render path — routed around at bundle time

`src/card/render/slot-html.ts` (`newSlotId`, the `SecureRandom.hex(10)`
slot id) imports `randomBytes` from `node:crypto`. That is the ONLY Node API
in the worker's module graph (audited 2026-09-20: every other import in the
graph is engine-relative; the other Node users — `src/testing/*`,
`libsql-http.ts`'s Buffer — are not on the worker's import path). Workers
have no `node:crypto` without the `nodejs_compat` flag.

**Correction 2026-09-29 (workerd-boot lane): the 2026-09-20 audit was wrong
and the crypto-only guard inherited the error.**
`src/card/render/coded-attachment-files.ts` statically imported `node:fs`
(plus `node:path`/`node:url`) and IS on the worker import path
(`views.ts` -> `codedSvgFileBytes`); vite hoisted those imports to the
bundle top, so workerd refused the script at load with
`No such module "node:fs"` — `deploy/launch.mjs --local` and the whole
miniflare deploy suite were dead at boot on every revision that carried the
module. Fixed in src this time (authorized for this lane): the module
reaches fs through a runtime `process.getBuiltinModule` probe (Node >= 22.3;
no import statement, so no bundler can emit a node: specifier from it),
resolves the vendored mod dirs with plain `new URL` against
`import.meta.url`, and yields `undefined` on runtimes that have neither
(workerd exposes no `process` and no `import.meta.url` for booted scripts —
both probed via miniflare) so the caller's image-URL branch takes over.
The bundle hygiene check in BOTH `launch.mjs` and the deploy suite now
rejects every quoted `node:<module>` specifier, not just `node:crypto`.

Route-around (deploy path only): `wrangler.toml` declares

```toml
[alias]
"node:crypto" = "./shims/node-crypto-shim.ts"
```

and `shims/node-crypto-shim.ts` implements `randomBytes` over Web Crypto
`crypto.getRandomValues`, preserving the pinned contract
(`randomBytes(10).toString("hex")` = exactly 20 lowercase hex chars, the
replay-harness slot-id shape). No `nodejs_compat` flag is set — the deploy
is Web-standard-only and the tests pin that (since 2026-09-29 the bundle
must contain no `node:` specifier at all; before then a crypto-only check
missed the `node:fs` import that broke the boot — see the correction
above). Both bundlers were verified: wrangler 4.135.0 `--dry-run`
(the real production bundle: shim present, no `node:crypto` module code) and
the vite test bundle with the same alias.

The proper upstream fix is a one-line change in `slot-html.ts` (inject or
feature-detect the RNG); that belongs to the render stream.

### 2. Render prefetcher cannot resolve junction inclusions deeper than two parts

Found by the seed's depth-4 compound chain. Mechanism, precisely:

- The recursive CTE walk (`src/card/render/prefetch.ts` `walkStatement`)
  joins the frontier on `c."key" = f.key`. Junction rows carry NULL name/key
  columns by convention (2020 Lexicon), so a junction reference key
  (`demo_guide+section_one+detail`) never matches a row and junctions never
  enter the SQL frontier.
- The JS fallback (`verifyClosure`) handles junction references with a
  side-key join (`l."key" IN (...) AND r."key" IN (...)`), which by
  construction requires BOTH sides to be simple (non-compound) keys, and its
  resolution check (`matchedPairs`) likewise records only one-joint pairs.
  A depth-3 reference (`A+B+C`: left side `A+B` is itself compound) is
  decomposed into its sides but those sides are never re-assembled — the
  junction row for `A+B+C` is never fetched into the render-card map.
- Result: depth-2 junction nests render (oracle-replay-proven, and by this
  seed's demo chain); a content inclusion of a depth-3+ junction name throws
  `nest target not found: ...` at render time. Simple-name inclusion chains
  are unaffected (proven to depth 42 by `tests/card/render/depth-sweep.test.ts`).
  Compound-name FETCH is unaffected (Lexicon side-id composition; the deploy
  tests render the depth-4 compound card by name).

Deploy-path route-around: the seed demos deep nesting through simple-name
inclusions (Home -> Demo Guide -> junction depth-2 -> Detail -> History:
four inclusion levels) and keeps the genuine depth-4 compound chain
(`Demo Guide+Section One+Detail+History`) renderable per-level by name. The
upstream fix belongs to the render stream: either recurse the side-join in
the fallback (join `l.left_id`/`l.right_id` one more level, or match
junction rows by composed side-key pairs in JS) or teach the CTE to walk
junction rows by side ids.

### 3. `match` (REGEXP) is unavailable on D1

Already documented in `docs/cql-execution-notes.md`: `match` needs the
SQLite REGEXP UDF on local drivers; edge drivers cannot register functions,
and the decided JS-side post-filter strategy is documented but not
implemented. `POST /api/query` surfaces this honestly: a `match` statement
fails with the driver's "no such function" error (500), not silently empty
results. The demo seed deliberately uses only `type`/`name`/`sort` shapes.

### 4. The plural-stem key trap bites seed authors

`DeckoName` singularizes trailing-s stems ("Details" -> key `detail`,
"All Notes" -> `all_note`). A seed that hand-writes keys must store the
canonical key or name lookups silently miss. `deploy/seed.mjs` derives keys
mechanically and REFUSES names ending in a plural stem (the generator fails
with an explanation instead of producing a broken seed).

## The local proof (what the tests pin)

`npx vitest run tests/deploy` (16 tests, real workerd via miniflare 5, the
`convertV4MiniflareOptions` boot path proven in `docs/driver-notes.md`):

1. Bundle `deploy/worker.ts` with the production alias (vite, test-only
   tooling; miniflare 5 ships no TS bundler and workerd executes JS only).
2. Assert the bundle contains no quoted `node:<module>` specifier (any
   module — widened 2026-09-29 from a node:crypto-only check that let the
   boot-breaking `node:fs` through) and actually includes the engine.
3. Boot workerd, apply `deploy/migrations/0001-schema.sql` +
   `deploy/seed/seed.sql` through `CloudflareD1Adapter` (the same adapter
   the worker runs on).
4. Exercise every route: status (card_count 15), Home rendering the
   four-level inclusion chain with `data-slot` attributes (shim exercised at
   runtime), simple + depth-2 + depth-4 compound name renders, record JSON
   with type name, 404s, CQL queries (type+sort rows, name condition, count,
   string-form cql, three 400 shapes), 405s.

`wrangler deploy --dry-run` (account-free) additionally validated the real
production path on wrangler 4.135.0: config valid, TS bundles, D1 binding
resolves, shim in the bundle.

## Storage budget statement

D1 free tier: 5 GB total. This deploy uses the schema DDL plus an 8.3 KB
seed — effectively zero of the budget. The seed is SYNTHETIC (invented
content only; the milestone data rule puts zero member data on Cloudflare,
ever). R2 is not used at all: the engine stores everything in SQL, this
deploy binds no object storage, and there are no file uploads.

## Cleanup

`node deploy/cleanup.mjs` prints the plan (two resources);
`--yes` executes:

- `npx wrangler delete ` (the name is a POSITIONAL:
  `wrangler delete [name]` — wrangler 4.135.0 declares no `--name` flag;
  interactive confirmation expected)
- `npx wrangler d1 delete  --skip-confirmation` (flag
  verified against the Cloudflare D1 command docs)

That is the complete footprint; nothing else is created by this deploy.

## What is deliberately NOT here

- No real `wrangler deploy`/`d1 create`/`d1 execute --remote` was run: the
  coordinator does the authenticated deploy (README has the exact commands).
- No view-over-URL route (`/:name/:view`): the spec fixes `:open`; more
  views are engine library surface, not deploy surface.
- No production sync-lexicon strategy (finding 1 in the resolver section):
  the demo-sized priming is marked replaceable, not generalized.
- No write path: the demo deck is read-only; history/act tables exist in the
  schema and stay empty (noted in the generated seed header).
