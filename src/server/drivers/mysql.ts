// mysql.ts — the engine's SQL driver over MySQL / MariaDB (mysql2).
//
// Ruby Decko's production databases are MySQL. This driver lets the port
// open such a database as it is (see src/server/same-database.ts and
// docs/same-database.md): it speaks to Ruby's own tables and translates
// the engine's SQLite-dialect statements into MySQL at the edge.
//
// The session runs with sql_mode PIPES_AS_CONCAT and ANSI_QUOTES, so the
// engine's `||` concatenation and double-quoted identifiers mean in MySQL
// what they mean in SQLite, and with the UTC time zone. The remaining
// SQLite-only forms are rewritten by `sqliteToMysql` (below); a form it does
// not know is sent as is and fails with MySQL's own error, never silently.
//
// One connection, so the engine's single-writer assumptions hold as they do
// on the local SQLite driver; transactions are serialized by TransactionGate.
import type { Connection, ConnectionOptions, ResultSetHeader } from "mysql2/promise";
import { createConnection } from "mysql2/promise";
import {
  TransactionGate,
  rowIdOrOmit,
  type SQLDatabaseDriver,
  type SQLQueryResult,
  type SQLStatement,
  type SQLTransactionGuarantee,
} from "../driver.js";

export interface MysqlDriverOptions {
  readonly host?: string;
  readonly port?: number;
  readonly user?: string;
  readonly password?: string;
  readonly database: string;
}

/** Session settings every connection runs with (see the header). */
export const MYSQL_SESSION_SETTINGS = [
  "SET SESSION sql_mode = 'PIPES_AS_CONCAT,ANSI_QUOTES,STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION'",
  "SET SESSION time_zone = '+00:00'",
];

/**
 * Rewrite one SQLite-dialect statement into MySQL. Covers the forms the
 * engine issues; anything else passes through unchanged.
 */
export function sqliteToMysql(sql: string): string {
  // SQLite's sequence counter for a table (`sqlite_sequence`) is the table's
  // AUTO_INCREMENT counter on MySQL: the next id the table would hand out.
  const withSequence = sql.replace(
    /SELECT\s+seq\s+FROM\s+sqlite_sequence\s+WHERE\s+name\s*=\s*'([^']+)'/gi,
    "SELECT AUTO_INCREMENT AS seq FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '$1'",
  );
  const translated = outsideQuotes(withSequence, (part) =>
    scalarMinMax(part)
      // Words MySQL reserves that SQLite accepts as bare column names
      // (cards.key). Quoted unless already qualified by a table alias, or
      // part of a KEY clause: PRIMARY KEY, UNIQUE KEY, FOREIGN KEY, DUPLICATE
      // KEY, and an index definition in CREATE TABLE (KEY `name` (...) or
      // KEY (...)).
      // A quoted index name starts the next part (outsideQuotes splits there),
      // so "followed by the end of the part" also means a name follows.
      .replace(/(?<![.\w"`])(?<!(?:PRIMARY|UNIQUE|FOREIGN|DUPLICATE)\s+)\b(key)\b(?![\w"`])(?!\s*(?:[`(]|$))/gi, '"$1"')
      // Ruby's MySQL text columns already compare case-insensitively
      // (utf8mb3_unicode_ci), which is what SQLite's NOCASE asks for.
      .replace(/\s+COLLATE\s+NOCASE\b/gi, "")
      // SQLite's CTE planner hint; MySQL plans the CTE itself.
      .replace(/\bAS\s+(?:NOT\s+)?MATERIALIZED\s*\(/gi, "AS (")
      .replace(/\bINSERT\s+OR\s+IGNORE\b/gi, "INSERT IGNORE")
      .replace(/\bINSERT\s+OR\s+REPLACE\b/gi, "REPLACE")
      // SQLite's rowid counter keyword; MySQL's is AUTO_INCREMENT.
      .replace(/\bAUTOINCREMENT\b/gi, "AUTO_INCREMENT")
      // CAST target types (the operand may be a quoted literal in another
      // part, so only the target is matched). A TEXT cast gets a width: a
      // recursive CTE's column takes its type from the anchor row.
      .replace(/\s+AS\s+TEXT\s*\)/gi, " AS CHAR(10000))")
      .replace(/\s+AS\s+INTEGER\s*\)/gi, " AS SIGNED)")
      .replace(/\bLIMIT\s+-1\b/gi, "LIMIT 18446744073709551615"),
  );
  return /^\s*CREATE\s+TABLE\b/i.test(translated) ? typeUntypedColumns(translated) : translated;
}

/**
 * SQLite's MAX(a, b) and MIN(a, b) with two or more arguments are scalar
 * functions; MySQL's are aggregates and take one argument. The scalar form is
 * GREATEST / LEAST on MySQL. A call with one argument (the aggregate) is left
 * as it is.
 */
function scalarMinMax(text: string): string {
  return text.replace(/\b(MAX|MIN)\s*\(/gi, (match, fn: string, offset: number) => {
    let depth = 0;
    let topLevelComma = false;
    for (let i = offset + match.length - 1; i < text.length; i++) {
      const ch = text[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      } else if (ch === "," && depth === 1) topLevelComma = true;
    }
    if (!topLevelComma) return match;
    return fn.toUpperCase() === "MAX" ? "GREATEST(" : "LEAST(";
  });
}

/** Table-constraint keywords: a bare word starting with one of these is not a
 *  column definition. */
const CONSTRAINT_WORDS = new Set(["PRIMARY", "UNIQUE", "FOREIGN", "KEY", "INDEX", "CONSTRAINT", "CHECK", "FULLTEXT", "SPATIAL"]);

/**
 * SQLite accepts a column with no declared type (`z` in `CREATE TABLE t (z)`);
 * MySQL needs one. Such a column is given TEXT, the affinity an untyped column
 * takes its values under in the port's PostgreSQL translation too. Only the
 * top-level column list is read: a definition that is one bare identifier is
 * a column, anything with parentheses or a constraint keyword is left alone.
 */
function typeUntypedColumns(sql: string): string {
  const open = sql.indexOf("(");
  if (open < 0) return sql;
  let depth = 0;
  let quote: string | undefined;
  let start = open + 1;
  let out = sql.slice(0, open + 1);
  const flush = (end: number) => {
    const def = sql.slice(start, end);
    const bare = /^(\s*)("?)([A-Za-z_]\w*)\2(\s*)$/.exec(def);
    if (bare && !CONSTRAINT_WORDS.has(bare[3].toUpperCase())) out += `${bare[1]}${bare[2]}${bare[3]}${bare[2]} TEXT${bare[4]}`;
    else out += def;
  };
  for (let i = open + 1; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") {
      if (depth === 0) {
        flush(i);
        out += sql.slice(i);
        return out;
      }
      depth--;
    } else if (ch === "," && depth === 0) {
      flush(i);
      out += ",";
      start = i + 1;
    }
  }
  return sql;
}

/** Apply `rewrite` to the parts of `sql` outside quoted strings and
 *  identifiers ('...', "...", `...`), leaving the quoted parts untouched. */
function outsideQuotes(sql: string, rewrite: (part: string) => string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const next = sql.slice(i).search(/['"`]/);
    if (next < 0) {
      out += rewrite(sql.slice(i));
      break;
    }
    out += rewrite(sql.slice(i, i + next));
    const q = sql[i + next];
    let j = i + next + 1;
    while (j < sql.length) {
      if (sql[j] === q) {
        if (sql[j + 1] === q) j += 2;
        else break;
      } else j++;
    }
    out += sql.slice(i + next, j + 1);
    i = j + 1;
  }
  return out;
}

const toParam = (value: unknown): unknown => (typeof value === "bigint" ? value.toString() : value);

export class MysqlDriver implements SQLDatabaseDriver {
  /** The dialect this driver speaks (read by same-database.ts). */
  readonly dialect = "mysql";

  private constructor(private readonly conn: Connection) {}

  /** Open a connection and apply the session settings. */
  static async connect(options: MysqlDriverOptions): Promise<MysqlDriver> {
    const config: ConnectionOptions = {
      host: options.host ?? "127.0.0.1",
      port: options.port ?? 3306,
      user: options.user ?? "root",
      password: options.password,
      database: options.database,
      // Datetimes come back as the strings Ruby wrote, the shape the engine
      // reads from SQLite; large integers as numbers when they fit.
      dateStrings: true,
      supportBigNumbers: true,
      charset: "utf8mb4",
    };
    const conn = await createConnection(config);
    for (const sql of MYSQL_SESSION_SETTINGS) await conn.query(sql);
    return new MysqlDriver(conn);
  }

  private inTransaction = false;
  private readonly gate = new TransactionGate();

  readonly transactionGuarantee: SQLTransactionGuarantee = {
    mechanism: "native",
    atomicOnFailure: true,
    crashRecovery: "database",
    readersIsolated: true,
    serializedWriters: "driver-object",
    atomicBatch: true,
    idsReusedAfterRollback: false,
  };

  /** The id of the last row this connection inserted with an AUTO_INCREMENT
   *  id: SQLite's last_insert_rowid() for the connection. MySQL has no such
   *  function, so a statement that names it reads this value. */
  private lastRowId: number | undefined;

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    const translated = sqliteToMysql(sql).replace(
      /last_insert_rowid\(\)/gi,
      this.lastRowId === undefined ? "NULL" : String(this.lastRowId),
    );
    const [result] = await this.conn.query({ sql: translated, values: params.map(toParam) });
    if (Array.isArray(result)) return { rows: result as T[], rowsAffected: 0 };
    const header = result as ResultSetHeader;
    if (header.insertId > 0) this.lastRowId = header.insertId;
    return { rows: [], rowsAffected: header.affectedRows, lastInsertRowId: rowIdOrOmit(header.insertId) };
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    if (statements.length === 0) return [];
    if (this.inTransaction) return this.runAll(statements);
    return this.transaction(() => this.runAll(statements));
  }

  async transaction<R>(work: () => Promise<R>): Promise<R> {
    if (this.inTransaction) return work();
    return this.gate.run(async () => {
      await this.conn.query("START TRANSACTION");
      this.inTransaction = true;
      try {
        const result = await work();
        await this.conn.query("COMMIT");
        return result;
      } catch (error) {
        await this.conn.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        this.inTransaction = false;
      }
    });
  }

  async close(): Promise<void> {
    await this.conn.end();
  }

  private async runAll(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    const out: SQLQueryResult[] = [];
    for (const s of statements) out.push(await this.query(s.sql, s.params));
    return out;
  }
}
