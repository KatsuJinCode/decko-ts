# Strict-parity flags, 2026-10-26

The operator's ruling: where the port improved on the original's behaviour,
the original's exact behaviour must still exist behind a flag, so a
one-to-one port is always available. This lane implemented all four switches
the brief listed (its header said three; the list carried four concrete cases,
each with recorded evidence, and all four are implemented), each with the
improved behaviour as default and the recorded Ruby behaviour one for one
when enabled.

## The flags (one surface, one naming scheme)

Module: `src/card/parity/strict-parity-flags.ts`. Every flag reads one
setting from the host settings bag (env on Node, bindings/`[vars]` on the
Cloudflare and Bunny edges), values `on` | `off`, default `off`, invalid
values fail loudly naming the setting:

| Setting | OFF (default = the improvement) | ON (the original, one for one) |
| --- | --- | --- |
| `DECKO_STRICT_PARITY_SIGNIN_DETAILED_ERRORS` | uniform sign-in and forgot-password answers (docs/SECURITY.md divergence 4) | Ruby's field-naming answers: "Unrecognized email.", "Wrong password", 422 "EMAIL: not recognized" |
| `DECKO_STRICT_PARITY_REVISION_RESTORE_500` | a File/Image revision restore restores (303) | Ruby's crash: 500, the "Wild Card!" server_error page, nothing stored |
| `DECKO_STRICT_PARITY_SKIN_CREATE_500` | bad-parent skin create refuses with 422 "ABORT: not a valid theme ..." | Ruby's crash: 500, the same server_error page, nothing stored |
| `DECKO_STRICT_PARITY_SCRIPT_BUNDLE_CLOCK_NAMES` | asset bundle files named by their own bytes (URLs stable across deploys) | Ruby's stand-in action id `Time.now.to_i` (a new URL on every re-store) |

Config documentation: `docs/STRICT-PARITY-FLAGS.md` (the table above, the
mode semantics, and the relationship to the existing
`DECKO_SIGNIN_UNIFORM_FAILURE` switch, which keeps its meaning; the strict
switch forces the policy's uniform failure off while ON). docs/SECURITY.md's
Configuration row points at it.

## What changed where

- `src/card/parity/strict-parity-flags.ts` (new): the settings bag,
  `strictParityFlagsFromEnv` / `configureStrictParity` / `strictParityFlags`,
  and `StrictParityCrashError` (the strict crash signal, deliberately not a
  `CardActionError` so the route renders it as the recorded 500 page).
- `src/card/auth/signin-security.ts`: `signinSecurityPolicy()` forces
  `uniformFailure: false` while the strict sign-in switch is ON. Both the
  sign-in ladder (`src/card/auth/signin.ts` default policy) and the
  forgot-password trigger (`src/server/write-routes.ts`
  handleResetPasswordTrigger) read the policy, so one wiring covers both.
- `src/card/actions/card-action-engine.ts`: the revert path
  (`revertActionsInner`) raises the strict crash before any write when a
  revert targets a File- or Image-typed card; the skin create
  (`applySkinCreateEvents`) raises it at the same validate-stage point where
  the 422 abort throws.
- `src/server/write-routes.ts`: the route catch renders
  `StrictParityCrashError` as status 500 with the recorded
  `SERVER_ERROR_HTML` page, and saves the known card's request URL into the
  visitor location history exactly as the CardActionError page arm does -
  that is what makes the recorded `admin-deny-signup` knock-on flip too
  (Ruby's error render runs `save_current_location`; the battery's deny step
  resolves its `*previous` redirect through it).
- `src/card/actions/style-asset-events.ts`: `updateAssetOutput` names the
  output file by `assetOutputNameSlot(bytes)` by default (the first 12 hex
  digits of the bundle's sha256 folded into a decimal integer, so the Ruby
  identifier grammar, the /files routes and every attachment parser keep
  their numeric slot); the strict switch restores
  `Math.floor(clock/1000)` exactly.
- `src/server/cloudflare-write-routes.ts` +
  `deploy/bunny-worker-src/bunny-edge-signin-session-surface.ts`: the four
  names ride `WriteSurfaceFlags` and `applySecuritySettings` /
  `bunnyEdgeWriteFlags`, so the edge hosts configure the same switches per
  request.
- `tools/parity-side-effects/compare.mjs`: `PARITY_STRICT=1` (the strict
  run's comparator mode) treats a deliberate pin marked `strictErases: true`
  as an ordinary step (PASS on agreement, MISMATCH naming its fields
  otherwise) and consults a `strictTs`/`strictRuby` re-pin for a difference
  that persists in both modes with mode-specific values. The default mode's
  verdict logic is byte-for-byte the old code path.
- `tools/parity-side-effects/scenarios.json`: get-home's `ts.files` pin now
  holds the default mode's content-addressed file set with the strict run's
  list under `strictTs`; the six flag-case pins carry `strictErases: true`
  and a "why" sentence naming their switch; two new deliberate blocks
  (`admin-update-current-skin-colors`, `admin-delete-script-card`) record the
  identical-bytes re-stores that content addressing files under a name the
  deck already holds (Ruby's clock name writes a fresh copy of the same
  bytes). The Ruby recording itself is untouched.

## The battery, both modes (measured this session)

Commands, run in this clone with the committed fixture
(`reference-harness/fixtures/write-battery-v1`) and the LibSass program from
the release-lead checkout (`PARITY_SASSC=...`, same commit's build):

```
DECKO_PASSWORD_HASH=legacy-sha1 node tools/parity-side-effects/ts-drive.mjs \
  reference-harness/fixtures/write-battery-v1/deck/deck.sqlite3 <work> > <ts.json>
node tools/parity-side-effects/compare.mjs \
  reference-harness/fixtures/write-battery-v1/expected/side-effects-ruby.json <ts.json> <report.json>
# strict run: the four DECKO_STRICT_PARITY_* switches = on, and PARITY_STRICT=1 on the compare
```

- DEFAULT mode: **78 pass / 9 deliberate / 0 mismatch (87 steps)**. The nine
  declared: admin-create-skin-bad-parent, admin-delete-script-card,
  admin-deny-signup, admin-update-current-skin-colors, get-home,
  reset-unknown-email, restore-file-revision, signin-unknown,
  signin-wrong-password.
- STRICT mode: **86 pass / 1 deliberate / 0 mismatch (87 steps)**. The six
  flag cases (signin-unknown, signin-wrong-password, reset-unknown-email,
  restore-file-revision, admin-deny-signup, admin-create-skin-bad-parent)
  each show ZERO diffs - the port reproduces the recorded Ruby answers,
  statuses, 500 pages, and the location-history knock-on exactly. get-home
  keeps its declared difference (the recording's own clock shape; its
  strict-run file list is byte-identical to the pin this lane replaced, so
  the strict pin was moved to `strictTs`, not rewritten).

Both runs are pinned in `tests/tools/side-effects-scenario-battery.test.ts`
(the second test drives the strict env and pins the erased set by name).

## Pinned tests per flag, both modes

- `tests/card/parity/strict-parity-flags.test.ts` (7): the settings bag
  (defaults, names, invalid values, the host bag override) and the sign-in
  flag's both modes through `authenticateAccount` against the recorded
  answers, plus the policy-override proof.
- `tests/server/write-routes-strict-parity.test.ts` (4): at the HTTP write
  surface - the reset redirect vs Ruby's 422, the sign-in answers, the
  restore 303 vs Ruby's 500 (Wild Card page bytes, no Location, nothing
  stored), the skin create 422 vs Ruby's 500, each in both modes.
- `tests/card/actions/asset-output-naming.test.ts` (3): the name slot
  content-determined across deploys (default) vs the wall clock (strict,
  `floor(epoch seconds)` verified against the engine clock).
- `tests/tools/side-effects-scenario-battery.test.ts` (2): the whole battery
  in both modes against the committed recording.

## Verification run here (this session)

- `npm run typecheck` - clean.
- The seven suites above: 54 tests passed (`npx vitest run` over the four
  new files plus style-asset-events-save-path, bootstrap-skin-create-events,
  signin-hardening, write-routes-history-revert).
- The battery suite: 2 tests passed, driving both engine runs end to end
  (default 13416 ms, strict 14443 ms).
- Bootstrap-skin-type-change-events also re-run green.

## Honest boundaries

- The brief's header said "three flags"; it listed four. All four are
  implemented; nothing was dropped.
- The brief's flag 4 premise ("the port names them by content hash") did not
  hold at the required base commit: `updateAssetOutput` named by the clock
  (the same rule as Ruby). The lane built the content-hash naming as the
  improved default and put the clock naming behind the strict switch, which
  is the flag's declared shape.
- The reset-unknown-email strict flip rides the existing uniform-failure
  policy (the flag forces it off); the port's event list on a sign-in
  failure remains empty where Ruby's holds the :signin chain - the battery's
  pins never graded that (only common events are order-graded), and the pins
  both modes prove are the recorded answers, statuses and locations.
- Content addressing writes fewer redundant FILES than Ruby when bytes
  repeat (recorded as the two new deliberate blocks); the strict switch
  reproduces Ruby's file behaviour one for one.
- `docs/SECURITY.md` gained one sentence pointing at the new page (the
  Configuration row); no other shared text changed.
- The one-shot pin-updater script was moved to `tmp/apply-strict-parity-pins.mjs`
  (the safety gate prefers archiving over deleting); it is not committed, and
  the clone's `tmp/` is scratch.

## Not done here

Nothing deploys (guard). culturesmith.com untouched. No git destructive
commands used. Branch `port/parity-flags-20261026` from the pushed tip
`c29e4c3f4c170542fd4a44b6eccc2dcf5dd111f6` of `deploy/full-candidate-20261102`
(ls-remote verified before cloning), pushed forward-only.
