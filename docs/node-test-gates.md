# Node and Vitest test gates

Seven browser harness test files imported Node's test API but were collected
by Vitest. They reported no Vitest suite; their real assertions were not a
passing Node gate. The earlier public-candidate failure report stays unchanged.

The default Vitest configuration explicitly excludes the browser Node files,
alongside the already documented Node runner/oracle suites. Full and harness
gates split their selected files by actual parsed import declarations and run
the Node files independently. A failed Vitest invocation does not prevent the
Node half from executing. Node's programmatic runner does not itself guarantee
a failing CLI exit; the wrapper requires a successful final summary, every
expected file, unchanged input bytes and no failure events. It retains summary,
per-file source hashes and full JSONL events, including assertion error details.
Comments, a string mentioning node:test and an unrelated .mjs extension cannot
select the Node runner; mixed framework imports fail closed. Rolldown1.2.9 is
pinned from the existing installed dependency. No provider install was performed.
First-class gates default to two Vitest workers, with an explicit CLI/environment
budget available; the Node half runs one file at a time.

Controls execute actual Node processes: a passing assertion exits0; an injected
failed assertion exits1 with the expected files/case and retained error. A further
source-changing negative control is included and awaits the current resource hold.
The initial actual Node sweep executed19files:237tests,236pass and1failure.
The failure was real Node-host admission without a configured mod asset provider.
A verified existing provider will be supplied for the bounded configured rerun;
the missing-provider result is preserved. This is not a browser journey or a
fresh-install/production acceptance claim.

The signup mail control now reads the host's staged database. Opening the
committed WAL fixture even with readOnly:true had created an empty-wal and shared
memory sidecar. The original base fixture bytes did not change. The existing
Node sidecar control passes on the repaired source checkout. No fixture or
expected answer is rewritten or excluded.

```sh
node tools/test-gates.mjs check
node tools/test-gates.mjs run harness --maxWorkers=2
node tools/test-gates.mjs run full --maxWorkers=2
node tools/run-node-tests.mjs --root . --report <new-owned-report.json>
node node_modules/vitest/vitest.mjs run tests/tools/node-test-runners.test.ts --maxWorkers=1
```

The real Node-host mail control requires DECKO_MOD_PUBLIC_DIR to name an actual
mod/ tree containing TinyMCE's silver theme. This prerequisite is checked loudly;
it is never synthesized, skipped, or replaced with a dummy asset.
