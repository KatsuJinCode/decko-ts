# reg-treewalk-c2-name-rb-name-all-all-descendants-all-parts-card-cl

- Ruby's file set: `card-1.110.0/lib/card/name.rb, name/{all,all/descendants,all/parts,card_class,name_variants}.rb`
- The row's own label: `name.rb`, `name/{all,all/descendants,all/parts,card_class,name_variants}.rb`
- 6 Ruby file(s), 55 def(s).
- PORTED 27 / PORTED-INLINE 15 / NAMED-COLLAPSE 1 / SKIP 4 / INERT-API 0 / GAP 8.

## Verdict: WORKING ON IT

The port does not carry 8 of the row's defs: The port carries the name composition under its own surface and does not have Ruby's SAVE-TIME supercard/subcard graph: the row's eight remaining defs are update_superleft's @superleft memo and update_subcard_names' walk over the unsaved subcards (name/all.rb:47-56), superize_name, the parts writer's id resolution with its after-store hook (write_card_or_id, when_id_exists, with_id_after_store, name/all/parts.rb:43-62), and the field readers field_cards and field_names (name/all/descendants.rb:9-14). The port's save path carries the rename cascade through its own name events and the subcard act (src/card/actions/card-action-engine.ts, the name_events map in its header), so the in-memory graph those defs serve has no port counterpart to update; the construction half (new_from_parts, codename_or_string, uniquify_name) measures PORTED against src/card/name.ts and the write engine.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `update_superleft` | all.rb:47 | public | external |
| `update_subcard_names` | all.rb:52 | public | unreachable |
| `superize_name` | all.rb:92 | private | external |
| `field_cards` | descendants.rb:9 | public | unreachable |
| `field_names` | descendants.rb:13 | public | unreachable |
| `write_card_or_id` | parts.rb:43 | private | external |
| `when_id_exists` | parts.rb:47 | private | internal-reachable |
| `with_id_after_store` | parts.rb:60 | private | internal-reachable |

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
