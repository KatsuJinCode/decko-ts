// tools/cf-cost/node-engine-cpu.mjs — Node-side CPU profiler for the CF worker.
//
// Bundles deploy/worker.ts the way benchmarks/cf-scale/measure-workerd-cpu.mjs
// does (vite SSR, node:crypto aliased to the deploy shim), then drives the
// default export's fetch() against a D1 shim over better-sqlite3 seeded with
// deploy/migrations/0001-schema.sql + deploy/cf-scale-deck/seed.sql.
//
// Same decks and pages as the workerd harness, so the per-page CPU here is
// comparable to it minus the workerd/D1-emulation floor (the doc puts that
// floor at about 3 ms per request). workerd cannot be profiled this way, so
// this is the instrument for finding where engine CPU goes; the workerd
// harness remains the upper-bound number to report.
//
// Usage:
//   node tools/cf-cost/node-engine-cpu.mjs [--n 200] [--batches 20] [--json out.json]
//     [--pages "500-item pointer"] [--nest-index] [--lock-table]
//   PROFILE_LABEL=<name> additionally writes a V8 CPU profile of each page's
//   warm batches to tmp/cf-cost/<name>-<page>.cpuprofile; summarize it with
//   tools/cf-cost/cpuprofile-summary.mjs and tools/cf-cost/cpuprofile-callees.mjs.
//   BODIES_DIR=<dir> writes each page's first-response body there for a
//   byte comparison (data-slot-id is random per request; mask it).
//   --nest-index runs the stored nest-index build first (the deploy step a
//   Cloudflare deploy does not run); --lock-table creates decko_tx_state.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(pathToFileURL(join(REPO, "package.json")));
const Database = require("better-sqlite3");

const { splitSqlStatements } = await import(
  pathToFileURL(join(REPO, "tools", "migrate", "import.mjs")).href
);

const SQL = [
  "deploy/migrations/0001-schema.sql",
  "deploy/migrations/0002-card-text-binary-lookup-indexes.sql",
  "deploy/migrations/0003-deck-data-version-stamp.sql",
  "deploy/migrations/0008-cards-serving-path-indexes.sql",
  "deploy/migrations/0010-deck-data-version-all-card-tables.sql",
  "deploy/migrations/0013-nest-index-meta.sql",
  "deploy/cf-scale-deck/seed.sql",
];
const PAGES = [
  ["home", "/"],
  ["ordinary card", "/Scale%20Page%201x"],
  ["ordinary card (another)", "/Scale%20Page%201500x"],
  ["32-deep nest chain", "/Depth%20Root"],
  ["500-item pointer", "/Big%20Pointer"],
  ["16KB body", "/Large%20Doc%201"],
  ["mod-view card", "/Mod%20Probe%201"],
  ["denied card", "/Restricted%20Page%207"],
  ["card JSON", "/Scale%20Page%201x.json"],
];

function parseArgs(argv) {
  const out = { n: 200, batches: 20, pages: null, json: null, nestIndex: false, lockTable: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--n") out.n = Number(argv[++i]);
    else if (argv[i] === "--batches") out.batches = Number(argv[++i]);
    else if (argv[i] === "--pages") out.pages = new Set(argv[++i].split(","));
    else if (argv[i] === "--json") out.json = argv[++i];
    else if (argv[i] === "--nest-index") out.nestIndex = true;
    else if (argv[i] === "--lock-table") out.lockTable = true;
  }
  return out;
}

// The D1 surface the engine's CloudflareD1Adapter uses: prepare(sql).bind(...v)
// with .all()/.run(), and db.batch([...]). D1 SELECTs give results; everything
// else is a write. better-sqlite3 gives the same SQLite semantics the Node
// LocalSqliteDriver path uses.
// Each statement runs synchronously; a failure becomes a rejected promise, so
// the driver's own error handling (for example the tolerated missing
// decko_tx_state table) sees exactly the error D1 would raise.
function execSync(db, sql, params, onQuery) {
  onQuery();
  if (/^\s*(select|with)\b/i.test(sql)) {
    const results = db.prepare(sql).all(...params);
    return { success: true, results, meta: { changes: 0, rows_read: results.length } };
  }
  const info = db.prepare(sql).run(...params);
  return { success: true, results: [], meta: { changes: info.changes, last_row_id: info.lastInsertRowid, rows_written: info.changes } };
}

function makeD1(db, onQuery) {
  return {
    prepare(sql) {
      let params = [];
      const stmt = {
        bind(...values) {
          params = values;
          return stmt;
        },
        run() {
          try {
            return Promise.resolve(execSync(db, sql, params, onQuery));
          } catch (err) {
            return Promise.reject(err);
          }
        },
        all() {
          try {
            return Promise.resolve(execSync(db, sql, params, onQuery));
          } catch (err) {
            return Promise.reject(err);
          }
        },
        _sql: sql,
        _params: () => params,
      };
      return stmt;
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const out = statements.map((s) => execSync(db, s._sql, s._params(), onQuery));
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
  };
}

async function bundle(entry = "deploy/worker.ts", outName = "profile-worker.mjs") {
  const { build } = await import("vite");
  const viteResult = await build({
    configFile: false,
    logLevel: "warn",
    resolve: { alias: [{ find: "node:crypto", replacement: join(REPO, "deploy", "shims", "node-crypto-shim.ts") }] },
    ssr: { noExternal: true },
    build: {
      write: false,
      minify: false,
      target: "es2022",
      ssr: true,
      rollupOptions: { input: join(REPO, entry), output: { format: "esm", entryFileNames: outName } },
    },
  });
  const outputs = Array.isArray(viteResult) ? viteResult : [viteResult];
  const code = outputs[0].output.find((c) => c.type === "chunk").code;
  const out = join(REPO, "tmp", "cf-cost", outName);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, code);
  return pathToFileURL(out).href;
}

// Optional V8 CPU profile around each page's warm batches only (not the
// cold boot, not the bundle compile): PROFILE_LABEL=<name> writes
// tmp/cf-cost/<PROFILE_LABEL>-<page>.cpuprofile per page.
const profile = {
  session: null,
  async start() {
    if (!process.env.PROFILE_LABEL) return;
    if (this.session === null) {
      const { Session } = await import("node:inspector/promises");
      this.session = new Session();
      this.session.connect();
      await this.session.post("Profiler.enable");
      await this.session.post("Profiler.setSamplingInterval", { interval: 100 });
    }
    await this.session.post("Profiler.start");
  },
  async stop(label) {
    if (!process.env.PROFILE_LABEL || this.session === null) return;
    const { profile: data } = await this.session.post("Profiler.stop");
    const slug = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const out = join(REPO, "tmp", "cf-cost", `${process.env.PROFILE_LABEL}-${slug}.cpuprofile`);
    writeFileSync(out, JSON.stringify(data));
  },
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pages = PAGES.filter(([label]) => !args.pages || args.pages.has(label));
  const moduleUrl = await bundle();
  const worker = (await import(moduleUrl)).default;

  const dbPath = join(REPO, "tmp", "cf-cost", "profile-deck.sqlite3");
  for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  for (const rel of SQL) {
    for (const sql of splitSqlStatements(readFileSync(join(REPO, rel), "utf8")).filter(Boolean)) {
      try {
        db.exec(sql);
      } catch (err) {
        if (!/duplicate column|already exists/.test(String(err.message))) throw err;
      }
    }
  }
  // --lock-table: the decko_tx_state lock row the undo journal installs on a
  // deck's first write transaction (src/server/drivers/undo-journal.ts,
  // ensureInstalled). Present on any deck that has ever been written; absent
  // on one that never has. The statements are the journal's own DDL.
  if (args.lockTable) {
    db.exec("CREATE TABLE IF NOT EXISTS decko_tx_state (id INTEGER PRIMARY KEY CHECK (id = 1), tx TEXT, expires_at INTEGER, signature TEXT)");
    db.exec("INSERT OR IGNORE INTO decko_tx_state (id) VALUES (1)");
  }
  // --nest-index: the stored nest index build, through the engine's own
  // ensureNestIndex (tools/cf-cost/nest-index-entry.ts), as the one-shot
  // build step runs it. Without the flag the deck serves by walking nests.
  if (args.nestIndex) {
    const indexUrl = await bundle("tools/cf-cost/nest-index-entry.ts", "nest-index-build.mjs");
    const { buildNestIndex } = await import(indexUrl);
    const built = await buildNestIndex(makeD1(db, () => {}));
    console.log(JSON.stringify({ nestIndex: built }).slice(0, 400));
  }
  let queries = 0;
  const env = { DB: makeD1(db, () => { queries++; }), METRICS_TOKEN: "local-measurement" };
  const dispatch = async (path) => {
    const r = await worker.fetch(new Request(`https://decko-cpu.test${path}`), env);
    return { status: r.status, text: await r.text() };
  };

  const rows = [];
  const cold = [];
  for (const [label, path] of pages) {
    // Cold isolate: a fresh engine boot (module-level WeakMap keyed by env.DB,
    // so each page needs its own D1 object) and its first request.
    queries = 0;
    const envCold = { ...env, DB: makeD1(db, () => { queries++; }) };
    const c0 = process.cpuUsage();
    const w0 = Date.now();
    const first = await worker.fetch(new Request(`https://decko-cpu.test${path}`), envCold);
    const firstText = await first.text();
    if (first.status !== 200) {
      throw new Error(`${label} ${path} returned ${first.status}: ${firstText.slice(0, 300)}`);
    }
    const c1 = process.cpuUsage(c0);
    const bodySha = createHash("sha256").update(firstText).digest("hex");
    if (process.env.BODIES_DIR) {
      const dir = join(process.env.BODIES_DIR);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.body`), firstText);
    }
    cold.push({
      label,
      path,
      status: first.status,
      // worker.ts keeps the booted deck in a module-level promise, so only the
      // first request of this process is a cold isolate; later rows are warm.
      coldIsolate: cold.length === 0,
      bodySha,
      bytes: firstText.length,
      cpuMs: Number(((c1.user + c1.system) / 1000).toFixed(2)),
      wallMs: Date.now() - w0,
      d1Queries: queries,
    });

    for (let i = 0; i < 5; i++) await dispatch(path); // warm-up, as workerd harness does
    await profile.start();
    const batchCpu = [];
    const perBatch = Math.max(1, Math.floor(args.n / args.batches));
    let bytes = 0;
    let status = 0;
    for (let b = 0; b < args.batches; b++) {
      const b0 = process.cpuUsage();
      for (let i = 0; i < perBatch; i++) {
        const r = await dispatch(path);
        status = r.status;
        bytes = r.text.length;
      }
      const b1 = process.cpuUsage(b0);
      batchCpu.push((b1.user + b1.system) / 1000 / perBatch);
    }
    await profile.stop(label);
    const sorted = [...batchCpu].sort((a, b) => a - b);
    const q = (p) => Number(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(3));
    rows.push({
      label,
      path,
      status,
      bytes,
      cpuMsPerRequest: Number((batchCpu.reduce((a, b) => a + b, 0) / batchCpu.length).toFixed(2)),
      p50: q(0.5),
      p95: q(0.95),
      min: Number(sorted[0].toFixed(3)),
      max: Number(sorted[sorted.length - 1].toFixed(3)),
    });
    console.log(JSON.stringify(rows.at(-1)));
  }
  const result = {
    measuredAt: new Date().toISOString(),
    requestsPerPage: args.n,
    batches: args.batches,
    platform: `${process.platform} ${process.arch}, node ${process.version}`,
    method: "process.cpuUsage (user+system) around the worker fetch() call in Node over an in-process better-sqlite3 D1 shim; engine CPU without workerd or D1-emulation plumbing. Upper bound on billed CPU only through the workerd harness.",
    cold,
    pages: rows,
  };
  console.log(JSON.stringify({ cold }));
  const jsonOut = args.json ?? join(REPO, "tmp", "cf-cost", "result.json");
  writeFileSync(jsonOut, JSON.stringify(result, null, 2) + "\n");
  console.log(`wrote ${jsonOut}`);
  db.close();
}

await main();
