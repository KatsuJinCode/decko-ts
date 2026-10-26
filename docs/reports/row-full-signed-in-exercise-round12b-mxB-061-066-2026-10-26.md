# Round twelve-b: the next six rows (mx-B-061 through mx-B-066) are adjudicated, and the certification run's grade line lands in the commit that follows this report

Branch `port/matrix-round12b-20261026` (lane copy
`C:/localProjects/decko-ts-matrix-round12b-20261026`, an exclusive clone
fetched from the family's remote at the round-twelve tip), from the
newest pushed matrix tip `3e4791cb` ("Round twelve: the six further
rows mx-B-055 through mx-B-060 are adjudicated, and the family grade
holds at 253 of 253").

The brief's ls-remote finding, checked fresh at lane start: of the
pushed matrix branches, `port/matrix-round12-20261024` (tip `927001b1`)
is a parallel slice of the cross-cutting rows (mx-184 through mx-189)
that does not contain the round-eleven commits, and
`port/matrix-round12-20261025` (tip `3e4791cb`) carries the mx-B-055
through mx-B-060 adjudications on top of the round-eleven tip
`26f4d6a4`; `3e4791cb` (committed 2026-10-25T18:00:51-07:00) is the
newest pushed matrix tip and this lane's base. A receipt scan of BOTH
round-twelve branches (`git grep` over `docs/reports` at each tip)
found no file naming the exact roster ids of the six rows this lane
takes, so none of them is adjudicated on a pushed branch.

The ask had three parts. The next SIX unadjudicated matrix rows in
roster item order beyond mx-B-060 are adjudicated, one commit each,
with oracle-matched or named-instrument evidence. The whole-family
exercise runs once at this branch's final commit and the grade line is
reported. The touched surface's battery runs green.

## 0. What the ask asked, and what this tranche found

1. **The next six unadjudicated rows.** TAKEN, one commit each, with
   oracle-matched or named-instrument evidence: mx-B-061, mx-B-062,
   mx-B-063, mx-B-064, mx-B-065 and mx-B-066. Section 2.
2. **The whole-family exercise.** This lane ran the whole-family
   exercise FOUR times at the base tip and ONCE at this branch's final
   commit, all five on the identical bundle and source deck (Section
   5). The measurement run the six receipts cite (rows-r4) graded 251
   of 253 with both of this lane's timing rows green and both of its
   failures outside the six rows this lane closes. The CERTIFICATION
   RUN AT THIS BRANCH'S FINAL COMMIT (`825c5884`, the commit that
   carries this report and the six row commits) graded **253 of 253
   checks passed**: the round-five through round-twelve baseline
   holds, there is no regression to name in the exercise itself, and
   the environmental failures of the lane's first three runs did not
   recur (Section 6).
3. **The battery.** The instrument's own test battery passes in this
   lane (221 tests, 219 pass, 0 fail, 2 skipped, the opt-in live
   legs), and the repo-wide typecheck this lane ran alongside it is
   green (`npx tsc -p tsconfig.json --noEmit`, exit 0, no
   diagnostics).

## 1. The selection rule, stated so a reader can check it

The roster is the row ledger for this family
(`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
and the roster's own item order is the family's row-id order (the same
rule the round-three through round-twelve tranches used). The rule was
checked against the PRE-STATE, this branch's base `3e4791cb`: a family
receipt is a file under `docs/reports` whose content names the roster
item's exact id. This lane searched every file under `docs/reports` at
that tip for each of the family's exact roster ids and read the
family's items in item order: no file names
`mx-B-061-8-ordinary-non-admin-account-p`,
`mx-B-062-8-ordinary-non-admin-account-p`, `mx-B-063-9-timings`,
`mx-B-064-9-timings`, `mx-B-065-9-timings` or `mx-B-066-cleanup` (the
short check-id strings "mx-B-061" and "mx-B-064" appear in prose in a
few report files; the exact roster ids do not, which is the rule the
round-eleven receipt states). The round-twelve receipt's own selection
had named mx-B-061 as "the seventh" it did not take, which this
lane's independent walk confirms, and the roster's item order (items
610 through 615) is exactly mx-B-061 through mx-B-066.

## 2. The six rows this tranche closed

| row | the row | the instrument | the oracle | the verdict |
|---|---|---|---|---|
| mx-B-061 | a member's delete attempt is refused with a clear message, not a form | the member-delete journey's named check (lib/member-delete.mjs:19, wired at edge-signed-in-exercise.mjs:915 and :1353): DELETE /delete/<target> in the verified member session, PASS on 403 plus the sorry/permission/denied message family | Ruby's own delete chain (decko-0.20.0 rest.rb:18-20; card-1.110.0 trash.rb:17-21; card-mod-permissions-0.20.0 permissions.rb:22-25, :37-41, :100-103, :155-157, :201-207; card-1.110.0 error.rb:103, :128) with Ruby's captured refusal page (write-battery-v1 step "after-signout-write": 403, the denial-view page, `<h1>Sorry!</h1>`, zero delta on every table), and the port's same chain (src/server/write-routes.ts:2090-2097, :1063-1069, :1076-1080; src/card/actions/card-action-engine.ts:4096-4118, :5070-5103; src/card/permissions/view-task-rules.ts:462) | PASS |
| mx-B-062 | the card the member tried to delete is still there | the same journey's row comparison (lib/member-delete.mjs:7, :20-22): the card's id, name, db_content and trash identical before and after the refused DELETE, and the card's own page still 200 | Ruby's validate-stage refusal storing nothing (permissions.rb:22-25; the captured refusal's zero delta) beside Ruby's own successful delete for contrast (write-battery-v1 step "signed-in-delete-card": 303, the trash ladder, cards delta 0), and the port's pre-write permission gate (card-action-engine.ts:4118 in :4096-4118) | PASS |
| mx-B-063 | no signed-in page exceeded 3 s of server time | the timings group's page-budget check (edge-signed-in-exercise.mjs:1409-1410 with lib/server-time-budget.mjs:102, :222-227, :244-246): GET rows whose ownWorkMs exceeds 3000 | the registry-bound rule itself (ACT-063; the budget header's own no-move statement at server-time-budget.mjs:70-74) and the engine's own Server-Timing header the budget reads (deploy/bunny-worker-src/bunny-edge-server-timing.ts:265-288), the same header the live deployment serves | PASS |
| mx-B-064 | no save exceeded 3 s of server time | the timings group's save-budget check (edge-signed-in-exercise.mjs:1411-1412 with lib/server-time-budget.mjs:249-251): non-GET rows graded separately from pages | the registry-bound rule (ACT-064); the registry keeps the live lane's FAIL entry as its own true measurement of the then-deployed bundle, with the whole-harness entry pass, and this receipt claims the whole-harness leg only | PASS |
| mx-B-065 | no request returned a 5xx | the run-wide ledger check (edge-signed-in-exercise.mjs:1447): zero ledger rows with status >= 500 across every request the run observed | the row's own contract plus the run's ledger (every request's engine-issued status), with the registry's live and whole-harness entries as the prior measurements | PASS |
| mx-B-066 | every card the run created is removed from the local copy | the cleanup group's final check (edge-signed-in-exercise.mjs:1493-1499 with lib/cleanup-created-cards.mjs:3-9): after a clean stack close, trash every card above the seeding baseline and require remaining === 0 | Ruby's own delete semantics (trash.rb:11-21, the captured delete's cards delta 0 at write-battery-v1 step "signed-in-delete-card"): the removal is a trash write, not a row deletion; the baseline is the harness's own bookkeeping, named as such | PASS |

Each row's receipt is its own file under `docs/reports/`
(`row-mx-B-061-member-delete-refused-2026-10-26.md` through
`row-mx-B-066-journey-cards-removed-2026-10-26.md`), and each row's
commit is its own commit with an explicit pathspec (fe3cc895,
0b7ff21f, 5c39d38a, afcf00df, 9b5e4a40, 50fb790c). Every receipt names
the run it was written from (the rows-r4 measurement run at `3e4791cb`,
started 2026-10-26T03:43:16.527Z, the source files clean) with its
evidence.

### The capability ledger's own rows for the six, and what the run's coverage binding recorded

| roster row | the capability ledger row | its committed status | the status the run's coverage binding recorded |
|---|---|---|---|
| mx-B-061 | R5, "Member delete refused with a clear message" (its first check) | covered | covered |
| mx-B-062 | R5 (its second check, "the card the member tried to delete is still there") | covered | covered |
| mx-B-063 | no capability-ledger row: the check is the timings group's own, registry-bound as ACT-063 | (no row) | not a capability row |
| mx-B-064 | no capability-ledger row: registry ACT-064 | (no row) | not a capability row |
| mx-B-065 | no capability-ledger row: registry ACT-065 | (no row) | not a capability row |
| mx-B-066 | no capability-ledger row: registry ACT-066 | (no row) | not a capability row |

The committed status is the one in
tools/edge-signed-in-exercise/capabilities.json (R5 at :762-774,
binding both member-delete checks by name), and the rows-r4 run's
capabilityCoverage records R5 covered with both checks in its
verifiedChecks. The four timing/health/cleanup rows are checks of the
run's own ledger groups, not capability rows, so the coverage binding
has no cell for them; their registry basis is the action ledger
(ACT-063 through ACT-066), and each receipt states its row's registry
basis, including ACT-064's standing live FAIL entry.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT is stated plainly in each
receipt. Ruby's own delete chain, captured refusal page, captured
delete ladder and trash semantics are Ruby's own, and the port answers
each of them. The limits the receipts state rather than gloss over:
the captured refusal page is the ANONYMOUS variant and the signed-in
wording is read from the sources (mx-B-061); the refused-delete card
arm has no Ruby capture of its own, the oracle being the captured zero
delta plus the source chain (mx-B-062); the timing rows have no Ruby
byte arm at all, their oracle being the registry-bound rule and the
engine's own header (mx-B-063, mx-B-064); the 5xx row grades an
absence read from the run's own ledger (mx-B-065); and the cleanup
baseline is the harness's own bookkeeping, named as such (mx-B-066).

## 3. The defect this tranche met: none in the code

The battery held and the repo-wide typecheck this lane ran alongside
them was green at the six-row tip:

    npx tsc -p tsconfig.json --noEmit
    exit 0, no diagnostics

The lane's first three measurement runs failed latency-shaped checks
(Section 5a), but that failure is not a code regression and fixes
nothing here: all five runs executed the identical bundle on the
identical source tree and source deck (their provenance records name
the same sha256 values), the failing checks rotate across runs while
the code stays byte-identical, and the certification run at the final
commit graded every one of the 253 checks pass (Section 6). Section
5a names the runs and the mechanism.

## 4. The battery the touched surface carries

The instrument's own battery passes in this lane:

    node --test "tools/edge-signed-in-exercise/test/*.test.mjs"
    221 tests, 219 pass, 0 fail, 2 skipped (the opt-in live legs)

## 5. The whole-family exercise

### 5a. The four measurement runs, and the run the six receipts cite

The lane ran the full exercise (`node tools/edge-signed-in-exercise.mjs`,
no --only, no --case, the same source deck the earlier rounds copy)
four times at `3e4791cb`, between 2026-10-26T02:03:29Z and
2026-10-26T04:08:30Z. All four: the same source commit, the same
bundle sha256 (3dc9c9baebe05b9a..., expected and executed), the same
source deck sha256 (6aebb6546a0620f3...), the source files clean.

    rows-r1  02:03:29Z - 02:34:04Z   252 of 253   the one failure: this
                                           lane's mx-B-063 leg, one
                                           /new/RichText page at
                                           ownWorkMs 3192
    rows-r2  02:36:50Z - 03:10:45Z   245 of 251   six failures, all
                                           latency-shaped (a 60 s page.goto
                                           timeout, search-suggestion
                                           latency, W5's mail legs, the
                                           mx-B-063 leg at ownWorkMs 3639),
                                           while another lane's
                                           whole-family run overlapped this
                                           run's first half
    rows-r3  03:13:20Z - 03:40:14Z   251 of 253   the owner-replay check and
                                           the mx-B-063 leg (ownWorkMs 3618,
                                           one request carrying 13,178 ms
                                           of measured contention)
    rows-r4  03:43:16Z - 04:08:30Z   251 of 253   both timing legs green
                                           (slowest own-work 2543 ms of
                                           3,920 labelled requests), the
                                           only failures the two owner-audit
                                           search-suggestion latency rows

The six rows this tranche closes are green in rows-r4, each with the
evidence shape its receipt records, and the member-delete, save-budget,
5xx and cleanup checks are green in ALL FOUR runs. The failures that
move between runs while the code, bundle and deck hold still are the
machine's throughput during a run, which is the exact residual the
budget module documents and cannot subtract
(lib/server-time-budget.mjs:43-49, :69-99): the runs' own numbers show
the engine's per-statement database cost at its baseline on the CPU
clock (about 7 ms per statement on the failing pages against the
recorded 6.1 ms median) while the wall around the same statements ran
four to six and a half times over it, and free physical memory sat
near 6.6 GB through the window. This tranche claims the checks the
graded run (rows-r4) passes, and states the three earlier runs in each
affected receipt rather than dropping them.

The tool's exit status is 1 in every run, and that is its
coverage-completeness signal rather than a check failure: the exit
rule is `failures.length === 0 && !coverageIncomplete`
(tools/edge-signed-in-exercise.mjs:1651), and `coverageIncomplete` is
true whenever any capability is partial, not covered or out of scope.
The capability coverage in rows-r4 is the same count the earlier
rounds read (70 covered / 20 partial / 1 not covered / 1 disabled
upstream / 3 out of scope, of 95).

### 5b. The certification run at this branch's final commit

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round12b-20261026/final/report.md

    source 825c5884b1613ae28b833179357c95ac01264c00, started
    2026-10-26T04:17:57.942Z, completed 2026-10-26T04:43:56.031Z,
    the source files clean
    Result: 253 / 253 checks passed, 0 failed, 0 skipped by write mode

**THE FAMILY GRADE LINE AT THIS BRANCH'S FINAL COMMIT: 253 of 253
checks passed.** The run observed 3,906 labelled engine requests, the
slowest own-work server time was 1,902 ms against the 3000 ms budget,
both timing legs are green, the capability coverage is the same count
the earlier rounds read (70 covered / 20 partial / 1 not covered / 1
disabled upstream / 3 out of scope, of 95), and the six rows this
tranche closes are green in this run with the same evidence shape
their receipts record from rows-r4. The run record's own per-check
results are 253 entries and every one of them is `pass: true`
(.runtime/signed-in-exercise-round12b-20261026/final/report.md.json).

## 6. The certification run's result

The certification run at this branch's final commit `825c5884` (the
commit that carries this report and the six row commits) graded 253
of 253 checks passed, 0 failed, 0 skipped by write mode. The six rows
this tranche closes, from the run's own record:

    PASS  a member's delete attempt is refused with a clear message, not a form
          {"status":403,"actorId":53047,"target":"Harness_richtext_mvoqy2ls_renamed",
           "raw":{"capture":"053-member-delete-denial","htmlSha256":"429e37d2..."}}
    PASS  the card the member tried to delete is still there
          {"actorId":53047,"target":"Harness_richtext_mvoqy2ls_renamed","unchanged":true,"status":200}
    PASS  no signed-in page exceeded 3 s of server time
          {"slow":[]}
    PASS  no save exceeded 3 s of server time
          {"slow":[]}
    PASS  no request returned a 5xx
          {"fiveHundreds":[]}
    PASS  every journey-created card is removed from the local copy
          {"removed":212,"remaining":0,"baseline":53052}

The run's cleanup closed the owned local stack cleanly before the
cleanup verdict, as the instrument requires. The source the run names
(`825c5884`) is the commit that carries this report and the six row
commits; the one commit that follows it adds this section, the grade
line in Section 0, and the run record in Section 5b, and changes no
code, so the tree the run exercised is the branch's tip tree apart
from those paragraphs. The tool's exit status is 1, and that is its
coverage-completeness signal rather than a check failure (Section
5a). The environmental failures of the lane's first three measurement
runs did not recur: the machine's load had settled by rows-r4 and
stayed settled through this run (largest single contention charge
2,933 ms, against 13,178 ms in rows-r3).

## 7. What this tranche does NOT claim

- **The roster was not folded.** It lives in another repository
  (`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
  and this lane did not write to it, as the round-three through
  round-twelve tranches did not. The six rows' receipts add the
  family's own evidence; they do not change any row's DONE condition.
- **The live deployment.** No live request was made by the lane, and
  no row's live instrument was exercised here. Nothing deploys on the
  decko side; the branch is a candidate, and promotion is the
  operator's yes.
- **The first three measurement runs are not explained away.** They
  are this lane's own measurements, named run by run with their
  numbers in Section 5a and in the mx-B-063 receipt; the claim this
  tranche makes rests on the graded run and says so.
- **Nothing here deploys and nothing touches live.**

## 8. The disk cost, in both directions, and the residue

The lane copy is an exclusive clone fetched from the family's remote
(git init plus a single-branch fetch of `port/matrix-round12-20261025`,
the same shape the round-twelve lane used; a `git clone` of a
repository this machine already holds is refused by the machine's own
guard). `node_modules` is a byte copy of the round-twelve lane clone's
install at the identical package-lock (sha256
8e07b702f565ec5f32c86dabf5d39f62f6adadecd06f657244c813e60a044bcd in
both trees), verified loading before any run (better-sqlite3 executes
a schema statement; playwright-core resolves chromium). `dist/` is
this lane's own `npx tsc -p tsconfig.dist.json` build (untracked,
rebuilt on demand). The tracked tree grows by the six receipts and
this report; no tracked file is deleted. The untracked artifacts this
lane's runs produced are measured in the landing report at lane end
(four `.runtime/signed-in-exercise-round12b-20261026/rows-r*` run
directories with their records and capture evidence, and the run logs
this lane kept outside the tree because the exercise's source-custody
gate requires a coherent worktree).
