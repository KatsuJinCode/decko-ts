# Row smell-evaluate-follow-operations

Family row conversion, 2026-10-22. The row's own verification ran for the first time in this
family's history; it FAILED, so the row is NOT closed.

- Roster row: `smell-evaluate-follow-operations`
  (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instruments:
  - evidence set: `reference-harness/browser/run-journeys.mjs`
  - grader: `reference-harness/browser/evaluate-follow-operations.mjs`
- Tree measured: `C:/localProjects/decko-ts-smell-test-measure-20261022` at commit
  `e8b70ad3aa85c75f9247d2cd1af747e4bf740505` (the shipping candidate), engine built there with
  `node tools/dist/build-engine.mjs`; the journey run's own `run-meta.json` records
  `source.commit` `e8b70ad3...`, `source.dirty` false, `source.statusSha256`
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (the clean-tree hash) and
  the build receipt `distSha256` `2651f3522bd63f8aad78e4c0d12a537b890746945b11aff4cb6c3435bcc003fb`.
  The evidence set is therefore bound to a clean pinned tree, which is what the row said was
  missing.
- Commands:
  - `node reference-harness/browser/run-journeys.mjs --engine reference-harness/browser/engines/ts.json --fixture reference-harness/fixtures/synthetic-v1 --journeys reference-harness/browser/journeys/acceptance-follow-operations.json --out .runtime/lane-smell-test-convert/follow-operations-journeys`
    (exit 0; all three journeys completed: `follow-admin-operation-persistence` 24067 ms,
    `unfollow-member-operation-persistence` 22778 ms, `unfollow-mail-operation-persistence` 23499 ms)
  - `node reference-harness/browser/evaluate-follow-operations.mjs --actual .runtime/lane-smell-test-convert/follow-operations-journeys --fixture reference-harness/fixtures/synthetic-v1 --journeys reference-harness/browser/journeys/acceptance-follow-operations.json --policy reference-harness/browser/journeys/acceptance-follow-operation-contracts.json --engine reference-harness/browser/engines/ts.json --candidate e8b70ad3aa85c75f9247d2cd1af747e4bf740505 --report .runtime/lane-smell-test-convert/follow-operations-evaluator-report.json`
    (exit 1; grader printed `fail: 1/3 positive follow operations`)
- Evidence in this directory: `follow-operations-evaluator-report.json` (the grader's own report:
  verdict, problems, per-journey verdicts, the integrity hashes and the raw-evidence digests),
  `follow-operations-journeys-run-meta.json` (the journey run's provenance), `progress.txt`
  (the runner's per-journey progress).

## What the run measured

The admin follow operation passed. The two unfollow operations failed, and the grader named the
exact refusals:

- `unfollow-member-operation-persistence: successful GET /update/Topic_009+*self+Mira_Member+*follow required`
- `unfollow-member-operation-persistence: persisted new card Topic 009+*self+Mira Member+*follow db_content=*never required`
- `unfollow-member-operation-persistence: reload retains failed state following`
- `unfollow-mail-operation-persistence: successful GET /update/Mira_Member+*follow required`

The report's own `parityAcceptance` and `productionAcceptance` fields stay false, and the grader
records itself as candidate-only evidence, not an override of the legacy comparator.

## Gap, in one mechanism sentence

The unfollow write is refused on the wire (the member's GET update answers 422 and the mail
unfollow's GET answers 403), so no `*never` preference is stored and a fresh login still shows
the follower state as following.

## Disposition

`WORKING ON IT`. The row advances from "not runnable" to "runnable and failing", which is a
measured state and not a guess, but the row's own verification returns `fail`, so the port does
not measurably satisfy the contracts the grader enforces and the row is not closed.

One thing this lane could not settle, named so it is not mistaken for a parity claim:
`docs/follow-operation-contracts.md` states that stock Ruby refuses the same GET mutation on
this fixture, and if that is so the port would be at parity here, but this lane did not measure
it. The Ruby oracle engine could not be booted in this lane: the vendored gemset at
`C:/localProjects/decko-ruby-oracle-gems` has no installed specifications for the card gems and
no `decko_gem` helper, so `bundle exec` in `reference-harness/oracle/app` refuses with
`Bundler::GemNotFound` for the whole pinned set. The measurement that settles it is one
journey run of the same three definitions against `reference-harness/browser/engines/ruby.json`.
