// parse-grade11-coverage.mjs -- grade #11 staged-harness coverage counter.
//
// Re-parses the per-shard coverage lines the runner core prints
// (dual-lane-direct-runner-core.ts ~:704: "coverage shard=<name>
// view(file=...,lines=...,entries=...,malformed=...,laneMismatch=...)
// page(...) missing=...") out of a driver/worker log, sums them, and
// prints the grade-10 receipt's coverage-verdict shape. This is the same
// re-parse-from-own-lines discipline grade-10 recorded (its receipt section
// 3: "Re-parsed from the run's own 48 coverage lines, not from a summary").
//
// Usage:
//   node parse-grade11-coverage.mjs <log-file> [--expect-total N] [--expect-malformed N]
//
// Exit 0 = coverage lines found AND expectations (if given) met.
// Exit 1 = expectations not met or no coverage lines found.

import fs from "node:fs";

const args = process.argv.slice(2);
const logPath = args[0];
if (!logPath) {
  console.error("usage: parse-grade11-coverage.mjs <log-file> [--expect-total N] [--expect-malformed N]");
  process.exit(2);
}
const expectIdx = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : null;
};
const expectTotal = expectIdx("--expect-total");
const expectMalformed = expectIdx("--expect-malformed");

const text = fs.readFileSync(logPath, "utf8");
const lineRe =
  /coverage shard=(\S+) view\(file=(true|false),lines=(\d+),entries=(\d+),malformed=(\d+),laneMismatch=(\d+)\) page\(file=(true|false),lines=(\d+),entries=(\d+),malformed=(\d+),laneMismatch=(\d+)\) missing=(.*)/;

let shards = 0;
let viewEntries = 0;
let pageEntries = 0;
let malformed = 0;
let laneMismatches = 0;
let missingFiles = 0;
const distinctShards = new Set();

for (const raw of text.split(/\r?\n/)) {
  const m = lineRe.exec(raw);
  if (!m) continue;
  shards += 1;
  distinctShards.add(m[1]);
  viewEntries += Number(m[4]);
  pageEntries += Number(m[9]);
  malformed += Number(m[5]) + Number(m[10]);
  laneMismatches += Number(m[6]) + Number(m[11]);
  if (m[7] === "false") missingFiles += 1;
}
const total = viewEntries + pageEntries;

const verdict = {
  coverageLines: shards,
  distinctShards: distinctShards.size,
  viewEntries,
  pageEntries,
  total,
  malformed,
  laneMismatches,
  missingFiles,
};
console.log(JSON.stringify(verdict));

const failures = [];
if (shards === 0) failures.push("no coverage lines parsed");
if (expectTotal !== null && total !== expectTotal) failures.push(`total ${total} != expected ${expectTotal}`);
if (expectMalformed !== null && malformed !== expectMalformed)
  failures.push(`malformed ${malformed} != expected ${expectMalformed}`);

if (failures.length > 0) {
  console.log(`COVERAGE-VERDICT view=${viewEntries} page=${pageEntries} FAIL (${failures.join("; ")})`);
  process.exit(1);
}
console.log(`COVERAGE-VERDICT view=${viewEntries} page=${pageEntries} PASS`);
