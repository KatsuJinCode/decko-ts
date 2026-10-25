# Row smell-apply-remote-widget-cas

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-apply-remote-widget-cas` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/apply-remote-widget-cas.mjs`
- What this lane did: Did not run it. The probe is a one-shot compare-and-swap write against a live production database, and the prepared credential is on this machine, so running it would perform a live production write that is an operator decision, not this lane's.
- Command: `not run, by the row's own construction and by the live-write boundary`
- Observed: First-hand fact: the prepared credential exists at decko-ts-release-lead/.runtime/owned-cs-edge-cleanup-20261018.env (the row smell-prepare-owned-database-access records it as prepared and not retired). The probe's own guard demands an exact owned unexpired access and mints nothing.
- Gap, in one mechanism sentence: the row's verification is a live production-database write, which this lane does not perform, and the write is one-shot by construction, so it cannot be re-run either.
- Pin: tests/tools/remote-widget-cas-freshness-stamp-admission-is-intact.test.ts, UPDATED in this lane: its assertion that .runtime/ does not exist in this tree went stale when this lane built the engine in this checkout. The assertion is now the property that matters: this tree carries no credential file under .runtime/ (a build receipt is not a credential). Run on this branch: 3 tests passed.

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
