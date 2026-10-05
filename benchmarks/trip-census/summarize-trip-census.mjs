// Trip census summarizer (dbroundtrip-mainline lane, 2026-10-05): reads the
// census JSONL written by trip-census-cold-render.test.ts and produces the
// lane deliverables:
//   (1) trips + statements per page per posture, classified by family and
//       attributed to the issuing module (caller-site sample)
//   (2) batchability verdict per family
//   (3) the theoretical round-trip floor per page
//   (4) the 80/20 (top families by statement count)
// RUN: node benchmarks/trip-census/summarize-trip-census.mjs [jsonlPath]
// Writes trip-census-report.json next to the JSONL. Measurement only.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const jsonlPath =
  process.argv[2] ??
  fileURLToPath(new URL("census/trip-census.jsonl", import.meta.url));

const lines = readFileSync(jsonlPath, "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

/** Batchability verdict per family. Grounded in the render-plan residue
 *  registry's own class justifications (src/card/one-trip/render-plan.ts)
 *  plus the V3-corrected cost mechanism (per-STATEMENT server cost persists
 *  inside one pipeline POST — cold-latency-rig-lane.md INLINE-FETCH-V3):
 *  "pipeline" verdicts move POSTs, not per-statement server cost; only
 *  statement elimination (seating rows/negatives at build time) removes
 *  server cost on the cross-region DB class. */
const VERDICTS = {
  "engine-boot-codenames": "boot-cacheable",
  "engine-fold-type-names": "boot-cacheable",
  "engine-fold-head-reads": "boot-cacheable",
  "engine-boot-dangling-canonical": "boot-cacheable",
  "lexicon-id-to-name": "pipeline-pure-key-value",
  "lexicon-key-to-id": "pipeline-pure-key-value",
  "point-row-by-key": "pipeline-pure-key-value",
  "point-row-by-id": "pipeline-pure-key-value",
  "point-row-by-name": "pipeline-pure-key-value",
  "pair-exists-probe": "pipeline-pure-key-value",
  "template-link-id-read": "pipeline-pure-key-value",
  "search-result-chunked-read": "pipeline-pure-key-value",
  "closure-prefetch-batch": "pipeline-already-batched-rounds",
  "reached-rules-cte": "pipeline-transport-only-statement-irreducible",
  "search-cql": "order-dependent-sequential",
  "search-count": "order-dependent-sequential",
  "one-trip-seat": "the-seat-itself",
  "attach-setup": "path-posture-connection-setup",
  unclassified: "UNCLASSIFIED-REGISTRY-GAP",
};

const BOOT_FAMILIES = new Set([
  "engine-boot-codenames",
  "engine-fold-type-names",
  "engine-fold-head-reads",
  "engine-boot-dangling-canonical",
]);
const PIPELINE_FAMILIES = new Set([
  "lexicon-id-to-name",
  "lexicon-key-to-id",
  "point-row-by-key",
  "point-row-by-id",
  "point-row-by-name",
  "pair-exists-probe",
  "template-link-id-read",
  "search-result-chunked-read",
  "closure-prefetch-batch",
  "reached-rules-cte",
]);
const ORDER_DEPENDENT_FAMILIES = new Set(["search-cql", "search-count"]);

function moduleOf(caller) {
  const m = caller.match(/(src[\\/](?:[^\s():]+\.ts))/);
  if (m === null) return "(unknown)";
  return m[1].replaceAll("\\", "/");
}

const pages = [...new Set(lines.map((l) => l.page))].sort();
const postures = [...new Set(lines.map((l) => l.posture))];

const report = { generatedAt: new Date().toISOString(), jsonlPath, postures, pages, perPage: {}, families: {}, floor: {}, topFamilies: {} };

for (const posture of postures) {
  report.perPage[posture] = {};
  report.families[posture] = {};
  report.floor[posture] = {};
  for (const page of pages) {
    const stmts = lines.filter((l) => l.posture === posture && l.page === page);
    const trips = new Set(stmts.map((l) => l.tripNo)).size;

    const famStmts = {};
    const famTrips = new Map(); // family -> Set of tripNos where it is the ONLY family... no: trips CONTAINING the family
    const famSoleTrips = new Map(); // family -> trips whose statements are ALL that family
    const famModules = {};
    for (const s of stmts) {
      famStmts[s.family] = (famStmts[s.family] ?? 0) + 1;
      (famTrips.get(s.family) ?? famTrips.set(s.family, new Set()).get(s.family)).add(s.tripNo);
      (famModules[s.family] ??= {});
      const mod = moduleOf(s.caller);
      famModules[s.family][mod] = (famModules[s.family][mod] ?? 0) + 1;
    }
    const tripFamilies = new Map();
    for (const s of stmts) {
      (tripFamilies.get(s.tripNo) ?? tripFamilies.set(s.tripNo, new Set()).get(s.tripNo)).add(s.family);
    }
    for (const [tripNo, fams] of tripFamilies) {
      if (fams.size === 1) {
        const fam = [...fams][0];
        (famSoleTrips.get(fam) ?? famSoleTrips.set(fam, new Set()).get(fam)).add(tripNo);
      }
    }
    const familyRows = {};
    for (const [fam, count] of Object.entries(famStmts)) {
      const modules = Object.entries(famModules[fam]).sort((a, b) => b[1] - a[1]);
      familyRows[fam] = {
        statements: count,
        tripsContaining: famTrips.get(fam)?.size ?? 0,
        soleTrips: famSoleTrips.get(fam)?.size ?? 0,
        verdict: VERDICTS[fam] ?? "UNCLASSIFIED-REGISTRY-GAP",
        topModules: modules.slice(0, 3).map(([mod, n]) => `${mod} (${n})`),
      };
    }
    report.perPage[posture][page] = {
      trips,
      statements: stmts.length,
      bootStatements: stmts.filter((s) => BOOT_FAMILIES.has(s.family)).length,
      renderPhaseStatements: stmts.filter((s) => s.phase === "render").length,
      families: familyRows,
    };

    // global family aggregate for the 80/20
    for (const [fam, count] of Object.entries(famStmts)) {
      report.families[posture][fam] ??= { statements: 0, verdict: VERDICTS[fam] ?? "?" };
      report.families[posture][fam].statements += count;
    }
  }

  // THE FLOOR (per page): arithmetic from THIS census, stated in both
  // currencies the eight wire generations established:
  //   trips (pipeline POSTs): 1 boot batch + 2 seat (head + slice batch)
  //     + 1 replay batch (every pipeline-able render statement, the
  //     record-and-replay plan replayRenderPlan already implements)
  //     + the order-dependent trips (search execution cannot be pre-batched)
  //   statements (the per-statement server cost the V3 stop trace proved
  //     persists INSIDE a batch): only statement ELIMINATION removes these.
  for (const page of pages) {
    const stmts = lines.filter((l) => l.posture === posture && l.page === page);
    const boot = stmts.filter((s) => BOOT_FAMILIES.has(s.family));
    const pipelineable = stmts.filter((s) => PIPELINE_FAMILIES.has(s.family));
    const orderDep = stmts.filter((s) => ORDER_DEPENDENT_FAMILIES.has(s.family));
    const seat = stmts.filter((s) => s.family === "one-trip-seat");
    const orderDepTrips = new Set(orderDep.map((s) => s.tripNo)).size;
    const seatTrips = new Set(seat.map((s) => s.tripNo)).size;
    report.floor[posture][page] = {
      censusTrips: new Set(stmts.map((s) => s.tripNo)).size,
      censusStatements: stmts.length,
      floorTrips:
        1 /* boot batch */ +
        seatTrips /* the seat's own minimum (head + slice batch) */ +
        1 /* one replay batch for every pipeline-able render statement */ +
        orderDepTrips,
      floorStatementsStillExecuting:
        boot.length +
        seat.length +
        pipelineable.length +
        orderDep.length /* unchanged by pipelining — only seating eliminates */,
      orderDependentTrips: orderDepTrips,
      note:
        "trips = pipeline POSTs; statements still execute server-side inside the batches " +
        "(the V3-proven per-statement cost) — wall-time floor on the cross-region class " +
        "is governed by statement elimination (seating), not POST count",
    };
  }

  // the 80/20
  report.topFamilies[posture] = Object.entries(report.families[posture])
    .sort((a, b) => b[1].statements - a[1].statements)
    .slice(0, 5)
    .map(([fam, v]) => ({ family: fam, statements: v.statements, verdict: v.verdict }));
}

const outPath = join(dirname(jsonlPath), "trip-census-report.json");
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

// console tables
for (const posture of postures) {
  console.log(`\n=== ${posture} — trips/statements per page ===`);
  for (const page of pages) {
    const p = report.perPage[posture][page];
    console.log(
      `  ${page.padEnd(14)} trips ${String(p.trips).padStart(3)}  stmts ${String(p.statements).padStart(3)}  floorTrips ${report.floor[posture][page].floorTrips}`,
    );
  }
  console.log(`  families (statements, verdict):`);
  for (const [fam, v] of Object.entries(report.families[posture]).sort((a, b) => b[1].statements - a[1].statements)) {
    console.log(`    ${fam.padEnd(32)} ${String(v.statements).padStart(5)}  ${v.verdict}`);
  }
}
console.log(`\nreport: ${outPath}`);
