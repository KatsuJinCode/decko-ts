# Receipt 2: the error-page chrome, the raw-body table at the rolled tip

Claim attacked: the error-chrome lane (`port/error-chrome-20261026`) claims
that every error class renders inside the site chrome as Ruby's rescue does,
and that the raw-body table at its tip reads **byte-equal 51; slot-equal 28;
declared 6; residual 2** with **0 raw-mismatch**
(`docs/runs/error-chrome-20261026/RECEIPT.md`, "The proof: the raw table at
the new tip").

Attacked tree: `deploy/full-candidate-20261103` at `5131d2ac40dacc64c45530941e82937caef86137`.

## Verdict: the raw-body table HELD (zero raw-mismatch, no step regressed); the CLASS it names is BROKE for the strict-parity 500

Two separate results, both measured in this lane:

1. **The brief's check held.** The raw-body table at the rolled tip reads
   `byte-equal 51; slot-equal 28; declared 6; residual 2` in the default
   mode, with **0 raw-mismatch**. That is the error-chrome receipt's own
   numbers, unchanged: no step regressed in the merge that absorbed the
   strict-parity, timeago and anchor lanes. In the strict mode the table
   reads `byte-equal 51; slot-equal 31; declared 3; residual 2`, also with 0
   raw-mismatch.

2. **The class the receipt names is not closed.** "Every error class renders
   inside the site chrome" does not hold for the strict-parity 500 arm. In
   strict mode the port answers a **261-byte** bare document where the
   recorded Ruby answers an **18,538-byte** and an **18,470-byte** site page.
   The raw table grades both rows `declared`, so the headline reads clean.
   This is the same bare-document class the error-chrome lane was chartered
   to close, reopened by the lane that was merged after it.

## The bytes

The strict-mode port answer for `restore-file-revision` and for
`admin-create-skin-bad-parent` (verbatim from the strict trace, both 261
bytes, both status 500):

    <!DOCTYPE html><html><head><title>Error (server-error)</title></head><body><div class='border border-danger text-center p-3'>
    <h1>Wild Card!</h1>
    <h2 class='alert-danger'>500 Server Error</h2>
    <h4 class='p-3'>
    Yuck, sorry about that.
    </h4>
    </div>
    </body></html>

The recorded Ruby answer for the same step (18,538 bytes, from
`reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json`):
the whole deck page, `<html class="h-100">`, the head with the site's own
stylesheet links, the deck's footer, the "Decko v0.20.0" line, the card's own
SVG. The Wild Card block is inside it; it is the same view rendered through
the site, not the view alone.

In the DEFAULT mode the same step renders the chrome: 18,183 bytes against
Ruby's 18,470 (slot-equal). So the chrome arm exists and works for this step;
the strict arm simply does not use it.

## The mechanism, in the source

`src/server/write-routes.ts`, the route catch, in order:

- `:2867-2872` - the strict-parity arm:

      if (error instanceof StrictParityCrashError) {
        if (!json && !isAjax(req, parsed) && route.mark !== undefined) { ...saveLocation... }
        return htmlResponse(500, "Error (server-error)", SERVER_ERROR_HTML);
      }

  `SERVER_ERROR_HTML` is the Wild Card block on its own
  (`src/card/render/debug-server-error.ts`), and `htmlResponse` wraps it in a
  bare `<html><head><title>Error (server-error)</title></head><body>` shell.
  This arm returns BEFORE any page assembly.

- `:2956-2983` - the chrome arm, the one the error-chrome lane built: it
  serves 403, 404 and 422 refusals through `renderRefusalPage`, the deck's
  own page assembly, with the error bag on the error view.

The 500 is not in the error-chrome lane's class ladder (the receipt names
`PermissionDenied 403/:denial`, `NotFound 404/:not_found`, the `UserError`
ladder 422/:errors), and Ruby's 500 is an unhandled exception rendering the
public production error page, not the controller's rescue. So the
error-chrome lane's scope was honest. The strict-parity lane, merged after
it, introduced a second error arm that answers a bare document, and the
strict mode is the posture a deployment that wants Ruby's exact behaviour
turns on.

## Why no pinned suite sees it, and the constructed input that does

`tools/parity-side-effects/compare.mjs` has two verdicts per step.

- The FIELD verdict (`deliberateVerdict`, `:367-368`) honours the strict
  erasure rule: "if (`PARITY_STRICT && pin.strictErases === true`) return
  null", so in strict mode a flag case that still differed on a field would be
  graded MISMATCH.
- The RAW-BODY verdict (`rawBodyVerdict`, `:465-470`) does not. It exempts a
  step with a deliberate pin from the raw-mismatch grade with no reference to
  the strict mode:

      if (deliberateOf[name] !== undefined) {
        out.verdict = "declared";
        return out;
      }

  In strict mode the pin's difference is gone, so "declared" is the DEFAULT
  mode's label applied to a step that no longer has that difference.

The constructed input is one line: a copy of the comparator whose raw-body
verdict does not exempt a `strictErases` pin in strict mode
(`probes/make-strict-aware-comparator.mjs`). Run on the same strict trace:

    PARITY_STRICT=1 node <out-dir>/compare.mjs <ruby.json> <ts.json> <report.json>

    RAW BODIES byte-equal 51; slot-equal 31; declared 1; residual 2; raw-mismatch 2
      RAW raw-mismatch restore-file-revision (ruby 18538 / ts 261 bytes)
      RAW raw-mismatch admin-create-skin-bad-parent (ruby 18470 / ts 261 bytes)

The same patched comparator on the DEFAULT trace is unchanged
(`byte-equal 51; slot-equal 28; declared 6; residual 2`), so the patch
touches the strict mode only. The patched report is committed at
`artifacts/compare-strict-rawaware.json`; the unpatched one at
`artifacts/compare-strict.json`.

## What the register says about it

The approved-divergences register (the draft that travels with the issue)
states: "Anything not listed here is meant to behave exactly as Ruby Decko
does; an unlisted difference is a defect." Its Storage section lists the two
behavioural divergences (the File/Image revision restore and the deny-signup
knock-on: Ruby crashes with a 500, the port restores). It does not list the
strict mode's page bytes. Under the register's own rule, the strict mode's
bare 500 page is an unlisted difference.

The strict-parity documentation claims the opposite of what the bytes show:
`docs/STRICT-PARITY-FLAGS.md:26-27` says the strict mode reproduces "the
same 500 and the same 'Wild Card!' server_error page" and "the same
server_error page". The port reproduces the same VIEW on its own, without the
site that renders it.

## What would close it

Either the strict crash arm renders through the page assembly the way the
403/404/422 arm does (the rescue card's `server_error` view inside the deck
layout, which is what the recorded Ruby bytes carry), or the two strict
cases are listed as declared divergences with the reader-visibility stated.
Until one of those happens, the strict mode's "one for one with Ruby" claim is
true on every compared field and false on the bytes a visitor reads.

## Artifacts

- `artifacts/raw-body-table-rolled-tip.json` - the per-step table, default,
  strict, and strict-with-the-strict-aware-raw-verdict.
- `artifacts/compare-default.json`, `artifacts/compare-strict.json`,
  `artifacts/compare-strict-rawaware.json` - the three comparator reports.
