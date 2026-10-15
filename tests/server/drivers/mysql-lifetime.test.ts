// A MySQL server does not outlive the process that started it, even when that
// process is force-killed without running its exit hooks. The helper process
// (mysql-lifetime-parent.ts) starts a server; the test kills only the helper
// (taskkill without /t on Windows, SIGKILL elsewhere) and waits for the
// server to be gone.

import { spawn } from "node:child_process";
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mysqld lifetime", () => {
  it("ends the server when the process that started it is force-killed", async () => {
    const parent = spawn(process.execPath, [join(here, "mysql-lifetime-parent.ts")], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    parent.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    const deadline = Date.now() + 120_000;
    while (!/READY (\d+)/.test(stdout)) {
      if (parent.exitCode !== null || Date.now() > deadline) throw new Error(`helper did not start a server: ${stdout}`);
      await sleep(200);
    }
    const serverPid = Number(/READY (\d+)/.exec(stdout)![1]);
    expect(alive(serverPid)).toBe(true);

    if (process.platform === "win32") {
      spawnSyncKill(parent.pid!);
    } else {
      parent.kill("SIGKILL");
    }
    const gone = Date.now() + 30_000;
    while (alive(serverPid) && Date.now() < gone) await sleep(200);
    expect(alive(serverPid)).toBe(false);
  }, 180_000);
});

import { spawnSync } from "node:child_process";
function spawnSyncKill(pid: number): void {
  spawnSync("taskkill", ["/pid", String(pid), "/f"], { windowsHide: true, stdio: "ignore" });
}
