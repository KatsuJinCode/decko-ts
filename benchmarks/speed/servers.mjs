// benchmarks/speed/servers.mjs — start and stop the three targets of the
// speed benchmark, each on its own per-run copy of the synthetic-v1 deck.
//
//   ruby     stock Ruby Decko 0.20.0 (the oracle app) in production mode
//            under Puma, through benchmarks/speed/ruby/config.ru
//   node     the port's Node host (tmp/speed/node-host.mjs)
//   workerd  the port's Worker (tmp/speed/worker.mjs) in workerd via
//            Miniflare, over a local D1 filled from the deck
//
// Every start returns { url, stop() }; stop() ends the server and deletes
// its deck copy. The hop (ms) is the simulated database round trip each
// target applies to every statement batch it sends.

import { spawn } from "node:child_process";
import { cpSync, copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DECK = join(ROOT, "reference-harness/fixtures/synthetic-v1/deck");
const STAMP = join(ROOT, "deploy/migrations/0003-deck-data-version-stamp.sql");

async function waitReady(url, ms, child) {
  const end = Date.now() + ms;
  let exited = false;
  child?.once("exit", () => (exited = true));
  while (Date.now() < end) {
    if (exited) throw new Error(`server for ${url} exited before it was ready`);
    try {
      const t0 = performance.now();
      const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      await r.arrayBuffer();
      if (r.status > 0) return Math.round(performance.now() - t0);
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server for ${url} not ready within ${ms} ms`);
}

/** A per-run deck copy for the port: the stock deck plus the
 *  deck-data-version stamp every provisioned port deck carries. */
function portDeckCopy() {
  const dir = mkdtempSync(join(tmpdir(), "decko-speed-"));
  const path = join(dir, "deck.sqlite3");
  copyFileSync(join(DECK, "deck.sqlite3"), path);
  const db = new DatabaseSync(path);
  db.exec(readFileSync(STAMP, "utf8"));
  db.close();
  return { dir, path };
}

function killTree(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((r) => {
    child.once("exit", r);
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    else child.kill("SIGTERM");
  });
}

export async function startNode({ port, hopMs }) {
  const deck = portDeckCopy();
  const child = spawn(process.execPath, [join(ROOT, "tmp/speed/node-host.mjs"), "--db", deck.path, "--port", String(port), "--hop-ms", String(hopMs)], {
    windowsHide: true,
    stdio: ["ignore", "ignore", "inherit"],
  });
  const url = `http://127.0.0.1:${port}`;
  const t0 = performance.now();
  const first_request_ms = await waitReady(`${url}/_speed_ping_404`, 30_000, child);
  return {
    url,
    boot_ms: Math.round(performance.now() - t0),
    first_request_ms,
    server: `node ${process.version}`,
    stop: async () => {
      await killTree(child);
      rmSync(deck.dir, { recursive: true, force: true });
    },
  };
}

export async function startRuby({ port, hopMs, threads = 5 }) {
  const dir = mkdtempSync(join(tmpdir(), "decko-speed-ruby-"));
  copyFileSync(join(DECK, "deck.sqlite3"), join(dir, "deck.sqlite3"));
  cpSync(join(DECK, "files"), join(dir, "files"), { recursive: true });
  const env = {
    ...process.env,
    BUNDLE_GEMFILE: join(ROOT, "benchmarks/speed/ruby/Gemfile"),
    RAILS_ENV: "production",
    SECRET_KEY_BASE: randomBytes(32).toString("hex"),
    DATABASE_URL: `sqlite3:${join(dir, "deck.sqlite3").replace(/\\/g, "/")}`,
    DECKO_FILES_DIR: join(dir, "files"),
    DECKO_CACHE_DIR: join(dir, "cache"),
    DECKO_BENCH_DB_HOP_MS: String(hopMs),
    RUBY_THREAD_VM_STACK_SIZE: "67108864",
    RUBY_THREAD_MACHINE_STACK_SIZE: "268435456",
  };
  const child = spawn(
    "bundle",
    ["exec", "puma", "--environment", "production", "--threads", `${threads}:${threads}`, "--bind", `tcp://127.0.0.1:${port}`, join(ROOT, "benchmarks/speed/ruby/config.ru")],
    { cwd: join(ROOT, "reference-harness/oracle/app"), env, windowsHide: true, shell: process.platform === "win32", stdio: ["ignore", "ignore", process.env.SPEED_RUBY_LOG ? "inherit" : "ignore"] },
  );
  const url = `http://127.0.0.1:${port}`;
  const t0 = performance.now();
  const first_request_ms = await waitReady(`${url}/_speed_ping_404`, 180_000, child);
  return {
    url,
    boot_ms: Math.round(performance.now() - t0),
    first_request_ms,
    server: `puma (${threads} threads), RAILS_ENV=production`,
    stop: async () => {
      await killTree(child);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Fill a Miniflare D1 from a SQLite file: its schema (tables, indexes,
 *  triggers) and every row, in batches. */
async function fillD1(d1, path) {
  const src = new DatabaseSync(path, { readOnly: true });
  const objs = src.prepare("SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END").all();
  for (const o of objs.filter((o) => o.type === "table")) await d1.prepare(o.sql).run();
  for (const t of objs.filter((o) => o.type === "table")) {
    const rows = src.prepare(`SELECT * FROM "${t.name}"`).all();
    if (rows.length === 0) continue;
    const cols = Object.keys(rows[0]);
    const sql = `INSERT INTO "${t.name}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
    for (let i = 0; i < rows.length; i += 200) {
      await d1.batch(rows.slice(i, i + 200).map((r) => d1.prepare(sql).bind(...cols.map((c) => (r[c] === undefined ? null : r[c])))));
    }
  }
  for (const o of objs.filter((o) => o.type !== "table")) await d1.prepare(o.sql).run();
  src.close();
}

export async function startWorkerd({ port, hopMs }) {
  const { Miniflare, convertV4MiniflareOptions } = await import("miniflare");
  const deck = portDeckCopy();
  const persist = join(deck.dir, "d1");
  const options = {
    modules: [{ type: "ESModule", path: "worker.mjs", contents: readFileSync(join(ROOT, "tmp/speed/worker.mjs"), "utf8") }],
    compatibilityDate: "2026-09-01",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "decko-speed" },
    resourcePersistencePath: persist,
    bindings: { DECKO_BENCH_HOP_MS: String(hopMs) },
    host: "127.0.0.1",
    port,
  };
  // Fill the D1 once with a loader instance, then serve from a fresh one, so
  // the measured isolate has served nothing before the first request.
  const loader = new Miniflare(convertV4MiniflareOptions({ ...options, port: undefined, host: undefined }));
  await fillD1(await loader.getD1Database("DB"), deck.path);
  await loader.dispose();
  const t0 = performance.now();
  const mf = new Miniflare(convertV4MiniflareOptions(options));
  const url = (await mf.ready).toString().replace(/\/$/, "");
  const first_request_ms = await waitReady(`${url}/_speed_ping_404`, 60_000);
  return {
    url,
    boot_ms: Math.round(performance.now() - t0),
    first_request_ms,
    server: "workerd (miniflare), D1",
    stop: async () => {
      await mf.dispose();
      rmSync(deck.dir, { recursive: true, force: true });
    },
  };
}

export const START = { ruby: startRuby, node: startNode, workerd: startWorkerd };
