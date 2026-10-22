# Row smell-discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields

Family row conversion, 2026-10-22. The row's own verification was re-run at the
shipping candidate; the row is NOT closed.

- Roster row: `smell-discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields`
  (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `reference-harness/browser/discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields.mjs`
- Tree measured: `C:/localProjects/decko-ts-smell-test-measure-20261022` at commit
  `e8b70ad3aa85c75f9247d2cd1af747e4bf740505` (the shipping candidate), engine built there with
  `node tools/dist/build-engine.mjs`; `.runtime/browser-build.json` records
  `sourceDiffSha256` `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
  (the clean-tree git-diff hash).
- Command: `node reference-harness/browser/discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields.mjs`
  (exit 0; the instrument records observations, it does not grade).
- Evidence in this directory: `q2-board-links.json` (the board's own type-row links),
  `q2-after-type-row-click.json` (the state after the type row's link is clicked, including the
  type field's own options), `q1-structure-rule-form.json` (the `*type+*structure` rule form),
  `server.log`.

## What the run measured

The type row's link renders on the board: one `edit` link to
`/Disc_TypeChange_mvk0ybsr/board_type_formgroup` next to the card's type name. After that link
is clicked the type field is a `SELECT` named `card[type]` whose value is `PlainText` and whose
option list holds exactly eight entries: RichText, PlainText, Markdown, Phrase, HTML, Number,
Toggle, Date. The cardtype created through the app in this run is not among them, and the
`card[type_id]` input the same page carries holds 481 (PlainText).

## Gap, in one mechanism sentence

The board type row's type select is filled with the plain cardtypes only, so a cardtype created
through the app can never be chosen there and the card's stored type can never leave 37.

## Disposition

`WORKING ON IT`. The verification ran and still measures the missing-candidate gap the row
records, so the port does not measurably match Ruby on this surface and the row is not closed.
