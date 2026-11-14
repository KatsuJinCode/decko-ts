// stale-running-job-adjudication.test.mjs -- coverage for the runner's
// --adjudicate-stale path, the repair for the wedged shared queue.
//
// THE DEFECT UNDER TEST. run-test-queue-runner.mjs claims a job by renaming
// pending/<id>.job.json -> running/<id>.job.json, then drains only from
// PENDING. A runner that dies mid-job therefore strands that file forever.
// submit-test-job.mjs findDuplicate() scans RUNNING as well as PENDING, so the
// strand poisons the next identical submission: the submitter is handed the
// dead job id and waitForResult() blocks for timeoutMin + 2 minutes for a
// result that can never be written.
//
// WHAT IS ASSERTED HERE (each case gets its own scratch DECKO_TEST_QUEUE_DIR,
// so the real shared queue is never touched and no vitest run happens):
//
//   dry run            writes nothing; names the candidates; exit 0
//   apply              writes a FAILED result in runJob()'s exact shape,
//                      removes the running/ file, and never touches the log;
//                      the `why` line names the dead runner pid
//   live log           a job whose log is inside the threshold is LEFT alone
//                      even under --apply
//   already resolved   a result already on disk: the running/ file is removed
//                      but the existing result is NOT overwritten
//   live lock          REFUSES (exit 3) while runner.lock names a live pid,
//                      writing nothing -- a live runner's running/ entries are
//                      real work
//   no signal          every written result records processSignalled: false
//   empty running/     nothing to do, nothing written
//   drain unaffected   the flag did not break the normal path: a pending job
//                      still runs, is claimed out of pending, and gets a
//                      real (non-stale) result
//
// Usage: npx vitest run --no-file-parallelism tools/test-queue/stale-running-job-adjudication.test.mjs

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scratchDir } from "../../tests/support/scratch-dir.mjs";

const RUNNER = fileURLToPath(new URL("./run-test-queue-runner.mjs", import.meta.url));

/** A scratch queue with one stranded job and its log, aged by `ageMin`. */
function makeScene(name, { ageMin = 600, attemptHeader = true, ownerPid = 39872 } = {}) {
  const root = scratchDir(`tq-stale-${name}-`);
  const queueDir = path.join(root, "queue");
  for (const d of ["pending", "running", "results", "logs"]) {
    mkdirSync(path.join(queueDir, d), { recursive: true });
  }
  const id = `job-1790938749385-${name}`;
  const job = {
    id,
    key: "722bdc6cd5bc9433",
    name: `stranded-${name}`,
    cwd: path.join(root, "worktree-that-is-gone"),
    cmd: "node tools/test-queue/run-standing-net.mjs --receipt standing-net-receipt.json",
    env: {},
    timeoutMin: 6,
    submittedAt: "2026-10-02T10:59:09.385Z",
    submittedBy: "pid13816",
  };
  writeFileSync(path.join(queueDir, "running", `${id}.job.json`), JSON.stringify(job, null, 2));
  const startedAt = new Date(Date.now() - ageMin * 60_000).toISOString();
  const header = attemptHeader
    ? `===== attempt ${startedAt} (runner pid ${ownerPid}) =====\n`
    : "";
  const logPath = path.join(queueDir, "logs", `${id}.log`);
  writeFileSync(
    logPath,
    `${header}$ ${job.cmd}\n# cwd ${job.cwd}\n# started ${startedAt}\n\nPROBE boot: ids=47235\n`,
  );
  // Age the log: the runner's own staleness signal is "the log stopped".
  const old = new Date(Date.now() - ageMin * 60_000);
  utimesSync(logPath, old, old);
  return { root, queueDir, id, job, logPath };
}

function runRunner(queueDir, args, extraEnv = {}) {
  const r = spawnSync(process.execPath, [RUNNER, ...args], {
    env: { ...process.env, DECKO_TEST_QUEUE_DIR: queueDir, ...extraEnv },
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
  return { status: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

describe("test-queue --adjudicate-stale", () => {
  it("dry run names the candidate and writes nothing", () => {
    const s = makeScene("dry");
    try {
      const { status, out } = runRunner(s.queueDir, ["--adjudicate-stale", "--stale-minutes", "120"]);
      expect(out).toContain("DRY RUN");
      expect(out).toContain(s.id);
      expect(out).toContain("39872"); // the dead owner pid is named
      expect(status).toBe(0);
      // Nothing on disk moved.
      expect(existsSync(path.join(s.queueDir, "running", `${s.id}.job.json`))).toBe(true);
      expect(existsSync(path.join(s.queueDir, "results", `${s.id}.result.json`))).toBe(false);
      expect(existsSync(s.logPath)).toBe(true);
    } finally {
      rmSync(s.root, { recursive: true, force: true });
    }
  });

  it("--apply writes a FAILED-STALE result in the runner's shape and removes the running file", () => {
    const s = makeScene("apply");
    try {
      const { status, out } = runRunner(s.queueDir, ["--adjudicate-stale", "--apply", "--stale-minutes", "120"]);
      expect(status).toBe(0);
      expect(out).toContain("FAILED-STALE");

      // Same two-step order main() uses: result written, then running/ removed.
      expect(existsSync(path.join(s.queueDir, "running", `${s.id}.job.json`))).toBe(false);
      const resultPath = path.join(s.queueDir, "results", `${s.id}.result.json`);
      expect(existsSync(resultPath)).toBe(true);
      const r = readJson(resultPath);

      // Exactly the keys runJob() resolves to, so existing consumers
      // (submit-test-job.mjs's result reader) need no special case.
      for (const k of ["id", "ok", "exitCode", "signal", "timedOut", "durationMs", "startedAt", "finishedAt", "logPath"]) {
        expect(Object.keys(r)).toContain(k);
      }
      expect(r.id).toBe(s.id);
      expect(r.ok).toBe(false);
      expect(r.logPath).toBe(s.logPath);
      expect(r.error).toContain("STALE-RUNNING-JOB");
      expect(r.staleAdjudication.verdict).toBe("FAILED-STALE");

      // The why line names the dead pid evidence the operator has to act on.
      expect(r.staleAdjudication.why).toContain("39872");
      expect(r.staleAdjudication.why).toContain("running/");
      expect(r.staleAdjudication.evidence.owningRunnerPid).toBe(39872);
      expect(r.staleAdjudication.evidence.attemptHeaderPresent).toBe(true);
      expect(r.staleAdjudication.evidence.jobCwdExistsAtAdjudication).toBe(false);
      expect(r.staleAdjudication.evidence.processSignalled).toBe(false);
      // The log is the run's only real evidence: never deleted.
      expect(existsSync(s.logPath)).toBe(true);
      expect(readFileSync(s.logPath, "utf8")).toContain("PROBE boot: ids=47235");
    } finally {
      rmSync(s.root, { recursive: true, force: true });
    }
  });

  it("LEAVES a job whose log is still inside the staleness threshold", () => {
    const s = makeScene("live", { ageMin: 1 });
    try {
      const { out } = runRunner(s.queueDir, ["--adjudicate-stale", "--apply", "--stale-minutes", "120"]);
      expect(out).toContain("KEEP ");
      expect(out).toContain("live: log wrote");
      expect(existsSync(path.join(s.queueDir, "running", `${s.id}.job.json`))).toBe(true);
      expect(existsSync(path.join(s.queueDir, "results", `${s.id}.result.json`))).toBe(false);
    } finally {
      rmSync(s.root, { recursive: true, force: true });
    }
  });

  it("reports a missing log as a candidate rather than skipping the job", () => {
    const s = makeScene("nolog");
    try {
      rmSync(s.logPath, { force: true });
      const { out } = runRunner(s.queueDir, ["--adjudicate-stale", "--stale-minutes", "120"]);
      expect(out).toContain("STALE ");
      expect(out).toContain("log never created");
      expect(out).toContain("DRY RUN");
    } finally {
      rmSync(s.root, { recursive: true, force: true });
    }
  });

  it("already-resolved: removes the leaked running/ file, never overwrites the result", () => {
    const s = makeScene("resolved");
    try {
      const resultPath = path.join(s.queueDir, "results", `${s.id}.result.json`);
      const real = { id: s.id, ok: true, exitCode: 0, durationMs: 1234, logPath: s.logPath };
      writeFileSync(resultPath, JSON.stringify(real, null, 2));
      const { out } = runRunner(s.queueDir, ["--adjudicate-stale", "--apply", "--stale-minutes", "120"]);
      expect(out).toContain("already-resolved");
      expect(existsSync(path.join(s.queueDir, "running", `${s.id}.job.json`))).toBe(false);
      // The genuine result survives byte-for-byte: adjudication never
      // overwrites an outcome a runner really produced.
      expect(readJson(resultPath)).toEqual(real);
    } finally {
      rmSync(s.root, { recursive: true, force: true });
    }
  });

  it("REFUSES (exit 3) while the queue lock names a live runner, writing nothing", () => {
    const s = makeScene("locked");
    try {
      // A live runner's running/ entries are real work. The lock is the
      // liveness oracle the queue already uses (see acquireLock).
      writeFileSync(
        path.join(s.queueDir, "runner.lock"),
        JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      );
      const { status, out } = runRunner(s.queueDir, ["--adjudicate-stale", "--apply", "--stale-minutes", "120"]);
      expect(status).toBe(3);
      expect(out).toContain("REFUSING --adjudicate-stale");
      expect(out).toContain("Nothing was written");
      expect(existsSync(path.join(s.queueDir, "running", `${s.id}.job.json`))).toBe(true);
      expect(existsSync(path.join(s.queueDir, "results", `${s.id}.result.json`))).toBe(false);
      // The live runner's own lock is left exactly as it was.
      expect(readJson(path.join(s.queueDir, "runner.lock")).pid).toBe(process.pid);
    } finally {
      rmSync(s.root, { recursive: true, force: true });
    }
  });

  it("takes over a dead runner's lock (the stale-lock path the readme documents)", () => {
    const s = makeScene("deadlock");
    try {
      // A lock naming a pid that is not alive is taken over, not refused.
      // The pid only has to be dead: liveness is checked, never signalled.
      writeFileSync(
        path.join(s.queueDir, "runner.lock"),
        JSON.stringify({ pid: 72392, startedAt: "2026-10-02T03:59:00.000Z" }),
      );
      const { status, out } = runRunner(s.queueDir, ["--adjudicate-stale", "--apply", "--stale-minutes", "120"]);
      expect(status).toBe(0);
      expect(out).toContain("FAILED-STALE");
      // And the lock this run took for its write window is released again.
      expect(existsSync(path.join(s.queueDir, "runner.lock"))).toBe(false);
    } finally {
      rmSync(s.root, { recursive: true, force: true });
    }
  });

  it("an empty running/ is a no-op, not an error", () => {
    const root = scratchDir("tq-stale-empty-");
    try {
      const queueDir = path.join(root, "queue");
      for (const d of ["pending", "running", "results", "logs"]) {
        mkdirSync(path.join(queueDir, d), { recursive: true });
      }
      const { status, out } = runRunner(queueDir, ["--adjudicate-stale", "--apply"]);
      expect(status).toBe(0);
      expect(out).toContain("running/ is empty");
      expect(readdirSync(path.join(queueDir, "results"))).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("the normal drain path still runs a pending job (the flag did not break it)", () => {
    const root = scratchDir("tq-stale-drain-");
    try {
      const queueDir = path.join(root, "queue");
      for (const d of ["pending", "running", "results", "logs"]) {
        mkdirSync(path.join(queueDir, d), { recursive: true });
      }
      const id = "job-1-drain";
      writeFileSync(
        path.join(queueDir, "pending", `${id}.job.json`),
        JSON.stringify({
          id,
          key: "k",
          name: "drain",
          cwd: root,
          cmd: process.platform === "win32" ? "echo drained-ok" : "echo drained-ok",
          env: {},
          timeoutMin: 2,
          submittedAt: new Date().toISOString(),
          submittedBy: "pidtest",
        }),
      );
      const { status } = runRunner(queueDir, ["--workers", "1"]);
      expect(status).toBe(0);
      // Claimed out of pending by the normal rename path, resolved for real.
      expect(readdirSync(path.join(queueDir, "pending"))).toEqual([]);
      expect(readdirSync(path.join(queueDir, "running"))).toEqual([]);
      const r = readJson(path.join(queueDir, "results", `${id}.result.json`));
      expect(r.ok).toBe(true);
      expect(r.staleAdjudication).toBeUndefined();
      expect(readFileSync(path.join(queueDir, "logs", `${id}.log`), "utf8")).toContain("drained-ok");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
