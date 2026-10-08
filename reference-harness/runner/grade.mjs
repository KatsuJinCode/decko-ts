#!/usr/bin/env node
// Grades an engine's recorded results against a fixture's reference outputs,
// on the four parity kinds (rendering, semantics, persistence, side effects),
// and checks that reads wrote nothing the oracle's reads did not.
//
//   node reference-harness/runner/grade.mjs --fixture <fixtureDir> \
//        --actual <resultsDir> [--expected <expectedDir>] [--report <report.json>] [--allow-partial]
//
// Exit status: 0 every item matches; 1 a complete, valid run with failures;
// 2 not a grade (the run is incomplete, names another fixture, lacks its
// metadata, or the fixture or expected outputs do not match their manifests).
// --allow-partial grades a filtered or partial run on what it holds, for
// development; it still exits 2.

import { writeFileSync } from "node:fs";
import { EXIT, KINDS, gradeRun } from "./grade-lib.mjs";

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) throw new Error(`unexpected argument ${argv[i]}`);
  const key = argv[i].slice(2);
  if (key === "allow-partial") args[key] = true;
  else args[key] = argv[++i];
}
for (const required of ["fixture", "actual"]) if (!args[required]) throw new Error(`--${required} is required`);

const report = gradeRun({ fixture: args.fixture, actual: args.actual, expected: args.expected, allowPartial: Boolean(args["allow-partial"]) });
report.graded_at = new Date().toISOString();
if (args.report) writeFileSync(args.report, JSON.stringify(report, null, 2) + "\n");

if (report.oracle?.variant && report.oracle.variant !== "stock") {
  console.log(`PATCHED ORACLE "${report.oracle.variant}": graded against expectations that differ from stock Decko (${report.oracle.patches.map((p) => p.id ?? p).join(", ")})`);
}
for (const p of report.problems) console.log(`problem: ${p}`);
for (const w of report.warnings) console.log(`warning: ${w}`);
if (report.verdict === "invalid") {
  console.log(`NOT A GRADE: ${report.problems.length} problem(s) above. No pass rate is reported for this run.`);
  process.exit(EXIT.invalid);
}
if (report.verdict === "partial") console.log(`PARTIAL RUN, not a grade: ${report.partial.join("; ")}`);
for (const k of KINDS) {
  const s = report.summary[k];
  console.log(`${k.padEnd(13)} ${String(s.pass).padStart(5)} / ${String(s.graded).padEnd(5)} ${s.rate === null ? "-" : s.rate + "%"}` +
    (s.oracle_errors ? `  (${s.oracle_errors} oracle errors not graded)` : ""));
  for (const [g, v] of Object.entries(s.groups)) console.log(`    ${g.padEnd(24)} ${v.pass} / ${v.graded}`);
}
const rw = report.read_writes;
console.log(`${"read writes".padEnd(13)} ${String(rw.pass).padStart(5)} / ${String(rw.graded).padEnd(5)} reads that wrote only what the oracle's reads wrote`);
for (const f of rw.failures) console.log(`    ${f.id}: ${f.reason}`);
console.log(`verdict: ${report.verdict}`);
process.exit(EXIT[report.verdict]);
