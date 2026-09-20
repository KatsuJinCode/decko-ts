// Test storage for the render-engine tests: an in-memory better-sqlite3
// database (the REAL LocalSqliteDriver) loaded with db/schema.sqlite.sql,
// plus a counting driver that measures BOTH count axes the #1282 claim is
// judged on:
//   - statements: individual SQL statements (a batch's statements count one
//     each)
//   - roundTrips: driver calls (driver.batch = ONE round trip - on the edge
//     drivers, e.g. D1, that is literally one HTTP request; this is the
//     axis the constant-queries promise is about)
// Lives INSIDE tests/card/render per the stream boundaries; seeded cards are
// written DIRECTLY as rows because the write path is another stream.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import type { CardsRow } from "../../../src/server/schema.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import { DeckoName } from "../../../src/card/name.js";

/** Quote-aware `--` comment stripping + ";" split (the DDL carries no
 *  ";" inside literals - same splitter contract as the fetch stream's
 *  storage; see tests/card/fetch/fetch-test-storage.ts for the rationale). */
export function splitSqlStatements(ddl: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: string | null = null;
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
      current += " ";
      continue;
    }
    if (ch === ";") {
      statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") statements.push(current.trim());
  return statements.filter((statement) => statement !== "");
}

export interface CountSnapshot {
  /** SQL statements issued (batch statements count one each). */
  statements: number;
  /** Driver calls: query() + batch() each count ONE round trip. */
  roundTrips: number;
}

/** The render-stream counting wrapper: tracks statements AND round trips. */
export class CountingRenderDriver implements SQLDatabaseDriver {
  private counts: CountSnapshot = { statements: 0, roundTrips: 0 };
  readonly statements: string[] = [];

  constructor(private readonly inner: SQLDatabaseDriver) {}

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    this.counts = { statements: this.counts.statements + 1, roundTrips: this.counts.roundTrips + 1 };
    this.statements.push(sql);
    return this.inner.query<T>(sql, params);
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    // ONE round trip, N statements.
    this.counts = {
      statements: this.counts.statements + statements.length,
      roundTrips: this.counts.roundTrips + 1,
    };
    for (const statement of statements) this.statements.push(statement.sql);
    return this.inner.batch(statements);
  }

  snapshot(): CountSnapshot {
    return { ...this.counts };
  }

  reset(): void {
    this.counts = { statements: 0, roundTrips: 0 };
    this.statements.length = 0;
  }
}

export interface RenderTestStorage {
  engine: RenderEngine;
  fetcher: FetchEngine;
  counting: CountingRenderDriver;
  close(): void;
}

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** Fresh in-memory database + FetchEngine + RenderEngine over the counting
 *  driver. */
export async function createRenderTestStorage(): Promise<RenderTestStorage> {
  const driver = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8");
  for (const statement of splitSqlStatements(ddl)) {
    await driver.query(statement, []);
  }
  const counting = new CountingRenderDriver(driver);
  const fetcher = new FetchEngine(counting);
  return { engine: new RenderEngine(fetcher), fetcher, counting, close: () => driver.close() };
}

const DEFAULT_TYPE_ID = 2;

export interface SeedOptions {
  id?: number;
  /** Optional for junction rows (name lives in the joined side cards). */
  name?: string;
  key?: string;
  codename?: string | null;
  leftId?: number;
  rightId?: number;
  typeId?: number;
  /** The type name (string), separate from typeId. Used by the *type
   *  pattern's `pattern_applies?` check. */
  typeName?: string;
  dbContent?: string | null;
  trash?: boolean;
}

/** Direct INSERT (write path is another stream). Simple cards store
 *  name/key columns; junctions store NULL name/key + side ids (the 2020
 *  convention the schema records). The key column is the CANONICAL key
 *  (DeckoName.key - plural stems collapse: "Oracle Basics" ->
 *  "oracle_basic"), exactly what the Ruby write path stores. */
export async function seedCard(
  storage: RenderTestStorage,
  opts: SeedOptions,
): Promise<void> {
  const hasName = typeof opts.name === "string" && opts.name.length > 0;
  const isCompound = hasName && opts.name!.includes("+");
  const nameColumn = isCompound ? null : (opts.name ?? null);
  const keyColumn = hasName && !isCompound
    ? (opts.key ?? DeckoName.parse(opts.name!).key)
    : null;
  await storage.counting.query(
    `INSERT INTO cards
       (id, name, key, codename, left_id, right_id, current_revision_id,
        created_at, updated_at, creator_id, updater_id, read_rule_class,
        read_rule_id, references_expired, trash, type_id, db_content)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      opts.id ?? null,
      nameColumn,
      keyColumn,
      opts.codename ?? null,
      opts.leftId ?? null,
      opts.rightId ?? null,
      null,
      "2026-09-19 00:00:00.000",
      "2026-09-19 00:00:00.000",
      1,
      1,
      null,
      null,
      null,
      opts.trash === true ? 1 : 0,
      opts.typeId ?? DEFAULT_TYPE_ID,
      opts.dbContent ?? null,
    ],
  );
}

export type { CardsRow };
