# Edge signed-in exercise, round five: the measured run at the round-five tip

The branch is `port/capability-round5-20261023`, created from
`port/capability-round4-20261023` at `0aecb56b`. The source commit of both
runs below is that `0aecb56b`, with a clean source tree.

Two runs, both on the LOCAL stack that the harness boots itself: the loopback
database and object storage, a local copy of the deck on the engine schema,
two throwaway local accounts (one holding the `administrator` role, one
signed in with no role), headless Chromium with a throwaway profile. Nothing
reached the live edge and nothing was written to the live D1. The source deck
is the same local snapshot the earlier runs used, SHA-256
`6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`, 21676
cards copied into the local copy.

## The board row run

```
node tools/edge-signed-in-exercise.mjs --only cover-b --case E19,E22,E23,F1,W2 \
  --out .runtime/edge-signed-in/round5-measured/report.md
```

**13 / 13 checks passed**, 0 failed, 0 skipped. The run record is
`.runtime/edge-signed-in/round5-measured/report.md` with its raw page captures
beside it; the bundle SHA-256 it ran was
`f00a1ca66b91871e8f0445e3a76abb8806bf5c9d36876bf1ecc6900003e3afe7`.

| row | check | result | the evidence |
|---|---|---|---|
| E19 | E19 the account card's board has an Account tab that exposes email and password | PASS | accountTab {text "Account", href "#tab-harness_admin-9-account"}; the "Email and Password" pill fetched `/Harness_Admin+*account/content` with fetchStatus 200; the region text carried the signed-in account's own address and the password's own labeled row (emailRowPresent true, passwordRowPresent true) |
| E22 | E22 Edit board: rules tab (no set selected; warns when set 'all' selected) | PASS | the Rules pane rendered 3 controls, mentionsSelect true, the set selector is `<select name="mark" id="mark">` with the options ":", `Home+*self:The card "Home"` and `Home+*right:All "+Home" cards`, and the form's action is `/?view=filtered_accordion_rule_list`; page capture `018-e22-rules-tab` |
| E23 | E23 a pointer card can be edited: the selection changes and is stored | PASS | actor admin, actorId 53041, writeStatus 200, stored "Harness_CB_Pick_Two", afterStatus 200, showsPickTwo true |
| F1 | F1 a file can be uploaded through the File create form | PASS | writeStatus 200, the server answered the chooser's own hidden `card[action_id_of_cached_upload]` field inside `<div class='chosen-file'>`, afterStatus 200, stored true |
| F1 | F1 the uploaded card offers the /files route as a Download link | PASS | failures []; the download anchor's href is `/files/~53063/14.txt` and its text is "Download Harness_download_mvlh4j0p"; writeStatus 200, afterStatus 200, uploadRoundTripStatus 200, attachmentUpload `card[file]`, chipPresent true |
| W2 | the Engage tab offers the start-follow link with Ruby's follow bytes: verb, title, class and an *always href | PASS | the start state's shape was graded byte for byte |
| W2 | after following, the same control offers Ruby's stop link: verb 'following', the btn-item-delete class, the stop-sending title and an *never href | PASS | the stop state's shape was graded byte for byte |
| W2 | clicking the stop link leaves the stored follow preference at *never, on the same rule it followed | PASS | the stored preference was read out of the deck through the rule card |
| W2 | after unfollowing, the control is byte-identical to the start state and the follower count is back to its baseline | PASS | the revert matched the start bytes and the count baseline |

The run's own grader (`tools/edge-signed-in-exercise/lib/local-policy.mjs`
`verifiedCapabilities`) computed **5 covered, 0 partial, 88 not covered, 1
out of scope** of the 95 rows, and named the rows it drove that the checklist
had listed as uncovered: **C13, E22, E23, F1, W2**.

## The account run

```
node tools/edge-signed-in-exercise.mjs --only account \
  --out .runtime/edge-signed-in/round5-account/report.md
```

**16 / 16 checks passed**, 0 failed, 0 skipped. The run record is
`.runtime/edge-signed-in/round5-account/report.md`.

The account journey ran for BOTH local accounts, so every leg has one result
per actor and the row's `requiredActors` are satisfied by the results
themselves, not by the declared status.

| check | result | the evidence |
|---|---|---|
| the account card's board has an Account tab | PASS, twice | actor "Harness Admin" then "Harness Member"; the account tab's own href and text were read out of the board |
| the Account tab exposes the account's email and password fields | PASS, twice | the email field is `card[content]` with type "text" and the password field is `card[content]` with type "password", read out of the opened labeled rows |
| the account email can be changed and the new one signs in | PASS, twice | writeStatus 200, storedNewEmail true (the stored row carries the new address), oldEmailStillWorks false, newEmailWorks true |
| A1 the account settings page shows the signed-in account's email | PASS, twice | the labeled row's text carried the signed-in account's own address, for each actor |
| the account password can be changed and the new one signs in | PASS, twice | writeStatus 200, oldPasswordStillWorks false, newPasswordWorks true |
| A3 the account's new email address shows on the account page | PASS, twice | the labeled row's text carried the NEW address, for each actor |

The run's own grader computed **5 covered, 0 partial, 88 not covered, 1 out
of scope** of the 95 rows, and named the rows it drove that the checklist had
listed as uncovered: **C13, E19, A1, A2, A3**.

## What this run does and does not credit

It credits E19, E22, E23, F1 and W2, the five rows this round takes. It also
credits A1, A2 and A3, whose own legs are the account family's settings-page,
password-change and email-change rows; those three rows stay `not_covered` in
`tools/edge-signed-in-exercise/capabilities.json` in this round, because they
are not this round's roster and their parity pins are not landed here. Their
measured legs are recorded above for whoever takes them.

W4 has no instrument in any check module, so no run can credit it. Its gap is
measured at the source level in the row's own finding.

## The battery

The parity pins this round lands are run with `npx vitest run` over the
touched test files; each row's commit states its own battery.
