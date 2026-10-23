# reg-treewalk-c2-rule-rb-rule-all-cache-preference-cache-read-rule-

- Ruby's file set: `card-1.110.0/lib/card/rule.rb, rule/{all,cache,preference_cache,read_rule_cache}.rb`
- The row's own label: `rule.rb`, `rule/{all,cache,preference_cache,read_rule_cache}.rb`
- 5 Ruby file(s), 39 def(s).
- PORTED 11 / PORTED-INLINE 20 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 8.

## Verdict: WORKING ON IT

The port does not carry 8 of the row's defs: the port carries the rule cache READ path and the invalidation is its write path's job: the row's eight defs are the cache-clearing surface and the preference helpers behind it.

The defs the port does not carry:

| def | Ruby | visibility | the pinned deck reaches it |
| --- | --- | --- | --- |
| `clear_preference_cache` | rule.rb:31 | public | external |
| `clear_read_rule_cache` | rule.rb:35 | public | external |
| `all_user_ids` | rule.rb:55 | private | internal-reachable |
| `preference_user_id` | all.rb:56 | private | internal-reachable |
| `clear` | cache.rb:36 | public | port-bound |
| `populate_user_ids` | preference_cache.rb:45 | public | internal-reachable |
| `user_id_hash` | preference_cache.rb:49 | public | internal-reachable |
| `clear` | preference_cache.rb:57 | public | port-bound |

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
