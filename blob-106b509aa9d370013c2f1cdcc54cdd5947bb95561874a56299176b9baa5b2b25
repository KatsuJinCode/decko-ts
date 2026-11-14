// Standing measurement surface for the render-perf round: a vitest-driven
// harness with NAMED WORKLOADS that double as a regression gate. Every
// workload is bracketed with Date.now, asserts a BUDGET, and writes one
// structured result to benchmarks/results/perf/render-perf.json so the
// coordinator (or the next agent) can diff it across rounds.
//
// Run:
//   node node_modules/vitest/vitest.mjs run --root . \
//     benchmarks/perf/render-perf-harness.test.ts
//
// Wall budget: ~90 seconds. The seed (~7 s) and prewarm (~10 s on a cold
// engine) are the dominant phases; the workload phases themselves are < 5 s.
//
// Workloads (each asserts a budget — see README-perf-harness.md for the
// reasoning behind every number):
//   - warm-render-sample: prewarm via prewarmStaticDeck, then render the
//     FIRST 60 shard-0 entries TWICE (each entry's first available view),
//     recording pass-2 ms/entry (the warm path the engine should hold).
//     Budget: < 25 ms/entry (the engine's own constant-shape promise).
//   - pathological-class: a deliberately huge-content shard-0 card's
//     :closed view (id=641, content 15,987 bytes, :closed view 2,540 bytes).
//     Budget: < 2,000 ms (asserted even when red — a red budget is the
//     diagnostic signal; we print the number, we do not hide it).
//   - statement-discipline: lastRenderStats.statements on a warm render.
//     Budget: <= 10 (the #1282 constant-queries promise: a warm render is
//     pure map lookups + HTML assembly; any statement count > 0 indicates
//     the closure fell back to a JS-side walk and we want to know about it).
//   - closureWarm-coverage: cold cards remaining after prewarm on shard-0.
//     Budget: 0 (the prewarm covers every live row; anything left cold is
//     the next regression vector). Audited via the engine's closureWarm
//     method through the structural cast (the established seam; see
//     benchmarks/corpus-v2/prewarm-static-deck.ts:11-13 for the pattern).
//
// Byte parity is non-negotiable: this harness never edits the rendered
// HTML; it only measures. The four budgets are the regression gate.

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  createStructureSeededStorageFor,
  readShardLines,
} from "../../tests/card/render/structure-corpus-seeding.js";
import { prewarmStaticDeck } from "../corpus-v2/prewarm-static-deck.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const CORPUS_DB = path.join(REPO_ROOT, "benchmarks", "corpus-v2", "bench-corpus-v2.sqlite3");
const RESULTS_DIR = path.join(REPO_ROOT, "benchmarks", "results", "perf");
const RESULTS_PATH = path.join(RESULTS_DIR, "render-perf.json");

/** Pathological-class entry: shard-0 card id=641 (name=tgpqpf+uiqxodma).
 *  Largest db_content among shard-0 entries whose captured :closed view is
 *  real rendered HTML (not the 76-byte "permission denied" stub the
 *  read-rule layer emits). See
 *  benchmarks/perf/README-perf-harness.md#pathological-class for the
 *  measurement that nominated it. */
const PATHOLOGICAL_ID = 641;
const PATHOLOGICAL_VIEW = "closed" as const;

/** closureWarm seam (src/card/render.ts:862) — private method, accessed
 *  through the established structural-cast pattern used by the prewarm
 *  itself (benchmarks/corpus-v2/prewarm-static-deck.ts:39-42). */
type EngineWithClosureWarm = {
  closureWarm(record: unknown): boolean;
  fetcher: { retrieveFromCacheById(id: number): Promise<{ key?: string } | undefined> };
  lastRenderStats?: { batches?: number; statements?: number; fallbackRounds?: number; cards?: number };
};

interface WorkloadRow {
  name: string;
  measured: number | string;
  unit: string;
  budget: number | string;
  pass: boolean;
  details?: Record<string, unknown>;
}

interface HarnessResult {
  measured_at: string;
  environment: string;
  workload_set: string;
  overall_pass: boolean;
  total_wall_ms: number;
  workloads: WorkloadRow[];
  notes: string[];
}

function ensureDir(p: string): void {
  mkdirSync(p, { recursive: true });
}

function pickFirstView(line: { name: string; views?: Record<string, string> }): { name: string; view: string } | null {
  if (!line.views) return null;
  const order = ["closed", "content", "open", "title"];
  for (const v of order) {
    if (line.views[v] !== undefined) return { name: line.name, view: v };
  }
  const first = Object.keys(line.views)[0];
  return first === undefined ? null : { name: line.name, view: first };
}

describe("render-perf harness", () => {
  it(
    "runs the four named workloads and writes the result JSON",
    { timeout: 90_000 },
    async () => {
      const overallT0 = Date.now();
      const allRows: WorkloadRow[] = [];
      const notes: string[] = [];

      // ---- shared setup: seed + prewarm ---------------------------------
      const corpus = new Database(CORPUS_DB, { readonly: true });
      const ids = (corpus
        .prepare("SELECT id FROM cards WHERE trash = 0")
        .all() as Array<{ id: number }>)
        .map((r) => r.id);
      corpus.close();
      const idSet = new Set(ids);

      const seedT0 = Date.now();
      const storage = await createStructureSeededStorageFor(idSet);
      const seedMs = Date.now() - seedT0;
      notes.push(`seeded ${idSet.size} ids in ${seedMs} ms`);

      const prewarmT0 = Date.now();
      const prewarmStats = await prewarmStaticDeck(storage);
      const prewarmMs = Date.now() - prewarmT0;
      notes.push(
        `prewarmed rows=${prewarmStats.rows} records=${prewarmStats.records} ` +
          `enriched=${prewarmStats.enriched} searches=${prewarmStats.searches} in ${prewarmMs} ms`,
      );

      const shardLines = readShardLines();
      const firstSixty = shardLines.slice(0, 60);
      const renderPlan: Array<{ name: string; view: string; id: number }> = [];
      for (const line of firstSixty) {
        const plan = pickFirstView(line);
        if (plan !== null) renderPlan.push({ ...plan, id: line.id });
      }
      notes.push(`render plan: ${renderPlan.length}/${firstSixty.length} entries have at least one view`);

      // ---- workload 1: warm-render-sample -------------------------------
      // Pass-1 warms the in-memory caches (engine closures, render card map).
      // Pass-2 is what we measure: each entry should hit the constant-shape
      // pure-memory render path the engine promises.
      const warmT0 = Date.now();
      const perEntryMs: number[] = [];
      let pass1Errs = 0;
      let pass2Errs = 0;
      for (const { name, view } of renderPlan) {
        try { await storage.engine.render(name, view); } catch { pass1Errs += 1; }
      }
      for (const { name, view } of renderPlan) {
        const t = Date.now();
        try { await storage.engine.render(name, view); }
        catch { pass2Errs += 1; }
        perEntryMs.push(Date.now() - t);
      }
      const warmTotalMs = Date.now() - warmT0;
      const pass2Sorted = [...perEntryMs].sort((a, b) => a - b);
      const pass2Avg = perEntryMs.reduce((a, b) => a + b, 0) / Math.max(perEntryMs.length, 1);
      const pass2Median = pass2Sorted[Math.floor(pass2Sorted.length / 2)] ?? 0;
      const pass2P95 = pass2Sorted[Math.floor(pass2Sorted.length * 0.95)] ?? 0;
      const pass2Max = pass2Sorted[pass2Sorted.length - 1] ?? 0;
      const pass2Budget = 25;
      const pass2Pass = pass2Avg < pass2Budget;
      allRows.push({
        name: "warm-render-sample",
        measured: Number(pass2Avg.toFixed(3)),
        unit: "ms/entry (pass-2 avg)",
        budget: pass2Budget,
        pass: pass2Pass,
        details: {
          entries: renderPlan.length,
          pass1Errors: pass1Errs,
          pass2Errors: pass2Errs,
          warmTotalMs,
          median: pass2Median,
          p95: pass2P95,
          max: pass2Max,
        },
      });
      notes.push(
        `warm-render-sample pass-2 avg=${pass2Avg.toFixed(2)}ms p95=${pass2P95}ms max=${pass2Max}ms ` +
          `(budget ${pass2Budget})`,
      );

      // ---- workload 2: pathological-class -------------------------------
      // The huge-content shard-0 entry from tonight's diagnosis. Render its
      // :closed view on the fully-prewarmed engine; the budget is asserted
      // (and the actual number is printed either way — a red budget is the
      // signal the regression gate is meant to catch).
      const pathName = renderPlan.find((p) => p.id === PATHOLOGICAL_ID)?.name
        ?? shardLines.find((l) => l.id === PATHOLOGICAL_ID)?.name;
      let pathMs = -1;
      let pathErr: string | undefined;
      let pathStats: unknown = null;
      let pathLen = 0;
      if (pathName !== undefined) {
        const t = Date.now();
        try {
          const html = await storage.engine.render(pathName, PATHOLOGICAL_VIEW);
          pathMs = Date.now() - t;
          pathLen = html.length;
          pathStats = storage.engine.lastRenderStats;
        } catch (e) {
          pathErr = (e as Error).message.slice(0, 160);
          pathMs = Date.now() - t;
        }
      } else {
        pathErr = `id=${PATHOLOGICAL_ID} not present in shard-0`;
      }
      const pathBudget = 2_000;
      const pathPass = pathErr === undefined && pathMs >= 0 && pathMs < pathBudget;
      allRows.push({
        name: "pathological-class",
        measured: pathMs,
        unit: "ms (single render, warm)",
        budget: pathBudget,
        pass: pathPass,
        details: {
          id: PATHOLOGICAL_ID,
          name: pathName,
          view: PATHOLOGICAL_VIEW,
          htmlBytes: pathLen,
          lastRenderStats: pathStats,
          error: pathErr,
        },
      });
      notes.push(
        `pathological-class ${pathName ?? "?"}:${PATHOLOGICAL_VIEW} ` +
          `ms=${pathMs} htmlBytes=${pathLen} stats=${JSON.stringify(pathStats)}` +
          (pathErr !== undefined ? ` ERR=${pathErr}` : ""),
      );

      // ---- workload 3: statement-discipline -----------------------------
      // The engine's #1282 promise: a warm render is map lookups + HTML
      // assembly; any statements > 0 means the closure fell back to a JS
      // walk and we want to know. Budget <= 10 (generous; a healthy engine
      // reports 0 here).
      const stmtName = renderPlan[0]?.name ?? shardLines[0]?.name;
      const stmtView = renderPlan[0]?.view ?? "closed";
      let stmtStatements = -1;
      if (stmtName !== undefined) {
        // One extra warm render so the engine's closure is fully primed.
        try { await storage.engine.render(stmtName, stmtView); } catch { /* ignored */ }
        try { await storage.engine.render(stmtName, stmtView); } catch { /* ignored */ }
        stmtStatements = storage.engine.lastRenderStats?.statements ?? -1;
      }
      const stmtBudget = 10;
      const stmtPass = stmtStatements >= 0 && stmtStatements <= stmtBudget;
      allRows.push({
        name: "statement-discipline",
        measured: stmtStatements,
        unit: "statements (warm render)",
        budget: stmtBudget,
        pass: stmtPass,
        details: {
          name: stmtName,
          view: stmtView,
          lastRenderStats: storage.engine.lastRenderStats,
        },
      });
      notes.push(
        `statement-discipline ${stmtName ?? "?"}:${stmtView} ` +
          `statements=${stmtStatements} (budget ${stmtBudget})`,
      );

      // ---- workload 4: closureWarm-coverage -----------------------------
      // Walk every shard-0 line's record through the engine's closureWarm
      // seam (render.ts:862). Anything left cold after prewarm is the next
      // regression vector — budget is 0.
      const engine = storage.engine as unknown as EngineWithClosureWarm;
      let coldCount = 0;
      const coldKeys: string[] = [];
      for (const line of shardLines) {
        if (!line.name) continue;
        const rec = await storage.fetcher.fetchByName(line.name);
        if (rec === undefined) continue;
        if (!engine.closureWarm(rec)) {
          coldCount += 1;
          if (coldKeys.length < 10) coldKeys.push(rec.key ?? line.name);
        }
      }
      const coverageBudget = 0;
      const coveragePass = coldCount === coverageBudget;
      allRows.push({
        name: "closureWarm-coverage",
        measured: coldCount,
        unit: "cold cards on shard-0",
        budget: coverageBudget,
        pass: coveragePass,
        details: {
          shardLinesScanned: shardLines.length,
          coldSample: coldKeys,
        },
      });
      notes.push(
        `closureWarm-coverage cold=${coldCount}/${shardLines.length} ` +
          `sample=${coldKeys.slice(0, 5).join(",")} (budget ${coverageBudget})`,
      );

      // ---- write result JSON --------------------------------------------
      const totalMs = Date.now() - overallT0;
      const result: HarnessResult = {
        measured_at: new Date().toISOString(),
        environment:
          "local better-sqlite3 (in-memory), RenderEngine over LocalSqliteDriver, " +
          "prewarmed via benchmarks/corpus-v2/prewarm-static-deck.ts",
        workload_set: "render-perf/2026-09-22",
        overall_pass: allRows.every((r) => r.pass),
        total_wall_ms: totalMs,
        workloads: allRows,
        notes,
      };
      ensureDir(RESULTS_DIR);
      writeFileSync(RESULTS_PATH, JSON.stringify(result, null, 2) + "\n", "utf8");
      notes.push(`wrote ${RESULTS_PATH}`);

      // ---- assertions for the gate -------------------------------------
      // Warm render sample is the primary regression signal.
      expect(pass2Pass, `warm-render-sample avg ${pass2Avg.toFixed(2)}ms >= ${pass2Budget}ms`).toBe(true);
      // Pathological-class: asserted but never hidden (the number prints
      // regardless of pass/fail; a red budget is the signal we want to see).
      if (pathErr !== undefined) {
        throw new Error(`pathological-class render threw: ${pathErr}`);
      }
      expect(pathMs, `pathological-class ${pathMs}ms`).toBeGreaterThanOrEqual(0);
      expect(pathPass, `pathological-class ${pathMs}ms >= ${pathBudget}ms budget`).toBe(true);
      // Statement discipline: warm render should be cheap.
      expect(stmtPass, `statement-discipline statements=${stmtStatements} > ${stmtBudget}`).toBe(true);
      // Coverage: prewarm should leave everything warm.
      expect(coveragePass, `closureWarm-coverage cold=${coldCount} > 0`).toBe(true);

      storage.close();
    },
  );
});
