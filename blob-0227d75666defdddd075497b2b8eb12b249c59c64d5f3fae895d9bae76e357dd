// benchmarks/edge-cold-start/measure-staging-edge-cold-vs-warm-ttfb.mjs
// COLD-VERSUS-WARM TTFB for a deployed Bunny edge script, measured from
// outside with node:https so the numbers carry no server-side instrumentation
// beyond the Server-Timing header the worker already ships.
//
// WHAT IT MEASURES, per request:
//   connect_ms  request start -> TLS handshake complete. Measured from the
//               socket's `connecting` flag, NOT from the 'socket' event: the
//               global agent can hand over a socket whose connect events have
//               already fired, which silently turns connect_ms into a copy of
//               ttfb (the bug this shape exists to avoid).
//   ttfb_ms     request start -> the 'response' event, i.e. the first
//               response byte (curl's time_starttransfer equivalent)
//   total_ms    request start -> body fully read
//   server_timing  the worker's own phase header, verbatim
//
// COLD VERSUS WARM, AND THE HONEST LIMIT OF IT: Bunny exposes no isolate id
// unless DECKO_EDGE_ISOLATE_PROBE=1 is armed on the script, and it is not
// armed on staging. So a request is called a BOOT REQUEST when the worker
// reports more db statements than the same path's warm baseline -- the deck
// boot reads the codename registry, the structure-rule universe and the nest
// index marker, so a boot adds statements a warm render never pays. The
// baseline is the per-path MINIMUM statement count in the run, which is the
// warm floor by construction (a boot can only add). A run in which no path
// shows a statement increase observed NO cold isolate at all, and the
// artifact says so in `cold_isolates_observed` rather than implying one.
//
//   node benchmarks/edge-cold-start/measure-staging-edge-cold-vs-warm-ttfb.mjs \
//     --paths "/,_status" --rounds 10 --gap 300 --out tmp/edge-cold-start/run.json
//
// Shell note, learned the hard way: a Git Bash (MSYS) shell rewrites any value
// whose string starts with `/` into `C:/Program Files/Git/...`, silently
// corrupting both --paths and a bare https:// argv. Run with
// MSYS_NO_PATHCONV=1, or pass the values through DECKO_PROBE_PATHS /
// DECKO_PROBE_HOST.
//
// PROBE-ONLY: GET requests with a per-request nonce and cache-control:
// no-cache, so no cache can answer on the worker's behalf. Nothing here
// writes to the script, its database, or its configuration.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import https from "node:https";
import { performance } from "node:perf_hooks";

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 || i === argv.length - 1 ? d : argv[i + 1];
};

const HOST = (process.env.DECKO_PROBE_HOST ?? arg("host", "https://culturesmith-b-edge.bunny.run")).replace(/\/+$/, "");
const clean = (p) => p.replace(/[\r\n\t]/g, "").trim();
const PATHS = (process.env.DECKO_PROBE_PATHS ?? arg("paths", "/,_status")).split(",").map(clean).filter(Boolean);
const ROUNDS = Number(arg("rounds", "10"));
const GAP_MS = Number(arg("gap", "300"));
const CONCURRENCY = Number(arg("concurrency", "1"));
const OUT = arg("out", join("tmp/edge-cold-start", `ttfb-${Date.now()}.json`));

const { hostname, port, pathname } = new URL(HOST);
const prefix = pathname === "/" ? "" : pathname;

/** One GET. Resolves with the timing record; a transport error resolves with
 *  `error` set and the timings it did reach — a failed probe is reported as a
 *  failed probe, never dropped (dropping it would bias the percentiles). */
function probe(path) {
  return new Promise((resolve) => {
    const nonce = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    const target = `${prefix}${path}${path.includes("?") ? "&" : "?"}preflight=${nonce}`;
    const start = performance.now();
    const rec = {
      path, status: null, connect_ms: null, ttfb_ms: null, total_ms: null,
      server_timing: null, db_ms: null, db_stmt: null, server_total_ms: null,
      bytes: null, error: null,
    };

    const req = https.request(
      {
        hostname, port: port || 443, path: target, method: "GET",
        agent: new https.Agent({ keepAlive: false }),
        headers: { "cache-control": "no-cache", accept: "*/*", "user-agent": "decko-edge-coldstart-probe/2" },
      },
      (res) => {
        rec.ttfb_ms = performance.now() - start;
        rec.status = res.statusCode;
        rec.server_timing = res.headers["server-timing"] ?? null;
        if (typeof rec.server_timing === "string") {
          const stmt = /stmt=(\d+)/.exec(rec.server_timing);
          const db = /db;dur=([\d.]+)/.exec(rec.server_timing);
          const tot = /total;dur=([\d.]+)/.exec(rec.server_timing);
          if (stmt) rec.db_stmt = Number(stmt[1]);
          if (db) rec.db_ms = Number(db[1]);
          if (tot) rec.server_total_ms = Number(tot[1]);
        }
        let bytes = 0;
        res.on("data", (c) => { bytes += c.length; });
        res.on("end", () => {
          rec.bytes = bytes;
          rec.total_ms = performance.now() - start;
          resolve(rec);
        });
        res.on("error", (e) => { rec.error = `body: ${e.message}`; rec.total_ms = performance.now() - start; resolve(rec); });
      },
    );

    // The socket may arrive already connected (pooled or raced), so branch on
    // `connecting` rather than assuming the handshake events are still ahead.
    req.on("socket", (socket) => {
      if (socket.connecting) socket.once("secureConnect", () => { rec.connect_ms = performance.now() - start; });
      else rec.connect_ms = performance.now() - start;
    });
    req.on("error", (e) => {
      rec.error = e.message;
      rec.total_ms = performance.now() - start;
      rec.ttfb_ms = rec.ttfb_ms ?? performance.now() - start;
      resolve(rec);
    });
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stats(xs) {
  const ok = xs.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (ok.length === 0) return null;
  const at = (p) => +ok[Math.min(ok.length - 1, Math.ceil((p / 100) * ok.length) - 1)].toFixed(1);
  return {
    n: ok.length, min: +ok[0].toFixed(1), p50: at(50), p95: at(95),
    max: +ok[ok.length - 1].toFixed(1),
    mean: +(ok.reduce((a, b) => a + b, 0) / ok.length).toFixed(1),
  };
}

const samples = [];
for (let round = 0; round < ROUNDS; round += 1) {
  // Concurrency > 1 is how the run is forced across ISOLATES: one client from
  // one region otherwise pins its own PoP's warm isolate and never observes a
  // cold start at all.
  const batch = CONCURRENCY > 1
    ? await Promise.all(PATHS.flatMap((p) => Array.from({ length: CONCURRENCY }, () => probe(p))))
    : await Promise.all(PATHS.map((p) => probe(p)));
  batch.forEach((r, i) => samples.push({ round, seq: i, ...r }));
  process.stderr.write(`round ${round + 1}/${ROUNDS} done\n`);
  if (GAP_MS > 0) await sleep(GAP_MS);
}

const okSamples = samples.filter((s) => s.error === null && s.status === 200);
// Per-path warm baseline = that path's minimum statement count in this run.
const byPath = new Map();
for (const s of okSamples) {
  if (s.db_stmt === null) continue;
  const cur = byPath.get(s.path);
  if (cur === undefined || s.db_stmt < cur) byPath.set(s.path, s.db_stmt);
}
const booted = okSamples.filter((s) => s.db_stmt !== null && byPath.has(s.path) && s.db_stmt > byPath.get(s.path));
const warm = okSamples.filter((s) => !booted.includes(s));
const stmtByPath = {};
for (const s of okSamples) {
  stmtByPath[s.path] ??= [];
  stmtByPath[s.path].push(s.db_stmt);
}

const artifact = {
  instrument: "benchmarks/edge-cold-start/measure-staging-edge-cold-vs-warm-ttfb.mjs",
  measured_at: new Date().toISOString(),
  host: HOST,
  paths: PATHS,
  rounds: ROUNDS,
  gap_ms: GAP_MS,
  concurrency: CONCURRENCY,
  method: {
    ttfb: "node:https 'response' event (first response byte, curl time_starttransfer equivalent)",
    connect: "socket secureConnect while socket.connecting, else handshake already done",
    body: "per-request nonce + cache-control: no-cache, so no cache can answer for the worker",
    cold_vs_warm: "per-path MINIMUM db_stmt in this run is the warm floor; a request above it ran the deck boot",
    isolate_id: "NOT OBSERVABLE (DECKO_EDGE_ISOLATE_PROBE unarmed on this script)",
  },
  environment: { node: process.version, platform: `${process.platform} ${process.arch}` },
  counts: { requests: samples.length, ok_200: okSamples.length, errors: samples.length - okSamples.length },
  cold_isolates_observed: booted.length,
  warm_baseline_stmt_by_path: Object.fromEntries(byPath),
  stmt_seen_by_path: stmtByPath,
  ttfb_ms_all: stats(okSamples.map((s) => s.ttfb_ms)),
  connect_ms_all: stats(okSamples.map((s) => s.connect_ms)),
  server_total_ms_all: stats(okSamples.map((s) => s.server_total_ms)),
  server_db_ms_all: stats(okSamples.map((s) => s.db_ms)),
  ttfb_ms_boot_requests: stats(booted.map((s) => s.ttfb_ms)),
  ttfb_ms_warm_requests: stats(warm.map((s) => s.ttfb_ms)),
  server_total_ms_boot_requests: stats(booted.map((s) => s.server_total_ms)),
  server_total_ms_warm_requests: stats(warm.map((s) => s.server_total_ms)),
  // What the request paid OUTSIDE the worker handler: TTFB minus the worker's
  // own reported total;dur. That gap is connection setup, isolate/bundle
  // start, the response hop out, and the round trip.
  ttfb_minus_server_total_ms: stats(okSamples.map((s) => s.ttfb_ms - s.server_total_ms)),
  samples,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
const { samples: _drop, ...summary } = artifact;
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
