# smell-evaluate-follow-operations

- The row's own label: `smell/probe script evaluate-follow-operations.mjs`
- Roster verdict at the time of this lane: FAIL, bucket WORKING ON IT, blocker
  WORKING ON IT (re-measured 2026-10-23, round two).
- This lane's disposition: NAMED, not closed. The row stays open on the product
  contract decision the round-four receipt already measured around, and nothing
  in this batch's authority changes that.

## What this lane re-verified first hand, at base `c17906db`

- The grader contract the row's own instrument enforces still demands a
  successful `GET /update/Mira_Member+*follow` for the mail-unfollow journey:
  `reference-harness/browser/journeys/acceptance-follow-operation-contracts.json`,
  journey `unfollow-mail-operation-persistence`, action
  `{"method": "GET", "path": "/update/Mira_Member+*follow", "status": 200}`.
- The port's mail view still emits the different link, and its own source names
  the divergence as a deliberate repair:
  `src/card/notify/follow-mail-views.ts:262-268`, comment "Accepted usability
  repair: target the existing owned preference directly. Stock's virtual
  user+follow dashboard route can require a denied parent create. Its
  permission checks stay intact; only the emitted link changes.", followed by
  the `update/<follow-rule>?card[content]=*never` URL the port emits.
- The round-four two-leg measurement is on file in this tree: the executed
  captures `fixtures/captured/smell-row-r4-2026-10-24/evaluate-follow-operations-ts.json`
  and `.../evaluate-follow-operations-ruby33.json`, and the receipt at
  `docs/runs/smell-row-conversion-r4-2026-10-24/smell-evaluate-follow-operations/RECEIPT.md`
  that ran the row's instruments against both engines.

## The mechanism that blocks the close

The contract demands a request the Ruby source itself refuses on this fixture:
the round-four receipt measured the oracle answering the plain
`/update/Mira_Member+*follow` route with 403 while the port's flat follow
record route answers 303 and completes the unfollow. The grader therefore
fails on the port (1 of 3) and cannot be graded on the source evidence (its
asset gate fails closed on the oracle's external Font Awesome fetch). The two
engines genuinely differ on the mail-unfollow leg, the port's difference is
documented in its own source as an accepted repair, and choosing which
behaviour the mail unfollow is supposed to have is the product contract
owner's decision, not a lane's. With that decision made, the close is
mechanical: the grader contract is updated to match the decision, and the
row's own verification either passes on the port or fails on both legs for the
same reason and the port needs no change.

## What this lane did not do

It did not change the grader contract, did not change the port's mail view,
and did not re-run the two-leg journey measurement, which would reproduce the
round-four state at the cost of two full journey runs without being able to
close the row either way.

Branch: `port/workbatch-g-20261025` in KatsuJinCode/decko-ts, base
`deploy/full-candidate-20261101` tip `c17906db`.
