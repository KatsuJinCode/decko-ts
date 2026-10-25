# reg-redteam-dispute-1

- Family: register-redteam.
- Row: "disputed PORTED verdict: account" (card-mod-account / write-routes stub census).
- Verdict at the time of this lane: PARTIAL, bucket WORKING ON IT. The adjudication
  (port/starcards-redteam-20261020, commit 1a36e8d3) upheld the dispute and closed both of
  the row's own arms. Its stated unblock condition: "the engineOwned registration for
  validate_account_holder_name_change reaches the canonical tree, at which point the
  register's DONE verification is readable at the cited line."

## Verdict: DONE - the unblock condition is met at the base this receipt measures

Base: `deploy/full-candidate-20261101` tip `c17906db`, branch `port/workbatch-b-20261025`.
The canonical roll tip carries the registration and the engine owner it cites:

- `src/card/mod-loader/mods/card-mod-account.ts:1380-1385`: the `engineOwnedEvent`
  registration for `validate_account_holder_name_change` (at `validate`, on `update`,
  changed `name`), under the citation comment that names all three branches
  (`set/abstract/account_holder.rb:1-5`): the junction probe (`account?`), the manager gate
  (`account_holder.rb:71-73`, `own_account? || parties.member?(HelpDeskID)`), and the
  refusal message verbatim.
- `src/card/actions/card-action-engine.ts:1911`: `assertMayRenameAccountHolder`, the
  engine-owned body, invoked at `:3845` on the update path ahead of the write-permission
  walk, where Ruby's validate stage raises; the comment records the name is NOT in
  `EVENT_TAKEOVER_BUILTINS`, so a registered body never displaces the engine call.
- The ARM 2 rulings (the five rails-runtime halves ruled out on their declarations) are the
  adjudication's own record and are unchanged by anything since: password_redirect writes
  Env::Success (route-static success handling port-side), signout_upon_delete and
  signin_after_setup write the rack session (the port's session lives at the host layer),
  act_as_current_for_integrate_stage writes the process-global Auth.current_id (no global
  Auth by design, the A-R9 ruling), approve_with_verification needs the unported subcard
  trigger and approval journey.

Checks run at the base of this receipt (this lane, this tree):

- `npx vitest run tests/card/mod-loader/card-mod-account-holder-name-guard.test.ts` (in the
  3-file run with the subcard-cached-upload and auth-setup pins): 3 tests passed - the
  refusal arm with Ruby's exact message, the own_account? arm, the Help Desk arm.
- The registration and the engine owner were read at the lines above in this tree.

With the registration readable at the cited line in the canonical roll, the adjudication's
own unblock condition holds, and the row's DONE verification is exactly what the
adjudication said it would be.
