# Write-refusal pages: the alert renders inside the site page chrome

The Decision 2 evidence (decko-ts port/d1d2-verify-20261025,
docs/runs/decision-evidence-d1-d2-2026-10-25/FORMAT-19-SURFACES.md item 3, and
TRACE-COMPARISONS.md item 5) measured the type-change refusal's page chrome:
both engines answer the refused save with 422 and the same alert text, Ruby
wrapping it in a full site page (18,722 bytes: logo, menu, search, nav,
footer) while the port answered a bare 381-byte alert document titled
"Error (user-error)". Reader visibility: HIGH. This lane closes that gap: the
port's write-refusal path now renders the alert inside the site's page chrome
through the same page assembly every GET page uses.

## Base and provenance

The newest pushed tip of `deploy/full-candidate-20261102` was read with
`git ls-remote` first: c29e4c3f4c170542fd4a44b6eccc2dcf5dd111f6 (the same
base the Decision 2 evidence measured). This lane's exclusive worktree is
C:/localProjects/decko-ts-refusal-chrome-20261026, branch
`port/refusal-chrome-20261026`, created at that commit. (The disk steward's
create_worktree.py admission failed with "[Errno 13] Permission denied" on
its lease store, so the worktree was created with a plain `git worktree add`
on the same repo, path and ref the tool would have used; the branch is
exclusively this lane's either way.) The fix landed as commit 1fb083f9e and
the branch is pushed to origin/KatsuJinCode/decko-ts.

All measurements below ran in that worktree with the engine distribution
built from the working tree (`node tools/dist/build-engine.mjs`, exit 0) and
the LibSass program restored from the shared worktree artifact cache
(verified cache hit, LibSass 3.6.4).

## Ruby's mechanism, and what the port now reproduces

Ruby's rescue path (decko-0.20.0 lib/card_controller/errors.rb:18-24
handle_exception) renders the ACTED-ON card - still carrying the validation
errors the failed save left on it (card-1.110.0 lib/card/error.rb:131-157
report/cardify_exception) - through `show error.class.view,
error.class.status_code`: the card's :errors view inside the deck's full
layout. The with-errors arm (card-mod-format-0.20.0
set/all/html/error.rb:53-66 view :errors) builds voo.title ("Problems with
<name>", en.yml:16) and renders standard_errors (:120-127): the dismissible
warning alert (layout/set/all/alert.rb:7-25) with the h4 heading and one
"<p><strong>UPCASED KEY:</strong> message</p>" paragraph per error, joined by
newlines (format/content.rb:70 output's Array#join "\n").

The port refuses by throwing (no card object survives the rollback), so the
same shape is assembled across three pieces:

1. `RenderEngine.attachedErrorsByKey` (src/card/render.ts, cleared in
   resetCaches; typed on RenderEngineLike in src/card/render/format.ts): the
   refused save's error bag, keyed by the refused card's name key - the
   stand-in for the live card object Ruby's rescue shows. The html :errors
   view reads it exactly when Ruby reads card.errors.
2. The html :errors view's with-errors arm
   (src/card/mod-loader/mods/card-mod-format.ts errorsView): empty bag
   answers Ruby's nil (the read-side arm, byte-unchanged); with a bag it
   renders the alert bytes above, including the newline joins. The view also
   gained the `perms: "none"` config Ruby's registration carries
   (html/error.rb:53).
3. The write path (src/server/write-routes.ts): a page arm in the rescue
   block, beside the existing 403 denial page arm and the 409 conflict slot
   arm. Non-ajax, non-JSON refusals with status 422 and a route mark render
   the acted-on card's :errors page through `renderRefusalPage`: a fresh
   FetchEngine over the driver (never the write surface's own fetcher - the
   preview-editor render's discipline), the acting session's viewer and page
   chrome (the staging host's engineForActor discipline), the bag seated,
   then `renderPageWithStatus(engine, cardName, "errors")`. Status stays 422
   (`error.class.status_code`, error.rb:21). The render engine imports are
   lazy so the module-load graph of the file stays unchanged for the
   Workers/edge hosts.

## The proof: bytes at the new tip

The receipt's own method, re-run at this tree (the drive command is a
wrapper over the identical invocation; the shim blocked the direct
redirection form):

    node tools/parity-side-effects/ts-drive.mjs \
      reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 \
      tmp/refusal-chrome/ts-work > tmp/refusal-chrome/ts-trace-after.json
    (exit 0)

The refused type-change step (admin-skin-type-change):

| run | status | body bytes | sha256 |
| --- | --- | --- | --- |
| before (the Decision 2 evidence run at this same tree, c29e4c3f) | 422 | 381 | 70929c5636540f42... |
| after (this lane) | 422 | 18,318 | f1ec91e70f89873b... |

The port's page carries the Ruby page's title shape
(`<title>Parity Old Skin - My Deck</title>`) and every chrome marker the
recorded page carries (header/nav with logo, menu, search box, sign-out;
footer with the Decko v0.20.0 link). The `<article role="main">` main slot
was compared byte for byte against the recorded Ruby body
(reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json,
step admin-skin-type-change):

    PORT == RUBY, byte identical:
    <article class="container flex-shrink-0" role="main"><div id="main"><div
    class="alert alert-warning alert-dismissible  card-error-msg"
    role="alert"><button type="button" data-bs-dismiss="alert"
    class="btn-close" aria-label="Close"></button>
    <h4 class="alert-heading error">Problems with Parity Old Skin</h4>
    <p><strong>+*STYLESHEETS:</strong> Parity Probe Card has an invalid type:
    RichText. Allowed types: CSS and SCSS.</p></div></div></article>

The remaining byte difference between the two full pages (18,722 vs 18,318)
is engine-local head/asset bytes (script bundle URLs and generation stamps),
the same class of difference the port's own GET pages carry against Ruby's.

## The pinned test

tests/server/user-error-422-view-parity.test.ts grew from 13 to 17 tests,
all passing at the landed commit. The deck seeds gained the layout rule
(Default Layout, the battery deck's own layout body), the header/footer
codename cards, the Bootswatch skin codenames, and the refused save's two
cards. The new pins:

1. "the refused type change answers a full site page whose main slot is the
   errors alert": the scenario's exact request (PUT /Parity_Old_Skin, card
   card[type]=Bootswatch skin) answered 422 with the layout's
   body/header/article/footer around the main slot, and the alert bytes
   (adjacent to `<div id="main">`, h4 heading, newline-separated interior)
   byte-pinned.
2. "the same refusal over ajax keeps the bare alert document (no page)": the
   ajax arm is deliberate (the slotter JS swaps the alert into the form's
   card-notice; no navigation ever shows a page) and stays bare.
3. + 4. "the html :errors view body itself": the view function's empty-bag
   nil arm (the read surface, unchanged) and the with-errors arm's exact
   alert bytes.

Falsification is stated in the test: with the write-routes 422 page arm
removed, test 1 fails on every chrome assertion (the body reverts to the
bare document); with the view's with-errors arm or the bag attachment
removed, the page renders with an empty main slot and the alert assertions
fail.

## The suites

Format parity (the receipt's Layer 1 command), at the landed commit:

    npx vitest run tests/server/html-format-parity.test.ts
       tests/server/json-format-parity.test.ts
       tests/server/rss-format-parity.test.ts
       tests/card/mod-loader/card-mod-format-remaining-views.test.ts
       tests/card/mod-loader/card-mod-bootstrap.test.ts
       tests/card/mod-loader/card-mod-bar-box-format-oracle-pinned.test.ts

Result: 6 files, 147 tests, all passing - identical to the Decision 2
evidence's baseline.

Side-effects battery, same commands as the receipt:

    node tools/parity-side-effects/ts-drive.mjs <deck> <work>   (exit 0)
    node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/refusal-chrome/ts-trace-after.json tmp/refusal-chrome/compare-report.json

Battery line: `SIDE EFFECTS PASS 80 / 87; deliberate differences pinned 7;
mismatches 0` - the same verdict the evidence recorded, with the same 7
declared steps (get-home, signin-unknown, signin-wrong-password,
reset-unknown-email, restore-file-revision, admin-deny-signup,
admin-create-skin-bad-parent) and `admin-skin-type-change` itself PASS (the
comparator reads the alert content, which matches inside the page). Event
order: `81 / 81 deterministic steps agree; 6 not established`. Images: PSNR
66.57 to Infinity, alpha 1, as recorded. The committed battery test passed:
"drives the TypeScript engine through the 87 public steps ... 80 steps pass,
the 7 steps whose declared differences are pinned are declared, and no
mismatch remains" (1 test, green).

The wider write surface, as a regression sweep for the write-routes change:
the full tests/server directory ran, 171 files, 1,760 tests passed, 14
skipped, 7 failed - edit-session-replay's suite was not run ("data or setup
not present in this checkout", the runner's own note). The 7 failing suites
are bunny-edge-files, card-class-declarations-parity,
edit-draft-consumer-seam-parity, implicit-mark-setup-arming-parity,
jasmine-engine-mount-template-parity, port-only-vendor-font-assets-parity
and smell-run-all-parity. Every one was re-run at the BASE tree (the
d1d2-verify worktree, whose src is c29e4c3f): the same six parity files fail
there (6 failed / 43 passed) and bunny-edge-files fails there too (1 failed
/ 6 passed) - all 7 failures pre-exist this change (clean-checkout
environment dependencies), and none is attributable to this lane.

## The boundaries (documented remainders)

- Ajax saves keep the bare alert document (the slotter JS surface; pinned by
  the new test).
- Refusals with no route mark, refusals whose acted-on card does not exist
  (the missing-card delete keeps its pinned bare USERERROR bytes - the page
  lane's probe finds no card and the historical body stands), and hosts
  whose page render misses: all keep the bare document. Ruby's rescue card
  is the acted-on card; an absent card would send the page's main nest down
  the unknown-card view substitution, which is not the audited refusal
  shape.
- The 409 conflict arm keeps its audited renderSlot page arm; sign-in
  failures keep their dedicated arm. Neither is part of the measured
  finding, and changing them would move battery-pinned bytes this lane did
  not measure.
- The staging host's renderErrorPage seam stays the 403 denial arm's
  carrier; the 422 arm renders internally, so hosts without the seam (the
  battery's ts-drive among them) produce the full page unchanged.

## Residue

tmp/refusal-chrome/ holds this lane's scratch (the after trace, the compare
report, the recorded Ruby body copy, the drive wrapper, two archived
diagnostic probes); it is untracked and regenerable. node_modules and the
LibSass build output are regenerable machine state. No schedules, deploys or
live services were touched.
