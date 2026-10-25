# smell-retire-owned-migration-credential

- The row's own label: `smell/probe script retire-owned-migration-credential.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/retire-owned-migration-credential.mjs`
  (sha256 `715841eb90e80165b6cf31c6a5f9c41c51769221f23e0ffd34e7e61b0917d757`)
- What this lane did: read the instrument's custody facts, then ran the row's
  own instrument.
- Command: `node retire-owned-migration-credential.mjs` (exit 1)
- Capture: `fixtures/captured/smell-row-r5b-2026-10-24/smell-retire-owned-migration-credential.json`
- Pin: `tests/server/smell-retire-owned-migration-credential-parity.test.ts`

## Verdict: WORKING ON IT

The row's own verification ran and refused at its own custody comparison, one
line before the removal it performs. Nothing was removed, and the row stays
open with the gap this lane measured.

## What the run showed

    Error: Successful owned migration and exact credential custody required
      at retire-owned-migration-credential.mjs:4:100

The instrument's guard is its line 4:

    if(!apply.pass||!hosted.pass||access.credentialPath!==expected||!access.credentialGitIgnored)throw Error('Successful owned migration and exact credential custody required');

Three of its four conditions hold, and the fourth is the one that fails. The
prepared-access record of record names the credential here:

| | |
|---|---|
| the instrument's constant (`expected`) | `C:/localProjects/decko-edge-verification-53c86269/.runtime/owned-cs-edge-cleanup-20261018.env` |
| the prepared-access record's `credentialPath` | `C:/localProjects/decko-ts-release-lead/.runtime/owned-cs-edge-cleanup-20261018.env` |
| the constant's path on disk | absent |
| the prepared record's path on disk | present |
| `apply.pass` | true |
| `hosted.pass` | true |
| `credentialGitIgnored` | true |

So the instrument refused because the record and the constant disagree about
which path the credential is at, and it refused one line before the unlink it
performs, so this run removed nothing.

## What the artifacts of record say

The retirement itself already happened on 2026-10-18. The receipt of record,
`hosted-edge-current/owned-access-retired.json`, carries `fileRemoved: true`
at 2026-10-18T21:42:26Z and names the constant's path, and the apply receipt
of the authorized change carries `pass: true` with `contentWritten: true` at
2026-10-18T21:35:53Z.

So the row's original subject, the credential that the migration used at the
constant's path, is gone. What is present today is a credential file at the
other path, prepared later, and the instrument's own constant does not name
it.

## The gap, in one mechanism sentence

The prepared-access record names the credential at a path the instrument's
custody constant does not, so the instrument refuses before it can retire the
credential that is actually present.

## What would close it

Either the constant is re-pointed at the path the prepared-access record
names, which is a code change in the probes tree, or an operator decides that
the credential file at that other path is the one to retire. The second is an
operator decision: it removes a live account credential, and this lane did not
make it.

There is a second refusal behind that one: the instrument writes its receipt
with the exclusive-create flag into `hosted-edge-current/`, where the receipt
of record already exists, so even a successful run could not write a fresh
receipt there.

## What this lane did not do

It did not remove any file, did not read the credential's contents, did not
re-point the constant, and did not make a `.com` request.

Branch: `port/smell-test-round3-b1-20261024` in KatsuJinCode/decko-ts.
