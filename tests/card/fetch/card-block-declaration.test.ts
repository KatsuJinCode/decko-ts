// The card-block declaration: the widened shape set, the type chain, and
// the seam the save's input tree declares at.
//
// The mock Hrana server runs REAL better-sqlite3, so "what SQLite means" here
// is not simulated: a wrong answer shows up as a wrong answer, not as a
// shape mismatch. Each case counts the statements the server actually
// received, which is the same thing tools/diagnose-owner-save-statement-ladder.mjs
// counts on the wire.
//
// What is asserted:
//   1. ONE declaration puts a block's reads on ONE round trip per phase,
//      and EVERY shape the deck reads a card by is answered from it: a
//      shape that drifts apart from the declaration stops being answered,
//      and the read falls back to the blocking path (correct, one round trip
//      later, but a round trip the declaration was supposed to remove);
//   2. the deck's TYPE cards are declared too: a card's type is a property
//      of the deck, and the design's own capture says the ids a save binds
//      most are exactly those type cards;
//   3. a compound name travels with its sides, because a compound name's
//      lookup binds its sides' ids;
//   4. the declaration never SERVES a wrong answer: a name the deck does not
//      hold resolves to nothing, and the reader's own read of it still
//      answers the same.

import { describe, it, expect, afterEach } from "vitest";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { startMockHranaServer, type MockHranaServer } from "../../server/drivers/mock-hrana-server.js";
import { DbLexicon } from "../../../src/card/fetch/lexicon.js";
import { CardCache } from "../../../src/card/fetch/cache.js";
import { DeckoName } from "../../../src/card/name.js";
import {
  cardBlockNames,
  declareCardBlockReads,
  EVERY_CARD_BLOCK_SHAPE,
} from "../../../src/card/fetch/card-block-declaration.js";
import {
  CARD_CODENAME_BY_ID_SQL,
  CARD_CODENAME_BY_KEY_SQL,
  CARD_DB_CONTENT_BY_JUNCTION_SQL,
  CARD_ID_BY_JUNCTION_ORDERED_SQL,
  CARD_NAME_TRIPLE_BY_ID_SQL,
  CARD_ROW_BY_ID_SQL,
  CARD_ROW_BY_KEY_SQL,
  LIVE_CARD_ROW_BY_ID_SQL,
  TRASHED_CARD_BY_JUNCTION_SQL,
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

async function deck(): Promise<{ driver: BunnyDbDriver; server: MockHranaServer; lexicon: DbLexicon }> {
  const server = await startMockHranaServer();
  servers.push(server);
  const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
  await driver.query(
    "CREATE TABLE cards (id INTEGER PRIMARY KEY, name TEXT, key TEXT, codename TEXT, type_id INTEGER, left_id INTEGER, right_id INTEGER, trash INTEGER DEFAULT 0, db_content TEXT)",
    [],
  );
  await driver.query(
    "INSERT INTO cards (id, name, key, codename, type_id, left_id, right_id, trash, db_content) VALUES (1, 'Alpha', 'alpha', 'alpha_card', 9, NULL, NULL, 0, 'alpha body')",
    [],
  );
  await driver.query(
    "INSERT INTO cards (id, name, key, codename, type_id, left_id, right_id, trash, db_content) VALUES (2, 'Beta', 'beta', NULL, 9, NULL, NULL, 0, 'beta body')",
    [],
  );
  await driver.query(
    "INSERT INTO cards (id, name, key, codename, type_id, left_id, right_id, trash, db_content) VALUES (3, 'Owner', 'owner', NULL, 9, NULL, NULL, 0, 'owner body')",
    [],
  );
  await driver.query(
    "INSERT INTO cards (id, name, key, codename, type_id, left_id, right_id, trash, db_content) VALUES (9, 'Type', 'type', 'type_card', 9, NULL, NULL, 0, 'type body')",
    [],
  );
  server.requests.length = 0; // the schema build above is not under test
  const lexicon = new DbLexicon(driver, new CardCache());
  return { driver, server, lexicon };
}

describe("the card-block declaration", () => {
  it("answers EVERY shape the deck reads a card by, and costs one round trip per phase", async () => {
    const { driver, server, lexicon } = await deck();
    await driver.transaction(async () => {
      const before = server.requests.length;
      await declareCardBlockReads(
        driver,
        lexicon,
        [DeckoName.parse("alpha")],
        EVERY_CARD_BLOCK_SHAPE,
      );
      // The declaration went on the wire: the name lookup, the four by-id
      // shapes and the type chain.
      const declaredStatements = executedSql(server).length;
      expect(countOf(server, "SELECT id FROM cards WHERE key COLLATE NOCASE = ? AND trash = 0 LIMIT 1")).toBe(1); // the one simple name
      // EVERY READER of a declared shape now costs NO execute.
      const row = await driver.query<{ db_content: string }>(CARD_ROW_BY_ID_SQL, [1]);
      expect(row.rows[0]?.db_content).toBe("alpha body");
      const live = await driver.query<{ db_content: string }>(LIVE_CARD_ROW_BY_ID_SQL, [1]);
      expect(live.rows[0]?.db_content).toBe("alpha body");
      const codename = await driver.query<{ codename: string }>(CARD_CODENAME_BY_ID_SQL, [1]);
      expect(codename.rows[0]?.codename).toBe("alpha_card");
      const triple = await driver.query<{ name: string }>(CARD_NAME_TRIPLE_BY_ID_SQL, [1]);
      expect(triple.rows[0]?.name).toBe("Alpha");
      const byKey = await driver.query<{ db_content: string }>(CARD_ROW_BY_KEY_SQL, ["alpha"]);
      expect(byKey.rows[0]?.db_content).toBe("alpha body");
      const codenameByKey = await driver.query<{ codename: string }>(CARD_CODENAME_BY_KEY_SQL, ["alpha"]);
      expect(codenameByKey.rows[0]?.codename).toBe("alpha_card");
      // NOT ONE of those six readers reached the server: the statement count
      // is the same before and after them.
      expect(executedSql(server).length).toBe(declaredStatements);
      // The declaration itself cost four round trips: the name lookup, the
      // block's by-id rows, the block's by-key rows, and the type chain's
      // link.
      expect(server.requests.length - before).toBe(4);
    });
  });

  it("declares the deck's TYPE cards: a card's type is a property of the deck", async () => {
    const { driver, server, lexicon } = await deck();
    await driver.transaction(async () => {
      await declareCardBlockReads(driver, lexicon, [DeckoName.parse("alpha")], { byId: true, byTypeChain: true });
      // The type card's own row was declared: the reader of it costs no
      // execute, even though the block's names never named it.
      const typeRow = await driver.query<{ codename: string }>(CARD_ROW_BY_ID_SQL, [9]);
      expect(typeRow.rows[0]?.codename).toBe("type_card");
      expect(countOf(server, CARD_ROW_BY_ID_SQL)).toBe(2); // the block's id, and the type card's
    });
  });

  it("travels with a compound name's sides, because a compound lookup binds them", async () => {
    const { driver, server, lexicon } = await deck();
    const names = cardBlockNames(["owner+alpha"], undefined);
    expect(names.map((n) => n.s)).toEqual(["owner+alpha", "owner", "alpha"]);
    await driver.transaction(async () => {
      await declareCardBlockReads(driver, lexicon, names, { byId: true });
      // The sides' name lookups are on the wire, and the compound name's own
      // junction lookup is too (it binds the sides' ids).
      expect(countOf(server, "SELECT id FROM cards WHERE key COLLATE NOCASE = ? AND trash = 0 LIMIT 1")).toBe(2);
      expect(
        countOf(server, "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1"),
      ).toBe(1);
    });
  });

  it("never serves a wrong answer: a name the deck does not hold resolves to nothing", async () => {
    const { driver, server, lexicon } = await deck();
    await driver.transaction(async () => {
      const ids = await declareCardBlockReads(driver, lexicon, [DeckoName.parse("gamma")], {
        byId: true,
      });
      expect(ids).toEqual([]);
      // The reader's own read of the missing name still answers the same.
      const found = await driver.query("SELECT id FROM cards WHERE key COLLATE NOCASE = ? AND trash = 0 LIMIT 1", [
        "gamma",
      ]);
      expect(found.rows).toEqual([]);
    });
  });

  it("names the junction shapes the follower reads, when the scope asks for them", async () => {
    const { driver, server, lexicon } = await deck();
    await driver.transaction(async () => {
      await declareCardBlockReads(driver, lexicon, [DeckoName.parse("owner+alpha")], {
        byId: true,
        byPair: true,
      });
      expect(countOf(server, CARD_ID_BY_JUNCTION_ORDERED_SQL)).toBe(1);
      expect(countOf(server, CARD_DB_CONTENT_BY_JUNCTION_SQL)).toBe(1);
    });
  });

  it("names the TRASHED junction, so the rename validation's obstacle read costs no execute", async () => {
    const { driver, server, lexicon } = await deck();
    await driver.transaction(async () => {
      await declareCardBlockReads(driver, lexicon, [DeckoName.parse("owner+alpha")], {
        byId: true,
        byPair: true,
      });
      expect(countOf(server, TRASHED_CARD_BY_JUNCTION_SQL)).toBe(1);
      const declared = executedSql(server).length;
      // The reader of that shape (src/card/actions/name-validation.ts) now
      // costs NO execute: the statement it issues is the one the
      // declaration prefetched.
      const trashed = await driver.query<{ id: number }>(TRASHED_CARD_BY_JUNCTION_SQL, [3, 1]);
      expect(trashed.rows).toEqual([]);
      expect(executedSql(server).length).toBe(declared);
    });
  });
});
