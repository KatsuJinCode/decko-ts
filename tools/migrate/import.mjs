// import.mjs — stream a parsed mysqldump into a decko-ts SQLite database.
//
// Data-faithful by contract: every row lands with its original id, its
// original column values (including trash=1 rows and NULL junctions), and
// no editorial transforms. The decko-ts fetch layer (src/card/fetch) owns
// every derived view of that data:
//   - simple cards (left_id IS NULL): fetch composes name/key FROM the
//     columns (card-record.ts composeCardRecord);
//   - compound cards (left_id NOT NULL): fetch composes name/key through
//     the Lexicon junction walk (fetch/lexicon.ts) — post-2020 production
//     rows carry NULL name/key columns BY CONVENTION and must stay NULL.
// The one repair this tool may make: a SIMPLE card whose dump row lacks a
// key column gets key = deriveKey(name) when the caller supplies a
// deriver (tests supply the real DeckoName algebra from src/card/name.ts;
// the CLI reports such rows instead of guessing). Counts land in the
// migration report either way.
//
// Memory contract: rows flow parser -> importer one at a time; INSERTs are
// batched (default 1000 statements per transaction) and flushed, so peak
// memory is O(batch + parser buffer) regardless of dump size.
//
// Resumability: each committed batch advances a checkpoint row in the same
// transaction (IMPORT_PROGRESS_TABLE), so an interrupted import resumes from
// its last committed batch; see importDump.
//
// Index strategy: db/schema.sqlite.sql declares tables + indexes in one
// file. This importer executes the CREATE TABLE statements first, imports
// everything, then applies the CREATE INDEX statements — bulk load without
// per-row index maintenance is the standard order-of-magnitude win on
// multi-million-row tables.

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { dumpRows } from "./parse-dump.mjs";

/** Split a DDL file into executable statements: strip `--` comments
 *  (quote-aware; the schema file carries no "--" inside literals) and
 *  split on ";". Same technique proven in tests (fetch-test-storage) —
 *  TRIGGER-AWARE: the [ENGINE-FRESHNESS] block's trigger bodies carry ";"
 *  before their closing "END;", so the scanner tracks CREATE TRIGGER
 *  BEGIN/END and keeps body semicolons verbatim. */
export function splitSqlStatements(ddl) {
  const statements = [];
  let current = "";
  let quote = null;
  let inTriggerBody = false;
  for (let i = 0; i < ddl.length; i++) {
    const ch = ddl[i];
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "-" && ddl[i + 1] === "-") {
      while (i < ddl.length && ddl[i] !== "\n") i++;
      // Keep the line break: parseTargetSchema parses columns per line,
      // and joining lines would hide every column after the first.
      current += " \n";
      continue; // i sits on the "\n"; the loop's i++ moves past it
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < ddl.length && /[A-Za-z0-9_]/.test(ddl[j])) j++;
      const word = ddl.slice(i, j).toUpperCase();
      if (!inTriggerBody && word === "BEGIN" && /CREATE\s+TRIGGER/i.test(current)) {
        inTriggerBody = true;
      } else if (inTriggerBody && word === "END") {
        inTriggerBody = false;
      }
      current += ddl.slice(i, j);
      i = j - 1;
      continue;
    }
    if (ch === ";") {
      if (inTriggerBody) {
        current += ch;
        continue;
      }
      statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") statements.push(current.trim());
  return statements.filter((s) => s !== "");
}

/**
 * Parse the target DDL: per-table column order (positional import needs
 * it) plus the table/index statement split. Column extraction follows the
 * DDL grammar of db/schema.sqlite.sql (one `"col" TYPE ...` per line).
 * Reading column order from the DDL (instead of a hardcoded copy) removes
 * the drift risk: whatever the schema stream lands is what imports.
 */
export function parseTargetSchema(ddlPath) {
  const ddl = readFileSync(ddlPath, "utf8");
  const statements = splitSqlStatements(ddl);
  const createTables = [];
  const createIndexes = [];
  const createTriggers = [];
  const postLoadStatements = [];
  const pragmas = [];
  const tableColumns = {};
  for (const statement of statements) {
    const tableMatch = statement.match(/^CREATE TABLE "([a-z_]+)"\s*\(/);
    if (tableMatch) {
      const table = tableMatch[1];
      createTables.push(statement);
      const columns = [];
      for (const line of statement.split("\n")) {
        const colMatch = line.match(/^\s*"([a-z_]+)"\s+(TEXT|INTEGER)/);
        if (colMatch) columns.push(colMatch[1]);
      }
      tableColumns[table] = columns;
      continue;
    }
    if (/^CREATE (UNIQUE )?INDEX /.test(statement)) {
      createIndexes.push(statement);
      continue;
    }
    // [ENGINE-FRESHNESS]: the stamp triggers ride AFTER the bulk load (a
    // trigger present during the row load would fire per row — millions of
    // pointless stamp UPDATEs and a meaningless final version); the stamp
    // row's INSERT is applied with them, after the load, so a fresh import
    // ends at version 0 and the render gate reads a readable row.
    if (/^CREATE TRIGGER /i.test(statement)) {
      createTriggers.push(statement);
      continue;
    }
    if (/^INSERT INTO "deck_data_version" /.test(statement)) {
      postLoadStatements.push(statement);
      continue;
    }
    if (/^PRAGMA /i.test(statement)) {
      pragmas.push(statement);
      continue;
    }
    // Anything else in the DDL is skipped. When the schema file grows a
    // new statement kind, extend the patterns above so it is applied.
  }
  return { createTables, createIndexes, createTriggers, postLoadStatements, pragmas, tableColumns };
}

/**
 * A minimal SQLDatabaseDriver over better-sqlite3 for the local CLI
 * (sync engine under async signatures — same shape as
 * src/server/drivers/local-sqlite.ts, which tools cannot import because
 * they are plain .mjs and src is TypeScript).
 */
export class LocalSqliteToolDriver {
  constructor(path, opts = {}) {
    this.db = new Database(path, { readonly: opts.readonly ?? false });
  }

  async query(sql, params = []) {
    return this.executeOne(sql, params);
  }

  /** One transaction; each statement's own result, in order. A reading
   *  statement returns its rows: the render engine folds SELECTs into
   *  batches (the deck_data_version stamp rides the cold batch), so a
   *  batch that ran readers without returning rows breaks rendering. */
  async batch(statements) {
    const run = this.db.transaction(() =>
      statements.map((s) => this.executeOne(s.sql, s.params ?? [])),
    );
    return run();
  }

  executeOne(sql, params) {
    const stmt = this.db.prepare(sql);
    if (stmt.reader) {
      return { rows: stmt.all(...params), rowsAffected: 0 };
    }
    const info = stmt.run(...params);
    const lastRowId = info.lastInsertRowid;
    return {
      rows: [],
      rowsAffected: Number(info.changes),
      ...(lastRowId !== undefined && BigInt(lastRowId) > 0n ? { lastInsertRowId: lastRowId } : {}),
    };
  }

  /** Streaming full-table read for verification (better-sqlite3 iterator;
   *  a tool-side extension, not part of the shared driver contract). */
  *iterate(sql, params = []) {
    for (const row of this.db.prepare(sql).iterate(...params)) yield row;
  }

  close() {
    this.db.close();
  }
}

/** Import pragmas: speed-first for the one-shot bulk load. Exported so
 *  every importer in this directory opens its target with the same set. */
export const IMPORT_PRAGMAS = [
  "PRAGMA journal_mode = WAL",
  "PRAGMA synchronous = OFF",
  "PRAGMA temp_store = MEMORY",
  "PRAGMA cache_size = -65536", // 64 MiB page cache
];

const DEFAULT_BATCH_SIZE = 1000;

/** FNV-1a 32-bit over a string. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Canonical, order-independent per-table checksum accumulator: the sum of
 *  per-row FNV hashes (order-independent, duplicate-sensitive). */
export class Checksum {
  constructor() {
    this.sum = 0;
    this.count = 0;
    this.minId = undefined;
    this.maxId = undefined;
  }

  /** values: array of null | number | string | Uint8Array. */
  addRow(values, idColumnIndex) {
    let part = "";
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v === null || v === undefined) part += "\x01";
      else if (typeof v === "number") part += "n" + v;
      else if (typeof v === "string") part += "s" + v;
      else if (v instanceof Uint8Array) part += "b" + Buffer.from(v).toString("hex");
      else part += "o" + String(v);
      part += "\x1f";
    }
    this.sum = (this.sum + fnv1a(part)) % 2 ** 32;
    this.count += 1;
    if (idColumnIndex >= 0 && idColumnIndex < values.length) {
      const id = values[idColumnIndex];
      if (typeof id === "number") {
        if (this.minId === undefined || id < this.minId) this.minId = id;
        if (this.maxId === undefined || id > this.maxId) this.maxId = id;
      }
    }
  }
}

/** Tables the engine owns. A Ruby dump never carries them; the importer
 *  creates and fills them itself, and the verifier checks them for
 *  readiness, not parity. */
export const ENGINE_OWNED_TABLES = ["deck_data_version"];

/** The checkpoint table an import keeps while it runs. It is created at the
 *  start, advanced in the same transaction as every committed batch, and
 *  dropped when the import completes, so a database that still has it holds
 *  an interrupted import. */
export const IMPORT_PROGRESS_TABLE = "decko_import_progress";

/** Size and SHA-256 of the dump, streamed. A resume refuses a dump whose
 *  identity differs from the one the interrupted import started with. */
export async function dumpIdentity(dumpPath) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(dumpPath)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { bytes, sha256: hash.digest("hex") };
}

/** The interrupted import's checkpoint, or undefined when there is none. */
export async function readImportProgress(driver) {
  const table = await driver.query(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?",
    [IMPORT_PROGRESS_TABLE],
  );
  if (Number(table.rows[0]?.n ?? 0) === 0) return undefined;
  const row = (await driver.query(`SELECT * FROM "${IMPORT_PROGRESS_TABLE}" WHERE id = 1`, [])).rows[0];
  if (row === undefined) return undefined;
  return {
    rowsDone: Number(row.rows_done),
    phase: row.phase,
    dumpBytes: Number(row.dump_bytes),
    dumpSha256: row.dump_sha256,
    errors: JSON.parse(row.errors ?? "[]"),
    startedAt: row.started_at,
  };
}

async function schemaObjectExists(driver, type, name) {
  const result = await driver.query(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = ? AND name = ?",
    [type, name],
  );
  return Number(result.rows[0]?.n ?? 0) > 0;
}

/** Run a CREATE statement unless the object it names already exists, so the
 *  post-load phase can be repeated by a resumed import. */
async function createUnlessExists(driver, statement) {
  const match = /^CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i.exec(statement);
  if (match !== null && (await schemaObjectExists(driver, match[1].toLowerCase(), match[2]))) return false;
  await driver.query(statement, []);
  return true;
}

/** Apply the engine's own migrations (db/migrations/*.sql: the session
 *  table), with the same bookkeeping src/card/auth/migrations.ts keeps, so a
 *  host that runs those migrations at boot finds them applied. */
async function applyEngineMigrations(driver, migrationsDir) {
  if (migrationsDir === undefined || !existsSync(migrationsDir)) return [];
  await driver.query(
    `CREATE TABLE IF NOT EXISTS "auth_migrations" ("version" TEXT NOT NULL PRIMARY KEY, "applied_at" TEXT NOT NULL)`,
    [],
  );
  const applied = [];
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    const done = await driver.query("SELECT version FROM auth_migrations WHERE version = ?", [file]);
    if (done.rows.length > 0) continue;
    const statements = splitSqlStatements(readFileSync(join(migrationsDir, file), "utf8"));
    const appliedAt = new Date().toISOString().replace("T", " ").replace("Z", "").slice(0, 23);
    await driver.batch([
      ...statements.map((sql) => ({ sql, params: [] })),
      { sql: "INSERT INTO auth_migrations (version, applied_at) VALUES (?, ?)", params: [file, appliedAt] },
    ]);
    applied.push(file);
  }
  return applied;
}

/** Shape of the importDump() return value (report input for the verifier):
 *  - counts: table -> source row count
 *  - checksums: table -> { sum, count, minId, maxId } (order-independent)
 *  - warnings: metadata-only strings (never row content)
 *  - skippedTables: non-core table -> skipped row count
 *  - keyRepair: { derived, nullSimpleKeys }
 *  - errors: [{ table, rowId, message }] (message truncated, content-free)
 *  - bytesRead, rowsEmitted, elapsedMs
 *  - dump: { bytes, sha256 }
 *  - resumedFromRow: rows an earlier, interrupted run had committed (0 for
 *    a run that started fresh)
 *  - engineMigrations: engine migration files applied by this run
 */

/**
 * Stream the dump into the target database. Creates the schema (tables
 * only), imports table by table as rows arrive, applies indexes at the
 * end, and returns the source-side stats the verifier checks against.
 *
 * Resumable. Every committed batch advances a checkpoint (the count of dump
 * rows handled) in the same transaction, so a crash at any point leaves the
 * database at a batch boundary with a checkpoint that says exactly where.
 * `resume: true` continues such an import: the dump is read from the start
 * again (its checksums cover every row), rows before the checkpoint are not
 * inserted again, and the post-load phase skips what already exists.
 */
export async function importDump(opts) {
  const {
    dumpPath,
    driver,
    ddlPath,
    batchSize = DEFAULT_BATCH_SIZE,
  } = opts;
  const started = Date.now();
  const schema = parseTargetSchema(ddlPath);
  const tableSet = opts.tables ? new Set(opts.tables) : undefined;
  const identity = await dumpIdentity(dumpPath);

  const stats = {
    counts: {},
    checksums: {},
    warnings: [],
    skippedTables: {},
    keyRepair: { derived: 0, nullSimpleKeys: 0 },
    errors: [],
    bytesRead: 0,
    rowsEmitted: 0,
    elapsedMs: 0,
    dump: identity,
    resumedFromRow: 0,
    engineMigrations: [],
  };

  for (const pragma of IMPORT_PRAGMAS) await driver.query(pragma, []);
  for (const pragma of schema.pragmas) await driver.query(pragma, []);

  const progress = await readImportProgress(driver);
  if (progress !== undefined && !opts.resume) {
    throw new Error(
      `this database holds an interrupted import (${progress.rowsDone} dump rows committed); ` +
        "resume it (resume:true, or --resume on the command line) or start again with a new target",
    );
  }
  if (opts.resume) {
    if (progress === undefined) {
      throw new Error("nothing to resume: this database holds no interrupted import");
    }
    if (progress.dumpBytes !== identity.bytes || progress.dumpSha256 !== identity.sha256) {
      throw new Error("cannot resume: the dump is not the one this import started from (size or SHA-256 differ)");
    }
    stats.resumedFromRow = progress.rowsDone;
    stats.errors = progress.errors;
  } else if (!opts.append) {
    // Fresh-target guard: a migration into a populated deck would silently
    // mix decks (or explode on id collisions). Refuse unless append.
    if (await schemaObjectExists(driver, "table", "cards")) {
      const count = await driver.query("SELECT COUNT(*) AS n FROM cards", []);
      if ((count.rows[0]?.n ?? 0) > 0) {
        throw new Error(
          "target database already contains cards rows; refusing to import over them (pass append:true to override)",
        );
      }
    }
  }

  for (const statement of schema.createTables) await createUnlessExists(driver, statement);
  if (progress === undefined) {
    await driver.query(
      `CREATE TABLE "${IMPORT_PROGRESS_TABLE}" (
        "id" INTEGER PRIMARY KEY CHECK ("id" = 1),
        "rows_done" INTEGER NOT NULL,
        "phase" TEXT NOT NULL,
        "dump_bytes" INTEGER NOT NULL,
        "dump_sha256" TEXT NOT NULL,
        "errors" TEXT NOT NULL,
        "started_at" TEXT NOT NULL
      )`,
      [],
    );
    await driver.query(
      `INSERT INTO "${IMPORT_PROGRESS_TABLE}" (id, rows_done, phase, dump_bytes, dump_sha256, errors, started_at) VALUES (1, 0, 'load', ?, ?, '[]', ?)`,
      [identity.bytes, identity.sha256, new Date().toISOString()],
    );
  }
  const skipRows = progress?.rowsDone ?? 0;
  const loadDone = progress !== undefined && progress.phase !== "load";

  let batch = [];
  let rowsSeen = 0;
  const checkpointStatement = () => ({
    sql: `UPDATE "${IMPORT_PROGRESS_TABLE}" SET rows_done = ?, errors = ? WHERE id = 1`,
    params: [rowsSeen, JSON.stringify(stats.errors)],
  });

  const flush = async () => {
    if (batch.length === 0 && rowsSeen <= skipRows) return;
    try {
      // The rows and the checkpoint commit together or not at all.
      await driver.batch([...batch, checkpointStatement()]);
    } catch (err) {
      // Isolate the failure: run the batch statement-by-statement so one
      // bad row does not lose the chunk (and is reported with its id). The
      // retry runs inside one savepoint with the checkpoint, so it too
      // commits whole or not at all.
      await driver.query("SAVEPOINT import_batch", []);
      try {
        for (const s of batch) {
          try {
            await driver.query(s.sql, s.params);
          } catch (rowErr) {
            if (stats.errors.length >= (opts.maxErrors ?? 0)) {
              rowErr.__failingTable = s.__table;
              rowErr.__failingParamCount = s.params.length;
              rowErr.__failingSql = s.sql;
              throw rowErr;
            }
            stats.errors.push({
              table: s.__table,
              rowId: s.params[s.__idIdx] ?? null,
              message: String(rowErr?.message ?? rowErr).slice(0, 300),
            });
          }
        }
        const cp = checkpointStatement();
        await driver.query(cp.sql, cp.params);
        await driver.query("RELEASE import_batch", []);
      } catch (fatal) {
        await driver.query("ROLLBACK TO import_batch", []);
        await driver.query("RELEASE import_batch", []);
        throw fatal;
      }
    }
    batch = [];
    opts.onCheckpoint?.(rowsSeen);
  };

  const makeInsert = (table, columns) => {
    const quoted = columns.map((c) => `"${c}"`).join(", ");
    const slots = columns.map(() => "?").join(", ");
    return `INSERT INTO "${table}" (${quoted}) VALUES (${slots})`;
  };

  for await (const row of dumpRows(dumpPath, {
    tables: opts.tables,
    signal: opts.signal,
    onProgress: (bytes, rows) => {
      stats.bytesRead = bytes;
      stats.rowsEmitted = rows;
      opts.onProgress?.(bytes, rows);
    },
  })) {
    if (opts.signal?.aborted) throw new Error("import interrupted");
    rowsSeen += 1;
    // Rows an interrupted run already committed: counted and checksummed
    // (the verifier compares the whole dump), not inserted again.
    const alreadyCommitted = rowsSeen <= skipRows;
    const table = row.table;
    if (tableSet !== undefined && !tableSet.has(table)) continue;
    const targetColumns = ENGINE_OWNED_TABLES.includes(table) ? undefined : schema.tableColumns[table];
    if (targetColumns === undefined) {
      stats.skippedTables[table] = (stats.skippedTables[table] ?? 0) + 1;
      if (!stats.warnings.some((w) => w.startsWith(`skipped table \`${table}\``))) {
        stats.warnings.push(
          `skipped table \`${table}\`: not part of the decko-ts core schema (row count in skippedTables)`,
        );
      }
      continue;
    }

    // Positional or explicit-column mapping onto the target schema.
    let columns;
    let values;
    if (row.columns !== undefined) {
      const keep = [];
      const vals = [];
      for (let i = 0; i < row.columns.length && i < row.values.length; i++) {
        const name = row.columns[i];
        if (targetColumns.includes(name)) {
          keep.push(name);
          vals.push(row.values[i]);
        }
      }
      columns = keep;
      values = vals;
    } else {
      columns = targetColumns;
      values = row.values;
      if (values.length > columns.length) {
        if (!stats.warnings.some((w) => w.includes(`\`${table}\`: ${values.length} values`))) {
          stats.warnings.push(
            `table \`${table}\`: dump rows carry ${values.length} values but the target schema has ${columns.length} columns; extra values dropped (version drift; warning shown once per shape)`,
          );
        }
        values = values.slice(0, columns.length);
      } else if (values.length < columns.length) {
        if (!stats.warnings.some((w) => w.includes(`\`${table}\`: ${values.length} values`))) {
          stats.warnings.push(
            `table \`${table}\`: dump rows carry ${values.length} values but the target schema has ${columns.length} columns; missing tail columns inserted as NULL (version drift; warning shown once per shape)`,
          );
        }
        values = values.concat(new Array(columns.length - values.length).fill(null));
      }
    }

    // cards repair: simple card with content but no key column.
    if (table === "cards") {
      const idx = {
        name: columns.indexOf("name"),
        key: columns.indexOf("key"),
        leftId: columns.indexOf("left_id"),
      };
      if (idx.key >= 0 && idx.name >= 0) {
        const name = values[idx.name];
        const leftId = idx.leftId >= 0 ? values[idx.leftId] : null;
        if (values[idx.key] === null && typeof name === "string" && name !== "" && (leftId === null || leftId === undefined)) {
          if (opts.deriveKey !== undefined) {
            const derived = opts.deriveKey(name);
            if (derived !== undefined) {
              values[idx.key] = derived;
              stats.keyRepair.derived += 1;
            } else {
              stats.keyRepair.nullSimpleKeys += 1;
            }
          } else {
            stats.keyRepair.nullSimpleKeys += 1;
          }
        }
      }
    }

    // Checksums are computed on the values AS MAPPED into the target
    // schema, so source/target aggregation sees identical shapes.
    if (stats.checksums[table] === undefined) {
      stats.counts[table] = 0;
      stats.checksums[table] = new Checksum();
    }
    stats.counts[table] += 1;
    stats.checksums[table].addRow(values, columns.indexOf("id"));
    if (alreadyCommitted) continue;

    const sql = makeInsert(table, columns);
    // Per-row debug hook, off by default: set DECKO_MIGRATE_DEBUG=1 to
    // emit each row's generated SQL and source column list to stderr
    // (diagnosing column-shape drift when pointing the importer at a new
    // source schema). Not a supported interface; output shape may change.
    if (process.env.DECKO_MIGRATE_DEBUG) {
      console.error(`push ${table} cols=${columns.length} vals=${values.length} rowCols=${JSON.stringify(row.columns)} sql=${sql.slice(0, 60)}`);
    }
    batch.push({ sql, params: values, __table: table, __idIdx: columns.indexOf("id") });
    if (batch.length >= batchSize) await flush();
  }
  if (!loadDone) await flush();
  await driver.query(`UPDATE "${IMPORT_PROGRESS_TABLE}" SET phase = 'post-load' WHERE id = 1`, []);

  // Indexes after the bulk load (see module doc).
  for (const statement of schema.createIndexes) await createUnlessExists(driver, statement);
  // Planner statistics, after the rows are in and after the indexes exist.
  // ANALYZE writes only sqlite_stat1 and touches no deck table.
  await driver.query("ANALYZE", []);
  // [ENGINE-FRESHNESS] stamp triggers + row LAST — after the bulk load, so
  // the per-row trigger fire never happens during import (see
  // parseTargetSchema's note).
  for (const statement of schema.createTriggers) await createUnlessExists(driver, statement);
  for (const statement of schema.postLoadStatements) {
    await driver.query(statement.replace(/^INSERT INTO/i, "INSERT OR IGNORE INTO"), []);
  }
  stats.engineMigrations = await applyEngineMigrations(
    driver,
    opts.engineMigrationsDir ?? join(dirname(ddlPath), "migrations"),
  );
  // Complete: the checkpoint has nothing left to say.
  await driver.query(`DROP TABLE "${IMPORT_PROGRESS_TABLE}"`, []);
  // Leave the database in a sane durability state.
  await driver.query("PRAGMA synchronous = NORMAL", []);
  await driver.query("PRAGMA wal_checkpoint(TRUNCATE)", []);

  stats.elapsedMs = Date.now() - started;
  // Checksum instances -> plain objects for the report.
  const checksums = {};
  for (const [table, cs] of Object.entries(stats.checksums)) {
    checksums[table] = { sum: cs.sum, count: cs.count, minId: cs.minId, maxId: cs.maxId };
  }
  stats.checksums = checksums;
  return stats;
}

/**
 * Verification-side helper: checksum a TARGET table through any
 * SQLDatabaseDriver using keyset pagination (portable to D1/libsql; no
 * full-materialization). Aggregates mirror Checksum: count, sum of
 * per-row FNV over the same canonical serialization, id extremes.
 */
export async function checksumTargetTable(driver, table, columns, chunkRows = 10000) {
  const cs = new Checksum();
  const idIdx = columns.indexOf("id");
  const colList = columns.map((c) => `"${c}"`).join(", ");
  let lastRowid = 0;
  for (;;) {
    const result = await driver.query(
      `SELECT rowid AS __rowid, ${colList} FROM "${table}" WHERE rowid > ? ORDER BY rowid LIMIT ?`,
      [lastRowid, chunkRows],
    );
    if (result.rows.length === 0) break;
    for (const record of result.rows) {
      lastRowid = Number(record.__rowid);
      const values = columns.map((c) => record[c]);
      cs.addRow(values, idIdx);
    }
    if (result.rows.length < chunkRows) break;
  }
  return { sum: cs.sum, count: cs.count, minId: cs.minId, maxId: cs.maxId };
}

/** Row counts for every core table (parity + report input). */
export async function countAllTables(driver, tableColumns) {
  const counts = {};
  for (const table of Object.keys(tableColumns)) {
    const result = await driver.query(`SELECT COUNT(*) AS n FROM "${table}"`, []);
    counts[table] = Number(result.rows[0]?.n ?? 0);
  }
  return counts;
}
