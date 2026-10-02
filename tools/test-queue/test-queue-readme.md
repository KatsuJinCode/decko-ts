# decko local test queue — one queue, one runner, no process sweeps

What this is: the decko project's shared test-runner queue. Any lane, any
integration merge, any verification run submits a job instead of starting
vitest directly. A single runner executes queued jobs one at a time (up to
`--workers N`) and returns each submitter its result. Approved by the
operator 2026-09-30. **Entirely local — runs on this machine only; nothing
here touches or resembles any cloud CI service.**

## Why it exists

Before this, test processes checked for each other with ad-hoc sweeps and
grades raced lane tests (two grade runs failed under that contention). The
queue removes the whole problem mechanically: every test goes through one
pipe, so nothing can run simultaneously unless the runner is told to allow
it.

- **Lanes never check for each other.** Submit and wait; the queue serializes.
- **Identical jobs run once.** Submitting the same cwd+command while an equal
  job is pending/running returns the existing job id; both submitters read the
  same result.
- **Grades get their exclusive window from the queue itself**: submit the
  grade as a job; nothing else in the queue can start until it finishes.
- **No daemon, no scheduler.** The runner starts on demand with the first
  submit and exits by itself once the queue is empty.

## Layout

- Queue home: a sibling directory of the repo root, `../decko-test-queue/`
  (outside any worktree so every checkout shares it; override with env
  `DECKO_TEST_QUEUE_DIR`).
  - `pending/` — job files waiting (FIFO by submit time)
  - `running/` — claimed jobs
  - `results/<id>.result.json` — outcome per job
  - `logs/<id>.log` — full stdout/stderr per job
  - `runner.lock` / `runner.pid` — liveness; a stale (dead-PID) lock is taken over
- Code (this directory, in the decko-ts repo so every worktree has it):
  - `submit-test-job.mjs` — submit (+wait) CLI
  - `run-test-queue-runner.mjs` — the runner

## Usage

```bash
node tools/test-queue/submit-test-job.mjs \
  --name "merge-gate" \
  --cwd C:/localProjects/decko-ts \
  --cmd "npx vitest run" \
  --timeout-min 20
```

### Setting env vars for a job: use --env, never shell syntax in --cmd

```bash
node tools/test-queue/submit-test-job.mjs \
  --name "env-gated probe" \
  --cwd C:/localProjects/decko-ts \
  --cmd "npx vitest run tests/some-probe.test.ts" \
  --env MY_PROBE=1 --env OTHER_SETTING=abc
```

`--env` is repeatable; pairs are persisted in the job file, counted in the
dedupe key (different env = different job), and injected into the job's child
process by the runner. Do NOT gate on env by putting `set X=1&&` (cmd) or
`X=1` (sh) prefixes inside `--cmd`: probes were lost to exactly
that — prefixes mangled or dropped between the submitting shell and the job
file — and on Windows a quoted payload inside `--cmd` (e.g. `node -e "..."`)
was silently corrupted by argv re-escaping before reaching cmd.exe. The
runner now spawns cmd.exe with verbatim argv, which fixes the quoting class;
the prefix-mangling class happens before the queue sees anything, which is
why `--env` exists.

Exit code = the job's exit code; last 4KB of output is printed; the full log
path and result JSON path are printed. `--no-wait` returns the job id only.
`--workers 2` (on the FIRST submitter while no runner is alive) lets the
runner execute two jobs at once; the default is one at a time.

## Rules

1. Nothing on this machine outside the queue starts a test suite against a
   shared resource (corpus sqlite, staging, benchmark corpora). Lane-internal
   quick gates that touch only their own worktree may still run inline.
2. Job timeout default 20 minutes (the vitest orphan-rule deadline); the
   runner kills the job's whole process tree on timeout — the tree-kill is
   owned by this runner, which the submitting session started.
3. The runner is one-at-a-time by default. Raising concurrency is a
   deliberate choice, never an accident.
