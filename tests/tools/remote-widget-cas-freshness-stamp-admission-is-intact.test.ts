import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

// Row: smell-apply-remote-widget-cas.
//
// The probe this row names is a one-shot compare-and-swap write against a live
// production database, and it must not be re-run: re-running it would perform a
// second production write, which is an operator decision and not an agent one,
// and it is one-shot by construction (it opens its intent file with the
// exclusive-create flag, so a second attempt cannot even reach the write). There
// is therefore no runnable check for the row itself, and this file is not one:
// running the probe would be the prohibited act, not its verification.
//
// What can be checked without that act is the port-side condition the executed
// statement's admission rested on. The statement it ran gated its write on a
// single-row version stamp - matches = 12 AND version = ? AND version_rows = 1
// - where the version is moved by triggers on every card table. If the port ever
// lost that stamp, a future authorized write would be gated on a predicate that
// could no longer discriminate anything, and nobody would find out from the
// write itself. So: the stamp is executed here against the port's own schema,
// on a throwaway in-memory database, and its behaviour is asserted.
//
// The prepared Bunny database credential the probe would need is named below
// and asserted absent from this tree, so the one-shot cannot be armed from the
// branch that records this.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const schema = readFileSync(path.join(repo, "db", "schema.sqlite.sql"), "utf8");

// The credential roster row smell-prepare-owned-database-access records as
// prepared and not yet retired. It exists in another checkout; it must never be
// copied into this one, because from here the one-shot write is armable.
const preparedDatabaseCredential = path.join(repo, ".runtime", "owned-cs-edge-cleanup-20261018.env");

const STAMP_COLUMN = 'SELECT COUNT(*) AS rows FROM deck_data_version';
const STAMP_VALUE = "SELECT version FROM deck_data_version WHERE id = 1";

function freshDeck() {
  const db = new Database(":memory:") as unknown as {
    exec(sql: string): void;
    prepare(sql: string): { run(...params: unknown[]): unknown; get(): Record<string, unknown> };
    close(): void;
  };
  db.exec(schema);
  return db;
}

function insertCard(db: ReturnType<typeof freshDeck>): number {
  const at = "2026-10-20T00:00:00.000Z";
  db.prepare(
    "INSERT INTO cards (name, db_content, created_at, updated_at, creator_id, updater_id, trash, type_id)" +
      " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run("cas-admission-probe", "{}", at, at, 1, 1, 0, 1);
  return db.prepare("SELECT id FROM cards ORDER BY id LIMIT 1").get().id as unknown as number;
}

describe("the freshness stamp the remote-widget CAS admission depends on is intact in the port", () => {
  it("seeds deck_data_version as exactly one row that no write can duplicate", () => {
    const db = freshDeck();
    expect(db.prepare(STAMP_COLUMN).get().rows).toBe(1);
    expect(db.prepare(STAMP_VALUE).get().version).toBe(0);
    // The `version_rows = 1` half of the admission is only meaningful while the
    // table cannot grow a second row, so the constraint itself is asserted and
    // not just the row count it currently happens to have.
    expect(() =>
      db.prepare("INSERT INTO deck_data_version (id, version) VALUES (2, 5)").run(),
    ).toThrow(/CHECK constraint failed/);
    expect(db.prepare(STAMP_COLUMN).get().rows).toBe(1);
    db.close();
  });

  it("moves the stamp on a card insert and on a card update, so `version = ?` discriminates", () => {
    const db = freshDeck();
    expect(db.prepare(STAMP_VALUE).get().version).toBe(0);
    const cardId = insertCard(db);
    expect(db.prepare(STAMP_VALUE).get().version).toBe(1);
    db.prepare("UPDATE cards SET db_content = ? WHERE id = ?").run('{"edited":1}', cardId);
    expect(db.prepare(STAMP_VALUE).get().version).toBe(2);
    db.close();
  });

  it("carries no database credential, so the one-shot write is not armable from this branch", () => {
    expect(existsSync(preparedDatabaseCredential)).toBe(false);
    // The one-shot probe lives outside this tree; what is asserted here is the
    // narrower thing this branch controls - it does not carry the credential
    // that write would need.
    expect(existsSync(path.join(repo, ".runtime"))).toBe(false);
  });
});
