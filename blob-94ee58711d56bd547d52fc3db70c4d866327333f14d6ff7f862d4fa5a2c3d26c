# tools/oracle

Instruments that photograph the Ruby decko oracle: capture scripts
(boot the Ruby app, seed or read cards, record exact rendered bytes),
probes (one-shot behavior checks against the oracle app), and the
verifier that grades engine output against those photographs
(`verify-dual-lane.test.ts`).

## What these scripts need to run

The Ruby side runs against the **oracle app**, a gitignored, disposable
decko application that is NOT part of this repository, plus untracked
machine-local assets (the userspace MariaDB install, the client lib,
the server config). Setup and layout are documented in
`docs/parity-method.md`.

Consequences for a reader without that setup:

- every Ruby probe/capture script starts with
  `require "./config/environment"` (run from the oracle app directory)
  and fails with a `LoadError` when the app is absent;
- `boot-mysql-server.sh` checks for its untracked assets first and
  exits with a `oracle harness asset not present:` message naming the
  missing path;
- the corpus-dependent instrument drivers
  (`re-photograph-entries.mjs`) expect the photographed corpus under
  `tmp/raw-ground-truth/` (gitignored, produced by the capture
  pipeline) and refuse on a provenance mismatch.

Nothing under this directory is on the engine's import path; the
TypeScript verifier is consumed by the dual-lane runner
(`tools/dual-lane-verifier-fast.mjs`), which stages a sha-verified copy
before running it.
