// MysqlDriver against MySQL itself: a real MySQL 8.4 server (official binaries,
// started in a child process by mysql-server.ts; see tools/mysql/fetch-mysql.mjs).
// The shared driver and transaction conformance suites run against it, plus
// the session settings, the recursive CTE the engine issues, and the dialect
// translation.

import { describe, it, expect, afterAll } from "vitest";
import { MysqlDriver, sqliteToMysql, MYSQL_SESSION_SETTINGS } from "../../../src/server/drivers/mysql.js";
import { supportsFunctionalIndexes } from "../../../src/server/same-database.js";
import { runDriverConformance } from "./conformance.js";
import { runTransactionConformance } from "./transaction-conformance.js";
import { startMysqlServer, type MysqlServer } from "./mysql-server.js";

let server: MysqlServer | undefined;
let serverStart: Promise<MysqlServer> | undefined;
let databaseCounter = 0;

/** One MySQL server for the whole file; each driver gets its own database. */
function sharedServer(): Promise<MysqlServer> {
  serverStart ??= startMysqlServer().then((s) => (server = s));
  return serverStart;
}

afterAll(async () => {
  await server?.stop();
});

async function freshDatabase(): Promise<{ driver: MysqlDriver; dispose: () => Promise<void> }> {
  const s = await sharedServer();
  databaseCounter += 1;
  const database = `driver_test_${databaseCounter}`;
  const admin = await s.connect();
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci`);
  } finally {
    await admin.end();
  }
  const driver = await MysqlDriver.connect({ port: s.port, database });
  return { driver, dispose: () => driver.close() };
}

runDriverConformance("conformance: MysqlDriver (MySQL 8.4 server)", freshDatabase);
runTransactionConformance("transactions: MysqlDriver (MySQL 8.4 server, native)", freshDatabase);

describe("MysqlDriver session settings", () => {
  it("runs every connection in strict mode with the engine's string and identifier rules", async () => {
    const { driver, dispose } = await freshDatabase();
    try {
      const r = await driver.query<Record<string, unknown>>(
        `SELECT @@SESSION.sql_mode AS mode, @@SESSION.time_zone AS tz, 'a' || 'b' AS cat, 1 AS "q"`,
        [],
      );
      const row = r.rows[0];
      expect(String(row.mode)).toContain("STRICT_ALL_TABLES");
      expect(String(row.mode)).toContain("PIPES_AS_CONCAT");
      expect(String(row.mode)).toContain("ANSI_QUOTES");
      expect(row.tz).toBe("+00:00");
      expect(row.cat).toBe("ab");
      expect(row.q).toBe(1);
      expect(MYSQL_SESSION_SETTINGS.length).toBe(2);
    } finally {
      await dispose();
    }
  });

  it("rejects an over-long value rather than truncating it (strict session)", async () => {
    const { driver, dispose } = await freshDatabase();
    try {
      await driver.query("CREATE TABLE conf_strict (v VARCHAR(3))", []);
      await expect(driver.query("INSERT INTO conf_strict (v) VALUES ('abcdef')", [])).rejects.toThrow();
      await driver.query("INSERT INTO conf_strict (v) VALUES ('abc')", []);
      const r = await driver.query<{ c: number }>("SELECT COUNT(*) AS c FROM conf_strict", []);
      expect(Number(r.rows[0].c)).toBe(1);
    } finally {
      await dispose();
    }
  });

  it("gives a SQLite-style rowid counter for AUTOINCREMENT ids and reports the last insert id", async () => {
    const { driver, dispose } = await freshDatabase();
    try {
      await driver.query("CREATE TABLE conf_ids (id INTEGER PRIMARY KEY AUTOINCREMENT, s TEXT)", []);
      const a = await driver.query("INSERT INTO conf_ids (s) VALUES ('a')", []);
      const b = await driver.query("INSERT INTO conf_ids (s) VALUES ('b')", []);
      expect(BigInt(a.lastInsertRowId as number)).toBe(1n);
      expect(BigInt(b.lastInsertRowId as number)).toBe(2n);
    } finally {
      await dispose();
    }
  });
});

describe("MysqlDriver recursive CTE (the prefetch reach shape)", () => {
  it("walks nest and side edges over a cyclic graph, once per card, and drops trashed cards", async () => {
    const { driver, dispose } = await freshDatabase();
    try {
      // The same statement shape src/card/render/prefetch.ts issues, with a
      // small graph: 1 nests 2, 2 nests 3, 3 nests back to 1 (a cycle); card 3
      // has a left side 4, card 4 a right side 5; card 1 also nests a trashed card 7.
      await driver.query(
        "CREATE TABLE conf_cards (id INT PRIMARY KEY, `key` TEXT, left_id INT, right_id INT, trash INT NOT NULL DEFAULT 0)",
        [],
      );
      await driver.query("CREATE TABLE conf_refs (referer_id INT, referee_id INT, ref_type TEXT)", []);
      await driver.query(
        "INSERT INTO conf_cards (id, `key`, left_id, right_id, trash) VALUES (1,'one',NULL,NULL,0),(2,'two',NULL,NULL,0),(3,'three',4,NULL,0),(4,'four',NULL,5,0),(5,'five',NULL,NULL,0),(6,'six',NULL,NULL,0),(7,'seven',NULL,NULL,1)",
        [],
      );
      await driver.query(
        "INSERT INTO conf_refs (referer_id, referee_id, ref_type) VALUES (1,2,'I'),(2,3,'I'),(3,1,'I'),(1,7,'I'),(1,6,'L')",
        [],
      );
      const r = await driver.query<{ id: number }>(
        `WITH RECURSIVE reach(id, via) AS (
          SELECT ?, 'n'
          UNION
          SELECT refs.referee_id, 'n' FROM conf_refs refs JOIN reach ON refs.referer_id = reach.id
           WHERE reach.via = 'n' AND refs.ref_type = 'I' AND refs.referee_id IS NOT NULL
          UNION
          SELECT c.left_id, 's' FROM conf_cards c JOIN reach ON c.id = reach.id WHERE c.left_id IS NOT NULL
          UNION
          SELECT c.right_id, 's' FROM conf_cards c JOIN reach ON c.id = reach.id WHERE c.right_id IS NOT NULL
          LIMIT 1000
        )
        SELECT * FROM conf_cards WHERE id IN (SELECT id FROM reach) AND trash = 0 ORDER BY id`,
        [1],
      );
      expect(r.rows.map((row) => Number(row.id))).toEqual([1, 2, 3, 4, 5]);
    } finally {
      await dispose();
    }
  });
});

describe("MySQL version gate for the functional index", () => {
  it("accepts MySQL 8.0.13 and later and rejects older MySQL and MariaDB", () => {
    expect(supportsFunctionalIndexes("8.4.11")).toBe(true);
    expect(supportsFunctionalIndexes("8.0.39")).toBe(true);
    expect(supportsFunctionalIndexes("9.7.2")).toBe(true);
    expect(supportsFunctionalIndexes("8.0.12")).toBe(false);
    expect(supportsFunctionalIndexes("8.4.11-log")).toBe(true);
    expect(supportsFunctionalIndexes("5.7.44")).toBe(false);
    expect(supportsFunctionalIndexes("11.4.5-MariaDB")).toBe(false);
    expect(supportsFunctionalIndexes("")).toBe(false);
  });
});

describe("sqliteToMysql dialect translation", () => {
  it("leaves ? placeholders and string literals alone", () => {
    expect(sqliteToMysql("SELECT '?' AS q, ? AS a, ? AS b")).toBe("SELECT '?' AS q, ? AS a, ? AS b");
  });

  it("turns INSERT OR IGNORE and INSERT OR REPLACE into MySQL's forms", () => {
    expect(sqliteToMysql(`INSERT OR IGNORE INTO "t" ("id", "v") VALUES (1, 0)`)).toBe(`INSERT IGNORE INTO "t" ("id", "v") VALUES (1, 0)`);
    expect(sqliteToMysql(`INSERT OR REPLACE INTO t (id) VALUES (1)`)).toBe(`REPLACE INTO t (id) VALUES (1)`);
  });

  it("drops NOCASE (the utf8mb3_unicode_ci collation already compares case-insensitively)", () => {
    expect(sqliteToMysql(`SELECT id FROM cards c WHERE c."key" COLLATE NOCASE = ?`)).toBe(`SELECT id FROM cards c WHERE c."key" = ?`);
  });

  it("quotes the bare column name key, and not the qualified or KEY-clause forms", () => {
    expect(sqliteToMysql("SELECT key FROM cards")).toBe(`SELECT "key" FROM cards`);
    expect(sqliteToMysql("SELECT c.key FROM cards c")).toBe("SELECT c.key FROM cards c");
    expect(sqliteToMysql("CREATE TABLE t (id INT, PRIMARY KEY (id))")).toBe("CREATE TABLE t (id INT, PRIMARY KEY (id))");
  });

  it("maps SQLite's LIMIT -1, CAST targets, MATERIALIZED and AUTOINCREMENT", () => {
    expect(sqliteToMysql("SELECT * FROM t LIMIT -1")).toBe("SELECT * FROM t LIMIT 18446744073709551615");
    expect(sqliteToMysql("SELECT CAST(x AS INTEGER) AS n, CAST(y AS TEXT) AS s")).toBe(
      "SELECT CAST(x AS SIGNED) AS n, CAST(y AS CHAR(10000)) AS s",
    );
    expect(sqliteToMysql("WITH c AS MATERIALIZED (SELECT 1) SELECT * FROM c")).toBe("WITH c AS (SELECT 1) SELECT * FROM c");
    expect(sqliteToMysql("CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT)")).toBe(
      "CREATE TABLE t (id INTEGER PRIMARY KEY AUTO_INCREMENT)",
    );
  });

  it("gives an untyped column TEXT in CREATE TABLE, and leaves constraints and quoted text alone", () => {
    expect(sqliteToMysql("CREATE TABLE t (id INTEGER, z, \"q\", UNIQUE (id, z))")).toBe(
      "CREATE TABLE t (id INTEGER, z TEXT, \"q\" TEXT, UNIQUE (id, z))",
    );
    expect(sqliteToMysql("INSERT INTO t (z) VALUES ('a, b')")).toBe("INSERT INTO t (z) VALUES ('a, b')");
  });

  it("maps SQLite's scalar MAX/MIN (two or more arguments) to GREATEST/LEAST and leaves aggregates alone", () => {
    expect(sqliteToMysql("SELECT MAX(a, b) AS m, MIN(COALESCE((SELECT 1), 0), 2) AS n")).toBe(
      "SELECT GREATEST(a, b) AS m, LEAST(COALESCE((SELECT 1), 0), 2) AS n",
    );
    expect(sqliteToMysql("SELECT MAX(id) FROM cards")).toBe("SELECT MAX(id) FROM cards");
  });

  it("reads sqlite_sequence as the table's AUTO_INCREMENT counter", () => {
    expect(sqliteToMysql("SELECT seq FROM sqlite_sequence WHERE name = 'cards'")).toBe(
      "SELECT AUTO_INCREMENT AS seq FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cards'",
    );
  });

  it("answers last_insert_rowid() with the id the connection's last insert took", async () => {
    const { driver, dispose } = await freshDatabase();
    try {
      await driver.query("CREATE TABLE conf_rowid (id INTEGER PRIMARY KEY AUTOINCREMENT, s TEXT)", []);
      await driver.query("INSERT INTO conf_rowid (s) VALUES ('a')", []);
      const r = await driver.query<{ id: number | null }>("SELECT last_insert_rowid() AS id", []);
      expect(Number(r.rows[0].id)).toBe(1);
      await driver.query("INSERT INTO conf_rowid (s) VALUES ('b')", []);
      const after = await driver.query<{ id: number | null }>("SELECT last_insert_rowid() AS id", []);
      expect(Number(after.rows[0].id)).toBe(2);
    } finally {
      await dispose();
    }
  });

  it("passes unknown forms through unchanged so MySQL reports them", () => {
    expect(sqliteToMysql("SELECT sqlite_version_that_does_not_exist()")).toBe("SELECT sqlite_version_that_does_not_exist()");
  });
});
