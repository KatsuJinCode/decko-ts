# Unfollow write recheck: the refused writes at the follow seat and W4 editor tip

The restart-persistence lane's measurement (2026-10-25,
docs/runs/gapbatch-3-2026-10-25/restart-persistence.md, candidate
a25b3752) recorded both unfollow writes refused: the member's board
unfollow answered 422 on
`GET /update/Topic_009+*self+Mira_Member+*follow` and stored no row, and
the mail-context unfollow answered 303 on
`GET /update/*all+Mira_Member+*follow` instead of the contract's 200 on
`GET /update/Mira_Member+*follow`. This lane re-ran the exact same
measurements after the follow seat (gapbatch 1, through ebd0ed03) and the
W4 editor leg (1e1435da) landed, either of which could have changed the
write path.

## Base and provenance

The newest pushed roll tip is `deploy/full-candidate-20261030`
(95654138); it carries neither fix. The newest pushed tip that carries
both is `port/w4-editor-20261025` (b2b377ca), which sits directly on the
roll tip and contains gapbatch 1 (verified with `git merge-base
--is-ancestor`; no pushed branch contains b2b377ca). This lane's branch
`port/unfollow-recheck-20261025` starts there, in the exclusive worktree
C:/localProjects/decko-ts-unfollow-recheck-20261025.

All measurements ran at commit b2b377ca on a clean tree with the engine
distribution built at the same commit (build receipt in
.runtime/browser-build.json: sourceCommit b2b377ca, sourceDiffSha256
e3b0c442... the empty-tree digest, distSha256 7b0a105d349d57ec161d3d7a5ba
62055d615814dc6ade432f0b8a974db7eb354). The contracts evaluator's own
integrity checks (clean provenance, bound build receipt, exact candidate)
passed; it failed only the operation requirements below.

## The measurements, re-run unchanged

    node reference-harness/browser/run-journeys.mjs \
      --engine reference-harness/browser/engines/ts.json \
      --fixture reference-harness/fixtures/synthetic-v1 \
      --journeys reference-harness/browser/journeys/acceptance-follow-operations.json \
      --out .runtime/unfollow-recheck-v2/follow-operations
    (ok: all three journeys completed, exit 0)

    node reference-harness/browser/evaluate-follow-operations.mjs \
      --actual .runtime/unfollow-recheck-v2/follow-operations \
      --fixture reference-harness/fixtures/synthetic-v1 \
      --journeys reference-harness/browser/journeys/acceptance-follow-operations.json \
      --policy reference-harness/browser/journeys/acceptance-follow-operation-contracts.json \
      --engine reference-harness/browser/engines/ts.json \
      --candidate b2b377cad5696a12629fe437fc612c207de08000 \
      --report docs/runs/unfollow-recheck-2026-10-25/follow-operations-evaluator-report.json
    (fail: 1/3, exit 1)

The integrity section of the new report matches the a25b3752 report on
every hash: fixtureSha256, journeysSha256, contractsSha256, engineSha256,
operationPolicySha256, evaluatorSha256 and operationEvaluatorSha256 are
byte-identical, so the same fixture bytes, journey definitions, contract
policy and grader code produced both measurements. The problems list and
the per-journey verdicts are identical too.

## Verdict: the defect is not closed; both refusals stand at this tip

- The member's board unfollow still answers 422 on
  `GET /update/Topic_009+*self+Mira_Member+*follow`, the run's row delta
  is still empty, and the post-restart, fresh-login reload still shows
  the followed state ("following more_horiz 1 follower all followed
  cards" at /Topic_009/follow_section; owned restart receipt 37008 ->
  37036, boot 1037 ms).
- The mail-context unfollow still answers 303 on
  `GET /update/*all+Mira_Member+*follow` (redirect to the rule card
  page), not the contract's 200 on `GET /update/Mira_Member+*follow`; the
  contract's wire requirement still fails. On this profile the redirect
  follows a successful write: row 910 (`*all+Mira Member+*follow`) stores
  `*never` (db_content `*always` -> `*never`, actor 617) and the
  post-restart reload shows the unfollowed state ("follow more_horiz 0
  followers all followed cards"; restart receipt 37388 -> 2948, boot
  1027 ms). This row-landing was already true at the a25b3752
  measurement: that lane's own journey record shows the same row 910
  change, so its write-up's "the journeys' row deltas are empty"
  (restart-persistence.md:129) does not describe its own machine record
  for the mail leg. What remains refused there is the contract's named
  wire target and status, and with it the positive-operation claim.
- The control leg still passes end to end: the admin follow answers 200
  on `GET /update/Topic_008+*self+Ada_Admin+*follow`, inserts the
  `Topic 008+*self+Ada Admin+*follow` preference chain with `*always`,
  sends the follower notice, and the post-restart reload shows the
  followed state. The write path itself is healthy in the follow
  direction.

## The refusal's mechanism, captured at this tip

Member unfollow. The follow button's unfollow is a remote anchor that
GETs the update route for a card that does not exist
(`Topic 009+*self+Mira Member+*follow`), so the update is a compound
create with two missing sides. The Right::Follow override's
ok_to_create? (permit alone, no sides walk) passes for the member
(followPreferencePermit arm, src/card/permissions/view-task-rules.ts:305;
the override shape gate followRightPermitPassedForCard,
src/card/permissions/view-task-rules.ts:389). The missing side card
`Topic 009+*self+Mira Member` then fails its own create permission; the
side's permission_denied error folds onto the act under the part's name
(the subcards/all.rb handle_subcard_errors shape), the act carries no
:permission_denied key of its own, and the error class bottoms out at the
base class: status 422, view :errors. Concretely in this port:
src/card/actions/card-action-engine.ts:7116-7131 (the fold arm throws
CardActionError with code "user-error" and the part-named message),
src/server/write-routes.ts:1143-1148 (errorStatus maps "user-error" to
422) and src/server/write-routes.ts:1299-1313 (the "Problems with
<card>" alert body). This session's own wire capture of the same request
on a fresh fixture copy answers exactly that body:

    Problems with Topic 009+*self+Mira Member+*follow
    TOPIC 009+*SELF+MIRA MEMBER: permission_denied You don't have
    permission to create Topic 009+*self+Mira Member

(probe script .runtime/unfollow-recheck-v2/probe-refusal.mjs; signed in
as the member, the same XHR shape the board's remote anchor sends). The
port's own comment at src/card/actions/card-action-engine.ts:7083-7115
records the live-oracle probes of this exact refusal against the pinned
Ruby (the same folded part error, status 422), and
docs/follow-operation-contracts.md states stock Ruby refuses the same
fixture shape. Nothing changed on this path since the measurement: the
diff 95654138..b2b377ca touches only the render side
(src/card/fetch.ts, render.ts, content-overrides.ts, page.ts,
virtual-card-registry.ts, the edge bundle boot), not the write gate, the
permission walk or the write routes.

Mail unfollow. The deck's own notification mail names the
`*all+Mira_Member+*follow` set rule as its follow link, and that card
exists (row 910, content `*always`). The member may update their own
preference rule, the write succeeds, and the route answers 303 to the
rule card's page, where the member lands and the row reads `*never`. The
contract's required wire target (`GET /update/Mira_Member+*follow`, the
member-set rule, status 200) is never requested by this flow, and the
two-part form is the shape the pinned Ruby refuses with 403 (the
override's own permit denial, recorded at
src/card/permissions/view-task-rules.ts:381-387, probe 2). The remaining
gap is between the contract's recorded original wire behavior and the
link the port's mail actually carries, not a lost write on this
profile.

## Disposition

The row stays open, unchanged in substance from the restart-persistence
lane's finding: the member's unfollow write is still refused (422, no
row, reload still follows), and the mail-context unfollow still fails
the contract's wire requirement. The follow seat and the W4 editor leg
did not touch these paths; the mechanism above is where a fix belongs.

## The battery

The whole-family exercise (node tools/edge-signed-in-exercise.mjs, the
same deck snapshot SHA-256 6aebb654... the W4 leg's record pins, local
stack, productionRuntime false, nothing deployed) ran at this commit on
the clean tree (the run's custody record: source b2b377ca, dirty false,
bundleSha256 19f780c3..., the same bundle bytes the W4 leg's record
carries): **315 / 320 checks passed**, capability coverage 92 covered /
1 partial / 0 not covered / 1 out of scope, and the five failures are
exactly the baseline's own named failures at this tip: the RichText
editor toolbar leg, the N9 applied layout leg, the P5 *type_plus_right
leg, the C20 junction leg, and the timings leg. Nothing new failed. The
full report is .runtime/unfollow-recheck-v2/family/report.md (untracked
run artifact).
