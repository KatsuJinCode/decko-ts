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
