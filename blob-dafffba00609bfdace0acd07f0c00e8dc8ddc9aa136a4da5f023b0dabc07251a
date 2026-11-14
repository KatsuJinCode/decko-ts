// The deck's committed-write freshness stamp (deck_data_version), and the
// one place that installs it on a deck.
//
// The render engines that live between requests keep state derived from the
// deck and read the stamp once per request, discarding that state when the
// stamp has moved (src/card/render.ts DECK_DATA_VERSION_STATEMENT,
// src/card/render/boot-cache.ts). The stamp is moved by AFTER triggers in the
// database, so a committed write moves it whichever process, connection or
// code path issued it.
//
// The triggers cover every table a card write changes: Decko's card tables
// (cards, card_acts, card_actions, card_changes, card_references,
// card_virtuals; the persistence contract of reference-harness/SPEC.md).
// A write that touches only card_actions - a reserved action, a re-parented
// child action, a cleared draft - therefore moves the stamp like any other.
// Tables outside that set are not stamped on purpose: auth_sessions is read
// live on every request and feeds no retained render state, and the
// one_trip_* tables are caches keyed BY the stamp, so stamping them would
// make filling a cache invalidate it.
//
// A deck that arrives without the stamp (a Ruby-built SQLite deck, a deck
// imported before the triggers existed, a database provisioned before a
// trigger was added) gets it from ensureFreshnessStamp on the import and
// open paths. It is idempotent and writes nothing when the stamp is whole.
//
// The same statements live in db/schema.sqlite.sql (the [ENGINE-FRESHNESS]
// block, read by tools/migrate) and in the deploy migrations for D1;
// tests/server/freshness-stamp.test.ts holds the three in step.

import type { SQLDatabaseDriver } from "./driver.js";

export const DECK_DATA_VERSION_TABLE = "deck_data_version";

/** Every table a card write changes. */
export const FRESHNESS_STAMPED_TABLES = [
  "cards",
  "card_acts",
  "card_actions",
  "card_changes",
  "card_references",
  "card_virtuals",
] as const;

const OPERATIONS = [
  ["ins", "INSERT"],
  ["upd", "UPDATE"],
  ["del", "DELETE"],
] as const;

export function freshnessTriggerName(table: string, op: "ins" | "upd" | "del"): string {
  return `${table}_bump_deck_data_version_${op}`;
}

export const DECK_DATA_VERSION_TABLE_STATEMENT =
  `CREATE TABLE IF NOT EXISTS "${DECK_DATA_VERSION_TABLE}" (` +
  `"id" INTEGER PRIMARY KEY CHECK ("id" = 1), "version" INTEGER NOT NULL DEFAULT 0)`;

export const DECK_DATA_VERSION_ROW_STATEMENT = `INSERT OR IGNORE INTO "${DECK_DATA_VERSION_TABLE}" ("id", "version") VALUES (1, 0)`;

/** The trigger statements for one table, IF NOT EXISTS. */
export function freshnessTriggerStatements(table: string): string[] {
  return OPERATIONS.map(
    ([op, event]) =>
      `CREATE TRIGGER IF NOT EXISTS "${freshnessTriggerName(table, op)}" AFTER ${event} ON "${table}" BEGIN\n` +
      `  UPDATE "${DECK_DATA_VERSION_TABLE}" SET "version" = "version" + 1 WHERE "id" = 1;\n` +
      `END`,
  );
}

/** Every trigger name a whole stamp has, over the stamped tables. */
export function freshnessTriggerNames(tables: readonly string[] = FRESHNESS_STAMPED_TABLES): string[] {
  return tables.flatMap((table) => OPERATIONS.map(([op]) => freshnessTriggerName(table, op)));
}

export interface FreshnessStampInstall {
  /** Schema objects and rows this call created; empty when the stamp was whole. */
  installed: string[];
}

/**
 * Installs the freshness stamp on a deck that lacks any part of it: the
 * stamp table, its one row, and the triggers on every stamped table the deck
 * has. Idempotent; reads only, and writes nothing, when the stamp is whole,
 * so it is safe on every open. Everything missing is created in one batch.
 */
export async function ensureFreshnessStamp(driver: Pick<SQLDatabaseDriver, "query" | "batch">): Promise<FreshnessStampInstall> {
  const objects = await driver.query<{ type: string; name: string }>(
    "SELECT type, name FROM sqlite_master WHERE type IN ('table', 'trigger')",
    [],
  );
  const tables = new Set(objects.rows.filter((r) => r.type === "table").map((r) => r.name));
  const triggers = new Set(objects.rows.filter((r) => r.type === "trigger").map((r) => r.name));
  const statements: string[] = [];
  const installed: string[] = [];
  if (!tables.has(DECK_DATA_VERSION_TABLE)) {
    statements.push(DECK_DATA_VERSION_TABLE_STATEMENT);
    installed.push(`table ${DECK_DATA_VERSION_TABLE}`);
  }
  const row = tables.has(DECK_DATA_VERSION_TABLE)
    ? (await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM "${DECK_DATA_VERSION_TABLE}" WHERE "id" = 1`, [])).rows[0]
    : undefined;
  if (Number(row?.n ?? 0) === 0) {
    statements.push(DECK_DATA_VERSION_ROW_STATEMENT);
    installed.push(`row ${DECK_DATA_VERSION_TABLE}#1`);
  }
  for (const table of FRESHNESS_STAMPED_TABLES) {
    if (!tables.has(table)) continue;
    const triggerStatements = freshnessTriggerStatements(table);
    OPERATIONS.forEach(([op], i) => {
      const name = freshnessTriggerName(table, op);
      if (triggers.has(name)) return;
      statements.push(triggerStatements[i]!);
      installed.push(`trigger ${name}`);
    });
  }
  if (statements.length > 0) await driver.batch(statements.map((sql) => ({ sql, params: [] })));
  return { installed };
}
