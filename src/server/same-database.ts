// same-database.ts — open an existing Ruby Decko database as it is.
//
// The port serves the database Ruby Decko (card 1.110.0 / decko 0.20.0)
// writes, with no import step. Ruby's tables (cards, card_acts,
// card_actions, card_changes, card_references, card_virtuals, sessions,
// users, schema_migrations, ...) are read and written in Ruby's own row
// shapes. The few objects the port needs that Ruby does not create are added
// here, on first open:
//
//   * deck_data_version — the freshness stamp the render gate reads
//     (src/card/one-trip/render-gate.ts), plus AFTER triggers on every card
//     table (cards, card_acts, card_actions, card_changes, card_references,
//     card_virtuals) that bump it, installed by ensureFreshnessStamp
//     (src/server/freshness-stamp.ts). The triggers fire on Ruby's writes as
//     well as the port's, which is what lets both engines serve the same
//     file: a card Ruby saves moves the stamp the port's caches check.
//   * auth_sessions — the port's session table (db/migrations), via
//     runAuthMigrations and its auth_migrations bookkeeping table.
//   * lookup indexes on cards for the port's serving-path queries, and a
//     BINARY-collated lookup on key/codename only where the database has
//     none (a Ruby-built SQLite deck already has one; a schema translated
//     from MySQL's case-insensitive indexes does not).
//
// Every statement is CREATE ... IF NOT EXISTS or INSERT OR IGNORE. Nothing
// here drops, alters or rewrites an object or row Ruby owns, so the
// function is idempotent and Ruby keeps serving the same database side by
// side. tests/server/same-database.test.ts checks both properties against
// a Ruby-built deck.
import type { SQLDatabaseDriver } from "./driver.js";
import { runAuthMigrations } from "../card/auth/migrations.js";
import { ensureFreshnessStamp } from "./freshness-stamp.js";

/** One object the port adds to a Ruby database. */
export interface PortSchemaObject {
  readonly type: "table" | "index" | "trigger";
  readonly name: string;
  readonly sql: string;
}

/** The serving-path lookup indexes (deploy/migrations
 *  0008-cards-serving-path-indexes.sql, without that file's DROP INDEX —
 *  an index Ruby created is never removed here). Non-unique: they add no
 *  constraint a Ruby write could trip over. */
export const LOOKUP_INDEX_OBJECTS: readonly PortSchemaObject[] = [
  { type: "index", name: "cards_name_trash_index", sql: `CREATE INDEX IF NOT EXISTS "cards_name_trash_index" ON "cards" ("name", "trash")` },
  { type: "index", name: "cards_right_id_trash_index", sql: `CREATE INDEX IF NOT EXISTS "cards_right_id_trash_index" ON "cards" ("right_id", "trash")` },
  {
    type: "index",
    name: "cards_codename_present_index",
    sql: `CREATE INDEX IF NOT EXISTS "cards_codename_present_index" ON "cards" ("codename", "id", "name", "left_id", "right_id") WHERE "codename" IS NOT NULL`,
  },
  { type: "index", name: "cards_key_last_char_index", sql: `CREATE INDEX IF NOT EXISTS "cards_key_last_char_index" ON "cards" (substr("key", -1))` },
];

/** Tables whose presence identifies a database written by Ruby Decko's
 *  migrations (card 1.110.0 db/schema.rb). */
const RUBY_DECKO_TABLES = ["cards", "card_acts", "card_actions", "card_changes", "card_references", "schema_migrations"];

export interface SameDatabaseReport {
  /** The database carries Ruby Decko's schema (and its migration ledger). */
  readonly rubyDatabase: boolean;
  /** Names of the objects this call created; empty on every later open. */
  readonly created: string[];
  /** Auth migration files applied by this call. */
  readonly authMigrationsApplied: string[];
}

export interface SameDatabaseOptions {
  /** Directory of the auth migrations; defaults to the repository's
   *  db/migrations. */
  readonly authMigrationsDir?: string;
  /** Skip the session table (a host that keeps sessions elsewhere). */
  readonly skipAuthSessions?: boolean;
}

/** The SQL dialect a driver speaks; drivers other than SQLite name theirs. */
export function driverDialect(driver: SQLDatabaseDriver): "sqlite" | "mysql" {
  return (driver as { dialect?: string }).dialect === "mysql" ? "mysql" : "sqlite";
}

async function schemaNames(driver: SQLDatabaseDriver): Promise<Set<string>> {
  if (driverDialect(driver) === "mysql") {
    const rows = await driver.query<{ name: string }>(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()
       UNION SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
       UNION SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()`,
      [],
    );
    return new Set(rows.rows.map((r) => String(r.name)));
  }
  const rows = await driver.query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type IN ('table', 'index', 'trigger') AND name NOT LIKE 'sqlite_%'`,
    [],
  );
  return new Set(rows.rows.map((r) => String(r.name)));
}

/** Whether `cards` already has an index whose leading column is `column`
 *  under BINARY collation — the index an exact `=` lookup can use. */
async function hasBinaryLeadingIndex(driver: SQLDatabaseDriver, column: string): Promise<boolean> {
  const list = await driver.query<{ name: string }>(`SELECT name FROM pragma_index_list('cards')`, []);
  for (const { name } of list.rows) {
    const cols = await driver.query<{ seqno: number; name: string | null; coll: string | null; key: number }>(
      `SELECT seqno, name, coll, key FROM pragma_index_xinfo(?) WHERE key = 1 ORDER BY seqno`,
      [name],
    );
    const lead = cols.rows[0];
    if (lead !== undefined && lead.name === column && String(lead.coll ?? "BINARY").toUpperCase() === "BINARY") return true;
  }
  return false;
}

/** Whether the database was written by Ruby Decko's migrations. */
export async function isRubyDeckoDatabase(driver: SQLDatabaseDriver): Promise<boolean> {
  const names = await schemaNames(driver);
  if (!RUBY_DECKO_TABLES.every((t) => names.has(t))) return false;
  const ledger = await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM schema_migrations`, []);
  return Number(ledger.rows[0]?.n ?? 0) > 0;
}

/**
 * Prepare a database for serving by the port, additively and idempotently.
 * Safe on a Ruby-built database, on a deploy-schema database and on a
 * database already prepared; never alters or removes an existing object.
 */
export async function openSameDatabase(
  driver: SQLDatabaseDriver,
  options: SameDatabaseOptions = {},
): Promise<SameDatabaseReport> {
  if (driverDialect(driver) === "mysql") return openSameMysqlDatabase(driver, options);
  const before = await schemaNames(driver);
  const rubyDatabase = await isRubyDeckoDatabase(driver);
  // An empty file (a fresh deck the host seeds after this call) has no card
  // tables to attach the stamp triggers and lookup indexes to; its seed
  // schema carries them.
  const hasCardTables = before.has("cards") && before.has("card_references");
  const objects: PortSchemaObject[] = hasCardTables ? [...LOOKUP_INDEX_OBJECTS] : [];
  if (hasCardTables && !(await hasBinaryLeadingIndex(driver, "key"))) {
    objects.push({ type: "index", name: "cards_key_binary_index", sql: `CREATE UNIQUE INDEX IF NOT EXISTS "cards_key_binary_index" ON "cards" ("key")` });
  }
  if (hasCardTables && !(await hasBinaryLeadingIndex(driver, "codename"))) {
    objects.push({
      type: "index",
      name: "cards_codename_binary_index",
      sql: `CREATE UNIQUE INDEX IF NOT EXISTS "cards_codename_binary_index" ON "cards" ("codename")`,
    });
  }
  // The freshness stamp has one installer (src/server/freshness-stamp.ts),
  // shared with the import and pod open paths; it writes nothing when the
  // stamp is whole.
  if (hasCardTables) await ensureFreshnessStamp(driver);
  const missing = objects.filter((o) => !before.has(o.name));
  if (missing.length > 0) await driver.batch(missing.map((o) => ({ sql: o.sql, params: [] as unknown[] })));
  const auth = options.skipAuthSessions
    ? { applied: [] as string[] }
    : await runAuthMigrations(driver, options.authMigrationsDir === undefined ? {} : { migrationsDir: options.authMigrationsDir });
  const after = await schemaNames(driver);
  const created = [...after].filter((n) => !before.has(n)).sort();
  return { rubyDatabase, created, authMigrationsApplied: auth.applied };
}

/** The objects the port adds to a Ruby MySQL database. MySQL has no
 *  expression or partial indexes on the versions Ruby Decko supports, and
 *  its key/codename indexes already serve the engine's lookups under the
 *  database's own collation, so only the stamp, its triggers, the session
 *  table and the two plain lookup indexes are added. */
export const MYSQL_PORT_OBJECTS: readonly PortSchemaObject[] = [
  {
    type: "table",
    name: "deck_data_version",
    sql: `CREATE TABLE IF NOT EXISTS deck_data_version (id INT NOT NULL PRIMARY KEY, version BIGINT NOT NULL DEFAULT 0) ENGINE=InnoDB`,
  },
  ...(["cards", "card_references"] as const).flatMap((table) =>
    (["ins", "upd", "del"] as const).map((op): PortSchemaObject => {
      const event = op === "ins" ? "INSERT" : op === "upd" ? "UPDATE" : "DELETE";
      const name = `${table}_bump_deck_data_version_${op}`;
      return {
        type: "trigger",
        name,
        sql: `CREATE TRIGGER ${name} AFTER ${event} ON ${table} FOR EACH ROW UPDATE deck_data_version SET version = version + 1 WHERE id = 1`,
      };
    }),
  ),
  {
    type: "table",
    name: "auth_sessions",
    sql: `CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  account_card_id INT NOT NULL,
  created_at VARCHAR(23) NOT NULL,
  expires_at VARCHAR(23) NOT NULL,
  INDEX index_auth_sessions_on_account_card_id (account_card_id),
  INDEX index_auth_sessions_on_expires_at (expires_at)
) ENGINE=InnoDB`,
  },
  { type: "index", name: "cards_name_trash_index", sql: `CREATE INDEX cards_name_trash_index ON cards (name, trash)` },
  { type: "index", name: "cards_right_id_trash_index", sql: `CREATE INDEX cards_right_id_trash_index ON cards (right_id, trash)` },
];

async function openSameMysqlDatabase(driver: SQLDatabaseDriver, options: SameDatabaseOptions): Promise<SameDatabaseReport> {
  const before = await schemaNames(driver);
  const rubyDatabase = await isRubyDeckoDatabase(driver);
  const hasCardTables = before.has("cards") && before.has("card_references");
  const objects = MYSQL_PORT_OBJECTS.filter((o) => (o.name === "auth_sessions" ? !options.skipAuthSessions : hasCardTables));
  // DDL commits implicitly on MySQL, so each object is created on its own;
  // the existence check makes a rerun create nothing.
  for (const o of objects) if (!before.has(o.name)) await driver.query(o.sql, []);
  if (hasCardTables) await driver.query(`INSERT IGNORE INTO deck_data_version (id, version) VALUES (1, 0)`, []);
  const after = await schemaNames(driver);
  const created = [...after].filter((n) => !before.has(n)).sort();
  return { rubyDatabase, created, authMigrationsApplied: [] };
}

/**
 * The password storage policy for a database. A database Ruby also serves
 * keeps Ruby's salted SHA-1 (Card::Auth.encrypt), so every password row
 * the port writes is one Ruby can verify; an explicit setting wins.
 */
export function passwordHashModeFor(rubyDatabase: boolean, explicit: string | undefined): "pbkdf2" | "legacy-sha1" | undefined {
  const set = explicit?.trim();
  if (set !== undefined && set !== "") return set as "pbkdf2" | "legacy-sha1";
  return rubyDatabase ? "legacy-sha1" : undefined;
}
