# reg-mods-33

- The pinned Ruby gem: `card-mod-virtual-0.20.0` (the pinned gem tree
  `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`).
- The row's own label: `card-mod-virtual (PARTIAL)`.
- The port file: `src/card/mod-loader/mods/card-mod-virtual.ts`.
- The declaration census at this tree: 1 gem set file, 0 gem view names
  and 2 gem event names, every set file and every event name registered
  port-side, with nothing left open. The row's gap is a BEHAVIOUR gap,
  not a registration gap.

## Verdict: WORKING ON IT

The virtual card's save writes the cards row where Ruby writes none, and
three mechanisms stand in the way.

1. The registered bodies are no-op stubs: the port's write path has no
   virtual?-set diversion, so wiring the body alone would run
   `Virtual.save` AND the row write, a corruption Ruby never produces
   (`src/card/mod-loader/mods/card-mod-virtual.ts:521-542`).
2. The mod's own body RETURNS Ruby's abort marker instead of throwing the
   port's abort, and the event dispatch discards an event body's return
   value, so the port's abort (the `ModEventAbortSuccess` throw,
   `src/card/actions/types.ts:104-110`, which the save entry catches as a
   no-write success, `src/card/actions/card-action-engine.ts:3566`) is the
   only thing that can unwind a save
   (`src/card/mod-loader/mods/card-mod-virtual.ts:452-465`,
   `src/card/mod-loader/mod-event-dispatch.ts:870`).
3. The events cannot even fire: the port's set chain for the virtual card
   (the asset_input right card, `card-mod-assets set/right/asset_input.rb:1`
   `include_set Abstract::VirtualCache`) carries no virtual_cache module,
   and the generated include graph names no includer of
   `Abstract::VirtualCache` (`src/card/mod-loader/set-include-graph.ts`).

Ruby (`card-mod-virtual-0.20.0 set/abstract/virtual_cache.rb:21-29`) runs
`Virtual.save self` and then `abort :success`, which unwinds the save, so
the content lives in the card_virtuals row and nothing else.

## How this row was measured

- The row's declaration census: `tools/audit-mod-declaration-coverage.mjs`
  against the pinned gem tree.
- The row's fixture, built from that census:
  `tests/card/mod-loader/fixtures/roster-batch-20261025/register-row-33-card-mod-virtual-oracle-surface.json`.
- The pin block, which reads the PORT side live:
  `tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts`
  (row 33's block).
- The named instrument that pins the three mechanisms:
  `tests/card/mod-loader/register-row-33-card-mod-virtual-abort-marker.test.ts`.

The battery at this commit:

    ./node_modules/.bin/vitest run tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts tests/card/mod-loader/register-row-33-card-mod-virtual-abort-marker.test.ts
      2 files passed, 37 tests passed.

Branch: `port/roster-batch-20261025` in KatsuJinCode/decko-ts, from the
roll tip `deploy/full-candidate-20261029` at `c9ab5b33`.
