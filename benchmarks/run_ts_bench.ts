// run_ts_bench.ts -- R1/R2/R4 harness scaffold for the TS engine
// (decko-commons/decko#1282 benchmark program, TypeScript side).
//
// Registers the SAME shape battery as benchmarks/run_ruby_bench.rb
// (inclusion chains at depths 1/2/4/8/16/32 in |open and |content nest
// styles, fans at fan-outs 1/4/16, warm + cold measurement modes) and calls
// the render engine through a handler registry in the style of
// src/testing/replay.ts. The render engine does not exist yet, so every
// entry reports PENDING -- a missing stream is a status, never a failure,
// and no number is ever fabricated. Wave 3 plugs the engine in by
// registering a "render-engine" handler; nothing else changes.
//
// Reconciliation note: this file mirrors the replay harness's
// HandlerOutcome / HandlerRegistry conventions but deliberately does not
// import src/testing (benchmarks must not depend on harness internals).
// If src/testing's registry style has drifted by wave 3, adapt here, not
// there -- or map the two registries in a thin adapter.
//
// Run: npx tsx benchmarks/run_ts_bench.ts   (emits a PENDING results JSON)

import { writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { cpus, totalmem, hostname, platform, version as nodeVersion } from "node:os";
import path from "node:path";
import process from "node:process";

// ---- shape battery (mirrors run_ruby_bench.rb) -----------------------------

export interface ShapeSpec {
  kind: "chain" | "fan";
  nestStyle: "open" | "content";
  depth?: number;
  fanout?: number;
  root: string;
  view: "open" | "content";
  mode: "warm" | "cold";
  renderN: number;
  warmup: number;
}

const DEPTHS = [1, 2, 4, 8, 16, 32] as const;
const FANOUTS = [1, 4, 16] as const;
const RENDER_N = Number(process.env.BENCH_RENDER_N ?? 15);
const WARMUP = Number(process.env.BENCH_WARMUP ?? 3);

export function shapeBattery(): ShapeSpec[] {
  const shapes: ShapeSpec[] = [];
  for (const d of DEPTHS) {
    for (const style of ["open", "content"] as const) {
      shapes.push({
        kind: "chain", nestStyle: style, depth: d,
        root: `BenchR1_chain_${style}_d${String(d).padStart(2, "0")}_n01`,
        view: style, mode: "warm", renderN: RENDER_N, warmup: WARMUP,
      });
      shapes.push({
        kind: "chain", nestStyle: style, depth: d,
        root: `BenchR1_chain_${style}_d${String(d).padStart(2, "0")}_n01`,
        view: style, mode: "cold", renderN: RENDER_N, warmup: WARMUP,
      });
    }
  }
  for (const f of FANOUTS) {
    shapes.push({
      kind: "fan", nestStyle: "open", fanout: f,
      root: `BenchR1_fan_f${String(f).padStart(2, "0")}_root`,
      view: "open", mode: "warm", renderN: RENDER_N, warmup: WARMUP,
    });
    shapes.push({
      kind: "fan", nestStyle: "open", fanout: f,
      root: `BenchR1_fan_f${String(f).padStart(2, "0")}_root`,
      view: "open", mode: "cold", renderN: RENDER_N, warmup: WARMUP,
    });
  }
  return shapes;
}

// ---- handler registry (mirrors src/testing/replay.ts conventions) ----------

export interface RenderMetrics {
  /** SQL statements issued for this render (the R1 metric). */
  queryCount: number;
  /** Wall-clock milliseconds (the R2 metric). */
  wallMs: number;
  /** Process CPU milliseconds over the render window (the R4 metric). */
  cpuMs: number;
  htmlBytes: number;
}

export type RenderOutcome =
  | { status: "ok"; metrics: RenderMetrics }
  | { status: "error"; errorClass: string; message: string };

export type RenderEngineHandler = (
  input: { root: string; view: string; mode: "warm" | "cold" },
) => RenderOutcome;

export interface HandlerRegistry {
  has(area: string): boolean;
  get(area: string): RenderEngineHandler | undefined;
}

export function emptyRegistry(): HandlerRegistry {
  return { has: () => false, get: () => undefined };
}

// ---- run -------------------------------------------------------------------

export interface ShapeResult {
  shape: ShapeSpec;
  outcome:
    | { status: "pending"; pendingReason: string }
    | { status: "measured"; renders: RenderOutcome[] };
}

export function runShape(shape: ShapeSpec, registry: HandlerRegistry): ShapeResult {
  if (!registry.has("render-engine")) {
    return {
      shape,
      outcome: {
        status: "pending",
        pendingReason:
          "render engine not landed (wave 3): register a render-engine handler",
      },
    };
  }
  const handler = registry.get("render-engine")!;
  const renders: RenderOutcome[] = [];
  for (let i = 0; i < shape.warmup; i += 1) {
    handler({ root: shape.root, view: shape.view, mode: shape.mode });
  }
  for (let i = 0; i < shape.renderN; i += 1) {
    renders.push(handler({ root: shape.root, view: shape.view, mode: shape.mode }));
  }
  return { shape, outcome: { status: "measured", renders } };
}

// ---- environment metadata (the no-cross-environment-claims rule) -----------

function environment() {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const corpusPath = path.join(repoRoot, "benchmarks", "corpus", "bench-corpus.sqlite3");
  return {
    host: hostname(),
    os: platform(),
    osVersion: process.version,
    node: nodeVersion,
    cpuModel: cpus()[0]?.model ?? null,
    cpuCount: cpus().length,
    ramBytes: totalmem(),
    corpusPath,
    corpusSizeBytes: existsSync(corpusPath) ? statSync(corpusPath).size : null,
    // wave 3 must add: db engine under test, db path + on-disk size,
    // live card count of the db under test
  };
}

export function main(): string {
  const registry = emptyRegistry();
  const shapes = shapeBattery();
  const results = shapes.map((s) => runShape(s, registry));
  const pending = results.filter((r) => r.outcome.status === "pending").length;
  const payload = {
    benchmark: "ts-nesting-r1-r2",
    commitments: ["R1", "R2", "R4"],
    date: new Date().toISOString(),
    engine: "ts-decko-ts",
    status: pending === results.length ? "PENDING" : "PARTIAL",
    environment: environment(),
    config: {
      renderN: RENDER_N,
      warmup: WARMUP,
      prefix: "BenchR1",
      nestSyntax: "{{name|open}} / {{name|content}}",
      note:
        "identical shape battery to results/ruby-nesting-r1-r2.json; " +
        "cross-environment comparison requires both artifacts' environment blocks",
    },
    shapes: results,
  };
  const outDir = path.join(import.meta.dirname, "results");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "ts-nesting-r1-r2.json");
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`shapes=${results.length} pending=${pending} wrote ${outPath}`);
  return outPath;
}

// invoked as a script, not when imported by wave-3 tooling
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main();
}
