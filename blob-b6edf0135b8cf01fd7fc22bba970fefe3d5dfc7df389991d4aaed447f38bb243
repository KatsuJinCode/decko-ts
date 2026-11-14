# Exhaustive regrade slice — ACT-075, ACT-101, ACT-182: affordance aims corrected — 2026-10-18

The 2026-10-18 regrade run
(`.runtime/exhaustive/2026-10-18-regrade/run-meta.json`, source 776349b23e,
clean) graded 23 of 190 actions fail. This lane's slice is the fail ids at
sortedIndex % 5 === 2 (0-based) of the sorted fail list:
ACT-048, ACT-075, ACT-101, ACT-158, ACT-182. ACT-048 and ACT-158 belong to
the sign-in lane (their cure is 7f774f32); this lane cured the remaining
three in commit **26331d91** and proved them on the clean committed build
**94a9f8ba** (full 190-action instrument run, provenance dirty=false:
`.runtime/exhaustive/2026-10-18-regrade-slice4-proof/`).

All three reds were instrument aim defects; none was an engine gap.

## ACT-075 (C14) — a *right+*default rule's content fills the new form

- Verdict: aim defect. The probe visited `/new` — the unnamed generic form —
  and decoded the rule names in the prose ("*right", "*default") as field
  hints. `/new` renders no `.RIGHT-*` group for any rule, on the ts engine
  and on the Ruby oracle alike. The morning slice-5 report's premise
  ("the named rule has no witness in the fixture") was wrong:
  `summary+*right+*default` (content `<p>No summary yet.</p>`) has been in
  synthetic-v1 since the fixture's creation commit 1ec20ed3, and the engine
  implements the prefill (render.ts `newCardDefaultContent`:3768, the
  fabricated new-card record's dbContent, format.ts:2685).
- Cure (case 19): drive `/Brief+summary/new` — the junction create form — and
  assert the `.RIGHT-summary` field group's value equals the rule content
  byte-for-byte. The count encodes the contract (group present AND value
  equal), so an engine regression that empties the prefill stays red — the
  shape the 50717cca whole-harness C14 red recorded.
- Proof (same instrument, clean build 94a9f8ba, admin actor): assert count 1,
  `value === expected === "<p>No summary yet.</p>"` on
  `/Brief+summary/new` — `.runtime/exhaustive/2026-10-18-regrade-slice4-proof/actions/ACT-075.json`.
  Outcome fail → pass.

## ACT-101 (P5) — a *self+*structure rule on a card renders its structure in the main slot

- Verdict: aim defect. The probe visited the deck home and decoded the
  rule-set names in the prose as field hints; the home page carries no card
  whose structure could render. The engine renders structure rules in the
  main slot (fixture rule `Topic+*type+*structure` on `/Topic_001`), and the
  whole-harness instrument graded P5 pass on a self-made *self+*structure
  witness.
- Cure (case 20): drive `/Topic_001` and assert the structure's own rendered
  bytes: `.card-slot.RIGHT-summary` (the +summary nest) and
  `.card-slot.closed-view.RIGHT-related` (the +related nest with the
  template's `|closed` option).
- Disclosed residual: the action text names a `*self+*structure` rule;
  synthetic-v1 holds no `X+*self+*structure` card (its only `*self` rule is
  `Topic 003+*self+*read`), and the probe is read-only (GET only — a mid-run
  write would contaminate every later action), so the SELF-set selection
  itself has no fixture witness here. What is pinned is the
  structure-renders-in-the-main-slot behavior the action names, on the
  fixture's own structure rule. Closing the self-set half is a fixture
  change, not an engine change.
- Proof: both asserts count 1 on `/Topic_001` —
  `.runtime/exhaustive/2026-10-18-regrade-slice4-proof/actions/ACT-101.json`.
  Outcome fail → pass.

## ACT-182 — render-mode semantics: inline-modal vs navigation behavior of the same affordance

- Verdict: aim defect. The probe asserted `.modal, [role=dialog]` on the
  bare `/` with no view parameter — a navigation, a page state that cannot
  carry a modal wrapper on any engine. The morning slice-5 report called the
  modal "not observable by construction"; that is not so: the modal wrapper
  is a view with its own URL (`/<card>?view=modal`, the engine's modal
  wrapper view set, render/page.ts:101-105), like every other affordance
  this module re-aims at.
- Cure (case 21): drive `/Brief?view=modal` and assert `.modal.show` renders
  (inline-modal mode), then drive plain `/Brief` and assert no wrapper
  (navigation mode) — both halves of the render-mode contract. The runner's
  own per-class modal counter on `/` is untouched and still records 0 there;
  the mis-aimed count stays in the sequence as the honest record of the old
  aim.
- Proof: wrapper count 1 on `/Brief?view=modal`, plain-view wrapper count 0 —
  `.runtime/exhaustive/2026-10-18-regrade-slice4-proof/actions/ACT-182.json`.
  Outcome fail → pass.

## Full-run proof and collateral

Same instrument (`reference-harness/browser/run-exhaustive.mjs`), same
fixture and matrix as the regrade, full 190 actions, at clean commit
94a9f8ba (which contains 26331d91 and the stepTimeout repair). Totals:
84 pass / 101 page-only / 2 fail / 3 out_of_scope. Against the regrade run
exactly 21 outcomes changed, every one fail → pass (the union of all lanes'
committed cures: ACT-018, 020, 048, 049, 050, 059, 064, 075, 092, 093, 097,
100, 101, 119, 126, 138, 158, 159, 173, 176, 182). No pass regressed, no
page-only action changed. The 2 remaining fails at that commit — ACT-130
(C11) and ACT-165 (comments) — belong to other slices and are uncured at
94a9f8ba.

## Concurrent-lane notes (disclosed, not concealed)

- Commit 26331d91 carries, besides cases 19-21, the in-flight cases 15-18
  (ACT-018, ACT-059, ACT-130, ACT-173) of the lane that was editing the same
  file: this lane's clean-window detection raced that lane's write, and the
  commit swept their content in under this lane's message. The content is
  their authored work, committed intact (node --check verified); attribution
  is recorded here because the commit message cannot be rewritten without
  reordering history other lanes were building on.
- Between 26331d91 and this proof, the whole 3b affordance-target layer threw
  on every action (`stepTimeout is not defined`, introduced by the ctx
  refactor in the cases-7-14 commits) — observed by this lane as a
  135-fail/0-page-only run at 26331d91 and repaired forward by the owning
  lane at 94a9f8ba (`stepTimeout = 30_000` default parameter). The proof run
  here is the first full run after that repair.
- The proof run was executed from a detached worktree pinned at 94a9f8ba
  (junctioned node_modules, dist and the untracked oracle public assets into
  it) because the main tree stayed dirty under concurrent lanes; the
  worktree was removed after the run. Run artifacts (2.2 MB,
  gitignored .runtime) and this report are the residue.

## Disk bill

- Added to the repo (committed): this report, ~4 KB; the three re-aim cases
  in 26331d91 (~108 lines).
- Added to gitignored .runtime: the proof run, 2.2 MB, retained as the
  evidence pointer above.
- Removed: the scratch probe directory `.runtime/slice-4-regrade-probe/`
  (exploratory boot scripts, ~9 KB) and the proof worktree
  (`C:/localProjects/decko-ts-slice4-proof-worktree`), both after use.
