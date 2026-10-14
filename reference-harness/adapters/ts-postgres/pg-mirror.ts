// Moves a deck between the harness's SQLite file and PostgreSQL.
//
// The harness hands every adapter a SQLite deck file and grades persistence
// by reading that file after each step (runner/deck-state.mjs). This adapter
// serves the engine from PostgreSQL instead, so it loads the file into
// PostgreSQL at start (loadSqliteIntoPostgres) and, after any step that
// wrote, copies PostgreSQL's tables back over the file's
// (copyPostgresIntoSqlite). What the grader reads is therefore the state the
// engine left in PostgreSQL.

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import type { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { PostgresDriver } from "../../../src/server/drivers/postgres.js";

const ROWS_PER_INSERT = 200;

interface SchemaRow {
  type: string;
  name: string;
  tbl_name: string;
  sql: string | null;
}

async function userTables(sqlite: LocalSqliteDriver): Promise<SchemaRow[]> {
  return (
    await sqlite.query<SchemaRow>(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY rowid",
      [],
    )
  ).rows;
}

const quote = (name: string): string => `"${name.replace(/"/g, '""')}"`;

/** Creates the SQLite deck's schema in PostgreSQL and copies every row:
 *  tables and rows first, then indexes, then triggers (so loading does not
 *  fire them). */
export async function loadSqliteIntoPostgres(sqlite: LocalSqliteDriver, pg: PostgresDriver): Promise<void> {
  const schema = await userTables(sqlite);
  const tables = schema.filter((s) => s.type === "table");
  for (const t of tables) await pg.query(t.sql!, []);
  for (const t of tables) {
    const rows = (await sqlite.query<Record<string, unknown>>(`SELECT * FROM ${quote(t.name)}`, [])).rows;
    await insertRows(pg, t.name, rows);
  }
  for (const s of schema.filter((x) => x.type === "index")) await pg.query(s.sql!, []);
  for (const s of schema.filter((x) => x.type === "trigger")) await pg.query(s.sql!, []);
}

async function insertRows(target: SQLDatabaseDriver, table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]!);
  const head = `INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")}) VALUES `;
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const chunk = rows.slice(i, i + ROWS_PER_INSERT);
    const values = chunk.map(() => `(${columns.map(() => "?").join(", ")})`).join(", ");
    const params = chunk.flatMap((r) => columns.map((c) => r[c] ?? null));
    await target.query(head + values, params);
  }
}

/** Replaces every table of the SQLite file with PostgreSQL's rows, in one
 *  SQLite transaction. deck_data_version is written last, since the file's
 *  own triggers bump it while the card tables are rewritten. sqlite_sequence
 *  follows the inserted ids, as it does when SQLite itself writes them. */
export async function copyPostgresIntoSqlite(pg: PostgresDriver, sqlite: LocalSqliteDriver): Promise<void> {
  const tables = (await userTables(sqlite)).filter((s) => s.type === "table").map((s) => s.name);
  tables.sort((a, b) => Number(a === "deck_data_version") - Number(b === "deck_data_version"));
  await sqlite.transaction(async () => {
    for (const table of tables) {
      const rows = (await pg.query<Record<string, unknown>>(`SELECT * FROM ${quote(table)}`, [])).rows;
      await sqlite.query(`DELETE FROM ${quote(table)}`, []);
      await insertRows(sqlite, table, rows.map(toSqliteRow));
    }
  });
}

function toSqliteRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Uint8Array ? Buffer.from(v) : v;
  return out;
}

/** Passes statements to PostgreSQL and records whether any of them could
 *  have written, so the adapter copies back only after a step that wrote. */
export class WriteTrackingDriver implements SQLDatabaseDriver {
  dirty = false;
  readonly transactionGuarantee;

  constructor(private readonly inner: PostgresDriver) {
    this.transactionGuarantee = inner.transactionGuarantee;
  }

  private note(sql: string): void {
    // A statement writes when it starts with a write verb, or when a CTE
    // ends in one (`WITH ... ) INSERT|UPDATE|DELETE`).
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
