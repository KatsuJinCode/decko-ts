# Conflict checks graded under both configurations on ec898d39 — the stock-conflict refresh decision record (2026-10-18)

Lane: conflict-fix (workflow dwfrun-ea15169f). Applies the LEAD RULING on the
conflict-check contract
(`C:/localProjects/brandonDojoTech/docs/handoffs/edge-demo-coordination.md`,
2026-10-18: "the two conflict checks are graded under the explicit opt-in
configuration where the repair is active, with both verdicts and both
configurations preserved in the record and the stock-default verdict retained
as the stock-parity receipt").

## The decision the oracle capture settled

The ask conditioned the fix shape on the oracle-page-capture lane's page-level
capture of stock Ruby's `/<card>?view=edit` render
(`C:/localProjects/brandonDojoTech/recovery/release/private-probes/oracle-page-captures-20261018/`,
served page sha256 `94c49e14f90b2cb29ff571a493cdec719ad880fc1f287bf325d5a6aaf6506a72`,
ruby 3.2.11 / card 1.110.0 / decko 0.20.0, local reference engine):

**Stock Ruby PRE-FILLS `#modal-container` on the ?view=edit page** — the
served page carries the full modal wrapper with the edit form inside
(`modalContainerFound: true`, 4781 modal bytes, `editFormPresent: true`), the
`#main` slot holds the card's titled view, and the modal wrapper itself sits
outside `#main`, right before `</body>`. After load the modal is shown with
`data-modal-origin-slot-id` registered on its modal-body (the
`openModalIfPresent` path in the deck script's modal.coffee fired).

Candidate (a) — stop emitting the pre-filled modal — is therefore a
stock-parity REGRESSION (it would diverge from the byte-level oracle and from
Ruby's `process_layout.rb` `render_outside_of_layout`, which
`src/card/render/page.ts:259-333 renderOutsideOfLayout` ports). **Candidate
(b) applies**: the 409 answer must carry the form's revision inside the slot
the client reads.

## The mechanism, and why candidate (b) is already the landed shape

1. The stock client 409 branch (served `showErrorResponse`, verified in run
   evidence: `... 409===t?this.slot().find(".current_revision_id").val(this.slot().find(".new-current-revision-id").text()):void 0`)
   resolves `slot()` through the form's `data-slot-selector="modal-origin"`.
   On this page shape the modal origin IS registered at load, and it resolves
   to the `#main` **titled** slot (oracle after-load DOM: the titled slot's
   `data-slot-id` `8868d5631c6a4192e7b9` equals the registered
   `data-modal-origin-slot-id`). The titled slot contains neither the form
   input nor the injected notice, so the stock refresh is a NO-OP — in stock
   Ruby just as in the port. The default-stock refresh failure is parity, not
   a port regression.
2. The 409 answer is byte-faithful stock Ruby: `src/server/write-routes.ts:2293-2321`
   renders the conflicted card's `:conflict` view
   (`Conflict!` + `<span class="new-current-revision-id">` — card-mod-format
   0.20.0 `set/all/html/error.rb:37-51`, which carries no revision input
   either). The client's notify injects it INSIDE the form (the error-selector
   `.card-slot` slot), which is exactly "the slot the client reads".
3. Candidate (b)'s refresh therefore rides the compensating document-level
   handler served ONLY under the explicit opt-in configuration —
   `deploy/bunny-worker-src/bunny-edge-conflict-retry-script.ts` (wired
   `DECKO_CONFLICT_RETRY=1` → `bunny-edge-served-deltas.ts:367` →
   `bunny-edge-page-shell.ts:96`). It reads the new revision from the conflict
   view inside the form's notice and writes the form's
   `card[last_action_id_before_edit]` input. Adding a revision input to the
   409 answer would trip that handler's `field.length!==1` guard and weaken a
   passing instrument — so the answer stays byte-stock, and nothing further
   was changed in engine source.

## The proof — both configurations, one clean source, one verified artifact

Engine source `ec898d39b9687a33618c005653493cee3c06b8a8` (source files clean,
detached worktree `C:/localProjects/decko-ts-conflict-fix-wt-20261018` — the
main checkout carried two sibling lanes' uncommitted WIP that the harness's
source-custody gate correctly refuses, and this lane neither commits nor
reverts another lane's files). Artifact
`deploy/dist/bunny-edge-engine.bundle.js` rebuilt from that source, SHA256
`f0d582d17d58f9d2e741913d857afc45025269cf20305285a76a42c4a5dffa9d`, pinned to
both runs via `--engine-bundle` (artifact bytes verified by the runner).
Receipts: `.runtime/edge-signed-in/2026-10-18-conflict-fix-flag1/` and
`.runtime/edge-signed-in/2026-10-18-conflict-fix-default/` (copies of the
worktree run dirs; console logs beside them in
`.runtime/edge-signed-in/conflict-fix-lane-20261018/`).

- **`DECKO_CONFLICT_RETRY=1` (the graded configuration)** —
  `renderConfigurationOverrides: {"DECKO_CONFLICT_RETRY":"1"}`:
  **9 / 9 PASS**, including `conflict response refreshes the visible forms
  revision` (page capture `002-conflict-visible-revision.html`: origin
  registered, `data-decko-conflict-retry="1"` served, form input refreshed to
  the new revision 2, `Conflict!` visible in the form) and `retry through the
  same form persists after a fresh browser read` (retry 200, stored, fresh
  read 200).
- **default-stock (the stock-parity receipt)** —
  `renderConfigurationOverrides: {}`: `conflict response refreshes the visible
  forms revision` FAIL (`refreshed:false`) and the module journey FAILs with
  `conflict UI did not refresh its revision` — the same verdict the full runs
  recorded at c9d7d2ea and f20a3429, now pinned to the current tip, matching
  the stock Ruby no-op mechanism above. All four pre-refresh checks pass in
  both runs (409 status, no overwrite, no history rows).

Runner exit code is 1 for BOTH runs by design
(`tools/edge-signed-in-exercise.mjs` final line: exit 0 requires zero failures
AND complete capability coverage — a `--only conflict` scoped run always
leaves 90 capabilities unrun). The report files' own `Result:` lines are the
graded verdicts. Neither configuration is presented as production acceptance.

## What this lane changed

Nothing in engine source — the candidate-(b) shape was already landed by the
earlier repair (the stock-parity conflict answer plus the opt-in compensating
handler), and the proof shows it complete: the graded configuration passes on
the current tip with no further change, and the default verdict is preserved.
This record is the new fact: both configurations, graded and preserved, on
`ec898d39` with one verified artifact.
