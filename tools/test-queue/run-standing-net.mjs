// Run THE standing verification net as ONE machine test queue job.
//
// The canonical file list lives in tests/standing-net.json (checked in). This
// script is the only supported way to run the net: it reads the manifest,
// verifies every listed file exists in THIS worktree (a stale manifest is a
// loud failure, never a silently-shrinking net), and delegates to
// submit-test-job.mjs so the run goes through the same one shared queue,
// dedupe and result-recording path as every other test job.
//
// ENV GUARD (auditor F16, 2026-10-03): the queue runner is long-lived and
// spawns the net from ITS OWN environment, so oracle env exported in the
// submitting shell dies at the queue boundary; a no-env run silently becomes
// a skip-heavy invalid net that still exits 0 (observed in the wild at the
// fold-9 tip: 27 skipped vs the pinned 13, exit 0, three times in one day).
// The guard in this file:
//   1. PRE-SUBMIT — refuses to submit when the manifest's envGuard.requiredEnv
//      vars are absent from THIS shell, unless --allow-no-env is passed. The
//      refusal names the missing vars and the exact --env invocation shape
//      that fixes it (--env is the queue's persisted env channel: it reaches
//      the job AND enters the dedupe key, so pinned and no-env runs can no
//      longer dedupe onto each other).
//   2. POST-RUN — when the job exits 0, the net's skip count parsed from the
//      job log must equal the manifest's envGuard.expectedSkips, else this
//      script exits nonzero with a named error. ~27 skips on this net is the
//      known no-env signature. --allow-no-env bypasses with a loud warning.
//   3. FINGERPRINT — every run reports (stderr) and receipts
//      (<queue>/results/<id>.standing-net-receipt.json) which required vars
//      were present/absent — never their values. Forwarded --env values are
//      also redacted from any echoed queue output before printing.
//
// Usage (from any directory; the net that runs is the one in the worktree
// this script file lives in):
//   node tools/test-queue/run-standing-net.mjs [--cwd <worktree-root>] [--name <label>]
//        [--env KEY=VALUE ...] [--allow-no-env] [--help]
//
// --cwd defaults to the repo root containing this script, so a lane worktree
// runs its own tip's net. --name overrides the queue job label (default: the
// manifest's jobName); it never affects dedupe or the files run.
// --env KEY=VALUE (repeatable) forwards env through the queue job file so it
// reaches the net's process; values are never printed by this script.
// --allow-no-env: run even when requiredEnv vars are absent AND skip the
// post-run skip-pin check — WARNING: this produces a skip-heavy INVALID net
// (oracle-dependent tests skip silently); use only when you know you want it.
// Exit code = the queue job's exit code, or 4 (pre-submit env refusal) /
// 5 (post-run skip-pin violation) from the guards above.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TOOL_DIR, "..", "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "tests", "standing-net.json");

const USAGE = `Usage:
  node tools/test-queue/run-standing-net.mjs [--cwd <worktree-root>] [--name <label>]
       [--env KEY=VALUE ...] [--allow-no-env]

Options:
  --cwd <dir>       Worktree whose net runs (default: this script's repo root).
  --name <label>    Queue job label only; never affects dedupe or files run.
  --env KEY=VALUE   Repeatable. Forwards env through the queue job file so it
                    reaches the net's process (shell exports DO NOT reach it —
                    the queue runner spawns jobs from its own environment).
                    Values are never printed by this script.
  --allow-no-env    Run without the required oracle env AND skip the post-run
                    skip-pin check. WARNING: this produces a skip-heavy
                    INVALID net (oracle-dependent tests skip silently) that
                    can still exit 0. Use only when you know you want it.
  --help            Show this text.

Env pin: tests/standing-net.json envGuard.expectedSkips is the pinned skip
count for a valid net at this tip; a completed exit-0 run deviating from it
fails with STANDING-NET-SKIP-GUARD.`;

// Only the documented flags are accepted; anything else is a typo that must
// not silently become a different net. Unknown tokens are echoed WITHOUT any
// KEY=VALUE payload (only up to the first "=") so a mistyped flag can never
// leak a value into the transcript.
const argv = process.argv.slice(2);
let cwd = REPO_ROOT;
let nameOverride;
let allowNoEnv = false;
const envPairs = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--cwd") {
    cwd = path.resolve(argv[++i] ?? "");
  } else if (argv[i] === "--name") {
    nameOverride = argv[++i];
    if (!nameOverride) {
      console.error("run-standing-net: --name requires a value");
      process.exit(2);
    }
  } else if (argv[i] === "--env") {
    const kv = argv[++i];
    const eq = typeof kv === "string" ? kv.indexOf("=") : -1;
    if (eq <= 0) {
      // No echo of the token: it may contain a value half of KEY=VALUE.
      console.error("run-standing-net: --env expects KEY=VALUE");
      process.exit(2);
    }
    envPairs.push({ key: kv.slice(0, eq), value: kv.slice(eq + 1) });
  } else if (argv[i] === "--allow-no-env") {
    allowNoEnv = true;
  } else if (argv[i] === "--help" || argv[i] === "-h") {
    console.log(USAGE);
    process.exit(0);
  } else {
    const safeName = String(argv[i]).split("=")[0];
    console.error(
      `run-standing-net: unknown argument ${safeName} (only --cwd, --name, --env, --allow-no-env and --help are supported)`,
    );
    process.exit(2);
  }
}
if (!fs.existsSync(cwd)) {
  console.error(`run-standing-net: --cwd does not exist: ${cwd}`);
  process.exit(2);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
} catch (err) {
  console.error(`run-standing-net: cannot parse ${MANIFEST_PATH}: ${err.message}`);
  process.exit(2);
}
if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
  console.error(`run-standing-net: ${MANIFEST_PATH} has no non-empty "files" array`);
  process.exit(2);
}

// The env pin is part of the manifest contract: without it the guards below
// have no single source of truth to enforce, so fail loud instead of running
// unverified.
const guard = manifest.envGuard;
if (
  !guard ||
  !Array.isArray(guard.requiredEnv) ||
  guard.requiredEnv.length === 0 ||
  !Number.isFinite(guard.expectedSkips)
) {
  console.error(
    `run-standing-net: ${MANIFEST_PATH} has no usable envGuard pin (needs requiredEnv[] and expectedSkips) — add it before running the net; see the envGuard.what field's contract in any guarded lineage's manifest.`,
  );
  process.exit(2);
}

// Anti-drift gate: the net is the manifest, exactly. A file listed here that
// is missing from this worktree means the manifest is stale relative to this
// tip — fail and say which entries, instead of quietly running a shrunk net.
const missing = manifest.files.filter((f) => !fs.existsSync(path.join(cwd, f)));
if (missing.length > 0) {
  console.error(
    `run-standing-net: manifest is STALE for ${cwd} — ${missing.length} of ${manifest.files.length} files missing:`,
  );
  for (const f of missing) console.error(`  - ${f}`);
  console.error("Reconcile tests/standing-net.json at this tip before running the net.");
  process.exit(3);
}

// PRE-SUBMIT GUARD + FINGERPRINT. Presence only — never values. A var counts
// as present when it is in this shell's env OR forwarded via --env (the
// queue's persisted channel — exactly the fix shape the refusal below names).
const forwardedKeys = new Set(envPairs.map((p) => p.key));
const envSatisfied = (v) => Boolean(process.env[v]) || forwardedKeys.has(v);
const absentVars = guard.requiredEnv.filter((v) => !envSatisfied(v));
const fingerprint = guard.requiredEnv
  .map((v) => `${v}=${envSatisfied(v) ? "present" : "absent"}`)
  .join(" ");
console.error(
  `run-standing-net: env fingerprint ${fingerprint} allow-no-env=${allowNoEnv}`,
);

if (absentVars.length > 0) {
  if (!allowNoEnv) {
    console.error(
      `STANDING-NET-ENV-GUARD: refusing to submit the standing net — required oracle env absent from this shell: ${absentVars.join(", ")}`,
    );
    console.error(
      `Mechanism: the queue runner is long-lived and spawns the net from ITS OWN environment, so env exported in the submitting shell dies at the queue boundary; this run would silently become a skip-heavy invalid net (observed no-env signature: ${guard.observedNoEnvSignatureSkips ?? "elevated"} skips) that still exits 0.`,
    );
    console.error(
      `Fix — forward the values through the queue's persisted env channel (repeatable):`,
    );
    console.error(
      `  node tools/test-queue/run-standing-net.mjs ${absentVars.map((v) => `--env ${v}=<value>`).join(" ")}`,
    );
    console.error(
      `Or pass --allow-no-env to run anyway (produces a skip-heavy INVALID net, receipted as such).`,
    );
    process.exit(4);
  }
  console.error(
    `run-standing-net: WARNING --allow-no-env: running WITHOUT required oracle env (${absentVars.join(", ")}) — this produces a skip-heavy INVALID net.`,
  );
}

const cmd = `npx vitest run ${manifest.files.join(" ")} ${(manifest.vitestArgs ?? []).join(" ")}`.trim();
const submitArgs = [
  path.join("tools", "test-queue", "submit-test-job.mjs"),
  "--name",
  nameOverride ?? manifest.jobName ?? "standing-net",
  "--cwd",
  cwd,
  "--cmd",
  cmd,
  "--timeout-min",
  String(manifest.timeoutMin ?? 2),
];
for (const { key, value } of envPairs) {
  submitArgs.push("--env", `${key}=${value}`);
}

console.error(
  `run-standing-net: submitting ${manifest.files.length}-file standing net (${manifest.provenance?.reconciledAtCommit ?? "unversioned provenance"}) as queue job for ${cwd}`,
);
// stdout is piped (not inherited) so the RESULT_JSON line can be read for the
// post-run guard; it is re-emitted below, with any forwarded --env values
// redacted, so downstream consumers still see the submitter's full stdout.
const submitter = spawnSync(process.execPath, submitArgs, {
  stdio: ["inherit", "pipe", "inherit"],
  cwd: REPO_ROOT,
  windowsHide: true,
});
if (submitter.error) {
  console.error(`run-standing-net: failed to run submit-test-job.mjs: ${submitter.error.message}`);
  process.exit(1);
}

const envValues = envPairs.map((p) => p.value).filter(Boolean);
const redactValues = (text) =>
  envValues.reduce((t, v) => t.split(v).join("<redacted>"), text);

const submitterStdout = redactValues(String(submitter.stdout ?? ""));
process.stdout.write(submitterStdout);

const jobExit = submitter.status ?? 1;
const resultPathMatch = /^RESULT_JSON (.+)$/m.exec(submitterStdout);
if (!resultPathMatch) {
  if (jobExit !== 0) process.exit(jobExit);
  console.error(
    "run-standing-net: submit-test-job.mjs printed no RESULT_JSON line — cannot verify the net",
  );
  process.exit(1);
}
const resultJsonPath = resultPathMatch[1].trim();
let result;
try {
  result = JSON.parse(fs.readFileSync(resultJsonPath, "utf8"));
} catch (err) {
  console.error(
    `run-standing-net: cannot read queue result ${resultJsonPath}: ${err.message}`,
  );
  process.exit(1);
}

// POST-RUN GUARD. A successful (exit 0) net must show exactly the pinned skip
// count from the manifest; anything else — including the known no-env
// signature — is an invalid net and fails here with a named error.
function parseSkipsFromLog(logText) {
  const plain = logText.replace(/\x1b\[[0-9;]*m/g, ""); // strip ANSI SGR
  const summaryLines = [...plain.matchAll(/^[^\S\n]*Tests\s+(.+)$/gm)].map((m) => m[1]);
  if (summaryLines.length === 0) return null;
  const last = summaryLines[summaryLines.length - 1];
  const skips = /(\d+)\s+skipped/.exec(last);
  return skips ? Number(skips[1]) : 0; // vitest omits the segment at 0 skipped
}

let measuredSkips = null;
if (result.logPath && fs.existsSync(result.logPath)) {
  try {
    measuredSkips = parseSkipsFromLog(fs.readFileSync(result.logPath, "utf8"));
  } catch {
    measuredSkips = null;
  }
}

let verdict;
if (jobExit !== 0) verdict = "job-failed";
else if (allowNoEnv) verdict = "accepted-with-allow-no-env";
else if (measuredSkips === null) verdict = "unparseable-summary";
else if (measuredSkips === guard.expectedSkips) verdict = "pass";
else verdict = "skip-mismatch";

// Sidecar receipt next to the queue result: env presence (never values),
// pin, measurement, verdict. Written best-effort; a failure to write it is a
// loud warning, never a silent skip.
const receiptPath = path.join(
  path.dirname(resultJsonPath),
  `${result.id ?? "unknown-id"}.standing-net-receipt.json`,
);
try {
  fs.writeFileSync(
    receiptPath,
    JSON.stringify(
      {
        what: "standing-net env-guard receipt (F16): presence flags and verdict only; no env values",
        id: result.id ?? null,
        at: new Date().toISOString(),
        envFingerprint: guard.requiredEnv.map((v) => ({
          variable: v,
          present: envSatisfied(v),
          source: process.env[v] ? "shell" : forwardedKeys.has(v) ? "forwarded" : "absent",
        })),
        forwardedEnvKeys: envPairs.map((p) => p.key),
        allowNoEnv,
        jobExitCode: result.exitCode ?? null,
        measuredSkips,
        pinnedExpectedSkips: guard.expectedSkips,
        verdict,
        logPath: result.logPath ?? null,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error(
    `run-standing-net: WARNING could not write env-guard receipt ${receiptPath}: ${err.message}`,
  );
}

if (verdict === "job-failed") {
  console.error(
    `run-standing-net: standing-net JOB FAILED (exit ${jobExit}); the env-guard skip check does not apply to failed jobs. Log: ${result.logPath ?? "?"}`,
  );
  process.exit(jobExit);
}
if (verdict === "accepted-with-allow-no-env") {
  console.error(
    `run-standing-net: --allow-no-env run accepted${measuredSkips === null ? "" : ` (measured ${measuredSkips} skipped vs pinned ${guard.expectedSkips})`} — INVALID net by the env pin; receipt: ${receiptPath}`,
  );
  process.exit(0);
}
if (verdict === "pass") {
  console.error(
    `run-standing-net: PASS — measured ${measuredSkips} skipped == pinned ${guard.expectedSkips} (env fingerprint ${fingerprint}); receipt: ${receiptPath}`,
  );
  process.exit(0);
}
if (verdict === "unparseable-summary") {
  console.error(
    `STANDING-NET-SKIP-GUARD: job exited 0 but its log has no parsable vitest Tests summary — cannot verify the pinned skip count (${guard.expectedSkips}); treating the run as INVALID. Log: ${result.logPath ?? "?"}`,
  );
  process.exit(5);
}
// verdict === "skip-mismatch"
console.error(
  `STANDING-NET-SKIP-GUARD: standing-net run is INVALID: measured ${measuredSkips} skipped vs pinned ${guard.expectedSkips} skipped (manifest envGuard.expectedSkips). Job exited 0 anyway. Log: ${result.logPath ?? "?"}`,
);
if (measuredSkips === guard.observedNoEnvSignatureSkips) {
  console.error(
    `This matches the known NO-ENV signature (${guard.observedNoEnvSignatureSkips} skips): the net ran without ${guard.requiredEnv.join("/")} reaching the job and silently skipped the oracle-dependent tests.`,
  );
  console.error(
    `Fix — re-run forwarding the values through the queue's persisted env channel:`,
  );
  console.error(
    `  node tools/test-queue/run-standing-net.mjs ${guard.requiredEnv.map((v) => `--env ${v}=<value>`).join(" ")}`,
  );
} else {
  console.error(
    `Either the env did not reach the job, or a change legitimately altered the net's skip behavior — re-verify with one pinned-env run and update envGuard.expectedSkips (and its evidence line) in tests/standing-net.json in the same change.`,
  );
}
process.exit(5);
