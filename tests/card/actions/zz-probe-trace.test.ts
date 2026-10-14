import { it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { splitSqlStatements } from "../fetch/fetch-test-storage.js";
import { CARDTYPE_ID, IP, JOE, fakeClock, seedCard, seedStandardDeck, type ActionsTestStorage } from "./actions-test-storage.js";

const SCHEMA = readFileSync(fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)), "utf8");

it("trace", async () => {
  const dir = mkdtempSync(join(tmpdir(), "decko-trace-"));
  const raw = new LocalSqliteDriver({ path: join(dir, "d.sqlite") });
  const log: string[] = [];
  let inTx = false;
  const isW = (s: string) => /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(s);
  const tracer: SQLDatabaseDriver = {
    transactionGuarantee: raw.transactionGuarantee,
    query: <T>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> => {
      if (inTx) log.push(`${isW(sql) ? "W" : "R"} q ${sql.replace(/\s+/g, " ").slice(0, 140)}`);
      return raw.query<T>(sql, params);
    },
    batch: (st: SQLStatement[]) => {
      if (inTx) log.push(`B[${st.length}] ${st.map((s) => (isW(s.sql) ? "W" : "R") + ":" + s.sql.replace(/\s+/g, " ").slice(0, 50)).join(" | ")}`);
      return raw.batch(st);
    },
    transaction: async <R>(work: () => Promise<R>) => {
      inTx = true;
      log.push("=== BEGIN");
      try {
        return await raw.transaction!(work);
      } finally {
        log.push("=== END");
        inTx = false;
      }
    },
  };
  const nulls = (p: unknown[]) => p.map((x) => (x === undefined ? null : x));
  const driver: SQLDatabaseDriver = { query: (s, p) => raw.query(s, nulls(p)), batch: (st) => raw.batch(st) };
  for (const s of splitSqlStatements(SCHEMA)) await raw.query(s, []).catch(() => undefined);
  const fetch0 = new FetchEngine(driver);
  const storage: ActionsTestStorage = {
    driver, engine: fetch0, close: () => undefined,
    selectAll: async <T>(sql: string, params: unknown[] = []) => (await driver.query<T>(sql, params)).rows,
    selectOne: async <T>(sql: string, params: unknown[] = []) => (await driver.query<T>(sql, params)).rows[0],
    count: async (t) => Number((await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`, [])).rows[0].n),
  };
  await seedStandardDeck(storage);
  await seedCard(storage, { id: 60, name: "Parent Card", dbContent: "parent" });
  await seedCard(storage, { id: 62, name: "kid", dbContent: "" });
  await seedCard(storage, { id: 61, leftId: 60, rightId: 62, dbContent: "kid" });
  void CARDTYPE_ID;
  const fetch = new FetchEngine(tracer);
  const engine = new CardActionEngine(fetch, { actor: JOE, now: fakeClock(), ipAddress: IP, integrationHooks: [] });
  log.push("##### create with subcard");
  await engine.createCard({ name: "Linker", content: "see [[Pudding]]", subcards: { "+first": { content: "fine" } } });
  log.push("##### update with subcard");
  await engine.updateCard({ cardId: 60, content: "parent v2", subcards: { "+kid": { content: "kid v2" } } });
  log.push("##### rename");
  await engine.updateCard({ cardId: 60, name: "Parent Renamed" });
  log.push("##### delete");
  await engine.deleteCard({ cardId: 60 });
  writeFileSync(process.env.TRACE_OUT ?? join(dir, "trace.txt"), log.join("\n"));
  raw.close();
  rmSync(dir, { recursive: true, force: true });
}, 120_000);
