# [Family] tranche 7, 2026-10-21: rows C8, C9, C10, C11, C12, C13, C14, C15

Lane: `port/routes-tranche7-20261021` in the exclusive local clone
`C:/localProjects/decko-ts-routes-tranche7-20261021` (a full clone of the
tranche 6 lane's clone `C:/localProjects/decko-ts-routes-tranche6-20261021`,
branched at that branch's tip e87290a51 - the tranche 6 landing and cleanup
receipt; `git worktree add` is gate-blocked, so the local clone is this
lane's named layout and no other lane touches this checkout). Every commit
is pushed forward-only to origin (KatsuJinCode/decko-ts). The branch tip
moved e87290a51 to 713128b78: one commit per row, plus this receipt. The
clone's `node_modules` is a copy of the tranche 6 clone's (649M, a local file
copy, no network); it is gitignored and was never staged.

The shared capture rig arrived byte-identical from the tranche 6 clone via
the clone itself (md5 e1263e00c86254c4d6109d5fecf8deb9 for
`tests/server/oracle-capture-pinned-deck-harness-ruby.rb` and
ede122d0bab1e568ceb58773a1fd02f2 for
`tests/server/pinned-route-table-candidate-reduction-ruby.rb`, compared with
md5sum on both copies before any work started); the ask's "copy ... into
yours" is satisfied by that byte-identity, and BOTH rig files are untouched
by every commit in this tranche.

## Row selection, derived mechanically

The family has 72 rows and 48 are adjudicated across tranches 1-6, so the
next eight in row-id order are exactly **C8, C9, C10, C11, C12, C13, C14,
C15**. That is not read off by eye: the tranche 6 receipt at
`docs/reports/routes-tranche6-2026-10-21.md:42-45` enumerates the 24
unadjudicated rows (C8-C15, D1-D3, and the thirteen E rows), and the count
was re-derived from the family branches' own commit subjects at the tranche
5 tip (`git log 3ffcd4b5 --format=%s | grep -oE "\b[Rr]ows? [A-Z][0-9]+"`,
32 distinct rows), which matches the tranche 5 receipt's own figure. With
this tranche's eight rows folded in, **56 of 72 rows are adjudicated** and 16
remain: D1, D2, D3 and the thirteen E rows.

## The eight rows, one landing each

| Row | Commit | Disposition |
| --- | --- | --- |
| C8 `cud_success` flavor lattice (`rest.rb:80-89` + `response.rb:25-33`) | 856d46268 | PORTED, measured, ONE NAMED DIVERGENCE. The ladder's ORDER is part of the answer (reload outranks the magic rung outranks the flavor switch, executed both ways). The flavor switch is an OVERRIDE in both directions: `success.redirect \|\| default_cud_success_redirect_type` means an explicit soft flips a NORMAL request to soft and an explicit hard flips an AJAX request to hard. The test is an EXACT, case-sensitive `to_s == "soft"`, so "Soft" and a boolean true take the hard branch. HARD HAS ITS OWN TRANSPORT FORK and the 303 is not always carried: an ajax hard answers JSON at 200 and never issues the redirect_to. THE `\|\|` GAP IS REAL AND IT REACHES THE GUARD: the envelope's redirect answers through `present?`, so "" and " " are false; on the soft branch that lands on a String target and `success.target \|\|= self` cannot rescue it because a String is truthy - the pinned guard raises Card::Error. DIVERGENCE: the pinned switch applies the override REGARDLESS of ajax (a NORMAL request with success[redirect]=soft re-renders the slot at 200); the port's slot arm is gated on isAjax (`write-routes.ts:2282`), so it answers the 303. MEASURED LIMIT, on the fixture's face: `success.target \|\|= self` resolves through the PINNED Cardname surface (`@name.to_name.absolute`, `success/target.rb:52`) which the rebuilt gemset does not carry, so the ||= FALLBACK's own resolution raised NoMethodError in the rig; the soft BRANCH is measured end to end on the rows that hand the envelope a Card. |
| C9 Error rescue -> `Card::Error.report` -> `show` (`errors.rb:18-24`) | 875b61841 | PORTED, measured, and the keystone the other seven rows hang on. The RESCUE TABLE is five classes and the StandardError net is NOT ARMED by default (`rescue_all_in_controller` is nil), so a plain RuntimeError never reaches handle_exception on a default deck. THE CLASS THE RESCUE RENDERS IS A CHOICE THE REPORT MAKES, NOT THE CLASS THAT WAS RAISED: cardify passes an existing Card::Error through unchanged and rebuilds anything else as `card_error_class(exception, card).new`. The RecordInvalid arm is routed by the card's OWN errors through KEY_MAP, in KEY_MAP order (the recorded calls show permission_denied asked before conflict). THE DEBUGGER ARM IS NOT A CLASS TEST AND NOT THE CODENAME ALONE - executed three ways (on re-raises before report and before show; off renders the 500; a UserError with the debugger on still renders, because the class exclusion comes first). The handoff reads the CLASS, not the instance. add_card_errors writes into an EMPTY bag only, keyed by the class's last segment. ONE RIG ARTIFACT named on the fixture's face: the no-card row's RENDER raises NoMethodError because the rig's Card is a stand-in; the \|\|= and the report ARE measured on that row. Named addition: `tests/server/pinned-card-error-classes-ruby.rb`, a NEW loader for the error rows that EVALUATES the pinned card gem's error file (the shared rig stands Card in as a bare class and gives it a two-class Card::Error, and the error rows all need the real seven-class ladder). |
| C10 `NotFound` 404 + `:not_found` view (`error.rb:88-91`) | b10f730ef | PORTED, measured, ONE NAMED DIVERGENCE plus one corrected comment. The PAIR, FROM THE CLASS, THROUGH THE RESCUE: (404, :not_found), with the parent owning the defaults (422, :errors). THE INHERITANCE IS LOAD-BEARING: NotFound is NOT in `user_error_classes` - the roster names UserError ITSELF - so it is rescued only as a UserError subclass, and CodenameNotFound declares neither value and inherits both. The RAISE SITE asks the fetch first and never records a main name (record_as_main is on the far side of the raise). 404 IS NOT THIS ROW'S ALONE: BadAddress is also 404 with a DIFFERENT view. THE SECOND 404 PRODUCER executed on the PINNED format's own loaded module: main? AND the root view writes `root.error_status = 404` and answers :not_found; that arm does NOT read the setting view; DEPTH IS NOT PART OF THE TEST (a depth-3 nest still took the 404 arm and `depth` was never asked for); and THE CARD IS NEVER READ, which is why this 404 needs no exception and no database. DIVERGENCE: the port's main+root 404 arm is UNREACHABLE FROM BOTH RENDER ENTRY POINTS - the fetch refuses the card first with `card not found: <name>` at `page.ts:396` before a RenderFormat is built; both entry points were executed and a KNOWN card renders 200 through the same one. PORT CHANGE: one comment. The header on the port's own `viewForUnknown` said the main+root branch "is not ported", contradicted by the block twelve lines below it in the same method; the comment now states both facts. No behavior changed. |
| C11 `PermissionDenied` 403 + `:denial` view (`error.rb:103-110`) | 11f4e7684 | PORTED, measured. The pair (403, :denial), written by the class itself. THE FINDING NO ROW HAD MEASURED: the one method the class declares beyond the pair, `def card_message_text; card.errors[:permission_denied]; end`, reads a NAMED KEY where the base class answers `card.errors.first&.message` - measured side by side on the SAME two-error bag (the base class says "must be present", PermissionDenied says "you may not touch this card", the second entry) and measured again on a bag with no such key, where the override answers NIL where the base class would still have answered. `message_from_card` wraps that in `I18n.t :lib_exception_for_card, cardname:, message:`; the KEY and both arguments are pinned and recorded, and the fixture says on its face that the translated sentence is deployment configuration so no English sentence is claimed for it. A DENIAL DOES NOT NOTE THE EXCEPTION - report is not overridden, so unlike ServerError nothing asks the card to note it, while the bag is still read and written. KEY_MAP is declared inside `class << self`, so the constant is on the SINGLETON class and `Card::Error::KEY_MAP` is a NameError. THE SECOND 403 PRODUCER executed on the PINNED format: a focal card at root has 403 written and `view_setting(:denial, view) || :denial` answers; a :denial setting wins over the fallback and the 403 is still written; off-root or not-focal writes NO status, and a non-focal card never even asks for root?; the denied task is recorded on the method's FIRST line on every branch. |
| C12 `EditConflict` 409 + `:conflict` view (`error.rb:97-100`) | bb33ae8ca | PORTED, measured. The pair (409, :conflict). THE CLASS DECLARES NOTHING BEYOND IT: no card_message_text override and no report override, so its message is the base class's `errors.first&.message` (the recorded asks show a `first`, which is how C11's class differs) and its report never notes the exception. THE FINDING, VISIBLE ONLY BY EXECUTING THE WALK: KEY_MAP is asked in DECLARATION ORDER and permission_denied COMES FIRST, so a bag carrying BOTH keys is a 403 PermissionDenied and NEVER a 409 - and the same both-keys bag in the OTHER entry order is still the 403, because the walk asks by KEY and not by position (the per-row `errorsAsks` are the evidence: the both-keys rows show one `key?` ask, the other two show two). A bag carrying NEITHER key falls through to the base Card::Error (422). The :conflict key's PRODUCER is quoted from the pinned history mod (a Rails event declaration, and this capture has no event bus) while the port's counterpart is executed over HTTP. Narrow divergence: the both-keys bag is UNREACHABLE on the port, which adds exactly one key and keeps its denial at a separate throw site, so it never has to choose. |
| C13 UserError/validation 422 + `:errors` view (`error.rb:20-21, 68-75`) | 1d5639326 | PORTED, measured. The row cites two defaults and one assignment, so reading those two lines proves nothing about UserError - this row WALKS THE WHOLE PINNED LADDER instead, all nine classes, with a "declares its own" flag read off each singleton class's own instance methods (so a class that never assigned is genuinely undeclared rather than merely equal). UserError and BadQuery INHERIT (422, :errors); BadAddress, NotFound, EditConflict and PermissionDenied own theirs; CodenameNotFound inherits from NotFound. THE STRUCTURAL FACT THIS ROW FOUND: ServerError's superclass is Card::Error, NOT Card::Error::UserError - so the 500 is outside the 422 ladder AND outside the rescue roster, which is why it needs the StandardError net that is not armed by default (row C9) and why debug_exception?'s UserError exclusion is true for it. THE ROSTER IS WRITABLE and the capture proved it by writing: `user_error_classes` is a cattr_accessor, so a one-entry roster was written, read back, and the pinned five restored. THE BARE RAISE, EXECUTED: `yield ? cud_success : raise(Card::Error::UserError)` has no message, a message-less StandardError's message IS ITS CLASS NAME, and add_card_errors wrote the key "UserError" with the message "Card::Error::UserError" - WHICH IS THE PINNED SOURCE OF THE PORT'S OWN MISSING_CARD_DELETE_MESSAGE, spelled out on both sides this row. The add is guarded by `empty?`, so a card whose bag already holds an error keeps it. The :errors view body and the unsupported-view producer are QUOTED, not executed, and the fixture says so. |
| C14 `ServerError` 500 (+900 debugger arm) (`error.rb:46-59; errors.rb:27-32`) | fab616f45 | PORTED, measured, and the 900 arm is NOT reachable - named, not closed. THE PREDICATE RETURNS AN INDEX, NOT A BOOLEAN: `debugger_on?` is `Card::Codename[:debugger] && Card[:debugger]&.content =~ /on`, and the capture records the RETURNED OBJECT - a debugger card whose content is "on" answers 0, one whose content is "please turn the debugger on" answers 25, and both flip the pair to (900, :debug_server_error); the other three states answer nil and keep (500, :server_error), so BOTH halves of the predicate matter. THE FINDING: A sweep of the pinned gemset finds status_code read in exactly TWO places belonging to the deck or the card gem - the class_attribute declaration and the show handoff at `errors.rb:23` - and the handoff sits BEHIND `raise exception if debug_exception?(exception)`, which asks the SAME debugger test. Executed both ways: with the debugger OFF the render carries 500; with it ON the class WOULD answer 900 and :debug_server_error and the rescue RE-RAISES before reading either, so no render, no redirect, and report never ran. The 900 is not a wrong class method, it is a dead ARM - and the :debug_server_error VIEW does exist (quoted), so it is the STATUS that has no reachable reader. The claim was NARROWED before landing for a reason: a first draft said "the only consumer anywhere" and the sweep's own output refuted it, because Rails and Rack carry their own status_code methods; they are classified as framework readers and the claim is about the deck's and the card gem's reads. ServerError is the CARDIFY ELSE (executed over RuntimeError, ArgumentError, NameError, ZeroDivisionError) and the ONLY class in that file whose report asks the card anything. PORT: no 900 arm, and not behind - there is no request shape on either side that the 900 answers. The port's one real difference on this row is the re-raise, which needs a debugger card the port does not have. |
| C15 `BadAddress` wildcard view | 713128b78 | PORTED, measured, and the view body EXECUTED where row A22 QUOTED it. THE VIEW'S OWN BODY IS THE THIRD 404 PRODUCER AND THE ONLY ONE THAT WRITES ITS STATUS FROM INSIDE THE RENDER: `root.error_status = 404; t(:format_bad_address)` (set/all/error.rb:23-26). The file is evaluated with a recording `view` method that keeps each declaration's name, aliases, options and block, and the :bad_address block is then run on a probe; the DSL is stood in, the BLOCK is the pinned gem's bytes. The locale text is PINNED, not a stand-in: `card-mod-format-0.20.0/config/locales/en.yml:3` carries `format_bad_address: "404: Bad Address"`. THE FINDING: THE 200 AND THE 404 COME FROM TWO DIFFERENT PLACES. The wildcard route registers the view as a route REQUIREMENT (captured from the executed table, order 28 of 29, the deck's LAST route); `view_from_params` reads params[:view] AND params[:v] (both executed, both answer "bad_address"; a BLANK view param is not a view); show is called with NO status argument so the render answers at show's OWN DEFAULT OF 200 - and the view body writes 404 afterwards, measured in that order on the same card. THERE ARE TWO :bad_address VIEWS AND ONLY THE BASE ONE WRITES THE STATUS: the pinned file opens three format blocks (base, :json, :jsonld) and the json body is a different method that adds an `:address` error and renders the errors view with no status write at all, so "the bad_address view writes 404" is true of the base and not of the json one; both declarations are on the fixture. PORT CHANGE: one comment. The header on the port's own badAddressView said "The headless engine has no root.error_status surface; the locale token renders as the bare key", contradicted by the body four lines below it, which writes pageErrorStatus = 404 and returns the pinned text. The comment now says both statements are present, names the locale line, and records that the 404 is written from inside the render. No behavior changed; the port's view was then EXECUTED through the format mod's own registration and answered the same text and the same status. |

## A new shared loader, and what it is for

`tests/server/pinned-card-error-classes-ruby.rb` is new in this tranche and
is NOT a capture: it is the loader the error rows (C9-C15) require. The
shared rig is deliberately untouched - it stands `Card` in as a bare class
and gives it a two-class `Card::Error`, because no row before C9 evaluated
the PINNED card gem's own error file and every (view, status_code) pair,
every cardify mapping, the report side effect and the controller's rescue
table live in `card-1.110.0/lib/card/error.rb`. The loader holds exactly
three things: the constants the pinned file names at class-body evaluation
(the four Rails/ActiveRecord exception classes, as REAL DISTINCT CLASSES,
because `card_error_class`'s `when` arms are case-equality matches on those
very objects); the pinned error file itself, evaluated over the rig's Card;
and the recording card and errors bag the pinned methods ask for. Every
stand-in in it RECORDS; none of them decides an answer.

## Captures, and the sweep over the whole tree

New: cud-success-redirect-lattice, error-rescue-path, not-found-404-view,
permission-denied-403-view, edit-conflict-409-view, user-error-422-view,
server-error-500-debugger-arm, bad-address-wildcard-view. Each fixture was
regenerated and diffed clean against its committed copy on an independent
run before its row's commit (C8 twice - the first draft embedded an
Object#inspect address in the fixture and was corrected before landing, with
the envelope args recorded by card NAME; C9 three times; C10 twice; C11
twice; C12 twice; C13 twice; C14 twice; C15 three times).

The whole-tree sweep is a SCRIPT, not a loop typed by hand, because the
evidence is a COUNT and a hand-typed count is a count someone can get wrong:
`tools/oracle-regenerate-every-capture-into-a-named-directory.mjs` walks
every `tests/server/oracle-capture-*.rb`, runs each against
DECKO_RUBY_GEMSET, and compares bytes against the committed fixture. It
writes into a NAMED directory under the gitignored `.tools-tmp/`, so it
measures and never lands on a committed fixture, and it exits non-zero when a
script fails to run so a broken capture cannot pass as a clean sweep. (Its
first version derived the fixture name by stripping the `-ruby` suffix a
second time and matched no fixture at all - 54 scripts, 0 comparisons - which
is why the derivation is now spelled out on its face.)

**Result: 54 capture scripts run, 52 regenerate byte-identically, 2 differ,
0 fail.** The two are the same two the tranche 6 receipt recorded, and they
differ ONLY in fields the rebuilt gemset's SIZE drives:

| Fixture | Committed (tranche 6 clone) | Fresh (this run) | Same? |
| --- | --- | --- | --- |
| `jasmine-mount-ruby-oracle.json` | `gemCount` 151 | `gemCount` 68 | every other field identical |
| `forgery-posture-ruby-oracle.json` | `gemCount` 151, `hitCount` 71, `frameworkHitCount` 67, 71 hits | `gemCount` 68, `hitCount` 58, `frameworkHitCount` 54, 58 hits | `patterns` and `deckGemHits` IDENTICAL |

The delta is the machine's gemset, not this tranche: the pinned gemset at
`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems` holds 68 gems and
the original held 151, so a capture that COUNTS gems (or sweeps every gem for
a pattern, which is what forgery-posture's `hits` list is) records fewer.
The forgery-posture fixture's own evidence - the five patterns and the deck
gem hits - is byte-identical. No rig growth this tranche beyond the new
error-rows loader: the loading rig and the candidate-reduction support file
are untouched by every commit here.

## Battery (final state, run this session, exit codes and counts read directly)

- `npx vitest run tests/server/`: **101 files passed, 1 skipped (102); 1015
  tests passed, 14 skipped, 0 failed.** The 14 skipped are one corpus-gated
  suite (`edit-session-replay.test.ts`, gated on a manifest and an oracle db
  a clean clone does not have). The tranche 6 baseline on this branch was 94
  files / 911 tests; 911 + 118 = 1029 = the count here, the 118 being this
  tranche's eight parity files (C8 20, C9 19, C10 14, C11 15, C12 14, C13 13,
  C14 13, C15 10).
- **THE MACHINE'S MYSQL STATE CHANGED SINCE TRANCHE 6, and it changes the
  battery's story.** Tranche 6 recorded seven failures in the MySQL driver
  suites with the suite's own message naming the cause: the server binary was
  absent from `C:/localProjects/.mysql-test-cache`. That cache EXISTS now
  (`ls` on it returns `8.4.11` and `downloads`), and in the full run those
  suites PASS. Run ALONE (`npx vitest run tests/server/drivers/`) they are
  12 files passed / 1 failed, 157 passed / 1 failed, and the failure is
  `mysql-lifetime.test.ts > ends the server when the process that started it
  is force-killed`, raising `EPERM, Permission denied` on the `rmSync` of a
  force-killed mysqld datadir - a Windows teardown lock, not a product
  failure, and it does not appear in the full-suite run. Both runs are
  reported because the two disagree.
- `npx vitest run tests/deploy/`: 81 files passed, 1 failed, 1 skipped (83);
  657 tests passed, 1 failed, 10 skipped. The failure is
  `tests/deploy/worker-edge-cache-runtime.test.ts` ("armed; cache=miss;
  not-stored" expected to contain "miss+stored"), the pre-existing
  environmental failure the tranche 3, 4, 5 and 6 receipts record on this
  lineage. Re-verified this session ALONE (1 failed, 3 passed; not
  suite-load-dependent). It is OUTSIDE this tranche's import closure by a
  mechanical check, not by argument: `git diff e87290a51..HEAD --stat --
  src/ deploy/` is two files and 28 insertions / 4 deletions, and every one
  of those lines is inside a `/** ... */` doc comment (read the diff), while
  `deploy/worker.ts` references none of this tranche's files (grep run this
  session, all eight names, zero hits).
- `npx tsc --noEmit`: **exit 0, clean, read directly from tsc**, at the
  tranche tip and after each row's commit.

## Port code changed

Two files, both comments, no behavior: `src/card/render/format.ts` (C10, the
stale "not ported" header on `viewForUnknown`) and
`src/card/mod-loader/mods/card-mod-format.ts` (C15, the stale "no
root.error_status surface / bare key" header on `badAddressView`). Both were
found by measuring and both contradicted the code immediately below them.
Two source-level divergences are NAMED and left as they are, each with its
mechanism: C8's soft-override-on-a-normal-request (the port's slot arm is
gated on isAjax), and C10's unknown-main-card 404 (the port's render entry
points refuse the card before the 404 arm can run). Nothing deployed.

## Landing and cleanup (the disk cost, both directions)

Added: the lane's own clone `C:/localProjects/decko-ts-routes-tranche7-20261021`
(1.8G: the tree and .git, plus 649M of node_modules copied file by file from
the tranche 6 clone - no network, gitignored, never staged); this tranche's
commits (27 files changed, 9,060 insertions and 4 deletions across the eight
row commits and this receipt, one NEW support file and eight capture
scripts, eight fixtures and eight parity tests).

Removed: nothing was deleted from the machine. This lane's temporary files
were ARCHIVED, not deleted, into
`/tmp/decko-ts-routes-tranche7-20261021-temp-archive/`, so the flat system
temp directory carries none of this lane's files and none of their bytes is
lost. No worktree was created (`git worktree add` is gate-blocked), no
scratch database was left behind, no staged copy survives, and no process
was spawned that outlives this lane.

## Not done / not verified

- No roster fold: the completeness roster lives in the brandonDojoTech repo
  and is folded by that repo's own guarded scripts; this lane's dispositions
  above are the fold inputs.
- C15's roster body carries a REMAINDER from the sibling branch that this
  lane did not touch: the signed-in may-create `:new-form` arm (Ruby 200) at
  wildcard addresses rides the single-segment new-card machinery only, and
  the known-junction shape is unpinnable in the test harness. This row
  measured the bad_address view's 404 producer, which is the row's own
  subject; the `:new-form` arm is a different view on the same route and
  stays that remainder.
- C8's `success.target ||= self` fallback resolution is NOT verified end to
  end: it goes through the PINNED Cardname surface and the rebuilt gemset
  does not carry the Cardname gem's own dependencies. The soft branch itself
  is verified on the rows that hand the envelope a Card.
- The format's `:errors` view body (C13) and the `:debug_server_error` view
  (C14) are QUOTED, not rendered: both need a view stack this capture does
  not build. C15's bad_address view body is the one exception - it IS
  executed, because its body needs only `root` and `t`.
- The rebuilt gemset's original 151 gems are not reconstructed: the rebuild
  holds 68, and the two fixtures that record the gemset's size carry the
  original's numbers. Both deltas are tabulated above.
- `success.target ||= self`'s Cardname gap is the same gap the C8 fixture
  names; it was not closed here because closing it means restoring the
  Cardname gem's runtime (it requires `htmlentities`), which is outside this
  lane's scope.