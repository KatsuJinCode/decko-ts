# S3: the sign-in form asks for an email and a password, and refuses either one left blank

The roster row `S3` (group session, the [Family] capability family) reads
"Sign in requires email and password (form validation)", sourced from
`cypress signin_spec 'requires email', 'requires password'`. It was
`partial`, with the recorded finding "Empty password tested; empty email
not tested". This receipt is the family's own adjudication of that row: the
pinned Ruby's own bytes for the contract, the port's own bytes beside them,
and the named instrument that grades the row.

## What the row is

The sign-in form is the one form a stranger is guaranteed to meet, and it
asks for two things. The row is the check that the form carries BOTH
fields, and that a submission which leaves either one blank is refused
rather than half-accepted: no session, and Ruby's own message for the
field that was left empty.

## The oracle

THE REFUSAL IS RUBY'S OWN, AND THE REPOSITORY CARRIES ITS CAPTURED BYTES.
The capture reads the pinned gemset and writes nothing but its own fixture:

    GEM_PATH="C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0;C:/Ruby34-x64/lib/ruby/gems/3.4.0" \
      ruby tests/card/mod-loader/oracle-capture-signin-blank-field-refusal.rb

    wrote C:/localProjects/decko-ts-capability-round7-20261024/fixtures/captured/signin-blank-field-refusal.json

Three pinned files own the contract:

1. card-mod-account-0.20.0 set/self/signin.rb owns THE VALIDATION EVENT and
   THE REFUSAL, IN RUBY'S OWN ORDER. The write route's own hook is

        event :signin, :validate, on: :update do
          authenticate_or_abort field_content(:email), field_content(:password)
        end

   and the refusal itself is

        def authenticate_or_abort email, pword
          abort_unless email, :email_missing
          abort_unless pword, :password_missing
          authenticate_and_signin(email, pword) || failed_signin(email)
        end

   The blank identifier is refused FIRST, and `abort_unless` is the refusal:

        def abort_unless value, error_key
          abort :failure, t("account_#{error_key}") unless value
        end

2. The same file owns THE TWO REQUIRED FIELDS. `before :core` seats

        voo.edit_structure = [signin_field(:email), signin_field(:password)]

   so the form asks for the address and the credential together.

3. card-mod-account-0.20.0 config/locales/en.yml owns THE TWO MESSAGES:
   `account_email_missing: email can't be blank` and
   `account_password_missing: password can't be blank`.

The capture keeps the owners' bytes, their line ranges and their files'
SHA-256 digests in fixtures/captured/signin-blank-field-refusal.json. It
carries no timestamp, so a re-run is byte-stable.

## The port

The port carries the same contract in its own bytes:

- src/card/auth/signin.ts carries the ladder: `email_missing: "email can't
  be blank"` and `password_missing: "password can't be blank"`, and the
  ladder's own order, `if (id === "") return failure("email_missing");`
  before `if (password === "") return failure("password_missing");`.
- src/server/write-routes.ts answers the blank fields with the same two
  messages: `if (email === "" || password === "")`, then `const field =
  email === "" ? "email" : "password";`, then `return fail(`${field}
  missing`, `${field} can't be blank`);`.
- src/card/render/signin-core-form-view.ts asks for the same two fields:
  `const editStructure = [signinField("email"), signinField("password")];`.

tests/card/mod-loader/card-mod-signin-blank-field-refusal.test.ts (16
checks) pins all of it: the captured Ruby's facts, the port's own bytes,
and the row's credit rule.

## The instrument

THE ROW'S OWN GAP IS LANDED, AND THE INSTRUMENT IS NAMED. The harness's
own signed-out attempt (tools/edge-signed-in-exercise.mjs, the "S2/S3/S4
signed-out sign-in page" attempt) now drives each half of the row on its
own:

- "sign-in with an empty email is refused (no session)": the address is
  posted empty with the password present, and the leg is graded on a
  refusal with no session AND a blank-field refusal read off the page, so a
  4xx with no message cannot pass it.
- "sign-in with an empty password is refused (no session)": the password is
  posted empty with the address present.

The row declares exactly those two check names, and the repo's own grader
(tools/edge-signed-in-exercise/lib/local-policy.mjs `verifiedCapabilities`)
credits the row only when BOTH of them pass. The pin asserts that a
one-leg list is not credited and that a red leg is not credited, so the
row cannot be credited by a partial list.

THE ORACLE-MATCHED HALF IS COMMITTED TOO, AND IT GRADES EACH LEG
SEPARATELY. tests/card/auth/signin-blank-field-refusal-endpoint.test.ts
boots this port's own write path and posts the sign-in form twice, once
with the address blank and once with the password blank, and compares each
answer with Ruby's own recorded answer in
reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json
(the `signin-blank-email` and `signin-blank-password` steps): 422, no
session cookie, and the alert region byte for byte.

## What this receipt does NOT claim

- The wrong-password leg (row S2's "sign-in refused on a wrong password
  (422, no session, error shown)") is declared on S2 verbatim and is not
  claimed here.
- The default production posture answers the wrong-password class with one
  uniform string instead of Ruby's per-class messages
  (docs/SECURITY.md divergence 4). That is a deliberate, documented
  divergence, and this row measures nothing about it.
- The blank-field message is the unprefixed one, because Ruby's bare
  `:abort` class renders no attribute key.
- The whole-family exercise at this round's tip is run once, and its
  committed record (docs/runs/edge-signed-in-exercise-round7-measured-2026-10-24.json)
  names this row among the rows it closes. This receipt does not restate
  that run's numbers; the round's own receipt does.
