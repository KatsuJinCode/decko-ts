#!/usr/bin/env node
// drop-private-app-tables-from-fixture-decks.mjs -- remove the `library_*`
// tables of a private reading-assistant application from the two committed
// reference-harness fixture decks, and VACUUM each deck.
//
// How the two committed decks were seeded: by the stock oracle, the same path
// the fixtures' manifests record as their deck builder. For write-battery-v1
// that is `reference-harness/oracle/build-deck.sh` -- a stock `decko setup`
// seed in a throwaway work directory, the fixture's deck.json applied under the
// frozen clock, assets pre-compiled, and then
// `tools/parity-side-effects/ruby/seed.rb` eating the mods' declared data into
// the copy -- against decko 0.20.0 / card 1.110.0
// (reference-harness/fixtures/write-battery-v1/MANIFEST.json, `provenance`).
// That recorded path does not create another application's schema, and the
// reference oracle is stock: `reference-harness/SPEC.md` section 5.
//
// What the committed deck files actually carry is eight empty `library_*`
// tables belonging to a private reading-assistant application, which rode
// along in them and which nothing in this repository creates or reads: the
// graded surface (render, semantics and scenario answers, and per-step row
// deltas over Decko's own card tables) never touches them, and every one of
// the eight is empty. Their presence is not explained by the recorded build,
// so the committed files are not a byte-reproducible output of that path.
// Dropping them keeps the public corpus free of another application's schema,
// and makes the dropped detail the only difference between the committed decks
// and what the recorded build produces.
//
//   node reference-harness/corpus/drop-private-app-tables-from-fixture-decks.mjs
//
// SAFETY: a `library_*` table that is NOT empty aborts the whole run before
// any deck is modified -- these tables are dropped only where they are
// provably empty, never as a data operation.
//
// The deck files change, so both fixtures' manifests must be re-pinned in the
// same change:
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
import { join } from "node:path";
import { dirname } from "node:path";

const FIXTURES = dirname(fileURLToPath(import.meta.url)) + "/../fixtures";
const DECKS = [
  join(FIXTURES, "synthetic-v1", "deck", "deck.sqlite3"),
  join(FIXTURES, "write-battery-v1", "deck", "deck.sqlite3"),
];

for (const deck of DECKS) {
  const db = new DatabaseSync(deck);
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'library\\_%' ESCAPE '\\' ORDER BY name")
      .all()
      .map((r) => r.name);
    if (tables.length === 0) {
      console.log(`${deck}: no library_* tables, nothing to do`);
      continue;
    }
    for (const table of tables) {
      const rows = Number(db.prepare(`SELECT COUNT(*) AS n FROM "${table.replaceAll('"', '""')}"`).get().n);
      if (rows !== 0) {
        console.error(`${deck}: ${table} holds ${rows} rows; refusing to drop non-empty tables`);
        process.exit(1);
      }
    }
    for (const table of tables) db.exec(`DROP TABLE "${table.replaceAll('"', '""')}"`);
    // Fold the drops into the main file and leave no WAL sidecars behind: a
    // clean close of a read-write connection removes them, and a stray
    // sidecar would make the fixture manifest check report the deck as
    // carrying a file its manifest does not list.
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.exec("VACUUM");
    console.log(`${deck}: dropped ${tables.length} empty library_* tables (${tables.join(", ")}) and vacuumed`);
  } finally {
    db.close();
  }
}
