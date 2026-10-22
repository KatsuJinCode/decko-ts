# Row smell-discover-hosted-account-entry

Family row conversion, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-discover-hosted-account-entry` (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/discover-hosted-account-entry.mjs`
- What this lane did: Did not run it: it is an anonymous read-only browser walk of the hosted edge over many pages, and the live-host rule for this lane allows exactly one batched confirmation fetch per URL at the end of a lane, never a page walk.
- Command: `not run, live hosted-edge browser walk`
- Observed: The harness module the script imports is restored now, so the row's first-named blocker (the gutted pinned checkout) is gone; what remains is the live visit itself, and the script writes its discovery receipt with a non-recursive mkdir, so a re-run would also collide with its own prior output.
- Gap, in one mechanism sentence: the row's verification is a multi-page live browser walk of the hosted edge, which this lane does not make.
- Pin: tests/tools/hosted-discovery-probe-dependencies-are-recoverable-and-read-only.test.ts (the tranche-2 pin, carried on this branch).

## Disposition

`WORKING ON IT`. The row's verification did not pass, and nothing here measures the port matching the source, so the row is not closed.
