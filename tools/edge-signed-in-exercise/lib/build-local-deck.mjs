// build-local-deck.mjs — a LOCAL copy of a deck, rebuilt on the ENGINE's
// schema, for the signed-in edge exercise.
//
// Why not copy the file: a deck copied as-is can carry a table shape the
// engine never provisions (the brandon-local-edit copy has an untyped
// cards.id with no index, so every `l.id = c.left_id` in the live render is
// a full scan and a Home page takes ~15 s). The Bunny deck is provisioned by
// deploy/provisioning/provision-bunny-deck.mjs, which applies the engine's
// tables and indexes BEFORE the rows and the data-version triggers AFTER.
// This builder does the same, with the source deck's rows as the content:
//
//   1. tables + indexes from the engine migrations (engineSchemaPlan.preSeed)
//   2. every row of every table the source and the engine share, copied
//      column-by-column over the columns both define
//   3. the post-seed statements (data-version triggers, stamp rows) —
//      the same statements the provisioner runs after its seed
//   4. ANALYZE, so the planner has the statistics a provisioned deck has
//
// Writes only the output file. The source is opened read-only.

import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const migrationsDir = join(repoRoot, "deploy/migrations");

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;

/**
 * @param {{ source: string, out: string }} opts
 * @returns {Promise<{ tables: Array<{ name: string, sourceRows: number, copiedRows: number, skippedColumns: string[] }>, onlySource: string[], onlyEngine: string[], preSeedSkipped: number, postSeed: number }>}
 */
export async function buildLocalDeck({ source, out }) {
  if (!existsSync(source)) throw new Error(`build-local-deck: source deck not found: ${source}`);
  for (const suffix of ["", "-wal", "-shm"]) rmSync(out + suffix, { force: true });

  // The provisioner's own plan. Imported from the deploy tree so the local
  // schema is the same statement list the Bunny deck is provisioned from.
  const { engineSchemaPlan } = await import(
    new URL("../../../deploy/provisioning/provision-bunny-deck.mjs", import.meta.url).href
  );
  const plan = await engineSchemaPlan(migrationsDir);

  const db = new Database(out);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = OFF");

  // 1. tables and indexes, before any row
  let preSeedSkipped = 0;
  for (const statement of plan.preSeed) {
    try {
      db.prepare(statement).run();
    } catch (error) {
      // An index whose table is absent is skipped (as the provisioner does);
      // anything else is a real schema error.
      if (/no such table/i.test(String(error))) {
        preSeedSkipped += 1;
        continue;
      }
      throw new Error(`build-local-deck: pre-seed statement failed: ${String(error).slice(0, 160)} :: ${statement.slice(0, 120)}`);
    }
  }

  // 2. rows, table by table, over the columns both sides define
  db.prepare("ATTACH DATABASE ? AS src").run(source);
  const engineTables = db
    .prepare("SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);
  const sourceTables = db
    .prepare("SELECT name FROM src.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);
  const shared = engineTables.filter((t) => sourceTables.includes(t));
  const report = [];
  db.transaction(() => {
    for (const table of shared) {
      const engineCols = db.prepare(`PRAGMA main.table_info(${quote(table)})`).all().map((c) => c.name);
      const sourceCols = new Set(db.prepare(`PRAGMA src.table_info(${quote(table)})`).all().map((c) => c.name));
      const cols = engineCols.filter((c) => sourceCols.has(c));
      const skippedColumns = engineCols.filter((c) => !sourceCols.has(c));
      const sourceRows = db.prepare(`SELECT COUNT(*) AS n FROM src.${quote(table)}`).get().n;
      if (cols.length > 0) {
        const list = cols.map(quote).join(", ");
        db.prepare(`INSERT INTO main.${quote(table)} (${list}) SELECT ${list} FROM src.${quote(table)}`).run();
      }
      const copiedRows = db.prepare(`SELECT COUNT(*) AS n FROM main.${quote(table)}`).get().n;
      report.push({ name: table, sourceRows: Number(sourceRows), copiedRows: Number(copiedRows), skippedColumns });
    }
  })();
  db.prepare("DETACH DATABASE src").run();

  // 3. after the rows: the triggers and the stamp rows, as the provisioner
  let postSeed = 0;
  for (const statement of plan.postSeed) {
    db.prepare(statement).run();
    postSeed += 1;
  }

  // 4. planner statistics
  db.exec("ANALYZE");
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.close();

  return {
    tables: report,
    onlySource: sourceTables.filter((t) => !engineTables.includes(t)),
    onlyEngine: engineTables.filter((t) => !sourceTables.includes(t)),
    preSeedSkipped,
    postSeed,
  };
}
