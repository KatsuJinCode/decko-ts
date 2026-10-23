# reg-treewalk-c2-content-all-rb-5-56

- Ruby's file set: `card-1.110.0/lib/card/content/all.rb`
- The row's own label: `content/all.rb:5-56`
- 1 Ruby file(s), 13 def(s).
- PORTED 4 / PORTED-INLINE 6 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 3.

## Verdict: WORKING ON IT

The port does not carry 3 of the row's defs: The port's draft surface is a different mechanism: the row's three defs are the DRAFT half of Ruby's content surface (re-read the content, the last draft's content, whether the content is blank), and the port's save path carries a draft action and the draft's stored bytes (src/card/actions/types.ts:168-172) instead.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `refresh_content` | all.rb:30 | public | unreachable |
| `last_draft_content` | all.rb:42 | public | external |
| `blank_content?` | all.rb:46 | public | external |

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
