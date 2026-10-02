// Transport chunking for set-shaped reads — the batching pattern from
// src/card/render/prefetch.ts (e3ae820) generalized into a
// driver-layer primitive.
//
// THE PROBLEM IT EXISTS FOR: the engine's read paths used to issue one
// point query per logical read (`SELECT * FROM cards WHERE id = ?`), so a
// page whose render touches N cards paid N driver round trips. On the edge
// drivers each round trip is one HTTP request — one D1 API subrequest — and
// the Workers free tier cuts an invocation off at 50 subrequests. The demo's
// whole-deck search probe (6,233 result rows, one fetchById each) measured
// 12,475 round trips for ONE page render — unusable on the free tier. The
// figure's record and the hermetic pin on the replacement read path live in
// tests/card/render/search-whole-deck-chunked-reads.test.ts.
//
// THE MECHANISM: transport chunking, not a semantics change. The ids ride
// IN-list statements of IDS_PER_STATEMENT bound parameters each, and the
// statements are grouped into driver.batch calls of STATEMENTS_PER_BATCH
// each — one subrequest per batch (docs/driver-notes.md: "on the edge
// drivers a batch is literally one HTTP request"). A 6,233-id read is 125
// statements in 7 batches: seven subrequests, same rows.
//
// RESULT IDENTITY (the invariant): same rows, same order. The statement
// template is the fetch ladder's own point-read SELECT widened to an IN
// list (`SELECT * FROM cards WHERE id IN (...) AND trash = 0` — the same
// trash filter fetchById's lookInTrash=false ladder applies), so every row
// comes back with the identical column set and values the per-id point read
// returned. Rows return in FIRST-OCCURRENCE input-id order (input order is
// the caller's contract; result rendering order never depends on SQL return
// order). Ids with no row (absent or trashed) are absent from the result,
// exactly as a point read returning undefined.

import type { CardsRow } from "./schema.js";
import type { SQLDatabaseDriver, SQLStatement } from "./driver.js";

/** Bound parameters per IN-list statement. Cloudflare D1 caps a query at
 *  100 bound parameters (provider limit, not verifiable without a deployed
 *  D1 — the number is pinned here with headroom so a driver adapter can
 *  never drift into it); 50 per statement is this module's working size.
 *  Local drivers accept it trivially (SQLite's floor is 999 variables). */
export const CHUNKED_READ_IDS_PER_STATEMENT = 50;

/** IN-list statements per driver.batch call. Each batch is ONE round trip
 *  (one subrequest on the edge drivers), so a whole-set read costs
 *  ceil(ceil(N/50)/20) round trips — 7 for the 6,233-row probe — instead of
 *  N. Statement count per batch stays modest so a single batch's encoded
 *  request stays well inside provider request-size limits. */
export const CHUNKED_READ_STATEMENTS_PER_BATCH = 20;

/** Split ids into fixed-size chunks (the grouping unit for IN-list
 *  statements). Exported for the chunk-boundary tests. */
export function chunkIds<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Read card rows by id via chunked IN-list statements grouped into batch
 * round trips. Returns the rows in first-occurrence input-id order
 * (duplicates in the input collapse to one row); trashed and absent ids
 * yield no row, matching the per-id point-read ladder's `trash = 0` +
 * `LIMIT 1` semantics. An empty input issues zero queries.
 */
export async function readCardRowsByIdChunked(
  driver: SQLDatabaseDriver,
  ids: readonly number[],
): Promise<CardsRow[]> {
  // Dedup preserving first occurrence (a result set can reference the same
  // card as a row, a type row, and a junction side — one read, not three).
  const unique: number[] = [];
  const seen = new Set<number>();
  for (const id of ids) {
    if (id === null || id === undefined || !Number.isSafeInteger(id) || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  if (unique.length === 0) return [];

  const byId = new Map<number, CardsRow>();
  const statements: SQLStatement[] = chunkIds(unique, CHUNKED_READ_IDS_PER_STATEMENT).map(
    (group): SQLStatement => ({
      sql: `SELECT * FROM cards WHERE id IN (${group.map(() => "?").join(", ")}) AND trash = 0`,
      params: group,
    }),
  );
  for (const batchChunk of chunkIds(statements, CHUNKED_READ_STATEMENTS_PER_BATCH)) {
    const results = await driver.batch(batchChunk);
    for (const result of results) {
      for (const row of result.rows as CardsRow[]) byId.set(row.id, row);
    }
  }

  const out: CardsRow[] = [];
  for (const id of unique) {
    const row = byId.get(id);
    if (row !== undefined) out.push(row);
  }
  return out;
}
