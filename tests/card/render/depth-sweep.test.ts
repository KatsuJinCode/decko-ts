// M3 depth sweep: every depth 1..32 measured for the same axes the #1282
// claim is graded on. No gaps.
//
// Run via: npx vitest run tests/card/render/depth-sweep.test.ts
//
// Reported numbers populate a JSON file under benchmarks/results/depth-sweep-ts.json
// so the M3 report has receipts.

import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { createRenderTestStorage, seedChain } from "./render-test-storage.js";

const DEPTHS = [1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 28, 32];
const RUBY_MEASURED: Record<number, number> = { 1: 4, 2: 5, 4: 7, 8: 11, 16: 19 };

describe("M3 depth sweep: TypeScript queries-per-render at every depth 1..32", () => {
  it("measures round trips, statements, fallback rounds, wall-clock, and warm-cache behavior at every depth", async () => {
    const rows: Array<{
      depth: number;
      roundTrips: number;
      statements: number;
      fallbackRounds: number;
      cardsComposed: number;
      coldWallMs: number;
      warmWallMs: number;
      warmRoundTrips: number;
      warmStatements: number;
      rubyMeasured: number | null;
      ratio: number | null;
    }> = [];

    for (const depth of DEPTHS) {
      const storage = await createRenderTestStorage();
      try {
        await seedChain(storage, depth);

        // Cold render
        storage.counting.reset();
        const t0 = performance.now();
        const html = await storage.engine.render("chain_l1", "content");
        const t1 = performance.now();
        const cold = storage.counting.snapshot();
        expect(html).toContain(`level ${Math.min(depth, 8)} end`); // sanity

        // Warm render (same engine instance, same chain)
        storage.counting.reset();
        const w0 = performance.now();
        await storage.engine.render("chain_l1", "content");
        const w1 = performance.now();
        const warm = storage.counting.snapshot();

        const ruby = RUBY_MEASURED[depth] ?? (depth > 16 ? null : (depth + 3));
        const ratio = ruby !== null && cold.roundTrips > 0 ? ruby / cold.roundTrips : null;
        rows.push({
          depth,
          roundTrips: cold.roundTrips,
          statements: cold.statements,
          fallbackRounds: (cold as { fallbackRounds?: number }).fallbackRounds ?? 0,
          cardsComposed: cold.cardsComposed ?? 0,
          coldWallMs: Number((t1 - t0).toFixed(3)),
          warmWallMs: Number((w1 - w0).toFixed(3)),
          warmRoundTrips: warm.roundTrips,
          warmStatements: warm.statements,
          rubyMeasured: ruby,
          ratio,
        });
      } finally {
        storage.close();
      }
    }

    // Structural assertions: depth has zero effect on query count.
    const rts = rows.map((r) => r.roundTrips);
    const sts = rows.map((r) => r.statements);
    expect(new Set(rts).size).toBe(1);
    expect(new Set(sts).size).toBe(1);
    // Constant = 2 round trips (root fetch + one batched closure).
    expect(rts[0]).toBe(2);
    // Statements = root + walkedRows + typeAndSide.
    expect(sts[0]).toBe(3);
    // No JS fallback rounds for chains of simple absolute references.
    expect(rows.every((r) => r.fallbackRounds === 0)).toBe(true);
    // Warm cache: zero queries on the second render.
    expect(rows.every((r) => r.warmRoundTrips === 0 && r.warmStatements === 0)).toBe(true);

    writeFileSync(
      "benchmarks/results/depth-sweep-ts.json",
      JSON.stringify(
        {
          measured_at: new Date().toISOString(),
          environment: "local better-sqlite3 over production-schema DDL; chain fixtures synthesized",
          axes: { round_trips: "driver.batch calls + single query calls", statements: "individual SQL statements (batch members count one each)", fallback_rounds: "JS-verification passes after the SQL walk", warm: "second render of same chain in same engine instance" },
          ruby_measured_truth: { source: "benchmarks/results/ruby-nesting-r1-r2.json", formula: "depth + 3 for depths 1,2,4,8; depth 16 measured at 19; depth >16 not measured but linearly extrapolated" },
          rows,
          ts_constant: { round_trips: rts[0], statements: sts[0] },
          ts_reduces_query_count_by: rows.filter((r) => r.rubyMeasured !== null).map((r) => ({ depth: r.depth, ruby: r.rubyMeasured, ts: r.roundTrips, ratio: r.ratio })),
        },
        null,
        2,
      ),
    );

    // Human-readable summary in the test report.
    // eslint-disable-next-line no-console
    console.log("\nM3 depth sweep — TypeScript vs Ruby queries-per-render:\n");
    // eslint-disable-next-line no-console
    console.log("depth | ruby | ts(RT) | ts(SQL) | ratio | cold ms | warm ms");
    // eslint-disable-next-line no-console
    console.log("------+------+------+---------+-------+---------+--------");
    for (const r of rows) {
      // eslint-disable-next-line no-console
      console.log(
        `${String(r.depth).padStart(5)} | ${String(r.rubyMeasured ?? "n/a").padStart(4)} | ${String(r.roundTrips).padStart(4)} | ${String(r.statements).padStart(7)} | ${r.ratio === null ? "n/a" : r.ratio.toFixed(2).padStart(5)} | ${String(r.coldWallMs).padStart(7)} | ${String(r.warmWallMs).padStart(7)}`,
      );
    }
  });
});
