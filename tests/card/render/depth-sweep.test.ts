// Depth sweep: fourteen depths measured for the same axes the upstream
// round-trip claim is graded on — 1 through 8 every depth, then 10, 12, 14,
// 16, 18 and 20 (the DEPTHS array below is the exact list these assertions
// run; the describe title names it so a green run cannot be read as a denser
// sweep than it is). Ceiling aligned to the renderer's RUBY_MAX_DEPTH=20 —
// Card.config.max_depth, railtie.rb:17; the sweep once ran 1..42 before the
// renderer's old 42 guard was aligned to the vendored prototype. Depths past
// 20 raise the too-deep guard.
//
// Run via: npx vitest run tests/card/render/depth-sweep.test.ts
//
// Reported numbers populate a JSON file under benchmarks/results/depth-sweep-ts.json.
// That write is OPT-IN via DEPTH_SWEEP_WRITE_ARTIFACT=1: the committed
// receipt is authoritative (docs/parity-method.md), and an unconditional
// rewrite put a fresh measured_at + wall-ms into the tree on every suite
// run, dirtying it and forcing housekeeping commits. The assertions below
// run on every execution; only the receipt refresh is gated.

import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { DeckoName } from "../../../src/card/name.js";
import { RUBY_MAX_DEPTH } from "../../../src/card/render/format.js";

// Receipt refresh is opt-in (see header): the depth-sweep assertions below
// run on every execution; benchmarks/results/depth-sweep-ts.json is rewritten
// only when DEPTH_SWEEP_WRITE_ARTIFACT=1.
const ARTIFACT_WRITE_REQUESTED = process.env.DEPTH_SWEEP_WRITE_ARTIFACT === "1";

const DEPTHS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20];
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

describe("Depth sweep: TypeScript queries-per-render at depths 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20", () => {
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
        // The renderer caps at RUBY_MAX_DEPTH=20 by default
        // (src/card/render/format.ts, Card.config.max_depth railtie.rb:17).
        // Past 20 the Format-object recursion throws "nest depth exceeded";
        // the SQL CTE walks arbitrarily deep but the render path does not
        // render past the guard.
        if (depth > RUBY_MAX_DEPTH) {
          throw new Error(`DEPTHS should not exceed renderer RUBY_MAX_DEPTH=${RUBY_MAX_DEPTH}`);
        }

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

    // Structural assertions: cold round trips scale with the CHAIN at slope
    // 1 (one batch per unfetched inclusion level) - the trade for rows-read
    // dropping from O(deck x passes) per render to O(page). Ruby's measured
    // truth is depth+3; the TS curve is that same line, depth by depth (see
    // the note below on which deck it is measured). Statements add exactly
    // one fetch statement per level.
    const rts = rows.map((r) => r.roundTrips);
    const sts = rows.map((r) => r.statements);
    // Structural shape: round trips = 4 + max(0, depth-1) and statements =
    // 21 + max(0, depth-1) - the chain slope stays exactly 1 (one closure
    // batch per unfetched inclusion level), independent of deck size.
    // Ruby's measured truth is depth+3: the TS curve EQUALS it at every
    // depth Ruby was measured on (1, 2, 4, 8, 16), on a deck that carries
    // its read rule.
    //
    // THE DECK CARRIES ITS READ RULE. The seeds go through
    // createRenderTestStorage(), which seeds the stock `*all+*read` rule
    // card: Ruby has no allowance for a deck without one
    // (card-mod-permissions set/all/permissions.rb:139-146), so this is
    // the posture every real deck renders in and the one these numbers
    // describe. The read permission's one-time setup - the rule-closure
    // walk, the rule card's content and the viewer card's key - rides the
    // PRELUDE batch, so it adds statements to the fixed cost and NO round
    // trips (render.ts cold slots; permissions/read-rules.ts
    // ruleClosureWalkStatement / primeRuleClosureUniverse /
    // actorKeyFromResults). A deck with no read rule card therefore
    // measures the same four round trips with two fewer statements.
    // The four fixed round trips: RT1 the root key row, RT2 the PRELUDE
    // batch (src/card/render/prefetch.ts prefetchInclusionClosure: the
    // root's side priming, the root's TYPE row, the root's set-pattern
    // anchor priming, and the engine's permission/codename/structure/
    // rule-walk/stamp folds), RT3 wave round 1 (the type-card prime and
    // the Set TYPE card's row folded in as the batch preamble), RT4 wave
    // round 2 (depth-3 junction candidates whose sides round 1 seated -
    // "a junction's ids are the previous round's ANSWERS"; genuinely
    // sequential, not a fusion gap). Ruby derivation: the wave
    // asks the rule-candidate names of the view-time settings (*content
    // options, *help, *structure, *default) that Ruby resolves per lookup
    // through Set#rule/rule_card (rule/all.rb) plus the prepared records'
    // type cards (Card#type_card, type.rb:32-35) - batched here,
    // point-by-point in Ruby's cache.
    // Other prelude members: the junction-priming prelude statements
    // (field-anchor prelude + context junction priming) and the template
    // TYPE-NAME read (templateTypeNameStatement - newCardDefaultType's
    // dup_structure leg must resolve a *structure rule card's type NAME
    // synchronously) ride the SAME prelude round trip, so they add
    // statements but no round trips.
    // The deck_data_version freshness stamp folds LAST into the cold batch
    // (+1 statement at every depth, +0 round trips).
    const expectedRts = (depth: number): number => 4 + Math.max(0, depth - 1);
    const expectedSts = (depth: number): number => 21 + Math.max(0, depth - 1);
    for (let i = 0; i < rows.length; i++) {
      expect(rts[i]).toBe(expectedRts(rows[i]!.depth));
      expect(sts[i]).toBe(expectedSts(rows[i]!.depth));
    }
    // Warm cache: the second render pays exactly the freshness-stamp
    // statement (one statement, one round trip — the documented warm-render
    // cost) and nothing else.
    expect(rows.every((r) => r.warmRoundTrips === 1 && r.warmStatements === 1)).toBe(true);

    if (ARTIFACT_WRITE_REQUESTED) {
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
    } else {
      // eslint-disable-next-line no-console
      console.log(
        "\n(receipt not refreshed: set DEPTH_SWEEP_WRITE_ARTIFACT=1 to rewrite benchmarks/results/depth-sweep-ts.json)",
      );
    }

    // Human-readable summary in the test report.
    // eslint-disable-next-line no-console
    console.log("\nDepth sweep - TypeScript vs Ruby queries-per-render:\n");
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
