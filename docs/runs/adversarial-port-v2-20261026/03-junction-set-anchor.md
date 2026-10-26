# Receipt 3: the junction set-anchor create refusal, the fix at the rolled tip

Claim attacked: the anchor-regression lane (`port/anchor-regression-20261026`)
claims the junction set-anchor create refusal is fixed: a set-anchor create
answers **303** and the row stores, against the 422 it answered before the
fix. Its own probe table
(`docs/reports/row-full-signed-in-exercise-anchor-regression-2026-10-26.md`,
section 5, "Measured after the fix") lists every shape and its status before
and after.

Attacked tree: `deploy/full-candidate-20261103` at `5131d2ac40dacc64c45530941e82937caef86137`.

## Verdict: HELD

The probe reruns clean at the rolled tip (exit 0) and every set-anchor create
answers **303**, not 422. The rows store, checked directly in the probe's
deck copy, including the junction rows themselves (the probe's own `stored`
flag is a lookup limitation for the three-segment shapes, not a missing row;
the rows are in the deck).

## What was run

    node tools/probe-set-anchor-create.mjs --out tmp/attack2-20261026/probe-set-anchor.json

Exit 0. The probe boots the local stack (127.0.0.1, throwaway self-signed
certificate) over a copy of the source deck, signs the seeded administrator
in, and POSTs every shape through `POST /card/create`. The full report is
committed at `artifacts/probe-set-anchor-rolled-tip.json`.

Measured statuses (the probe's own console lines):

| shape | before the fix (the lane's receipt) | at the rolled tip | stored |
|---|---|---|---|
| `<name>+*right`, type List | 422 | **303** | yes |
| `<name>+*right`, type RichText | 422 | **303** | yes |
| `<name>+*right`, no type | 303 | 303 | yes, as Set |
| `<name>+*right`, type Set | 303 | 303 | yes |
| `<name>+*self`, type List | 422 | **303** | yes |
| `<name>+*self`, no type | 303 | 303 | yes, as Set |
| `<Type>+<name>+*type_plus_right`, type List | 422 | **303** | see below |
| `<Type>+<name>+*type_plus_right`, type Phrase | 422 | **303** | see below |
| `<Type>+<name>+*type_plus_right`, no type | - | **303** | see below |
| `<name>+plain`, type List (the control) | 303 | 303 | yes |
| a simple name, type List | 303 | 303 | yes |

No shape answers 422. The probe's `stored` flag reads false for the three
three-segment shapes; that is the probe's own compound lookup, which composes
two sides and cannot follow a three-segment name.

## The rows themselves, read out of the probe's deck copy

The probe was rerun with `--keep` so its deck copy stayed on disk, and the
copy was queried directly (the source deck is never opened for writing):

- `<name>+*right` (type List): member card `HarnessSetAnchor<stamp>a`, and the
  junction row (no name, as the deck's convention has it) with
  `left_id = the member card`, `right_id = 260` (`*right`).
- `<name>+*right` (type RichText): the same shape, junction row
  `left_id = the member card`, `right_id = 260`.
- `<name>+*self`: junction row `right_id = 264` (`*self`).
- `<name>+*right` (no type, and type Set): junction rows `right_id = 260`.
- `<name>+*self` (no type): junction row `right_id = 264`.
- The three-segment `<Type>+<name>+*type_plus_right`: TWO rows per shape, the
  compound `<Type>+<name>` (for example `left_id = 3` (`RichText`),
  `right_id = the member card`) and then the set junction on top of it
  (`left_id = the compound row`, `right_id = 262`, the `*type plus right`
  set). The rule card stores, exactly as the anchor receipt says.

So every set-anchor create stores its junction, and the fix survived the
roll.

## What was tried that did not break the claim

- The probe's own `stored` flag was not taken at face value: the deck copy
  was queried directly (above), and the rows are there. The flag is a
  limitation of the probe's two-side compound lookup, not a missing row.
- The three-segment shapes were checked against the lane's own known
  residual. The anchor receipt names it: "the rule card stores, but the port
  does not apply a type_plus_right structure rule to the member's render"
  (the P5 `*type_plus_right` set leg). That residual is unchanged: the row
  stores, the structure rule is still not applied to the member's render.
  It is a named remainder in the lane's receipt, not a regression.
- The timing legs the probe also runs were green: the home page 200 in
  372 ms, the junction create form (Search + *right) 200 in 1361 ms, the
  junction create form (Pointer) 200 in 768 ms, the junction edit form 200 in
  1494 ms.

## Not run here

- The whole-run exercise the anchor receipt grades
  (`node tools/edge-signed-in-exercise.mjs --only role-plus-right`, "15 / 15
  checks passed") was not rerun in this lane: it drives a browser against the
  local stack and its C20 and P5 legs need the exercise's own harness. The
  claim under attack here is narrower (the probe, the status, the stored
  row), and the probe is the tool the brief names.

## Artifacts

- `artifacts/probe-set-anchor-rolled-tip.json` - the probe's own report at the
  rolled tip (the sign-in, the eleven shapes with their statuses, locations
  and stored flags, and the four timing legs).
