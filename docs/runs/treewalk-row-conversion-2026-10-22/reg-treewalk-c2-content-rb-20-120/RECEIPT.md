# reg-treewalk-c2-content-rb-20-120

- Ruby's file set: `card-1.110.0/lib/card/content.rb`
- The row's own label: `content.rb:20-120`
- 1 Ruby file(s), 16 def(s).
- PORTED 2 / PORTED-INLINE 3 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 11.

## Verdict: WORKING ON IT

The port does not carry 11 of the row's defs: the port has no chunk-QUERY API: the row's defs find the chunks of a type, walk them and strip them, and the port's chunk surface is the RENDERER's nest syntax (src/card/render/nest-syntax.ts) rather than Ruby's query surface.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `find_chunks` | content.rb:38 | public | external |
| `has_chunk?` | content.rb:43 | public | external |
| `custom_process_chunks` | content.rb:54 | public | internal-reachable |
| `each_chunk` | content.rb:64 | public | external |
| `without_nests` | content.rb:99 | public | unreachable |
| `without_references` | content.rb:103 | public | external |
| `without_chunks` | content.rb:107 | public | internal-reachable |
| `strip_chunks` | content.rb:118 | public | internal-reachable |
| `interpret_chunk_type` | content.rb:124 | private | internal-reachable |
| `stash_chunks` | content.rb:137 | private | internal-reachable |
| `resolve_format` | content.rb:154 | private | internal-reachable |

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
