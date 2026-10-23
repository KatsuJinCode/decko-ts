# reg-treewalk-c2-auth-proxy-rb-6-29-48-59

- Ruby's file set: `card-1.110.0/lib/card/auth/proxy.rb`
- The row's own label: `auth/proxy.rb:6-29, 48-59`
- 1 Ruby file(s), 6 def(s).
- PORTED 0 / PORTED-INLINE 4 / NAMED-COLLAPSE 1 / SKIP 0 / INERT-API 0 / GAP 1.

## Verdict: WORKING ON IT

The port does not carry 1 of the row's defs: the port has no permission-proxy: Ruby’s `with` saves and restores a PROCESS-GLOBAL current_id and the port's engine has no process-global to save, which is the same mechanism the port names for the row's collapsed `temporarily` (src/card/auth/actor.ts:29).

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `with` | proxy.rb:48 | public | port-bound |

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
