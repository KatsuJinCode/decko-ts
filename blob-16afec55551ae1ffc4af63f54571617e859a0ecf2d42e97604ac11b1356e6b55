// standing-net-not-redistributed.test.mjs -- the standing-net runner treats a
// listed member that is not redistributed with this repository as NOT RUN.
//
// WHAT IS ASSERTED (each case gets its own scratch queue directory and a stub
// `npx` on PATH, so no real vitest run happens and the shared queue is never
// touched):
//
//   partial net        absent members print `[not redistributed] NOT RUN <file>`;
//                      the job receives only the present members; the run is
//                      reported as PARTIAL, never PASS; exit 0; the receipt
//                      records the NOT RUN members and the verdict
//   require-all        STANDING_NET_REQUIRE_ALL=1 refuses a partial net with
//                      exit 6 before anything is submitted
//   nothing present    every member absent: NOT RUN, nothing submitted, exit 0
//   full net           every member present: no NOT RUN line and the skip pin
//                      still decides PASS
//
// Usage: npx vitest run tools/test-queue/standing-net-not-redistributed.test.mjs

import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scratchDir } from "../../tests/support/scratch-dir.mjs";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TOOL_DIR, "..", "..");
const RUNNER = path.join(TOOL_DIR, "run-standing-net.mjs");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "tests", "standing-net.json"), "utf8"));
const REQUIRED_ENV = MANIFEST.envGuard.requiredEnv;
const PINNED_SKIPS = MANIFEST.envGuard.expectedSkips;
const FAKE_VALUE = "not-redistributed-test-value";
const TIMEOUT_MS = 180_000;

/** A stub `npx` that records its arguments and prints a vitest summary line. */
function writeStubBin(dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform === "win32") {
    fs.writeFileSync(
      path.join(dir, "npx.cmd"),
      [
        "@echo off",
        'echo %* > "%STUB_ARGS_FILE%"',
        "echo       Tests  825 passed ^| %STUB_NET_SKIPS% skipped (841)",
        "exit /b 0",
        "",
      ].join("\r\n"),
    );
  } else {
    fs.writeFileSync(
      path.join(dir, "npx"),
      ["#!/bin/sh", 'echo "$@" > "$STUB_ARGS_FILE"', 'echo "      Tests  825 passed | $STUB_NET_SKIPS skipped (841)"', "exit 0", ""].join("\n"),
    );
    fs.chmodSync(path.join(dir, "npx"), 0o755);
  }
}

/** A worktree holding empty files for every listed member except `absent`. */
function makeWorktree(dir, absent = []) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of MANIFEST.files) {
    if (absent.includes(f)) continue;
    const p = path.join(dir, f);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "");
  }
}

function runRunner(name, { absent = [], extraEnv = {}, skips = PINNED_SKIPS } = {}) {
  const root = scratchDir(`standing-net-nr-${name}-`);
  const queueDir = path.join(root, "queue");
  const stubBin = path.join(root, "stub-bin");
  const cwd = path.join(root, "worktree");
  const argsFile = path.join(root, "npx-args.txt");
  writeStubBin(stubBin);
  makeWorktree(cwd, absent);

  // The shell's own copies of the oracle env and the require-all switch are
  // removed, so each case sees only what it sets here (the runner's
  // presence check reads the shell env as well as --env).
  const env = { ...process.env };
  for (const v of [...REQUIRED_ENV, "STANDING_NET_REQUIRE_ALL"]) delete env[v];
  Object.assign(env, {
    PATH: `${stubBin}${path.delimiter}${process.env.PATH}`,
    STUB_NET_SKIPS: String(skips),
    STUB_ARGS_FILE: argsFile,
    DECKO_TEST_QUEUE_DIR: queueDir,
    ...extraEnv,
  });

  const forwarded = REQUIRED_ENV.flatMap((v) => ["--env", `${v}=${FAKE_VALUE}`]);
  const r = spawnSync(process.execPath, [RUNNER, "--cwd", cwd, ...forwarded], {
    env,
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    windowsHide: true,
  });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const resultsDir = path.join(queueDir, "results");
  const receipts = fs.existsSync(resultsDir)
    ? fs.readdirSync(resultsDir).filter((f) => f.endsWith(".standing-net-receipt.json"))
    : [];
  const receipt = receipts.length === 1 ? JSON.parse(fs.readFileSync(path.join(resultsDir, receipts[0]), "utf8")) : null;
  const submittedArgs = fs.existsSync(argsFile) ? fs.readFileSync(argsFile, "utf8") : null;
  return { status: r.status, out, receipt, submittedArgs, resultsDir };
}

describe("standing net: members not redistributed are NOT RUN", () => {
  const absent = [MANIFEST.files[0], MANIFEST.files[3]];
  const present = MANIFEST.files.filter((f) => !absent.includes(f));

  it(
    "partial net: NOT RUN lines, only present members submitted, PARTIAL and never PASS",
    () => {
      const { status, out, receipt, submittedArgs } = runRunner("partial", { absent });
      for (const f of absent) {
        expect(out).toContain(`[not redistributed] NOT RUN ${f}`);
      }
      expect(status).toBe(0);
      expect(out).toContain("PARTIAL");
      expect(out).not.toMatch(/run-standing-net: PASS/);
      expect(submittedArgs).not.toBeNull();
      for (const f of absent) expect(submittedArgs).not.toContain(f);
      for (const f of present) expect(submittedArgs).toContain(f);
      expect(receipt).not.toBeNull();
      expect(receipt.verdict).toBe("partial-not-redistributed");
      expect(receipt.listedMembers).toBe(MANIFEST.files.length);
      expect(receipt.ranMembers).toBe(present.length);
      expect(receipt.notRedistributedNotRun).toEqual(absent);
    },
    TIMEOUT_MS,
  );

  it(
    "STANDING_NET_REQUIRE_ALL=1 refuses a partial net before anything is submitted",
    () => {
      const { status, out, submittedArgs, resultsDir } = runRunner("require-all", {
        absent,
        extraEnv: { STANDING_NET_REQUIRE_ALL: "1" },
      });
      expect(status).toBe(6);
      for (const f of absent) expect(out).toContain(`[not redistributed] NOT RUN ${f}`);
      expect(out).toContain("refusing to submit a partial net");
      expect(submittedArgs).toBeNull();
      expect(fs.existsSync(resultsDir)).toBe(false);
    },
    TIMEOUT_MS,
  );

  it(
    "nothing present: NOT RUN, nothing submitted, exit 0",
    () => {
      const { status, out, submittedArgs } = runRunner("none-present", { absent: MANIFEST.files });
      expect(status).toBe(0);
      expect(out).toContain("NOT RUN — none of");
      expect(out).not.toMatch(/run-standing-net: PASS/);
      expect(submittedArgs).toBeNull();
    },
    TIMEOUT_MS,
  );

  it(
    "full net: no NOT RUN line, and the skip pin still decides PASS",
    () => {
      const { status, out, receipt, submittedArgs } = runRunner("full", { absent: [] });
      expect(out).not.toContain("[not redistributed]");
      expect(status).toBe(0);
      expect(out).toContain("PASS — measured");
      expect(submittedArgs).toContain(MANIFEST.files[0]);
      expect(receipt.verdict).toBe("pass");
      expect(receipt.notRedistributedNotRun).toEqual([]);
    },
    TIMEOUT_MS,
  );
});
