// Starts an engine's HTTP server on a private copy of a fixture's deck.
//
// An engine is described by browser/engines/<name>.json:
//   { "name": "...", "command": ["node", "ts-server.mjs"], "ready": "/path" }
// `command` runs in the manifest's directory with these variables set:
//   HARNESS_DECK       the session's private deck.sqlite3 (writable)
//   HARNESS_FILES      the session's copy of the deck's files directory
//   HARNESS_DECK_JSON  the fixture's deck.json (clock, environment, actors)
//   HARNESS_WORK       an empty directory for caches
//   HARNESS_PORT       the port to listen on, on 127.0.0.1
// The server must answer GET <ready> with 200 once it can serve pages, and
// GET /__harness/mail with the mail sent since the last call (a JSON list of
// {to, subject, text}), drained on read.

import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, openSync, closeSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const fwd = (p) => p.split(path.sep).join("/");

export function loadEngine(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return { ...manifest, dir: path.dirname(path.resolve(manifestPath)) };
}

/**
 * Attaches the journeys to a RUNNING engine instead of booting one — the
 * host-override path of the live-walk profile (engines/live.json +
 * --base-url / DECKO_LIVE_BASE; see lib/live-walk-profile.mjs). Nothing is
 * staged and nothing is spawned: the returned handle's stop() is a no-op and
 * its mail drain answers empty (an attached host exposes no owned mail sink).
 * Fails fast when the target does not answer the manifest's ready path, so a
 * run never half-attaches to a dead host.
 */
export async function attachEngine(engine, baseUrl, { readyTimeoutMs = 30_000 } = {}) {
  const base = new URL(baseUrl).origin;
  const probePath = engine.ready ?? "/";
  let reached = null;
  const deadline = Date.now() + readyTimeoutMs;
  for (;;) {
    try {
      const res = await fetch(base + probePath, { headers: { connection: "close" } });
      reached = { status: res.status, ok: res.ok };
      break;
    } catch {
      /* not listening (yet) */
    }
    if (Date.now() > deadline) throw new Error(`host-override target ${base} did not answer GET ${probePath} within ${readyTimeoutMs} ms; refusing to attach to a host that may not be the engine`);
    await new Promise((r) => setTimeout(r, 500));
  }
  return {
    base,
    attached: true,
    name: engine.name,
    bootMs: 0,
    reachProbe: { path: probePath, ...reached },
    db: null,
    files: null,
    mail: async () => [],
    restart: undefined,
    stop: async () => {},
  };
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function killTree(child) {
  // The ChildProcess is the handle returned by this session's spawn. Never
  // enumerate/select another application's PID for lifecycle control.
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (!Number.isInteger(child.pid)) throw new Error("owned engine has no process identity");
  let timer;
  const closed = new Promise(resolve => child.once("close", resolve));
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`owned engine ${child.pid} did not close within 10 seconds`)), 10_000);
  });
  try {
  if (process.platform === "win32") {
    const taskkill = path.join(process.env.SystemRoot ?? "C:/Windows", "System32/taskkill.exe");
    const termination = new Promise((resolve, reject) => {
      const command = spawn(taskkill, ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let diagnostic = "";
      command.stdout.on("data", b => diagnostic += b);
      command.stderr.on("data", b => diagnostic += b);
      command.once("error", reject);
      command.once("close", code => {
        if (code === 0 || child.exitCode !== null || child.signalCode !== null) resolve();
        else reject(new Error(`taskkill failed for owned engine ${child.pid} (exit ${code}): ${diagnostic.trim()}`));
      });
    });
    await Promise.race([termination, deadline]);
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
    await Promise.race([closed, deadline]);
  } finally { clearTimeout(timer); }
}

/**
 * Stages the deck, starts the server, waits until it is ready.
 * Returns { base, db, files, mail(), stop() }; stop() kills the process tree
 * and removes the staged copy.
 */
export async function startEngine(engine, fixtureDir, { logFile, readyTimeoutMs = 240_000 } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), `decko-browser-${engine.name}-`));
  let child;
  const stop = async () => {
    await killTree(child);
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith(`decko-browser-${engine.name}-`)) throw new Error("refusing escaped session cleanup path");
    let cleanupError;
    for (let i = 0; i < 20; i++) {
      try {
        rmSync(root, { recursive: true, force: true });
        return;
      } catch (error) {
        cleanupError = error;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    throw new Error(`owned engine closed but session cleanup failed: ${cleanupError?.message}`);
  };
  try {
    const db = path.join(root, "deck.sqlite3");
    const files = path.join(root, "files");
    const work = path.join(root, "work");
    cpSync(path.join(fixtureDir, "deck", "deck.sqlite3"), db);
    const srcFiles = path.join(fixtureDir, "deck", "files");
    if (existsSync(srcFiles)) cpSync(srcFiles, files, { recursive: true });
    else mkdirSync(files);
    mkdirSync(work);
    const port = await freePort();
    const env = {
      ...process.env,
      ...engine.env,
      HARNESS_DECK: fwd(db),
      HARNESS_FILES: fwd(files),
      HARNESS_DECK_JSON: fwd(path.resolve(fixtureDir, "deck.json")),
      HARNESS_WORK: fwd(work),
      HARNESS_PORT: String(port),
    };
    const launch = () => {
      const out = logFile ? openSync(logFile, "a") : "ignore";
      child = spawn(engine.command[0], engine.command.slice(1), {
        cwd: engine.dir,
        env,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", out, out],
      });
      if (typeof out === "number") closeSync(out);
    };
    const bootStarted = Date.now();
    launch();
    const base = `http://127.0.0.1:${port}`;
    const awaitReady = async () => {
      const deadline = Date.now() + readyTimeoutMs;
      for (;;) {
        if (child.exitCode !== null) throw new Error(`${engine.name} server exited with ${child.exitCode} before it was ready`);
        try {
          const res = await fetch(base + (engine.ready ?? "/__harness/ready"), { headers: { connection: "close" } });
          if (res.ok) break;
        } catch {
          /* not listening yet */
        }
        if (Date.now() > deadline) throw new Error(`${engine.name} server not ready after ${readyTimeoutMs} ms`);
        await new Promise((r) => setTimeout(r, 500));
      }
    };
    await awaitReady();
    const bootMs = Date.now() - bootStarted;
    const mail = async () => {
      const res = await fetch(base + "/__harness/mail", { headers: { connection: "close" } });
      return res.ok ? res.json() : [];
    };
    // Restart only the process this session spawned, preserving its private
    // database/files/cache and origin. No other session's process is selected.
    const restart = async () => {
      const previousPid = child?.pid;
      if (child && child.exitCode === null) {
        await killTree(child);
      }
      const restarted = Date.now();
      launch();
      await awaitReady();
      return { previousPid, pid: child.pid, bootMs: Date.now() - restarted };
    };
    return { base, db, files, mail, stop, restart, bootMs };
  } catch (err) {
    await stop();
    throw err;
  }
}
