# Edge signed-in exercise, round seven: the measured run at the round-seven tip

The branch is `port/capability-round7-20261024`, created from
`port/capability-round6-20261024` at `71b9693d`. The source commit of the
run below is `0167dfe7`, with a clean source tree.

One run, on the LOCAL stack that the harness boots itself: the loopback
database and object storage, a local copy of the deck on the engine schema,
two throwaway local accounts (one holding the `administrator` role, one
signed in with no role), headless Chromium with a throwaway profile. Nothing
reached the live edge and nothing was written to the live D1: the run's
provenance carries `productionRuntime: false`. The source deck is the same
local snapshot the earlier runs used, SHA-256
`6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78`, 21676
cards copied into the local copy. The executed bundle is the deploy's own
artifact, SHA-256
`f00a1ca66b91871e8f0445e3a76abb8806bf5c9d36876bf1ecc6900003e3afe7`.

The committed run record for the run is
`docs/runs/edge-signed-in-exercise-round7-measured-2026-10-24.json`, written
by `tools/edge-signed-in-exercise/commit-run-record.mjs` from the harness's
own records. It carries the run's provenance, its results, the coverage the
grader computed, and the request ledger. Two request paths in that ledger
carried a live one-time reset token in a query string; those values are
replaced with the literal `token=REDACTED`, and the record's own `redaction`
field says so.

## The selection method

THE FAMILY'S 95 ROWS, AND THE 21 THAT WERE STILL OPEN. The roster is
`tools/edge-signed-in-exercise/capabilities.json`. A row is adjudicated
when its status is `covered` (the family's own verdict, with the evidence
named in its finding) or `disabled_upstream` (the row's own reason says the
capability is not there to have). Every other row is still open. After
round six the roster's own declared state was **73 covered, 19 partial, 1
not_covered, 1 disabled_upstream, 1 out_of_scope** of the 95 rows, so 21
rows were still open. This round took the next SIX of them in the roster's
own item order, which is the order the rows appear in the file:

    S3   session   partial       Sign in requires email and password (form validation)
    S4   session   partial       Sign-in link to sign up, and link to reset password
    S5   session   partial       Anonymous user opens a card edit modal, sees denial, then follows its sign-in link to the credential form
    S9   session   out_of_scope  First-run setup of the first admin account
    C1   create    partial       Create a RichText card through /new/RichText and land on it
    C2   create    partial       Create a Basic and a Date card through /new/<Type>

The next round takes the next six open rows from there. The rows still open
after this round are the fourteen the roster still declares `partial` (C6,
C8, E3, E20, E21, R1, P5, P6, F3, N2, N5, N6, N9, H1), the one `not_covered`
(W4, which round five closed as a measured skip and named), and the one
`out_of_scope` (S9, which this round named).

## What this round closed

FIVE ROWS CLOSED, ONE ROW NAMED. Each closed row carries the pinned Ruby's
own bytes for its contract, captured into `fixtures/captured/` by a rig
under `tests/card/mod-loader/`, a parity pin that holds the port's own bytes
beside them, the harness's own named instrument, and a per-row receipt under
`docs/runs/`.

| row | what it is | the pin |
|---|---|---|
| S3 | the sign-in form asks for an email and a password, and refuses either one left blank | tests/card/mod-loader/card-mod-signin-blank-field-refusal.test.ts, 16 checks |
| S4 | the signed-out sign-in page links to sign up and to reset the password | tests/card/mod-loader/card-mod-signin-page-links.test.ts, 17 checks |
| S5 | the anonymous denial, its sign-in link, and the credential form behind it | tests/card/mod-loader/card-mod-anonymous-edit-denial-signin.test.ts, 16 checks |
| C1 | the typed new-card route and the landing on the card it made | tests/card/mod-loader/card-mod-new-card-landing.test.ts, 15 checks |
| C2 | a Basic card and a Date card, created through their typed routes | tests/card/mod-loader/card-mod-new-card-types.test.ts, 15 checks |

S9 stays `out_of_scope` and is NAMED: the pinned Ruby's own bytes for the
first-run setup (the census in card-1.110.0 lib/card/auth/setup.rb and the
setup surface and events in card-mod-account-0.20.0 set/type/user.rb) are
captured in fixtures/captured/first-run-setup.json, the port carries the
same contract in its own bytes, and the reason the row cannot be closed by
a run of this family is measured rather than asserted: the deck this family
exercises is already set up, so Ruby's own gate closes the setup surface
there and no signed-in run can reach it.

## The measured run

```
node tools/edge-signed-in-exercise.mjs \
  --out .runtime/edge-signed-in/round7-final/report.md
```

**291 / 294 passed**, 3 failed, 0 skipped by write mode. The run's own
grader (`tools/edge-signed-in-exercise/lib/local-policy.mjs`
`verifiedCapabilities`) computed **77 covered, 15 partial, 1 not_covered,
1 disabled_upstream, 1 out_of_scope** of the 95 rows over this record, and
named the rows it drove.

Every check this round's six rows declare, and what the run recorded for it:

| row | check | result |
|---|---|---|
| S3 | sign-in with an empty email is refused (no session) | PASS |
| S3 | sign-in with an empty password is refused (no session) | PASS |
| S4 | the signed-out sign-in page links to sign up and to reset the password | PASS |
| S5 | S5 Anonymous user opens a card edit modal, sees denial, then follows its sign-in link to the card | PASS |
| C1 | create a RichText card via /new/RichText and land on it | PASS |
| C2 | create route shows signed-in chrome and a card form: /new/Basic | PASS |
| C2 | create route shows signed-in chrome and a card form: /new/Date | PASS |
| C2 | create a Basic card through /new/Basic (landed on it, and it is stored) | PASS |
| C2 | create a Date card through /new/Date (landed on it, and it is stored) | PASS |

S9 declares no checks, because an out_of_scope row declares none and the
grader returns such a row unchanged.

## The baseline holds

THE FAMILY'S RECORDED BASELINE IS 263 / 292, 29 failed, 0 skipped, at
source `698faa29` (docs/runs/edge-signed-in-exercise-full-run-2026-10-21-tranche5-signed-in-leg.md).
This round's run is 291 / 294, 3 failed, 0 skipped. The three failures are
all legs the baseline already recorded:

- the Changes feed does not list the run's own cards first ("7. rename,
  history, search, changes, sign out and back in / /*search lists the cards
  this run just created/edited first" in the baseline, the same leg here);
- the P5 `*type_plus_right` Set leg ("P5 *type plus right Set" in the
  baseline; the leg now carries its fuller per-leg name);
- the P6 update-rule leg ("P6 the Rule board: an administrator sets an
  update rule through the Rules tab" in the baseline; the leg now also
  grades the member's write that follows).

So no leg that was green in the baseline is red here: the baseline holds.
Twenty-six of the baseline's 29 failures are green in this run (the other
lanes' work since 2026-10-21), and the run carries two more checks than the
baseline did.

## The grader cross-check

```
node tools/edge-signed-in-exercise/grader-cross-check.mjs \
  tools/edge-signed-in-exercise/capabilities.json \
  docs/runs/edge-signed-in-exercise-round7-measured-2026-10-24.json
```

The cross-check runs the roster's own grader (the same function the harness
itself calls) over the COMMITTED run record, so the check is reproducible
from the repository alone. It reports:

```
grader over the committed record: 77 covered, 15 partial, 1 not_covered,
  1 disabled_upstream, 1 out_of_scope (of 95)
rows this round closed (checked against this record): S3, S4, S5, C1, C2
every row this round closed (5) is computed covered by the grader
rows this record's runs do not exercise: W4
the roster's own declared state: 78 covered, 14 partial, 1 not_covered,
  1 disabled_upstream, 1 out_of_scope (of 95)
```

THE ROSTER'S OWN DECLARED STATE AFTER THIS ROUND: **78 covered, 14
partial, 1 not_covered, 1 disabled_upstream, 1 out_of_scope** of the 95 rows.
Five rows moved from `partial` to `covered` (S3, S4, S5, C1, C2), and S9
stays `out_of_scope` with its reason named. W4 is the one remaining
`not_covered` row: no check module declares it, so no signed-in run can
credit it, and its finding carries the gap measured at the source level.

## What this round also repaired

THE STAGING-SERVER DIST BOOTSTRAP COULD NOT BUILD. The endpoint suites
boot `vm-staging-server.mjs` against `dist/`, which the bootstrap builds on
first use with `tsc -p tsconfig.json`. That tsconfig includes the test
files, so a type error in any of them made the build exit non-zero and
stopped EVERY endpoint suite before a single assertion ran. Nine type errors
did that, four in test files and five from two untyped ESM imports. They
are fixed (commit `34d2dd60`), the two ESM modules now carry sibling
declarations, and `npx tsc --noEmit -p tsconfig.json` exits 0.

THE C2 LEG'S EXPECTED TYPE WAS RESOLVED THE WRONG WAY, AND THE RUN NAMED
IT. The first whole-family run of this round graded the C2 Basic create
red: the leg expected type 3 and the card was stored with type 39120. Type
3 is the card this deck calls "RichText" (the card whose CODENAME is
"basic"), and 39120 is the card NAMED "basic". The deck's own mark
resolution answers the NAME first and the codename second, which is what
the recorded baseline's evidence has always shown (the /new/Basic create
stored type 39120 and the /new/Date create stored type 17). The leg now
resolves the expected type the deck's own order (commit `0167dfe7`), and the
run above is the one after that fix.

## The battery

The parity pins this round lands are run with `npx vitest run` over the
touched test files, and the harness's own predicate suites with `node
--test`:

- `npx vitest run` over the eleven touched test files (the six new pins, the
  sign-in endpoint suite, and the four files the build repair touched):
  Test Files 11 passed (11); Tests 165 passed (165) (this session).
- `node --test` over the four harness suites the branch touches
  (check-modules, signin-page-links, signin-credential-form,
  new-card-landing): tests 23, pass 23, fail 0 (this session).
- `node tools/edge-signed-in-exercise/grader-cross-check.mjs`: exit 0 (this
  session).
- `npx tsc --noEmit -p tsconfig.json`: exit 0 (this session).

Nothing in this round touched a live deck, a live edge or any deployment.
