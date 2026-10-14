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
//     (src/card/one-trip/render-gate.ts), plus AFTER triggers on cards and
//     card_references that bump it. The triggers fire on Ruby's writes as
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

/** One object the port adds to a Ruby database. */
export interface PortSchemaObject {
  readonly type: "table" | "index" | "trigger";
  readonly name: string;
  readonly sql: string;
}

const stampTrigger = (table: string, op: "ins" | "upd" | "del"): PortSchemaObject => {
  const event = op === "ins" ? "INSERT" : op === "upd" ? "UPDATE" : "DELETE";
  const name = `${table}_bump_deck_data_version_${op}`;
  return {
    type: "trigger",
    name,
    sql: `CREATE TRIGGER IF NOT EXISTS "${name}" AFTER ${event} ON "${table}" BEGIN
  UPDATE "deck_data_version" SET "version" = "version" + 1 WHERE "id" = 1;
END`,
  };
};

/** The freshness stamp and its triggers (deploy/migrations
 *  0003-deck-data-version-stamp.sql, the same DDL). */
export const FRESHNESS_STAMP_OBJECTS: readonly PortSchemaObject[] = [
  {
    type: "table",
    name: "deck_data_version",
    sql: `CREATE TABLE IF NOT EXISTS "deck_data_version" ("id" INTEGER PRIMARY KEY CHECK ("id" = 1), "version" INTEGER NOT NULL DEFAULT 0)`,
  },
  stampTrigger("cards", "ins"),
  stampTrigger("cards", "upd"),
  stampTrigger("cards", "del"),
  stampTrigger("card_references", "ins"),
  stampTrigger("card_references", "upd"),
  stampTrigger("card_references", "del"),
];

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

async function schemaNames(driver: SQLDatabaseDriver): Promise<Set<string>> {
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
  const before = await schemaNames(driver);
  const rubyDatabase = await isRubyDeckoDatabase(driver);
  // An empty file (a fresh deck the host seeds after this call) has no card
  // tables to attach the stamp triggers and lookup indexes to; its seed
  // schema carries them.
  const hasCardTables = before.has("cards") && before.has("card_references");
  const objects: PortSchemaObject[] = hasCardTables ? [...FRESHNESS_STAMP_OBJECTS, ...LOOKUP_INDEX_OBJECTS] : [];
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
  const missing = objects.filter((o) => !before.has(o.name));
  if (missing.length > 0) {
    await driver.batch([
      ...missing.map((o) => ({ sql: o.sql, params: [] as unknown[] })),
      { sql: `INSERT OR IGNORE INTO "deck_data_version" ("id", "version") VALUES (1, 0)`, params: [] },
    ]);
  } else if (hasCardTables) {
    await driver.query(`INSERT OR IGNORE INTO "deck_data_version" ("id", "version") VALUES (1, 0)`, []);
  }
  const auth = options.skipAuthSessions
    ? { applied: [] as string[] }
    : await runAuthMigrations(driver, options.authMigrationsDir === undefined ? {} : { migrationsDir: options.authMigrationsDir });
  const after = await schemaNames(driver);
  const created = [...after].filter((n) => !before.has(n)).sort();
  return { rubyDatabase, created, authMigrationsApplied: auth.applied };
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
