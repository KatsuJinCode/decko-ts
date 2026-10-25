# Row smell-write-final-e87-manifest

Smell-test row conversion, round two, 2026-10-22. Disposition: DONE.

- Roster row: `smell-write-final-e87-manifest`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/write-final-e87-manifest.mjs`
- What this lane did: put the pinned checkout at the commit the instrument demands, rebuilt
  the bundle it hashes byte-exact, and ran the instrument in a copy of the evidence tree.
- Commands:
  - the pinned checkout `C:/localProjects/decko-edge-verification-53c86269` was restored at
    commit `e87db8f850001c42e9be4ccd472577e1b50240a7` through the sanctioned admission path
    (`python -I C:/localProjects/diskSteward/agent/create_worktree.py`, with the disk red
    line checked and a custody lease taken), and its `node_modules` was pointed at the
    shared install.
  - `node tools/bundle-bunny-edge-engine.mjs --out-dir .runtime/private-final-e87db8f8-bundle`
    in that checkout, producing `bunny-edge-engine.bundle.js` of 7312075 bytes with sha256
    `1eb95037bc472a797097fd13d76d878768c7d9cb5c6dea2610fc67cbe179c1f7`, the hash the
    capture's own launch record names and the hash the instrument checks.
  - `node write-final-e87-manifest.mjs` (run in the copy of the evidence tree).
- Observed: every guard passed: the checkout is at the exact source commit and clean, the
  required ancestor relation holds, and the two identity files and the three retirement
  files are byte-identical to the commits the instrument names. The instrument returned
  `source` e87db8f8, `bundleSha256` 1eb95037, `broad` "5968+15,214skip on90f",
  `integration` 54, `full` "failed".
- Evidence in this directory: `fresh-manifest.json`, the instrument's own output. It is
  identical to the manifest of record, `final-complete-e87db8f8/manifest.json`, field for
  field apart from the `at` timestamp.
- Gap, in one mechanism sentence: none; the row's own verification ran and passed, and its
  output reproduces the record of record.

## The one field to read carefully

The manifest's `currentFull.status` is `failed`. That is the preserved historical fact: the
e87 full browser capture failed and was never rescored, and the manifest says so in its own
constraints. The instrument's job is to write the manifest faithfully, and it did: the
failure is carried into the output as it stands, not re-scored into a pass.

## What changed for this row

Round one recorded the row as blocked because the pinned private bundle is a build output
git does not carry. The bundle is derivable from the pushed source at the pinned commit,
byte for byte, and this lane rebuilt it there and verified the hash against the recorded
launch record before running the instrument.
