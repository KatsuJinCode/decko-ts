# reg-treewalk-c2-auth-token-rb-10-33

- Ruby's file set: `card-1.110.0/lib/card/auth/token.rb`
- The row's own label: `auth/token.rb:10-33`
- 1 Ruby file(s), 5 def(s).
- PORTED 0 / PORTED-INLINE 5 / NAMED-COLLAPSE 0 / SKIP 0 / INERT-API 0 / GAP 0.

## Verdict: DONE

The port measurably matches the pinned Ruby on this row's whole surface: The port carries all five of the row's methods and cites the Ruby for each: encode is the port's `encodeAuthToken` (src/card/auth/token.ts:309), validate! is at :466, decode at :370, expiration at :169, and signin_with_token is the port's `signinFromToken` (src/server/request-authenticators.ts:123), which cites card-1.110.0/lib/card/auth/token.rb:38-41 by name. The pinned bytes were executed to confirm the behaviours: decode answers with the error MESSAGE on a bad token rather than raising, and expiration reads the config.

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
