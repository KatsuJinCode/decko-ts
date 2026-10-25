# Row conversion, round five, 2026-10-24

Lane: lane-smell-test-round3-backslice-2-1. Question asked: take the six highest-numbered
unadjudicated rows of the family in roster item order, to stay disjoint from the two rounds
running in parallel from the front of the roster, run each row's own instrument, close a row
only where its own verification ran and its own verdict holds, and leave every other row open
with the gap this lane measured, in one mechanism sentence.

The previous round left 29 rows open, 24 WORKING ON IT and 5 BLOCKED, and took the first six
of them. The round before it took the six before those. This lane took the other end: rows
24 to 29 of those 29, in roster item order.

The rows taken, in roster order: `smell-verify-hosted-widget-content`,
`smell-verify-hosted-widget-views`, `smell-verify-staging-probe-restoration`,
`smell-widget-single-statement-cas-test`, `smell-write-final-a253-manifest`,
`smell-write-found-by-integration-manifest`.

## The rows

| row | what its own verification produced | disposition |
|---|---|---|
| `smell-verify-hosted-widget-content` | the instrument read all twelve card JSON addresses on the hosted edge and every one of them answered 404, with the edge's own server-timing header on each, so the instrument's verdict is false | WORKING ON IT |
| `smell-verify-hosted-widget-views` | the instrument read all twelve named content views and all twelve answered 200 with exactly one main slot, the expected anchor and no legacy loader, so the instrument's verdict is true | DONE |
| `smell-verify-staging-probe-restoration` | the instrument made its two live metadata reads and all six flags on both scripts are unchanged from the receipt of record, while the release id of one script moved | WORKING ON IT |
| `smell-widget-single-statement-cas-test` | the suite ran and three of its four cases failed, and the deck it copies holds the applied content, so its pre-apply admission matched none of the twelve ids | WORKING ON IT |
| `smell-write-final-a253-manifest` | the instrument's six custody clauses were checked one at a time: one holds, four cannot be checked because the pinned checkout is not on this machine, and the baseline deck clause fails because that deck has moved on | WORKING ON IT |
| `smell-write-found-by-integration-manifest` | the instrument read all four of its inputs and passed all nine of its evidence gates, and stopped only on the pinned bundle, which is not on this machine | WORKING ON IT |

One row closes and five stay open with their mechanism measured.

## The one mechanism two of them share

Two of the five open rows turn on the same file, and this lane measured why:

- the deck at `C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3`
  is the applied deck: all twelve of the migration's cards are present and not trashed, all
  twelve carry the content the proposal describes as the after content, and none of them
  carries the before content that the receipt records;
- so the compare-and-swap suite's admission, `id = ? AND db_content = ?` against the before
  content, matches none of the twelve ids and the single statement changes no card;
- and the same deck is the baseline the final manifest's custody clause hashes, so that
  clause fails, because the deck now hashes to `6aebb654...` where the receipt records
  `15545aa7...`.

The hash-verified pre-apply backup of that deck, `deck.sqlite3.pre-widget-fallback-20261019`,
still carries the recorded hash. Restoring it over the live deck is a change to a live file
and was not this lane's move.

## The one thing this lane found that the prior rounds got wrong

The 2026-10-23 round left `smell-verify-hosted-widget-views` open with the gap "the
instrument opens the twelve card addresses in a local browser, which is a page walk of the
live hosted edge, and the live-host rule for this lane allows one batched confirmation fetch
per URL at the end of the lane, never a page walk". The instrument does not walk the live
host. It fetches each address with `fetch`, writes the body to disk, and parses that body
with `page.setContent` in owned headless Chromium with JavaScript disabled and every
subresource request aborted. The browser never navigates to the edge.

So the verification the row was waiting for is runnable, this lane ran it, and the row closes
on the instrument's own verdict.

## What this lane added that the prior rounds did not have

- The two-leg rig, offered to each of this round's six instruments, with the rig's own
  answers recorded. The rig rewrites two lines in a probe, the engine manifest it names and
  the output directory it writes, and it refused all six of these instruments with its own
  message: "probe does not name an engine manifest the way this runner expects". None of the
  six reads a browser probe; they read a live hosted edge, a live account API, a deck on
  disk or a tree of build outputs. So each row's capture is that row's own instrument's own
  output, and the round keeps the rig's capture layout.
- A measurement of the deck the compare-and-swap suite copies, card by card, so the
  admission failure is attributed to a fact about the deck rather than to the suite's own
  failure message.
- Clause-by-clause checks for the two manifest instruments, so each receipt names WHICH
  input is missing rather than that the instrument failed.
- The exact recipes for the missing build outputs, from the 2026-10-20 dependency-restoration
  lane's verdicts file, so the next lane does not have to find them again.

## The receipts

One per row, under this directory's row-id directory, each with the command that produced it
and the observed output.

- The captures are under `fixtures/captured/smell-row-r5-2026-10-24/`, one per row, plus
  `rig-applicability.json`.
- The builders and distillers are under `tools/smell-row-r5/`.
- The pins are one per row, under `tests/server/`:
  `smell-verify-hosted-widget-content-parity.test.ts`,
  `smell-verify-hosted-widget-views-parity.test.ts`,
  `smell-verify-staging-probe-restoration-parity.test.ts`,
  `smell-widget-single-statement-cas-test-parity.test.ts`,
  `smell-write-final-a253-manifest-parity.test.ts`,
  `smell-write-found-by-integration-manifest-parity.test.ts` and
  `smell-row-r5-rig-applicability.test.ts`, over the shared reader
  `smell-row-r5-captures.ts`.

## The battery

    npx vitest run tests/server/smell-act082-new-cardtype-form-fields-parity.test.ts \
      tests/server/smell-act082-save-post-body-parity.test.ts \
      tests/server/smell-act082-select-owner-form-parity.test.ts \
      tests/server/smell-act082-type-select-all-options-parity.test.ts \
      tests/server/smell-act082-type-select-refresh-after-create-parity.test.ts \
      tests/server/smell-compare-journeys-provenance.test.ts \
      tests/server/smell-evaluate-follow-operations-parity.test.ts \
      tests/server/smell-run-all-parity.test.ts \
      tests/server/smell-check-chain-join-plan-parity.test.ts \
      tests/server/smell-apply-remote-widget-cas-parity.test.ts \
      tests/server/smell-audit-candidate-production-flags-parity.test.ts \
      tests/server/smell-discover-hosted-account-entry-parity.test.ts \
      tests/server/smell-verify-hosted-widget-content-parity.test.ts \
      tests/server/smell-verify-hosted-widget-views-parity.test.ts \
      tests/server/smell-verify-staging-probe-restoration-parity.test.ts \
      tests/server/smell-widget-single-statement-cas-test-parity.test.ts \
      tests/server/smell-write-final-a253-manifest-parity.test.ts \
      tests/server/smell-write-found-by-integration-manifest-parity.test.ts \
      tests/server/smell-row-r5-rig-applicability.test.ts

    -> 19 files, 85 tests, 85 passed, 0 failed.

The typecheck (`npx tsc --noEmit`) reports three errors, all in
`tests/card/actions/write-path-races.test.ts`, a file this lane did not touch
(`git diff 463e39c2..HEAD -- tests/card/actions/write-path-races.test.ts` is empty). The
previous round filed them as issue 20.

Branch: `port/smell-test-round3-20261024` in KatsuJinCode/decko-ts.
