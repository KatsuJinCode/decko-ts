# Row smell-discovery-pageonly-ranks101-110-act082-type-select-all-options

Family row conversion, 2026-10-22. The row's own verification was re-run at the
shipping candidate; the row is NOT closed.

- Roster row: `smell-discovery-pageonly-ranks101-110-act082-type-select-all-options`
  (roster file: `C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
- Instrument: `reference-harness/browser/discovery-pageonly-ranks101-110-act082-type-select-all-options.mjs`
  (discovery 2 of the ACT-082 set)
- Tree measured: `C:/localProjects/decko-ts-smell-test-measure-20261022` at commit
  `e8b70ad3aa85c75f9247d2cd1af747e4bf740505` (the shipping candidate), engine built there with
  `node tools/dist/build-engine.mjs`; `.runtime/browser-build.json` records
  `sourceDiffSha256` `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
  (the clean-tree git-diff hash).
- Command: `node reference-harness/browser/discovery-pageonly-ranks101-110-act082-type-select-all-options.mjs`
  (exit 0; the instrument records observations, it does not grade).
- Evidence in this directory: `q1-full-rule-name.json`, `q2-all-options.json` (the full option
  list the type select exposes), `server.log`.

## What the run measured

The type select was found (`found` true) with 33 options and `value` `PlainText`. The option list
holds the plain cardtypes only: RichText, PlainText, Markdown, Phrase, HTML, Number, Toggle,
Date, and the rest of the stock list. The Book cardtype the run created in the deck
(`Book_mvk0w3po`) is not among them, so the instrument's candidate option is `null`.

## Gap, in one mechanism sentence

The board type row's type select is filled with the stock cardtypes only, so a cardtype created
through the app is never offered there and can never be chosen.

## Disposition

`WORKING ON IT`. The verification ran at the candidate and still measures the missing candidate
option the row records, so the port does not measurably match Ruby on this surface and the row
is not closed.
