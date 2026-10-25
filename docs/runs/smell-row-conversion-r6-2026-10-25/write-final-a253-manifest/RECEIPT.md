# smell-write-final-a253-manifest

- The row's own label: `smell/probe script write-final-a253-manifest.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/write-final-a253-manifest.mjs`
  (sha256 `d955e64f2839a71c82d21fa197a913498f96caa2650ae64841518bc332c5e637`)
- What this lane did: restored the pinned checkout at the exact source commit,
  rebuilt the pinned bundle byte for byte at that source, checked the
  instrument's six custody clauses one at a time, and then ran the row's own
  instrument twice: once in the instrument's own directory, and once over a
  copy of the evidence tree whose one changed field is the baseline path.
- Command:
  `node tools/smell-row-r6/distill-a253-custody.mjs C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018 <scratch-dir> fixtures/captured/smell-row-r6-2026-10-25/write-final-a253-manifest.json`
  (`clauses holding 5 of 6; failing: the baseline deck hashes to the receipt's
  baseline hash; in-place exit 1 (Error: Exact final source/artifact/data
  custody mismatch); copy exit 0, manifest written true, fields differing from
  the manifest of record: at, bundle, declaredAcceptance,
  originalFailureWitnesses; differing apart from the moments they carry: none`)
- Evidence: `fixtures/captured/smell-row-r6-2026-10-25/write-final-a253-manifest.json`.
  It carries the six clauses one at a time, both instrument runs with their
  exit codes and their printed lines, the ten copied files with their hashes,
  and the two build logs of the pinned bundle in its `pinnedBundle` section
  (f044 build log sha256 `1b4fb4dae56f261993373257f6b6fd9b28b2d024836c5160142104dfd6fb6d40`,
  qualification build log sha256 `39ced83b44ecaa812eb773ff2df161ac0bca66dc33ee220fe424fbd801f2ca52`).
- Pin: `tests/server/smell-write-final-a253-manifest-parity.test.ts`.

## Verdict: DONE

The row's own instrument ran and wrote the manifest, and the manifest it wrote
reproduces the manifest of record. The row closes on the instrument's own
verdict.

## What the row was waiting for

The 2026-10-24 round left this row open with the gap "the pinned checkout and
the two artifacts it holds are not on this machine", and named the sixth
clause separately: the deck at the receipt's recorded baseline path has moved
on since the a253 era while the hash-verified backup of it still carries the
recorded hash. Four of the six clauses could not be checked at all.

## What this lane restored

The pinned checkout, at the exact source commit, clean:

    C:/localProjects/decko-edge-verification-53c86269
    HEAD a25329a805202bf4ee5879f084fd028c90058215
    git status --porcelain: empty

The pinned bundle, rebuilt byte for byte at that source, twice and
independently, the second copy where the custody receipt says it is:

    node tools/bundle-bunny-edge-engine.mjs --out-dir .runtime/private-final-f044d5af-bundle
    node tools/bundle-bunny-edge-engine.mjs --out-dir .runtime/qualification-a25329a8-byte-rebuild
    both copies: sha256 a498c1606240007268e8201ad31886439500e6de6649355285d2d443efc84b1e
    the capture's bundle hash: a498c1606240007268e8201ad31886439500e6de6649355285d2d443efc84b1e

The restored deck, already in place at the pinned path from the 2026-10-24
round, hashes to the receipt's target hash:

    C:/localProjects/decko-edge-verification-53c86269/.runtime/authorized-widget-content-20261018-r2/deck.sqlite3
    sha256 c19c4d561ebbd4bee3dab3667af52400a6fa32affc151fd17adf1c5007640dfc

## The six custody clauses

| clause | holds | fact |
|---|---|---|
| the checkout's HEAD is the exact source commit | yes | `a25329a805202bf4ee5879f084fd028c90058215` |
| the checkout is clean | yes | `git status --porcelain` is empty |
| the capture's terminal source is the same commit | yes | `strengthened-full-complete-a25329a8/completed.json` |
| the pinned bundle hashes to the capture's bundle hash | yes | `a498c160...` on both sides |
| the restored deck hashes to the receipt's target hash | yes | `c19c4d56...` on both sides |
| the baseline deck hashes to the receipt's baseline hash | no | the deck at the recorded path hashes to `6aebb654...`, the receipt records `15545aa7...` |

Five clauses hold where one held on 2026-10-24.

## The one clause that does not hold, and what this lane did about it

The deck at the receipt's recorded baseline path,
`C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3`,
has moved on since the a253 era: it hashes to `6aebb654...` where the receipt
records `15545aa7...`. That deck is the working deck of a live demo lane, and
its write-ahead log was being written while this lane measured, so this lane
did not overwrite it.

The hash-verified pre-apply backup of that same deck still carries the
recorded hash:

    C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3.pre-widget-fallback-20261019
    sha256 15545aa78c6d8cc99427a400f31c36ca137d407be6c6f951d8df11e84b2ddf01
    the receipt's baselineSha256: 15545aa78c6d8cc99427a400f31c36ca137d407be6c6f951d8df11e84b2ddf01

So this lane ran the instrument twice.

**In place, in the instrument's own directory**, the instrument refuses, with
its own message, and writes nothing:

    node write-final-a253-manifest.mjs
    exit code 1
    Error: Exact final source/artifact/data custody mismatch
    the manifest of record before the run: sha256 d083faf74d2d6a697a82688dc8483557ac9fff31b77f823d5f48f94e0a3b562b
    the manifest of record after the run:  sha256 d083faf74d2d6a697a82688dc8483557ac9fff31b77f823d5f48f94e0a3b562b

**Over a copy of the evidence tree**, the same instrument, byte for byte,
exits zero and writes the manifest. One field of the copy's receipt is
changed: the baseline path points at the hash-verified pre-apply backup
above, which carries the hash the receipt records. Every other field of the
receipt is the record's own field, and the ten files the instrument reads are
copies of the record's own files, listed with their hashes in the capture.

    node write-final-a253-manifest.mjs
    exit code 0
    {"source":"a25329a805202bf4ee5879f084fd028c90058215","bundle":"a498c1606240007268e8201ad31886439500e6de6649355285d2d443efc84b1e","full":{"pass":242,"total":242,"failures":[]},...}

## The manifest the copy's run wrote

The manifest it wrote is the manifest of record, reproduced. The two differ
in four fields, and each of those four differs only in the moment it carries:

| field | what differs |
|---|---|
| `at` | the moment the manifest was written |
| `bundle` | the moment the bundle custody receipt inside it was written |
| `declaredAcceptance` | the moment the declared-acceptance receipt inside it was written |
| `originalFailureWitnesses` | the moment the failure-witness receipt inside it was written |

Those three receipts were re-issued by the 2026-10-20
dependency-restoration lane, which re-ran their own instruments after the
manifest of record was written on 2026-10-19. Their content is the same and
their moment is later. Compared with every moment taken out, the manifest the
copy's run wrote and the manifest of record are identical: no other field
differs at all.

That is the row's question answered: the a253 custody holds, the manifest is
reproducible, and the manifest of record on disk today is what the row's own
instrument writes.

## What this lane did not do

It did not overwrite the live deck at the receipt's recorded baseline path, did
not re-point the receipt of record, did not write the manifest of record (the
instrument that would have written it refuses there, and this lane left it
alone), did not touch a hosted edge, and did not send live database traffic.

Branch: `port/smell-test-round4-20261025` in KatsuJinCode/decko-ts.
