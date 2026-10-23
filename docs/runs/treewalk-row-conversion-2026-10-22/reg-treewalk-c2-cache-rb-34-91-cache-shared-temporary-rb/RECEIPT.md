# reg-treewalk-c2-cache-rb-34-91-cache-shared-temporary-rb

- Ruby's file set: `card-1.110.0/lib/card/cache.rb`
- The row's own label: `cache.rb:34-91` + `cache/{shared,temporary}.rb`
- 1 Ruby file(s), 10 def(s).
- PORTED 3 / PORTED-INLINE 5 / NAMED-COLLAPSE 1 / SKIP 0 / INERT-API 0 / GAP 1.

## Verdict: WORKING ON IT

The port does not carry 1 of the row's defs: The port carries the guard as INLINE behaviour and does not cite the helper: `with_multiple_keys` (cache.rb:95-99) is the one-line guard that makes a multi-key read return nothing for one key, and the port's readMulti opens with exactly that condition (src/card/fetch/cache.ts:337) without naming the helper.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `with_multiple_keys` | cache.rb:95 | private | internal-reachable |

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
