# mx-B-047: the account email can be changed and the new one signs in

The roster row `mx-B-047-7b-further-signed-in-capabilit` (family [Family])
reads "the account email can be changed and the new one signs in", verdict
PASS, bucket DONE, with the evidence basis "verified - every instrument
entry for B-047 is pass (live-acceptance-lane+whole-harness)". This receipt
is the family's own adjudication of that row: the instrument the registry's
own ledger records for it, the Ruby oracle that pins the surfaces the
instrument touches, and a fresh measurement at this tip.

## What the row is

The email address is how the account is reached, so changing it is only a
change if three things are true at once: the write took, the address was
really stored, and the account now answers to the new address and no longer
to the old one. The row is the check that all three hold.

## The instrument

The account-settings journey changes the email
(tools/edge-signed-in-exercise.mjs:742-753). It opens the account board's
Account tab and the email-and-password pill (:742-744), opens the email
field's editor (:745), fills a fresh address built from the account's id and
the clock (:746), and saves (:747-748). It then reads the stored row out of
the deck's own database (:749: the `email` right's `db_content` on the
account card, not trashed) and compares it with the address it wrote
(:752). It tries the OLD address (:750) and, only if that was refused, the
NEW one (:751). The row is recorded PASS only when the write was not an
error AND the stored row holds the new address AND the old address no
longer signs in AND the new one does (:752-753). If the new address signed
in, the journey restores the original address and checks that the original
still signs in (:754-774), so the run leaves the deck as it found it.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "the account email
can be changed and the new one signs in", id ACT-047, check_ids ["B-047"])
records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE EMAIL FIELD IS RUBY'S OWN, AND THE REPOSITORY CARRIES BOTH ITS DATA
AND ITS CAPTURED BYTES.

First, Ruby's own vendored data for the account mod
(fixtures/vendor/card-mod-account-0.20.0/data/real.yml) declares the email
field itself, with its codename and its rights, at lines 121-131:

    - :name: "*email"
      :codename: email
      :fields:
        :right:
          :fields:
            :read:
              - :help_desk
            :update:
              - :help_desk
            :delete:
              - :help_desk

so "email" is the codename the instrument's own stored-row query looks for
(:749), and the field is a right with its own read, update and delete
permissions. The same file declares the account card's own settings
structure at lines 162-170, over the account right, the roles right and the
follow right.

Second, Ruby's own captured bytes. The repository's committed capture of a
real Ruby deck's rendered views
(reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl)
holds the arm `probe-view:4:raw@set/type_plus_right/user/email.rb`, whose
bytes are the email right's raw value:

    probe.user.email@example.test

and the arm `probe-view:15:core@set/right/account/views.rb`, whose bytes
carry the account page's labeled email row (the `RIGHT-Xemail` slot with the
`email` title), cited in the mx-B-045 receipt. Ruby's own source for the
account right's core view is vendored here too:
fixtures/vendor/card-mod-account-0.20.0/set/right/account/views.rb:49-58.

The port renders the same thing. The email right's raw view is
src/card/mod-loader/mods/card-mod-account.ts:576-590 (`userEmailRawView`:
the card's own stored content, and the empty string for a card that is not
saved yet, which is the port's rendering of Ruby's
`card.content_email || card.account_email || ""`). The email right's set
declaration is src/card/mod-loader/mods/card-mod-account.ts:1470-1498: it
assigns the Phrase type (Ruby's `assign_type :phrase` at `right/email.rb:5`)
and owns the two validation events. The validations themselves are
src/card/auth/account-fields.ts:71-77 (`normalizeEmail`, `emailIsValid`, the
address grammar at :54) and :114 with :141-156 (`emailTaken`, the uniqueness
probe). The account page's labeled email row carrying the address as text is
what the run measured: the cover-b row E19 in the same run reads the
account region's text as

    email harness-admin-5f3fc3c2@harness.invalid help edit space_dashboard
    password encrypted help edit space_dashboard

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The email field's
codename, its rights, the email right's raw value and the account page's
labeled email row are Ruby's own, and the port renders each of them. The
Ruby source files `set/right/email.rb` and
`set/type_plus_right/user/email.rb` are NOT vendored in this repository
(the vendored copy of the account mod carries only `set/right/account/
views.rb`, `set/type/signup/views.rb`, `set/self/signin/core.haml` and
`data/real.yml`), so the two validation events' Ruby names are named here as
the port's own cited facts and NOT claimed as capture-matched. The stored
row's own value, the credential verdicts and the session cookie's NAME
(src/server/write-routes.ts:363) are the port's and the harness's own
facts. The check's own predicate is the harness's own instrument.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round10-20261024/rows-r1/report.md

    source 83ca98cddc093c550bcbc5bf7b7f640e117c54b3, started
    2026-10-24T12:00:41.012Z, completed 2026-10-24T12:21:35.391Z,
    the source files clean
    verdict: PASS
    evidence: {"actor":"Harness Admin","writeStatus":200,"storedNewEmail":true,"oldEmailStillWorks":false,"newEmailWorks":true}

The write answered 200, the stored row held the new address, the old
address was refused and the new one signed in. The run as a whole graded 253
of 253 checks passed, 0 failed, 0 skipped by write mode. The same row is
graded twice in that run, once for each of the run's two throwaway
accounts, and both are PASS.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
