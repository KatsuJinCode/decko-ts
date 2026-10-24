# mx-B-028: the create route /Some_New_Name shows signed-in chrome and a card form

The roster row `mx-B-028-5-create-a-card-every-way-the-` (family [Family])
reads "create route shows signed-in chrome and a card form: unknown card name
(/Some_New_Name)", verdict PASS, bucket DONE, with the evidence basis
"verified - every instrument entry for B-028 is pass
(live-acceptance-lane+whole-harness)". This receipt is the family's own
adjudication of that row: the instrument the registry's own ledger records
for it, the Ruby oracle that pins the surfaces the instrument touches, and a
fresh measurement at this tip.

## What the row is

A signed-in deck answers `GET /Some_New_Name` with 200, with the signed-in
chrome (the navbar's Sign out link) and with a card form on the page: a
`<form>` element whose class carries `card-form`. The name is not a card in
the deck, so this is the "create this card" page the deck offers for a name
that does not exist yet.

## The instrument

The harness's "5. create a card every way the site offers" group
(tools/edge-signed-in-exercise.mjs:983), the way list (:984-992) carries
"unknown card name (/Some_New_Name)" (:988), and the record (:996) grades
`seen.status === 200 && seen.signedIn && seen.hasSignOut && hasForm`. The
form test (:995) is the regex `/<form[^>]*class="[^"]*card-form/g` over the
page HTML, and the visit it reads is the `attempt` at :993.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "create route shows
signed-in chrome and a card form: unknown card name (/Some_New_Name)", id
ACT-028, check_ids ["B-028"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE UNKNOWN-CARD RULE IS RUBY'S OWN. Ruby's own format module answers an
unknown MAIN card with the create form when the viewer may create it and
with a not-found page otherwise
(card-mod-format set/all/html/error.rb:81-86, `ok?(:create) ? :new : super`
and `ok?(:create) ? 200 : 404`; the port's own citation of it:
src/card/render/format.ts:1676-1684 and src/card/render/page.ts:313, :331-333,
:446). Ruby's own create-form view is the one registered with
`unknown: true` and `perms: :create`
(card-mod-edit-0.20.0/set/all/new.rb:4-6), so the same form answers the
unknown card.

THE FORM IS RUBY'S OWN. card-mod-edit-0.20.0/set/all/new.rb:43-49 builds it
with `card_form :create`, and :19-21 is the same form without the frame
(`view :simple_new`). Ruby's own captured bytes for that form are capture
arm probe-view:169:simple_new@set/all/new.rb (graded-identical,
tools/compat-report/graded-probes.json:5259-5263):

    <form class="card-form slotter" id="edit_card_1" action="/card/create" accept-charset="UTF-8" data-remote="true" method="post">

The class, the action and the accept-charset, data-remote and method
attributes are the three facts the instrument's regex reads. The dom id in
the capture is `edit_card_1` because the capture's card is a persisted row;
for a new record Ruby's form_for names the form "new_card"
(form_helper.rb:465-475), and that is what the port renders
(src/card/mod-loader/mod-form-substrate.ts:290-293).

THE NAME IS RUBY'S OWN DECODED. card-1.110.0/lib/card/fetch/card_class.rb:131
reads the mark off the route and folds its underscores to spaces
(`opts[:name] ||= Name[params[:mark]]&.tr "_", " "`), so /Some_New_Name is
the card "Some New Name". The port's own path parser does the same fold
(deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.ts:102-118, the
bare single-segment arm, and src/server/worker-shared-surface.ts:106-112).

THE SUBMIT BUTTON IS RUBY'S OWN: capture arm
probe-view:158:new_buttons@set/all/new.rb (graded-identical, :5204-5208):

    <button name="button" type="submit" data-disable-with="Submitting" class="submit-button create-submit-button btn btn-primary">Submit</button>

THE SIGNED-IN CHROME'S SIGN-OUT LINK IS RUBY'S OWN: capture arm
probe-view:406:sign_out@set/self/account_links.rb (graded-identical,
:6456-6460):

    <a class="nav-link signout-link known-card" href="/delete/*signin">Sign out</a>

The port renders each of them: the create form shell
(src/card/mod-loader/mod-form-substrate.ts:280-303, the class at :290, the
dom id at :291, the action at :293), the create form in the engine's own
view (src/card/mod-loader/mods/card-mod-edit.ts:2491), the new view itself
(card-mod-edit.ts:2729-2748), and the sign-out anchor
(src/card/render/navbar-views.ts:369).

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The unknown-card
rule, the form element's own class, action and attributes, the submit
button's own bytes, the sign-out link's own bytes and the mark's own
decoding are Ruby's own, and the capture arms above are Ruby's own rendered
bytes for the same views. What is NOT capture-matched is the whole
/Some_New_Name page: there is no recorded Ruby's-own capture of an unknown
card's page, and the port's own file says the same about the create page it
renders (deploy/bunny-worker-src/bunny-edge-new-card-form.ts:31-38). The
page's frame chrome, its name formgroup and the type the create form
carries are the port's own, reconstructed from Ruby's source and labelled
inline in that file. The live answer (the 200, the signed-in marker, the
sign-out link and the form's presence on the page) is what this run
measured.

The session cookie's name (`decko_ts_session`,
src/server/write-routes.ts:363) and the page's signed-in marker
(`decko.signed_in`, tools/edge-signed-in-exercise/lib/sign-in-surfaces.mjs:55)
are the port's and the harness's own facts, named here as named-instrument
facts for this row, not claimed as oracle-matched.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round7-20261024/rows-r1/report.md

    source e3b7cd0c, started 2026-10-24T06:58:51.466Z, the source files clean
    verdict: PASS
    evidence: {"status":200,"signedIn":true,"hasSignOut":true,"hasForm":true}

The route answered 200 with the signed-in chrome and a card form on the
page, which is the four facts the instrument grades.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane, and nothing deploys.
- The page's byte-identity with a Ruby's-own page for an unknown card. No
  capture of that page exists; what this receipt pins is the unknown-card
  rule, the form element, the submit button and the sign-out link, plus the
  measured answer.
- The type the form creates. The type selector's own element is Ruby's
  (capture arm probe-view:162, graded-identical), but the capture's selected
  option is the capture deck's own type; the port's own type resolution
  (src/card/actions/type-resolution.ts) answers this request's type.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
