// RED-first pins (invalidation design, the read-scope rule binding):
// - write-time fan-out recomputes the closure for the AFFECTED pages only
//   (reverse closure lookup over the edge data);
// - the read-scope rule is binding: the derived store is READ-SCOPE ONLY — the
//   recompute path reads the DECK and writes the side store through the
//   builder's write API, and the recompute path never consults the side
//   store's DATA (a canary query log proves it);
// - the reader seam (fetchPageBundle / seatPageBundle) exposes no write
//   capability over the derived store.
//
// Runs on a synthetic fixture deck (in-memory sqlite, core schema + seeded
// cards): no shared deck database needed, no fresh-clone skips.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { LocalSqliteDriver } from "../../../src/server/drivers/local-sqlite.js";
import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../../src/server/driver.js";
import { splitSqlStatements } from "../fetch/fetch-test-storage.js";
import { buildOneTripClosure } from "../../../src/card/one-trip/closure-builder.js";
import {
  affectedPagesForCardWrite,
  asWritableDerivedStore,
  recomputeClosuresForPages,
} from "../../../src/card/one-trip/invalidation.js";

interface Row {
  [column: string]: unknown;
}

/** A logging driver: records every statement so a scope canary can assert
 *  WHERE the recompute path read from (the read-scope rule: never the
 *  derived store). */
class LoggingDriver implements SQLDatabaseDriver {
  readonly log: { sql: string; params: unknown[] }[] = [];
  constructor(private readonly inner: SQLDatabaseDriver) {}
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    this.log.push({ sql, params });
    return this.inner.query<T>(sql, params);
  }
  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    for (const stmt of statements) this.log.push({ sql: stmt.sql, params: stmt.params ?? [] });
    return this.inner.batch(statements);
  }
}

async function makeFixtureDeck(): Promise<{
  corpus: SQLDatabaseDriver;
  ids: Record<string, number>;
  basicTypeId: number;
}> {
  const corpus = new LocalSqliteDriver({ path: ":memory:" });
  const ddl = readFileSync(
    fileURLToPath(new URL("../../../db/schema.sqlite.sql", import.meta.url)),
    "utf8",
  );
  for (const statement of splitSqlStatements(ddl)) {
    await corpus.query(statement, []);
  }
  // Seed: a real TYPE card first (every content card's type_id points at
  // it — a type edge to a CONTENT card would create universal
  // reachability and make every page's closure cover every other page,
  // which is exactly the fan-out shape under test), then the content
  // cards. Ids are the db's.
  const ids: Record<string, number> = {};
  const insertCard = async (name: string, content: string, typeId: number, codename?: string): Promise<number> => {
    const result = await corpus.query(
      `INSERT INTO cards (name, "key", codename, type_id, created_at, updated_at, creator_id, updater_id, trash, db_content)
       VALUES (?, ?, ?, ?, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000', 1, 1, 0, ?)`,
      [name, name.toLowerCase().replace(/[^a-z0-9_]+/g, "_"), codename ?? null, typeId, content],
    );
    return result.lastInsertRowId as number;
  };
  const basicTypeId = await insertCard("Basic", "", 0, "basic");
  ids["Page A"] = await insertCard("Page A", "intro {{Page B}}", basicTypeId);
  ids["Page B"] = await insertCard("Page B", "body {{Page C}}", basicTypeId);
  ids["Page C"] = await insertCard("Page C", "leaf", basicTypeId);
  ids["Page D"] = await insertCard("Page D", "standalone {{Page C}}", basicTypeId);
  ids["Unrelated"] = await insertCard("Unrelated", "nothing", basicTypeId);
  return { corpus, ids, basicTypeId };
}

describe("invalidation: write-time fan-out (synthetic fixture deck)", () => {
  let corpus: SQLDatabaseDriver;
  let side: SQLDatabaseDriver;
  let sidePath = "";
  let ids: Record<string, number>;
  let basicCardId = 0;

  beforeAll(async () => {
    const fixture = await makeFixtureDeck();
    corpus = fixture.corpus;
    ids = fixture.ids;
    basicCardId = fixture.basicTypeId;
    sidePath = ":memory:";
    side = new LocalSqliteDriver({ path: sidePath });
    await buildOneTripClosure({
      corpus,
      side,
      pageNames: ["Page A", "Page B", "Page C", "Page D", "Unrelated"],
    });
  });

  it("the initial closure has Page A reaching B and C; Unrelated reaching nothing", async () => {
    const closureA = await side.query<{ card_id: number }>(
      "SELECT card_id FROM one_trip_page_closure WHERE page_id = ? ORDER BY card_id",
      [ids["Page A"]],
    );
    const closureIds = closureA.rows.map((r) => r.card_id).sort((a, b) => a - b);
    expect(closureIds).toEqual(
      [ids["Page A"], ids["Page B"], ids["Page C"], basicCardId].sort((a, b) => a - b),
    );
  });

  it("reverse fan-out finds exactly the pages whose closure reaches the changed card", async () => {
    // Page C's content changes: pages whose closure reaches C are A and B
    // (transitive includes), D (direct include), and C ITSELF (a page root
    // contains its own card — its payload changes with the write; the
    // MediaWiki invalidation set includes the edited page).
    const affected = await affectedPagesForCardWrite({ corpus: corpus, side, cardId: ids["Page C"] });
    const affectedIds = affected.map((p) => p.pageId).sort((a, b) => a - b);
    expect(affectedIds).toEqual(
      [ids["Page A"], ids["Page B"], ids["Page C"], ids["Page D"]].sort((a, b) => a - b),
    );
    // Unrelated's closure reaches nothing but its own card + the type card
    const unaffected = await affectedPagesForCardWrite({ corpus: corpus, side, cardId: ids["Unrelated"] });
    expect(unaffected.map((p) => p.pageId)).toEqual([ids["Unrelated"]]);
  });

  it("recompute reads ONLY the corpus scope — never the derived store's data (A2 canary)", async () => {
    const loggingSide = new LoggingDriver(side);
    // Page B's content now references Page D too: the write path's parse
    // produces the new edge; recompute rebuilds ONLY the named pages.
    await corpus.query("UPDATE cards SET db_content = ? WHERE id = ?", [
      "body {{Page C}} and {{Page D}}",
      ids["Page B"],
    ]);
    await recomputeClosuresForPages({
      corpus,
      side: asWritableDerivedStore(loggingSide),
      pageIds: [ids["Page B"]],
      pageNames: new Map([[ids["Page B"], "Page B"]]),
    });
    // read-scope canary: the recompute may WRITE the side store (edge/closure
    // tables) but must never READ the derived store's data tables.
    const dataReads = loggingSide.log.filter(
      (entry) =>
        /select/i.test(entry.sql) &&
        /one_trip_(edges|page_closure|search_nests|search_results)/.test(entry.sql),
    );
    expect(
      dataReads,
      `the recompute path must not consult the derived store's data (found: ${dataReads.map((r) => r.sql.slice(0, 80)).join(" | ")})`,
    ).toEqual([]);
    // and the recomputed closure for Page B now reaches D
    const closureB = await side.query<{ card_id: number }>(
      "SELECT card_id FROM one_trip_page_closure WHERE page_id = ? ORDER BY card_id",
      [ids["Page B"]],
    );
    expect(closureB.rows.map((r) => r.card_id)).toContain(ids["Page D"]);
    // Page A's closure is UNCHANGED (unaffected pages are not touched)
    const closureA = await side.query<{ card_id: number }>(
      "SELECT card_id FROM one_trip_page_closure WHERE page_id = ?",
      [ids["Page A"]],
    );
    expect(closureA.rows.map((r) => r.card_id).sort((a, b) => a - b)).toEqual(
      [ids["Page A"], ids["Page B"], ids["Page C"], basicCardId].sort((a, b) => a - b),
    );
  });
});
