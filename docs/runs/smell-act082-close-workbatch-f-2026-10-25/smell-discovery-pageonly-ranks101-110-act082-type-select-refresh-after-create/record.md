# Row smell-discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create

Close, 2026-10-25, the workbatch-f lane. Disposition: DONE.

- Roster row: `smell-discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create`
- Instrument: `reference-harness/browser/discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create.mjs`
  (discovery 3 of the ACT-082 set)
- Command: `node reference-harness/browser/discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create.mjs`
  on this lane's tree (branch `port/workbatch-f-20261025`, base c17906db, the v22
  roll), engine built there with `node tools/dist/build-engine.mjs` (exit 0).
- Observed: the create leg works and the refresh half still works - the type
  select grows from 33 options to 34 with the created Book cardtype present
  (`before-after-options.json`). The submit half now holds the chosen value:
  the chosen value reads `Book_mvo8edi2` (not null), the POST to
  `/update/D3_TypeChange_mvo8edi2` answers 200, and the stored row is
  `storedTypeId` 912 == `bookId` 912 - the card's stored type is the cardtype
  that was created.
- Evidence in this directory: `outcome.json` and `before-after-options.json`,
  the instrument's own outputs.

## What this close is

The same two engine halves the sibling row's close records
(../smell-discovery-pageonly-ranks101-110-act082-save-post-body/record.md):
the show-list delivery (the parser reads the array form `slot[show][]` and the
bare render merges it into `HistoryRenderParams.viewOpts`) and the assignment
(the request's `assign` plus `card[type]` ride
`HistoryRenderParams.assignedType`, Ruby's `standard_uri_fetch`
assign_attributes arm). Round three measured "only the source keeps the chosen
value through the submit"; the submit half is the delivery's, and this run's
receipt records both halves green on the port. The r3 pins
(tests/server/smell-act082-type-select-refresh-after-create-parity.test.ts)
now pin the delivery's two halves, with the inverse capture fact kept.
