# reg-treewalk-c2-dirty-rb-dirty-method-factory-rb

- Ruby's file set: `card-1.110.0/lib/card/dirty.rb, dirty/method_factory.rb`
- The row's own label: `dirty.rb`, `dirty/method_factory.rb`
- 2 Ruby file(s), 11 def(s).
- PORTED 1 / PORTED-INLINE 5 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 5.

## Verdict: WORKING ON IT

The port does not carry 5 of the row's defs: the port computes the before-values it needs instead of defining dirty methods on the record: the row's defs are the half Ruby's method factory GENERATES, and the port's write path carries the dirty tracking by a different mechanism (src/card/actions/update-referer-content.ts:72 and :467).

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `attribute_before_act` | dirty.rb:23 | public | external |
| `not_in_callback?` | dirty.rb:35 | public | internal-reachable |
| `attribute_is_changing?` | dirty.rb:40 | public | external |
| `dirty_name` | dirty.rb:64 | public | internal-reachable |
| `define_dirty_methods` | method_factory.rb:5 | public | external |

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
