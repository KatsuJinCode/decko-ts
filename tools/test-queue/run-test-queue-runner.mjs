// The decko local test queue runner.
//
// Drains <queue>/pending one job at a time (or up to --workers N) and exits
// when the queue has been empty for one poll cycle. No daemon, no scheduler:
// submitters start it on demand via submit-test-job.mjs. Entirely local.
//
// A single queue lock (queue/runner.lock, holding a live PID) guarantees at
// most one runner drains the queue; a second runner started while the lock is
// alive exits immediately.

import { spawn } from "node:child_process";
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
const LOCK_FILE = path.join(QUEUE_DIR, "runner.lock");
const PID_FILE = path.join(QUEUE_DIR, "runner.pid");
const POLL_MS = 2000;

const workers = Math.max(1, Number(process.argv[process.argv.indexOf("--workers") + 1] ?? 1) || 1);

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function acquireLock() {
  fs.mkdirSync(QUEUE_DIR, { recursive: true });
  try {
    const holder = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
    if (holder.pid !== process.pid && pidAlive(holder.pid)) return false;
  } catch {
    /* no lock or corrupt lock — take it */
  }
  fs.writeFileSync(
    LOCK_FILE,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
  );
  // Re-read to close the race window; last writer wins, so verify it is ours.
  try {
    const now = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));
    return now.pid === process.pid;
  } catch {
    return false;
  }
}

function claimNextJob() {
  const files = fs
    .readdirSync(PENDING)
    .filter((f) => f.endsWith(".job.json"))
    .map((f) => {
      const p = path.join(PENDING, f);
      return { f, p, m: fs.statSync(p).mtimeMs };
    })
    .sort((a, b) => a.m - b.m); // FIFO by submit time
  for (const { f, p } of files) {
    const runningPath = path.join(RUNNING, f);
    try {
      // Rename is the claim: only one worker can move a file out of pending.
      fs.renameSync(p, runningPath);
      return JSON.parse(fs.readFileSync(runningPath, "utf8"));
    } catch {
      /* another worker claimed it first */
    }
  }
  return null;
}

// Kills the job's whole process tree, not just the shell: on Windows the job
// is `cmd /c ...` and killing cmd alone would orphan the real test process.
// This PID (and its tree) is owned by this runner, which this session started.
function killTree(child) {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    } else if (process.platform === "linux" || process.platform === "darwin") {
      try {
        process.kill(-child.pid, "SIGKILL"); // detached => own process group
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }
      resolve();
    } else {
      throw new Error(
        `PLATFORM-OPS: test-queue runner has no process-tree kill for platform ${process.platform}`,
      );
    }
  });
}

function runJob(job) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const logPath = path.join(LOGS, `${job.id}.log`);
    // APPEND, never truncate (instrument-reliability lane, 2026-10-01). The
    // pre-fix "w" open destroyed a previous attempt's stdout whenever the same
    // job id ran again -- the exact loss class the pass-21 grade suffered when
    // its ad-hoc launcher redirected stdout with ">" and attempt 2's launch
    // erased attempt 1's phase lines (profile-full-checker-2026-10-01.md §6).
    // Identical pending/running jobs dedupe onto one id
    // (submit-test-job.mjs jobKey), so id reuse is a designed occurrence and
    // the log must accumulate. Each attempt opens with a separator block so
    // the attempts are readable apart.
    const log = fs.openSync(logPath, "a");
    fs.writeSync(
      log,
      `\n===== attempt ${startedAt} (runner pid ${process.pid}) =====\n` +
        `$ ${job.cmd}\n# cwd ${job.cwd}\n# started ${startedAt}\n`,
    );
    for (const k of Object.keys(job.env ?? {}).sort()) {
      fs.writeSync(log, `# env ${k}=${job.env[k]}\n`);
    }
    fs.writeSync(log, "\n");

    // Per-job env (--env KEY=VALUE, persisted in the job file) rides on top
    // of the runner's inherited environment. This is the env-setting channel
    // for lanes: it needs no shell syntax in job.cmd, so nothing can strip
    // or mangle it between submit and child (the p20/p22 incident class).
    const childEnv = { ...process.env, ...(job.env ?? {}) };

    const shellOpener =
      process.platform === "win32"
        ? { file: "cmd.exe", args: ["/d", "/s", "/c", job.cmd] }
        : process.platform === "linux" || process.platform === "darwin"
          ? { file: "/bin/sh", args: ["-c", job.cmd] }
          : null;
    if (!shellOpener) {
      const err = `PLATFORM-OPS: test-queue runner has no shell opener for platform ${process.platform}`;
      fs.writeSync(log, `\n${err}\n`);
      fs.closeSync(log);
      resolve({
        id: job.id,
        ok: false,
        exitCode: null,
        durationMs: 0,
        startedAt,
        finishedAt: new Date().toISOString(),
        logPath,
        error: err,
      });
      return;
    }

    const child = spawn(shellOpener.file, shellOpener.args, {
      cwd: job.cwd,
      env: childEnv,
      // win32: pass the command line verbatim. Node's default Windows argv
      // escaping wraps the whole cmd in quotes and rewrites every inner `"`
      // to `\"`; `cmd /d /s /c` then strips the outer pair and the child
      // parses the leftover `\"` tokens, silently corrupting quoted payloads
      // (proven 2026-09-30: `node -e "console.log(1)"` via this spawn path
      // produced zero output with exit 0 — the "env-gate-stripped" incidents).
      // Verbatim leaves job.cmd byte-exact, which is what cmd /c rest-of-line
      // semantics want. POSIX exec passes argv verbatim already, so the shell
      // opener above needed no change; this option is a no-op there.
      windowsVerbatimArguments: process.platform === "win32",
      windowsHide: true,
      stdio: [ "ignore", log, log ],
      detached: process.platform !== "win32",
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, job.timeoutMin * 60_000);

    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      const finishedAt = new Date().toISOString();
      const durationMs = Date.now() - Date.parse(startedAt);
      fs.writeSync(
        log,
        `\n# finished ${finishedAt} durationMs=${durationMs} code=${code} signal=${signal} timedOut=${timedOut}\n`,
      );
      fs.closeSync(log);
      resolve({
        id: job.id,
        ok: !timedOut && code === 0,
        exitCode: code,
        signal,
        timedOut,
        durationMs,
        startedAt,
        finishedAt,
        logPath,
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      fs.writeSync(log, `\n# spawn error: ${err.message}\n`);
      fs.closeSync(log);
      resolve({
        id: job.id,
        ok: false,
        exitCode: null,
        durationMs: Date.now() - Date.parse(startedAt),
        startedAt,
        finishedAt: new Date().toISOString(),
        logPath,
        error: err.message,
      });
    });
  });
}

async function main() {
  if (!acquireLock()) {
    console.error(`[test-queue-runner] another runner holds the lock — exiting`);
    return;
  }
  fs.writeFileSync(PID_FILE, String(process.pid));
  console.error(`[test-queue-runner] pid ${process.pid} draining ${QUEUE_DIR} (workers=${workers})`);

  let active = 0;
  await new Promise((allDone) => {
    const tick = setInterval(() => {
      while (active < workers) {
        const job = claimNextJob();
        if (!job) break;
        active++;
        console.error(`[test-queue-runner] running ${job.id} (${job.name})`);
        runJob(job).then((result) => {
          active--;
          fs.writeFileSync(path.join(RESULTS, `${job.id}.result.json`), JSON.stringify(result, null, 2));
          fs.rmSync(path.join(RUNNING, `${job.id}.job.json`), { force: true });
          console.error(
            `[test-queue-runner] done ${job.id}: ok=${result.ok} exit=${result.exitCode ?? "?"} ${Math.round(result.durationMs / 1000)}s`,
          );
        });
      }
      if (active === 0) {
        // One clean empty cycle then exit: the queue self-manages, no daemon.
        clearInterval(tick);
        allDone();
      }
    }, POLL_MS);
  });

  if (JSON.parse(fs.readFileSync(LOCK_FILE, "utf8")).pid === process.pid) {
    fs.rmSync(LOCK_FILE, { force: true });
    fs.rmSync(PID_FILE, { force: true });
  }
  console.error(`[test-queue-runner] queue empty — runner exiting`);
}

main();
