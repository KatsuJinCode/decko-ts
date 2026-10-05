// THE RENDER-PLAN RECORDER (renderplan-replay lane, 2026-10-05): the
// store-build-time half of the record-and-replay render. For each page the
// closure builder just materialized, this module renders the page ONCE
// through the real engine (the one-trip gate ON against the freshly built
// side store — the ATTACHED serving shape) with a capturing driver, keeps
// every statement the render asked that belongs in a plan
// (isPipelineAbleRenderStatement — the census's pipeline-able families:
// point reads, pair probes, lexicon priming, template links, prefetch
// IN-lists and pair joins, the rule-lattice CTEs, the fixed boot folds),
// dedupes it through recordRenderPlan, and writes it to
// one_trip_render_plans in the derived store.
//
// WHY AT BUILD TIME: the plan is a function of (deck content, engine code,
// signed-out "open" posture) — all fixed at build time. At serve time the
// gate replays the plan as ONE batch (the census's theoretical floor: 1
// boot batch + 2 seat + 1 replay batch + 1 order-dependent search-count)
// and arms the driver seam; the render consumes the plan's result set
// instead of re-issuing solo reads. Statement text and binds are recorded
// verbatim, so a serve-time render whose asks match the recording answers
// from the plan with zero behavior change; a mismatch (different viewer,
// drifted deck) misses the plan and goes live — the live path stays
// authoritative.
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
  /** The deck — READ-ONLY by contract (the recording render reads it). */
  corpus: SQLDatabaseDriver;
  /** The derived store — the plans are written here (write scope: builder
   *  only, the same A2 rule as every one_trip_* table). */
  side: SQLDatabaseDriver;
  /** The side store's file path — DECKO_ONE_TRIP_STORE during the
   *  recording renders (the gate attaches it to the corpus connection). */
  sidePath: string;
  /** Pages to record (the builder's materialized pages). */
  pageNames: readonly string[];
  /** page name -> resolved page card id (the builder's own resolution). */
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

/** Record render plans for the given pages into the derived store. A page
 *  whose recording render fails is reported (recorded: false + error) and
 *  left plan-less: the serve path runs its live residue for it — the plan
 *  is an optimization, never a correctness dependency. */
export async function recordRenderPlansForPages(
  options: RenderPlanRecorderOptions,
): Promise<RenderPlanRecorderReport> {
  const { corpus, side, sidePath, pageNames, pageIds } = options;
  const report: RenderPlanRecorderReport = { pages: {} };

  const savedGate = process.env.DECKO_ONE_TRIP;
  const savedStore = process.env.DECKO_ONE_TRIP_STORE;
  process.env.DECKO_ONE_TRIP = "1";
  process.env.DECKO_ONE_TRIP_STORE = sidePath;
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
      const capture = new StatementCaptureDriver(corpus);
      try {
        // A FRESH ENGINE per page (the cold-render posture the census
        // measured): every statement the page's cold render asks is
        // captured, in call order.
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
        await storeRenderPlan(side, pageId, safeEntries);
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
