# reg-treewalk-c2-auth-setup-rb-9-15-39-51

- Ruby's file set: `card-1.110.0/lib/card/auth/setup.rb`
- The row's own label: `auth/setup.rb:9-15, 39-51`
- 1 Ruby file(s), 7 def(s).
- PORTED 0 / PORTED-INLINE 4 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 1 / GAP 2.

## Verdict: WORKING ON IT

The port does not carry 2 of the row's defs: the port carries the setup census and not the test surface: the row's two remaining defs are a test-only helper the pinned deck never calls and the id LIST behind the count, which the port does not need because it counts the accounts directly (countUserAccounts, src/card/auth/first-run-setup.ts:311).

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `instant_account_activation` | setup.rb:24 | public | unreachable |
| `user_account_ids` | setup.rb:39 | private | internal-reachable |

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
