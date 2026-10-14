#!/usr/bin/env node
// Grades an engine's recorded results against a fixture's reference outputs,
// on the four parity kinds (rendering, semantics, persistence, side effects),
// and checks that reads wrote nothing the oracle's reads did not and that each
// write step's changes outside Decko's card tables are the oracle's, or
// declared (--declared-other-tables).
//
//   node reference-harness/runner/grade.mjs --fixture <fixtureDir> \
//        --actual <resultsDir> [--expected <expectedDir>] [--report <report.json>] \
//        [--declared-other-tables <declared.json>] [--declared-divergences <divergences.json>]
//        [--allow-partial] [--no-class-token-order]
//
// --declared-divergences names a JSON map of divergences an engine
//   configuration makes on purpose, by name, each with its why:
//   { "password-digest": "the port stores PBKDF2 where Ruby stores SHA-1" }.
//   Each name is defined in divergences.mjs, which masks exactly the values it
//   describes in expected and actual row deltas alike; everything else is
//   compared as usual, and the report lists every masked value.
//
// --declared-other-tables names a JSON map, keyed on step id then table name,
//   of write-step differences outside the card tables an engine is known to
//   make: { "create-then-render#1": { "sessions": "the engine keeps its own
//   session rows" } }. A declared difference is graded as declared and does
//   not fail; an undeclared one fails the grade.
//
// --no-class-token-order grades with the harness's N3 rule off, so class
//   tokens inside a `class` attribute are compared byte for byte
//   (SPEC.md section 4). N3 is on by default, and every report names the
//   rules it was graded under.
//
// Exit status: 0 every item matches; 1 a complete, valid run with failures;
// 2 not a grade (the run is incomplete, names another fixture, lacks its
// metadata, or the fixture or expected outputs do not match their manifests).
// --allow-partial grades a filtered or partial run on what it holds, for
// development; it still exits 2.

import { readFileSync, writeFileSync } from "node:fs";
import { EXIT, KINDS, gradeRun } from "./grade-lib.mjs";

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) throw new Error(`unexpected argument ${argv[i]}`);
  const key = argv[i].slice(2);
  if (key === "allow-partial" || key === "no-class-token-order") args[key] = true;
  else args[key] = argv[++i];
}
for (const required of ["fixture", "actual"]) if (!args[required]) throw new Error(`--${required} is required`);

let declaredOtherTables = {};
if (args["declared-other-tables"]) {
  declaredOtherTables = JSON.parse(readFileSync(args["declared-other-tables"], "utf8"));
}
let declaredDivergences = {};
if (args["declared-divergences"]) {
  declaredDivergences = JSON.parse(readFileSync(args["declared-divergences"], "utf8"));
}

const report = gradeRun({
  fixture: args.fixture,
  actual: args.actual,
  expected: args.expected,
  allowPartial: Boolean(args["allow-partial"]),
  classTokenOrder: !args["no-class-token-order"],
  declaredOtherTables,
  declaredDivergences,
});
report.graded_at = new Date().toISOString();
if (args.report) writeFileSync(args.report, JSON.stringify(report, null, 2) + "\n");

if (report.oracle?.variant && report.oracle.variant !== "stock") {
  console.log(`PATCHED ORACLE "${report.oracle.variant}": graded against expectations that differ from stock Decko (${report.oracle.patches.map((p) => p.id ?? p).join(", ")})`);
}
if (report.withheld) console.log(report.withheld.line);
for (const p of report.problems) console.log(`problem: ${p}`);
for (const w of report.warnings) console.log(`warning: ${w}`);
if (report.verdict === "invalid") {
  console.log(`NOT A GRADE: ${report.problems.length} problem(s) above. No pass rate is reported for this run.`);
  process.exit(EXIT.invalid);
}
if (report.verdict === "partial") console.log(`PARTIAL RUN, not a grade: ${report.partial.join("; ")}`);
console.log(`normalization: ${report.normalization.join(", ")}`);
for (const d of report.declared_divergences) console.log(`declared divergence ${d.name}: ${d.masked.length} value(s) masked - ${d.why}`);
for (const k of KINDS) {
  const s = report.summary[k];
  console.log(`${k.padEnd(13)} ${String(s.pass).padStart(5)} / ${String(s.graded).padEnd(5)} ${s.rate === null ? "-" : s.rate + "%"}` +
    (s.reproduced_upstream_failures ? `  (${s.reproduced_upstream_failures} reproduced upstream failures)` : "") +
    (s.oracle_errors ? `  (${s.oracle_errors} oracle capture faults not graded)` : ""));
  for (const [g, v] of Object.entries(s.groups)) console.log(`    ${g.padEnd(24)} ${v.pass} / ${v.graded}`);
}
const rw = report.read_writes;
console.log(`${"read writes".padEnd(13)} ${String(rw.pass).padStart(5)} / ${String(rw.graded).padEnd(5)} reads that wrote only what the oracle's reads wrote`);
for (const f of rw.failures) console.log(`    ${f.id}: ${f.reason}`);
const ot = report.other_tables;
if (ot.graded > 0 || ot.fail > 0) {
  const declaredNote = ot.declared ? ` (+${ot.declared} declared)` : "";
  console.log(`${"other tables".padEnd(13)} ${String(ot.pass).padStart(5)} / ${String(ot.graded).padEnd(5)} write steps whose non-card tables match the oracle's${declaredNote}`);
  for (const f of ot.failures) console.log(`    ${f.id}: ${f.reason} (${f.tables.join(", ")})`);
}
console.log(`verdict: ${report.verdict}`);
process.exit(EXIT[report.verdict]);
