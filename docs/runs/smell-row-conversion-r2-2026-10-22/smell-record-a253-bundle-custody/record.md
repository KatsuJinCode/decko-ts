# Row smell-record-a253-bundle-custody

Smell-test row conversion, round two, 2026-10-22. Disposition: DONE.

- Roster row: `smell-record-a253-bundle-custody`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/record-a253-bundle-custody.mjs`
- What this lane did: rebuilt the two bundle copies the instrument hashes, byte-exact, and
  ran the instrument in a copy of the evidence tree.
- Commands:
  - `node tools/bundle-bunny-edge-engine.mjs --out-dir .runtime/private-final-f044d5af-bundle`
    and `node tools/bundle-bunny-edge-engine.mjs --out-dir .runtime/qualification-a25329a8-byte-rebuild`,
    both in `C:/localProjects/decko-edge-verification-53c86269` at commit
    `a25329a805202bf4ee5879f084fd028c90058215` (clean; the checkout's `.runtime` tree is
    gitignored at that commit, so the tree stays clean).
  - `node record-a253-bundle-custody.mjs` (run in the copy of the evidence tree).
- Observed: both builds produced `bunny-edge-engine.bundle.js` of 7312278 bytes with sha256
  `a498c1606240007268e8201ad31886439500e6de6649355285d2d443efc84b1e`, which is the hash the
  capture's own launch record names. The instrument then returned `pass: true` with
  `pinnedSha256` and `rebuiltSha256` both that hash, and wrote its custody receipt.
- Evidence in this directory: `fresh-a25329a8-bundle-custody.json`, the instrument's own
  output. It is identical to the receipt of record,
  `a25329a8-bundle-custody.json`, field for field apart from the `at` timestamp.
- Gap, in one mechanism sentence: none; the row's own verification ran and passed, and its
  output reproduces the record of record.

## What changed for this row

Round one recorded the row as blocked because the pinned bundle is a build output git does
not carry, and the pinned checkout had no `.runtime` tree at all. The bundle is derivable:
the capture's own custody record says an isolated output-directory rebuild at the complete
a253 source reproduces the pinned engine byte for byte, and this lane did exactly that
twice, from two separate output directories, at the pinned commit, and both copies carry
the recorded hash.

## The scope the instrument states, carried forward

The receipt's own scope line reads: an independent isolated output-directory rebuild at the
complete a253 source reproduces the pinned f044 engine byte for byte, with no capture
source, pinned bundle, dist or input modified, build custody only and not hosted or runtime
qualification. This receipt closes the row on that scope and claims nothing wider.
