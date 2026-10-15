# Isolated mod behaviour probes

Every event probe is a separate harness scenario. Each receives a fresh deck,
files directory, cache and adapter process. Baselines are matched by write
action; setup creates cannot demonstrate an event declared on update, delete
or read. A failed baseline does not demonstrate an event. A matching write
without an observable effect remains `not-observed`. Partial and invalid grades
cannot generate probe completion claims.

Nested `fields` are recursively passed as actual subcards by both TypeScript
adapters and the Ruby oracle. Record-time N6 and N7 use the existing comparison
rules only; other forms remain untouched until grading.

## Capture execution

`run.mjs --scenario-workers 2` runs independent scenarios concurrently. Output
remains in fixture order. Errors stop further assignment and wait for every
active session to close before removing owned scratch directories. The default
remains one worker. `run-meta.json` records per-session staging, boot, operation
and close milliseconds, plus the worker count and actual interpreter identity.

The canonical oracle is Ruby 3.3.12. A full historical isolated capture recovered
from the earlier instrument workspace used Ruby 3.4.11; its original metadata is
retained. It is not canonical release evidence. Reports recovered alongside it
describe that historical instrument, not acceptance of this revision. A new
canonical capture and port grade are required before reporting current mod
counts.

## Local verification, 2026-10-15

- `node --test reference-harness/runner/test/*.test.mjs`: 128 passed, 0 failed,
  127.382 seconds before concurrent-worker addition. The serial fake-adapter
  captures in grade tests dominate this test suite; this is not oracle time.
- `node --test reference-harness/runner/test/mod-probes.test.mjs`: 8 passed,
  including sequential/concurrent isolation and output order, action-specific
  observation, invalid-grade rejection and record-time preservation.
- `node node_modules/typescript/bin/tsc --noEmit --pretty false`: passed.
- `node reference-harness/runner/manifest.mjs check
  reference-harness/fixtures/synthetic-v2-mod-probes`: intact.
- The historical oracle compared against itself passes the grading plumbing:
  535/535 persistence, 442/442 other-table steps. This is an instrument check,
  not TypeScript parity or canonical Ruby acceptance.
- Two selected scenarios launched through an absolute Ruby 3.3.12 bundle command
  took 109.580 seconds. Direct absolute Ruby invocation of the application's
  `script/decko runner` eliminated intermediary launchers: `probe-e1` measured
  staging 26 ms, boot 16114 ms, five operations 5974 ms, close 52 ms. Its raw
  answer matched the earlier pinned launch. `probe-e11` differs from historical
  3.4 errors in Ruby's quote syntax and object addresses, demonstrating why the
  historical interpreter cannot substitute for the canonical one.

A persistent Ruby process is not used to reset scenarios: stock shared-cache
instances capture their database identity at initialization, and request cache
renewal alone does not prove isolation after database rebinding. Concurrent
fresh processes preserve the original isolation boundary.
