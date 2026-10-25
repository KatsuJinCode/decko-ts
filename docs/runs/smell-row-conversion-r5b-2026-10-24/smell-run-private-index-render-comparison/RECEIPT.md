# smell-run-private-index-render-comparison

- The row's own label: `smell/probe script run-private-index-render-comparison.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/run-private-index-render-comparison.mjs`
  (sha256 `7bb99ecd1950badc5af6bbc9b665a1621ce2e53d1be65494e46067eb2342ee54`)
- What this lane did: restored the deck the instrument stages from, byte for
  byte, then ran the row's own instrument in its normalized mode.
- Command: `node run-private-index-render-comparison.mjs normalized` (exit 1)
- Capture: `fixtures/captured/smell-row-r5b-2026-10-24/smell-run-private-index-render-comparison.json`
- Pin: `tests/server/smell-run-private-index-render-comparison-parity.test.ts`

## Verdict: WORKING ON IT

The row's own verification ran and refused at its own one-shot create. The row
stays open with the gap this lane measured.

## What the run showed

The first run refused at the source deck:

    Error: build-local-deck: source deck not found:
    C:/localProjects/decko-edge-verification-53c86269/.runtime/authorized-widget-content-20261018-r2/deck.sqlite3

That deck had been swept with the checkout that held it. The 2026-10-20
dependency-restoration lane had rebuilt it byte for byte and left the rebuilt
file with its receipt, so this lane placed it back at the path the instrument
stages from and verified the hash:

| | |
|---|---|
| sha256 | `c19c4d561ebbd4bee3dab3667af52400a6fa32affc151fd17adf1c5007640dfc` |
| the restoration receipt's target hash | the same value |
| the restoration receipt's own words | `"byteRestored": true` |

With the deck in place the instrument ran past its qualified-input guard
(`completed.json` carries `code: 0`, `canonicalUnchanged: true`,
`inputUnchanged: true`), built the baseline deck, and then refused:

    Error: EEXIST: open '...\private-normalized-nest-index-a253-20261019\render-env.json'

That is the instrument's line 7, where it writes the environment file with the
exclusive-create flag into a directory where that file already exists.

## The output of record is intact

The refusal happens before the four runs and before the instrument's line 16,
which writes the comparison file without the exclusive-create flag and would
therefore overwrite the completed output of record. The three files of record
still carry their own sizes and their own 2026-10-18 timestamps:

| file | bytes | written |
|---|---|---|
| `render-comparison.json` | 9163 | 2026-10-18T18:33 |
| `render-env.json` | 4820 | 2026-10-18T18:33 |
| `render-comparison-running.json` | 799 | 2026-10-18T18:33 |

So the output of record is protected by the refusal itself, and this lane's
run overwrote nothing.

## The gap, in one mechanism sentence

The instrument writes its environment file with the exclusive-create flag into a
directory where that file already exists, so the repeat is refused one line
before the four runs and before the unguarded write that would overwrite the
completed output of record.

## What would close it

Either a fresh experiment directory and a fresh label, so the comparison can be
produced without touching the output of record, or a decision to accept the
completed output of record as the row's answer and retire the row.

## What this lane did not do

It did not overwrite the output of record, did not send the probe's live
database traffic (the instrument projects an ephemeral local origin, with the
database URL pointed at `127.0.0.1:1`), and made no `.com` request.

Branch: `port/smell-test-round3-b1-20261024` in KatsuJinCode/decko-ts.
