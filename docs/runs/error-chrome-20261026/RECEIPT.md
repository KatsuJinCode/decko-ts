# Every error page renders inside the site chrome: the 24 bare refusal steps closed, and the raw-body table pinned

The adversarial-port lane (docs/runs/adversarial-port-20261026/03-refusal-chrome-scope.md on
port/attack-20261026) measured that at the candidate tip, raw body bytes differ from the Ruby
oracle on 38 of 87 battery steps, 25 of them refusal steps: the refusal-chrome fix
(port/refusal-chrome-20261026, merged here as the lane's base) closed only the non-ajax 422
gate with an existing acted-on card. Every 403 denial answered a 208-215-byte bare document,
every 404 read answered 0 bytes, and the excluded 422 arms (sign-in, sign-up, creates, the
missing-card deletes, the corrupt upload) answered 315-468 bytes, where the recorded Ruby site
renders full pages (4,695-18,722 bytes). The battery's comparator normalized error pages to
message text (its own documented rule), so no pinned suite could see any of it.

## Base and provenance

`git ls-remote` first: the newest pushed tip of deploy/full-candidate-20261102 is
c29e4c3f4c170542fd4a44b6eccc2dcf5dd111f6. The disk guard refuses a second full clone of a
repository the machine already holds, so the lane's exclusive checkout is a diskSteward-owned
worktree (create_worktree.py, lease d92205afb927, owner lane-fix-error-chrome-2-1) at
C:/localProjects/decko-ts-error-chrome-20261026, branch port/error-chrome-20261026, created at
that commit. The reviewed fix branch port/refusal-chrome-20261026 (076246fba, a strict
descendant of the candidate tip) was merged fast-forward, forward-only, before the work below;
the affected suites ran green at the merged base before the extension started.

All measurements ran in that worktree with the engine distribution built from the working tree
(npm run build:engine, exit 0) and the LibSass program reused from the release-lead checkout's
build output via PARITY_SASSC (LibSass 3.6.4; regenerable machine state).

## Ruby's mechanism, and what the port now reproduces

Ruby's controller rescue (decko-0.20.0 lib/card_controller/errors.rb:18-24 handle_exception)
answers every rescued error with `show error.class.view, error.class.status_code` - the
acted-on card rendered through the deck's layout. The class ladder
(fixtures/captured/user-error-422-view-ruby-oracle.json): PermissionDenied 403/:denial,
NotFound 404/:not_found, everything on the UserError ladder 422/:errors. The rescue card for a
refused create or a missing mark is the mark's unsaved card, and the error views are
`perms: :none` (card-mod-format set/all/html/error.rb), so
card-1.110.0 lib/card/view/permission.rb:60 skip_check? short-circuits altered_view
(:34-43) - the view renders AS ITSELF on the unknown card, never hijacked into the create
form. The loud denial's message branches on Auth.signed_in? with @denied_task NIL on the
rescue path (html/error.rb:186-212), which is the "to do that" wording.

The port now assembles the same answer for every class:

1. The page assembly's unknown-main substitution (src/card/render/page.ts) skips perms-none
   requested views (PERMS_NONE_VIEWS, exported from render/format.ts): the ported
   permission.rb skip_check? gate. A refusal page for an unsaved card renders its :errors or
   :denial view instead of the create form.
2. renderRefusalPage (src/server/write-routes.ts) generalized: the view and status come from
   the error class (403 -> :denial, 404 -> :not_found, else :errors); the error bag is an
   ordered (attribute, message) list - one paragraph per line of the shown string under its
   shared key, the keyless abort rendering bare (refusalPageErrorEntries), which reproduces
   the recorded two-paragraph password rejection page byte for byte; the loud denial's
   page-scoped phrase override (RenderEngine.pageLoudDenialTaskPhrase, now honored by the
   anonymous arm of loudDenialMessageHtml in render/format.ts) gives the rescue's "to do
   that"; a refused create's rescue card carries the request's type (card[type] or the
   /type/<Type> route's shortcut, as NewCardOptions.typeName); a missing mark's probe miss
   turns the engine's renderAbsentCards on, and the page assembly fetches the mark's unsaved
   card (new:{}).
3. The rescue arm in the write path answers the page for every non-ajax, non-JSON refusal
   whose acted-on card has a name (error.cardName, the route mark, or the create's card name
   parameter - the blank-name create renders the blank rescue card's page, the recorded
   "Problems"-heading answer). The JSON flavor keeps the JSON error reply (the recorded
   anon-update-existing-json shape: error_status, errors, url, requested_at). The ajax arm
   keeps the bare alert document (the slotter JS swaps it into the form's card-notice).
4. The sign-in ladder's fail() renders the *signin card's :errors page through the same
   assembly (the recorded signin pages: the 16k site page around the same alert the bare
   document carried), the bare alert document staying as the render-miss fallback.
5. The battery's GET path (tools/parity-side-effects/ts-drive.mjs readPage) renders unknown
   marks through renderPageWithStatus: the not_found page inside the deck layout, status 404 -
   the same answer the reference-harness posture pins byte-equal against Ruby's recorded
   unknown-card renders (tests/card/render/fresh-deck/absent-cards.test.ts, 12 tests green at
   this tree). The hosts' lean 404 page is a separate named register row (register-routes C10)
   with its own serving-surface dependency; this lane does not touch it.

## The blind closed: the comparator's raw-body verdict

tools/parity-side-effects/compare.mjs now compares every step's recorded bytes at the
page-content granularity, alongside the message-text comparison (which stays - it is what the
fields verdict grades):

- The comparison point is the page's content bytes: the `<article>` main slot when the layout
  carries one, everything after `</head>` when it does not (the spartan layouts render head +
  main with no article), the whole body otherwise.
- Two nondeterministic byte classes are masked on BOTH sides: the per-render
  `data-slot-id` hex and the machine-local asset generation names
  (`/files/~id/<generation>.css|js` - Ruby names each bundle by its recording clock, the port
  by its own). JSON error replies normalize `requested_at` (each engine's clock; the same rule
  the message-text extractor already applied).
- Verdicts per step, reported in each row's `rawBody` field and a RAW BODIES summary line:
  byte-equal; slot-equal; declared (the step's deliberate pin names the difference); residual
  (the two named read-surface classes); raw-mismatch (fails).

The head's remote-script SRI/referrerpolicy attribute bytes (Ruby carries integrity hashes the
port omits) stay OUTSIDE the masks: they are a real, unmasked byte difference on every page
the port renders, the same engine-local head class the refusal-chrome receipt named, and they
are why the verdict compares from the main slot onward rather than claiming whole-page byte
equality nobody has.

## The proof: the raw table at the new tip

The attack's method, re-run at this tree (drive exit 0, then the comparator):

    node tools/parity-side-effects/ts-drive.mjs \
      reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 tmp/error-chrome/work-r3
    node tools/parity-side-effects/compare.mjs \
      reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
      tmp/error-chrome/ts-trace-r3.json tmp/error-chrome/compare-r3.json

Comparator headline: `SIDE EFFECTS PASS 80 / 87; deliberate differences pinned 7; mismatches 0`
- the recorded verdict, restored (the first extension round had broken the 403 steps' message
extraction, fixed by reading the "Sorry!" cut from the denial page on both sides).

Raw bodies: `byte-equal 51; slot-equal 28; declared 6; residual 2` - and 0 raw-mismatch. The
attack's 38 differing rows, accounted step by step (31 of them carry a refusal status):

- 28 refusal-status steps now match Ruby at raw granularity: the 3 not_found read pages (the
  404 class, port bytes grown from 0 to the full page), the 6 html 403 denial pages (grown
  from 208-215), and 17 422 errors pages (grown from 315-468: the sign-in and sign-up
  validations, the creates, the missing-card deletes, the corrupt upload, the type change and
  the layout update), each slot-equal - the main slot byte-equal to the recorded Ruby page
  once the per-render slot ids are masked. The 2 JSON-format refusals
  (anon-update-existing-json, signed-in-delete-missing-json) are byte-equal modulo
  requested_at - the only bytes that ever differed on them. Spot checks: the type-change
  refusal and the two-paragraph password rejection were compared paragraph-for-paragraph
  before the masks were written; both were already byte-identical.
- read-probe-page and read-image-page: slot-equal (their recorded differences were head-asset
  bytes).
- 6 declared: get-home (the bundle wall-clock pin), signin-unknown and signin-wrong-password
  (the approved uniform sign-in answers - the page chrome now matches, the message text is the
  declared divergence), reset-unknown-email, restore-file-revision,
  admin-create-skin-bad-parent (Ruby's recorded 500 crash pages).
- 2 named residuals, both read-surface, neither claimed by the attack ("the format fixtures'
  normal territory"): signed-in-read-home (Ruby's recording carries the new-user setup view as
  the signed-in home's main, the port renders the Home card's content view) and
  signed-in-read-json (Ruby answers the card's JSON view for a .json GET; the harness read
  path renders HTML - the read-format surface, not this lane's).

The strict mode's raw table, added by the strict-500-chrome lane
(docs/runs/strict-500-chrome-20261026/RECEIPT.md): `byte-equal 51; slot-equal 33; declared 1;
residual 2`, 0 raw-mismatch. The two rows this receipt's default-mode table lists as declared
(`restore-file-revision`, `admin-create-skin-bad-parent`, "Ruby's recorded 500 crash pages") are
graded on their bytes in strict mode, where the port now answers the whole deck page: Ruby
18,538 bytes, the port 18,134; Ruby 18,470, the port 18,066. Both are slot-equal, the main slot
byte for byte the recorded Ruby's. The one declared row the strict table keeps is `get-home`
(the recording's own clock shape).

The pinned suites:

- tests/server/user-error-422-view-parity.test.ts grew from 17 to 21 tests, all passing: the
  anonymous 403 denial page (chrome, the loud frame, "to do that", no <pre>), the missing-card
  delete's unsaved-card errors page ("Problems with Never Was 2", the USERERROR paragraph),
  the blank-field sign-in's *signin errors page (the abort shape), and the JSON error reply's
  exact key set. The four new pins name their falsifications in the describe comment.
- tests/tools/side-effects-scenario-battery.test.ts (the committed battery) now pins the raw
  table step by step: 0 raw-mismatch, every refusal step slot-equal, the JSON arms byte-equal,
  the 6 declared steps declared, the 2 residuals residual. The strict run's half of that suite
  pins the strict raw table too: 0 raw-mismatch, the two 500 rows slot-equal, `get-home` the
  one declared row (the strict-500-chrome lane).

## The suites

Format parity (the refusal-chrome receipt's Layer 1 command), at the landed tree:

    npx vitest run tests/server/html-format-parity.test.ts
       tests/server/json-format-parity.test.ts
       tests/server/rss-format-parity.test.ts
       tests/card/mod-loader/card-mod-format-remaining-views.test.ts
       tests/card/mod-loader/card-mod-bootstrap.test.ts
       tests/card/mod-loader/card-mod-bar-box-format-oracle-pinned.test.ts

Result: 6 files, 147 tests, all passing - identical to the merged base's baseline. The
absent-cards byte pins (tests/card/render/fresh-deck/absent-cards.test.ts): 12 passed.

The render-surface sweep (tests/card/render/, 269 files): 1,245 tests passed, 4 failed in 2
files. One failure was this lane's own doing and is fixed: the page dispatch's source pin
(page-main-view-dispatch-rescue-scope-pins.test.ts) asserts page.ts's exact import line from
format.js, and the lane's PERMS_NONE_VIEWS export extends that line - the pin now asserts the
new exact line, its purpose unchanged (the quiet span helper and the posture switch stay
imported), and the suite is green. The other three failures are the
content-options-one-line-count-capture-state-pins suite reading the machine's Ruby study
archive at C:/localProjects/archive/decko-fork-study (an absolute path outside this
repository): the archive copy is partial and lacks mod/edit/set/type/pointer.rb, so the tests
die on ENOENT before any assertion. Nothing in this lane's diff touches that suite or that
path.

The side-effects battery, as the committed suite drives it (its own dist-freshness gate and
LibSass build): tests/tools/side-effects-scenario-battery.test.ts - green, including the new
raw-body pins. The comparator run over the lane's own drive: the headline and raw counts above.

The wider write surface, as a regression sweep for the write-routes change: the full
tests/server directory ran, 171 files, 1,741 tests passed, 30 skipped, 14 failed in 10 files.
Seven of the ten are exactly the suites the refusal-chrome receipt re-ran at the base tree and
attributed to clean-checkout environment dependencies (bunny-edge-files and the six
parity-suite families); their failure messages at this tree name files this lane never touched
(card-action-engine.ts, first-run-setup.ts, card-mod-history.ts, worker-shared-surface.ts).
The other three are the MySQL driver suite's three files, failing because the machine's
MySQL test cache is absent entirely (C:/localProjects/.mysql-test-cache does not exist; the
suite's own message asks for node tools/mysql/fetch-mysql.mjs, a third-party download this
lane does not make). None of the failures touches the write surface, the render surface, or
any error page; the suites that exercise this lane's code (user-error-422-view-parity, the
format parity set, absent-cards, the battery) all pass.

## The boundaries (documented remainders)

- The hosts' lean 404 page for unknown-card GETs is register-routes C10's named serving-surface
  decision; the battery's GET reads now render the engine's not_found page, which is the
  parity surface the C10 comment itself names as byte-equal on the harness posture.
- The 2 read-surface residuals above are named in the comparator and pinned as residuals.
- The head's SRI attribute bytes stay an unmasked engine-local class, the same one the
  refusal-chrome receipt named.
- reset-unknown-email keeps its declared 303 (the uniform-failure security posture); its page
  class never renders because the port deliberately does not refuse there.

## Residue

tmp/error-chrome/ (the three drive traces, compare reports, work dirs, the baseline raw-table
tool) and the five tmp-ora-*.html oracle extracts at the repo root were this lane's scratch:
untracked, regenerable from the committed fixture with the two commands above, moved to the
system temp at landing. node_modules, dist/, the LibSass build output copied from the
release-lead checkout, and the OS-temp scratch are regenerable machine state. No schedules,
deploys or live services were touched; nothing was pushed to any host.
