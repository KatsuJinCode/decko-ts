# reg-treewalk-e5

- Ruby's file set: `card-1.110.0/mod/core/lib/ + config/ (10)`
- The row's own label: admin_item.rb, 6 rake tasks, config/admin.yml, 2 locales
- 7 Ruby file(s), 27 def(s).
- PORTED 1 / PORTED-INLINE 0 / NAMED-COLLAPSE 0 / SKIP 9 / INERT-API 0 / GAP 17.

## Verdict: WORKING ON IT

The port does not carry 17 of the row's defs: The port has no rake task runner: the row's seventeen defs are the rake task CLI and its option parsing plus the seed and migrate tasks' own methods, and the port's equivalents are the commands the deploy scripts invoke.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `version` | migrate.rake:62 | public | port-bound |
| `invoke_card_tasks` | seed.rake:53 | public | unreachable |
| `invoke_card_task` | seed.rake:57 | public | unreachable |
| `args_without_env_arg` | card.rake:34 | public | unreachable |
| `adjust_environment` | card.rake:47 | public | unreachable |
| `run_with_options` | card.rake:59 | public | unreachable |
| `options` | card.rake:99 | public | port-bound |
| `run_tasks` | card.rake:103 | public | unreachable |
| `rake_result` | card.rake:120 | public | unreachable |
| `flag_opt` | card.rake:130 | public | unreachable |
| `add_opt` | card.rake:135 | public | external |
| `add_opt_without_shortcut` | card.rake:141 | public | unreachable |
| `key_to_option_description` | card.rake:147 | public | internal-reachable |
| `op` | card.rake:151 | public | port-bound |
| `parse_options` | card.rake:155 | public | port-bound |
| `failing_loudly` | card.rake:163 | public | external |
| `reset_tmpfiles` | card.rake:172 | public | unreachable |

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
