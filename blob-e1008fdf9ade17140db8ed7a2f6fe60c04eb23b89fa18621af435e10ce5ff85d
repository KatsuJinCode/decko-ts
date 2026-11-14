# Issue 16: staging dist currency and compiler failure diagnostics

The staging bootstrap now compares each imported JavaScript module (and the
SQLite entry) with its corresponding TypeScript source timestamp, in addition
to the existing source-tree/build-sentinel check. A newer sentinel cannot bless
an older restored module. Changes to tsconfig.json also require rebuilding;
unreadable inputs cannot establish currency. This uses filesystem timestamps,
so content replacement that deliberately preserves old timestamps remains
outside this check's guarantees.

An unsuccessful compiler process now throws immediately with its status,
signal, process error when present, stdout and stderr. It does not inventory
partially emitted modules or uncopied vendor assets. A successful compiler
with missing output instead reports a distinct incomplete-output failure.
The existing build lock, successful-build sentinel and runtime-asset copying
remain in place.

Validation on Linux, Node 22.23.3:

- `node_modules/.bin/vitest run tests/tools/side-effects-dist-lock.test.ts tests/tools/runtime-asset-distribution.test.ts`:
  12 passed, 0 failed across 2 files. Nine bootstrap tests cover locking,
  recovery, warm reuse, a stale module beneath a newer sentinel, transitive
  source/config changes, cold and warm compiler failures, and incomplete
  successful output. Three tests cover runtime-asset distribution.
- `npm run typecheck`: passed (exit 0).
- `node_modules/.bin/vitest run tests/card/auth/signin-endpoint.test.ts tests/card/auth/reset-flow-endpoint.test.ts tests/card/auth/first-run-setup-endpoint.test.ts tests/card/auth/signin-blank-field-refusal-endpoint.test.ts`:
  34 passed, 1 failed across 4 files. The cold bootstrap successfully ran the
  full `tsc -p tsconfig.json` build and booted the staging servers. The failure
  is the anonymous private-card request at signin-endpoint.test.ts:470,
  expecting HTTP 200 but receiving 403.
- Baseline control: temporary copies of the sign-in suite and the original
  HEAD bootstrap reproduced that same assertion, with 9 passed and 1 failed.
  The temporary files were removed. No engine or authentication code changed.
- `git diff --check`: passed.

Windows execution was unavailable. The bootstrap retains Node's native path
handling, process.execPath, and windowsHide; no Windows-specific behavior was
intentionally changed. The full repository test suite and parity grade were
not run for this test-infrastructure change.
