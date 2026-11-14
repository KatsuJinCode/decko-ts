// The deck's standard-card declaration: the two batches, the shapes, and the
// refusal to serve a wrong answer.
//
// The mock Hrana server runs REAL better-sqlite3, so "what SQLite means" here
// is not simulated: a wrong answer shows up as a wrong answer, not as a shape
// mismatch. Each case counts the statements the server actually received,
// which is the same thing tools/diagnose-owner-save-statement-ladder.mjs
// counts on the wire.
//
// What is asserted:
//   1. the declaration costs TWO round trips: one batch that FINDS the
//      standard cards, one batch that reads their SHAPES;
//   2. every reader of a declared shape then costs NO execute: the shape
//      that drifts apart from the declaration stops being answered, and the
//      read falls back to the blocking path (correct, one round trip later,
//      but a round trip the declaration was supposed to remove);
//   3. the deck's rule type cards are among the standard cards, so the
//      read-rule path's own codename reads are answered by the declaration;
//   4. the declaration never SERVES a wrong answer: a codename the deck does
//      not hold resolves to nothing, and the reader's own read of it still
//      answers the same.

import { describe, it, expect, afterEach } from "vitest";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { startMockHranaServer, type MockHranaServer } from "../../server/drivers/mock-hrana-server.js";
import {
  declareDeckStandardCards,
  DECK_STANDARD_CARD_CODENAMES,
} from "../../../src/card/fetch/standard-card-declaration.js";
import {
  CARD_CODENAME_BY_ID_SQL,
  CARD_ID_BY_CODENAME_SQL,
  CARD_ROW_BY_ID_SQL,
  LIVE_CARD_ROW_BY_ID_SQL,
} from "../../../src/card/fetch/card-read-shapes.js";

const servers: MockHranaServer[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

/** Every statement the server was actually asked to execute, in order. */
function executedSql(server: MockHranaServer): string[] {
  const out: string[] = [];
  for (const request of server.requests) {
    const entries = (request.body as { requests?: { type?: string; stmt?: { sql?: string } }[] } | undefined)?.requests ?? [];
    for (const entry of entries) {
      if (entry.type === "execute" && typeof entry.stmt?.sql === "string") out.push(entry.stmt.sql);
    }
  }
  return out;
}

const countOf = (server: MockHranaServer, sql: string): number =>
  executedSql(server).filter((s) => s === sql).length;

async function deck(): Promise<{ driver: BunnyDbDriver; server: MockHranaServer }> {
  const server = await startMockHranaServer();
  servers.push(server);
  const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
  await driver.query(
    "CREATE TABLE cards (id INTEGER PRIMARY KEY, name TEXT, key TEXT, codename TEXT, type_id INTEGER, left_id INTEGER, right_id INTEGER, trash INTEGER DEFAULT 0, db_content TEXT)",
    [],
  );
  // The deck's standard cards: the rule types and the card types, each
  // carried under its codename.
  await driver.query(
    "INSERT INTO cards (id, name, key, codename, type_id, trash, db_content) VALUES (11, 'Read', 'read', 'read', 5, 0, 'read body'), (12, 'Set', 'set', 'set', 5, 0, 'set body'), (13, 'RichText', 'rich_text', 'basic', 5, 0, 'basic body')",
    [],
  );
  // A card the deck carries WITHOUT a codename: the declaration must not
  // find it, and must not answer for it.
  await driver.query(
    "INSERT INTO cards (id, name, key, codename, type_id, trash, db_content) VALUES (14, 'Plain', 'plain', NULL, 5, 0, 'plain body')",
    [],
  );
  // A trashed card that carries a codename: the codename lookup filters the
  // trash, so the declaration must not find it.
  await driver.query(
    "INSERT INTO cards (id, name, key, codename, type_id, trash, db_content) VALUES (15, 'Gone', 'gone', 'setting', 5, 1, 'gone body')",
    [],
  );
  server.requests.length = 0; // the schema build above is not under test
  return { driver, server };
}

describe("the deck's standard-card declaration", () => {
  it("costs two round trips: one batch that FINDS the standard cards, one that reads their SHAPES", async () => {
    const { driver, server } = await deck();
    await driver.transaction(async () => {
      const before = server.requests.length;
      const ids = await declareDeckStandardCards(driver);
      // The FIND batch is one round trip carrying one statement per
      // standard codename, in the shape the readers of that shape use.
      expect(countOf(server, CARD_ID_BY_CODENAME_SQL)).toBe(DECK_STANDARD_CARD_CODENAMES.length);
      expect(server.requests.length - before).toBe(2);
      // The standard cards the deck carries, by codename.
      expect(ids.get("read")).toBe(11);
      expect(ids.get("set")).toBe(12);
      expect(ids.get("basic")).toBe(13);
      // A codename the deck does not carry resolves to nothing, and a
      // TRASHED card is not a standard card.
      expect(ids.get("setting")).toBeUndefined();
      expect(ids.has("user")).toBe(false);
    });
  });

  it("answers EVERY reader of a declared shape, and no reader reaches the server", async () => {
    const { driver, server } = await deck();
    await driver.transaction(async () => {
      await declareDeckStandardCards(driver);
      const declared = executedSql(server).length;
      // The rule type cards, by codename: the read-rule path's own read.
      const byCodename = await driver.query<{ id: number }>(CARD_ID_BY_CODENAME_SQL, ["read"]);
      expect(byCodename.rows[0]?.id).toBe(11);
      // The shapes of the standard cards.
      const row = await driver.query<{ db_content: string }>(CARD_ROW_BY_ID_SQL, [11]);
      expect(row.rows[0]?.db_content).toBe("read body");
      const live = await driver.query<{ db_content: string }>(LIVE_CARD_ROW_BY_ID_SQL, [12]);
      expect(live.rows[0]?.db_content).toBe("set body");
      const codename = await driver.query<{ codename: string }>(CARD_CODENAME_BY_ID_SQL, [13]);
      expect(codename.rows[0]?.codename).toBe("basic");
      // NOT ONE of those readers reached the server.
      expect(executedSql(server).length).toBe(declared);
    });
  });

  it("never serves a wrong answer: a codename the deck does not hold resolves to nothing", async () => {
    const { driver, server } = await deck();
    await driver.transaction(async () => {
      const ids = await declareDeckStandardCards(driver);
      expect(ids.get("user")).toBeUndefined();
      // The reader's own read of the missing codename still answers the same.
      const found = await driver.query(CARD_ID_BY_CODENAME_SQL, ["user"]);
      expect(found.rows).toEqual([]);
      // And the reader's own read of a card the deck does NOT declare still
      // answers the same.
      const row = await driver.query<{ db_content: string }>(CARD_ROW_BY_ID_SQL, [14]);
      expect(row.rows[0]?.db_content).toBe("plain body");
      expect(countOf(server, CARD_ROW_BY_ID_SQL)).toBe(4); // the three standard cards, and the plain one
    });
  });

  it("does nothing outside a transaction: there is no memo to hold the answers", async () => {
    const { driver, server } = await deck();
    const ids = await declareDeckStandardCards(driver);
    expect(ids.size).toBe(0);
    // The declaration reached no server at all.
    expect(executedSql(server).length).toBe(0);
  });
});
