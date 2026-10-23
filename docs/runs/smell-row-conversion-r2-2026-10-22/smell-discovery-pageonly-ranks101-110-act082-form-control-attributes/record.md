# Row smell-discovery-pageonly-ranks101-110-act082-form-control-attributes

Smell-test row conversion, round two, 2026-10-22. Disposition: DONE.

- Roster row: `smell-discovery-pageonly-ranks101-110-act082-form-control-attributes`
- Instrument: `reference-harness/browser/discovery-pageonly-ranks101-110-act082-form-control-attributes.mjs`
  (discovery 6 of the ACT-082 set)
- What this lane did: ran the row's own instrument twice in this session, once on this lane's
  tree and once on the shipping candidate, and compared both against the expectation the
  repository itself records for this surface.
- Commands:
  - `node reference-harness/browser/discovery-pageonly-ranks101-110-act082-form-control-attributes.mjs`
    on `C:/localProjects/decko-ts-smell-convert-r2-20261022` at commit
    `3eca1fe50d567a773a5759ac323d2281bbb5e368` (this lane's tip), engine built there with
    `node tools/dist/build-engine.mjs`; `.runtime/browser-build.json` records
    `sourceDiffSha256` `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`,
    the clean-tree hash, so the engine that answered is that tree's own build.
  - the same command on `C:/localProjects/decko-ts-smell-r2-candidate-ab-20261022` at commit
    `e8b70ad3aa85c75f9247d2cd1af747e4bf740505` (the shipping candidate), engine built there the
    same way, as an A/B leg so the two trees are measured under identical conditions.
- Observed, both runs: the type control renders as a `SELECT` named `card[type]`, not
  disabled, inside the form that posts to `/update/D6_TypeChange_...`; the submit answers
  200; the posted body carries `card[type]=Book_...` and `assign=true`; and the stored row
  ends with `storedTypeId` 912 and `isBook` true, which is the card's stored type becoming
  the Book cardtype.
- Evidence in this directory: `fresh-outcome-family-branch.json` and
  `fresh-outcome-candidate-ab.json`, the instrument's own outputs from the two runs.

## The expectation this is measured against

The repository records the expectation for this surface in its own capability sheet,
`tools/edge-signed-in-exercise/capabilities.json`, entry `E12`: the capability is "Edit type of
a card in the board", its source is the Ruby specification `cypress edit/edit_type 'edit type
in board'`, and its check reads "a card's type can be changed in the board (the card's
stored type becomes Book)". Both runs satisfy that check exactly.

## Why the recorded gap is not carried forward

The row was recorded as `WORKING ON IT` with the sentence that the type row's update never
carries the chosen type, on a candidate measurement in which the submit never completed
(`waitForResponse` timed out after 30000 ms, no POST observed, the stored row still `type_id`
37). That observation did not reproduce here: two runs, on two different trees, each with its
own clean build, both completed the submit and both landed the type change. The 2026-10-20
record already in this row's prior state agrees with this lane's two runs: it recorded the
POST answering 200 with the stored card a Book afterwards.

The defect the ACT-082 set does carry is a different one, and it is measured in the sibling
rows: when the select's value is changed, the changed value is dropped from the update body
(`smell-discovery-pageonly-ranks101-110-act082-save-post-body` and
`smell-discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create`). This row's
subject, the type control's form ownership and its attributes, is measured green.

## What this receipt does and does not claim

This receipt claims that the type control is rendered usable, that its own form carries
`card[type]`, and that the update lands the chosen type on two trees. It does not claim that
the ACT-082 set is free of defects: the changed-value path is still broken, as the two
sibling rows record.
