# Row conversion, round four, 2026-10-24

Lane: lane-smell-test-round2. Question asked: take the next six unadjudicated rows of the
family in roster item order, skipping the four the previous round named, run each row's own
instrument, close a row only where its own verification ran and its own verdict holds, and
leave every other row open with the gap this lane measured, in one mechanism sentence.

The rows taken, in roster order: `smell-evaluate-follow-operations`, `smell-run-all`,
`smell-check-chain-join-plan`, `smell-apply-remote-widget-cas`,
`smell-audit-candidate-production-flags`, `smell-discover-hosted-account-entry`.

## The rows

| row | what its own verification produced | disposition |
|---|---|---|
| `smell-evaluate-follow-operations` | both legs ran the three journeys on the same fixture; two legs agree, and the third diverges in the notification mail's unfollow link | WORKING ON IT |
| `smell-run-all` | the whole suite ran end to end after the bundler dispatch was fixed, and graded 51 of 51 journeys with valid evidence; 36 pass and every one of the 15 failures is the mail's unfollow link | BLOCKED cleared, WORKING ON IT |
| `smell-check-chain-join-plan` | the tool measured again past both of its guards, and refused its own measurement because its byte comparison is order sensitive | WORKING ON IT |
| `smell-apply-remote-widget-cas` | the instrument stopped at its credential read before any request, and its compare-and-swap admission cannot hold twice | WORKING ON IT |
| `smell-audit-candidate-production-flags` | the instrument read both live scripts and found all four required flags present and equal on each | DONE |
| `smell-discover-hosted-account-entry` | the walk ran and both anonymous routes answered 200, with no blocked asset and no console error, the same as the receipt of record | DONE |

Two rows close and four stay open with their mechanism named.

## The one mechanism four of them share

Three of the six rows measured the same difference, and it is one mechanism:

- the port's notification mail emits the flat follow record's own update route with
  `card[content]=*never`, where the source emits the follower's own card route with
  `card[subcards][<follow record>]=*never`;
- the port's link therefore answers 303 and the unfollow completes, where the source's link
  answers 403 and the follow is kept;
- the port's own source documents the divergence as an accepted usability repair
  (`src/card/notify/follow-mail-views.ts:262-268`).

`smell-evaluate-follow-operations` measured it on its own three journeys,
`smell-run-all` measured it across 15 of 51 journeys, and the whole-suite comparison
attributes every one of its failures to it. Whether it stays is a product contract
decision, not a parity verdict, and the grader that enforces the contract rejects both
sides.

The fourth row that stays open, `smell-check-chain-join-plan`, is a different mechanism: the
instrument's pass condition compares the two forms' answers byte for byte, and the CROSS
JOIN rewrite legitimately changes the row order of a statement that returns cards.

## What this lane added that the prior rounds did not have

- The two-leg rig, used on the follow-operations row: the journey runner on the port and on
  the pinned Ruby oracle, the same three journeys and the same fixture, so the legs differ
  only in the engine. The captures carry the mail body each engine wrote, which is where
  the divergence is.
- The bundler dispatch fix for the whole-suite runner: with the machine's pinned
  `C:/Ruby33-x64/bin` first on PATH, the runner's first step exits 0 and the suite runs.
- Two builders that rebuild the inputs `tools/perf/check-chain-join-plan.mjs` refuses: the
  capture (its SQL plus a parameter array from the deck's own junctions) and the deck copy
  (the row count the tool guards on).
- A restoration of the pinned checkouts the private instruments import their harness
  modules from, which were empty directories on this machine.

## The receipts

One per row, under this directory's row-id directory, each with the command that produced
it and the observed output.

- The captures are under `fixtures/captured/smell-row-r4-2026-10-24/`.
- The pins are one per row, under `tests/server/`:
  `smell-evaluate-follow-operations-parity.test.ts`, `smell-run-all-parity.test.ts`,
  `smell-check-chain-join-plan-parity.test.ts`, `smell-apply-remote-widget-cas-parity.test.ts`,
  `smell-audit-candidate-production-flags-parity.test.ts` and
  `smell-discover-hosted-account-entry-parity.test.ts`, over the shared reader
  `smell-row-r4-captures.ts`.
- The builders and distillers are under `tools/smell-row-r4/`.

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
      tests/server/smell-discover-hosted-account-entry-parity.test.ts

    -> 12 files, 57 tests, 57 passed, 0 failed.

The typecheck (`npx tsc --noEmit`) reports three errors, all in
`tests/card/actions/write-path-races.test.ts`, a file this lane did not touch
(`git diff 9658a462..HEAD -- tests/card/actions/write-path-races.test.ts` is empty). The
errors are filed as issue 20.

Branch: `port/smell-test-round2-20261024` in KatsuJinCode/decko-ts.
