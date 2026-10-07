// benchmarks/speed-ship/bundle-marker-proof.mjs - the marker-edit proof run
// on a BUILT edge bundle (full or read-only) in node: render a page, append a
// marker to the `*footer` card through a separate database connection, render
// the same page again in the same process (same isolate), and check that both
// renders cost the same trips, the marker is absent from the first and present
// in the second, and nothing else changed. Works on a scratch copy of the
// mirror, removed afterwards.
//   node benchmarks/speed-ship/bundle-marker-proof.mjs <bundle.js> <work-dir> <page>...
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";

const here = dirname(fileURLToPath(import.meta.url));
const [bundle, workDir, ...pages] = process.argv.slice(2);
mkdirSync(workDir, { recursive: true });
const scratch = resolve(workDir, "scratch.sqlite3");
copyFileSync(process.env.NGATE_DB ?? resolve(here, "../one-trip-render/deck-analyzed.sqlite3"), scratch);
const MARKER = "SHIP-FRESHNESS-MARKER-BUNDLE";
let exitCode = 0;
try {
  const db = new DatabaseSync(scratch, { readOnly: true });
  let posts = 0;
  const toJs = (v) => v?.type === "null" ? null : v?.type === "integer" ? Number(v.value) : v?.type === "blob" ? Buffer.from(v.base64, "base64") : v.value;
  const toWire = (x) => x === null || x === undefined ? { type: "null" } : typeof x === "bigint" ? { type: "integer", value: x.toString() }
    : typeof x === "number" ? (Number.isInteger(x) ? { type: "integer", value: String(x) } : { type: "float", value: x })
    : typeof x === "string" ? { type: "text", value: x } : { type: "blob", base64: Buffer.from(x).toString("base64") };
  const execute = (stmt) => {
    const st = db.prepare(stmt.sql);
    st.setReturnArrays(true);
    const cols = st.columns();
    if (cols.length > 0) return { cols: cols.map((c) => ({ name: c.name, decltype: c.type })), rows: st.all(...(stmt.args ?? []).map(toJs)).map((r) => r.map(toWire)), affected_row_count: 0 };
    return { cols: [], rows: [], affected_row_count: 0 };
  };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      posts += 1;
      const results = JSON.parse(raw).requests.map((r) => {
        if (r.type === "close") return { type: "ok", response: { type: "close" } };
        try { return { type: "ok", response: { type: "execute", result: execute(r.stmt) } }; }
        catch (e) { return { type: "error", error: { message: e.message, code: "SQLITE_ERROR" } }; }
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ results }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  Object.assign(process.env, {
    DECKO_DB_URL: `http://127.0.0.1:${server.address().port}`, DECKO_DB_TOKEN: "local-mirror-token",
    DECKO_EDGE_GLOBAL_CACHE: "0", DECKO_EDGE_CACHE: "0", DECKO_WRITE_PATH: "0", DECKO_ONE_TRIP: "1", DECKO_ONE_TRIP_STORE: "inline",
  });
  const sdk = resolve(workDir, "node_modules/@bunny.net/edgescript-sdk");
  mkdirSync(sdk, { recursive: true });
  writeFileSync(resolve(sdk, "package.json"), JSON.stringify({ name: "@bunny.net/edgescript-sdk", type: "module", main: "index.mjs" }));
  writeFileSync(resolve(sdk, "index.mjs"), "export const net={http:{serve(h){globalThis.__served=h;}}};");
  copyFileSync(bundle, resolve(workDir, "bundle.mjs"));
  await import(pathToFileURL(resolve(workDir, "bundle.mjs")).href);
  const render = async (p) => {
    posts = 0;
    const r = await globalThis.__served(new Request(`https://edge.test/${encodeURIComponent(p.replace(/ /g, "_"))}?m=${Math.random()}`));
    return { status: r.status, text: await r.text(), posts };
  };
  const writer = new DatabaseSync(scratch);
  const footer = writer.prepare("SELECT id, db_content FROM cards WHERE key = ? AND trash = 0").get("*footer");
  if (!footer) throw new Error("no *footer card in the mirror");
  const SLOT = /data-slot-id="[0-9a-f]+"/g;
  // Boot the isolate's deck first, so its one-time boot trips are not
  // counted against the first page.
  await (await globalThis.__served(new Request("https://edge.test/_status"))).text();
  for (const p of pages) {
    const a = await render(p);
    writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(String(footer.db_content ?? "") + MARKER, footer.id);
    const b = await render(p);
    writer.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run(footer.db_content, footer.id);
    const otherwise = a.text.replace(SLOT, "X") === b.text.replace(SLOT, "X").replace(MARKER, "");
    const ok = a.status === 200 && b.status === 200 && a.posts === b.posts && !a.text.includes(MARKER) && b.text.includes(MARKER) && otherwise;
    if (!ok) exitCode = 1;
    console.log(JSON.stringify({ page: p, ok, trips: `${a.posts} -> ${b.posts}`, marker_first: a.text.includes(MARKER), marker_second: b.text.includes(MARKER), same_otherwise: otherwise }));
  }
  const left = writer.prepare("SELECT COUNT(*) AS n FROM cards WHERE db_content LIKE ?").get(`%${MARKER}%`).n;
  console.log(JSON.stringify({ marker_rows_left: left }));
  if (left !== 0) exitCode = 1;
  writer.close();
  db.close();
  server.close();
} finally {
  rmSync(scratch, { force: true });
  rmSync(`${scratch}-wal`, { force: true });
  rmSync(`${scratch}-shm`, { force: true });
}
process.exit(exitCode);
