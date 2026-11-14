// The freshness stamp covers every card table, and every path that brings a
// deck in or opens it installs the stamp on a deck that lacks it.

import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { LocalSqliteDriver } from "../../src/server/drivers/local-sqlite.js";
import {
  FRESHNESS_STAMPED_TABLES,
  ensureFreshnessStamp,
  freshnessTriggerNames,
} from "../../src/server/freshness-stamp.js";
import { installFreshnessStamp, parseTargetSchema } from "../../tools/migrate/import.mjs";

const ROOT = process.cwd();
const SYNTHETIC = join(ROOT, "reference-harness", "fixtures", "synthetic-v1", "deck", "deck.sqlite3");
const DDL = join(ROOT, "db", "schema.sqlite.sql");
const MIGRATION = join(ROOT, "deploy", "migrations", "0010-deck-data-version-all-card-tables.sql");

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A private copy of a Ruby-built deck: Decko's tables, no stamp. */
function rubyDeck(): string {
  const dir = mkdtempSync(join(tmpdir(), "decko-stamp-"));
  dirs.push(dir);
  const path = join(dir, "deck.sqlite3");
  copyFileSync(SYNTHETIC, path);
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = DELETE");
  db.close();
  return path;
}

const triggersOf = (db: DatabaseSync) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE '%deck_data_version%' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
const version = (db: DatabaseSync) => (db.prepare('SELECT "version" FROM deck_data_version WHERE id = 1').get() as { version: number }).version;

describe("the freshness stamp's coverage", () => {
  it("stamps every card table: the persistence contract's six", () => {
    expect([...FRESHNESS_STAMPED_TABLES]).toEqual(["cards", "card_acts", "card_actions", "card_changes", "card_references", "card_virtuals"]);
  });

  it("the schema, the D1 migration and the open path install the same triggers", () => {
    const names = (sql: string) => [...sql.matchAll(/CREATE TRIGGER (?:IF NOT EXISTS )?"([a-z_]+)"/g)].map((m) => m[1]).sort();
    const expected = freshnessTriggerNames().sort();
    expect(names(readFileSync(DDL, "utf8"))).toEqual(expected);
    expect(names(readFileSync(MIGRATION, "utf8"))).toEqual(expected);
  });
});

describe.skipIf(!existsSync(SYNTHETIC))("installing the stamp on a deck that lacks it", () => {
  it("the open path installs it once, and a card_actions-only write moves it", async () => {
    const path = rubyDeck();
    const driver = new LocalSqliteDriver({ path });
    try {
      const first = await ensureFreshnessStamp(driver);
      expect(first.installed).toContain("table deck_data_version");
      expect(first.installed).toContain("trigger card_actions_bump_deck_data_version_upd");
      // Idempotent: a second open finds the stamp whole and writes nothing.
      expect((await ensureFreshnessStamp(driver)).installed).toEqual([]);
    } finally {
      driver.close();
    }
    const db = new DatabaseSync(path);
    try {
      expect(triggersOf(db)).toEqual(freshnessTriggerNames().sort());
      const before = version(db);
      // The write path's card_actions-only statements: an UPDATE of one
      // action row, an INSERT of a reserved action, and its DELETE.
      const action = (db.prepare("SELECT id, super_action_id FROM card_actions ORDER BY id LIMIT 1").get() as { id: number; super_action_id: number | null });
      db.prepare("UPDATE card_actions SET super_action_id = ? WHERE id = ?").run(action.super_action_id, action.id);
      expect(version(db)).toBe(before + 1);
      const reserved = db.prepare("INSERT INTO card_actions (card_id, draft) VALUES (NULL, 0)").run().lastInsertRowid;
      expect(version(db)).toBe(before + 2);
      db.prepare("DELETE FROM card_actions WHERE id = ?").run(reserved);
      expect(version(db)).toBe(before + 3);
      // A row in each other card table moves it too.
      const act = db.prepare("SELECT id FROM card_acts ORDER BY id LIMIT 1").get() as { id: number };
      db.prepare("UPDATE card_acts SET ip_address = ip_address WHERE id = ?").run(act.id);
      const change = db.prepare("SELECT id FROM card_changes ORDER BY id LIMIT 1").get() as { id: number };
      db.prepare("UPDATE card_changes SET value = value WHERE id = ?").run(change.id);
      expect(version(db)).toBe(before + 5);
    } finally {
      db.close();
    }
  });

  it("the open path completes a partial stamp: a deck stamped on cards and card_references only", async () => {
    const path = rubyDeck();
    const db = new DatabaseSync(path);
    db.exec(readFileSync(join(ROOT, "deploy", "migrations", "0003-deck-data-version-stamp.sql"), "utf8"));
    db.exec("UPDATE deck_data_version SET version = 41 WHERE id = 1");
    db.close();
    const driver = new LocalSqliteDriver({ path });
    try {
      const { installed } = await ensureFreshnessStamp(driver);
      expect(installed.sort()).toEqual(
        freshnessTriggerNames(["card_acts", "card_actions", "card_changes", "card_virtuals"]).map((n) => `trigger ${n}`).sort(),
      );
    } finally {
      driver.close();
    }
    const after = new DatabaseSync(path);
    try {
      // The existing version is kept, not reset.
      expect(version(after)).toBe(41);
    } finally {
      after.close();
    }
  });

  it("the import path installs it from the schema, idempotently", async () => {
    const path = rubyDeck();
    const db = new DatabaseSync(path);
    const driver = {
      query: async (sql: string, params: unknown[]) => {
        const stmt = db.prepare(sql);
        return /^\s*SELECT/i.test(sql) ? { rows: stmt.all(...(params as never[])) } : (stmt.run(...(params as never[])), { rows: [] });
      },
    };
    try {
      const schema = parseTargetSchema(DDL);
      await installFreshnessStamp(driver as never, schema);
      await installFreshnessStamp(driver as never, schema);
      expect(triggersOf(db)).toEqual(freshnessTriggerNames().sort());
      expect(version(db)).toBe(0);
    } finally {
      db.close();
    }
  });
});
