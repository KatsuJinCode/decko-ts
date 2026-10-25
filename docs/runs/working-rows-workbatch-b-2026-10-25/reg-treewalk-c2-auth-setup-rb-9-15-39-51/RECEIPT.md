# reg-treewalk-c2-auth-setup-rb-9-15-39-51

- Family: register-treewalk.
- Row: `card-1.110.0/lib/card/auth/setup.rb:9-15, 39-51` (the auth setup module's defs).
- Verdict at the time of this lane: DIVERGENT, bucket WORKING ON IT, blocker REAL-GAP: 7
  methods, 3 with a port counterpart, 4 without (needs_setup?, simulate_setup!,
  instant_account_activation, user_account_ids). Fix: port the named methods.

## Verdict: DONE - the executed oracle capture and its parity pin supersede the stale def census

Base: `deploy/full-candidate-20261101` tip `c17906db`, branch `port/workbatch-b-20261025`.
The blocker's census is written against an older tree and an older instrument. The tree this
receipt measures carries the executed instrument and the pin built on it:

- The EXECUTED Ruby oracle capture `fixtures/captured/card-auth-setup-methods-ruby-oracle.json`
  records the row id, the file set (`card-1.110.0/lib/card/auth/setup.rb`), all 7 defs
  probed in the pinned gem (14 probes, recorded by
  `tests/server/oracle-capture-card-gem-row-methods-ruby.rb`), with counts
  PORTED-INLINE 6 / INERT-API 1 and the gap reason naming the defs the port does not carry.
- The parity pin `tests/server/card-auth-setup-methods-parity.test.ts` checks, at this tree:
  the pinned bytes as the capture recorded them (including instant_account_activation
  raising LocalJumpError because the helper it calls, `simulate_needs_setup!`, is defined in
  NO gem, and its ArgumentError arm); the rig's reachability measurement for the test-surface
  defs; the port's own source naming the defs it does not carry with the mechanism
  (`src/card/auth/first-run-setup.ts` header, lines 36-56: the four census defs ported
  inline with their Ruby line cites, the two named test-surface defs with the reason); and
  the port's own count (`countUserAccounts`, `src/card/auth/first-run-setup.ts:324`) as the
  census counterpart that never needs the id list (`user_account_ids`).
- The family receipt `docs/runs/treewalk-row-conversion-2026-10-22/reg-treewalk-c2-auth-setup-rb-9-15-39-51/RECEIPT.md`
  records the same shape: the census carried, the remainder the deck's own test surface
  (simulate_setup! called only from the pinned deck's cucumber environment,
  `decko-0.20.0/features/support/decko_env.rb:33,37`; instant_account_activation a test-only
  helper the pinned deck never calls; user_account_ids the id list behind the count).

Checks run at the base of this receipt (this lane, this tree):

- `npx vitest run tests/server/card-auth-setup-methods-parity.test.ts` (in the 3-file run
  with the holder-name guard and subcard-cached-upload pins): 9 tests passed.
- The fixture and the port header were read at this tree; the counts and line cites above
  are this session's reads.

Against this evidence the roster blocker's "4 defs missing, port the named methods" does
not stand: needs_setup? and the census are ported inline at the cited lines (the blocker's
own list included them only because the census predates the header map), and the remaining
defs are the deck's test surface, named with mechanism and reachability, which the
register's own standard carries as a named remainder rather than a port obligation. The
executed capture is the oracle match; the pin makes it machine-checkable.
