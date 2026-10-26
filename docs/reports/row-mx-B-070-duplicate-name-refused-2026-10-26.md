# mx-B-070: creating a card whose name already exists is refused (Home untouched, error shown)

The roster row `mx-B-070-cover-b-create-duplicate-name-` (surface "cover-b.
create: duplicate name, URL presets (C8, C10)") reads "C8 creating a card
whose name already exists is refused (Home untouched, error shown)",
verdict PASS, bucket DONE. The registry's ledger entry for the row
(C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json,
action ACT-070, check_ids ["B-070"], capability C8) records the
live-acceptance-lane entry as unmeasured ("added to source after the last
live run") and the native whole-harness entry as pass (the native
whole-harness run at source 50717cca, bundle 527687e5, 129 of 154
passed). This receipt is the family's own adjudication of the row at this
tip, where the whole exercise's named check for it exists and is graded.

## What the row is

A person submits the new-card form with a name that is already taken. The
engine REFUSES the create, the refusal is a real error surface the person
can read, and the card that held the name is untouched: still there, still
answering 200.

## The instrument

The cover-b module's own check (tools/edge-signed-in-exercise/checks-cover-b.mjs:258-271):
the check opens /new/RichText (:259), fills the name field with the
deck's own "Home" (:260), submits (:262), waits (:263), takes the first
non-GET request out of the run's ledger (:264), reads the page's own text
(:265), visits /Home again (:266) and records PASS only when the write
answered 400 or more AND the page text matches
/already|exist|taken|Problems with/i AND /Home still answers 200
(:267-270). The recorded evidence is the write status, the head of the
server's own answer, whether the error text was visible to the person, and
Home's status.

The check runs inside the whole exercise with no extra wiring: the module
is one of the `checks-*.mjs` files the loader picks up
(tools/edge-signed-in-exercise/lib/check-modules.mjs:36-37) and declares
its capability ids, C8 among them
(tools/edge-signed-in-exercise/checks-cover-b.mjs:1384-1387), with one
runner-contract entry that runs the module's body (:1398-1403).

THE RUNNER'S OWN C8 CHECK GRADES THE SAME ROW A SECOND WAY
(tools/edge-signed-in-exercise.mjs:1159-1170): the same submission through
the same form, recording the refusal and Home's status (:1169-1170).

## The oracle

RUBY'S OWN NAME UNIQUENESS VALIDATION. Ruby's save runs the name events
on the validate stage: `event :validate_name, :validate, on: :save,
changed: :name` calls the legality check and then the uniqueness check
(card-1.110.0/mod/core/set/all/name_events.rb:3-9), and
`event :validate_uniqueness_of_name` is the check itself
(name_events.rb:12-20): the Lexicon's id for the key, skipped when it is
the card's own id (:13), the row re-read live so a trashed card does not
block the name (:17), and the refusal is `errors.add :name,
t(:core_error_name_exists, name: existing_card.name)` (:19), whose text
is "must be unique; '%{name}' already exists."
(card-1.110.0/mod/core/config/locales/en.yml:15).

RUBY'S OWN ANSWER IS 422 WITH THE ERRORS VIEW. The create is
`handle { card.save! }` (decko-0.20.0/lib/card_controller/rest.rb:6-8),
a failed validation raises, and the controller's error handler reports it
and shows the error class's view and status
(decko-0.20.0/lib/card_controller/errors.rb:18-23). The base error class
carries view :errors and status_code 422
(card-1.110.0/lib/card/error.rb:20-21). The errors view is
card-mod-format-0.20.0/set/all/html/error.rb:53-65: the title is
`t(:format_problems_name, cardname: card.name)` (:56-61), "Problems with
%{cardname}" (card-mod-format-0.20.0/config/locales/en.yml:16), and the
alert carries the classes "alert" and "card-error-msg" (:63).

THE PORT REFUSES WITH THE SAME CODE AND THE SAME PAGE. The port's
uniqueness check is src/card/actions/name-validation.ts:90-112
(assertNameAvailable): the Lexicon's id for the key (:95), the live row
re-read so a trashed card does not block the name (:97-100), and the
refusal is a CardActionError with the code "name-conflict" (:103) and the
message Ruby's own error text names, "NAME: must be unique; '<name>'
already exists." (:107). The code is the port's own for
validate_uniqueness_of_name (src/card/actions/types.ts:44). The port's own
comment on the 422 answers names Ruby's class: the base Card::Error
carries view :errors and status_code 422 (card/error.rb:20-21), so the
deployed answer is the errors-view alert at 422
(src/card/actions/card-action-engine.ts:1594-1598).

THE PRIOR LIVE MEASUREMENT OF THIS ROW IS THE REGISTRY'S OWN RECEIPT. The
roster's evidence for the row names
C:/localProjects/brandonDojoTech/.runtime/edge-signed-in/live-session13-2026-10-19/receipts/check-14-ACT-070-c8-duplicate-name-refused.json
(a live creator session of 2026-10-19T06:49:12Z): a second card with an
existing name, created through the real /new/RichText form, answers 422
with the head "<title>Error (name-conflict)</title>" and the alert
markup rendered to the person (errorVisibleToPerson true), and the
existing card still answers 200. That receipt is a prior measurement by
another lane; this lane ran no live request.

## What is oracle-matched and what is not, stated plainly

Oracle-matched: the refusal is a validation error on the NAME (Ruby's
validate_uniqueness_of_name, name_events.rb:12-20; the port's
assertNameAvailable, name-validation.ts:90-112); the answer is 422 with
the errors view (Ruby error.rb:20-21, port card-action-engine.ts:1594-1598);
the page carries Ruby's "Problems with <name>" title and the
"card-error-msg" alert class (Ruby error.rb:53-65 with en.yml:16); and
the card that held the name is untouched, answering 200.

NOT oracle-matched, and stated rather than glossed over: the run's
evidence keeps the HEAD of the server's answer, not the whole page, and
the visible-error arm is graded by a text pattern
(/already|exist|taken|Problems with/i) rather than by exact bytes; the
capability ledger's C8 row records the row as PARTIAL with the finding
"Refusal and unchanged Home checked; visible validation error is not
asserted", and this receipt does not widen that: the cover-b module's own
check does assert the visible error text, while the ledger's named check
is the runner's variant; the deck's own "Home" card is the run's fixture,
so the name that collides is fixture state; and no live request was made
by this lane.

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

The named check in this run:

    C8 creating a card whose name already exists is refused (Home untouched, error shown)
        {"writeStatus":422,
         "serverSaid":"<!DOCTYPE html><html><head><title>Error (name-conflict)</title></head><body><div class=\"alert alert-warning alert-dismissible card-error-msg\" role=\"alert\">",
         "errorShown":true,"homeStatus":200}

The runner's own C8 check in the same run:

    creating a card whose name already exists is refused (Home not touched)
        {"status":422,"homeStillThere":true,"errorShown":true}

The run's capability coverage records capability C8 as partial with its
named check verified, and the run as a whole graded 251 of 253 checks
passed. The two failures are E10 "a plain-input card can be edited and
saved (the new content shows on the card)" (the write answered no status
inside that attempt's window, while the card's own page answered 200 and
showed the new content) and the page-time budget row "no signed-in page
exceeded 3 s of server time" (three pages over the 3000 ms budget, each
carrying a contention charge of 2745, 1582 and 912 ms of measured machine
contention against 221, 1251 and 967 ms of the engine's own database CPU
time). Neither failure is this row.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green.
  This receipt does not claim anything about the live deployment: no
  live request was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this
  receipt; this receipt adds the family's own evidence for the row.
