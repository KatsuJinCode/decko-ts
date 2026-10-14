// Deep-nesting fixture sweep: the #1282 scaling-proof fixture battery that
// goes PAST the parity range. depth-sweep.test.ts measures every renderable
// chain depth 1..20; this sweep adds the DEEP and WIDE fixture decks the
// scaling promise names - chains at 10/20/50/100/200 nesting levels, wide
// fans at 1/4/16/50/100/200, and whole inclusion TREES (depth x breadth) -
// and records for every shape: the cold response (wall ms, CPU ms, round
// trips, statements, response class), the warm steady state, and the live
// card count of the fixture deck, so the query axis can be read against
// CARD COUNT as well as depth. That is the set-based prefetch promise: the
// render cost tracks the requested page's inclusion TREE SHAPE, and the
// fan/tree rows show round trips holding CONSTANT while the card count
// grows to 1111.
//
// Fixture naming is SHARED with the Ruby harness: every card name here is
// seeded under the identical name by
// benchmarks/run_ruby_deep_nesting_bench.rb (BenchDN prefix, the
// run_ruby_bench.rb name formats), so both engines measure the same decks.
// Ruby-side truth lives in the Ruby deep-nesting results file (not in the public package)
// (live rerun of these fixtures) and the recorded Ruby results file (not in the public package)
// (the parity recording: chains depth+3 queries open / depth+2
// content, fans fanout+4, warm 0 queries everywhere, depth 32 recorded the
// Card::Error::UserError "Man, you're too deep" cap).
//
// Past the render cap (RUBY_MAX_DEPTH = 20, format.ts:323) the response IS
// the too-deep rejection - both engines refuse past the cap; the sweep
// records time-to-rejection and queries-to-rejection as the measured
// response, mirroring how the Ruby recording records its depth-32 row.
//
// Run via enumerated manifest only (never a bare `vitest run`):
//   npx vitest run tests/card/render/deep-nesting-fixture-sweep.test.ts
//
// Reported numbers populate the TS results file (not in the public package)
// (a benchmark result carries a full environment block or it is not
// quotable). A test run writes its copy outside the checkout
// (tests/support/report-output.ts); refresh the committed copy with
// DECKO_TEST_REPORT_DIR set to the repository root.

import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { testReportPath } from "../../support/report-output.js";
import { execSync } from "node:child_process";
import { cpus, totalmem, hostname, platform } from "node:os";
import {
  createRenderTestStorage,
  type RenderTestStorage,
} from "./render-test-storage.js";
import {
  DEEP_REJECTED_CHAIN_DEPTHS,
  DEEP_RENDERABLE_CHAIN_DEPTHS,
  FANOUTS,
  PARITY_CHAIN_DEPTHS,
  PREFIX,
  TREES,
  chainName,
  fanRootName,
  seedChain,
  seedFan,
  seedTree,
  treeRootName,
} from "./deep-nesting-fixtures.js";
import { RUBY_MAX_DEPTH } from "../../../src/card/render/format.js";
import { coldRoundTripLaw } from "./round-trip-law.js";

// ---- measurement ------------------------------------------------------------

interface Measure {
  roundTrips: number;
  statements: number;
  wallMs: number;
  cpuMs: number;
  htmlBytes: number | null;
  renderError: string | null;
  /** First embedded quiet render-error span when the
   *  render RETURNS a page carrying one (this line's quiet nested-error
   *  semantics, error.rb rescue_view quiet branch) — null when the render
   *  throws or returns clean bytes. Lets the past-cap assertion pin the
   *  rejection in THIS engine's response form. */
  quietErrorSpan: string | null;
}

async function measureRender(
  storage: RenderTestStorage,
  root: string,
  view: string,
): Promise<Measure> {
  storage.counting.reset();
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  let html: string | undefined;
  let renderError: string | null = null;
  try {
    html = await storage.engine.render(root, view);
  } catch (err) {
    renderError =
      err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err);
  }
  const quietErrorSpan: string | null =
    html !== undefined ? (html.match(/<span class="render-error alert alert-danger">[^<]*<\/span>/)?.[0] ?? null) : null;
  const t1 = performance.now();
  const cpu = process.cpuUsage(cpu0);
  const snap = storage.counting.snapshot();
  return {
    roundTrips: snap.roundTrips,
    statements: snap.statements,
    wallMs: Number((t1 - t0).toFixed(3)),
    cpuMs: Number(((cpu.user + cpu.system) / 1000).toFixed(3)),
    htmlBytes: html !== undefined ? html.length : null,
    renderError,
    quietErrorSpan,
  };
}

interface FixtureRow {
  shape: "chain" | "fan" | "tree";
  view: string;
  depth?: number;
  fanout?: number;
  treeDims?: string;
  root: string;
  liveCards: number;
  cold: Measure;
  warm: Measure;
}

async function measureShape(
  shape: FixtureRow["shape"],
  seed: (storage: RenderTestStorage) => Promise<void>,
  root: string,
  liveCards: number,
  meta: Pick<FixtureRow, "depth" | "fanout" | "treeDims">,
  view = "open",
): Promise<FixtureRow> {
  const storage = await createRenderTestStorage();
  try {
    await seed(storage);
    const cold = await measureRender(storage, root, view);
    const warm = await measureRender(storage, root, view);
    return { shape, view, root, liveCards, cold, warm, ...meta };
  } finally {
    storage.close();
  }
}

// ---- the sweep --------------------------------------------------------------

describe("Deep-nesting fixture sweep (#1282 scaling proof: TS engine vs fixture deck)", () => {
  it(
    "measures cold/warm response time + query counts on deep chains, wide fans, and whole trees",
    { timeout: 300_000 },
    async () => {
      const rows: FixtureRow[] = [];

      for (const depth of [...PARITY_CHAIN_DEPTHS, ...DEEP_RENDERABLE_CHAIN_DEPTHS]) {
        rows.push(
          await measureShape(
            "chain",
            (s) => seedChain(s, depth),
            chainName(depth, 1),
            depth + 1,
            { depth },
          ),
        );
      }
      for (const depth of DEEP_REJECTED_CHAIN_DEPTHS) {
        rows.push(
          await measureShape(
            "chain",
            (s) => seedChain(s, depth),
            chainName(depth, 1),
            depth + 1,
            { depth },
          ),
        );
      }
      for (const fanout of FANOUTS) {
        rows.push(
          await measureShape("fan", (s) => seedFan(s, fanout), fanRootName(fanout), fanout + 2, {
            fanout,
          }),
        );
      }
      for (const { depth, fanout } of TREES) {
        const cards = 1 + Array.from({ length: depth }, (_, i) => Math.pow(fanout, i + 1)).reduce(
          (a, b) => a + b,
          0,
        );
        rows.push(
          await measureShape(
            "tree",
            (s) => seedTree(s, depth, fanout),
            treeRootName(depth, fanout),
            cards + 1,
            { treeDims: `d${depth}xf${fanout}` },
          ),
        );
      }

      // ---- structural invariants (the scaling claims, asserted) ------------

      const byRoot = new Map(rows.map((r) => [r.root, r]));

      // 1. Renderable open chains: round trips = 3 + (depth - 1) - the fixed
      //    cost is the root fetch + the prelude batch + the wave's one
      //    seating round; each inclusion level costs exactly one batched
      //    round trip, independent of deck size.
      //    The base is 3, not 2: the wave's batched priming (the type-card
      //    prime folded in as the batch preamble, the rule candidates by key,
      //    their depth-2 junctions by side keys and their depth-3 names
      //    through the junction by keys) is one round on every cold render,
      //    tiny fixtures included. Same measured law depth-sweep.test.ts pins
      //    (round-trip-law.ts: base 3, slope exactly 1 per level, warm 0).
      for (const depth of [...PARITY_CHAIN_DEPTHS, ...DEEP_RENDERABLE_CHAIN_DEPTHS]) {
        const row = byRoot.get(chainName(depth, 1))!;
        expect(row.cold.renderError).toBeNull();
        expect(row.cold.roundTrips).toBe(coldRoundTripLaw(depth - 1));
      }

      // 2. Past the cap the response is the too-deep rejection, and its query
      //    cost is BOUNDED and depth-independent. Composition (statement log
      //    + lastRenderStats attribution):
      //    1 root fetch + 1 prelude batch + 25 closure rounds (the prefetch's
      //    MAX_CLOSURE_ROUNDS cap, prefetch.ts:68) + 8 rounds of
      //    applyStructureContent pass #1 (render.ts:460, loop cap
      //    render.ts:1094) + 8 rounds of pass #2 (render.ts:489) + the
      //    wave's one seating round (the same fixed +1 every cold render
      //    pays, see invariant 1) = 44 round trips. On a chain each chase round's batched IN-query
      //    degenerates to one key, so each round is one round trip; the walk
      //    itself renders cached rows only and throws the guard at nest depth
      //    21 (format.ts:859). Depth 50, 100, and 200 all pay exactly this.
      //    Late-seat structure sweep: applyLateSeatStructureContent runs one
      //    more applyStructureContent pass right before the sync dispatch, so
      //    cards seated by the render tail's late paths get their structure
      //    processed (before it, they rendered without it). On a past-cap
      //    chain that pass also runs to its 8-round loop cap, so the bound is
      //    44 + 8 = 52. It stays depth-independent, which is the claim this
      //    invariant protects.
      for (const depth of DEEP_REJECTED_CHAIN_DEPTHS) {
        const row = byRoot.get(chainName(depth, 1))!;
        expect(row.cold.roundTrips).toBe(52);
        expect(depth).toBeGreaterThan(RUBY_MAX_DEPTH);
        // Response-form note: an earlier lineage propagated the too-deep
        // rejection out of render() as a thrown Error("nest depth exceeded
        // ..."). This line carries the quiet nested-error semantics
        // (error.rb rescue_view quiet branch: format.ts nest() catches the
        // depth guard's throw and embeds quietRenderError's span), so the
        // rejection arrives INSIDE the returned page. Both response forms
        // are accepted; the embedded form is pinned HARDER than the old
        // message match — the span must name the exact cap position (the
        // RUBY_MAX_DEPTH+1 card) with the "(core view)" label.
        // Ruby's rejection is monitor_depth's UserError (format/error.rb:
        // 33-40, format_too_deep): the subformat at max_depth raises out of
        // its own render and the core of the RUBY_MAX_DEPTH-th card rescues
        // it, so the span carries the locale line verbatim.
        if (row.cold.renderError !== null) {
          // main-lineage form: the rejection propagated out of render()
          expect(row.cold.renderError).toMatch(/too deep/);
        } else {
          expect(row.cold.quietErrorSpan).toBe(
            `<span class="render-error alert alert-danger">Man, you're too deep.  (Too many levels of nests at a time)</span>`,
          );
        }
      }

      // 3. Wide fans: round trips are CONSTANT across fanouts 1..200 (the
      //    whole level is one IN-list batch), while the fixture deck grows
      //    from 3 to 202 live cards.
      const fanRows = FANOUTS.map((f) => byRoot.get(fanRootName(f))!);
      const fanRt = fanRows[0]!.cold.roundTrips;
      expect(fanRt).toBe(coldRoundTripLaw(1)); // the fan is one level below its root
      for (const row of fanRows) {
        expect(row.cold.renderError).toBeNull();
        expect(row.cold.roundTrips).toBe(fanRt);
      }
      expect(fanRows[0]!.liveCards).toBe(3);
      expect(fanRows[fanRows.length - 1]!.liveCards).toBe(202);
      expect(fanRows[fanRows.length - 1]!.cold.htmlBytes!).toBeGreaterThan(
        fanRows[0]!.cold.htmlBytes!,
      );

      // 4. Whole trees: round trips = 3 + tree DEPTH - the closure costs one
      //    round per LEVEL (not per card) + the one fixed wave seating round
      //    (same fixed cost as invariant 1): d4xf4 serves 342 cards in 7
      //    round trips; d3xf10 serves 1112 cards in 6.
      const treeRows = TREES.map(({ depth, fanout }) => byRoot.get(treeRootName(depth, fanout))!);
      for (const row of treeRows) {
        expect(row.cold.renderError).toBeNull();
        const depthLevels = Number(row.treeDims!.match(/^d(\d+)/)![1]);
        expect(row.cold.roundTrips).toBe(coldRoundTripLaw(depthLevels));
      }
      expect(treeRows[1]!.liveCards).toBe(1112);

      // 5. Warm steady state: zero queries on every renderable shape.
      //    Response-form note: when the past-cap rejection arrives as the
      //    embedded quiet span (renderError null), the exclusion must key on
      //    the rejection itself, not on the throw. The warm re-pay on the
      //    unclosed past-cap chains stays covered by a bounded assertion
      //    (the cold bound) instead of being skipped silently.
      //    The renderable-shape warm bound is exactly 1 statement / 1 round
      //    trip: the deck_data_version freshness gate (render.ts
      //    DECK_DATA_VERSION_STATEMENT) runs one PK point SELECT at every
      //    render entry — the schema header's own words: the warm-render
      //    cost is "ONE statement, not zero". The gate is the documented
      //    design, so anything more would be a real cache regression, which
      //    is what this pin exists to catch.
      for (const row of rows) {
        const isTooDeepRejection =
          row.cold.renderError !== null || row.cold.quietErrorSpan !== null;
        if (!isTooDeepRejection) {
          expect(row.warm.roundTrips).toBe(1);
          expect(row.warm.statements).toBe(1);
        } else {
          // The cold bound (invariant 2): since the late-seat structure sweep
          // the warm re-render of an unclosed past-cap chain repays up to
          // 51 of its 53 round trips.
          expect(row.warm.roundTrips).toBeLessThanOrEqual(53);
        }
      }

      // ---- results artifact (a benchmark result carries a full environment
      //      block or the numbers are not quotable) ------------------------

      let engineCommit = "unknown";
      let engineBranch = "unknown";
      try {
        engineCommit = execSync("git rev-parse --short HEAD", { windowsHide: true }).toString().trim();
        engineBranch = execSync("git rev-parse --abbrev-ref HEAD", { windowsHide: true }).toString().trim();
      } catch {
        // metadata only - never fail the measurement for it
      }

      const outPath = testReportPath("benchmarks/results/deep-nesting-fixtures-ts.json");
      writeFileSync(
        outPath,
        JSON.stringify(
          {
            benchmark: "deep-nesting-fixtures-ts",
            commitments: ["R1", "R2", "R4"],
            measured_at: new Date().toISOString(),
            engine: "decko-ts",
            engine_commit: engineCommit,
            engine_branch: engineBranch,
            environment: {
              host: hostname(),
              os: platform(),
              osVersion: platform() === "win32" ? execSync("cmd /c ver", { windowsHide: true }).toString().trim() : null,
              node: process.version,
              cpuModel: cpus()[0]?.model ?? null,
              cpuCount: cpus().length,
              ramBytes: totalmem(),
              dbEngine: "better-sqlite3 :memory: over production-schema DDL (db/schema.sqlite.sql)",
              dbPath: ":memory:",
              dbSizeBytes: null,
              dbSizeNote: "in-memory; live card counts are recorded per fixture row",
              driverAxes:
                "round trips = driver calls (query() + batch() each ONE; on the edge drivers batch() is one HTTP request); statements = individual SQL statements (batch members count one each)",
            },
            axes: {
              cold: "fresh engine instance per shape; first render",
              warm: "second render of the same shape in the same engine instance",
              renderError:
                "the too-deep rejection IS the response past the render cap (RUBY_MAX_DEPTH=20); time-to-rejection and queries-to-rejection are the measured response",
            },
            fixture_naming: {
              prefix: PREFIX,
              shared_with: "benchmarks/run_ruby_deep_nesting_bench.rb",
              note: "both engines seed identically-named BenchDN fixtures",
            },
            ruby_measured_truth: {
              source_parity_recording: "benchmarks/results/ruby-nesting-r1-r2.json",
              source_deep_rerun: "benchmarks/results/deep-nesting-fixtures-ruby.json",
            },
            rows,
          },
          null,
          2,
        ) + "\n",
      );

      // eslint-disable-next-line no-console
      console.log(`\ndeep-nesting fixture sweep (TS) - wrote ${outPath}\n`);
      // eslint-disable-next-line no-console
      console.log("shape          | cards | cold RT | cold SQL | cold ms | cpu ms | warm ms | response");
      // eslint-disable-next-line no-console
      console.log("---------------+-------+---------+----------+---------+--------+---------+---------");
      for (const r of rows) {
        const label =
          r.shape === "chain"
            ? `chain d${String(r.depth).padEnd(3)}`
            : r.shape === "fan"
              ? `fan f${String(r.fanout).padEnd(4)}`
              : `tree ${r.treeDims!.padEnd(6)}`;
        // eslint-disable-next-line no-console
        console.log(
          `${label.padEnd(14)} | ${String(r.liveCards).padEnd(5)} | ${String(r.cold.roundTrips).padEnd(7)} | ${String(r.cold.statements).padEnd(8)} | ${String(r.cold.wallMs).padEnd(7)} | ${String(r.cold.cpuMs).padEnd(6)} | ${String(r.warm.wallMs).padEnd(7)} | ${(r.cold.renderError ?? `${r.cold.htmlBytes}B`).slice(0, 40)}`,
        );
      }
    },
  );
});
