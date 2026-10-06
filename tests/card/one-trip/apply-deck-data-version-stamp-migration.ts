// The deck_data_version stamp migration (0003), applied to a WRITABLE deck
// copy inside a test.
//
// WHY THIS EXISTS (lineage-reconciliation lane, 2026-10-06): the composed
// render engine reads the deck_data_version stamp at every render entry
// (src/card/render.ts DECK_DATA_VERSION_STATEMENT) and fails LOUDLY on an
// unmigrated database BY DESIGN — a silently skipped check would be a silent
// staleness window (delivery contract:79's no-leak clause; the throw's own
// doc in readDeckDataVersion). The one-trip suites render through engines
// opened on copies of the trial-deck mirror, a database built BEFORE the
// stamp schema existed. This file is that migration, applied where it is
// designed to be applied: to provisioned-but-not-yet-stamped databases
// (deploy/migrations/0003-deck-data-version-stamp.sql). The migration is
// order-safe (IF NOT EXISTS / INSERT OR IGNORE), carries the six bump
// triggers, and adds no render bytes — the freshness mechanism's cost is
// trips, never bytes.
//
// NEVER run this against the shared trial-deck mirror itself: it is a
// read-only, hard-linked shared artifact. Copy first (the suites already
// do), then migrate the copy.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { splitSqlStatements } from "../fetch/fetch-test-storage.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";

const STAMP_MIGRATION_STATEMENTS = splitSqlStatements(
  readFileSync(
    fileURLToPath(
      new URL("../../../deploy/migrations/0003-deck-data-version-stamp.sql", import.meta.url),
    ),
    "utf8",
  ),
);

export async function applyDeckDataVersionStampMigration(
  driver: SQLDatabaseDriver,
): Promise<void> {
  for (const statement of STAMP_MIGRATION_STATEMENTS) {
    await driver.query(statement, []);
  }
}
