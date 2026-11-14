// A Ruby Decko MySQL database served by the port without a schema change.
//
// Ruby Decko's own MySQL schema (db/schema.mysql-reference.sql: the CREATE
// TABLE statements of a production MySQL 8.0 deck, verbatim) is created on a
// real MySQL 8.4 server. The port then opens it with openSameDatabase. The test
// checks that every table Ruby owns keeps its columns, types, nullability and
// existing indexes, and that the only objects the port adds are the ones
// src/server/same-database.ts documents as additive: the freshness stamp table,
// its triggers, the session table, and two non-unique lookup indexes on cards.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { MysqlDriver } from "../../../src/server/drivers/mysql.js";
import { openSameDatabase } from "../../../src/server/same-database.js";
import { startMysqlServer, type MysqlServer } from "./mysql-server.js";

const here = dirname(fileURLToPath(import.meta.url));
const REFERENCE = resolve(here, "../../../db/schema.mysql-reference.sql");
const CARD_GEM = resolve(here, "../../../db/schema.mysql-card-gem.sql");
const RUBY_TABLES = [
  "ar_internal_metadata", "card_actions", "card_acts", "card_changes", "card_references", "card_revisions",
  "card_virtuals", "cards", "delayed_jobs", "schema_migrations", "sessions", "transform_migrations", "users",
];
const createsFrom = (file: string): string[] => {
  const ddl = readFileSync(file, "utf8");
  return [...ddl.matchAll(/CREATE TABLE `[^`]+` \([\s\S]*?\) ENGINE=[^;]*;/g)].map((m) => m[0].replace(/ AUTO_INCREMENT=\d+/, ""));
};

let server: MysqlServer;
let driver: MysqlDriver;

beforeAll(async () => {
  server = await startMysqlServer();
  const admin = await server.connect();
  await admin.query("CREATE DATABASE ruby_deck CHARACTER SET utf8mb3 COLLATE utf8mb3_unicode_ci");
  await admin.end();
  driver = await MysqlDriver.connect({ port: server.port, database: "ruby_deck" });
  // Ruby's CREATE TABLE statements, as the production dump records them.
  const creates = [...createsFrom(REFERENCE), ...createsFrom(CARD_GEM)];
  expect(creates).toHaveLength(RUBY_TABLES.length);
  for (const create of creates) await driver.query(create, []);
}, 120_000);

afterAll(async () => {
  await driver?.close();
  await server?.stop();
});

/** The shape Ruby owns: every column with its type and nullability, and every
 *  index of the Ruby tables with its columns, as MySQL reports them. */
async function rubyShape(): Promise<string[]> {
  const cols = await driver.query<{ t: string; c: string; ty: string; n: string; d: string | null }>(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS ty, IS_NULLABLE AS n, COLUMN_DEFAULT AS d
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [],
  );
  const idx = await driver.query<{ t: string; i: string; c: string; seq: number; u: number }>(
    `SELECT TABLE_NAME AS t, INDEX_NAME AS i, COLUMN_NAME AS c, SEQ_IN_INDEX AS seq, NON_UNIQUE AS u
     FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
    [],
  );
  const out: string[] = [];
  for (const r of cols.rows) if (RUBY_TABLES.includes(r.t)) out.push(`col ${r.t}.${r.c} ${r.ty} null=${r.n} default=${r.d}`);
  for (const r of idx.rows) if (RUBY_TABLES.includes(r.t)) out.push(`idx ${r.t}.${r.i}#${r.seq} ${r.c} unique=${r.u === 0}`);
  return out;
}

describe("Ruby Decko's MySQL schema, served by the port", () => {
  let before: string[];
  let report: Awaited<ReturnType<typeof openSameDatabase>>;

  it("opens the Ruby schema with openSameDatabase and reports only the port's additive objects", async () => {
    before = await rubyShape();
    report = await openSameDatabase(driver);
    expect(report.created.sort()).toEqual(
      [
        "auth_sessions",
        "card_references_bump_deck_data_version_del",
        "card_references_bump_deck_data_version_ins",
        "card_references_bump_deck_data_version_upd",
        "cards_bump_deck_data_version_del",
        "cards_bump_deck_data_version_ins",
        "cards_bump_deck_data_version_upd",
        "cards_key_last_char_index",
        "cards_name_trash_index",
        "cards_right_id_trash_index",
        "deck_data_version",
        "index_auth_sessions_on_account_card_id",
        "index_auth_sessions_on_expires_at",
      ].sort(),
    );
  });

  it("leaves every Ruby column and every Ruby index exactly as Ruby created them", async () => {
    const after = await rubyShape();
    // The port's two lookup indexes are the only additions to Ruby's tables.
    const added = after.filter((line) => !before.includes(line));
    expect(added).toEqual([
      "idx cards.cards_key_last_char_index#1 null unique=false",
      "idx cards.cards_name_trash_index#1 name unique=false",
      "idx cards.cards_name_trash_index#2 trash unique=false",
      "idx cards.cards_right_id_trash_index#1 right_id unique=false",
      "idx cards.cards_right_id_trash_index#2 trash unique=false",
    ]);
    expect(before.every((line) => after.includes(line))).toBe(true);
  });

  it("opens the same database again and creates nothing", async () => {
    const again = await openSameDatabase(driver);
    expect(again.created).toEqual([]);
  });

  it("keeps the freshness stamp at 1 row and bumps it on Ruby's own writes", async () => {
    await driver.query("INSERT INTO cards (name, `key`, codename, created_at, updated_at, creator_id, updater_id, trash, type_id) VALUES ('Probe', 'probe', NULL, '2026-10-15 00:00:00', '2026-10-15 00:00:00', 1, 1, 0, 1)", []);
    const stamp = await driver.query<{ version: number }>("SELECT version FROM deck_data_version WHERE id = 1", []);
    expect(Number(stamp.rows[0].version)).toBe(1);
  });
});
