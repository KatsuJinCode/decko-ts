# Row smell-cf-account-check

Smell-test row conversion, round two, 2026-10-22. Disposition: DONE.

- Roster row: `smell-cf-account-check` (roster file:
  `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/decko-ts-smell-convert-r2-20261022/tools/d1-trickle/cf-account-check.mjs`
  (the file the roster names at `C:/localProjects/decko-ts-release-lead/tools/d1-trickle/cf-account-check.mjs`
  is the same file in the same repository)
- What this lane did: found the Cloudflare credential pair that earlier lanes recorded as
  absent, and ran the row's own read-only inspection with it, twice, once per credential pair
  the machine holds.
- Command: `node tools/d1-trickle/cf-account-check.mjs --creds-file C:/localProjects/brandonDojoTech/library/data/creds --token-key BRANDON_CF_API_TOKEN --account-key BRANDON_CF_ACCOUNT_ID`
- Command: `node tools/d1-trickle/cf-account-check.mjs --creds-file C:/localProjects/brandonDojoTech/library/data/secrets.env --token-key CLOUDFLARE_DECKO_TS_API_TOKEN --account-key CLOUDFLARE_DECKO_TS_ACCOUNT_ID`
- Observed: both runs completed and printed the account report. Each report names the account
  and its type, the D1 databases the credential can list, the Workers scripts, the Workers
  subdomain, and the state of the token itself.

## The blocker that was recorded, and what is true now

The row was recorded as NOT-RUNNABLE with the sentence that the account credential does not
exist on disk. That sentence was a naming mistake, not a fact: the credential pair does
exist, under different key names. The creds file
`C:/localProjects/brandonDojoTech/library/data/creds` carries `BRANDON_CF_ACCOUNT_ID` and
`BRANDON_CF_API_TOKEN`, and the secrets file
`C:/localProjects/brandonDojoTech/library/data/secrets.env` carries
`CLOUDFLARE_DECKO_TS_ACCOUNT_ID` and `CLOUDFLARE_DECKO_TS_API_TOKEN`. Earlier lanes looked
for `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the creds file, did not find them,
and concluded the credential was absent. The instrument takes both key names as flags, so
naming the pair that exists is all that was needed. No credential value was read into any
output and none is recorded here; the key names only.

The fail-closed behaviour of the instrument is intact and was exercised first: with no flags
it refuses with `cf-account-check needs --creds-file`, and with a creds file that does not
carry the named pair it refuses by naming the two keys it needs.

## What the report says, stated plainly

Both credential pairs read their account successfully, and the reports list the D1 databases,
the Workers scripts and the Workers subdomain each account holds. Two of the seven probes
came back unavailable in both runs, and this is recorded rather than smoothed over: the
account-scoped token verification endpoint answers `401` with `Invalid API Token` for both
credentials, while the user token verification answers `active` with no expiry, and the
subscriptions endpoint answers `403` with an authentication error. The credential works for
account-scoped reads; it does not verify through the token endpoint this instrument probes
first, and it cannot read subscriptions.

## What this receipt does and does not claim

The instrument is a read-only inspection: it verifies a credential against the account it
points at and reports what that credential can read. It mutates nothing. This row is closed
because the row's own verification ran and produced that inspection, with the two refusals
named. The row is not a statement that the account is in any particular state, and this
receipt does not claim that the token verifies.
