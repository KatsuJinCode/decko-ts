# pd-6: the browser capture that terminates on a25329a8 and bundle a498c160

- The row's own label: "a browser capture that terminates on a25329a8 /
  bundle a498c160"
- The instrument: `tools/edge-signed-in-exercise.mjs`, the local end-to-end
  exercise for the Bunny edge build signed in
- The command:

      node tools/edge-signed-in-exercise.mjs \
        --engine-bundle deploy/dist/bunny-edge-engine.bundle.js \
        --engine-bundle-sha256 a498c1606240007268e8201ad31886439500e6de6649355285d2d443efc84b1e \
        --engine-source a25329a805202bf4ee5879f084fd028c90058215 \
        --out <report>

- The capture of record: `docs/runs/workbatch-h-2026-10-25/pd-6/report.md`
- The capture summary:
  `fixtures/captured/promised-deliverable-workbatch-h-20261025/pd-6-edge-signed-in-a253.json`

## Verdict: closed. The capture terminates, on the exact source and the exact
## bundle bytes the row names.

## What the row asked for

The row's own blocker: "Run tools/edge-signed-in-exercise.mjs against
a25329a8's own rebuilt bundle and land the terminal capture receipt, closing
the launch-guard-only state recorded in
capture-start-a25329a8-20261019-r1.json."

The launch-guard record of 2026-10-19 says so itself: its scope line reads
"Read-only launch guard. Require all currently committed runtime/capture
input changes; non-runtime primary changes do not invent a waiting gate.
Mutable primary work is recorded, never copied or reset. **This is not test
or hosted acceptance.**" It was a gate, not a capture. This run is the
capture.

## The bundle, rebuilt and verified

The bundle was rebuilt from the pushed source the row names, in a worktree of
this repository's object store created at `a25329a8`:

    node tools/bundle-bunny-edge-engine.mjs
    sha256 a498c1606240007268e8201ad31886439500e6de6649355285d2d443efc84b1e
    matches a498c160: True

The capture's own provenance carries the same hash twice, the claimed one and
the executed one, and records the source as clean:

| | |
|---|---|
| source | `a25329a805202bf4ee5879f084fd028c90058215` |
| source files clean | true (working tree dirty: false) |
| bundle SHA-256 (claimed) | `a498c1606240007268e8201ad31886439500e6de6649355285d2d443efc84b1e` |
| bundle SHA-256 (executed) | `a498c1606240007268e8201ad31886439500e6de6649355285d2d443efc84b1e` |
| engine artifact | `deploy/dist/bunny-edge-engine.bundle.js`, 7,312,278 bytes |
| source deck SHA-256 | `6aebb6546a0620f3c61efad28cd01023e104d47ffd583272ce18036038f73b78` |

## The result

**242 of 242 checks passed**, 0 failed, 0 skipped by write mode, over 4,935
observed engine requests, with no request returning a 5xx, no signed-in page
over 3 s of server time, and the cleanup checks green (the owned local stack
closed, every journey-created card removed from the local copy).

## The exit code, and why it is 1

The run's process exit code is 1, and the run's own last line says why:

    capability coverage: 38 covered, 16 partial, 39 not covered, 1 out of scope (of 95)

    242 / 242 checks passed.

    Complete capability acceptance: incomplete or failed. Unrun capabilities
    are never credited.

So every check the exercise ran passed, and the run exits 1 because the
exercise's own capability acceptance is not complete: 39 of the 95
capabilities have no check in this exercise, and the exercise never credits
an unrun capability. That is the exercise's standing coverage, not a
failure of this run, and the capture of record states it.

## The caveats the capture itself carries

The capture's header states them, and they travel with the receipt:

- "Harness source differs from the engine artifact: engine source claim
  `a25329a8...`, exact artifact SHA256 `a498c160...`; source claim is
  caller-declared, artifact bytes are verified. No vendor-runtime
  acceptance."
- "Runtime: deployed bundle on local Node/SDK shim; deployed Bunny
  acceptance is false."
- "Providers: loopback database and object storage; capture does not inherit
  live provider credentials."
- "Deck source (local, never Bunny)".

So this is a local capture of the deployed bundle, not a hosted acceptance.

## What this lane did not do

It did not contact a hosted edge, did not deploy, did not touch the dot-com
domain, did not change any source, and did not re-record or overwrite any
capture of record.
