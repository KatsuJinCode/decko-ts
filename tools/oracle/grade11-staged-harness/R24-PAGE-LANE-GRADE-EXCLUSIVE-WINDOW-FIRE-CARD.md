# R-24 page-lane grade — exclusive-window fire card

Prepared by lane `r24prep` on 2026-10-06. **The grade is NOT fired here.** Everything
below is verified so the lead's exclusive window is spent on the run, not on
discovering a refused guard.

- Worktree: `C:/localProjects/decko-ts-lane-r24prep-2026-10-06`
- Branch: `lane-r24-pagegrade-prep-2026-10-06`
- Grade tip: **`7bc63c1cdf1cdf1c264433882eae23b04fe8d2a4`**
  (= `origin/lane-integration-2026-10-06`, verified by `git fetch` + `git rev-parse` on 2026-10-06)
- Prior run of record: grade #11 seam-clean at `da23517d`, view 9,780/10,150,
  page 3,636/6,588.

---

## 1. Inputs — verified, hash-matched

Source corpus tree (the seam-applied copy the grade-11 seam-clean run bound):

```
C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/seamreanchor-work/fresh-corpus-copy/tmp/raw-ground-truth
```

Digests recomputed on 2026-10-06 with `compute-corpus-lane-digests.mjs` (the
designation construction, sorted `name sha256` lines joined by `\n`, trailing `\n`,
sha256 over the whole string):

| input | shards | digest |
|---|---|---|
| `expected-v2/view-lane` | 48 | `8c67d318c1eb105ab341d474328df29a4034b23925263438050ff625bbe2a484` |
| `expected-v2/page-lane` | 48 | `9c85697f63f18dca3e98722967b6c225357f5250e4c7ac8aa4a090edf9e9bb0f` |
| `bench-corpus-raw.sqlite3` | 217,251,840 bytes | `6a44dfdc20ca941e66da6ba08add7f1a5cf35ec1a3ba75cc43a70920e609440e` |

**These three match the grade-11 seam-clean run's recorded values exactly**
(`tmp/grade11/fire-launch-seamclean.log` lines 2-4). The corpus of record has not
drifted. Re-verified after staging, staged copy == source, byte for byte.

### The capture-manifest

The ask named a third input, a **capture-manifest**. **I did not find one that the
grade consumes.** What exists and what I did instead:

- `tools/capture-manifest-provenance.mjs` is a repo tool (present at the grade
  tip) that produces a manifest from a capture; it is not read by
  `run-grade11-fire.sh` or by `dual-lane-direct-driver.mjs`.
- The harness's real third input is `bench-corpus-raw.sqlite3`, whose sha256 is
  tabulated above. That is the input that has a digest of record and that Guard 1
  refuses without.
- Files matching `*manifest*` under `tmp/wrong-goal-hunt/` are transform
  manifests for the denied-seam and close-71 corpus rewrites
  (`asset-host-transform-manifest.json` and kin), not grade inputs.

If the lead has a specific capture-manifest file in mind, name it and this card
gains a fourth verified row; I am not going to name one that the grade never
reads.

---

## 2. Guards — all five verified green BEFORE the window

Every guard in `run-grade11-fire.sh` was executed individually against the staged
copy in this worktree. None fired.

| guard | what it refuses | result on 2026-10-06 |
|---|---|---|
| 1 | corpus shape: 48+48 shards + bench deck | **PASS** — 48 view, 48 page, bench present |
| 2 | `FOLD_TIP` is a commit in the repo | **PASS** — `git cat-file -e 7bc63c1c^{commit}` resolves |
| 3 | `HEAD == FOLD_TIP`, or ancestor with zero `src tests benchmarks` diff | **PASS** — see §5; HEAD is the prep commit, one tools-only commit above `7bc63c1c`, `git diff --name-only 7bc63c1c HEAD -- src tests benchmarks` is empty |
| 4 | staged copy digests == source digests | **PASS** — recomputed both sides, identical |
| 4b | zero stale denied-seam forms, zero `http://s3.amazonaws.com//files/` carriers | **PASS** — census `staleOccurrences: 0`, `contextGuardFailures: 0`; `grep -rlF` over both staged lanes returns nothing |
| 5 | artifacts dir empty | **PASS** — `tmp/grade11/full-canvas-*` does not exist |

**The corpus is already staged** at `tmp/raw-ground-truth/` in this worktree
(532 MB). Guard 4's `cp -r` re-copies and re-verifies at fire time anyway; the
staging here exists so a corpus-shape refusal cannot eat the window.

---

## 3. Divergence class table — the 2,952 page-lane failures

Produced by `tools/oracle/grade11-staged-harness/classify-page-lane-failures.mjs`
from the grade-11 seam-clean aggregate. Re-runnable:

```
node tools/oracle/grade11-staged-harness/classify-page-lane-failures.mjs \
  C:/localProjects/decko-ts-lane-grade11-2026-10-05/tmp/grade11/full-canvas-da23517d3ac1ec40f6737203fb7c068e0fe21678-w1-grade11-seamclean/w0-aggregate.json \
  --corpus <raw-ground-truth> --json tmp/grade11-prep/divergence-class-table.json
```

### Raw signature histogram (exact, all 2,952)

| signature | count |
|---|---|
| `byte-diff` | 2,776 |
| `capture_error_still_raised:RuntimeError` | 114 |
| `capture_error_still_raised:NoMethodError` | 56 |
| `permission_denied_mismatch` | 6 |

Capture-error texts (the 172 `errorLines`):

| text | count |
|---|---|
| `CAPTURE_ERROR: RuntimeError: Card.fetch returned nil` | 114 |
| `CAPTURE_ERROR: NoMethodError: undefined method 'year' for an instance of String` | 55 |
| `CAPTURE_ERROR: NoMethodError: undefined method 'map' for an instance of Symbol` | 1 |
| `CAPTURE_ERROR: Card::Error::UserError: unknown layout card: give_twenty_main_layout` | 1 |
| `CAPTURE_ERROR: Card::Error::UserError: unknown layout card: m_paula_layout01` | 1 |

### The class table

| class | n | % of 2,952 | evidence |
|---|---|---|---|
| **stale-capture** | 2,555 | 86.6% | two distinct mechanisms, both read off the corpus's own bytes (below) |
| **needs-fresh-render** | 170 | 5.8% | the capture itself raised; there are no comparable bytes |
| **comparison-layer** | 6 | 0.2% | `permission_denied_mismatch` — expectation pins a denial form the graded path no longer produces |
| **engine-defect** | 0 | 0% | no failure met the rule |
| **UNCLASSIFIED** | 221 | 7.5% | no evidence rule matched; left unclassified rather than guessed |

### Class A — stale-capture, 2,540 pages (the dominant one)

Hand-verified on 6 of 6 sampled pages (`20120705+BW+RVW`, `20120709/10/11/12+BW+Time Tracking`,
`20120713+BW+RVW`).

At the first differing byte the engine appends a `SELF-<slug>` class token to the
slot's class list and swaps `data-card-name` for `data-card-id`:

```
expected: ... TYPE_PLUS_RIGHT-rich_text-rvw" data-card-name="20120705+BW+RVW" data-card-type-id="3" ...
actual:   ... TYPE_PLUS_RIGHT-rich_text-rvw SELF-20120705-bw-rvw" data-card-id="13398" ...
```

The `SELF-<slug>` string **is** present in the expectation — about 125 bytes
earlier on the same page (offsets 6,138 / 6,148 vs diff at 6,263 / 6,303). So this
is the same token at a different position, plus a name-vs-id identity change.

**Mechanism.** The only `SELF-` class emitter in `src` is
`src/card/mod-loader/mods/card-mod-edit.ts:2992-2996`, and it appends the token
**conditionally**:

```ts
const setRecord = fmt.engine.fetchRenderCard(setName);
const setKeys = "ALL ALL_PLUS TYPE-set RSTAR RIGHT-Xself TYPE_PLUS_RIGHT-rich_text-Xself" +
  (setRecord !== undefined ? ` SELF-${setRecord.name.safeKey}` : "");
...
(setRecord !== undefined && setRecord.id !== undefined ? ` data-card-id="${setRecord.id}"` : "")
```

with the branch documented at `:2981-2984`: *"when the self-set card EXISTS …
the captured class carries the set card's own set-keys extra … and the data-card-id;
Basics' set card is fetched NEW (no id, the base keys only)."* Both the class
token and the `data-card-id` move together on that one condition — which is
exactly the paired difference observed.

The graded bench deck resolves the row; the expectation pins the no-row branch.
Verified by read-only query against `bench-corpus-raw.sqlite3`:

```
card_references: '20120705+bw+rvw' -> referee_id 13398   (cards.id 13398 exists, type_id 3)
```

⇒ **the expectation is pinned to an older deck state and the graded deck has moved.**

**Residual uncertainty, stated rather than papered over:** I proved the sole
`SELF-` emitter is deck-state-gated and that the graded deck has the row, but I did
**not** prove this specific slot is rendered through that emitter — its class list
ends `-rvw`, while that emitter hardcodes `-Xself`. Closing that gap is a named
next step, not a finished claim.

### Class B — stale-capture, self-contradicting expectation, 39 pages

First difference `expected "d" but got "t"`, i.e. the expectation's bytes render
`denial-view` and the engine rendered `titled-view`. Hand-checked 6 of 6
(`201006-07 vacation in Oregon+*self`, `20101027 Sono 01+*self`,
`BW 20110428+*self`, `20101125-28 vacation in Oregon+*self`, `BW 20100717 Sat+*self`,
`BW 20110918-19+Narrative+*self`): every one carries
`layout_main_view = {"effective":"titled","raw":"titled"}` **in the corpus's own
metadata**, while the corpus's own `page_html` says `denial-view`.

**The engine agrees with the expectation's metadata and disagrees with the
expectation's bytes.** No engine change closes that; the expectation contradicts
itself and must be re-cut.

### Class C — needs-fresh-render, 170 pages

`Card.fetch returned nil` (114), `undefined method 'year' for a String` (55), and
one `undefined method 'map' for a Symbol`. The capture raised, so there are no
bytes to compare. `unknown layout card: give_twenty_main_layout` /
`m_paula_layout01` (2 of these) name layouts the engine does not know — the
corpus's own layout census lists `GiveTwentyMainLayout` and `MsPaulaLayout01`
under different keys, so those two are a naming mismatch, not a missing feature.

### Class D — comparison-layer, 6 pages

`permission_denied_mismatch`.

### Class E — UNCLASSIFIED, 221 pages

The remaining byte-diffs outside the two named first-difference shapes
(`"3" -> "5"` 51, `"0" -> "1"` 33, `"8" -> "1"` 20, `"d" -> "s"` 18, …). **Not
classified.** Their per-entry failure records and first-difference shapes are in
`classSamples` in the JSON output for hand review.

---

## 4. Duration at W=6 — projection, NOT a measurement

**No W=6 measurement exists at this tip. Do not quote a W=6 number as measured.**

The two same-canvas points on record:

| workers | tip | wall | entries | source |
|---|---|---|---|---|
| 1 | `da23517d` (grade-11 seam-clean) | **6,950.4 s = 115.8 min** | 16,738 | `full-canvas-...-seamclean.log`, `WALL 6950.4s workers=1` |
| 8 | `814b3bd` (older) | 1,497.7 s = 25.0 min | 16,862 | `tmp/wrong-goal-hunt/w8-scaling-probe-lane.md` |

They are **different tips and different corpora**, so the W=1→W=8 ratio is not a
valid scale factor at `7bc63c1c` — the seat merge, driftfix and warmflood work all
landed after `814b3bd`. The W=8 receipt also records, in its own words, that the
divide-by-W projection it tested came out **31% optimistic in wall time**, and
that 68.9%/81.6% "are not a measured speedup curve."

Projection at W=6, from the W=1 measurement at this tip, banded by those two
efficiency figures:

| model | arithmetic | W=6 wall |
|---|---|---|
| naive divide | 6,950.4 / 6 | 1,158 s ≈ **19 min** |
| at the W=8 receipt's 1.45× optimism correction | 1,158 × 1.45 | 1,680 s ≈ **28 min** |
| at the W=8 receipt's 82% own-compute efficiency | 1,158 / 0.82 | 1,412 s ≈ **24 min** |

**Hold the window for 45 minutes at W=6.** That is ~1.6× the pessimistic bound of
the band, and still less than half the 115.8 min the only measured point takes.

**Recommendation:** fire at **W=6**. The window is the scarce resource and is held
once; even the optimistic end of the band returns ~4× the window. Fire at **W=1**
only if the lead needs a number with a measurement behind it — then hold 2.5 h.

---

## 5. Fire card

### 5a. Environment

```bash
export GRADE_REPO='C:/localProjects/decko-ts-lane-r24prep-2026-10-06'
export FRESH_CORPUS_PATH='C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/seamreanchor-work/fresh-corpus-copy/tmp/raw-ground-truth'
export FOLD_TIP='7bc63c1cdf1cdf1c264433882eae23b04fe8d2a4'
export WORKERS=6
export RUN_SUFFIX='-r24'
```

`GRADE_REPO` and `WORKERS` are the two names this lane added to
`run-grade11-fire.sh`; the grade-11 copy hardcoded its own worktree path and
`--workers 1`, so neither an arbitrary worktree nor any worker count could fire
from it. `FOLD_TIP` stays the engine tip — **not** the prep commit — and Guard 3
passes because the prep commit touches `tools/` only
(`git diff --name-only 7bc63c1c HEAD -- src tests benchmarks` is empty).

### 5b. Broadcast the hold — send this before firing

> **EXCLUSIVE WINDOW — page-lane grade R24.** Worktree
> `C:/localProjects/decko-ts-lane-r24prep-2026-10-06`, tip `7bc63c1c`. Starting
> now, **45 minutes**. Do not `git checkout`, re-point, or re-stage that worktree,
> and do not touch `tmp/raw-ground-truth/` or `tmp/grade11/` in it — the run reads
> both. Other lanes continue; nothing else needs this worktree. Release when the
> log prints `GRADE11-DONE` and `COVERAGE-VERDICT`.

### 5c. Fire — DETACHED, one command

An attached run is reaped at the 600 s tool limit mid-render (grade-9 step-18
lesson, recorded in the harness header). Fire detached:

```bash
cd "$GRADE_REPO" && nohup bash tools/oracle/grade11-staged-harness/run-grade11-fire.sh fire \
  > tmp/grade11-prep/fire-launch-r24.log 2>&1 &
```

Then watch:

```bash
tail -f "$GRADE_REPO/tmp/grade11-prep/fire-launch-r24.log"
```

### 5d. Acceptance — run this after `GRADE11-DONE`

```bash
cd "$GRADE_REPO" && node tools/oracle/grade11-staged-harness/parse-grade11-coverage.mjs \
  "tmp/grade11/full-canvas-7bc63c1cdf1cdf1c264433882eae23b04fe8d2a4-w6-grade11-r24.log" \
  --expect-total 16738 --expect-malformed 0
```

**The grade is ACCEPTED when that prints `COVERAGE-VERDICT view=10150 page=6588 PASS`.**

`driver_exit=1` is **not** a failure of the run and **not** a reason to re-fire.
The driver's zero-tolerance gate throws after the aggregates are written, by
design, because fails are present — grade-11 seam-clean ended `driver_exit=1` with
a complete, valid result. Coverage is the gate.

### 5e. Then classify the new run

```bash
node tools/oracle/grade11-staged-harness/classify-page-lane-failures.mjs \
  "tmp/grade11/full-canvas-7bc63c1c...-w6-grade11-r24/w0-aggregate.json" \
  --corpus tmp/raw-ground-truth \
  --json tmp/grade11-prep/divergence-class-table-r24.json
```

Compare the class table against §3. The single number that decides whether
`7bc63c1c` moved the page lane is the **stale-capture** count: it was **2,555**
at `da23517d`. Any other class moving is a separate story.

---

## 6. Gates run by this lane (2026-10-06)

| gate | command | result |
|---|---|---|
| typecheck | `./node_modules/.bin/tsc --noEmit` | **0** — exit 0, 221 `src/` files in `--listFiles` |
| test suites | **not run** — this lane changed `tools/` only (`git diff --name-only 7bc63c1c HEAD -- src tests benchmarks` empty) | not run, see the result line |
| corpus digest | `compute-corpus-lane-digests.mjs` on source and staged | match, §1 |
| harness syntax | `bash -n run-grade11-fire.sh` | OK |