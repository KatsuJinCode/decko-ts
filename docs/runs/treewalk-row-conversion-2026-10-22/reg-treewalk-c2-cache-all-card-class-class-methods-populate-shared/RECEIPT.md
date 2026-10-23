# reg-treewalk-c2-cache-all-card-class-class-methods-populate-shared

- Ruby's file set: `card-1.110.0/lib/card/cache/{all,card_class,class_methods,populate,shared_class}.rb`
- The row's own label: `cache/{all,card_class,class_methods,populate,shared_class}.rb`
- 5 Ruby file(s), 51 def(s).
- PORTED 18 / PORTED-INLINE 25 / NAMED-COLLAPSE 1 / SKIP 0 / INERT-API 0 / GAP 7.

## Verdict: WORKING ON IT

The port does not carry 7 of the row's defs: the port fills its cache on demand and has no class-level cache registry: the row's defs are the cache POPULATION half (Ruby pre-fills the cache at boot), the class-level REGISTRY and the shared-cache STAMP, none of which the port has a counterpart for.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `codename_card?` | all.rb:41 | private | internal-reachable |
| `reset` | class_methods.rb:47 | public | port-bound |
| `shared_cache` | class_methods.rb:107 | public | port-bound |
| `populate_ids` | populate.rb:5 | public | external |
| `seed_from_stash` | populate.rb:49 | private | external |
| `stamp` | shared_class.rb:5 | public | port-bound |
| `reset` | shared_class.rb:22 | public | port-bound |

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
