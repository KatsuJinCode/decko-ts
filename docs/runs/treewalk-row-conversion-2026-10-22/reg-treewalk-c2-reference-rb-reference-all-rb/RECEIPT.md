# reg-treewalk-c2-reference-rb-reference-all-rb

- Ruby's file set: `card-1.110.0/lib/card/reference.rb, reference/all.rb`
- The row's own label: `reference.rb`, `reference/all.rb`
- 2 Ruby file(s), 26 def(s).
- PORTED 8 / PORTED-INLINE 8 / NAMED-COLLAPSE 1 / SKIP 1 / INERT-API 1 / GAP 7.

## Verdict: WORKING ON IT

The port does not carry 7 of the row's defs: The port carries the reference read and write path and not the reference REPAIR and the referer-collection half: the row's seven defs are the ones the port binds no function for under any name.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `referer` | reference.rb:8 | public | port-bound |
| `recreate_all` | reference.rb:54 | public | unreachable |
| `each_card` | reference.rb:67 | private | external |
| `referer_cards_from_references` | all.rb:22 | public | internal-reachable |
| `nestees` | all.rb:32 | public | port-bound |
| `referees_from_references` | all.rb:36 | public | unreachable |
| `name_referers` | all.rb:42 | public | unreachable |

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
