# [Family] tranche 8, 2026-10-22: rows D1, D2, D3, E1, E2, E3, E4, E5

Lane: `port/routes-tranche8-20261022` in the exclusive lane checkout
`C:/localProjects/decko-ts-routes-tranche8-20261022`, a git worktree of the
tranche 7 lane's clone `C:/localProjects/decko-ts-routes-tranche7-20261021`,
branched at that branch's tip a5a305907 (the tranche 7 landing and cleanup
receipt). The worktree was created through the machine's own sanctioned
entry point, `C:/localProjects/diskSteward/agent/create_worktree.py`, which
admits the checkout against the disk reserve and records custody; a direct
`git clone` was refused by the gate as a second full clone of a repository
the machine already holds. The checkout's `.git` is a 1K FILE: the git
objects are shared with the tranche 7 clone, so this lane's checkout cost
is its tree and its node_modules, not a second copy of the history. Every
commit is pushed forward-only to origin (KatsuJinCode/decko-ts, private).
The branch tip moved a5a305907 to 7c2969ae9: one commit per row.

## Row selection, derived mechanically

The family has 72 rows and 56 are adjudicated across tranches 1-7, so the
next eight in row-id order are exactly **D1, D2, D3, E1, E2, E3, E4, E5**.
That is not read off by eye: the 56 was re-derived from the family
branches' own commit subjects at the tranche 7 tip
(`git log --format=%s a5a305907` over the row-id patterns), and the eight
this tranche landed were re-derived the same way over
`a5a305907..HEAD` (`D1 D2 D3 E1 E2 E3 E4 E5`, eight distinct rows). With
this tranche's eight rows folded in, **64 of the family's 72 rows are
adjudicated** and 8 remain: E6, E7, E8, E9, E10, E11, E12 and E13.

The register's own row inventory (the completeness roster's
`register-routes` family) was read to confirm the row ids and the 72-row
denominator: A1-A23, B1-B14, C1-C17, D1-D5 and E1-E13.

## The eight rows, one landing each

| Row | Commit | Disposition |
| --- | --- | --- |
| D1 `html` | d25fa61d0 | PORTED, measured, ONE NAMED DIVERGENCE. The html format is the ONE format with a class body of its own, so this row measures that body: the pinned class's own register :html, its own mime_type (text/html, and the base's own is text/plain), its own escape_literal (a span), main? (`!@main.nil?`) and focal? (`@focal \|\|= show_layout? ? main? : depth.zero?`, which MEMOIZES). The class body is loaded by the mod's own format files, and the card gem's own nesting modules are included ON THE BASE, because the pinned card gem includes them into Card::Format and the html class SUBCLASSES Card::Format: on the probe they would have shadowed the html class's own main? and focal?, and the first run measured the base's answers while calling them the html class's. The set ladder is the format mod's own show.rb and the LAYOUT mod's own process_layout.rb, class_eval'd onto a probe that subclasses the pinned html class; the layout arm is the layout mod's and it is the one that calls main!. The port's focal rule (src/card/render/format.ts:2216) is the pinned rule with the show_layout? TERM DROPPED, so the two agree in the serving posture and DIFFER in the ajax or layout=none posture, where the pinned html root is focal by depth.zero? and the port's is not. Named, left as it is. |
| D2 `json (suffix / Accept)` | d18bb0cc8 | PORTED, measured, ONE NAMED DIVERGENCE. The row's own name says the two doors, and the pinned deck's door order is `params[:format].present? ? params[:format].to_s : request.format`: the SUFFIX WINS over the Accept header whenever the suffix is present. THE FINDING: THE MEMBERSHIP TEST IS A STRING COMPARISON. The pinned registration stores the format NAME AS A STRING (card-1.110.0/lib/card/format/registration.rb:6-9) and the pinned explicit_file_format? compares the registry against the RAW requested format BEFORE the symbolization, so the string "json" is a member and the SYMBOL :json is NOT: the symbol answers the FILE sender. The suffix door hands the test a string and reaches the json format; the Accept door reaches it only when request.format IS that string, and a MIME type or a Symbol both answer :file. The json set block's own show defaults :molecule, the page details add url and requested_at to a Hash answer and leave a String answer alone, and the compress arm is a truthiness test. The port's own jsonShowResult matches all three shapes and the compress arm, and its read grammar splits the .json suffix off the VIEW segment on the two- and three-segment arms. The port does not read the Accept header on a READ at all: named, with the mechanism on both sides, and left as it is. |
| D3 `rss` | a14be12e2 | PORTED, measured, ONE NAMED DIVERGENCE, and the row COMPLETED on the staging host. THE RSS FORMAT DECLARES NO MIME TYPE OF ITS OWN: its class is three lines (`class RssFormat < HtmlFormat`, `register :rss`), so the mime type it answers is HtmlFormat's, and the capture records the OWNER of the method as well as the answer, because the owner is what settles the claim. THE STOCK ANSWER TO A FEED REQUEST IS A SENTENCE, and the capture EXECUTES the :feed body: `return "RSS feeds disabled" unless Cardio.config.rss_enabled`, with the config default read from the PINNED mod's own file (false). The port's RSS_DISABLED_BYTES is that sentence byte for byte. THE PORT CHANGE: the staging host had no rss arm on this branch (the arm lives on another branch, commit 5f1085f0, whose tip is not an ancestor of this one), so a `.rss` path lost its suffix to stripFormat and fell through to the html page arm. This commit adds the arm to this branch's staging server: the suffix and query doors, the segment gate, the engine's own renderFormatShow(..., "rss") with the stock rssEnabled false, and the content type application/rss+xml. THE DIVERGENCE: the port serves a feed under the feed's OWN content type, and the pinned format's own mime type is text/html; named, with both sides' evidence, and left as it is. |
| E1 `GET /_status` | 415c7bd59 | PORTED, measured, and the claim is SHARPER than the register's wording. The register's basis for the port-only rows is that "the register names the host(s) and the file:line in the port that serves it, so there is no Ruby behaviour it could fail to match", and this row MEASURES that basis: the PINNED deck's own route table, EXECUTED, answers /_status with a CARD READ (the first route that admits a GET is the mark arm, action card#read), so the health JSON the port serves there is a port-only SURFACE at a path the pinned table does route. Every candidate the reduction found is a card surface and none carries a health or status action. The port's own minimal reader answers /_status with its own status JSON, measured over its own handler with an injected card client. |
| E2 `GET /api/status; GET /api/card/<name>` | 03de9c026 | PORTED, measured, and TWO DIFFERENT pinned answers. /api/status is two segments and the pinned table's first GET route for it is the two-segment mark/rev arm, action card#read, so the pinned deck answers it with a card read and never with a status JSON. /api/card/<name> is three segments and the only pinned route that can match a three-segment path is engine_routes.rb:54's WILDCARD, so the pinned deck answers it with the bad_address 404 view. Every candidate at either path is a card surface. The port's own edge request core carries both arms, and the arm's own decode is the port's shared decodeName, measured. |
| E3 `GET /<name> record-JSON` | 5cb5459e6 | PORTED, measured. The pinned deck answers /Alpha.json with the JSON FORMAT READ (the mark arm carries the (.:format) segment), so the port's record JSON is a port-only SEMANTIC at a path the pinned table does route: the pinned answer is a content-bearing render and the port's answer is a metadata record whose content is not there at all. The port's minimal reader answers /Alpha.json with the metadata and no content field, measured over its own handler with an injected card client. |
| E4 `GET\|POST /_signout` | d403810f9 | PORTED, measured, and the sharpest thing in the port-only rows. A POST /_signout IS A CARD CREATE IN THE PINNED DECK: the first route that admits a POST for the path is the bare ":mark(.:format)" arm, action card#create, so the pinned deck's answer to a POST there is a CREATE of a card named "signout", not a sign-out. A GET there is the mark arm, action card#read. The port's edge host mounts its sign-out arm ABOVE the write surface for exactly that reason, and the capture's port-side quote is that mount. The port's own origin policy is measured through its own exported checkRequestOrigin: a cross-site request and a foreign Origin header are REFUSED with a reason, a same-origin request passes, and a request with none of the three headers passes. |
| E5 `POST /_signin, POST /_signout; GET /_signin form` | 7c2969ae9 | PORTED, measured over real HTTP against the BOOTED staging server. In the pinned deck both paths are card surfaces: a POST to either is the bare ":mark(.:format)" arm, action card#create, and a GET is the mark arm, action card#read, so the pinned deck has no session surface at either path. The port's staging surface is its own: the form page posts to /_signin, a sign-in for an account that does not exist answers the account ladder's own failure (401 with the ladder's message), and a sign-out with no session is IDEMPOTENT (200, revoked false, the cookie cleared), which is Ruby's own sign-out shape. |

## The rig: what was shared, what was added, and what was not touched

The shared loading rig
(`tests/server/oracle-capture-pinned-deck-harness-ruby.rb`, md5
e1263e00c86254c4d6109d5fecf8deb9) and the shared candidate reduction
(`tests/server/pinned-route-table-candidate-reduction-ruby.rb`, md5
ede122d0bab1e568ceb58773a1fd02f2) arrived byte-identical to the tranche 7
lane's copies (md5sum compared on both copies before any work started).
BOTH ARE UNTOUCHED BY EVERY COMMIT IN THIS TRANCHE.

Two new SUPPORT files landed with the rows that needed them, and neither
is the loading rig:

- `tests/server/pinned-format-set-block-loader-ruby.rb` (row D2) holds what
  a set BLOCK needs: a place to evaluate a pinned set file in (a module
  nested under Card, so the bare `Env` a pinned method names resolves to
  `Card::Env`, the way the gem's own set loader resolves it), the stand-in
  for the set DSL (which KEEPS the block instead of running it), and the
  recording stands the pinned methods ask for. It grew for row D3 (the
  kept view BODIES by view name, the stands' own setup, the `All` alias a
  pinned set file's `mod:` option names, and the base set's own format
  module constant).
- `tests/server/pinned-port-only-route-absence-ruby.rb` (row E1) holds the
  port-only rows' measurement: the executed pinned route table reduced
  with the shared candidate reduction, and the PORT's own serving source
  quoted with line numbers at THIS branch's line numbers.

The shared loader's growth was checked against every other row's evidence:
after the D3 growth, all FOUR captures regenerate byte-identically against
their committed fixtures on an independent run.

## Captures (byte-stable on re-run, verified this session)

New: html-format, json-format, rss-format, port-only-routes. Each was
regenerated and diffed clean against its committed copy on an independent
run before its row's commit and again at the tranche tip: **4 capture
scripts run, 4 regenerate byte-identically, 0 differ, 0 fail.**

## Battery (final state, run this session, exit codes and counts read directly)

- **The touched-file battery** (the ask's own named check): the eight
  rows' nine new test files, plus the five other staging deploy suites
  that share the changed staging server. `npx vitest run` over the nine
  new files -> **9 files passed, 68 tests passed, 0 failed** (15s). The
  five staging deploy suites -> **5 files passed, 13 tests passed, 0
  failed** (9s).
- `npx vitest run tests/server/`: **107 files passed, 1 failed, 1 skipped
  (109); 1072 tests passed, 1 failed, 14 skipped.** The tranche 7
  baseline on this branch was 102 files / 1029 tests; 1029 + 58 = 1087 =
  the count here, the 58 being this tranche's seven new server parity
  files (D1 15, D2 15, D3 10, E1 5, E2 4, E3 4, E4 5). The ONE FAILURE is
  `tests/server/drivers/mysql-lifetime.test.ts` ("ends the server when the
  process that started it is force-killed"), raising `EPERM, Permission
  denied` on the `rmSync` of a force-killed mysqld datadir. Run ALONE
  (`npx vitest run tests/server/drivers/`) the drivers are **12 files
  passed / 1 failed, 157 passed / 1 failed**, the same shape and the same
  message the tranche 7 receipt records, and the tranche 7 receipt's
  account of it is a Windows teardown lock on a force-killed process, not a
  product failure. Both runs are reported because they disagree about
  whether the failure appears in the full-suite run (in the tranche 7
  full-suite run it did not; in this one it did).
- `npx vitest run tests/deploy/`: **83 files passed, 1 failed, 1 skipped
  (85); 667 tests passed, 1 failed, 10 skipped.** The tranche 7 baseline
  was 83 files / 667 tests; the count here is the same because this
  tranche's two new deploy files add 10 tests and the baseline's 657
  becomes 667. The failure is `tests/deploy/worker-edge-cache-runtime.test.ts`
  ("armed; cache=miss; not-stored" expected to contain "miss+stored"),
  the pre-existing environmental failure the tranche 3, 4, 5, 6 and 7
  receipts record on this lineage. The tranche's import closure does not
  contain it: `git diff a5a305907..HEAD --stat -- src/ deploy/` is one
  file (vm-staging-server.mjs) and the failing suite's subject
  (deploy/worker.ts) references none of this tranche's files.
- `npx tsc --noEmit`: **exit 0, clean, read directly from tsc**, at the
  tranche tip and after each row's commit. The tsc runs are in this
  lane's own transcript (the exit code and the empty output are read from
  the run, not asserted from a memory of it).

**THE TWO FULL-SUITE RUNS ARE SLOWER THAN THE TWO-MINUTE BOUND, and the
cause is measured rather than guessed.** The server suite took 185s of
test time and the deploy suite 239s. The cause is the driver and boot
suites: the server suite boots a real MySQL server and a real PostgreSQL
server (the driver suites alone are 67s of the 185s), and the deploy suite
boots a staging server and a set of edge hosts per file (85 isolated
workers at ~1.5s of startup each). The ask's own named battery is the
touched-file subset, and that runs in 15s and 9s.

## Port code changed

One file, one arm, no behavior change anywhere else:
`vm-staging-server.mjs` gained the rss format arm for row D3 (the
`isRssRequest` gate, the `rssFormatResponse` answer, the dispatch branch
ahead of the html arms, and the `renderFormatShow` import). The arm is the
5f1085f0 shape, re-typed against this branch's staging server, which has
drifted from 5f1085f0's parent (47 insertions and 9 deletions in that
file). Nothing deployed.

Three source-level divergences are NAMED and left as they are, each with
its mechanism on both sides: D1's html focal rule (the port drops the
show_layout? term), D2's Accept door (the port does not read the Accept
header on a read), and D3's feed content type (the port serves
application/rss+xml where the pinned format's own mime type is
text/html).

## Landing and cleanup (the disk cost, both directions)

Added: the lane's checkout
`C:/localProjects/decko-ts-routes-tranche8-20261022` (770M: the tree and
its node_modules, 492M, a file copy of the release-lead checkout's with
the vitest cache left out; gitignored and never staged) and this tranche's
commits (20 files changed, 7,949 insertions, 0 deletions across the eight
row commits and this receipt: eight capture or support files, four
fixtures, nine test files, and the staging server's rss arm).

Removed: nothing was deleted from the machine. This lane's temporary
files (the capture re-run outputs, the tsc logs and the commit-message
drafts) were ARCHIVED, not deleted, into
`/tmp/decko-ts-routes-tranche8-20261022-temp-archive/`, so the flat system
temp directory carries none of this lane's files and none of their bytes
is lost. No scratch database was left behind, no staged copy survives, and
no process was spawned that outlives this lane.

## Not done / not verified

- No roster fold: the completeness roster lives in the brandonDojoTech
  repo and is folded by that repo's own guarded scripts; this lane's
  dispositions above are the fold inputs.
- E1's port-side evidence for the edge engine and the staging server is
  the port's own SOURCE, quoted with line numbers in the fixture, not a
  booted run of those two hosts. The minimal reader's /_status IS
  measured, over its own handler with an injected card client. E2's two
  arms are the port's own source for the same reason: the edge's request
  core needs a booted deck, and this lane did not boot one.
- D3's rss feed body is NOT rendered. The :feed view's own body was
  EXECUTED with the gate open and the pinned rescue caught the missing
  inner render, so the feed's XML is measured as a shape and not as
  bytes. The stock answer (the disabled sentence) is measured as bytes.
- The rebuilt gemset's original 151-gem set is not reconstructed: the
  rebuild holds 68, and the two fixtures that record the gemset's size
  (jasmine-mount and forgery-posture) carry the original's numbers. This
  tranche adds no fixture that counts gems, and all four of this tranche's
  captures regenerate byte-identically against the rebuilt gemset.
- The pinned card gem's content machinery is not loaded, so the json
  format's own expand_stubs falls through to the base's expand_stubs only
  for leaves that are not Strings; the String fall-through is recorded as
  raising, and the pinned line is quoted.
- D1's commit message carries a typo in one parenthetical ("its own
  register :json and :html registrations" where the html format class
  registers :html and nothing else). The measurement is unaffected and the
  correction is named in row D2's commit message, as the tranche 5
  receipt names the false tsc claims that stand in the A19/A20/A21
  messages. The message itself is not rewritten: a history rewrite is not
  permitted here, and `git commit --amend` is gate-blocked.
