// The port opens a database Ruby Decko built, as it is: the objects it adds
// are additive and idempotent, Ruby's tables and indexes are untouched, and a
// write made the way Ruby makes it moves the port's freshness stamp.
//
// The deck is the Ruby-built synthetic fixture (reference-harness/fixtures/
// synthetic-v1/deck/deck.sqlite3, built by the stock Ruby oracle), copied to
// a scratch directory so the fixture itself is never opened for writing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import { isRubyDeckoDatabase, openSameDatabase, passwordHashModeFor } from "../../src/server/same-database.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DECK = path.join(here, "../../reference-harness/fixtures/synthetic-v1/deck/deck.sqlite3");

/** Every schema object's definition, and every row of Ruby's tables. */
function rubyState(file: string): { objects: Map<string, string>; rows: Map<string, string> } {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const objects = new Map<string, string>();
    for (const r of db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'`).all()) {
      objects.set(String(r.name), `${String(r.type)} ${String(r.tbl_name)} ${String(r.sql)}`);
    }
    const rows = new Map<string, string>();
    for (const r of db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all()) {
      const t = String(r.name);
      rows.set(t, JSON.stringify(db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all()));
    }
    return { objects, rows };
  } finally {
    db.close();
  }
}

let scratch: string;
let deck: string;
let original: ReturnType<typeof rubyState>;

beforeAll(() => {
  scratch = mkdtempSync(path.join(os.tmpdir(), "decko-same-db-"));
  deck = path.join(scratch, "deck.sqlite3");
  copyFileSync(FIXTURE_DECK, deck);
  original = rubyState(deck);
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("opening a Ruby-built database as it is", () => {
  it("recognises the database as Ruby's and adds only port objects, leaving Ruby's untouched", async () => {
    const driver = new LocalSqliteDriver({ path: deck, readonly: false });
    try {
      expect(await isRubyDeckoDatabase(driver)).toBe(true);
      const report = await openSameDatabase(driver);
      expect(report.rubyDatabase).toBe(true);
      expect(report.created).toEqual(
        [
          "auth_migrations",
          "auth_sessions",
          "card_references_bump_deck_data_version_del",
          "card_references_bump_deck_data_version_ins",
          "card_references_bump_deck_data_version_upd",
          "cards_bump_deck_data_version_del",
          "cards_bump_deck_data_version_ins",
          "cards_bump_deck_data_version_upd",
          "cards_codename_present_index",
          "cards_key_last_char_index",
          "cards_name_trash_index",
          "cards_right_id_trash_index",
          "deck_data_version",
          "index_auth_sessions_on_account_card_id",
          "index_auth_sessions_on_expires_at",
        ].sort(),
      );
    } finally {
      driver.close?.();
    }
    const after = rubyState(deck);
    // Every object Ruby created is still there with the same definition.
    for (const [name, def] of original.objects) expect(after.objects.get(name), name).toBe(def);
    // Every row of every table Ruby created is byte-for-byte unchanged.
    for (const [table, rows] of original.rows) expect(after.rows.get(table), table).toBe(rows);
  });

  it("is idempotent: a second open creates nothing and changes nothing", async () => {
    const before = rubyState(deck);
    const driver = new LocalSqliteDriver({ path: deck, readonly: false });
    try {
      const report = await openSameDatabase(driver);
      expect(report.created).toEqual([]);
      expect(report.authMigrationsApplied).toEqual([]);
    } finally {
      driver.close?.();
    }
    const after = rubyState(deck);
    expect([...after.objects]).toEqual([...before.objects]);
    expect([...after.rows]).toEqual([...before.rows]);
  });

  it("moves the freshness stamp on a write made the way Ruby makes it", async () => {
    const db = new DatabaseSync(deck);
    try {
      const stamp = () => Number((db.prepare(`SELECT version FROM deck_data_version WHERE id = 1`).get() as { version: number }).version);
      const start = stamp();
      // ActiveRecord's UPDATE of a card's content, as Ruby issues it.
      db.prepare(`UPDATE cards SET db_content = db_content || '', updated_at = updated_at WHERE id = (SELECT MIN(id) FROM cards)`).run();
      expect(stamp()).toBe(start + 1);
    } finally {
      db.close();
    }
  });

  it("keeps Ruby's password scheme on a Ruby database unless the host says otherwise", () => {
    expect(passwordHashModeFor(true, undefined)).toBe("legacy-sha1");
    expect(passwordHashModeFor(true, "pbkdf2")).toBe("pbkdf2");
    expect(passwordHashModeFor(false, undefined)).toBeUndefined();
  });
});
