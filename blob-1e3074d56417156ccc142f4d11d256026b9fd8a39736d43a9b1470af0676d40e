# Tranche 9: the port was never the gap, and the one remaining red is the machine's

Branch `port/matrix-journey-tranche9-20261022` (clone
`C:/localProjects/decko-ts-matrix-journey-tranche9-20261022`), from the
tranche-8 branch tip `d07a4b1a`. The ask named `149d0721` as that tip; the
branch advanced one commit past it (`d07a4b1a`, "Write JUnit results from the
default test configuration", the vitest JUnit output), and this branch
absorbs it, so `149d0721` and `d07a4b1a` are both ancestors of this tip.

The whole-family exercise was 250 of 253 at the tranche-8 tip. This tranche
worked the one open row, and the row turned out to be open for a reason the
tranche-8 receipt had backwards.

| commit | what it does |
|---|---|
| `237991861` | the F1 leg read a class the port renders byte for byte, and a surface Ruby does not populate |
| `2e4ac56da` | the F1 row's registry finding was false, and it is what misdirected the tranche-8 diagnosis |

## 0. The row the ask named, and the row that is actually open

The ask named one row, `mx-159` / capability A4, and called it "the named
port gap the tranche-8 instrument exposed". The evidence at the tranche-8 tip
does not support that name, and the difference matters, so it is stated
first and in full.

A4 IS CLOSED. The tranche-8 run's own record
(`.runtime/matrix-journey-tranche8-20261022/full-run-r6/report.md.json`) has
all five A4 legs PASS:

    the sign-up form carries Ruby's name, email and password fields, its create action and its success mark   PASS
    the sign-up lands on the deck's own Signup Success card                                                   PASS
    the new account is sent the verification mail Ruby's template writes                                       PASS
    the verification link is an update of the account card carrying the verify trigger and a token                PASS
    the new account can sign in with its own email and password                                                 PASS

and the family's own grader reads `A4 ... status: covered`, verifiedChecks 5
of 5. The roster row `mx-159-capability-catalog-account` is DONE in
`docs/registry/completeness-roster.json` in the roster repo, and the A4
repair itself is landed in this tree: the afix branch's three A4 commits
(`ceb47daa`, `8dbde162`, `aad44b08`) are byte-identical to what this tree
carries, checked with `git diff HEAD origin/port/capability-inventory-afix-20261021`
over the three files those commits touch (empty diff).

THE ROW THAT IS OPEN is the one the tranche-8 instrument exposed, and it is
F1: the capability "Upload a file (/files route after upload)", roster row
`mx-143-capability-catalog-files`, and the failing leg sits in the cover-b
files group, whose roster row is `mx-B-086`. The tranche-8 run recorded it
as the only non-timing red:

    cover-b. files: upload a file, an image, empty refused, member (F1, F3, F5, F7)
      F1 the uploaded card offers the /files route as a Download link   FAIL
      failures: ["noAttachmentCardName", "noChosenFileChip"]

So: the ask's row label does not match the evidence, and the substance of
the ask ("the named port gap the tranche-8 instrument exposed; fix the port
to match Ruby and pin it") points at a gap that does not exist. This tranche
worked the open row, and it says so rather than closing the wrong one.

## 1. The port is not the gap: the bytes are Ruby byte for byte

THE MECHANISM. The tranche-8 receipt closed the row as skip-and-name, with
this reasoning (section 5.1): "the port's File create form does not offer a
file to choose", and "the port does not match Ruby here, so the gap is the
port's to close". The port does match Ruby here, and the committed real-Ruby
capture says so.

THE ORACLE. The repo carries a committed capture of a real Ruby deck's
rendered views:
`reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl`.
Its arm `probe-view:98:input@set/type/file.rb` is the File card's
`:input` view, the chooser, and it reads:

    <div class='choose-file'>
    <span class='btn btn-secondary fileinput-button'>
    <i class="notranslate material-icons">cloud_upload</i>
    <span>Replace File...</span>
    <input class='file-upload slotter form-control' id='card_file' name='card[file]' type='file'>
    <input type="hidden" name="attachment_type_id" id="attachment_type_id" value="282" autocomplete="off" />
    <input class="attachment_card_name form-control" value="" autocomplete="off" type="hidden" name="card[file]" id="card_file" />
    <input type="hidden" name="file_card_name" id="file_card_name" value="*new_file" autocomplete="off" />
    </span>
    </div>
    <div class='progress mb-2' id='progress' style='display: none;'>
    <div class='progress-bar progress-bar-success' style='width: 0%;'></div>
    </div>
    <div class='chosen-file'></div>

and `src/card/mod-loader/mods/card-mod-carrierwave.ts:536-556` renders the
same bytes, line for line. The File create form DOES offer a file: the
`/new/File` page is the mod-composed new form, not the generic form, and
the engine says so in its own comment
(`deploy/bunny-worker-src/bunny-edge-engine-request.ts`, "Use the actual
mod-composed new form. In particular File/Image must dispatch carrierwave's
chooser and preliminary-upload fields"). The F1 upload leg has always
passed, and the registry's own finding ("/new/File has no file input; the
generic new-card form has no file branch") was simply false.

## 2. The first failure: a class value graded against a HAML literal

Ruby's `set/type/file/file_chooser.haml` line 11 is:

    = hidden_field card.attachment_name, class: "attachment_card_name", value: ""

The HAML names the class TOKEN. The RENDERED class carries decko's bootstrap
form class as well, because card-mod-bootstrap's form component adds
`form-control` to every field
(`card-mod-bootstrap-0.20.0/lib/card/bootstrap/component/form.rb`), so the
rendered value is `attachment_card_name form-control`. The check graded the
whole attribute value against the HAML's literal:

    const cardName = /class="attachment_card_name"[^>]*value="([^"]*)"/i.exec(source);

which cannot match Ruby's own bytes, so a field the port renders byte for
byte read as absent. The fact is the class TOKEN, and the check now reads
the token.

It now reads BOTH quoting styles, because this gem's Haml `attr_wrapper` is
the apostrophe: Ruby's own bytes are `class='chosen-file'`, and a browser's
DOM serialization of them is `class="chosen-file"`. A check that reads one
style only sees the field as absent in the other, which is the defect class
the tranche-8 receipt itself named for the mx-154 leg ("a check that grades a
page's serialized text instead of the page's DOM").

## 3. The second failure: the chip is on a surface Ruby does not populate

THE MECHANISM. The chip (`preview_editor.haml`: the original filename beside
Rails' `number_to_human_size`) is the PREVIEW EDITOR's bytes, and Ruby
renders that view ONLY inside the two-step upload's round trip. Outside it,
the view RAISES: `preview_editor.haml` line 2 calls `cached_upload_card_name`
(`set/type/file.rb:144-146`), and `Card::Env.params[:attachment_upload]` is
nil when the request carries no `:attachment_upload`, so the `gsub` lands on
nil. The same capture says so verbatim, arm
`probe-view:100:preview_editor@set/type/file.rb`:

    undefined method 'gsub' for nil
    .../card-mod-carrierwave-0.20.0/set/type/file.rb:145:in 'cached_upload_card_name'

So the chip rides the round trip's RESPONSE, which the browser swaps into the
form's `.chosen-file` (`upload.js.coffee:48-51`, `editor.find('.chosen-file')
.replaceWith data.result`), and it is on the SAVED card's page in neither
Ruby nor this port: that page carries `core.haml` and nothing else. The leg
read the chip off the saved card's page, where no chip can be in either
system. It now waits for the round trip (the draft id in the preview's
hidden input, the same receipt the F8 leg waits for) and reads the chip out
of the FORM, while the download anchor is still read out of the saved card's
page.

## 4. The fix, and the pins

THE FIX, `tools/edge-signed-in-exercise/lib/file-download-view.mjs`:

- `fileChooserShape` grades the `attachment_card_name` CLASS TOKEN, in
  either quoting style;
- `chosenFileChip` reads the chip block, `p.name` and `span.size` in either
  quoting style;
- `fileCardOffersDownload` takes the chip from a new `previewHtml` evidence
  field, the round trip's preview, and says in the file header why the
  saved card's page cannot carry one.

THE CALLER, `tools/edge-signed-in-exercise/checks-cover-b.mjs`: the F1 leg
waits for the round trip, reads the chip out of the create form, and grades
the download anchor out of the saved card's page.

THE PINS, `tools/edge-signed-in-exercise/test/file-download-view.test.mjs`,
16 legs. The two committed capture arms are read as the ORACLE, not
transcribed: arm 98's own chooser bytes must pass the chooser half (the
class token, the type id, the card name), and arm 100 must still be the
raise. The three surfaces are then graded apart, in Ruby's own quoting and
in the browser's.

    node --test tools/edge-signed-in-exercise/test/file-download-view.test.mjs
    -> tests 16, pass 16, fail 0

## 5. The whole-family exercise

No `--only`, no `--case`: the FULL exercise, every module, twice.

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche9-20261022/full-run-r1/report.md

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche9-20261022/full-run-r2/report.md

THE SECOND RUN, which is the one that confirms the row: **253 / 253 checks
passed.**

- source `2e4ac56da`, source files clean, `dirty: false`
- the executed bundle's SHA256 is
  `3dc9c9baebe05b9aa04935592cbb636de90cfc712da367c8008176f544678748`,
  the same hash the tranche-8 run recorded, because this tranche changed no
  engine source: the only files it touched are the harness's own check, its
  library and its registry entry
- started 2026-10-22T16:52:48.289Z, completed 2026-10-22T17:19:19.445Z, so
  about 26 minutes of wall clock
- 253 results, 0 failures, 3980 timed requests, NONE over the 3000 ms
  budget (p50 7 ms, p95 1065 ms, p99 1795 ms, max 2610 ms)
- the process exit code is 1, by the tool's own rule and not by any failure
  (`tools/edge-signed-in-exercise.mjs` exits 0 only when no check failed AND
  the capability coverage is complete). The exit code was captured in this
  lane's own command line.

THE FIRST RUN, at the fix's own commit, was **252 / 253**: the same 253
checks, with one red, and it is the run that measures the machine honestly
rather than flattering it. Its red was "no signed-in page exceeded 3 s of
server time", and the run's own evidence names the single request over the
budget:

    /new/RichText?card%5Bname%5D=Harness_toolbar_mvjrltbg&card%5Bcontent%5D=...
      ms 3262, serverMs 3261
      auth;dur=3, seat;dur=0, db;dur=2444;stmt=101, render;dur=3258, total;dur=3261

THE THREE RUNS' SERVER TIME, side by side:

| | tranche-8 r6 | tranche-9 r1 | tranche-9 r2 |
|---|---|---|---|
| checks | 250 of 253 | 252 of 253 | **253 of 253** |
| timed requests | 3991 | 3997 | 3980 |
| requests over the 3000 ms budget | 3 | 1 | **0** |
| p50 | 7 ms | 6 ms | 7 ms |
| p95 | 1063 ms | 1033 ms | 1065 ms |
| p99 | 1725 ms | 1652 ms | 1795 ms |
| max | 4298 ms | 3262 ms | 2610 ms |

The one request that was over the budget in r1 is the same page the tranche-6
run measured at 9675 ms, the tranche-7 run at 2660 ms and the tranche-8 run
at 4198 ms. The engine's work did not change between those runs: the bundle
SHA256 is byte-identical across tranche-8 r6 and both tranche-9 runs. What
moved is the machine, and the r2 run, on the same tree and the same bundle,
records no request over the budget at all. The receipt states both numbers
because the operator is owed the one that was not flattering as well as the
one that was.

THE F1 ROW, AS THE WHOLE FAMILY MEASURED IT (both runs, same verdicts):

| leg | verdict |
|---|---|
| F1 a file can be uploaded through the File create form | PASS |
| F1 the uploaded card offers the /files route as a Download link | PASS |

and the leg's own evidence carries all three surfaces (r2's record):

    failures: []
    download: { attrs: { href: "/files/~53155/154.txt" },
                text: "Download Harness_download_mvjsphuh" }
    writeStatus: 200, afterStatus: 200, roundTrip: true
    previewChip: { filename: "harness.txt", size: "17 Bytes" }

THE CAPABILITY COVERAGE, THE FAMILY'S OWN GRADER:

| | at the tranche-7 tip | at the tranche-8 tip | at the tranche-9 tip |
|---|---|---|---|
| covered | 66 | 69 | **70** |
| partial | 20 | 21 | **20** |
| not covered | 5 | 1 | **1** |
| out of scope | 3 | 3 | 3 |
| disabled upstream | 1 | 1 | 1 |

F1 moved from partial to covered. The one capability still not covered is
W4, which belongs to the row this family was told not to touch.

## 6. The battery

- `node --test "tools/edge-signed-in-exercise/test/*.test.mjs"`: 182 tests,
  180 pass, 0 fail, 2 skipped (the opt-in live legs), at this tip.
- `npx tsc --noEmit -p tsconfig.json`: 3 errors, all in
  `tests/card/actions/write-path-races.test.ts` (lines 132 and 526), a file
  this tranche does not touch, about the SQL driver type in `src/`, which
  this tranche does not touch either. The same three errors the tranche-8
  receipt recorded. The files this tranche does touch report no error.

## 7. What this tranche does NOT claim

- **The ask's row label is not the row this tranche worked.** `mx-159` /
  A4 was already closed at the tranche-8 tip (five legs PASS, the grader
  reads it covered, the roster row is DONE). The open row was F1
  (`mx-143-capability-catalog-files`, the cover-b files group whose roster
  row is `mx-B-086`), and it is now closed by the check fix, with the
  registry's false finding corrected. Nothing in this tranche reopened or
  re-decided A4.
- **The port was not changed, because the port matches Ruby.** The parity
  law says a match is done. The chooser bytes are byte-identical to the
  committed real-Ruby capture's, and the chip's surface is Ruby's own
  behavior, raise and all.
- **The four rows the earlier tranches set aside keep their own blockers.**
  `mx-155`, `mx-190`, `mx-B-081` and `mx-B-086` are untouched by the port,
  and their operator-side blockers stand as named. `mx-B-086`'s own DONE
  condition is the guarded live deploy, blocked on the operator's files-area
  arming.
- **The C13 evidence is a committed receipt, not a measurement at this tip.**
  Its own source record names the commit it was measured at.
- **The whole-family exercise is 253 of 253 at this tip**, on the second
  run. The first run at the same tree was 252 of 253, its one red being the
  engine's own server-time budget on a single request (262 ms over), and
  section 5 gives the three runs' numbers side by side rather than only the
  green one. The server-time budget is the engine's, and the page it names
  has been measured between 2660 ms and 9675 ms across four tranches on
  unchanged engine code.
- **Nothing here deploys and nothing touches live.** The live host received
  no request from this lane.

## 8. What this lane left on disk

- the exclusive checkout
  `C:/localProjects/decko-ts-matrix-journey-tranche9-20261022` itself, a
  clone of the repository, with `node_modules` shared through a symlink to
  the machine's existing dependency tree, so the lane adds no second copy of
  it;
- the run records under `.runtime/matrix-journey-tranche9-20261022/`;
- the built engine dist, which the exercise rebuilds from this tree's own
  source on every run;
- the commit-message files under `.runtime/`.

THE DISK COST, IN BOTH DIRECTIONS. Added, measured in this checkout with
`du -sh --exclude=node_modules .`: 623 MB, made of the clone's own object
store (316 MB), the tracked tree, the two run records (13 MB each, 25 MB
for `.runtime/` in all), the built engine dist (15 MB) and the bundled
worker (18 MB). `node_modules` is a symlink to the machine's existing
dependency tree, so the lane adds no second copy of it. Removed: nothing.
Nothing was deleted by this lane, and the residue left on disk is named
here rather than swept quietly: the two run directories, the dist tree, and
the commit-message files under `.runtime/`. The run's local deck copy is a
throwaway the tool deletes at the end of each run, and this lane's own
checkout stays in place because it is the lane's exclusive area.
