# Smell-test row conversion, round three, 2026-10-24

Lane: smell-row-conversion-r3. Question asked: take the smell-test rows that
the round-two fold left open, in row-id order, run each row's own instrument
on THIS lane's tree, and close a row only where its own verification ran and
matched the source; leave every other row open with the gap this lane
measured, in one mechanism sentence.

The round-two fold left 29 rows open (24 WORKING ON IT, 5 BLOCKED). This lane
took the first six in row-id order.

## What this lane added that the prior rounds did not have

The prior rounds could run these rows against the PORT only. The row's own
instruments name their engine in one line, so `tools/smell-act082-legs/run-leg.mjs`
runs the probe's own body against either leg and the only difference between
the two captures is the engine. Every receipt below therefore carries BOTH
legs: the port's own output and the pinned Ruby oracle's own output, from the
same probe, against the same fixture.

That is what turns "the port does X" into "the port does X and the source does
Y", which is what these rows need to be adjudicated at all.

## The rows

| row | what its own verification produced |
|---|---|
| `smell-compare-journeys` | the comparator RAN and graded 27 of 46, but it REFUSED its evidence: the captures on disk are bound to a different source commit and a different fixture digest, so the grade is not a statement about this tree |
| `smell-discovery-pageonly-ranks101-110-act082-new-cardtype-form-fields` | both legs render the type select with the same eight options and the same form field set: the port matches the source here |
| `smell-discovery-pageonly-ranks101-110-act082-save-post-body` | the source posts `card[type]` and `assign` in the update body; the port posts neither, so the changed value never reaches the server |
| `smell-discovery-pageonly-ranks101-110-act082-select-owner-form` | the source's Save answers 200 with `card[type]` in the body; the port's Save never fires at all |
| `smell-discovery-pageonly-ranks101-110-act082-type-select-all-options` | both legs offer the same 33 options and neither offers the created cardtype: the port matches the source here |
| `smell-discovery-pageonly-ranks101-110-act082-type-select-refresh-after-create` | both legs grow the select from 33 options to 34 after the create; only the source keeps the chosen value through the submit |

## The one mechanism the five ACT-082 rows share

The type select is the LIVE TYPE FIELD. Its own href carries the slot show
list the client asks for:

    /<mark>/edit_form?assign=true&slot[show][]=type_form

and `type_editor.js.coffee` (the pinned gem's own script, byte-identical to
the copy this repo ships) serializes the form on the select's change event,
so the client reloads that href as a slot. The form the user finally submits
is the one that reload returned.

The port cannot read that show list:

- the GET slot parser (`vm-staging-server.mjs`) matches `/^slot\[(.+)\]$/`, and
  on the key `slot[show][]` its capture group is `show][`, not `show`;
- the bare render path (`renderCardPage`) reads only `slotParams.main` and
  `slotParams.home_view` and never passes a show list into the render at all.

The renderer itself is fine: `src/card/render/format.ts` reads `opts["show"]`
as a list and writes the viz. So the gap is the DELIVERY of the show list,
not the renderer's handling of it. The consequence is that the port's reload
answers with the type row in its READ-ONLY shape instead of the live select,
the form that comes back carries neither `card[type]` nor the `assign` hidden
field, and the changed value is dropped from the body.

`tests/server/smell-act082-type-change-parity.test.ts` pins that: it re-reads
the port's own parser from the tree, so a port that grew the show-list
plumbing fails the pin and the rows cannot stay closed on a stale mechanism.

## The receipts

One per row, under this directory's row-id directory, each with the command
that produced it and the observed output.

- The captures the receipts cite are under
  `fixtures/captured/smell-act082-r3-2026-10-24/`.
- The pin tests are `tests/server/smell-act082-type-change-parity.test.ts`
  (the five ACT-082 rows) and
  `tests/server/smell-compare-journeys-provenance.test.ts` (the comparator).

Branch: `port/smell-test-round1b-20261024` in KatsuJinCode/decko-ts.
