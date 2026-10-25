# The follow family's refused compound create closes

The unfollow recheck (docs/runs/unfollow-recheck-2026-10-25/ on
port/unfollow-recheck-20261025) left both member unfollow writes refused.
This lane fixes them at the roll tip and lands the follow operation
contracts: the evaluator that failed 1/3 there passes 3/3 here.

## Base and provenance

Branch port/followfix-20261025, worktree
C:/localProjects/decko-ts-followfix-20261025, from the newest pushed roll
tip deploy/full-candidate-20261101 (c17906db). Lane commits, in order:

- af17c70c - the follow preference permit resolves the set part the way
  Ruby's fetch_type_id does, and carries the owner's dashboard arm
  (src/card/permissions/view-task-rules.ts).
- 7c7ac7ef - the mail unfollow carries the stock dashboard link, and the
  subcard grammar accepts the bare-value and query-carried shapes
  (src/card/notify/follow-mail-views.ts, src/server/write-routes.ts).
- 73da2295 - the follow-operation pins describe the new mechanism
  (tests/deploy/bunny-account-mail-http.test.ts,
  tests/server/smell-evaluate-follow-operations-parity.test.ts).
- 30455736 - the toolchain's install scripts are declared
  (package.json; esbuild's postinstall is build-engine's bundler).
- 277f3c51 - the W6 unfollow-link predicate reads the rule name in both
  of Decko's spellings (first form; superseded by 36175859).
- 2158844e - strip the em-dashes this lane's own added lines carried.
- 36175859 - the W6 predicate canonicalizes both sides the way Decko's
  url key does (tools/edge-signed-in-exercise/lib/unfollow-link-in-mail.mjs).

The evaluator's journey run and report were produced at 30455736 on a
clean tree with the engine distribution built at that commit; the two
later source commits touch only the exercise predicate and comment text,
not the engine.

The final measurements ran at 30455736 on a clean tree with the engine
distribution built at the same commit. The evaluator's own integrity
hashes (fixtureSha256 e5798f2c..., journeysSha256 03781ef9...,
contractsSha256 05671700..., engineSha256 31aca5a7...,
operationPolicySha256 fae571f2..., evaluatorSha256 00d23aa2...,
operationEvaluatorSha256 f8e418e7...) are byte-identical to the recheck's
report: the same fixture bytes, journey definitions, contract policy and
grader code produced both measurements.

## The mechanism, in one sentence each

- Board unfollow. The act "Topic 009+*self+Mira Member+*follow" refused
  because the port's followPreferencePermit required the preference's set
  card to exist as a stored row; "Topic 009+*self" has no row, the permit
  answered undefined, and the act fell to the standard rules whose sides
  walk denied the missing side. Ruby's preference? asks
  Card.fetch_type_id(name[0..-3]) == SetID (rule/all.rb:45) and a pattern
  cardname with no row still answers SetID through the virtual pattern
  card (fetch/results.rb:16-33); the port's own shape detector
  (followRightPermitPassedForCard, with live-oracle probe 5) already
  recorded that truth. The permit now resolves the set part the same
  way, and the write proceeds: the act's own permitted arm stores the
  rule and its missing sides are created in the act, exactly as the
  admin's act creates them.
- Mail unfollow. The contracts name GET /update/Mira_Member+*follow as
  the wire target; stock refuses the owner there 403 (rule_user nil),
  and the 2026-10-18 flat-route repair answered it by targeting the rule
  directly. The recorded product divergence this lane lands: the
  permit's two-part arm permits the owner's own dashboard write, the
  mail link carries the stock bytes again (mark [follower, :follow],
  card[subcards][<rule>]=*never) with success[redirect]=soft appended so
  the update answers the soft flavor (response.rb:25-33, the envelope
  override) at 200.
- Transport. Two write-route gaps made the posted subcard a no-op:
  card[subcards][K]=value with no field segment dropped the value
  (Ruby's multi_add answers new_by_attributes key, content: val,
  subcards/add.rb:81-95), and applyQuery never merged subcardTree, so a
  query-carried subcard was clobbered by the body's empty tree.

## The two writes, before and after

Member board unfollow (GET /update/Topic_009+*self+Mira_Member+*follow):

- before (recheck, b2b377ca): 422, "Problems with Topic 009+*self+Mira
  Member+*follow / TOPIC 009+*SELF+MIRA MEMBER: permission_denied You
  don't have permission to create Topic 009+*self+Mira Member", no rows,
  post-restart reload "following more_horiz 1 follower all followed
  cards".
- after (this lane, 30455736): 200; rows inserted: Topic 009+*self
  (Set), Topic 009+*self+Mira Member (Basic), Topic 009+*self+Mira
  Member+*follow (List, db_content *never); notification count 0; the
  post-restart, fresh-login reload reads "follow more_horiz 0 followers
  all followed cards".

Mail unfollow (the notice's link):

- before (recheck, b2b377ca): the mail carried
  /update/*all+Mira_Member+*follow?card[content]=*never (the flat
  repair); the wire answered 303 there, and the contract's named target
  /update/Mira_Member+*follow was never requested.
- after: the mail carries
  /update/Harness_Member+*follow?card[subcards][<rule>]=*never&success[redirect]=soft
  (the stock shape; the synthetic-v1 journey's bytes:
  /update/Mira_Member+*follow?card%5Bsubcards%5D%5B%2Aall%2BMira+Member%2B%2Afollow%5D=%2Anever&success%5Bredirect%5D=soft);
  the wire answers 200 on GET /update/Mira_Member+*follow; row 910
  stores *always -> *never (updater 617, the member); the dashboard card
  Mira Member+*follow inserts; the notice itself still carries the
  contract's one mail (to mira.member@example.test, subject 'Ada Admin
  updated "Note 011"'); the post-restart reload reads "follow more_horiz
  0 followers all followed cards".

The admin follow control (GET /update/Topic_008+*self+Ada_Admin+*follow)
still answers 200 with the inserted *always preference chain, the
follower notice (to mira, subject 'Ada Admin created "Topic 008+*self+
Ada Admin+*follow"'), and the post-restart reload "following more_horiz
2 followers all followed cards".

## The evaluator

    node reference-harness/browser/run-journeys.mjs \
      --engine reference-harness/browser/engines/ts.json \
      --fixture reference-harness/fixtures/synthetic-v1 \
      --journeys reference-harness/browser/journeys/acceptance-follow-operations.json \
      --out .runtime/followfix-20261025/follow-operations-v3
    (ok: all three journeys completed)

    node reference-harness/browser/evaluate-follow-operations.mjs \
      --actual .runtime/followfix-20261025/follow-operations-v3 \
      --fixture reference-harness/fixtures/synthetic-v1 \
      --journeys reference-harness/browser/journeys/acceptance-follow-operations.json \
      --policy reference-harness/browser/journeys/acceptance-follow-operation-contracts.json \
      --engine reference-harness/browser/engines/ts.json \
      --candidate 30455736022d4d3e431417ad98e28aa1f94f6bfc \
      --report docs/runs/follow-compound-create-fix-2026-10-25/follow-operations-evaluator-report.json
    (pass: 3/3 positive follow operations; the report is committed beside
    this record; problems: [])

## The batteries

- Side-effects oracle (the write battery's trace):
  tests/tools/side-effects-scenario-battery.test.ts - "drives the
  TypeScript engine through the 87 public steps and compares it with the
  recorded Ruby trace: 80 steps pass, the 7 steps whose declared
  differences are pinned are declared, and no mismatch remains" - the
  oracle agreement line, verified twice (direct run and inside the
  correctness gate). The mail-body comparator's <unfollow-url> mask folds
  both link shapes, so the restored stock link needs no comparator
  change.
- Persist probe (tests/tools/persist-write-probe.test.ts): fails at
  step 50 with "expected [ 50 ] to deeply equal []". A/B verified
  pre-existing: a pristine worktree at deploy/full-candidate-20261101
  (c17906db, no local diff) fails identically, so the divergence is the
  tip's, not this lane's. Filed as decko-ts issue 26.
- Correctness gate (node tools/test-gates.mjs run correctness):
  7324 passed / 9 failed / 243 skipped, the 9 failures in
  machine-lane-worktree-disk-hygiene (machine state: the fleet's worktree
  count), mysql-driver (5), mysql-lifetime (2) and nest-index-dialects
  (1). A/B identical at the pristine roll-tip worktree (same 5 files,
  same 9 tests, same totals): the gate holds with its known failure set.
- Whole-family exercise (node tools/edge-signed-in-exercise.mjs): the
  first run recorded 318/324 with six failures: the tip's four known
  legs (RichText toolbar, N9 applied layout, P5 *type_plus_right, C20
  junction), the timings leg (its 3 s server-time bound tripped under
  that run's concurrent battery load), and the W6 predicate leg ("the
  unfollow link names the follower's live follow rule and carries the
  never option"). The W6 leg failed because the predicate compared the
  decoded subcard key's display-form rule name against the driver's
  url-key form; 36175859 fixes the predicate to canonicalize both sides
  the way Decko's url key does (spaces to underscores, real underscores
  staying themselves), verified against the exercise's own evidence
  bytes, against Ruby's own display-form link under a url-form
  expectation, and against a wrong rule still failing, with the
  predicate's 17 unit tests green. The final run with that fix lands its
  log at .runtime/followfix-20261025/family-exercise-3.log (untracked
  run artifact), and its tally is recorded in the closing commit of this
  lane.

## What this lane does not claim

- The member unfollow writes are the contracts' product bar, not a Ruby
  parity claim: stock Ruby refuses both writes on this fixture (the
  pinned ruby33 capture answers 422 and 403), and the two permission
  moves (the virtual-set reading of preference?, the owner's dashboard
  arm) are the recorded divergences the contracts require. Every
  permission refusal outside the follow-preference shapes keeps its
  answer: anonymous and foreign-owner dashboard writes still 403
  (bunny-account-mail-http, 15/15), another user's preference still
  denies all three tasks (follow-preference-permissions, 5/5), the
  secverify deep-name denial keeps its 403 (user-error-422-view-parity,
  13/13), and the flat rule route the 2026-10-18 repair introduced still
  writes for its owner.
- Nothing deploys; the family exercise ran the local stack with
  productionRuntime false against its own deck copy.
