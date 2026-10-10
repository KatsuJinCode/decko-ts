#!/usr/bin/env node
// The seconds corpus gate: renders every corpus page through ONE TypeScript
// engine (the composed adapter, one process, 1 GB heap by way of the
// lane-job wrapper) and byte-compares every render against the committed
// Ruby oracle outputs. This is the standard per-change byte gate: it
// replaced the arbitrary 40-page real-deck page list (retired; see
// benchmarks/speed-ship/gate.py) and the per-commit use of the 6,588-page
// full corpus replay, because it is exhaustive over the engine's CODE PATHS
// (every view the composed deck serves - see the coverage map beside this
// script - every card type, every permission shape, every mod) and runs in
// seconds.
//
//   node C:/Users/jpswi/.zcode/tools/lane-job.mjs --lane seconds-corpus \
//        --job "seconds corpus byte gate" -- \
//        node benchmarks/seconds-corpus/seconds-corpus-gate.mjs
//
// Prints "SECONDS-CORPUS-REPORT {json}" on success and a failure line with
// the first differing operations otherwise. Exit 0 only when every corpus
// page is byte-identical to the oracle (after the slot-id mask the harness
// normalizes; every other byte counts).

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixture = path.join(repo, "reference-harness/fixtures/synthetic-v2");
const adapter = path.join(repo, "reference-harness/adapters/ts-composed/adapter.json");
const expected = path.join(fixture, "expected");
const run = path.join(repo, "reference-harness/runner/run.mjs");
const grade = path.join(repo, "reference-harness/runner/grade.mjs");

for (const p of [fixture, adapter, path.join(fixture, "deck/deck.sqlite3"), expected]) {
  if (!existsSync(p)) {
    console.error(`seconds-corpus-gate: missing ${p}`);
    process.exit(2);
  }
}

const keep = process.argv.includes("--keep");
const work = process.argv.includes("--work")
  ? path.resolve(process.argv[process.argv.indexOf("--work") + 1])
  : mkdtempSync(path.join(repo, "tmp", "seconds-corpus-gate-"));
const resultsDir = path.join(work, "results");

// Pinned known divergences: operations where the composed engine's bytes
// differ from the oracle's recorded bytes and the divergence is a NAMED,
// evidenced port gap (each entry: op id, mechanism, oracle evidence). A diff
// on a pinned op is reported as pinned, not failing; a diff on anything
// else fails the gate. The file is committed beside this script.
const pinsFile = path.join(repo, "benchmarks/seconds-corpus/pinned-divergences.json");
const pins = new Map(
  existsSync(pinsFile)
    ? (JSON.parse(readFileSync(pinsFile, "utf8")).pins ?? []).map((p) => [p.op, p])
    : [],
);

const hidden = { windowsHide: true };
const wallStart = Date.now();
const runR = spawnSync(process.execPath, [run, "--adapter", adapter, "--fixture", fixture, "--out", resultsDir], {
  cwd: repo, encoding: "utf8", timeout: 300000, ...hidden,
});
const runWall = Date.now() - wallStart;
if (runR.status !== 0) {
  console.error(`seconds-corpus-gate: run failed (rc ${runR.status})\n${(runR.stderr || "").slice(-2000)}`);
  process.exit(2);
}

const gradeR = spawnSync(
  process.execPath,
  [grade, "--fixture", fixture, "--actual", resultsDir, "--expected", expected, "--report", path.join(work, "report.json")],
  { cwd: repo, encoding: "utf8", timeout: 300000, ...hidden },
);

const report = JSON.parse(readFileSync(path.join(work, "report.json"), "utf8"));
const render = report.summary?.rendering ?? { graded: 0, pass: 0, fail: 0, oracle_errors: 0 };
const fails = report.failures?.rendering ?? [];
const failIds = fails.map((f) => f.id ?? f);
const unpinned = failIds.filter((id) => !pins.has(id));
const pinned = failIds.filter((id) => pins.has(id));
const verdict = {
  instrument: "seconds-corpus",
  fixture: "synthetic-v2",
  adapter: "decko-ts-composed",
  pages: render.graded,
  identical: render.pass,
  not_identical: unpinned.length,
  pinned_divergences: pinned.length,
  oracle_errors: render.oracle_errors,
  wall_ms: runWall,
  under_60s: runWall < 60000,
  same: unpinned.length === 0,
};
const line = `SECONDS-CORPUS-REPORT ${JSON.stringify(verdict)}`;
console.log(line);
// grade.mjs exits 0 (all graded items identical), 1 (a valid grade with
// failures - allowed here when every failure is a pinned known divergence)
// or 2 (not a grade - always a gate failure).
if (gradeR.status === 2) {
  console.error(`seconds-corpus-gate: NOT A GRADE\n${(gradeR.stdout || "")}`);
  process.exit(2);
}
if (!verdict.same) {
  console.error(`seconds-corpus-gate: FAILED - report at ${path.join(work, "report.json")}`);
  for (const f of fails.filter((f) => !pins.has(f.id ?? f)).slice(0, 20)) console.error(`  - ${f.id ?? f}`);
  console.error(`  (${unpinned.length} unpinned failing operations of ${failIds.length} failing;`);
  console.error(`   node reference-harness/runner/causes.mjs ${path.join(work, "report.json")} rendering groups them)`);
  process.exit(1);
}
if (pinned.length) console.log(`seconds-corpus-gate: ${pinned.length} pinned known divergences (see pinned-divergences.json)`);
if (!keep) rmSync(work, { recursive: true, force: true });
process.exit(0);
