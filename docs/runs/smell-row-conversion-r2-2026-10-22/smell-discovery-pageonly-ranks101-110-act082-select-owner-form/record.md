# Row smell-discovery-pageonly-ranks101-110-act082-select-owner-form

Smell-test row conversion, round two, 2026-10-22. Disposition: WORKING ON IT.

- Roster row: `smell-discovery-pageonly-ranks101-110-act082-select-owner-form`
- Instrument: `reference-harness/browser/discovery-pageonly-ranks101-110-act082-select-owner-form.mjs`
  (discovery 5 of the ACT-082 set)
- What this lane did: ran the row's own instrument on this lane's tree.
- Command: `node reference-harness/browser/discovery-pageonly-ranks101-110-act082-select-owner-form.mjs`
  on `C:/localProjects/decko-ts-smell-convert-r2-20261022` at commit
  `3eca1fe50d567a773a5759ac323d2281bbb5e368`, engine built with
  `node tools/dist/build-engine.mjs` (exit 0).
- Observed: the owner-select leg still does not complete. The instrument's
  `locator.click` on the modal's `select[name='card[type]']` times out after 30000 ms, the
  `page.waitForResponse` that follows times out as well, no POST is witnessed (`posts: []`),
  and the value read back afterwards is `Book_mvkdfb3t` while the stored row is still
  `typeId` 37 with `isBook` false. The select itself is inside the right form: the owning
  form posts to `/update/D5_TypeChange_...` and its fields are `utf8`, `_method`,
  `card[type]`, `assign`, `card[last_action_id_before_edit]`, `card[content]`.
- Evidence in this directory: `fresh-outcome.json`, the instrument's own output.
- Gap, in one mechanism sentence: the owner-select leg of the type change never completes its
  click and POST, and because the changed value is dropped from the update body the stored
  type stays 37, so the card never becomes the cardtype that was chosen.

## Two things this lane measured that belong to the gap

The select is rendered by the port as a select2-backed control
(`class="... select2-hidden-accessible"`, `tabindex="-1"`, `data-remote="true"`), so the
element the instrument clicks is the hidden native select rather than the visible control a
person clicks. The click timeout is therefore a fact about how the field is rendered and
driven, and it is the surface on which the type change is entered.

Separately, the sibling row `smell-discovery-pageonly-ranks101-110-act082-form-control-attributes`
measured in this session that an untouched type field does serialize `card[type]` and that
the update lands, while `smell-discovery-pageonly-ranks101-110-act082-save-post-body`
measured that a changed value is dropped. The two gaps are not the same gap: this row is
about the drive, that row is about the body.

## What would close it

A drive that enters the type through the control a person uses, plus the body fix, so that
one run both completes the click and stores the chosen type.
