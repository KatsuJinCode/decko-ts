# Row smell-measure-local-isolate-cpu

Smell-test row conversion, round two, 2026-10-22. Disposition: DONE.

- Roster row: `smell-measure-local-isolate-cpu`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/measure-local-isolate-cpu.mjs`
- What this lane did: rebuilt the compiled probe module the instrument imports, byte-exact
  against the hash the recorded receipt carries, and ran the instrument in a fresh output
  directory so that the receipt of record was neither read nor overwritten.
- Commands:
  - `npx tsc deploy/bunny-worker-src/bunny-edge-isolate-probe.ts --ignoreConfig --outDir dist/deploy/bunny-worker-src --rootDir deploy/bunny-worker-src --target es2022 --module esnext --moduleResolution bundler --skipLibCheck --strict`
    run in `C:/localProjects/decko-edge-verification-53c86269` at commit
    `a25329a805202bf4ee5879f084fd028c90058215`, producing
    `dist/deploy/bunny-worker-src/bunny-edge-isolate-probe.js` with sha256
    `8f9f52de6bae67d73b4d4c723594893d7c779d872aa6b937105902bd3688f091`, which is the
    `compiledModuleSha256` the recorded receipt carries.
  - `node measure-local-isolate-cpu.mjs` run in a fresh output directory
    (`.../tmp/smell-r2-work/isolate-cpu-fresh`), because the instrument writes its receipt
    with the exclusive-create flag and the recorded receipt already existed in the evidence
    tree.
- Observed: the instrument completed and printed its receipt. The compiled module hash in
  the fresh receipt is the same `8f9f52de...`, the runtime is `v24.22.1`, and the probe body
  answers with `rounds` 5, `reps` 2, `sum` 180040, which is the same deterministic sum the
  recorded receipt carries. The timings differ, as timings do: `wall_ms` 9 and `perf_ms`
  5.56 against the recorded 16 and 10.1.
- Evidence in this directory: `fresh-local-isolate-cpu.json`, the instrument's own output.
- Gap, in one mechanism sentence: none; the row's own verification ran and produced its
  measurement, and the parts of that measurement that are deterministic match the recorded
  receipt.

## What changed for this row

Round one recorded the row as blocked because the compiled probe module is a build output
git does not carry. The recipe is in the repository and was re-run here: the module compiles
from the pinned source to the recorded hash, so the instrument's import resolves and its
probe route answers.

## The scope the instrument states, carried forward

The instrument's own scope line reads: a pure CPU function from the exact-source compiled
probe module, the same 5 rounds and 2 reps, no network and no database, no source change, a
Node comparison diagnostic only, not bundled, vendor or hosted acceptance. This receipt
closes the row on that scope and claims nothing wider.
