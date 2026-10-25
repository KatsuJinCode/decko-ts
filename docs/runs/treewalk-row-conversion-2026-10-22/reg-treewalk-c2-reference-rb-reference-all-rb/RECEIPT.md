# reg-treewalk-c2-reference-rb-reference-all-rb

- Ruby's file set: `card-1.110.0/lib/card/reference.rb, reference/all.rb`
- The row's own label: `reference.rb`, `reference/all.rb`
- 2 Ruby file(s), 26 def(s).
- PORTED 16 / PORTED-INLINE 7 / NAMED-COLLAPSE 1 / SKIP 1 / INERT-API 1 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port carries all seven of the row's read and maintenance defs in src/card/actions/reference-read.ts (which cites lib/card/reference.rb and lib/card/reference/all.rb for each): referer is Card[referer_id] over a fetched row, referer_cards_from_references uniques the linked referer ids into cards and drops the unlinked rows, referees_from_references resolves distinct referee_keys through Card.fetch key with new: {} (an unknown key answers a new card), nestees is the same walk over the ref_type "I" rows only, name_referers joins the live cards to the rows keyed by this card's key, each_card walks the live cards in id order batched at 1000 (find_each; Ruby's include_set_modules has no runtime counterpart because the mod loader registers the modules ahead of any save), and recreate_all wipes card_references and rebuilds every live card's rows through the write path's own refreshReferencesOut. Ten cases pin the reads and the rebuild against real SQLite storage (tests/card/actions/reference-read.test.ts), and the pinned bytes were executed for the row's probes.

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
