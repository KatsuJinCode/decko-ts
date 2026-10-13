# Coverage inventory — what the public package measures, and what it does not

Every parity figure this repository quotes names an instrument and a scope.
This document is the single place that says, for each of the four parity
domains, what is actually measured, where the evidence lives, and what is
**not** measured by anything committed here. When a claim about this engine's
compatibility is quoted anywhere, it should be checkable against this page.

The method behind the instruments is in [parity-method.md](parity-method.md).
The mod-compatibility boundary is its own decision record
([decisions/0004](decisions/0004-mods-compiled-into-the-view-registry.md)).

---

## The four domains, and what is measured in each

| Domain | What parity means | Measured by (public package) | Headline figure |
| --- | --- | --- | --- |
| Rendering | HTML/format output byte-identical to Ruby's | Reference-harness render ops; miniature smoke fixture; corpus replay | 1,754 / 1,754 renders byte-identical, `synthetic-v1` reference-harness grade. The with-mods corpus replay measured 167,674 / 180,442 views byte-identical (92.9%) on 2026-09-23, on an earlier revision of the engine |
| Semantics | Names, keys, types, sets, rules, permissions, CQL answer as Ruby answers | Reference-harness semantics ops; CQL batteries in `fixtures/captured/` | 2,389 semantics comparisons, `synthetic-v1` fixture — the fixture's `ops/semantics.jsonl` holds **2,388** lines, plus the 1 scenario step whose op is `ask`, which the grader also grades as semantics (`reference-harness/runner/grade-lib.mjs:197`). See "Why two counts of the same fixture" below |
| Persistence | The rows a write leaves behind match Ruby's, table by table | Reference-harness scenario steps (raw row deltas); the 70-step write probe on `write-battery-v1` | 16 write steps, one raw row-delta comparison each; the write probe: **65 of 70** operations' row deltas match Ruby's byte for byte on the committed `write-battery-v1` synthetic deck, and the remaining **5 are declared deliberate differences** — 65 + 5 = 70, with **0 unexpected** |
| Side effects | Saved/refused verdicts, errors, mail, sign-in identity match Ruby's | Reference-harness write and sign-in step answers; captured mail; the 90-step scenario battery on `write-battery-v1` | 19 comparisons: 16 write answers + 3 sign-in answers; the scenario battery: 49 of 90 steps match on the committed `write-battery-v1` synthetic deck (4 declared, 37 mismatched: 36 under the declared account-holder security divergence, `docs/SECURITY.md` divergence 5, and 1 under a separate closure-mail difference still under investigation; see `tests/tools/side-effects-scenario-battery.test.ts`, whose header records the same 36/1 split) |

The standing test net (`tests/standing-net.json`, 68 manifest files) run
2026-10-01: 696 passed, 4 expected fail, 12 skipped (712). That net is
regression protection, not a parity measurement; the parity figures are the
ones above.

### The public batteries, accounted

Two batteries carry the deepest evidence a clean clone can run. Each accounts
for every step it runs: match, or a declared difference, or nothing.

**Where each battery's bytes live matters to whether you can run it.** The
reference-harness fixture is in the public package. The two probe batteries run
on `reference-harness/fixtures/write-battery-v1`, also in the public package.
Anything reading `fixtures/captured/` is **not** — that directory is on the
exclusion list, so the CQL batteries and the smoke fixture named below are
private-repository material, and their suites are excluded alongside them.

### Why two counts of the same fixture

`synthetic-v1` is described twice in this repository, and both numbers are
right — they count different things, and the difference is exactly one step of
each kind:

| Figure | What it counts | Where it comes from |
| --- | --- | --- |
| **2,388** semantics operations, **1,752** render operations | the fixture's op files | `wc -l reference-harness/fixtures/synthetic-v1/ops/semantics.jsonl` and `ops/render.jsonl` |
| **2,389** semantics comparisons, **1,754** renders | what the grader grades | the same ops, **plus** the scenario steps whose op is `ask` (1) and `render` (2), which `grade-lib.mjs:196-197` grades into the semantics and rendering tallies |

So the harness grade is 1,754 / 1,754 and 2,389 / 2,389; the op files hold
1,752 and 2,388. Cite the figure that names its instrument. The counting rule
is asserted by the suite itself (`reference-harness/runner/test/normalize.test.mjs:161-165`).

| Battery | Where | Steps | Accounted as |
| --- | --- | ---: | --- |
| Reference-harness scenarios | `reference-harness/fixtures/synthetic-v1` | 22 | 16 write steps' row deltas (persistence 16/16) + 19 step answers (side effects 19/19: 16 write answers, 3 sign-in answers); the 2 renders and 1 question among them grade as rendering and semantics, reads write only what the oracle's reads wrote (read writes 8/8, other tables 12/12) |
| The 70-step write probe | `tests/tools/persist-write-probe.test.ts` on `write-battery-v1` | 70 | 65 identical row deltas + 5 declared deliberate differences = 70 |
| The 90-step scenario battery | `tests/tools/side-effects-scenario-battery.test.ts` on `write-battery-v1` | 90 | 49 match + 4 declared + 37 mismatched (36 under the declared account-holder security divergence, `docs/SECURITY.md` 5; 1 under a separate closure-mail difference under investigation) = 90 |

Every step of all three is pinned: a change in any of them fails the suite
that runs it. The production-deck runs of the same two batteries remain the
deeper, non-public evidence — see Persistence below and What the public
package does NOT measure, item 6.

---

## Where each measurement lives

### Rendering

- **Corpus replay** (private corpus, not committed): the full-deck capture —
  every card record and every recorded view compared byte for byte. The
  2026-09-23 with-mods run measured 167,674 of 180,442 captured views
  byte-identical (92.9%). **That figure is not a pure Ruby-oracle grade**: 50
  of its expected entries are bytes fetched from the live 0.19.1-era site,
  not the 0.20.0 oracle — two disjoint swap sets of 13 and 37, entry keys
  checked distinct, per-entry manifests in the private repository). Method, the
  full breakdown and the failure families: [parity-method.md](parity-method.md),
  `tools/corpus-failure-classes/`.
- **Miniature fixture** (private repository; `fixtures/captured/` is excluded
  from the public package): `fixtures/captured/smoke.json` — a small seeded
  deck with four rendered views per card. Its consuming suites are excluded
  with it, so a clean clone does not replay this one.
- **Reference harness** (committed): `reference-harness/fixtures/synthetic-v1/`
  — 1,752 render operations in the fixture's op file, graded as 1,754
  comparisons once the 2 scenario render steps are included (see "Why two
  counts of the same fixture" above), against one built synthetic deck, with
  the Ruby oracle's answers committed under `expected/`. Grading needs Node and
  the engine, not Ruby ([../reference-harness/SPEC.md](../reference-harness/SPEC.md)).

### Semantics

- **Reference harness**: 2,388 semantics operations in the fixture's op file
  on the same `synthetic-v1` deck — card identity, set membership, rule
  lookup, permission verdicts, search results, name algebra — each compared
  against the committed oracle answer. The grade reports 2,389 comparisons
  because the 1 scenario `ask` step is graded as semantics too (see "Why two
  counts of the same fixture" above).
- **CQL batteries** (private repository; `fixtures/captured/` is excluded
  from the public package): `fixtures/captured/cql-basic.json` (11
  canonical query shapes) and `fixtures/captured/cql-mysql-match.json` (the
  `match` battery, 30 queries, captured against a MySQL-protocol server —
  see [decisions/0005](decisions/0005-cql-match-semantics.md)).

### Persistence

- **Reference harness scenarios**: `synthetic-v1`'s `ops/scenarios.json` holds
  16 scenarios of 22 steps — 16 writes, 3 sign-ins, 1 question, 2 renders.
  Every write step's raw row delta (ids and timestamps as stored, across
  `cards`, `card_acts`, `card_actions`, `card_changes`, `card_references`,
  `card_virtuals`) is compared against Ruby's: **16 persistence comparisons**.
  Read steps must additionally leave exactly the rows Ruby's reads left.
- **The 70-step write probe** (committed):
  `tests/tools/persist-write-probe.test.ts` runs the full 70-operation list
  against the committed synthetic `write-battery-v1` deck
  (`reference-harness/fixtures/write-battery-v1`) and compares every
  operation's row delta with the Ruby oracle dumps recorded on that same
  deck: **65 of 70 match byte for byte and 5 are declared deliberate
  differences, 0 unexpected.** The five, as declared in
  `reference-harness/fixtures/write-battery-v1/expected/persist-steps/deliberate-differences.json`:
  steps **20, 22, 31** are the stored-HTML security choice (`docs/SECURITY.md`
  divergence 1 — the port's cleaner stores something different where Ruby's
  would be acted on by a browser; the difference itself is withheld), and steps
  **7** and **67** are two upstream Ruby defects (a trashed
  junction revived before its part id resolves, which only inserts on the
  oracle deck's missing `UNIQUE (left_id, right_id)` index; and a revert of a
  rename that stores rows and then raises). Password storage is **not** among
  the five: on this synthetic deck the probe defaults to
  `DECKO_PASSWORD_HASH=legacy-sha1` (the deck is Ruby-built with salted SHA-1
  digests), so steps 57 and 58 match exactly. It runs from a clean checkout; no
  Ruby, no private deck.
- **The 90-step scenario battery** (recording committed; the clean-deck
  divergence declared): `tests/tools/side-effects-scenario-battery.test.ts`
  drives the TypeScript engine through the same 90
  HTTP-shaped steps the production-deck measurement drove
  (`tools/parity-side-effects/`), from the committed
  `reference-harness/fixtures/write-battery-v1` deck, and compares every
  step's verdict against the Ruby trace recorded on that deck
  (`expected/side-effects-ruby.json`). On this clean synthetic deck the
  verdicts differ at 37 of 90 steps (49 pass, 4 declared, 37 mismatched),
  36 of them traceable to one root cause, now a declared security
  divergence (`docs/SECURITY.md`, divergence 5). That entry names what this
  engine refuses and withholds what Ruby does instead.
  On the production deck that difference never surfaced, because a second
  Ruby flaw (the one of the three named under "Reporting a vulnerability"
  above) intervenes there — one of the 7 production pins declares it, and it
  does not reproduce on a clean deck, so three of the seven production pins
  do not transfer. The divergence is declared, not adjusted away; the exact
  verdicts stay pinned step by step, and the production-deck figures remain
  the measured 83 + 7 of 90.
- **The pod import/export round-trips remain private**:
  `tests/tools/pod-round-trip.test.ts` and `tests/tools/pod-features.test.ts`
  skip unless `PODS_SRC_DECK` / `PODS_BASE_DECK` name a private oracle deck.
  They announce their skip loudly; none of their results are in the public
  package. The production-deck runs of the two batteries above (a copy of a
  49,829-card deck, its dumps under `tests/fixtures/persistence-oracle/`)
  remain the deeper, non-public evidence.

### Side effects

- **Reference harness**: every write step's answer (saved or refused, the
  error messages, the mail the write sent, the resulting card) and every
  sign-in's answer (signed in or not, the actor afterwards) is compared
  against Ruby's: **19 side-effect comparisons** (16 write answers + 3
  sign-in answers). The counts are recountable from
  `reference-harness/fixtures/synthetic-v1/ops/scenarios.json`.
- Captured notification mail and permission-denial bytes are also exercised
  by their own suites (see [parity-method.md](parity-method.md), "Side
  effects" layer).

---

## What the public package does NOT measure

Stated plainly, with where the gap closes when it closes:

1. **Browser journeys.** The machinery is committed
   (`reference-harness/browser/`) and 51 journeys are defined as data
   (`reference-harness/browser/journeys/synthetic-v1.json`), but no journey
   comparison run is committed. What a browser session sees — editors, uploads,
   follow flows — is unproven in the public package.
2. **The default PBKDF2 password path, in the harness grade.** The public
   fixture's TS adapter pins `DECKO_PASSWORD_HASH=legacy-sha1`
   (`reference-harness/adapters/ts/adapter.ts`), because the fixture deck is
   Ruby-built with Ruby's salted SHA-1 digests; the graded sign-ins therefore
   never exercise PBKDF2 storage or the upgrade-on-sign-in write. That path
   is covered by unit tests (`tests/card/auth/password-hash.test.ts`,
   `tests/card/auth/signin.test.ts`), not by the harness grade.
3. **Hosted D1 / Bunny write semantics.** The transaction and atomic-save
   suites ran against workerd's local D1 under Miniflare and a Hrana v2 test
   server backed by real SQLite — never against hosted D1, sqld, Turso or
   Bunny ([decisions/0007](decisions/0007-atomic-saves-and-transaction-contract.md):
   "Nothing here was run against a hosted service"). No committed evidence
   describes a production write on any host. Writes on D1 are presented
   accordingly, as evaluation/single-user grade rather than a supported
   multiuser deployment: until the intermediate-visibility window 0007
   documents is closed, a multiuser D1 deployment keeps writes disabled or
   accepts that a failed save is briefly visible mid-save.
4. **Arbitrary mods.** Existing Ruby mods are not executed — the site's own
   mods are hand-ported, and the compatibility report's labels are
   declaration-level
   ([decisions/0004](decisions/0004-mods-compiled-into-the-view-registry.md),
   `tools/compat-report/mod-compat-report.md`). A mod view beyond the handful
   the byte-pins render is unproven against Ruby's bytes.
5. **Jobs.** The delayed-job backend is legacy-labeled and unported (the
   compatibility report marks `card-mod-delayed_job` ignored). No background
   job behavior is measured.
6. **Anything a skipped probe would have covered** (see Persistence above):
   pod round-trips and the production-deck runs of the write batteries on the
   real oracle deck. The 70-step write sequence is now public, on the
   committed `write-battery-v1` synthetic deck; the 90-step scenario battery
   is recorded on that deck with its account-holder divergence declared
   (above). What remains
   non-public is the same measurement on a copy of the 49,829-card
   production deck.

---

## What changed from the original proposal

The proposal upstream ([decko-commons/decko#1282](https://github.com/decko-commons/decko/issues/1282))
promised five things that later measurement moved. Each is listed here with
the section of this page that says where the promise actually stands, so a
claim quoted anywhere can be checked against the instrument behind it.

| The proposal promised | What stands here | Check it in |
| --- | --- | --- |
| Hosting is effectively free ("$0 on Cloudflare's free tier") | Withdrawn as a total-cost claim. This repository holds **no cost measurements** — the Bunny deploy document says so in terms — and the page-view cost model built alongside it prices anonymous read-only views from a private deployment with provider prices read on a stated date. Cloudflare's free plan does not fit a real deck. | [deploy-bunny.md](deploy-bunny.md); [deploy-cloudflare.md](deploy-cloudflare.md) |
| A constant number of queries regardless of depth | **Not met.** The measured law is four fixed round trips plus one per nesting level below the root, however many cards each level holds — breadth is free, depth is not. Reproduced by `tests/card/render/deep-nesting-trip-attribution.test.ts` and asserted at every depth by `tests/card/render/depth-sweep.test.ts`. | [scaling-comparison-deep-nesting.md](scaling-comparison-deep-nesting.md) |
| Same data, no migration required | **Withdrawn.** Import reads a SQLite deck file, a `mysqldump` text dump or deck-INSERT SQL. PostgreSQL is unsupported — no adapter or dialect translator exists in the tree. While Ruby still serves the deck this engine must store Ruby's own password digest, because Ruby cannot verify PBKDF2; D1's transaction semantics differ from Ruby's and SQLite's. | `tools/migrate/IMPORT_DECK_RECIPE.md`; [SECURITY.md](SECURITY.md) "Migration compatibility at a glance"; [decisions/0007](decisions/0007-atomic-saves-and-transaction-contract.md) |
| Faster responses at the edge | **Not established.** No speed run is recorded against a release candidate, and no response-time comparison is committed evidence anywhere in this repository. The published, reproducible comparison is round trips per render. | [scaling-comparison-deep-nesting.md](scaling-comparison-deep-nesting.md) |
| One click provisions everything | **Not verified.** The button deploys one Worker and one D1 database, applies the migrations and ships a read-only four-card demo: every card write answers `403`, and `POST /update/*signin` is the one verb that still dispatches while the write path is unset, because a session row is not a card write. No KV, no R2, no queues, no secrets in `wrangler.toml` — the only binding the Worker reads is the D1 one, and the two `[vars]` flags are plain non-secret values the button leaves unset. | [deploy-cloudflare.md](deploy-cloudflare.md); README, "Deploy to Cloudflare" |

Two further promises are covered by the sections above rather than by an
instrument: the mod story is the compatibility report's declaration-level
labels plus the byte-pins (item 4 above), and "exact output parity" is the
grade of record at the top of this page, with what it leaves out stated in
the same table.

---

## Reproducing the public measurements

```bash
npx vitest run tests/testing                  # replay machinery
npm run replay                                # oracle replay over committed fixtures
node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ts/adapter.json \
     --fixture reference-harness/fixtures/synthetic-v1 --out <resultsDir>
node reference-harness/runner/grade.mjs --fixture reference-harness/fixtures/synthetic-v1 \
     --actual <resultsDir>
```

The corpus replay needs the private corpus and is a proof run, not a
development loop; the reference-harness grade needs only Node and the engine.
The skipped probes print what to set to run them.
