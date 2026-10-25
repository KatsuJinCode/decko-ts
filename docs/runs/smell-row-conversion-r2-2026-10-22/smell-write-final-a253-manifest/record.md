# Row smell-write-final-a253-manifest

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-write-final-a253-manifest`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/write-final-a253-manifest.mjs`
- What this lane did: restored the two artifacts the manifest hashes, ran the instrument,
  and then checked every one of its custody clauses by hand to name which one still fails.
- Commands:
  - the pinned checkout `C:/localProjects/decko-edge-verification-53c86269` at commit
    `a25329a805202bf4ee5879f084fd028c90058215` (clean), with the bundle rebuilt byte-exact
    at `.runtime/private-final-f044d5af-bundle/bunny-edge-engine.bundle.js`
    (sha256 `a498c1606240007268e8201ad31886439500e6de6649355285d2d443efc84b1e`) and the
    deck restored byte-exact at
    `.runtime/authorized-widget-content-20261018-r2/deck.sqlite3`
    (sha256 `c19c4d561ebbd4bee3dab3667af52400a6fa32affc151fd17adf1c5007640dfc`).
  - `node write-final-a253-manifest.mjs` (run in the copy of the evidence tree).
- Observed: the instrument refuses with `Error: Exact final source/artifact/data custody
  mismatch`, raised at its line 6. This lane then checked its six clauses one by one:
  - the checkout's HEAD is the exact source commit: true;
  - the checkout is clean: true;
  - the capture's terminal source is the same commit: true;
  - the pinned bundle hashes to the capture's `bundleSha256`: true;
  - the restored deck hashes to the receipt's `targetSha256`: true;
  - the baseline deck at its recorded path hashes to the receipt's `baselineSha256`: false.
    The file `C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3`
    now hashes to `6aebb6546a06...` where the receipt records
    `15545aa78c6d8cc99427a400f31c36ca137d407be6c6f951d8df11e84b2ddf01`. The hash-verified
    backup of that same deck,
    `deck.sqlite3.pre-widget-fallback-20261019`, still carries the recorded hash.
- Gap, in one mechanism sentence: the manifest's last custody clause asks that the baseline
  deck at its recorded path still carry the hash the receipt recorded, and that live deck
  has moved on since the a253 era, so the clause cannot be satisfied without overwriting a
  live, evolved file.

## What changed for this row, and what did not

Round one recorded the row as blocked because the pinned bundle is a build output git does
not carry. That blocker is gone: the bundle rebuilds byte-exact at the pinned commit, and
the deck rebuilds byte-exact from the hash-verified baseline backup and the authorized
proposal. What is left is the one clause above, and it is a different gap from the one that
was recorded.

## What this lane did not do

This lane did not overwrite the live baseline deck, did not re-point the receipt's baseline
path, and did not write a manifest. The other five clauses pass, so the manifest's own
content is otherwise reproducible; the receipt of record remains the manifest of record.
