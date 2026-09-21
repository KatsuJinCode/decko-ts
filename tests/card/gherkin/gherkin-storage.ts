// Test storage for the Gherkin feature port: a real in-memory SQLite
// database (the LocalSqliteDriver), the core schema loaded, and the three
// engines the Gherkin steps exercise (FetchEngine, RenderEngine,
// CardActionEngine). Mirrors the storage style of tests/card/render/
// render-test-storage.ts and tests/card/actions/actions-test-storage.ts
// without crossing those streams.
//
// Synthetic content only (DATA RULE). All fixture cards are seeded by the
// spec via the step helpers, not by this module — it owns the engines.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import type { CardsRow } from "../../../src/server/schema.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";
import { CardActionEngine } from "../../../src/card/actions/card-action-engine.js";
import { JOE as ACTIONS_JOE } from "../actions/actions-test-storage.js";

/** Quote-aware `--` comment stripping + ";" split (the same splitter as the
 *  fetch and render storage streams — the DDL carries no ";" inside
 *  literals). */
export function splitSqlStatements(ddl: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < ddl.length; i++) {
    const ch = ddl[i];
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "-" && ddl[i + 1] === "-") {
      while (i < ddl.length && ddl[i] !== "\n") i++;
      current += " ";
      continue;
    }
    if (ch === ";") {
      statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") statements.push(current.trim());
  return statements.filter((statement) => statement !== "");
}

export interface GherkinTestStorage {
  driver: SQLDatabaseDriver;
  fetcher: FetchEngine;
  renderer: RenderEngine;
  /** A default actor (Joe User) for the CardActionEngine — tests that want
   *  a different actor can build their own engine. */
  defaultActor: typeof ACTIONS_JOE;
  selectAll<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  selectOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  count(table: string): Promise<number>;
  close(): void;
}

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** Fresh in-memory CORE-schema database + the three engines. */
export async function createGherkinTestStorage(): Promise<GherkinTestStorage> {
  const driver = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(`${REPO_ROOT}db/schema.sqlite.sql`, "utf8");
  for (const statement of splitSqlStatements(ddl)) {
    await driver.query(statement, []);
  }
  const fetcher = new FetchEngine(driver);
  const renderer = new RenderEngine(fetcher);
  return {
    driver,
    fetcher,
    renderer,
    defaultActor: ACTIONS_JOE,
    selectAll: async <T>(sql: string, params: unknown[] = []) =>
      (await driver.query<T>(sql, params)).rows,
    selectOne: async <T>(sql: string, params: unknown[] = []) =>
      (await driver.query<T>(sql, params)).rows[0],
    count: async (table) => {
      const r = await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`, []);
      return Number(r.rows[0].n);
    },
    close: () => driver.close(),
  };
}

/** Type-card codename -> id mapping for the synthetic deck. Mirrors the
 *  Ruby mod-* seed (cards.yml) and the standard deck seeded in the
 *  action tests (actions-test-storage.ts:175-205). */
export const TYPE_IDS = {
  richText: 2,
  cardtype: 3,
  phrase: 4,
  pointer: 5,
  /** Seeded in the standard deck for the action layer; not used by name
   *  algebra tests but kept here for symmetry. */
  basic: 2,
} as const;

/** Convenience: read the cards row for a given name (simple names only —
 *  the Gherkin scenarios that touch compound cards do their own side-id
 *  assertions via selectOne). */
export async function findCardByName(
  storage: GherkinTestStorage,
  name: string,
): Promise<CardsRow | undefined> {
  return storage.selectOne<CardsRow>("SELECT * FROM cards WHERE name = ?", [name]);
}

/** Convenience: read the cards row for an id. */
export async function findCardById(
  storage: GherkinTestStorage,
  id: number,
): Promise<CardsRow | undefined> {
  return storage.selectOne<CardsRow>("SELECT * FROM cards WHERE id = ?", [id]);
}
