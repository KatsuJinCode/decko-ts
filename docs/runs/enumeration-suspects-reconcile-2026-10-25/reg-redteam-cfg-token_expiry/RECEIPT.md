# reg-redteam-cfg-token_expiry

- Roster row: family `register-redteam`, label `token_expiry config key`,
  verdict PORTED, bucket DONE.
- The row's sourceParent: `token_expiry (railtie config key) -> PORTED
  (missed by register)`.
- The row's blocker: verified, the railtie config key is read port-side at
  the cited file.
- The register's own evidence for this row:
  `C:/localProjects/brandonDojoTech/docs/reports/decko-completeness-register-2026-10-18.md`,
  the unclaimed-config B table (line 1093): `token_expiry | PORTED (missed
  by register) | src/card/auth/token.ts:71-72 ports config.token_expiry =
  2.days (railtie cite) with the default documented as a PORTED value`.

## Verdict: SOURCE EXISTS (outcome a). The citation is added below.

## The citation (at this tree, roll tip c17906db, branch port/suspects-20261025)

The config key is read and answered in TWO port files:

- `src/card/auth/token.ts:71-73`: the railtie default, carried as the
  exported constant with its source named.
    /** Card.config.token_expiry - card-1.110.0/lib/cardio/railtie.rb:12
        `config.token_expiry = 2.days`. PORTED, not invented. */
    export const DEFAULT_TOKEN_EXPIRY_SECONDS = 2 * 24 * 60 * 60;
  The key's override surface is `TokenRuntimeConfig.tokenExpirySeconds`
  (token.ts:105-106), consumed at token.ts:161
  (`expirySeconds: config.tokenExpirySeconds ?? DEFAULT_TOKEN_EXPIRY_SECONDS`),
  the port of token.rb:33's `Card.config.token_expiry.from_now.to_i`.
- `vm-staging-server.mjs:1396-1410`: the serving host's read. `TOKEN_SECRET`
  at 1396-1397, and `TOKEN_CONFIG` at 1402-1410, whose doc comment names the
  railtie default ("cardio/railtie.rb:12 `2.days`, the value
  Auth::Token.expiration reads") and which is handed to the engine at
  vm-staging-server.mjs:1424 (`render.tokenConfig = TOKEN_CONFIG`).

The register's line cite (token.ts:71-72) still lands on the same constant
at this tree (the export sits at 73). The row's claim is unchanged.

## The original side, read and recorded

- The key's own assignment:
  `card-1.110.0/lib/cardio/railtie.rb:12` `config.token_expiry = 2.days`.
  The decko carrier gem sets none (`decko-0.20.0/lib/decko/railtie.rb` sets
  no such key; checked by grep over that file).
- The key's two readers:
  `card-1.110.0/lib/card/auth/token.rb:33`
  (`Card.config.token_expiry.from_now.to_i`) and
  `card-mod-account-0.20.0/set/right/account/views.rb:15`
  (`Card.config.token_expiry / 1.day`).
- The port's constant matches the pinned assignment's value (2 days), and
  the account view's days-divisor surface is the `:token_expiry` view the
  register's mods section already grades.

## The prior receipt for this row

None in the repo: the register B table (line 1093) is the row's only prior
evidence, which is exactly the gap the audit named. This receipt is now the
second record.
