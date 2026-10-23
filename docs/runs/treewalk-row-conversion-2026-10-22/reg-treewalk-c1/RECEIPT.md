# reg-treewalk-c1

- Ruby's file set: `card-1.110.0/lib/card.rb`
- The row's own label: the Card class itself (mixin roster, action_specific_attributes, has_many, define_callbacks)
- 1 Ruby file(s), 0 def(s).
- PORTED 0 / PORTED-INLINE 0 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: the row's subject is the class BODY, not methods, and the port carries every declaration in it: the mixin roster (the seven extends and eleven includes, each with a port module named for it), the action_specific_attributes list (the port names the same list and cites lib/card.rb:146), the four associations (the port reads and writes the same rows by the same keys), and the three Rails callback chains (the port names all three in the dispatcher's table and cites lib/card.rb:181). The one declaration the port does not carry is the `delegate :config, :paths, to: Cardio` line, because that reaches the RAILS APPLICATION's configuration and the port is not Rails.

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
