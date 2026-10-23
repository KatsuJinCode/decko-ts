# mx-B-008: deck stylesheet link resolves

The roster row `mx-B-008-2-styling-and-console-on-signe` (family [Family])
reads "deck stylesheet link resolves", verdict PASS, bucket DONE, with the
evidence basis
"verified — every instrument entry for B-008 is pass (live-acceptance-lane+whole-harness)".
This receipt is the family's own adjudication of that row: the instrument the
registry's own ledger records for it, the Ruby oracle that pins the surfaces
the instrument touches, and a fresh measurement at this tip.

## What the row is

The signed-in page's stylesheet links resolve: the browser fetched them and
each one produced a stylesheet (a link element with a live `sheet`), so the
deck is styled and its own CSS was not a 404.

## The instrument

The harness's "2. styling and console on signed-in pages" group,
tools/edge-signed-in-exercise.mjs, the record "deck stylesheet link resolves".
It reads every `link[rel~="stylesheet"]` off the signed-in page and grades it
on the live DOM: the link must exist AND the browser must have built a
stylesheet for it (`Boolean(l.sheet)`). A link that was fetched and rejected
carries no sheet, so the leg fails on a broken stylesheet rather than on a
missing tag.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "deck stylesheet link
resolves", check_ids ["B-008"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

Ruby's own head renders the stylesheet tags, capture arm
probe-view:320:stylesheet_tags@set/all/html/head.rb:

    <link href="https://fonts.googleapis.com/css2?family=Material+Icons" media="all" rel="stylesheet" type="text/css" />
    <link media="all" rel="stylesheet" type="text/css" href="/files/~447/1789819200.css" />

The port renders both links byte for byte: the Material Icons tag is the
constant REMOTE_STYLE_TAG (src/card/render/head-views.ts:220-221) and the
deck's own stylesheet is the link head-views.ts:196-198 builds.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round4-20261023/final-r1/report.md

    source 09ca8dd9, started 2026-10-23T16:28:41.399Z
    verdict: PASS
    evidence: {"links":[{"href":"https://fonts.googleapis.com/css2?family=Material+Icons","sheet":true},{"href":"https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com/files/45514/1790384218.css","sheet":true},{"href":"https://127.0.0.1:65272/mod/bootstrap/fontawesome-6.7.2/css/all.min.css","sheet":true}]}

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane.
- The deck's own stylesheet URL is the DECK's fact (the attachment the deck
  carries); Ruby's captured arm carries the same shape on its own deck. The
  link's shape is what is oracle-matched, not the attachment's identity.
- The row's DONE condition in the roster is not changed by this receipt; this
  receipt adds the family's own evidence for the row.
