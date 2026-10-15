// Moves a deck between the harness's SQLite file and MySQL.
//
// The harness hands every adapter a SQLite deck file and grades persistence by
// reading that file after each step (runner/deck-state.mjs). This adapter
// serves the engine from MySQL instead, so it creates Ruby Decko's own MySQL
// schema (db/schema.mysql-reference.sql, the production DDL), loads the file's
// rows into it, and after any step that wrote, copies MySQL's tables back over
// the file (copyMysqlIntoSqlite). The grader therefore reads the state the
// engine left in MySQL.
//
// The port's additive objects (deck_data_version, its triggers, auth_sessions)
// exist only in MySQL: openSameDatabase creates them there, as on any MySQL
// deck, and they are not copied back, since the file's grading compares Ruby's
// tables.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import type { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { MysqlDriver } from "../../../src/server/drivers/mysql.js";

const ROWS_PER_INSERT = 200;
const here = path.dirname(fileURLToPath(import.meta.url));
const REFERENCE_DDL = path.join(here, "../../../db/schema.mysql-reference.sql");
const CARD_GEM_DDL = path.join(here, "../../../db/schema.mysql-card-gem.sql");

interface SqliteObject {
  type: string;
  name: string;
  sql: string | null;
}

const quote = (name: string): string => `"${name.replace(/"/g, '""')}"`;

/** Ruby's CREATE TABLE statements, as the production dump records them. */
export function rubyMysqlCreateStatements(): string[] {
  const ddl = readFileSync(REFERENCE_DDL, "utf8");
  return [...ddl.matchAll(/CREATE TABLE `[^`]+` \([\s\S]*?\) ENGINE=[^;]*;/g)].map((m) =>
    m[0].replace(/ AUTO_INCREMENT=\d+/, ""),
  );
}

async function sqliteUserTables(sqlite: LocalSqliteDriver): Promise<Array<{ name: string; sql: string | null }>> {
  const rows = await sqlite.query<SqliteObject>(
    "SELECT type, name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY rowid",
    [],
  );
  return rows.rows.map((r) => ({ name: r.name, sql: r.sql }));
}

async function columnsOf(sqlite: LocalSqliteDriver, table: string): Promise<string[]> {
  return (await sqlite.query<{ name: string }>(`PRAGMA table_info(${quote(table)})`, [])).rows.map((r) => r.name);
}

/** The MySQL DDL of the card-gem tables outside the production reference
 *  (db/schema.mysql-card-gem.sql: `users`, from card-1.110.0 db/schema.rb). */
export function cardGemCreateStatements(): string[] {
  const ddl = readFileSync(CARD_GEM_DDL, "utf8");
  return [...ddl.matchAll(/CREATE TABLE `[^`]+` \([\s\S]*?\) ENGINE=[^;]*;/g)].map((m) =>
    m[0].replace(/ AUTO_INCREMENT=\d+/, ""),
  );
}

/** Creates Ruby's MySQL tables (the production reference and the card-gem
 *  tables) and copies every row of the SQLite file into the ones both schemas
 *  have, as stored. Triggers and indexes come from Ruby's DDL, not the file. A
 *  table in the file that neither DDL creates is an error, not a guess. */
export async function loadSqliteIntoMysql(sqlite: LocalSqliteDriver, mysql: MysqlDriver): Promise<void> {
  for (const statement of [...rubyMysqlCreateStatements(), ...cardGemCreateStatements()]) await mysql.query(statement, []);
  const mysqlTables = new Set(
    (await mysql.query<{ name: string }>("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()", []))
      .rows.map((r) => r.name),
  );
  for (const { name } of await sqliteUserTables(sqlite)) {
    // deck_data_version is the port's own stamp: openSameDatabase creates it on MySQL.
    if (name === "deck_data_version") continue;
    if (!mysqlTables.has(name)) throw new Error(`deck table ${name} has no MySQL DDL in the reference or the card-gem schema`);
    const mysqlCols = new Set(
      (
        await mysql.query<{ name: string }>(
          `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
          [name],
        )
      ).rows.map((r) => r.name),
    );
    const cols = (await columnsOf(sqlite, name)).filter((c) => mysqlCols.has(c));
    if (cols.length === 0) continue;
    const rows = (await sqlite.query<Record<string, unknown>>(`SELECT ${cols.map(quote).join(", ")} FROM ${quote(name)}`, [])).rows;
    await insertRows(mysql, name, cols, rows);
  }
}

async function insertRows(target: SQLDatabaseDriver, table: string, cols: string[], rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const head = `INSERT INTO ${quote(table)} (${cols.map(quote).join(", ")}) VALUES `;
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const chunk = rows.slice(i, i + ROWS_PER_INSERT);
    const values = chunk.map(() => `(${cols.map(() => "?").join(", ")})`).join(", ");
    const params = chunk.flatMap((r) => cols.map((c) => r[c] ?? null));
    await target.query(head + values, params);
  }
}

/** Replaces every table of the SQLite file with MySQL's rows, in one SQLite
 *  transaction, over the columns the file has. deck_data_version is written
 *  last, since the file's own triggers bump it while the card tables are
 *  rewritten. */
export async function copyMysqlIntoSqlite(mysql: MysqlDriver, sqlite: LocalSqliteDriver): Promise<void> {
  const tables = (await sqliteUserTables(sqlite)).map((t) => t.name).filter((t) => t !== "deck_data_version");
  await sqlite.transaction(async () => {
    for (const table of tables) {
      const cols = await columnsOf(sqlite, table);
      const rows = (await mysql.query<Record<string, unknown>>(`SELECT ${cols.map(quote).join(", ")} FROM ${quote(table)}`, [])).rows;
      await sqlite.query(`DELETE FROM ${quote(table)}`, []);
      await insertRows(sqlite, table, cols, rows.map(toSqliteRow));
    }
    if ((await columnsOf(sqlite, "deck_data_version")).length > 0) {
      const rows = (await mysql.query<Record<string, unknown>>(`SELECT "id", "version" FROM "deck_data_version"`, [])).rows;
      await sqlite.query(`DELETE FROM "deck_data_version"`, []);
      await insertRows(sqlite, "deck_data_version", ["id", "version"], rows.map(toSqliteRow));
    }
  });
}

function toSqliteRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Uint8Array ? Buffer.from(v) : v;
  return out;
}

/** Passes statements to MySQL and records whether any of them could have
 *  written, so the adapter copies back only after a step that wrote. */
export class WriteTrackingDriver implements SQLDatabaseDriver {
  dirty = false;
  readonly transactionGuarantee;

  constructor(private readonly inner: MysqlDriver) {
    this.transactionGuarantee = inner.transactionGuarantee;
  }

  private note(sql: string): void {
    // A statement writes when it starts with a write verb, or when a CTE ends
    // in one (`WITH ... ) INSERT|UPDATE|DELETE`).
    if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql) || /\)\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)) {
      this.dirty = true;
    }
  }

  query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    this.note(sql);
    return this.inner.query<T>(sql, params);
  }

  batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    for (const s of statements) this.note(s.sql);
    return this.inner.batch(statements);
  }

  transaction<R>(work: () => Promise<R>): Promise<R> {
    this.dirty = true;
    return this.inner.transaction(work);
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}
