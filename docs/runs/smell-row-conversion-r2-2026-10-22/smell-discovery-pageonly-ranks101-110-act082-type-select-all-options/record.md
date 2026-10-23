# Row smell-discovery-pageonly-ranks101-110-act082-type-select-all-options

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-discovery-pageonly-ranks101-110-act082-type-select-all-options`
- Instrument: `reference-harness/browser/discovery-pageonly-ranks101-110-act082-type-select-all-options.mjs`
  (discovery 2 of the ACT-082 set)
- What this lane did: ran the row's own instrument on this lane's tree.
- Command: `node reference-harness/browser/discovery-pageonly-ranks101-110-act082-type-select-all-options.mjs`
  on `C:/localProjects/decko-ts-smell-convert-r2-20261022` at commit
  `3eca1fe50d567a773a5759ac323d2281bbb5e368`, engine built with
  `node tools/dist/build-engine.mjs` (exit 0).
- Observed: the type select is found with 33 options and value `PlainText`, and the Book
  cardtype that exists in the deck (`Book_mvkdmycj`) is not among the options, so the
  candidate option is null. The owning form posts to `/update/...` and carries `card[type]`
  among its fields; the submit controls are the two `Save` buttons and the `Cancel` button.
- Evidence in this directory: `fresh-all-options.json`, the instrument's own capture of the
  option set.
- Gap, in one mechanism sentence: the type select is filled with the stock cardtypes only, so
  a cardtype created through the app is never offered there and the person cannot choose it.

## Where the sibling row differs, and why that is a separate gap

The sibling row `smell-discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create`
measured in this session that after a cardtype is created through the app the select grows
from 33 to 34 options and the new option is present. So the option set is not frozen; it is
one refresh behind the deck. This row measures the set before that refresh, and its gap is
that the person has to create the cardtype and then reload the page before the type select
offers it.

## What would close it

A source-side measurement of the same option set, so that "the select is one refresh behind
the deck" can be compared with the source's behaviour, and an engine change that lets the
select offer the new cardtype without a page reload.
