# Row smell-evaluate-follow-operations

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-evaluate-follow-operations`
- Instruments:
  - evidence set: `reference-harness/browser/run-journeys.mjs`
  - grader: `reference-harness/browser/evaluate-follow-operations.mjs`
- What this lane did: ran the row's own instruments twice in this session, once against the
  port and once against the Ruby oracle, with the same three journey definitions and the
  same fixture, so that the parity question the row leaves open is answered by a
  measurement rather than by a document.
- Commands:
  - `node reference-harness/browser/run-journeys.mjs --engine reference-harness/browser/engines/ts.json --fixture reference-harness/fixtures/synthetic-v1 --journeys reference-harness/browser/journeys/acceptance-follow-operations.json --out .runtime/r2-follow-operations-ts`
    (exit 0; all three journeys completed)
  - `node reference-harness/browser/run-journeys.mjs --engine reference-harness/browser/engines/ruby.json --fixture reference-harness/fixtures/synthetic-v1 --journeys reference-harness/browser/journeys/acceptance-follow-operations.json --out .runtime/r2-follow-operations-ruby`
    (exit 0; all three journeys completed against the Ruby oracle, booted on Ruby 3.3.12
    x64-mingw-ucrt with card 1.110.0 and decko 0.20.0, the SQLite rung, the versions
    `docs/parity-method.md` pins)
  - `node reference-harness/browser/evaluate-follow-operations.mjs --actual .runtime/r2-follow-operations-ts ... --engine reference-harness/browser/engines/ts.json --candidate 3eca1fe50d567a773a5759ac323d2281bbb5e368 --report .runtime/r2-follow-operations-ts-grader-report.json`
    (exit 1; the grader printed `fail: 1/3 positive follow operations`)
  - the same grader against the Ruby evidence set with `--engine reference-harness/browser/engines/ruby.json`
    (exit 1; the grader printed `fail: 0/3` for a different reason, recorded below)
- Evidence in this directory: `grader-report-ts.json`, `grader-report-ruby.json` and
  `fresh-two-engine-comparison.json` (the two legs' network and observation facts side by
  side).

## The parity question, answered

Round one recorded this row as failing and named the open question: `docs/follow-operation-contracts.md`
states that stock Ruby refuses the same GET mutation on this fixture, and if that is so the
port would be at parity, but no lane had measured it. The Ruby oracle could not be booted in
round one. It boots here, and the two legs say:

| leg | port (TypeScript) | source (Ruby oracle) |
|---|---|---|
| admin follow | `GET /update/Topic_008+*self+Ada_Admin+*follow` 200, then "1 follower" | the same address, the same 200, the same "1 follower" |
| member unfollow | `GET /update/Topic_009+*self+Mira_Member+*follow` 422, then "following" after a fresh login and a restart | the same address, the same 422, the same "following" |
| mail unfollow | `GET /update/*all+Mira_Member+*follow` 303, then "0 followers" | `GET /update/Mira_Member+*follow` 403, then "1 follower" |

So the member-unfollow leg is the same on both sides: the source refuses that GET mutation
with the same status on the same address and keeps the follower state, and the port does
exactly that. The contract the grader enforces, that the unfollow GET must succeed and that
a `*never` preference must be stored, is a demand the source itself does not satisfy on this
fixture, so it cannot be a parity target.

The mail-unfollow leg is where the two sides differ, and the difference runs the other way:
the port completes the unfollow (a 303 on the per-card address, "0 followers" afterwards)
where the source refuses it (a 403 on the plain address, "1 follower" afterwards).

## The grader's verdicts, as they stand

On the port the grader returns `fail: 1/3` and names four problems: the member unfollow needs
a successful `GET /update/Topic_009+*self+Mira_Member+*follow`, it needs the persisted
`db_content=*never`, it needs the reload to retain the failed following state, and the mail
unfollow needs a successful `GET /update/Mira_Member+*follow`.

On the Ruby evidence the grader returns `fail: 0/3`, and its problems are not behavioural:
`browser/runtime/network/mail/row evidence required` and `required asset failed
/1366963381.js`, the asset the Ruby application answers with 403. The grader cannot grade
the Ruby evidence as it stands, so the table above is this lane's own reading of the two
evidence sets, not a grader verdict on the source.

## Gap, in one mechanism sentence

The port and the source agree on the admin-follow and member-unfollow legs and disagree on
the mail-unfollow leg, where the port completes an operation the source refuses, so the row
cannot be closed as a parity match and the contract that both sides fail is a product
contract question rather than a port-parity one.

## What would close it

A decision on which behaviour the mail unfollow is supposed to have, taken by whoever owns
the product contract, and then a grader contract that matches that decision. With the
decision made, this row's own verification either passes on the port, or fails on both sides
for the same reason and the port needs no change.
