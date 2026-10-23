# reg-treewalk-e3

- Ruby's file set: `card-1.110.0/mod/core/data/ (71)`
- The row's own label: 58 migration files, real.yml/test.yml/recode.yml, 7 fixtures
- 47 Ruby file(s), 110 def(s).
- PORTED 0 / PORTED-INLINE 0 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 57 / GAP 53.

## Verdict: WORKING ON IT

The port does not carry 53 of the row's defs: The port has no Rails migration history and no Rails seed loader: the row's fifty-three defs are the schema and transform migrations themselves, and the port's schema is its own (db/schema.sqlite.sql) with the deck's data read as a seed corpus.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `up` | 20160122153608_require_0_1_migrations.rb:4 | public | port-bound |
| `up` | 20170908114442_create_delayed_jobs.rb:2 | public | port-bound |
| `up` | 20170908114452_increase_text_size_for_delayed_jobs.rb:2 | public | port-bound |
| `up` | 20180514152037_add_card_virtuals_table.rb:4 | public | port-bound |
| `up` | 20190116170824_add_left_key_to_card_virtuals.rb:4 | public | port-bound |
| `up` | 20190131223248_add_codename_index.rb:2 | public | port-bound |
| `up` | 20190929202325_rename_present_in_reference_table.rb:2 | public | port-bound |
| `change` | 20200718051236_compound_names_do_not_store_name_and_key.rb:2 | public | port-bound |
| `change` | 20200805200729_add_unique_pair_indices.rb:2 | public | port-bound |
| `connection` | 20200805200729_add_unique_pair_indices.rb:38 | private | external |
| `up` | 20211128040849_virtuals_updated_at.rb:4 | public | port-bound |
| `up` | 20221031182227_remove_referee_key_requirement.rb:4 | public | port-bound |
| `up` | 20240628212556_add_trash_index.rb:4 | public | port-bound |
| `up` | 20241017160402_unique_codename.rb:4 | public | port-bound |
| `up` | 20251110200407_remove_legacy_tables.rb:4 | public | port-bound |
| `word` | 20120611203506_rails_inflection_updates.rb:4 | public | port-bound |
| `up` | 20120611203506_rails_inflection_updates.rb:37 | public | port-bound |
| `up` | 20130411191151_renaming_for_menu.rb:14 | public | port-bound |
| `up` | 20130920214038_jsonize_tinymce.rb:4 | public | port-bound |
| `up` | 20130920291703_update_stylesheets.rb:4 | public | port-bound |
| `up` | 20140307231621_user_data_to_cards.rb:7 | public | port-bound |
| `field_content` | 20140307231621_user_data_to_cards.rb:30 | public | external |
| `up` | 20140317035504_account_requests_to_signups.rb:4 | public | port-bound |
| `up` | 20141204061304_watchers_to_following.rb:4 | public | port-bound |
| `up` | 20141208132416_partial_reference_type.rb:4 | public | port-bound |
| `up` | 20150220134731_following_to_follow_rule.rb:4 | public | port-bound |
| `up` | 20150429090551_search_card_context.rb:4 | public | port-bound |
| `up` | 20150510031118_fix_skin_codenames.rb:4 | public | port-bound |
| `up` | 20150724123438_update_file_and_image_cards.rb:4 | public | port-bound |
| `up` | 20150807205221_create_references_for_search_cards.rb:4 | public | port-bound |
| `up` | 20150824135418_update_file_history.rb:4 | public | port-bound |
| `up` | 20160811115836_rename_stats_to_admin.rb:4 | public | port-bound |
| `up` | 20160914132636_fix_mod_files.rb:4 | public | port-bound |
| `up` | 20161103154836_update_keys.rb:4 | public | port-bound |
| `up` | 20170830210517_correct_signup_success_message.rb:4 | public | port-bound |
| `up` | 20180905061537_migrate_layouts.rb:4 | public | port-bound |
| `body_tag` | 20180905061537_migrate_layouts.rb:26 | public | internal-reachable |
| `missing` | 20180905061537_migrate_layouts.rb:56 | public | port-bound |
| `up` | 20190125125150_add_script_rules_card.rb:4 | public | port-bound |
| `up` | 20190320091257_upgrade_recaptcha_to_v3.rb:4 | public | port-bound |
| `up` | 20190322095534_remove_toolbar_cards.rb:4 | public | port-bound |
| `up` | 20190502130029_add_shark_and_help_desk_role.rb:4 | public | port-bound |
| `up` | 20190528131330_enabled_roles.rb:4 | public | port-bound |
| `up` | 20190625153616_pointer_overhaul.rb:4 | public | port-bound |
| `up` | 20190718140126_add_guides.rb:15 | public | port-bound |
| `up` | 20190822093633_move_help_text_to_code.rb:4 | public | port-bound |
| `up` | 20190829205148_remove_add_help.rb:4 | public | port-bound |
| `up` | 20190902193208_input_type.rb:4 | public | port-bound |
| `up` | 20190904174403_token_upgrade.rb:4 | public | port-bound |
| `up` | 20190909104250_add_cardtype_input_types.rb:4 | public | port-bound |
| `up` | 20191115160748_history_cleanup.rb:4 | public | port-bound |
| `create_only_actions` | 20191115160748_history_cleanup.rb:18 | public | unreachable |
| `up` | 20230502094848_repair_all_references.rb:4 | public | port-bound |

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
