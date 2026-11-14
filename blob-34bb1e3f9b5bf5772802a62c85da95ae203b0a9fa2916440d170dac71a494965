# Never-measured actions, batch 2 — matrix refresh for the second half — 2026-10-18

The lane's assignment: instrument the never-measured actions of
`docs/reports/perfection-checklist-2026-10-18.md` section B, taking the second
half by id order, coordinating by id ranges with the sibling batch-1 lane.

## Slice boundary (stated, so the halves cannot overlap)

The sibling batch-1 lane's in-flight probe
(`reference-harness/browser/probe-never-measured-batch1.mjs`, untracked, read
this session and left untouched) declares its scope: "the first half (by id
order, 19 actions) of the 37 matrix actions no instrument family has ever
measured … recomputed from docs/registry/instrument-coverage-matrix.json".
Recomputing that set from the current matrix reproduces their first half
exactly (ACT-068 … ACT-159, 19 ids). **This lane's half is the second: ACT-164,
165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 180, 182,
185 — 18 ids, boundary ACT-159 | ACT-164.** Zero overlap with the sibling's
declared legs. (The three ids the checklist's B2 list omits — ACT-177, 178,
180, the 34-vs-37 discrepancy — all fall in this lane's half and are closed
below.)

Two runner-case additions this lane drafted early (C13 templated-card loop,
W2 unfollow-from-board drive) were cancelled on deconfliction: the sibling's
in-flight probe carries ACT-131 and ACT-154 legs ported from the committed
checks modules; building parallel instruments for the sibling's half would
duplicate in-flight work.

## What closed, and on what proof

The B2 closure per action: at least one matrix entry records a measured status
from a named run. Sixteen entries were appended (all `whole-harness`, all
`pass`, target `pinned-commit-local-bundle`) in brandonDojoTech commit
**e2272743** (bunny-playback-wiring), one file,
`docs/registry/instrument-coverage-matrix.json` (+163/−14). The named runs,
each read this session with per-check verdicts:

- **Full harness run** — `.runtime/edge-signed-in/2026-10-18-runner-harness-full-run/report.md`
  (+ `.md.json`): 241 checks, 237 pass, source c9d7d2ea (ancestor of today's
  tip), clean tree, completed 2026-10-18T10:19:23Z.
- **Role-plus-right** — `.runtime/edge-signed-in/2026-10-18T06-17-09-979Z-49564/report.md`:
  13/13 (A6 4/4, C20 6/6), source f30a291e, clean.
- **Content-flows** — `.runtime/edge-signed-in/2026-10-18T05-54-40-986Z-32448/report.md`:
  11/11 (W5, W6, N10, N16, ERR1, S11, F4, N9), source 5db16a46, clean.
- **W6 re-run on the repair candidate** —
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/follow-render-repair-20261018/content-final-selected-r1/report.md`:
  7/7, source 67c203c1, bundle 63a8f787.
- **Exhaustive regrade-slice4 proof** — `.runtime/exhaustive/2026-10-18-regrade-slice4-proof/`:
  full 190-action run at 94a9f8ba, clean; ACT-176 and ACT-182 pass through the
  runner's behavioral cases 14 and 21.
- **Top10 probe re-run (this lane, this session)** — the committed probe
  `probe-pageonly-top10-write-permission.mjs` (bc81fbb5) executed at source
  05b6e06a (then-HEAD, clean apart from the sibling's untracked file), writing
  `.runtime/exhaustive/probe-pageonly-top10-batch2-rerun-20261018/probe-top10-result.json`:
  10/10 legs ok, `failures: 0`, exit 0. This lane's re-run exists because the
  committing run's result artifact carries no git-provenance field; the
  re-run's commit identity is stated in the matrix pointer.

Per id — fixed (entry + status recorded):

| id | measurement | proof |
|---|---|---|
| ACT-164 | CM1 comment lands on the card page (member) | full run, unmeasured-save-edit-create CM1 PASS |
| ACT-166 | C19 wanted-card offer completes, row stored | probe re-run leg, ok |
| ACT-167 | C20 plus-card (+*right) creation end to end, junction stored | role-plus-right 13/13; full run 6/6 |
| ACT-168 | C21 type-scoped create stores the route's type | probe re-run leg, ok |
| ACT-169 | N12 navbox dropdown opens on typing, items selectable | full run, widget-interactions N12 PASS |
| ACT-170 | N13 feed renders, fresh act first, links, expands | probe re-run leg, ok |
| ACT-171 | N15 [[reference]] click navigates, main slot shown | full run, unmeasured-save-edit-create N15 PASS |
| ACT-172 | N16 card and search answer RSS format view (default-disabled disclosed) | full run content-flows N16 + 11/11 run |
| ACT-174 | UI2 field help popover opens with its registered text | full run widget UI2 + lead-accepted 5/5 capture (handoff "UI1/UI2 CAPTURE ACCEPTED") |
| ACT-175 | A6 role checkbox click writes, cookie/render/fresh-read agree, restores | role-plus-right 13/13; full run |
| ACT-176 | H3 revert-link drive restores the earlier act's content | slice4-proof `actions/ACT-176.json` pass |
| ACT-177 | REL1 related panel expands, links navigate | probe re-run leg, ok |
| ACT-178 | ERR1 missing card answers 404, zero create forms | full run ERR1 + 11/11 run |
| ACT-180 | S11 name variants resolve to one stored card | full run S11 + 11/11 run |
| ACT-182 | render-mode both halves: modal wrapper vs no wrapper | slice4-proof `actions/ACT-182.json` + full run render-mode |
| ACT-185 | plurality/slug contract — the content-flows S11 check; shared-evidence mapping disclosed in the entry note, not re-labeled as new evidence | same named runs as ACT-180 |

The Bookkeeping line (B2's last item) closed in the same commit: the stale
stored totals block (348 entries / 45 no-instrument, proven stale by
`docs/reports/coverage-counts-2026-10-18.md:48`) was recomputed from the
entries present after the append: **372 entries (231 pass / 38 fail / 103
unmeasured), worst-status 136 pass / 33 fail / 21 no-instrument**; the
recompute is recorded in `last_recomputed` and `recomputation_history`. The
refresh script ran fail-closed (premise asserts: 356 entries / exact 37-id set
before the append; probe legs green before the four probe-cited entries) and
was deleted after its run.

B1 side effect, disclosed: B1's closure leg "or a stronger family grades it
measured in the matrix" is satisfied by these entries for every B1-listed id
they cover — ACT-164, 166, 167, 168, 170, 171, 172, 174, 175, 177, 178, 180
(enumeration backlog line), 182, 185 (cross-cutting line). Their strict-runner
page-only outcomes stand unchanged; the runner-aim work on those surfaces
remains available to whichever lane owns the runner.

## Unfixed, with the exact reason

- **ACT-165 (CM2 comment management)** — no instrument in any matrix family
  measures edit/remove-own-comment (matrix entries all `none/unmeasured`; no
  checks-module check, no probe leg), and the checklist line gates ACT-164/165
  on the Section E item 2 decision (operator deliverable-scope + Brandon
  product-intent), which is not recorded. Building the instrument before the
  ruling risks measuring a capability the ruling may take out of scope.
- **ACT-173 (UI1 accordions)** — measured three times over (exhaustive case 18
  pass at 94a9f8ba; widget-interactions UI1 PASS at c9d7d2ea; the lead-accepted
  5/5 capture at f598e5bc), but the checklist line requires the matrix entry to
  be refreshed "to match the ruled claim" and the Section E item 4 ruling is
  not recorded: the written UI1 claim (URL-reachability of nameless Set rows)
  contradicts the proven canonical-name routing (handoff line 1279). Writing
  the entry now would pre-empt the operator's ruling on a contested record.

## Concurrent-lane notes (disclosed)

- The tree moved during the session (regrade base 776349b2 → HEAD 05b6e06a via
  the fails-slice, pageonly-top10 and mail-http commits of other lanes). Every
  cited run's provenance was read from its own receipt, not inferred from HEAD.
- The sibling batch-1 lane's untracked probe file was read for boundary
  deconfliction only and is not committed by this lane.
- The brandonDojoTech working tree carries many other lanes' modified files;
  the matrix commit staged exactly one path (`git add
  docs/registry/instrument-coverage-matrix.json`, verified `1 file changed`).

## Disk bill

- Committed (brandonDojoTech): the matrix refresh, +163/−14 lines in one file.
- Committed (decko-ts-release-lead): this report, ~7 KB.
- Gitignored `.runtime` additions (retained as evidence): the probe re-run,
  2.3 MB + 8 KB console log.
- Removed: the refresh script (16 KB, one-shot, deleted after its run), per
  the matrix's own temp-script convention.
