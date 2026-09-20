# Port tracker

Streams run in waves of parallel agents. Each wave: agents write code +
tests in their OWN directories only, run `npx vitest run` and
`npx tsc --noEmit`, and report. The coordinator reviews, commits, and
plans the next wave. Agents never git-commit and never run npm install
(deps are preinstalled).

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

## Wave 2 (launched 2026-09-19)

| # | Stream | Owns | Status |
|---|---|---|---|
| 9 | Set-pattern registry | `src/card/set-patterns.ts`, `src/card/set-patterns/**`, `tests/card/set-patterns/**`, `docs/set-patterns-port-notes.md` | running — first piece of the rules engine; uses the new scoped check gate |
| 10 | Card fetch/cache layer | `src/card/fetch.ts`, `src/card/fetch/**`, `tests/card/fetch/**`, `docs/fetch-port-notes.md` | LANDED: 71 own tests, 684/684 repo-wide, tsc clean; KEY FINDING: all fetched attributes compose from the cards table ALONE (acts/actions/changes = history only); compound names via Lexicon (raw columns NULL post-2020); two-level cache (Temporary per-request + Shared stamp-prefixed), event-driven invalidation, no TTL; FIRST BYTE-EXACT PARITY: card-engine handler replays all 10 smoke card records byte-exact vs Ruby |

## Concurrency gate (2026-09-19)

`scripts/check-scoped.mjs` — the shared-repo typecheck/test gate for parallel
streams. tsc is a whole-program checker, so in-flight files cannot be skipped,
only their findings suppressed. Two suppression rules: mtime quiet window
(default 30 s, `--quiet-ms`) for active edit bursts, and `--running <dirs>`
for known-running streams' directories (covers think-pauses between bursts).
`--strict` suppresses nothing and is the coordinator's landing gate. Future
agent prompts use `node scripts/check-scoped.mjs --running <other streams' dirs>`
in place of bare `npx tsc --noEmit`.

## Wave 2+ backlog (planned when wave 1 lands)

- Card fetch/cache layer over the driver (card, card_actions, card_changes,
  card_acts, card_revisions reads/writes).
- Sets, rules, permission resolution (the read_rule machinery the
  Culturesmith migration already mapped from the data side).
- Renderer with batched inclusion prefetch (the scaling fix from #1282:
  constant queries per page render regardless of depth).
- View/format layer parity (:open, :closed, :content, :title...).
- Mod loading + mod compatibility report (feeds the migration tool).
- Migration tool: Ruby dump -> decko-ts import (generalize the proven
  Culturesmith importer).
- Response-time comparison harness (deep-nesting fixtures, Ruby vs TS).
- Mod porting begins (the 33 installed card-mods, priority by Brandon's
  stack: account, bootstrap, ...).

## Definition of done (per stream)

1. `npx tsc --noEmit` clean. 2. `npx vitest run` green. 3. Behavior
grounded in the Ruby source or captured fixtures, with the grounding cited
in the stream's notes doc. 4. Coordinator-reviewed diff committed.
