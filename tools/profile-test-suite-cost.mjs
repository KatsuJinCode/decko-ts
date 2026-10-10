// Ranks every test in the suite by what it actually costs, so "the suite is
// slow" can be answered with the handful of tests that are slow rather than
// with guesswork.
//
// Reads a vitest JSON report (the same one `--reporter=json` writes) and prints,
// in order: the slowest individual tests, the slowest files, and the cost
// distribution across the whole run. The question this exists to answer is
// always "what is actually taking the time", and the answer is almost never
// "all of it, evenly".
//
// Produce the input with:
//
//   npx vitest run --reporter=json --outputFile=/tmp/prof.json <files...>
//
// then:
//
//   node tools/profile-test-suite-cost.mjs /tmp/prof.json
//
// Pass --top N to change how many rows of each table print (default 15).

import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const topIdx = argv.indexOf("--top");
const TOP = topIdx === -1 ? 15 : Number(argv[topIdx + 1] || 15);
const reportPath = argv.find((a) => !a.startsWith("--") && a !== String(TOP) && a !== argv[topIdx + 1]);

if (!reportPath) {
  console.error(
    "usage: node tools/profile-test-suite-cost.mjs <vitest-json-report> [--top N]\n" +
      "  generate the report with: npx vitest run --reporter=json --outputFile=<path> <files...>"
  );
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, "utf8"));

const tests = [];
for (const file of report.testResults || []) {
  const label = String(file.name || "").split("\\").slice(-2).join("/");
  for (const assertion of file.assertionResults || []) {
    tests.push({ name: assertion.title, seconds: (assertion.duration || 0) / 1000, file: label });
  }
}
tests.sort((a, b) => b.seconds - a.seconds);

const total = tests.reduce((sum, t) => sum + t.seconds, 0);
if (tests.length === 0) {
  console.error("no tests in that report - was it a run that collected nothing?");
  process.exit(1);
}

const median = tests[Math.floor(tests.length / 2)].seconds;
console.log(`files profiled    : ${new Set(tests.map((t) => t.file)).size}`);
console.log(`individual tests  : ${tests.length}`);
console.log(`total test time   : ${total.toFixed(1)}s`);
console.log(`median test       : ${median.toFixed(3)}s`);
console.log(`mean test         : ${(total / tests.length).toFixed(3)}s`);
console.log("");

console.log(`SLOWEST ${TOP} TESTS`);
let headSum = 0;
for (const t of tests.slice(0, TOP)) {
  headSum += t.seconds;
  console.log(`  ${t.seconds.toFixed(2).padStart(7)}s  ${t.name.slice(0, 52).padEnd(52)}  ${t.file}`);
}
console.log(`  -> top ${TOP} = ${headSum.toFixed(1)}s = ${((headSum / total) * 100).toFixed(1)}% of test time`);
console.log("");

const cumulative = (k) => tests.slice(0, Math.min(k, tests.length)).reduce((s, t) => s + t.seconds, 0);
console.log("CONCENTRATION");
for (const k of [10, 25, 50, 100, 250]) {
  if (k > tests.length) continue;
  console.log(
    `  top ${String(k).padStart(3)} tests = ${cumulative(k).toFixed(1).padStart(6)}s  (${((cumulative(k) / total) * 100).toFixed(1)}%)`
  );
}
console.log("");

const byFile = new Map();
for (const t of tests) byFile.set(t.file, (byFile.get(t.file) || 0) + t.seconds);
const fileTotals = [...byFile.entries()].sort((a, b) => b[1] - a[1]);
console.log(`SLOWEST ${TOP} FILES`);
let fileHead = 0;
for (const [file, seconds] of fileTotals.slice(0, TOP)) {
  fileHead += seconds;
  console.log(`  ${seconds.toFixed(2).padStart(7)}s  ${file}`);
}
console.log(`  -> top ${TOP} = ${fileHead.toFixed(1)}s = ${((fileHead / total) * 100).toFixed(1)}% of test time`);
console.log("");

const BANDS = [
  ["under 5ms", (s) => s < 0.005],
  ["5-20ms", (s) => s >= 0.005 && s < 0.02],
  ["20-100ms", (s) => s >= 0.02 && s < 0.1],
  ["100ms-1s", (s) => s >= 0.1 && s < 1],
  ["over 1s", (s) => s >= 1],
];
console.log("COST DISTRIBUTION");
for (const [label, within] of BANDS) {
  const band = tests.filter((t) => within(t.seconds));
  const bandTotal = band.reduce((s, t) => s + t.seconds, 0);
  console.log(
    `  ${label.padEnd(12)}${String(band.length).padStart(5)} tests` +
      `${((band.length / tests.length) * 100).toFixed(1).padStart(6)}% of count` +
      `${bandTotal.toFixed(1).padStart(8)}s${((bandTotal / total) * 100).toFixed(1).padStart(7)}% of time`
  );
}