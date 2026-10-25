# Row smell-discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create`
- Instrument: `reference-harness/browser/discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create.mjs`
  (discovery 3 of the ACT-082 set)
- What this lane did: ran the row's own instrument on this lane's tree.
- Command: `node reference-harness/browser/discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create.mjs`
  on `C:/localProjects/decko-ts-smell-convert-r2-20261022` at commit
  `3eca1fe50d567a773a5759ac323d2281bbb5e368`, engine built with
  `node tools/dist/build-engine.mjs` (exit 0).
- Observed: the create leg works (the Book cardtype is created, status 200, id 912,
  `type_id` 3). The type select then grows from 33 options to 34 with the new option present
  (`hasBook` true), while its value is still `PlainText`. The update leg then loses the
  chosen value: the chosen value reads null, the POST to `/update/D3_TypeChange_...`
  answers 200, and the stored row is still `typeId` 37 with `bookId` 912.
- Evidence in this directory: `fresh-outcome.json`, the instrument's own output.
- Gap, in one mechanism sentence: the refreshed type select still loses the chosen value on
  submit, so the update answers 200 without changing the card's stored type.

## The two halves of this measurement

The refresh half works: the new cardtype reaches the select without a page reload, which is
what the sibling row `smell-discovery-pageonly-ranks101-110-act082-type-select-all-options`
does not see. The submit half does not: the chosen value is null at the moment of submit,
and the body that reaches the server does not carry the type. The sibling row
`smell-discovery-pageonly-ranks101-110-act082-save-post-body` measured the same dropped
value from the other direction, where the select was set successfully and the body still
came without `card[type]`. The two measurements name the same engine defect from two
sides.

## What would close it

An engine-side fix that keeps the chosen value in the serialized update body, then a re-run
of this instrument that records a chosen value that is not null and a stored type that
matches the cardtype that was created.
