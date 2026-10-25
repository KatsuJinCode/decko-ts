# Gap batch three, GAP A: persistence across a host restart

The enumeration audit (part A5) named the restart journeys no roster row
covered: the six account and date journeys in
`reference-harness/browser/journeys/acceptance-account-date.json` and the
three follow-operation journeys in
`reference-harness/browser/journeys/acceptance-follow-operations.json`, each
of which carries a `{'restart': True}` step and then re-asserts the saved
value. The closest roster row, `mx-183`, covers a reload only.

The branch is `port/gapbatch-3-20261025`. The runs below measured commit
`a25b37523c0526fa28281d62e16986b28d3f28ce` on a clean, committed tree (the
provenance records `dirty: false` and the empty-tree status hash), with the
engine distribution built at the same commit (`distSha256`
`404a0ffc3a4c1cdaa0ab7c57b05c439d2111decf67dd4e0e6e2a5330e5489a55`, the same
bytes the base commit builds, since the lane adds no product source).

## The checks written

- `reference-harness/browser/verify-restart-persistence.mjs` and
  `reference-harness/browser/lib/restart-persistence-verdict.mjs`: the
  persistence grader. For every journey whose definition carries a restart
  step it requires the complete journey, real restart evidence (the runner's
  `restart` step records `{previousPid, pid, bootMs}` from
  `reference-harness/browser/lib/engines.mjs`, which kills and respawns the
  run's OWN staged child on the same deck and files - the boot path the repo
  carries, never another process), the read side re-performed after the last
  restart (read-bearing steps and an observation), and every post-restart
  assert/wait step of the definition (the recorded original behavior)
  recorded ok. It fails closed on provenance: a dirty tree, a run whose
  provenance names another commit, or a build receipt from another commit.
- `reference-harness/browser/test/restart-persistence-verdict.test.mjs`: the
  grader's five unit controls (real receipt passes; a failed post-restart
  assertion names the step; forged one-pid restart evidence fails; dirty
  provenance and a foreign build receipt fail closed; a missing or unexpected
  result is named). Labelled unit fixtures: only the browser runs below
  substantiate a product claim.

    node --test reference-harness/browser/test/restart-persistence-verdict.test.mjs
    (tests 5, pass 5, fail 0)

## The runs

One instrument, the repo's own journey runner, per journey file:

    node reference-harness/browser/run-journeys.mjs \
      --engine reference-harness/browser/engines/ts.json \
      --fixture reference-harness/fixtures/synthetic-v1 \
      --journeys reference-harness/browser/journeys/acceptance-account-date.json \
      --out .runtime/gapbatch3v3/account-date
    (exit 0)

    node reference-harness/browser/run-journeys.mjs \
      --engine reference-harness/browser/engines/ts.json \
      --fixture reference-harness/fixtures/synthetic-v1 \
      --journeys reference-harness/browser/journeys/acceptance-follow-operations.json \
      --out .runtime/gapbatch3v3/follow-operations
    (exit 0)

Each journey runs on its own fresh deck copy, freshly started host and fresh
hidden browser with a throwaway profile. Every restart step restarted that
journey's own host (previous and next pid distinct, boot 508-522 ms across
all nine):

| journey | steps | restart (previousPid -> pid, bootMs) |
|---|---|---|
| account-email-login-persistence | 22 | 19664 -> 16936, 517 ms |
| account-password-login-persistence | 20 | 36436 -> 33128, 518 ms |
| account-reset-password-complete | 23 | 28400 -> 20704, 510 ms |
| account-signup-activation-complete | 38 | 30048 -> 5416, 519 ms |
| date-edit-persistence | 16 | 30456 -> 32428, 522 ms |
| rich-editor-save-persistence | 15 | 15100 -> 33424, 519 ms |
| follow-admin-operation-persistence | 11 | 21532 -> 11884, 517 ms |
| unfollow-member-operation-persistence | 11 | 21544 -> 18124, 518 ms |
| unfollow-mail-operation-persistence | 12 | 20676 -> 34608, 518 ms |

## What survived the restart

The persistence grader's verdict, committed beside this write-up as
`account-date-restart-verdict.json` and `follow-operations-restart-verdict.json`:

    pass: 6/6 restart-persistence journeys   (account-date)
    pass: 3/3 restart-persistence journeys   (follow-operations)

Every saved state the six account and date journeys write survived the host
restart and answered the re-performed read side with the recorded value:

- the changed email signs in after a fresh session and a restart, and the old
  credential is refused;
- the changed password authenticates after the restart, and the old one is
  refused;
- the reset-token password authenticates after the restart, and the old one
  is refused;
- the administrator-approved, mail-activated signup signs in after the
  restart;
- the saved leap day (February 29, 2028) renders and re-opens in the date
  editor after the restart;
- the saved rich-text content renders and re-opens in the editor after the
  restart.

The three follow-operation journeys also complete their restart legs: the
follow state each journey leaves is what the post-restart reload shows. The
admin follow's state is a stored preference that survived; the two unfollow
journeys are the named defect below.

## The named defect: the unfollow write is refused, so no unfollow state exists to survive

The follow-operation contracts grader
(`reference-harness/browser/evaluate-follow-operations.mjs`, the repo's own
grader for the original's recorded positive-operation contracts) answers:

    fail: 1/3 positive follow operations
    unfollow-member-operation-persistence: successful GET /update/Topic_009+*self+Mira_Member+*follow required
    unfollow-member-operation-persistence: persisted new card Topic 009+*self+Mira Member+*follow db_content=*never required
    unfollow-member-operation-persistence: reload retains failed state following
    unfollow-mail-operation-persistence: successful GET /update/Mira_Member+*follow required

Machine record: `follow-operations-evaluator-report.json`. `follow-admin-
operation-persistence` passes every contract (the write lands, the follower
notice goes, the following control shows after the fresh login and restart).

Mechanism, from this session's own wire records
(`.runtime/gapbatch3v3/follow-operations/unfollow-member-operation-persistence.json`,
`unfollow-mail-operation-persistence.json`): the follow button's unfollow is
a GET update of the follow preference card, and the write path refuses it -
the member's `GET /update/Topic_009+*self+Mira_Member+*follow` answers 422
and the mail unfollow's `GET /update/*all+Mira_Member+*follow` answers 303
without a successful update - so no preference row with `db_content` `*never`
is stored (the journeys' row deltas are empty) and the post-restart,
fresh-login reload faithfully shows the card still followed. The restart is
not what loses the state: the write never lands, so there is no unfollow
state to survive. This is the same refusal the 2026-10-22 measurement named
(docs/runs/family-row-conversion-2026-10-22/smell-evaluate-follow-operations/
record.md), still open at this tip; the roster's `cap-W4`/`mx-155` follow
rows remain the place the fix belongs.

## Superseded attempts, named

- The first evidence runs (`.runtime/gapbatch3/account-date`,
  `.runtime/gapbatch3/follow-operations`) ran against a dist built at the
  base commit, so the contracts grader refused them with "bound build
  receipt required". The runs themselves were identical in outcome; they are
  kept in the lane's `.runtime` and named here.
- The second runs (`.runtime/gapbatch3v2/...`) ran while this lane's own
  uncommitted grader file sat in the tree, so the provenance recorded a dirty
  tree and the grader refused them with "clean candidate provenance
  required". Same outcome; also kept.

## What this run does not claim

The engine is the ts profile (the journeys' own parity profile), not the
production-profile host and not the deployed edge runtime; the fixture is the
pinned synthetic-v1 deck. No Ruby leg ran in this lane: the six account and
date journeys' Ruby reference is recorded as incomplete in
docs/browser-journeys.md (the earlier Ruby six-case run had signup setup and
Date restart failures), and the follow contracts' stock-Ruby 422/403 leg is
named unmeasured by the smell row's record. The grader grades the port
against the journeys' own recorded original behavior, not against a fresh
Ruby run.
