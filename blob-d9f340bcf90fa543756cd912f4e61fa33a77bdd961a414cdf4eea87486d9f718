# mx-B-068: the account settings page shows the signed-in member's email

The roster row `mx-B-068-cover-b-account-settings-page-` (surface
"cover-b. account: settings page and change email (A1, A3)") reads "A1 the
account settings page shows the signed-in member's email", verdict PASS,
bucket DONE. The registry's ledger entry for the row
(C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json,
action ACT-068, check_ids ["B-068"], capability A1) records the
live-acceptance-lane entry as unmeasured ("added to source after the last
live run"), the native whole-harness entry as unmeasured ("present in
harness source; no row under this name in the 2026-10-16 19:17Z native
run (cover-b adaptation still pending per the debrief); no pass/fail
inferred"), and the ts-engine-local-bundle entry as pass (the
probe-pageonly-top10 rerun of 2026-10-18: "account settings board tab
shows the signed-in member's email (ada.admin@example.test); navbar
account link recorded as context"). This receipt is the family's own
adjudication of the row at this tip, where the whole exercise's named
check for it exists and is graded.

## What the row is

A signed-in member opens the account settings surface (the account card's
board, the Account tab, the Email and Password pill) and the page shows
the address that member is signed in with. The claim is about the VALUE a
person reads, not the presence of an input: the address is rendered as
text in the labeled row.

## The instrument

"A1 the account settings page shows the signed-in account's email"
(tools/edge-signed-in-exercise.mjs:698-700): the account journey signs
the actor in (:660-662), opens the account card's board
(`/${holder}/board`, :671), clicks the Account tab (:682), opens the
Email and Password pill (:683-685), waits for the email's labeled view
(:686), reads that row's text (:694-697), and records PASS only when the
text CONTAINS the actor's own email (:698-700), with the actor, the
expected address and the shown text as the evidence. The journey runs for
both fixture accounts (tools/edge-signed-in-exercise.mjs:1301, `for (const
account of [creds.admin, creds.member]) await accountSettings(account)`),
so the run records the check twice, once for the admin and once for the
member.

The capability ledger binds the check to capability A1
(tools/edge-signed-in-exercise/capabilities.json: the "A1" row, group
"account", capability "Open the account settings page", checks: the
Account tab, the email and password fields, and this check,
requiredActors ["Harness Admin", "Harness Member"]).

A SECOND NAMED INSTRUMENT GRADES THE SAME ROW: the page-only write
permission probe (reference-harness/browser/probe-pageonly-top10-write-permission.mjs)
opens the same board tab and pill (:389-405) and grades ACT-068, "A1 the
account settings page shows the signed-in member's email", on the tab
being found AND the labeled row's text or value carrying the address
(:657-661).

## The oracle

RUBY'S OWN ACCOUNT SETTINGS VIEW. Ruby's account card renders its email
and password as two LABELED field nests:
card-mod-account-0.20.0/set/right/account/views.rb:49-53 (`format :html
do view :core do [account_field_nest(:email, "email"),
account_field_nest(:password, "password")] end`), and
account_field_nest is `field_nest field, title: title, view: :labeled`
(:55-57). The email right itself is a phrase
(card-mod-account-0.20.0/set/right/email.rb:5 `assign_type :phrase`), and
its read rule is the owner's own address or an always-ok actor, otherwise
a denial (right/email.rb:39-43 `ok_to_read?`, :47-48 `own_email?`).

THE PORT NESTS THE SAME LABELED VIEW. src/card/mod-loader/mods/card-mod-account.ts:267-285
is the port's accountCoreView: the two field nests are built with the
syntax `<holder>+*email|view:labeled|title:email` (:277) and the options
`{ view: "labeled", title, extra: {} }` (:279), the port of
views.rb:50-57. The check grades the rendered text of that labeled row,
which is the same surface Ruby's `:labeled` view renders.

## What is oracle-matched and what is not, stated plainly

Oracle-matched: the address a signed-in member is shown on the account
settings surface is the member's own address, rendered as text in the
labeled row, and that row exists because Ruby's account view nests the
email field with `view: :labeled` (views.rb:55-57) and the port nests it
the same way (card-mod-account.ts:279).

NOT oracle-matched, and stated rather than glossed over: the run grades
the CONTAINMENT of the actor's own address in the labeled row's text, not
the exact bytes of Ruby's labeled view, and the row's text carries the
rendered chrome around the value (the check's evidence shows the label,
the value and the row's own controls); the fixture addresses are the
harness's own (the evidence names them as `harness-...@harness.invalid`),
so the value compared is fixture state, not a port constant; and the
registry's live entry for the row is still unmeasured, so this receipt
claims the local bundle only, never the live deployment.

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

    A1 the account settings page shows the signed-in account's email
        {"actor":"Harness Admin",
         "expected":"harness-admin-2c0c09f6@harness.invalid",
         "shown":"email harness-admin-2c0c09f6@harness.invalid help edit space_dashboard"}
    A1 the account settings page shows the signed-in account's email
        {"actor":"Harness Member",
         "expected":"harness-member-db28a192@harness.invalid",
         "shown":"email harness-member-db28a192@harness.invalid help edit space_dashboard"}

The shown text is the labeled row's own rendering: the label "email", the
address a person reads, and the row's own controls. The run's actor
witnesses bind both sessions to the fixture accounts the check names (the
run's own actorWitnesses record expected and actual actor id 53041 and
53047 with a session cookie and a backend-signed-in flag).

The run's capability coverage records capability A1 as covered with all
three of its checks in verifiedChecks, and the run as a whole graded 251
of 253 checks passed. The two failures are E10 "a plain-input card can be
edited and saved (the new content shows on the card)" (the write answered
no status inside that attempt's window, while the card's own page
answered 200 and showed the new content) and the page-time budget row
"no signed-in page exceeded 3 s of server time" (three pages over the
3000 ms budget, each carrying a contention charge of 2745, 1582 and 912
ms of measured machine contention against 221, 1251 and 967 ms of the
engine's own database CPU time). Neither failure is this row.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green.
  This receipt does not claim anything about the live deployment: no
  live request was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this
  receipt; this receipt adds the family's own evidence for the row.
