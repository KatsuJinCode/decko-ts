# pd-4: the mod-compatibility figure, regenerated on the tree this branch ships

- The row's own label: "mod-compat figures regenerated on the exact publish
  tree and stated with the 'missing cannot occur by construction' caveat"
- The instrument: `tools/compat-report/generate-mod-compat-report.mjs`
- Command:
  `GEM_HOME=C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0 node tools/compat-report/generate-mod-compat-report.mjs`
  (exit 0, on the tree this branch ships)
- Capture:
  `fixtures/captured/promised-deliverable-workbatch-h-20261025/pd-4-mod-compat-figure.json`
- The tree the figure was measured on: commit
  `c17906dbb39220a3dd1bcd58847d0fa0d1c9696b`, the newest pushed tip of
  `deploy/full-candidate-20261101`, which is the tip this branch starts from.

## Verdict: the figure is regenerated and landed

The report in the tree was generated on 2026-10-15 and did not reproduce on the
tree the tree now ships. It is regenerated here, the figure is measured, and
the caveat is re-derived on this tree rather than carried over.

## The figure

| | committed report (2026-10-15) | this regeneration (2026-10-25) |
|---|---|---|
| mods scanned | 33 | **35** |
| declared-complete | 31 | **31** |
| partial | 1 | **3** |
| missing | 0 | **0** |
| ignored | 1 | **1** |

The three partial mods are `card-mod-ace_editor-0.20.0`,
`card-mod-monkey-0.20.0` and `card-mod-platypus-0.20.0`. The one ignored mod
is `card-mod-defaults-0.20.0`.

The difference between the two columns is two gems, not a change in the port:
`card-mod-monkey-0.20.0` and `card-mod-platypus-0.20.0` are installed in the
pinned gem home now and were not when the committed report was generated, and
both land on `partial`. No mod changed status.

## The caveat, re-derived on this tree

"Missing cannot occur by construction" is not a run result. It is a property
of the ladder in `generate-mod-compat-report.mjs`, and it was re-derived on
this regeneration:

- The ladder (`generate-mod-compat-report.mjs:805-825`) takes the `partial`
  arm before the `missing` fallthrough when the mod has a `set/` tree whose
  patterns are all implemented, because `patternsCoverage` is then 100.
- 32 of the 35 scanned mods have a `set/` tree, and every one of those 32
  scores `patternsCoverage` 100 in this report. Checked mod by mod, not
  sampled.
- The three mods without a `set/` tree never reach the ladder:
  `card-mod-defaults-0.20.0` is returned by the `LEGACY_MODS` gate,
  `card-mod-delayed_job-0.20.0` by the `BACKEND_PORTS` gate, and
  `card-mod-platypus-0.20.0` has `lib/` ruby, so it takes the `partial` arm
  on `libRbFiles > 0`.
- No installed gem has the shape that the `missing` arm needs: no `set/` tree,
  no `lib/` ruby, and a manifest without byte pins.

So `missing: 0` holds for all 35 scanned mods by construction, and the figure
above is 35 scanned / 31 declared-complete / 3 partial / 0 missing / 1 ignored.

## What the labels do not measure

The labels are declaration level, per
`docs/decisions/0004-mods-compiled-into-the-view-registry.md`: a name present
in the view table, a manifest present in the loader, pins for the views they
render. They do not measure executable behaviour, event hooks, or non-html
formats. The behavioural verdict in the same report is the answer to "how much
of this renders like Ruby": 3 of 34 evaluated mods are behaviour-complete,
378 of 565 declared views are graded byte-identical to Ruby's captured answer
and 178 are graded and differ.

## Where the figure travels

- The regenerated `tools/compat-report/mod-compat-report.json` and
  `tools/compat-report/mod-compat-report.md` are in this commit, so the
  figure in the tree and the figure quoted anywhere agree.
- The private read-ledger and the post draft live in the other repository
  (`C:/localProjects/brandonDojoTech`, `recovery/release/public/`). The
  read-ledger's compat row and the post's paragraph are updated there in the
  same turn, with the figure, the caveat and the tree it was measured on.

## What this lane did not do

It did not publish anything, did not touch a hosted edge, did not change any
port source, and did not change the generator's thresholds.
