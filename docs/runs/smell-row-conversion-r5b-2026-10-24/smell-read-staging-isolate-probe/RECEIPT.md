# smell-read-staging-isolate-probe

- The row's own label: `smell/probe script read-staging-isolate-probe.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/read-staging-isolate-probe.mjs`
  (sha256 `1f9c38aef35fc12cbf5ef8db70303173478deeb458583c8b6068260fbef7cff5`)
- What this lane did: ran the row's own instrument, and measured the two
  staging variables its admission gate reads.
- Command: `node read-staging-isolate-probe.mjs smell-read-staging-isolate-probe-20261024-r1`
  (exit 1)
- Capture: `fixtures/captured/smell-row-r5b-2026-10-24/smell-read-staging-isolate-probe.json`
- Pin: `tests/server/smell-read-staging-isolate-probe-parity.test.ts`

## Verdict: WORKING ON IT

The row's own verification ran and refused at its own admission gate, before
any probe traffic. The row stays open with the state this lane measured.

## What the run showed

    Error: Staging diagnostic is not armed/cache-disabled; no probe traffic sent
      at read-staging-isolate-probe.mjs:6:77

The instrument reads the staging script's own variable table from the account
API, checks the exact identity of that script, and then refuses unless the
diagnostic is armed and the cache is disabled. The gate is its line 6:

    if(flags.DECKO_EDGE_ISOLATE_PROBE!=='1'||flags.DECKO_EDGE_CACHE!=='0')throw Error('Staging diagnostic is not armed/cache-disabled; no probe traffic sent');

The two variables, measured live today from the same metadata read the
instrument itself makes (script `96895`, `https://culturesmith-b-edge.bunny.run`):

| variable | the gate requires | measured |
|---|---|---|
| `DECKO_EDGE_ISOLATE_PROBE` | `1` | `0` |
| `DECKO_EDGE_CACHE` | `0` | `1` |

Both are in the opposite of the required state, so the gate refused and the
probe sent nothing.

## What was not sent

The probe drives four routes when it is allowed to run:

- `/_probe/cpu?n=5&reps=2`
- `/_probe/db?n=3`
- `/?owned_isolate=<nonce>-a`
- `/?owned_isolate=<nonce>-b`

None of them was requested in this run. The instrument writes its receipt only
after the gate, and the gate refused before that, so no label file was produced
by design.

## The gap, in one mechanism sentence

The staging script's own variable table carries the diagnostic switched off and
the cache switched on, and the instrument's admission gate refuses before any
probe traffic when those two are not in the state the probe needs.

## What would close it

The operator arms the two staging variables, after which the probe re-runs and
the row's own verdict answers the row. This lane did not arm them: that is a
live configuration change on a hosted script, which is outside what a row
adjudication may do.

## What this lane did not do

It made no `.com` request, no deploy, no configuration change and no probe
request. The account key the instrument reads from the operator's secrets file
was never printed and is not in the receipt.

Branch: `port/smell-test-round3-b1-20261024` in KatsuJinCode/decko-ts.
