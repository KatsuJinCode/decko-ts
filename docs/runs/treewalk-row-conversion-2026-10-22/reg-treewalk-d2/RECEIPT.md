# reg-treewalk-d2

- Ruby's file set: `card-1.110.0/bin/card + lib/cardio.rb + lib/cardio/ (55)`
- The row's own label: the Rails host: railtie, app class, CLI, commands, migrations, load strategies, sow/eat, seed, utils
- 56 Ruby file(s), 293 def(s).
- PORTED 35 / PORTED-INLINE 61 / NAMED-COLLAPSE 2 / SKIP 52 / INERT-API 3 / GAP 140.

## Verdict: WORKING ON IT

The port does not carry 140 of the row's defs: The port is not Rails and has no railtie, no Rails application class and no rake command layer: the row's one hundred and forty defs are the Rails host's own surface, and the port is a library and an edge worker rather than a Rails server.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `gem_root` | cardio.rb:21 | public | external |
| `card_defined?` | cardio.rb:25 | public | unreachable |
| `run` | command_base.rb:5 | public | port-bound |
| `exit_with_child_status` | command_base.rb:10 | public | internal-reachable |
| `run_help` | custom.rb:36 | private | external |
| `run_help_for_group` | custom.rb:47 | private | internal-reachable |
| `command_help` | custom.rb:59 | private | internal-reachable |
| `run` | rake_command.rb:22 | public | port-bound |
| `commands` | rake_command.rb:34 | public | external |
| `escape_args` | rake_command.rb:45 | public | internal-reachable |
| `other_options` | parser.rb:51 | private | internal-reachable |
| `process_rescue_opts` | parser.rb:63 | private | internal-reachable |
| `process_spring_opts` | parser.rb:71 | private | internal-reachable |
| `command` | rspec_command.rb:17 | public | port-bound |
| `run_non_deck_command` | command.rb:15 | public | external |
| `run` | command.rb:67 | public | port-bound |
| `command_for_key` | command.rb:83 | private | internal-reachable |
| `run_rails` | command.rb:105 | private | internal-reachable |
| `generator_requirement` | command.rb:110 | private | internal-reachable |
| `run_rake` | command.rb:115 | private | internal-reachable |
| `unknown_error` | command.rb:122 | private | internal-reachable |
| `monkey?` | deck_helper.rb:12 | public | external |
| `platypus?` | deck_helper.rb:16 | public | external |
| `erb_template` | deck_helper.rb:20 | public | external |
| `repo_path` | deck_helper.rb:24 | public | unreachable |
| `expanded_repo_path` | deck_helper.rb:28 | public | unreachable |
| `determine_repo_path` | deck_helper.rb:32 | public | unreachable |
| `repo_path_constraint` | deck_helper.rb:40 | public | unreachable |
| `prompt_for_repo_path` | deck_helper.rb:44 | public | unreachable |
| `spec_path` | deck_helper.rb:48 | public | unreachable |
| `spec_helper_path` | deck_helper.rb:52 | public | unreachable |
| `features_path` | deck_helper.rb:57 | public | unreachable |
| `jasmine_yml` | deck_helper.rb:70 | public | external |
| `mysql_socket` | deck_helper.rb:76 | public | unreachable |
| `mod_path` | mod_base.rb:11 | public | external |
| `app_name` | rails_overrides.rb:8 | public | unreachable |
| `defined_app_name` | rails_overrides.rb:13 | public | unreachable |
| `defined_app_const_base` | rails_overrides.rb:17 | public | unreachable |
| `app_const_base` | rails_overrides.rb:25 | public | unreachable |
| `app_const` | rails_overrides.rb:32 | public | unreachable |
| `valid_const?` | rails_overrides.rb:36 | public | unreachable |
| `invalid_app_name` | rails_overrides.rb:45 | public | unreachable |
| `source_root` | generators.rb:12 | public | external |
| `banner` | generators.rb:23 | public | unreachable |
| `banner_command` | generators.rb:29 | public | unreachable |
| `generator_names` | generators.rb:49 | public | unreachable |
| `assume_current` | assumption.rb:5 | public | external |
| `assume_migrated_upto_version` | assumption.rb:14 | public | unreachable |
| `mark_as_migrated` | assumption.rb:23 | private | internal-reachable |
| `port_all` | port.rb:5 | public | external |
| `rename_old_tables` | port.rb:26 | private | internal-reachable |
| `lease_connection` | port.rb:34 | private | external |
| `stamp` | stamp.rb:5 | public | port-bound |
| `stamp_path` | stamp.rb:25 | private | external |
| `with_migration_table` | transform.rb:15 | private | internal-reachable |
| `migration_class` | migration.rb:14 | public | external |
| `new_for` | migration.rb:18 | public | external |
| `migration_paths` | migration.rb:45 | private | internal-reachable |
| `with_migration_table` | migration.rb:66 | private | internal-reachable |
| `ensure_uninstalled` | class_methods.rb:34 | public | external |
| `ensure_installed` | class_methods.rb:42 | public | port-bound |
| `ensure_asset_cards` | class_methods.rb:69 | private | internal-reachable |
| `ensure_asset_lists` | class_methods.rb:75 | private | internal-reachable |
| `delete_auto_installed_cards` | class_methods.rb:87 | private | internal-reachable |
| `auto_installed_cards` | class_methods.rb:94 | private | internal-reachable |
| `subpaths` | dirs.rb:93 | public | external |
| `dirname` | dirs.rb:114 | public | external |
| `each_tmp` | dirs.rb:118 | public | external |
| `each_with_tmp` | dirs.rb:125 | public | external |
| `each_subpath` | dirs.rb:132 | public | external |
| `add_gem_mods` | dirs.rb:138 | private | internal-reachable |
| `add_gem_mod` | dirs.rb:144 | private | internal-reachable |
| `add_core_mods` | dirs.rb:152 | private | internal-reachable |
| `run` | eat.rb:22 | public | port-bound |
| `handle_up` | eat.rb:38 | private | internal-reachable |
| `time_integer` | eat.rb:72 | private | internal-reachable |
| `load_modules` | eval.rb:7 | public | external |
| `generate_tmp_files` | pattern_tmp_files.rb:8 | private | external |
| `load_tmp_files` | pattern_tmp_files.rb:19 | private | external |
| `tmp_dir` | pattern_tmp_files.rb:23 | private | external |
| `load_modules` | set_binding_magic.rb:9 | public | external |
| `module_path_binding` | set_binding_magic.rb:31 | public | internal-reachable |
| `generate_tmp_files` | set_tmp_files.rb:8 | private | external |
| `load_tmp_files` | set_tmp_files.rb:23 | private | external |
| `load_tmp_files_for_pattern` | set_tmp_files.rb:31 | private | internal-reachable |
| `load_modules` | tmp_files.rb:7 | public | external |
| `clean_comments?` | tmp_files.rb:12 | public | external |
| `prepare_tmp_dir` | tmp_files.rb:18 | private | external |
| `rewrite_tmp_files?` | tmp_files.rb:26 | private | internal-reachable |
| `write_tmp_file` | tmp_files.rb:33 | private | external |
| `class_for_set` | load_strategy.rb:18 | public | external |
| `class_for_set_pattern` | load_strategy.rb:26 | public | external |
| `tmp_files?` | load_strategy.rb:30 | public | external |
| `clean_comments?` | load_strategy.rb:45 | public | external |
| `load_strategy_class` | set_loader.rb:13 | public | external |
| `template_class` | set_loader.rb:22 | public | unreachable |
| `pattern_groups` | set_loader.rb:32 | public | unreachable |
| `each_file_with_patterns` | set_loader.rb:38 | private | internal-reachable |
| `template_class` | set_pattern_loader.rb:8 | public | unreachable |
| `load_strategy_class` | set_pattern_loader.rb:12 | public | external |
| `to_const` | set_pattern_loader.rb:25 | public | external |
| `offset` | set_pattern_loader.rb:34 | public | port-bound |
| `to_const` | set_template.rb:11 | public | external |
| `processed_content` | set_template.rb:21 | public | internal-reachable |
| `add_explicit_format_modules` | set_template.rb:26 | public | internal-reachable |
| `module_name` | set_template.rb:37 | public | external |
| `helper_module?` | set_template.rb:47 | public | external |
| `offset` | set_template.rb:56 | public | port-bound |
| `load_initializers` | loader.rb:30 | public | internal-reachable |
| `load_dir` | loader.rb:38 | public | external |
| `each_mod_dir` | loader.rb:69 | private | external |
| `build` | module_template.rb:18 | public | port-bound |
| `processed_content` | module_template.rb:27 | public | internal-reachable |
| `simple_load?` | module_template.rb:34 | public | external |
| `capture_module_comment` | module_template.rb:43 | private | internal-reachable |
| `module_content` | module_template.rb:71 | private | internal-reachable |
| `new_data_from_cards` | card_source.rb:6 | public | external |
| `main_cards` | card_source.rb:38 | public | internal-reachable |
| `require_card` | card_source.rb:42 | public | internal-reachable |
| `yaml_from_url` | remote_source.rb:24 | public | internal-reachable |
| `mod_path` | yaml_dump.rb:18 | public | external |
| `run` | sow.rb:24 | public | port-bound |
| `old_data` | sow.rb:76 | private | internal-reachable |
| `parse_pod_yaml` | sow.rb:82 | private | external |
| `tmp_dir` | mod.rb:71 | public | external |
| `required_path` | mod.rb:88 | private | internal-reachable |
| `require_mod_gem` | railtie.rb:111 | public | unreachable |
| `exec_script` | script_loader.rb:35 | public | internal-reachable |
| `in_application?` | script_loader.rb:43 | public | internal-reachable |
| `in_application_subdirectory?` | script_loader.rb:47 | public | internal-reachable |
| `update_seed?` | seed.rb:48 | private | internal-reachable |
| `dump_tables` | seed.rb:57 | private | internal-reachable |
| `write_seed_file` | seed.rb:65 | private | internal-reachable |
| `yamlize_records` | seed.rb:70 | private | internal-reachable |
| `clean_history` | seed.rb:91 | private | internal-reachable |
| `clean_time_and_user_stamps` | seed.rb:98 | private | internal-reachable |
| `delete_trashed_files` | utils.rb:34 | private | internal-reachable |
| `delete_files_with_id` | utils.rb:44 | private | internal-reachable |
| `all_trashed_card_ids` | utils.rb:64 | private | internal-reachable |
| `card_release` | version.rb:13 | public | unreachable |

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
