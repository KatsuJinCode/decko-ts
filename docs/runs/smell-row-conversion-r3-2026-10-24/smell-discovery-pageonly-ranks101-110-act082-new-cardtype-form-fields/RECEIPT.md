# smell-discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields

- The row's own label: `smell/probe script discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields.mjs`
- The instrument:
  `reference-harness/browser/discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields.mjs`
- What this lane did: ran the row's own instrument on this lane's tree
  against BOTH legs, the port and the pinned Ruby oracle, and compared the
  two captures.
- Command (each leg): `node tools/smell-act082-legs/run-leg.mjs
  discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields.mjs <ts|ruby33>
  <out-dir>`, which copies the probe with its one engine-manifest line
  rewritten and runs the probe's own body UNCHANGED, so the only difference
  between the two captures is the engine.
- The engine was built first (`node tools/dist/build-engine.mjs`, exit 0).
- Evidence in this directory's sibling fixtures:
  `fixtures/captured/smell-act082-r3-2026-10-24/new-cardtype-form-fields-ts.json`
  and `.../new-cardtype-form-fields-ruby33.json`.

## Verdict: DONE

Both legs agree. The row's question is the type select the board's type row
opens, and on that question the port matches the source:

- the type select renders in the modal on both legs, named `card[type]`, with
  value `PlainText`, and with the SAME eight options in the SAME order
  (`RichText, PlainText, Markdown, Phrase, HTML, Number, Toggle, Date`);
- the form that owns it is the same on both legs: the same action
  (`/update/<card>`), the same class (`card-form slotter autosave`), and the
  same field set (`utf8`, `_method`, `card[type]`, `assign`,
  `card[last_action_id_before_edit]`, `card[content]`);
- the page's own other forms are the same on both legs as well (the search
  form and the account form).

The row's prior text said the source-side measurement was MISSING, because
the instrument could not be run against the Ruby oracle as written: its create
leg did not complete on the Ruby application. That is no longer true of the
instrument as it stands, and the oracle leg ran here. The gap the row named -
that the cardtype created through the app is not among the select's options -
is TRUE ON BOTH LEGS: neither the port nor the source offers the created
cardtype in that select, so it is the source's behavior and not the port's
divergence. (The sibling row
`smell-discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create`
measures the same thing from the other side: after the create, BOTH legs grow
the select from 33 options to 34 and both then offer the new cardtype.)

This row's own verification ran and matched, so it closes.

## What this lane did NOT conclude

This lane did not conclude that the type select SHOULD offer the created
cardtype without a refresh. It concluded that the port does what the source
does here, which is what this row asks.

Branch: `port/smell-test-round1b-20261024` in KatsuJinCode/decko-ts.
