# reg-treewalk-c2-set-rb-set-28

- Ruby's file set: `card-1.110.0/lib/card/set.rb, set/ (28)`
- The row's own label: `set.rb`, `set/**` (28)
- 29 Ruby file(s), 240 def(s).
- PORTED 43 / PORTED-INLINE 72 / NAMED-COLLAPSE 3 / SKIP 22 / INERT-API 1 / GAP 99.

## Verdict: WORKING ON IT

The port does not carry 99 of the row's defs: The port carries the set-module DECLARATION surface by a different mechanism: the row's ninety-nine defs are the set-definition DSL's own generators and registries (the event and view method factories, the format-module registration, the options and trait surfaces), and the port's mod loader reads the deck's set files and records the registrations (src/card/mod-loader/mod-registrar.ts).

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `reset` | set.rb:136 | public | port-bound |
| `ensure_set` | advanced_api.rb:16 | public | external |
| `define_set_from_error` | advanced_api.rb:27 | public | internal-reachable |
| `stage_method` | advanced_api.rb:43 | public | unreachable |
| `define_set` | advanced_api.rb:59 | private | internal-reachable |
| `card_set_module_const_get` | advanced_api.rb:69 | private | internal-reachable |
| `set_condition_card` | all.rb:42 | private | internal-reachable |
| `updating_sets?` | all.rb:50 | private | internal-reachable |
| `no_current_action?` | all.rb:55 | private | internal-reachable |
| `set_condition_card_with_new_set_modules` | all.rb:62 | private | internal-reachable |
| `wrong_stage` | all.rb:93 | private | external |
| `wrong_action` | all.rb:103 | private | external |
| `set_event_callbacks` | callbacks.rb:6 | public | external |
| `set_event_callback` | callbacks.rb:14 | public | internal-reachable |
| `valid_event_callback` | callbacks.rb:23 | public | internal-reachable |
| `serializable_attributes` | delayed_event.rb:10 | public | unreachable |
| `process_delayed_job_opts` | delayed_event.rb:27 | private | external |
| `with_delay?` | delayed_event.rb:31 | private | external |
| `validate_conditions` | options.rb:6 | public | external |
| `validate_condition_name` | options.rb:15 | public | internal-reachable |
| `validate_condition_value` | options.rb:23 | public | internal-reachable |
| `validate_standard_condition_value` | options.rb:31 | public | internal-reachable |
| `invalid_condition_values` | options.rb:40 | public | internal-reachable |
| `validate_when_value` | options.rb:44 | public | internal-reachable |
| `event_opts` | options.rb:52 | public | external |
| `normalize_opts` | options.rb:60 | public | internal-reachable |
| `process_action_opts` | options.rb:69 | public | internal-reachable |
| `process_stage_opts` | options.rb:73 | public | internal-reachable |
| `callback_name` | options.rb:83 | public | internal-reachable |
| `trigger=` | skip_and_trigger.rb:27 | public | port-bound |
| `trigger_event_in_action!` | skip_and_trigger.rb:55 | public | unreachable |
| `act_skip_hash` | skip_and_trigger.rb:96 | private | internal-reachable |
| `act_trigger_hash` | skip_and_trigger.rb:105 | private | internal-reachable |
| `force_events` | skip_and_trigger.rb:115 | private | internal-reachable |
| `delaying_method_name` | event.rb:120 | public | external |
| `define_event` | event.rb:128 | private | internal-reachable |
| `define_simple_method` | event.rb:133 | private | internal-reachable |
| `define_event_method` | event.rb:139 | private | internal-reachable |
| `define_standard_event_method` | event.rb:147 | private | external |
| `rescuing_integration` | event.rb:168 | private | internal-reachable |
| `log_event_call` | event.rb:172 | private | internal-reachable |
| `haml_view_block` | haml_views.rb:27 | private | external |
| `haml_template_proc` | haml_views.rb:32 | private | internal-reachable |
| `define_view_method` | view_definition.rb:12 | private | external |
| `view_block` | view_definition.rb:37 | private | internal-reachable |
| `template_view_block` | view_definition.rb:47 | private | internal-reachable |
| `process_view_opts` | view_opts.rb:25 | private | external |
| `fail_on_invalid_opts!` | view_opts.rb:32 | private | internal-reachable |
| `normalize_view_opts` | view_opts.rb:39 | private | internal-reachable |
| `define_wrap_with_method` | wrapper.rb:74 | private | internal-reachable |
| `view_for_override` | abstract_format.rb:103 | public | unreachable |
| `with_template_path` | haml_paths.rb:16 | public | external |
| `haml_template_path` | haml_paths.rb:24 | public | external |
| `template_location` | haml_paths.rb:34 | public | internal-reachable |
| `each_template_path` | haml_paths.rb:40 | public | internal-reachable |
| `deep_source` | haml_paths.rb:51 | public | internal-reachable |
| `try_haml_template_path` | haml_paths.rb:59 | public | internal-reachable |
| `haml_block_locals` | haml_paths.rb:66 | public | external |
| `add_to_array_val` | format.rb:152 | private | internal-reachable |
| `layout_method_name` | format.rb:160 | private | external |
| `wrapper_method_name` | format.rb:166 | private | external |
| `underscored_name` | helpers.rb:19 | public | unreachable |
| `respond_to_missing?` | helpers.rb:45 | public | unreachable |
| `format_module` | helpers.rb:69 | public | unreachable |
| `mod_name` | i18n_scope.rb:17 | public | port-bound |
| `mod_from_parts` | i18n_scope.rb:29 | private | internal-reachable |
| `mod_without_version_suffix` | i18n_scope.rb:37 | private | internal-reachable |
| `mod_without_tmp_prefix` | i18n_scope.rb:41 | private | internal-reachable |
| `path_parts` | i18n_scope.rb:45 | private | internal-reachable |
| `find_set_path` | i18n_scope.rb:84 | private | internal-reachable |
| `path_set_index` | i18n_scope.rb:107 | private | internal-reachable |
| `include_set_formats` | inheritance.rb:50 | public | internal-reachable |
| `each_format` | inheritance.rb:66 | private | internal-reachable |
| `each_format_with_mods` | inheritance.rb:74 | private | internal-reachable |
| `applicable_format?` | inheritance.rb:80 | private | internal-reachable |
| `prep_modules_for_caching` | all.rb:13 | public | external |
| `set_names` | all.rb:57 | public | port-bound |
| `include_module?` | all.rb:70 | public | unreachable |
| `module_list` | base.rb:31 | public | unreachable |
| `reset` | pattern.rb:24 | public | port-bound |
| `clean_empty_module_from_hash` | registrar.rb:66 | private | internal-reachable |
| `parent_event_name` | required_field.rb:23 | public | unreachable |
| `field_event_name` | required_field.rb:27 | public | internal-reachable |
| `define_field_test` | required_field.rb:34 | private | internal-reachable |
| `field_test_name` | required_field.rb:45 | private | internal-reachable |
| `event_test` | required_field.rb:51 | private | internal-reachable |
| `field_events?` | required_field.rb:64 | private | internal-reachable |
| `create_field_events` | required_field.rb:68 | private | internal-reachable |
| `field_event_options` | required_field.rb:73 | private | internal-reachable |
| `create_field_event` | required_field.rb:79 | private | internal-reachable |
| `create_parent_event` | required_field.rb:91 | private | internal-reachable |
| `get_traits` | trait.rb:35 | private | internal-reachable |
| `add_traits` | trait.rb:40 | private | internal-reachable |
| `assign_trait_type` | trait.rb:54 | private | internal-reachable |
| `trait_module_key_parts` | trait.rb:60 | private | internal-reachable |
| `new_trait_opts` | trait.rb:68 | private | internal-reachable |
| `define_trait_card` | trait.rb:74 | private | internal-reachable |
| `define_trait_reader` | trait.rb:85 | private | internal-reachable |
| `define_trait_writer` | trait.rb:91 | private | internal-reachable |

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
