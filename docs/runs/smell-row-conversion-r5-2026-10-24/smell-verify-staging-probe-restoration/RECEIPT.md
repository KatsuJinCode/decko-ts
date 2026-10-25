# smell-verify-staging-probe-restoration

- The row's own label: `smell/probe script verify-staging-probe-restoration.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/verify-staging-probe-restoration.mjs`
- What this lane did: ran the row's own instrument, from a copy in this lane's own
  scratch directory so that the receipt of record was not overwritten, and compared
  the reading it took with the receipt of record.
- Commands:
  - `node verify-staging-probe-restoration.mjs`, run from `tmp/smell-r5/probe-staging/`
    in this lane's tree. Exit code 0, and the instrument wrote its own receipt there.
  - `node tools/smell-row-r5/distill-staging-probe-restoration.mjs tmp/smell-r5/probe-staging/staging-probe-restoration-independent-20261019.json C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/staging-probe-restoration-independent-20261019.json fixtures/captured/smell-row-r5-2026-10-24/verify-staging-probe-restoration.json`
    (`rows 2, flags unchanged 2, releases moved 1`)
- Evidence: `fixtures/captured/smell-row-r5-2026-10-24/verify-staging-probe-restoration.json`
  (this lane's reading of the live scripts, next to the receipt of record it
  re-measures).
- Pin: `tests/server/smell-verify-staging-probe-restoration-parity.test.ts`.

## Verdict: WORKING ON IT

The row's own verification ran, and this is what it measured:

| script | origin | current release | release in the receipt of record | the six flags |
|---|---|---|---|---|
| 96895 | https://culturesmith-b-edge.bunny.run | 1197225 | 1194138 | `DECKO_EDGE_ISOLATE_PROBE=0`, `DECKO_EDGE_CACHE=1`, `DECKO_CONFLICT_RETRY=1`, `DECKO_MATERIAL_ICONS=local`, `DECKO_FONT_AWESOME=local`, `DECKO_WRITE_PATH=1` |
| 96867 | https://culturesmith-edge.bunny.run | 1194026 | 1194026 | `DECKO_EDGE_ISOLATE_PROBE` unset, `DECKO_EDGE_CACHE=1`, `DECKO_CONFLICT_RETRY=1`, `DECKO_MATERIAL_ICONS=local`, `DECKO_FONT_AWESOME=local`, `DECKO_WRITE_PATH=1` |

All six flags on both scripts are unchanged from the receipt of record, so the 2026-10-23
round's premise that "the expectations the 2026-10-20 flags audit showed have moved on
the live scripts" does not hold for the flags: the four harness-effective flags the
flags audit names are still present and equal on both scripts, and the two
probe-related flags read the same as they did on 2026-10-19. What did move is the
release id of script 96895, from 1194138 to 1197225, so the flags have now been read
back from a redeployed script.

## The gap, in one mechanism sentence

The instrument records the live scripts' six flags and their release ids and states no
pass condition of its own, so a run of it produces facts that cannot fail against the
row's own earlier output, and the expected flag set that the restored staging state has
to meet is written neither in the instrument nor in its receipt.

## What would close it

An operator decision naming the flag values the restored staging state must carry, so
that this reading can be judged against them, or an acceptance of this reading as the
row's answer. Both are operator decisions, and this lane made neither.

## The live calls this lane made, and what it did not do

Two live `api.bunny.net` account API metadata reads, one for script 96895 and one for
script 96867: read-only GETs of script metadata, no mutation. The account key the
instrument reads from the operator's secrets file was never printed, is not in the
receipt, and was not written into this repository. The receipt of record was not
overwritten: the instrument was run from a copy in this lane's own scratch directory.

Branch: `port/smell-test-round3-20261024` in KatsuJinCode/decko-ts.
