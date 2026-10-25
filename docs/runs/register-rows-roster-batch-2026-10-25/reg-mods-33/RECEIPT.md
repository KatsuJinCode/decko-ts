# reg-mods-33

- The pinned Ruby gem: `card-mod-virtual-0.20.0` (the pinned gem tree
  `C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems`).
- The row's own label: `card-mod-virtual (DONE)`.
- The port file: `src/card/mod-loader/mods/card-mod-virtual.ts`.
- The declaration census at this tree: 1 gem set file, 0 gem view names
  and 2 gem event names, every set file and every event name registered
  port-side, with nothing left open.

## Verdict: DONE

Ruby (`card-mod-virtual-0.20.0 set/abstract/virtual_cache.rb:21-29`) runs
`Virtual.save self` and then `abort :success` on every save of the set's
cards, and `Virtual.delete self` plus `abort :success unless real?` on
their deletes, which unwinds the save, so the content lives in the
card_virtuals row and nothing else.

THE CLOSED MECHANISM, one arm per measured obstacle.

1. THE WRITE PATH'S DIVERSION. The engine's save paths carry the Virtual
   write and end before the row write
   (`src/card/actions/card-action-engine.ts`): the create arm sits right
   after the ordinary validation phase (the session-type create arm's
   seat) and the update arm at `updateInWriter`'s prepare_to_store seat,
   immediately before `writer.updateCard`; both call `virtualSave` (the
   card_virtuals write) and return the no-write success result. The
   delete arm runs `virtualDelete` in `deleteCardInner` and proceeds for
   a real card (`abort :success unless real?`; a delete that found a
   live row is real, so the ordinary delete proceeds, and the mod's own
   TODO at virtual_cache.rb:31-33 records its question about the delete's
   reachability; the unreal arm is kept for fidelity and is unreachable
   on this path, since the engine's delete only runs for a found live
   row). The arms RETURN rather than throwing the abort across the save's
   transaction, because Ruby's abortable wrapper KEEPS the transaction
   (result.rb:82-88, handle_abort_error answers true without a rollback):
   the card_virtuals write must persist, and a throw would roll it back
   with the unwritten row. The engine's Card::Cache[Virtual] analog
   (`VirtualRecordCache`) and the deterministic clock are already engine
   state, which is why the bodies live there and not in the host-facing
   event fns.

2. THE ABORT IS PLAYED, NOT DROPPED. The registered manifest fns stay
   no-ops (a registered stub never replaces engine code), so the Virtual
   write runs exactly once per save; the abort's effect is the no-write
   success answer the save entries give. The mod's own exported body
   helpers (`saveVirtualContent`/`deleteVirtualContent`) keep the
   marker-returning shape for their callers, and their doc comments name
   the engine arms as the bodies.

3. THE SET CHAIN RESOLVES. Ruby's only `include_set
   Abstract::VirtualCache` call site in the pinned tree is card-mod-assets
   set/right/asset_input.rb:1, so the set is exactly the RIGHT
   asset_input cards. The generated view graph
   (`set-include-graph.ts`, regenerated, not edited) records view modules
   and keeps naming no includer; the event dispatch's membership rides
   the serving runtime's `setMember` instead, whose new
   `abstract/virtual_cache` arm (src/server/write-routes.ts, the
   `abstract/attachment` arm's shape) resolves the same membership: a
   junction whose right card carries the asset_input codename.

THE BOUNDARY NAMED, HONESTLY. The diversion covers the ACT CARD's own
save; a virtual card saved as a SUBCARD of another card's save keeps the
ordinary path (`isActCard` guards the update arm), because Ruby's
subcard-abort bubble for a nested virtual save is not established, and no
recorded oracle step saves a virtual subcard. And the create arm runs
before the port's subcard preparation, so a create whose left card does
not exist fails `Virtual.save`'s validate_card ("count not cacheable"),
which is what Ruby's own prepare_to_store ordering produces there.

## How this row was measured

- The row's declaration census: `tools/audit-mod-declaration-coverage.mjs`
  against the pinned gem tree.
- The row's fixture, built from that census, now in its closed form:
  `tests/card/mod-loader/fixtures/roster-batch-20261025/register-row-33-card-mod-virtual-oracle-surface.json`.
- The pin block, which reads the PORT side live:
  `tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts`
  (row 33's block, the closed form).
- The named instrument that pins the closed behavior against storage
  (the create writes card_virtuals and no cards row; the update rewrites
  card_virtuals and leaves the row alone; the delete runs Virtual.delete
  and proceeds; an ordinary card's save still writes its row; the serving
  setMember resolves the set for the RIGHT asset_input card only; the
  route-driven save answers 303 with no row write):
  `tests/card/mod-loader/register-row-33-card-mod-virtual-abort-marker.test.ts`.

The battery at this tree:

    ./node_modules/.bin/vitest run tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts tests/card/mod-loader/register-row-33-card-mod-virtual-abort-marker.test.ts
      2 files passed, 43 tests passed.

    ./node_modules/.bin/vitest run tests/card/mod-loader/register-rows-oracle-surface-roster-batch.test.ts tests/card/mod-loader/register-row-33-card-mod-virtual-abort-marker.test.ts tests/card/mod-loader/register-rows-roster-batch-inventory.test.ts
      3 files passed, 52 tests passed.

The side-effects oracle, step for step
(`node tools/parity-side-effects/ts-drive.mjs` over the committed
synthetic deck, then `node tools/parity-side-effects/compare.mjs` against
`expected/side-effects-ruby.json`):

    SIDE EFFECTS PASS 80 / 87; deliberate differences pinned 7; mismatches 0

(no battery step saves a virtual card through the write path; the battery
is the no-divergence proof that the arms changed nothing else).

Branch: `port/regfix-4-20261025` in KatsuJinCode/decko-ts, from the
roster-batch tip `5efc8162` (which contains the roll tip
`deploy/full-candidate-20261029` at `c9ab5b33`).
