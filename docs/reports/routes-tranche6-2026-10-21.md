# [Family] tranche 6, 2026-10-21: rows B2, B3, B4, B12, B14, C1, C2, C3

Lane: `port/routes-tranche6-20261021` in the exclusive local clone
`C:/localProjects/decko-ts-routes-tranche6-20261021` (a full clone of the
tranche 5 lane's clone `C:/localProjects/decko-ts-routes-tranche5-20261021`,
branched at that branch's tip 3ffcd4b5 - the tranche 5 receipt commit;
`git worktree add` is gate-blocked, so the local clone is this lane's named
layout - no other lane touches this checkout). Every commit is pushed
forward-only to origin (KatsuJinCode/decko-ts). The branch tip moved
3ffcd4b5 to cb3840d35: one commit per row, plus this receipt commit. The
clone's `node_modules` is a copy of the tranche 5 clone's (570M, a local
file copy, no network); it is gitignored and was never staged.

The shared capture rig arrived byte-identical from the tranche 5 clone via
the clone itself (md5 e1263e00c86254c4d6109d5fecf8deb9 for
`tests/server/oracle-capture-pinned-deck-harness-ruby.rb` and
ede122d0bab1e568ceb58773a1fd02f2 for
`tests/server/pinned-route-table-candidate-reduction-ruby.rb`, compared
with md5sum on both copies before any work started); the ask's "copy
... into yours" is satisfied by that byte-identity, and BOTH rig files are
untouched by every commit in this tranche.

## The eight rows, one landing each

| Row | Commit | Disposition |
| --- | --- | --- |
| B2 `card#create` (`rest.rb:6-8`) | 61495828d | PORTED held, now measured. The pinned body is ONE save ask through handle, and handle is the fork: the success envelope is created with the card's NAME, and the block's VALUE decides - a truthy save goes to cud_success (the 303 redirect), a falsey save raises Card::Error::UserError, the 422 class. The port's create arm makes the same one save ask and answers the envelope's target (the saved card) with the 303 + absolute Location; its refusal for a create that cannot land is the 422 user-error class. Measured over the real HTTP write surface. No port change. |
| B3 `card#update` (`rest.rb:14-16`) | 57d6cac3b | PORTED held, now measured. The new-card fork: an update whose target does not exist SAVES a card (the call list is ["new_card?", "save!"]), it never asks the model to update one; an update of an existing card asks the model to update with the body's card hash, and the ask is the RAW hash (to_unsafe_h removes the permitted-status guard). A body with NO card hash passes nil to the model (the safe navigation's job). The port's update arm falls back to the create path for a missing mark, and answers the create verb there - measured over the real HTTP write surface. No port change. |
| B4 `card#delete` (`rest.rb:18-20`) | 53c525bea | PORTED held, now measured, and the MECHANISM is now known: the pinned model's own delete! (card-1.110.0/mod/core/set/all/trash.rb:17-21) asks the model to update with `trash: true` (a trash, not a row removal), and for a card that does not exist the `unless new_card?` guard (:70-72) skips the yield entirely, so delete! answers nil - FALSEY - and the HANDLE's truthiness fork turns that nil into Card::Error::UserError. The pinned 422 for a missing card is NOT a model exception. The port answers the delete verb for a card that exists and the 422 user-error class for one that does not. No port change. |
| B12 `refresh_card` before CUD (`rest.rb:68-70`) | b86820b78 | PORTED (structurally), now measured. The pinned table runs refresh_card ONLY for create/update/delete, and it is the LAST entry, so it runs AFTER load_card: the write that follows acts on the CURRENT row. The pinned ask is `@card = card.refresh` and the controller's card object is REPLACED. The port has no shared card object to refresh - every write request builds its own engine over the current database state and fetches the card per request - and the consequence matches: a save carrying a stale revision is refused 409 and writes nothing, a save carrying the current revision lands. No port change. |
| B14 recaptcha mod's controller include | 51c380883 | PORTED (as a save-time guard), now measured. The pinned include gives the controller the PINNED gem's own verify_recaptcha and verify_recaptcha! (owner: Recaptcha::Verify), and in a Rails boot it is REDUNDANT (the gem's own railtie already includes the module into ActionController::Base through on_load(:action_controller)) and it still runs. The keying ladder has four rungs and the capture measured which rung wins each time: card content, config, deprecated config name, development default. No value leaves the capture: the defaults are deployment configuration and the fixture records their KEYS only. The port carries the same ladder, the same using_defaults? and the same recaptcha_keys? (both keys or the guard is disarmed), with a host-env key source that is inert by default. No port change. |
| C1 `respond` (`response.rb:10-19`) | 0c72456ac | PORTED held, now measured. Three arms in priority order, and the order is measured: a 302 redirects, a 303 REDIRECTS TOO and answers a 302 (the arm calls hard_redirect with no status argument, so hard_redirect's own 302 default answers), a file format at 200 sends the file, and a file format at 302 REDIRECTS (the redirect arm outranks the file arm). The redirect arm is UNREACHABLE from the pinned deck's own call path: the statuses that can reach respond are 200, the format's own error status (404 or 403) and nothing else, so the pinned deck's redirects come from the CUD success's own hard_redirect(url, 303) - a different call path, the one the port's 303 answers. No port change. |
| C2 `hard_redirect` (`response.rb:40-50`) | f44ca0f7f | PORTED held, now measured. The url is made ABSOLUTE FIRST (the PINNED card gem's own card_url, loaded for this capture), so the ajax flavor's JSON carries the absolute url too; an already-absolute url is left alone. The two flavors: an ajax request renders `json: {redirect: url}`, every other request redirects with the status it was handed (302 by default, 303 from the CUD success), and the ajax arm IGNORES the status argument. The port's ajax flavor is the 200 + {redirect: url} JSON, its plain flavor the 303 + absolute Location - both measured over the real HTTP write surface. No port change. |
| C3 `soft_redirect` (`response.rb:54-62`) | cb3840d35 | PORTED, with ONE NARROW DIVERGENCE named, and no port change to the rest. The target becomes the card, the guard raises Card::Error when the card is not a Card (and the raise comes BEFORE the params surgery - the card hash is still there), and the surgery clones the request params, DELETES :card and :action, and MERGES the success envelope's own params. The re-render answers 200 and the slot. The port's ajax default re-renders the saved card through the host's render seam and answers 200 with the slot; the success envelope's view reaches the re-render. THE DIVERGENCE: the pinned surgery keeps the request's OWN view key, so a request whose URL carries ?view= re-renders THAT view, while the port's slot arm reads the SUCCESS envelope's view only. Narrow, named, left as it is. |

Row selection, derived mechanically and not by eye: the register-routes
family has 72 rows; 40 are adjudicated across tranches 1-5 (derived from
the family branches' own commit subjects: the tranche 1 tranche's eight
"row N of 8" commits, the tranche 2 tranche's eight "row N of 16" commits,
the tranche 3 tranche's receipt commit, and the tranche 4 and tranche 5
receipts' eight rows each); the next eight in row-id order are exactly B2,
B3, B4, B12, B14, C1, C2, C3. With this tranche's eight rows folded in, 48
of the family's 72 rows are adjudicated, and the 24 still unadjudicated
are C8, C9, C10, C11, C12, C13, C14, C15, D1, D2, D3 and the thirteen E
rows.

## The pinned gemset was deleted mid-tranche, and this lane rebuilt it

The capture rig reads the pinned gems from
`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems` (the
DECKO_RUBY_GEMSET path). That directory was present when this lane
started (the B2 capture ran against it) and it was GONE by the C2 row: the
path no longer existed, and no copy of it remained anywhere under
C:/localProjects (a bounded search for card-1.110.0 found none). The
machine also lost `C:/localProjects/.mysql-test-cache` in the same window
(the MySQL server binary the driver suites fetch), and
`C:/localProjects/decko-ruby-reference` (the reference checkout the repo's
oracle is built from) is gone too. This lane did not delete any of them;
nothing in this lane's diff deletes anything.

This lane rebuilt the gemset at the same path, as a SUBSET of the original:

- the deck's own gems, copied from the surviving source checkout
  `C:/localProjects/decko-ruby-perf` (its card/VERSION is 0.20.0, which is
  the deck version 0.20.0 and the card version 1.110.0 the pinned gemset
  carried): card-1.110.0, decko-0.20.0, cardname-1.110.0 and the 35
  card-mod-*-0.20.0 gems;
- the third-party gems the captures load, installed at the versions the
  pinned gemset carried: activesupport 7.2.4, actionpack 7.2.4, recaptcha
  4.13.2 and jwt 2.10.3 (the api-key fixture names that jwt version), with
  their dependencies.

The rebuilt gemset holds 68 gems; the original held 151. THE REBUILD IS
VERIFIED BY THE CAPTURES THEMSELVES: all eight of this tranche's committed
capture scripts regenerate BYTE-IDENTICALLY against it (second run diffed
clean against each committed fixture), and so do 36 of the 38 capture
scripts the earlier tranches committed. The two that differ do so ONLY in
the gemset's gem COUNT the capture records (67 now, 151 in the original):
`fixtures/captured/forgery-posture-ruby-oracle.json` and
`fixtures/captured/jasmine-mount-ruby-oracle.json`. Their committed
fixtures are the ORIGINAL gemset's evidence and this lane did not
regenerate them; the delta is named here instead.

## Captures (byte-stable on re-run, verified this session)

New: card-create-action, card-update-action, card-delete-action,
refresh-card-before-cud, recaptcha-controller-include, respond-ladder,
hard-redirect-ajax-flavor, soft-redirect. Each fixture was regenerated and
diffed clean against its committed copy on a second run before its row's
commit. Final-state regeneration over every capture script in the tree (46
files with fixtures): 44 IDENTICAL, the two gem-count fixtures above
differing, 0 failing. No rig growth this tranche: the loading rig and the
candidate-reduction support file are untouched by every commit here.

## Battery (final state, run this session, exit codes read directly)

- `npx vitest run tests/server/`: 90 files passed, 3 failed, 1 skipped
  (94); 874 tests passed, 7 failed, 30 skipped. The seven failures are all
  in the MySQL driver suites (tests/server/drivers/mysql-driver.test.ts,
  mysql-ruby-schema.test.ts, mysql-lifetime.test.ts) and their cause is
  printed by the suite itself: "MySQL 8.4.11 server binary not found at
  C:\localProjects\.mysql-test-cache\8.4.11\mysql-8.4.11-winx64\bin\
  mysqld.exe" - the machine's MySQL test cache is gone (the same window
  that took the pinned gemset). This tranche's diff adds 24 NEW files and
  touches no source file, so nothing in these suites' import closure
  changed; the failures are the machine's state, not this tranche's work.
  The pre-tranche baseline on this branch was 86 files / 842 tests; 842 +
  69 = 911 = the 911 tests here, the 69 being this tranche's eight parity
  files (B2 8, B3 9, B4 7, B12 6, B14 14, C1 9, C2 7, C3 9).
- `npx vitest run tests/deploy/`: 81 files passed, 1 failed, 1 skipped
  (83); 657 tests passed, 1 failed, 10 skipped. The failure is
  tests/deploy/worker-edge-cache-runtime.test.ts ("armed; cache=miss;
  not-stored" expected to contain "miss+stored"), the pre-existing
  environmental failure the tranche 3, 4 and 5 receipts record on this same
  lineage. Re-verified this session ALONE (1 failed, 3 passed; not
  suite-load-dependent), and deploy/worker.ts references none of this
  tranche's files (grep run this session).
- `npx tsc --noEmit`: clean, exit 0, read directly from tsc.

## Port code changed

None. This tranche changed no source file: the eight rows' measurements
either matched the port or named a narrow divergence (row C3's request
view key), and no measurement contradicted the port in a way a port change
would fix. Nothing deployed.

## Not done / not verified

- No roster fold: the completeness roster lives in the brandonDojoTech
  repo and is folded by that repo's own guarded scripts; this lane's
  dispositions above are the fold inputs.
- The pinned gemset's original 151-gem set is not reconstructed: the
  rebuild holds 68 gems, and the two fixtures that record the gemset's
  size still carry the original's numbers. Any capture that reads a gem
  outside the rebuilt subset would fail loudly (the jwt gap did exactly
  that, and is fixed), but the subset's completeness for OTHER lanes'
  captures is not established beyond the 42 regenerations measured here.
- The MySQL driver suites were not run against a MySQL server: the server
  binary is not on this machine (the fetch tool is -
  node tools/mysql/fetch-mysql.mjs), and fetching it was outside this
  lane's scope.
- The format NAME the pinned bodies resolve is still rows A2/D2's
  evidence: the C3 capture records the rig's own answer and labels it.
- The request-view divergence named on row C3 is left as it is: this lane
  did not change port behavior, and the divergence is a named finding, not
  a decision this lane owns.
