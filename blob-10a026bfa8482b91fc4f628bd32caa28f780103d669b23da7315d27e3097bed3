#!/usr/bin/env node
// drop-private-app-tables-from-fixture-decks.mjs -- reduce the committed
// reference-harness fixture decks to the tables stock Decko creates, and
// VACUUM each deck.
//
// Why this exists. A committed deck is expected to be a byte-reproducible
// output of the build its manifest records (for write-battery-v1 that is
// `reference-harness/oracle/build-deck.sh`: a stock `decko setup` seed in a
// throwaway work directory, the fixture's deck.json applied under the frozen
// clock, assets pre-compiled, then
// `tools/parity-side-effects/ruby/seed.rb` eating the mods' declared data into
// the copy -- against decko 0.20.0 / card 1.110.0; see that fixture's
// MANIFEST.json, `provenance`). That recorded path only ever creates the tables
// below. Anything else in the file is not explained by the recorded build, so
// the file is not what the manifest says it is, and it is not something a
// reader of the public package should be carrying.
//
// How the list below was derived: every table stock Decko creates is
// `create_table` in `card/db/schema.rb` and in `card/mod/core/data/schema/`
// upstream, plus the tables this port's own `db/schema.sqlite.sql` and
// `db/migrations/` add, plus SQLite's own `sqlite_sequence`. The set is
// checked against a clean stock seed (reference-harness/fixtures/synthetic-v1,
// whose deck was built by the stock oracle) rather than hand-listed from what
// any particular deck happens to contain, so a foreign table is dropped by
// being unlisted and a Decko table is never at risk.
//
//   node reference-harness/corpus/drop-private-app-tables-from-fixture-decks.mjs
//
// SAFETY: an unlisted table that is NOT empty aborts the whole run before any
// deck is modified -- these are dropped only where they are provably empty,
// never as a data operation.
//
// The deck files change, so any fixture whose manifest hashes one must be
// re-pinned in the same change:
//   node reference-harness/runner/manifest.mjs fixture reference-harness/fixtures/synthetic-v1
//   node reference-harness/corpus/write-write-battery-manifest.mjs
// and for synthetic-v1 also the expected directory's identity
// (expected/run-meta.json's runs and expected/MANIFEST.json, which pin the
// fixture digest the stock oracle's answers were captured on).
//
// Re-pinning an already-published fixture is a declared exception to the
// immutability rule, with five conditions; `reference-harness/SPEC.md` section
// 6 states them and requires a `provenance.repin` disclosure plus a grade
// re-run.

import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { readdirSync } from "node:fs";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

// Every table stock Decko creates, and nothing else.
const STOCK_TABLES = new Set([
  "ar_internal_metadata",
  "card_actions",
  "card_acts",
  "card_changes",
  "card_references",
  "card_revisions",
  "card_virtuals",
  "cards",
  "delayed_jobs",
  "schema_migrations",
  "sessions",
  "sqlite_sequence",
  "transform_migrations",
  "users",
]);

// Every committed fixture deck, not a hand-picked list: a new fixture that
// picks up a foreign table is caught by the next run without anyone
// remembering to add it here.
const DECKS = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => join(FIXTURES, e.name, "deck", "deck.sqlite3"));

const quote = (name) => `"${name.replaceAll('"', '""')}"`;

for (const deck of DECKS) {
  let db;
  try {
    db = new DatabaseSync(deck, { readOnly: false });
  } catch (err) {
    console.log(`${deck}: not a readable deck file (${err.message}); skipped`);
    continue;
  }
  try {
    const present = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => r.name);
    const foreign = present.filter((t) => !STOCK_TABLES.has(t) && !t.startsWith("sqlite_"));
    if (foreign.length === 0) {
      console.log(`${deck}: stock schema only, nothing to do`);
      continue;
    }
    for (const table of foreign) {
      const rows = Number(db.prepare(`SELECT COUNT(*) AS n FROM ${quote(table)}`).get().n);
      if (rows !== 0) {
        console.error(`${deck}: ${table} holds ${rows} rows; refusing to drop a non-empty table`);
        process.exit(1);
      }
    }
    for (const table of foreign) db.exec(`DROP TABLE ${quote(table)}`);
    // Fold the drops into the main file and leave no WAL sidecars behind: a
    // clean close of a read-write connection removes them, and a stray
    // sidecar would make the fixture manifest check report the deck as
    // carrying a file its manifest does not list.
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.exec("VACUUM");
    console.log(`${deck}: dropped ${foreign.length} non-Decko table(s) (${foreign.join(", ")}) and vacuumed`);
  } finally {
    db.close();
  }
}