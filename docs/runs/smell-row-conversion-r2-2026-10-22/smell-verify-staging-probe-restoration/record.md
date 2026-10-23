# Row smell-verify-staging-probe-restoration

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-verify-staging-probe-restoration`
- Instrument: `C:/localProjects/brandonDojoText/recovery/release/private-probes/private-tool-repairs-20261018/verify-staging-probe-restoration.mjs`
  (the file is at `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/verify-staging-probe-restoration.mjs`)
- What this lane did: read the instrument and established what it would do and what state
  its outputs are in.
- Command: not run; the instrument makes live account API calls and its one-shot output
  already exists.
- Observed, first hand: the instrument reads the account key from
  `C:/localProjects/brandonDojoTech/library/data/secrets.env` (the key name
  `BUNNY_ACCOUNT_API_KEY`; no value was read into any output and none is recorded here) and
  then issues two live `api.bunny.net` metadata reads, one for script id 96895 and one for
  script id 96867, and writes its receipt with the exclusive-create flag. Its one-shot
  output `staging-probe-restoration-independent-20261019.json` is present in the evidence
  tree.
- Gap, in one mechanism sentence: the row's verification is two account-level live API
  calls whose result would duplicate a receipt of record that already exists, and whose
  expectations the 2026-10-20 flags audit showed have moved on the live scripts, so neither
  the call nor a fresh receipt is this lane's to make.

## What would close it

An operator decision to spend the two live metadata reads on this row, with the one-shot
output path cleared and the expected flag values refreshed to the live state, or an
acceptance of the standing receipt as the row's answer.
