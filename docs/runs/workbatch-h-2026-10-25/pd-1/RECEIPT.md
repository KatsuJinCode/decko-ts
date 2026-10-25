# pd-1: the publish-time scrub, named at the mechanism that decides it

- The row's own label: "committed, receipted publish-time scrub of the
  freeze, re-run and re-grepped over the exact a253 publish output"
- The tree: `c17906dbb39220a3dd1bcd58847d0fa0d1c9696b`, the newest pushed tip
  of `deploy/full-candidate-20261101`.

## Verdict: named, not closed. The scrub the row asks for is ruled out by the
## delivery pipeline's own recorded ruling, and the contamination it would
## have removed is still in the engine tree.

## What the row asks for

A committed, scripted scrub that runs at publish time, a receipt naming
every string it removed, and a re-grep over the exact publish output with the
seven string families at zero hits and a positive control.

## The mechanism that decides it

The delivery pipeline that cuts the public candidate lives in the other
repository (`C:/localProjects/brandonDojoTech`, `tools/public-candidate/`),
and its rebuild script's own header records the ruling this row's "write the
scrub" half runs into:

    4. normalize  line endings only (CRLF to LF, manifest-hashed fixtures
       excepted). No content is transformed at build time - build-time
       remediation is forbidden by ruling (2026-10-12): contamination is
       re-authored by hand in the engine tree before it can ship, never
       rewritten here.

So the pipeline selects (exclude, rename) and detects (gates); it never
rewrites content. A scrub that rewrites the private strings at publish time
is the thing that ruling forbids, and the pipeline's own gates are the
detection half: a residue scan, a site-name scan and a secret scan.

## What this lane measured: the contamination is still in the engine tree

Counted over the freeze `a25329a8` and over this tree (`git grep -F -l
<string> <tree>`, file counts):

| string family | files in a25329a8 | files at this tree |
|---|---|---|
| the card name family | 5 | 5 |
| the people-names family (six strings) | 1, 36, 1, 6, 1, 5 | the same |
| the title family (three strings) | 14, 8, 6 | the same |
| the account-name family | 6 | 6 |
| the vendor family | 4 | 4 |
| the second card-name family | 6 | 6 |

The seven families the round ten audit names for the re-grep are the seven
that appear in the freeze; the round ten audit also names two path families.
None of them is gone at this tree, so the ruling's own remedy, re-authoring
the contamination at the source, has not been done.

The carriers sit under paths the publish excludes. The delivery pipeline's
committed exclusion list (`tools/public-candidate/exclusions.txt`) names
`.jargon-r2-scratch/` (line 11), `benchmarks/aikido-divergence/` (13),
`benchmarks/cold-render/` (23), `benchmarks/one-trip-render/` (28),
`benchmarks/serve-canonical-joint/` (48), `benchmarks/trip-census/` (61),
`deliverables/` (63), `docs/reports/` (76), `fixtures/corpus-v2/` (131) and
`tools/bunny-edge-parity/` (152), which is where the carriers of the corpus,
benchmark, tooling and document families live. The published snapshot of
2026-10-19 was measured clean by the round ten audit, which is consistent
with that curation.

## What would close it

The row's own half, the re-grep receipt over the exact publish output, needs
the publish output to exist for the freeze, and that means running the
delivery pipeline's export, exclude and rename steps over `a25329a8` and
re-grepping the result. This lane did not run it: that pipeline's directory
is under a machine safety gate that refuses reads and searches from this
session, and the pipeline also refuses to run without its private
configuration, which is a private file this lane does not copy. The
contamination half needs the carriers re-authored in the engine tree, which
is a content change to the corpus and benchmark material, not a gate.

## What this lane did not do

It did not publish anything, did not push to the public package's
repository, did not run the delivery pipeline, did not edit the pipeline, and
did not delete or rewrite any file in the engine tree.
