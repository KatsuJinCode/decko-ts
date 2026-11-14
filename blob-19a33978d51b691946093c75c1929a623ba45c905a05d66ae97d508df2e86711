# mx-B-060: the member is signed in

The roster row `mx-B-060-8-ordinary-non-admin-account-p` (surface "8.
ordinary (non-admin) account permissions") reads "the member is signed
in", verdict PASS, bucket DONE. Its DONE basis in the registry is not the
live-acceptance+whole-harness phrasing the 7b rows carry; it is the
grind tranche-2 run of 2026-10-19: "1/1 matching check row(s) PASS -
PASS \"the member is signed in\"" from the battery run at
C:/localProjects/decko-ts-unmeasured-tranche-2-20261019/.runtime/edge-signed-in/
grind-tranche2-20261019/report.md, alongside the probe leg "the member is
signed in (form session, her identity, her role)" GREEN. The registry's
own ledger entry for this row
(C:/localProjects/brandonDojoTech/docs/registry/instrument-coverage-matrix.json,
action "the member is signed in", id ACT-060, check_ids ["B-060"])
records the live-acceptance-lane entry pass and the whole-harness entry
"unmeasured", with its own note: "present in harness source; no row under
this name in the 2026-10-16 19:17Z native run (cover-b adaptation still
pending per the debrief); no pass/fail inferred". This receipt is the
family's own adjudication of the row at this tip, where the whole
exercise's named check for it exists and is graded.

## What the row is

The ordinary (non-admin) member signs in through the sign-in form, and
the session that results is REALLY the member's: the landing page names
her signed in, and the stored session binds to her own account card's
id, not to the administrator's and not to an anonymous actor.

## The instrument

"the member is signed in"
(tools/edge-signed-in-exercise/lib/member-delete.mjs:11-13, wired into
the whole exercise at tools/edge-signed-in-exercise.mjs:915 and :1353):
the member-delete journey signs in as the member through the sign-in
form (:9), reads the browser context's session cookie, hashes it and
looks the hash up in the engine's own session table (:10,
lib/session-actor.mjs:6-13: the `decko_ts_session` cookie's sha256
against `auth_sessions.token_hash`, answering `account_card_id`), and
records the check PASS only when `verifiedActorSession` holds
(lib/session-actor.mjs:15-17): the session cookie exists, the landing
page reports signed in, and the stored actor id equals the member
account's expected id. The helper's own comment states the discipline
(lib/session-actor.mjs:2-4): an identity witness for an already-tested
browser sign-in, which does not replace the backend's expiry and
revocation checks because landing.signedIn is required, and the bearer
token and its digest never enter the recorded evidence.

The same journey's later records (the member's delete attempt refused
403 with a message, and the target card untouched) grade the permission
rows of this surface; they are corroboration here, not this row's
verdict.

## The oracle

RUBY'S OWN SUCCESSFUL SIGN-IN IS CAPTURED IN THIS REPOSITORY. The
committed Ruby write-battery capture
(reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json,
step "signin-success") records status 303 back to *signin, the event
ladder ending `["*signin","signin"]` then `["*signin","signin_success"]`,
and the capture's own field `signed_in_as: "Parity Probe"`: Ruby records
WHO the session now names. The step's delta on the `sessions` table is
zero: Ruby's session is the cookie store, not a table row, and the
identity rides the session's own storage keyed to the user id.

RUBY'S OWN SOURCE OWNS THE BINDING. The account mod's sign-in card
(card-mod-account-0.20.0/set/self/signin.rb) authenticates and signs in:
`authenticate_or_abort` at :45-49 and `authenticate_and_signin` at
:51-55, which calls `Auth.signin account.left_id` (:54): the ACCOUNT
card's left id (the holder). The core Auth machinery
(card-1.110.0/lib/card/auth/current.rb) stores that identity in the
session: `signin cardish` at :36-41 is commented "set current user in
process and session" and runs `(session[session_user_key] =
self.current_id = user_id)` (:38), and the next request reads the actor
back the same way: `signin_with_session` at :59-61 takes `card_id =
session[session_user_key]`.

THE PORT BINDS THE SAME FACT, AS A ROW THE INSTRUMENT CAN READ.
src/server/write-routes.ts:1442-1446 builds the SessionStore and calls
signinAccount; src/card/auth/signin.ts:422 (signinAccount) mints the
session for the authenticated account holder at :456
(`sessions.createSession(result.account.holder.id)`); and
src/card/auth/session-store.ts:117 (createSession) inserts the row the
instrument reads: `INSERT INTO auth_sessions (token_hash,
account_card_id, created_at, expires_at)` (:127), with the row shape
documented at :80 and the same table read back at :155-160 and :238-242.
The port's session key is the cookie token's hash; Ruby's is the session
store's own key. Both bind session to ACCOUNT CARD ID, which is the
equality the check grades.

## What is oracle-matched and what is not, stated plainly

Oracle-matched: a successful sign-in answers a redirect and lands the
member signed in (Ruby's captured 303 and `signed_in_as`, the port's
success target); the signed identity is the account holder's own card id
(Ruby's `Auth.signin account.left_id` and
`session[session_user_key] = current_id = user_id`, the port's
`createSession(result.account.holder.id)` and the
`auth_sessions.account_card_id` row the instrument reads back); and the
session survives to the next request, which is how both engines answer
"who is this".

NOT oracle-matched, and stated rather than glossed over: the session
MECHANISM differs and is disclosed: Ruby's identity rides the framework
session store keyed by `session_user_key` with no database row (the
capture's zero `sessions` delta is that fact), while the port mints its
own `decko_ts_session` token and records its hash in the
`auth_sessions` table (db/migrations/001-auth-sessions.sql, named at
session-store.ts:2). The check grades the BINDING (cookie to account
card id), which both engines carry; it does not claim the storage is the
same. The member's expected id in this run (53047) is the run deck's own
member account; the id is fixture state, not a port constant.

## The measurement at this tip

    node tools/edge-signed-in-exercise.mjs \
      --deck C:/localProjects/decko-ts-turn-on-editing/tmp/brandon-local-edit/deck.sqlite3 \
      --out .runtime/signed-in-exercise-round12-20261025/rows-r1/report.md

    source 26f4d6a4eccdebcc9994b01ff2924c9b6f6808e2, started
    2026-10-26T00:15:17.870Z, completed 2026-10-26T00:38:01.781Z,
    the source files clean
    verdict: PASS

The named check in this run:

    the member is signed in
        {"expectedActorId":53047,"actualActorId":53047,"signedIn":true}

and the same journey's corroborating records:

    a member's delete attempt is refused with a clear message, not a form
        {"status":403,"actorId":53047,"target":"Harness_richtext_mvoi9tel_renamed"}
    the card the member tried to delete is still there
        {"actorId":53047,"unchanged":true,"status":200}

The run as a whole graded 253 of 253 checks passed, 0 failed, 0 skipped by
write mode.

## What this receipt does NOT claim

- The row's port side is what the instrument grades, and it is green. This
  receipt does not claim anything about the live deployment: no live
  request was made by the lane, and nothing deploys.
- The row's DONE condition in the roster is not changed by this receipt;
  this receipt adds the family's own evidence for the row.
- The session storage is not claimed identical to Ruby's; the disclosed
  difference is stated above, and the binding it produces is what both
  the oracle and the instrument grade.
