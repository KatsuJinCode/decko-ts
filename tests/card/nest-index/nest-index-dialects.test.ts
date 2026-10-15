// The stored nest index's marker check on PostgreSQL and MySQL.
//
// SQLite (and D1) are covered everywhere else; this suite is the two hosted
// dialects. PostgreSQL runs as PGlite — the real PostgreSQL server compiled
// to WebAssembly, in-process, nothing to install — through the same
// PostgresDriver the engine serves decks with. MySQL runs against a real
// MySQL 8.4 server through the same MysqlDriver, and SKIPS LOUDLY (a printed
// `[mysql] SKIPPED:` line naming the reason) when no server is reachable, so
// a green run never claims a MySQL check that did not happen.
//
// What is checked on each dialect, and why it differs from SQLite: the
// existence probe. The engine writes SQLite-dialect SQL and each adapter
// translates it, but a schema catalogue is a catalogue: SQLite reads
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

/** Each dialect's own card DDL: SQLite (and D1) db/schema.sqlite.sql, MySQL
 *  db/schema.mysql-reference.sql - the reference DDL schema.ts names. The
 *  card tables alone, no triggers: the freshness triggers are the driver's
 *  own DDL-translation work, not the marker check's. */
function cardTablesSql(ddl: string): string {
  return splitSqlStatements(ddl)
    .filter((stmt) => /^\s*CREATE TABLE/i.test(stmt))
    .join(";\n");
}

const SQLITE_SCHEMA = readFileSync(fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)), "utf8");
const MYSQL_SCHEMA = readFileSync(
  fileURLToPath(new URL("../../../db/schema.mysql-reference.sql", import.meta.url)),
  "utf8",
);

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

/** The whole check, on whichever driver the backend hands over. */
async function checkDialect(
  name: string,
  openDeck: () => Promise<SQLDatabaseDriver>,
  ddl: string,
): Promise<void> {
  const driver = await openDeck();
  try {
    for (const statement of splitSqlStatements(cardTablesSql(ddl))) await driver.query(statement, []);
    await seedDeck(driver);

    // A deck nobody has built yet: the marker says so, and says so by
    // reading, not by writing.
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
  } finally {
    await (driver as unknown as { close(): Promise<void> }).close();
  }
  process.stderr.write(`[nest-index] ${name}: marker check and build verified\n`);
}

describe("nest index marker: PostgreSQL (PGlite)", () => {
  it(
    "reads the marker, builds the index, and is idempotent",
    { timeout: 300_000 },
    async () => {
      const { PGlite } = await import("@electric-sql/pglite");
      const { PostgresDriver } = await import("../../../src/server/drivers/postgres.js");
      await checkDialect(
        "postgres",
        async () => {
          const client = await PGlite.create();
          return new PostgresDriver({ client }) as unknown as SQLDatabaseDriver;
        },
        SQLITE_SCHEMA,
      );
    },
  );
});

describe("nest index marker: MySQL", () => {
  it(
    "reads the marker, builds the index, and is idempotent",
    { timeout: 300_000 },
    async () => {
      const host = process.env.DECKO_MYSQL_HOST;
      const database = process.env.DECKO_MYSQL_DATABASE;
      if (host === undefined || database === undefined) {
        process.stderr.write(
          "[mysql] SKIPPED: DECKO_MYSQL_HOST / DECKO_MYSQL_DATABASE not in the environment, so no MySQL 8.4 server was reached and the MySQL marker check did NOT run\n",
        );
        return;
      }
      const { MysqlDriver } = await import("../../../src/server/drivers/mysql.js");
      await checkDialect("mysql", async () => {
        const driver = (await MysqlDriver.connect({
          host,
          port: Number(process.env.DECKO_MYSQL_PORT ?? "3306"),
          user: process.env.DECKO_MYSQL_USER ?? "root",
          password: process.env.DECKO_MYSQL_PASSWORD ?? "",
          database,
        })) as unknown as SQLDatabaseDriver;
        // A database this check owns, wiped first: the DDL is additive, and
        // the suite must not inherit another run's rows.
        for (const table of [
          "card_references",
          "card_virtuals",
          "card_changes",
          "card_actions",
          "card_acts",
          "cards",
        ]) {
          await driver.query(`DROP TABLE IF EXISTS ${table}`, []).catch(() => undefined);
        }
        await driver.query(`DROP TABLE IF EXISTS nest_index_meta`, []).catch(() => undefined);
        return driver;
      }, MYSQL_SCHEMA);
    },
  );
});
