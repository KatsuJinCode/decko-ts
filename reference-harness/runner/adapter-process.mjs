// One adapter session: spawns an engine's adapter, speaks the harness
// protocol (one JSON object per line on stdin/stdout), and closes it.
// See reference-harness/SPEC.md, "Adapter protocol".

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

export function loadAdapterManifest(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest.command) || manifest.command.length === 0) {
    throw new Error(`${manifestPath}: "command" must be a non-empty array`);
  }
  return { ...manifest, dir: path.dirname(path.resolve(manifestPath)) };
}

export class AdapterSession {
  /**
   * @param manifest adapter manifest (adapter.json), already loaded
   * @param env      HARNESS_* variables for this session
   */
  constructor(manifest, env, { timeoutMs = 120_000, log = () => {} } = {}) {
    this.manifest = manifest;
    this.env = env;
    this.timeoutMs = timeoutMs;
    this.log = log;
    this.nextId = 1;
    this.pending = new Map();
    this.stderrTail = [];
  }

  async start() {
    const [cmd, ...args] = this.manifest.command;
    this.child = spawn(cmd, args, {
      cwd: this.manifest.dir,
      env: { ...process.env, ...(this.manifest.env ?? {}), ...this.env },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.exited = new Promise((resolve) => this.child.on("exit", (code, signal) => resolve({ code, signal })));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line === "") continue;
        // Keep the first lines (where an error is named) and the last ones.
        this.stderrTail.push(line);
        if (this.stderrTail.length > 60) this.stderrTail.splice(10, 1);
      }
    });
    const ready = new Promise((resolve, reject) => {
      this.onReady = resolve;
      this.exited.then(({ code }) =>
        reject(new Error(`adapter exited (code ${code}) before ready:\n${this.stderrTail.join("\n")}`)),
      );
    });
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => this.onLine(line));
    this.exited.then(({ code, signal }) => {
      for (const { reject } of this.pending.values()) {
        reject(new Error(`adapter exited (code ${code}, signal ${signal}):\n${this.stderrTail.join("\n")}`));
      }
      this.pending.clear();
    });
    this.hello = await withTimeout(ready, 600_000, "adapter did not become ready in 600 s");
    if (this.hello.protocol !== 1) throw new Error(`adapter speaks protocol ${this.hello.protocol}, runner speaks 1`);
    return this.hello;
  }

  onLine(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      if (trimmed !== "") this.log(`adapter stdout (not protocol): ${trimmed.slice(0, 200)}`);
      return;
    }
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      this.log(`adapter stdout (bad JSON): ${trimmed.slice(0, 200)}`);
      return;
    }
    if (msg.ready === true && this.onReady) {
      this.onReady(msg);
      this.onReady = undefined;
      return;
    }
    const waiter = this.pending.get(msg.id);
    if (!waiter) {
      this.log(`adapter answered unknown id ${msg.id}`);
      return;
    }
    this.pending.delete(msg.id);
    waiter.resolve(msg);
  }

  /** Sends one request; resolves with {ok, result} or {ok:false, error}. A
   *  request that times out is answered with a HarnessTimeout error; an
   *  adapter that has exited rejects, which ends the run as incomplete. */
  request(body) {
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return Promise.reject(new Error(`adapter has exited (code ${this.child.exitCode}):\n${this.stderrTail.join("\n")}`));
    }
    const id = this.nextId++;
    const msg = { id, ...body };
    const answer = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.child.stdin.write(JSON.stringify(msg) + "\n");
    return withTimeout(answer, this.timeoutMs, TIMED_OUT).catch((error) => {
      this.pending.delete(id);
      if (error.message !== TIMED_OUT) throw error;
      return { id, ok: false, error: { class: "HarnessTimeout", message: `request ${id} (${body.op}) timed out` } };
    });
  }

  async close() {
    if (!this.child || this.child.exitCode !== null) return;
    this.child.stdin.write(JSON.stringify({ op: "quit" }) + "\n");
    this.child.stdin.end();
    const done = await Promise.race([this.exited, sleep(60_000).then(() => null)]);
    if (done === null) this.kill();
  }

  /** Ends the adapter and every process it started (on Windows a launcher
   *  script does not exec, so the engine runs as a grandchild). */
  kill() {
    if (!this.child || this.child.exitCode !== null) return;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(this.child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    } else {
      this.child.kill("SIGKILL");
    }
  }
}

const TIMED_OUT = "harness request timed out";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms).unref());
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
      timer.unref();
    }),
  ]);
}
