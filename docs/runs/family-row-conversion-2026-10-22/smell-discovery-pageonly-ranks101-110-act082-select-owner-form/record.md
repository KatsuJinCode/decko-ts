# Row smell-discovery-pageonly-ranks101-110-act082-select-owner-form

Family row conversion, 2026-10-22. The row's own verification was re-run at the
shipping candidate; the row is NOT closed.

- Roster row: `smell-discovery-pageonly-ranks101-110-act082-select-owner-form`
  (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `reference-harness/browser/discovery-pageonly-ranks101-110-act082-select-owner-form.mjs`
  (discovery 5 of the ACT-082 set)
- Tree measured: `C:/localProjects/decko-ts-smell-test-measure-20261022` at commit
  `e8b70ad3aa85c75f9247d2cd1af747e4bf740505` (the shipping candidate), engine built there with
  `node tools/dist/build-engine.mjs`; `.runtime/browser-build.json` records
  `sourceDiffSha256` `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
  (the clean-tree git-diff hash).
- Command: `node reference-harness/browser/discovery-pageonly-ranks101-110-act082-select-owner-form.mjs`
  (exit 0; the instrument records observations, it does not grade).
- Evidence in this directory: `outcome.json` (the form ownership map, the click outcome and the
  stored row), `server.log`.

## What the run measured

The owner-select leg still times out: the instrument's `locator.click` on the modal's
`select[name='card[type]']` exceeded 30000 ms, and the `page.waitForResponse` that follows it
timed out as well, so no POST was witnessed (`posts: []`). The type select itself is inside the
right form: the owning form posts to `/update/D5_TypeChange_mvk0zkvi` and its fields are
`utf8`, `_method`, `card[type]`, `assign`, `card[last_action_id_before_edit]`, `card[content]`.
After the drive the value read back was `Book_mvk0zkvi`, and the stored row was still
`typeId` 37, `bookId` 912, `isBook` false.

## Gap, in one mechanism sentence

The owner-select leg of the type change never completes its click and POST, and because the
update body carries no `card[type]` the stored `type_id` stays 37, so the card never becomes the
cardtype the person chose.

## Disposition

`WORKING ON IT`. The verification ran, and it reproduces the row's recorded observation at the
candidate: the owner-select leg times out and the type change does not land. The port does not
measurably match Ruby on this surface, so the row is not closed. Two gaps are named here and
they are not the same gap: the click timeout is the owner-select surface, the stored type is the
type-drop body. The type-drop body is the one the other four ACT-082 discoveries witness.
