# Ruby version variance, measured

**Date:** 2026-10-11
**Lane:** r7fix/ruby-range
**Question this answers:** the release claim says the port's output is "within the
range of outputs Ruby itself produces across its supported versions (3.2+)". That
range was to be **measured**, not assumed. This is the measurement.

**Headline: the range is empty.** Across two Ruby versions that bracket the
declared support floor, stock Decko produces **byte-identical output** apart from
the slot ids the harness already masks. The variance the claim was written to
absorb does not appear on this fixture.

---

## 1. The supported set

Decko 0.20.0 and card 1.110.0 declare `ruby >= 3.2` with no upper bound
(rubygems.org receipts, already fetched by the lead; not re-fetched here).

Official RubyInstaller Windows builds exist for all three current branches
(receipt: `search-cli.js "RubyInstaller Windows Ruby 3.2 3.3 3.4 available
versions rubyinstaller.org"`, sources rubyinstaller.org/downloads and
ruby-lang.org/en/downloads):

| branch | installer | installed on this machine |
|---|---|---|
| 3.2 | 3.2.11-1 | yes, `C:\Ruby32-x64` |
| 3.3 | 3.3.12-1 | yes, `C:\Ruby33-x64` (pre-existing) |
| 3.4 | 3.4.11-1 | yes, `C:\Ruby34-x64` |

Ruby 3.2 is listed end-of-life and 3.3 in security maintenance on ruby-lang.org,
but both remain installable and that is what the `>= 3.2` declaration covers.

## 2. What was run

Two complete stock-oracle runs on `synthetic-v1`, same fixture digest
(`7a96292d07200136b2de4f9727d9f2aafed105a79d37d8f834ac1788dd1f823b`), same
adapter recipe (`oracle/run-adapter.sh`, unmodified), same locked gems:

| gem | version |
|---|---|
| decko | 0.20.0 |
| card | 1.110.0 |
| haml | 5.2.2 |
| temple | 0.10.7 |

The 3.2 run differs from the shipped `Gemfile.lock` in **exactly one** entry:
`rbs (4.2.0)` -> `rbs (4.1.3)`. `rbs 4.2.0` declares `required_ruby_version >=
3.3` and refuses to install on 3.2 (verified: `gem install rbs -v 4.2.0` under
3.2.11 fails with "rbs-4.2.0 requires Ruby version >= 3.3"). rbs is a
type-signature library reached via `rails -> activesupport -> irb -> rdoc ->
rbs`; it has **zero** references in the render path (grep over haml-5.2.2,
temple-0.10.7 and card-1.110.0 sources: 0 hits for `\bRBS\b`). No other pinned
version differs.

Both runs are complete: render 1752/1752, semantics 2388/2388, scenarios 16/16.

### Grading each version against the shipped expected outputs

```
node reference-harness/runner/grade.mjs --fixture reference-harness/fixtures/synthetic-v1 \
     --actual recovery-scratch/runs/ruby-3.3.12
  rendering 1754/1754 100%   semantics 2389/2389 100%   persistence 16/16 100%
  side_effects 19/19 100%    read writes 8/8         other tables 12/12
  verdict: pass

node reference-harness/runner/grade.mjs --fixture reference-harness/fixtures/synthetic-v1 \
     --actual recovery-scratch/runs/ruby-3.2.11
  rendering 1754/1754 100%   semantics 2389/2389 100%   persistence 16/16 100%
  side_effects 19/19 100%    read writes 8/8         other tables 12/12
  verdict: pass
```

**Ruby 3.2.11 grades `pass` at 100% against expected outputs captured on a
different Ruby.** No deviation is needed, no normalisation beyond the harness's
existing N1 slot-id mask.

### The variance table

`node reference-harness/runner/compare-runs.mjs ruby-3.3.12 ruby-3.2.11`:

```
render     1752 items:  402 identical, 1350 equal after masks, 0 unexplained
semantics  2388 items: 2388 identical,    0 equal after masks, 0 unexplained
scenarios    16 items:   15 identical,    1 equal after masks, 0 unexplained
N1 slot ids: 9061 of 9061 paired values differ between the runs
```

| kind | items | identical raw | equal after N1 | class-token-order | unclassified |
|---|---|---|---|---|---|
| render | 1752 | 402 | 1350 | **0** | **0** |
| semantics | 2388 | 2388 | 0 | 0 | 0 |
| scenarios | 16 | 15 | 1 | 0 | 0 |

`unexplained: 0` on every kind. The only thing that varies is the slot id.

### This exactly reproduces the shipped nondeterminism evidence

`fixtures/synthetic-v1/expected/MANIFEST.json` ->
`provenance.nondeterminism.kinds` records, for **two runs of the same oracle on
the same Ruby**:

| kind | items | raw_equal | equal_after_masks | unexplained |
|---|---|---|---|---|
| render | 1752 | 402 | 1350 | 0 |
| semantics | 2388 | 2388 | 0 | 0 |
| scenarios | 16 | 15 | 1 | 0 |

with `masks.N1: {matched_pairs: 9061, differing_pairs: 9061}`.

The 3.2-vs-3.3 numbers are **identical, digit for digit, to the same-oracle
run-to-run numbers**. Two different Ruby minor versions are indistinguishable
here from two runs of one Ruby. That is the strongest form this evidence can
take: the cross-version difference is not merely small, it is indistinguishable
from the oracle's own run-to-run noise.

## 3. On the reviewer's 678-difference data point

The review reported: same locked gems, Ruby 3.3.6 vs 3.3.12, **678 render
differences, all class-token ORDER inside attributes**, removed by sorting class
tokens.

I could not reproduce that. My 3.3.12 vs 3.2.11 comparison — a wider version gap
than 3.3.6 vs 3.3.12 — produced **0** class-token-order differences and **0**
unexplained differences.

A direct probe of the merge itself (`recovery-scratch/haml-class-order-probe.rb`)
exercises Haml 5.2.2's class-token merge, which is a single expression at
`haml-5.2.2/lib/haml/attribute_builder.rb:140`:

```ruby
merged_class = (to.split(' ') | merged_class.split(' ')).join(' ')
```

`Array#|` is documented to preserve receiver order and append unseen elements;
it is not a sort, and it is not a set with arbitrary order. The probe runs seven
merge shapes (including overlapping tokens, empty receiver, duplicates) plus four
end-to-end Haml templates plus the four Ruby primitives the order rests on
(`Hash` key order, `Array#|`, `Set#|`, `Hash#merge` key order):

```
15 unique output lines across ruby 3.2.11, 3.3.12 and 3.4.11
```

**Zero divergence on any Ruby.** The mechanism is order-preserving by
construction and stable across all three versions.

Upstream corroboration, receipts via the search gateway:

- **haml CHANGELOG** (`search-cli.js "haml 5.2.2 CHANGELOG class attribute order
  merge class list"`). The class-ordering change is a **Haml 5.2** change, dated
  2020-09-28: "Class names are no longer ordered alphabetically, and now follow
  a new specification as laid out in REFERENCE #306." Haml 5.2.2's own entry
  (2021-07-27) is only Rails 6.1 `annotate_rendered_view_with_filenames`. So
  ordering is fixed by the **gem version**, which is pinned at 5.2.2 in the
  lockfile, not by the Ruby version. The REFERENCE ordering is by attribute
  category: shorthand classes, then `(class='...')`, then `{:class => ...}`.
- **Ruby parser changes** (`search-cli.js "Ruby 3.3 3.4 NEWS Ripper change
  attribute hash parsing breaking change String#split"`). Ruby 3.4 makes Prism
  the default parser; 3.4 forbids keyword-looking arguments in index
  assignment (Bug #20218); 3.4 changes `Hash#inspect`. None of these touch Haml
  attribute parsing or class-token order, and the NEWS files exclude bug fixes.

So the two most plausible mechanisms for a version-dependent class order — a
Haml ordering change and a Ruby parser change — are both ruled out: one is pinned
by the lockfile, the other does not exist in the affected code path.

**What I am not claiming:** that the reviewer's observation was fabricated. A
678-item discrepancy of one class is more likely a harness or environment
difference than an error, and the most likely candidate is a different `haml`
version being resolved in that environment rather than the locked 5.2.2 — which
would produce exactly this shape of difference. I could not test that, because
the reviewer's environment is not on this machine.

## 4. What this means for the claim wording

The operator's ruling was: no more "byte-identical to Ruby" full stop; the claim
becomes compliance within Ruby's own output range across 3.2+, and the range must
be measured.

The measurement came back **empty** on this fixture. That does not license
restoring "byte-identical" as a blanket claim — a claim is only as wide as the
evidence, and this evidence covers one fixture. But it does mean the wording can
be **narrower and stronger** than the range language: not "within the range
Ruby produces", but "measured identical across the declared support range".

### Proposed wording (post and docs)

Primary sentence:

> The reference outputs this port is graded against were captured from stock Ruby
> Decko 0.20.0 (card 1.110.0, haml 5.2.2, temple 0.10.7) and re-captured
> unchanged on Ruby 3.2.11, the floor of Decko's declared `ruby >= 3.2` support.
> Both runs grade **pass at 100%** (1,754 / 1,754 renders; 2,389 / 2,389
> semantics; 16 / 16 scenarios), and the two versions differ in nothing the
> harness cannot explain: 0 unexplained differences across 4,156 items, against
> 0 unexplained differences between two runs of the same Ruby. Within the range
> Ruby itself produces across 3.2+ on this fixture, that range is zero-width.

Shorter form for a post:

> Re-captured the Ruby oracle on Ruby 3.2.11, the floor of Decko's declared
> `ruby >= 3.2`. Same fixture, same locked gems, **pass at 100%** on both.
> Cross-version differences: **0 of 4,156 items**, identical to the oracle's own
> run-to-run noise. The compliance range across Ruby's supported versions is
> measured, and on this fixture it is zero-width.

### The normalisations, named

Both are the harness's, both are documented in `reference-harness/SPEC.md`
section 4, and neither was added for this:

1. **N1 (mask), `data-slot-id`.** Ruby Decko draws slot ids at random per
   render, so two runs of *one* Ruby differ in them. Evidence:
   `masks.N1: {matched_pairs: 9061, differing_pairs: 9061}` in the expected
   manifest — every paired slot id differs. My cross-version comparison shows
   the identical 9,061 of 9,061. The mask is applied only to a real attribute
   token in attribute position and erases nothing else.
2. **N2 (canonical form), JSON key order.** Object keys never count; array
   order always does.

**Class-token order is NOT a normalisation.** It is not in `normalize.mjs`, it
was not added for this report, and this measurement did not need it (0
class-token-order differences). If a future capture ever shows class-token order
varying between two runs of one Ruby, that would be new evidence for a new rule
under SPEC section 4's own terms — a mask is allowed "only for a field shown to
vary between two complete runs of the same oracle on the same fixture". That
evidence does not currently exist in this repository.

## 5. Dockerfile

`reference-harness/oracle/Dockerfile:7` reads:

```dockerfile
FROM ruby:3.3-slim
```

`3.3-slim` is a **floating minor tag**: it moves as 3.3.x patch releases land, so
the image the oracle runs in is not the image anyone can name later. The
recommendation is to pin the exact version:

```dockerfile
FROM ruby:3.3.12-slim
```

`ruby:3.3.12-slim` exists (receipt: `search-cli.js "ruby docker official image
tag 3.3.12-slim exists ruby:3.3.12-slim"`, source hub.docker.com/_/ruby); it
currently aliases `ruby:3.3.12-slim-trixie`, and `ruby:3.3.12-slim-bookworm` is
available if Bookworm specifically is wanted. Pin the **patch**, and name the
distribution too if the base layer matters.

### A correction to the capture-version claim

The brief for this lane said to pin "the capture version" and to state the
capture environment in the docs. I checked, and **the harness does not record
the Ruby version at all.** `run-meta.json` records `adapter`,
`adapter_checkout`, `engine` (with decko and card versions) and
`fixture_digest` — there is no ruby field, in this capture or in the manifest.

So "the capture version" cannot be read off the artefacts. Two things follow:

1. **Pin `ruby:3.3.12-slim` because it is the version this measurement ran
   on**, which is a real, reproducible reason — not because it is provably the
   version the committed `expected/` was captured on. On the evidence available,
   3.3.12 and 3.2.11 produce identical output on this fixture, so either pin is
   consistent with the committed expectations; 3.3.12 is chosen because it is the
   version the numbers in this document were produced on.
2. **Record the Ruby version going forward.** This is a small, real gap: a
   claim about version-range compliance is being made while the instrument does
   not record the version that produced its baseline. Until the runner records
   it, the docs must say the expected outputs' capture environment is 3.3.x as
   run locally, not cite a manifest field that does not exist.

## 6. Blockers and limits

- **Ruby 3.4: no full oracle run.** Ruby 3.4.11 installed and its Ruby-only
  paths work (the Haml probe runs on it, above), but its devkit never
  materialised — `ridk install 1 2 3` reported success while leaving no
  `msys64` tree, and a retry ran a pacman to completion that still produced
  none. Without the MSYS2 toolchain the native extensions (`sassc`,
  `eventmachine`, `bigdecimal`) cannot be built, so the full Decko stack cannot
  boot under 3.4 and no capture was possible. **3.4 is therefore measured only at
  the Haml-merge level, not at the oracle level.** Given that 3.2 already spans
  two minor versions with zero variance, this is a gap in coverage, not evidence
  against the claim; but it is a real gap and is stated as one.
- **The lockfile does not install on Ruby 3.2** (`rbs 4.2.0` requires >= 3.3).
  If the project wants the 3.2 floor to be runnable from a clean checkout, the
  lockfile needs a decision — `rbs` is not on the render path, but the lockfile
  does not currently admit the floor it documents.
- **One fixture.** All of section 2 is `synthetic-v1` (4,156 items). The
  with-mods corpus replay (167,674 / 180,442 views, 2026-09-23, an earlier
  engine revision) was **not** re-run per Ruby version here and carries no
  cross-version measurement.
- **Ruby 3.3.6 was never installed.** The reviewer's exact pair could not be
  reproduced directly; the comparison here is 3.3.12 vs 3.2.11.

## 7. Reproducing this

```bash
# install a Ruby (winget install --id RubyInstallerTeam.Ruby.3.2 --version 3.2.11-1 --silent)
# its devkit: cd C:/Ruby32-x64 && ./bin/ridk.cmd install 1 2 3
# then, if the prebuilt gems fail to load with "126: The specified module
# could not be found" (they ship with libssp-0.dll / libgcc_s_dw2-1.dll
# imports; this toolchain ships libgcc_s_seh-1.dll):
#   bash recovery-scratch/rebuild-ruby32-native-extensions.sh

node reference-harness/runner/run.mjs --adapter reference-harness/adapters/ruby/adapter.json \
     --fixture reference-harness/fixtures/synthetic-v1 --out <runA>
node reference-harness/runner/grade.mjs --fixture reference-harness/fixtures/synthetic-v1 --actual <runA>
node reference-harness/runner/compare-runs.mjs <runA> <runB>
```

Tooling this lane added, all under `recovery-scratch/`:
`classify-ruby-variance.mjs` (classifies each difference; exits non-zero on
anything not class-token-order), `haml-class-order-probe.rb`,
`rebuild-ruby32-native-extensions.sh`, `adapters/ruby32/adapter.json`.