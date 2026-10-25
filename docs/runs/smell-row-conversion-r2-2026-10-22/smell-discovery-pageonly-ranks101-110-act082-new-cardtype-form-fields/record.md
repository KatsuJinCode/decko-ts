# Row smell-discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields`
- Instrument: `reference-harness/browser/discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields.mjs`
  (discovery 1 of the ACT-082 set)
- What this lane did: ran the row's own instrument on this lane's tree, and attempted the
  same instrument against the Ruby oracle to get the source-side measurement.
- Commands:
  - `node reference-harness/browser/discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields.mjs`
    on `C:/localProjects/decko-ts-smell-convert-r2-20261022` at commit
    `3eca1fe50d567a773a5759ac323d2281bbb5e368`, engine built with
    `node tools/dist/build-engine.mjs` (exit 0).
  - the same instrument in a copy of the tree at the same commit with one constant changed
    (`engines/ts.json` to `engines/ruby.json`), against the Ruby oracle booted on Ruby
    3.3.12 (the machine's own gem home), which did not complete.
- Observed, port side: the type row's link renders and after the click the type field is a
  `SELECT` named `card[type]` with value `PlainText` and exactly eight options
  (`RichText`, `PlainText`, `Markdown`, `Phrase`, `HTML`, `Number`, `Toggle`, `Date`); the
  cardtype created through the app is not among them. The form that owns the select posts to
  `/update/Disc_TypeChange_...` and carries `utf8`, `_method`, `card[type]`, `assign`,
  `card[last_action_id_before_edit]`, `card[content]`.
- Evidence in this directory: `fresh-after-type-row-click.json`, the instrument's own
  capture of the after-click state.
- Observed, source side: the instrument cannot be run against the Ruby oracle as written.
  Its create leg navigates to `/new/Cardtype?card[name]=Disc_Book_...`, and the Ruby
  application does not complete that navigation, so the leg never reaches the state this row
  measures. The type-select option values are also named differently by the two engines, so
  the two legs are not comparable without a fixture translation that does not exist yet.
- Gap, in one mechanism sentence: the type select is filled with the eight stock cardtypes
  only, so a cardtype created through the app can never be chosen there, and the source-side
  measurement that would say whether the source behaves the same is still missing because
  the instrument's create leg does not run on the Ruby application.

## What would close it

A source-side measurement of the same surface: either a fixture the instrument can drive on
the Ruby application, or a Ruby-side capture rig of the type select's option set, so that the
port's eight-option list can be compared with the source's.
