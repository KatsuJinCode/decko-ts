// Bounded stock-Ruby PostgreSQL evidence; never substitutes port outputs.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { PGlite } from "@electric-sql/pglite";
import { AdapterSession } from "../../reference-harness/runner/adapter-process.mjs";
import { verifyFixture } from "../../reference-harness/runner/manifest.mjs";

const [pgGemHome, socketPackage, outputArg] = process.argv.slice(2);
const allSemantics = process.argv.includes("--all-semantics");
if (!pgGemHome || !socketPackage || !outputArg) throw new Error("usage: ruby-postgres-links-probe.mjs <pg-gem-home> <pglite-socket-package> <report.json>");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.resolve(outputArg);
const fixture = path.join(repo, "reference-harness/fixtures/synthetic-v1");
const identity = verifyFixture(fixture);
if (identity.problems.length) throw new Error(JSON.stringify(identity.problems));
const digest = data => createHash("sha256").update(data).digest("hex");
const q = name => `"${name.replaceAll('"', '""')}"`;
const slash = name => name.replaceAll("\\", "/");
const { PGLiteSocketServer } = await import(pathToFileURL(path.join(path.resolve(socketPackage), "dist/index.js")).href);
mkdirSync(path.dirname(output), { recursive: true });
const root = mkdtempSync(path.join(path.dirname(output), "ruby-pg-owned-"));
let pg, server, session, sqlite;
const report = { complete: false, fixture: "synthetic-v1", fixture_digest: identity.digest, operations: [] };
report.selection = allSemantics ? null : { filter: "^search:(anonymous|member|admin):Links To Topic 001$", limit: null };
report.started = new Date().toISOString();
const save = () => writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
function child(command, args, env, cwd) {
  return new Promise((resolve, reject) => {
    const p = spawn(command, args, { env: { ...process.env, ...env }, cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", data => out += data);
    p.stderr.on("data", data => err += data);
    p.once("error", reject);
    p.once("close", code => code === 0 ? resolve({ out, err }) : reject(new Error(`${command} exited ${code}: ${err}\n${out}`)));
  });
}
try {
  const db = path.join(root, "deck.sqlite3");
  cpSync(path.join(fixture, "deck/deck.sqlite3"), db);
  cpSync(path.join(fixture, "deck/files"), path.join(root, "files"), { recursive: true });
  mkdirSync(path.join(root, "adapter"));
  sqlite = new DatabaseSync(db);
  sqlite.exec("PRAGMA journal_mode=DELETE");
  pg = await PGlite.create();
  server = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: 0, maxConnections: 4 });
  await server.start();
  const gemfile = path.join(root, "Gemfile");
  writeFileSync(gemfile, readFileSync(path.join(repo, "reference-harness/oracle/app/Gemfile"), "utf8") + '\ngem "pg", "1.7.0"\n');
  cpSync(path.join(repo, "reference-harness/oracle/app/Gemfile.lock"), gemfile + ".lock");
  const env = {
    GEM_HOME: "C:/Ruby33-x64/lib/ruby/gems/3.3.0",
    GEM_PATH: `${slash(path.resolve(pgGemHome))};C:/Ruby33-x64/lib/ruby/gems/3.3.0`,
    BUNDLE_GEMFILE: slash(gemfile), RAILS_ENV: "development",
    DATABASE_URL: `postgresql://postgres@${server.getServerConn()}/template1`,
    HARNESS_DECK: slash(db), HARNESS_DECK_JSON: slash(path.join(fixture, "deck.json")),
    HARNESS_FILES: slash(path.join(root, "files")), HARNESS_WORK: slash(path.join(root, "adapter")),
    DECKO_FILES_DIR: slash(path.join(root, "files")), DECKO_CACHE_DIR: slash(path.join(root, "adapter/cache")),
    RUBY_THREAD_VM_STACK_SIZE: "67108864", RUBY_THREAD_MACHINE_STACK_SIZE: "268435456",
  };
  await child("C:/Ruby33-x64/bin/ruby.exe", ["C:/Ruby33-x64/bin/bundle", "lock", "--local"], env, root);
  report.lock_sha256 = digest(readFileSync(gemfile + ".lock"));
  const schemaLoader = path.join(root, "native-schema.rb");
  writeFileSync(schemaLoader, 'require "bundler/setup"\nrequire "active_record"\nrequire "pg"\nrequire "json"\nrequire "digest"\nActiveRecord::Base.establish_connection ENV.fetch("DATABASE_URL")\np = File.join(Gem.loaded_specs.fetch("card").full_gem_path, "db/schema.rb")\nload p\nputs JSON.generate(schema_sha256: Digest::SHA256.file(p).hexdigest, ruby: RUBY_VERSION, pg: PG::VERSION, adapter: ActiveRecord::Base.connection.adapter_name)\n');
  const native = await child("C:/Ruby33-x64/bin/ruby.exe", [schemaLoader], env, root);
  report.native_schema = JSON.parse(native.out.trim().split(/\r?\n/).at(-1));
  report.tables = {};
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  for (const { name } of tables) {
    const columns = sqlite.prepare(`PRAGMA table_info(${q(name)})`).all().map(c => c.name);
    const meta = await pg.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [name]);
    const types = new Map(meta.rows.map(c => [c.column_name, c.data_type]));
    if (columns.some(c => !types.has(c))) throw new Error(`stock native schema lacks fixture columns in ${name}`);
    await pg.query(`DELETE FROM ${q(name)}`);
    const rows = sqlite.prepare(`SELECT * FROM ${q(name)}`).all();
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const args = chunk.flatMap(row => columns.map(c => row[c] === null ? null : types.get(c) === "boolean" ? Boolean(row[c]) : row[c]));
      const marks = chunk.map((_, n) => `(${columns.map((_, c) => `$${n * columns.length + c + 1}`).join(",")})`).join(",");
      await pg.query(`INSERT INTO ${q(name)} (${columns.map(q).join(",")}) VALUES ${marks}`, args);
    }
    if (columns.includes("id")) await pg.query("SELECT setval(pg_get_serial_sequence($1,'id'),COALESCE((SELECT MAX(id) FROM " + q(name) + "),0)+1,false)", [name]);
    report.tables[name] = rows.length;
  }
  report.database = (await pg.query("SELECT version() AS version")).rows[0];
  report.card_types = (await pg.query("SELECT c.name,c.type_id,t.name AS type_name,t.codename FROM cards c JOIN cards t ON t.id=c.type_id WHERE c.name IN ('Mira Member','Ada Admin','Anonymous') ORDER BY c.id")).rows;
  const started = Date.now();
  session = new AdapterSession({ dir: path.join(repo, "reference-harness/oracle/app"), command: ["C:/Ruby33-x64/bin/ruby.exe", "script/decko", "runner", slash(path.join(repo, "reference-harness/oracle/adapter.rb"))] }, env);
  report.engine = await session.start();
  report.boot_ms = Date.now() - started;
  const operations = readFileSync(path.join(fixture, "ops/semantics.jsonl"), "utf8").trim().split("\n").map(JSON.parse)
    .filter(op => allSemantics || /^search:(anonymous|member|admin):Links To Topic 001$/.test(op.id));
  report.ops_total = operations.length;
  process.stderr.write(`Ruby ${report.engine.version.ruby} PostgreSQL ready; ${operations.length} semantics operations\n`);
  const operationsStarted = Date.now();
  for (const { id, ...op } of operations) {
    const answer = await session.request(op);
    report.operations.push({ id, ...(answer.ok ? { result: answer.result } : { error: answer.error }) });
    save();
    if (report.operations.length % 100 === 0) process.stderr.write(`${report.operations.length}/${operations.length} semantics, ${(Date.now() - operationsStarted) / report.operations.length} ms/op\n`);
  }
  report.complete = report.operations.length === operations.length;
  report.finished = new Date().toISOString();
} finally {
  await session?.close();
  await server?.stop();
  await pg?.close();
  sqlite?.close();
  if (path.dirname(root) !== path.dirname(output) || !path.basename(root).startsWith("ruby-pg-owned-")) throw new Error("scratch path escaped output directory");
  rmSync(root, { recursive: true, force: true });
  save();
}
console.log(JSON.stringify({ ...report, operations: report.operations.filter(op => /^search:(anonymous|member|admin):Links To Topic 001$/.test(op.id)), operations_count: report.operations.length }, null, 2));
if (!report.complete || report.operations.some(op => op.error)) process.exitCode = 1;
