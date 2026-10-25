# smell-write-final-a253-manifest

- The row's own label: `smell/probe script write-final-a253-manifest.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/write-final-a253-manifest.mjs`
- What this lane did: checked the instrument's six custody clauses one at a time
  against what is on this machine now, and wrote nothing into the evidence tree.
- Command:
  `node tools/smell-row-r5/distill-a253-custody.mjs C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018 fixtures/captured/smell-row-r5-2026-10-24/write-final-a253-manifest.json`
  (`clauses holding 1 of 6`)
- Evidence: `fixtures/captured/smell-row-r5-2026-10-24/write-final-a253-manifest.json`.
- Pin: `tests/server/smell-write-final-a253-manifest-parity.test.ts`.

## Verdict: WORKING ON IT

The instrument refuses with `Exact final source/artifact/data custody mismatch` when
any of its six clauses fails. This lane checked the six clauses one at a time:

| clause | holds | fact |
|---|---|---|
| the checkout's HEAD is the exact source commit | no | the pinned checkout `C:/localProjects/decko-edge-verification-53c86269` is not on this machine |
| the checkout is clean | no | same, the checkout is not on this machine |
| the capture's terminal source is the same commit | yes | `a25329a805202bf4ee5879f084fd028c90058215` |
| the pinned bundle hashes to the capture's bundle hash | no | the pinned bundle is not on this machine |
| the restored deck hashes to the receipt's target hash | no | the restored deck is not on this machine |
| the baseline deck hashes to the receipt's baseline hash | no | the deck is present and it hashes to `6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`, where the receipt records `15545aa78c6d8cc99427a400f31c36ca137d407be6c6f951d8df11e84b2ddf01` |

Five clauses cannot be checked here because the pinned checkout and the two artifacts
it holds are not on this machine. One clause can be checked, and it does not hold: the
baseline deck at the path the receipt records is present, and it is a different file
from the one the receipt recorded. That is the same value the 2026-10-23 round
recorded, so the deck has not moved again since then.

## The gap, in one mechanism sentence

The manifest's last custody clause asks that the baseline deck at its recorded path
still carry the hash the receipt recorded, and that live deck has been replaced since
the a253 era by the applied deck, so the clause cannot be satisfied without overwriting
a live, evolved file.

## What would close it

An operator decision about the baseline deck: either to re-point the receipt's baseline
path to the hash-verified pre-apply backup, which still carries the recorded hash, or
to accept that the baseline has moved on and to re-issue the receipt against the deck
that is there now. Both are operator decisions, and this lane made neither. This lane
did not overwrite the live baseline deck, did not re-point the receipt, and did not
write a manifest.

## The other four clauses, and the recipe that would satisfy them

The four clauses that cannot be checked here are satisfied by restoring the pinned
checkout and its two artifacts. The 2026-10-20 dependency-restoration lane recorded the
recipe and the hashes it reached, in
`C:/localProjects/brandonDojoTech/tmp/smell-dep-restore-20261020/verdicts.json`: the
checkout at `a25329a8`, the bundle rebuilt byte-exact with
`node tools/bundle-bunny-edge-engine.mjs --out-dir` at
`.runtime/private-final-f044d5af-bundle/` (sha256
`a498c1606240007268e8201ad31886439500e6de6649355285d2d443efc84b1e`), and the deck
rebuilt byte-exact from the hash-verified pre-apply baseline backup and the authorized
proposal with the original applier's mechanics (sha256
`c19c4d561ebbd4bee3dab3667af52400a6fa32affc151fd17adf1c5007640dfc`), with the recipe
and receipts under that lane's `deck-rebuild/`. This lane did not run that restoration:
another lane was restoring the same pinned checkouts on this machine at the time, and
two lanes restoring one checkout is how a checkout ends up half restored.

Branch: `port/smell-test-round3-20261024` in KatsuJinCode/decko-ts.
