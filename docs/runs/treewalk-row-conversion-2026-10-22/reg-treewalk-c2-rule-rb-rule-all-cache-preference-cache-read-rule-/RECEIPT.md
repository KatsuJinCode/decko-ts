# reg-treewalk-c2-rule-rb-rule-all-cache-preference-cache-read-rule-

- Ruby's file set: `card-1.110.0/lib/card/rule.rb, rule/{all,cache,preference_cache,read_rule_cache}.rb`
- The row's own label: `rule.rb`, `rule/{all,cache,preference_cache,read_rule_cache}.rb`
- 5 Ruby file(s), 39 def(s).
- PORTED 12 / PORTED-INLINE 27 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port carries the row's eight gap defs by citation and by one new function. preference_user_id is the port's preferenceUserId (src/card/rules/lookup.ts), Ruby's same case expression: an Integer passes through, a Card gives its id, nil answers the caller's current actor id, anything else raises the ServerError message (tests/card/rules/preference-user-id.test.ts pins each branch). all_user_ids, user_id_hash and populate_user_ids are the port's own preference-resolution reads, named at their sites in src/card/notify/follower-resolver.ts: the user-type id read with Ruby's deliberately-no-trash-filter shape, the USER_ID_CACHE_KEY hash over the resolved rows (one named divergence: the index dedups user ids where Ruby appends), and the resolver-lifetime memo that holds the index. The cache clears - clear_preference_cache and clear_read_rule_cache (rule.rb:28-37) and the caches' own clear (cache.rb:35-37, preference_cache.rb:56-59) - are named in the port's own invalidation statement (src/card/rules/rule-cache.ts): the port holds no deck-wide cached hash for them to clear, because the rule lookup state drops unconditionally on every committed save and the preference index lives for one resolver only. The pinned bytes were executed for the row's probes.

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
