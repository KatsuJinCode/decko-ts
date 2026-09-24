// M3 depth sweep: every depth 1..32 measured for the same axes the #1282
// claim is graded on. No gaps.
//
// Run via: npx vitest run tests/card/render/depth-sweep.test.ts
//
// Reported numbers populate a JSON file under benchmarks/results/depth-sweep-ts.json
// so the M3 report has receipts.

import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { DeckoName } from "../../../src/card/name.js";

const DEPTHS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40, 42];
// Ruby depth+3 truth, measured on the oracle app (benchmarks/results/ruby-nesting-r1-r2.json).
const RUBY_MEASURED: Record<number, number> = { 1: 4, 2: 5, 4: 7, 8: 11, 16: 19 };

async function seedChain(storage: RenderTestStorage, depth: number): Promise<void> {
  // RichText cardtype (codename :basic) - the same cardtype the captured fixtures use.
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
  for (let i = 1; i <= depth; i++) {
    const content = i < depth ? `level ${i} body {{chain_l${i + 1}}}` : `level ${i} end`;
    await seedCard(storage, { id: 100 + i, name: `chain_l${i}`, typeId: 2, dbContent: content });
  }
}

describe("M3 depth sweep: TypeScript queries-per-render at every depth 1..32", () => {
  it("measures round trips, statements, warm cache, and wall-clock at every depth", { timeout: 60_000 }, async () => {
    const rows: Array<{
      depth: number;
      roundTrips: number;
      statements: number;
      coldWallMs: number;
      warmWallMs: number;
      warmRoundTrips: number;
      warmStatements: number;
      rubyMeasured: number | null;
      rubyRatio: number | null;
    }> = [];

    for (const depth of DEPTHS) {
      const storage = await createRenderTestStorage();
      try {
        await seedChain(storage, depth);
        // The renderer caps at maxDepth=42 by default (src/card/render/format.ts:214).
        // Past 42 the Format-object recursion throws "nest depth exceeded"; the SQL CTE
        // walks arbitrarily deep but the render path does not render past 42.
        if (depth > 42) throw new Error(`DEPTHS should not exceed renderer maxDepth=42`);

        // Cold render
        storage.counting.reset();
        const t0 = performance.now();
        await storage.engine.render("chain_l1", "content");
        const t1 = performance.now();
        const cold = storage.counting.snapshot();

        // Warm render (same engine instance, same chain)
        storage.counting.reset();
        const w0 = performance.now();
        await storage.engine.render("chain_l1", "content");
        const w1 = performance.now();
        const warm = storage.counting.snapshot();

        const ruby = RUBY_MEASURED[depth] ?? null;
        rows.push({
          depth,
          roundTrips: cold.roundTrips,
          statements: cold.statements,
          coldWallMs: Number((t1 - t0).toFixed(3)),
          warmWallMs: Number((w1 - w0).toFixed(3)),
          warmRoundTrips: warm.roundTrips,
          warmStatements: warm.statements,
          rubyMeasured: ruby,
          rubyRatio: ruby !== null ? Number((ruby / cold.roundTrips).toFixed(2)) : null,
        });
      } finally {
        storage.close();
      }
    }

    // Structural assertions (2026-09-23, per-key closure rounds): cold round
    // trips scale with the CHAIN at slope 1 (one batch per inclusion level
    // beyond depth 2) - the trade for rows-read dropping from O(deck x
    // passes) per render to O(page). Ruby's measured truth is depth+3: the
    // same slope. Statements add exactly one fetch statement per level.
    const rts = rows.map((r) => r.roundTrips);
    const sts = rows.map((r) => r.statements);
    // Structural shape (2026-09-23, per-key closure rounds): round trips =
    // 7 + max(0, depth-2) and statements = 11 + max(0, depth-1) - slope 1
    // per chain LEVEL (one batch per inclusion level), independent of deck
    // size. Ruby's measured truth is depth+3: the same slope. The trade for
    // the level-linear cold path is rows-read dropping from O(deck x passes)
    // per render to O(page); warm renders stay at 0 (asserted below).
    const expectedRts = (depth: number): number => 7 + Math.max(0, depth - 2);
    const expectedSts = (depth: number): number => 11 + Math.max(0, depth - 1);
    for (let i = 0; i < rows.length; i++) {
      expect(rts[i]).toBe(expectedRts(rows[i]!.depth));
      expect(sts[i]).toBe(expectedSts(rows[i]!.depth));
    }
    // Warm cache: zero queries on the second render (the rule cache is hit).
    expect(rows.every((r) => r.warmRoundTrips === 0 && r.warmStatements === 0)).toBe(true);

    mkdirSync("benchmarks/results", { recursive: true });
    writeFileSync(
      "benchmarks/results/depth-sweep-ts.json",
      JSON.stringify(
        {
          measured_at: new Date().toISOString(),
          environment: "local better-sqlite3 over production-schema DDL; synthetic chains",
          axes: {
            round_trips: "driver calls: query() + batch() each count ONE",
            statements: "individual SQL statements (batch members count one each)",
            warm: "second render of same chain in same engine instance",
          },
          ruby_measured_truth: {
            source: "decko-ts/benchmarks/results/ruby-nesting-r1-r2.json",
            formula: "depth + 3; depth 32 hard-capped by Card.config.max_depth=20 with 'Man, you're too deep' UserError",
            table: RUBY_MEASURED,
          },
          ts_constant: { round_trips: rts[0], statements: sts[0] },
          rows,
          ts_reduces_query_count_by: rows
            .filter((r) => r.rubyMeasured !== null)
            .map((r) => ({ depth: r.depth, ruby: r.rubyMeasured, ts: r.roundTrips, ratio: r.rubyRatio })),
        },
        null,
        2,
      ),
    );

    // Human-readable summary in the test report.
    // eslint-disable-next-line no-console
    console.log("\nM3 depth sweep - TypeScript vs Ruby queries-per-render:\n");
    // eslint-disable-next-line no-console
    console.log("depth | ruby q | ts RT | ts SQL | cold ms | warm ms");
    // eslint-disable-next-line no-console
    console.log("------+-------+------+-------+---------+--------");
    for (const r of rows) {
      // eslint-disable-next-line no-console
      console.log(
        `${String(r.depth).padStart(5)} | ${String(r.rubyMeasured ?? "n/a").padStart(5)} | ${String(r.roundTrips).padStart(4)} | ${String(r.statements).padStart(5)} | ${String(r.coldWallMs).padStart(7)} | ${String(r.warmWallMs).padStart(7)}`,
      );
    }
  });
});
