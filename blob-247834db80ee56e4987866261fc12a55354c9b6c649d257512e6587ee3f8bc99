# [Family] tranche 4, 2026-10-21: rows A1, A3, A5, A6, A8, A10, A11, A13

Lane: `port/routes-tranche4-20261021` in the exclusive local clone
`C:/localProjects/decko-ts-routes-tranche4-20261021` (a full clone of the
canonical clone `C:/localProjects/decko-ts-release-lead`, branched at
`port/routes-tranche-20261020` tip 38d498d6; `git worktree add` is
gate-blocked, so the local clone is this lane's named layout - no other
lane touches this checkout). Every commit is pushed forward-only to origin
(KatsuJinCode/decko-ts). The branch tip moved 38d498d6 to the receipt
commit; one commit per row, plus one correction commit.

## The eight rows, one landing each

| Row | Commit | Disposition |
| --- | --- | --- |
| A1 `root "card#read"` | e30a3624 | PORTED held, now measured. The pinned root registration is the table's first entry (order 0 of 29); the read before_action chain, the resolved-mark fetch ask (home mark for /, the ?mark= query's mark for /?mark=) and show(nil)'s query view are executed; the port's bare arm parses the same shape. The ladder's own arms stay row B9's evidence; the *home rule read stays row C6's. |
| A3 deprecated old-file route | 6fd5bb20 | PORTED held, now measured. The pinned route (:mark(-:size)-:rev_id.:format, order 2) and its requirements are executed - anchored the way Rails applies them (the stored Regexps are unanchored; an unanchored probe wrongly admits a dash-bearing mark). The port's one-segment split (mark to the first dash, rev after the last, the middle the size) matches the constraint shape; serving parity stays file-routes.test.ts's. |
| A5 standard page read | 558420b1 | PORTED held with one NAMED DIVERGENCE. The pinned mark answers as given (unfolded), the fetch ask carries the UNFOLDED mark while the folded name rides only the new-card opts, and the .:format suffix lands in params[:format]. The port's one-segment arm keeps a .json suffix in the NAME - the registered-format-negotiation row's pinned posture; completing the split would move that row's evidence, so the divergence is named, not silently held. Ruby parity for the suffix holds on the two-segment arm and the query-view arm. |
| A6 `new/:type` | 3c7c91c1 | PORTED held, now measured. The route default's view (params[:view] = "new"), the PINNED ViewOpts registration (the pinned view :new definition's own opts through the pinned interpret_view_settings), the emptied mark ("" seated; the contrast row falls home without the registration) and the fetch ask (fetch "", new: {type: <segment>, name: ""}) are executed. The segment's underscore fold rides one step earlier than Ruby's; outcome equivalent by name key. |
| A8 `:mark/view/:view(.:format)` | ed9fba28 | PORTED, COMPLETED on this branch. The pinned arm (order 9) puts the .:format capture ON THE VIEW segment; the port's three-segment arm kept the suffix in the view segment, 422ing even json-registered views. The arm now splits a .json suffix into the json format (L51's rule). Named remainders: .rss stays the rss wrapper's segments<=2 surface; the staging host's stripFormat arm still renders the suffix in HTML. |
| A10 `post "/" => card#create` | 7ad12ff7 | PORTED held, now measured. Create rides NO load_mark (A12's fact, re-recorded for this arm); params[:action] == "create" takes the Card.new branch, not a fetch (the deck's own FIXME); the name rides the body's card hash, Name[nil] the EMPTY name; the action is handle { card.save! } -> the 303 hard redirect. matchRoute is now a named export for the route-table parity tests (the parsePath precedent). |
| A11 `put|patch "/" => card#update` | 97389c2d | PORTED held, now measured. TWO registrations of the SAME action (orders 12, 13) with identical requirements - no verb-specific behavior anywhere in the deck's controller; the port folds both verbs at one comparison. The dispatch is re-recorded for the pair: found -> card.update!, missing -> the create branch (C7's chain). |
| A13 `post "/type/:type" => card#create` | 41586bb3 | PORTED, COMPLETED on this branch. The pinned route declares NO .:format capture, so a suffixed segment stays IN the type; the port's typed branch ran the segment through markToName, whose .json strip belongs to the :mark(.:format) routes - POST /type/Foo.json created type "Foo" where the pinned deck creates "Foo.json". The branch now carries the decoded segment verbatim; the underscore fold stays the name-resolution layer's (Ruby's params[:type] is unfolded). The type rides uri_fetch_opts' ||= (the body's card[type] wins); precedence over the marked create (15 vs 16) pinned, including the bare POST /type falling to the marked create of the card "type". |

Correction commit 4e7b0cd6: the strict-null types on the A10/A11 parity
tests' mark-absence assertions. The A13 commit message claimed
`tsc --noEmit` clean while tsc was reporting two TS18047s in those files -
the exit code had been read through the pipe, not from tsc itself. The
correction commit states this on its own face; the receipt repeats it so
the false claim is not the last record.

One deviation from one-commit-per-row, stated plainly: the correction
commit touches two rows' test files (A10's and A11's) because it repairs
one mechanical defect shared by both. Its message names both rows.

## Captures (byte-stable on re-run, verified this session)

New: root-route, deprecated-file-route, standard-read-route, new-type-
route, mark-view-view-route, markless-create-route, markless-update-verbs,
typed-create-route. All 30 capture scripts re-generated against their
committed fixtures: 29 IDENTICAL; the forgery-posture fixture keeps the
shape tranche 3 recorded (content identical after CRLF normalization;
committed LF, this machine's Ruby writes CRLF - not a tranche 4 change).
The 31st file in the capture glob is the shared rig itself, which has no
fixture. No rig growth this tranche: the shared rig file is untouched; the
A6 capture removes the rig's AbstractFormat stand-in in its own process
before loading the pinned module tree and defines its own local helpers.

## Battery (final state, run this session)

- `npx vitest run tests/server/`: 77 files passed, 1 skipped (78); 724
  tests passed, 14 skipped, 0 failed.
- `npx vitest run tests/deploy/`: 81 files passed, 1 failed, 1 skipped
  (83); 657 tests passed, 1 failed, 10 skipped. The failure is
  tests/deploy/worker-edge-cache-runtime.test.ts ("armed; cache=miss;
  not-stored"), the pre-existing environmental failure the tranche 3
  receipt recorded on this same lineage at its base d6b45030. Re-verified
  here: it fails ALONE too on this machine (not suite-load-dependent), and
  its subject under test (deploy/worker.ts) imports neither file this
  tranche changed. The base commit was not re-measured in a second
  checkout; the tranche 3 receipt's measurement on this lineage is the
  base evidence.
- `npx tsc --noEmit`: clean (exit code read directly from tsc).
- parsePath consumers: 94/94 across the fourteen tests that import the
  changed lineage surface (run after the A8 grammar change).
- write-route suites: 45/45 across the A13 parity file, the markless
  create/update parity files and write-routes.test.ts (run after the A13
  matchRoute change).

## Port code changed (two files, both measured completions)

- deploy/bunny-worker-src/bunny-edge-lineage-worker-surface.ts: the
  three-segment view arm's .:format split (A8).
- src/server/write-routes.ts: matchRoute exported for the tests (A10), the
  typed create's segment verbatim (A13).

Nothing deployed. No other row's fixture moved: every pre-existing capture
re-ran byte-identical (the forgery-posture CRLF shape excepted, named
above), and every pre-existing test file is unchanged except the two
strict-null type corrections in this tranche's own new files.

## Not done / not verified

- No roster fold: the completeness roster lives in the brandonDojoTech
  repo and is folded by that repo's own guarded scripts; this lane's
  dispositions above are the fold inputs.
- The base commit's suites were not re-run in a second checkout; the
  deploy failure's pre-existence rests on the tranche 3 receipt's
  measurement on this lineage plus the import-closure check run here.
- The register's suggested dispositions for these rows (all "PORTED,
  WORKING ON IT" in the completeness roster) are now measured and closed
  except where named: A5's one-segment .:format suffix (named divergence,
  prior row's pinned posture), A8's .rss remainder and staging stripFormat
  shape, and A13's json-shaped responses on the marked create (the .:format
  routes' response-format surface, not graded by these rows).
