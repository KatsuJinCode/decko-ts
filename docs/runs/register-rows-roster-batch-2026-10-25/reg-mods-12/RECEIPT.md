# reg-mods-12

- The pinned Ruby gem: `card-mod-defaults-0.20.0` (the pinned gem tree
  `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`).
- The row's own label: `card-mod-defaults (PARTIAL)`.
- The port side: `src/card/auth/boot-seed.ts` (the seed layer) and
  `src/card/mod-loader/default-mod-deck.ts` (the mod deck).
- The declaration census at this tree: the gem is a LIB-ONLY gem (it
  declares no set file, no view name and no event name), so the census
  reads 0 of 0, 0 of 0 and 0 of 0, with nothing left open.

## Verdict: WORKING ON IT

The port seeds a DIFFERENT corpus from the one Ruby seeds, and the
divergence is a named skip whose reason is an operator product decision.
Ruby seeds `Cardio.config.seed_mods[0]`
(`card-1.110.0 lib/cardio/seed.rb:8-9`, `:62`), and
`card-mod-defaults-0.20.0 lib/card/mod/defaults.rb:1` unshifts
`:defaults`, so index 0 is the defaults gem's 604-card corpus. The port's
layer A transcribes mod/core's ELEVEN-row corpus, the index-1 one
(`src/card/auth/boot-seed.ts:35-58`), and the port names the choice as
data (`src/card/auth/seed-source.ts`: `PORT_SEED_SOURCE` against
`RUBY_SEED_SOURCE`) and the corpus it does not land as a skip
(`SKIPPED_CORPUS`). Measured here: a port-fresh deck holds 59 cards where a
Ruby-fresh deck holds 604.

## Close (port/regfix-1-20261025, 2026-10-25)

The row closed: the port's fresh-deck seed matches Ruby's defaults corpus,
card for card.

- The corpus is LANDED. `tools/oracle/defaults-seed-corpus.rb` generated
  `src/card/auth/defaults-seed-corpus.ts` from the pinned gem's
  `card-mod-defaults-0.20.0/data/fixtures/real/*.yml`: 604 cards plus the
  corpus's own rows (599 card_actions, 1 card_act, 0 card_changes, 519
  card_references - Cardio::Seed::TABLES, seed.rb:4-5). The two Ruby
  migration ledgers (schema_migrations, transform_migrations) are named
  out: their rows record the RUBY schema's applied versions, and the
  port's schema keeps its own ledger - seeding them would mark the port's
  migrations applied without running them.
- `PORT_SEED_SOURCE.index` is 0 (seed-source.ts) and boot-seed.ts's layer
  A inserts the corpus directly (INSERT OR IGNORE, seed.rb:20-22's
  FixtureSet.create_fixtures semantics), verbatim values including the
  fixture's own stamps. `SKIPPED_CORPUS` became `LANDED_DEFAULTS_CORPUS`,
  carrying the record the skip carried.
- The ensure layers (B/C) stand down on this arm: Ruby's fresh-deck path
  is db:setup and runs no eat over the seed (the eat machinery is `card
  update`, card.rake:22, operator-driven). The dump also carries
  historical key forms a computed key does not always match (the Anonymous
  row's stored key is `anonymous` where singularize answers `anonymou`),
  so an ensure create over the corpus would DUPLICATE rows, not repair
  them. On the index-1 arm (the CARD_UPDATE_SEED side) the layers stay
  live, that corpus genuinely lacks the account system.
- Measured at the close (the rewritten instrument):
  `defaultsRowsInserted {cards: 604, actions: 599, acts: 1, changes: 0,
  references: 519}`; the deck's cards table holds EXACTLY 604 rows and
  every row (id, name, key, codename, sides, stamps, creator/updater,
  read_rule pair, trash, type, db_content) equals the corpus's row; the
  ensure layers created and updated nothing; the boot contract holds on
  the corpus rows (Decko Bot/Anonymous actors resolve,
  resolveAccountCodenameIds answers).

The battery at the close commit: `tsc --noEmit` clean; the pin sheet and
both row-12 instruments green (the instrument file carries the battery
line in the lane's report).

## How this row was measured

- The row's declaration census: `tools/audit-mod-declaration-coverage.mjs`
  against the pinned gem tree.
- The row's fixture, built from that census:
  `tests/card/mod-loader/fixtures/roster-batch-20261025/register-row-12-card-mod-defaults-oracle-surface.json`.
- The pin block, which reads the PORT side live:
  `tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts`
  (row 12's block).
- The named instrument that measures both sides of the divergence:
  `tests/card/auth/register-row-12-boot-seed-fresh-deck-card-count.test.ts`.

The battery at this commit:

    ./node_modules/.bin/vitest run tests/card/auth/register-row-12-boot-seed-fresh-deck-card-count.test.ts tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts
      2 files passed, 11 tests passed.

Branch: `port/roster-batch-20261025` in KatsuJinCode/decko-ts, from the
roll tip `deploy/full-candidate-20261029` at `c9ab5b33`.
