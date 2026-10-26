# Gap batch 8, gap 2: the administrator approval step of the signup activation journey

The second of the two check-suite gaps the enumeration audit named in its
A5 table and the last two it left unowned: gaps.json entry 27, element
"the administrator approval step of the signup activation journey".

## The capture is the spec

`reference-harness/browser/journeys/acceptance-account-date.json`, journey
`account-signup-activation-complete`, covers "administrator approval
required by fixture create permission". The steps the audit cites are the
journey's middle third: signin admin, visit the pending signup's card
(`/Journey_New_User` in the journey), observe "administrator reviews
pending signup", click the link "Send verification email", observe
"administrator sent verification email", and only then does the
activation mail arrive for the `mail_link` step. The audit's why_no_row:
"cap-A4 and mx-159 cover signing up and signing in; no row covers the
administrator's approval-and-send step on a pending signup."

## What the port already carried, and what no proof covered

The mechanics have been in the tree and pinned at unit level: the
approval links are the sign-up card's `verification_links` view
(card-mod-account `set/type/signup/views.rb`, whose rendered page the
signed-in parity test pins byte for byte,
`tests/card/render/signed-in-parity.test.ts`), and the click is the
update save carrying `card[trigger]=approve_with_verification`
(`src/server/write-routes.ts`, `approveSignup`, the port of
`set/type/signup.rb:24-35`: it judges `ok?(:update)`, requires
`can_approve?`, sets `+*account+*status` to "unverified" and sends the
verification mail at integrate). The pending state itself is the deck's
own default: a sign-up whose creator cannot approve starts "unapproved"
and sends nothing (`src/card/auth/account-fields.ts`,
`planAccountFields`: `holderIsSignup ? (canApprove ? "unverified" :
"unapproved") : "active"`, `requestVerification` only when canApprove).

What no proof covered was the BEHAVIOUR as one chain: the anonymous
sign-up on a deck that leaves approval to the administrator stays pending
and silent, the approval link is the administrator's and not the
anonymous reader's, the click flips the status and produces the mail, and
the mail is the activation mail the journey's next step consumes.

## What this lane adds

The A6 capability row
(`tools/edge-signed-in-exercise/capabilities.json`, group `account`) and
its check module
`tools/edge-signed-in-exercise/checks-account-signup-approval.mjs`. The
module drives the journey's own shape on the disposable loopback deck:
the anonymous browser clicks the navbar's "Sign up" link, fills Ruby's
own form (the field names the committed capture arm
`probe-view:23:new@set/type/signup/views.rb` carries), submits, and the
administrator signs in, opens the pending signup's page and clicks the
view's own "Send verification email" anchor.

The pending precondition is the source deck's own, not a fixture this
module writes: the deck carries no `User+*type+*create` rule (the
accounted cardtype is named Person, codename user unchanged), which the
run records as `deckCarriesAnyoneCreateRule: false` - the journey's own
"administrator approval required by fixture create permission".

One run, on the LOCAL stack the harness boots itself, at this lane's tip,
source commit `a2a093c8`
(`a2a093c8ae545a078ea8a51b3fd084d8e9e08980`), on a clean committed tree
(the harness's source-custody preflight). Nothing reached the live edge:
the run's provenance carries `productionRuntime: false`.

## The grade line

**9 / 9 checks passed**, 0 failed. The runner's process exit was 0.

The four A6 checks, from the run record committed beside this write-up:

| check | result | the evidence |
|---|---|---|
| A6 the anonymous sign-up on a deck that leaves approval to the administrator creates a pending Sign up card and sends no verification mail itself | PASS | create answered 200, the card stored (row 53053), `+*account+*status` reads "unapproved", the owned mail capture holds zero mails for the account's address, and the deck carries no anyone-approve create rule |
| A6 the pending sign-up's page offers the signed-in administrator the Send verification email link and offers it to no anonymous reader | PASS | the administrator's visit answers 200 carrying the "Send verification email" anchor (`approve_with_verification`, one occurrence); the anonymous reader's visit answers 200 carrying none |
| A6 the administrator's Send verification email click marks the account unverified and sends the verification mail | PASS | the view's own anchor answered (GET `/update/<Name>?card%5Btrigger%5D=approve_with_verification`, 303), the status now reads "unverified", the capture holds the mail, its subject "verification link for Culturesmith", contract failures none |
| A6 the approval's mail carries the account's verification link with its token | PASS | the mail's link is `/update/<Name>+*account?card[trigger]=verify_and_activate&token=...`, the verify url shape the committed Ruby capture pins |

The run's own grader (`lib/local-policy.mjs` verifiedCapabilities)
computed **covered** for the new A6 row from this record: 4 of 4
declared checks verified. Capability coverage moved from 1 covered row to
2 (of 98 rows at this tree).

WHAT THIS ROW DOES NOT CLAIM: the journey's remaining legs stay their own
rows' contracts - the activation click and the fresh sign-in are A4's
flow (the mail's link this run grades is the link A4's verify-link leg
consumes), the captcha-off configuration steps are the journey's own deck
prep and no capability names them, and persistence across a HOST RESTART
is gap 26's subject, a journey step no row covers yet (the audit's A5
restart rows). The mail's token in the committed run record is the owned
capture's delivery for a throwaway loopback account on a copy of the deck
that the run itself deletes at cleanup; it certifies nothing beyond that
run.

## The two superseded attempts (recorded, kept)

Both failures were this module's own reads, before any graded leg or at
its first grade, and both are the shape batch two named and fixed in its
own module: `page.waitForResponse` resolves to the Response, not a
wrapper. Attempt 1
(`.runtime/edge-signed-in/gapbatch8-signup-approval/report.md`) threw
"Cannot read properties of undefined (reading 'finished')" at the
sign-up's response await (commit `694869c8` is the fix); attempt 2
(`.runtime/edge-signed-in/gapbatch8-signup-approval-attempt2/report.md`)
threw the same shape's sibling, "reading 'status'", at the pending
state's grade line (commit `a2a093c8` is the fix). Both attempts are kept
in the lane's `.runtime` and named here because superseded attempts that
are not named look like clean first passes.

## State

CLOSED. The journey's administrator approval step runs end to end: the
pending sign-up waits with no mail, the approval link belongs to the
administrator alone, the click sends the verification mail and marks the
account unverified, and the mail carries the tokened verify link the
activation consumes.
