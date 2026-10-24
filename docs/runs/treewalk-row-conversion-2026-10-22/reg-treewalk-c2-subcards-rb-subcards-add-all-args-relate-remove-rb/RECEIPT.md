# reg-treewalk-c2-subcards-rb-subcards-add-all-args-relate-remove-rb

- Ruby's file set: `card-1.110.0/lib/card/subcards.rb, subcards/{add,all,args,relate,remove}.rb`
- The row's own label: `subcards.rb`, `subcards/{add,all,args,relate,remove}.rb`
- 6 Ruby file(s), 46 def(s).
- PORTED 10 / PORTED-INLINE 8 / NAMED-COLLAPSE 1 / SKIP 0 / INERT-API 0 / GAP 27.

## Verdict: WORKING ON IT

The port does not carry 27 of the row's defs: The port saves a card's subcards in the same act and has no sub-card API: the row's twenty-six defs are the add, the remove and the reads around them, and the port's write path is the action engine's (src/card/actions/card-action-engine.ts).

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `catch_up_to_stage` | subcards.rb:44 | public | external |
| `respond_to_missing?` | subcards.rb:57 | public | unreachable |
| `each_card` | subcards.rb:77 | public | external |
| `each_with_key` | subcards.rb:83 | public | external |
| `fetch_subcard` | subcards.rb:90 | public | external |
| `subcard_key` | subcards.rb:96 | private | external |
| `absolutize_subcard_name` | subcards.rb:106 | private | external |
| `add_hash` | add.rb:40 | public | internal-reachable |
| `add_child` | add.rb:48 | public | unreachable |
| `new_by_card` | add.rb:54 | public | internal-reachable |
| `new_by_attributes` | add.rb:63 | public | internal-reachable |
| `initialize_by_attributes` | add.rb:73 | public | internal-reachable |
| `multi_add` | add.rb:81 | private | internal-reachable |
| `subcard_content` | all.rb:24 | public | unreachable |
| `drop_subcard` | all.rb:57 | public | external |
| `drop_field` | all.rb:61 | public | unreachable |
| `extract_subcard_args!` | args.rb:5 | public | external |
| `safe_subcard_args` | args.rb:15 | private | internal-reachable |
| `extract_explicit_fields` | args.rb:21 | private | internal-reachable |
| `extract_implicit_fields` | args.rb:35 | private | internal-reachable |
| `field_name_to_key` | relate.rb:5 | public | external |
| `relative_child` | relate.rb:22 | public | internal-reachable |
| `remove_child` | remove.rb:5 | public | unreachable |
| `remove` | remove.rb:11 | public | port-bound |
| `clear` | remove.rb:19 | public | port-bound |
| `clear_key` | remove.rb:24 | public | internal-reachable |
| `deep_clear` | remove.rb:33 | public | unreachable |

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
