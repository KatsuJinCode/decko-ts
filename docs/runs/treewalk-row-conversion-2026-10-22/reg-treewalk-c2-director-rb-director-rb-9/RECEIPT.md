# reg-treewalk-c2-director-rb-director-rb-9

- Ruby's file set: `card-1.110.0/lib/card/director.rb + director/.rb (9)`
- The row's own label: `director.rb` + `director/*.rb` (9)
- 10 Ruby file(s), 119 def(s).
- PORTED 25 / PORTED-INLINE 30 / NAMED-COLLAPSE 6 / SKIP 1 / INERT-API 0 / GAP 57.

## Verdict: WORKING ON IT

The port does not carry 57 of the row's defs: The port runs an act's stages in one call and has no director REGISTRY: the row's defs are the registry (unregister, appoint, main_director), the run and stage machinery and the store, and the port's act lifecycle is the action engine's own (src/card/actions/card-action-engine.ts).

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `unregister` | director.rb:172 | public | unreachable |
| `appoint` | director.rb:185 | public | external |
| `main_director` | director.rb:202 | public | unreachable |
| `replace_card` | director.rb:217 | public | external |
| `prepare_for_phases` | all.rb:14 | public | external |
| `clear_action_specific_attributes` | all.rb:98 | public | external |
| `start_new_act` | all.rb:114 | private | internal-reachable |
| `add_to_act` | all.rb:121 | private | internal-reachable |
| `ensuring` | card_class.rb:64 | private | external |
| `fetch_for_ensure_with_codename_and_name` | card_class.rb:93 | private | internal-reachable |
| `fetch_and_assign` | card_class.rb:102 | private | internal-reachable |
| `ensuring_purity` | card_class.rb:110 | private | internal-reachable |
| `act_director` | class_methods.rb:9 | public | external |
| `directors` | class_methods.rb:13 | public | internal-reachable |
| `clear` | class_methods.rb:31 | public | port-bound |
| `include_id?` | class_methods.rb:65 | public | unreachable |
| `card_changed` | class_methods.rb:80 | public | external |
| `deep_delete` | class_methods.rb:94 | public | external |
| `new_director` | class_methods.rb:107 | private | internal-reachable |
| `running_act?` | class_methods.rb:115 | private | internal-reachable |
| `run_job_with_act` | event_delay.rb:29 | public | internal-reachable |
| `with_env_and_auth` | event_delay.rb:35 | public | internal-reachable |
| `validation_phase_callback?` | phases.rb:9 | public | unreachable |
| `integration_phase_callback?` | phases.rb:13 | public | unreachable |
| `prepare_for_phases` | phases.rb:17 | public | external |
| `validation_phase` | phases.rb:24 | public | unreachable |
| `catch_up_to_stage` | run.rb:5 | public | external |
| `run_delayed_event` | run.rb:13 | public | external |
| `handle_stage` | run.rb:44 | private | internal-reachable |
| `run_stage_callbacks` | run.rb:56 | private | external |
| `run_subcard_stages` | run.rb:68 | private | external |
| `each_subcard_director` | run.rb:75 | private | internal-reachable |
| `run_final_stage_callbacks` | run.rb:83 | private | internal-reachable |
| `upto_stage` | run.rb:87 | private | internal-reachable |
| `valid_next_stage?` | run.rb:94 | private | internal-reachable |
| `valid_card?` | run.rb:105 | private | internal-reachable |
| `check_skipped_stage` | run.rb:109 | private | internal-reachable |
| `ahead_of_parent?` | run.rb:116 | private | internal-reachable |
| `stage_symbol` | stages.rb:15 | public | external |
| `stage_index` | stages.rb:25 | public | external |
| `stage_ok?` | stages.rb:38 | public | external |
| `finished_stage?` | stages.rb:45 | public | unreachable |
| `reset_stage` | stages.rb:49 | public | external |
| `previous_stage_index` | stages.rb:55 | private | external |
| `previous_stage_symbol` | stages.rb:60 | private | external |
| `in_or_before?` | stages.rb:68 | private | external |
| `in_or_after?` | stages.rb:76 | private | external |
| `stage_test` | stages.rb:84 | private | internal-reachable |
| `after_store` | store.rb:5 | public | external |
| `after_store?` | store.rb:12 | public | internal-reachable |
| `store_with_subcards` | store.rb:37 | private | internal-reachable |
| `run_after_store_callbacks` | store.rb:47 | private | internal-reachable |
| `store_pre_subcards` | store.rb:53 | private | internal-reachable |
| `store_post_subcards` | store.rb:57 | private | internal-reachable |
| `trigger_storage_phase_callback` | store.rb:65 | private | internal-reachable |
| `initialize_with_subcards` | subdirector_array.rb:5 | public | external |
| `fetch_new` | subdirector_array.rb:39 | private | internal-reachable |

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
