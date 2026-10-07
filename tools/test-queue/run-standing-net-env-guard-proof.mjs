// RED/GREEN proof harness for the standing-net env guard (auditor finding F16).
//
// What this is: a self-contained node script that proves, WITHOUT running the
// real net and WITHOUT touching the shared decko-test-queue, that
// run-standing-net.mjs:
//   T1  refuses a no-env submission with a named nonzero error (pre-submit guard)
//   T2  fails a completed no-env run at the ~27-skip signature even though the
//       job itself exited 0 (post-run guard)
//   T3  passes a pinned-env run at the pinned skip count, forwarding --env to
//       the queue job, and never prints the env values
//   T5  honors --allow-no-env end to end (submission + post-run bypass)
//   T7  fails loudly when a successful job's log has no parsable Tests summary
//
// How it stays harmless: every case gets its OWN scratch queue dir
// (DECKO_TEST_QUEUE_DIR) and a scratch bin dir prepended to PATH holding a
// stub `npx` that prints a fake vitest summary line (skip count configurable
// via env) and exits 0. The fake --cwd contains empty files at the manifest's
// listed paths so the manifest existence gate passes. Nothing real runs.
//
// Usage: node tools/test-queue/run-standing-net-env-guard-proof.mjs
// Exit 0 = all cases behaved as specified; nonzero = the failing case(s).

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scratchDir } from "../../tests/support/scratch-dir.mjs";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TOOL_DIR, "..", "..");
const RUNNER = path.join(TOOL_DIR, "run-standing-net.mjs");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tests", "standing-net.json"), "utf8"));
const GUARD = MANIFEST.envGuard ?? null;

const scratchRoot = scratchDir("standing-net-guard-proof-");
const FAKE_ENV_VALUE = "guard-proof-redacted-value";

function writeStubBin(dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform === "win32") {
    // %STUB_NET_SKIPS% interpolates at stub run time; ^| escapes the pipe for cmd.
    fs.writeFileSync(
      path.join(dir, "npx.cmd"),
      [
        "@echo off",
        "echo  Test Files  86 passed ^| 2 skipped (88)",
        "echo       Tests  825 passed ^| 3 expected fail ^| %STUB_NET_SKIPS% skipped (841)",
        "exit /b 0",
        "",
      ].join("\r\n"),
    );
  } else if (process.platform === "linux" || process.platform === "darwin") {
    fs.writeFileSync(
      path.join(dir, "npx"),
      [
        "#!/bin/sh",
        'echo "  Test Files  86 passed | 2 skipped (88)"',
        'echo "      Tests  825 passed | 3 expected fail | $STUB_NET_SKIPS skipped (841)"',
        "exit 0",
        "",
      ].join("\n"),
    );
    fs.chmodSync(path.join(dir, "npx"), 0o755);
  } else {
    throw new Error(`PLATFORM-OPS: guard proof has no stub npx for platform ${process.platform}`);
  }
}

// Fake worktree: empty files at every manifest path so the anti-drift gate
// passes; the net that "runs" is the stub npx, never vitest.
function makeFakeCwd(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of MANIFEST.files) {
    const p = path.join(dir, f);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "");
  }
}

function runCase(caseName, { extraArgs, envOverrides, stubSkips }) {
  const caseDir = path.join(scratchRoot, caseName);
  const queueDir = path.join(caseDir, "queue");
  const stubBin = path.join(caseDir, "stub-bin");
  const fakeCwd = path.join(caseDir, "fake-cwd");
  writeStubBin(stubBin);
  makeFakeCwd(fakeCwd);

  const env = {
    ...process.env,
    PATH: `${stubBin}${path.delimiter}${process.env.PATH}`,
    STUB_NET_SKIPS: String(stubSkips),
    DECKO_TEST_QUEUE_DIR: queueDir,
  };
  delete env.DECKO_TS_ORACLE_DB;
  delete env.ORACLE_RAW_DECK;
  Object.assign(env, envOverrides);

  const r = spawnSync(process.execPath, [RUNNER, "--cwd", fakeCwd, ...extraArgs], {
    env,
    encoding: "utf8",
    timeout: 180_000,
    windowsHide: true,
  });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const resultFiles = fs.existsSync(path.join(queueDir, "results"))
    ? fs.readdirSync(path.join(queueDir, "results"))
    : [];
  return { r, out, queueDir, resultFiles };
}

const cases = [];
let failures = 0;

function check(caseName, ok, detail) {
  cases.push({ caseName, ok, detail });
  if (!ok) failures++;
  console.error(`${ok ? "PASS" : "FAIL"} ${caseName}: ${detail}`);
}

// T1 — no env, no flag: named nonzero pre-submit refusal, nothing submitted.
{
  const { r, out, resultFiles } = runCase("T1-no-env-refusal", { extraArgs: [], stubSkips: 27 });
  check(
    "T1-no-env-refusal",
    r.status === 4 &&
      out.includes("STANDING-NET-ENV-GUARD") &&
      out.includes("DECKO_TS_ORACLE_DB") &&
      out.includes("ORACLE_RAW_DECK") &&
      out.includes("--env") &&
      resultFiles.length === 0,
    `exit=${r.status} (want 4), guard-error=${out.includes("STANDING-NET-ENV-GUARD")}, names-vars=${out.includes("DECKO_TS_ORACLE_DB") && out.includes("ORACLE_RAW_DECK")}, names-fix=${out.includes("--env")}, submitted=${resultFiles.length} files (want 0)`,
  );
}

// T2 — env forwarded via --env (pre-submit satisfied) but the completed run
// shows the 27-skip no-env signature on job exit 0: post-run guard fails it.
{
  const { r, out } = runCase("T2-forwarded-env-27skips-postrun", {
    extraArgs: [
      "--env", `DECKO_TS_ORACLE_DB=${FAKE_ENV_VALUE}`,
      "--env", `ORACLE_RAW_DECK=${FAKE_ENV_VALUE}`,
    ],
    stubSkips: 27,
  });
  check(
    "T2-forwarded-env-27skips-postrun",
    r.status === 5 &&
      out.includes("STANDING-NET-SKIP-GUARD") &&
      /measured[=: ]+27/i.test(out) &&
      /pinned/i.test(out),
    `exit=${r.status} (want 5), guard-error=${out.includes("STANDING-NET-SKIP-GUARD")}, measured-27=${/measured[=: ]+27/i.test(out)}, pinned-named=${/pinned/i.test(out)}`,
  );
}

// T4 — --allow-no-env with the 27-skip signature: per the guard contract the
// flag exempts BOTH gates, so exit 0 — but the INVALID-net warning is loud.
{
  const { r, out } = runCase("T4-allow-no-env-27skips", {
    extraArgs: ["--allow-no-env"],
    stubSkips: 27,
  });
  check(
    "T4-allow-no-env-27skips",
    r.status === 0 && /INVALID/i.test(out) && /measured[=: ]+27/i.test(out),
    `exit=${r.status} (want 0), invalid-warn=${/INVALID/i.test(out)}, measured-27=${/measured[=: ]+27/i.test(out)}`,
  );
}

// T3 — pinned env via --env, stub emits the pinned 13: exit 0, PASS verdict,
// and the fake env values never appear in any output (creds-never-printed).
{
  const { r, out } = runCase("T3-pinned-env-13skips", {
    extraArgs: [
      "--env", `DECKO_TS_ORACLE_DB=${FAKE_ENV_VALUE}`,
      "--env", `ORACLE_RAW_DECK=${FAKE_ENV_VALUE}`,
    ],
    stubSkips: 13,
    envOverrides: {},
  });
  const leaked = out.includes(FAKE_ENV_VALUE);
  check(
    "T3-pinned-env-13skips",
    r.status === 0 && /PASS|verdict[=: ]+pass/i.test(out) && /DECKO_TS_ORACLE_DB=present/.test(out) && !leaked,
    `exit=${r.status} (want 0), verdict=${/PASS|verdict[=: ]+pass/i.test(out)}, fingerprint-present=${/DECKO_TS_ORACLE_DB=present/.test(out)}, value-leaked=${leaked}`,
  );
}

// T5 — --allow-no-env with a pinned-count stub: flag bypasses the post-run
// guard; exit 0 but the invalid-net warning is loud.
{
  const { r, out } = runCase("T5-allow-no-env-13skips", {
    extraArgs: ["--allow-no-env"],
    stubSkips: 13,
  });
  check(
    "T5-allow-no-env-13skips",
    r.status === 0 && /allow-no-env|invalid/i.test(out),
    `exit=${r.status} (want 0), warn-present=${/allow-no-env|invalid/i.test(out)}`,
  );
}

// T7 — env present, stub emits a log with NO parsable Tests summary on exit 0:
// the guard must fail loudly instead of silently accepting an unverifiable run.
{
  const caseDir = path.join(scratchRoot, "T7-unparseable-summary");
  const queueDir = path.join(caseDir, "queue");
  const stubBin = path.join(caseDir, "stub-bin");
  const fakeCwd = path.join(caseDir, "fake-cwd");
  writeStubBin(stubBin);
  makeFakeCwd(fakeCwd);
  // Garbage stub: exits 0 with no summary line at all.
  if (process.platform === "win32") {
    fs.writeFileSync(path.join(stubBin, "npx.cmd"), "@echo off\recho no summary here\r\r");
  } else {
    fs.writeFileSync(path.join(stubBin, "npx"), "#!/bin/sh\necho no summary here\n\n");
    fs.chmodSync(path.join(stubBin, "npx"), 0o755);
  }
  const env = {
    ...process.env,
    PATH: `${stubBin}${path.delimiter}${process.env.PATH}`,
    DECKO_TEST_QUEUE_DIR: queueDir,
    DECKO_TS_ORACLE_DB: FAKE_ENV_VALUE,
    ORACLE_RAW_DECK: FAKE_ENV_VALUE,
  };
  const r = spawnSync(process.execPath, [RUNNER, "--cwd", fakeCwd], {
    env,
    encoding: "utf8",
    timeout: 180_000,
    windowsHide: true,
  });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  check(
    "T7-unparseable-summary",
    r.status === 5 && out.includes("STANDING-NET-SKIP-GUARD"),
    `exit=${r.status} (want 5), guard-error=${out.includes("STANDING-NET-SKIP-GUARD")}`,
  );
}

console.error(`\nscratch root: ${scratchRoot}`);
console.error(
  GUARD
    ? `manifest envGuard pin: expectedSkips=${GUARD.expectedSkips} requiredEnv=[${(GUARD.requiredEnv ?? []).join(", ")}]`
    : "manifest envGuard pin: MISSING (runner must fail loud on this)",
);
console.error(
  failures === 0
    ? "GUARD PROOF: GREEN — all cases behaved as specified."
    : `GUARD PROOF: RED — ${failures} case(s) deviated (expected while the guard is unimplemented).`,
);
process.exit(failures === 0 ? 0 : 1);
