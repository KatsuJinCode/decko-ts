# smell-evaluate-follow-operations

- The row's own label: `smell/probe script evaluate-follow-operations.mjs`
- The instruments:
  - evidence set: `reference-harness/browser/run-journeys.mjs`
  - grader: `reference-harness/browser/evaluate-follow-operations.mjs`
  - journey definitions: `reference-harness/browser/journeys/acceptance-follow-operations.json`
  - the contract the grader enforces: `reference-harness/browser/journeys/acceptance-follow-operation-contracts.json`
- What this lane did: ran the row's own instruments twice in this session, once against the
  port and once against the pinned Ruby oracle, on the same three journey definitions and
  the same `synthetic-v1` fixture, and compared the two legs.
- Commands:
  - `node reference-harness/browser/run-journeys.mjs --engine reference-harness/browser/engines/ts.json --fixture reference-harness/fixtures/synthetic-v1 --journeys reference-harness/browser/journeys/acceptance-follow-operations.json --out .runtime/r4-follow-ts-settle`
    (exit 0; all three journeys completed)
  - `node reference-harness/browser/run-journeys.mjs --engine reference-harness/browser/engines/ruby33.json --fixture reference-harness/fixtures/synthetic-v1 --journeys reference-harness/browser/journeys/acceptance-follow-operations.json --out .runtime/r4-follow-ruby33-settle`
    (exit 0; all three journeys completed against the Ruby oracle, booted on the machine's
    pinned Ruby 3.3.12 gem home)
  - `node reference-harness/browser/evaluate-follow-operations.mjs --actual .runtime/r4-follow-ts-settle --fixture reference-harness/fixtures/synthetic-v1 --journeys reference-harness/browser/journeys/acceptance-follow-operations.json --policy reference-harness/browser/journeys/acceptance-follow-operation-contracts.json --engine reference-harness/browser/engines/ts.json --candidate 9658a462ad1dca1ba7b413aba5d917068bd73131 --report .runtime/r4-follow-ts-settle-grader-report.json`
    (exit 1; the grader printed `fail: 1/3 positive follow operations`)
  - the same grader against the Ruby evidence set with `--engine reference-harness/browser/engines/ruby33.json`
    (exit 1; the grader printed `fail: 0/3`)
  - `node tools/smell-row-r4/distill-follow-operations.mjs .runtime/r4-follow-ts-settle .runtime/r4-follow-ruby33-settle .runtime/r4-follow-ts-settle-grader-report.json .runtime/r4-follow-ruby33-settle-grader-report.json fixtures/captured/smell-row-r4-2026-10-24`
    (exit 0; wrote the two captures)
- The mode the legs ran in: `HARNESS_EDITOR_SETTLE=1`, the repo's own declared oracle-rerun
  mode (`run-journeys.mjs:111`). Without it the source's mail journey fails at the editor
  step with `rich editor card[content] is not initialized`, because TinyMCE finishes
  initializing outside jQuery's knowledge. Both legs ran in that mode, so the two captures
  differ only in the engine.
- Evidence in this directory's sibling fixtures:
  `fixtures/captured/smell-row-r4-2026-10-24/evaluate-follow-operations-ts.json` and
  `.../evaluate-follow-operations-ruby33.json`.

## Verdict: WORKING ON IT, with the mechanism measured on both legs

The two legs agree on two of the three journeys and diverge on the third.

| journey | port (TypeScript) | source (Ruby oracle) |
|---|---|---|
| admin follow | `GET /update/Topic_008+*self+Ada_Admin+*follow` 200, then "following", 2 followers | the same address, the same 200, the same "following", 2 followers |
| member unfollow | `GET /update/Topic_009+*self+Mira_Member+*follow` 422, then still "following", 1 follower | the same address, the same 422, the same retained "following" |
| mail unfollow | the mail's link is `/update/*all+Mira_Member+*follow?card[content]=*never`, it answers 303, and the follow is gone ("0 followers") | the mail's link is `/update/Mira_Member+*follow?card[subcards][*all+Mira Member+*follow]=*never`, it answers 403, and the follow is kept ("following", 1 follower) |

The divergence is in the MAIL BODY, and this lane measured it there rather than inferring it
from the clicked addresses. Both mails say the same thing about the reason ("You received this
email because you're following \"everything\"") and both carry an unfollow link, but they
carry different ones:

- the port writes the flat follow record's own update route with the record's content set to
  `*never`, which is the accepted usability repair in the port's own source
  (`src/card/notify/follow-mail-views.ts:262-268`: "Stock's virtual user+follow dashboard
  route can require a denied parent create. Its permission checks stay intact; only the
  emitted link changes.");
- the source writes the follower's own card route with the follow record addressed as a
  subcard field, and the source's own permission check refuses that route with 403.

So the port completes an operation the source refuses, and the contract the grader enforces
is a demand the source itself does not satisfy on this fixture: the grader wants a
successful `GET /update/Mira_Member+*follow`, which is exactly the request the source
answers with 403. The grader therefore fails on the port (1 of 3) and cannot be a parity
target on this fixture.

## The source's evidence cannot be graded at all, and why

The grader on the source's evidence returns `fail: 0/3`, and its problems are not
behavioural. Every source journey reports `browser/runtime/network/mail/row evidence required`
and `required asset failed /1366963381.js`: the stock oracle serves the external Font
Awesome kit tag, this machine cannot reach it, and the journey evidence gate fails closed
on the failed asset. The port serves the vendored Font Awesome
(`DECKO_FONT_AWESOME=local` in `reference-harness/browser/engines/ts-server.mjs`), so the
port's evidence is complete and the source's is not. The two-leg table above is therefore
this lane's own reading of the two evidence sets, and the grader's verdicts are reported as
what they are: a real grade on the port (1 of 3) and an ungradeable source.

## Gap, in one mechanism sentence

The port's notification mail emits the flat follow record's own update route with
`card[content]=*never` where the source emits the follower's own card route with
`card[subcards][<follow record>]=*never`, so the port completes the mail unfollow where the
source refuses it, and the contract both sides fail is a product contract question and not a
port parity one.

## What would close it

A decision, taken by whoever owns the product contract, on which behaviour the mail unfollow
is supposed to have, and then a grader contract that matches that decision. With the
decision made, this row's own verification either passes on the port, or fails on both legs
for the same reason and the port needs no change.

## What this lane did NOT conclude

This lane did not conclude that the port's mail unfollow is wrong, and it did not conclude
that it is right. It concluded that the two engines emit different links, that the port's
link works and the source's does not, and that the row's own grader rejects both. The
port's divergence is documented in its own source as an accepted repair, so whether it stays
is a product decision, not a parity verdict.

Branch: `port/smell-test-round2-20261024` in KatsuJinCode/decko-ts.
