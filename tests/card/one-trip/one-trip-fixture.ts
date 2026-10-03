// Test fixture for the one-trip implementation lane: the shared boot for
// every test that needs the trial-deck mirror (the 19,482-card corpus) or a
// trip-counting driver.
//
// WHAT THIS IS: the same boot the db-roundtrip elimination lane's probes use
// (LocalSqliteDriver -> FetchEngine -> RenderEngine, render(name, "open",
// {})) plus a capturing driver that counts ROUND TRIPS (one driver.query or
// one driver.batch call each) and records every statement's result rows so
// the render's true cards-row read set is observable.
//
// The mirror COPY lives at benchmarks/one-trip-render/
// trial-deck-mirror-readonly-copy.sqlite3 (gitignored; built once from the
// db-roundtrip worktree's mirror via the backup API — the original is never
// opened writable). Tests that need it skip when the copy is absent so a
// fresh clone without the corpus still runs the rest of the suite.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { RenderEngine } from "../../../src/card/render.js";

/** The 5 probe pages the lane receipt and the mission name. */
export const PROBE_PAGES = ["Home", "Aikido", "About", "Eagle", "Taking_Stock"] as const;

export const MIRROR_COPY_PATH = fileURLToPath(
  new URL("../../../benchmarks/one-trip-render/trial-deck-mirror-readonly-copy.sqlite3", import.meta.url),
);

export const mirrorAvailable = (): boolean => existsSync(MIRROR_COPY_PATH);

/** A row "looks like a cards row" when it carries an integer id plus at
 *  least one cards-shaped column — reads card rows from every statement
 *  shape that returns them (point reads, aliased closure walks, search
 *  chunked reads, rule rows) without classifying SQL text. */
export function cardIdsFromRows(rows: unknown[]): number[] {
  const ids: number[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const rec = row as Record<string, unknown>;
    const id = rec["id"];
    if (typeof id !== "number" || !Number.isSafeInteger(id)) continue;
    const cardish =
      "key" in rec || "type_id" in rec || "db_content" in rec || "trash" in rec || "left_id" in rec;
    if (cardish) ids.push(id);
  }
  return ids;
}

export interface CapturedStatement {
  sql: string;
  params: unknown[];
  rowCount: number;
  cardIds: number[];
}

/** Driver wrapper that counts round trips (query OR batch = one trip) and
 *  records every statement with its result rows. */
export class TripCapturingDriver implements SQLDatabaseDriver {
  trips = 0;
  readonly statements: CapturedStatement[] = [];
  constructor(private readonly inner: SQLDatabaseDriver) {}
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    this.trips += 1;
    const result = await this.inner.query<T>(sql, params);
    this.statements.push({
      sql,
      params,
      rowCount: result.rows.length,
      cardIds: cardIdsFromRows(result.rows as unknown[]),
    });
    return result;
  }
  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    this.trips += 1;
    const results = await this.inner.batch(statements);
    results.forEach((result, i) => {
      const stmt = statements[i] as { sql: string; params?: unknown[] };
      this.statements.push({
        sql: stmt?.sql ?? "",
        params: stmt?.params ?? [],
        rowCount: result.rows.length,
        cardIds: cardIdsFromRows(result.rows as unknown[]),
      });
    });
    return results;
  }
}

export interface EngineBoot {
  fetcher: FetchEngine;
  render: RenderEngine;
}

/** Boot the SAME object graph the probes use, with the codename registry
 *  loaded and the name environment installed (DeckoName.parse needs it for
 *  ":codename" marks). */
export async function bootEngine(driver: SQLDatabaseDriver): Promise<EngineBoot> {
  const fetcher = new FetchEngine(driver);
  await fetcher.codenames.ensureLoaded();
  fetcher.installNameEnvironment();
  return { fetcher, render: new RenderEngine(fetcher) };
}

export interface BaselineRender {
  html: string;
  trips: number;
  statements: CapturedStatement[];
  /** The union of every cards-row id any statement returned — the render's
   *  true read set (the closure-superset validation's reference). */
  touchedCardIds: number[];
}

/** Render one page through a fresh engine on a capturing driver: the
 *  current engine's output and its round-trip cost, measured together. */
export async function captureBaselineRender(
  mirrorPath: string,
  name: string,
): Promise<BaselineRender> {
  const capture = new TripCapturingDriver(new LocalSqliteDriver({ path: mirrorPath, readonly: true }));
  const { render } = await bootEngine(capture);
  const html = await render.render(name, "open", {});
  const touched = new Set<number>();
  for (const stmt of capture.statements) for (const id of stmt.cardIds) touched.add(id);
  return {
    html,
    trips: capture.trips,
    statements: capture.statements,
    touchedCardIds: [...touched].sort((a, b) => a - b),
  };
}
