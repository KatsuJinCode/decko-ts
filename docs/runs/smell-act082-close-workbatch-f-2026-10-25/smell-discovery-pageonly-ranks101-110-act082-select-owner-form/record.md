# Row smell-discovery-pageonly-ranks101-110-act082-select-owner-form

Close, 2026-10-25, the workbatch-f lane. Disposition: DONE.

- Roster row: `smell-discovery-pageonly-ranks101-110-act082-select-owner-form`
- Instrument: `reference-harness/browser/discovery-pageonly-ranks101-110-act082-select-owner-form.mjs`
  (discovery 5 of the ACT-082 set)
- Command: `node reference-harness/browser/discovery-pageonly-ranks101-110-act082-select-owner-form.mjs`
  on this lane's tree (branch `port/workbatch-f-20261025`, base c17906db, the v22
  roll), engine built there with `node tools/dist/build-engine.mjs` (exit 0).
- Observed: the owner form's own Save fires - the POST to `/update/D5_TypeChange_mvo8fay6`
  answers 200 - and its body carries the chosen cardtype and the assign field
  (`card[type]=Book_mvo8fay6&assign=true`). The value reads back `Book_mvo8fay6`
  and the stored row ends at `typeId` 912 == `bookId` 912, `isBook` true.
- Evidence in this directory: `fresh-outcome.json`, the instrument's own output.

## What this close is

The same two engine halves the sibling row's close records
(../smell-discovery-pageonly-ranks101-110-act082-save-post-body/record.md):
the show-list delivery (the parser reads the array form `slot[show][]` and the
bare render merges it into `HistoryRenderParams.viewOpts`, so the reload
answers the live type select) and the assignment (the request's `assign` plus
`card[type]` ride `HistoryRenderParams.assignedType`, Ruby's
`standard_uri_fetch` assign_attributes arm, so the reloaded form holds the
chosen value). Round three measured this row as "the port's Save never fires
at all": the reload used to answer the read-only row, whose form carries
neither the type field nor the assign hidden field, and the Save the
instrument clicks belongs to a form that cannot carry the change. With the
delivery in place the owning form is the live one and its Save posts the
change; no instrument-side drive change was needed. The r3 pins
(tests/server/smell-act082-select-owner-form-parity.test.ts) now pin the
delivery's two halves, with the inverse capture fact kept.
