// THE RENDERPLAN-REPLAY ROUTER (renderplan-replay lane, 2026-10-05): the
// driver-seam layer that lets a render consume a pre-computed plan's result
// set instead of re-issuing its reads.
//
// THE MECHANISM: the one-trip gate replays a page's recorded render plan as
// ONE driver.batch (replayRenderPlan — the engine's own record-and-replay
// contract), then arms THIS router with the plan's entries and the batch's
// results. From then on, every engine read — render path, prefetch,
// retrieve, lexicon, codenames, they all flow through the ONE driver the
// FetchEngine hands out — whose (sql, params) exactly matches a plan entry
// is answered from the armed result set with ZERO round trips. A miss (an
// order-dependent statement like the search-count, a differently-bound
// read from a different viewer/session, anything the recording render
// never asked) delegates to the real driver — the live path stays
// authoritative, so the plan can only REMOVE trips, never change bytes:
// a hit returns the rows the database itself returned for that exact
// statement against the same deck.
//
// THE CONTRACT'S EDGES:
//   - Unarmed, the router is pure delegation (the default posture for every
//     engine that never renders behind a plan — byte- and trip-identical).
//   - A write (anything not SELECT/WITH-shaped) through an armed router
//     disarms it: in-memory statement results must never outlive a write
//     that could invalidate them. The disarm is the honest fallback; the
//     store-level staleness contract (invalidation.ts) is unchanged.
//   - Arming MERGES into any existing map: a multi-page session accumulates
//     pages; each page's replay batch runs through the router while the
//     previous pages' entries stay armed (same deck, same rows).
//   - Misaligned arm calls (entries vs results length) are refused — a
//     half-replayed plan must never arm.

import type {
  SQLDatabaseDriver,
  SQLQueryResult,
  SQLStatement,
} from "../../server/driver.js";
import type { RenderPlanEntry } from "./render-plan.js";

/** The plan-map key — the SAME keying recordRenderPlan uses (sql text +
 *  JSON params), so a recorded entry and a later live statement match
 *  exactly when they are the same statement with the same binds. */
export function renderPlanResultKey(sql: string, params: unknown[]): string {
  return `${sql}::${JSON.stringify(params)}`;
}

/** Whether a statement is a read whose result a plan may serve. Anything
 *  else (INSERT/UPDATE/DELETE/REPLACE/CREATE/ATTACH/...) disarms the plan:
 *  the engine's cached statement results must never survive a write. */
export function isReadOnlyStatement(sql: string): boolean {
  return /^(SELECT|WITH)\b/i.test(sql.trimStart());
}

export class ReplayPlanRouter implements SQLDatabaseDriver {
  /** The wrapped driver — the gate's seat/attach/replay go through it
   *  directly (the plan replay IS the arming source; it must never consult
   *  the map it is building, and the attach memo must key on the real
   *  connection, not on the per-engine router). */
  readonly base: SQLDatabaseDriver;
  private planResults: Map<string, SQLQueryResult> | undefined;

  constructor(base: SQLDatabaseDriver) {
    this.base = base;
  }

  /** Arm (merge) the plan's results, keyed for exact (sql, params) lookup.
   *  Entries and results must align 1:1 in plan order (replayRenderPlan's
   *  contract). */
  armRenderPlan(entries: readonly RenderPlanEntry[], results: readonly unknown[]): void {
    if (entries.length !== results.length) return; // never arm a misaligned plan
    const map = this.planResults ?? new Map<string, SQLQueryResult>();
    entries.forEach((entry, i) => {
      map.set(renderPlanResultKey(entry.sql, entry.params), results[i] as SQLQueryResult);
    });
    this.planResults = map;
  }

  /** Drop the armed plan (a write, or an explicit invalidation). */
  disarmRenderPlan(): void {
    this.planResults = undefined;
  }

  /** Whether a plan is currently armed (test/pin observability). */
  get armed(): boolean {
    return this.planResults !== undefined;
  }

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    const served = this.planResults?.get(renderPlanResultKey(sql, params));
    if (served !== undefined) return served as SQLQueryResult<T>;
    if (!isReadOnlyStatement(sql)) this.planResults = undefined;
    return this.base.query<T>(sql, params);
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    const map = this.planResults;
    if (map === undefined) return this.base.batch(statements);
    // Consult per member; only the misses ride a real batch trip. Results
    // reassemble in statement order, so the caller sees exactly the shape
    // an all-live batch would have produced (a hit's rows ARE the rows the
    // database returned for that statement against this deck).
    const served: (SQLQueryResult | undefined)[] = new Array(statements.length);
    const misses: number[] = [];
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i] as { sql: string; params?: unknown[] } | undefined;
      const hit =
        stmt === undefined ? undefined : map.get(renderPlanResultKey(stmt.sql, stmt.params ?? []));
      if (hit !== undefined) served[i] = hit;
      else misses.push(i);
    }
    if (misses.length === statements.length) {
      this.guardWrites(statements);
      return this.base.batch(statements);
    }
    if (misses.length > 0) {
      const missStatements = misses.map((i) => statements[i] as SQLStatement);
      this.guardWrites(missStatements);
      const results = await this.base.batch(missStatements);
      misses.forEach((stmtIndex, k) => {
        served[stmtIndex] = results[k];
      });
    }
    return served as SQLQueryResult[];
  }

  private guardWrites(statements: readonly SQLStatement[]): void {
    if (statements.some((s) => !isReadOnlyStatement(s.sql))) this.planResults = undefined;
  }
}
