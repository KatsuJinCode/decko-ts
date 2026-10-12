// Submit a test job to the decko local test queue and (by default) wait for the result.
//
// Design: ONE shared queue. Lanes/tests never
// check for each other and never sweep for running processes — they submit a
// job, a single runner executes jobs one at a time, and identical jobs
// (same cwd + command) are deduped so the test runs once and every submitter
// gets the same result. Runner drains the queue and exits when empty; no
// daemon, no scheduler, entirely local.
//
// Usage:
//   node tools/test-queue/submit-test-job.mjs --name "merge-gate" \
//     --cwd REPO_ROOT/decko-ts --cmd "npx vitest run" [--timeout-min 20] [--no-wait] \
//     [--env KEY=VALUE ...]
//
// --env (repeatable) is the env-setting channel: it is persisted in the job
// file and injected into the job's child process by the runner, so gating a
// test on an env var never requires shell syntax (`set X=1&&`, `X=1 cmd`)
// inside --cmd — that syntax class is what shells and command-string parsers
// mangle or drop between submission and execution.
//
// Exit code = the job's exit code (when waiting). Result JSON is written to
// <queue>/results/<id>.result.json and the full output to <queue>/logs/<id>.log.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TOOL_DIR, "..", "..");
const QUEUE_DIR =
  process.env.DECKO_TEST_QUEUE_DIR || path.resolve(REPO_ROOT, "..", "decko-test-queue");
const PENDING = path.join(QUEUE_DIR, "pending");
const RUNNING = path.join(QUEUE_DIR, "running");
const RESULTS = path.join(QUEUE_DIR, "results");
const LOGS = path.join(QUEUE_DIR, "logs");
const RUNNER_PATH = path.join(TOOL_DIR, "run-test-queue-runner.mjs");
const RUNNER_PID_FILE = path.join(QUEUE_DIR, "runner.pid");

function parseArgs(argv) {
  const out = { wait: true, timeoutMin: 20, workers: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--name") out.name = argv[++i];
    else if (a === "--cwd") out.cwd = path.resolve(argv[++i]);
    else if (a === "--cmd") out.cmd = argv[++i];
    else if (a === "--timeout-min") out.timeoutMin = Number(argv[++i]);
    else if (a === "--workers") out.workers = Number(argv[++i]);
    else if (a === "--env") {
      const kv = argv[++i];
      const eq = typeof kv === "string" ? kv.indexOf("=") : -1;
      if (eq <= 0) {
        console.error(`submit-test-job: --env expects KEY=VALUE, got: ${kv}`);
        process.exit(2);
      }
      out.env = out.env ?? {};
      out.env[kv.slice(0, eq)] = kv.slice(eq + 1);
    }
    else if (a === "--no-wait") out.wait = false;
    else {
      console.error(`submit-test-job: unknown argument ${a}`);
      process.exit(2);
    }
  }
  if (!out.name || !out.cwd || !out.cmd) {
    console.error("submit-test-job: --name, --cwd and --cmd are required");
    process.exit(2);
  }
  if (!fs.existsSync(out.cwd)) {
    console.error(`submit-test-job: --cwd does not exist: ${out.cwd}`);
    process.exit(2);
  }
  return out;
}

function ensureDirs() {
  for (const d of [QUEUE_DIR, PENDING, RUNNING, RESULTS, LOGS]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function runnerAlive() {
  try {
    const pid = Number(fs.readFileSync(RUNNER_PID_FILE, "utf8").trim());
    return Number.isFinite(pid) && pid > 0 && pidAlive(pid) ? pid : 0;
  } catch {
    return 0;
  }
}

function startRunner(workers) {
  const child = spawn(
    process.execPath,
    [RUNNER_PATH, "--workers", String(workers)],
    { detached: true, stdio: "ignore", cwd: QUEUE_DIR, windowsHide: true },
  );
  child.unref();
  // The runner rewrites runner.pid with its own PID after acquiring the
  // queue lock; give it a moment so a rapid second submitter sees it.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (runnerAlive()) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
}

function jobKey(cwd, cmd, env) {
  // Jobs differing only in --env must NOT dedupe onto each other: different
  // env gates must produce different runs. Canonicalize sorted KEY=VALUE
  // lines so key order never changes the key.
  const envPart = Object.keys(env ?? {})
    .sort()
    .map((k) => `${k}=${env[k]}`)
    .join("\n");
  return createHash("sha256").update(`${cwd}|${cmd}|${envPart}`).digest("hex").slice(0, 16);
}

function readJobJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

// Returns an existing job id when an identical (cwd+cmd) job is pending or
// running, so the test runs once and both submitters share one result.
function findDuplicate(key) {
  for (const dir of [RUNNING, PENDING]) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".job.json")) continue;
      const job = readJobJson(path.join(dir, f));
      if (job && job.key === key) return job.id;
    }
  }
  return null;
}

function waitForResult(id, timeoutMin) {
  const resultPath = path.join(RESULTS, `${id}.result.json`);
  const deadline = Date.now() + (timeoutMin + 2) * 60_000;
  let lastLen = -1;
  while (Date.now() < deadline) {
    const r = readJobJson(resultPath);
    if (r) return r;
    try {
      const logPath = path.join(LOGS, `${id}.log`);
      const len = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
      if (len !== lastLen) {
        lastLen = len;
        console.error(`[test-queue] job ${id} running, log ${len} bytes...`);
      }
    } catch {
      /* log not created yet */
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  return { id, ok: false, timedOutWaiting: true, error: "gave up waiting for result" };
}

const args = parseArgs(process.argv.slice(2));
ensureDirs();

const key = jobKey(args.cwd, args.cmd, args.env);
const dup = findDuplicate(key);
const id = dup ?? `job-${Date.now()}-${createHash("sha1").update(`${args.name}${key}${Math.random()}`).digest("hex").slice(0, 8)}`;

if (dup) {
  console.error(`[test-queue] identical job already queued/running: ${dup} — sharing its result`);
} else {
  const job = {
    id,
    key,
    name: args.name,
    cwd: args.cwd,
    cmd: args.cmd,
    env: args.env ?? {},
    timeoutMin: args.timeoutMin,
    submittedAt: new Date().toISOString(),
    submittedBy: `pid${process.pid}`,
  };
  fs.writeFileSync(path.join(PENDING, `${id}.job.json`), JSON.stringify(job, null, 2));
  console.error(`[test-queue] queued ${id}: ${args.name}`);
}

if (!runnerAlive()) startRunner(args.workers);

if (!args.wait) {
  console.log(id);
  process.exit(0);
}

const result = waitForResult(id, args.timeoutMin);
const logPath = result.logPath ?? path.join(LOGS, `${id}.log`);
console.error(
  `[test-queue] result for ${id}: ok=${result.ok} exit=${result.exitCode ?? "?"} duration=${Math.round((result.durationMs ?? 0) / 1000)}s log=${logPath}`,
);
if (fs.existsSync(logPath)) {
  const tail = fs.readFileSync(logPath, "utf8").slice(-4000);
  console.log(tail);
}
console.log(`RESULT_JSON ${path.join(RESULTS, `${id}.result.json`)}`);
process.exit(result.exitCode ?? (result.ok ? 0 : 1));
