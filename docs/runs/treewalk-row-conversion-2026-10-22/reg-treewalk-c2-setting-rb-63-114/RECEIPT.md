# reg-treewalk-c2-setting-rb-63-114

- Ruby's file set: `card-1.110.0/lib/card/setting.rb`
- The row's own label: `setting.rb:63-114`
- 1 Ruby file(s), 12 def(s).
- PORTED 1 / PORTED-INLINE 8 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 3.

## Verdict: WORKING ON IT

The port does not carry 3 of the row's defs: The port carries the setting REGISTRY and not the option helpers behind it: the row's three defs fill a setting's default option hash, narrow a setting to one card type and list the types a setting may be used on.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `standard_setting_opts` | setting.rb:87 | private | internal-reachable |
| `restrict_setting_to_type` | setting.rb:91 | private | internal-reachable |
| `permitted_type_ids` | setting.rb:116 | private | internal-reachable |

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
