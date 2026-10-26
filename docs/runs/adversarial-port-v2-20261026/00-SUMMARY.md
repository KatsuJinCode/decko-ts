# Adversarial port attack v2: the v24 candidate under attack

Lane: adversarial-port-v2, 2026-10-26. The v24 candidate
(`deploy/full-candidate-20261103`) carries the first port attack's fixes plus
eleven more lane tips. This lane attacks the four claims the first attack
broke (plus the one it proved) and the roll itself. Five claims, one receipt
each; every check below was executed in this lane during this ask.

## Provenance

- Attacked tree: the newest pushed tip of `deploy/full-candidate-20261103`,
  read with `git ls-remote --heads origin` before anything else:
  `5131d2ac40dacc64c45530941e82937caef86137`.
- Workspace: a linked worktree of `C:/localProjects/decko-ts-restored` at
  `C:/localProjects/decko-ts-attack2-20261026`, branch
  `port/attack2-20261026`, created with the sanctioned lane tool
  (`node C:/localProjects/juc-relay/fleet/lane-copy.mjs --repo
  C:/localProjects/decko-ts-restored --path
  C:/localProjects/decko-ts-attack2-20261026 --branch port/attack2-20261026
  --base deploy/full-candidate-20261103 --shared-modules
  C:/localProjects/decko-ts-workbatch-a-20261025/node_modules --budget-mb
  400`), lease `b2e42c848372`. The byte budget was raised from the tool's
  300 MB default because the candidate's tracked tree grew to 302,190,697
  bytes (the tool refuses at 300 MB and named the number); the copy still
  shares the git objects and the dependencies, and it added 302,191,004
  bytes to the drive.
- The engine distribution was built from this tree (`npm run build:engine`,
  exit 0) and every battery run was driven through the committed fixture
  `reference-harness/fixtures/write-battery-v1`.

## Verdicts, one line per claim

1. **The four strict-parity switches: HELD on the counts, with one
   qualification.** The default mode reads **78 pass / 9 deliberate / 0
   mismatch** and the strict mode **86 pass / 1 deliberate / 0 mismatch** at
   the rolled tip, exactly the branch receipt's numbers, no drift. The six
   flag cases grade PASS with empty diff bags. The qualification: in strict
   mode two of the six answer a 261-byte document where the recorded Ruby
   answers an 18.5-kilobyte site page, and the raw-body verdict grades those
   rows `declared`, so the table reads clean. Receipt:
   `01-strict-parity-switches.md`.
2. **The error-page chrome: the raw-body table HELD, the CLASS is BROKE for
   the strict-parity 500.** The table reads `byte-equal 51; slot-equal 28;
   declared 6; residual 2` in the default mode and `byte-equal 51;
   slot-equal 31; declared 3; residual 2` in the strict mode, with **0
   raw-mismatch** in both, the error-chrome receipt's own numbers unchanged:
   no step regressed in the merge. But the strict arm of the write path
   answers a bare 261-byte document where Ruby renders the whole deck page,
   and the comparator's raw-body verdict cannot see it because it does not
   honour the strict erasure rule its own field verdict honours. A one-line
   change to the verdict turns the two rows into `raw-mismatch`. Receipt:
   `02-error-chrome-raw-bodies.md`.
3. **The junction set-anchor fix: HELD.** The probe
   (`tools/probe-set-anchor-create.mjs`) reruns clean at the rolled tip
   (exit 0) and every set-anchor create answers **303**, none answers 422.
   The rows store, checked directly in the probe's deck copy: the junction
   rows are there, for the two-segment shapes and for the three-segment ones
   (which the probe's own two-side lookup cannot resolve, a limitation of
   the probe, not a missing row). Receipt:
   `03-junction-set-anchor.md`.
4. **The timeago plural fix: HELD, in the rendered bytes.** The rendered
   creator credit carries "about 1 month ago" at 35 days, "about 1 year
   ago" at 366 days, "over 1 year ago" at 500 days, "1 day ago" at 1 day,
   and the plural forms for the counts above one. No rendered band carries a
   plural of one. The pre-fix bytes are on record for comparison ("about 1
   months ago"). Receipt: `04-timeago-plural.md`.
5. **The roll itself: the union resolution is correct and unique, and it is
   the one combination that hides a real gap. The three repaired pins
   HOLD.** The union-resolved `scenarios.json` differs from both parents in
   exactly one step, and it is the only one of the four candidate files that
   grades clean in BOTH battery modes; the strict mode's cleanliness covers
   the same 18-kilobyte body gap as claim 2. The three stale pins the roll
   repaired read green at the rolled tip (88 tests), and each repair is
   sound: the asset-name pins still fail if the naming rule regresses (the
   rule's own suite pins it), and the denial-page pin now asserts what the
   RECORDED Ruby page carries, which the old pin's text did not. Receipt:
   `05-roll-union-and-stale-pins.md`.

## What held, in one place

- Both battery modes reproduce the parity-flags branch's own receipts at the
  rolled tip, with no drift in either number.
- The raw-body table holds its counts in both modes, with zero raw-mismatch,
  and no step changed category in the merge.
- The set-anchor create refusal stays fixed, and the rows store.
- The timeago fallback renders the singular forms in the bytes a page
  carries, in every band.
- The roll's three repaired pins are green and still guard what they claim.

## The one finding

The strict-parity 500 is a bare document. In strict mode (the posture a
deployment that wants Ruby's exact behaviour turns on), a File or Image
revision restore and a bad-parent skin create answer 261 bytes where the
recorded Ruby site answers 18,538 and 18,470 bytes of deck page. The write
path's strict arm (`src/server/write-routes.ts:2867-2872`) returns before the
chrome arm (`:2956-2983`), and the comparator's raw-body verdict
(`tools/parity-side-effects/compare.mjs:467`) exempts the step because it has
a deliberate pin, while the same file's field verdict (`:368`) knows that the
strict mode erases that pin. Under the approved-divergences register's own
rule ("anything not listed here is meant to behave exactly as Ruby Decko
does; an unlisted difference is a defect"), the strict mode's 500 page is an
unlisted difference. The strict-parity documentation's own claim, "the same
500 and the same server_error page", is true of the view and not of the page.

## Not run, and why

- The whole-run signed-in exercise the anchor receipt grades
  (`node tools/edge-signed-in-exercise.mjs --only role-plus-right`, "15 / 15
  checks passed") was not rerun: it drives a browser against the local stack
  and its C20 and P5 legs need the exercise's own harness. The claim under
  attack was narrower, and the probe is the tool the brief names.
- The end-to-end local-stack probe for the timeago claim produced no phrase
  to read (the board's creator credit is a slot the card page defers), so
  the rendered bytes were read from the engine's render surface instead, the
  same surface the recorded Ruby renders were captured from.
- The three repaired pins were checked by running their suites and by reading
  what they assert; no pin was mutated to see it fail, so the "the pin would
  still catch a regression" statements are read from the code path the pin
  compares, not from a forced failure.

## Artifacts

- `artifacts/raw-body-table-rolled-tip.json` - the per-step table for the
  default mode, the strict mode, and the strict mode with the strict-aware
  raw verdict.
- `artifacts/compare-default.json`, `artifacts/compare-strict.json`,
  `artifacts/compare-strict-rawaware.json` - the comparator reports at the
  rolled tip.
- `artifacts/compare-parentchain-default.json`,
  `artifacts/compare-parentchain-strict.json`,
  `artifacts/compare-parentflags-default.json`,
  `artifacts/compare-parentflags-strict.json` - the comparator run with each
  parent's `scenarios.json`.
- `artifacts/probe-set-anchor-rolled-tip.json` - the set-anchor probe's own
  report.
- `artifacts/timeago-render-bytes.json` - the per-band rendered credits.
- `artifacts/format-view-bytes-rolled-tip.json` - the rolled tip's own
  format-view byte dump (the port's bytes and the recording's, per view).
- `probes/timeago-render-bytes.probe.ts` and `probes/vitest.probe.config.ts`
  - the rendered-bytes probe.
- `probes/make-strict-aware-comparator.mjs` - the one-line patch that builds
  the constructed input for receipts 02 and 05.
