# Row smell-discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create

Family row conversion, 2026-10-22. The row's own verification was re-run at the
shipping candidate; the row is NOT closed.

- Roster row: `smell-discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create`
  (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `reference-harness/browser/discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create.mjs`
  (discovery 3 of the ACT-082 set)
- Tree measured: `C:/localProjects/decko-ts-smell-test-measure-20261022` at commit
  `e8b70ad3aa85c75f9247d2cd1af747e4bf740505` (the shipping candidate), engine built there with
  `node tools/dist/build-engine.mjs`; `.runtime/browser-build.json` records
  `sourceDiffSha256` `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
  (the clean-tree git-diff hash).
- Command: `node reference-harness/browser/discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create.mjs`
  (exit 0; the instrument records observations, it does not grade).
- Evidence in this directory: `before-after-options.json` (the option count before and after the
  create), `outcome.json` (the chosen value, the witnessed POST and the stored row), `server.log`.

## What the run measured

The create leg works: the Book cardtype is created (200, id 912, `type_id` 3) and the type
select grows from 33 options to 34, and the new option IS present afterwards (`hasBook` true), so
the list does refresh after a create through the app. The update leg does not: the chosen value
read back is `null`, the witnessed POST is `/update/D3_TypeChange_mvk0vj0` with status 200, and
the stored row is still `type_id` 37 with `isBook` false.

## Gap, in one mechanism sentence

The refreshed type select still loses the chosen value on submit, so the update stores
`type_id` 37 and the card never becomes the cardtype the person picked.

## Disposition

`WORKING ON IT`. The verification ran at the candidate and still measures the ACT-082 type-drop
signature, so the port does not measurably match Ruby on this surface and the row is not closed.
