# Tranche 7: the three drift-prone DONE rows repaired, and the whole-family run at the tranche-7 tip

Branch `port/matrix-journey-tranche7-20261021` (clone
`C:/localProjects/decko-ts-matrix-journey-tranche7-20261021`), from the
tranche-6 tip `5fa3cc7e`. The family's four WORKING rows (mx-155, mx-190,
mx-B-081, mx-B-086) were re-verified through tranche 6 with their
operator-side blockers named; this tranche took the DONE rows most at risk
of drift - the ones whose checks touch live surfaces - and repaired the
instrument defects the tranche-6 whole-family run had named as its three
failures, none of them a port defect.

| commit | what it repairs |
|---|---|
| `d1816454` | E11b: the check body read bare free variables and could not run at all |
| `241128e7` | the final browser asset audit graded a third-party CDN's failure as the deployment's |
| `32db3f30` | the 9. timings leg measured the harness's own traffic, not the page's work |
| `7736f4fc` | N10 (surfaced by this tranche's own run): the check graded a card's KEY against its NAME |
| `22921385` | the asset audit charged the operating system's socket pool to the deployment |

## 1. E11b: the check that could not run at all

The tranche-6 whole-family run recorded it as
`{"threw":"database is not defined"}`. The check at
`tools/edge-signed-in-exercise/checks-catalog-edit-create.mjs:219-221` called
`database()` as a free variable while every other check in the same file
destructures it out of the ctx the runner passes
(`lib/check-modules.mjs` calls `check.run(ctx)`), so the check died before
it reached a single assertion.

The repair rides the branch the tranche-6 report named,
`fix/e11b-module-context-20261020` (commit `1aa15d47`), and it is MERGED
here, so that commit is an ancestor of this branch's tip - the check the
tranche-6 report used to find the repair missing now passes:

    git merge-base --is-ancestor fix/e11b-module-context-20261020 22921385
    echo $?
    0

The merge is clean because the file is byte-identical at the merge base
(`d8050251`) and at the tranche-6 tip, so the repair applies to exactly the
text the tranche-6 run read.

The test, `tools/edge-signed-in-exercise/test/checks-catalog-edit-create.test.mjs`,
calls the E11b body directly with a stub ctx and asserts it REACHES its
first assertion. Measured red before the repair and green after it:

    before: 1 pass, 1 fail - "a ReferenceError means the body read an
             unbound name", actual 'ReferenceError', expected 'Error'
    after:  2 pass, 0 fail

**At full scale**: the tranche-7 whole-family run's E11b row is a PASS with
its own evidence - `nestedId:53065, targetId:53065,
action:"/update/Harness_catalog_summary_mvir6u44+Summary"` - where the
tranche-6 run had it as a thrown ReferenceError.

## 2. The 9. timings leg: the same page, 4.8x apart

THE FLAKE, MEASURED IN TWO WHOLE-FAMILY RUNS OF THE SAME PAGE. The cover-b
E21 fixture's board_act page measured

    tranche-5 run: total;dur=2012 ms  db;dur=2851  stmt=1688
    tranche-6 run: total;dur=9675 ms  db;dur=14278 stmt=3774

4.8x, at nearly the same commit, on a page whose own cost did not change.
That one request decided the leg: the tranche-5 run passed it, the tranche-6
run failed it on it.

THE MECHANISM, AS THE RUN RECORD SHOWS IT. In the tranche-6 run, 59 of the
3961 requests carried a `db;dur` GREATER than their own `total;dur` - a
database wall cannot exceed the request's own wall, so those headers are
impossible for a single request's work. The engine's `db;dur` and `stmt=`
are deltas of ONE per-isolate monotonic ledger, and the engine states the
contract itself: "the per-request numbers are exact whenever requests do
not overlap driver activity"
(`deploy/bunny-worker-src/bunny-edge-server-timing.ts:62-71`). The harness
breaks that contract in its own host: it drives many browser contexts into
ONE Node process, Node runs one request's JavaScript at a time, and so a
request waiting for the database hands the thread to the other request. The
first request's WALL then carries the second request's CPU, and the shared
db ledger counts the other request's round trips inside this request's
window. The engine does not serve the browser; the HARNESS does, so the
harness is where the overlap is created and where it is removed.

THE FIX. The local edge host now serves the engine's requests one at a time
(`tools/edge-signed-in-exercise/lib/one-at-a-time-queue.mjs`), and the wait
a request spent in the queue is recorded beside its own time as
`queuedMs`, so the run record shows the harness's own queuing and never
charges it to a page. The engine's work is unchanged - the tranche-6 run
spent 13.9 minutes of engine wall over a 24.1 minute run - but it is
serialized instead of overlapped, so every request's measured server time
is its own.

THE RULE, EXTRACTED AND TESTED. The budget's rule now lives in
`tools/edge-signed-in-exercise/lib/server-time-budget.mjs` instead of inline
in the 1500-line tool: the budget is the engine's own `total;dur` from the
Server-Timing header, pages and saves are graded separately, and a request
the engine did not label is not graded at all. The threshold does not move
(3000 ms) and the check names do not move (both are registry-bound:
`docs/registry/instrument-coverage-matrix.json`, ACT-063 and ACT-064). The
run now also records its own receipt of the measurement it took the budget
from - how many requests the engine labelled, how many broke the budget,
the slowest server time in the run - in `provenance.serverTime`.

    node --test tools/edge-signed-in-exercise/test/server-time-budget.test.mjs
    10 tests, 10 pass, 0 fail

    node --test "tools/edge-signed-in-exercise/test/*.test.mjs"
    108 tests, 106 pass, 0 fail, 2 skipped (the opt-in live legs)

WHAT IT DOES NOT CLAIM. The machine's own load is still the machine's: if
the OS deschedules this process, a request's wall grows and the budget
sees it. That residual is the one the 2026-10-18 run's own receipt named
("3 s timing budget sensitivity under fleet load - observed once (run A).
Not an instrument change was made; the check is correct" -
`docs/reports/whole-signed-in-harness-tip-fullrun-2026-10-18.md`). What
this commit removes is the part the harness owned.

## 3. The final browser asset audit: the deployment's assets, not the internet's

THE FLAKE, MEASURED IN TWO WHOLE-FAMILY RUNS. The leg "no script,
stylesheet, font or image failed across the exercised browser contexts"
failed at the tranche-6 tip on three copies of

    https://cdnjs.cloudflare.com/ajax/libs/tinymce/5.10.7/skins/ui/oxide/content.min.css
    status failed:net::ERR_ABORTED

and at the tranche-5 tip on a different third-party host entirely:

    https://fonts.gstatic.com/s/materialicons/v145/flUhRq6tzZclQEJ-Vdg-IuiaDsNc.woff2
    status failed:net::ERR_CONNECTION_CLOSED

Two hosts, two transport failures, one verdict. The engine does not serve
either asset: cdnjs.cloudflare.com is the TinyMCE dist base the engine
CONFIGURES (`deploy/bunny-worker-src/bunny-edge-engine-handler.ts:105`) and
fonts.gstatic.com is the icon font, and the harness ALLOWS both by policy
(`lib/harness-browser.mjs`, `STOCK_LAYOUT_CDNS`). So the leg was measuring
the public internet's availability.

THE REPAIR, BY THE RULE THIS REPOSITORY ALREADY OWNS. The page-render
instrument classifies every subresource failure into deployment /
harness-policy / third-party / navigation-abort
(`lib/page-render-subresources.mjs`) and its own rule is written down: "A
third-party host's failure and the harness's own policy abort are reported
beside it, never inside it". The final asset audit now uses the same
classifier (`classifyBrowserAssetFailures`, in `lib/harness-browser.mjs`):

  - deployment-failure (an asset THIS deployment serves: the local origin
    or a declared DECKO_SERVED_* asset host) still fails the audit;
  - a third-party failure and a request the browser cancelled
    (net::ERR_ABORTED) are reported, by name and by count, beside the
    verdict - not hidden, and not charged to the deployment;
  - a socket-pool refusal by the operating system
    (net::ERR_NO_BUFFER_SPACE, WSAENOBUFS) is its own named class,
    `host-resource-refusal`: no request was carried, so no asset was served
    and no asset was missed, and no Node HTTP server can answer that (a
    server that is not listening answers ERR_CONNECTION_REFUSED, and a
    server that errors answers 5xx). MEASURED at the tranche-7 tip: one
    request of the 152 the run made for
    `/mod/tinymce_editor/plugins/code/plugin.min.js` failed that way, and
    the engine served the same URL 151 times in the same run.

The check's NAME is registry-bound (ACT-109 and the mx-B-110 roster row)
and is unchanged; the graded class is now stated in the evidence:
`failures`, `notDeploymentAssets`, `byOutcome`.

THE TESTS, no network of any kind. Four legs over the RECORDED
observations: the two third-party failures are reported beside the verdict, a
404 from the deck's own asset host fails the audit, a refused connection on
the local origin fails the audit, the socket-pool refusal is reported
beside the verdict, and a clean run passes.

## 4. Two more findings this tranche's own run surfaced, and the repairs

### 4.1 N10 graded a card's KEY against its NAME

The tranche-7 whole-family run (the first one, at `32db3f30`) failed N10
("a page of nests, links, a file, a nest chain and a nest loop renders every
one of them") with `shape.fileSlot=false` and
`shape.chainSlots=[false,false,false]`, and the run's own capture shows why:
the page's nested slots carried

    class="card-slot content-view ALL TYPE-rich_text SELF-harness_cf_chain_a_mvirama"
    data-card-name="Harness_CF_Chain_A_mviramas"

and the check compared the SELF- token against the card's name lowercased.
The token is the card's KEY, and a key is not a name.

WHY A KEY IS NOT A NAME. Ruby's `Cardname#simple_key` (cardname-1.110.0
`lib/cardname.rb:106-118`) maps every underscore-separated word of the name
through `Variants#stable_key` (`lib/cardname/variants.rb:56-62`), which
applies the deck's uninflect method - `:singularize` by default
(`lib/cardname.rb:34`) - once and keeps the original word when the result
is not idempotent. ActiveSupport's default singular rules include
`inflect.singular(/s$/i, "")` (`active_support/inflections.rb:35`), so
`"Harness_CF_Chain_A_mviramas"` has the KEY
`"harness_cf_chain_a_mvirama"`.

READ FROM THE ORACLE, NOT ASSUMED. The gem tree on this machine
(`decko-ruby-oracle-gems/ruby/3.4.0/gems`) carries cardname-1.110.0 and
activesupport-7.2.4, and Ruby 3.4.11 is installed. With the vendored
ActiveSupport's inflector loaded (concurrent-map and i18n stubbed, because
those two gems are not in the tree):

    singularize(mviramas) = mvirama
    singularize(mvirama)  = mvirama
    singularize(mvioa76u) = mvioa76u

and the port agrees with the gem's code, word for word
(`src/card/name.ts` `simpleKeyUncached`/`stableKey` against the gem's
`simple_key`/`stable_key`). **THE PORT MATCHES THE SOURCE**; the check was
wrong.

THE ENGINE WAS RIGHT. The two whole-family runs served the same page:
33101 bytes at the tranche-7 tip against 33148 at the tranche-6 tip, the
difference being the length of the truncated class tokens, and the served
markup carried every nested card's `data-card-name`. The tranche-6 run
passed only because its run stamp ended in "u" and the tranche-7 run's
ended in "s" - a once-in-36-runs flake, not a red the battery could be
trusted about.

THE REPAIR. The check now asks which cards the page rendered by the slot's
own `data-card-name` - the name the ENGINE states - through the shared rule
in `lib/nested-card-slots.mjs`. The SELF- tokens stay in the evidence. The
check's stamp now ends in a word the singularize rule always changes
(`_cs`), so every run exercises the path that broke: the token can never be
compared to the name, and a verdict that read the token would fail every
time.

    node --test tools/edge-signed-in-exercise/test/nested-card-slots.test.mjs
    6 tests, 6 pass, 0 fail

### 4.2 The asset audit charged the operating system's socket pool to the deployment

See section 3's third class.

## 5. The whole-family run at the tranche-7 tip

THE CHECK, AND WHAT SCALE IT RAN AT

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche7-20261021/full-run-r3/report.md

No `--only`, no `--case`: the FULL exercise, every module.

- source `22921385d92d7c92bcd248151b92d49ac899c7af` (this tranche's tip),
  source files clean, `dirty: false`
- the bundle SHA256 is
  `b96ac0014d08fe0e5d2443a43d59830c0e97b3d8447c90df55af1906ef6de3cc` -
  byte-identical to the hash tranches 4, 5 and 6 recorded, because this
  tranche changed no engine source
- the pinned deck's sha256 re-measured at this base:
  `6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`
- started `2026-10-22T01:02:35.887Z`, completed `2026-10-22T01:32:54.031Z`,
  so about 30 minutes of wall clock
- the process exit code is 1 by the tool's own rule and not by any failure
  (`tools/edge-signed-in-exercise.mjs` exits 0 only when no check failed AND
  the capability coverage is complete). The exit code was captured in this
  lane's own command line.

**Result: 242 / 242 checks passed.** Capability coverage at this run: 66
covered, 20 partial, 5 not covered, 3 out of scope, of 95 - the tranche-6
run's coverage exactly (66 / 20 / 5 / 3), with the tranche-6 run's two
reds and the tranche-6 run's three failures all gone.

THE THREE LEGS THIS TRANCHE TOOK, AS THE RUN RECORDED THEM

| leg | verdict |
|---|---|
| `checks module catalog-edit-create / E11b the +summary junction's own edit modal targets the junction card with its stored content` | **PASS** (tranche-6: `{"threw":"database is not defined"}`) |
| `9. timings / no signed-in page exceeded 3 s of server time` | **PASS** (tranche-6: FAIL at 9675 ms) |
| `9. timings / no save exceeded 3 s of server time` | **PASS** |
| `final browser asset audit / no script, stylesheet, font or image failed across the exercised browser contexts` | **PASS** (tranche-6: FAIL on a cdnjs stylesheet) |

THE MEASUREMENT THE BUDGET WAS TAKEN FROM, IN THE RUN'S OWN RECEIPT
(`provenance.serverTime`)

    labelledRequests 3821, budgetMs 3000, overBudgetRequests 0, slowestServerMs 2660

and the run's own population, read off the ledger's own Server-Timing
headers:

    total;dur    0 -  499 ms : 2997 requests
    total;dur  500 -  999 ms :  499
    total;dur 1000 - 1499 ms :  230
    total;dur 1500 - 1999 ms :   65
    total;dur 2000 - 2499 ms :   27
    total;dur 2500 - 2999 ms :    3
    over budget              :    0

THE OVERLAP IS GONE, AND THE NUMBER SAYS SO. Requests whose `db;dur`
exceeded their own `total;dur` - impossible for one request's own work, and
the signature of the harness's own traffic inside the measurement:

    tranche-5 run: 45 of 3945 requests
    tranche-6 run: 59 of 3961 requests
    tranche-7 run 1: 0 of 3867
    tranche-7 run 2: 0 of 3445
    tranche-7 run 3: 0 of 3821

The engine's own attribution contract
("the per-request numbers are exact whenever requests do not overlap driver
activity", `deploy/bunny-worker-src/bunny-edge-server-timing.ts:66-68`) is
now TRUE in the local harness, because the local host serves the engine one
request at a time. The run's own queuing is recorded, never charged to a
page: 138.5 s of queueing over the run, the longest single wait 2603 ms.

THE ASSET AUDIT, PROVING ITSELF IN THE SAME RUN. The two third-party
failures that failed the tranche-5 and tranche-6 runs HAPPENED AGAIN in
this run - the same two hosts, the same two transport failures:

    third-party-failure failed:net::ERR_CONNECTION_CLOSED script https://cdnjs.cloudflare.com/ajax/libs/tinymce/5.10.7/themes/silver/theme.min.js
    third-party-failure failed:net::ERR_CONNECTION_CLOSED font   https://fonts.gstatic.com/s/materialicons/v145/flUhRq6tzZclQEJ-Vdg-IuiaDsNc.woff2

and the audit PASSED, with both reported by name and count in
`notDeploymentAssets` and `byOutcome: {"third-party-failure": 2}`. That is
the repair working on the exact observation that used to fail it.

THE FAMILY'S FOUR WORKING ROWS, INSIDE THE FULL RUN

| row | the row's legs, as the full run recorded them | verdict |
|---|---|---|
| mx-B-081 | E8 the nest image editor inserts a nest with view and size options | PASS |
| mx-B-086 | F1 a file can be uploaded through the File create form | PASS |
| mx-B-086 | F3 an image can be uploaded through the Image create form | PASS |
| mx-B-086 | F5 an empty file is refused | PASS |
| mx-B-086 | F7 a member can upload a file | PASS |
| mx-155 | W1 a card can be followed from the board's Engage tab | PASS |
| mx-155 | W3 a card and a cardtype can be watched | PASS |
| mx-155 | W5 a follower is mailed when a followed card is edited | PASS |
| mx-155 | W6 the unfollow link in the follower mail stops the follow rule | PASS |
| mx-155 | R1 a card can be renamed and its referers follow | PASS |
| mx-190 | the search-overmatch module, all four checks | PASS (4/4) |

THE THREE RUNS THIS TRANCHE TOOK, AND WHAT EACH ONE IS

| run | tip | result | what it is |
|---|---|---|---|
| 1 | `32db3f30` | 240 / 242 | the first run at the tranche-7 tip: E11b green, the timings leg green, the asset audit green; N10 red (the run that found it) and the asset audit red on the socket-pool refusal (the run that found it) |
| 2 | `22921385` | 208 / 210 | the first run at the FINAL tip: the C20 check's `page.goto` timed out at 30 s on a hanging cdnjs fetch and the fixture quarantine ended the run early (section 6) |
| 3 | `22921385` | **242 / 242** | the run at the FINAL tip that completed the whole exercise |

Run 2 is reported rather than smoothed over: it is the run that shows what
the battery still depends on (section 6), and it is why run 3 exists.

## 6. What this tranche does NOT claim

- **The battery still depends on the public internet for TinyMCE.** The
  engine answers every `/mod/tinymce_editor/...` request with a 302 to
  `https://cdnjs.cloudflare.com/ajax/libs/tinymce/5.10.7/...`
  (`deploy/bunny-worker-src/bunny-edge-engine-handler.ts:375-387`, and
  `TINYMCE_DIST_BASE` at `:105`), because the edge host has no copy of the
  distribution. A page's `load` event waits for those redirected assets, so
  a hanging cdnjs fetch can stall a navigation: the tranche-7 run 2 timed
  out on the C20 check's `page.goto` (30 s) and the run's own ledger shows
  the engine served that URL 200 in 797 ms and 810 ms, with the TinyMCE
  assets answering 302 - the wait was on the redirect target, not on the
  engine. The repo vendors the mod's own scripts
  (`fixtures/vendor/mod-script-assets/card-mod-tinymce_editor`) but NOT the
  TinyMCE 5.10.7 distribution, so the harness cannot serve them locally
  without a copy it does not have. This is the operator's call: mirror the
  distribution into the harness, or point the deck's editor base at an
  asset host the deployment controls. Nothing in this tranche changed the
  engine's asset base - that is the port's parity surface, and the live
  deployment answers the same 302.
- **The machine's load is still the machine's.** The 9. timings leg is now
  measured on a host that serves the engine one request at a time, so the
  number it reads is the page's own work; a machine stalled by the sibling
  lanes still inflates that wall, and the budget still sees it.
- **Nothing here deploys and nothing touches live.** The live deployment,
  the MySQL-rung assets and the ACT-155 live leg remain the operator-side
  blockers the earlier tranches named, and the four WORKING rows keep their
  own blockers.

## 7. The battery

- `node --test "tools/edge-signed-in-exercise/test/*.test.mjs"`: 108 tests,
  106 pass, 0 fail, 2 skipped (the opt-in live legs).
- `node tools/edge-signed-in-exercise.mjs` (the whole family, at the
  tranche-7 tip): three runs; the final one is 242 / 242. The run records
  are in section 5.
- No engine source touched by any commit in this tranche, so the deployed
  bundle's SHA256 is unchanged.

## 8. What this lane left on disk

- the exclusive clone `C:/localProjects/decko-ts-matrix-journey-tranche7-20261021`
  itself (574 MB of git objects, 1.4 GB of `node_modules` copied in from
  the tranche-6 clone, 15 MB `dist/`, 18 MB `deploy/dist/`) - the lane's
  working area, kept because the branch is pushed and the run records are
  worth keeping;
- the three run records under `.runtime/matrix-journey-tranche7-20261021/`
  (28 MB) and the three run logs (about 0.6 MB) - the receipts the numbers
  in this report were read from.
- Nothing was added to any other checkout, and no file outside this clone
  was written except the run's own local deck copy, which the tool deletes
  at the end of each run.

