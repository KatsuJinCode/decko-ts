// measure-workerd-cpu.mjs — CPU time per page render inside workerd.
//
// Boots the real deploy/worker.ts under miniflare's workerd (the binary
// Cloudflare runs in production), loads a deck into the local D1 binding,
// and for each page: warms it, then issues N sequential GETs and reads the
// workerd PROCESS's CPU time before and after. CPU ms per request is the
// delta divided by N.
//
// Why process CPU: workerd freezes Date.now()/performance.now() during
// execution (Spectre mitigation), so no in-isolate clock measures CPU.
// The process counter is an UPPER BOUND on what Cloudflare bills as CPU
// time, because locally the same process also runs the D1 emulation
// (SQLite query execution) and the HTTP plumbing; in production D1 runs
// outside the Worker and its time is I/O wait, not billed CPU.
//
// D1 rows read per page come from the worker's own /__metrics recorder
// (deploy/src/worker-metrics.ts), which forwards D1's meta.rows_read.
//
// Usage:
//   node benchmarks/cf-scale/measure-workerd-cpu.mjs [--deck cf-scale|demo] [--n 40] [--json out.json]
//     [--entry deploy/worker.ts] [--first <path>] [--cold-only]
//
// --entry bundles another worker file (to compare two boots); --first picks
// the path of the isolate's first request; --cold-only stops after that
// request and reports its CPU, D1 queries and D1 rows read.
//
// Windows only for the CPU counter (reads it through PowerShell's
// Get-Process); on Linux/macOS it reads /proc or `ps` instead.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const DECKS = {
  "cf-scale": {
    sql: ["deploy/migrations/0001-schema.sql", "deploy/cf-scale-deck/seed.sql"],
    pages: [
      ["home", "/"],
      ["ordinary card", "/Scale%20Page%201x"],
      ["ordinary card (another)", "/Scale%20Page%201500x"],
      ["32-deep nest chain", "/Depth%20Root"],
      ["500-item pointer", "/Big%20Pointer"],
      ["16KB body", "/Large%20Doc%201"],
      ["mod-view card", "/Mod%20Probe%201"],
      ["denied card", "/Restricted%20Page%207"],
      ["card JSON", "/Scale%20Page%201x.json"],
    ],
  },
  demo: {
    sql: ["deploy/migrations/0001-schema.sql", "deploy/seed/seed.sql"],
    pages: [["home", "/"]],
  },
};

function parseArgs(argv) {
  const out = { deck: "cf-scale", n: 40, json: null, entry: "deploy/worker.ts", first: null, coldOnly: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--deck") out.deck = argv[++i];
    else if (argv[i] === "--n") out.n = Number(argv[++i]);
    else if (argv[i] === "--json") out.json = argv[++i];
    else if (argv[i] === "--entry") out.entry = argv[++i];
    else if (argv[i] === "--first") out.first = argv[++i];
    else if (argv[i] === "--cold-only") out.coldOnly = true;
  }
  return out;
}

function childPids() {
  if (process.platform === "win32") {
    const outText = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command",
        `Get-CimInstance Win32_Process -Filter "ParentProcessId=${process.pid}" | ForEach-Object { "$($_.ProcessId) $($_.Name)" }`],
      { windowsHide: true, encoding: "utf8" },
    );
    return outText.split(/\r?\n/).filter(Boolean).map((l) => {
      const [pid, ...name] = l.trim().split(" ");
      return { pid: Number(pid), name: name.join(" ") };
    });
  }
  const outText = execFileSync("ps", ["-o", "pid=,comm=", "--ppid", String(process.pid)], { encoding: "utf8", windowsHide: true });
  return outText.split("\n").filter(Boolean).map((l) => {
    const [pid, ...name] = l.trim().split(/\s+/);
    return { pid: Number(pid), name: name.join(" ") };
  });
}

/** Total CPU (user+kernel) of one process, in milliseconds. */
function processCpuMs(pid) {
  if (process.platform === "win32") {
    const outText = execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", `(Get-Process -Id ${pid}).TotalProcessorTime.TotalMilliseconds`],
      { windowsHide: true, encoding: "utf8" },
    );
    return Number(outText.trim());
  }
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" ");
  return ((Number(stat[11]) + Number(stat[12])) * 1000) / 100;
}

async function boot(deck, entry) {
  const { build } = await import("vite");
  const { Miniflare, convertV4MiniflareOptions } = await import("miniflare");
  const { splitSqlStatements } = await import(pathToFileURL(join(REPO, "tools", "migrate", "import.mjs")).href);

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
      rollupOptions: { input: join(REPO, entry), output: { format: "esm", entryFileNames: "cpu-worker.mjs" } },
    },
  });
  const outputs = Array.isArray(viteResult) ? viteResult : [viteResult];
  const bundle = outputs[0].output.find((c) => c.type === "chunk").code;

  const before = new Set(childPids().map((p) => p.pid));
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle,
      d1Databases: { DB: "decko-cpu-measure" },
      verbose: Boolean(process.env.MEASURE_VERBOSE),
      bindings: { METRICS_TOKEN: "local-measurement" },
    }),
  );
  await mf.ready;
  const workerd = childPids().filter((p) => !before.has(p.pid) && /workerd/i.test(p.name));
  if (workerd.length !== 1) throw new Error(`expected one workerd child, found ${JSON.stringify(workerd)}`);

  const db = await mf.getD1Database("DB");
  for (const rel of DECKS[deck].sql) {
    const statements = splitSqlStatements(readFileSync(join(REPO, rel), "utf8")).filter(Boolean);
    for (let i = 0; i < statements.length; i += 50) {
      await db.batch(statements.slice(i, i + 50).map((sql) => db.prepare(sql)));
    }
  }
  const dispatch = (path, init) => mf.dispatchFetch(`https://decko-cpu.test${path}`, init);
  return { mf, dispatch, workerdPid: workerd[0].pid };
}

async function metrics(dispatch) {
  const r = await dispatch("/__metrics", { headers: { "x-decko-metrics-token": "local-measurement" } });
  if (r.status !== 200) return null;
  return r.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const deck = DECKS[args.deck];
  if (!deck) throw new Error(`unknown deck ${args.deck}`);
  const { mf, dispatch, workerdPid } = await boot(args.deck, args.entry);
  const rows = [];
  try {
    // Cold isolate: the first request boots the deck (loads every card row
    // into the in-isolate caches). Measured once; the counter's resolution
    // (15.6 ms on Windows) is small against it.
    const cold0 = processCpuMs(workerdPid);
    const coldWall0 = Date.now();
    const firstPath = args.first ?? deck.pages[0][1];
    const coldResponse = await dispatch(firstPath);
    await coldResponse.text();
    const coldBoot = {
      path: firstPath,
      status: coldResponse.status,
      cpuMs: Number((processCpuMs(workerdPid) - cold0).toFixed(2)),
      wallMs: Date.now() - coldWall0,
    };
    // D1 traffic of that first request: the recorder is per isolate, so its
    // aggregate after one request is that request's own.
    const coldMetrics = await metrics(dispatch);
    coldBoot.d1Queries = coldMetrics?.queryCount ?? null;
    coldBoot.d1RowsRead = coldMetrics?.rowsRead ?? null;
    console.log(JSON.stringify({ coldBoot }));

    // Idle baseline: CPU workerd burns with no requests over a similar span.
    const idle0 = processCpuMs(workerdPid);
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 3000));
    const idleMsPerSec = (processCpuMs(workerdPid) - idle0) / ((Date.now() - t0) / 1000);

    for (const [label, path] of args.coldOnly ? [] : deck.pages) {
      let status = 0;
      let bytes = 0;
      for (let i = 0; i < 5; i++) {
        const r = await dispatch(path);
        status = r.status;
        bytes = (await r.text()).length;
      }
      const m0 = await metrics(dispatch);
      const c0 = processCpuMs(workerdPid);
      const w0 = Date.now();
      for (let i = 0; i < args.n; i++) {
        const r = await dispatch(path);
        await r.text();
      }
      const wallS = (Date.now() - w0) / 1000;
      const c1 = processCpuMs(workerdPid);
      const m1 = await metrics(dispatch);
      const rawCpu = (c1 - c0) / args.n;
      const idleShare = (idleMsPerSec * wallS) / args.n;
      const perReq = (a, b, k) => (a && b && a.sinceIso === b.sinceIso ? (b[k] - a[k]) / (args.n + 0) : null);
      // /__metrics itself is one request between m0 and m1; it reads no rows.
      rows.push({
        label,
        path,
        status,
        bytes,
        cpuMsPerRequest: Number(rawCpu.toFixed(2)),
        cpuMsPerRequestLessIdle: Number(Math.max(0, rawCpu - idleShare).toFixed(2)),
        wallMsPerRequest: Number(((wallS * 1000) / args.n).toFixed(2)),
        d1QueriesPerRequest: perReq(m0, m1, "queryCount"),
        d1RowsReadPerRequest: perReq(m0, m1, "rowsRead"),
      });
      console.log(JSON.stringify(rows.at(-1)));
    }
    const result = {
      measuredAt: new Date().toISOString(),
      deck: args.deck,
      requestsPerPage: args.n,
      coldBoot,
      idleCpuMsPerSecond: Number(idleMsPerSec.toFixed(2)),
      platform: `${process.platform} ${process.arch}, node ${process.version}`,
      method: "workerd process CPU (user+kernel) delta over N sequential warm requests / N; upper bound (includes local D1 SQLite + HTTP plumbing)",
      pages: rows,
    };
    if (args.json) writeFileSync(args.json, JSON.stringify(result, null, 2) + "\n");
  } finally {
    await mf.dispose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
