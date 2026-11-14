# mx-B-010: no console errors on the signed-in page

The roster row `mx-B-010-2-styling-and-console-on-signe` (family [Family])
reads "no console errors on the signed-in page", verdict PASS, bucket DONE,
with the evidence basis "DONE — ACT-010 re-graded from INSTRUMENT-DEFECT to
pass at tip: the instrument that produced the recorded fail was defective
(the six `net::ERR_BLOCKED_BY_CLIENT.Inspector` console errors are the
page's echo of the harness's own request aborts (`.Inspector` marks a
CDP-initiated block; with --disable-extensions and a throwaway profile the
handlers are the only source)), the corrected instrument exists at the tip
and its run passes verbatim, so no better thing can be done." This receipt is
the family's own adjudication of that row: the instrument the registry's own
ledger records for it, the Ruby oracle that pins the surfaces the instrument
touches, and a fresh measurement at this tip.

## What the row is

The signed-in page runs clean: the browser's console carries no error and no
uncaught page error. Nothing the page's own scripts did failed.

## The instrument

The harness's "2. styling and console on signed-in pages" group,
tools/edge-signed-in-exercise.mjs, the record "no console errors on the
signed-in page". It reads the browser's own console record and grades it
empty.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "no console errors on
the signed-in page", check_ids ["B-010"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: unmeasured
    - whole-harness, headless-dom, native-local-bundle: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

The instrument's own filter is the oracle for this row, and it is the
correction the roster names: `isHarnessRequestAbortEcho`
(tools/edge-signed-in-exercise/lib/harness-browser.mjs:144) drops exactly the
console messages that are Chromium's echo of the harness's OWN request
blocking (`net::ERR_BLOCKED_BY_CLIENT`, suffixed `.Inspector` on a
CDP-initiated block). With --disable-extensions and a throwaway profile no
other client-side blocker exists, so a genuine page error never carries that
token; the harness's aborts are recorded per request in `blocked` and graded
by mx-B-009, not counted twice as page defects.

The page's own scripts are Ruby's: the head's script set (capture arm
probe-view:300:head@set/all/html/head.rb) names jQuery and jquery-ujs, and
the port serves the same set from its own head views
(src/card/render/head-views.ts).

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round4-20261023/final-r1/report.md

    source 09ca8dd9, started 2026-10-23T16:28:41.399Z
    verdict: PASS
    evidence: {"errors":[]}

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane, and the registry's live entry for this row reads
  unmeasured.
- The evidence is named-instrument evidence: the console record and its
  filter are the harness's own. The oracle pins the page's script set, not
  the browser's console.
- The row's DONE condition in the roster is not changed by this receipt; this
  receipt adds the family's own evidence for the row.
