# smell-audit-candidate-production-flags

- The row's own label: `smell/probe script audit-candidate-production-flags.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/audit-candidate-production-flags.mjs`
- What this lane did: restored the pinned checkout the instrument imports its harness module
  from, ran the row's own instrument against the live candidate scripts, and read the receipt
  it wrote.
- Commands:
  - `python -I C:/localProjects/diskSteward/agent/create_worktree.py --repo C:/localProjects/decko-ts-smell-test-round2-20261024 --path C:/localProjects/decko-edge-verification-53c86269 --branch lane/edge-verification-a25329a8-restore-20261024 --ref a25329a8 --owner lane-smell-test-round2 --purpose "restore the pinned a25329a8 checkout the candidate-flags audit instrument imports"`
    (outcome `created`; the pinned checkout's directory was empty, its custody claim had
    expired on 2026-10-23, and the instrument's import
    `file:///C:/localProjects/decko-edge-verification-53c86269/tools/edge-signed-in-exercise/lib/local-policy.mjs`
    could not resolve without it)
  - `node audit-candidate-production-flags.mjs smell-audit-candidate-production-flags-20261024-r1`
    (from the instrument's own directory; exit 0; the receipt was written under the label the
    instrument was given)
- Evidence in this directory's sibling fixtures:
  `fixtures/captured/smell-row-r4-2026-10-24/audit-candidate-production-flags.json` (the
  instrument's own receipt, copied verbatim).

## Verdict: DONE

The row's own verification ran and its own verdict holds on both live candidate scripts.

| script | hostname | current release | the four required flags |
|---|---|---|---|
| 96895 | https://culturesmith-b-edge.bunny.run | 1197225 | all present, all equal |
| 96867 | https://culturesmith-edge.bunny.run | 1194026 | all present, all equal |

The four flags are the ones the instrument's own policy module forces for the candidate
configuration, and their values are `DECKO_CONFLICT_RETRY=1`, `DECKO_MATERIAL_ICONS=local`,
`DECKO_FONT_AWESOME=local` and `DECKO_WRITE_PATH=1`. The instrument's own verdict field,
`allRequiredPresentAndEqual`, is `true` for both scripts, and the instrument did not refuse:
its gate (`Expected harness setting changed`) did not fire, so the local harness policy it
compares against is as expected too.

## What changed since the last measurement of this instrument

The prior measurement of record, from the 2026-10-20 dependency-restoration lane
(`C:/localProjects/brandonDojoTech/tmp/smell-dep-restore-20261020/verdicts.json`), is a real
FAIL: the reads succeeded and the instrument then refused with
`Error: Expected harness setting changed`, because the live scripts no longer carried the
four-flag candidate configuration. The live flags have moved since: the same instrument, run
now, finds all four flags present and equal on both scripts. The row's own blocker text named
exactly that dependency as the reason the row was open, and it is now in place.

## The live calls this lane made, and what it did not do

The instrument's two script reads are live `api.bunny.net` account API reads, one per script
id, and this lane made exactly those two: a read-only GET of the script metadata for 96895 and
for 96867. There was no write, no deploy, no page walk and no request to any `.com` address.
The account key the instrument reads from the operator's secrets file was never printed and
is not in the receipt: the receipt carries script ids, hostnames, release ids, flag names,
flag values and value digests.

## The limit of this verdict

The instrument's own scope line says what the receipt is: "Read-only current script metadata.
Four non-secret harness-effective flags required for candidate configuration parity. ...
This is configuration-delta evidence, not deployment or hosted acceptance; production
origin/binding and other flags still need separate custody." So this row closes on the four
flags it names. It does not assert that the candidate deployment is accepted, that the live
host behaves like the port, or that the other flags and the production binding are right.

Branch: `port/smell-test-round2-20261024` in KatsuJinCode/decko-ts.
