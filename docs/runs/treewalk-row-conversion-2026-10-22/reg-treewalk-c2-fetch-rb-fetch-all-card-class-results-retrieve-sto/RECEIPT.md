# reg-treewalk-c2-fetch-rb-fetch-all-card-class-results-retrieve-sto

- Ruby's file set: `card-1.110.0/lib/card/fetch.rb, fetch/{all,card_class,results,retrieve,store}.rb`
- The row's own label: `fetch.rb`, `fetch/{all,card_class,results,retrieve,store}.rb`
- 6 Ruby file(s), 57 def(s).
- PORTED 21 / PORTED-INLINE 27 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 9.

## Verdict: WORKING ON IT

The port does not carry 9 of the row's defs: the port has no Ruby-shaped fetch options and no results helpers: the row's defs are validate_opts! (the guard that refuses a contradictory options pair), the newish and refresh helpers and the results helpers, and the port carries the guard by its own mechanism (src/card/fetch.ts:223-226).

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `validate_opts!` | fetch.rb:43 | public | internal-reachable |
| `newish` | all.rb:13 | public | external |
| `refresh` | all.rb:23 | public | port-bound |
| `fetch_from_cast` | card_class.rb:59 | public | external |
| `fetch_name` | card_class.rb:86 | public | unreachable |
| `standard_uri_fetch` | card_class.rb:118 | private | internal-reachable |
| `type_id_from_new_opts` | results.rb:111 | public | internal-reachable |
| `prefetch_rule` | retrieve.rb:14 | public | external |
| `prep_modules` | store.rb:12 | public | internal-reachable |

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
