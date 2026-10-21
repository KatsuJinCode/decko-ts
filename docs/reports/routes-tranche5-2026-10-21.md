# [Family] tranche 5, 2026-10-21: rows A14, A15, A16, A18, A19, A20, A21, B1

Lane: `port/routes-tranche5-20261021` in the exclusive local clone
`C:/localProjects/decko-ts-routes-tranche5-20261021` (a full clone of the
tranche 4 lane's clone `C:/localProjects/decko-ts-routes-tranche4-20261021`,
branched at that branch's tip 1c097e4c - the tranche 4 receipt commit whose
parent is the ask-named 4e7b0cd6; `git worktree add` is gate-blocked, so the
local clone is this lane's named layout - no other lane touches this
checkout). Every commit is pushed forward-only to origin
(KatsuJinCode/decko-ts). The branch tip moved 1c097e4c to the receipt
commit; one commit per row, plus one follow-up commit (the shared candidate
reduction extraction) and one correction commit.

The shared capture rig arrived byte-identical from the tranche 4 clone via
the clone itself (md5 e1263e00c86254c4d6109d5fecf8deb9 on both copies,
compared with md5sum before any work started); the ask's "copy ... into
yours" is satisfied by that byte-identity, and the rig file is untouched by
every commit in this tranche.

## The eight rows, one landing each

| Row | Commit | Disposition |
| --- | --- | --- |
| A14 `match :mark(.:format) => card#create, via: :post` | 93425a4c | PORTED held, now measured. The pinned registration (order 16 of 29, after the typed create 15, before the (card)/create 24), the via->verb_matcher->match_verb chain read from the PINNED actionpack's own source (mapper.rb:207-209 -> journey/route.rb:183-185 over the VERBS template 14-24), the read-free before_action chain, the uri_fetch name asks (the URL mark names the card, underscores fold, the body's card[name] wins) and the .:format split are executed. The port's POST-only classification, single-segment constraint and precedence hold; no port change. The .json suffix riding the mark until markToName is NAMED (both sides resolve the same name; the split point differs). |
| A15 `match :mark(.:format) => card#update, via: %i[put patch]` | da67d746 | PORTED held, now measured. ONE registration carrying TWO verbs (unlike the markless pair on lines 29-30), order 17 between the marked create (16) and delete (18). The capture EXECUTES the fetch branch: an update FETCHES the mark (standard_uri_fetch, new: card_opts, skip_modules: true) - THE MARK RIDES RAW AND THE FOLDED NAME RIDES THE new: OPTS. look_in_trash rides params through. The action's two arms recorded: found -> update!, missing -> save!, both 303. The port's PUT/PATCH classification, the closed verb set and the single-segment constraint hold; no port change. |
| A16 `match :mark(.:format) => card#delete, via: :delete` | 668bee98 | PORTED held, now measured. Order 18, the last marked write arm; the markless delete is order 14 on the bare "/". The delete action is ONE arm - the recorded call list is ["delete!"] for BOTH new_card? answers, and the capture quotes the update action beside it so the one-arm shape is a finding against row A15's two-arm shape. The fetch behaves like the update's (raw mark, folded new: name). The port's DELETE-only classification and the separate markless arm hold; no port change. |
| A18 `match (card)/create(/:mark(.:format)) => card#create, via: %i[post patch]` | d87b0d16 (+ f986b47f) | PORTED, CORRECTED on this branch. The capture carries a CANDIDATE REDUCTION: for each probe path, every route in the executed pinned table whose pattern can match it, with the verbs each admits - and NO route in the pinned table admits PUT for /create/Foo, /card/create/Foo or /card/create (the only non-GET candidate is the arm itself). The port folded PATCH into its `put` variable, so all three PUTs classified as a CREATE where Ruby routes them nowhere. The arm now tests `post \|\| patch` on its own `patch`. The BARE /create falls to the marked create (16), measured. f986b47f moves the reduction into one shared support file (pinned-route-table-candidate-reduction-ruby.rb); the fixture regenerates identical except the added GET probe field. |
| A19 `match (card)/update(/:mark(.:format)) => card#update, via: %i[post put patch]` | 4eff1419 | PORTED held, now measured. Order 25; the WIDEST write arm - and the arm that makes the port's PUT\|PATCH fold RIGHT here while A18 measured it WRONG on the create arm; both rows pin opposite halves and the last case asserts both. POST/PUT/PATCH all first reach 25 for the update shapes; DELETE is admitted by NO route; the BARE /update falls to the marked arms (16/17/18). No port change. |
| A20 `match (card)/delete(/:mark(.:format)) => card#delete, via: :delete` | ebc8d465 | PORTED held, now measured. Order 26, the narrowest write arm. Only DELETE reaches 26 for the delete shapes; POST/PUT/PATCH reach no route. The one-arm delete action recorded again on this arm. This completes the three (card)/ verb arms: create %i[post patch], update %i[post put patch], delete :delete. No port change. |
| A21 `get :mark/:view(.:format) => card#read` | 8423bcb2 | PORTED held, now measured. Order 27 of 29, the last named read route, before the wildcard (28). interpret_mark returns a present mark VERBATIM (the fold is the fetch's); view_from_params is :view, then :v, blanks skipped, nil when neither - all four behaviours captured; the (.:format) capture rides the VIEW segment; and the PINNED actionpack's parameters.rb:56-61 (path_parameters merge LAST) proves a ?view= query does NOT override the URL view - the port matches. NAMED DIVERGENCE, the port's own record, not moved: /update/<mark> is claimed at order 21 in Ruby (the GET update alternative) but falls through to this arm in the port's edge parser (the C16 hardening keeps state-changing GETs off the plain-link surface; the write surface admits GET /update/<mark>; row A17 owns the remainder). |
| B1 `card#read` -> `show` (rest.rb:10-12, 91-97) | 28b190dc | PORTED held, now measured. The pinned read action EXECUTED END TO END over the rig's doubles: the call list ["action=", "format", "act"], the 200 render, the query view reaching the page, show(nil, 302) REDIRECTING through step 4 (error_status wins) into respond's redirect arm, the FileFormat-at-200 send_file arm (a double answered by an instance of a subclass of the PINNED FileFormat), and respond's three arms priority-ordered in the quoted source. Labelled and not graded: the format NAME (formatNameRigDecision - A2/D2's evidence) and the unknown-card :not_found through the rig's own stand-in. The port's bare arm IS show(nil) per its own comment (worker-surface:170-172); the query view rides the request core's queryViewFromUrl (engine-request:880-885); no port change. |

Correction commit a77087f8: the strict-null types on three verb assertions
(TS2531 in the A19 and A20 test files), AND three false battery claims
named on the record: the A19, A20 and A21 commit messages each state
"npx tsc --noEmit clean (exit code read directly from tsc)" and tsc was not
run before those commits. The claim is the same failure shape the tranche 4
receipt records against its own A13 commit. What the false claims did not
hide, verified by running everything after: the three rows' parity tests
pass, the defect was confined to compile-time types in two test files (the
`?.` satisfies the checker on values the neighbouring toBeNull cases prove
non-null - no runtime assertion was weakened), and no port source is
touched by the correction. The B1 commit is where the tsc run finally
happened and says so.

One deviation from one-commit-per-row, stated plainly: f986b47f touches
only row A18's own capture and fixture (the extraction is
behaviour-preserving on it) plus the new shared support file that A19 and
A20's captures then require; its message names row A18. The correction
commit touches two rows' test files (A19's and A20's) because it repairs
one mechanical defect shared by both; its message names both rows.

## Captures (byte-stable on re-run, verified this session)

New: marked-create-route, marked-update-route, marked-delete-route,
explicit-create-route, explicit-update-route, explicit-delete-route,
mark-view-route, read-show-dispatch. Each fixture was regenerated and
diffed clean against its committed copy on a second run before its row's
commit. NEW SHARED SUPPORT FILE: pinned-route-table-candidate-reduction-
ruby.rb (not the loading rig, which is untouched) - the pattern tokenizer,
expander and per-path candidate reduction the three (card)/ verb rows
share; its two load-bearing properties are on its own face (the expansion
of every pattern is printed so a reader audits it; the per-segment test is
loose in the PERMISSIVE direction, so the candidate set is only ever a
superset - the safe direction for a "no route admits this verb" claim).

Final-state regeneration over every capture script in the tree (38 files:
37 with fixtures plus the rig itself, which has none): 36 IDENTICAL; the
forgery-posture fixture keeps the shape tranches 3 and 4 recorded (content
identical after CRLF normalization: regenerated 542 CRLF pairs, committed
0; byte comparison run this session). No rig growth this tranche.

A CAPTURE PRECONDITION two earlier fixtures do not share: the A18/A19/A20/
A21 captures prime PinnedDeck.files_web_path BEFORE drawing the table,
because engine_routes.rb:10,13 interpolate `#{files}` from the PINNED
carrierwave mod. Drawn without it, the two file routes register as bare
"/:mark/..." - two dynamic segments matching every two-segment path - which
pollutes the candidate reduction. The A2/A3 fixtures record the unprimed
shape; their rows do not depend on those two routes, and the route ORDERS
every row rests on are identical either way.

An attempt to stand up the PINNED Rails router itself (Journey) was made
and abandoned early this session: the router loads (after resolving three
load-path collisions and two rig-stub gaps in a scratch process), but the
fifth stub gap (actionpack's request class needs a functioning Mime registry
at load time) meant the recognizer's answers would increasingly be the
scratch stubs' rather than Rails'. The via-plus-candidate-reduction path is
the sound evidence, and the scratch process was never committed.

## Battery (final state, run this session, exit codes read directly)

- `npx vitest run tests/server/`: 85 files passed, 1 skipped (86); 828
  tests passed, 14 skipped, 0 failed. The pre-tranche baseline on this
  branch was 77 files / 724 tests; 828 - 724 = 104, exactly the seven new
  parity files (A14 12, A15 14, A16 15, A18 12, A19 13, A20 11, A21 13, B1
  14), so no pre-existing server test moved.
- `npx vitest run tests/deploy/`: 81 files passed, 1 failed, 1 skipped
  (83); 657 tests passed, 1 failed, 10 skipped. The failure is
  tests/deploy/worker-edge-cache-runtime.test.ts ("armed; cache=miss;
  not-stored" expected to contain "miss+stored"), the pre-existing
  environmental failure the tranche 3 and 4 receipts record on this same
  lineage. Re-verified this session ALONE (1 failed, 3 passed; not
  suite-load-dependent), and deploy/worker.ts references none of this
  tranche's changed files (no write-routes, no matchRoute, no
  bunny-edge-lineage-worker-surface, no parsePath - grep run this session).
- `npx tsc --noEmit`: clean, exit 0, read directly from tsc (after the
  correction commit; see the correction section above for what preceded it).

## Port code changed (one file, one measured correction)

- src/server/write-routes.ts: the (card)/create arm's verb test now uses
  its own `patch` (`post || patch`) instead of the `put` fold
  (PUT || PATCH) that engine_routes.rb:47's `%i[post put patch]` arm needs
  and engine_routes.rb:46's `%i[post patch]` arm must not ride
  (matchRoute:915-922, 963). PUT /create/Foo, PUT /card/create/Foo and
  PUT /card/create were a CREATE before this branch and are NO ROUTE after
  it, which is the pinned table's answer. Nothing deployed.

## Not done / not verified

- No roster fold: the completeness roster lives in the brandonDojoTech repo
  and is folded by that repo's own guarded scripts; this lane's dispositions
  above are the fold inputs. Row selection was verified mechanically from
  the roster's items (72 register-routes rows; 32 adjudicated across
  tranches 1-4 derived from the family branches' own commit subjects; the
  next eight in row-id order are exactly A14, A15, A16, A18, A19, A20, A21,
  B1).
- The base commit's suites were not re-run in a second checkout; the deploy
  failure's pre-existence rests on the tranche 3 and 4 receipts'
  measurements on this lineage plus the solo re-run and import-closure
  check run here.
- The format-NAME decision inside the pinned load_format is NOT graded by
  this tranche (rows A2/D2 own it); the B1 fixture records the rig's own
  answer under formatNameRigDecision and the B1 receipt names why.
- The false tsc claims in the A19/A20/A21 commit messages stand in git
  history with the correction named in a77087f8 and repeated here; the
  messages themselves are not rewritten (no history rewrite is permitted or
  wanted).
- Remaining unadjudicated rows in the family after this tranche: 32
  (A23's siblings in the B/C/D/E ranges per the roster's buckets).
