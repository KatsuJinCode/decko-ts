# reg-treewalk-e1

- Ruby's file set: `card-1.110.0/mod/core/set/ (25)`
- The row's own label: the core mod's 25 set modules
- 24 Ruby file(s), 169 def(s).
- PORTED 45 / PORTED-INLINE 74 / NAMED-COLLAPSE 3 / SKIP 9 / INERT-API 0 / GAP 38.

## Verdict: WORKING ON IT

The port does not carry 38 of the row's defs: the port carries the core mod by a different mechanism: the row's thirty-eight defs are the core mod's admin and set-module surface, and the port's equivalents are the core-admin-runtime (src/card/mod-loader/mods/core-admin-runtime.ts) and the core mod's own registrations (src/card/mod-loader/mods/core-mod.ts).

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `section_title` | admin.rb:71 | public | internal-reachable |
| `admin_config_group_by_properties` | admin.rb:109 | private | internal-reachable |
| `assign_or_newish` | assign_attributes.rb:23 | public | external |
| `prepare_assignment_args` | assign_attributes.rb:41 | public | internal-reachable |
| `assign_with_set_modules` | assign_attributes.rb:51 | public | internal-reachable |
| `assign_with_subcards` | assign_attributes.rb:57 | public | internal-reachable |
| `stash_set_specific_attributes` | assign_attributes.rb:70 | public | internal-reachable |
| `autoname?` | autoname.rb:14 | public | port-bound |
| `blank_comment?` | content.rb:38 | public | internal-reachable |
| `with_normalized_new_args` | initialize.rb:11 | public | external |
| `delete_junk_args` | initialize.rb:21 | private | internal-reachable |
| `normalize_type_args` | initialize.rb:25 | private | internal-reachable |
| `normalize_content_args` | initialize.rb:29 | private | internal-reachable |
| `handle_set_modules` | initialize.rb:45 | private | internal-reachable |
| `initial_name` | initialize.rb:57 | private | internal-reachable |
| `include_set_module` | initialize.rb:72 | private | external |
| `aborting` | result.rb:30 | public | external |
| `abort_success` | result.rb:52 | private | internal-reachable |
| `user_changes?` | states.rb:99 | public | internal-reachable |
| `trashed_left?` | subcards.rb:15 | public | external |
| `same_field?` | subcards.rb:22 | public | unreachable |
| `db_attributes` | trash.rb:74 | public | unreachable |
| `delete_as_subcard` | trash.rb:78 | public | internal-reachable |
| `type_name_or_default` | type.rb:40 | public | external |
| `type_cardname` | type.rb:44 | public | unreachable |
| `normalize_type_attributes` | type.rb:82 | private | external |
| `mod_path` | utils.rb:1 | public | external |
| `trashed_cards` | trash.rb:11 | public | unreachable |
| `trash_table_row` | trash.rb:15 | public | unreachable |
| `empty_trash_link` | trash.rb:33 | public | unreachable |
| `history_link` | trash.rb:45 | public | unreachable |
| `restore_link` | trash.rb:50 | public | unreachable |
| `create_ok?` | cardtype.rb:7 | public | external |
| `styles?` | mod.rb:110 | public | port-bound |
| `admin_config_section` | mod.rb:176 | public | internal-reachable |
| `admin_config_objects_by_category` | mod.rb:196 | public | unreachable |
| `load_admin_config` | mod.rb:201 | public | internal-reachable |
| `admin_config_path` | mod.rb:216 | public | internal-reachable |

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
