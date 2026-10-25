# smell-discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create

- The row's own label: `smell/probe script discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create.mjs`
- The instrument:
  `reference-harness/browser/discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create.mjs`
- What this lane did: ran the row's own instrument on this lane's tree
  against BOTH legs, the port and the pinned Ruby oracle, and compared the
  two outcomes.
- Command (each leg): `node tools/smell-act082-legs/run-leg.mjs
  discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create.mjs
  <ts|ruby33> <out-dir>`, which copies the probe with its one
  engine-manifest line rewritten and runs the probe's own body UNCHANGED, so
  the only difference between the two captures is the engine.
- The engine was built first (`node tools/dist/build-engine.mjs`, exit 0).
- Evidence in this directory's sibling fixtures:
  `fixtures/captured/smell-act082-r3-2026-10-24/type-select-refresh-after-create-ts.json`
  and `.../type-select-refresh-after-create-ruby33.json`.

## Verdict: WORKING ON IT

The two legs agree on the REFRESH and diverge on the CHANGED VALUE.

The probe creates a card, creates a cardtype through the app, and then reads
the type select BEFORE and AFTER that create.

Both legs behave identically on the refresh:

- BEFORE the create: 33 options, the created cardtype NOT among them;
- the create itself answers 200 on both legs;
- AFTER the create: 34 options, the created cardtype IS among them.

So the port's select refreshes exactly as the source's does. That part is
parity.

The divergence is what happens after the driver changes the select's value:

- on the ORACLE the chosen value SURVIVES: `chosen.value` reads the created
  cardtype (`Book_mvmvswzd`), the update answers 200, and the card's stored
  type is no longer the scratch type (the fixture's type lookup no longer
  finds it under the scratch type), so the card became the cardtype that was
  chosen;
- on the PORT the chosen value is GONE: `chosen.value` reads null at submit,
  the update answers 200, and the card's stored type is STILL 37 with
  `isBook` false, so the card never became the cardtype that was chosen.

This is the same mechanism the two sibling rows measure from the other side
(`...-save-post-body` and `...-select-owner-form`), and it is named in
their receipts: the port's GET slot parser cannot read `slot[show][]` as
the show list (its capture group on that key is `show][`, not `show`), and
the bare render path passes no show list into the render at all, so the
reload the select's change event triggers answers with the type row in its
READ-ONLY shape instead of the live select, the form that comes back carries
neither `card[type]` nor the `assign` hidden field, and the changed value is
dropped from the body.

This lane measured this row on its own instrument rather than inheriting the
siblings' reading, and the three rows' captures agree: the port's select
renders and refreshes correctly, holds the chosen value in its own DOM, and
the value is dropped on the way to the body.

## What would close it

The same fix the sibling rows name: the port's GET slot parser reading
`slot[show][]` as the show list, and the bare render path passing that list
into the render's view opts. Then the reload returns the live select, the
form carries `card[type]` and `assign`, and the same probe records the
chosen cardtype at submit and a stored type that changed.

## What this lane did NOT conclude

This lane did not conclude that the port's select fails to refresh: it
refreshes, 33 options to 34 with the created cardtype present, exactly as
the source's does.

Branch: `port/smell-test-round1b-20261024` in KatsuJinCode/decko-ts.
