# Receipt 5: the roll itself, the union-resolved battery file and the three repaired pins

Claim attacked (the new surface the brief names): the roll's own work. Two
things the roll did are attacked here.

1. The union-resolved battery conflict file: `tools/parity-side-effects/scenarios.json`,
   the one file that conflicted across the roll's twenty merges (the roll
   receipt, "The conflict, by region": merge 3, the strict-parity switches
   into the chain). The brief asks for an input where the union resolution
   diverges from both parents.
2. The three stale pins the roll repaired (`1e655ab53`): the two asset-name
   pins and the denial-page pin.

Attacked tree: `deploy/full-candidate-20261103` at `5131d2ac40dacc64c45530941e82937caef86137`.

## Verdict: the union resolution is correct and unique; it is also the one combination that hides a real 18-kilobyte gap. The three repaired pins HOLD.

## Part one: what the union actually resolved

The conflicted step is `admin-create-skin-bad-parent`. Its `deliberate` pin
in the four trees, read out of the file itself:

| tree | `ts.errors` | `strictErases` | the extra `why` sentence |
|---|---|---|---|
| the merge base (`c29e4c3f4`) | `ABORT: not a valid theme Parity Probe Card` | - | - |
| the chain side (`9fc024671^1`, the error-chrome lane) | `not a valid theme Parity Probe Card` | - | "The port refusal page renders the abort message bare ...; the pinned ts errors value is that page's alert text." |
| the merged side (`9fc024671^2`, the strict-parity lane) | `ABORT: not a valid theme Parity Probe Card` | `true` | "DECKO_STRICT_PARITY_SKIN_CREATE_500=on reproduces the crash one for one (the same 500, the same server_error page, nothing stored) ..." |
| the resolution (the rolled tip) | `not a valid theme Parity Probe Card` | `true` | BOTH sentences |

A whole-file comparison over all 87 steps (every step compared as JSON
against both parents) found exactly ONE entry that differs from both parents:
this one. Every other step in the resolved file is byte-identical to one
parent or the other, and no step was added or dropped (87 steps on all four
trees).

## Part two: the constructed input, and what it exposes

The resolution takes the chain side's default-mode value and the merged
side's strict-mode flag. That combination is the only one of the four files
that grades clean in BOTH modes. Measured, with the same comparator and the
same two traces, each file's `scenarios.json` swapped in:

| the `scenarios.json` in use | default mode | strict mode |
|---|---|---|
| the chain side (the error-chrome lane's) | 78 pass / 6 declared / **3 mismatch** | 80 pass / 1 declared / **6 mismatch** |
| the merged side (the strict-parity lane's) | 78 pass / 8 declared / **1 mismatch** | 86 pass / 1 declared / **0 mismatch** |
| the resolution (the rolled tip) | 78 pass / 9 declared / **0 mismatch** | 86 pass / 1 declared / **0 mismatch** |

Each parent alone fails in one mode: the chain side cannot grade the strict
mode (its pin names a difference that strict mode removes), the merged side
cannot grade the default mode (its `ts.errors` still carries the `ABORT: `
prefix the chrome lane removed). The union is the only file that is quiet in
both, and it is quiet in the strict mode in a way that costs the 18
kilobytes.

**The input:** the strict-parity flags on, the step `admin-create-skin-bad-parent`
(or `restore-file-revision`), and a raw-body verdict that honours the same
erasure rule the field verdict already honours. That verdict is one line
(`probes/make-strict-aware-comparator.mjs`):

    if (deliberateOf[name] !== undefined && !(PARITY_STRICT && deliberateOf[name].strictErases === true)) {

With it, the strict-mode table reads:

    RAW BODIES byte-equal 51; slot-equal 31; declared 1; residual 2; raw-mismatch 2
      RAW raw-mismatch restore-file-revision (ruby 18538 / ts 261 bytes)
      RAW raw-mismatch admin-create-skin-bad-parent (ruby 18470 / ts 261 bytes)

The same patched comparator on the default trace is unchanged, so the change
touches the strict mode only.

**Why the shipped comparator misses it.** Its two verdicts disagree about the
erasure rule. The field verdict honours it (`compare.mjs:368`: "if
(`PARITY_STRICT && pin.strictErases === true`) return null"), so a flag case
that still differs in strict mode is graded MISMATCH. The raw-body verdict
does not (`compare.mjs:467`, "if (`deliberateOf[name] !== undefined)"): a
step with a deliberate pin is `declared` whatever the mode, so the default
mode's label covers a difference the default mode no longer has.

**What that means for the resolution.** The resolution's own `why` sentence,
the one the union created and that neither parent had, claims: "DECKO_STRICT_PARITY_SKIN_CREATE_500=on reproduces the crash one for one (the same 500, the same server_error page, nothing stored)". The bytes do not bear that out: the port reproduces the same VIEW, on its own, without the site that renders it (261 bytes against Ruby's 18,470). The union is the combination that makes this invisible, because it is the only one of the four files that is quiet in both modes.

So the answer to the brief's question is: the union resolution does not
diverge from both parents on the field verdict (it is right, and the two
parents are each wrong in one mode), but it does diverge from both parents on
the raw-body verdict in strict mode, and the divergence hides a real
difference: the strict mode's 500 page is 261 bytes where the recorded Ruby
page is 18,470 bytes. Receipt 02 carries the bytes and the code path.

The fixes are small and both are in the comparator, not the engine: make the
raw-body verdict honour the erasure rule (one line, as in the probe), and
either render the strict crash through the page assembly or list the strict
mode's 500 page as a declared divergence with its reader-visibility stated.

## Part three: the three repaired pins

`1e655ab53` repaired two asset-name pins and one denial-page pin, in test
files only. All three suites read green at the rolled tip:

    npx vitest run tests/card/assets/skin-stylesheet.test.ts \
      tests/card/assets/site-script.test.ts tests/exercise/accounts-3.test.ts

3 files, 88 tests passed (52 + 32 + 4). The repair commit recorded "2 files,
84 tests; 1 file, 4 tests", the same 88.

**The asset-name pins.** They now compute the expected slot from the expected
bytes with the engine's own `assetOutputNameSlot`:

    const slot = assetOutputNameSlot(new TextEncoder().encode(siteScript));
    expect((await row(ids.allScriptOutput)).db_content).toBe(`~${ids.allScriptOutput}/${slot}.js`);

The obvious attack is that this pin now agrees with the implementation by
construction. It does not, in the way the attack would need: the engine's
naming RULE lives in `updateAssetOutput` (which chooses the content slot or
the wall clock), and the pin compares the stored name against the CONTENT
slot. A regression of the rule (the engine naming by the clock again) would
make the stored name differ from the expected content slot, and the pin would
fail. What the pin cannot catch is a change inside `assetOutputNameSlot`
itself; that helper's contract is pinned by its own suite, which reads green
here (`npx vitest run tests/card/actions/asset-output-naming.test.ts`, 3 tests
passed): identical bytes give an identical slot, different bytes give a
different slot, the slot is an integer, the default mode stores the content
slot across deploys with different clocks, and the strict mode stores the
wall clock's epoch seconds.

**The denial-page pin.** It changed from asserting the refusal body carries
"actor *anonymous may not create card <name>" to asserting the page carries
the class `card-slot denial-view `. The first reading is that the repair
dropped a content assertion, so the second was checked against the recorded
Ruby: the recording's own 403 page (16,760 bytes, `anon-create-card` in
`reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json`)
carries the `card-slot denial-view` class and the "Sorry!" heading, and does
NOT name the actor. So the old pin asserted text that neither Ruby's page nor
the port's chrome page carries, and the repair was necessary. The message
itself is still graded, by the battery's own message-text comparison: the
403 steps are `slot-equal` against the recording at the rolled tip, message
text included. The other two pins in that test (the card was not created,
the owner's name is absent from the refusal) are untouched.

## Artifacts

- `artifacts/compare-parentchain-default.json`,
  `artifacts/compare-parentchain-strict.json` - the comparator run with the
  chain side's `scenarios.json`.
- `artifacts/compare-parentflags-default.json`,
  `artifacts/compare-parentflags-strict.json` - the comparator run with the
  merged side's `scenarios.json`.
- `artifacts/compare-default.json`, `artifacts/compare-strict.json` - the
  comparator runs with the resolution.
- `artifacts/compare-strict-rawaware.json` - the constructed input (the
  strict-aware raw verdict) on the strict trace.
- `probes/make-strict-aware-comparator.mjs` - the one-line patch that builds
  the constructed input.
