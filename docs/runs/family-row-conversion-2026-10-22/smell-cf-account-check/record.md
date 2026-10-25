# Row smell-cf-account-check

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-cf-account-check` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `tools/d1-trickle/cf-account-check.mjs (this branch)`
- What this lane did: Read the tool's own guard and ran its flag check, without the operator's credentials: the tool checks every flag it needs BEFORE it reads anything from disk, so a run without the credentials file and the two key names is a refusal, not a call.
- Command: `node tools/d1-trickle/cf-account-check.mjs (no credentials supplied, so not run past its own guard)`
- Observed: The tool's header states it is a read-only inspection of the Cloudflare account a credentials file points at, and it needs --creds-file, --token-key and --account-key; with no credentials file on this branch there is no account to inspect and nothing to read.
- Gap, in one mechanism sentence: the check needs the account credentials the operator holds, and the script refuses without them, so no account-level answer can be produced here.
- Pin: tests/tools/d1-trickle/ (4 files). Run on this branch: npx vitest run tests/tools/d1-trickle/ - 4 files passed, 23 tests passed. The battery that covers all four tranche-2 pin files together: npx vitest run tests/tools/d1-trickle/ tests/tools/chain-join-join-rewrite-evidence-is-internally-consistent.test.ts tests/tools/feedback-duration-probe-scan-root-survives-in-the-port-tree.test.ts tests/tools/remote-widget-cas-freshness-stamp-admission-is-intact.test.ts - 7 files passed, 35 tests passed.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
