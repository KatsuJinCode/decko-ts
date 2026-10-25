# reg-treewalk-c2-mark-rb

- Ruby's file set: `card-1.110.0/lib/card/mark.rb`
- The row's own label: `mark.rb`
- 1 Ruby file(s), 3 def(s).
- PORTED 2 / PORTED-INLINE 1 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port carries all three of the row's defs by citation. id_or_name and id_from_mark are the port's own mark resolution (src/card/fetch/retrieve.ts, which cites lib/card/mark.rb for both), and cardish is the port's cardish (src/card/fetch.ts), Ruby's same branch over a mark: a Card record passes through untouched and everything else is fetch with new: {} (mark.rb:9-14). The pinned bytes were executed for the row's probes (cardish over a String mark, id_or_name over Integer, Symbol and String marks, id_from_mark over an Integer), and each cardish branch is pinned port-side against real SQLite storage (tests/card/fetch/fetch.test.ts).

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
