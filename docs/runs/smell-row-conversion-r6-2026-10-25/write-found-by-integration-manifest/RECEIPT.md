# smell-write-found-by-integration-manifest

- The row's own label: `smell/probe script write-found-by-integration-manifest.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/write-found-by-integration-manifest.mjs`
  (sha256 `56e8affe66b6a75a6cee8d5f5be5ed32db34ef1e2c31bd792b340019b7c82973`)
- What this lane did: rebuilt the row's one missing input, the pinned bundle,
  byte for byte at the pinned source, ran the row's own instrument in the
  instrument's own directory, and compared the manifest of record the run
  wrote with the manifest that stood there before.
- Command:
  `node tools/smell-row-r6/distill-found-by-manifest.mjs C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018 <before-snapshot> <build-log> fixtures/captured/smell-row-r6-2026-10-25/write-found-by-integration-manifest.json`
  (`run exit 0, manifest written true, content identical apart from at true; inputs 4/4, gates 10/10; failing:`)
- Evidence: `fixtures/captured/smell-row-r6-2026-10-25/write-found-by-integration-manifest.json`.
  It carries the instrument's own exit code and printed line, the manifest of
  record before and after the run, the ten gates one by one, and the build log
  of the pinned bundle in its `pinnedBundle` section (log sha256
  `ca74652827debc2b5365da1d2ef3a49492a9f1145bf86febda26fb6db434cba6`).
- Pin: `tests/server/smell-write-found-by-integration-manifest-parity.test.ts`.

## Verdict: DONE

The instrument ran, passed every one of its own evidence gates and wrote the
manifest of record. The row closes on the instrument's own verdict.

## What the row was waiting for

The 2026-10-24 round left this row open with the gap "the pinned bundle the
scoped run measured, a build output of the pinned `6f960810` source, is not on
this machine". Everything else the instrument reads was already on this
machine and already held. The bundle is a build output of a pushed source
commit, so it is regenerable, and this lane regenerated it.

## The rebuild

The bundle was built in a lane copy of the pinned source, at the pinned commit
itself:

    lane copy: C:/localProjects/decko-ts-smell-r6-cql6f960810-tmp
    HEAD: 6f960810e3c9a1c5ab31fc0f4239c5d9f9a7ebf3
    git status --porcelain: empty
    command: node tools/bundle-bunny-edge-engine.mjs --out-dir .runtime/private-cql-6f960810-bundle
    result: bunny-edge-engine.bundle.js, 7305968 bytes,
            sha256 ea2e31d4f216657702c5cdee2d735afe1407a6a9f47d09dbe9d952c8e0ae4b93

The hash the build reached is the hash the scoped run measured, which
`scoped-layout-6f960810-r2/completed.json` records as `bundleSha256`, and it
is the hash the manifest of record already carried. The build output was then
placed at the path the instrument hashes, the pinned checkout's own runtime
tree:

    C:/localProjects/decko-edge-verification-b00a4503/.runtime/private-cql-6f960810-bundle/bunny-edge-engine.bundle.js
    sha256 ea2e31d4f216657702c5cdee2d735afe1407a6a9f47d09dbe9d952c8e0ae4b93

So the last gate is satisfied by an artifact that is provably the same bytes
the scoped run measured, not by a substitute.

## The instrument's own run

    node write-found-by-integration-manifest.mjs
    exit code 0
    {"source":"6f960810e3c9a1c5ab31fc0f4239c5d9f9a7ebf3","qualified":true,"bundle":{"path":"C:/localProjects/decko-edge-verification-b00a4503/.runtime/private-cql-6f960810-bundle/bunny-edge-engine.bundle.js","sha256":"ea2e31d4f216657702c5cdee2d735afe1407a6a9f47d09dbe9d952c8e0ae4b93","bytes":7305968},"fullCapture":{"directory":"../strengthened-full-found-by-6f960810","state":"active","aggregate":null}}

The manifest of record it wrote, `found-by-type-integration/manifest.json`, is
identical, field for field, to the manifest that stood there before, apart from
the moment it was written:

| | |
|---|---|
| the manifest before the run | sha256 `a2a84af1e95228cbacec9d98630e63dc131c21d39f64c18c5f30a571e6870cd6`, `at` `2026-10-20T00:46:44.282Z` |
| the manifest after the run | sha256 `32e47eec3ed6310a1e84e914aff3883c461dd68ce155e77f1816a270315c3c23`, `at` `2026-10-25T07:09:58.246Z` |
| every other field | identical, compared field by field |

So the row reproduces the record it is about, and the record on disk today is
the one this round's own run wrote.

## The ten gates, one by one

| gate | holds | fact |
|---|---|---|
| the equivalence run passed | yes | `found-by-real-deck-equivalence-r2/receipt.json`, `pass: true` |
| the equivalence run left the source clean | yes | `sourceClean: true` |
| the equivalence run left the input unchanged | yes | `inputUnchanged: true` |
| the old and new CQL module differ | yes | the two module hashes differ |
| the scoped run passed every check (4 of 4) | yes | `scoped-layout-6f960810-r2/completed.json`, `checks {pass: 4, total: 4, failures: []}` |
| the scoped run left the source clean | yes | `sourceClean: true` |
| the scoped run left the deck unchanged | yes | `deckUnchanged: true` |
| the correctness gate reports 5954 passed | yes | `found-by-type-id-correctness.log` |
| the correctness gate reports no failures | yes | the same log, `"failed":0` |
| the pinned bundle is the one the scoped run measured | yes | the bundle hashes to `ea2e31d4...`, the scoped run's `bundleSha256` |

All four of the instrument's inputs are present: the equivalence receipt, the
scoped completion, the scoped report and the correctness log.

## What this lane did not do

It did not touch a hosted edge, did not send live database traffic, did not
change the instrument, and did not re-issue any captured evidence. The only
file it wrote outside its own tree is the manifest of record, and the
instrument wrote that one itself, in its own directory, with the evidence it
was given.

Branch: `port/smell-test-round4-20261025` in KatsuJinCode/decko-ts.
