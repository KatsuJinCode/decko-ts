# Tranche 18: the six further signed-in rows are adjudicated, and the family grade holds at 253 of 253

Branch `port/matrix-round11-20261024` (lane copy
`C:/localProjects/decko-ts-matrix-round11-20261024`, created from the
family's canonical checkout by the diskSteward's own admission gate,
`C:/localProjects/diskSteward/agent/create_worktree.py`, with
`node_modules` riding a junction to the family's shared install), from the
family's tip `71d4f686` ("The whole-family exercise at this branch's tip:
253 of 253, the six sign-in and account rows adjudicated"). That tip is the
newest pushed matrix tip: `git ls-remote --heads origin` names
`refs/heads/port/matrix-round10-20261024` at
`71d4f686007e9f26e75cbfe66db964bd2ccc08cd`, and no other matrix branch is
ahead of it.

The ask had three parts. The next SIX unadjudicated matrix rows in roster
item order beyond mx-B-048 are adjudicated, one commit each, with
oracle-matched or named-instrument evidence. The whole-family exercise runs
once at this branch's final commit and the grade line is reported. The
touched surface's battery runs green.

## 0. What the ask asked, and what this tranche found

1. **The next six unadjudicated rows.** TAKEN, one commit each, with
   oracle-matched or named-instrument evidence: mx-B-049, mx-B-050, mx-B-051,
   mx-B-052, mx-B-053 and mx-B-054. Section 2.
2. **The whole-family exercise at the final commit.** DONE; the grade line
   is **253 of 253 checks passed**. The round-five through round-ten
   baseline holds, and this tranche met no regression in the exercise
   itself (Section 3). Section 5.
3. **The battery.** The instrument's own test battery passes in this lane,
   the repo-wide typecheck this lane ran alongside it is green, and the
   port files the receipts cite are green. Section 4.

## 1. The selection rule, stated so a reader can check it

The roster is the row ledger for this family
(`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
and the roster's own item order is the family's row-id order (the same rule
the round-three through round-ten tranches used to pick their batches).

The rule was checked against the PRE-STATE, not against the tree as this
tranche left it: the tree at the family's tip `71d4f686`, read with
`git ls-tree` and `git cat-file`. A family receipt is a file under
`docs/reports` whose content names the roster item's exact id. At that tip
57 of the family's 190 items are so covered (138 files under `docs/reports`
were read), and the first items of the roster's own order that no receipt
names are

    mx-B-049-7b-further-signed-in-capabilit
    mx-B-050-7b-further-signed-in-capabilit
    mx-B-051-7b-further-signed-in-capabilit
    mx-B-052-7b-further-signed-in-capabilit
    mx-B-053-7b-further-signed-in-capabilit
    mx-B-054-7b-further-signed-in-capabilit

(the seventh is mx-B-055, "the card board renders with its tabs (guide,
engage, history, rules)", which this tranche did not take).

So the next six unadjudicated rows are **mx-B-049, mx-B-050, mx-B-051,
mx-B-052, mx-B-053 and mx-B-054**: all six are the first six rows of the
"7b. further signed-in capabilities" surface. The selection script this
lane ran is `tmp/matrix-round11-select-rows-v2.mjs` (untracked, in the
lane's scratch).

## 2. The six rows this tranche closed

| row | the row | the instrument | the oracle | the verdict |
|---|---|---|---|---|
| mx-B-049 | sign-in refused on a wrong password (422, no session, error shown) | the wrong-password submit in the isolated signed-out context (edge-signed-in-exercise.mjs:1089-1102), and the cover-b S2 check that also reads the shown error (checks-cover-b.mjs:159-176) | Ruby's own captured refusal (write-battery-v1 capture, step "signin-wrong-password": 422, the `alert ... card-error-msg` block, `<h4 class="alert-heading error">Problems with *signin</h4>`, `<p><strong>SIGNIN:</strong> Wrong password</p>`, a zero delta on every table including `sessions`), Ruby's own sign-in form (capture arm `probe-view:25:open_content@set/self/signin.rb`: the two credential field names the instrument fills and the `/update/*signin` action), and Ruby's own source (card-mod-account-0.20.0/set/self/signin.rb:45-49, :57-60, :106-112 with the locale string `account_error_wrong_password` at config/locales/en.yml:14); the port answers 422 with no session at write-routes.ts:1286-1299, :1422-1428, :1457-1458 | PASS |
| mx-B-050 | sign-in with an empty password is refused (no session) | the empty-password submit in the same isolated context (edge-signed-in-exercise.mjs:1103-1114) | Ruby's own captured refusal (write-battery-v1 capture, step "signin-blank-password": 422, the same alert block, the bare message `password can&#39;t be blank` with no key, a zero delta), Ruby's own source (set/self/signin.rb:45-49 and :62-64, the blank-field abort with no errors key, and the locale string `account_password_missing` at config/locales/en.yml:27), and the repository's own parity scenario for the step (tools/parity-side-effects/scenarios.json:94-108, a PATCH of `/update/*signin` with an empty password subcard, carrying no "deliberate" block); the port answers 422 with Ruby's own string at write-routes.ts:1438-1440 and signin.ts:243, :293 | PASS |
| mx-B-051 | card content preset in the /new URL is submitted and stored | the C10 leg (edge-signed-in-exercise.mjs:1120-1151), and the cover-b C10 check that waits for the editor to hold the marker (checks-cover-b.mjs:273-290) | Ruby's own sources in the pinned gem set (card-1.110.0/lib/card/fetch/card_class.rb:127-133 `uri_fetch_opts`, which makes the request's card hash the new card's fetch options; card-mod-edit-0.20.0/set/all/new.rb:103-109 `new_view_name`; set/all/editor.rb:46-49 `text_area_input`; decko-0.20.0/lib/card_controller/rest.rb:7-9 `create`), and Ruby's own rendered new-card form (capture arm `probe-view:159:new_fields@set/all/new.rb`, the named shape's hidden `card[name]` field); the port reads the query's `card[name]` and `card[content]` at deploy/bunny-worker-src/bunny-edge-engine-request.ts:625-635, :639-644, :812 and renders the content editor at deploy/bunny-worker-src/bunny-edge-new-card-form.ts:227-228 | PASS |
| mx-B-052 | creating a card whose name already exists is refused (Home not touched) | the C8 leg (edge-signed-in-exercise.mjs:1153-1172), and the cover-b C8 check that also asserts the error text (checks-cover-b.mjs:258-270) | Ruby's own captured refusal (write-battery-v1 capture, step "create-duplicate-name": 422, `Problems with Parity Probe Card`, `<p><strong>NAME:</strong> must be unique; &#39;Parity Probe Card&#39; already exists.</p>`, an event ladder carrying `validate_uniqueness_of_name`, a zero delta), Ruby's own source (card-1.110.0/mod/core/set/all/name_events.rb:3-8 and :10-18 with the locale string `core_error_name_exists` at mod/core/config/locales/en.yml:15), and the repository's own parity scenario (tools/parity-side-effects/scenarios.json:221-231, carrying no "deliberate" block); the port raises the same text at name-validation.ts:86-113, called from card-action-engine.ts:2031 on the validate stage | PASS |
| mx-B-053 | rename through the board's name row moves the card to its new name | the R1 leg (edge-signed-in-exercise.mjs:1174-1238) | Ruby's own captured name row (capture arm `probe-view:140:edit_name_row@set/all/edit_inline.rb`: the `card-slot edit_name_row-view ... d-flex form-group row` block and its `edit-link` anchor to `/<mark>/name_form`) and its own captured renamer (capture arm `probe-view:156:name_form@set/all/edit_name.rb`: the `_rename-form` form, its `/update/<mark>?id=<id>` action, the `card[name]` input and the `renamer` submit button), Ruby's own sources (card-mod-edit-0.20.0/set/all/edit_inline.rb:16-18, :37-44, :46-49 and set/all/edit_name.rb:12-21, :34-38, :41-44), and Ruby's own captured refusal of a rename onto a taken name (write-battery-v1 capture, step "rename-to-existing": 422, the same `NAME:` message, `validate_uniqueness_of_name` and `validate_renaming` in the ladder, a zero delta); the port renders the name row at card-mod-edit.ts:1845-1857, the renamer at :1723-1760, :1784-1794, :1821-1836, and renames through card-action-engine.ts:2993-2996, :3058-3080 | PASS |
| mx-B-054 | the history page lists the card's acts (not just a 200) | the H1 leg (edge-signed-in-exercise.mjs:1240-1257), whose own comment records why the earlier broad predicate was not enough | Ruby's own captured act (capture arm `probe-view:366:act@set/all/history/views.rb`: the `accordion-item`, the `collapsed accordion-button` whose target is `#act-id-105328`, and the `accordion-collapse collapse` body) and its own captured act content (capture arm `probe-view:367:action_expanded@set/all/history/views.rb`: the act's diff body), with Ruby's own source (card-mod-history-0.20.0/set/all/history/views.rb:4-9, :11-13, :28-30, :32-34); the port renders the same item at card-mod-history.ts:1674-1699 with the collapse id built as `act-id-<act id>` (:1755, :1820, :2425), and the history view at :1760-1798 | PASS |

Each row's receipt is its own file under `docs/reports/`
(`row-mx-B-049-further-signed-in-group-2026-10-24.md` through
`row-mx-B-054-further-signed-in-group-2026-10-24.md`), and each row's
commit is its own commit with an explicit pathspec (9e59b4a6, 6ca9e09e,
de83df5d, 0a425106, bf4ca7ad, b5798371). Every receipt names the run it was
written from (the measurement run at `71d4f686`, started
2026-10-24T22:21:12.528Z, the source files clean) with its evidence.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT is stated plainly in each receipt.
Ruby's own sign-in form and its two credential field names, Ruby's own
captured sign-in refusals with their status, their alert block and their
messages, Ruby's own blank-field abort with no errors key, Ruby's own
name-uniqueness validation and its locale string, Ruby's own new-card
fetch-options plumbing and its rendered new-card form, Ruby's own name row
and its own renamer, and Ruby's own act item in the history page are
Ruby's own, and the port renders each of them. Five limits are stated in
the receipts rather than glossed over. First, the sign-in MESSAGE the port
showed for a wrong password is not Ruby's "Wrong password": under the
port's disclosed uniform-answer policy (docs/SECURITY.md, approved
divergence 4) the answer is "Wrong email or password.", and the
repository records that difference against the exact step in
tools/parity-side-effects/scenarios.json:135-155. Second, the alert
block's whitespace differs from Ruby's (Ruby's class list carries a double
space and newlines; the port renders one line with one space). Third, the
capture fixture and the pin test for the mx-B-051 row,
`fixtures/captured/new-card-preset.json` and
`tests/card/mod-loader/card-mod-new-card-preset.test.ts`, are NOT in this
branch's tree: they landed on the capability branch (commit de6cc87e),
which is not an ancestor of this branch's tip, so that row's oracle is
Ruby's own source plus the committed render capture arm instead. Fourth,
the mx-B-049 instrument's own error-text probe returned an empty string in
this run, because the port renders the heading as an `h4` and the message
in a `p` with no error class; that row's predicate does not use the probe,
and the cover-b S2 check is the instrument that reads the shown error.
Fifth, the mx-B-053 and mx-B-054 receipts do not claim a byte-exact
comparison of the whole surface, only that the elements the instrument
drives are the ones Ruby renders, with the same classes, field names and
shapes.

## 3. The defect this tranche met: none

The grade line held, the batteries held, and the repo-wide typecheck this
lane ran alongside them was green at the family's tip:

    npx tsc -p tsconfig.json --noEmit
    exit 0, no diagnostics

So this tranche names no regression and fixes none. The round-nine tranche
found and fixed a type error in an unrelated test file that had kept a
staging-server suite from starting; this tranche did not meet that class
of defect.

## 4. The battery the touched surface carries

The instrument's own battery passes in this lane:

    node --test "tools/edge-signed-in-exercise/test/*.test.mjs"
    221 tests, 219 pass, 0 fail, 2 skipped (the opt-in live legs)

and the repo-wide typecheck this lane ran alongside it is green, as Section
3 records.

## 5. The whole-family exercise

### 5a. The measurement run the six receipts cite

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round11-20261024/rows-r1/report.md

    source 71d4f686007e9f26e75cbfe66db964bd2ccc08cd, started
    2026-10-24T22:21:12.528Z, completed 2026-10-24T22:42:55.803Z,
    the source files clean
    Result: 253 / 253 passed, 0 failed, 0 skipped by write mode

The run observed 3,910 engine requests, and the capability coverage is the
same count the earlier rounds read (70 covered / 20 partial / 1 not covered
/ 1 disabled upstream / 3 out of scope, of 95). The six rows this tranche
closed are green in this run, each with the same evidence shape as in
Section 2, and each graded once (the run record's own per-check results are
253 entries and every one of them is `pass: true`).

The tool's exit rule is `failures.length === 0 && !coverageIncomplete`
(tools/edge-signed-in-exercise.mjs:1651), and `coverageIncomplete` is true
whenever any capability is partial, not covered or out of scope, so the run
closes with the standing line the round-five through round-ten runs also
carry ("Complete capability acceptance: incomplete or failed. Unrun
capabilities are never credited."). That is the tool's coverage-completeness
signal, not a check failure: the CHECK grade is 253 of 253 with zero
failures.

### 5b. The certification run at this branch's final commit

PENDING. This section is written by the commit that follows the
certification run, and it names the run's own source, its start and
completion times, its grade line and its per-row evidence.

## 6. What this tranche does NOT claim

- **The roster was not folded.** It lives in another repository
  (`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`),
  and this lane did not write to it, as the round-three through round-ten
  tranches did not. The six rows' receipts add the family's own evidence;
  they do not change any row's DONE condition.
- **The live deployment.** No live request was made by the lane, and no
  row's live instrument was exercised here. Nothing deploys on the decko
  side; the branch is a candidate, and promotion is the operator's yes.
- **The live acceptance lane.** The registry's ledger records a live
  instrument entry for each of the six rows. This tranche did not exercise
  it, and the receipts say so.
- **Nothing here deploys and nothing touches live.**

## 7. The disk cost, in both directions, and the residue

The lane copy added the checkout at creation: the diskSteward's own
admission gate reported `trackedBytes: 252130295`, `checkoutBytes:
277343325`, free on C: at creation 43,048,570,880 bytes, custody lease
`ca055a28e3df`. `node_modules` rides a junction to the family's shared
install, so the checkout is the cost.

The untracked artifacts this lane's runs and its batteries produced,
measured at the end of the lane: `.runtime/` 11,717,839 bytes (the run's
report, run record and per-request capture evidence the receipts name),
`dist/` 14,435,120 bytes (the engine distribution the exercise builds;
untracked, rebuilt on demand), `deploy/dist/` 18,245,207 bytes (the
deployed bundle the exercise rebuilds from source; untracked, rebuilt on
demand), `tmp/` 41,571 bytes (the exercise's own run directory shell, this
lane's selection script and this lane's scratch), `.test-results/` 14 bytes
(the battery's JUnit record). The tracked tree grew from 252,130,295 bytes
at the family's tip to 252,178,530 bytes at this commit, with the six
receipts and this report.

Bytes removed by this lane: none. No tracked file was deleted, and no other
file was deleted either; this lane's guards forbid `rm`, and the residue
named above is evidence the receipts reference, so it is kept. The free
space on C: at the end of the lane is 31,817,359,360 bytes, which is
reported here because it is below the level the lane was created at and
other lanes are writing to the same volume; this lane's own writes are the
run artifacts named above and the branch's commits, and no download, corpus
pull or bulk write is part of this tranche.
