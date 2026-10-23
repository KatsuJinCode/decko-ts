# reg-treewalk-c2-mark-rb

- Ruby's file set: `card-1.110.0/lib/card/mark.rb`
- The row's own label: `mark.rb`
- 1 Ruby file(s), 3 def(s).
- PORTED 1 / PORTED-INLINE 1 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 1.

## Verdict: WORKING ON IT

The port does not carry 1 of the row's defs: the port's own map does not claim mark.rb#cardish: the port's fetch path carries the BEHAVIOUR (a Card record mark resolves at src/card/fetch/retrieve.ts:154) and cites lib/card/mark.rb, but no port file names the method.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `cardish` | mark.rb:9 | public | port-bound |

## How this row was measured

- The row's Ruby file set and per-def roster: `tools/treewalk-family-def-coverage.mjs`.
- The per-def disposition: `tools/treewalk-family-row-disposition.mjs`.
- The pinned bytes, executed: `tests/server/oracle-capture-card-gem-row-methods-ruby.rb`
  (or `tests/server/oracle-capture-card-class-declarations-ruby.rb` for the c1 row, whose
  subject is the class body rather than methods), whose fixture is under
  `fixtures/captured/`.
- The port side, re-checked against the port tree as it stands:
  `tests/server/treewalk-row-disposition-parity.test.ts`.

Branch: `port/register-treewalk-convert-20261022` in KatsuJinCode/decko-ts.
