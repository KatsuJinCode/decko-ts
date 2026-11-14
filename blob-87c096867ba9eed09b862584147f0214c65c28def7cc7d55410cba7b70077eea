# Ruby oracle servers from the browser reference harness are left running

On 2026-10-21 seven `decko runner .../reference-harness/browser/engines/ruby-server.rb` process groups (three Ruby processes each) were still running. They were started on 2026-10-18 from `decko-ts-release-lead` and from the worktree `decko-ts-wt-act155-follow-views-20261019`, and their parent shells were long gone. Together they held about 4 GB of private memory while the machine was at its memory commit limit (new processes were failing to start), so they were ended.

Two `decko server -p 46190` / `-p 46191` groups from 2026-10-19 were kept running, in case current runs use them as long-lived oracles. Please confirm whether they are still needed.

This breaks the Zero Unmanaged Scratch rule in `C:\localProjects\AGENTS.md`: a server a harness starts for a run has to end with that run.

## Done when

- The browser reference harness stops the Ruby server it started when the run ends, in a `finally` block, including on failure or timeout.
- A long-lived oracle server, if one is intended, is started once, is recorded with its pid and port, and is reused rather than started again.
- A test fails if a harness run leaves a Ruby server process behind.

## Update 2026-10-21 (disk steward memory scan)

- The two `decko server -p 46190` / `-p 46191` groups (14 processes, 1.3 GB) were ended: their starting sessions had been gone since 2026-10-19 and nothing had claimed them.
- 31 library servers (`node server.mjs --port=87xx/88xx`, 1.3 GB) were also left running from the `decko-ts-mini-searchclasses`, `-searchclasses-control`, `-libperf` and `-tunnel-latency` copies on 2026-10-19, two days after their sessions ended; ended.
- `node tmp/conflict-slot-resolution-measure-2026-10-18.mjs` (from 2026-10-18) and `reference-harness/live-walk/prove/mock-walk-host.mjs` (from 2026-10-18) were still running; ended.
- From now on the diskSteward process reaper ends any tree of shells, node, python or ruby whose starting session is gone and that is over 2 hours old, and any test run over 1 hour (`C:\localProjects\diskSteward\data\process-reaper.log`). A server meant to outlive its session must be listed in `C:\localProjects\diskSteward\policy\protected-processes.json`; that is not a substitute for the fix below.
- The same applies to every server, test host or measuring script a decko run starts, not only the Ruby oracle: each ends with its run.
