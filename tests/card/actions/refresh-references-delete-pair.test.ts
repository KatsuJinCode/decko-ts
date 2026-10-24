// The reference refresh's joined deletes: the referer's card_references
// rows and its decko_nest_edges rows ride ONE pipeline POST.
//
// Before this joined them, the two deletes were issued back to back as two
// separate queries, and each was its own round trip: the graded save runs
// the pair for every card whose content changed. What is asserted:
//
//   1. ONE round trip carries BOTH deletes (a POST is a round trip, the
//      same thing the statement ladder counts on the wire);
//   2. the end state is what the two separate deletes produced: the
//      referer's rows are gone from both tables, and OTHER referers' rows
//      are untouched;
//   3. the full refresh (refreshReferencesOut) leaves the same state, so
//      the seam the save calls is the seam that joined them;
//   4. with no nest-edge table installed, the delete still runs (the join
//      degrades to the one statement the deck can execute).
//
// The mock Hrana server runs REAL better-sqlite3, so "what SQLite means"
// here is not simulated.

import { describe, it, expect, afterEach } from "vitest";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { startMockHranaServer, type MockHranaServer } from "../../server/drivers/mock-hrana-server.js";
import { DbLexicon } from "../../../src/card/fetch/lexicon.js";
import { CardCache } from "../../../src/card/fetch/cache.js";
import { DeckoName } from "../../../src/card/name.js";
import {
  deleteReferencesAndNestEdges,
  refreshReferencesOut,
  type ReferenceLexicon,
} from "../../../src/card/actions/refresh-references-out.js";
import { NEST_EDGE_CACHE_DDL } from "../../../src/card/nest-index-cache.js";

const servers: MockHranaServer[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

/** The pipeline POSTs whose body carried a statement matching BOTH
 *  fragments: the round trips that carried the joined pair. */
function postsWithBoth(server: MockHranaServer, one: string, two: string): number {
  let posts = 0;
  for (const request of server.requests) {
    const entries = (request.body as { requests?: { type?: string; stmt?: { sql?: string } }[] } | undefined)?.requests ?? [];
    const sqls = entries.filter((e) => e.type === "execute").map((e) => e.stmt?.sql ?? "");
    if (sqls.some((s) => s.includes(one)) && sqls.some((s) => s.includes(two))) posts += 1;
  }
  return posts;
}

const CARDS_DELETE = "DELETE FROM card_references WHERE referer_id = ?";
const EDGES_DELETE = "DELETE FROM decko_nest_edges WHERE referer_id=?";

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
  await driver.query("CREATE TABLE card_references (referer_id INTEGER, referee_key TEXT, referee_id INTEGER, ref_type TEXT)", []);
  await driver.query(NEST_EDGE_CACHE_DDL, []);
  // Referer 1 carries rows in both tables; referer 2 carries rows neither
  // delete may touch.
  await driver.query(
    "INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type) VALUES (1, 'second', 2, 'L'), (2, 'first', 1, 'L')",
    [],
  );
  await driver.query(
    `INSERT INTO decko_nest_edges (referer_id, referee_id, referee_key) VALUES (1, 2, 'second'), (2, 1, 'first')`,
    [],
  );
  server.requests.length = 0; // the schema build above is not under test
  const lexicon = new DbLexicon(driver, new CardCache());
  return { driver, server, lexicon };
}

describe("the reference refresh's joined deletes", () => {
  it("carries BOTH deletes on ONE round trip, and leaves other referers' rows untouched", async () => {
    const { driver, server } = await deck();
    await driver.transaction(async () => {
      await deleteReferencesAndNestEdges(driver, 1);
    });
    expect(postsWithBoth(server, CARDS_DELETE, EDGES_DELETE)).toBe(1);
    const refs = await driver.query<{ referer_id: number }>("SELECT referer_id FROM card_references", []);
    expect(refs.rows.map((r) => r.referer_id)).toEqual([2]);
    const edges = await driver.query<{ referer_id: number }>("SELECT referer_id FROM decko_nest_edges", []);
    expect(edges.rows.map((r) => r.referer_id)).toEqual([2]);
  });

  it("the full refresh leaves the same state, so the save's seam is the joined one", async () => {
    const { driver, lexicon } = await deck();
    const refLexicon: ReferenceLexicon = { id: (nameish) => lexicon.id(nameish) };
    await driver.transaction(async () => {
      await refreshReferencesOut(driver, refLexicon, 1, DeckoName.parse("first"), null);
    });
    const refs = await driver.query<{ referer_id: number }>("SELECT referer_id FROM card_references", []);
    expect(refs.rows.map((r) => r.referer_id)).toEqual([2]);
    const edges = await driver.query<{ referer_id: number }>("SELECT referer_id FROM decko_nest_edges", []);
    expect(edges.rows.map((r) => r.referer_id)).toEqual([2]);
  });

  it("runs with no nest-edge table installed: the join degrades to the one statement the deck can execute", async () => {
    const server = await startMockHranaServer();
    servers.push(server);
    const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
    await driver.query("CREATE TABLE cards (id INTEGER PRIMARY KEY, name TEXT, key TEXT, codename TEXT, type_id INTEGER, left_id INTEGER, right_id INTEGER, trash INTEGER DEFAULT 0, db_content TEXT)", []);
    await driver.query("CREATE TABLE card_references (referer_id INTEGER, referee_key TEXT, referee_id INTEGER, ref_type TEXT)", []);
    await driver.query("INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type) VALUES (1, 'x', NULL, 'L')", []);
    server.requests.length = 0;
    await driver.transaction(async () => {
      await deleteReferencesAndNestEdges(driver, 1);
    });
    const refs = await driver.query<{ referer_id: number }>("SELECT referer_id FROM card_references", []);
    expect(refs.rows).toEqual([]);
    // No failed statement was issued: nothing named the absent table.
    const sqls: string[] = [];
    for (const request of server.requests) {
      const entries = (request.body as { requests?: { type?: string; stmt?: { sql?: string } }[] } | undefined)?.requests ?? [];
      for (const entry of entries) if (entry.type === "execute" && entry.stmt?.sql) sqls.push(entry.stmt.sql);
    }
    expect(sqls.some((s) => s.includes("decko_nest_edges"))).toBe(false);
  });
});
