#!/usr/bin/env node
// Loads a Ruby-built SQLite deck into a MySQL / MariaDB database under Ruby
// Decko's own MySQL schema, so the port can be pointed at a Ruby MySQL
// database without an import step of its own.
//
//   node tools/same-database/load-deck-into-mysql.mjs <deck.sqlite3> <database> [port]
//
// The tables are created from db/schema.mysql-reference.sql (the CREATE
// TABLE statements of a Ruby Decko production MySQL database, verbatim),
// with the dump's AUTO_INCREMENT counters dropped. Every row of every table
// both schemas have is copied as stored. The database is dropped and
// recreated first: point it only at a scratch server.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createConnection } from "mysql2/promise";

const [deckPath, database, portArg] = process.argv.slice(2);
if (!deckPath || !database) {
  console.error("usage: load-deck-into-mysql.mjs <deck.sqlite3> <database> [port]");
  process.exit(2);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ddl = readFileSync(path.join(root, "db/schema.mysql-reference.sql"), "utf8");
const creates = [...ddl.matchAll(/CREATE TABLE `([^`]+)` \([\s\S]*?\) ENGINE=[^;]*;/g)].map((m) => ({
  table: m[1],
  sql: m[0].replace(/ AUTO_INCREMENT=\d+/, ""),
}));

const conn = await createConnection({ host: "127.0.0.1", port: Number(portArg ?? 3306), user: "root", charset: "utf8mb4" });
const sqlite = new DatabaseSync(deckPath, { readOnly: true });
try {
  await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
  await conn.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci`);
  await conn.query(`USE \`${database}\``);
  await conn.query("SET SESSION time_zone = '+00:00'");
  const deckTables = new Set(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => String(r.name)));
  for (const { table, sql } of creates) {
    await conn.query(sql);
    if (!deckTables.has(table)) continue;
    const mysqlCols = new Set((await conn.query(`SHOW COLUMNS FROM \`${table}\``))[0].map((c) => c.Field));
    const cols = sqlite.prepare(`PRAGMA table_info("${table}")`).all().map((c) => String(c.name)).filter((c) => mysqlCols.has(c));
    const rows = sqlite.prepare(`SELECT ${cols.map((c) => `"${c}"`).join(", ")} FROM "${table}"`).all();
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      await conn.query(`INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(", ")}) VALUES ?`, [
        chunk.map((r) => cols.map((c) => r[c])),
      ]);
    }
    console.log(`${table}: ${rows.length} rows`);
  }
} finally {
  sqlite.close();
  await conn.end();
}
