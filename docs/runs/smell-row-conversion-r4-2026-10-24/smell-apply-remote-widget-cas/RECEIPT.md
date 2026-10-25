# smell-apply-remote-widget-cas

- The row's own label: `smell/probe script apply-remote-widget-cas.mjs`
- The instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/apply-remote-widget-cas.mjs`
- The evidence tree the instrument writes into:
  `.../private-tool-repairs-20261018/remote-widget-cas/`
- What this lane did: ran the row's own instrument, read the plan it admits against and the
  receipt of the write it already executed, and compared them.
- Commands:
  - `node apply-remote-widget-cas.mjs` (from the instrument's own directory)
    (exit 1; the run stopped at the credential read, before any request)
  - `node tools/smell-row-r4/distill-remote-widget-cas.mjs C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/remote-widget-cas fixtures/captured/smell-row-r4-2026-10-24/apply-remote-widget-cas.json .runtime/r4-apply-remote-widget-cas.out`
    (exit 0; wrote the capture)
- Evidence in this directory's sibling fixtures:
  `fixtures/captured/smell-row-r4-2026-10-24/apply-remote-widget-cas.json`.

## Verdict: WORKING ON IT, with three first-hand reasons the row's verification cannot be produced

The row's verification is a compare-and-swap write of twelve authorized card contents to the
production database. It cannot be produced now, for three separate reasons, each measured here:

1. **The owned credential is not on this machine.** The instrument reads
   `C:/localProjects/decko-edge-verification-53c86269/.runtime/owned-cs-edge-cleanup-20261018.env`
   at its line 6, and the run stops there:

       Error: ENOENT: no such file or directory, open
       'C:\localProjects\decko-edge-verification-53c86269\.runtime\owned-cs-edge-cleanup-20261018.env'
           at parse (file:///C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/apply-remote-widget-cas.mjs:6:41)

   The read is before the fetch, so this lane made no live request to the production database.
   No copy of that file exists elsewhere in the operator's project tree either.
2. **The instrument is one-shot by construction.** It writes `apply-intent.json` with the
   exclusive-create flag (line 9), and that file is in the evidence tree from the executed
   run, so a second run with a credential would stop there as well.
3. **The admission cannot hold twice.** The statement admits on `matches = 12` (the twelve rows
   still carrying their before content) and on `version = 52` with one version row. The
   executed run wrote those twelve contents and moved the version from 52 to 64, so the same
   statement would now be refused by its own guard.

## The write that already executed, and its receipt of record

`remote-widget-cas/apply-receipt.json` is the record of record and it says the write passed:

| field | value |
|---|---|
| at | 2026-10-18T21:35:53.298Z |
| pass | true |
| returnedWriteRows / reportedAffectedRows | 12 / 12 |
| allTwelveAfterMatch | true |
| otherFieldsUnchanged | true |
| monotonicVersionMatches | true |
| casRefused / contentWritten | false / true |
| versionBefore -> versionsAfter | 52 -> [{ id: 1, version: 64 }] |

The plan authorizes it ("Existing explicit Julian approval") and scopes it to the exact twelve
content cells, with no `.com` access and no schema, history, name, type or timestamp change.

## Gap, in one mechanism sentence

The row's verification is a live production compare-and-swap write whose admission has already
been consumed (the version moved from 52 to 64 and the twelve contents were replaced), whose
instrument is one-shot by its own exclusive-create flag, and whose owned credential was
deliberately retired, so re-running it needs a newly minted production credential that is the
operator's decision and not this lane's.

## What would close it

A decision by the operator on whether the authorized content write needs to be repeated at
all, and, if it does, a newly minted owned credential for the production database. The
instrument's own admission would then refuse the write anyway, because the content and the
version it admits on have moved, so a fresh plan would be needed as well.

## What this lane did NOT do

This lane made no live request to the production database, minted no credential, wrote no
content cell, and did not re-run the executed write. The receipt of record was read, not
replaced.

Branch: `port/smell-test-round2-20261024` in KatsuJinCode/decko-ts.
