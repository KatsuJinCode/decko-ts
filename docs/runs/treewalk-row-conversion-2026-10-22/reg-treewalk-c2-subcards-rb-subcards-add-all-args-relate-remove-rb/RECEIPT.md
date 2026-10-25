# reg-treewalk-c2-subcards-rb-subcards-add-all-args-relate-remove-rb

- Ruby's file set: `card-1.110.0/lib/card/subcards.rb, subcards/{add,all,args,relate,remove}.rb`
- The row's own label: `subcards.rb`, `subcards/{add,all,args,relate,remove}.rb`
- 6 Ruby file(s), 46 def(s).
- PORTED 10 / PORTED-INLINE 9 / NAMED-COLLAPSE 27 / SKIP 0 / INERT-API 0 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port saves a card's subcards by walking the posted tree and names where each piece of Ruby's Subcards collection API lives in its own source (src/card/actions/card-action-engine.ts, the block after blankNewSubcard): the stage catch-up collapses into the engine's own staging (dispatchSubcardEarlyPhases); the iterations collapse into the Object.entries walk; the fetch-or-new and the constructions collapse into fetchByName plus subcardCreateInput's superActionId chain and blankNewSubcard's blank skip; the key normalization and name absolutization collapse into the leading-plus parse against the main name; the args extraction collapses into the request parser's subcardTree and plus-key grammar (write-routes.ts:449-456); and the staged-removal family (drop_field, remove_child, remove, clear, clear_key, deep_clear) has no counterpart because the port has no staged collection to edit - a posted trash arm routes to trashInWriter, the deck's own deletion semantics. The pinned bytes were executed for the row's probes.

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
