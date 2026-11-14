# Routes tranche 9, 2026-10-22: rows E6 through E13

This tranche lands the last eight rows of the register-routes family that
the ask named, one commit per row, on the branch
`port/routes-tranche9-20261022` (from `port/routes-tranche8-20261022` at
`eb02e31fd`).

## Row selection, derived mechanically

The ask's own framing: "the register-routes family (72 rows) has 64
adjudicated; the last eight are E6 through E13". That framing is what this
tranche executed, and the eight are E6, E7, E8, E9, E10, E11, E12 and E13,
in that order, one commit each.

The count was re-derived here, not read off the ask. The derivation reads
the family's OWN commit subjects (the commits whose subject begins with
"[Family]") across the family branches, and counts the distinct
register-routes row ids they name:

| Branch tip | Rows named by the family's own commits |
| --- | --- |
| `port/routes-tranche-20261020` | 16 |
| `port/routes-tranche4-20261021` | 24 |
| `port/routes-tranche5-20261021` | 32 |
| `port/routes-tranche6-20261021` | 40 |
| `port/routes-tranche7-20261021` | 48 |
| `port/routes-tranche8-20261022` | 56 |
| `port/routes-tranche9-20261022` (this tranche) | 64 |

The eight this tranche landed are the difference between the tranche 8 tip
and this tip, re-derived the same way: E6 E7 E8 E9 E10 E11 E12 E13, eight
distinct rows.

**A DISCREPANCY THE OPERATOR SHOULD KNOW ABOUT, because it changes what
"the last eight" means.** The register's own row inventory (the
completeness roster's `register-routes` family, read at
`C:/localProjects/brandonDojoTech/docs/registry/completeness-roster.json`)
holds 72 rows: A1-A23, B1-B14, C1-C17, D1-D5 and E1-E13. Under the
derivation above, 64 of them are adjudicated after this tranche, and the
EIGHTH THAT REMAIN ARE NOT E ROWS: they are **A23, B7, B10, B11, C16, C17,
D4 and D5**. No "[Family]" commit in the family's history names any of
those eight (checked one by one, `git log --format=%s
origin/port/routes-tranche8-20261022` filtered to the family subjects).
So the family is NOT finished after this tranche: eight rows, none of them
in the E block, still have no landing.

The earlier receipts' counts come from a LOOSER pattern, and the looseness
is load-bearing for their conclusion. Reading EVERY commit subject in the
branch history (not only the family's) and matching any "A1".."E21" token
gives 72 at the tranche 8 tip and 76 at this tip, and the extra ids are
other lanes' rows: "E18: pin the measured same-account stale edit replay",
"Credit E11 and E15", "E21 board History tab", "the E16 board-save and
owner-save-row probes", "E13 /new type selector", "E12 board type change".
Those are capability rows of other families, and a pattern that counts them
cannot say which register-routes rows are adjudicated. The strict
derivation above is the one this receipt stands on, and it disagrees with
the earlier receipts' arithmetic, not with their landings.

## The eight rows, one landing each

| Row | Commit | Disposition |
| --- | --- | --- |
| E6 account reset surfaces | 82c17f0d2 | PORTED, measured, and THE ROW SPLITS. Of the five surfaces, TWO have no pinned counterpart: the pinned router sends POST /_reset-request and POST /_account-password to the mark arm (card#create), so the pinned deck CREATES A CARD NAMED "_reset-request" (respectively "_account-password"). THREE have pinned counterparts, and the register's "no Ruby counterpart" is wrong about them: POST /update/*signin is the pinned deck's own signin card update (the "(card)/update" arm, action card#update, mark "*signin"), which is where the PINNED signin card's own `event :send_reset_password_token, before: :signin, on: :update, trigger: :required` (signin.rb:27-31) fires; GET /*signin/reset_password_success is the pinned signin card's OWN view (card#read, mark "*signin", view "reset_password_success"; signin.rb:148-151); and GET /*signin/edit is the pinned signin card's OWN forgot-password view (card#read, view "edit"; signin.rb:153-157). The content matches on those three; the delivery (the port's bare modal fragment, the port's JSON verbs) is the port's own. |
| E7 `GET/POST /setup` | 4453a85fb | PORTED, measured. The pinned router sends GET /setup to card#read (mark "setup") and POST /setup to card#create (mark "setup"), so the pinned deck has NO /setup PATH. The pinned deck's own setup surface is the USER CARD's :setup VIEW (`view :setup, unknown: true, perms: :needs_setup?`, user.rb:10-18). The gate is a difference of kind: the pinned census is purely data (does the deck have user accounts; setup.rb:9-15, 33-52) and the port's own source says so of itself ("Ruby has no env gate: needs_setup? is purely the census", first-run-setup.ts:150-152), while the port adds the operator opt-in DECKO_FIRST_RUN=1, with the surface absent when it is unset. |
| E8 `GET /_mail-log` | dfd04a28c | PORTED, measured. The pinned router sends the path to card#read (mark "_mail-log"), and no deck carries that card, so the pinned deck's answer is its own not-found view at 404 (row C10's committed capture). The port's surface is staging-only, answers 404 while the capture transport is off and 200 with the DRAINED envelopes while it is on; the drain empties the transport, so the surface answers once. |
| E9 `POST /:mark/asset` | 86af5ab57 | PORTED, measured. The pinned router does NOT route POST /Alpha/asset at all (no pinned route admits a POST for a two-segment path except "/type/:type"), so the pinned deck's answer is the ROUTER'S OWN 404. The pinned deck's own asset surface is a GET and its path shape is the other way round: GET /asset/Alpha is the "(card)/asset" arm, action card#asset, and the pinned asset METHOD is the deprecated one (rest.rb:23-27), which row B5's committed capture measured rendering the 404 body "Decko installation error: missing public directory symlinks". The port's grammar answers 201 with its own upload body. |
| E10 `GET /mod/*`, the TinyMCE CDN redirect | 9087797ec | PORTED, measured. The pinned deck has no /mod/ prefix at all: its asset routes are "/assets/*mark", "/javascripts/*mark" and "/jasmine/*mark", and a mod's public file falls to the WILDCARD ("*mark", engine_routes.rb:54), so the pinned deck answers card#read with the view "bad_address" (row C15's committed capture). The port answers a 302 to the published TinyMCE 5.10.7 distribution on cdnjs, and its own bytes for the one path it has no CDN copy of (the nest plugin). The staging server serves the same prefix from disk when DECKO_MOD_PUBLIC_DIR points at one. |
| E11 vendor font assets | 5a8cd8b9a | PORTED, measured. The port's vendored bytes live under /mod/bootstrap/..., so the pinned deck answers them the way it answers every other /mod/ path: the wildcard's bad-address 404. The port answers its own bytes, with its own cache posture (an immutable one-year cache on the font-awesome stylesheet, a one-day cache on the bootstrap icon font, an etag, nosniff), refuses a non-read verb with 405 and an Allow header, and 404s a key the vendor directory does not carry. Both hosts mount the same two functions. |
| E12 the edge instrumentation | 0dc6eeb4f | PORTED, measured. The pinned deck has no instrumentation at all, and its probe paths are CARD READS: GET /_probe/cpu and GET /_probe/db are card#read of the mark "_probe" with the view "cpu" or "db", which no deck carries. The port's answers are its own: the standard Server-Timing header with the five phases in a fixed order (auth, seat, db, render, total), the isolate probe's two routes with its own JSON, and the render budget's 503 with Retry-After and its own diagnostic header. The probe is ARMED, not inherent (DECKO_EDGE_ISOLATE_PROBE=1). |
| E13 the 405 JSON and the read-only 403 | cb948981b | PORTED, measured. The pinned deck has no 405 and no read-only edge: a request the pinned table does not route is the ROUTER'S OWN 404 (POST /a/b/c matches nothing), a GET of the same path is the wildcard's bad-address read, and a POST to a single-segment path is the mark arm's card#create, so the pinned deck always has its write routes. The port's guards are its own: the staging server's 405 JSON and the unarmed edge's 403 JSON. |

## The instrument: what was shared, what was added, what was not touched

The shared loading rig
(`tests/server/oracle-capture-pinned-deck-harness-ruby.rb`, md5
e1263e00c86254c4d6109d5fecf8deb9), the shared candidate reduction
(`tests/server/pinned-route-table-candidate-reduction-ruby.rb`, md5
ede122d0bab1e568ceb58773a1fd02f2) and the port-only rows' support file
(`tests/server/pinned-port-only-route-absence-ruby.rb`, md5
df8bcd169cab9a0771d2db0a34200318) arrived byte-identical to the tranche 8
clone's copies (md5sum compared on both copies). ALL THREE ARE UNTOUCHED
BY EVERY COMMIT IN THIS TRANCHE.

Three new files landed with the rows that needed them, and none of them is
the loading rig:

- `tests/server/pinned-rails-route-recognition-ruby.rb` is the new
  instrument, and it is the sharpest thing in this tranche. It draws the
  PINNED deck's own `config/engine_routes.rb` into a REAL pinned-rails
  route set (the pinned actionpack-7.2.4, which carries Journey, the router
  Rails itself uses) and asks the PINNED router to recognize each probe
  path with each probe verb. Three details are load-bearing and are stated
  in the file's own header: the pinned deck's `files_web_path` is primed
  from the PINNED carrierwave mod's own file BEFORE the table is drawn
  (the routes file interpolates it into two of its patterns,
  engine_routes.rb:10,13); the card gems' nested `lib/<gem_name>`
  directories stay OFF the load path (card-1.110.0/lib/card/set.rb IS the
  stdlib "set" and shadows it); and action_dispatch is loaded BEFORE the
  rig, because the rig's stand-in ActionController::Base would be a
  superclass mismatch if the real one arrived second.
- `tests/server/oracle-capture-port-only-routes-e6-e13-ruby.rb` is this
  tranche's capture, and
  `fixtures/captured/port-only-routes-e6-e13-ruby-oracle.json` is its
  fixture: the pinned router's answer for every probe, the family's shared
  reduction's answer for the same paths (labelled as the loose superset it
  is), the PINNED GEMS' own source quoted with line numbers for the rows
  whose pinned answer is a method, and the port's own serving source
  quoted with line numbers.
- `tests/server/port-only-route-oracle.ts` loads that fixture and checks
  the port's CURRENT file for the surface, so a port that dropped the
  surface fails the test instead of passing on a stale quote.

**WHY THE PINNED ROUTER AND NOT THE SHARED REDUCTION.** The family's
shared reduction is deliberately LOOSE in the permissive direction (a
dynamic segment matches ANY segment, and a "*glob" pattern matches EVERY
path), which makes it right that "no pinned route admits this verb for
this path" and right about the candidate list, but WRONG about which
route the pinned deck dispatches to: its first candidate for a
two-segment path is often a glob route that needs a literal prefix
("assets/*mark" needs "/assets/"). Both answers are recorded in the
fixture, and the router's is the one the rows' claims rest on.

## Captures (byte-stable on re-run, verified this session)

One capture script (the tranche's own) and one fixture. It was run twice
on an independent run and the two outputs diffed clean against each other
AND against the committed fixture: **1 capture script run twice, 2
regenerate byte-identically, 0 differ, 0 fail.**

## Battery (final state, run this session, exit codes and counts read directly)

- **The touched-file battery** (the ask's own named check): the eight
  rows' eight new test files. `npx vitest run` over the eight files ->
  **8 files passed, 72 tests passed, 0 failed** (8.45s). The counts per
  file: E6 15, E7 10, E8 6, E9 8, E10 8, E11 7, E12 11, E13 7.
- `npx vitest run tests/server/`: **116 files passed, 1 skipped (117);
  1145 tests passed, 14 skipped (1159)**, exit 0, 132.89s. The tranche 8
  receipt recorded 107 files / 1072 tests with ONE FAILURE
  (`tests/server/drivers/mysql-lifetime.test.ts`, EPERM on the rmSync of
  a force-killed mysqld datadir). This run has NO failure, and this
  tranche's import closure does not touch the driver suites at all.
- `npx vitest run tests/deploy/`: **1 failed, 83 passed, 1 skipped (85);
  667 tests passed, 1 failed, 10 skipped (678)**, exit 1, 172.09s. The
  failure is `tests/deploy/worker-edge-cache-runtime.test.ts` ("armed;
  cache=miss; not-stored" expected to contain "miss+stored"), the
  pre-existing environmental failure the tranche 3, 4, 5, 6, 7 and 8
  receipts record on this lineage. The tranche's import closure does not
  contain it: `git diff eb02e31fd..HEAD --stat -- src/ deploy/
  worker.ts vm-staging-server.mjs` is EMPTY, so no port code changed and
  the failing suite's subject is untouched.
- `npx tsc --noEmit`: **exit 0, clean, read directly from tsc**, at the
  tranche tip and after every row's commit.

**THE TWO FULL-SUITE RUNS ARE SLOWER THAN THE TWO-MINUTE BOUND, and the
cause is the same one the tranche 8 receipt measured**: the server suite
boots real database servers and the deploy suite boots a staging server
and a set of edge hosts per file. The ask's own named battery is the
touched-file subset, and that runs in 8.45s.

## Port code changed

**NONE.** `git diff eb02e31fd..HEAD --stat -- src/ deploy/ worker.ts
vm-staging-server.mjs` is empty. This tranche landed tests, a capture, a
support file, a test helper, a fixture and this receipt. Nothing deployed.

## Named divergences (left as they are, each with its mechanism on both sides)

- E6: the port's two JSON verbs (POST /_reset-request, POST
  /_account-password) are port-only; the pinned deck's answer there is a
  card create. The port's modal delivery of the signin card's own :edit
  view is the port's own, and the content matches.
- E7: the port's /setup path and its DECKO_FIRST_RUN opt-in are the
  port's own; the pinned deck's setup surface is the user card's :setup
  view, permissioned by the account census.
- E9: the port's upload grammar is a dedicated multipart POST to
  /<mark>/asset; the pinned deck's asset surface is a GET to
  /asset/<mark> whose own method renders the deprecated 404 body.
- E10: the port's TinyMCE files are a CDN redirect; the pinned deck has no
  /mod/ prefix and answers a mod's public file with the bad-address 404.
- E12: the port's Server-Timing header, its isolate-probe routes and its
  render budget are the port's own instrumentation; the pinned deck has
  none, and its probe paths are card reads.
- E13: the port's 405 and 403 JSON bodies are the port's own; the pinned
  deck's answer for an unrouted request is the router's 404.

## Landing and cleanup (the disk cost, both directions)

Added: the lane's checkout
`C:/localProjects/decko-ts-routes-tranche9-20261022` (1.9G apparent: 572M
of node_modules, a file copy of the tranche 8 clone's with the vitest
cache left out, gitignored and never staged; 1.1G of .git, of which 654M
is HARDLINKED to the tranche 7 clone's shared object store and 257M of
packs plus 125M of loose objects are this clone's own from the fetch of
the remote history; 27M of dist) and this tranche's commits (13 files
changed, 5,495 insertions, 0 deletions across the eight row commits and
this receipt: one capture script, one support file, one test helper, one
fixture, eight test files, and this receipt).

Removed: nothing was deleted from the machine. This lane's temporary files
(the capture re-run outputs, the two suite logs, the tsc logs, the
commit-message drafts and the row-derivation script) were ARCHIVED, not
deleted, into
`/tmp/decko-ts-routes-tranche9-20261022-temp-archive/`, so the flat system
temp directory carries none of this lane's files and none of their bytes is
lost. No scratch database was left behind, no staged copy survives, and no
process was spawned that outlives this lane.

## Not done / not verified

- **No roster fold**: the completeness roster lives in the brandonDojoTech
  repo and is folded by that repo's own guarded scripts; this lane's
  dispositions above are the fold inputs. The eight rows with no landing
  after this tranche (A23, B7, B10, B11, C16, C17, D4, D5) are named in
  the row selection section above, and the fold owner needs them.
- **E6, E7, E8, E10 and E13's port-side evidence is the port's own SOURCE
  and the port's own EXPORTED FUNCTIONS, not a booted staging server.** The
  staging server is a script that boots a deck, and this lane did not boot
  one. What IS measured over the port's own code: E7's gate and path
  (the port's own exported `firstRunEnabled` and `handleFirstRunRequest`),
  E8's capture transport (the port's own `CaptureTransport`), E9's upload
  grammar (the port's own `handleAttachmentRoute`), E10's and E13's edge
  answers (the port's own exported `handleBunnyEngineRequest`, reached
  without a deck), and E11's vendored bytes (the port's own two asset
  functions). The staging server's arms are quoted with line numbers, the
  way the tranche 1 to 8 receipts treat a host that would need a boot.
- **The pinned deck's own responses were not captured over HTTP.** The
  pinned router's answers are the pinned deck's own dispatch decisions, and
  the pinned METHODS that answer them are quoted or executed where the
  family has already executed them (rows B5, C10 and C15's committed
  captures are cited by those rows' tests). The pinned deck was not
  booted.
- **The rebuilt gemset's original 151-gem set is not reconstructed**: the
  rebuild holds 68 gems. This tranche's capture regenerates byte-
  identically against the rebuilt gemset, and it reads only the deck's own
  routes file, the card gem's auth setup file and the card-mod-account
  mod's own files.
- **The router's answers for a HEAD request are not measured.** The
  router's own verb handling for HEAD is Rails' (a HEAD matches the GET
  routes), and this tranche's probes are GET and POST only.
