# mx-B-034: the edit form's Delete button is a confirm-guarded link to /delete/<name>

The roster row `mx-B-034-6-delete-a-card` (family [Family]) reads "the edit
form's Delete button is a confirm-guarded link to /delete/<name>", verdict
PASS, bucket DONE, with the evidence basis "verified - every instrument entry
for B-034 is pass (live-acceptance-lane+whole-harness)". This receipt is the
family's own adjudication of that row: the instrument the registry's own
ledger records for it, the Ruby oracle that pins the surfaces the instrument
touches, and a fresh measurement at this tip.

## What the row is

The edit form of a card carries a Delete control. It is a link, not a button
submit, it points at the card's own delete route, and it asks for
confirmation before it fires.

## The instrument

The harness's "6. delete a card" group
(tools/edge-signed-in-exercise/lib/basic-lifecycle-journeys.mjs:57), which the
exercise drives at tools/edge-signed-in-exercise.mjs:1017. The journey creates
the run's own card (:68-74), reads the id it intends to delete (:75), opens
that card's edit form (:76), reads the delete anchor's href (:78) and grades
it (:79): `href !== null && href.startsWith("/delete/" + deleteName)`. The
anchor's `onclick` and `data-confirm` are read right after (:80-83) and are
NOT part of the graded evidence.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "the edit form's
Delete button is a confirm-guarded link to /delete/<name>", id ACT-034,
check_ids ["B-034"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE DELETE BUTTON IS RUBY'S OWN. Ruby's own edit form builds it in
card-mod-edit-0.20.0/set/all/form_buttons.rb:

    - :53-57 `delete_button`: `return unless card.real?` and
      `link_to "Delete", delete_button_opts(opts)`;
    - :59-66 `delete_button_opts`: `add_class opts, "slotter btn
      btn-outline-danger ms-auto"`, `opts["data-confirm"] = delete_confirm
      opts`, `opts[:path] = { action: :delete }`, `opts[:path][:success] =
      delete_success(opts)`, `opts[:remote] = true`;
    - :68-70 `delete_confirm`: `"Are you sure you want to delete
      #{safe_name}?"`;
    - :72-80 `delete_success`: `main?` takes `{ redirect: true, mark:
      "*previous" }` and every other format takes `{ view: :just_deleted }`.

The route that link points at is Ruby's own: engine_routes.rb:41-43 draws
`get "(card)/#{action}(/:mark(.:format))" => "card", action: action` for the
actions create, read, update, delete and asset, and :48 draws
`match "(card)/delete(/:mark(.:format))" => "card#delete", via: :delete`.
The link's own path is the `action: :delete` Ruby's own path helper renders.

The port renders the same control: src/card/mod-loader/mods/card-mod-edit.ts
:469-482 (`deleteButton`), where the class is `slotter btn btn-outline-danger
ms-auto`, the confirm string is `Are you sure you want to delete {name}?`, the
href is `/delete/{urlKey}?{success}` and `data-remote="true"` (:481). The
success arm follows Ruby's own fork: the page's main format takes
`success[mark]=*previous&success[redirect]=true` and every other format
takes `success[view]=just_deleted` (:478-480). The button rides Ruby's own
button groups: the edit modal's `:edit_buttons` view (:498-507, the delete
button at :505) and the inline edit's `:edit_inline_buttons` view (:2805-
2816, the delete button at :2814).

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The button's own
class, its confirm string, its path shape, its remote flag and the success
fork are Ruby's own, read from Ruby's own source in the gem the port was
ported from, and the port renders each of them. What the CHECK grades is
narrower: the href's shape (it starts with `/delete/<the run's own card
name>`), and the confirm string it reads does not ride in the graded
evidence. The live answer is what this run measured.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round8-20261024/rows-r2/report.md

    source 5421b7eb, started 2026-10-24T08:45:24.224Z, the source files clean
    verdict: PASS
    evidence: {"href":"/delete/Harness_delete_mvm5mqed?success%5Bview%5D=just_deleted"}

The edit form's delete anchor pointed at the run's own card's delete route.
The success arm that rode the query is Ruby's own non-main arm (`{view:
:just_deleted}`), because the button sits in the edit modal rather than in
the page's main format. The run as a whole graded 253 of 253 checks passed,
0 failed.

## What this receipt does NOT claim

- That the check graded the confirm guard. The harness reads the anchor's
  `data-confirm` and its `onclick`
  (basic-lifecycle-journeys.mjs:80-83) but the record's evidence carries the
  href alone (:79). The confirm string is pinned here from Ruby's own source
  and from the port's own rendering, not from the check's grade.
- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
