// The VM reference target: attaches the journeys to the reference engine
// running on the operator's VM instead of booting one locally. The local
// Ruby runtimes are gone (staged for deletion 2026-10-27); the reference is
// the second instance of the vm-ruby application there (the same code the
// shadow router records), bound to a loopback port and seeded from the same
// fixture the local engine used to copy.
//
// The browser side stays LOCAL: the harness drives one browser over both
// engines' pages, and the VM instance is reached through an SSH local port
// forward, so the browser visits http://127.0.0.1:<port> exactly as it
// visits a local server. The server builds its absolute redirects on the
// same port (ruby-server.rb's deck_origin), so origin-dependent bytes match.
//
// Per journey this stages a fresh session on the VM (a private copy of the
// fixture deck, its own server process, its own stop-file lifecycle),
// waits for /__harness/ready through the tunnel, drains mail through it,
// and copies the session's deck file back so the row delta reads the exact
// bytes the local path reads.
//
// Configuration (environment, with the documented SSH recipe as default):
//   HARNESS_VM_TARGET  user@host of the VM   (ubuntu@170.9.231.182)
//   HARNESS_VM_JUMP    SSH jump host alias   (juc-vm)
//   HARNESS_VM_KEY     identity file         (~/.ssh/oci-agents)
//   HARNESS_VM_ROOT    instance root         (/home/ubuntu/oracle-journeys)
// The port is the shard's own: the local tunnel port and the VM's listen
// port are the same number, which is what keeps deck_origin honest.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const vmConfig = () => ({
  target: process.env.HARNESS_VM_TARGET ?? "ubuntu@170.9.231.182",
  jump: process.env.HARNESS_VM_JUMP ?? "juc-vm",
  key: process.env.HARNESS_VM_KEY ?? "~/.ssh/oci-agents",
  root: process.env.HARNESS_VM_ROOT ?? "/home/ubuntu/oracle-journeys",
});

const sshArgs = (cfg) => [
  "-J", cfg.jump,
  "-i", cfg.key,
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=20",
  cfg.target,
];

function sshRun(cfg, remoteCommand, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("ssh", [...sshArgs(cfg), remoteCommand], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "", timer;
    child.stdout.on("data", (c) => { out += c; });
    child.stderr.on("data", (c) => { err += c; });
    timer = setTimeout(() => {
      child.removeAllListeners("close");
      child.kill();
      reject(new Error(`ssh command timed out after ${timeoutMs} ms: ${remoteCommand.slice(0, 120)}`));
    }, timeoutMs);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`ssh exited ${code}: ${err.trim().slice(0, 300) || out.trim().slice(0, 300)}`));
    });
  });
}

function scpFile(cfg, remotePath, localPath, { timeoutMs = 180_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("scp", [
      "-J", cfg.jump,
      "-i", cfg.key,
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=20",
      `${cfg.target}:${remotePath}`,
      localPath,
    ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let err = "", timer;
    child.stderr.on("data", (c) => { err += c; });
    timer = setTimeout(() => {
      child.removeAllListeners("close");
      child.kill();
      reject(new Error(`scp timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`scp exited ${code}: ${err.trim().slice(0, 300)}`));
    });
  });
}

const sha256File = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/**
 * Stages a fresh session on the VM, opens the tunnel, waits until the
 * reference answers its ready path. Returns the engine handle the journeys
 * runner already knows: { base, dbNow(), mail(), stop(), bootMs } — the
 * local startEngine's shape, with dbNow() in place of the static db path
 * (the deck lives on the VM; dbNow() copies it back before each snapshot).
 */
export async function startVmEngine(engine, fixtureDir, { logFile, shardPort, readyTimeoutMs = 300_000 } = {}) {
  if (!Number.isInteger(shardPort) || shardPort <= 0) throw new Error("--vm-port <port> is required for the vm reference target");
  const cfg = vmConfig();
  const sessionId = `journeys-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionDir = `${cfg.root}/sessions/${sessionId}`;
  const base = `http://127.0.0.1:${shardPort}`;
  const stageRoot = path.join(tmpdir(), `decko-browser-${engine.name}-vm-${sessionId}`);
  mkdirSync(stageRoot, { recursive: true });
  const stop = async () => {
    // The session's own lifecycle: the stop file ends the server (the
    // boot watcher), then the session directory is removed. The tunnel
    // child is this module's own spawn.
    try { await sshRun(cfg, `${cfg.root}/browser/engines/vm-session.sh stop ${sessionId}`, { timeoutMs: 60_000 }); } catch { /* reported below */ }
    try { await sshRun(cfg, `${cfg.root}/browser/engines/vm-session.sh cleanup ${sessionId}`, { timeoutMs: 60_000 }); } catch { /* best effort */ }
    try { rmSync(stageRoot, { recursive: true, force: true }); } catch { /* scratch only */ }
    if (tunnelChild && tunnelChild.exitCode === null) {
      tunnelChild.removeAllListeners("close");
      tunnelChild.kill();
    }
  };
  let tunnelChild;
  try {
    // The seed must be the fixture this run pins: the local deck file's
    // sha256 against the VM seed's, checked before anything boots.
    const localDeck = path.resolve(fixtureDir, "deck", "deck.sqlite3");
    const localSha = sha256File(localDeck);
    const remoteSha = await sshRun(cfg, `sha256sum ${cfg.root}/seed/deck.sqlite3 | cut -d" " -f1`);
    if (remoteSha !== localSha) {
      throw new Error(`VM seed deck sha256 ${remoteSha} does not match the fixture's ${localSha}; provision the seed before the run`);
    }
    // Stage the session and boot the server on the VM (the stop-file
    // watcher starts beside it).
    await sshRun(cfg, `${cfg.root}/browser/engines/vm-session.sh stage ${sessionId} ${shardPort}`, { timeoutMs: 180_000 });
    // The tunnel: one forward, this shard's port, local = remote number.
    const tunnelLog = logFile ? openSync(logFile, "a") : "ignore";
    tunnelChild = spawn("ssh", [
      "-J", cfg.jump,
      "-i", cfg.key,
      "-o", "BatchMode=yes",
      "-o", "ExitOnForwardFailure=yes",
      "-o", "ServerAliveInterval=30",
      "-N",
      "-L", `127.0.0.1:${shardPort}:127.0.0.1:${shardPort}`,
      cfg.target,
    ], { windowsHide: true, stdio: ["ignore", "ignore", tunnelLog] });
    if (typeof tunnelLog === "number") closeSync(tunnelLog);
    tunnelChild.on("close", (code) => {
      if (code !== 0 && code !== null) console.error(`[vm tunnel ${shardPort}] exited ${code}`);
    });
    // Ready through the tunnel.
    const bootStarted = Date.now();
    const deadline = bootStarted + readyTimeoutMs;
    for (;;) {
      if (tunnelChild.exitCode !== null) throw new Error(`the VM tunnel closed before the reference was ready (exit ${tunnelChild.exitCode})`);
      try {
        const res = await fetch(base + (engine.ready ?? "/__harness/ready"), { headers: { connection: "close" } });
        if (res.ok) break;
      } catch { /* not listening yet */ }
      if (Date.now() > deadline) throw new Error(`the VM reference was not ready after ${readyTimeoutMs} ms (session ${sessionId})`);
      await new Promise((r) => setTimeout(r, 1000));
    }
    const bootMs = Date.now() - bootStarted;
    const mail = async () => {
      const res = await fetch(base + "/__harness/mail", { headers: { connection: "close" } });
      return res.ok ? res.json() : [];
    };
    // The row delta reads the session deck's bytes: copy it back before
    // each snapshot (the server holds the file; the copy is the same
    // read the local runner makes of its staged file). The server's WAL
    // holds the committed rows until a checkpoint, so the checkpoint route
    // runs first - otherwise the copy carries an empty deck.
    let dbCopy = 0;
    const dbNow = async () => {
      dbCopy += 1;
      const checkpoint = await fetch(base + "/__harness/checkpoint", { headers: { connection: "close" } }).catch(() => null);
      if (!checkpoint?.ok) throw new Error(`the VM reference did not checkpoint its deck WAL (status ${checkpoint?.status ?? "none"})`);
      const local = path.join(stageRoot, `deck-at-${dbCopy}.sqlite3`);
      await scpFile(cfg, `${sessionDir}/deck.sqlite3`, local);
      return local;
    };
    return { base, dbNow, mail, stop, bootMs, sessionId, shardPort, config: cfg };
  } catch (err) {
    await stop();
    throw err;
  }
}

/** The reference's identity, for the run record: the same /__harness/runtime
 *  answer a local server gives, fetched through the tunnel. */
export async function fetchVmRuntime(baseUrl) {
  const res = await fetch(new URL("/__harness/runtime", baseUrl), { headers: { connection: "close" } });
  if (!res.ok) throw new Error(`/__harness/runtime answered ${res.status}`);
  return res.json();
}
