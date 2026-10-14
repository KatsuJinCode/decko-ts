# Known test failures

This file lists the test suites that fail on a clean clone of this tree, so a
red run is read correctly. It is regenerated from a full run of the tree it
ships with; a suite that passes is not listed.

Derived on 2026-10-14 from `npm test` on this tree: **no suite fails.** The table
is kept, empty, because the release check reads it.

The first cell of every table row must be a **backticked path**:
`scripts/release-check.mjs` reads this file with
`/^\s*\|\s*`([^`]+)`\s*\|/`, and a row whose first cell is not backticked is
invisible to it.

| Suite | Failing assertions | Prerequisite to green |
|---|---|---|

## Suites that can fail under load and pass alone

These are not failures of the code. Each starts servers, spawns processes or
shares temporary state, and has gone red inside a busy full run while passing
when run on its own. If a red result names one of them, re-run it alone before
believing it; if it fails alone, it is a real failure and belongs in the table.

- `tests/card/actions/atomic-saves.test.ts` — its first-use engine build shares
  temporary state with concurrent suites.
- `tests/exercise/accounts-3.test.ts`,
  `tests/card/auth/first-run-setup-endpoint.test.ts` and
  the reset-flow endpoint suite (not in the public package) — each boots a local server
  and races the shared temporary directory during auth setup. (On
  2026-10-14 the reset-flow suite failed one check inside a full run and
  passed all 14 alone.)
- `tests/tools/shadow/migration-parity-shadow.test.mjs` — drives a stub
  instrument that spawns processes; under contention a varying subset of its 68
  tests fails, a different subset each time.
- `tests/server/blob-bunny-mock.test.ts` — runs a mock storage server on a
  loopback port, which can lose the port under load (`fetch failed`).

## A suite that reports a failure when a prerequisite is missing

`tests/tools/mod-porting-harness/format-census-view-set.test.ts` compares
against an installed Ruby gem tree. Where that tree is present it runs and
passes. Where it is not, Vitest still evaluates the suite's `describe.skip`
body to collect test names, the Ruby call at the top of that body aborts, and
the file is reported as a failed suite with no tests run, carrying the
missing-directory message. That names a missing prerequisite, not a defect.
