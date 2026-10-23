# reg-treewalk-d3

- Ruby's file set: `card-1.110.0/lib/generators/ (51)`
- The row's own label: Rails generators for a new deck, mod, set, migration + the deck templates scaffold
- 7 Ruby file(s), 39 def(s).
- PORTED 0 / PORTED-INLINE 0 / NAMED-COLLAPSE 0 / SKIP 8 / INERT-API 0 / GAP 31.

## Verdict: WORKING ON IT

The port does not carry 31 of the row's defs: The port has no generator: the row's thirty-one defs are the interactive prompts, the deck generator's file map, the migration generator and the mod and set generators, and the port's own deck bootstrap is the seed-and-boot path (src/card/auth/boot-seed.ts).

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `run` | interactive.rb:17 | public | port-bound |
| `dev_options?` | interactive.rb:34 | private | internal-reachable |
| `config_path` | interactive.rb:38 | private | internal-reachable |
| `bundle_exec` | interactive.rb:42 | private | internal-reachable |
| `add_config_options` | interactive.rb:59 | private | internal-reachable |
| `add_seed_options` | interactive.rb:72 | private | internal-reachable |
| `add_common_seed_option` | interactive.rb:77 | private | internal-reachable |
| `add_seed_all_option` | interactive.rb:89 | private | internal-reachable |
| `add_exit_option` | interactive.rb:102 | private | internal-reachable |
| `add_after_seed_options` | interactive.rb:108 | private | internal-reachable |
| `databases` | deck_generator.rb:19 | public | external |
| `banner` | deck_generator.rb:52 | public | unreachable |
| `core_files` | deck_generator.rb:58 | public | unreachable |
| `empty_dirs` | deck_generator.rb:69 | public | unreachable |
| `dotfiles` | deck_generator.rb:73 | public | unreachable |
| `config` | deck_generator.rb:80 | public | port-bound |
| `public` | deck_generator.rb:95 | public | external |
| `spring` | deck_generator.rb:102 | public | external |
| `script` | deck_generator.rb:106 | public | port-bound |
| `spec` | deck_generator.rb:111 | public | port-bound |
| `seed_data` | deck_generator.rb:124 | public | unreachable |
| `create_migration_file` | migration_generator.rb:19 | public | unreachable |
| `mod_object` | migration_generator.rb:27 | public | unreachable |
| `migration_path` | migration_generator.rb:31 | public | unreachable |
| `migration_type` | migration_generator.rb:35 | public | unreachable |
| `migration_object` | migration_generator.rb:39 | public | unreachable |
| `set_local_assigns!` | migration_generator.rb:43 | public | unreachable |
| `create_mod` | mod_generator.rb:7 | public | unreachable |
| `root_files` | mod_generator.rb:18 | public | unreachable |
| `data_dir` | mod_generator.rb:31 | private | external |
| `create_files` | set_generator.rb:17 | public | unreachable |

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
