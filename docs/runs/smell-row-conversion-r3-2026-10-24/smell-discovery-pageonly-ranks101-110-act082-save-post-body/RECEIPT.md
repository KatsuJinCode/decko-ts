# smell-discovery-pageonly-ranks101-110-act082-save-post-body

- The row's own label: `smell/probe script discovery-pageonly-ranks101-110-act082-save-post-body.mjs`
- The instrument:
  `reference-harness/browser/discovery-pageonly-ranks101-110-act082-save-post-body.mjs`
- What this lane did: ran the row's own instrument on this lane's tree
  against BOTH legs, the port and the pinned Ruby oracle, and compared the
  two posted bodies.
- Command (each leg): `node tools/smell-act082-legs/run-leg.mjs
  discovery-pageonly-ranks101-110-act082-save-post-body.mjs <ts|ruby33>
  <out-dir>`, which copies the probe with its one engine-manifest line
  rewritten and runs the probe's own body UNCHANGED, so the only difference
  between the two captures is the engine.
- The engine was built first (`node tools/dist/build-engine.mjs`, exit 0).
- Evidence in this directory's sibling fixtures:
  `fixtures/captured/smell-act082-r3-2026-10-24/save-post-body-ts.json` and
  `.../save-post-body-ruby33.json`.

## Verdict: WORKING ON IT

The two legs DIVERGE, and the divergence is the row's own subject.

The probe drives the board's type row, opens the live type select, changes
its value to the cardtype it created through the app, and captures the POST
body the card's own Save fires.

The ORACLE's posted body:

    utf8=...&_method=patch&card[type]=Book_mvmv663k&assign=true
      &card[last_action_id_before_edit]=997&card[content]=subject+D4_TypeChange_mvmv663k&button=

The PORT's posted body:

    utf8=...&_method=patch&card[last_action_id_before_edit]=997
      &card[content]=subject+D4_TypeChange_mvmuk7ls&button=

Decoded, the oracle's body carries `card[type]` and `assign` and the port's
carries NEITHER. Every other field is the same on both legs. And the stored
row agrees: on the oracle the card's stored type is no longer the scratch
type (the fixture's type lookup no longer finds it under the scratch type),
and on the port the stored type is still 37 with `isBook` false.

The port's SELECT is not at fault. Measured in the port's own DOM at the
moment the Save is clicked, the select is present, named `card[type]`, NOT
disabled, its value IS the chosen cardtype, and it IS inside the form that
owns it (`edit_card_911`, action `/update/<card>`); the form's own element
list carries `card[type]` with that value and the `assign` hidden input, and
neither is disabled. So the port renders the field and holds the value, and
the value is dropped on the way to the body.

## The mechanism, in the port's own source

The type select is the LIVE TYPE FIELD. Its own href carries the slot show
list the client asks for:

    /<mark>/edit_form?assign=true&slot[show][]=type_form

and `type_editor.js.coffee` (the pinned gem's own script, byte-identical to
the copy this repo ships) serializes the form on the select's change event,
so the client reloads that href as a slot. The form the user finally submits
is the one that reload returned.

The port cannot read that show list:

- the GET slot parser in `vm-staging-server.mjs` matches `/^slot\[(.+)\]$/`,
  and on the key `slot[show][]` its capture group is `show][`, not `show`;
- the bare render path in `renderCardPage` reads only `slotParams.main` and
  `slotParams.home_view`, and never passes a show list into the render at all.

The renderer itself is not the gap: `src/card/render/format.ts` reads
`opts["show"]` as a list (`normalizeVisibilityList`) and writes the viz, and
`src/card/mod-loader/mods/card-mod-edit.ts` renders the live type select only
once `type_form` is explicitly shown. So the gap is the DELIVERY of the show
list, not the renderer's handling of it. The consequence is that the port's
reload answers with the type row in its READ-ONLY shape instead of the live
select, the form that comes back carries neither `card[type]` nor the
`assign` hidden field, and the changed value is dropped from the body.

The server is not the gap either: the port's own update route still maps
`card["type"]` to the type name, so a body that carried the field would be
honoured.

## What would close it

The port's GET slot parser reading `slot[show][]` as the show list, and the
bare render path passing that list into the render's view opts. Then the
reload returns the live select, the form carries `card[type]` and `assign`,
and the same probe records the chosen cardtype in the posted body and the
card's stored type changed.

## What this lane did NOT conclude

This lane did not conclude anything about the OTHER journeys this surface
appears in, and it did not conclude that the port's type select is wrong: the
select's own rendering and value are correct in the port's DOM, and the
source's select behaves the same way.

Branch: `port/smell-test-round1b-20261024` in KatsuJinCode/decko-ts.
