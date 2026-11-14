// The save's RECENT SETTINGS step reads every saved card's own row in ONE
// round trip.
//
// The step walks the save's actions (the card and its subcards) and reads
// each one's row: the row says whether the card is a rule or a preference,
// and its name is what the recent-settings list is written with. The reads
// used to be one per action, because the engine awaits every answer before
// it issues the next statement. The ids are the save's own action ids, so
// the rows are all known at once and can ride one batch.
//
// The mock Hrana server runs REAL better-sqlite3 behind the REAL BunnyDb
// driver, so "what SQLite means" here is not simulated. Each case reads the
// requests the server actually received, which is the same thing
// tools/diagnose-owner-save-statement-ladder.mjs counts on the wire.
//
// What is asserted:
//   1. the saved cards' rows ride ONE request, not one per card;
//   2. the recent-settings list still gets the rule (the batch changed the
//      NUMBER of round trips, never the ANSWERS).

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BunnyDbDriver } from "../../../src/card/drivers/bunny-db.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { startMockHranaServer, type MockHranaServer } from "../../server/drivers/mock-hrana-server.js";
import { splitSqlStatements } from "../fetch/fetch-test-storage.js";
import {
  seedStandardDeck,
  seedCard,
  type ActionsTestStorage,
} from "./actions-test-storage.js";
import { NoopTransport } from "../../../src/card/notify/index.js";

const servers: MockHranaServer[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

interface WireStatement {
  sql: string;
  args: Array<{ type?: string; value?: string }>;
}

function statementsOf(request: { body: unknown }): WireStatement[] {
  const entries =
    (request.body as { requests?: Array<{ type?: string; stmt?: WireStatement }> } | undefined)?.requests ?? [];
  const out: WireStatement[] = [];
  for (const entry of entries) {
    if (entry.type === "execute" && typeof entry.stmt?.sql === "string") out.push(entry.stmt);
  }
  return out;
}

const sqlsOf = (request: { body: unknown }): string[] => statementsOf(request).map((s) => s.sql);

const CARD_ROW_BY_ID = "SELECT * FROM cards WHERE id = ? LIMIT 1";

async function bunnyActionsTestStorage(): Promise<{ storage: ActionsTestStorage; server: MockHranaServer }> {
  const server = await startMockHranaServer();
  servers.push(server);
  const driver = new BunnyDbDriver({ url: server.url, timeoutMs: 0 });
  const ddl = readFileSync(fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)), "utf8");
  for (const statement of splitSqlStatements(ddl)) await driver.query(statement, []);
  const storage: ActionsTestStorage = {
    driver,
    engine: new FetchEngine(driver),
    close: () => undefined,
    selectAll: async <T>(sql: string, params: unknown[] = []) => (await driver.query<T>(sql, params)).rows,
    selectOne: async <T>(sql: string, params: unknown[] = []) => (await driver.query<T>(sql, params)).rows[0],
    count: async (table: string) => {
      const r = await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`, []);
      return Number(r.rows[0].n);
    },
  };
  return { storage, server };
}

/** The deck the recent-settings step needs: the setting type, the list type,
 *  the setting card, and the recent-settings list card the step writes. */
async function seedRecentSettingsDeck(storage: ActionsTestStorage): Promise<void> {
  await seedCard(storage, { id: 600, name: "Setting", codename: "setting", typeId: 3 });
  await seedCard(storage, { id: 601, name: "List", codename: "list", typeId: 3 });
  await seedCard(storage, { id: 602, name: "*input type", codename: "input_type", typeId: 600 });
  await seedCard(storage, { id: 603, name: "*help", codename: "help", typeId: 600 });
  await seedCard(storage, {
    id: 604,
    name: "*recent settings",
    codename: "recent_settings",
    typeId: 601,
    dbContent: "*help",
  });
}

/** The requests the server received AFTER the save's commit. */
function afterCommit(server: MockHranaServer): Array<{ body: unknown }> {
  const commitAt = server.requests.findIndex((request) =>
    sqlsOf(request).some((sql) => /^COMMIT/i.test(sql.trim())),
  );
  expect(commitAt).toBeGreaterThanOrEqual(0);
  return server.requests.slice(commitAt + 1);
}

describe("the recent-settings step reads the saved cards' rows in one round trip", () => {
  it("rides one request for the card and its subcards", async () => {
    const { storage, server } = await bunnyActionsTestStorage();
    await seedStandardDeck(storage);
    await seedRecentSettingsDeck(storage);
    const engine = new CardActionEngine(storage.engine, {
      actor: { id: 9, name: "Joe User" },
      notifyTransport: new NoopTransport(),
    });
    server.requests.length = 0;
    const result = await engine.createCard({
      name: "Souffle",
      content: "v1",
      subcards: {
        "Child One": { content: "c1" },
        "Child Two": { content: "c2" },
      },
    });
    expect(result).not.toBeNull();
    // One request carries the three saved cards' rows: the card and its two
    // subcards. Before the batch each of them cost a request of its own.
    const multiRow = afterCommit(server).filter(
      (request) => sqlsOf(request).filter((sql) => sql === CARD_ROW_BY_ID).length > 1,
    );
    expect(multiRow.length).toBe(1);
    expect(sqlsOf(multiRow[0] as { body: unknown }).filter((sql) => sql === CARD_ROW_BY_ID).length).toBe(3);
  }, 30_000);

  it("still writes the recent-settings list", async () => {
    const { storage, server } = await bunnyActionsTestStorage();
    await seedStandardDeck(storage);
    await seedRecentSettingsDeck(storage);
    const engine = new CardActionEngine(storage.engine, {
      actor: { id: 9, name: "Joe User" },
      notifyTransport: new NoopTransport(),
    });
    server.requests.length = 0;
    const result = await engine.createCard({ name: "*all+*input type", content: "plain text" });
    expect(result).not.toBeNull();
    const recent = await storage.selectOne<{ db_content: string }>(
      "SELECT db_content FROM cards WHERE id = ?",
      [604],
    );
    expect(recent?.db_content).toBe("*input type\n*help");
  }, 30_000);
});
