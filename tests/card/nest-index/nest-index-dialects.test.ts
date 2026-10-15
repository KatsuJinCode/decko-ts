// The stored nest index's marker check on PostgreSQL and MySQL.
//
// SQLite (and D1) are covered everywhere else; this suite is the two hosted
// dialects.
//
// PostgreSQL runs as PGlite — the real PostgreSQL server compiled to
// WebAssembly, in-process, nothing to install — through the same PostgresDriver
// the engine serves decks with, on the port's own SQLite-dialect card DDL.
//
// MySQL runs on a real MySQL 8.4 server (tests/server/drivers/mysql-server.ts,
// the same helper the MySQL driver's suites use: official binaries from the
// cache, a loopback ephemeral port, a fresh data directory). The deck is
// Ruby Decko's own MySQL schema — the CREATE TABLE statements of the production
// reference (db/schema.mysql-reference.sql, verbatim) plus the card-gem tables
// (db/schema.mysql-card-gem.sql) — which is what tests/server/drivers/
// mysql-ruby-schema.test.ts loads and proves the port serves unchanged. The
// splitter the SQLite DDL uses cannot read those statements (backtick names,
// nested KEY clauses), so the CREATE TABLE blocks are extracted the way that
// test extracts them.
//
// What is checked on each dialect, and why it differs from SQLite: the
// existence probe. A schema catalogue is a catalogue: SQLite reads
// sqlite_master, MySQL reads information_schema.TABLES in the current
// database, PostgreSQL reads information_schema.tables in the current schema.
// The build then drops and re-derives the 'I' rows through the ordinary write
// path, and a second call must be a marker read and nothing else.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "../fetch/fetch-test-storage.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { applyDeckInflections } from "../../../src/card/name/inflect.js";
import { CARD_GEM_INITIALIZER_INFLECTIONS } from "../../../src/card/name/oracle-deck-inflections.js";
import { ensureNestIndex, readNestIndexMarker, NEST_INDEX_BUILD_VERSION } from "../../../src/card/nest-index.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";
import { MysqlDriver } from "../../../src/server/drivers/mysql.js";
import { PostgresDriver } from "../../../src/server/drivers/postgres.js";
import { startMysqlServer } from "../../server/drivers/mysql-server.js";

const root = (rel: string): string => fileURLToPath(new URL(`../../../${rel}`, import.meta.url));

const SQLITE_SCHEMA = readFileSync(root("db/schema.sqlite.sql"), "utf8");
const MYSQL_REFERENCE = readFileSync(root("db/schema.mysql-reference.sql"), "utf8");
const MYSQL_CARD_GEM = readFileSync(root("db/schema.mysql-card-gem.sql"), "utf8");

/** The CREATE TABLE blocks of a MySQL schema file, as the MySQL Ruby-schema
 *  test extracts them: from `CREATE TABLE` through the closing `) ENGINE=...;`. */
function mysqlCreates(ddl: string): string[] {
  return [...ddl.matchAll(/CREATE TABLE `[^`]+` \([\s\S]*?\) ENGINE=[^;]*;/g)].map((m) =>
    m[0].replace(/ AUTO_INCREMENT=\d+/, ""),
  );
}

/** The SQLite card tables, no triggers: the freshness triggers are the
 *  driver's own DDL-translation work, not the marker check's. */
function sqliteCardTables(ddl: string): string[] {
  return splitSqlStatements(ddl).filter((stmt) => /^\s*CREATE TABLE/i.test(stmt));
}

async function seedDeck(driver: SQLDatabaseDriver): Promise<void> {
  const insert = (id: number, name: string, key: string, content: string | null) =>
    driver.query(
      `INSERT INTO cards (id, name, key, type_id, db_content, trash, created_at, updated_at, creator_id, updater_id)
       VALUES (?, ?, ?, ?, ?, 0, '2026-01-01 00:00:00', '2026-01-01 00:00:00', 1, 1)`,
      [id, name, key, 2, content],
    );
  await insert(2, "RichText", "basic", null);
  await insert(101, "root", "root", "{{child}}");
  await insert(102, "child", "child", "{{grandchild}}");
  await insert(103, "grandchild", "grandchild", "leaf");
}

async function indexRows(driver: SQLDatabaseDriver): Promise<unknown[]> {
  return (
    await driver.query(
      `SELECT referer_id, referee_id, referee_key, ref_type FROM card_references ORDER BY referer_id`,
      [],
    )
  ).rows;
}

/** The whole check on one driver whose card tables are already created. */
async function checkMarkerAndBuild(name: string, driver: SQLDatabaseDriver): Promise<void> {
  await seedDeck(driver);

  // A deck nobody has built yet: the marker says so, and says so by reading,
  // not by writing.
  expect(await readNestIndexMarker(driver)).toEqual({ state: "missing" });

  applyDeckInflections(CARD_GEM_INITIALIZER_INFLECTIONS);
  const lexicon = new FetchEngine(driver).lexicon;
  const built = await ensureNestIndex(driver, lexicon);
  expect({ state: built.state, scanned: built.scanned }).toEqual({ state: "built", scanned: 2 });

  // The rows are the write path's rows: one 'I' row per nest, the referee
  // absolutized and its id filled in.
  expect(await indexRows(driver)).toEqual([
    { referer_id: 101, referee_id: 102, referee_key: "child", ref_type: "I" },
    { referer_id: 102, referee_id: 103, referee_key: "grandchild", ref_type: "I" },
  ]);

  expect(await readNestIndexMarker(driver)).toEqual({ state: "current", version: NEST_INDEX_BUILD_VERSION });
  // Idempotent: a second boot reads the marker and writes nothing.
  expect(await ensureNestIndex(driver, lexicon)).toEqual({ state: "current", dropped: 0, scanned: 0 });
  expect(await indexRows(driver)).toHaveLength(2);
  process.stderr.write(`[nest-index] ${name}: marker check and build verified\n`);
}

describe("nest index marker: PostgreSQL (PGlite)", () => {
  it("reads the marker, builds the index, and is idempotent", { timeout: 300_000 }, async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const driver = new PostgresDriver({ client: await PGlite.create() }) as unknown as SQLDatabaseDriver;
    try {
      for (const stmt of sqliteCardTables(SQLITE_SCHEMA)) await driver.query(stmt, []);
      await checkMarkerAndBuild("postgres", driver);
    } finally {
      await (driver as unknown as { close(): Promise<void> }).close();
    }
  });
});

describe("nest index marker: MySQL 8.4", () => {
  it("reads the marker, builds the index, and is idempotent", { timeout: 300_000 }, async () => {
    const server = await startMysqlServer();
    let driver: MysqlDriver | undefined;
    try {
      const admin = await server.connect();
      await admin.query("CREATE DATABASE nest_index_deck CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci");
      await admin.end();
      driver = await MysqlDriver.connect({ port: server.port, database: "nest_index_deck" });
      // Ruby Decko's own tables, as the production dump records them, plus the
      // card-gem tables: the deck a MySQL host actually serves.
      for (const create of [...mysqlCreates(MYSQL_REFERENCE), ...mysqlCreates(MYSQL_CARD_GEM)]) {
        await driver.query(create, []);
      }
      await checkMarkerAndBuild("mysql", driver as unknown as SQLDatabaseDriver);
    } finally {
      await driver?.close();
      await server.stop();
    }
  });
});
