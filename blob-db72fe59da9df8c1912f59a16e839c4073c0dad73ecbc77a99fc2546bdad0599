// The list card's two shapes, declared: the reference walk reads the card's
// own codename triple and its type's codename back to back, and each read is
// a pipeline POST of its own. One batch carries both, so the walk pays ONE
// round trip per card instead of two.
//
// The mock Hrana server runs REAL better-sqlite3, so "what SQLite means" here
// is not simulated: a wrong answer shows up as a wrong answer, not as a
// shape mismatch. Each case counts the PIPELINE POSTS the server actually
// received, which is the same thing the statement ladder counts on the wire.
//
// What is asserted:
//   1. the two shapes ride ONE round trip, measured both ways (two POSTs
//      without the declaration, one with it);
//   2. the declaration changes the NUMBER of round trips, never the ANSWERS:
//      the row the reader gets is the row it got without the declaration;
//   3. the readers use the REGISTRY's statements, so a declaration and a
//      reader cannot drift apart on the whitespace of a statement string.

import { describe, it, expect, afterEach } from "vitest";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { startMockHranaServer, type MockHranaServer } from "../../server/drivers/mock-hrana-server.js";
import { declareListCardShapes, isListCard } from "../../../src/card/actions/list-content.js";
import {
  CARD_CODENAME_TRIPLE_BY_ID_SQL,
  CARD_TYPE_CODENAME_BY_ID_SQL,
} from "../../../src/card/fetch/card-read-shapes.js";

const servers: MockHranaServer[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

/** The pipeline POSTs the server received whose body carried a statement
 *  matching the fragment. One POST is one round trip. */
function postsWith(server: MockHranaServer, fragment: string): number {
  let posts = 0;
  for (const request of server.requests) {
    const entries = (request.body as { requests?: { type?: string; stmt?: { sql?: string } }[] } | undefined)?.requests ?? [];
    for (const entry of entries) {
      if (entry.type !== "execute") continue;
      if ((entry.stmt?.sql ?? "").includes(fragment)) {
        posts += 1;
        break;
      }
    }
  }
  return posts;
}

/** The statements the server was actually asked to execute, in order. */
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

const TRIPLE = "own_code";
const TYPE_CODENAME = "t.codename AS codename FROM cards c JOIN cards t";

async function deck(): Promise<{ driver: BunnyDbDriver; server: MockHranaServer }> {
  const server = await startMockHranaServer();
  servers.push(server);
  const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
  await driver.query(
    "CREATE TABLE cards (id INTEGER PRIMARY KEY, name TEXT, key TEXT, codename TEXT, type_id INTEGER, left_id INTEGER, right_id INTEGER, trash INTEGER DEFAULT 0, db_content TEXT)",
    [],
  );
  // A card whose type is the cardtype: the walk asks whether it is a list
  // card (the codename triple) and then whether its type is the cardtype
  // (the type's codename).
  await driver.query(
    "INSERT INTO cards (id, name, key, codename, type_id, trash, db_content) VALUES (5, 'Cardtype', 'cardtype', 'cardtype', 5, 0, 'cardtype body')",
    [],
  );
  await driver.query(
    "INSERT INTO cards (id, name, key, codename, type_id, trash, db_content) VALUES (9, 'List', 'list', 'list', 5, 0, 'list body')",
    [],
  );
  await driver.query(
    "INSERT INTO cards (id, name, key, codename, type_id, left_id, right_id, trash, db_content) VALUES (12, 'Owner', 'owner', NULL, 5, NULL, NULL, 0, 'owner body')",
    [],
  );
  server.requests.length = 0; // the schema build above is not under test
  return { driver, server };
}

describe("the list card's two shapes, declared", () => {
  it("rides ONE round trip, measured both ways", async () => {
    const { driver, server } = await deck();
    // WITHOUT the declaration: the walk's two reads are two round trips.
    await driver.transaction(async () => {
      await isListCard(driver, 12);
      await driver.query(CARD_TYPE_CODENAME_BY_ID_SQL, [12]);
    });
    expect(postsWith(server, TRIPLE)).toBe(1);
    expect(postsWith(server, TYPE_CODENAME)).toBe(1);
    expect(postsWith(server, TRIPLE) + postsWith(server, TYPE_CODENAME)).toBe(2);

    // WITH the declaration: ONE round trip carries both, and the readers
    // that follow are answered from the driver's read memo.
    server.requests.length = 0;
    await driver.transaction(async () => {
      await declareListCardShapes(driver, 12);
      await isListCard(driver, 12);
      await driver.query(CARD_TYPE_CODENAME_BY_ID_SQL, [12]);
    });
    expect(postsWith(server, TRIPLE)).toBe(1);
    expect(postsWith(server, TYPE_CODENAME)).toBe(1);
    // ONE POST carried BOTH statements.
    const both = server.requests.filter((request) => {
      const entries = (request.body as { requests?: { type?: string; stmt?: { sql?: string } }[] } | undefined)?.requests ?? [];
      const sqls = entries.filter((e) => e.type === "execute").map((e) => e.stmt?.sql ?? "");
      return sqls.some((s) => s.includes(TRIPLE)) && sqls.some((s) => s.includes(TYPE_CODENAME));
    });
    expect(both.length).toBe(1);
  }, 30_000);

  it("changes the NUMBER of round trips, never the ANSWERS", async () => {
    const { driver, server } = await deck();
    const withoutDeclaration = await driver.transaction(async () => isListCard(driver, 12));
    server.requests.length = 0;
    const withDeclaration = await driver.transaction(async () => {
      await declareListCardShapes(driver, 12);
      return isListCard(driver, 12);
    });
    expect(withDeclaration).toBe(withoutDeclaration);
    // The card is NOT a list card (its type is the cardtype, not one of the
    // list codenames), so the walk takes the search/plain arm.
    expect(withDeclaration).toBe(false);
  }, 30_000);

  it("uses the REGISTRY's statements, so a reader and a declaration cannot drift apart", async () => {
    const { driver, server } = await deck();
    await driver.transaction(async () => {
      await declareListCardShapes(driver, 12);
    });
    const sqls = executedSql(server);
    expect(sqls).toContain(CARD_CODENAME_TRIPLE_BY_ID_SQL);
    expect(sqls).toContain(CARD_TYPE_CODENAME_BY_ID_SQL);
  }, 30_000);
});
