// Role+*members is an id list (Abstract::IdList): each content line is
// resolved to a card id through the lexicon, which reads the database.
//
// Expected behaviour (each is asserted below):
//  1. A line naming an existing card is stored as its "~<id>".
//  2. A line that does not parse as a name (an unknown codename mark) names
//     no card and is dropped, as before.
//  3. A DRIVER error during the lexicon read fails the save whole: the save
//     rejects with that error and every table is exactly as it was. The
//     id-list standardization used to swallow it and store a list with the
//     line missing.

import { describe, it, expect } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement, SQLTransactionGuarantee } from "../../../src/server/driver.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { splitSqlStatements } from "../fetch/fetch-test-storage.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CARDTYPE_ID,
  IP,
  JOE,
  SET_TYPE_ID,
  fakeClock,
  seedCard,
  seedStandardDeck,
  type ActionsTestStorage,
} from "./actions-test-storage.js";

const ROLE_TYPE_ID = 410;
const MEMBERS_CARD_ID = 411;
const ADMIN_ID = 412;
const LIST_ID = 413;
const ZORRO_ID = 414;

class DriverFailure extends Error {
  constructor(sql: string) {
    super(`injected driver failure at: ${sql.replace(/\s+/g, " ").slice(0, 80)}`);
    this.name = "DriverFailure";
  }
}

/** Passes every statement through; once armed, throws on the first statement
 *  whose predicate matches (before it reaches the database). */
class FailingDriver implements SQLDatabaseDriver {
  private predicate: ((sql: string, params: unknown[]) => boolean) | undefined;
  readonly transactionGuarantee: SQLTransactionGuarantee | undefined;

  constructor(private readonly inner: SQLDatabaseDriver) {
    this.transactionGuarantee = inner.transactionGuarantee;
  }

  failWhen(predicate: (sql: string, params: unknown[]) => boolean): void {
    this.predicate = predicate;
  }

  query<T>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    this.check(sql, params);
    return this.inner.query<T>(sql, params);
  }

  batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    for (const s of statements) this.check(s.sql, s.params);
    return this.inner.batch(statements);
  }

  transaction<R>(work: () => Promise<R>): Promise<R> {
    return this.inner.transaction!(work);
  }

  private check(sql: string, params: unknown[]): void {
    if (this.predicate === undefined || !this.predicate(sql, params)) return;
    this.predicate = undefined;
    throw new DriverFailure(sql);
  }
}

const SCHEMA = readFileSync(fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)), "utf8");

async function openDeck(): Promise<{ engine: CardActionEngine; driver: FailingDriver; snapshot(): Promise<Record<string, unknown[]>> }> {
  const driver = new FailingDriver(new LocalSqliteDriver({ path: ":memory:" }));
  for (const statement of splitSqlStatements(SCHEMA)) {
    if (/^\s*PRAGMA\b/i.test(statement)) {
      await driver.query(statement, []).catch(() => undefined);
      continue;
    }
    await driver.query(statement, []);
  }
  const storage: ActionsTestStorage = {
    driver,
    engine: new FetchEngine(driver),
    close: () => undefined,
    selectAll: async <T>(sql: string, params: unknown[] = []) => (await driver.query<T>(sql, params)).rows,
    selectOne: async <T>(sql: string, params: unknown[] = []) => (await driver.query<T>(sql, params)).rows[0],
    count: async (table) => Number((await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`, [])).rows[0].n),
  };
  await seedStandardDeck(storage);
  await seedCard(storage, { id: ROLE_TYPE_ID, name: "Role", codename: "role", typeId: CARDTYPE_ID });
  await seedCard(storage, { id: MEMBERS_CARD_ID, name: "*members", codename: "members", typeId: SET_TYPE_ID });
  await seedCard(storage, { id: ADMIN_ID, name: "Admin", typeId: ROLE_TYPE_ID });
  await seedCard(storage, { id: LIST_ID, name: "Admin+*members", leftId: ADMIN_ID, rightId: MEMBERS_CARD_ID });
  await seedCard(storage, { id: ZORRO_ID, name: "Zorro", typeId: ROLE_TYPE_ID });
  const engine = new CardActionEngine(storage.engine, {
    actor: JOE,
    ipAddress: IP,
    now: fakeClock(),
    integrationHooks: [],
  });
  return {
    engine,
    driver,
    snapshot: async () => {
      const names = (
        await driver.query<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
          [],
        )
      ).rows.map((r) => String(r.name));
      const tables: Record<string, unknown[]> = {};
      for (const name of names) tables[name] = (await driver.query(`SELECT * FROM "${name}" ORDER BY rowid`, [])).rows;
      return tables;
    },
  };
}

describe("Role+*members id list: lexicon lookups", () => {
  it("stores the id of each line that names a card, and drops a line that does not parse", async () => {
    const deck = await openDeck();
    await deck.engine.updateCard({ cardId: LIST_ID, content: `Zorro\n:no_such_codename_mark` });
    const row = (await deck.driver.query<{ db_content: string }>("SELECT db_content FROM cards WHERE id = ?", [LIST_ID])).rows[0];
    expect(row.db_content).toBe(`~${ZORRO_ID}`);
  });

  it("a driver error during the lookup fails the save whole and writes nothing", async () => {
    const deck = await openDeck();
    const before = await deck.snapshot();
    deck.driver.failWhen((sql, params) => /FROM cards/.test(sql) && params.includes("zorro"));
    await expect(deck.engine.updateCard({ cardId: LIST_ID, content: "Zorro" })).rejects.toThrow(
      "injected driver failure",
    );
    expect(await deck.snapshot()).toEqual(before);
  }, 60_000);
});
