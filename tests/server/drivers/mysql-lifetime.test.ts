// A MySQL server does not outlive the process that started it, even when that
// process is force-killed without running its exit hooks. The helper process
// (mysql-lifetime-parent.ts) starts a server; the test kills only the helper
// (taskkill without /t on Windows, SIGKILL elsewhere) and waits for the
// server to be gone.

import { spawn, spawnSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { connect } from "node:net";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createConnection } from "mysql2/promise";
import { startMysqlServer } from "./mysql-server.js";

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
const portOpen = (port: number): Promise<boolean> => new Promise((resolvePort) => {
  const socket = connect({ host: "127.0.0.1", port });
  socket.setTimeout(1000);
  const finish = (open: boolean) => { socket.destroy(); resolvePort(open); };
  socket.once("connect", () => finish(true));
  socket.once("error", () => finish(false));
  socket.once("timeout", () => finish(false));
});

interface Ready { pid: number; serverPid: number; pidFile: string; port: number; datadir: string }

describe("mysqld lifetime", () => {
  it("ends the server when the process that started it is force-killed", async () => {
    const parent = spawn(process.execPath, [join(here, "mysql-lifetime-parent.ts")], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    parent.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    parent.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    let ready: Ready | undefined;
    try {
      const deadline = Date.now() + 120_000;
      while (!/READY (\{[^\n]+\})/.test(stdout)) {
        if (parent.exitCode !== null || Date.now() > deadline) throw new Error(`helper did not start a server: ${stdout}\n${stderr}`);
        await sleep(200);
      }
      ready = JSON.parse(/READY (\{[^\n]+\})/.exec(stdout)![1]) as Ready;
      const { pid, serverPid, port } = ready;
      expect(alive(pid)).toBe(true);
      expect(alive(serverPid)).toBe(true);
      expect(await portOpen(port)).toBe(true);

      if (process.platform === "win32") {
        spawnSyncKill(parent.pid!);
      } else {
        parent.kill("SIGKILL");
      }
      const gone = Date.now() + 8_000;
      while ((alive(pid) || alive(serverPid) || await portOpen(port)) && Date.now() < gone) await sleep(100);
      expect({ launchedPidAlive: alive(pid), realServerPidAlive: alive(serverPid), portOpen: await portOpen(port) }).toEqual({ launchedPidAlive: false, realServerPidAlive: false, portOpen: false });
      // On Windows the launched PID must be the server, not MySQL's optional
      // RESTART monitor. Checking only the monitor PID previously falsely passed.
      expect(pid).toBe(serverPid);
    } finally {
      if (parent.exitCode === null && parent.signalCode === null) {
        if (process.platform === "win32") spawnSyncKill(parent.pid!);
        else parent.kill("SIGKILL");
      }
      // A failing orphan regression must not itself leave an orphan. Only
      // shut down this test's server, after matching its server-owned PID file.
      if (ready && await portOpen(ready.port)) {
        const admin = await createConnection({ host: "127.0.0.1", port: ready.port, user: "root", password: "" });
        try {
          const [rows] = await admin.query("SELECT @@pid_file AS pidFile");
          const pidFile = (rows as Array<{ pidFile: string }>)[0]!.pidFile;
          if (pidFile !== ready.pidFile || Number(readFileSync(pidFile, "utf8").trim()) !== ready.serverPid) throw new Error("refusing shutdown: test server identity changed");
          await admin.query("SHUTDOWN");
        } finally { await admin.end(); }
      }
      if (ready) {
        const gone = Date.now() + 8_000;
        while (alive(ready.serverPid) && Date.now() < gone) await sleep(100);
        if (alive(ready.serverPid)) throw new Error(`owned test server ${ready.serverPid} survived cleanup`);
        const datadir = resolve(ready.datadir);
        if (dirname(datadir) !== resolve(tmpdir()) || !basename(datadir).startsWith("decko-mysql-")) throw new Error(`refusing removal outside owned MySQL scratch: ${datadir}`);
        rmSync(datadir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      }
    }
  }, 180_000);

  it("normal shutdown ends the actual server and removes its data directory", async () => {
    const server = await startMysqlServer();
    try {
      const connection = await server.connect();
      const [rows] = await connection.query("SELECT @@pid_file AS pidFile");
      const pidFile = (rows as Array<{ pidFile: string }>)[0]!.pidFile;
      const serverPid = Number(readFileSync(pidFile, "utf8").trim());
      await connection.end();
      expect(server.pid).toBe(serverPid);
      await server.stop();
      expect(alive(serverPid)).toBe(false);
      expect(await portOpen(server.port)).toBe(false);
      expect(existsSync(server.datadir)).toBe(false);
    } finally { server.kill(); }
  }, 90_000);
});

function spawnSyncKill(pid: number): void {
  spawnSync("taskkill", ["/pid", String(pid), "/f"], { windowsHide: true, stdio: "ignore" });
}
