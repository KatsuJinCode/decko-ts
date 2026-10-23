# reg-treewalk-c2-view-rb-view-classy-permission-rb-view-cache-4

- Ruby's file set: `card-1.110.0/lib/card/view.rb, view/{classy,permission}.rb, view/cache (4)`
- The row's own label: `view.rb`, `view/{classy,permission}.rb`, `view/cache*` (4)
- 5 Ruby file(s), 55 def(s).
- PORTED 7 / PORTED-INLINE 16 / NAMED-COLLAPSE 0 / SKIP 16 / INERT-API 0 / GAP 16.

## Verdict: WORKING ON IT

The port does not carry 16 of the row's defs: The port has no view LINEAGE and no per-view cache: the row's sixteen defs are the view ancestry (root, deep_root, next_ancestor), the classy surface and the view-cache cluster, and the port's view is the format module's own.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `root` | view.rb:90 | public | port-bound |
| `root?` | view.rb:95 | public | port-bound |
| `deep_root` | view.rb:100 | public | external |
| `deep_root?` | view.rb:106 | public | external |
| `next_ancestor` | view.rb:116 | public | unreachable |
| `next_format_ancestor` | view.rb:121 | public | unreachable |
| `class_down` | classy.rb:30 | public | internal-reachable |
| `without_upped_class` | classy.rb:43 | public | unreachable |
| `add_extra_classes` | classy.rb:55 | public | internal-reachable |
| `remove_extra_classes` | classy.rb:61 | public | internal-reachable |
| `ancestor_extra_classes` | classy.rb:94 | private | internal-reachable |
| `storage_voo` | classy.rb:103 | private | internal-reachable |
| `self_extra_classes` | classy.rb:116 | private | internal-reachable |
| `class_list_type` | classy.rb:151 | private | internal-reachable |
| `cache_action` | cache_action.rb:18 | private | external |
| `log_cache_action` | cache_action.rb:24 | private | internal-reachable |

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
