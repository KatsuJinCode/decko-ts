// benchmarks/speed-ship/node-gate.mjs - byte gate for an edge bundle run in
// NODE. workerd (edge-run.mjs) forbids eval, so it cannot run the lazy build
// (tools/edge-lazy-functions.mjs) that is uploaded to Bunny; node runs the
// same V8 and allows eval, as Bunny's Deno runtime does. Same Hrana server
// over the read-only mirror as edge-run.mjs, the real handler, pages in
// slices of 10 per fresh process (one process = one isolate), compared with
// byte references (data-slot-id masked). Per page: trips (pipeline POSTs, the
// deck boot's included on a slice's first page), statements, database bytes,
// wall and process CPU.
//
//   node benchmarks/speed-ship/node-gate.mjs <bundle.js> <ref-dir> <pages.txt> <work-dir>
//     -> <work-dir>/results.jsonl and a JSON summary line
// Database: benchmarks/one-trip-render/deck-analyzed.sqlite3 (NGATE_DB overrides).
// Reference file names follow gate.py's fname().

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";

const here = dirname(fileURLToPath(import.meta.url));
const [bundle, refDir, pagesFile, workDir, startArg, countArg] = process.argv.slice(2);
const pages = readFileSync(pagesFile, "utf8").split(/\r?\n/).filter(Boolean);
const REF = resolve(refDir);
mkdirSync(resolve(workDir), { recursive: true });
const resFile = resolve(workDir, "results.jsonl");
const fname = (p) => `${p.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40)}-${createHash("sha1").update(p, "utf8").digest("hex").slice(0, 8)}.html`;

if (startArg === undefined) {
  writeFileSync(resFile, "");
  for (let s = 0; s < pages.length; s += 10) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), bundle, refDir, pagesFile, workDir, String(s), "10"], { encoding: "utf8", windowsHide: true, timeout: 115000 });
    if (r.status !== 0) console.error(`slice ${s}: rc ${r.status} ${String(r.stderr).slice(-400)}`);
  }
  const rows = readFileSync(resFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const q = (xs) => { xs = [...xs].sort((a, b) => a - b); return xs.length ? [xs[0], xs[xs.length >> 1], xs[xs.length - 1]] : []; };
  console.log(JSON.stringify({ bundle, pages: rows.length, identical: rows.filter((r) => r.same).length, not_identical: rows.filter((r) => !r.same).map((r) => r.page),
    trips: q(rows.map((r) => r.posts)), db_kb: q(rows.map((r) => Math.round(r.db_bytes / 1000))), stmts: q(rows.map((r) => r.stmts)), wall: q(rows.map((r) => r.wall_ms)), cpu: q(rows.map((r) => r.cpu_ms)) }));
  process.exit(rows.length === pages.length && rows.every((r) => r.same) ? 0 : 1);
}

// --- one slice in this process ---
const slice = pages.slice(Number(startArg), Number(startArg) + Number(countArg));
const db = new DatabaseSync(process.env.NGATE_DB ?? resolve(here, "../one-trip-render/deck-analyzed.sqlite3"), { readOnly: true });
const counters = { posts: 0, stmts: 0, bytes: 0 };
const toJs = (v) => v?.type === "null" ? null : v?.type === "integer" ? Number(v.value) : v?.type === "blob" ? Buffer.from(v.base64, "base64") : v.value;
const toWire = (x) => x === null || x === undefined ? { type: "null" } : typeof x === "bigint" ? { type: "integer", value: x.toString() }
  : typeof x === "number" ? (Number.isInteger(x) ? { type: "integer", value: String(x) } : { type: "float", value: x })
  : typeof x === "string" ? { type: "text", value: x } : { type: "blob", base64: Buffer.from(x).toString("base64") };
function execute(stmt) {
  const st = db.prepare(stmt.sql);
  st.setReturnArrays(true);
  const args = (stmt.args ?? []).map(toJs);
  const cols = st.columns();
  if (cols.length > 0) return { cols: cols.map((c) => ({ name: c.name, decltype: c.type })), rows: st.all(...args).map((r) => r.map(toWire)), affected_row_count: 0 };
  return { cols: [], rows: [], affected_row_count: 0 };
}
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    counters.posts += 1;
    const results = JSON.parse(raw).requests.map((r) => {
      if (r.type === "close") return { type: "ok", response: { type: "close" } };
      counters.stmts += 1;
      try { return { type: "ok", response: { type: "execute", result: execute(r.stmt) } }; }
      catch (e) { return { type: "error", error: { message: e.message, code: "SQLITE_ERROR" } }; }
    });
    const payload = JSON.stringify({ results });
    counters.bytes += Buffer.byteLength(payload);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(payload);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
Object.assign(process.env, {
  DECKO_DB_URL: `http://127.0.0.1:${server.address().port}`, DECKO_DB_TOKEN: "local-mirror-token",
  DECKO_EDGE_GLOBAL_CACHE: "0", DECKO_EDGE_CACHE: "0", DECKO_WRITE_PATH: "0", DECKO_ONE_TRIP: "1", DECKO_ONE_TRIP_STORE: "inline",
});
const dir = resolve(workDir, `slice-${startArg}`);
mkdirSync(resolve(dir, "node_modules/@bunny.net/edgescript-sdk"), { recursive: true });
writeFileSync(resolve(dir, "node_modules/@bunny.net/edgescript-sdk/package.json"), JSON.stringify({ name: "@bunny.net/edgescript-sdk", type: "module", main: "index.mjs" }));
writeFileSync(resolve(dir, "node_modules/@bunny.net/edgescript-sdk/index.mjs"), "export const net={http:{serve(h){globalThis.__served=h;}}};");
copyFileSync(resolve(bundle), resolve(dir, "bundle.mjs"));
await import(pathToFileURL(resolve(dir, "bundle.mjs")).href);
const SLOT = /data-slot-id="[0-9a-f]+"/g;
for (const p of slice) {
  counters.posts = 0; counters.stmts = 0; counters.bytes = 0;
  const c0 = process.cpuUsage();
  const t0 = performance.now();
  const r = await globalThis.__served(new Request(`https://edge.test/${encodeURIComponent(p.replace(/ /g, "_")).replace(/%2B/g, "+")}`));
  const text = await r.text();
  const wall = Math.round(performance.now() - t0);
  const cu = process.cpuUsage(c0);
  writeFileSync(resolve(dir, fname(p)), text);
  let same = false;
  try { same = r.status === 200 && text.replace(SLOT, "X") === readFileSync(resolve(REF, fname(p)), "utf8").replace(SLOT, "X"); } catch {}
  appendFileSync(resFile, JSON.stringify({ page: p, status: r.status, same, bytes: text.length, posts: counters.posts, stmts: counters.stmts, db_bytes: counters.bytes, wall_ms: wall, cpu_ms: Math.round((cu.user + cu.system) / 1000) }) + "\n");
}
server.close();
process.exit(0);
