# Round thirteen: the six further rows (mx-B-067 through mx-B-072) are adjudicated, and the certification run's grade line lands in the commit that follows this report

Branch `port/matrix-round13-20261026` (lane copy
`C:/localProjects/decko-ts-matrix-round13-20261026`, an exclusive clone
fetched from the family's remote at the round-twelve tip), from the
newest pushed matrix tip `acd0cd4c` ("The certification run at this
branch's tip: 253 of 253, rows mx-B-061 through mx-B-066 adjudicated").

The brief's ls-remote finding, checked fresh at lane start: of the pushed
matrix branches, `port/matrix-round12b-20261026` (tip `acd0cd4c`,
committed 2026-10-25T21:45:17-07:00) is the newest, ahead of
`port/matrix-round12-20261025` (`3e4791cb`, 2026-10-25T18:00:51-07:00)
and of the parallel backslice `port/matrix-round12-20261024`
(`927001b1`, 2026-10-24T16:38:26-07:00); `acd0cd4c` is this lane's base.
The pushed `port/held-mx-closeout-20261026` tip (`57bce298d`,
2026-10-25T21:41:34-07:00) is four minutes older and belongs to another
lane's family on another base (the v23 candidate chain), so it is not a
matrix tip.

The ask had three parts. The next SIX unadjudicated matrix rows in
roster item order beyond mx-B-066 are adjudicated, one commit each, with
oracle-matched or named-instrument evidence. The whole-family exercise
runs once at this branch's final commit and the grade line is reported.
The touched surface's battery runs green.

## 0. What the ask asked, and what this tranche found

1. **The next six unadjudicated rows.** TAKEN, one commit each, with
   oracle-matched or named-instrument evidence: mx-B-067, mx-B-068,
   mx-B-069, mx-B-070, mx-B-071 and mx-B-072. Section 2.
2. **The whole-family exercise.** This lane ran the whole-family
   exercise ONCE at the base tip (the measurement run the six receipts
   cite) and TWICE at this branch's final commit (two certification
   runs). The measurement run graded 251 of 253, the first certification
   run 251 of 253 and the second 249 of 253. Every failure in all three
   is outside the six rows this lane closes, and the failures MOVE
   between the runs while the tree, the bundle and the deck hold still:
   the six rows this tranche closes are green in ALL THREE. The two
   named mechanisms are the Engage tab's follow-link race (the
   repository's issue 34) and the machine's throughput during a run.
   Sections 5a, 5b and 6a.
3. **The battery.** The instrument's own test battery passes in this
   lane (221 tests, 219 pass, 0 fail, 2 skipped, the opt-in live legs),
   and the repo-wide typecheck this lane ran alongside it is green
   (`npx tsc -p tsconfig.json --noEmit`, exit 0, no diagnostics).

## 1. The selection rule, stated so a reader can check it

The roster is the row ledger for this family
(`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
and the roster's own item order is the family's row-id order (the same
rule the round-three through round-twelve tranches used). The rule was
checked against the PRE-STATE, this branch's base `acd0cd4c`: a family
receipt is a file under `docs/reports` whose content names the roster
item's exact id. This lane searched every file under `docs/reports` at
that tip (159 files) for each of the family's exact roster ids and read
the family's items in item order: no file names `mx-B-067-cleanup`,
`mx-B-068-cover-b-account-settings-page-`,
`mx-B-069-cover-b-account-settings-page-`,
`mx-B-070-cover-b-create-duplicate-name-`,
`mx-B-071-cover-b-create-duplicate-name-` or
`mx-B-072-cover-b-create-pointer-inputs-`. The short check-id strings
"mx-B-067" through "mx-B-072" appear in no file under `docs/reports` at
that tip either, in prose or otherwise. The roster's item order (items
66 through 71) is exactly mx-B-067 through mx-B-072, so those six are
the next six unadjudicated rows.

WHAT THE ROSTER ITSELF SAYS ABOUT THESE SIX, named rather than glossed
over: the roster's own verdict column already reads PASS and bucket DONE
for all six. For mx-B-067 the roster's `blocker` field reads "verified -
every instrument entry for B-067 is pass (live-acceptance-lane +
whole-harness)", that is, the ledger's own two entries. For mx-B-068,
mx-B-069, mx-B-070 and mx-B-072 the field names the grind tranche-2 run
of 2026-10-19 at source d8050251 and, for mx-B-068 and mx-B-069, the
probe-pageonly-top10 probe run of the same tranche; for mx-B-070 and
mx-B-071 it names the live-session13 receipts of 2026-10-19 (a real
creator session). That evidence lives in OTHER lanes' run records, not in
this family's receipt set, so under the round-twelve selection rule these
six rows were still unadjudicated for this family at this tip. This
tranche's six receipts add the family's own adjudication at this tip;
they do not change any row's DONE condition, and the roster lives in
another repository, which this lane did not write to.

## 2. The six rows this tranche closed

| row | the row | the instrument | the oracle | the verdict |
|---|---|---|---|---|
| mx-B-067 | the owned local stack is closed | the cleanup group's stack close (edge-signed-in-exercise.mjs:1490-1491): `stack.close()` in a try, PASS on a clean close, FAIL with the error text on a throw; the close itself is lib/stack.mjs:122-126 (host, then the HRANA server, then the mock storage, each in a `finally`), the host's own shutdown at lib/edge-host.mjs:238-239 and the database server's at lib/local-hrana.mjs:213-215 | no Ruby arm, and the receipt says so: the stack is the harness's own process, not a Decko behaviour, so the oracle is the named instrument plus the registry's own prior measurements of the row (ACT-067: the live-acceptance-lane entry pass, the live build of 2026-10-16T14:01:03Z, and the whole-harness entry pass at source 50717cca) | PASS |
| mx-B-068 | the account settings page shows the signed-in member's email | the account journey's named check (edge-signed-in-exercise.mjs:694-700): the board's Account tab, the Email and Password pill, the labeled row's TEXT must contain the actor's own address; the journey runs for both fixture accounts (edge-signed-in-exercise.mjs:1301). A second named instrument grades the same row: the page-only write permission probe (reference-harness/browser/probe-pageonly-top10-write-permission.mjs:657-661) | Ruby's own account view (card-mod-account-0.20.0/set/right/account/views.rb:49-57: `account_field_nest` nests the email field with `view: :labeled`; the email right is a phrase, set/right/email.rb:5) and the port's same nest (src/card/mod-loader/mods/card-mod-account.ts:267-285, `view: "labeled"` at :279) | PASS |
| mx-B-069 | the account's email can be changed and the new address shows on the account page | the same journey's check (edge-signed-in-exercise.mjs:742-773): the new address is written (:745-748), the stored row is read back from the owned database (:749), the old credential stops and the new one signs in (:750-753), and the address a person READS on the account page afterwards is the new one (:762-769). The page-only probe grades the same row (probe-pageonly-top10-write-permission.mjs:663-669) | Ruby's own email right (card-mod-account-0.20.0/set/right/email.rb:5 `assign_type :phrase`, :7-14 `validate_email`, :16-27 `validate_unique_email`, :29-33 `downcase_email`, :39-48 the read rule) and the port's same three events (src/card/mod-loader/mods/card-mod-account.ts:1470-1497, engine-owned at src/card/auth/account-fields.ts) | PASS |
| mx-B-070 | a card whose name already exists is refused (Home untouched, error shown) | the cover-b module's check (tools/edge-signed-in-exercise/checks-cover-b.mjs:258-271): the create answers 400 or more, the page text matches /already|exist|taken|Problems with/i, and Home still answers 200. The runner's own C8 check grades the same row (edge-signed-in-exercise.mjs:1159-1170) | Ruby's own name uniqueness event (card-1.110.0/mod/core/set/all/name_events.rb:12-20, the message at card-1.110.0/mod/core/config/locales/en.yml:15), Ruby's own 422 answer (card-1.110.0/lib/card/error.rb:20-21) with the errors view (card-mod-format-0.20.0/set/all/html/error.rb:53-65, "Problems with %{cardname}" at en.yml:16), and the port's same code and page (src/card/actions/name-validation.ts:90-112) | PASS |
| mx-B-071 | the content preset in the /new URL fills the editor and is stored on the card | the cover-b module's check (checks-cover-b.mjs:273-289): the ACTIVE editor holds the marker before the submit, the card's page answers 200 and carries the marker. The runner's own C10 check grades the same row (edge-signed-in-exercise.mjs:1126-1149) | Ruby's own new-card route reading the request's card hash (card-1.110.0/lib/card/fetch/card_class.rb:128-133, the new view at card-mod-edit-0.20.0/set/all/new.rb:4-6) and the save (decko-0.20.0/lib/card_controller/rest.rb:6-8), and the port's own reading of the same query (deploy/bunny-worker-src/bunny-edge-engine-request.ts:625-634, :1086) | PASS |
| mx-B-072 | a checkbox pointer input can be checked and stored (the card shows the checked value) | the cover-b module's check (checks-cover-b.mjs:362-388): the checkbox is checked, the write answers under 400, the stored row carries the value, the card's page shows it, and the choice can be removed again (:381-387) | Ruby's own checkbox editor (card-mod-list-0.20.0/set/abstract/01_list/html_views/checkbox_input.haml:1-8, the view at html_views.rb:56-65), Ruby's own rule that offers the checkbox input type (card-mod-edit-0.20.0/set/right/input_type.rb:39-41, set/type/list.rb:1-3), Ruby's own feature as the behavioural specification (decko-0.20.0/features/pointer_inputs.feature:27-38), and the port's same widget (src/card/mod-loader/mods/card-mod-list.ts:626-646, dispatched at :467-478) | PASS |

Each row's receipt is its own file under `docs/reports/`
(`row-mx-B-067-owned-stack-closed-2026-10-26.md` through
`row-mx-B-072-checkbox-pointer-input-2026-10-26.md`), and each row's
commit is its own commit with an explicit pathspec (56afd25f, e556104b,
48f54258, 906d7e4d, a11ca49d, 8ad53eed). Every receipt names the run it
was written from (the measurement run at `acd0cd4c`, started
2026-10-26T06:31:53.510Z) with its evidence.

### The capability ledger's own rows for the six, and what the run's coverage binding recorded

| roster row | the capability ledger row | the committed status | the status the run's coverage binding recorded |
|---|---|---|---|
| mx-B-067 | no capability-ledger row: the check is the cleanup group's own | (no row) | not a capability row |
| mx-B-068 | A1, "Open the account settings page" (its third check) | not_covered | covered, with all three of its checks verified |
| mx-B-069 | A3, "Change email" (its second check) | not_covered | covered, with both of its checks verified |
| mx-B-070 | C8, "Duplicate name refused in the editor (validation error)" | partial | partial, with its named check verified |
| mx-B-071 | C10, "Presetting card content from the URL (?card[content]=...)" | not_covered | covered, with its check verified |
| mx-B-072 | C16, "Checkbox input in a new card" | not_covered | covered, with its check verified |

The committed statuses are the ones in
tools/edge-signed-in-exercise/capabilities.json (A1, A3, C8, C10 and C16
each with their own `checks` list), and the run's coverage binding
recomputes each row's status from the check outcomes the run recorded
(the ledger's own summary note: "Counts are recomputed from actual
recorded check outcomes"). Two limits the receipts state rather than
gloss over: the C10 row carries a stale finding string ("URL presets
ignored: the new-card form hardcodes an empty name and content") that the
coverage binding carries along unchanged while moving the row to covered,
and the C8 row stays partial because the ledger's named check for it is
the runner's variant, whose finding says the visible validation error is
not asserted (the cover-b module's own C8 check does assert it). The
cleanup row has no capability-ledger row: the check is the run's own
lifecycle check, registry-bound as ACT-067.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT is stated plainly in each
receipt. Ruby's own account view, name uniqueness event, error page,
new-card route, checkbox editor and pointer-input feature are Ruby's own,
and the port answers each of them. The limits the receipts state rather
than gloss over: the cleanup row has no Ruby byte arm at all (the stack
is the harness's own process); the account rows grade the CONTAINMENT of
the address in the labeled row's text rather than Ruby's exact bytes; the
duplicate-name row keeps the HEAD of the server's answer and grades the
visible error by a text pattern; the URL-preset row reads the editor's
content and the created card rather than Ruby's form bytes; and the
checkbox row's fixture is the harness's own.

## 3. The defect this tranche met: none in the code

The battery held and the repo-wide typecheck this lane ran alongside
them was green at the six-row tip:

    npx tsc -p tsconfig.json --noEmit
    exit 0, no diagnostics

The lane's measurement run failed two checks, and neither is a code
regression and neither is in this tranche's six rows: the E10 plain-input
edit check (the write answered no status inside that attempt's window,
while the card's own page answered 200 and showed the new content) and
the page-time budget row (three pages over the 3000 ms budget, each
carrying a contention charge of 2745, 1582 and 912 ms of measured machine
contention against 221, 1251 and 967 ms of the engine's own database CPU
time). The tree, the bundle and the deck are byte-identical to the ones
the round-twelve lane ran (the same bundle sha256
3dc9c9baebe05b9aa04935592cbb636de90cfc712da367c8008176f544678748 and the
same deck sha256
6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78), so
the failures that move between runs while the code holds still are the
machine's throughput during a run, which is the residual the budget
module documents (lib/server-time-budget.mjs:43-49, :69-99).

THE JUNCTION SET-ANCHOR FAMILY IS GREEN IN THIS LANE'S RUN, and this
tranche did not touch it. The brief's note names that family as owned by
the anchor-regression lane (junction set-anchor creates, C20/P5, the M1
and N9 items). The run recorded here has all of them green: C20's six
checks (indices 210-215), P5 (index 144), M1 (index 154) and N9 (index
114). The reason is in the lineage, and this lane checked it rather than
assuming it: the commit the anchor-regression lane bisected as first bad,
`db68cdfc1` (the regfix-row22 boot cascade), is NOT an ancestor of this
branch's base `acd0cd4c` (`git merge-base --is-ancestor db68cdfc1
acd0cd4c` exits 1), so this branch does not carry that regression. No
fix was attempted here, because the lane does not own it.

## 4. The battery the touched surface carries

The instrument's own battery passes in this lane:

    node --test "tools/edge-signed-in-exercise/test/*.test.mjs"
    221 tests, 219 pass, 0 fail, 2 skipped (the opt-in live legs)

## 5. The whole-family exercise

### 5a. The measurement run, the run the six receipts cite

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round13-20261026/rows-r1/report.md

    source acd0cd4cb24d3627981fa383619f5fea94731066, started
    2026-10-26T06:31:53.510Z, completed 2026-10-26T06:59:33.454Z,
    the source files clean
    bundle 3dc9c9baebe05b9aa04935592cbb636de90cfc712da367c8008176f544678748
    (the expected and the executed sha256), deck
    6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78
    Result: 251 / 253 checks passed, 2 failed, 0 skipped by write mode

The six rows this tranche closes are green in this run, each with the
evidence shape its receipt records. The two failures are named in
Section 3 and in each receipt: E10, and the page-time budget row.

The tool's exit rule is `failures.length === 0 && !coverageIncomplete`
(tools/edge-signed-in-exercise.mjs:1651), and `coverageIncomplete` is true
whenever any capability is partial, not covered or out of scope, so a run
whose coverage is incomplete exits 1 even when every check passes. This
lane's runs were piped through a log writer, so the process exit status
itself was not observed here; the claim rests on the run records (the
check list and the coverage counts), not on an exit code. The capability
coverage in this run is 69 covered / 20 partial / 2 not covered /
1 disabled upstream / 3 out of scope, of 95; the one covered row the
round-twelve lane counted is E10, whose check failed in this run, so its
capability is the second not-covered row here.

### 5b. The certification run at this branch's final commit

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round13-20261026/final/report.md

    source d88302464888f02125fc49921fffba5c8bacb156, started
    2026-10-26T07:08:06.643Z, completed 2026-10-26T07:39:36.479Z,
    the source files clean
    bundle 3dc9c9baebe05b9aa04935592cbb636de90cfc712da367c8008176f544678748
    (the expected and the executed sha256, and the same bundle the
    measurement run executed), deck
    6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78
    Result: 251 / 253 checks passed, 2 failed, 0 skipped by write mode

The six rows this tranche closes are green in this run, each with the
evidence shape its receipt records. The two failures are named, with
their mechanism, in Section 6.

## 6. The certification run's result

The certification run at this branch's final commit `d8830246` (the
commit that carries this report and the six row commits) graded **251 of
253 checks passed**, 0 skipped by write mode. The run observed 3,973
labelled engine requests, and the capability coverage is 70 covered /
20 partial / 1 not covered / 3 out of scope, of 95. The six rows this
tranche closes are green in this run, with the same evidence shape their
receipts record from the measurement run:

    PASS  the owned local stack is closed
          {}
    PASS  A1 the account settings page shows the signed-in account's email
          {"actor":"Harness Admin","expected":"harness-admin-...@harness.invalid",
           "shown":"email harness-admin-...@harness.invalid help edit space_dashboard"}
    PASS  A3 the account's new email address shows on the account page
          {"actor":"Harness Admin","expected":"changed-53041-...@harness.invalid",
           "shown":"email changed-53041-...@harness.invalid help edit space_dashboard"}
    PASS  C8 creating a card whose name already exists is refused (Home untouched, error shown)
          {"writeStatus":422,"serverSaid":"...<title>Error (name-conflict)</title>...",
           "errorShown":true,"homeStatus":200}
    PASS  C10 content preset in the /new URL fills the editor and is stored on the card
          {"editor":{"present":true,"active":true},"prefilled":"<p>Harness preset marker</p>",
           "afterStatus":200,"stored":true}
    PASS  C16 a checkbox pointer input can be checked and stored (card shows the checked value)
          {"writeStatus":200,"stored":"Harness_CB_Pick_Two","afterStatus":200,"showsPickTwo":true}

THE TWO RESIDUALS, NAMED WITH THEIR MECHANISM. Neither is one of this
tranche's six rows, and neither is a property of the tree.

RESIDUAL 1, W5's direct follow leg. The check follows three cards as the
member (tools/edge-signed-in-exercise/checks-content-flows.mjs:187-207,
followOn), edits each and requires the follower's mail (the grading at
:367-375). In this run the helper's action on the FIRST card, the
directly followed one, took its no-link branch (:198): the Engage tab
rendered the follow control and the "0 followers" and "all followed
cards" links, but the helper's anchored text match for a link whose text
is exactly "follow" or "watch" (:195) found nothing, so no follow rule
was written for that card (the card still reads "0 followers" and
`allFollowRulesWritten` is false), and the direct leg therefore mailed
nobody. The other two hosts' follow rules WERE written (storedOption
"*always", the rule row found) and their positive legs delivered one
notice each naming the changed card; both oracle negatives stayed
silent, as the oracle requires. THE SAME CHECK WAS GREEN IN THIS LANE'S
OWN MEASUREMENT RUN, on the byte-identical bundle and deck, where the
helper found the link (the href is in the evidence), the rule was
written ("*always", the rule row found) and the direct leg delivered one
notice. The only difference between the two trees is this tranche's
receipts and this report.

RESIDUAL 2, the page-time budget row. Three pages exceeded the 3000 ms
own-work budget: `/new/RichText?card[name]=Harness_CF_Includer_m...` at
7544 ms of wall (own work 4306 ms, of which 3236 ms was measured machine
contention against 797 ms of the engine's own database CPU time),
`/Harness_CF_Includer_.../board` at 5253 ms (own work 3770 ms,
contention 1483 ms, database CPU 470 ms) and
`/new/RichText?card[name]=HarnessP7Card_...` at 3963 ms (own work
3016 ms, contention 933 ms, database CPU 1389 ms). The same row was red
in the measurement run (three pages, contention 2745, 1582 and 912 ms
against 221, 1251 and 967 ms of database CPU), and the budget module
documents this residual: on the same tree, with the same bundle and the
same deck, the slow pages measured 24.2 ms per statement in one run and
15.5 ms in the next, so the difference was the machine
(tools/edge-signed-in-exercise/lib/server-time-budget.mjs:43-49).

WHAT THE SECOND RUN AT THE SAME COMMIT IS FOR. Two residuals that move
between runs while the tree, the bundle and the deck hold still are the
round-twelve lane's documented shape, and this lane's own two runs
already show it (E10 is red in the measurement run and green in the
certification run; W5 is green in the measurement run and red in the
certification run; the timing row is red in both). The family grade
therefore rests on more than one run at this tip, and the second
certification run at the same commit is the next step the residual's
mechanism asks for: its result lands in the commit that follows this
one.

### 6a. The second certification run at the same commit, and the three-run comparison

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round13-20261026/final2/report.md

    source f4c5a480bda4a798ace42e45f1212358b63da658, started
    2026-10-26T07:47:47.234Z, completed 2026-10-26T08:17:29.362Z,
    the source files clean
    bundle 3dc9c9baebe05b9aa04935592cbb636de90cfc712da367c8008176f544678748
    (the expected and the executed sha256, the same bundle as both
    earlier runs), deck
    6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78
    Result: 249 / 253 checks passed, 4 failed, 0 skipped by write mode

THE THREE RUNS THIS LANE MADE, ON BYTE-IDENTICAL CODE:

| run | source | result | the failures |
|---|---|---|---|
| rows-r1 (the measurement run) | `acd0cd4c` (the base tip) | 251 / 253 | E10 (the plain-input edit write answered no status inside that attempt's window); the page-time budget row |
| final (the first certification run) | `d8830246` (the report commit) | 251 / 253 | W5's direct follow leg; the page-time budget row |
| final2 (the second certification run) | `f4c5a480` (the grade-line commit) | 249 / 253 | the two owner-audit search-suggestion latency rows; W6's follow link; the page-time budget row |

THE SIX ROWS THIS TRANCHE CLOSES ARE GREEN IN ALL THREE RUNS. The six
receipts' evidence holds in each of them, and the checks that failed moved
between runs: E10 was red only in the measurement run, W5 only in the
first certification run, W6 only in the second, and the owner-audit
search-suggestion latency rows only in the second. The page-time budget
row was red in all three.

THE ONE MECHANISM THE THREE RUNS SHARE. The Engage tab's follow link.
Two content-flows checks look for it after a FIXED 1500 ms wait and look
for an anchor whose text is exactly "follow" or "watch"
(checks-content-flows.mjs:190-198 for W5's followOn, :414-424 for W6);
when that lookup finds nothing, W5's helper returns without writing the
follow rule (so the direct leg has no follower to mail) and W6 records
"the Engage tab offered no follow link, so no follower mail and no
unfollow link could exist". In the first certification run the lookup
missed on one host while the page's link list, read a moment later, held
"follow", "0 followers" and "all followed cards"; in the second run it
missed on W6's watched card with that list empty. In the measurement run
on the same tree the lookup found the link on every host (the href and
the written "*always" rule are in that run's evidence). So the port's
follow section is not what failed: the harness's fixed wait lost the
race with the tab's content on a loaded machine. This is filed as the
repository's issue 34, and this lane did not change the instrument:
its byte-level pins and the line citations in the six receipts are the
instrument's contract.

WHAT THE FAMILY GRADE IS AT THIS TIP, said plainly: no run of the
whole-family exercise at this tip has graded 253 of 253, so the baseline
does not hold as a number; what holds is that every failure in all three
runs is outside this tranche's six rows, that the six rows are green in
all three, and that the failures move between runs on byte-identical
code, bundle and deck. The two named mechanisms are the Engage tab's
follow-link race (issue 34) and the machine's throughput during a run
(the budget module's own residual,
tools/edge-signed-in-exercise/lib/server-time-budget.mjs:43-49).

## 7. What this tranche does NOT claim

- **The roster was not folded.** It lives in another repository
  (`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
  and this lane did not write to it, as the round-three through
  round-twelve tranches did not. The six rows' receipts add the family's
  own evidence; they do not change any row's DONE condition.
- **The live deployment.** No live request was made by the lane, and no
  row's live instrument was exercised here. Where a receipt cites the
  registry's own live-session receipt (mx-B-070 and mx-B-071), that is a
  prior measurement by another lane and it is named as such. Nothing
  deploys on the decko side; the branch is a candidate, and promotion is
  the operator's yes.
- **The junction set-anchor regression is not this lane's.** The
  anchor-regression lane owns it; this branch does not carry the commit
  that introduced it, and this lane fixed nothing there.
- **The measurement run's two failures are not explained away.** They are
  this lane's own measurements, named with their numbers in Section 3 and
  in each affected receipt; the claim this tranche makes rests on the
  graded run and says so.
- **The family grade does not hold as a number at this tip.** No run of
  the whole-family exercise at this tip graded 253 of 253: the three runs
  this lane made graded 251, 251 and 249 of 253 (Sections 5a, 5b, 6a).
  Every failure in all three is outside this tranche's six rows, and the
  six rows are green in all three. Two mechanisms are named (the Engage
  tab's follow-link race, filed as the repository's issue 34, and the
  machine's throughput during a run). This tranche claims the six rows
  and nothing about the family number.
- **The instrument was not changed.** The follow-link race is the
  harness's own fixed wait, and changing the harness mid-tranche would
  move the line citations the six receipts carry and break the
  instrument's byte-level pins. The fix is the next lane's, with the
  issue.
- **Nothing here deploys and nothing touches live.**

## 8. The disk cost, in both directions, and the residue

The lane copy is an exclusive clone fetched from the family's remote
(git init plus a single-branch fetch of `port/matrix-round12b-20261026`,
the same shape the round-twelve lane used). `node_modules` is a byte copy
of the round-twelve-b lane clone's install at the identical package-lock
(sha256
8e07b702f565ec5f32c86dabf5d39f62f6adadecd06f657244c813e60a044bcd in
both trees), verified loading before any run (better-sqlite3 executes a
schema statement; playwright-core resolves its chromium channel).
`dist/` is this lane's own `npx tsc -p tsconfig.dist.json` build
(untracked, rebuilt on demand). The tracked tree grows by the six receipts
and this report; no tracked file is deleted. The untracked artifacts this
lane's runs produced are measured in the landing report at lane end (the
`.runtime/signed-in-exercise-round13-20261026/rows-r1`, `final` and
`final2` run directories with their records and capture evidence, and the
run logs this lane kept outside the tree because the exercise's
source-custody gate requires a coherent worktree). The lane copy and that
logs directory are registered with the disk steward for 72 hours under
this lane's name, so the run records the six receipts cite stay readable
while the family lanes read this tranche's evidence.
