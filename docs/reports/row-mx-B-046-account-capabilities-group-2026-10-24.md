# mx-B-046: the account password can be changed and the new one signs in

The roster row `mx-B-046-7b-further-signed-in-capabilit` (family [Family])
reads "the account password can be changed and the new one signs in",
verdict PASS, bucket DONE, with the evidence basis "verified - every
instrument entry for B-046 is pass (live-acceptance-lane+whole-harness)".
This receipt is the family's own adjudication of that row: the instrument
the registry's own ledger records for it, the Ruby oracle that pins the
surfaces the instrument touches, and a fresh measurement at this tip.

## What the row is

Changing a password is only a change if the change takes effect: the old
password must stop working and the new one must work, in the same session
that made the change. The row is the check that the account's password
right is a real, writable, authenticating field and not a form that accepts
anything.

## The instrument

The account-settings journey changes the password
(tools/edge-signed-in-exercise.mjs:719-741). It takes the current password
(:720) and appends a suffix that adds an upper case letter, a digit and a
special character (:721-723), so the new password satisfies the account
policy whatever the fixture credential happened to contain. It fills that
into the password field and saves (:724-725). It then tries the OLD
password (:726) and, only if the old one was refused, tries the NEW one
(:727). The row is recorded PASS only when the write was not an error, the
new password really signed in, and the new-password attempt was not skipped
(:728-729). If the new password signed in, the journey restores the
original password and checks that the original still signs in (:730-740),
so the run leaves the deck as it found it.

The registry's own ledger for this row
(docs/registry/instrument-coverage-matrix.json, action "the account
password can be changed and the new one signs in", id ACT-046, check_ids
["B-046"]) records these instrument entries:

    - live-acceptance-lane, live-bundle, live-deployment: pass
    - whole-harness, headless-dom, native-local-bundle: pass

## The oracle

THE PASSWORD RIGHT IS RUBY'S OWN, AND THE REPOSITORY CARRIES ITS CAPTURED
BYTES. The repository's committed capture of a real Ruby deck's rendered
views (reference-harness/fixtures/synthetic-v2-mod-probes/expected/render.jsonl)
holds two arms for it. The raw arm
`probe-view:2:raw@set/right/password.rb` answers the single word

    encrypted

and the core arm `probe-view:16:core@set/right/password.rb` answers

    <em>encrypted</em>

So Ruby's own password right renders a stand-in word and never the hash.
The port renders the same bytes: the raw view is
src/card/mod-loader/mods/card-mod-account.ts:287-290 (`passwordRawView`
answers the literal string "encrypted") and the core view is
src/card/mod-loader/mods/card-mod-account.ts:326-330 (`passwordCoreView`
answers "<em>encrypted</em>"). The account page's own labeled password row
carries that word, which is what the run measured: the cover-b row E19 in
the same run reads the account region's text as

    email harness-admin-5f3fc3c2@harness.invalid help edit space_dashboard
    password encrypted help edit space_dashboard

THE WRITE ITSELF IS RUBY'S OWN SHAPE. The port's own source names the Ruby
regions it implements (src/card/actions/account-fields.ts:4-18): the
account right's salt and status creation on create, the password right's
`encrypt_password` (`set/right/password.rb:19-26`: `self.content = Auth.
encrypt content, left&.salt`, with `Auth.encrypt` =
SHA1("#{salt}--#{password}--")), and the two fields' `history? false`.
The port implements that digest at src/card/actions/account-fields.ts:28-30
(`encryptPassword`, the same SHA1 of the same string), and the write path
that runs it is src/card/actions/card-action-engine.ts:1729-1751: it fetches
the password right's codename (:1729-1730), skips a blank content on an
update (:1732), checks the password against the policy (:1733-1740), reads
the account's salt (:1741-1749) and stores the encrypted value (:1750).
Ruby's own policy is the one the port implements at
src/card/auth/account-fields.ts:30-62: the length (8) and the four
requirements (a lower case letter, an upper case letter, a special
character, a number), which the port's own comment attributes to Ruby's
`lib/card/mod/account.rb` and to `right/password.rb`'s `PASSWORD_REGEX`.

WHAT IS ORACLE-MATCHED AND WHAT IS NOT, stated plainly. The password
right's rendered stand-in word ("encrypted"), its `<em>` wrapper, and the
encryption digest's shape are Ruby's own, and the port renders each of
them. The Ruby source file `set/right/password.rb` itself is NOT vendored
in this repository (the vendored copy of the account mod carries only
`set/right/account/views.rb`, `set/type/signup/views.rb`,
`set/self/signin/core.haml` and `data/real.yml`), so the policy's four
requirements and the `history? false` rule are named here as the port's own
cited facts and NOT claimed as capture-matched. The credential verdicts (the
old password refused, the new one accepted) are the live answers this run
measured, and the session cookie's NAME is the port's own
(src/server/write-routes.ts:363). The check's own predicate (the write was
not an error and the new password signed in) is the harness's own
instrument.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round10-20261024/rows-r1/report.md

    source 83ca98cddc093c550bcbc5bf7b7f640e117c54b3, started
    2026-10-24T12:00:41.012Z, completed 2026-10-24T12:21:35.391Z,
    the source files clean
    verdict: PASS
    evidence: {"actor":"Harness Admin","writeStatus":200,"oldPasswordStillWorks":false,"newPasswordWorks":true}

The write answered 200, the old password was refused, and the new one
signed in. The run as a whole graded 253 of 253 checks passed, 0 failed, 0
skipped by write mode. The same row is graded twice in that run, once for
each of the run's two throwaway accounts, and both are PASS.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live request
  was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
