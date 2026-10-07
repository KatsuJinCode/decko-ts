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
const ADJUDICATE_STALE = process.argv.includes("--adjudicate-stale");
const ADJUDICATE_APPLY = process.argv.includes("--apply");
const STALE_MINUTES = Math.max(
  1,
  Number(process.argv[process.argv.indexOf("--stale-minutes") + 1]) || 120,
);

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

// ---------------------------------------------------------------------------
// Stale-running-job adjudication (2026-10-04, queue-repair lane).
//
// THE WEDGE THIS REPAIRS. claimNextJob() below claims by renaming
// pending/<id>.job.json -> running/<id>.job.json. If the runner process dies
// while a job is in running/, nothing ever moves that file again: the drain
// path only ever enumerates PENDING. The stranded file then poisons
// submissions from the other direction — submit-test-job.mjs findDuplicate()
// scans RUNNING *and* PENDING, so any lane resubmitting an identical
// cwd+cmd+env is handed the dead job id, and waitForResult() then polls for a
// result file that can never be written, blocking that submitter for
// timeoutMin + 2 minutes before failing it. Measured on this machine
// 2026-10-04: five such strands, claimed 2026-10-02/03 by runner pids 39872,
// 55908, 42416 and 58764, every one of them confirmed dead by tasklist.
//
// THE REPAIR. This flag adjudicates a stranded job the way the runner itself
// would have written it: a FAILED result in runJob()'s exact shape, carrying a
// `why` line naming the dead-pid evidence, followed by removal of the
// running/ file — the same write-then-remove order main() uses. No process is
// ever signalled or killed; liveness is read, not acted on. The lock is taken
// for the write so a concurrent runner cannot be mid-claim.
//
// SAFETY. Default is a dry run that writes nothing. --apply is required to
// mutate. It refuses outright while a live runner holds the lock or the pid
// file, because a live runner's running/ entries are real work. Per job it
// requires BOTH "no result file" and "the log has been cold for
// --stale-minutes" (default 120) before it will touch anything. Results and
// logs are never deleted; pending/ is never touched.
// ---------------------------------------------------------------------------

function lockHolderPid() {
  try {
    return Number(JSON.parse(fs.readFileSync(LOCK_FILE, "utf8")).pid) || 0;
  } catch {
    return 0;
  }
}

function pidFilePid() {
  try {
    return Number(fs.readFileSync(PID_FILE, "utf8").trim()) || 0;
  } catch {
    return 0;
  }
}

// The log's own header lines are the runner's receipt of the attempt: which
// runner pid owned it and when it started. Absent lines are reported as
// absent, never guessed.
function readAttemptEvidence(logPath) {
  const ev = { attemptHeaderPresent: false, runnerPid: null, startedAt: null, logBytes: null, logMtime: null };
  let text = "";
  try {
    const st = fs.statSync(logPath);
    ev.logBytes = st.size;
    ev.logMtime = st.mtime.toISOString();
    text = fs.readFileSync(logPath, "utf8").slice(0, 4096);
  } catch {
    return ev;
  }
  const attempt = text.match(/^===== attempt (\S+) \(runner pid (\d+)\) =====/m);
  if (attempt) {
    ev.attemptHeaderPresent = true;
    ev.attemptStartedAt = attempt[1];
    ev.runnerPid = Number(attempt[2]);
  }
  const started = text.match(/^# started (\S+)/m);
  if (started) ev.startedAt = started[1];
  return ev;
}

function inspectRunningJobs() {
  if (!fs.existsSync(RUNNING)) return [];
  return fs
    .readdirSync(RUNNING)
    .filter((f) => f.endsWith(".job.json"))
    .map((f) => {
      const p = path.join(RUNNING, f);
      let job = null;
      try {
        job = JSON.parse(fs.readFileSync(p, "utf8"));
      } catch {
        job = null;
      }
      const id = job?.id ?? f.replace(/\.job\.json$/, "");
      const logPath = path.join(LOGS, `${id}.log`);
      const resultPath = path.join(RESULTS, `${id}.result.json`);
      const resultExists = fs.existsSync(resultPath);
      const ev = readAttemptEvidence(logPath);
      const logAgeMin = ev.logMtime
        ? (Date.now() - Date.parse(ev.logMtime)) / 60_000
        : null;
      const cwdExists = job?.cwd ? fs.existsSync(job.cwd) : null;
      // A stranded job is only ever touched when BOTH hold: no result was
      // ever written, and its log has been cold well past the threshold. A
      // result file present means the runner finished and only the running/
      // file leaked — still a strand, still reported, but for a different
      // reason and never re-run.
      const reason = resultExists
        ? "already-resolved: result already on disk; only the running/ file leaked"
        : logAgeMin === null
          ? `candidate: no log at ${logPath} (log never created) and no result`
          : logAgeMin < STALE_MINUTES
            ? `live: log wrote ${logAgeMin.toFixed(1)}min ago (< ${STALE_MINUTES}min threshold)`
            : `candidate: no result and log cold ${Math.round(logAgeMin)}min (> ${STALE_MINUTES}min threshold)`;
      return {
        id,
        jobPath: p,
        logPath,
        resultPath,
        job,
        resultExists,
        evidence: ev,
        logAgeMin,
        cwdExists,
        // ADJUDICATE   no result was ever written — write FAILED-STALE, then
        //              remove the running/ file (the runner's own order).
        // REAP-LEAKED  a result IS on disk, so the runner did finish; only the
        //              running/ file leaked. Remove it and write NOTHING — a
        //              real outcome is never overwritten by adjudication.
        // LEAVE        a live runner may own this one; hands off.
        verdict: resultExists
          ? "REAP-LEAKED"
          : logAgeMin === null || logAgeMin >= STALE_MINUTES
            ? "ADJUDICATE"
            : "LEAVE",
        reason,
      };
    })
    .sort((a, b) => (a.job?.submittedAt ?? "").localeCompare(b.job?.submittedAt ?? ""));
}

function whyLine(rec) {
  const ev = rec.evidence;
  const bits = [
    `job ${rec.id} (${rec.job?.name ?? "unnamed"}) stranded in running/`,
    rec.job?.cwd ? `cwd ${rec.job.cwd} (exists on disk: ${rec.cwdExists})` : null,
    ev.runnerPid
      ? `owning runner pid ${ev.runnerPid} (from its own log attempt header) — liveness never signalled, only read`
      : "owning runner pid unavailable: the log carries no attempt header",
    ev.logMtime
      ? `log last write ${ev.logMtime}, ${Math.round(rec.logAgeMin)}min cold`
      : `no log written at ${rec.logPath}`,
    rec.resultExists
      ? "result file already present on disk"
      : "no result file was ever written (the runner died between claim and resolve)",
  ].filter(Boolean);
  return bits.join("; ");
}

function writeStaleResult(rec) {
  const finishedAt = new Date().toISOString();
  const startedAt = rec.evidence.startedAt ?? rec.job?.submittedAt ?? null;
  const result = {
    id: rec.id,
    ok: false,
    exitCode: null,
    signal: null,
    timedOut: false,
    durationMs:
      startedAt && Number.isFinite(Date.parse(startedAt))
        ? Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt))
        : 0,
    startedAt,
    finishedAt,
    logPath: rec.logPath,
    error: `STALE-RUNNING-JOB: the runner that claimed this job is gone; it was never resolved`,
    staleAdjudication: {
      verdict: "FAILED-STALE",
      adjudicatedAt: finishedAt,
      adjudicatedBy: `run-test-queue-runner.mjs --adjudicate-stale --apply (pid ${process.pid})`,
      why: whyLine(rec),
      evidence: {
        submittedAt: rec.job?.submittedAt ?? null,
        submittedBy: rec.job?.submittedBy ?? null,
        attemptHeaderPresent: rec.evidence.attemptHeaderPresent,
        owningRunnerPid: rec.evidence.runnerPid,
        logPath: rec.logPath,
        logBytes: rec.evidence.logBytes,
        logMtime: rec.evidence.logMtime,
        logAgeMinutesAtAdjudication:
          rec.logAgeMin === null ? null : Math.round(rec.logAgeMin * 10) / 10,
        staleThresholdMinutes: STALE_MINUTES,
        jobCwd: rec.job?.cwd ?? null,
        jobCwdExistsAtAdjudication: rec.cwdExists,
        resultExistedAtAdjudication: rec.resultExists,
        queueLockPidAtAdjudication: lockHolderPid(),
        processSignalled: false,
      },
    },
  };
  // Runner's own order: result first, then the running/ file goes (main()).
  fs.writeFileSync(rec.resultPath, JSON.stringify(result, null, 2));
  fs.rmSync(rec.jobPath, { force: true });
  return result;
}

function adjudicateStale() {
  const lockPid = lockHolderPid();
  const pidFile = pidFilePid();
  if (lockPid && lockPid !== process.pid && pidAlive(lockPid)) {
    console.error(
      `[test-queue-runner] REFUSING --adjudicate-stale: queue lock held by LIVE runner pid ${lockPid}. ` +
        `Its running/ entries are real work. Nothing was written.`,
    );
    process.exitCode = 3;
    return;
  }
  if (pidFile && pidFile !== process.pid && pidAlive(pidFile)) {
    console.error(
      `[test-queue-runner] REFUSING --adjudicate-stale: runner.pid names LIVE pid ${pidFile}. Nothing was written.`,
    );
    process.exitCode = 3;
    return;
  }

  const recs = inspectRunningJobs();
  if (recs.length === 0) {
    console.error(`[test-queue-runner] --adjudicate-stale: running/ is empty, nothing to adjudicate`);
    return;
  }
  const toAdjudicate = recs.filter((r) => r.verdict === "ADJUDICATE");
  const toReap = recs.filter((r) => r.verdict === "REAP-LEAKED");
  const mark = (v) => (v === "ADJUDICATE" ? "STALE" : v === "REAP-LEAKED" ? "REAP " : "KEEP ");
  // The plan line carries the dead-pid evidence, not just the verdict: an
  // operator deciding whether to --apply must see WHO owned the job and how
  // cold its log is before the write, not after.
  for (const rec of recs) {
    const owner = rec.evidence.runnerPid ? `owner pid ${rec.evidence.runnerPid}` : "owner pid unknown";
    const age = rec.evidence.logMtime ? `log cold ${Math.round(rec.logAgeMin)}min` : "no log";
    console.error(
      `[test-queue-runner] ${mark(rec.verdict)} ${rec.id} — ${rec.reason} [${owner}, ${age}, ` +
        `cwd exists: ${rec.cwdExists}]`,
    );
  }
  if (!ADJUDICATE_APPLY) {
    console.error(
      `[test-queue-runner] --adjudicate-stale DRY RUN: ${toAdjudicate.length} stranded job(s) would be marked ` +
        `FAILED-STALE, ${toReap.length} leaked running/ file(s) would be reaped with no result written, of ` +
        `${recs.length} running/ entr(ies). Re-run with --apply to write.`,
    );
    return;
  }
  if (toAdjudicate.length === 0 && toReap.length === 0) {
    console.error(`[test-queue-runner] --adjudicate-stale: nothing eligible; nothing written`);
    return;
  }
  // Take the queue lock for the write window so a runner started concurrently
  // cannot be mid-claim against the same files. Re-check liveness first.
  if (!acquireLock()) {
    console.error(
      `[test-queue-runner] REFUSING --adjudicate-stale --apply: could not take the queue lock (a runner started ` +
        `concurrently). Nothing was written.`,
    );
    process.exitCode = 3;
    return;
  }
  try {
    for (const rec of toAdjudicate) {
      const result = writeStaleResult(rec);
      console.error(
        `[test-queue-runner] adjudicated ${rec.id}: FAILED-STALE -> ${rec.resultPath} (runner file ${rec.jobPath} removed)`,
      );
      console.error(`[test-queue-runner]   why: ${result.staleAdjudication.why}`);
    }
    for (const rec of toReap) {
      // A real result is already on disk; only the running/ file leaked.
      // Remove the file, write nothing, so the genuine outcome is preserved.
      fs.rmSync(rec.jobPath, { force: true });
      console.error(
        `[test-queue-runner] reaped ${rec.id}: leaked running/ file removed, existing result at ${rec.resultPath} left untouched`,
      );
    }
  } finally {
    try {
      if (JSON.parse(fs.readFileSync(LOCK_FILE, "utf8")).pid === process.pid) {
        fs.rmSync(LOCK_FILE, { force: true });
      }
    } catch {
      /* lock already gone */
    }
  }
  console.error(
    `[test-queue-runner] --adjudicate-stale --apply: ${toAdjudicate.length} stranded job(s) adjudicated FAILED-STALE, ` +
      `${toReap.length} leaked running/ file(s) reaped, ${recs.length - toAdjudicate.length - toReap.length} left alone; ` +
      `0 processes signalled, 0 logs deleted, 0 existing results overwritten.`,
  );
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
    // job id ran again -- the exact loss class the a work item grade suffered when
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
  // Adjudication is its own mode: it never drains. It runs before the lock is
  // taken by the drain path so the two code paths cannot interleave.
  if (ADJUDICATE_STALE) {
    for (const d of [QUEUE_DIR, PENDING, RUNNING, RESULTS, LOGS]) fs.mkdirSync(d, { recursive: true });
    adjudicateStale();
    return;
  }
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
