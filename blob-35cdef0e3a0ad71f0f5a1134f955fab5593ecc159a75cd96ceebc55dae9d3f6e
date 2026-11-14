# Page-only batch 5 — ranks 41-50, the cross-cutting test-type gaps (2026-10-18)

Lane: `pageonly-41-50`. Same method and proof bar as page-only batches 1-3
(committed bc81fbb5, 5bdda29f, cacce253): the strict page-only actions of the
2026-10-18 exhaustive re-grade (`C:/localProjects/decko-ts-release-lead/.runtime/exhaustive/2026-10-18-regrade`,
101 of 190 actions graded "page-only") driven as witnessed browser affordances
on the ts engine (`reference-harness/browser/engines/ts.json`) over
`reference-harness/fixtures/synthetic-v1`, one graded leg per claim, positive
controls so no leg can pass vacuously.

## The id boundary (so batches never overlap)

- ranks 1-10 — batch 1, committed **bc81fbb5**: ACT-060, ACT-032, ACT-033,
  ACT-166, ACT-168, ACT-170, ACT-177, ACT-068, ACT-069, ACT-127
- ranks 11-20 — batch 2, committed **5bdda29f**: ACT-046, ACT-047, ACT-121,
  ACT-179, ACT-041, ACT-043, ACT-004, ACT-015, ACT-016, ACT-118
- ranks 21-30 — batch 3, committed **cacce253**: ACT-017, ACT-021, ACT-025,
  ACT-026, ACT-027, ACT-028, ACT-029, ACT-030, ACT-031, ACT-124
- ranks 31-40 — sibling lane **pageonly-31-40** (in flight at dispatch; not
  landed in this tree this session — nothing to read, per the batch-3
  coordination pattern). This lane's derivation of that window, stated for
  coordination, is the write-guard / session-persistence / history-reads
  cluster of the remaining pool: ACT-051, ACT-052, ACT-005, ACT-006, ACT-007,
  ACT-038, ACT-054, ACT-095, ACT-039, ACT-040. Nothing below drives any of
  those ten.
- ranks 41-50 — **this lane: ACT-181, ACT-184, ACT-186, ACT-188, ACT-189**,
  the regrade's cross-cutting test-type-gap group. The window resolves to
  five open items, not ten, because the evidence state moved under the batch
  plan today: the 10:19:23Z 241-check full run (source c9d7d2ea) produced
  fresh local-bundle passes for ACT-009, ACT-010, ACT-058, ACT-063, ACT-065
  (the matrix recomputation at 17:10:43Z cites its per-check rows and
  flipped those five), and ACT-066/ACT-067 are run-cleanup meta-actions with
  recorded passes and no member-facing affordance to drive. Driving them
  again would have duplicated same-day measurements; the five below are what
  remained open.

## Skips (already instrumented; direct reads this session)

| ids | reason (exact pointer) |
|---|---|
| ACT-089 (C6) | `tools/edge-signed-in-exercise/checks-cover-b.mjs:972-984` |
| ACT-091 (M1) | `checks-cover-b.mjs:1013-1030` |
| ACT-095 (H1) | `checks-cover-b.mjs:1110-1116` |
| ACT-096 (N5) | `checks-cover-b.mjs:1118-1159` |
| ACT-104 (N3) | `checks-cover-b.mjs:749-773` |
| ACT-105 (N8) | `checks-cover-b.mjs:775-788` |
| ACT-106 (N11) | `checks-cover-b.mjs:790-800` |
| ACT-110/111/112/114/115 | committed owner-audit rows (`tools/edge-signed-in-exercise/lib/owner-checks.mjs:21-74`), measured PASS on the local target at today's source: `.runtime/edge-signed-in/2026-10-18-runner-harness-full-run/report.md:87-92` |
| ACT-009/010/058/063/065 | fresh same-day local passes at c9d7d2ea (full-run report rows; matrix recompute 17:10:43Z) — re-driving would duplicate |
| ACT-066/067 | run-cleanup meta-actions (the harness's own teardown accounting), recorded passes, no member affordance |

## The instrument

`reference-harness/browser/probe-pageonly-batch5-ordering-case-paging-roles-empty-error.mjs`
— 11 graded legs. Every write goes through the real forms (/new/PlainText —
its content control is a visible textarea; RichText/Basic hide theirs behind
TinyMCE), the feed is driven through the navbar's own Recent Changes link,
search through the navbox, paging through the results page's own Next
control, and the role census through a real member session. Creates/edit
witness the POST and the stored sqlite row (`DatabaseSync` on the staged
deck). Row readers follow the recorded contract
(`checks-cover-b.mjs:1143-1149`: result rows are
`.search-result-list > .search-result-item` children read via
`[data-card-name]`; feed rows are `#main [data-card-name]` in DOM order
minus the `*recent` self-slot — verified against the rendered feed before
the graded run).

## Verdicts (final named run: `.runtime/exhaustive/probe-pageonly-batch5-run2/probe-batch5-result.json` — 11 GREEN / 0 RED)

| act | claim | verdict |
|---|---|---|
| ACT-181 | the Changes feed lists the most recently updated card first | pass (A created, B created, A edited last; navbar Recent Changes link → `/*recent`; A at row 0, B at row 1; creates 200 + stored rows 911/912, edit POST 200) |
| ACT-181 | the keyword search results list the most recently updated card first | pass (navbox term matching both cards; A row 0, B row 1) |
| ACT-184 | a card's name resolves case-insensitively | pass (lowercase URL 200, unique body token on the page, zero visible create-form name prompts; exact-case positive control 200) |
| ACT-184 | the slug round-trips (percent-encoded spaces) | pass (`/Harness%20Case%20Probe%20b5%20<stamp>` 200, token present) |
| ACT-184 | keyword search matches regardless of query letter case | pass (lowercase and UPPERCASE terms each return the card) |
| ACT-186 | pagination windows disjoint, offsets advance, control count matches | pass (6 pages walked on keyword=Topic, window sizes 20×5+16, zero duplicate ids, offsets 20/40/60/80/100 all distinct, control renders 1..6, 116 total within (5×20, 6×20]) |
| ACT-186 | an offset beyond the last page degrades gracefully | pass (signed-in `offset=100000` → 200, the search page rendered, no 5xx) |
| ACT-189 | an empty result set renders as the search surface, not an error | pass (unique gibberish term → 200, 0 result rows, search box present, "Search Results" heading, no `"error"` payload in the page) |
| ACT-189 | a missing card renders an error answer, not an empty success | pass (`/No_Such_Card_<stamp>.json` → 404 with JSON `error: "card not found"`) |
| ACT-189 | the empty and error renders stay distinct | pass (both shapes asserted in one leg; no leak either way) |
| ACT-188 | the create-form type control renders per role | pass (admin 33 types including Cardtype/Layout/Skin/CSS/SCSS/JavaScript/CoffeeScript; member 25 types, zero of the seven structure types leaked, RichText present for both — positive controls both ways) |

No engine defect surfaced: all five claims hold at the current tip. There is
nothing to fix and no RED to carry.

## Run-1 instrument note (recorded honestly; no test weakened)

Run 1 (`.runtime/exhaustive/probe-pageonly-batch5-run1/probe-batch5-result.json`,
10 GREEN / 1 RED) REDed ACT-184's name-resolution leg on the discriminator
`!/card-form/.test(html)` — while its own evidence showed `tokenFound: true`,
which can only come from the stored card body. A bare `card-form` substring
is the wrong not-the-create-form instrument: signed-in page chrome (the
navbox slot) also carries `form.card-form` nodes. The fix replaced the
substring with the correct discriminator (a VISIBLE `form.card-form
input[name='card[name]']` prompt — what the unknown-name fallback renders
and a resolved card page does not) and kept the resolution proof
(status 200 + unique token). The leg's intent is unchanged and now measured
by an instrument that does not flag chrome; both runs' evidence is retained
at the paths above.

## Recording

The five acts' matrix entries are prepared and quarantined for the registry
owner (the matrix lives in the foreign tree):
`C:/localProjects/brandonDojoTech/tmp/quarantine-foreign-tree-writes-20261018/pageonly-batch5-matrix-entries.json`
(+ `.sha256`). Each entry follows batch 1's recording convention:
instrument_family `whole-harness`, shape `headless-dom`, target
`ts-engine-local-bundle`, status pass from the named run, evidence pointer to
this file + the run directory. Note ACT-181's existing matrix row (FAIL at
50717cca) stays FAIL until the owner applies the entry; ACT-184/186/188/189's
rows (pass at 50717cca) gain a current-tip confirmation; ACT-188's
`none:fail` instrument-gap marker (coordination:920) is answered by this
run's per-role type-control drive.

## Cleanup

Discovery scratch (three passes that pinned the role-gated type list, the
error-route shape, the row readers, and the PlainText write path before the
graded probe was written) lives only in gitignored
`.runtime/exhaustive/pageonly-batch5-discovery/` and dies with the lane.
Committed: the probe and this report, by explicit path, on
codex/release-lead-20261015; never pushed, never deployed.
