// The save's NOTIFICATION PHASE runs inside a read scope: the phase's own
// repeated reads are answered from the phase's first read, and the scope is
// gone when the phase ends.
//
// The mock Hrana server runs REAL better-sqlite3 behind the REAL BunnyDb
// driver, so "what SQLite means" here is not simulated: a stale answer
// shows up as a stale answer, not as a shape mismatch. Each case counts the
// SQL the server actually received, which is the same thing
// tools/diagnose-owner-save-statement-ladder.mjs counts on the wire.
//
// What is asserted:
//   1. the phase's repeated read costs ONE execute: the phase's memo serves
//      the second read of the same (sql, args);
//   2. the read the phase served came AFTER the commit, so it is the
//      PHASE's memo that served it and not the transaction's (the
//      transaction's memo dies with the transaction);
//   3. the phase is over when the save returns: a read after the save goes
//      to the wire and sees the row as it is NOW, never as the phase left
//      it;
//   4. a driver without the read scope still saves: the scope is an
//      optimization, and its absence is not an error.

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { startMockHranaServer, type MockHranaServer } from "../../server/drivers/mock-hrana-server.js";
import { splitSqlStatements } from "../fetch/fetch-test-storage.js";
import {
  createActionsTestStorage,
  seedStandardDeck,
  type ActionsTestStorage,
  type StandardFixture,
} from "./actions-test-storage.js";
import { NoopTransport, type SavePathIntegrationHook } from "../../../src/card/notify/index.js";
import type { SQLDatabaseDriver } from "../../../src/server/driver.js";

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

const CARD_ROW = "SELECT * FROM cards WHERE id = ? LIMIT 1";
/** A shape the save path never issues, so the hook's own reads are the only
 *  ones the counts below can see. */
const HOOK_ROW = "SELECT id, db_content FROM cards WHERE id = ?";

/** The same storage the action tests use, but over the REAL BunnyDb driver
 *  and the mock Hrana server, so the read scope under test is the driver's
 *  own. */
async function bunnyActionsTestStorage(): Promise<{ storage: ActionsTestStorage; server: MockHranaServer }> {
  const server = await startMockHranaServer();
  servers.push(server);
  const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
  const ddl = readFileSync(
    fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)),
    "utf8",
  );
  for (const statement of splitSqlStatements(ddl)) await driver.query(statement, []);
  const storage: ActionsTestStorage = {
    driver,
    engine: new FetchEngine(driver),
    close: () => undefined,
    selectAll: async <T>(sql: string, params: unknown[] = []) =>
      (await driver.query<T>(sql, params)).rows,
    selectOne: async <T>(sql: string, params: unknown[] = []) =>
      (await driver.query<T>(sql, params)).rows[0],
    count: async (table: string) => {
      const r = await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`, []);
      return Number(r.rows[0].n);
    },
  };
  return { storage, server };
}

/** A hook that reads one card row twice, in the notification phase. */
function twiceReadingHook(
  driver: SQLDatabaseDriver,
  cardId: number,
  onRead: () => void,
): SavePathIntegrationHook {
  return {
    stage: "integrate_with_delay",
    name: "twice-reading-hook",
    notable: () => true,
    fire: async () => undefined,
    fireAct: async () => {
      await driver.query(HOOK_ROW, [cardId]);
      onRead();
      await driver.query(HOOK_ROW, [cardId]);
    },
  };
}

describe("the save's notification phase runs inside a read scope", () => {
  it("serves the phase's repeated read from the phase's own first read", async () => {
    const { storage, server } = await bunnyActionsTestStorage();
    const fixture: StandardFixture = await seedStandardDeck(storage);
    let reads = 0;
    const engine = new CardActionEngine(storage.engine, {
      actor: { id: 9, name: "Joe User" },
      integrationHooks: [twiceReadingHook(storage.driver, fixture.joeCard.id, () => { reads += 1; })],
      notifyTransport: new NoopTransport(),
    });
    server.requests.length = 0;
    const result = await engine.updateCard({ cardId: fixture.joeCard.id, content: "v2" });
    expect(result).not.toBeNull();
    expect(reads).toBe(1);
    // The hook's two reads of the same row cost ONE execute: the phase's
    // memo answered the second one.
    expect(countOf(server, HOOK_ROW)).toBe(1);
  }, 30_000);

  it("serves the phase's read with the PHASE's memo, not the transaction's", async () => {
    const { storage, server } = await bunnyActionsTestStorage();
    const fixture: StandardFixture = await seedStandardDeck(storage);
    const engine = new CardActionEngine(storage.engine, {
      actor: { id: 9, name: "Joe User" },
      integrationHooks: [twiceReadingHook(storage.driver, fixture.joeCard.id, () => undefined)],
      notifyTransport: new NoopTransport(),
    });
    server.requests.length = 0;
    await engine.updateCard({ cardId: fixture.joeCard.id, content: "v2" });
    const order = executedSql(server);
    const commitAt = order.findIndex((s) => /^COMMIT/i.test(s.trim()));
    expect(commitAt).toBeGreaterThanOrEqual(0);
    // The hook's read came AFTER the commit, so the transaction's memo was
    // already dead: the answer came from the phase's own memo.
    const readAt = order.findIndex((s) => s === HOOK_ROW);
    expect(readAt).toBeGreaterThan(commitAt);
  }, 30_000);

  it("leaves no stale answer for a reader that comes after the phase", async () => {
    const { storage, server } = await bunnyActionsTestStorage();
    const fixture: StandardFixture = await seedStandardDeck(storage);
    const engine = new CardActionEngine(storage.engine, {
      actor: { id: 9, name: "Joe User" },
      integrationHooks: [twiceReadingHook(storage.driver, fixture.joeCard.id, () => undefined)],
      notifyTransport: new NoopTransport(),
    });
    await engine.updateCard({ cardId: fixture.joeCard.id, content: "v2" });
    // The phase is over: the row changes, and the reader after the phase
    // must see the change.
    await storage.driver.query("UPDATE cards SET db_content = ? WHERE id = ?", ["v3", fixture.joeCard.id]);
    server.requests.length = 0;
    const row = await storage.selectOne<{ db_content: string }>(HOOK_ROW, [fixture.joeCard.id]);
    expect(row?.db_content).toBe("v3");
    // And the read went to the wire: the phase's memo is gone, so the
    // reader paid for its own answer.
    expect(countOf(server, HOOK_ROW)).toBe(1);
  }, 30_000);

  it("still saves through a driver that has no read scope", async () => {
    const storage = await createActionsTestStorage();
    const fixture: StandardFixture = await seedStandardDeck(storage);
    const engine = new CardActionEngine(storage.engine, {
      actor: { id: 9, name: "Joe User" },
      integrationHooks: [twiceReadingHook(storage.driver, fixture.joeCard.id, () => undefined)],
      notifyTransport: new NoopTransport(),
    });
    const result = await engine.updateCard({ cardId: fixture.joeCard.id, content: "v2" });
    expect(result).not.toBeNull();
    const row = await storage.selectOne<{ db_content: string }>(HOOK_ROW, [fixture.joeCard.id]);
    expect(row?.db_content).toBe("v2");
    storage.close();
  }, 30_000);
});
