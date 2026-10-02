# Port tracker

> Historical implementation tracker. For current architectural direction,
> four-category acceptance, first-class Ruby support, publication rules and
> work-item mapping, use the [Decko Core project index](core/README.md).
> Reconcile status claims below with current evidence; they do not establish
> complete migration or runtime compatibility.

Streams ran in waves of parallel work. Each wave: code + tests written in
their OWN directories only, verified with `npx vitest run` and
`npx tsc --noEmit` before landing; integration reviewed, committed, and
planned the next wave. Work streams never git-commit and never run npm
install (deps are preinstalled).

## Wave 1 (launched 2026-09-19)

| # | Stream | Owns | Status |
|---|---|---|---|
| 1 | Driver foundation | `src/server/driver.ts` extensions, `src/server/drivers/**`, `tests/server/drivers/**`, `docs/driver-notes.md` | LANDED: local-sqlite + D1 (miniflare-proven, v5/Windows fight solved) + libsql-http (real Hrana v2, transactional batch where provider allows); shared conformance suite passes on all four incl. @libsql/client cross-check; libsql-http batch is non-transactional by provider design (documented) |
| 2 | Ruby oracle harness | `tools/oracle/**`, `fixtures/captured/**`, `docs/oracle-harness.md` | LANDED: all 4 rungs; local SQLite decko app byte-stable (sha-verified); smoke + cql-basic fixtures captured. KEY FINDING: CQL `match` is MySQL/PG-only in Ruby (no SQLite oracle possible — needs a future MySQL rung); port gotchas in docs/oracle-harness.md (json~2.7 pin, tzinfo-data, RichText-named basic cardtype trap, slot-id SecureRandom normalization) |
| 3 | Card name algebra | `src/card/name.ts`, `src/card/name/**`, `tests/card/name/**`, `docs/name-port-notes.md` | LANDED: 243/243; real algebra is in cardname-0.20.0 gem (both layers collapsed into one immutable DeckoName); 595-case LIVE oracle battery (inflection 329 + succ 48 + algebra 218); found upstream bug (cardname _N/_L*R absolutization crashes on Ruby 3.3 — ported by intent); live-verified vs source-derived split documented. Defers set-pattern rule names (pattern registry) and name/all.rb Card layer |
| 4 | Schema + SQLite DDL | `db/**`, `src/server/schema.ts`, `docs/schema-notes.md` | LANDED: 12 core tables, DDL proven on better-sqlite3, 10/10 tests (coordinator-reviewed) |
| 5 | CQL parser | `src/cql/**`, `tests/cql/**`, `docs/cql-port-notes.md` | LANDED: 144/144, grounded in LIVE oracle (real gem sources loaded with stubs, ~60 statements of genuine .sql captured as test expectations). 13 fields + 11 modifiers + 20 relational attrs + 8 reference attrs + conjunctions supported; 7 deferred keys documented. Reconciliation seam: name->key inflection waits on name stream (ParseOptions.nameToKey). match->REGEXP needs driver UDF (SQLite) or FTS5/D1 decision (wave 3) |

## Wave 1.5 (launched 2026-09-19)

| # | Stream | Owns | Status |
|---|---|---|---|
| 6 | Card history/write path | `src/card/history/**`, `tests/card/history/**`, `docs/history-port-notes.md` | LANDED: ActWriter reproduces the full Ruby machinery (lazy act insert, zero-change creates with backfill at first update/delete, no-op saves persist nothing, delete=trash flip, subcard super_action_id, multi-card single-act, drafts); 44 own tests on real storage; 530/530 repo-wide at landing. FINDINGS: (a) our schema comments had field codes wrong (Ruby truth is 0-based: name=0, type_id=1, db_content=2...) — comment fix pending in db/schema.sqlite.sql + schema.ts; (b) card_revisions/current_revision_id have NO runtime writer since the 2014 migration (virtual) — port never writes them, test pins it |
| 7 | Oracle replay harness | `src/testing/**`, `tests/testing/**`, `docs/replay-harness.md` | LANDED: handler contract published (name-engine/cql-engine/render-engine register per-stream; PENDING never fails), slot-id normalization both sides (strict 20-hex), byte-diff with first-diff context, 61/61 own tests, `npm run replay`. Engine streams adopt the contract in their own test files. Deferrals: 11 card/rules-engine entries PENDING until wave 2+; smoke cql_search typed but not replayable (capture recorded no canonical query) |
| 8 | Benchmark corpus + metrics | `benchmarks/**`, `docs/benchmark-corpus-report.md` | LANDED: MONEY NUMBER measured — Ruby queries-per-render = depth+3, exactly linear (4@depth1, 19@depth16; warm cache 0; max_depth=20 cap with "Man, you're too deep" UserError the port must replicate). Corpus 207MB sanitized+verified (0 n-gram overlap, structural fidelity exact) — CAVEAT REFINED 2026-09-19: the "80% NULL names" is the RAW cards.name column truth (NULL for compound cards since the 2020 Lexicon migration — fetch stream confirmed), not a parser bug; the proven extract reconstructs names via junction walk. Corpus still needs Lexicon-style name reconstruction before R3 CQL-at-scale | — delivers the #1282 measurement promises: sanitized structure-preserving corpus from the 47k-card production dump (content-free, verified), Ruby queries-per-render depth curves (the N+1 proof), methodology mapping every published commitment to a measured artifact |

## Metrics program (#1282 commitments -> measurements)

- Byte-for-byte parity -> oracle fixtures (LANDED) + replay harness (stream 7)
- Response-time comparison on same decks -> stream 8, R2
- Recursion proof -> stream 8, R1: queries-per-render vs depth, Ruby vs TS (the issue's claim is CONSTANT queries regardless of depth, so the query COUNT is the primary metric, wall-clock secondary)
- Energy claim proxy -> stream 8, R4: CPU-ms per request, environment metadata mandatory per run
- One-click Cloudflare deploy -> measurable when the engine first deploys (wave 3+)
- CQL match parity -> needs a future MySQL oracle rung (SQLite oracle impossible; documented in oracle-harness.md)

## Milestones (2026-09-19, mapped to the #1282 promises)

DATA RULE: real SourceDeck content never leaves this workstation (not the VM, not Cloudflare, nowhere); sanitized structure-preserving artifacts (proven content-free) may go anywhere.

- **M1 — corpus-scale parity**: corpus v2 (Lexicon-reconstructed names/keys) loaded into a Ruby oracle deck; capture rendered views + CQL result sets for the FULL 47,235-card payload (resumable); replay through the TS engine via the harness — full-payload byte-parity is the claim, not smoke fixtures.
- **M2 — one-click Cloudflare demo (the core deliverable)**: ✅ **SHIPPED 2026-09-20.** wrangler config + D1 migrations + seed path on a PUBLIC repo with a working Deploy-to-Cloudflare button. Note: button requires a public repo — repo placement is a project decision. Artifact: `worker.ts` + `wrangler.toml` + `db/seed.sql` + 12 worker tests + README button. The actual `wrangler deploy` needs Cloudflare account access.
- **M3 — published metrics (AMENDED per Julian 2026-09-19)**: final numbers = the LIVE source-deck.example deployment (Ethan's VM, not ours) vs an ACTUAL Cloudflare deployment, per #1282. Local + juc-vm numbers are intermediate/engineering artifacts. Live-site measurement is read-only, rate-limited, normal-page-load traffic — heavy/borderline-abusive load testing happens locally only — and Ethan gets a heads-up via Julian before we measure his server.
- **M4 — one-click MIGRATION (REFINED per Julian 2026-09-19)**: any Ruby-hosted deck can become a Cloudflare-hosted decko-ts in the same one-click flow — same data, new runtime underneath, no editorial transforms. The proven SourceDeck importer generalizes into this path; the site owner's public/private sorting is a SUPERSET use case layered on top (his adds review decisions; the base migration is data-faithful).

## Wave 2 (launched 2026-09-19)

| # | Stream | Owns | Status |
|---|---|---|---|
| 9 | Set-pattern registry | `src/card/set-patterns.ts`, `src/card/set-patterns/**`, `tests/card/set-patterns/**`, `docs/set-patterns-port-notes.md` | LANDED + ACKNOWLEDGED 2026-09-20: full registry ported in lookup-order precedence (not file order — Ruby register() front-inserts, so core patterns are REVERSE of file load order), live-oracle-verified. 11 own tests. Rule-name algebra in `rule-names.ts`. Sets up the rule-evaluation stream that follows. |
| 10 | Card fetch/cache layer | `src/card/fetch.ts`, `src/card/fetch/**`, `tests/card/fetch/**`, `docs/fetch-port-notes.md` | LANDED: 71 own tests, 684/684 repo-wide, tsc clean; KEY FINDING: all fetched attributes compose from the cards table ALONE (acts/actions/changes = history only); compound names via Lexicon (raw columns NULL post-2020); two-level cache (Temporary per-request + Shared stamp-prefixed), event-driven invalidation, no TTL; FIRST BYTE-EXACT PARITY: card-engine handler replays all 10 smoke card records byte-exact vs Ruby |
| 11 | Renderer with batched inclusion prefetch | `src/card/render.ts`, `src/card/render/**`, `tests/card/render/**`, `docs/render-fix-notes.md` | LANDED 2026-09-20 (had been orphaned from rate-limit kill): format.ts + views.ts + prefetch.ts + nest-syntax.ts + set-keys.ts + slot-html.ts. 18 own tests including depth-sweep 1..32 that proves the #1282 constant-queries-per-render claim. Warm-cache re-render = zero queries. |

## Wave 3 (planning — the rule-application + mod-loading layer)

| # | Stream | Owns | Status | Why it matters |
|---|---|---|---|---|
| 12 | Rule evaluation engine | `src/card/rules/**`, `tests/card/rules/**`, `docs/rules-port-notes.md` | **LANDED 2026-09-20**: lookup.ts + apply.ts + index.ts + 21 tests. Names already in rule-names.ts; this stream added the storage walk (findRule / findRules) and the JSON rule-application layer (parseViewOverride / applyViewOverride / resolveViewOverride). JSON-encoded rules in db_content — HAML/Ruby round-trip is deferred to a v2 stream. Render-side hook (RenderEngine.renderView integration) deliberately left as a follower stream so the engine stays a library. | The rule stream walks the set-module inheritance chain, fetches rule cards by name, applies view overrides per card — per-type/per-set customization on top of the html-format views. |
| 13 | Mod loading | `src/card/mod-loader.ts`, `src/card/mod-loader/**`, `tests/card/mod-loader/**`, `docs/mod-loader-port-notes.md` | **LANDED 2026-09-21**: loader mechanism (load order = Bundler closure, set-pattern front-insert, view override/config semantics; card-mod-help proven end-to-end vs a live capture) plus per-mod ports under `src/card/mod-loader/mods/`; evidence `tests/card/mod-loader/`, `docs/mod-loader-port-notes.md`. | File scanner that walks a mods directory and registers patterns/rules/views per mod. The 33 installed card-mods (card-mod-account, card-mod-bootstrap, card-mod-format, etc.) are the port targets; the loader is the registration mechanism, each mod its own port. |
| 14 | Migration tool | `tools/migrate/**`, `tests/tools/migrate/**`, `docs/migration-tool-notes.md` | **LANDED**: the generalized dump importer (Ruby dump → decko-ts) is in `tools/migrate/`, proven on a production dump; the one-click generalization is tracked in `docs/one-click-cf-deploy-inventory.md`. | Same data, new runtime underneath, no editorial transforms. The base migration is data-faithful; the site owner's public/private sorting is a SUPERSET use case layered on top. |

## Concurrency gate (2026-09-19)

`scripts/check-scoped.mjs` — the shared-repo typecheck/test gate for parallel
streams. tsc is a whole-program checker, so in-flight files cannot be skipped,
only their findings suppressed. Two suppression rules: mtime quiet window
(default 30 s, `--quiet-ms`) for active edit bursts, and `--running <dirs>`
for known-running streams' directories (covers think-pauses between bursts).
`--strict` suppresses nothing and is the integration landing gate. Future
agent prompts use `node scripts/check-scoped.mjs --running <other streams' dirs>`
in place of bare `npx tsc --noEmit`.

## Wave 2+ backlog (planned when wave 1 lands)

- Card fetch/cache layer over the driver (card, card_actions, card_changes,
  card_acts, card_revisions reads/writes).
- Sets, rules, permission resolution (the read_rule machinery the
  SourceDeck migration already mapped from the data side).
- Renderer with batched inclusion prefetch (the scaling fix from #1282:
  constant queries per page render regardless of depth).
- View/format layer parity (:open, :closed, :content, :title...).
- Mod loading + mod compatibility report (feeds the migration tool).
- Migration tool: Ruby dump -> decko-ts import (generalize the proven
  SourceDeck importer).
- Response-time comparison harness (deep-nesting fixtures, Ruby vs TS).
- Mod porting begins (the 33 installed card-mods, priority by the site owner's
  stack: account, bootstrap, ...).

## Definition of done (per stream)

1. `npx tsc --noEmit` clean. 2. `npx vitest run` green. 3. Behavior
grounded in the Ruby source or captured fixtures, with the grounding cited
in the stream's notes doc. 4. Coordinator-reviewed diff committed.


## Status as of 2026-09-20 (reconciled against the on-disk tree)

Walked the landed code directly rather than trusting in-flight status reports. Actual state:

- **Renderer (#11):** **LANDED** — `src/card/render/` ships format.ts, views.ts, prefetch.ts, nest-syntax.ts, set-keys.ts, slot-html.ts. 18 own tests including the depth-sweep (1..32) that proves the #1282 constant-queries claim.
- **View/format parity (#13):** **LANDED** as part of the renderer — :open, :closed, :content, :title, :titled, :menu, :core, :card_list, :bar variants all in `views.ts` with HAML byte-shape parity.
- **Set-patterns (#9):** **LANDED** + acknowledged in port infra. Full registry + instance + rule-name algebra. 11 own tests.
- **M2 — one-click Cloudflare demo:** **SHIPPED.** `worker.ts` + `wrangler.toml` + `db/seed.sql` + 12 worker tests + Deploy-to-Cloudflare button in README. The deploy itself is one `wrangler deploy` away (gated on Cloudflare account scope, not on missing code).
- **Test count:** per-stream totals in this file are historical landing-time counts, not a current measure. The standing verification surface is `tests/standing-net.json` (run via `node tools/test-queue/run-standing-net.mjs`); the README carries the current generated total with its command and date.

### Remaining gap to publication

With the rule-application engine and mod loading landed, the remaining gap
to publication is tracked in the README migration status: the corpus failure
families, mod view deepening, the PostgreSQL read rung, the one-command
migration path, and the publication hygiene rounds.
| Migration tool | NOT STARTED | Generalize the proven SourceDeck importer (Ruby dump → decko-ts) into a reusable one-shot path. |
| Response-time harness (Ruby vs TS) | NOT STARTED | Deep-nesting fixtures, measure both runtimes end-to-end. |

These are the streams M3 (published metrics) and M4 (one-click migration) depend on. The HTML render side and the data layer are both ready — what's missing is the metaprogramming layer that Ruby Decko's mod system gets for free from `module Card::Set::Pattern::Base` chains.
