#!/usr/bin/env node
// Reruns every browser check, one engine at a time:
//   1. the journeys on stock Ruby Decko (the reference),
//   2. the same journeys on the TypeScript port,
//   3. the comparison, journey by journey,
//   4. Decko's own @javascript cucumber scenarios on stock Ruby Decko.
//
//   node reference-harness/browser/run-all.mjs --out <dir> [--decko <decko git checkout>] [--filter <regex>]
//
// --decko names a checkout of the decko repository (its v0.20.0 tag supplies
// the feature files); without it step 4 is skipped and says so. Results:
// <out>/ruby, <out>/ts, <out>/report.json, <out>/cucumber/summary.json.
// Needs the TS port built into dist/ (tsc -p tsconfig.json), the Ruby oracle
// app's gems, an installed Chrome, Edge or Chromium, and playwright-core
// (HARNESS_PLAYWRIGHT_CORE when it is not resolvable from here).

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const harness = path.resolve(here, "..");

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
if (!args.out) throw new Error("--out <dir> is required");
const out = path.resolve(args.out);
mkdirSync(out, { recursive: true });

function step(title, script, scriptArgs) {
  console.log(`\n== ${title}`);
  const r = spawnSync(process.execPath, [script, ...scriptArgs], { stdio: "inherit", windowsHide: true });
  if (r.status !== 0) throw new Error(`${title} exited ${r.status}`);
}

const fixture = path.join(harness, "fixtures", "synthetic-v1");
const journeys = path.join(here, "journeys", "synthetic-v1.json");
const filter = args.filter ? ["--filter", args.filter] : [];
for (const engine of ["ruby", "ts"]) {
  step(`journeys on ${engine}`, path.join(here, "run-journeys.mjs"), [
    "--engine", path.join(here, "engines", `${engine}.json`),
    "--fixture", fixture,
    "--journeys", journeys,
    "--out", path.join(out, engine),
    ...filter,
  ]);
}
step("comparison", path.join(here, "compare-journeys.mjs"), [
  "--expected", path.join(out, "ruby"),
  "--actual", path.join(out, "ts"),
  "--report", path.join(out, "report.json"),
]);
if (args.decko) {
  step("Decko's cucumber browser scenarios on stock Ruby", path.join(here, "cucumber", "run-features.mjs"), [
    "--decko", args.decko,
    "--out", path.join(out, "cucumber"),
  ]);
} else {
  console.log("\n== Decko's cucumber browser scenarios: SKIPPED (no --decko checkout given)");
}
