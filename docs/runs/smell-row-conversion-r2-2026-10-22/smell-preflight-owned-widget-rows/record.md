# Row smell-preflight-owned-widget-rows

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-preflight-owned-widget-rows`
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/preflight-owned-widget-rows.mjs`
- What this lane did: read the instrument and established what it would do, and which of its
  dependencies are in place.
- Command: not run; the instrument queries the live production database.
- Observed, first hand: the instrument reads the credential file
  `C:/localProjects/brandonDojoTech/library/data/creds` and the custody record
  `hosted-edge-current/owned-database-custody.json`, refuses to proceed unless the custody
  record names the live database `cs-edge-deck` and its read matches the library and the
  historical record, and then posts read-only SQL to that database before it writes its
  own output. Its one-shot output, `hosted-edge-current/owned-widget-rows-preflight.json`,
  is present in the evidence tree, so the output of record already exists.
- Gap, in one mechanism sentence: the row's verification is a live query against the
  production database that Brandon's readers share, and this lane's live-host allowance is
  one batched confirmation fetch per URL at the end of the lane, not a production SQL
  query, so the row's answer cannot be produced here.

## What would close it

An operator decision to spend one read on the live database for this row, with the
one-shot output path cleared, or an instrument that runs the same query against the
restored local copy of the same deck.
