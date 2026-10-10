// Categorises EVERY test file in the suite by what kind of question it answers,
// so each one can be assigned a frequency. A test that proves the product is
// correct deserves to run constantly; a test that proves the product survives a
// million rows, or that our agent tooling kills the right processes, does not.
//
// Reads a vitest JSON report (from --reporter=json) and groups every file into
// one of the gates below, printing counts and total time per gate.
//
//   node tools/categorize-tests-by-gate.mjs <vitest-json-report>

import { readFileSync } from "node:fs";

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("usage: node tools/categorize-tests-by-gate.mjs <vitest-json-report>");
  process.exit(1);
}
const report = JSON.parse(readFileSync(reportPath, "utf8"));

// Ordered: first matching rule wins, so put the specific ones above the general.
const GATES = [
  {
    id: "harness",
    label: "HARNESS - tests our agent tooling, not the product",
    // Anything under tools/ tests the machinery we run agents with. A change
    // to the wiki cannot break it; a change to the tooling can.
    test: (p) =>
      /^tools\//i.test(p) ||
      /dual-lane-verifier|lane-verifier|instrument-reliability|test-queue|kill-scoping|reclaim|lane-job|cf-cost/i.test(p),
  },
  {
    id: "capacity",
    label: "CAPACITY - proves scale, not correctness",
    test: (p) =>
      /streaming-memory|soak|1m|bulk|scale|synthetic|fixture-sweep|no-caching-synthetic|deep-nesting|pair-chunk|trickle|d1-trickle|volume|throughput|bench/i.test(p),
  },
  {
    id: "deploy",
    label: "DEPLOYMENT - emulates the production edge runtime",
    test: (p) =>
      /[\\/]deploy[\\/]|workerd|miniflare|bunny-edge|cf-edge|edge-compiler|deploy-worker|compiled-script-bundle|cross-adapter-byte-parity/i.test(p),
  },
  {
    // Concurrency semantics proved against an emulated D1, not local SQLite.
    // Real correctness tests, but they pay for an emulator to run.
    id: "deploy",
    label: "DEPLOYMENT - emulates the production edge runtime",
    test: (p) => /concurrent-saves|atomic-saves/i.test(p),
  },
  {
    id: "corpus",
    label: "CORPUS/PARITY - compares captured Ruby output byte for byte",
    test: (p) => /[\\/]corpus[\\/]|parity|oracle|capture|golden|replay/i.test(p),
  },
  {
    id: "correctness",
    label: "CORRECTNESS - the product's own behaviour",
    test: () => true,
  },
];

const buckets = new Map(GATES.map((g) => [g.id, { ...g, files: 0, seconds: 0, tests: 0, names: [] }]));

for (const file of report.testResults || []) {
  const full = String(file.name || "").replace(/\\/g, "/");
  // Keep the path relative to the repo root so the "tools/" prefix survives —
  // dropping to a bare filename hides exactly the harness tests we care about.
  const marker = "/decko-ts-int-100/";
  const rel = full.includes(marker) ? full.slice(full.indexOf(marker) + marker.length) : full.replace(/^.*\/(?=[^/]+\/[^/]+$)/, "");
  const seconds = (file.assertionResults || []).reduce((s, a) => s + (a.duration || 0), 0) / 1000;
  const rule = GATES.find((g) => g.test(rel));
  const bucket = buckets.get(rule.id);
  bucket.files += 1;
  bucket.seconds += seconds;
  bucket.tests += (file.assertionResults || []).length;
  bucket.names.push([rel, seconds]);
}

const all = [...buckets.values()];
const totalFiles = all.reduce((s, b) => s + b.files, 0);
const totalSeconds = all.reduce((s, b) => s + b.seconds, 0);

console.log(`files: ${totalFiles}   total test time: ${totalSeconds.toFixed(1)}s`);
console.log("");
console.log("PROPOSED FREQUENCY BY GATE");
console.log("=".repeat(78));
for (const b of all) {
  console.log("");
  console.log(`${b.label}`);
  console.log(`  ${b.files} files, ${b.tests} tests, ${b.seconds.toFixed(1)}s (${((b.seconds / totalSeconds) * 100).toFixed(1)}% of test time)`);
  for (const [name, secs] of b.names.sort((x, y) => y[1] - x[1]).slice(0, 6)) {
    console.log(`      ${secs.toFixed(2).padStart(7)}s  ${name}`);
  }
  if (b.names.length > 6) console.log(`      ... and ${b.names.length - 6} more`);
}

console.log("");
console.log("=".repeat(78));
console.log("IF EVERYTHING NON-CORRECTNESS MOVED OFF THE CONSTANT PATH:");
const constant = buckets.get("correctness");
console.log(`  ${constant.files} files would run per change (${((constant.files / totalFiles) * 100).toFixed(0)}% of the suite)`);
console.log(`  ${constant.seconds.toFixed(1)}s of test time (${((constant.seconds / totalSeconds) * 100).toFixed(0)}%)`);
const moved = totalSeconds - constant.seconds;
console.log(`  ${moved.toFixed(1)}s of test time (${((moved / totalSeconds) * 100).toFixed(0)}%) would move to merge/schedule gates`);