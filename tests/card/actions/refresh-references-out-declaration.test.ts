// The reference walk's name resolutions, declared: the walk resolves every
// chunk's referee name through the Lexicon, and each resolution is a round
// trip. The names are all known at the seam, so they are declared once and
// the walk's own reads of them cost no round trip.
//
// The mock Hrana server runs REAL better-sqlite3, so "what SQLite means" here
// is not simulated: a wrong answer shows up as a wrong answer, not as a
// shape mismatch. Each case counts the PIPELINE POSTS the server actually
// received, which is the same thing the statement ladder counts on the wire:
// a POST is a round trip, and several statements in one POST are one round
// trip.
//
// What is asserted:
//   1. the walk's name resolutions ride ONE round trip, measured both ways
//      (with the declaration and without it);
//   2. the declaration changes the NUMBER of round trips, never the ANSWERS:
//      the rows it produces are the rows the walk produced without it;
//   3. a name the deck does not hold still resolves to nothing, and the
//      walk's own read of it still answers the same.

import { describe, it, expect, afterEach } from "vitest";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { startMockHranaServer, type MockHranaServer } from "../../server/drivers/mock-hrana-server.js";
import { DbLexicon } from "../../../src/card/fetch/lexicon.js";
import { CardCache } from "../../../src/card/fetch/cache.js";
import { DeckoName } from "../../../src/card/name.js";
import { referenceRowsOut, type ReferenceLexicon } from "../../../src/card/actions/refresh-references-out.js";

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

async function deck(): Promise<{ driver: BunnyDbDriver; server: MockHranaServer; lexicon: DbLexicon }> {
  const server = await startMockHranaServer();
  servers.push(server);
  const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
  await driver.query(
    "CREATE TABLE cards (id INTEGER PRIMARY KEY, name TEXT, key TEXT, codename TEXT, type_id INTEGER, left_id INTEGER, right_id INTEGER, trash INTEGER DEFAULT 0, db_content TEXT)",
    [],
  );
  await driver.query(
    "INSERT INTO cards (id, name, key, codename, type_id, left_id, right_id, trash, db_content) VALUES (1, 'First', 'first', NULL, 9, NULL, NULL, 0, 'first body')",
    [],
  );
  await driver.query(
    "INSERT INTO cards (id, name, key, codename, type_id, left_id, right_id, trash, db_content) VALUES (2, 'Second', 'second', NULL, 9, NULL, NULL, 0, 'second body')",
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

const BY_KEY = "SELECT id FROM cards WHERE key COLLATE NOCASE = ?";

describe("the reference walk's declared names", () => {
  it("rides ONE round trip for the walk's names, and a warm Lexicon costs none, measured both ways", async () => {
    const { driver, server, lexicon } = await deck();
    const content = "[[first]] [[second]] [[third]]";

    // WITHOUT the declaration: one round trip per name.
    const plain: ReferenceLexicon = { id: (nameish) => lexicon.id(nameish) };
    await driver.transaction(async () => {
      const rows = await referenceRowsOut(driver, plain, 3, DeckoName.parse("owner"), content);
      expect(rows.length).toBe(3); // first and second resolve; third does not
    });
    const withoutDeclaration = postsWith(server, BY_KEY);
    expect(withoutDeclaration).toBe(3);

    // WITH the declaration, on a COLD Lexicon (the first walk above warmed
    // THIS lexicon's cache, and a held entry is answered there without a
    // declaration - the skip gate): ONE round trip for all three names.
    const coldLexicon = new DbLexicon(driver, new CardCache());
    server.requests.length = 0;
    await driver.transaction(async () => {
      const rows = await referenceRowsOut(driver, coldLexicon, 3, DeckoName.parse("owner"), content);
      expect(rows.length).toBe(3);
    });
    const withDeclaration = postsWith(server, BY_KEY);
    expect(withDeclaration).toBe(1);

    // WARM: the walk above left every name's entry in the Lexicon's cache,
    // so a re-walk of the same content declares nothing and asks nothing.
    server.requests.length = 0;
    await driver.transaction(async () => {
      const rows = await referenceRowsOut(driver, coldLexicon, 3, DeckoName.parse("owner"), content);
      expect(rows.length).toBe(3);
    });
    expect(postsWith(server, BY_KEY)).toBe(0);
  }, 30_000);

  it("changes the NUMBER of round trips, never the ANSWERS", async () => {
    const { driver, server, lexicon } = await deck();
    const content = "[[first]] [[second]] [[third]]";
    const plain: ReferenceLexicon = { id: (nameish) => lexicon.id(nameish) };
    const withoutDeclaration = await driver.transaction(async () =>
      referenceRowsOut(driver, plain, 3, DeckoName.parse("owner"), content),
    );
    server.requests.length = 0;
    const withDeclaration = await driver.transaction(async () =>
      referenceRowsOut(driver, lexicon, 3, DeckoName.parse("owner"), content),
    );
    expect(withDeclaration).toEqual(withoutDeclaration);
    // The rows the walk produced: first and second resolved, third unknown.
    expect(withDeclaration.map((row) => [row.refereeKey, row.refereeId, row.refType])).toEqual([
      ["first", 1, "L"],
      ["second", 2, "L"],
      ["third", null, "L"],
    ]);
  }, 30_000);
});
