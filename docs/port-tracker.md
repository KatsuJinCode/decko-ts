# Port tracker

Streams run in waves of parallel agents. Each wave: agents write code +
tests in their OWN directories only, run `npx vitest run` and
`npx tsc --noEmit`, and report. The coordinator reviews, commits, and
plans the next wave. Agents never git-commit and never run npm install
(deps are preinstalled).

## Wave 1 (launched 2026-09-19)

| # | Stream | Owns | Status |
|---|---|---|---|
| 1 | Driver foundation | `src/server/driver.ts` extensions, `src/server/drivers/**`, `tests/server/drivers/**`, `docs/driver-notes.md` | running |
| 2 | Ruby oracle harness | `tools/oracle/**`, `fixtures/captured/**`, `docs/oracle-harness.md` | LANDED: all 4 rungs; local SQLite decko app byte-stable (sha-verified); smoke + cql-basic fixtures captured. KEY FINDING: CQL `match` is MySQL/PG-only in Ruby (no SQLite oracle possible — needs a future MySQL rung); port gotchas in docs/oracle-harness.md (json~2.7 pin, tzinfo-data, RichText-named basic cardtype trap, slot-id SecureRandom normalization) |
| 3 | Card name algebra | `src/card/name.ts`, `src/card/name/**`, `tests/card/name/**`, `docs/name-port-notes.md` | running |
| 4 | Schema + SQLite DDL | `db/**`, `src/server/schema.ts`, `docs/schema-notes.md` | LANDED: 12 core tables, DDL proven on better-sqlite3, 10/10 tests (coordinator-reviewed) |
| 5 | CQL parser | `src/cql/**`, `tests/cql/**`, `docs/cql-port-notes.md` | running |

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
