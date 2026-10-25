# Row smell-discovery-pageonly-ranks101-110-act082-save-post-body

Close, 2026-10-25, the workbatch-f lane. Disposition: DONE.

- Roster row: `smell-discovery-pageonly-ranks101-110-act082-save-post-body`
- Instrument: `reference-harness/browser/discovery-pageonly-ranks101-110-act082-save-post-body.mjs`
  (discovery 4 of the ACT-082 set)
- Command: `node reference-harness/browser/discovery-pageonly-ranks101-110-act082-save-post-body.mjs`
  on this lane's tree (branch `port/workbatch-f-20261025`, base c17906db, the v22
  roll), engine built there with `node tools/dist/build-engine.mjs` (exit 0).
- Observed: the select is present, the Book option is in the DOM, `selectOption`
  sets it and it reads back `Book_mvo8dbi1`; the Save's POST body is
  `utf8=...&_method=patch&card[type]=Book_mvo8dbi1&assign=true&card[last_action_id_before_edit]=997&card[content]=<p>subject D4_TypeChange_mvo8dbi1</p>&button=`,
  carrying the chosen cardtype and the assign field; the stored row ends at
  `typeId` 912 == `bookId` 912, `isBook` true.
- Evidence in this directory: `fresh-steps.json`, the instrument's own capture.

## The two engine halves this close landed (vm-staging-server.mjs)

Round three's diagnosis named the gap: the live type field's href carries
`/edit_form?assign=true&slot[show][]=type_form`, and the port could not read
either half of it.

1. THE SHOW LIST. The GET slot parser's `/^slot\[(.+)\]$/` capture on the key
   `slot[show][]` is `show][` (the trailing `]` eats into the greedy group), so
   no slot key answered to it. The parser now recognizes that capture as Rack's
   nested-array form and accumulates the list, and the bare render branch
   merges it into `HistoryRenderParams.viewOpts`, the channel
   `format.renderView` reads - the Voo viz-writes `:type_form`
   (process_visibility_options), which is what turns `voo.visible?(:type_form)`
   true (all/edit_type.rb:19-24) and makes the reload answer the live type
   select instead of the read-only row.
2. THE ASSIGNMENT. Ruby's `standard_uri_fetch`
   (card_class.rb:104-126) assigns the request's card hash onto the fetched
   card when `params[:assign]` is set and the card is real
   (`card.assign_attributes card_opts if params[:assign] && card&.real?`).
   The reload carries exactly that pair - `assign=true` plus the serialized
   form's `card[type]=<the value just chosen>` - so the form the reload
   returns holds the chosen value. The host now feeds that pair into
   `HistoryRenderParams.assignedType` (render-seam.ts:96-99, the engine's own
   preview-an-existing-card-with-the-requested-type channel, whose doc names
   the board's live type field), with Ruby's presence-truthiness rule and the
   engine's real-card guard standing in for `card&.real?`.

The r3 pins (tests/server/smell-act082-save-post-body-parity.test.ts) now pin
the delivery: they assert the parser's array branch and the render merge, keep
the inverse capture fact, and keep the renderer and update-route assertions
(the renderer already accepted a show list and the update route already mapped
card["type"] to the type name - the delivery was the gap). The r3 capture
assertions stand unchanged as the record of what the port posted before the
delivery existed.
