# smell-discovery-pageonly-ranks101-110-act082-select-owner-form

- The row's own label: `smell/probe script discovery-pageonly-ranks101-110-act082-select-owner-form.mjs`
- The instrument:
  `reference-harness/browser/discovery-pageonly-ranks101-110-act082-select-owner-form.mjs`
- What this lane did: ran the row's own instrument on this lane's tree
  against BOTH legs, the port and the pinned Ruby oracle, and compared the
  two outcomes.
- Command (each leg): `node tools/smell-act082-legs/run-leg.mjs
  discovery-pageonly-ranks101-110-act082-select-owner-form.mjs <ts|ruby33>
  <out-dir>`, which copies the probe with its one engine-manifest line
  rewritten and runs the probe's own body UNCHANGED, so the only difference
  between the two captures is the engine.
- The engine was built first (`node tools/dist/build-engine.mjs`, exit 0).
- Evidence in this directory's sibling fixtures:
  `fixtures/captured/smell-act082-r3-2026-10-24/select-owner-form-ts.json` and
  `.../select-owner-form-ruby33.json`.

## Verdict: WORKING ON IT

The two legs DIVERGE, and the divergence is larger than the port's field set:
on the PORT the Save never fires at all.

The probe opens the board's type row, changes the live type select's value to
the cardtype it created through the app, and clicks the card's Save.

On the ORACLE the Save answers 200 and the posted body carries the chosen
cardtype:

    utf8=...&_method=patch&card[type]=Book_mvmv9gmq&assign=true
      &card[last_action_id_before_edit]=997&card[content]=subject+D5_TypeChange_mvmv9gmq&button=

and the card's stored type is no longer the scratch type (the fixture's type
lookup no longer finds it under the scratch type).

On the PORT the click times out after 30 s, NO POST is witnessed, the card's
stored type is still 37, and `isBook` is false. The probe's own error names
it: the click waits for the select's ancestor form and that ancestor is not
where the driver expects it.

The port's form is NOT missing the field. The probe's own DOM census, taken
on the port, records the select INSIDE the form that owns it
(`selectInForm` true), with the form's action `/update/<card>` and with the
full field set (`utf8`, `_method`, `card[type]`, `assign`,
`card[last_action_id_before_edit]`, `card[content]`), and that field set is
the SAME on both legs. So the port renders the field, the field holds the
chosen value (`valueAfter` reads the chosen cardtype on BOTH legs), and what
differs is what the Save then does.

This is the SAME mechanism the sibling row
`smell-discovery-pageonly-ranks101-110-act082-save-post-body` measures from
the other side, and it is named in that row's receipt: the port's GET slot
parser cannot read `slot[show][]` as the show list (its capture group on that
key is `show][`, not `show`), and the bare render path passes no show list
into the render at all, so the reload the select's change event triggers
answers with the type row in its READ-ONLY shape instead of the live select.
The form that comes back is not the form the driver is holding, so the Save
the driver clicks is not the Save that carries the value.

This lane measured this row on its own instrument rather than inheriting the
sibling's reading, and the two rows' captures agree: the port's type select
is present and holds the value, and the port's Save does not carry it.

## What would close it

The same fix the sibling row names: the port's GET slot parser reading
`slot[show][]` as the show list, and the bare render path passing that list
into the render's view opts. Then the reload returns the live select, the
form the driver is holding is the form that carries `card[type]`, and the
Save fires with the chosen cardtype in its body.

## What this lane did NOT conclude

This lane did not conclude that the port's owner select is broken: the
select is present, holds the value, and its form carries the full field set
on the port exactly as on the source.

Branch: `port/smell-test-round1b-20261024` in KatsuJinCode/decko-ts.
