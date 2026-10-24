# Edge signed-in exercise, round six: the measured run at the round-six tip

The branch is `port/capability-round6-20261024`, created from
`port/capability-round5-20261023` at `18d42a84`. The source commit of both
runs below is that `18d42a84`, with a clean source tree.

Two runs, both on the LOCAL stack that the harness boots itself: the loopback
database and object storage, a local copy of the deck on the engine schema,
two throwaway local accounts (one holding the `administrator` role, one
signed in with no role), headless Chromium with a throwaway profile. Nothing
reached the live edge and nothing was written to the live D1: every run's
provenance carries `productionRuntime: false`. The source deck is the same
local snapshot the earlier runs used, SHA-256
`6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`, 21676
cards copied into the local copy. The executed bundle is the deploy's own
artifact, SHA-256
`f00a1ca66b91871e8f0445e3a76abb8806bf5c9d36876bf1ecc6900003e3afe7`.

The committed run record for both runs is
`docs/runs/edge-signed-in-exercise-round6-measured-2026-10-23.json`, written
by `tools/edge-signed-in-exercise/commit-run-record.mjs` from the harness's
own records. It carries each run's provenance, its results, the coverage the
grader computed, and the request ledger. One request path in the mail-reset
run's ledger carried a live one-time reset token in a query string; that
value is replaced with the literal `token=REDACTED`, and the record's own
`redaction` field says so.

## The account run

```
node tools/edge-signed-in-exercise.mjs --only account \
  --out .runtime/edge-signed-in/round6-account/report.md
```

**16 / 16 checks passed**, 0 failed, 0 skipped.

The account journey ran for BOTH local accounts, so every leg has one result
per actor and the row's `requiredActors` are satisfied by the results
themselves, not by the declared status.

| check | result | the evidence |
|---|---|---|
| the account card's board has an Account tab | PASS, twice | actor "Harness Admin" then "Harness Member"; the account tab's own href and text were read out of the board |
| the Account tab exposes the account's email and password fields | PASS, twice | the email field is `card[content]` with type "text" and the password field is `card[content]` with type "password", read out of the opened labeled rows |
| the account password can be changed and the new one signs in | PASS, twice | writeStatus 200, oldPasswordStillWorks false, newPasswordWorks true |
| the account email can be changed and the new one signs in | PASS, twice | writeStatus 200, storedNewEmail true, oldEmailStillWorks false, newEmailWorks true |
| A1 the account settings page shows the signed-in account's email | PASS, twice | the labeled row's text carried the signed-in account's own address, for each actor |
| A3 the account's new email address shows on the account page | PASS, twice | the labeled row's text carried the NEW address, for each actor |

The run's own grader (`tools/edge-signed-in-exercise/lib/local-policy.mjs`
`verifiedCapabilities`) computed **5 covered, 0 partial, 88 not covered, 1
out of scope** of the 95 rows, and named the rows it drove that the checklist
had listed as uncovered: **C13, E19, A1, A2, A3**.

## The mail-reset run

```
node tools/edge-signed-in-exercise.mjs --only mail-reset \
  --out .runtime/edge-signed-in/round6-mail-reset/report.md
```

**8 / 8 checks passed**, 0 failed, 0 skipped. This run arms the owned local
mail capture, so the reset request's message is delivered into the run's own
inbox rather than to any outside destination.

| check | result | the evidence |
|---|---|---|
| reset request reaches the captured test inbox with visible acknowledgment | PASS | status 303, one message delivered, the subject carried the site title, the link's path named the owned account, the link carried a token, and the page showed the acknowledgment |
| captured reset link signs member into the password form | PASS | the landing answered 200 and the session cookie was present |
| reset password persists and rejects the old credential | PASS | the stored digest changed, the new credential was accepted, the old one was refused |
| reset journey restores its original fixture credential | PASS | the fixture's own credential was restored and signed in again |

The run's own grader computed **2 covered, 0 partial, 91 not covered, 1 out
of scope** of the 95 rows, and named the rows it drove that the checklist had
listed as uncovered: **C13, A5**.

## What these runs do and do not credit

They credit E19, A1, A2, A3 and A5, the rows this round takes. C13 is
credited by both runs and is not this round's roster.

W4 has no instrument in any check module, so no run can credit it. Its gap is
measured at the source level in the row's own finding.

## The battery

The parity pins this round lands are run with `npx vitest run` over the
touched test files; each row's commit states its own battery.
