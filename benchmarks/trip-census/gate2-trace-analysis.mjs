// GATE-2 TRACE ANALYSIS (gate2-request-trace lane, 2026-10-05): turns a
// gate-2 census JSONL (per-statement lines + kind:"totals" lines, produced
// by trip-census-cold-render.test.ts) into the request ledger:
//
//   node benchmarks/trip-census/gate2-trace-analysis.mjs <census.jsonl> [page] [--full]
//
//   - totals table   one row per (posture, page): trips, stmts, phase walls,
//                    DB wall, render JS wall, HTML bytes out
//   - trip table     one row per TRIP of the chosen page/posture: which
//                    statements ride it, rows returned, wall ms
//   - family table   statements/rows/db-ms per family (batch walls attributed
//                    pro-rata by member count — labeled as such)
//   - --full         the full per-statement ledger lines for the chosen page
//
// MEASUREMENT ONLY — reads the JSONL, writes the tables to stdout.

import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "";
const page = process.argv[3] ?? "Aikido";
const full = process.argv.includes("--full");
if (file === "") {
  console.error("usage: gate2-trace-analysis.mjs <census.jsonl> [page] [--full]");
  process.exit(2);
}

const lines = readFileSync(file, "utf8").split("\n").filter((l) => l.trim() !== "");
const stmts = [];
const totals = [];
for (const l of lines) {
  const rec = JSON.parse(l);
  if (rec.kind === "totals") totals.push(rec);
  else stmts.push(rec);
}

// ---- totals table ----------------------------------------------------------
console.log("== TOTALS (one cold request per row) ==");
console.log(
  ["posture", "page", "trips", "stmts", "bootWall", "bootDb", "renderWall", "renderDb", "renderJs", "htmlBytes", "eqOff"].join("\t"),
);
const order = { off: 0, "on-inline": 1, "on-noplan": 2 };
for (const t of totals.sort((a, b) => (order[a.posture] ?? 9) - (order[b.posture] ?? 9) || a.page.localeCompare(b.page))) {
  console.log(
    [
      t.posture, t.page, t.trips, t.stmts,
      t.bootWallMs.toFixed(1), t.bootDbMs.toFixed(1),
      t.renderWallMs.toFixed(1), t.renderDbMs.toFixed(1), t.renderJsMs.toFixed(1),
      t.htmlBytes, t.slotNormalizedEqualsOff,
    ].join("\t"),
  );
}

// ---- per-posture detail for the chosen page --------------------------------
for (const posture of ["off", "on-inline", "on-noplan"]) {
  const sel = stmts.filter((s) => s.posture === posture && s.page === page);
  const tot = totals.find((t) => t.posture === posture && t.page === page);
  if (sel.length === 0 || !tot) continue;
  console.log(`\n== ${posture}/${page}: ${tot.trips} trips, ${tot.stmts} statements, ${tot.htmlBytes} HTML bytes out ==`);

  // trip table: group by tripNo
  console.log("\n-- trips --");
  console.log(["trip", "kind", "stmts", "rows(sum)", "wallMs(batch or solo)"].join("\t"));
  const trips = new Map();
  for (const s of sel) {
    const t = trips.get(s.tripNo) ?? { kind: s.tripKind, n: 0, rows: 0, ms: 0 };
    t.n += 1;
    t.rows += s.rows;
    t.ms = s.localMs; // batch members carry the batch wall; solo carries its own
    trips.set(s.tripNo, t);
  }
  for (const [tripNo, t] of [...trips.entries()].sort((a, b) => a[0] - b[0])) {
    console.log([tripNo, t.kind, t.n, t.rows, t.ms.toFixed(1)].join("\t"));
  }

  // family table: batch walls attributed pro-rata by member count
  console.log("\n-- families (batch trip walls attributed pro-rata by member count) --");
  console.log(["family", "stmts", "rows(sum)", "dbMs(prorated)", "soloMs(exact)"].join("\t"));
  const fam = new Map();
  for (const s of sel) {
    const f = fam.get(s.family) ?? { n: 0, rows: 0, ms: 0, soloMs: 0 };
    f.n += 1;
    f.rows += s.rows;
    f.ms += (s.tripKind === "batch" ? s.localMs / s.tripStatements : s.localMs);
    if (s.tripKind === "query") f.soloMs += s.localMs;
    fam.set(s.family, f);
  }
  for (const [name, f] of [...fam.entries()].sort((a, b) => b.ms - a.ms)) {
    console.log([name, f.n, f.rows, f.ms.toFixed(1), f.soloMs.toFixed(1)].join("\t"));
  }

  // full ledger
  if (full) {
    console.log("\n-- every statement --");
    console.log(["seq", "phase", "trip", "kind", "family", "rows", "localMs", "sql"].join("\t"));
    for (const s of sel) {
      const sql = s.sql.replace(/\s+/g, " ").slice(0, 90);
      console.log([s.stmtNo, s.phase, s.tripNo, s.tripKind, s.family, s.rows, s.localMs.toFixed(2), sql].join("\t"));
    }
  }
}
