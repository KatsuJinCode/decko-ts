# reg-treewalk-c2-name-rb-name-all-all-descendants-all-parts-card-cl

- Ruby's file set: `card-1.110.0/lib/card/name.rb, name/{all,all/descendants,all/parts,card_class,name_variants}.rb`
- The row's own label: `name.rb`, `name/{all,all/descendants,all/parts,card_class,name_variants}.rb`
- 6 Ruby file(s), 55 def(s).
- PORTED 25 / PORTED-INLINE 14 / NAMED-COLLAPSE 1 / SKIP 4 / INERT-API 0 / GAP 11.

## Verdict: WORKING ON IT

The port does not carry 11 of the row's defs: The port carries the name composition under its own surface and does not have Ruby's SUPERCARD branch: the row's defs are the construction helpers, the supercard handling, the name= writer's subcard cascade and the rename helpers.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `new_from_parts` | name.rb:92 | private | internal-reachable |
| `update_superleft` | all.rb:47 | public | external |
| `update_subcard_names` | all.rb:52 | public | unreachable |
| `superize_name` | all.rb:92 | private | external |
| `field_cards` | descendants.rb:9 | public | unreachable |
| `field_names` | descendants.rb:13 | public | unreachable |
| `write_card_or_id` | parts.rb:43 | private | external |
| `when_id_exists` | parts.rb:47 | private | internal-reachable |
| `with_id_after_store` | parts.rb:60 | private | internal-reachable |
| `uniquify_name` | card_class.rb:9 | public | external |
| `codename_or_string` | name_variants.rb:41 | public | port-bound |

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
