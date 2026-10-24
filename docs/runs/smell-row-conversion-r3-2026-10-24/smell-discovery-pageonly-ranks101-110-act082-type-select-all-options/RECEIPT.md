# smell-discovery-pageonly-ranks101-110-act082-type-select-all-options

- The row's own label: `smell/probe script discovery-pageonly-ranks101-110-act082-type-select-all-options.mjs`
- The instrument:
  `reference-harness/browser/discovery-pageonly-ranks101-110-act082-type-select-all-options.mjs`
- What this lane did: ran the row's own instrument on this lane's tree
  against BOTH legs, the port and the pinned Ruby oracle, and compared the
  two option sets.
- Command (each leg): `node tools/smell-act082-legs/run-leg.mjs
  discovery-pageonly-ranks101-110-act082-type-select-all-options.mjs
  <ts|ruby33> <out-dir>`, which copies the probe with its one
  engine-manifest line rewritten and runs the probe's own body UNCHANGED, so
  the only difference between the two captures is the engine.
- The engine was built first (`node tools/dist/build-engine.mjs`, exit 0).
- Evidence in this directory's sibling fixtures:
  `fixtures/captured/smell-act082-r3-2026-10-24/type-select-all-options-ts.json`
  and `.../type-select-all-options-ruby33.json`.

## Verdict: DONE

Both legs agree, and the row's own question is the type select's OPTION SET.

The probe opens the board's type row and reads every option the select
offers. On BOTH legs:

- the select is found, with value `PlainText` and exactly 33 options;
- the 33 options are the SAME 33, in the SAME order (`RichText`, `PlainText`,
  `Markdown`, `Phrase`, `HTML`, `Number`, `Toggle`, `Date`, `URI`, `File`,
  `Image`, `Brief`, `Memo`, `Note`, `Tag`, `Topic`, `List`, `Pointer`,
  `Search`, `Link list`, `Nest list`, `Notification template`,
  `Email template`, `Cardtype`, `User`, `Role`, `Layout`, `Skin`, `CSS`,
  `SCSS`, `JSON`, `JavaScript`, `CoffeeScript`);
- the cardtype the probe created through the app is in the deck on both legs
  and in NEITHER leg's option list, so the candidate option is null on both;
- the form that owns the select is the same on both legs: the same action
  (`/update/<card>`), the same field set (`utf8`, `_method`, `card[type]`,
  `assign`, `card[last_action_id_before_edit]`, `card[content]`), and the
  same submit controls.

The row's prior text said the gap was that "the type select is filled with
the plain cardtypes only, so a cardtype created through the app can never be
chosen there", and it noted the sibling refresh row measured that the new
option does arrive after a create, so the set is one refresh behind the deck.
Both of those are the SOURCE's behavior too: the source's select carries the
same 33 options and does not offer the created cardtype either, and the
sibling row's own measurement shows the source's select growing from 33 to 34
after the create exactly as the port's does.

So on the row's own question - what the select offers - the port matches the
source, and the row closes.

## What this lane did NOT conclude

This lane did not conclude that the select SHOULD offer the created cardtype
without a refresh. It concluded that the port does what the source does
here, which is what this row asks. The row that DOES diverge is the sibling
`smell-discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create`,
whose subject is the CHANGED value rather than the option set.

Branch: `port/smell-test-round1b-20261024` in KatsuJinCode/decko-ts.
