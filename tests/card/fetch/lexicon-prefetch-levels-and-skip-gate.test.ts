// The Lexicon's name prefetch: the level walk and the skip gate.
//
// What is asserted here is the contract the graded save's POST count rests
// on (docs/reports/owner-save-family-round-five-2026-10-23.md, the rows the
// rule-candidate declaration answers):
//
//   1. A compound name's chain is resolved LEVEL BY LEVEL: the simple parts'
//      key lookups ride one batch, every first junction rides the next, and
//      a deeper junction rides the one after that - one round trip per
//      level, never one per junction;
//   2. the walk's own read of a declared name then reaches no wire: the
//      declaration is answered from the driver's read memo, and the Lexicon
//      caches the answer;
//   3. THE SKIP GATE: a name whose entry the Lexicon's own cache already
//      holds - a positive id or a stored negative - is NOT declared again,
//      even after a card write dropped every cards-dependent entry from the
//      driver's read memo. This is the waste the graded save measured: the
//      save's card writes invalidate the driver memo (an id-pinned write
//      and a key-pinned read name different columns, so disjointness cannot
//      be proven) while the Lexicon cache survives, and the walk itself
//      reads the held entries for free - a declaration that re-asked them
//      would spend a round trip to re-learn answers the engine holds;
//   4. the declaration never changes an ANSWER: a name the deck does not
//      hold resolves to nothing, and the ids the prefetch returns are the
//      ids the walk's own lookup returns.
//
// The mock Hrana server runs REAL better-sqlite3, so "what SQLite means"
// here is not simulated: a wrong answer shows up as a wrong answer. The
// statement counts are the same thing the save ladder counts on the wire.

import { describe, it, expect, afterEach } from "vitest";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { startMockHranaServer, type MockHranaServer } from "../../server/drivers/mock-hrana-server.js";
import { DbLexicon } from "../../../src/card/fetch/lexicon.js";
import { CardCache } from "../../../src/card/fetch/cache.js";
import { DeckoName } from "../../../src/card/name.js";

const servers: MockHranaServer[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

/** Every statement the server was asked to execute, in order. */
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

const KEY_LOOKUP = "SELECT id FROM cards WHERE key COLLATE NOCASE = ? AND trash = 0 LIMIT 1";
const JUNCTION_LOOKUP = "SELECT id FROM cards WHERE left_id = ? AND right_id = ? AND trash = 0 LIMIT 1";

async function deck(): Promise<{ driver: BunnyDbDriver; server: MockHranaServer; lexicon: DbLexicon }> {
  const server = await startMockHranaServer();
  servers.push(server);
  const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
  await driver.query(
    "CREATE TABLE cards (id INTEGER PRIMARY KEY, name TEXT, key TEXT, codename TEXT, type_id INTEGER, left_id INTEGER, right_id INTEGER, trash INTEGER DEFAULT 0, db_content TEXT)",
    [],
  );
  const row = (id: number, name: string, leftId: number | null, rightId: number | null) =>
    driver.query(
      "INSERT INTO cards (id, name, key, type_id, left_id, right_id, trash, db_content) VALUES (?, ?, ?, 9, ?, ?, 0, '')",
      // The key column holds the engine's computed key (the naming
      // algebra's singularizing key, NOT the lowercased name: parse("beta")
      // keys to "betum"), because the engine writes the computed key.
      [id, name, DeckoName.parse(name).key, leftId, rightId],
    );
  await row(1, "Alpha", null, null);
  await row(2, "Beta", null, null);
  await row(3, "Owner", null, null);
  await row(5, "Owner+Alpha", 3, 1);
  await row(6, "Owner+Alpha+Beta", 5, 2);
  server.requests.length = 0; // the schema build above is not under test
  const lexicon = new DbLexicon(driver, new CardCache());
  return { driver, server, lexicon };
}

describe("the name prefetch's level walk", () => {
  it("resolves a three-part chain one level per round trip, and the walk's own read then reaches no wire", async () => {
    const { driver, server, lexicon } = await deck();
    await driver.transaction(async () => {
      const requestsBefore = server.requests.length;
      const { ids } = await lexicon.prefetchIds([DeckoName.parse("owner+alpha+beta")]);
      // THREE round trips: the simple parts' key lookups, the first
      // junction, and the second junction. The chain was walked one
      // junction per round trip before the levels existed.
      expect(server.requests.length - requestsBefore).toBe(3);
      // Level 0: the three simple parts, on one batch.
      expect(countOf(server, KEY_LOOKUP)).toBe(3);
      // Levels 1 and 2: one junction lookup each.
      expect(countOf(server, JUNCTION_LOOKUP)).toBe(2);
      // The resolved id is the card the name names, and the walk's own
      // lookup of the same name costs NO further execute.
      expect(ids).toEqual([6]);
      const executed = executedSql(server).length;
      expect(await lexicon.id("owner+alpha+beta")).toBe(6);
      expect(await lexicon.id("owner+alpha")).toBe(5);
      expect(executedSql(server).length).toBe(executed);
    });
  });

  it("answers a compound name whose junction card is TRASHED as absent, without inventing an id", async () => {
    const { driver, server, lexicon } = await deck();
    await driver.query("UPDATE cards SET trash = 1 WHERE id = 5", []);
    await driver.transaction(async () => {
      const { ids } = await lexicon.prefetchIds([DeckoName.parse("owner+alpha")]);
      expect(ids).toEqual([]);
      // The walk's own lookup answers the same absence.
      expect(await lexicon.id("owner+alpha")).toBeUndefined();
    });
  });
});

describe("the name prefetch's skip gate", () => {
  it("does not re-declare a name the Lexicon cache holds, even after a card write dropped the driver memo", async () => {
    const { driver, server, lexicon } = await deck();
    await driver.transaction(async () => {
      // The walk resolves the names once; the Lexicon cache holds the
      // entries from then on.
      await lexicon.id("owner+alpha");
      await lexicon.id("alpha");
      // A card write lands: the driver's read memo loses every
      // cards-dependent entry, exactly as the graded save's writes do
      // between one rule lookup and the next.
      await driver.query("UPDATE cards SET db_content = 'changed' WHERE id = 2", []);
      const declared = executedSql(server).length;
      expect(declared).toBeGreaterThan(0);
      // The declaration of names the cache holds reaches NO wire: nothing
      // is re-learned, and nothing is asked.
      const { ids, pairs } = await lexicon.prefetchIds([
        DeckoName.parse("owner+alpha"),
        DeckoName.parse("alpha"),
      ]);
      expect(executedSql(server).length).toBe(declared);
      // The answers the declaration did not ask for are still the answers
      // (the ids return in the documented order: the simple names' ids,
      // then the compound names').
      expect(ids).toEqual([1, 5]);
      expect(pairs).toEqual([[3, 1]]);
    });
  });

  it("does not re-ask a name whose entry is a stored negative", async () => {
    const { driver, server, lexicon } = await deck();
    await driver.transaction(async () => {
      // The walk asked once and learned the deck does not hold the name;
      // lexToId stored the negative.
      expect(await lexicon.id("gamma")).toBeUndefined();
      const declared = executedSql(server).length;
      const { ids } = await lexicon.prefetchIds([DeckoName.parse("gamma")]);
      expect(executedSql(server).length).toBe(declared);
      expect(ids).toEqual([]);
    });
  });

  it("still declares a name no layer holds, and the declaration answers the walk's own read", async () => {
    const { driver, server, lexicon } = await deck();
    await driver.transaction(async () => {
      const { ids } = await lexicon.prefetchIds([DeckoName.parse("beta")]);
      expect(ids).toEqual([2]);
      expect(countOf(server, KEY_LOOKUP)).toBe(1);
      // The walk's own read is answered from the driver's read memo.
      const executed = executedSql(server).length;
      expect(await lexicon.id("beta")).toBe(2);
      expect(executedSql(server).length).toBe(executed);
    });
  });
});
