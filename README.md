# Decko Core

Implementation workspace for the runtime-independent Decko project, with
TypeScript as the current implementation and first-class Ruby support as the
architectural direction.

Read the project contract (not part of this package) and the
commit and publication gates (not part of this package). These govern
future work and supersede conflicting TS-only direction in older notes.

## TypeScript implementation history

TypeScript port of the Decko card engine. Target: full compatibility with
Ruby Decko (card 1.110.0 / decko 0.20.0) for ANY deck — any combination of
mods, cards, and settings. The running Ruby engine is the oracle; the
acceptance criterion is byte-for-byte output parity. Upstream
proposal: decko-commons/decko#1282 (held on this fork until parity +
flawless production run, per the proposal's question 3 recommendation).

The parity grade of record is the public synthetic deck, graded by the
reference harness and reproducible from this repository
([reference-harness/SPEC.md](reference-harness/SPEC.md)). **Last measured
2026-10-10** by running the harness and the grader against the committed
`reference-harness/fixtures/synthetic-v1` fixture:

```bash
node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ts/adapter.json \
     --fixture reference-harness/fixtures/synthetic-v1 --out <resultsDir>
node reference-harness/runner/grade.mjs --fixture reference-harness/fixtures/synthetic-v1 \
     --actual <resultsDir> \
     --declared-other-tables reference-harness/adapters/ts/declared-other-tables.json
```

That run produced: rendering
1,754 of 1,754, semantics 2,389 of 2,389, persistence 16 of 16, side
effects 19 of 19 (16 write answers plus three sign-in answers — the
public scenarios include no sign-out), read-writes 8 of 8. Those are the
**grader's** tallies. The fixture's own op files hold 1,752 render and 2,388
semantics operations; the grader also counts the scenario steps whose op is
`render` (2) and `ask` (1), which is the whole of the difference
([docs/coverage-inventory.md](docs/coverage-inventory.md), "Why two counts of
the same fixture"). The public
harness's normalization is **N1, N2 and N3** — the three rules a grade report
names in its `normalization` field
([SPEC.md](reference-harness/SPEC.md), §4.2; `runner/normalize.mjs`): N1 masks
the `data-slot-id` attribute value, N2 canonicalizes JSON key order, and N3
compares class-token order inside a `class` attribute as a set. The
instrument defines eight rules in total (N1–N8); N4–N8 exist for values that
`synthetic-v2` carries and `synthetic-v1` does not (collapse ids, relative
times, capture-host content in debug pages, and error class names), and they
are applied when a comparison reaches them, which on `synthetic-v1` none does.
The evidence for each is in
[NORMALIZATION-EVIDENCE.md](reference-harness/NORMALIZATION-EVIDENCE.md). The browser journeys are a
different instrument with their own rules (`B1`–`B5` in
`browser/lib/observe.mjs`) — the two namespaces are distinct, and the journeys
comparator names the two harness forms it borrows rather than renumbering them.

**The expected outputs were captured on Windows** (`ruby 3.3.12
[x64-mingw-ucrt]`). That matters because Ruby's own operating system decides
the class-token order: stock Linux Ruby and stock Windows Ruby emit the same
tokens in a different order, and N3 is the rule that absorbs that difference
across platforms. Measured on this fixture, a stock Linux capture of the same
version differs at 678 of the 1,752 render operations, every one of them
class-token order and nothing else
([docs/parity-method.md](docs/parity-method.md)). Because the committed bytes
came from Windows, N3 changes nothing about them; it is what lets a capture
from another operating system be graded against the same fixture.

The corpus
replay is a different instrument and takes different rules: **four**
normalizations, and the slot-id mask is one of them (the other three are the
accordion group hash, the Cloudflare `__CF$cv$params` challenge block and the
`Cardio::Mod` object address), then two one-time expectation transforms applied
upstream of the comparison (the asset-host prefix and the denied-seam
re-anchor), then 50 live-swapped expectations. Those belong to the historical
corpus workflow, not to this grade. The authoritative per-instrument table is
[docs/parity-method.md](docs/parity-method.md), "Every instrument's
normalisations, in one table". The larger figures under
[Migration status](#migration-status) — the with-mods corpus replay —
are historical: they were measured on an earlier revision of the engine,
on 2026-09-23, against a corpus that is not redistributable and cannot be
reproduced from this repository. A share of that historical corpus's
expected bytes — 50 entries, in two disjoint swap sets of 13 and 37 — comes
from the live 0.19.1 site rather than from the 0.20.0 oracle, so the
historical corpus figure is not a pure Ruby-oracle grade: see
[docs/parity-method.md](docs/parity-method.md), "The live-anchored
expectations". The current tree is verified by the test
suite and by byte identity on a fixed set of 40 pages across every serving
path, not by a second full grade.

---

## Deploy to Cloudflare (one-click)

This is a **Deploy to Cloudflare** button. Click it and the same engine you
read about below runs on Cloudflare Workers against a D1 database in your own
account. You need no terminal, no Node install, and no Cloudflare setup first.
What the button deploys is a **read-only four-card demo deck**; a writable deck
takes the steps in [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md).

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/KatsuJinCode/decko-ts-public)

### What you see, step by step

1. **You sign in, and you pick the names.** Cloudflare opens a setup page.
   You sign in to your Cloudflare account, then choose — or accept the
   default for — three names: the new repository Cloudflare will create in
   your GitHub account, the Worker, and the D1 database.
2. **Cloudflare copies the source into your account.** Your own copy of this
   repo lands in your GitHub account, so what gets deployed is yours, and you
   can keep developing it.
3. **Cloudflare creates the database.** It reads `wrangler.toml`, finds the
   one D1 binding, creates a fresh database on your account, and writes the
   real database id into the config in your copy. Nothing is shared with
   anyone else's account.
4. **Cloudflare creates the schema, the demo content, and the account
   system, then deploys.** It installs the repo and runs the migrations in
   `deploy/migrations/`: the core schema, a four-card demo deck, then the
   account substrate (card-mod-account's account cards plus the Decko Bot and
   Anonymous actor cards) so the deck has an account to sign in against, then
   `0009-demo-account-read-rules.sql` — the `*all+*read` catch-all and the
   Help Desk grants for the account fields, which are what keep an anonymous
   requester out of the owner's password digest, salt and email address.
   Then it bundles and deploys the Worker.
5. **You get a URL.** The Worker shows up in your Cloudflare dashboard under
   **Workers & Pages** with a `https://<worker-name>.<your-subdomain>.workers.dev`
   address. Open it and you are in the deck.

Nothing above needs a Cloudflare API token typed into the repo. There are no
secrets in `wrangler.toml`: the only *binding* the deployed Worker reads from
its environment is the D1 one. It also reads the two plain `[vars]` flags
described next (`DECKO_WRITE_PATH` and `DECKO_FIRST_RUN`), which are not
secrets and which a deploy from the button leaves unset.

### What you get: a browse-only demo deck

Four cards, already there, that you can read:

| URL | what it is |
| --- | --- |
| `/` | the `Home` card |
| `/Hello_World` | a card with body text (`_` stands for a space in a card URL; `+` joins two names into a compound card) |
| `/About` | a card that includes `Hello World` one level down |
| `/api/status` | JSON describing the running engine |
| `/api/card/About` | the same card as a JSON record |

You can browse every card and follow the inclusions, and you can ask for any
card as JSON. **You cannot create or edit cards from the deployed demo**: the
Worker this button ships reads, and has no card-write path — that is a
deliberate boundary, not a missing feature. (Sign-in is the one thing that
still works: `POST /update/*signin` records a session row, because a session
is not a card.) The database is yours, so you can add cards
to it yourself with the CLI, or extend `worker.ts` to write; the engine's
write path (rules, history, saves) is where the real product starts, and it is
not what this button turns on.

### Turning the write path on (opt in, off by default)

A deploy from the button is **read-only**: it can show every card and answer
JSON for any of them, and it will refuse every attempt to change a card with
a plain `403`. Sign-in is the deliberate exception — `/_signin` is not served
until you arm the write path, but a `POST /update/*signin` reaches the engine
either way and records a session row. The Worker does have a full write path —
sign-in with a real
D1-backed session, a first-run setup window, and card create / update / delete
— but it is switched off unless you set one of two values in `wrangler.toml`
and redeploy. Nothing is on unless you turn it on, and no secret is involved:
`DECKO_WRITE_PATH = "1"` turns on card writes (and the sign-in form's route),
`DECKO_FIRST_RUN = "1"` opens `/setup`, the one-time window that creates your
deck's first account (it needs the write path as well, because creating that
account is itself a card write, and it closes by itself once the account
exists).

```toml
# wrangler.toml
[vars]
DECKO_WRITE_PATH = "1"
DECKO_FIRST_RUN  = "1"
```

Then `npm run deploy` again. `/setup` walks you through creating the owner
account, `/_signin` signs you in, and from then on the write routes accept
your session. Sign-in stores only a SHA-256 digest of the session token in
D1 — the token itself is never written down — and hands you an `HttpOnly`,
`SameSite=Lax`, `Secure` cookie that carries it.

Writes on D1 are for evaluation and single-user use, not a supported
multiuser deployment. D1 has no interactive transactions, so the engine
saves there through a compensating journal
([decision 0007](docs/decisions/0007-atomic-saves-and-transaction-contract.md)):
a failed save is fully undone, but while a save is running a concurrent
reader can see its partial rows — a save that fails was briefly visible
before it vanished. A multiuser deployment on D1 therefore either keeps
`DECKO_WRITE_PATH` off or accepts that window; local SQLite and libSQL have
real transactions and do not have it.

One honest thing to know before you try a card write: the demo deck that
migration `0004` seeds ships **no create / update / delete rights at all**, so
the engine's permission walk refuses every save with a `403`, correctly, for
everybody including you. The route, the session, and the permission check are
all working; the deck is simply not given permission to change itself. Adding
that permission is deck content, so it is yours to add rather than something
this deploy does for you.

### If you would rather use the CLI
The button automates the same two commands, run from the repo root after
`npx wrangler login`:

```bash
npx wrangler d1 create decko-ts   # then paste the returned id into wrangler.toml
npm run deploy                     # = d1 migrations apply DB --remote && wrangler deploy
```

Doing it by hand, the paste in step 1 is yours to make — the id in
`wrangler.toml` is a default for the button to overwrite, not a real database.

`npm run deploy` applies everything in `deploy/migrations/` — schema, indexes,
demo cards, account substrate, account read rules — and then deploys. The
migration command names the **binding** (`DB`), not the database name, so it
keeps working after you rename the database.

### Smoke (against a deployed Worker)

```bash
curl https://<worker>.<subdomain>.workers.dev/                # Home card HTML
curl https://<worker>.<subdomain>.workers.dev/Hello_World     # the leaf card
curl https://<worker>.<subdomain>.workers.dev/Hello_World/content
curl https://<worker>.<subdomain>.workers.dev/api/status      # JSON engine metadata
curl https://<worker>.<subdomain>.workers.dev/api/card/About  # JSON card metadata
```

### Local dev (no Cloudflare account needed)

```bash
npm install
npx wrangler dev
```

Miniflare 5 boots a local D1 in workerd; the engine stays the same. The local
D1 starts empty — apply the migrations to it first if you want the demo cards
locally:

```bash
npx wrangler d1 migrations apply DB --local
```

### One-click teardown

A deploy leaves a Worker and a D1 database in your account. This removes
them — and only them.

```bash
node scripts/deploy/one-click-teardown.mjs        # 1. list what it would remove
node scripts/deploy/one-click-teardown.mjs --yes  # 2. print the plan + a fingerprint
node scripts/deploy/one-click-teardown.mjs --yes --confirm-plan <fingerprint>   # 3. remove it
```

**1 — the list.** Read-only. It reads the same `wrangler.toml` the deploy
reads, then asks your account what exists under the exact names in that file —
the Worker named there, the D1 database named in its `[[d1_databases]]` block.
It prints each one with its name, its id, and the date it was created, plus
the exact `wrangler` command a removal would run. It removes nothing, and it
never lists a resource whose name your config doesn't declare.

**2 and 3 — the removal.** `--yes` on its own prints the plan and stops,
handing you a fingerprint of it. You pass that fingerprint back. You can't
type a fingerprint you haven't read, so the list gets reviewed before anything
is deleted. Then it runs, in this order:

```bash
npx wrangler delete <worker-name> --config <config>                       # the Worker
npx wrangler d1 delete <database_name> --skip-confirmation --config <config>   # the D1 database
```

The Worker goes first because its D1 binding points at the database.
`--force` is never passed: if some other Worker depends on this one, wrangler's
own refusal is the answer and the tool reports it rather than overriding it.

To tear down a different deploy, point `--config` at its config:

```bash
node scripts/deploy/one-click-teardown.mjs -c scripts/deploy/one-click-deck/wrangler.oneclick.toml
node scripts/deploy/one-click-teardown.mjs -c deploy/wrangler.scale.toml
```

Some deploys have no config file to point at. The frozen demo pair — the
Worker `decko-ts-demo` and the D1 database `decko-ts-demo-db`, which holds the
partial ~1.2M-row import and whose names live in `deploy/cleanup.mjs` — has no
committed wrangler config, so
`--config` has nothing to read. Name the pair directly instead:
`--worker-name decko-ts-demo --db-name decko-ts-demo-db`. Without `--config`,
no config file is consulted at all, and everything else — the read-only list,
the fingerprint double-gate, the exact-match refusals — is the same path as the
config version. Passed together with `--config`, the overrides must agree with
what the config declares; a disagreement is refused
(`--override-conflicts-with-config`), never merged.

Add `--json` for the same list as JSON. Anything unclear — a name that doesn't
match, two databases with one name, an answer the tool couldn't read — is
refused with a reason, never deleted.

---

## Layout

- `worker.ts` + `wrangler.toml` (repo root) — the one-click Cloudflare
  Workers entry: ESM module that boots the engine on the first request and
  serves HTML/JSON from a D1 binding. This is what the Deploy button ships.
  There is no build step: `wrangler.toml` names this file directly and
  Wrangler bundles it (and the `.js`-suffixed imports it makes) itself, so
  `npx wrangler deploy` works on a fresh clone with nothing installed but
  dependencies.
- `deploy/` — the development deploy path: `deploy/worker.ts` (same engine,
  plus per-request metrics: `GET /__metrics`), `deploy/wrangler.toml`,
  DDL migrations (`deploy/migrations/` — the chain the Deploy button applies
  to the deployer's database: schema, indexes, demo cards, account substrate),
  seed tooling (`deploy/seed.mjs` regenerates the demo deck,
  `deploy/seed-account-system.mjs` regenerates the account substrate,
  `deploy/seed/`), and the local launch/teardown helpers.
- `scripts/deploy/one-click-teardown.mjs` — the one-click teardown: lists what
  a deploy created, and removes exactly that on `--yes --confirm-plan`. Tests:
  `tests/deploy/one-click-teardown.test.ts`; the Cloudflare response shapes it
  parses: `fixtures/deploy-teardown/`.
- `src/server/` — host-facing layer: SQL/blob driver interface, adapters
  (Cloudflare D1, libSQL-over-HTTP, local SQLite), schema row types.
- `src/card/` — the card engine core, ported from the Ruby card gem: name
  algebra, fetch/cache, history, sets/patterns, rendering, and the mod loader
  (`src/card/mod-loader/`), which supplies the second of the engine's two
  view-resolution layers (a most-specific-first walk of the card's sets) on
  top of the flat registry. The layout is
  TypeScript-idiomatic and is **not** a directory-for-directory mirror of
  `card/lib/card/`: a few directories correspond (`name/`, `fetch/`, `auth/`),
  the rest are named for the concept they carry, and views are one flat
  name→function registry — there is no Ruby-style `view :name do … end` DSL
  and nothing registers a view per set. Fidelity is not uniform either: the
  **name layer is line-faithful** (inflection rule tables transcribed from
  ActiveSupport, `Cardname`/`Card::Name` ported method for method), while the
  **render/views layer is a re-implementation in Decko's vocabulary** that
  cites the Ruby view each view came from and is held to it by byte comparison
  against the oracle. Follow the per-file
  upstream citation in each module's own header to find the Ruby original — see
  [decision 0008](docs/decisions/0008-view-registry-and-directory-layout.md)
  and [ARCHITECTURE.md](ARCHITECTURE.md), "How faithful each area is".
- `src/cql/` — Card Query Language: parser, AST, SQL translation, execution.
- `db/` — schema (SQLite-compatible DDL derived from the production MySQL
  schema: `db/schema.sqlite.sql` for fresh D1s) and seed (`db/seed.sql`).
- `tools/oracle/` — internal Ruby oracle tooling: a local decko app plus the
  capture scripts that record Ruby behavior into `fixtures/captured/`. It is
  how the expected bytes were produced; the public, reproducible harness is
  `reference-harness/` (below). Note the two are different directories: the
  harness lives in `reference-harness/`, not in `tools/oracle/`, and its
  containerised oracle is `reference-harness/oracle/`.
- `tools/migrate/` — the generalized dump importer (Ruby deck dump →
  decko-ts storage), proven on a 1.2 GB production dump.
  `node tools/migrate/migrate.mjs --dump deck.sql --out deck.sqlite --files <the Ruby deck's files directory> --verify --strict`
  imports, copies the uploads, and fails unless every table matches the dump,
  the engine can serve the deck and every file a card names is in place;
  `--resume` continues an interrupted run from its last committed batch.
- `tools/corpus-anonymizer/` + `benchmarks/` — the corpus program:
  structure-preserving content-free benchmark deck (47k cards / 180k views),
  the anonymized 2x-scale artifact builder, replay + perf harnesses.
- `tools/hygiene/` — publication gates: secret/identity scan (worktree +
  full git object DB), incomplete-work marker scan, docs link check.
- `fixtures/captured/` — the oracle's recorded outputs (committed; they
  are the executable specification).
- `tests/` — vitest suites per subsystem (card, cql, server, deploy,
  migrate, testing, tools) plus worker/Miniflare smoke tests.
- `reference-harness/` — the **public** parity harness: the synthetic `v1`
  deck fixture, the expected bytes, the TypeScript adapter and the
  run/grade commands ([SPEC.md](reference-harness/SPEC.md)). Reproducible from
  a clean clone with only Node installed.
- `docs/` — port tracker, per-stream notes, publication plan.

## Test status

The standing verification net (`tests/standing-net.json`, 125 manifest
files) runs via `node tools/test-queue/run-standing-net.mjs`. The full-suite
result for this tree is recorded in [KNOWN_FAILURES.md](KNOWN_FAILURES.md).

Members of the net that are not redistributed with this repository print
`[not redistributed] NOT RUN <file>` and are not run. The runner reports them
separately, labels the run PARTIAL, and never counts them as passed.
`STANDING_NET_REQUIRE_ALL=1` makes any such member a failure instead.

This is the tree's one standing total; per-stream counts are
historical landing-time records, not a
current measure. What each parity instrument measures, and what the
public package does not measure, is inventoried in
[docs/coverage-inventory.md](docs/coverage-inventory.md). All four render-perf
budgets are green solo (warm
4.8ms/entry vs 25 budget, 0 cold cards; receipt
the render-perf results file (not in the public package)).

`npm test` runs the card-engine suite (the largest tree); the full tree
runs with `npx vitest run`. The freshness proof that a committed write is
visible to the next request on every serving path is its own command —
`npm run test:no-caching-freshness`
(`tests/deploy/no-caching-synthetic.test.ts`, measured at 7.8 s alone) — and a
stage of `npm run release-check`. It is not inside `npm test` because that
command already costs about 155 s on this tree, and because a deploy-suite
proof does not belong to a card-only script. Round trips per render are pinned by the
measured law ([docs/scaling-comparison-deep-nesting.md](docs/scaling-comparison-deep-nesting.md),
reproducible with `tests/card/render/deep-nesting-trip-attribution.test.ts`):
a cold render costs four fixed round trips plus one per nesting level below
the root, however many cards each level holds — breadth costs nothing extra
(a 200-card fan is 5 round trips) — while Ruby sends one query per card at
every depth. That holds on a deck that carries its `*all+*read` rule card,
which every real deck does: the read permission's one-time setup rides the
prelude batch, so it costs statements and no round trips. The `#1282`
constant-per-depth claim is not met; the
depth-sweep test (`tests/card/render/depth-sweep.test.ts`) asserts the same
slope at every depth up to the renderer's 20-level ceiling.

## Ground rules

- The engine never imports vendor SDKs or branches on provider names.
- Typecheck: `npm run typecheck`. Tests: `npm test` (full tree:
  `npx vitest run`). Both must pass before any commit lands.
- Ruby truth lives in the installed gems on the build machine (Ruby 3.3,
  card-1.110.0, decko-0.20.0) and, for the production schema, the
  private production deck's mysqldump (identity withheld).
- Data rule: real production-deck content never leaves the build machine.
  Sanitized, content-free structural artifacts (the corpus, the anonymized
  scale deck) are the only derivatives that exist anywhere else.
- Nothing from this repo goes to decko-commons upstream without the
  project owner's explicit approval (see the publication gates, which are not part of this package).

## Migration status

Landed: drivers (D1/libSQL/SQLite), oracle harness, name algebra, schema,
CQL parser + execution, history, replay harness, benchmark corpus, set-pattern
registry, fetch/cache, renderer with batched inclusion prefetch, rule
application, mod loading with a set-chain view-resolution layer over the flat
view registry, request
metrics, the perf harness, and the generalized dump importer.

Full-corpus render parity (the with-mods corpus replay, 2026-09-23, measured
on an earlier revision of the engine — the grade of record is the
synthetic-deck grade at the top of this file, and the current tree was
re-verified on the 40-page production gate rather than by a new full corpus
grade): 167,674 / 180,442 captured views byte-identical (92.9%; that day's runs
progressed 91.4% → 92.4% → 92.9%). The rule-count, name-leak, mini-bar, and
structure-wrapper families are eliminated corpus-wide; the remaining mass
is dominated by the permission family (~58%: denied sentinels and the
read-rule universe) plus two freshly re-signatured structure buckets —
see `tools/corpus-failure-classes/failure-buckets.json`.

Remaining to publication: the three corpus families above, mod view
deepening (the compatibility report marks 29 of 33 mods declared-complete —
a declaration-level label, not a behavior claim; per-mod detail in
`tools/compat-report/mod-compat-report.md`, contract boundary in
`docs/decisions/0004-mods-compiled-into-the-view-registry.md`),
the PostgreSQL read rung, the one-command migration launch path, and the
publication hygiene pass (in progress: `tools/hygiene/`).
