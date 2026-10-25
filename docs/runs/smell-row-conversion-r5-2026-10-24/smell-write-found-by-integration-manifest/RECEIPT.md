# smell-write-found-by-integration-manifest

- The row's own label: `smell/probe script write-found-by-integration-manifest.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/write-found-by-integration-manifest.mjs`
- What this lane did: ran the row's own instrument against a copy of the evidence tree,
  and checked the instrument's own inputs and gates one at a time.
- Commands:
  - `node write-found-by-integration-manifest.mjs`, run from
    `tmp/smell-r5/probe-found-by/` in this lane's tree, which holds a copy of the
    instrument and copies of the four inputs it reads. Exit code 1, with
    `Error: ENOENT: no such file or directory, open
    'C:\localProjects\decko-edge-verification-b00a4503\.runtime\private-cql-6f960810-bundle\bunny-edge-engine.bundle.js'`.
  - `node tools/smell-row-r5/distill-found-by-manifest.mjs C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018 fixtures/captured/smell-row-r5-2026-10-24/write-found-by-integration-manifest.json`
    (`inputs 4/4, gates 9/10; failing: the pinned bundle is the one the scoped run measured`)
- Evidence: `fixtures/captured/smell-row-r5-2026-10-24/write-found-by-integration-manifest.json`.
- Pin: `tests/server/smell-write-found-by-integration-manifest-parity.test.ts`.

## Verdict: WORKING ON IT

The instrument got past every one of its own evidence gates and stopped on its last
input.

| input | present |
|---|---|
| `found-by-real-deck-equivalence-r2/receipt.json` | yes |
| `scoped-layout-6f960810-r2/completed.json` | yes |
| `scoped-layout-6f960810-r2/report.md.json` | yes |
| `found-by-type-id-correctness.log` | yes |

| gate | holds |
|---|---|
| the equivalence run passed | yes |
| the equivalence run left the source clean | yes |
| the equivalence run left the input unchanged | yes |
| the old and new CQL module differ | yes |
| the scoped run passed every check (4 of 4) | yes |
| the scoped run left the source clean | yes |
| the scoped run left the deck unchanged | yes |
| the correctness gate reports 5954 passed | yes |
| the correctness gate reports no failures | yes |
| the pinned bundle is the one the scoped run measured | no |

## What changed since the last measurement of this row

The 2026-10-23 round left this row open with the gap "the bundle the manifest hashes and
the two sibling evidence directories it reads are artifacts that are not on this
machine". Two of the four inputs are on this machine now: the scoped-layout run's
completion and report, and the real-deck equivalence receipt. The instrument now reads
all four inputs, passes all nine evidence gates, and stops only on the pinned bundle.
The remaining input is a build output of the pinned source, not captured evidence.

## The gap, in one mechanism sentence

The manifest cannot be written because the pinned bundle the scoped run measured, a
build output of the pinned `6f960810` source, is not on this machine, and the
instrument refuses to write a manifest that does not hash to the bundle the scoped run
measured.

## What would close it

The pinned bundle, rebuilt byte-exact at the pinned source. The 2026-10-20
dependency-restoration lane recorded the recipe and the hash it reached, in
`C:/localProjects/brandonDojoTech/tmp/smell-dep-restore-20261020/verdicts.json`:
`node tools/bundle-bunny-edge-engine.mjs --out-dir` at `6f960810`, written to
`.runtime/private-cql-6f960810-bundle/`, sha256
`ea2e31d4f216657702c5cdee2d735afe1407a6a9f47d09dbe9d952c8e0ae4b93`, matching the
`bundleSha256` in `scoped-layout-6f960810-r2/completed.json`. That checkout path was
being restored by another lane on this machine while this lane measured, so this lane
did not write into it.

## What this lane did not do

This lane did not write a manifest, did not write into the shared evidence tree, and
did not write into the pinned checkout another lane was restoring. The instrument was
run against a copy of the evidence tree in this lane's own scratch directory, so the
manifest of record, `found-by-type-integration/manifest.json`, is untouched.

Branch: `port/smell-test-round3-20261024` in KatsuJinCode/decko-ts.
