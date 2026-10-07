// Run the built Bunny engine bundle in workerd (Miniflare), not node, against
// the local trial-deck mirror served over Hrana v2 (POST /v2/pipeline) by a
// read-only node:sqlite server in this process. Local only: nothing deployed,
// no remote database.
//
//   node tools/bundle-bunny-edge-engine.mjs      (writes deploy/dist/)
//   node benchmarks/speed-ship/edge-run.mjs deploy/dist/bunny-edge-engine.bundle.js \
//     benchmarks/one-trip-render/deck-analyzed.sqlite3 <outdir> <page> [<page>...]
//
// Prints one JSON line per page: status, bytes, statements the bundle sent,
// pipeline POSTs (= round trips, the deck boot's included on the first
// page), bytes of database responses (db_bytes), and wall time. All pages share one isolate, as on the edge.
//
// Options (environment of this harness, not of the bundle):
//   EDGE_HOP_MS=<n>       hold every pipeline response n ms (injected hop)
//   EDGE_MS_PER_MB=<n>    and n ms more per MB of response (the real database
//                         measured ~2,200: recovery/DEPLOY-CHECK-de14230a.md)
//   EDGE_CONCURRENT=1     dispatch all pages at once into the one isolate;
//                         per-page counters are then isolate-wide (0 = n/a)
//   EDGE_BINDINGS=<json>  extra bindings (e.g. {"DECKO_EDGE_RENDER_BUDGET_MS":"2000"})
//   EDGE_TAIL_WAIT_MS=<n>  after the last response, wait n ms and report the
//                         pipeline requests that still arrived
//   EDGE_STMT_LOG=<file>  append one JSON line per statement: page, kind,
//                         response bytes, rows, and bytes per column
//
// workerd is Cloudflare's runtime, not Bunny's (Deno-based); it proves the
// bundle runs on a non-node V8 runtime with node: modules only through the
// nodejs_compat layer. "@bunny.net/edgescript-sdk" is replaced by a shim
// that captures the serve() handler. With compatibility date 2025-09-01 the
// bundle fails to load ("No such module node:fs"); 2026-09-01 loads it.
import http from "node:http";
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const [bundlePath, dbPath, outDir, ...pages] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const db = new DatabaseSync(dbPath, { readOnly: true });
const counters = { posts: 0, stmts: 0, bytes: 0 };
const hopMs = Number(process.env.EDGE_HOP_MS ?? 0);
const msPerMb = Number(process.env.EDGE_MS_PER_MB ?? 0);
const concurrent = process.env.EDGE_CONCURRENT === "1";
const extraBindings = process.env.EDGE_BINDINGS ? JSON.parse(process.env.EDGE_BINDINGS) : {};
const stmtLog = process.env.EDGE_STMT_LOG;
let currentPage = "";
function logStatement(stmt, result) {
  if (!stmtLog) return;
  const res = result?.response?.result;
  const perCol = {};
  if (res && res.cols.length) {
    res.cols.forEach((c, i) => {
      perCol[c.name] = res.rows.reduce((n, r) => n + Buffer.byteLength(JSON.stringify(r[i])), 0);
    });
  }
  const sql = stmt.sql.replace(/\s+/g, " ");
  const kind = sql.startsWith("WITH lf(id)") ? "ring" : sql.startsWith("WITH __q AS") ? "companion" : sql.slice(0, 80);
  appendFileSync(stmtLog, JSON.stringify({ page: currentPage, kind, bytes: Buffer.byteLength(JSON.stringify(result)), rows: res?.rows.length ?? 0, perCol, ...(process.env.EDGE_STMT_SQL === "1" ? { sql: stmt.sql, args: stmt.args } : {}) }) + "\n");
}

function toJs(v) {
  switch (v?.type) {
    case "null": return null;
    case "integer": { const b = BigInt(v.value); return b >= BigInt(Number.MIN_SAFE_INTEGER) && b <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(b) : b; }
    case "float": return v.value;
    case "text": return v.value;
    case "blob": return Buffer.from(v.base64, "base64");
    default: throw new Error(`bad arg ${JSON.stringify(v)}`);
  }
}
function toWire(x) {
  if (x === null || x === undefined) return { type: "null" };
  if (typeof x === "bigint") return { type: "integer", value: x.toString() };
  if (typeof x === "number") return Number.isInteger(x) ? { type: "integer", value: String(x) } : { type: "float", value: x };
  if (typeof x === "string") return { type: "text", value: x };
  if (x instanceof Uint8Array) return { type: "blob", base64: Buffer.from(x).toString("base64") };
  throw new Error(`cannot encode ${typeof x}`);
}
function execute(stmt) {
  const st = db.prepare(stmt.sql);
  st.setReturnArrays(true);
  const args = (stmt.args ?? []).map(toJs);
  const cols = st.columns();
  if (cols.length > 0) {
    const rows = st.all(...args);
    return { cols: cols.map((c) => ({ name: c.name, decltype: c.type })), rows: rows.map((r) => r.map(toWire)), affected_row_count: 0 };
  }
  const info = st.run(...args);
  return { cols: [], rows: [], affected_row_count: Number(info.changes) };
}
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    counters.posts += 1;
    const body = JSON.parse(raw);
    const results = body.requests.map((r) => {
      if (r.type === "close") return { type: "ok", response: { type: "close" } };
      counters.stmts += 1;
      let out;
      try {
        out = { type: "ok", response: { type: "execute", result: execute(r.stmt) } };
      } catch (e) {
        out = { type: "error", error: { message: e.message, code: "SQLITE_ERROR" } };
      }
      logStatement(r.stmt, out);
      return out;
    });
    const payload = JSON.stringify({ results });
    counters.bytes += Buffer.byteLength(payload);
    // EDGE_GZIP=1: answer gzip when the request accepts it, as the real
    // database gateway does (it answers brotli to a runtime default).
    counters.acceptEncoding = String(req.headers["accept-encoding"] ?? "");
    const gz = process.env.EDGE_GZIP === "1" && /gzip/.test(counters.acceptEncoding);
    const reply = () => {
      res.writeHead(200, { "content-type": "application/json", ...(gz ? { "content-encoding": "gzip" } : {}) });
      res.end(gz ? gzipSync(payload) : payload);
    };
    const hold = hopMs + (msPerMb * Buffer.byteLength(payload)) / 1e6;
    if (hold > 0) setTimeout(reply, hold);
    else reply();
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const dbUrl = `http://127.0.0.1:${server.address().port}`;

const bundle = readFileSync(bundlePath, "utf8").replace(/(["'])@bunny\.net\/edgescript-sdk\1/g, '"./sdk-shim.mjs"');
const shim = `export const __served = { fn: undefined };
export const net = { http: { serve(a, b) { __served.fn = typeof a === "function" ? a : b; } } };
export default { net };`;
const main = `import { __served } from "./sdk-shim.mjs";
import "./bundle.mjs";
export default { async fetch(request) { return await __served.fn(request); } };`;

const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: [
      { type: "ESModule", path: "main.mjs", contents: main },
      { type: "ESModule", path: "sdk-shim.mjs", contents: shim },
      { type: "ESModule", path: "bundle.mjs", contents: bundle },
    ],
    compatibilityDate: "2026-09-01",
    compatibilityFlags: ["nodejs_compat"],
    bindings: { DECKO_DB_URL: dbUrl, DECKO_DB_TOKEN: "local-mirror-token", ...extraBindings },
  }),
);
async function one(page, t00) {
  if (!concurrent) {
    counters.posts = 0;
    counters.stmts = 0;
    counters.bytes = 0;
  }
  currentPage = page;
  const url = `https://edge.test/${encodeURIComponent(page.replace(/ /g, "_")).replace(/%2B/g, "+")}`;
  const t0 = performance.now();
  let status = 0;
  let text = "";
  let headers = {};
  try {
    const resp = await mf.dispatchFetch(url);
    status = resp.status;
    headers = Object.fromEntries(resp.headers);
    text = await resp.text();
  } catch (e) {
    text = String(e?.stack ?? e);
  }
  const wall = Math.round(performance.now() - t0);
  const file = join(outDir, `${page.replace(/[^A-Za-z0-9]+/g, "_")}.html`);
  writeFileSync(file, text);
  const c = concurrent ? { posts: 0, stmts: 0, bytes: 0 } : counters;
  console.log(JSON.stringify({ page, status, bytes: text.length, posts: c.posts, stmts: c.stmts, db_bytes: c.bytes, accept_encoding: counters.acceptEncoding, wall_ms: wall, finished_at_ms: Math.round(performance.now() - t00), budget: headers["x-decko-edge-budget"], file, head: status === 200 ? undefined : text.slice(0, 300) }));
}
try {
  const t00 = performance.now();
  if (concurrent) {
    await Promise.all(pages.map((p) => one(p, t00)));
    console.log(JSON.stringify({ concurrent: pages.length, total_ms: Math.round(performance.now() - t00), posts: counters.posts, stmts: counters.stmts, db_bytes: counters.bytes }));
  } else {
    for (const page of pages) await one(page, t00);
  }
  // EDGE_TAIL_WAIT_MS: wait after the last response and report the pipeline
  // requests that arrived meanwhile (an abandoned render still running).
  const tail = Number(process.env.EDGE_TAIL_WAIT_MS ?? 0);
  if (tail > 0) {
    const before = { posts: counters.posts, stmts: counters.stmts };
    await new Promise((r) => setTimeout(r, tail));
    console.log(JSON.stringify({ tail_ms: tail, posts_after_last_response: counters.posts - before.posts, stmts_after_last_response: counters.stmts - before.stmts }));
  }
} finally {
  await mf.dispose();
  server.close();
  db.close();
}
