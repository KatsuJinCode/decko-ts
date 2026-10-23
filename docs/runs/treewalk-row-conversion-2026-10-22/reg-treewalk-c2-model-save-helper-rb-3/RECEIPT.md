# reg-treewalk-c2-model-save-helper-rb-3

- Ruby's file set: `card-1.110.0/lib/card/model/save_helper.rb (3)`
- The row's own label: `model/save_helper*.rb` (3)
- 1 Ruby file(s), 7 def(s).
- PORTED 0 / PORTED-INLINE 0 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 1 / GAP 6.

## Verdict: WORKING ON IT

The port does not carry 6 of the row's defs: The row is the deck's EXTERNAL-SCRIPTING library API and the port carries the capability under its own names without citing Ruby's file: the pinned deck's runtime calls none of these methods (the deck's own red-team audit measured the same), so there is no behaviour the port owes.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `create_card` | save_helper.rb:19 | public | port-bound |
| `create_card!` | save_helper.rb:24 | public | port-bound |
| `update_card` | save_helper.rb:29 | public | port-bound |
| `update_card!` | save_helper.rb:35 | public | port-bound |
| `delete_card` | save_helper.rb:40 | public | port-bound |
| `delete_code_card` | save_helper.rb:46 | public | external |

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
