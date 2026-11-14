# Row mx-155, the followers list and all-followed-cards view: every local leg green at the newest pushed tip, the later lanes' fixes verified in place, and the residual that holds the row is re-proven with today's evidence

Row: `mx-155-capability-catalog-follow` in the completeness roster
(`docs/registry/completeness-roster.json` in the operator's row-ledger
repository, family matrix-journey, verdict FAIL held, bucket WORKING ON
IT). Instrument-coverage-matrix action 154 (ACT-155), capability id W4:
"Followers list and 'all followed cards' view", with the row's own legs
W1, W3, W5, W6 and R1 named in its blocker sentence.

This lane (branch `port/held-mx-closeout-20261026`) had one question for
this row: is the held FAIL's named blocker real at the newest pushed tip,
or was it already cleared by a later lane? The row's own acceptance terms
decide what closes it: the row's legs must be green on named-instrument
evidence, AND the row's DONE condition is the guarded live deploy, which
no lane may perform. Both were re-checked at this tip, today.

## The base this evidence is taken at

The same base as the sibling receipts
(`docs/reports/row-mx-B-081-nest-image-editor-held-residual-2026-10-26.md`,
`docs/reports/row-mx-B-086-upload-create-forms-held-residual-2026-10-26.md`):
branch `port/held-mx-closeout-20261026` from commit `86e147b6` (branch
`port/d1d2-verify-20261025`), the newest pushed tip of 654 refs by
committer date, containing the canonical roll `deploy/full-candidate-20261102`
at `c29e4c3f`. The pinned deck
(`6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`) was
verified before and after every run this lane made.

## The named runnable checks, run at this base

Three slices of the signed-in exercise, run back to back, cover every leg
the row's blocker sentence names:

    node tools/edge-signed-in-exercise.mjs --only cover-b --case W1,W3,R1 \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/held-mx-closeout-20261026/mx-155/report-coverb-r1.md

    node tools/edge-signed-in-exercise.mjs --only w4-follow-views \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/held-mx-closeout-20261026/mx-155/report-w4-r1.md

    node tools/edge-signed-in-exercise.mjs --only content-flows \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/held-mx-closeout-20261026/mx-155/report-flows-r1.md

**Results: 10 / 10, 9 / 9 and 25 / 25 checks passed, 0 failed across the
three slices.** These are the row's own legs at the row's own surfaces,
not the whole 253-check exercise the family run measures. Each slice's
process exit code is **1**, by the tool's own rule and not by any failure:
`tools/edge-signed-in-exercise.mjs:1931` exits 0 only when no check failed
AND the capability coverage is complete, and a case slice never completes
it. The exit codes were captured in this lane's own command lines.

Run provenance, read from the three `report-*.md.json` records: all three
runs name source `86e147b676f95dba89f369a8d5ee97b4b8fe543e` with the
source files clean, and the same bundle SHA256
`9b23a398c7c690dd867b153d1f51477c80e7b6f831e8702d14f82eee1595da46` the
sibling rows' slice runs recorded from this tree (the rebuild is
deterministic). Each slice booted its own loopback stack in write mode
`full` over a throwaway deck copy; nothing reaches any live site.

- slice 1 (`cover-b`, case `W1,W3,R1`): started
  `2026-10-26T02:06:35.825Z`, completed `2026-10-26T02:08:02.536Z`
- slice 2 (`w4-follow-views`, the W4 probe): started
  `2026-10-26T02:08:03.189Z`, completed `2026-10-26T02:08:58.852Z`
- slice 3 (`content-flows`, the W5 and W6 legs): started
  `2026-10-26T02:08:59.447Z`, completed `2026-10-26T02:12:05.040Z`

## The row's legs, green

Every leg the row's blocker sentence names is PASS at this tip:

- `W1 a card can be followed from the board's Engage tab (link becomes
  following; *follow rule added)`: PASS.
- `W3 a card and a cardtype can be watched (each gets a *follow rule)`:
  PASS.
- `R1 a card can be renamed and its referers follow` and its two
  companion legs (the rename form offers the referer update Ruby offers;
  the renamed card's references are re-pointed at its new name and id):
  all three PASS.
- The W4 probe, all four of its checks PASS: `W4 the followers list names
  exactly the accounts that follow the card`; `W4 the Engage tab's
  follower count equals the accounts the followers list names`; `W4 the
  all-followed-cards view lists the followed cards and no unfollowed
  card`; `W4 a card nobody follows has an empty followers list`. The
  probe reconciles the rendered pages against the deck's own stored
  follow rules (the same rows the notifications read), never against the
  port's own output.
- `W5 a follower is mailed when a followed card is edited, when a card
  the followed card nests is ...`: PASS, with its five companion legs
  (the notice names actor, verb and card the way Ruby's template does;
  Ruby's own body clauses; Ruby's list_of_changes field list; one act
  sends one notice; a non-notable change sends none).
- `W6 the unfollow link in the follower mail stops the follow rule`:
  PASS, with its three companion legs (the mail carries the Unfollow
  link the template writes; the link names the follower's live follow
  rule and carries the never option; following the link stops the rule
  the way Ruby's stop-follow does).

The cleanup legs and the final browser asset audit pass on every slice
(1 browser context each, 0 asset failures; every journey-created card
removed, 0 remaining).

## What later lanes cleared, verified in place by this lane

The row's blocker sentence names instrument and engine work that earlier
tranches owed. All of it is in this tip:

1. **The unfollow write refusal this row named is fixed.** The canonical
   roll `c29e4c3f` carries the fix, and the shipped evaluator receipt at
   this tip (`docs/runs/follow-compound-create-fix-2026-10-25/follow-operations-evaluator-report.json`,
   read by this lane) reads verdict `pass` with all three journeys green:
   `follow-admin-operation-persistence`,
   `unfollow-member-operation-persistence`,
   `unfollow-mail-operation-persistence`. This lane's own W6 slice legs
   are green on the same tree: the unfollow link in the follower mail
   stops the follow rule on the local stack.
2. **The W4 probe and the W5/W6 mail contract are committed instruments**
   (`tools/edge-signed-in-exercise/checks-w4-follow-views.mjs`,
   `tools/edge-signed-in-exercise/lib/follower-notice-contract.mjs`), and
   this lane ran both, green, at this tip.

## The adjudication: the named blocker is real at this tip

The row's blocker sentence names one thing for the row's verdict and
bucket: the DONE condition still waits on the guarded live deploy, and
the ACT-155 LIVE leg needs that same deploy to have landed before it can
be run against the live host. Three checks, all run in this lane:

1. **The row ledger still carries the blocker.** The roster row
   `files-area-arming-decko-storage-pair-absent` stands at verdict
   BLOCKED (roster timestamp `2026-10-25T22:35:52.211Z`): the
   DECKO_STORAGE_ZONE / DECKO_STORAGE_PASSWORD values do not exist in
   the Bunny account, so the arm script has never fired and the guarded
   live deploy has never run.
2. **No receipt at this tip records the blocker clearing.** `git grep`
   over `docs/reports` at `86e147b6` for `files-area` and for `96867`
   names only the receipts that define and carry the blocker.
3. **A candidate is a branch, not a deployment.** The fix rides the
   canonical roll `c29e4c3f`, which this branch contains, but no deploy
   has run. This lane made no deploy and no request to any live host
   (lane guards); the live host was not probed at all, so the ACT-155
   LIVE leg remains unrunnable by any lane.

The named blocker is therefore REAL at this tip, and the row cannot close.

## The residual, exact

The single named thing that keeps row `mx-155-capability-catalog-follow`
open at tip `86e147b6`:

> The row's ACT-155 LIVE leg and its DONE condition both wait on the
> guarded live deploy to live 96867, which has never run because the
> files-area pair does not exist in the Bunny account (row
> `files-area-arming-decko-storage-pair-absent`, verdict BLOCKED: the
> DECKO_STORAGE_ZONE / DECKO_STORAGE_PASSWORD values are an operator
> account-side call that has not been made), so the live leg cannot be
> run by any lane; every local leg the row names is green at
> `86e147b6`.

## What this receipt does not claim

- **The roster was not folded.** It lives in the operator's repository,
  and this lane did not write to it.
- **The live deployment.** No live request was made by this lane, and
  nothing deploys. Promotion is the operator's yes.
- **The whole-family exercise** runs once at this branch's final commit;
  its grade line is recorded in the branch's own round report, not in
  this row receipt.
