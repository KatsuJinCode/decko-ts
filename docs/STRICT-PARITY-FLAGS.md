# Strict-parity flags

Where the port improved on the original Ruby engine's behaviour, the original's
exact behaviour stays reachable behind a switch, so a one-to-one port is always
available. Each flag is OFF by default: the improved behaviour is what every
host serves. Setting a flag ON reproduces the recorded Ruby behaviour one for
one, and the side-effects battery
(`tools/parity-side-effects/scenarios.json`, run by
`tests/tools/side-effects-scenario-battery.test.ts`) proves both modes against
the same committed Ruby recording.

## The surface

One setting per flag, read from the host's settings bag: the `DECKO_*`
environment variables on a Node host, the same-named bindings/`[vars]` on the
Cloudflare and Bunny edges (`WriteSurfaceFlags`,
`deploy/bunny-worker-src/bunny-edge-signin-session-surface.ts`). Values are
`on` or `off`; anything else fails the request loudly, naming the setting.
All four live in one module (`src/card/parity/strict-parity-flags.ts`), read
through `strictParityFlagsFromEnv` / `configureStrictParity`, the same
arrangement the sign-in policy uses.

| Setting (`DECKO_STRICT_PARITY_` prefix) | OFF (default, the improvement) | ON (the original, one for one) | Recorded evidence |
| --- | --- | --- | --- |
| `SIGNIN_DETAILED_ERRORS` | Every failed sign-in answers "Wrong email or password." and an unknown forgot-password address gets the sent-reset redirect, so neither the answer nor its timing says whether an address has an account (docs/SECURITY.md, approved divergence 4) | The sign-in and reset errors differentiate exactly as Ruby: "Unrecognized email.", "Wrong password", 422 "EMAIL: not recognized" | battery `signin-unknown`, `signin-wrong-password`, `reset-unknown-email` |
| `REVISION_RESTORE_500` | Restoring an old version of a File or Image card restores it (303) | Ruby's crash reproduces: the same 500 and the same "Wild Card!" server_error page, nothing stored | battery `admin-restore-file-revision` (and `admin-deny-signup`, its location-history knock-on) |
| `SKIN_CREATE_500` | A Bootswatch skin create whose `+parent` names a non-skin refuses with 422 "ABORT: not a valid theme ..." (the message the event was written to give) | Ruby's crash reproduces: the same 500 and the same server_error page, nothing stored | battery `admin-create-skin-bad-parent` |
| `SCRIPT_BUNDLE_CLOCK_NAMES` | A compiled asset bundle's file is named by its own bytes, so a redeploy that recompiles an unchanged bundle keeps the same URL | Ruby's stand-in action id `Time.now.to_i` names the file, so every re-store - and therefore every deploy - changes the URL | battery `get-home` (plus the two identical-bytes re-stores, `admin-update-current-skin-colors` and `admin-delete-script-card`) |

**Which mode matches the original:** ON is Ruby's behaviour, exactly; OFF is
the port's improvement. The battery's verdicts state this mechanically: in the
default mode the flag cases run as declared differences (78 pass + 9 declared
+ 0 mismatched); with all four switches on the six flag-case differences are
erased and their steps pass on agreement with the recording (86 pass +
1 declared + 0 mismatched). The one difference strict mode keeps is
`get-home`'s recording itself: the drive's fixture clock cannot reproduce the
wall-clock collisions Ruby's real clock caused, and the step's `strictTs` pin
holds the strict run's own file list.

## Relationship to the sign-in policy switches

`DECKO_SIGNIN_UNIFORM_FAILURE` (docs/SECURITY.md) keeps its own meaning beside
the strict surface: `off` already restores the per-field messages. The strict
switch wins while it is ON - it forces the uniform-failure policy off for the
sign-in ladder and the forgot-password trigger alike, whatever
`DECKO_SIGNIN_UNIFORM_FAILURE` says - so the recorded Ruby answers are
reachable through one consistent name without disturbing the existing
documented switch.

## Tests

- `tests/card/parity/strict-parity-flags.test.ts`: the settings bag, and the
  sign-in flag's both modes against the recorded answers.
- `tests/server/write-routes-strict-parity.test.ts`: the reset redirect, the
  two crash 500s (status, page bytes, nothing stored), each in both modes at
  the HTTP write surface.
- `tests/card/actions/asset-output-naming.test.ts`: the bundle name slot in
  both modes (content-derived across deploys vs the wall clock).
- `tests/tools/side-effects-scenario-battery.test.ts`: the whole battery in
  both modes against the committed recording.
