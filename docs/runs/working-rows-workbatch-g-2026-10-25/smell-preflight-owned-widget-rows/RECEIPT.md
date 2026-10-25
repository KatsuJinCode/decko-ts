# smell-preflight-owned-widget-rows

- The row's own label: `smell/probe script preflight-owned-widget-rows.mjs`
- Instrument:
  `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/preflight-owned-widget-rows.mjs`
- Roster verdict at the time of this lane: NOT-RUNNABLE, bucket WORKING ON IT,
  blocker WORKING ON IT (re-measured 2026-10-23, round two).
- This lane's disposition: NAMED, not closed. The row's verification is a live
  query against the shared production database, which no lane may make.

## What this lane re-verified first hand, in this session

- The instrument reads the operator credential file
  `C:/localProjects/brandonDojoTech/library/data/creds` and the custody record
  `hosted-edge-current/owned-database-custody.json`, refuses to proceed unless
  the custody record's database read names `cs-edge-deck` with a 200 status
  and matching library and historical urls, and only then POSTs read-only SQL
  (the twelve-row select, the active-legacy-widget count and the version read)
  to the live database's HTTP query endpoint (its own lines 3-8).
- The instrument's one-shot output,
  `hosted-edge-current/owned-widget-rows-preflight.json`, stands in the
  evidence tree (this session's path read), so the output of record exists
  from the original run.

## The mechanism that blocks the close

The row's answer is produced by querying the production database that the
site's readers share. A lane's live-host allowance is one batched confirmation
fetch per URL at the end of a lane, never a production SQL query; spending a
read on the shared production database is an operator decision, not a lane's.
The original run's preflight output already stands as the recorded answer;
re-deriving it now would answer a question about today's production state,
which is exactly the spend that needs the operator's yes.

## What this lane did not do

It read no credential file content, made no database request, and did not
touch the recorded preflight output.

Branch: `port/workbatch-g-20261025` in KatsuJinCode/decko-ts, base
`deploy/full-candidate-20261101` tip `c17906db`.
