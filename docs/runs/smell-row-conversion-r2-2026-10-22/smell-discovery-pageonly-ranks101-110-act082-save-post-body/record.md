# Row smell-discovery-pageonly-ranks101-110-act082-save-post-body

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-discovery-pageonly-ranks101-110-act082-save-post-body`
- Instrument: `reference-harness/browser/discovery-pageonly-ranks101-110-act082-save-post-body.mjs`
  (discovery 4 of the ACT-082 set)
- What this lane did: ran the row's own instrument on this lane's tree.
- Command: `node reference-harness/browser/discovery-pageonly-ranks101-110-act082-save-post-body.mjs`
  on `C:/localProjects/decko-ts-smell-convert-r2-20261022` at commit
  `3eca1fe50d567a773a5759ac323d2281bbb5e368`, engine built with
  `node tools/dist/build-engine.mjs` (exit 0).
- Observed: the select is present with value `PlainText`; the Book option is in the DOM
  (`hasBook` true); `selectOption` succeeds and the select then reads `Book_mvkdme6n`; and the
  one witnessed POST body is
  `utf8=...&_method=patch&card[last_action_id_before_edit]=997&card[content]=subject+D4_TypeChange_mvkdme6n&button=`,
  with no `card[type]` in it. The stored row ends at `typeId` 37 with `isBook` false.
- Evidence in this directory: `fresh-steps.json`, the instrument's own capture of the steps
  and the posted body.
- Gap, in one mechanism sentence: the type field's chosen value is dropped from the update
  body, so the card's stored type stays 37 and the card never becomes the cardtype that was
  chosen.

## The shape of the defect, measured here and in the sibling row

This lane's measurement of the same surface in the sibling row
`smell-discovery-pageonly-ranks101-110-act082-form-control-attributes` pins the mechanism
narrower than "the update never carries the type": when the type field is left untouched,
its form does serialize `card[type]` and the change lands; when the select's value is
changed, the changed value is dropped from the body and nothing is stored. The defect is in
the changed-value path of the live type field, not in the form's field set.

## What would close it

An engine-side fix that keeps the changed select value in the serialized update body, and a
re-run of this instrument that then records `card[type]` in the body and a stored type that
matches the chosen cardtype.
