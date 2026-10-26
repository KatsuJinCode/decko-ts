# Receipt 1: the four strict-parity switches, both battery modes at the rolled tip

Claim attacked: the strict-parity lane (`port/parity-flags-20261026`) claims
that each improved behaviour has the recorded Ruby behaviour one switch away,
and that the battery reads **78 pass / 9 deliberate / 0 mismatch** in the
default mode and **86 pass / 1 deliberate / 0 mismatch** in the strict mode
against the same committed Ruby recording
(`docs/runs/parity-flags-20261026/RECEIPT.md`, "The battery, both modes").

Attacked tree: `deploy/full-candidate-20261103` at `5131d2ac40dacc64c45530941e82937caef86137`
(verified with `git ls-remote --heads origin` before the lane was made).

## Verdict: HELD on the counts, with one qualification the counts cannot see

Both modes reproduce the branch's own receipts exactly, with no drift:

| mode | the branch receipt | measured at the rolled tip | drift |
|---|---|---|---|
| default (the four switches off) | 78 pass / 9 deliberate / 0 mismatch | **78 pass / 9 deliberate / 0 mismatch** | none |
| strict (the four switches on, `PARITY_STRICT=1`) | 86 pass / 1 deliberate / 0 mismatch | **86 pass / 1 deliberate / 0 mismatch** | none |

The nine default-mode declared steps and the one strict-mode declared step are
the ones the receipt names: the default mode declares
`admin-create-skin-bad-parent`, `admin-delete-script-card`, `admin-deny-signup`,
`admin-update-current-skin-colors`, `get-home`, `reset-unknown-email`,
`restore-file-revision`, `signin-unknown`, `signin-wrong-password`; the strict
mode declares only `get-home`. The six flag cases grade PASS with an EMPTY
diff bag in strict mode (`signin-unknown`, `signin-wrong-password`,
`reset-unknown-email`, `restore-file-revision`, `admin-deny-signup`,
`admin-create-skin-bad-parent`).

The qualification: the strict mode's "one for one with Ruby" holds on every
field the comparator grades, and does NOT hold on the bytes the comparator
grades only as a declared difference. Two of the six flag cases answer a
**261-byte** document where the recorded Ruby answers an **18,538-byte** and an
**18,470-byte** site page. The comparator reports those two rows as
`declared` in the strict mode, so the table reads clean. Receipt 02 measures
this and the mechanism behind it; it is the one place where this lane's claim
is true on the fields and false on the body.

## What was run

The engine distribution was built from this tree and both battery runs were
driven through the committed fixture, exactly as the branch receipt describes
(`DECKO_PASSWORD_HASH=legacy-sha1`, the Ruby-built fixture deck):

    npm run build:engine                      # exit 0, 1.9 s
    DECKO_PASSWORD_HASH=legacy-sha1 node tools/parity-side-effects/ts-drive.mjs \
      reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 \
      tmp/attack2-20261026/default-work > tmp/attack2-20261026/ts-trace-default.json
    node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/attack2-20261026/ts-trace-default.json tmp/attack2-20261026/compare-default.json

    DECKO_PASSWORD_HASH=legacy-sha1 \
    DECKO_STRICT_PARITY_SIGNIN_DETAILED_ERRORS=on \
    DECKO_STRICT_PARITY_REVISION_RESTORE_500=on \
    DECKO_STRICT_PARITY_SKIN_CREATE_500=on \
    DECKO_STRICT_PARITY_SCRIPT_BUNDLE_CLOCK_NAMES=on \
    node tools/parity-side-effects/ts-drive.mjs \
      reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 \
      tmp/attack2-20261026/strict-work > tmp/attack2-20261026/ts-trace-strict.json
    PARITY_STRICT=1 node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/attack2-20261026/ts-trace-strict.json tmp/attack2-20261026/compare-strict.json

Both drives exit 0 (14.4 s and 14.5 s), both comparators exit 0. The full
reports are committed at `artifacts/compare-default.json` and
`artifacts/compare-strict.json`; the per-step raw-body table for both modes is
at `artifacts/raw-body-table-rolled-tip.json`.

The comparator headlines, verbatim from the two runs:

    SIDE EFFECTS PASS 78 / 87; deliberate differences pinned 9; mismatches 0
    RAW BODIES byte-equal 51; slot-equal 28; declared 6; residual 2

    SIDE EFFECTS PASS 86 / 87; deliberate differences pinned 1; mismatches 0
    RAW BODIES byte-equal 51; slot-equal 31; declared 3; residual 2

## The six flag cases, strict mode, as measured

| step | verdict | diffs | the raw body, Ruby vs port |
|---|---|---|---|
| `signin-unknown` | PASS | none | 16,063 vs 15,659 bytes (slot-equal) |
| `signin-wrong-password` | PASS | none | 16,058 vs 15,654 bytes (slot-equal) |
| `reset-unknown-email` | PASS | none | 16,571 vs 16,167 bytes (slot-equal) |
| `restore-file-revision` | PASS | none | **18,538 vs 261 bytes (declared)** |
| `admin-deny-signup` | PASS | none | 0 vs 0 bytes (byte-equal) |
| `admin-create-skin-bad-parent` | PASS | none | **18,470 vs 261 bytes (declared)** |

The two bold rows are the qualification. The port's strict 500 answer is the
bare `SERVER_ERROR_HTML` document (`src/card/render/debug-server-error.ts`,
the Wild Card block), while the recorded Ruby answer is the whole deck page.
Receipt 02 carries the bytes, the code path and the reason the raw table
grades them `declared` rather than `raw-mismatch`.

## What was tried that did not break the claim

- The comparator's field verdict was read for a loophole: it does honour the
  erasure rule (`tools/parity-side-effects/compare.mjs:368`, "if
  (`PARITY_STRICT && pin.strictErases === true`) return null"), so a flag case
  that still differed in strict mode would be graded MISMATCH. It grades PASS
  with empty diffs, so the fields really do match the recording.
- The four switch names were checked against the tree: all four are read by
  the engine and by the two edge hosts
  (`src/card/parity/strict-parity-flags.ts`, `src/server/write-routes.ts`,
  `src/server/cloudflare-write-routes.ts`,
  `deploy/bunny-worker-src/bunny-edge-signin-session-surface.ts`).
- The battery was driven twice per mode against the same fixture, and the
  two runs' traces were compared step for step: the default trace and the
  strict trace differ only on the six flag steps and on the two
  content-addressed re-store steps, as the receipt's own claim says.

## Artifacts

- `artifacts/compare-default.json` - the default-mode comparator report at the
  rolled tip.
- `artifacts/compare-strict.json` - the strict-mode comparator report.
- `artifacts/raw-body-table-rolled-tip.json` - the per-step table for both
  modes (step, verdict, raw verdict, both body lengths).
