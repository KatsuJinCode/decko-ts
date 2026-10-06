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
import { classifyResidueStatement } from "./render-plan.js";
import type { RenderPlanEntry } from "./render-plan.js";
import {
  buildDriftArmIndex,
  mergeDriftArmIndex,
  serveFromDriftArmIndex,
} from "./replay-fold.js";
import type { DriftArmIndex } from "./replay-fold.js";

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

/** Whether a statement is per-request GATE state the plan may never answer.
 *  The freshness gate's deck_data_version stamp read is the trigger for
 *  every other invalidation: served from an armed map, a committed write's
 *  version move would be invisible to the gate and a post-write render
 *  could serve pre-write rows forever. The recorder already keeps this
 *  class OUT of plans (render-plan.ts isPipelineAbleRenderStatement); this
 *  is the same exclusion enforced where the plan is SERVED, so a seeded or
 *  drifted plan that does carry the entry still cannot intercept it
 *  (integration assembly r3, 2026-10-06 — the stamp-read-vs-plan pin). */
function isGateStateStatement(sql: string): boolean {
  return classifyResidueStatement(sql) === "freshness-stamp-read";
}

export class ReplayPlanRouter implements SQLDatabaseDriver {
  /** The wrapped driver — the gate's seat/attach/replay go through it
   *  directly (the plan replay IS the arming source; it must never consult
   *  the map it is building, and the attach memo must key on the real
   *  connection, not on the per-engine router). */
  readonly base: SQLDatabaseDriver;
  private planResults: Map<string, SQLQueryResult> | undefined;
  /** The drift classes' per-bind-value answer index (driftfix lane): the
   *  same rows the exact-(sql,params) map holds, indexed by the BINDS a
   *  recorded entry carried, so a drifted IN-list ask whose every bind is
   *  covered composes its answer instead of riding live. Cleared wherever
   *  the map is cleared — one lifecycle, one staleness contract. */
  private driftIndex: DriftArmIndex | undefined;

  constructor(base: SQLDatabaseDriver) {
    this.base = base;
  }

  /** Arm (merge) the plan's results, keyed for exact (sql, params) lookup.
   *  Entries and results must align 1:1 in plan order (replayRenderPlan's
   *  contract). `driftIndex` is the replay's per-bind-value index when the
   *  caller built one (replayRenderPlanWithIndex); without it the router
   *  derives the non-side-key classes from the entry results themselves. */
  armRenderPlan(
    entries: readonly RenderPlanEntry[],
    results: readonly unknown[],
    driftIndex?: DriftArmIndex,
  ): void {
    if (entries.length !== results.length) return; // never arm a misaligned plan
    const map = this.planResults ?? new Map<string, SQLQueryResult>();
    entries.forEach((entry, i) => {
      map.set(renderPlanResultKey(entry.sql, entry.params), results[i] as SQLQueryResult);
    });
    this.planResults = map;
    const incoming = driftIndex ?? buildDriftArmIndex(entries, results);
    this.driftIndex =
      this.driftIndex === undefined ? incoming : mergeDriftArmIndex(this.driftIndex, incoming);
  }

  /** Drop the armed plan (a write, or an explicit invalidation). */
  disarmRenderPlan(): void {
    this.planResults = undefined;
    this.driftIndex = undefined;
  }

  /** Whether a plan is currently armed (test/pin observability). */
  get armed(): boolean {
    return this.planResults !== undefined;
  }

  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    // Gate state is answered live even when a plan entry matches exactly
    // (see isGateStateStatement) — the map is consulted only for page data.
    const served =
      isGateStateStatement(sql) ? undefined : this.planResults?.get(renderPlanResultKey(sql, params));
    if (served !== undefined) return served as SQLQueryResult<T>;
    // THE DRIFT SERVE: same rows, indexed by bind value instead of by the
    // (sql, params) pair — the measured regression's cure. Only reads, only
    // classes whose composition laws are measured, only provable coverage.
    if (this.driftIndex !== undefined && isReadOnlyStatement(sql)) {
      const composed = serveFromDriftArmIndex(this.driftIndex, sql, params);
      if (composed !== undefined) return composed as SQLQueryResult<T>;
    }
    if (!isReadOnlyStatement(sql)) this.planResults = undefined;
    return this.base.query<T>(sql, params);
  }

  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    const map = this.planResults;
    if (map === undefined && this.driftIndex === undefined) return this.base.batch(statements);
    // Consult per member; only the misses ride a real batch trip. Results
    // reassemble in statement order, so the caller sees exactly the shape
    // an all-live batch would have produced (a hit's rows ARE the rows the
    // database returned for that statement against this deck).
    const served: (SQLQueryResult | undefined)[] = new Array(statements.length);
    const misses: number[] = [];
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i] as { sql: string; params?: unknown[] } | undefined;
      let hit =
        stmt === undefined || isGateStateStatement(stmt.sql)
          ? undefined
          : map?.get(renderPlanResultKey(stmt.sql, stmt.params ?? []));
      if (hit === undefined && stmt !== undefined && this.driftIndex !== undefined && isReadOnlyStatement(stmt.sql)) {
        const composed = serveFromDriftArmIndex(this.driftIndex, stmt.sql, stmt.params ?? []);
        if (composed !== undefined) hit = composed as SQLQueryResult;
      }
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
    if (statements.some((s) => !isReadOnlyStatement(s.sql))) {
      this.planResults = undefined;
      this.driftIndex = undefined;
    }
  }
}
