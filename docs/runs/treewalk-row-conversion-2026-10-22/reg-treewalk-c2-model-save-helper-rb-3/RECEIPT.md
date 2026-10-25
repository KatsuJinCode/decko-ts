# reg-treewalk-c2-model-save-helper-rb-3

- Ruby's file set: `card-1.110.0/lib/card/model/save_helper.rb (3)`
- The row's own label: `model/save_helper*.rb` (3)
- 1 Ruby file(s), 7 def(s).
- PORTED 5 / PORTED-INLINE 1 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 1 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port carries the row's save surface in the write engine itself (src/card/actions/card-action-engine.ts, whose header cites lib/card/model/save_helper.rb and lib/card/name/card_class.rb): create_card and create_card! are the engine's createCard with the saveHelperCreateCard facade (the ! variant runs uniquifyName with rename :old, which moves the occupying card to the next free "name N" variant before the create), update_card and update_card! are updateCard with the saveHelperUpdateCard facade (no card at the name answers nil; a rename lands on the free variant), delete_card is deleteCard behind the exists guard, and uniquify_name is the engine's uniquifyName over name/card_class.rb:8-16. with_user is the deck's inert library API (its only pinned callers are spec files) and delete_code_card is inert too: the rig's migration-tree repair measured all 23 of its callers inside the deck's data/transform migrations, so the old runtime never reached it either. Each facade branch is pinned port-side against real SQLite storage (tests/card/actions/save-helper.test.ts), and the pinned bytes were executed for the row's probes.

## How this row was measured

- The row's Ruby file set and per-def roster: `tools/treewalk-family-def-coverage.mjs`.
- The per-def disposition: `tools/treewalk-family-row-disposition.mjs`.
- The pinned bytes, executed: `tests/server/oracle-capture-card-gem-row-methods-ruby.rb`
  (or `tests/server/oracle-capture-card-class-declarations-ruby.rb` for the c1 row, whose
  subject is the class body rather than methods), whose fixture is under
  `fixtures/captured/`.
- The port side, re-checked against the port tree as it stands:
  `tests/server/treewalk-row-disposition-parity.test.ts`.

Branch: `port/register-treewalk-round1b-20261024` in KatsuJinCode/decko-ts.
