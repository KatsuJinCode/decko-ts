# Routes round seven, 2026-10-24: two rows close on a landed change, three close with their subject pinned, one is named with its dependency

Lane: `port/routes-round7-20261024` in the exclusive lane checkout
`C:/localProjects/decko-ts-routes-round7-20261024`, branched at
`c56635750bb7f3f1c3db8c3944dbeff3697ce2bc` (the round-six tip, the newest
pushed routes-family tip: `git ls-remote origin 'refs/heads/port/routes-*'`
reads `port/routes-round6-20261024` at that hash). The checkout was created
with `git init` plus a targeted fetch of that one tip and an unshallow, and
node_modules came across from the round-six checkout (robocopy, 6864 files,
734.10 MB, no network). Every commit is pushed forward-only to origin
(KatsuJinCode/decko-ts, private: `gh repo view KatsuJinCode/decko-ts
--json isPrivate` reads `true`).

Family state at the start of this round, read from the completeness
roster's own file (`C:/localProjects/brandonDojoTech/docs/registry/
completeness-roster.json`, `at` stamp 2026-10-24T01:20:01.643Z): 72 rows,
44 DONE, 28 WORKING ON IT, 0 BLOCKED. The roster's rows are the 72
register-routes rows A1-A23, B1-B14, C1-C17, D1-D5 and E1-E13.

## The six rows this round took, and how they were chosen

The rows are the next six open rows in row-id order, with the rows already
taken by the round lanes (three, four, five, six) excluded. Rounds three,
four and five took A2, A4, A7, A8, A9, A12, A13, A17, A18, A22, A23, B5,
B6, B7, B8, B9, B10, B11, B13 and C3; round six took C4, C5, C6, C7, C8 and
C10. A12 and C10 were not taken: A12 carries its operator-decision flag and
C10 its measured-skip flag, and neither is closed here. The next six open
rows in row-id order are therefore C14, C15, C16, C17, D1 and D2.

| Row | Commit | Disposition |
| --- | --- | --- |
| C14 the `ServerError` 500 and its 900 debugger arm | `775579fc` | CLOSE on the row's subject, with the 500 measured on the port's real HTTP write surface and the debugger arm named with its dependency. The pinned 900 is unreachable from the pinned controller, so the port's own absence of a 900 is not behind; what stays named is the debugger re-raise, which needs a debugger card the port does not have. |
| C15 the `BadAddress` wildcard view | `a46d7c9b` | CLOSE on the row's subject (the view writes 404 and returns the pinned text), with the wildcard address measured on the port and two cells named: the known-junction leg and the signed-in may-create `:new-form` arm. |
| C16 the CSRF and origin posture | `4f87bda1` | CLOSE. The operator's ruling is on the record (docs/SECURITY.md's approved-divergences table, row 2, added 2026-10-08), the row's own claim re-measures on the gemset this machine carries, and the ruling's six cells are now pinned so the acceptance cannot lapse into a bare claim. |
| C17 Token auth and X-API-Key on reads | `9a83473e` | CLOSE on a landed change: the reader, the card-side content lookup and the sign-in arm are written, the read paths resolve the whole authenticator order, and the two pins that held the row open changed on purpose. |
| D1 the html format | `8b629989` | CLOSE on a landed change: the port's html focal rule now READS the `show_layout?` term, so it implements the pinned rule it used to state. |
| D2 the json format (suffix and Accept) | `1a145218` | CLOSE on a landed change for the door order, with the file-sender arm named. |

**Three rows closed on a landed port change (C17, D1, D2), two closed with
their subject pinned and the remainder named (C14, C15), one closed on the
operator's ruling being on the record (C16), and four named remainders
inside the closed rows (C14's debugger re-raise, C15's known-junction leg,
C15's may-create `:new-form` arm, D2's file sender).**

## What landed, row by row

### C14: the 500 measured on the port's real write surface

The row's earlier pins read the port's STATUS TABLE and its ABSENCES out
of the source. The three new legs measure the port over the shared
write-route bridge: a server error (the port's own arm for a `+*password`
whose left card does not exist) answers 500 over HTTP, the same request in
the JSON format answers the same 500 in the JSON shape, and the port's
`:server_error` VIEW carries the pinned view's bytes (the deck's Wild Card
block).

WHAT STAYS NAMED: the pinned predicate is `Card::Codename[:debugger] &&
Card[:debugger]&.content =~ /on` (card/error.rb:57-59), so the pinned deck
RE-RAISES a server error when the deck carries a debugger card whose
content matches /on/, and no status is read at all. The port has no
debugger card concept: the codename registry it does have is never asked
for "debugger", so the predicate has no input and the port cannot
reproduce the re-raise. That difference is scoped to a deck that carries a
debugger card.

### C15: the wildcard address measured, and the two cells named

A wildcard address that resolves to nothing is REFUSED at the port's page
entry point ("card not found: deep such card"), so the host answers its own
not_found chrome page at 404: the pinned route's view is a REQUIREMENT on
the view, not on the card, so an unknown card never reaches the bad_address
view. The port's fetch layer cannot resolve a COMPOUND name in this
harness (measured), which is exactly why the known-junction leg is
unpinnable here; the deploy wildcard suite records the same limit at the
same place, and this row's test now pins that record so the limit cannot
be mistaken for a code gap. The signed-in may-create `:new-form` arm
(Ruby 200) at wildcard addresses rides the single-segment new-card
machinery only, and that name is pinned too.

### C16: the operator's ruling, pinned cell by cell

The row's unblock condition was that the operator rules either way, by
dropping the origin check to match Ruby byte for byte, or by pinning the
hardening as an accepted divergence. The second branch is on the record in
docs/SECURITY.md's approved-divergences table (row 2, "Cross-site
requests", added 2026-10-08), with the Ruby cell, the Port cell, the Why,
the Compatibility, the Configuration and the Tests. Nothing about the
posture changed: the origin check stays, and the switch that restores
Ruby's behaviour stays.

The row's own claim was re-measured on the machine that runs today. The
committed capture was taken against a 151-gem gemset; the gemset this
machine carries was rebuilt smaller (68 gems), so the whole capture cannot
reproduce byte for byte, and the numbers say so (151 gems and 67 framework
hits against 68 and 54; thirteen framework hits fewer). The DECK'S OWN half
is the row's claim and it reproduces EXACTLY: four forgery references in
two files, every one of them DISABLING protection, and no
protect_from_forgery and no verify_authenticity_token anywhere in the deck's
own gems. The new fixture records that re-run.

### C17: the X-API-Key read arm, written

The reader (the X-API-Key header first, then the `api_key` param, the
header winning even when it is empty), the card-side content lookup (the
+*account junction whose +*api_key child carries the key, found by content
and not by name), and the sign-in arm (the account's `left_id`) are all
written, and the read paths resolve the WHOLE authenticator order: the
token arm, then the api_key arm, then the session. THE STRIP/CHECK SPLIT IS
KEPT, so a padded key finds the account and then fails the check, which is
the gem's own refusal and not a sign-in.

The row's own note said that a lane which ports the reader has to change
the expectation on purpose and to say why in the commit: the two pins that
held the reader's absence and the lookup's absence are changed, the api_key
mod's header records where the READ half of the lib/ surface lives, and row
B7's pin (the hosts call the token arm alone) now names the order.

### D1: the html focal rule reads the show_layout? term

The pinned html focal? is `show_layout? ? main? : depth.zero?`
(html_format.rb:16-18), and the port's rule was the pinned rule with the
`show_layout?` TERM DROPPED, so the port stated the rule it did not have.
The port now carries the term: RenderFormat has a `showLayout` option (the
request's posture, the pinned `show_layout?` of card-mod-format set/all/
html/show.rb:40-48), the html arm of the focal rule reads it, and the page
path threads it (the bare main-view lane is the no-layout lane).

The answers are measured over the SAME card and the SAME depth: a depth-zero
html format that is not main is QUIET when the layout is shown (focal by
main?) and LOUD when the layout is not shown (focal by depth.zero?), and a
main! format is LOUD in both postures. That is the pinned capture's own
four-row focal matrix, pinned beside the port's four answers.

### D2: the door order

The pinned door order is `params[:format].present? ? params[:format].to_s :
request.format`, and the membership test is a STRING comparison against a
registry that holds names as strings, so the suffix door reaches a
registered format and the Accept door reaches one only when the header
carries the format's NAME (a MIME type and a symbol both answer the file
sender).

The port now owns that door: src/card/render/format-negotiation.ts is the
module with the door order, the membership test and the implicit-html
rule, and the engine's format pick consults it when the request names no
format of its own and carries an Accept header. The pinned capture's own
ten negotiation rows are pinned beside the port's answers.

WHAT STAYS NAMED: the FILE answer. The port's read path has no file
sender (row D4's arm), so the "file" answer keeps the format the render
would have had, and the divergence is named rather than papered over.

## Captures: re-run in this lane, against the pinned gemset

Every capture below was executed against the pinned gemset at
`C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems` (68 gems,
actionpack-7.2.4 present) with Ruby 3.4.11 on PATH, no Rails and no
database, and compared with its committed fixture byte for byte.

| Capture | Committed fixture md5 | Re-run |
| --- | --- | --- |
| server-error-500-debugger-arm (C14) | `55bc915276f422df5a613f9da283f499` | IDENTICAL |
| bad-address-wildcard-view (C15) | `1cc4e3b8fdc672290dd72dc977101936` | IDENTICAL |
| forgery-posture (C16) | `0d92229d2bfa8ac1a7713eb431245ead` | DIFFERS: the gemset was rebuilt smaller (68 gems against the recorded 151), so the framework hits differ (54 against 67). The DECK'S OWN hits are identical; the re-run is committed as fixtures/captured/forgery-posture-rebuilt-gemset-ruby-oracle.json, md5 `7b11919516ad5c8ab25f2c7ef877eb01`. |
| api-key-authenticators (C17) | `e739c8b819e27bd0e9f0198ce580db4e` | IDENTICAL |
| html-format (D1) | `1b457aa79c5f192d2b1facbab663399e` | IDENTICAL |
| json-format (D2) | `c4f78642e7f6160dfa7fbcf5e231427d` | IDENTICAL |
| register-routes-remaining-eight (C17's port-surface quotes) | `94b0dfa15122dc169a2b43267528baab` before the landing | RE-RUN and COMMITTED at `8498436ce515126b57e7625e996e33d2`: the capture quotes the port's own source, and the port's source moved with this round's landing. |

## The battery (final state, run in this lane)

- **The full `tests/server/` suite**: **124 files passed, 1 skipped (125);
  1278 tests passed, 14 skipped, 0 failed**, at the round's final state.
  The one skipped file is `tests/server/edit-session-replay.test.ts` ("needs
  data or setup that a clean clone does not have"), the same skip the
  round-three, round-four, round-five and round-six receipts record. The
  count is the round-six tip's 1249 passed plus this round's twenty-seven new
  legs.
- **Per row**, the touched-file battery at that row's own commit:
  - C14: `npx vitest run tests/server/server-error-500-debugger-arm-parity.test.ts`
    -> 1 file passed, 18 tests passed, 0 failed.
  - C15: `npx vitest run tests/server/bad-address-wildcard-view-parity.test.ts`
    -> 1 file passed, 15 tests passed, 0 failed.
  - C16: `npx vitest run tests/server/forgery-posture-divergence-closure-parity.test.ts
    tests/server/forgery-posture-parity.test.ts` -> 2 files passed, 18 tests
    passed, 0 failed.
  - C17: `npx vitest run tests/server/api-key-authenticators-parity.test.ts
    tests/server/api-key-read-arm-seam-parity.test.ts
    tests/server/read-token-authenticator-row-parity.test.ts` -> 3 files
    passed, 33 tests passed, 0 failed.
  - D1: `npx vitest run tests/server/html-format-parity.test.ts` -> 1 file
    passed, 18 tests passed, 0 failed.
  - D2: `npx vitest run tests/server/json-format-parity.test.ts` -> 1 file
    passed, 20 tests passed, 0 failed.
- **The full `tests/deploy/` suite**: **1 file failed, 83 passed, 1
  skipped (85); 1 failed, 675 passed, 10 skipped**. The one failure is
  `tests/deploy/worker-edge-cache-runtime.test.ts`, the pre-existing
  environmental failure this lineage's receipts record from tranche three
  onward, and the suite's counts are exactly the round-six tip's (83 files
  passed, 1 failed, 1 skipped; 675 tests passed, 1 failed, 10 skipped), so
  this round's landings move the host surface by nothing.
- `npx tsc --noEmit`: **exit 0, zero output lines**, read directly from
  tsc. `npx tsc -p tsconfig.json` (the staging bootstrap's own recipe):
  **exit 0**.
- The date gate on this receipt: `node
  C:/localProjects/brandonDojoTech/tools/meeting-date-gate.mjs
  docs/reports/routes-round7-2026-10-24.md --today "Saturday 2026-10-24"`
  -> **DATE GATE PASS** (the machine clock reads 2026-10-24 in UTC).

## What this round did NOT land, named

- **C14's debugger re-raise**: the port has no debugger card, so the
  pinned deck's re-raise has no input on the port's side.
- **C15's known-junction leg**: pinning it needs a compound name the
  harness cannot register (a junction's name comes from its sides), which
  the deploy wildcard suite records at the same place.
- **C15's signed-in may-create `:new-form` arm** at wildcard addresses:
  it rides the single-segment new-card machinery only.
- **C16**: nothing. The posture is unchanged, and the ruling is on the
  record.
- **D2's file sender**: the read path has no file sender (row D4's arm),
  so the pinned "file" answer keeps the port's own format.
- **A12**: untouched, kept named with its operator-decision flag.
- **C10**: untouched, kept named with its measured-skip flag.

## Disk

Added: the lane's own checkout `C:/localProjects/decko-ts-routes-round7-20261024`
(a `git init` plus one targeted fetch, an unshallow, node_modules copied in
from the round-six checkout, no network), the rebuilt `dist/` build output
(gitignored), six commits, this report and the round's test pins. Moved out
of the checkout: this lane's scratch directory `.tools-tmp-round7/` (the
capture re-runs, the patch scripts, the probe file and the battery logs),
ARCHIVED to `C:/localProjects/decko-ts-lane-archives/routes-round7-20261024-tools-tmp/`
rather than deleted, so the checkout carries none of it and none of its
bytes is lost.

Nothing deployed. No live host was contacted and no metered database was
touched: every measurement in this round ran against the local pinned
gemset, the port's own source, the port's own test storage, or a locally
booted host.
