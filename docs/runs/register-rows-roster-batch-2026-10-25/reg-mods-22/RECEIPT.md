# reg-mods-22

- The pinned Ruby gem: `card-mod-list-0.20.0` (the pinned gem tree
  `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`).
- The row's own label: `card-mod-list (PARTIAL)`.
- The port file: `src/card/mod-loader/mods/card-mod-list.ts`.
- The declaration census at this tree: 18 gem set files, 14 gem view names
  and 5 gem event names. Every set file and every event name is registered
  port-side; the 3 view names the census leaves open (`:core`, `:content`,
  `:titled`) are the engine's own view-table names, and each is named with
  its reason.

## Verdict: WORKING ON IT

The two validate events have no port body. Ruby's `validate_item_type`
(`set/abstract/01_list/events.rb:13-23`) reads the card type's
`ok_item_types` and adds a `:content` error for an item whose type is
outside it, and Ruby's `validate_item_uniqueness` (`:29-33`) adds a
`:content` error for a duplicate item name. The port's write path has no
`errors.add` seam and no `ok_item_types` / `item_cards` /
`duplicate_item_names` surface, so both bodies are documented stubs
(`src/card/mod-loader/mods/card-mod-list.ts:1276-1309`) and a wrong item
type is saved where Ruby refuses it.

Of the other three of the five list events, two are PORTED
(`add_and_drop_items` and `insert_item_event` run in the write route's
list-item arm, `src/server/write-routes.ts:511-522`) and one CANNOT FIRE
(`delist` lives on the abstract set module `Abstract::Delist`, and the
repo's generated include census names no includer of it,
`src/card/mod-loader/set-include-graph.ts`).

## How this row was measured

- The row's declaration census: `tools/audit-mod-declaration-coverage.mjs`
  against the pinned gem tree.
- The row's fixture, built from that census:
  `tests/card/mod-loader/fixtures/roster-batch-20261025/register-row-22-card-mod-list-oracle-surface.json`.
- The pin block, which reads the PORT side live:
  `tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts`
  (row 22's block).
- The named instrument that pins the three facts above:
  `tests/card/mod-loader/register-row-22-card-mod-list-validate-events.test.ts`.

The battery at this commit:

    ./node_modules/.bin/vitest run tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts tests/card/mod-loader/register-row-22-card-mod-list-validate-events.test.ts
      2 files passed, 20 tests passed.

Branch: `port/roster-batch-20261025` in KatsuJinCode/decko-ts, from the
roll tip `deploy/full-candidate-20261029` at `c9ab5b33`.
