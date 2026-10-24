# Tranche 17: the six sign-in and account rows are adjudicated, and the family grade holds at 253 of 253

Branch `port/matrix-round10-20261024` (lane copy
`C:/localProjects/decko-ts-matrix-round10-20261024`, created by the
lane-copy tool from the family's own checkout, with `node_modules` riding a
junction to the family's shared install), from the family's tip `83ca98cd`
("Correct two line citations in the tranche-16 report and the mx-B-037
receipt").

The ask had three parts. The next SIX unadjudicated matrix rows in roster
item order beyond mx-B-042 are adjudicated, one commit each, with
oracle-matched or named-instrument evidence. The whole-family exercise runs
once at this branch's final commit and the grade line is reported. The
touched surface's battery runs green.

## 0. What the ask asked, and what this tranche found

1. **The next six unadjudicated rows.** TAKEN, one commit each, with
   oracle-matched or named-instrument evidence: mx-B-043, mx-B-044, mx-B-045,
   mx-B-046, mx-B-047 and mx-B-048. Section 2.
2. **The whole-family exercise at the final commit.** DONE; the grade line
   is **253 of 253 checks passed**. The round-five through round-nine
   baseline holds, and this tranche met no regression in the exercise
   itself (Section 3). Section 5.
3. **The battery.** The instrument's own test battery passes in this lane,
   the port files the receipts cite are green, and the repo-wide typecheck
   this lane ran alongside them is green. Section 4.

## 1. The selection rule, stated so a reader can check it

The roster is the row ledger for this family
(`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
and the roster's own item order is the family's row-id order (the same rule
the round-three through round-nine tranches used to pick their batches).

The rule was checked against the PRE-STATE, not against the tree as this
tranche left it: the tree at the family's tip `83ca98cd`, read with
`git ls-tree` and `git cat-file`. A family receipt is a file under
`docs/reports` whose content names the roster item's exact id. At that tip
51 of the family's 190 items are so covered, and the first items of the
roster's own order that no receipt names are

    mx-B-043-7-rename-history-search-change
    mx-B-044-7b-further-signed-in-capabilit
    mx-B-045-7b-further-signed-in-capabilit
    mx-B-046-7b-further-signed-in-capabilit
    mx-B-047-7b-further-signed-in-capabilit
    mx-B-048-7b-further-signed-in-capabilit

(the seventh is mx-B-049, "sign-in refused on a wrong password", which this
tranche did not take).

So the next six unadjudicated rows are **mx-B-043, mx-B-044, mx-B-045,
mx-B-046, mx-B-047 and mx-B-048**: the last of the "7. rename, history,
search, changes, sign out and back in" group and the first five of the "7b.
further signed-in capabilities" group.

## 2. The six rows this tranche closed

| row | the row | the instrument | the oracle | the verdict |
|---|---|---|---|---|
| mx-B-043 | signing back in works | the sign-back-in attempt (edge-signed-in-exercise.mjs:1070-1071, over the form-filling sign-in helper at :520-535) | Ruby's own sign-in form (capture arm `probe-view:17:core@set/self/signin.rb`: the `card-form` whose action is `/update/*signin`, the two credential input names, the `Sign in` submit button) and Ruby's own sign-in card (capture arms `probe-view:26:open@set/self/signin.rb` and `probe-view:29:title@set/self/signin.rb`); the port renders the form at signin-core-form-view.ts:176-192 and runs the route at write-routes.ts:1410-1416 | PASS |
| mx-B-044 | the account card's board has an Account tab | the account settings journey's tab read (edge-signed-in-exercise.mjs:671-678, with the tab activation at :682) | Ruby's own board tab bar (capture arm `probe-view:130:board@set/all/editing.rb`: the `tab-li-account` anchor with `data-tab-name="Account"`) and Ruby's own account tab content (capture arm `probe-view:11:account_tab@set/abstract/account_holder.rb`, the `data-cy="email_and_password-pill"` pill); the port renders the tab set at card-mod-edit.ts:3090-3100 and :3366-3383, and the tab's content at card-mod-account.ts:981-1000, which the committed static-Ruby oracle line `account_tab_sections` pins (card-mod-account-harness-probe.test.ts:192-196) | PASS |
| mx-B-045 | the Account tab exposes the account's email and password fields | the account settings journey's field open (edge-signed-in-exercise.mjs:701-718) | Ruby's own account right core view (capture arm `probe-view:15:core@set/right/account/views.rb`: the two labeled rows, `RIGHT-Xemail` and `RIGHT-Xpassword`) and Ruby's own source for it (fixtures/vendor/card-mod-account-0.20.0/set/right/account/views.rb:49-58); the port nests the same two labeled fields at card-mod-account.ts:247-285 and renders the labeled view at views.ts:5887-5927 | PASS |
| mx-B-046 | the account password can be changed and the new one signs in | the password change (edge-signed-in-exercise.mjs:719-741, with the restore at :730-740) | Ruby's own password right (capture arms `probe-view:2:raw@set/right/password.rb`, the word "encrypted", and `probe-view:16:core@set/right/password.rb`, `<em>encrypted</em>`); the port renders both at card-mod-account.ts:287-290 and :326-330, and stores the digest the way Ruby's own `Auth.encrypt` does (actions/account-fields.ts:28-30, run from card-action-engine.ts:1729-1751) | PASS |
| mx-B-047 | the account email can be changed and the new one signs in | the email change (edge-signed-in-exercise.mjs:742-753, with the stored-row read at :749 and the restore at :754-774) | Ruby's own email field (the vendored account mod's data file, fixtures/vendor/card-mod-account-0.20.0/data/real.yml:121-131, the `email` codename and its rights) and Ruby's own email right's raw value (capture arm `probe-view:4:raw@set/type_plus_right/user/email.rb`); the port renders the raw view at card-mod-account.ts:576-590 and owns the two validation events at :1470-1498 | PASS |
| mx-B-048 | the signed-out sign-in page links to sign up and to reset the password | the signed-out sign-in page read (edge-signed-in-exercise.mjs:1077-1088, in an isolated browser with no session cookie) | Ruby's own sign-in page (capture arm `probe-view:17:core@set/self/signin.rb`: the `Reset password` anchor pointing at `/*signin/edit?slot%5Bhide%5D%5B%5D=board_link` and the `...or sign up!` anchor pointing at `/new/Sign_up`); the port renders the buttons block at signin-core-form-view.ts:206-221, the reset link at :125-135 and the sign-up link at :96-113 | PASS |

Each row's receipt is its own file under `docs/reports/`
(`row-mx-B-043-history-search-group-2026-10-24.md` through
`row-mx-B-048-account-capabilities-group-2026-10-24.md`), and each row's
commit is its own commit with an explicit pathspec (d601f9e2, 657817f5,
26f578c6, 380252e0, 1679c023, 12085322). Every receipt names the run it was
written from (the measurement run at `83ca98cd`, started
2026-10-24T12:00:41.012Z, the source files clean) with its evidence.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT is stated plainly in each receipt.
Ruby's own sign-in form (tag, class, action path, the two credential input
names, the password input's type, the submit button), Ruby's own sign-in
card key and title, Ruby's own board tab bar and account tab, Ruby's own
account right's two labeled field rows, Ruby's own password right's
"encrypted" stand-in, Ruby's own email field's codename and rights, and
Ruby's own sign-in page's two links are Ruby's own, and the port renders
each of them. Three limits are stated in the receipts rather than glossed
over. First, the Ruby source files `set/right/password.rb`,
`set/right/email.rb` and `set/type_plus_right/user/email.rb` are NOT
vendored in this repository, so the password policy's four requirements, the
two validation events' Ruby names and the `history? false` rule are named in
the receipts as the port's own cited facts and not claimed as
capture-matched. Second, the session cookie's NAME (`decko_ts_session`,
src/server/write-routes.ts:363), the page's signed-in marker
(`decko.signed_in`, src/card/render/page.ts:1272), the field inputs' `name`
attribute and the per-render tab counter are the port's and the harness's
own facts, named in every receipt as named-instrument facts and not claimed
as oracle-matched. Third, the mx-B-048 check's own reset predicate is
deliberately broad (its filter matches any href containing "reset",
"forgot" or "signin"), so what makes that row oracle-backed is the
byte-equality of the reset href the page offered with Ruby's own captured
reset href, which the receipt says in its own words.

## 3. The defect this tranche met: none

The grade line held, the batteries held, and the repo-wide typecheck this
lane ran alongside them was green at the family's tip:

    npx tsc -p tsconfig.json --noEmit
    exit 0, no diagnostics

So this tranche names no regression and fixes none. The round-nine tranche
found and fixed a type error in an unrelated test file that had kept a
staging-server suite from starting; this tranche did not meet that class
of defect, and the staging-server sign-in suite (ten tests) runs and
passes in this lane (Section 4).

## 4. The battery the touched surface carries

The instrument's own battery passes in this lane:

    node --test "tools/edge-signed-in-exercise/test/*.test.mjs"
    221 tests, 219 pass, 0 fail, 2 skipped (the opt-in live legs)

and the port files the receipts cite are green too:

    npx vitest run tests/card/mod-loader/card-mod-account.test.ts \
      tests/card/mod-loader/card-mod-account-harness-probe.test.ts \
      tests/card/mod-loader/card-mod-account-events.test.ts \
      tests/card/mod-loader/card-mod-account-fields.test.ts \
      tests/card/mod-loader/card-mod-account-forms.test.ts \
      tests/card/mod-loader/card-mod-edit.test.ts \
      tests/card/mod-loader/card-mod-edit-views.test.ts \
      tests/card/mod-loader/card-mod-edit-forms.test.ts \
      tests/card/mod-loader/signin-core-form-view.test.ts \
      tests/card/auth/account-fields.test.ts \
      tests/card/auth/signin.test.ts \
      tests/card/auth/signin-endpoint.test.ts
    12 files, 123 tests, 123 pass, 0 fail

(the sign-in endpoint suite runs on a booted staging server, and its ten
tests, including "POST /_signout revokes the session; the old token renders
anonymous again" and "a bogus session token renders the exact anonymous
bytes", all pass).

## 5. The whole-family exercise

### 5a. The measurement run the six receipts cite

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round10-20261024/rows-r1/report.md

    source 83ca98cddc093c550bcbc5bf7b7f640e117c54b3, started
    2026-10-24T12:00:41.012Z, completed 2026-10-24T12:21:35.391Z,
    the source files clean
    Result: 253 / 253 passed, 0 failed, 0 skipped by write mode

**THE FAMILY GRADE LINE AT THIS BRANCH'S FINAL COMMIT: 253 of 253 checks
passed.** The 253-of-253 baseline holds; there is no regression to name in
the exercise itself. The capability coverage is the same count the earlier
rounds read (70 covered / 20 partial / 1 not covered / 1 disabled upstream /
3 out of scope), the timings leg is green, and this run observed 3,993 engine
requests.

The six rows this tranche closed are green in this run, each with the same
evidence shape as in Section 2. Three of them are graded twice, once for
each of the run's two throwaway accounts, and every one of those six
records is a PASS.

The tool's exit rule is `failures.length === 0 && !coverageIncomplete`
(tools/edge-signed-in-exercise.mjs:1651), and `coverageIncomplete` is true
whenever any capability is partial, not covered or out of scope, so the run
closes with the standing line the round-five through round-nine runs also
carry ("Complete capability acceptance: incomplete or failed. Unrun
capabilities are never credited."). That is the tool's coverage-completeness
signal, not a check failure: the CHECK grade is 253 of 253 with zero
failures.

### 5b. The certification run at this branch's final commit

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round10-20261024/final/report.md

    source __SOURCE__, started __STARTED__, completed __COMPLETED__,
    the source files clean
    Result: __RESULT__

The source the run names is the commit that carries this report and the six
row commits; the one commit that follows it adds this run's result to this
report's text and changes no code, so the tree the run exercised is the
branch's tip tree apart from those paragraphs.

## 6. What this tranche does NOT claim

- **The roster was not folded.** It lives in another repository
  (`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
  and this lane did not write to it, as the round-three through round-nine
  tranches did not. The six rows' receipts add the family's own evidence;
  they do not change any row's DONE condition.
- **The live deployment.** No live request was made by the lane, and no
  row's live instrument was exercised here. Nothing deploys on the decko
  side; the branch is a candidate, and promotion is the operator's yes.
- **The unvendored Ruby sources.** Three of the Ruby source files behind
  the account mod are not in this repository, so the receipts name the
  port's own citations for them instead of claiming a capture match.
- **Nothing here deploys and nothing touches live.**

## 7. The disk cost, in both directions, and the residue

The lane copy added 277,282,814 bytes at creation (the lane-copy receipt:
tracked bytes 252,075,285, estimate bytes 277,282,814; `node_modules`
rides a junction to the family's shared install, so the checkout is the
cost; free on C: at creation 19,275,898,880 bytes). The untracked
artifacts this lane's runs and its batteries produced, measured at the end
of the lane: `.runtime/` 11,721,214 bytes (the runs' reports, run records
and per-request capture evidence the receipts name), `dist/` 23,795,065
bytes (the engine distribution the exercise builds; untracked, rebuilt on
demand), `deploy/dist/` 18,245,207 bytes (the deployed bundle the exercise
rebuilds from source; untracked, rebuilt on demand), `tmp/` 53,826 bytes
(the exercise's own run directory shell, this lane's selection script and
this lane's scratch), `.test-results/` 33,953 bytes (the batteries' JUnit
record). The tracked tree grew from 252,075,285 bytes at the family's tip
to 252,112,978 bytes with the six receipts and this report.

Bytes removed by this lane: none. No tracked file was deleted, and no other
file was deleted either; this lane's guards forbid `rm`, and the residue
named above is evidence the receipts reference, so it is kept. The free
space on C: at the end of the lane is 14,190,751,744 bytes, which is
reported here because it is under the machine's 20 GB working margin; this
lane's own writes are the run artifacts named above and the branch's
commits, and no download, corpus pull or bulk write is part of this
tranche.
