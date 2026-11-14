# The whole-family base measurement at e22c388e: 240 of 242 checks passed, and this tranche's four rows' legs are green inside it

Supplementary receipt for tranche 5 of the family (branch
`port/matrix-journey-tranche5-20261021`). The four row reports each name
the check that row's own contract calls for; this is the additional
WHOLE-FAMILY run taken at the same base, so a reader can see that those legs
are green inside the full exercise and not only inside their own slices.

## The check, and what scale it ran at

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/matrix-journey-tranche5-20261021/full-run/report.md

No `--only`, no `--case`: the FULL exercise, every module.

- source `e22c388e592df57d5b13872e345c5d298d7f4e35` (the base the ask
  named), source files clean
- bundle SHA256 `b96ac0014d08fe0e5d2443a43d59830c0e97b3d8447c90df55af1906ef6de3cc`
- started `2026-10-21T19:02:01.886Z`, completed `2026-10-21T19:26:04.958Z`,
  so about 24 minutes of wall clock
- run record `.runtime/matrix-journey-tranche5-20261021/full-run/report.md`
  and `report.md.json`

**Result: 240 / 242 checks passed.** Capability coverage at this run: 66
covered, 20 partial, 5 not covered, 3 out of scope, of 95.

This run started before this tranche's own commits landed, so it measured
`e22c388e` exactly. The tranche tip's own bundle is byte-identical (the
tranche's commits touch the browser harness, one test file and one vitest
config entry, none of them engine source), which is why the same bundle
SHA256 appears in all three of this tranche's runs.

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

## The two failures, and why neither is a port defect

1. **`E11b the +summary junction's own edit modal targets the junction card
   with its stored content`, `{"threw":"database is not defined"}`.** This is
   the instrument defect tranches 3 and 4 recorded at this same base: the
   check module references a `database` binding the module context does not
   provide. Its repair rides `fix/e11b-module-context-20261020`, which is
   not in this branch's base. Nothing about the engine is at issue; the
   check cannot run at all. Confirmed unchanged at `e22c388e`.
2. **The final browser asset audit, one failure: a Material Icons webfont
   from `fonts.gstatic.com` answered `net::ERR_CONNECTION_CLOSED`.** This is
   an external-host network failure on a font fetch, not a port behaviour.
   It did not reproduce: the same audit passed in the two other runs this
   tranche took at the same tree (the cover-b case slice, 1 context, 0
   failures; the search-overmatch run, 3 contexts, 0 failures), and the
   failing URL is a third-party CDN the engine does not serve.

**A difference from what tranches 3 and 4 recorded, stated rather than
glossed.** Those tranches recorded the full run's second failure as the
TIMINGS leg (one page measured 4845 ms of server time). At this run the
timings leg PASSED (no signed-in page over 3 s of server time, no save over
3 s; slowest observed `/new/RichText` GETs at 2224 ms and 2139 ms server
time) and the asset audit is the failure instead. So the two failure slots
at this base hold the SAME first failure (E11b) and a DIFFERENT second one.
The second slot is not stable across runs at this base, which is itself the
finding: a whole-family run here carries one fixed instrument defect plus
one slot that alternates between a transient external-network failure and a
server-time threshold. Neither is a port correctness defect.

No row's disposition changes on the strength of this run: all four of this
tranche's rows keep the blockers their own reports name, and every one of
those blockers is either operator-side (the guarded deploy, the files-area
arming) or machine-side (the MySQL-rung assets for the oracle's whole
count). Nothing here deploys and nothing touches live.