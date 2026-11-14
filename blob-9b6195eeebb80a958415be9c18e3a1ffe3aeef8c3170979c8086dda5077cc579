# mx-B-051: card content preset in the /new URL is submitted and stored

The roster row `mx-B-051-7b-further-signed-in-capabilit` (family [Family])
reads "card content preset in the /new URL is submitted and stored", verdict
PASS, bucket DONE, with the evidence basis "verified - every instrument
entry for B-051 is pass (live-acceptance-lane+whole-harness)". This receipt
is the family's own adjudication of that row: the instrument the registry's
own ledger records for it, the Ruby oracle that pins the surfaces the
instrument touches, and a fresh measurement at this tip.

## What the row is

A /new URL can carry the card it wants: `?card[name]=` names the card and
`?card[content]=` carries its body. The row is the check that the preset
reaches the editor the person sees, survives the submit, and is stored on
the card, rather than a form that starts empty and discards what the URL
asked for.

## The instrument

The preset is driven by the exercise's own C10 leg
(tools/edge-signed-in-exercise.mjs:1120-1151). It builds the URL
(:1128) with the card name and a marker body, opens it (:1129), waits for
the content editor to be ready (:1130), reads the editor's own content
(:1131-1135), submits the form (:1138-1142), reads the stored row out of
the deck's own cards table (:1146) and visits the card (:1147). The row is
recorded PASS only when the write answered under 400 AND the editor held
the marker AND the stored row is not trashed AND the stored content holds
the marker AND the card's own page holds the marker (:1148-1149).

The registry's own ledger for this row
(C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json,
action "card content preset in the /new URL is submitted and stored",
id ACT-051, check_ids ["B-051"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

A SECOND INSTRUMENT GRADES THE SAME SURFACE. The cover-b module's C10 check
(tools/edge-signed-in-exercise/checks-cover-b.mjs:273-290) opens the same
kind of URL with its own marker, waits for TinyMCE to become active and to
hold the marker (:277-279), submits (:281), and requires the editor to be
active, the prefilled content to hold the marker, the card's page to answer
200 and to carry the marker (:286-288).

## The oracle

RUBY'S OWN SOURCES OWN THE PRESET, AND THEY ARE IN THE PINNED ORACLE GEM
SET. Read from
C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems:

  * card-1.110.0/lib/card/fetch/card_class.rb:127-133, `uri_fetch_opts`:
    `Env.hash(params[:card]).tap do |opts| ... opts[:name] ||= Name[params[:mark]]&.tr "_", " " end`.
    The request's own card hash is what the new card is fetched with, so
    `card[name]` and `card[content]` in the URL are the new card's
    attributes before the form is ever rendered.
  * card-mod-edit-0.20.0/set/all/new.rb:103-109, `new_view_name`: for the
    named shape the form carries `hidden_field_tag "card[name]", card.name`.
  * card-mod-edit-0.20.0/set/all/editor.rb:46-49, `text_area_input`:
    `text_area :content, rows: 5, class: "d0-card-content", "data-card-type-code": card.type_code`.
    The content field lives inside the card's own form and is named
    `card[content]`.
  * decko-0.20.0/lib/card_controller/rest.rb:7-9, `create`:
    `handle { card.save! }`. The write route creates the card.

RUBY'S OWN RENDERED NEW-CARD FORM IS IN THIS REPOSITORY'S CAPTURE. The
capture arm `probe-view:159:new_fields@set/all/new.rb` in
reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl
carries Ruby's own `new_fields` view, and its name field is the named
shape's hidden field:

    <input type="hidden" name="card[name]" id="card_name" value="Decko Bot" autocomplete="off" />

THE PORT OWNS THE SAME PLUMBING. The surface this run drives is the
deployed bundle (deploy/dist/bunny-edge-engine.bundle.js, rebuilt from
deploy/bunny-worker-src by tools/bundle-bunny-edge-engine.mjs, served over
HTTPS on localhost by tools/edge-signed-in-exercise/lib/edge-host.mjs).
In that surface:

  * deploy/bunny-worker-src/bunny-edge-engine-request.ts:625-635 reads
    `card[name]` and `card[content]` off the query and hands them to the
    signed-in new-card page, with the comment "as Ruby's new view reads
    them off params"; :639-644 takes the named shape for the unnamed route;
    :812 carries the query's `card[content]` into the new card's fetch
    options.
  * deploy/bunny-worker-src/bunny-edge-new-card-form.ts:227-228 renders
    the content editor, `<textarea rows="3" class="tinymce-textarea
    d0-card-content form-control" id="new-card-content"
    name="card[content]">`, with the preset content in its body, and :238
    renders the name input with the preset name.
  * The engine's own seam is Ruby's: src/card/fetch.ts:106 carries the
    `content` new-card option, and :546-551 assigns it the way Ruby's
    `results.rb:85-87` `assignable_content` does.

## What is oracle-matched and what is not, stated plainly

Oracle-matched: the preset's field names are Ruby's own (`card[name]` and
`card[content]`); the request's card hash is what the new card is built
from; the content field sits inside the card's own form; the write route
creates the card; and the rendered new-card form in Ruby's own capture
carries the named shape's hidden `card[name]` field.

Not oracle-matched, and stated rather than glossed over: the editor's
markup differs. Ruby's text area carries `rows: 5` and a
`data-card-type-code` attribute; the port's textarea carries `rows="3"` and
the `tinymce-textarea` class. The port's field name and the preset's
behavior are the same; the bytes around them are not Ruby byte for byte.

Also stated rather than glossed over: the capture fixture and the port's
own pin test for this row, `fixtures/captured/new-card-preset.json` and
`tests/card/mod-loader/card-mod-new-card-preset.test.ts`, are NOT in this
branch's tree. They landed on the capability branch (commit de6cc87e,
"cap-C10: the /new URL's preset reaches the editor and the stored card"),
and that commit is not an ancestor of this branch's tip. The oracle used
here is therefore Ruby's own source read from the pinned gem set plus the
committed render capture arm, not that fixture. The capability checklist's
own row for this surface (tools/edge-signed-in-exercise/capabilities.json,
C10) still reads "not_covered" with the older finding "URL presets ignored:
the new-card form hardcodes an empty name and content"; that finding
predates the preset this row measures, and the run's own capability
coverage record is the one that grades it. In the run record's
capabilityCoverage the C10 row reads "covered", with the check "C10 content
preset in the /new URL fills the editor and is stored on the card" listed
as verified.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round11-20261024/rows-r1/report.md

    source 71d4f686007e9f26e75cbfe66db964bd2ccc08cd, started
    2026-10-24T22:21:12.528Z, completed 2026-10-24T22:42:55.803Z,
    the source files clean
    verdict: PASS
    evidence: {"status":200,"prefilledEditor":"<p>Harness preset</p>","marker":"Harness preset","storedMarker":true,"afterStatus":200}

The editor held the marker before the submit, the write answered 200, the
stored row carried the marker and was not trashed, and the card's own page
carried it afterwards. The cover-b C10 check in the same run agreed:

    evidence: {"editor":{"present":true,"active":true},"prefilled":"<p>Harness preset marker</p>","afterStatus":200,"stored":true}

The run as a whole graded 253 of 253 checks passed, 0 failed, 0 skipped by
write mode, with the capability coverage 70 covered, 20 partial, 1 not
covered, 1 disabled upstream, 3 out of scope, of 95.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
- The capability checklist's C10 row is not changed by this receipt, and the
  fixture named above is not claimed to be in this tree.
