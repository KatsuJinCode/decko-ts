// Bounded local differential for one previously captured junction-chain SQL.
// No network. The caller supplies a fully local approved deck and capture.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";

const [source, capture, output, schemaIndexes] = process.argv.slice(2);
if (!source || !capture || !output) throw new Error("usage: check-chain-join-plan.mjs <local-deck> <captured-sql-plus-params> <report.json>");
const raw = readFileSync(capture, "utf8").trimEnd();
const split = raw.lastIndexOf("\n[");
if (split < 0) throw new Error("capture needs SQL followed by a JSON parameter array");
const sql = raw.slice(0, split);
const params = JSON.parse(raw.slice(split + 1));
// The rewrite below only changes a join that is not already a CROSS JOIN, so a
// capture whose joins are all already crossed passes the junction-shape test
// and then measures one query twice: `fixed` equals `sql`, and identical_bytes
// comes back true, which is exactly what a real equivalence looks like. The
// shape test stays permissive on purpose - a CROSS-joined junction chain is
// still a junction chain - and the rewrite is then required to change something.
if (!/SELECT DISTINCT c\d+\./.test(sql) || !/JOIN cards p0 ON/.test(sql))
  throw new Error("not a junction-chain capture");
const fixed = sql.replace(/(?<!CROSS )JOIN cards ([cp]\d+) ON/g, "CROSS JOIN cards $1 ON");
if (fixed === sql)
  throw new Error("capture carries no join for the CROSS JOIN rewrite to change; it would measure one query twice");
const digest = value => createHash("sha256").update(value).digest("hex");
const report = { complete: false, source_sha256: digest(readFileSync(source)), capture_sha256: digest(raw), parameter_count: params.length, measurements: [] };
mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
const root = mkdtempSync(path.join(path.dirname(path.resolve(output)), "chain-join-owned-"));
const dbPath = path.join(root, "deck.sqlite3");
let db;
const save = () => writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
try {
  cpSync(source, dbPath);
  db = new Database(dbPath);
  report.copied_sha256 = digest(readFileSync(dbPath));
  if (report.copied_sha256 !== report.source_sha256) throw new Error("source changed while copying");
  const cards = db.prepare("SELECT count(*) AS n FROM cards").get().n;
  if (cards !== 21670) throw new Error(`expected the approved 21670-card deck, found ${cards}`);
  report.cards = cards;
  report.sqlite = db.prepare("SELECT sqlite_version() AS v").get().v;
  if (schemaIndexes) {
    // Reproduce the serving schema's cards indexes on this owned copy only.
    // No data is imported, rewritten or normalized.
    const schema = readFileSync(schemaIndexes, "utf8").replace(/--[^\n]*/g, "");
    const indexes = schema.split(";").map(s => s.trim()).filter(s => /^CREATE (?:UNIQUE )?INDEX\b/i.test(s) && /ON "cards"\s*\(/i.test(s));
    for (const index of indexes) db.exec(index.replace(/INDEX\s+/i, "INDEX IF NOT EXISTS "));
    report.schema_indexes_sha256 = digest(readFileSync(schemaIndexes));
    report.schema_indexes_applied = indexes.length;
  }
  db.exec("DROP TABLE IF EXISTS sqlite_stat1");
  db.close();
  db = new Database(dbPath);
  let reference;
  for (const stats of [false, true]) {
    if (stats) { db.exec("ANALYZE"); db.close(); db = new Database(dbPath); }
    for (const [kind, text] of [["original", sql], ["fixed", fixed]]) {
      const plan = db.prepare("EXPLAIN QUERY PLAN " + text).all(...params).map(row => row.detail);
      report.current = { stats, kind, plan, started: new Date().toISOString() };
      save();
      process.stderr.write(`${stats ? "analyzed" : "no-stats"} ${kind} starting\n`);
      const started = performance.now();
      const rows = db.prepare(text).all(...params);
      const ms = performance.now() - started;
      const bytes = JSON.stringify(rows);
      reference ??= bytes;
      const identical_bytes = bytes === reference;
      const compact = rows[0]?.__decko_compact;
      const selected_cards = typeof compact === "string" ? JSON.parse(compact).length : rows.length;
      report.measurements.push({ stats, kind, ms, rows: rows.length, selected_cards, byte_length: Buffer.byteLength(bytes), rows_sha256: digest(bytes), identical_bytes, plan });
      delete report.current;
      save();
      process.stderr.write(`${stats ? "analyzed" : "no-stats"} ${kind} ${ms.toFixed(1)} ms, identical=${identical_bytes}\n`);
      if (!identical_bytes) throw new Error("query row bytes changed");
    }
  }
  report.source_sha256_after = digest(readFileSync(source));
  if (report.source_sha256_after !== report.source_sha256) throw new Error("source deck changed during measurement");
  report.complete = true;
} finally {
  if (db?.open) db.close();
  if (path.dirname(root) !== path.dirname(path.resolve(output)) || !path.basename(root).startsWith("chain-join-owned-")) {
    throw new Error("owned scratch path escaped the report directory");
  }
  rmSync(root, { recursive: true, force: true });
  save();
}
