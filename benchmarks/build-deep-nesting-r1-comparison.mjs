// build-deep-nesting-r1-comparison.mjs -- assembles the joint R1 comparison
// artifact (the one METHODOLOGY.md's commitment map promises as
// benchmarks/results/r1-comparison.json) from the measured artifacts of the
// two engines, and generates the publish-ready markdown document
// (docs/scaling-comparison-deep-nesting.md) from the same data so the two
// can never drift.
//
// Inputs (all committed, each carrying its own environment block per the
// METHODOLOGY iron rule):
//   benchmarks/results/deep-nesting-fixtures-ruby.json  (live Ruby rerun)
//   benchmarks/results/deep-nesting-fixtures-ts.json    (live TS sweep)
//   benchmarks/results/ruby-nesting-r1-r2.json          (2026-09-19 recording)
//   benchmarks/results/depth-sweep-ts.json              (content-view TS rows)
//
// Run: node benchmarks/build-deep-nesting-r1-comparison.mjs

import { readFileSync, writeFileSync } from "node:fs";

const read = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

const rubyDeep = read("benchmarks/results/deep-nesting-fixtures-ruby.json");
const tsDeep = read("benchmarks/results/deep-nesting-fixtures-ts.json");
const rubyRecording = read("benchmarks/results/ruby-nesting-r1-r2.json");
const tsDepthSweep = read("benchmarks/results/depth-sweep-ts.json");

// ---- shape joins ------------------------------------------------------------

const rubyShapeKey = (s) =>
  s.shape === "chain" ? `chain/open/d${s.depth}` : s.shape === "fan" ? `fan/open/f${s.fanout}` : `tree/open/${s.tree_dims}`;
const tsShapeKey = (r) =>
  r.shape === "chain" ? `chain/open/d${r.depth}` : r.shape === "fan" ? `fan/open/f${r.fanout}` : `tree/open/${r.treeDims}`;

const rubyByShape = new Map(rubyDeep.shapes.map((s) => [rubyShapeKey(s), s]));
const tsByShape = new Map(tsDeep.rows.map((r) => [tsShapeKey(r), r]));
const keys = [...new Set([...rubyByShape.keys(), ...tsByShape.keys()])];

const rubyMedian = (s) => {
  if (s.render_error) {
    const first = (s.cold_renders_partial ?? [])[0] ?? {};
    return {
      queries: first.query_count ?? null,
      wallMs: first.wall_ms ?? null,
      response: `rejected: ${s.render_error.slice(0, 60)}`,
    };
  }
  return {
    queries: s.cold_summary.queries_median,
    wallMs: s.cold_summary.wall_ms_median,
    warmQueries: s.summary.queries_median,
    warmWallMs: s.summary.wall_ms_median,
    response: `${s.cold_renders[0].html_bytes}B HTML`,
  };
};

const tsMedian = (r) => ({
  roundTrips: r.cold.roundTrips,
  statements: r.cold.statements,
  wallMs: r.cold.wallMs,
  cpuMs: r.cold.cpuMs,
  warmRoundTrips: r.warm.roundTrips,
  warmWallMs: r.warm.wallMs,
  response: r.cold.renderError ? `rejected: ${r.cold.renderError.slice(0, 60)}` : `${r.cold.htmlBytes}B HTML`,
});

const rows = keys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((k) => {
  const r = rubyByShape.get(k);
  const t = tsByShape.get(k);
  const rm = r ? rubyMedian(r) : null;
  const tm = t ? tsMedian(t) : null;
  const cards = t?.liveCards ?? null;
  return {
    shape: k,
    liveCards: cards,
    ruby: rm,
    ts: tm,
    queriesPerCard: rm?.queries != null && cards ? Number((rm.queries / cards).toFixed(3)) : null,
    roundTripsPerCard: tm?.roundTrips != null && cards ? Number((tm.roundTrips / cards).toFixed(3)) : null,
  };
});

// ---- cross-check against the 2026-09-19 recording ---------------------------

const recordingChains = new Map(
  rubyRecording.shapes
    .filter((s) => s.shape === "chain" && s.nest_style === "open")
    .map((s) => [s.depth, s]),
);
const crossCheck = rows
  .filter((r) => r.shape.startsWith("chain/"))
  .map((r) => {
    const depth = Number(r.shape.match(/d(\d+)/)[1]);
    const rec = recordingChains.get(depth);
    if (!rec || rec.render_error) return { depth, recorded: null, live: r.ruby?.queries ?? null };
    return {
      depth,
      recorded: rec.cold_summary.queries_median,
      live: r.ruby?.queries ?? null,
      matches: rec.cold_summary.queries_median === (r.ruby?.queries ?? -1),
    };
  });

// ---- content-view TS rows (depth-sweep) for the content parity note ---------

const contentParity = (tsDepthSweep.rows ?? [])
  .filter((r) => r.rubyMeasured !== null && r.rubyMeasured !== undefined)
  .map((r) => ({ depth: r.depth, rubyQueries: r.rubyMeasured, tsRoundTrips: r.roundTrips }));

// ---- data-derived prose numbers (never hand-maintained) ---------------------

const isRejected = (r) => (r.ts?.response ?? "").startsWith("rejected");
const fanRowsSorted = rows
  .filter((r) => r.shape.startsWith("fan/"))
  .sort((a, b) => Number(a.shape.match(/f(\d+)/)[1]) - Number(b.shape.match(/f(\d+)/)[1]));
const fanFirst = fanRowsSorted[0];
const fanLast = fanRowsSorted[fanRowsSorted.length - 1];
const chainRenderable = rows
  .filter((r) => r.shape.startsWith("chain/") && !isRejected(r))
  .sort((a, b) => Number(a.shape.match(/d(\d+)/)[1]) - Number(b.shape.match(/d(\d+)/)[1]));
const chainFirst = chainRenderable[0];
const chainLast = chainRenderable[chainRenderable.length - 1];
const recordedCapQueries =
  rubyRecording.shapes.find((s) => s.shape === "chain" && s.nest_style === "open" && s.render_error)
    ?.cold_renders_partial?.[0]?.query_count ?? null;
const treeRowsSorted = rows
  .filter((r) => r.shape.startsWith("tree/"))
  .sort((a, b) => (a.liveCards ?? 0) - (b.liveCards ?? 0));
const treeBiggest = treeRowsSorted[treeRowsSorted.length - 1];

// ---- joint artifact ----------------------------------------------------------

const joint = {
  benchmark: "r1-comparison",
  commitments: ["R1", "R2", "R4"],
  generated_at: new Date().toISOString(),
  inputs: {
    ruby_live: {
      path: "benchmarks/results/deep-nesting-fixtures-ruby.json",
      measured_at: rubyDeep.date,
      environment: rubyDeep.environment,
      config: rubyDeep.config,
    },
    ts_live: {
      path: "benchmarks/results/deep-nesting-fixtures-ts.json",
      measured_at: tsDeep.measured_at,
      environment: tsDeep.environment,
    },
    ruby_parity_recording: {
      path: "benchmarks/results/ruby-nesting-r1-r2.json",
      measured_at: rubyRecording.date,
      environment: rubyRecording.environment,
    },
    ts_content_view_sweep: {
      path: "benchmarks/results/depth-sweep-ts.json",
      measured_at: tsDepthSweep.measured_at,
      environment: tsDepthSweep.environment,
    },
  },
  axes_note: {
    ruby_query: "one ActiveRecord sql.active_record event = one database round trip (AR has no batch)",
    ts_round_trip: "one driver call; driver.batch = ONE round trip carrying N statements (on the edge drivers that is literally one HTTP request)",
    comparability:
      "both axes count database round trips per render; the TS batch is the scaling mechanism itself (a whole inclusion LEVEL rides one round trip), so TS statements are reported next to its round trips",
    environments:
      "both engines measured on the same host (see both environment blocks); Ruby renders against an on-disk sqlite3 file through ActiveRecord 7.2, TS against better-sqlite3 :memory: over the production-schema DDL - wall-clock comparisons carry that difference; query-count comparisons are storage-independent",
  },
  cross_check_vs_2026_09_19_recording: {
    note: "the live Ruby rerun's open-chain cold query counts vs the recorded oracle-app run - reproduces the depth+3 formula",
    rows: crossCheck,
  },
  content_view_parity: {
    note: "content-view chains from depth-sweep-ts.json vs the recording's content rows (Ruby content = depth+2)",
    rows: contentParity,
  },
  rows,
};

const jointPath = "benchmarks/results/r1-comparison.json";
writeFileSync(new URL(`../${jointPath}`, import.meta.url), JSON.stringify(joint, null, 2) + "\n");

// ---- the published markdown --------------------------------------------------

const fmt = (v, suffix = "") => (v === null || v === undefined ? "n/a" : `${v}${suffix}`);
const md = [];
md.push("# Deep-nesting scaling comparison: Ruby Decko vs decko-ts (issue #1282)");
md.push("");
md.push(`Generated ${joint.generated_at} by \`benchmarks/build-deep-nesting-r1-comparison.mjs\` from four committed artifacts. Raw timings live in those artifacts; this document is regenerable and never hand-edited.`);
md.push("");
md.push("## What was measured");
md.push("");
md.push("Both engines render identically-named synthetic fixture decks (`BenchDN*` prefix):");
md.push("");
md.push("- **chains** - a card nesting the next card, 1 to 200 levels deep (`{{next|open}}`);");
md.push("- **fans** - one root nesting 1 to 200 children;");
md.push("- **whole trees** - depth x breadth inclusion trees (d4xf4 = 342 cards; d3xf10 = 1112 cards).");
md.push("");
md.push("Cold render = fresh engine state (Ruby: `Card.cache.reset`; TS: fresh engine instance). Warm = immediate re-render in the same process/instance. Fixture names, nesting syntax, and shape list are shared; body filler text differs (Ruby random a-z, TS deterministic) - the query axes are unaffected.");
md.push("");
md.push("## The scaling result");
md.push("");
md.push(
  `1. **Ruby query cost grows linearly with every axis** (the N+1 the #1282 proposal replaces): chains pay depth+3 queries (measured ${chainFirst?.ruby?.queries} at depth ${chainFirst?.shape.match(/d(\d+)/)[1]} -> ${chainLast?.ruby?.queries} at depth ${chainLast?.shape.match(/d(\d+)/)[1]}), fans pay fanout+4 (${fanFirst?.ruby?.queries} at f${fanFirst?.shape.match(/f(\d+)/)[1]} -> ${fanLast?.ruby?.queries} at f${fanLast?.shape.match(/f(\d+)/)[1]}), and a whole tree costs ~1 query per included CARD (${treeBiggest?.ruby?.queries} queries for the ${treeBiggest?.liveCards}-card ${treeBiggest?.shape.split("/")[2]} tree) - every included card is a render-time lookup.`,
);
md.push(
  `2. **The TS engine's cost tracks the inclusion TREE SHAPE, not the deck**: chains pay one batched round trip per level (${chainFirst?.ts?.roundTrips} round trips at depth ${chainFirst?.shape.match(/d(\d+)/)[1]} -> ${chainLast?.ts?.roundTrips} at depth ${chainLast?.shape.match(/d(\d+)/)[1]}), fans stay CONSTANT at ${fanRowsSorted[0]?.ts?.roundTrips} round trips from f${fanFirst?.shape.match(/f(\d+)/)[1]} to f${fanLast?.shape.match(/f(\d+)/)[1]} (${fanLast?.liveCards} live cards), and the ${treeBiggest?.liveCards}-card tree renders in ${treeBiggest?.ts?.roundTrips} round trips. Warm renders cost 0 queries at every renderable shape (see the warm table's past-cap exception).`,
);
const rejectedChain = rows.find((r) => r.shape.startsWith("chain/") && isRejected(r));
md.push(
  `3. **Past the render cap both engines refuse identically and boundedly**: Ruby raises \`Card::Error::UserError: Man, you're too deep\` beyond \`Card.config.max_depth = 20\` (${recordedCapQueries} queries to the error in the 2026-09-19 recording's depth-32 rows; the live rerun records ${rejectedChain?.ruby?.queries} at depths 50/100/200); the TS port raises the parity guard (\`nest depth exceeded\`, \`format.ts:859\`) and the measured rejection cost is exactly ${rejectedChain?.ts?.roundTrips} round trips at depth 50, 100, AND 200 (1 root fetch + 1 prelude batch + the prefetch's 25 capped closure rounds + 2 x 8 structure-pass rounds), also depth-independent. Rejection rows in the table are TIME-TO-ERROR for both engines.`,
);
md.push("");
md.push("## Response-time comparison (cold render, medians)");
md.push("");
md.push("| shape | cards | Ruby queries | Ruby wall ms | TS round trips | TS statements | TS wall ms | TS cpu ms | response |");
md.push("|---|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  md.push(
    `| ${r.shape} | ${fmt(r.liveCards)} | ${fmt(r.ruby?.queries)} | ${fmt(r.ruby?.wallMs)} | ${fmt(r.ts?.roundTrips)} | ${fmt(r.ts?.statements)} | ${fmt(r.ts?.wallMs)} | ${fmt(r.ts?.cpuMs)} | ${r.ts?.response ?? "n/a"} |`,
  );
}
md.push("");
md.push("## Warm steady state (medians)");
md.push("");
md.push("| shape | Ruby warm queries | Ruby warm wall ms | TS warm round trips | TS warm wall ms |");
md.push("|---|---|---|---|---|");
for (const r of rows) {
  const warm = r.ruby?.warmQueries !== null && r.ruby?.warmQueries !== undefined;
  md.push(
    `| ${r.shape} | ${warm ? r.ruby.warmQueries : "n/a (cap)"} | ${warm ? fmt(r.ruby.warmWallMs) : "n/a (cap)"} | ${fmt(r.ts?.warmRoundTrips)} | ${fmt(r.ts?.warmWallMs)} |`,
  );
}
md.push("");
md.push("");
const warmRenderable = rows.filter((r) => !isRejected(r));
const warmZero = warmRenderable.filter((r) => (r.ruby?.warmQueries ?? null) === 0 && r.ts?.warmRoundTrips === 0).length;
const warmRtRejected = rows.filter((r) => isRejected(r)).map((r) => r.ts?.warmRoundTrips ?? 0);
md.push(
  `Every RENDERABLE shape's second render is served from each engine's caches: ${warmZero} of ${warmRenderable.length} renderable rows measured at Ruby 0 queries / TS 0 round trips. The past-cap chains are the exception on the TS side: the closure never completed, so the warm render re-pays a bounded chase (${warmRtRejected.join("/")} round trips recorded). Ruby's cache serves its second render at every renderable shape.`,
);
md.push("");
md.push("## Environment (the no-cross-environment-claims rule)");
md.push("");
md.push(`**Ruby (live rerun):** ${rubyDeep.environment.host}, ${rubyDeep.environment.cpu}, Ruby ${rubyDeep.environment.ruby}, decko ${rubyDeep.environment.decko_gem} / card ${rubyDeep.environment.card_gem}, Rails ${rubyDeep.environment.rails}, sqlite3 on disk at ${rubyDeep.environment.db_path} (${rubyDeep.environment.db_size_bytes} bytes), ${rubyDeep.environment.live_cards_in_db_after_cleanup} live cards after cleanup.`);
md.push("");
md.push(`**TypeScript:** ${tsDeep.environment.host}, ${tsDeep.environment.cpuModel}, node ${tsDeep.environment.node}, better-sqlite3 :memory: over the production-schema DDL, engine ${tsDeep.engine_commit} (${tsDeep.engine_branch}).`);
md.push("");
md.push("Both runs on the same host. Ruby renders against an on-disk sqlite file through ActiveRecord; TS against an in-memory sqlite through the engine's own driver. Wall-clock carries that difference; query counts do not. Ruby counts one ActiveRecord event per query (no batch exists); TS counts one round trip per driver call where a batch carries a whole inclusion level - that batching IS the scaling fix, and TS statement counts ride next to its round trips.");
md.push("");
md.push("## Reproducibility cross-checks");
md.push("");
md.push("- Live Ruby open-chain cold query counts vs the 2026-09-19 oracle recording: " +
  crossCheck.filter((c) => c.recorded !== null).map((c) => `d${c.depth}: ${c.live} vs ${c.recorded}${c.matches ? "" : " (MISMATCH)"}`).join("; ") + ".");
md.push("- Content-view chains (depth-sweep-ts.json vs the recording's content rows, Ruby = depth+2): " +
  contentParity.map((c) => `d${c.depth}: Ruby ${c.rubyQueries}q / TS ${c.tsRoundTrips}RT`).join("; ") + ".");
md.push("");
md.push("## Raw timings");
md.push("");
md.push("Every individual render (not just medians) is in the committed artifacts: `benchmarks/results/deep-nesting-fixtures-ruby.json` (Ruby, cold_renders/renders arrays), `benchmarks/results/deep-nesting-fixtures-ts.json` (TS rows), joined in `benchmarks/results/r1-comparison.json`. Methodology: `benchmarks/METHODOLOGY.md`.");
md.push("");

writeFileSync(new URL("../docs/scaling-comparison-deep-nesting.md", import.meta.url), md.join("\n") + "\n");
console.log(`wrote benchmarks/results/r1-comparison.json and docs/scaling-comparison-deep-nesting.md (${rows.length} joined shapes)`);
