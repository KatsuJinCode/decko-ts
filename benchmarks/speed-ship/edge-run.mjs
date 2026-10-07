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
// page), and wall time. All pages share one isolate, as on the edge.
//
// workerd is Cloudflare's runtime, not Bunny's (Deno-based); it proves the
// bundle runs on a non-node V8 runtime with node: modules only through the
// nodejs_compat layer. "@bunny.net/edgescript-sdk" is replaced by a shim
// that captures the serve() handler. With compatibility date 2025-09-01 the
// bundle fails to load ("No such module node:fs"); 2026-09-01 loads it.
import http from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const [bundlePath, dbPath, outDir, ...pages] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const db = new DatabaseSync(dbPath, { readOnly: true });
const counters = { posts: 0, stmts: 0 };

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
      try {
        return { type: "ok", response: { type: "execute", result: execute(r.stmt) } };
      } catch (e) {
        return { type: "error", error: { message: e.message, code: "SQLITE_ERROR" } };
      }
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ results }));
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
    bindings: { DECKO_DB_URL: dbUrl, DECKO_DB_TOKEN: "local-mirror-token" },
  }),
);
try {
  for (const page of pages) {
    counters.posts = 0;
    counters.stmts = 0;
    const url = `https://edge.test/${encodeURIComponent(page.replace(/ /g, "_")).replace(/%2B/g, "+")}`;
    const t0 = performance.now();
    let status = 0;
    let text = "";
    try {
      const resp = await mf.dispatchFetch(url);
      status = resp.status;
      text = await resp.text();
    } catch (e) {
      text = String(e?.stack ?? e);
    }
    const wall = Math.round(performance.now() - t0);
    const file = join(outDir, `${page.replace(/[^A-Za-z0-9]+/g, "_")}.html`);
    writeFileSync(file, text);
    console.log(JSON.stringify({ page, status, bytes: text.length, posts: counters.posts, stmts: counters.stmts, wall_ms: wall, file, head: status === 200 ? undefined : text.slice(0, 300) }));
  }
} finally {
  await mf.dispose();
  server.close();
  db.close();
}
