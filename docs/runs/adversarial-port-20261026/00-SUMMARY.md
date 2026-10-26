# Adversarial review: the port's parity claims under attack

Lane: adversarial-port, 2026-10-26. Three claims an expert author would
attack hardest were picked from the issue draft and its receipts and attacked
by re-running or re-deriving from the receipts' own artifacts. Three claims
minimum, one receipt per claim; every check below was executed in this lane
during this ask.

## Provenance

- Attacked tree: the newest pushed tip of `deploy/full-candidate-20261102`,
  read with `git ls-remote origin refs/heads/deploy/full-candidate-20261102`
  first: `c29e4c3f4c170542fd4a44b6eccc2dcf5dd111f6`.
- Workspace: exclusive worktree of `C:/localProjects/decko-ts-release-lead`
  at `C:/localProjects/decko-ts-attack-20261026`, branch
  `port/attack-20261026`, created with the disk steward's
  `create_worktree.py` at that commit. (A fresh full clone was attempted
  first and refused by this machine's second-clone guard; the owned worktree
  is the sanctioned equivalent, exclusive to this lane.)
- The claims attacked live in
  `C:/localProjects/brandonDojoTech/docs/reports/ethan-architecture-decisions-draft-2026-10-25.md`
  and the receipts it cites: the d1d2 decision evidence
  (`decko-ts-d1d2-verify-20261025/docs/runs/decision-evidence-d1-d2-2026-10-25/`),
  the divergence register draft
  (`brandonDojoTech/docs/reports/ethan-divergence-register-2026-10-26.md`),
  the setdsl receipt (`port/setdsl-verify-20261026`), and, for the
  refusal-chrome claim, the fix branch `port/refusal-chrome-20261026`
  (`1fb083f9e` + receipt `076246fba`).

## Verdicts, one line per claim

1. **The strict-parity flag claims: BROKE.** The issue draft's sentence
   "your exact behavior is still available behind a strict-parity flag" is
   true at the tip for exactly one of the three improved behaviors it lists.
   The sign-in flag exists and was verified to restore Ruby's recorded
   answers (every compared field, empty diff bag, run in this lane). The
   File/Image revision-restore behavior and the skin-with-missing-parent
   refusal have NO flag anywhere in the tip's source: the full `DECKO_*`
   environment inventory of `src/` contains no such switch, the refusal
   throw and the restore arm fire unconditionally, and the side-effects
   battery run with the only parity switch off still declares both steps.
   Receipt: `01-strict-parity-flags.md`.
2. **The 12-of-13 byte equality (what the masking hides): BROKE.** The
   capture masks relative times on both sides, and that mask hides a real,
   reader-visible wording difference: the shipped engine renders
   "about 1 months" / "about 1 years" where Ruby's own recorded bytes carry
   "about 1 year" (singular) - the port's no-locale fallback literal
   pluralizes a count of one, and nothing in the shipping tree loads the
   locale that would fix it. Verified by direct execution of the shipped
   build and by Ruby's own unmasked captures elsewhere in the same fixture
   set. Receipt: `02-masked-byte-equality.md`.
3. **The refusal-chrome fix (does it hold for other write refusals?): BROKE.**
   The bare-document refusal the receipts enumerate is one instance of a
   class: at the tip, raw body bytes differ from the recorded Ruby oracle on
   38 of 87 battery steps, including 24 refusal steps where Ruby renders a
   16,000-plus-byte site page and the port answers 0 to 470 bytes. The
   fix branch closes exactly the non-ajax 422 class (measured: four steps
   grow to pages at the fix commit's own build) and leaves the 403 denials,
   the 404s and the excluded 422 arms bare. The battery's comparator
   normalizes all of it away ("error pages ... only the message text is
   compared", compare.mjs), so no pinned suite sees it.
   Receipt: `03-refusal-chrome-scope.md`.

## What held

- The sign-in flag's substance: with `DECKO_SIGNIN_UNIFORM_FAILURE=off`,
  all three sign-in steps agree with Ruby's recorded oracle on every
  compared field (empty diffs). The flag claim's sign-in leg is real.
- The comparator headline itself reproduced exactly: 80 pass / 7 declared /
  0 mismatch at the tip, and event order 81/81 (from the same run's report).
- The refusal-chrome fix's own receipt is accurate about the class it
  closes: the type-change refusal's main slot is byte-identical to Ruby's
  at the fix commit, and its scope statement (non-ajax, non-JSON, 422,
  existing card) matches the measured behavior.

## Not run, and why

- The 80-of-87 trace-match normalization attack and the event-order
  6-unestablished-steps attack were folded into claim 3 (the error-page
  normalization is the one normalization that hides reader-visible
  differences; the raw-byte sweep in `03` is its resolution). The setdsl
  405-set comparison was not attacked; three claims were sufficient for the
  brief's minimum and the refusal-chrome and flag claims consumed the lane's
  budget.
- No live Ruby server was booted (none exists on this machine's recorded
  material beyond the fixtures); Ruby's side in every finding above comes
  from the repo's own recorded Ruby bytes or the receipt's own artifacts,
  never from memory.

## Artifacts

- `artifacts/raw-body-table-tip.json` - per-step status and body lengths,
  port at the tip vs the recorded Ruby oracle (49 of 87 byte-identical).
- `artifacts/raw-body-table-fix.json` - the same table with the fix
  branch's own engine build (49 of 87 byte-identical; four refusal steps
  now carry pages).
- `artifacts/compare-tip.json`, `artifacts/compare-fix.json`,
  `artifacts/compare-flagoff.json` - the three comparator reports this lane
  produced (verdict rows, event order, per-step fields).

## Later: the strict-parity 500 case

The strict-parity lane, merged after this receipt, opened a second
bare-document arm: with the strict-parity switches on, the port answered a
261-byte document where the recorded Ruby site serves 18,538 and 18,470
bytes of deck page, and the comparator's deliberate pin exempted the step
from the raw-body grade, so the raw table read clean over it. The
strict-500-chrome lane closed that case: the strict 500 renders the whole
deck page with the crash's own "Wild Card!" view in its main slot, byte
for byte as the recorded Ruby renders it, and the comparator grades a
strict-erased pin's body on its bytes rather than exempting it. Receipt:
docs/runs/strict-500-chrome-20261026/RECEIPT.md. The default mode's rows
in the artifacts above are unchanged.
