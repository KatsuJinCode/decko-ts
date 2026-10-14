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
// Reported numbers populate a JSON results file (not in the public package).
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
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { DeckoName } from "../../../src/card/name.js";
import { RUBY_MAX_DEPTH } from "../../../src/card/render/format.js";
import { INDEXED_COLD_ROUND_TRIPS, coldRoundTripLaw } from "./round-trip-law.js";

// Receipt refresh is opt-in (see header): the depth-sweep assertions below
// run on every execution; the TS results file is rewritten
// only when DEPTH_SWEEP_WRITE_ARTIFACT=1.
const ARTIFACT_WRITE_REQUESTED = process.env.DEPTH_SWEEP_WRITE_ARTIFACT === "1";

const DEPTHS = Array.from({ length: RUBY_MAX_DEPTH }, (_, i) => i + 1);
// Ruby depth+3 truth, measured on the oracle app (benchmarks/results/ruby-nesting-r1-r2.json).
const RUBY_MEASURED: Record<number, number> = { 1: 4, 2: 5, 4: 7, 8: 11, 16: 19 };
// THE LAW (round-trip-law.ts). With the stored nest index a cold render costs
// the three fixed round trips at every depth. Without it (content the index
// does not describe) each nesting level below the root adds one; a depth-N
// chain nests N-1 levels below its root.
const expectedIndexedRts = (_depth: number): number => INDEXED_COLD_ROUND_TRIPS;
const expectedWalkedRts = (depth: number): number => coldRoundTripLaw(depth - 1);
// Statements: twenty-one at depth 1 (the twenty fixed statements plus the
// nest-index statement in the prelude), plus the extra statements of the
// wave's depth-3 key join. That join carries at most 30 names per statement
// (90 bound parameters, under D1's 100-parameter cap), and every chain card
// brings its own *self rule candidates (about four depth-3 names each), so
// the join needs a second statement from depth 6 and a third from depth 14.
// Statements, not round trips: they ride the same wave batch. Without the
// index each level adds its closure statement instead.
const KEY_JOIN_EXTRA = (depth: number): number => (depth >= 14 ? 2 : depth >= 6 ? 1 : 0);
const expectedIndexedSts = (depth: number): number => 21 + KEY_JOIN_EXTRA(depth);
const expectedWalkedSts = (depth: number): number => 21 + Math.max(0, depth - 1) + KEY_JOIN_EXTRA(depth);

async function seedChain(storage: RenderTestStorage, depth: number, withIndex: boolean): Promise<void> {
  // RichText cardtype (codename :basic) - the same cardtype the captured fixtures use.
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
  for (let i = 1; i <= depth; i++) {
    const content = i < depth ? `level ${i} body {{chain_l${i + 1}}}` : `level ${i} end`;
    await seedCard(storage, { id: 100 + i, name: `chain_l${i}`, typeId: 2, dbContent: content });
  }
  if (!withIndex) return;
  // The nest index the write path keeps (refresh-references-out.ts): one
  // ref_type 'I' row per nest, the referee absolutized and its id filled in.
  for (let i = 1; i < depth; i++) {
    await seedReference(storage, 100 + i, 100 + i + 1, `chain_l${i + 1}`, "I");
  }
}

interface SweepRow {
  depth: number;
  roundTrips: number;
  statements: number;
  coldWallMs: number;
  warmWallMs: number;
  warmRoundTrips: number;
  warmStatements: number;
  rubyMeasured: number | null;
  rubyRatio: number | null;
}

async function sweep(withIndex: boolean): Promise<SweepRow[]> {
  const rows: SweepRow[] = [];
  for (const depth of DEPTHS) {
    const storage = await createRenderTestStorage();
    try {
      await seedChain(storage, depth, withIndex);
      // The renderer caps at RUBY_MAX_DEPTH=20 by default
      // (src/card/render/format.ts, Card.config.max_depth railtie.rb:17).
      // Past 20 the Format-object recursion throws "nest depth exceeded".
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
  return rows;
}

function printTable(title: string, rows: SweepRow[]): void {
  // eslint-disable-next-line no-console
  console.log(`\n${title}\n`);
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
}

// The fixed round trips, the same in both postures: RT1 the root key row,
// RT2 the PRELUDE batch (src/card/render/prefetch.ts prefetchInclusionClosure:
// the root's side priming, the root's TYPE row with that type's own type row,
// the root's set-pattern anchor priming, the stored nest index's closure
// statement, and the engine's permission/codename/structure/rule-walk/stamp
// folds), RT3 the wave's one round (the type-card prime and the Set TYPE
// card's row folded in as the batch preamble, the rule candidates of every
// card the closure reached by key, their depth-2 junctions by side keys and
// their depth-3 names through the depth-2 junction by keys). Ruby
// derivation: the wave asks the rule-candidate names of the view-time
// settings (*content options, *help, *structure, *default) that Ruby
// resolves per lookup through Set#rule/rule_card (rule/all.rb) plus the
// prepared records' type cards (Card#type_card, type.rb:32-35) - batched
// here, point-by-point in Ruby's cache.
//
// THE DECK CARRIES ITS READ RULE. The seeds go through
// createRenderTestStorage(), which seeds the stock `*all+*read` rule card:
// Ruby has no allowance for a deck without one (card-mod-permissions
// set/all/permissions.rb:139-146). The read permission's one-time setup
// rides the PRELUDE batch, so it adds statements to the fixed cost and no
// round trips. A deck with no read rule card measures the same round trips
// with two fewer statements. The deck_data_version freshness stamp folds
// LAST into the cold batch (+1 statement at every depth, +0 round trips).
describe("Depth sweep: TypeScript queries-per-render at every depth 1 through 20", () => {
  it("a deck with its stored nest index renders in a constant number of round trips", { timeout: 60_000 }, async () => {
    const rows = await sweep(true);
    // Constant in depth: the prelude's nest-index statement brings the whole
    // nest closure, and the closure rounds are answered from it
    // (NestIndexPool) without a round trip. Ruby's measured truth is depth+3.
    for (const r of rows) {
      expect({ depth: r.depth, roundTrips: r.roundTrips }).toEqual({
        depth: r.depth,
        roundTrips: expectedIndexedRts(r.depth),
      });
      expect({ depth: r.depth, statements: r.statements }).toEqual({
        depth: r.depth,
        statements: expectedIndexedSts(r.depth),
      });
    }
    // Warm cache: the second render pays exactly the freshness-stamp
    // statement (one statement, one round trip) and nothing else.
    expect(rows.every((r) => r.warmRoundTrips === 1 && r.warmStatements === 1)).toBe(true);

    if (ARTIFACT_WRITE_REQUESTED) {
      const walked = await sweep(false);
      mkdirSync("benchmarks/results", { recursive: true });
      writeFileSync(
        "benchmarks/results/depth-sweep-ts.json",
        JSON.stringify(
          {
            measured_at: new Date().toISOString(),
            reproduce: "DEPTH_SWEEP_WRITE_ARTIFACT=1 npx vitest run tests/card/render/depth-sweep.test.ts",
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
            ts_constant: { round_trips: rows[0]!.roundTrips, statements: rows[0]!.statements },
            rows,
            rows_without_nest_index: walked,
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
        "\n(receipt not refreshed: set DEPTH_SWEEP_WRITE_ARTIFACT=1 to rewrite the TS results file)",
      );
    }
    printTable("Depth sweep, stored nest index - TypeScript vs Ruby queries-per-render:", rows);
  });

  it("content the nest index does not describe falls back to one round trip per level", { timeout: 60_000 }, async () => {
    // No card_references rows: every closure round goes to the database, one
    // batched round trip per nesting level below the root.
    const rows = await sweep(false);
    for (const r of rows) {
      expect({ depth: r.depth, roundTrips: r.roundTrips }).toEqual({
        depth: r.depth,
        roundTrips: expectedWalkedRts(r.depth),
      });
      expect({ depth: r.depth, statements: r.statements }).toEqual({
        depth: r.depth,
        statements: expectedWalkedSts(r.depth),
      });
    }
    expect(rows.every((r) => r.warmRoundTrips === 1 && r.warmStatements === 1)).toBe(true);
    printTable("Depth sweep, no nest index (per-level walk):", rows);
  });
});
