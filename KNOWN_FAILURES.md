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

## The MySQL lane: the port's id allocation diverges from Ruby's

The recorded 2026-10-15 MySQL 8.4.11 runs use the pinned Ruby 3.3.12
oracle. `tools/same-database/mysql-lane-compare.mjs` compares rendering and
semantics only: Ruby and the port agree on 1752 of 1752 render and 2388 of
2388 semantics operations. It does not establish scenario parity.
The lane overlay `fixtures/synthetic-v1/expected-lanes/mysql/` holds 6
render, 3 semantics and 11 scenario answers copied byte-for-byte from the
recorded stock Ruby-on-MySQL run. These are Ruby's lane expectations,
including the `Not Topics` ties and the scenario writes' ids. Grading the
recorded port run against those expectations fails:
rendering 1754 of 1754, semantics 2389 of 2389, but persistence 4 of 16 and
side effects 15 of 19. The failures are the write steps' card ids, the same
card created on the same database with a different id: `create-tag-as-member`
Ruby 916, port 911; `create-memo-member-then-read-denied-anonymous` Ruby 915,
port 911; `create-compound-on-new-left` Ruby 919, port 913; and the rows that
name those ids. The mechanism is not yet established: Ruby's ids come from
MySQL's auto-increment counter, which InnoDB advances on a rolled-back insert,
while the port computes the next id from the current rows
(`src/card/history/write-path.ts`). The finding is left open, not declared and
not overlaid.
