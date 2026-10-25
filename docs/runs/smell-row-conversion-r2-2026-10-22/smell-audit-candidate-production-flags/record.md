# Row smell-audit-candidate-production-flags

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-audit-candidate-production-flags` (roster file:
  `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `C:/localProjects/brandonDojoTech/recovery/release/private-probes/private-tool-repairs-20261018/audit-candidate-production-flags.mjs`
- What this lane did: read the instrument and established which of its dependencies are now in
  place and which of its steps are live account calls that this lane does not make.
- Command: not run; the instrument's two script reads are live account API calls.
- Observed, first hand: the module the instrument imports resolves, because
  `C:/localProjects/decko-edge-verification-53c86269/tools/edge-signed-in-exercise/lib/local-policy.mjs`
  exists in the restored pinned checkout. The account credential the instrument reads is
  present by name in `C:/localProjects/brandonDojoTech/library/data/secrets.env` (the key name
  `BUNNY_ACCOUNT_API_KEY`; no value was read into any output, and none is recorded here). The
  instrument then issues two live `api.bunny.net` reads, one for script id 96895 and one for
  script id 96867, and compares four harness-effective flags against the expected candidate
  configuration.
- Gap, in one mechanism sentence: past its own gate the instrument makes two account-level
  live API calls against the operator's Bunny account, and the answer it produces is the
  current state of the live scripts rather than a property of the port, so it is not this
  lane's call to make.

## The measured verdict that is already on disk

A dependency-restoration lane ran this instrument on 2026-10-20 and its receipt is in the
repository at `C:/localProjects/brandonDojoTech/tmp/smell-dep-restore-20261020/verdicts.json`
under the row id `smell-audit-candidate-production-flags`. Its verdict is a real FAIL, not a
missing dependency: the reads succeeded and the instrument then refused with
`Error: Expected harness setting changed`, because the live scripts no longer carry the
four-flag candidate configuration that the October 19 repair receipts recorded. This lane did
not repeat those live calls, so that verdict is cited as a prior measurement and is not
re-verified here.

## The one-shot design

The instrument writes its receipt with the exclusive-create flag under the label it is given,
so a fresh label is accepted and a repeated label is refused. That is the only remaining
obstacle after the operator accepts a live account call.

## What this lane did not do

This lane made no live Bunny API call, read no account credential value, and wrote no receipt
under the instrument's own names.
