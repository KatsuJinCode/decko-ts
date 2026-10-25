# Row smell-discovery-pageonly-ranks101-110-act082-form-control-attributes

Family row conversion, 2026-10-22. The row's own verification was re-run at the
shipping candidate; the row is NOT closed.

- Roster row: `smell-discovery-pageonly-ranks101-110-act082-form-control-attributes`
  (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `reference-harness/browser/discovery-pageonly-ranks101-110-act082-form-control-attributes.mjs`
  (discovery 6 of the ACT-082 set)
- Tree measured: `C:/localProjects/decko-ts-smell-test-measure-20261022` at commit
  `e8b70ad3aa85c75f9247d2cd1af747e4bf740505` (the shipping candidate), engine built there with
  `node tools/dist/build-engine.mjs`; `.runtime/browser-build.json` records
  `sourceDiffSha256` `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
  (the clean-tree git-diff hash), so the engine that answered is the candidate's own build.
- Command: `node reference-harness/browser/discovery-pageonly-ranks101-110-act082-form-control-attributes.mjs`
  (exit 0; the instrument records observations, it does not grade).
- Evidence in this directory: `outcome.json` (the BEFORE-submit form HTML and select attributes
  as the instrument dumped them, plus the submit outcome and the stored row), `server.log`.

## What the run measured

The board type row's edit form does render a usable type control: a `SELECT` named `card[type]`
with `value` `Book_mvk0x3ej`, not disabled, carrying the same `name="card[type]"` the other
rows' forms use, inside the form that posts to `/update/D6_TypeChange_mvk0x3ej`. The submit
itself never completed: the instrument's `page.waitForResponse` timed out after 30000 ms, no
POST was observed (`posts: []`), and the stored row was still `type_id` 37 with `isBook` false.

## Gap, in one mechanism sentence

The type row's update never carries the chosen type, so the card's stored `type_id` stays 37
(PlainText) and the card never becomes the Book cardtype the person selected.

## Disposition

`WORKING ON IT`. The row's verification ran, and it still measures the ACT-082 type-drop
signature, so the port does not measurably match Ruby on this surface and the row is not
closed. The evidence here is the fresh measurement; the fix is engine work on the type row's
update body (the same signature the `save-post-body` and `type-select-refresh-after-create`
discoveries capture).
