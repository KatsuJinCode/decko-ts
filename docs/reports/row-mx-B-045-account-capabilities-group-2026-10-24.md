# mx-B-045: the Account tab exposes the account's email and password fields

The roster row `mx-B-045-7b-further-signed-in-capabilit` (family [Family])
reads "the Account tab exposes the account's email and password fields",
verdict PASS, bucket DONE, with the evidence basis "verified - every
instrument entry for B-045 is pass (live-acceptance-lane+whole-harness)".
This receipt is the family's own adjudication of that row: the instrument
the registry's own ledger records for it, the Ruby oracle that pins the
surfaces the instrument touches, and a fresh measurement at this tip.

## What the row is

The account tab is not decoration: it is where the account's own email and
password live, and each of them has to be editable there. The row is the
check that both fields are really on the tab, that the password field is
really a password field, and that neither is a hidden stand-in.

## The instrument

The account-settings journey opens each labeled row's editor
(tools/edge-signed-in-exercise.mjs:701-718). `openAccountField` clicks the
labeled row's own edit link (`.RIGHT-X<right>.labeled-view a.edit-link`,
:702-703) and waits for that row's input to appear in the modal (:704-707).
It does that for the email right (:708-711) and then for the password right
(:713-714), records each field's `name` and `type` (:715), and records the
row PASS only when the email field exists, is not hidden, and the password
field exists and is of type `password` (:716-718).

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "the Account tab
exposes the account's email and password fields", id ACT-045, check_ids
["B-045"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE TWO LABELED FIELDS ARE RUBY'S OWN, AND BOTH THE SOURCE AND THE
CAPTURED BYTES ARE IN THE REPOSITORY.

First, Ruby's own source, vendored here:
fixtures/vendor/card-mod-account-0.20.0/set/right/account/views.rb:49-58

    format :html do
      view :core do
        [account_field_nest(:email, "email"),
         account_field_nest(:password, "password")]
      end

      def account_field_nest field, title
        field_nest field, title: title, view: :labeled
      end

The account right's HTML core view is exactly two labeled field nests, the
email one and then the password one, each with its title.

Second, Ruby's own rendered bytes. The repository's committed capture of a
real Ruby deck's rendered views
(reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl)
holds the arm `probe-view:15:core@set/right/account/views.rb`, whose bytes
are the two labeled rows:

    <div id="sign_up-Xaccount-Xemail-labeled-view" class="card-slot
    labeled-view ALL ALL_PLUS TYPE-phrase RSTAR RIGHT-Xemail
    TYPE_PLUS_RIGHT-rich_text-Xemail row" ...><div class='label col-4
    text-end'>
    <span class="card-title" title="email">email</span>
    </div>
    <div class='labeled-content col-8'>
    <div class="d0-card-body d0-card-content ALL ALL_PLUS TYPE-phrase
    RSTAR RIGHT-Xemail TYPE_PLUS_RIGHT-rich_text-Xemail">...</div>
    </div>

    </div>
    <div id="sign_up-Xaccount-Xpassword-labeled-view" class="card-slot
    labeled-view ALL ALL_PLUS TYPE-phrase RSTAR RIGHT-Xpassword
    TYPE_PLUS_RIGHT-rich_text-Xpassword row" ...><div class='label col-4
    text-end'>
    <span class="card-title" title="password">password</span>
    </div>
    ...

So Ruby's own account page carries a labeled row per field, the row's class
carries the right's name (`RIGHT-Xemail`, `RIGHT-Xpassword`), and the
label carries the field's title.

The port renders the same thing. The account right's core view is
src/card/mod-loader/mods/card-mod-account.ts:247-285 (`accountCoreView`):
it nests the two fields with `view: "labeled"` and the titles "email" and
"password" (:275-284), which is Ruby's `field_nest field, title: title,
view: :labeled` in the port's own words. The labeled view itself is
src/card/render/views.ts:5887-5927: the `.label.col-4.text-end` block with
the title span, then the `.labeled-content.col-8` block with the
`d0-card-body d0-card-content` div, the shape Ruby captured. The password
field's own input type is Ruby's too: `right/password.rb:86-88`'s
`def input_type; :password end`, which the port implements at
src/card/mod-loader/mods/card-mod-account.ts:298-324, emitting
`type="password"`.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The two labeled
rows, their classes, their titles, their order (email then password) and
the password field's input type are Ruby's own, and the port renders each
of them. The `name` attribute of the field inputs (`card[content]`) and the
`id` are the port's and the harness's own editor-form facts, named here as
named-instrument facts and NOT claimed as oracle-matched. The check's own
predicate (the email field is not hidden and the password field's type is
`password`) is the harness's own instrument.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round10-20261024/rows-r1/report.md

    source 83ca98cddc093c550bcbc5bf7b7f640e117c54b3, started
    2026-10-24T12:00:41.012Z, completed 2026-10-24T12:21:35.391Z,
    the source files clean
    verdict: PASS
    evidence: {"fields":[{"right":"email","name":"card[content]","type":"text"},{"right":"password","name":"card[content]","type":"password"}],"actor":"Harness Admin"}

Both fields were there, and the password field was a password field. The
run as a whole graded 253 of 253 checks passed, 0 failed, 0 skipped by
write mode. The same row is graded twice in that run, once for each of the
run's two throwaway accounts, and both are PASS.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
