# smell-prepare-remote-widget-cas

- The row's own label: `smell/probe script prepare-remote-widget-cas.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/prepare-remote-widget-cas.mjs`
  (sha256 `14378aeb45fa6fde8a0cbfd7cc5b81567e962b7ec0f3ded4bdf5df4cf870da16`)
- What this lane did: read the instrument's own source, and read the artifacts it
  wrote on 2026-10-18. It did not run it, for the two reasons below.
- Capture: `fixtures/captured/smell-row-r5b-2026-10-24/prepare-remote-widget-cas.json`
- Pin: `tests/server/smell-prepare-remote-widget-cas-parity.test.ts`

## Verdict: WORKING ON IT

The row's own verification did not run on this lane, and the row stays open with
the two reasons measured here.

## Why the instrument was not run

**One: the first act is live traffic to the cs-edge database.** The instrument's
`sql()` helper posts the read statements to the `CSEDGE_DB_URL` pipeline
endpoint, and the tool reads that URL and its read-only token from the
operator's credentials file. The instrument's own line 5 is the request:

    const r=await fetch(creds.CSEDGE_DB_URL.replace(/^libsql:/,'https:').replace(/\/+$/,'')+'/v2/pipeline',{method:'POST'

An agent lane must not make live database traffic to that database, and the
row's own roster entry carries the same rule as its first sufficient reason.

**Two: the one-shot outputs already exist.** The instrument writes the before
image with the exclusive-create flag, and that file is already there:

    const backupFile=path.join(root,'before.json');fs.writeFileSync(backupFile,JSON.stringify(backup,null,2),{flag:'wx'});

So a run would spend the live traffic first and then fail on an existing file.
The artifacts that are on disk, all written on 2026-10-18:

| artifact | bytes | written |
|---|---|---|
| `remote-widget-cas/before.json` | 18875 | 2026-10-18T14:35 |
| `remote-widget-cas/plan.json` | 21806 | 2026-10-18T14:35 |
| `remote-widget-cas/after.json` | 6847 | 2026-10-18T14:35 |
| `remote-widget-cas/apply-receipt.json` | 1312 | 2026-10-18T14:35 |
| `remote-widget-cas/hosted-content-view-readback.json` | 6322 | 2026-10-18T14:38 |
| `remote-widget-cas/hosted-card-*.html` | 12 files | 2026-10-18T14:38 |

## What the artifacts say about the change itself

The apply receipt of record carries `pass: true` and `contentWritten: true` at
2026-10-18T21:35:53Z, and the hosted content readback carries `pass: true` over
twelve rows at 2026-10-18T21:38:09Z. The content change this row prepares was
therefore applied and verified, and the row's remaining question is not whether
the change works but whether a preparation run may be repeated at all.

## What would close it

Either an operator ruling that the live preparation may be re-run against the
cs-edge database, or a fresh output directory and label so the preparation can
be produced without touching the artifacts of record. Until one of those
happens the row cannot close on its own verification, because its own
verification cannot be run by a lane.

## What this lane did not do

It did not open the cs-edge database, did not read any credential value, did not
write into the probes tree, and did not request a `.com` address.

Branch: `port/smell-test-round3-b1-20261024` in KatsuJinCode/decko-ts.
