// THE RENDER-PLAN RECORDER (renderplan-replay lane, 2026-10-05): the
// store-build-time half of the record-and-replay render. For each page the
// store materializes, this module renders the page ONCE through the real
// engine — the one-trip gate ON in the EXACT SERVING POSTURE
// (DECKO_ONE_TRIP_STORE=inline against the materialized deck) — with a
// capturing driver, keeps every statement the render asked that belongs in
// a plan (isPipelineAbleRenderStatement — the census's pipeline-able
// families), dedupes it through recordRenderPlan, and writes it to
// one_trip_render_plans IN the materialized deck (the serving store's own
// table; the plans ride the seat's head statement from there).
//
// WHY AGAINST THE MATERIALIZED DECK (measured, first build): a plan
// recorded through the ATTACHED seat posture (corpus + side file) missed
// 1-9 follow-on batches per page at serve time — junction-pair and
// COLLATE NOCASE IN-list statements whose params depend on the render's
// mid-flight cache evolution, which differs between the recording and
// serving postures (measured: the Aikido plan's junction read carried the
// extra pair (5,146) the inline-posture render never asked). Recording in
// the exact serving posture makes the plan self-consistent with what the
// serving render asks — the trip-profile pin proves it (zero covered
// reads beyond the plan).
//
// ORDER-DEPENDENT CLASSES (search-count, search-cql) are excluded by the
// filter — they must still execute in sequence (the census's verdict).

import type { SQLDatabaseDriver, SQLQueryResult, SQLStatement } from "../../server/driver.js";
import { FetchEngine } from "../fetch.js";
import { RenderEngine } from "../render.js";
import {
  classifyResidueStatement,
  isPipelineAbleRenderStatement,
  recordRenderPlan,
  type RenderPlanEntry,
} from "./render-plan.js";

/** The plan table's write chunk (rows per INSERT; 100 rows x 5 binds stays
 *  far under every driver's per-statement bind ceiling). */
const PLAN_INSERT_CHUNK = 100;

/** The statement capturer: records every statement (sql + full params, call
 *  order) without changing any result. Engine-lifecycle statements (the
 *  seat's one_trip_* reads, the ATTACH) are recorded too and dropped by the
 *  plan filter — the recorder never needs caller attribution because the
 *  filter classifies on SQL text alone. */
class StatementCaptureDriver implements SQLDatabaseDriver {
  readonly statements: { sql: string; params: unknown[] }[] = [];
  constructor(private readonly inner: SQLDatabaseDriver) {}
  async query<T = unknown>(sql: string, params: unknown[]): Promise<SQLQueryResult<T>> {
    this.statements.push({ sql, params });
    return this.inner.query<T>(sql, params);
  }
  async batch(statements: SQLStatement[]): Promise<SQLQueryResult[]> {
    for (const statement of statements) {
      this.statements.push({ sql: statement.sql, params: statement.params });
    }
    return this.inner.batch(statements);
  }
}

export interface RenderPlanRecorderOptions {
  /** The MATERIALIZED deck — the serving store with the one_trip_* tables
   *  inline. The recording renders read it (through the capture) and the
   *  plans are written INTO it (one_trip_render_plans). Writable: this is
   *  the store-build window (the same write scope as the materialize
   *  load; serving never writes). */
  deck: SQLDatabaseDriver;
  /** Pages to record (the store's materialized pages). */
  pageNames: readonly string[];
  /** page name -> resolved page card id (the builder report's pages). */
  pageIds: ReadonlyMap<string, number>;
}

export interface RenderPlanPageReport {
  pageId: number;
  recorded: boolean;
  /** Statements the recording render captured (pre-filter). */
  captureStatements: number;
  /** Plan entries after the pipeline-able filter + recordRenderPlan dedupe. */
  entries: number;
  families: Record<string, number>;
  /** The failure when recorded is false (the render falls back live). */
  error?: string;
}

export interface RenderPlanRecorderReport {
  pages: Record<string, RenderPlanPageReport>;
}

/** Write one page's plan rows (the seq order IS the call order — the serve
 *  side reads them back in seq and replays in order). */
async function storeRenderPlan(
  side: SQLDatabaseDriver,
  pageId: number,
  entries: readonly RenderPlanEntry[],
): Promise<void> {
  await side.query("DELETE FROM one_trip_render_plans WHERE page_id = ?", [pageId]);
  for (let i = 0; i < entries.length; i += PLAN_INSERT_CHUNK) {
    const chunk = entries.slice(i, i + PLAN_INSERT_CHUNK);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?)").join(", ");
    await side.query(
      `INSERT INTO one_trip_render_plans (page_id, seq, family, sql, params_json) VALUES ${placeholders}`,
      chunk.flatMap((entry, k) => [
        pageId,
        i + k,
        classifyResidueStatement(entry.sql) ?? "point-row-by-name",
        entry.sql,
        JSON.stringify(entry.params),
      ]),
    );
  }
}

/** Record render plans for the given pages INTO the materialized deck. A
 *  page whose recording render fails is reported (recorded: false + error)
 *  and left plan-less: the serve path runs its live residue for it — the
 *  plan is an optimization, never a correctness dependency. */
export async function recordRenderPlansForPages(
  options: RenderPlanRecorderOptions,
): Promise<RenderPlanRecorderReport> {
  const { deck, pageNames, pageIds } = options;
  const report: RenderPlanRecorderReport = { pages: {} };

  const savedGate = process.env.DECKO_ONE_TRIP;
  const savedStore = process.env.DECKO_ONE_TRIP_STORE;
  process.env.DECKO_ONE_TRIP = "1";
  process.env.DECKO_ONE_TRIP_STORE = "inline";
  try {
    for (const pageName of pageNames) {
      const pageId = pageIds.get(pageName);
      const page: RenderPlanPageReport = {
        pageId: pageId ?? -1,
        recorded: false,
        captureStatements: 0,
        entries: 0,
        families: {},
      };
      report.pages[pageName] = page;
      if (pageId === undefined || pageId <= 0) continue;
      const capture = new StatementCaptureDriver(deck);
      try {
        // A FRESH ENGINE per page (the cold-render posture the census
        // measured): every statement the page's cold render asks is
        // captured, in call order, in the EXACT serving posture.
        const fetcher = new FetchEngine(capture);
        await fetcher.codenames.ensureLoaded();
        fetcher.installNameEnvironment();
        const render = new RenderEngine(fetcher);
        await render.render(pageName, "open", {});
        page.captureStatements = capture.statements.length;
        const plan = recordRenderPlan(
          pageName,
          capture.statements
            .filter((s) => isPipelineAbleRenderStatement(s.sql))
            .map((s) => ({ sql: s.sql, params: s.params })),
        );
        // JSON-safety guard: a bind set that cannot round-trip through the
        // plan's JSON storage is dropped (the statement stays live at serve
        // time) — the plan never stores a bind it cannot reproduce exactly.
        const safeEntries: RenderPlanEntry[] = [];
        for (const entry of plan.entries) {
          try {
            JSON.stringify(entry.params);
          } catch {
            continue;
          }
          safeEntries.push(entry);
        }
        await storeRenderPlan(deck, pageId, safeEntries);
        page.recorded = true;
        page.entries = safeEntries.length;
        for (const entry of safeEntries) {
          const family = classifyResidueStatement(entry.sql) ?? "point-row-by-name";
          page.families[family] = (page.families[family] ?? 0) + 1;
        }
      } catch (error) {
        page.error = error instanceof Error ? error.message : String(error);
      }
    }
  } finally {
    if (savedGate === undefined) delete process.env.DECKO_ONE_TRIP;
    else process.env.DECKO_ONE_TRIP = savedGate;
    if (savedStore === undefined) delete process.env.DECKO_ONE_TRIP_STORE;
    else process.env.DECKO_ONE_TRIP_STORE = savedStore;
  }
  return report;
}
