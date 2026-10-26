# Receipt 1: the strict-parity flag claims

Claim attacked (issue draft, "Where we improved on the original" section):
"your exact behavior is still available behind a strict-parity flag, so a
one-to-one port exists" - listed for three improved behaviors: the uniform
sign-in answers, the File/Image revision restore, and the skin with a
missing parent.

## Verdict: BROKE (for two of the three behaviors; the sign-in leg held)

At the tip this receipt attacks (`c29e4c3f4c170542fd4a44b6eccc2dcf5dd111f6`),
a strict-parity flag exists for exactly one of the three behaviors. The
other two improved behaviors are unconditional code with no switch anywhere
in the source. An author checking the draft against the tree finds two of
the three promised flags missing.

## What was run

1. **The flag inventory.** Every environment variable the shipping source
   reads, from the attack worktree:

       rg -o "DECKO_[A-Z_]+" src --no-filename | sort -u

   The full list contains sign-in switches (`DECKO_SIGNIN_UNIFORM_FAILURE`,
   `DECKO_SIGNIN_THROTTLE`, `DECKO_SIGNIN_MAX_FAILURES`,
   `DECKO_SIGNIN_MAX_ADDRESS_FAILURES`, `DECKO_SIGNIN_LOCKOUT_SECONDS`,
   `DECKO_SESSION_REVOCATION`), the password switches
   (`DECKO_PASSWORD_HASH`, `DECKO_PASSWORD_PBKDF`), and infra switches
   (`DECKO_FIRST_RUN`, `DECKO_SETUP_TOKEN`, `DECKO_WRITE_PATH`,
   `DECKO_ORIGIN_CHECK`, `DECKO_TRUSTED_ORIGINS`, `DECKO_DELAYING`,
   `DECKO_COOKIE_SECURE`, `DECKO_SASSC`, `DECKO_ONE_TRIP*`,
   `DECKO_LIVE_*`, `DECKO_SMTP_*`, and others). **No switch resembles a
   "answer 500 like Ruby" or "crash on restore" or "refuse like Ruby"
   strict-parity restore for the revision-restore or the skin-parent
   behaviors.**

2. **The two behaviors are unconditional code.**
   - Skin with a missing parent: the refusal throws with no guard at
     `src/card/actions/card-action-engine.ts:2194-2197`
     (`applySkinCreateEvents`: `throw new CardActionError("user-error", ...)`
     whenever the named parent exists and is not a skin). The event-table
     registration at `card-mod-bootstrap.ts:1566-1572` carries
     `fn: () => undefined`; the real body is the unconditional throw.
   - File/Image revision restore: the restore arm at
     `src/card/actions/card-action-engine.ts:5684-5760` (the
     `revisionOf`/revival walk) reads no environment switch; the full
     `DECKO_*` inventory above is the closed set of switches in `src/`.

3. **The battery with the only parity switch off.** Run in this lane at the
   tip (drive exit 0, comparator exit 0):

       DECKO_SIGNIN_UNIFORM_FAILURE=off node tools/parity-side-effects/ts-drive.mjs \
         reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 \
         tmp/attack-20261026/flagoff-work > tmp/attack-20261026/ts-trace-flagoff.json
       DECKO_SIGNIN_UNIFORM_FAILURE=off node tools/parity-side-effects/compare.mjs \
         reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json \
         tmp/attack-20261026/ts-trace-flagoff.json tmp/attack-20261026/compare-flagoff.json

   Verdict: **80 pass / 4 deliberate / 3 MISMATCH over 87**, the deliberate
   four being `admin-create-skin-bad-parent`, `admin-deny-signup`,
   `get-home`, `restore-file-revision`. The two flag-less behaviors remain
   declared with every existing switch off. Full report committed at
   `artifacts/compare-flagoff.json`.

## The sign-in leg: held, and one receipt error found

With the flag off, the three sign-in steps
(`signin-unknown`, `signin-wrong-password`, `reset-unknown-email`) grade
MISMATCH **with empty diff bags**: the only broken pin per row is
"errors: pinned difference no longer differs" (and status/location for the
reset step), reported by `compare.mjs:341` because the scenario pins the
difference's existence. Empty diffs means the port's answers then agree with
Ruby's recorded oracle on every compared field: the flag restores Ruby's
exact recorded answers. The mechanism is in the source:
`src/card/auth/signin.ts:307,328,338` switch the failure message on
`security.uniformFailure`, and `src/card/auth/signin-security.ts:12-23`
documents `off` as restoring card-mod-account's behavior.

Two receipt-level errors around that flag, both checked in this lane:

- The battery's comment (`tests/tools/side-effects-scenario-battery.test.ts:258-259`)
  says "Run with DECKO_SIGNIN_UNIFORM_FAILURE=off, the same battery returns
  to 83 pass / 4 declared". The comparator actually returns 80 pass / 4
  declared / 3 MISMATCH: the three sign-in rows cannot grade PASS while
  their scenarios pin a difference whose existence the flag removes.
- The committed battery test cannot run green in the flag-off posture its
  own comment describes: its pinned declared list is the hard-coded
  7-name array, so the flag-off run fails the test file (exit 1, observed:
  "expected [ Array(4) ] to deeply equal [ Array(7) ]").

## What an author would take from this

The draft's flag sentence needs either two flags landed or the sentence
narrowed to the sign-in behavior before it is posted. The fix for the other
two behaviors is port work (a switch per behavior routing to the Ruby-shaped
answer: the 500 page for the restore path, the 500 for the bad-parent
create), not a wording fix.
