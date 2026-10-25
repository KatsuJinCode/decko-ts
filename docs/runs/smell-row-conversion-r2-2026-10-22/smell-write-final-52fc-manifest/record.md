# Row smell-write-final-52fc-manifest

Smell-test row conversion, round two, 2026-10-22. Disposition: DONE.

- Roster row: `smell-write-final-52fc-manifest`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/write-final-52fc-manifest.mjs`
- What this lane did: put the pinned checkout at the commit the instrument demands, rebuilt
  the bundle it hashes byte-exact, and ran the instrument in a copy of the evidence tree.
- Commands:
  - the pinned checkout `C:/localProjects/decko-edge-verification-b00a4503` was restored at
    commit `52fc9b7ec3197fca5b3dc96531f57b1876c3a1ac` through the sanctioned admission path
    (`python -I C:/localProjects/diskSteward/agent/create_worktree.py`, with the disk red
    line checked and a custody lease taken), and its `node_modules` was pointed at the
    shared install.
  - `node tools/bundle-bunny-edge-engine.mjs --out-dir .runtime/private-final-52fc9b7e-bundle`
    in that checkout, producing `bunny-edge-engine.bundle.js` of 7312075 bytes with sha256
    `1eb95037bc472a797097fd13d76d878768c7d9cb5c6dea2610fc67cbe179c1f7`, which is the hash the
    capture's own launch record names and the hash the instrument hardcodes.
  - `node write-final-52fc-manifest.mjs` (run in the copy of the evidence tree).
- Observed: the instrument's guards passed (the checkout is at the exact source commit and
  clean; the only changes between the baseline and the source are inside
  `tools/edge-signed-in-exercise`; the bundle hash matches the launch record) and it
  returned `source` 52fc9b7e, `files` 7, `bundleSha256` 1eb95037, `full` completed.
- Evidence in this directory: `fresh-manifest.json`, the instrument's own output. It is
  identical to the manifest of record, `final-harness-52fc9b7e/manifest.json`, field for
  field apart from the `at` timestamp.
- Gap, in one mechanism sentence: none; the row's own verification ran and passed, and its
  output reproduces the record of record.

## What changed for this row

Round one recorded the row as blocked because the pinned private bundle is a build output
git does not carry. The bundle is derivable from the pushed source at the pinned commit,
byte for byte, and this lane rebuilt it there and verified the hash against the recorded
launch record before running the instrument.

## The scope the manifest states, carried forward

The manifest's own limitations read: no combined or retrospective full pass, the live
page-render instrument skip is not acceptance, no hosted source qualification until
deployment and exact binding receipts, and the public Google Docs untouched. This receipt
closes the row on the manifest's own terms and claims nothing wider.
