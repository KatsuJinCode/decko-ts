# mx-B-069: the account's email can be changed and the new address shows on the account page

The roster row `mx-B-069-cover-b-account-settings-page-` (surface
"cover-b. account: settings page and change email (A1, A3)") reads "A3 the
account's email can be changed (the new address shows on the account
page)", verdict PASS, bucket DONE. The registry's ledger entry for the row
(C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json,
action ACT-069, check_ids ["B-069"], capability A3) records the
live-acceptance-lane entry as unmeasured ("added to source after the last
live run"), the native whole-harness entry as unmeasured ("present in
harness source; no row under this name in the 2026-10-16 19:17Z native
run (cover-b adaptation still pending per the debrief); no pass/fail
inferred"), and the ts-engine-local-bundle entry as pass (the
probe-pageonly-top10 rerun of 2026-10-18: "the +*email row's edit form
stores a new address (update 200, stored row matches, new address shows
on the account page, original restored)"). This receipt is the family's
own adjudication of the row at this tip, where the whole exercise's named
check for it exists and is graded.

## What the row is

A signed-in member changes the account's email address through the
account settings surface, and the NEW address shows on the account page
after the change. The claim has two halves that the check keeps apart:
the write itself (the address is stored and the new credential signs in,
the old one no longer does), and the render (the new address is what a
person reads on the account page afterwards).

## The instrument

"A3 the account's new email address shows on the account page"
(tools/edge-signed-in-exercise.mjs:767-769): the account journey opens
the email's edit row through the labeled view's pencil (:701-707), fills
a new address (:745-747), saves (:748), reads the stored row back out of
the owned database (:749) and checks that the OLD address no longer signs
in and the NEW one does (:750-753, recorded as the sibling check "the
account email can be changed and the new one signs in"). When the new
credential signs in, the journey re-opens the board, the Account tab and
the pill (:755-757), waits for the email's labeled view (:762), reads that
row's text (:763-766) and records PASS only when the text CONTAINS the
NEW address (:767-769). The original address is then restored through the
same form (:770-773), and a restore that fails throws.

The journey runs for both fixture accounts (tools/edge-signed-in-exercise.mjs:1301),
so the run records the check twice, once for the admin and once for the
member.

The capability ledger binds the check to capability A3
(tools/edge-signed-in-exercise/capabilities.json: the "A3" row, group
"account", capability "Change email", checks: "the account email can be
changed and the new one signs in" and this check, requiredActors
["Harness Admin", "Harness Member"]).

A SECOND NAMED INSTRUMENT GRADES THE SAME ROW: the page-only write
permission probe (reference-harness/browser/probe-pageonly-top10-write-permission.mjs)
drives the email row's own edit route (:420-430) and grades ACT-069, "A3
the account's email can be changed and the new address shows on the
account page", on the update answering 200, the stored row matching the
new address, the new address showing on the account page, and the
original being restored (:663-669).

## The oracle

RUBY'S OWN EMAIL RIGHT. The account's address is a right of the account
card, a phrase (card-mod-account-0.20.0/set/right/email.rb:5
`assign_type :phrase`), and Ruby validates it on every save: the address
grammar is `event :validate_email, :validate, on: :save` (right/email.rb:7-14,
the content is stripped at :10 and matched against the address pattern at
:11, a mismatch adds :account_error_invalid_address at :13), and
uniqueness is a second event on the same save, `event
:validate_unique_email, after: :validate_email, on: :save`
(right/email.rb:16-27), which searches the email right by content (:19)
and adds :account_error_not_unique when another card holds it (:22-23). A
downcase pass runs before them (right/email.rb:29-33). The address is
shown through the account view's labeled nest (set/right/account/views.rb:49-57).

THE PORT RUNS THE SAME THREE EVENTS. src/card/mod-loader/mods/card-mod-account.ts:1470-1497
is the port's email right: `assignsType: "phrase"` (:1482), the
`validate_email` event at :validate on save (:1486), the
`validate_unique_email` event after validate_email on save (:1489-1493),
and the `downcase_email` event at prepare_to_validate on save (:1496).
The three are engine-owned, and the port's own comment names where they
run: src/card/auth/account-fields.ts, `planAccountFields` (the email
grammar at :54, the normalization at :71-74, the uniqueness probe at :114
called at :155).

## What is oracle-matched and what is not, stated plainly

Oracle-matched: a new address written through the account's own edit form
is STORED, and the account page then SHOWS that new address in the same
labeled row Ruby's account view renders (views.rb:49-57, port
card-mod-account.ts:277-279); the old credential stops signing in and the
new one signs in; and the save passes the same three validations Ruby
applies on save (right/email.rb:7-27, port card-mod-account.ts:1486-1496).

NOT oracle-matched, and stated rather than glossed over: the check grades
the CONTAINMENT of the new address in the labeled row's text rather than
the exact bytes of Ruby's labeled view; the uniqueness arm of Ruby's
validate stage is exercised as part of the save but the check's own
subject is the change and the render, not a duplicate-address refusal;
the fixture addresses are the harness's own, so the value compared is
fixture state; and the registry's live entry for the row is still
unmeasured, so this receipt claims the local bundle only.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round13-20261026/rows-r1/report.md

    source acd0cd4cb24d3627981fa383619f5fea94731066, started
    2026-10-26T06:31:53.510Z, completed 2026-10-26T06:59:33.454Z,
    the source files clean
    bundle 3dc9c9baebe05b9aa04935592cbb636de90cfc712da367c8008176f544678748
    (the expected and the executed sha256), deck
    6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78
    verdict: PASS

The named check in this run, once for each fixture account:

    A3 the account's new email address shows on the account page
        {"actor":"Harness Admin",
         "expected":"changed-53041-1792996442897@harness.invalid",
         "shown":"email changed-53041-1792996442897@harness.invalid help edit space_dashboard"}
    A3 the account's new email address shows on the account page
        {"actor":"Harness Member",
         "expected":"changed-53047-1792996491249@harness.invalid",
         "shown":"email changed-53047-1792996491249@harness.invalid help edit space_dashboard"}

The check's own half of the row rides on the sibling record in the same
run:

    the account email can be changed and the new one signs in
        {"actor":"Harness Admin","writeStatus":200,
         "storedNewEmail":true,"oldEmailStillWorks":false,"newEmailWorks":true}

so the new address is stored, the old credential no longer signs in, the
new one does, and the address a person reads afterwards is the new one.
The journey restores the original address afterwards, and the run's own
actor witnesses bind both sessions to the fixture accounts the check
names.

The run's capability coverage records capability A3 as covered with both
of its checks in verifiedChecks, and the run as a whole graded 251 of 253
checks passed. The two failures are E10 "a plain-input card can be edited
and saved (the new content shows on the card)" (the write answered no
status inside that attempt's window, while the card's own page answered
200 and showed the new content) and the page-time budget row "no signed-in
page exceeded 3 s of server time" (three pages over the 3000 ms budget,
each carrying a contention charge of 2745, 1582 and 912 ms of measured
machine contention against 221, 1251 and 967 ms of the engine's own
database CPU time). Neither failure is this row.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green.
  This receipt does not claim anything about the live deployment: no
  live request was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this
  receipt; this receipt adds the family's own evidence for the row.
