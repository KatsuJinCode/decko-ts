# The whole-family base measurement at the tranche-6 tip: 239 of 242 checks passed, and this tranche's four rows' legs are green inside it

Supplementary receipt for tranche 6 of the family (branch
`port/matrix-journey-tranche6-20261021`, base `f583811d`). The four row
reports each name the check that row's own contract calls for; this is the
additional WHOLE-FAMILY run taken at the same base, so a reader can see
those legs green inside the full exercise and not only inside their own
slices.

## The check, and what scale it ran at

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche6-20261021/full-run/report.md

No `--only`, no `--case`: the FULL exercise, every module.

- source `9aeebdb5651e9251c8cf87d76a6e7756b49654a8` (this tranche's tip
  at the time of the run), source files clean
- bundle SHA256
  `b96ac0014d08fe0e5d2443a43d59830c0e97b3d8447c90df55af1906ef6de3cc`
  (rebuilt from this tree's own source; byte-identical to the hash tranches
  4 and 5 recorded, because this tranche changed no engine source)
- selection `{only: null, case: null, diagnosticOnly: false}`
- started `2026-10-21T22:07:28.022Z`, completed `2026-10-21T22:31:34.017Z`,
  so about 24 minutes of wall clock
- run record `.runtime/matrix-journey-tranche6-20261021/full-run/report.md`
  and its machine-readable twin `report.md.json`
- the process exit code is **1**, by the tool's own rule and not by any
  failure: `tools/edge-signed-in-exercise.mjs:1503` exits 0 only when no
  check failed AND the capability coverage is complete. The exit code was
  captured in this lane's own command line.

**Result: 239 / 242 checks passed.** Capability coverage at this run: 66
covered, 20 partial, 5 not covered, 1 disabled upstream, 3 out of scope, of
95.

## This tranche's four rows, inside the full run

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

## The three failures, and why none of them is a port defect

1. **`E11b the +summary junction's own edit modal targets the junction card
   with its stored content`, `{"threw":"database is not defined"}`.** This
   is the INSTRUMENT's own defect, and this lane read the mechanism
   first-hand rather than inheriting the earlier tranches' note: the check
   at `tools/edge-signed-in-exercise/checks-catalog-edit-create.mjs:219-221`
   calls `database()` as a free variable, while the other checks in the
   same file destructure it out of the context
   (`:59`, `:112`, `:152`, `:252`). The binding is never provided to that
   one check, so the check cannot run at all. Its repair rides
   `fix/e11b-module-context-20261020`, and this lane checked that branch
   against this base: `git merge-base --is-ancestor
   fix/e11b-module-context-20261020 f583811d` exits non-zero, so the repair
   is NOT in this branch's base. Nothing about the engine is at issue.
2. **`9. timings`, one page at 9676 ms.** The slow page is
   `/Harness_CB_History_mviogf38/board_act?act_id=115&`, and the run's own
   timing string reads `auth;dur=5, seat;dur=0, db;dur=14278;stmt=3774,
   render;dur=9670, total;dur=9675`. Stated rather than smoothed over: this
   leg is NOT stable across runs at this base. Tranches 3 and 4 recorded
   the timings leg as their second failure (one page at 4845 ms) and
   tranche 5 recorded it PASSING, with the asset audit failing in its
   place. This run has both. The leg is not one of this tranche's four
   rows' surfaces; the save-path budget is its own roster row
   (`mx-B-064`, "9. timings"), with its own evidence, and this run does
   not change that row.
3. **The final browser asset audit**, one failure: a third-party CDN
   fetch, `https://cdnjs.cloudflare.com/ajax/libs/tinymce/5.10.7/skins/ui/oxide/content.min.css`
   answering `net::ERR_ABORTED` across 28 browser contexts. The engine
   does not serve that asset; the browser's own fetch of a third-party CDN
   failed. Tranche 5 recorded the same leg failing on a
   `fonts.gstatic.com` webfont, i.e. the failing third-party host differs
   from run to run, which is the signature of an external fetch, not of a
   port defect.

## The batch this tranche took, and how it was determined

The roster is the row ledger for this family. Read with
`node -e "..."` over
`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`
(roster built `2026-10-21T21:20:24.339Z`):

    matrix-journey rows: 190
    buckets: {"DONE":186,"WORKING ON IT":4}
    the WORKING rows:
       mx-B-081-cover-b-edit-editor-buttons-li | FAIL
       mx-B-086-cover-b-files-upload-a-file-an | FAIL
       mx-155-capability-catalog-follow | FAIL
       mx-190-search-whole-count-correctness | FAIL

So the family's WORKING set is exactly four rows, and they are the four
this tranche took, in row-id order. **There is no fifth WORKING row in the
family**: every other row of the 190 is DONE with a named evidence basis.
The tranche therefore spent its machine time on the part of the family
that still had work in it, rather than re-measuring rows the roster
already closes.

## What this tranche changes for whoever folds the roster

- **mx-155's row text says the ACT-155 probe leg "stays RED".** At this
  tranche's tip that is no longer true: the leg runs, and it is green on a
  corrected instrument. The two defects that made it unreadable were
  instrument defects, not port defects: the affordance lookup tested a
  `null` on a value `Array#find` answers as `undefined`, and it read the
  affordance on a page that does not carry one; and the member's clause
  graded the dashboard for a per-card name Ruby never puts there. Both are
  fixed, and the corrected expectations are now pinned by their own test
  (10 legs) with their Ruby citations. The row's verdict and bucket do
  NOT move here: its DONE condition still waits on the guarded live
  deploy.
- **mx-155's row text also says the ACT-155 probe leg "was not run".** It
  has now been run, over the synthetic-v1 fixture, and the row's own leg
  is green in it.
- The other three rows' dispositions are unchanged by this tranche: their
  port sides were already green, and their remaining blockers are the
  operator-side ones named below.

## The three operator-side blockers, named and not claimed

1. **The guarded live deploy** (mx-B-081, mx-B-086, and the deploy half of
   mx-155's DONE condition): the files-area pair armed by the operator, the
   deploy reaching live, and a re-run of the affected legs serving the
   resolved rows. An operator account-side call. Nothing in this tranche
   deploys and nothing touches live.
2. **The MySQL rung assets** (mx-190): the oracle's whole count cannot be
   taken on this machine's rungs, so the port's whole count has no oracle
   beside it yet. The named next step is unchanged: provision the
   MySQL-rung assets on the machine that runs the oracle, boot the same
   deck fingerprint there, and record the oracle's whole count beside the
   port's in ONE receipt.
3. **The ACT-155 live leg** (mx-155): the live probe leg of the ACT-155
   action needs that same guarded live deploy to have landed before it can
   be run against the live host. The port side of the same leg is what
   this tranche measured, locally.
