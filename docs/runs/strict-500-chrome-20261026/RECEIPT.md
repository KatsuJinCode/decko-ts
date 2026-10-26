# The strict-parity 500 is a page: the crash's own view inside the deck's chrome

The adversarial-port-v2 lane (docs/runs/adversarial-port-v2-20261026/00-SUMMARY.md on
port/attack2-20261026, commit 79e8421d0) measured that in strict mode the port answers a
261-byte bare document where the recorded Ruby site serves 18,538 and 18,470 bytes of deck
page. The strict arm of the write path returned before the chrome arm, the comparator's
deliberate pin exempted the step from the raw-body grade, and
docs/STRICT-PARITY-FLAGS.md's claim ("the same 500 and the same server_error page") was true
of the view and false of the page. Under the approved-divergences register's own rule ("anything
not listed here is meant to behave exactly as Ruby Decko does; an unlisted difference is a
defect") this was an unlisted difference.

This lane closes it: the strict 500 now renders the same deck page the recorded Ruby site
serves, with the crash's own error view inside it, and the comparator grades that page's bytes
instead of exempting them.

## Base and provenance

`git ls-remote origin refs/heads/deploy/full-candidate-20261103` first: 5131d2ac40dacc64c45530941e82937caef86137,
the newest pushed tip. The lane's checkout is a lane-copy worktree (no second full clone), at
C:/localProjects/decko-ts-strict-500-chrome-20261026, branch port/strict-500-chrome-20261026,
created from that tip. All measurements below ran in that worktree with the engine distribution
built from the working tree (`node tools/dist/build-engine.mjs`, exit 0) and the LibSass program
from the shared artifact cache via PARITY_SASSC (LibSass 3.6.4).

## Ruby's mechanism, and what the port now reproduces

Ruby's controller rescue (decko-0.20.0 lib/card_controller/errors.rb:18-24 handle_exception)
answers a rescued error with `show error.class.view, error.class.status_code`: the acted-on card
rendered through the deck's layout with the error class's own view in the main slot. The class
ladder (card-1.110.0 lib/card/error.rb): PermissionDenied 403/:denial, NotFound 404/:not_found,
the UserError ladder 422/:errors, ServerError 500/:server_error (the class pair at
card/error.rb:45-56). The 500's view is card-mod-format's "Wild Card!" block
(card-mod-format-0.20.0 set/all/html/error.rb:2), and the recorded Ruby answers are whole deck
pages carrying it (18,538 bytes for the revision restore, 18,470 for the skin create).

The port now assembles the same answer for the 500 as it already did for the 403/404/422
classes:

1. `renderRefusalPage` (src/server/write-routes.ts) was generalized into `renderErrorPage`,
   which takes the view name rather than deriving it from a status. The class ladder moved with
   it: `renderRefusalPage` still maps 403 -> :denial, 404 -> :not_found, else :errors, and the
   new :server_error view is the 500's own class pair.
2. The strict arm of the write path's route catch now renders that page for the surfaces the
   page serves (a non-ajax, non-JSON request naming a card): the acted-on card through the
   deck's layout with the "Wild Card!" block in the main slot. The bare document stays for the
   surfaces the page does not serve (the ajax slotter's alert, a JSON request) and as the
   render-miss fallback, the same split the refusal arm makes.
3. The view renders the crash's own error view exactly as the recorded site shows it: the port's
   `server_error` view block is byte-identical to card-mod-format's (the single-quoted
   attributes included), so the main slot is the recorded Ruby's bytes, not a paraphrase.

## The bytes

The strict-mode port answer for each of the two crash steps, against the recorded Ruby oracle
(reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json):

| step | Ruby status | Ruby bytes | port status | port bytes | raw verdict |
| --- | --- | --- | --- | --- | --- |
| restore-file-revision | 500 | 18,538 | 500 | 18,134 | slot-equal |
| admin-create-skin-bad-parent | 500 | 18,470 | 500 | 18,066 | slot-equal |

The main slot is byte for byte the recorded Ruby's: 256 bytes each, sha256
e6cf6bddde1712d221f9b631b4bfcfc7466563af77f8a4c9ef0811d6f547b31d on both sides of both steps.

    PORT == RUBY, byte identical:
    <article class="container flex-shrink-0" role="main"><div id="main"><div class='border border-danger text-center p-3'>
    <h1>Wild Card!</h1>
    <h2 class='alert-danger'>500 Server Error</h2>
    <h4 class='p-3'>
    Yuck, sorry about that.
    </h4>
    </div>
    </div></article>

The remaining whole-page difference (18,538 vs 18,134, and 18,470 vs 18,066) is the head's
engine-local class every port page carries against Ruby's recording: the recorded Ruby's SRI
integrity attributes on the remote scripts, its own asset generation names, and its root URL.
That is the class the error-chrome receipt named, and it is why the comparator's raw grade is
slot-equal rather than byte-equal.

## The blind spot, removed

The comparator's raw-body verdict exempted any step with a deliberate pin from the byte grade.
The pin describes the DEFAULT mode's difference; in strict mode the pin is erased
(`strictErases: true`) and the step is an ordinary one, so the bytes must be graded there too.
The field verdict already honoured that rule; the raw-body verdict did not, so a strict-mode
body that still differed by kilobytes was graded "declared" and the raw table read clean.

`tools/parity-side-effects/compare.mjs` now exempts a strict-erased pin only outside strict
mode. The change is the attacker's one-line change
(docs/runs/adversarial-port-v2-20261026/probes/make-strict-aware-comparator.mjs), applied to the
comparator itself rather than to a scratch copy.

Measured, on the SAME pre-fix strict trace, before and after the comparator change:

    before: RAW BODIES byte-equal 51; slot-equal 31; declared 3; residual 2
      RAW raw-mismatch restore-file-revision (ruby 18538 / ts 261 bytes)
      RAW raw-mismatch admin-create-skin-bad-parent (ruby 18470 / ts 261 bytes)
    after:  RAW BODIES byte-equal 51; slot-equal 31; declared 1; residual 2; raw-mismatch 2

The "after" line is the attack's own measurement, reproduced here. The comparator's change
touches the strict mode only: the same patched comparator over the default trace reads
byte-equal 51; slot-equal 28; declared 6; residual 2, unchanged.

## The proof: both modes, at the fixed tip

Commands (both exit 0):

    node tools/parity-side-effects/ts-drive.mjs \
      reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 tmp/strict500/default-work2
    node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/strict500/trace-default-2.json tmp/strict500/compare-default-4.json

    DECKO_STRICT_PARITY_SIGNIN_DETAILED_ERRORS=on \
    DECKO_STRICT_PARITY_REVISION_RESTORE_500=on \
    DECKO_STRICT_PARITY_SKIN_CREATE_500=on \
    DECKO_STRICT_PARITY_SCRIPT_BUNDLE_CLOCK_NAMES=on PARITY_STRICT=1 \
    node tools/parity-side-effects/ts-drive.mjs \
      reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 tmp/strict500/strict-work3
    PARITY_STRICT=1 node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/strict500/trace-strict-3.json tmp/strict500/compare-strict-4.json

| mode | comparator headline | raw bodies |
| --- | --- | --- |
| default | `SIDE EFFECTS PASS 78 / 87; deliberate differences pinned 9; mismatches 0` | byte-equal 51; slot-equal 28; declared 6; residual 2 |
| strict | `SIDE EFFECTS PASS 86 / 87; deliberate differences pinned 1; mismatches 0` | byte-equal 51; slot-equal 33; declared 1; residual 2 |

The default mode is unchanged, row by row: the pre-fix and post-fix default reports have
identical rows (compared field by field over all 87 steps: verdict, diffs and raw verdict) and
identical raw counts. The attack's table is the before: it read `declared 3; slot-equal 31` in
strict mode with the two 500 rows exempted, and reads `declared 1; slot-equal 33` now, the two
500 rows among the graded ones.

The strict table's one declared row is `get-home` (the recording's own clock shape, the
`strictTs` pin). The strict raw table's 2 residuals are the same named read-surface classes the
default table carries.

The per-step table for both modes, before and after, is committed at
`artifacts/raw-body-table-strict-500.json`.

## The pinned tests

- `tests/server/write-routes-strict-parity.test.ts`: the two crash 500s, at the HTTP write
  surface, in both modes. The deck gained a layout (the header, footer and article slots a deck
  page needs) and the card-mod-format mod loader, so the strict 500's page is a real deck page
  and the assertions can name its chrome: the body class, the header, the article, the footer,
  the title, the noindex marker for the create case, and the exact main-slot adjacency of the
  "Wild Card!" block. The default-mode 422 assertion matches the recorded Ruby page shape (the
  abort message bare inside the chrome, no `ABORT:` prefix).
- `tests/tools/side-effects-scenario-battery.test.ts`: the strict run's raw table, step by step:
  0 raw-mismatch, both 500 rows slot-equal, `get-home` the one declared row.

Falsification: with the strict arm's page render removed, both 500 rows fall back to the bare
261-byte document and the comparator grades them raw-mismatch (measured above on the pre-fix
trace); with the comparator's strict-aware exemption removed, the raw table reads clean over
the same difference.

## The suites

Format parity, the refusal-chrome receipt's Layer 1 command, at this tree:

    npx vitest run tests/server/html-format-parity.test.ts
       tests/server/json-format-parity.test.ts
       tests/server/rss-format-parity.test.ts
       tests/card/mod-loader/card-mod-format-remaining-views.test.ts
       tests/card/mod-loader/card-mod-bootstrap.test.ts
       tests/card/mod-loader/card-mod-bar-box-format-oracle-pinned.test.ts

Result: 6 files, 147 tests, all passing (147/147).

The committed battery suite, both modes:

    npx vitest run tests/tools/side-effects-scenario-battery.test.ts

Result: 1 file, 2 tests passed - the default run (78 steps pass, the 9 declared, no mismatch)
and the strict run (86 steps pass, `get-home` keeps its declared difference, no mismatch).

Type check: `npx tsc --noEmit`, exit 0.

The write-surface regression sweep: `tests/server/write-routes-strict-parity.test.ts` 4/4,
`tests/server/user-error-422-view-parity.test.ts` (21),
`tests/server/not-found-404-view-parity.test.ts` (15) and
`tests/server/error-rescue-path-parity.test.ts` (19) - 55/55 across the three.

## The boundaries (documented remainders)

- The bare server-error document stays for the surfaces the page does not serve: the ajax
  slotter's alert, a JSON request, and the render-miss fallback. The recorded Ruby answers for
  those surfaces are the bare document too (the ajax arm never navigates).
- The whole-page bytes are not byte-equal to Ruby's recording (18,134 vs 18,538; 18,066 vs
  18,470). The difference is the head's engine-local class, the same one every port page
  carries; the main slot, where the crash's own error view lives, is byte-equal.
- The comparator's raw grade is slot-equal, not byte-equal, for the two rows, because that
  grade masks the per-render slot ids and the asset generation names. That is the comparator's
  documented granularity, unchanged by this lane.

## Residue

tmp/strict500/ (the drive traces, the compare reports, the work directories and the scratch
probes) is this lane's scratch: untracked, regenerable from the committed fixture with the two
commands above. node_modules, dist/ and the LibSass build output are regenerable machine
state. No schedules, deploys or live services were touched; nothing was pushed to any host; no
destructive git command was used.
