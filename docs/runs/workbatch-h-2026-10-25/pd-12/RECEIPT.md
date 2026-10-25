# pd-12: the live deployment's files area, named at the operator gate

- The row's own label: "the authorized staged-first deployment with exact
  active code/config/database binding readback, and hosted acceptance"
- The tree: `c17906dbb39220a3dd1bcd58847d0fa0d1c9696b`.

## Verdict: named, not closed. The live deployment is refused until an
## operator arms its files area, and nothing here deploys.

## The mechanism, in one sentence

The deploy of 2026-10-20 ran the staged-first guarded deploy and deployed
and verified staging (96895, bundle 45d1ead3, release 1194138 to 1196260,
activated, the deployed code's SHA-256 matching the candidate, the canonical
four pages answering 200 with the engine's Server-Timing, the four flags
surviving), and REFUSED the live pair (96867) with zero writes, because the
files-area pair is not armed.

## What the row's own receipt says

The roster entry carries the receipts of that night: the staging receipt
(`tmp/deploy-night-20261020/receipt-staging-96895.json`) and the refusal
verdict (`tmp/deploy-night-20261020/verdict-2026-10-20-live-refused-staging-files-area-pair-not-armed.json`).
The live host was left at release 1194026.

## Why this lane cannot close it

Arming the files area is an operator action on the live deployment's
configuration, and this lane deploys nothing. The same pair is what the
carrierwave row's 500 needed: the lane's own drive of the multipart create
against the bundle built at this tree shows the write path storing the bytes
when the files area is configured and the save failing with the host's own
files-area sentence when it is not (see
`docs/runs/promised-deliverable-workbatch-h-20261025/mods-carrierwave-attachment-write-path-500-on-bytes/RECEIPT.md`).

## What would close it

1. the operator arms the files-area pair on the live deployment;
2. the guarded deploy re-runs to live, and the live's exact code, config and
   database binding readback lands;
3. the hosted acceptance battery runs against the live bundle and lands.

## What this lane did not do

It did not deploy, did not change any deployment's configuration, did not arm
the files area, and made no request to any hosted edge.
