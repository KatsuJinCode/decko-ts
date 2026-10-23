# mx-B-009: no blocked or 4xx/5xx subresource on the signed-in page

The roster row `mx-B-009-2-styling-and-console-on-signe` (family [Family])
reads "no blocked or 4xx/5xx subresource on the signed-in page", verdict PASS,
bucket DONE, with the evidence basis "DONE — ACT-009 re-graded from
INSTRUMENT-DEFECT to pass at tip: the instrument that produced the recorded
fail was defective (the harness aborted its own allow-listed-out favicon
requests and then graded its self-aborts as page defects), the corrected
instrument exists at the tip and its run passes verbatim, so no better thing
can be done." This receipt is the family's own adjudication of that row: the
instrument the registry's own ledger records for it, the Ruby oracle that
pins the surfaces the instrument touches, and a fresh measurement at this
tip.

## What the row is

Nothing the signed-in page asks for is refused: no subresource of that page
was blocked, and none of them answered 4xx or 5xx. The page is whole.

## The instrument

The harness's "2. styling and console on signed-in pages" group,
tools/edge-signed-in-exercise.mjs, the record "no blocked or 4xx/5xx
subresource on the signed-in page". It reads the browser's own record of the
requests the page made (`browser.blocked`: the requests the profile's
request policy refused, each with its url, status and resource type) and
grades that record empty.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "no blocked or
4xx/5xx subresource on the signed-in page", check_ids ["B-009"]) records
these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: unmeasured
    - whole-harness, headless-dom, native-local-bundle: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

Ruby's own head names the page's subresources, capture arm
probe-view:300:head@set/all/html/head.rb: the Material Icons stylesheet, the
deck's own stylesheet attachment, the favicon, the jQuery script from
code.jquery.com, the jquery-ujs script from cdnjs.cloudflare.com and the
alternate edit link. The port renders that same set of references from its
own head views (src/card/render/head-views.ts), so the subresources this row
grades are the ones Ruby's page asks for.

The instrument's own policy is the rest of the oracle: the harness admits the
deck's configured asset hosts read-only and aborts everything else, so a
blocked entry is a page defect and not the harness's policy
(tools/edge-signed-in-exercise/lib/harness-browser.mjs). The favicon the
deployment names is admitted by exact URL, so the harness does not abort a
resource the page is entitled to.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round4-20261023/final-r1/report.md

    source 09ca8dd9, started 2026-10-23T16:28:41.399Z
    verdict: PASS
    evidence: {"blocked":[]}

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by this lane, and the registry's live entry for this row reads
  unmeasured.
- The instrument is the harness's own browser policy, so the row's evidence
  is named-instrument evidence; the oracle pins the page's subresource set
  (Ruby's own head), not the browser's policy.
- The row's DONE condition in the roster is not changed by this receipt; this
  receipt adds the family's own evidence for the row.
