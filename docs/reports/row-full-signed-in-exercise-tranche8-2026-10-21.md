# Tranche 8: the battery was able to hang, and the four rows the roster still owed this family

Branch `port/matrix-journey-tranche8-20261022` (clone
`C:/localProjects/decko-ts-matrix-journey-tranche8-20261022`), from the
tranche-7 tip `b80dfd18`. The whole-family exercise is 242 of 242 checks at
the tranche-7 tip. This tranche did two things: it made the exercise able to
report a hang instead of sitting in one, and it worked the rows the
completeness roster still owed this family, which are four rows whose
capability the family's own grader measures as not covered.

| commit | what it does |
|---|---|
| `545cf762` | every unbounded wait in the harness gets a deadline, so a check that hangs is reported instead of waited on |
| `fd5e45c7` | row mx-143: the /files route after an upload, graded on the bytes Ruby renders |
| `9ea2be2f` | row mx-154: the Engage tab's unfollow control, graded on four bytes and the stored rule |
| `69805ce9` | row mx-131: the templated-card row's committed probe receipt becomes a capture feed the grader can credit |
| `f684758d` | row mx-159: the anonymous sign-up's name reaches the create, and the flow Ruby's scenario describes runs end to end |
| `6ad66b6d` | the mx-154 leg's click never landed: the href it looked up was the HTML's, not the DOM's |
| `9533390c` | the check body's budget was set below the slowest body the battery has, and the run paid for the estimate |

## 1. The baseline: the exercise did not finish

The ask's first instruction was to re-run the whole-family exercise at the
baseline and confirm it starts green. It did not start green, and it did not
finish either.

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche8-20261022/full-run-r2/report.md

No `--only`, no `--case`: the FULL exercise, every module.

- source `b80dfd18` (the tranche-7 tip), source files clean
- bundle SHA256
  `b96ac0014d08fe0e5d2443a43d59830c0e97b3d8447c90df55af1906ef6de3cc`,
  rebuilt from this tree's own source
- started 2026-10-21 20:27:04 local
- the run's own trace
  (`.runtime/matrix-journey-tranche8-20261022/full-run-r2/report.md.memory.jsonl`)
  records 205 checks with 0 failures at 2026-10-22T03:52:09Z, and the
  engine's last response (status 200, 19538 bytes) at
  2026-10-22T03:52:11Z
- after that: no further engine request, no connection left open to the run's
  own origin port, and 0.00 s of CPU across a twenty-minute sample
- no report was written, so there is no exit code to report: the process was
  still sitting there when this lane's session ended

The last check the run recorded was C20's fifth leg, and the tranche-7
report had already named this shape of failure: "the tranche-7 run 2 timed
out on the C20 check's `page.goto` (30 s) on a hanging cdnjs fetch and the
fixture quarantine ended the run early". A battery that can stop reporting
is worse than a battery that fails, because a failure is a fact and a hang
is silence.

## 2. The fix: a deadline on every unbounded wait

THE MECHANISM. Two awaits in the harness had no bound. A check body is
awaited by the runner's `attempt` helper
(`tools/edge-signed-in-exercise.mjs:178`), and the browser's own shutdown is
awaited by the check's `finally`
(`tools/edge-signed-in-exercise/checks-role-checkbox-and-plus-right-creation.mjs:1024`).
A browser operation that never settles parks the first, and the second then
parks forever behind it, because the close is what would have released the
browser. The run had no way to say so.

THE RULE, in one module, `tools/edge-signed-in-exercise/lib/bounded-wait.mjs`:

- `withDeadline(work, ms, label)` returns a work's own value or its own
  error, rejects with a named `DeadlineExceeded` when the budget expires,
  and swallows the late arrival of the abandoned work, so it can never
  become an unhandled rejection and can never crash the run;
- `withShutdownWindow(graceful, ms, label, force)` gives a graceful shutdown
  a window and then runs the owner's forced path, and records which path ran.

WHAT IT IS WORTH, IN TWO PLACES. Every check body now has a budget of
600 s, five times the slowest body the reference run measured (the
role-plus-right module's C20 leg, about 12 minutes of a 30-minute
whole-family run). A body that overruns is recorded as a FAIL that names its
budget, and the run goes on to the next check. The harness browser's close
gets a 20 s graceful window, then the owner's forced path on the process the
harness itself launched, and the close report says which path ran, so a
report never claims a clean shutdown that did not happen.

THE PINS, `tools/edge-signed-in-exercise/test/bounded-wait.test.mjs`, 9 legs:
a work that finishes in time returns its own value, a work that fails in
time returns its own error, a work that never settles is reported instead of
waited on, the abandoned work cannot become an unhandled rejection, a work
given as a function is called, a graceful shutdown inside its window is a
clean close, a shutdown past its window runs the forced path, a forced path
that itself fails is reported, and a shutdown that fails on its own terms
throws that error.

    node --test tools/edge-signed-in-exercise/test/bounded-wait.test.mjs
    -> tests 9, pass 9, fail 0

THE MEASUREMENT THAT THE FIX MAKES. The slice of the module the hang was
measured in now completes:

    node tools/edge-signed-in-exercise.mjs --only role-plus-right \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche8-20261022/role-plus-right-slice-r2/report.md

13 of 13 checks passed, including "C20 a fresh read of the card page renders
the created +*right member as a known card", the leg the baseline never
came back from. The process exit code was 1 by the tool's own coverage rule
(a `--only` run can never have complete capability coverage), and the run
printed "capability coverage: 0 covered, 0 partial, 91 not covered, 3 out
of scope (of 95)".

## 3. What the roster still owed this family

THE ROWS. The roster's own ledger for this family is
`docs/registry/completeness-roster.json`, and at the tranche-6 fold its
the roster's own [Family] block reads 190 rows: 186 DONE and 4 WORKING ON IT. The four
WORKING rows are the ones the ask sets aside (mx-155, mx-190, mx-B-081,
mx-B-086), and their blockers are operator-side and already named. So the
ledger itself names no fifth open row.

THE GAP IS ONE LEVEL DOWN, IN THE REGISTRY THE LEDGER CITES. The roster's
`capabilitySource` names its own measurement: the family's capability
coverage is read by `verifiedCapabilities()` over
`tools/edge-signed-in-exercise/capabilities.json`, and at the tranche-7 tip
it reads "covered 66, partial 20, not covered 5, out of scope 3, of 95".
The 5 not covered capabilities are A4, C13, F1, W2 and W4, and each maps to
one ACT action and so to one roster row:

| capability | action | roster row | at the tranche-7 tip |
|---|---|---|---|
| W4 | ACT-155 | mx-155-capability-catalog-follow | the row the ask sets aside |
| F1 | ACT-143 | mx-143-capability-catalog-files | PASS/DONE, capability not covered |
| C13 | ACT-131 | mx-131-capability-catalog-create | PASS/DONE, capability not covered |
| W2 | ACT-154 | mx-154-capability-catalog-follow | PASS/DONE, capability not covered |
| A4 | ACT-159 | mx-159-capability-catalog-account | PASS/DONE, capability not covered |

FOUR ROWS, THEN, ARE OWED: mx-143, mx-131, mx-154 and mx-159. Each of them
is PASS/DONE in the roster, and each rests on evidence that is not the
family's own instrument: mx-143 on a sibling module's leg (the upload-image
change run's F8 leg), mx-131 on a probe receipt from a different harness,
mx-154 on a probe leg, and mx-159 on a parity classification of a live
failure. The roster's own bar is "DONE = the best thing possible, verified,
with the verification named", and a row whose capability the family's own
grader measures as not covered does not meet it.

WHY THE FIVE, AND NOT MORE. The other 20 capabilities read partial, and
every one of their declared checks PASSED in the tranche-7 run: the grader
holds them at partial because the registry declares them partial, not
because an instrument is missing. The distinction is mechanical
(`tools/edge-signed-in-exercise/lib/local-policy.mjs:44-57`: a capability is
covered when all of its declared checks passed AND the registry does not
declare it partial). So the 20 are a declaration, and the 5 are a missing
instrument. The fifth, W4, belongs to the row the ask sets aside.

## 4. The four rows, one commit each

### 4.1 mx-143, capability F1: the /files route after an upload

The instrument already existed, on a named branch, and said plainly that the
row stays not covered there because the leg it declares has never run: the
capability-inventory lane's commit `50949d9c` on
`port/capability-inventory-tranche4-20261020`. This tranche rides it, and
running the leg is this family's work.

What the leg grades is what the card SHOWS after the upload, which the
upload leg never looked at. Ruby's `attach.feature` ends its "Uploading a
file" scenario with `Then I should see "Download a test file"`, and that
string IS the route rendered: `set/type/file/core.haml` is one anchor whose
href is the attachment's source (`set/type/file.rb:47-50`) and whose text is
`t :carrierwave_download` ("Download %{title}", the gem's `en.yml:5`). The
leg grades that anchor, the chip `preview_editor.haml` renders (the
original filename beside Rails' `number_to_human_size`, which is Ruby's
`I should see file "file.txt 9 Bytes"`), and the chooser's own carriers
(`input.file-upload[slotter][type=file]`, `attachment_type_id`,
`attachment_card_name`). The row's own recorded finding, "/new/File has no
file input", now fails by name instead of passing a write that went nowhere.

By parity law the rendering is not what this repairs: the port already
emits the anchor
(`src/card/mod-loader/mods/card-mod-carrierwave.ts:202-208`).

The pins, ridden with the instrument: the four gem files are vendored
verbatim under `fixtures/vendor/` and sha256-pinned.

    node --test tools/edge-signed-in-exercise/test/file-download-view.test.mjs
    -> tests 11, pass 11, fail 0

### 4.2 mx-154, capability W2: the Engage tab's unfollow control

The instrument is the capability-inventory lane's commit `7606a576` on the
same branch, with 15 unit tests and its own Ruby fixture pins.

W6 is a DIFFERENT SURFACE, and that is the point: W6 is the unfollow link
inside the follower mail
(`card-mod-follow set/all/notify/base_views.rb:48-55`), W2 is the unfollow
control on the board's Engage tab. Two surfaces, two byte contracts, and
conflating them is how W2 stayed uncovered while W6 went green.

FOUR LEGS, GRADED APART, because they fail apart. The start link, read out
of the anchor's own attributes: the verb, the title, the css class and the
href's `*always` rule content, which Ruby's `start_follow_link.rb:4-11` and
`follow_link.rb:44-69` give. The stop link: the verb "following", the
`btn-item-delete` class, the stop-sending title and the `*never` rule
content, which Ruby's `stop_follow_link.rb:4-11` gives. The STORAGE, read
from the deck through the rule card and never inferred from the page, so a
link that says "following" over a stored `*never` cannot pass: that
inversion is invisible to every byte-level leg, because the bytes are
correct. And the REVERT, which re-checks the start bytes and the follower
count against its baseline, because `follower_ids` is cached
(`set/all/follow/follower_ids.rb`) and only the count sees a stale cache.

By parity law the rendering is not what this repairs: the port already emits
both states byte for byte
(`src/card/mod-loader/mods/card-mod-edit.ts:3640-3671`). What was never
driven is the transition.

    node --test tools/edge-signed-in-exercise/test/unfollow-from-board.test.mjs
    -> tests 15, pass 15, fail 0

### 4.3 mx-131, capability C13: the committed probe receipt as a capture feed

The roster named the path for this row: "closing the row needs the probe
results bound into a capture feed or an explicit registry decision, not more
capability work". The instrument half already existed, the capability lane's
commit `f6be88d4` on `port/capability-inventory-tranche2-20261020`: the
reader (`tools/edge-signed-in-exercise/lib/capture-feed.mjs`), its own unit
test, the probe's committed receipt
(`reference-harness/browser/probe-receipts/probe-c13-run3-result.json`) and
the registry block that names the receipt, the instrument and the reader.

WHAT WAS MISSING IS THE CALLER, and this commit supplies it. The feed's own
commit message named the limit: "the full signed-in harness still does not
carry this check name, the templated drive lives in the probe, not in the
harness battery, so a harness run alone leaves the row uncounted". Nothing
in the harness read the feed.

THE RULE, in `tools/edge-signed-in-exercise/lib/capture-feed-binding.mjs`: a
feed is read only when the registry row names BOTH a receipt and a reader,
and both paths resolve inside this repository (a climbing path and an
absolute path are refused, not clamped); the receipt is converted by the
READER THE ROW NAMES; a feed that cannot be read contributes no result and
is named in the record; the feed's verdict is the reader's, carried in
unchanged, so a red receipt is a FAILED check in the record like any other;
and the result carries its own group, naming the capability and the
instrument it came from.

MEASURED, against the repo's own grader, the real registry, the real
receipt and the real reader: C13 moves from not covered to covered, and NO
OTHER ROW MOVES. The counts around it are unchanged: 91 not covered becomes
90 not covered and 1 covered, out of the same 95.

THE EVIDENCE, and its own limits. The receipt is the probe's own and carries
its own provenance: source commit `d8050251` (an ancestor of this tip,
checked with `git merge-base --is-ancestor`), the dist sha256 it was built
from, the fixture sha256, and eight graded legs with no red leg, a failure
count of zero and every Ruby-answered fact recorded. Its facts answer
Ruby's own scenario (`features/structure.feature:20-33`): create Movie
"Star Wars" with plusses, see the director and the lead in the main
content, edit them in place through Save and Close, see them again, and the
untouched default right keep its own content. The receipt was measured at
`d8050251` and NOT at this tip, and the row says so: the credit is the
receipt's own, bound by the row's own reader, not a fresh measurement here.

    node --test tools/edge-signed-in-exercise/test/capture-feed-binding.test.mjs
    -> tests 8, pass 8, fail 0
    node --test tools/edge-signed-in-exercise/test/capture-feed.test.mjs
    -> tests 7, pass 7, fail 0

### 4.4 mx-159, capability A4: the anonymous sign-up

The repair is on a named branch with three named defects and its own
signed-in run record: the capability-inventory afix lane's commits
`d0f20bfb`, `ceb47daa`, `8dbde162` and `aad44b08` on
`origin/port/capability-inventory-afix-20261021` (tip `cd283f47`).

1. THE NAME NEVER REACHED THE CREATE. The anonymous `/new/:type` arm
   rendered the name prompt unconditionally, so the form posted an empty
   `card[name]` and the engine refused the create with 422 name-illegal.
   Ruby builds the new card with the request's card hash
   (`card_class.rb:104-133`), so a request that names the card renders
   Ruby's NAMED shape, and the committed real-Ruby capture carries exactly
   that shape. The route now reads `card[name]` off the query.
2. THE FORM WORE NO MAIN SLOT WRAP, so the vendored client's `mainSuccess`
   never appended `success[redirect]=true` and the page never landed. The
   route now emits the engine's own `:new` slot wrap.
3. THE BACKGROUND ANCHOR. `can_approve?` judges the ACCOUNTED cardtype's
   create rule, and this deck renamed that cardtype, so the upstream literal
   covered a set no accounted card belongs to. The setup now resolves the
   anchor through the codename, byte-equal to the scenario's literal on a
   stock deck.

And the landing leg read the page too early, because the client's own
success navigation evicts the XHR body: it now waits for the seed card's
URL or content before reading.

The five checks grade Ruby's form fields, action and success mark with the
named shape's hidden name field; the landing on the deck's own Signup
Success card; the verification mail; the verification link as an update of
the account card carrying the verify trigger and a token; and the sign-in
with the account's own email and password. The contract clauses are pinned
on committed Ruby source, vendored verbatim and sha256-pinned.

    node tools/edge-signed-in-exercise.mjs --only account-signup \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche8-20261022/account-signup-slice-r1/report.md

9 of 9 checks passed: the five A4 legs, the two cleanup legs, the final
browser asset audit, and the C13 capture feed.

ONE STATUS FLIP WAS DELIBERATELY NOT TAKEN. The afix commit `1422aa62`
flips TWO rows to covered, A4 and M1. M1's own repair, the toolbar sweep's
selector for TinyMCE's split buttons (`5f094dca`), is not in this tree, so
M1 stays partial here. A row is covered by the checks that ran, and M1's
repair did not come with this ride.

## 5. The whole-family run after the fixes, and the two mechanisms it found

THE FIRST RUN AFTER THE FOUR ROW FIXES found two things, and the second one
was this tranche's own regression.

    node tools/edge-signed-in-exercise.mjs       --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3       --out .runtime/matrix-journey-tranche8-20261022/full-run-r4/report.md

- source `f684758d` (the A4 ride's tip), source files clean
- 251 checks, 239 passed, 12 failed
- the four rows' own new legs, as the run recorded them:
  - mx-159 (A4): its five legs PASS, and the C13 capture feed PASS
  - mx-143 (F1): the upload leg PASS, and the new "the uploaded card offers
    the /files route as a Download link" leg FAIL
  - mx-154 (W2): the start link and the revert PASS, and the stop link and
    the storage FAIL

### 5.1 The F1 leg, and what it found

The download anchor is RIGHT. The evidence the run recorded carries it:

    "download":{"attrs":{"href":"/files/~53155/154.txt"},
                 "text":"Download Harness_download_mvj7kn91",
                 "title":"Harness_download_mvj7kn91"},
    "writeStatus":200,"afterStatus":200

That is Ruby's shape: `set/type/file/core.haml` is one anchor whose href is
the attachment's source and whose text is `t :carrierwave_download` =
"Download %{title}". What the leg could not find is the other two surfaces
it grades: "noAttachmentCardName" and "noChosenFileChip", the chooser's own
hidden carriers and the chip `preview_editor.haml` renders.

AND THAT IS THE ROW'S OWN RECORDED FINDING, still true today: "/new/File has
no file input; the generic new-card form has no file branch". The upload leg
passes because the harness posts the file to the engine; the port's File
create form does not offer a file to choose. The capability lane wrote this
leg so that the row's finding would fail BY NAME instead of passing a write
that went nowhere, and that is exactly what happened.

This tranche does not repair the port's missing file branch. It is a
port-side gap on a surface the row names, it is named here with the evidence,
and no parity law lets this lane close it: the port does not match Ruby
here, so the gap is the port's to close, not this row's to paper over. The
row stays open on that named cause.

### 5.2 The W2 leg, and the defect in the leg itself

The stop link and the storage failed, and the run's own evidence says why:
the state after the follow was IDENTICAL to the state before it.

    "before":  {"shape":{"verb":"follow", ... "ruleContent":"[[*always]]"},
                "storedOption":null,"followerCount":0}
    "stopped": {"shape":{"verb":"follow", ... "ruleContent":"[[*always]]"},
                "storedOption":null,"followerCount":0}

The follow never happened. The leg read the anchor's href out of the page's
HTML text, where the ampersand between the query parameters is the
serialized `&amp;`, and it built its locator from that string. A browser
parses `&amp;` back into a plain `&` when it builds the attribute, so a
selector built from the serialized form matches NOTHING: the locator found
no element, the click never landed, and the leg read the same page twice.

W1's follow check reads the same anchor through the DOM (`page.evaluate` with
`getAttribute`), so its locator matches and its click lands, which is why W1
passed and this leg failed. That is the defect class this family exists to
close: a check that grades a page's serialized text instead of the page's
DOM.

THE REPAIR, commit `6ad66b6d`: `followLinkShape` now returns the anchor's
attribute value as `href` and keeps the serialized form as `hrefRaw`, and
the instrument's own test gained a leg that pins it.

### 5.3 This tranche's own regression, and what it cost

The first budget this tranche shipped for a check body was 600 s, set from
the tranche-7 reference run. It was wrong in the direction that matters, and
the run paid for it: the cover-b module's body is ONE body that drives about
forty capability legs, and on a loaded machine it took about 19 minutes of a
45-minute run. The budget fired while that body was still working.

A deadline abandons the promise it gave up on; it does not cancel it. So the
body kept running and kept recording its legs while the runner marked the
fixture fatal and quarantined the disposable stack, and every check after
that point ran against a fixture that was gone. Eight of the twelve failures
were `page.goto: net::ERR_ABORTED` or `typed fixture form refused: 403` from
checks that had nothing to do with the budget. One cause, twelve failures.

The correction, commit `9533390c`: the budget is 1800 s, above the slowest
body measured so far with room for a loaded machine, and a hang is still
reported rather than waited on forever. The bound that catches a hang where
it actually happens is the browser's own, and it is unchanged: a navigation
that never settles is caught by the navigation's own timeout, and the close
that follows it is bounded at 20 s.

AND THE FIRST COMMIT'S REASON WAS WRONG, which the correction puts on the
record. Commit `545cf762` set the budget from "the role-plus-right module's
C20 leg, which took about 12 minutes of that run". The C20 leg is not 12
minutes: measured on this machine, the longest single GROUP in the r4 run was
251 s (the content-flows module), and the cover-b module's own groups run
between 6 s and 50 s each. The body that takes about 19 minutes is the
cover-b module's BODY, which is one body driving about forty capability
legs, and it is the body the budget fired on. The number the correction
uses was measured; the number the first commit used was not.

### 5.4 The whole-family run at the tranche-8 tip

ONE ATTEMPT DIED, AND IT IS RECORDED RATHER THAN DROPPED. The run before
this one, at the same tip, was killed from outside while the engine was
serving normally: its own trace ends at `2026-10-22T08:54:57.225Z` with the
engine answering 200s, no JavaScript error was printed, the tool's own
failure net did not run (the run directory is still on disk, and that net is
the thing that removes it), and the process exited with 127. Nothing in this
lane killed it, and nothing in this lane can: this house's process-lifecycle
gate forbids termination by anyone. The run after it, the one below,
completed.

    node tools/edge-signed-in-exercise.mjs       --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3       --out .runtime/matrix-journey-tranche8-20261022/full-run-r6/report.md

No `--only`, no `--case`: the FULL exercise, every module.

- source `9533390c` (this tranche's tip), source files clean, `dirty: false`
- the executed bundle's SHA256 is
  `3dc9c9baebe05b9aa04935592cbb636de90cfc712da367c8008176f544678748`.
  It is NOT the hash the tranche-4, 5, 6 and 7 runs recorded
  (`b96ac0014d08fe0e5d2443a43d59830c0e97b3d8447c90df55af1906ef6de3cc`),
  because the A4 ride changes engine source. The other six commits of this
  tranche changed no engine source, so the hash moved for exactly one
  reason.
- the pinned deck's sha256 re-measured at this tip:
  `6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`, the
  same hash the mx-190 receipts bind the port's whole count to
- started `2026-10-22T09:07:01.869Z`, completed `2026-10-22T09:35:09.847Z`,
  so about 28 minutes of wall clock
- the process exit code is 1, by the tool's own rule and not by any failure
  (`tools/edge-signed-in-exercise.mjs:1596` exits 0 only when no check
  failed AND the capability coverage is complete). The exit code was
  captured in this lane's own command line.

**Result: 250 / 253 checks passed.** The three that did not:

| check | what the run recorded |
|---|---|
| `owner audit required checks / row 1: search box suggestions answer within 1 s, signed in` | the third keystroke answered in 1069 ms; the first answered in 757 ms and the warm ones in 682 ms and 634 ms |
| `cover-b. files / F1 the uploaded card offers the /files route as a Download link` | the download anchor is right and the write answers 200; the chooser's carriers and the chip are absent (section 5.1) |
| `9. timings / no signed-in page exceeded 3 s of server time` | 3 of 3991 labelled requests over the 3000 ms budget, the slowest 4298 ms |

THE TWO TIMING FAILURES ARE THE MACHINE'S LOAD, and the run's own receipt
says so: the budget is the engine's own `total;dur` from the Server-Timing
header, the slowest request in this run was
`/new/RichText` at 4198 ms with `db;dur=3572;stmt=98` and `render;dur=4194`,
which is the same page the tranche-6 run measured at 9675 ms and the
tranche-7 run at 2660 ms. The engine's work did not change between those
runs; the machine it ran on did. The same holds for the suggestion leg,
whose three keystrokes answered in 757 ms, 1069 ms and 634 ms.

THE FOUR ROWS, AS THE WHOLE FAMILY MEASURED THEM:

| row | the row's legs, as the run recorded them | verdict |
|---|---|---|
| mx-154 (W2) | the start link, the stop link, the stored rule and the revert | 4 of 4 PASS |
| mx-131 (C13) | the templated card, from the committed probe receipt | PASS |
| mx-159 (A4) | Ruby's form fields, the landing, the verification mail, the verify link, the sign-in | 5 of 5 PASS |
| mx-143 (F1) | the upload, and the card's /files route | the upload PASS, the /files leg FAIL (section 5.1) |

THE CAPABILITY COVERAGE, THE FAMILY'S OWN GRADER:

| | at the tranche-7 tip | at the tranche-8 tip |
|---|---|---|
| covered | 66 | **69** |
| partial | 20 | 21 |
| not covered | 5 | **1** |
| out of scope | 3 | 3 |
| disabled upstream | 1 | 1 |

The four capabilities that were not covered are now three covered and one
partial: A4 and C13 and W2 are covered, F1 is partial (one of its two legs
passes, the other names the port's missing file branch), and the one that
remains not covered is W4, which belongs to the row this tranche was told
not to touch.

THE COUNT ITSELF CHANGED, and the change is named rather than smoothed
over: 242 checks became 253, because the four rows' new legs are eleven
checks and the capture feed adds one. The capture feed's check is graded
from a committed receipt rather than from that run's browser, and the run
record says so in its own header.

## 6. What this tranche does NOT claim

- **The four rows the ask sets aside keep their own blockers.** mx-155,
  mx-190, mx-B-081 and mx-B-086 are untouched by this tranche, and their
  operator-side blockers stand as named.
- **The baseline run's process is still on the machine.** It cannot be
  stopped by a kill, because this house's process-lifecycle gate forbids
  termination by anyone, and the exercise had no lifecycle of its own to
  ask. That is why this tranche's first commit is a deadline: the next run
  cannot sit in the same silence. The one operator-side action, if one is
  wanted, is to end the machine session that owns it.
- **The C13 evidence is a committed receipt, not a measurement at this tip.**
  Its own source record names the commit it was measured at.
- **mx-143 stays open on a named port gap.** The F1 leg now RUNS, and it
  fails on the two surfaces the port does not have: the File create form
  offers no file to choose, and the card page shows no chip. The row's own
  recorded finding said so before this tranche, and the leg now says it by
  name. The port does not match Ruby on that surface, and this tranche does
  not close it.
- **The A4 repair changes engine source**, so the deployed bundle's SHA256
  moves. Nothing here deploys and nothing touches live.

## 7. The battery

- `node --test "tools/edge-signed-in-exercise/test/*.test.mjs"`: 177 tests,
  175 pass, 0 fail, 2 skipped (the opt-in live legs), at the tranche-8 tip.
- `npx tsc --noEmit -p tsconfig.json`: 3 errors, all in
  `tests/card/actions/write-path-races.test.ts` (lines 132 and 526), a file
  this tranche does not touch, about the SQL driver type in `src/`, which
  this tranche does not touch either. The two files the A4 ride does touch
  report no error.
- The whole-family exercise, at the tranche-8 tip: see section 5.

## 8. What this lane left on disk

- the exclusive checkout
  `C:/localProjects/decko-ts-matrix-journey-tranche8-20261022` itself, a
  linked worktree of the checkout this machine already holds, with
  `node_modules` shared through a junction, so the lane's copy adds about
  276 MB of tracked files instead of a second full clone, and 427 MB with
  the built engine dist and the run records;
- the run records under `.runtime/matrix-journey-tranche8-20261022/` and
  their logs, 39 MB;
- nothing was added to any other checkout, and the only file written outside
  this lane's own area is the run's local deck copy, which the tool deletes
  at the end of each run.
