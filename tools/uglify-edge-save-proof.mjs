// Actual local workerd host/save proof. No browser, deployment or native Ruby.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { register, builtinModules } from "node:module";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { coffeescriptNodeBuiltinStubs } from "./vendor/coffeescript-edge-bundler-stubs.mjs";

const root = process.cwd();
const out = process.argv[2];
assert.ok(out && path.isAbsolute(out), "pass a fresh absolute private evidence directory");
mkdirSync(out);
register(pathToFileURL(path.join(root, "tools/oracle/typescript-source-loader.mjs")));
const { CloudflareD1Adapter } = await import("../src/server/drivers/d1.ts");
const { openSameDatabase } = await import("../src/server/same-database.ts");
const { SessionStore } = await import("../src/card/auth/session-store.ts");
const fixture = path.join(root, "reference-harness/fixtures/synthetic-v3-mod-probes-ruby33");
const spec = JSON.parse(readFileSync(path.join(fixture, "deck.json"), "utf8"));
const hash = data => createHash("sha256").update(data).digest("hex");
const builtins = [...new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)])];
const records = [];
const bundleOnly = process.argv.includes("--bundle-only");
const debugFactories = process.argv.includes("--debug-factories");
const traceSql = process.argv.includes("--trace-sql");
const selectedHost = process.argv.find(arg => arg.startsWith("--host="))?.slice(7);
const debugPlugin = { name: "private-factory-failure-diagnostic", setup(builder) {
  builder.onLoad({ filter: /uglify-harmony-static\.generated\.ts$/ }, args => ({ loader: "ts", contents: readFileSync(args.path,"utf8")
    .replace("throw new Error('unrecorded trusted Uglifier constructor')", "throw new Error('unrecorded trusted Uglifier constructor: '+key)") }));
} };
const hosts = [
  { name: "root", entry: "worker.ts", compatibilityDate: "2026-08-01" },
  { name: "retained-cf", entry: "deploy/cf-worker-src/cf-edge-engine-entry.ts", compatibilityDate: "2026-09-01" },
  { name: "bunny-sdk", entry: "deploy/bunny-worker-src/bunny-edge-engine-entry.ts", bundleOnly: true },
];
const quote = name => `"${name.replaceAll('"','""')}"`;
const tables = ["cards", "card_acts", "card_actions", "card_changes", "card_virtuals", "card_references"];

for (const host of hosts) {
  if (selectedHost && host.name !== selectedHost) continue;
  const t0 = performance.now();
  const settings = { entryPoints: [path.join(root, host.entry)], bundle: true, write: false,
    format: "esm", platform: "neutral", target: "es2022", minify: true,
    external: [...builtins, "@bunny.net/edgescript-sdk"], conditions: ["deno", "bunny", "import", "default"],
    mainFields: ["module", "main"], alias: { "@cf-wasm/photon": "@cf-wasm/photon/node" },
    plugins: [...(debugFactories ? [debugPlugin] : []), coffeescriptNodeBuiltinStubs()], metafile: true,
    banner: { js: "globalThis.__deckoStaticProofEval0=Date.now();" }, logLevel: "warning" };
  const built = await build(settings);
  const bundle = built.outputFiles[0].text;
  const imports = Object.values(built.metafile.outputs).flatMap(file => file.imports);
  assert.ok(!Object.keys(built.metafile.inputs).some(file => file.endsWith("uglify-harmony-compile-engine.ts")), "Node VM provider leaked into edge graph");
  writeFileSync(path.join(out, `${host.name}-imports.json`), JSON.stringify({ imports, inputs: Object.keys(built.metafile.inputs) }, null, 2) + "\n");
  // Some existing host graph branches already import Node filesystem modules.
  // Measure that baseline explicitly; do not label old imports as provider
  // additions or silently waive a new import. The baseline is an in-memory
  // removal of only this provider's two wiring lines, never a source edit.
  const baselinePlugin = { name: "existing-host-without-static-validator", setup(builder) {
    builder.onLoad({ filter: /cloudflare-write-routes\.ts$/ }, args => ({ loader: "ts", contents: readFileSync(args.path,"utf8")
      .replace(/^import \{ staticUglifyHarmonySyntaxError \}.*\n/m, "")
      .replace(/^\s*javascriptValidator: staticUglifyHarmonySyntaxError,\r?\n/m, "") }));
  } };
  const baseline = await build({ ...settings, plugins: [baselinePlugin, coffeescriptNodeBuiltinStubs()] });
  const baselineImports = Object.values(baseline.metafile.outputs).flatMap(file => file.imports);
  const sensitive = list => list.filter(item => /^(node:)?(fs(?:\/promises)?|vm)$/.test(item.path)).map(item => `${item.kind}:${item.path}`).sort();
  assert.deepEqual(sensitive(imports), sensitive(baselineImports), "static provider added a Node fs/vm import");
  const record = { host: host.name, entry: host.entry, bytes: Buffer.byteLength(bundle), sha256: hash(bundle),
    buildMs: Math.round(performance.now() - t0), imports, compatibilityDate: host.compatibilityDate,
    containsStaticProvider: Object.keys(built.metafile.inputs).some(file => file.endsWith("uglify-harmony-static.generated.ts")),
    baselineBytes: baseline.outputFiles[0].contents.length, existingNodeFilesystemImports: sensitive(baselineImports),
    addedBytes: Buffer.byteLength(bundle)-baseline.outputFiles[0].contents.length, operations: [] };
  records.push(record);
  assert.equal(record.containsStaticProvider, true);
  if (host.bundleOnly || bundleOnly) continue;

  let mf;
  let source;
  try {
    const start = performance.now();
    mf = new Miniflare(convertV4MiniflareOptions({ compatibilityDate: host.compatibilityDate,
      compatibilityFlags: ["nodejs_compat"], modules: [
        { type: "ESModule", path: "proof.mjs", contents: `import host from './actual-host.mjs';
const initializedAt=Date.now(),sqlErrors=[];
function observeDB(db){const originals=new WeakMap(),queries=new WeakMap();
function wrap(inner,sql,args){const wrapped={bind(...values){return wrap(inner.bind(...values),sql,values)},
 async all(...p){try{return await inner.all(...p)}catch(e){sqlErrors.push({sql,parameters:args.length,error:String(e)});throw e}},
 async run(...p){try{return await inner.run(...p)}catch(e){sqlErrors.push({sql,parameters:args.length,error:String(e)});throw e}},
 async first(...p){try{return await inner.first(...p)}catch(e){sqlErrors.push({sql,parameters:args.length,error:String(e)});throw e}},
 async raw(...p){return inner.raw(...p)}}; originals.set(wrapped,inner);queries.set(wrapped,{sql,parameters:args.length});return wrapped;}
return{prepare(sql){return wrap(db.prepare(sql),sql,[])},async batch(statements){try{return await db.batch(statements.map(s=>originals.get(s)??s))}catch(e){sqlErrors.push({statements:statements.map(s=>queries.get(s)),error:String(e)});throw e}},exec(...p){return db.exec(...p)}};}
let observed;export default {fetch(req,env,ctx){const p=new URL(req.url).pathname;if(p==='/__proof/startup')return Response.json({moduleWallMs:initializedAt-globalThis.__deckoStaticProofEval0});if(p==='/__proof/sql')return Response.json(sqlErrors);
if(${traceSql}){observed??=observeDB(env.DB);env={...env,DB:observed};}return host.fetch(req,env,ctx);}};` },
        { type: "ESModule", path: "actual-host.mjs", contents: bundle },
      ], modulesRoot: root, d1Databases: { DB: `static-js-${host.name}` },
      bindings: { DECKO_WRITE_PATH: "1", DECKO_FIRST_RUN: "0", DECKO_ALLOW_ORIGINS: "https://deck.example" }, port: 0,
    }));
    const binding = await mf.getD1Database("DB");
    record.runtimeReadyMs = Math.round(performance.now() - start);
    // Read the original fixture, never mutate/copy it on disk. D1 is owned
    // ephemeral runtime state and is disposed in finally.
    source = new DatabaseSync(path.join(fixture, "deck/deck.sqlite3"), { readOnly: true });
    const schema = source.prepare("SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND type IN ('table','index') ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,name").all();
    for (const row of schema.filter(row => row.type === "table")) await binding.prepare(row.sql).run();
    for (const row of schema.filter(row => row.type === "table")) {
      const rows = source.prepare(`SELECT * FROM ${quote(row.name)}`).all();
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]);
      const sql = `INSERT INTO ${quote(row.name)} (${columns.map(quote).join(",")}) VALUES (${columns.map(()=>"?").join(",")})`;
      for (let i=0;i<rows.length;i+=75) await binding.batch(rows.slice(i,i+75).map(value => binding.prepare(sql).bind(...columns.map(column => value[column]))));
    }
    for (const row of schema.filter(row => row.type === "index")) await binding.prepare(row.sql).run();
    await binding.prepare("ANALYZE").run();
    const driver = new CloudflareD1Adapter(binding);
    record.portObjects = await openSameDatabase(driver);
    const actor = source.prepare("SELECT id FROM cards WHERE name = ? AND trash = 0").get(spec.actors.admin.card);
    const js = source.prepare("SELECT id FROM cards WHERE codename='java_script' AND trash=0").get();
    const plain = source.prepare("SELECT id FROM cards WHERE codename='plain_text' AND trash=0").get();
    assert.ok(actor && js && plain);
    const session = await new SessionStore({ driver }).createSession(Number(actor.id));
    const snapshot = async () => Object.fromEntries(await Promise.all(tables.map(async table => [table, (await driver.query(`SELECT * FROM ${quote(table)} ORDER BY rowid`, [])).rows])));
    const request = async (method, name, card) => {
      const t=performance.now();
      const response = await mf.dispatchFetch(`https://deck.example/${encodeURIComponent(name)}.json`, {
        method, redirect: "manual", headers: { "content-type": "application/json", origin: "https://deck.example", cookie: `decko_ts_session=${session.token}` },
        body: JSON.stringify({ card }),
      });
      const text = await response.text();
      record.operations.push({ method, name, status: response.status, elapsedMs: Math.round(performance.now()-t), body: text.slice(0,2500) });
      if (traceSql && response.status >= 500) record.sqlErrors = await (await mf.dispatchFetch("https://deck.example/__proof/sql")).json();
      return { response, text };
    };
    const bootStart=performance.now();
    const startup=await mf.dispatchFetch("https://deck.example/__proof/startup");
    record.firstDispatchMs=Math.round(performance.now()-bootStart);
    record.startup=await startup.json();
    const valid = "let x = 1; const f = n => n + x;";
    const created = await request("POST", "Edge Script", { type_id: Number(js.id), content: valid });
    assert.ok([200,303].includes(created.response.status), created.text);
    const before = await snapshot();
    const denied = await request("PUT", "Edge Script", { content: "probe e106b" });
    assert.equal(denied.response.status, 422, denied.text);
    assert.ok(denied.text.includes("Unexpected token: name (e106b)"), denied.text);
    assert.deepEqual(await snapshot(), before, "failed update changed card/history/virtual/reference rows");
    const deniedCreate = await request("POST", "Invalid Edge Script", { type_id: Number(js.id), content: "probe e106b" });
    assert.equal(deniedCreate.response.status, 422, deniedCreate.text);
    assert.deepEqual(await snapshot(), before, "failed create persisted rows");
    const ordinary = await request("POST", "Ordinary Edge Text", { type_id: Number(plain.id), content: "probe e106b" });
    assert.ok([200,303].includes(ordinary.response.status), ordinary.text);
    record.validationAndAtomicity = "PASS";
  } finally {
    source?.close();
    await mf?.dispose();
    writeFileSync(path.join(out, "observed.json"), JSON.stringify({ sourceFixture: "synthetic-v3-mod-probes-ruby33", session: "first-class SessionStore fixture; no signin parity claim", records }, null, 2) + "\n");
    console.log(JSON.stringify({ host: host.name, bytes: record.bytes, runtimeReadyMs: record.runtimeReadyMs, firstDispatchMs: record.firstDispatchMs, startup: record.startup, validationAndAtomicity: record.validationAndAtomicity, operations: record.operations.map(({body,...rest})=>rest) }));
  }
}
writeFileSync(path.join(out, "observed.json"), JSON.stringify({ sourceFixture: "synthetic-v3-mod-probes-ruby33", session: "first-class SessionStore fixture; no signin parity claim", records }, null, 2) + "\n");
