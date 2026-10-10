// The release gate, as one aggregating runner (review round 3, finding 7).
//
// WHY THIS EXISTS: the release-check npm script used to join its stages with
// `&&`, so the seven documented baseline failures in the first stage
// (npm test) prevented every later stage from running at all — the gate
// reported "the tree fails at stage 1" instead of what a release needs to
// know: which failures are the accepted baseline recorded in
// KNOWN_FAILURES.md, and whether any stage produced NEW failures or no
// evidence at all.
//
// WHAT IT DOES:
//   (a) runs EVERY stage, regardless of individual failures;
//   (b) classifies each stage's failing suites against KNOWN_FAILURES.md —
//       a failure in a listed suite is BASELINE, a failure anywhere else is
//       NEW (suite granularity: the shadow entry documents itself as a
//       varying subset, so per-assertion matching would be false precision);
//   (c) reports a stage that produced NO verdicts (everything skipped — the
//       persistence probe without its starting oracle deck — or a runner
//       that could not start) as INCOMPLETE, never as pass;
//   (d) exits non-zero only for NEW failures or INCOMPLETE mandatory
//       evidence — the accepted baseline is exactly that, accepted;
//   (e) prints one summary table and names where the full logs are.
//
// SOURCES OF TRUTH, deliberately not prose: vitest runs with a JSON reporter
// alongside the default one, and classification reads the JSON (file paths
// and per-test verdicts), never the rendered summary. node --test is read
// from its spec reporter's stable counters. Stages and their order are the
// npm script's, unchanged: test (card) -> test:deploy -> test:drivers ->
// test:shadow -> test:reference-harness -> test:persistence-probe.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VITEST = join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs");
const KNOWN_FAILURES = join(REPO_ROOT, "KNOWN_FAILURES.md");

/** The stages, in the npm script's order. Each command is argv — node is
 *  spawned directly, no shell, so the runner is identical on Windows and
 *  Linux. The reference-harness glob is expanded by node's own test runner
 *  (Node 22+), not by a shell. */
const STAGES = [
  { name: "card", target: ["tests/card/"], runner: "vitest" },
  { name: "deploy", target: ["tests/deploy/"], runner: "vitest" },
  { name: "drivers", target: ["tests/server/drivers/"], runner: "vitest" },
  { name: "shadow", target: ["tests/tools/shadow/"], runner: "vitest" },
  { name: "reference-harness", target: ["reference-harness/runner/test/*.test.mjs"], runner: "node-test" },
  { name: "persistence-probe", target: ["tests/tools/persist-write-probe.test.ts"], runner: "vitest" },
];

/** Suite paths listed in KNOWN_FAILURES.md's table (the first column). A
 *  suite that passes is not listed there, by that file's own contract. */
function knownFailureSuites() {
  if (!existsSync(KNOWN_FAILURES)) return new Set();
  const suites = new Set();
  for (const line of readFileSync(KNOWN_FAILURES, "utf8").split("\n")) {
    const cell = line.match(/^\s*\|\s*`([^`]+)`\s*\|/);
    if (cell) suites.add(cell[1].trim().replaceAll("\\", "/"));
  }
  return suites;
}

/** Run one stage to completion. Returns { code, stdout, stderr, error }. */
function runStage(stage, jsonPath) {
  const args =
    stage.runner === "vitest"
      ? [VITEST, "run", ...stage.target, "--reporter=default", "--reporter=json", `--outputFile.json=${jsonPath}`]
      : ["--test", ...stage.target];
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, args, { cwd: REPO_ROOT, windowsHide: true, shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => resolveRun({ code: null, stdout, stderr, error }));
    child.on("close", (code) => resolveRun({ code, stdout, stderr, error: null }));
  });
}

/** The vitest side of a stage: counts and failed files from the JSON
 *  reporter's output (jest-shaped: numPassedTests/numFailedTests/
 *  numPendingTests + testResults[].name). Falls back to the rendered
 *  summary only when the JSON never landed. */
function vitestOutcome(jsonPath, output) {
  if (existsSync(jsonPath)) {
    try {
      const report = JSON.parse(readFileSync(jsonPath, "utf8"));
      return {
        counts: {
          passed: report.numPassedTests ?? 0,
          failed: report.numFailedTests ?? 0,
          skipped: (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0),
        },
        failedFiles: (report.testResults ?? [])
          .filter((file) => file.status === "failed")
          .map((file) => relative(REPO_ROOT, file.name).replaceAll("\\", "/")),
      };
    } catch {
      /* a partial or unwritable JSON falls through to the prose read */
    }
  }
  const counts = { passed: 0, failed: 0, skipped: 0 };
  for (const line of output.split("\n")) {
    if (!/^\s*Tests\s/.test(line)) continue;
    for (const [state, key] of [["failed", "failed"], ["passed", "passed"], ["skipped", "skipped"], ["todo", "skipped"]]) {
      const n = line.match(new RegExp(`(\\d+) ${state}`));
      if (n) counts[key] += Number(n[1]);
    }
  }
  return { counts, failedFiles: [] };
}

/** The node --test side of a stage: counts from the spec reporter's
 *  counters, failing test names from its ✖ lines (files are not
 *  attributable, so names are shown as-is). */
function nodeTestOutcome(output) {
  const counts = { passed: 0, failed: 0, skipped: 0 };
  const failedNames = [];
  for (const line of output.split("\n")) {
    const grab = (label) => line.match(new RegExp(`^ℹ ${label} (\\d+)`));
    if (grab("pass")) counts.passed = Number(grab("pass")[1]);
    if (grab("fail")) counts.failed = Number(grab("fail")[1]);
    for (const label of ["skipped", "todo"]) {
      if (grab(label)) counts.skipped += Number(grab(label)[1]);
    }
    const name = line.match(/^\s+✖\s+(.+?)(?:\s+\(\d+\.\d+ms\))?$/);
    if (name) failedNames.push(`[test] ${name[1].trim()}`);
  }
  return { counts, failedFiles: failedNames };
}

function classify(outcome, ran, known) {
  if (!ran) {
    return { result: "INCOMPLETE", reason: "the stage could not run", failed: [], known: [], counts: { passed: 0, failed: 0, skipped: 0 } };
  }
  const { counts, failedFiles } = outcome;
  if (counts.passed === 0 && counts.failed === 0) {
    const why = counts.skipped > 0 ? "every test skipped (its prerequisite is absent)" : "no tests ran";
    return { result: "INCOMPLETE", reason: `no evidence: ${why}`, failed: [], known: [], counts };
  }
  const knownSuites = failedFiles.filter((f) => known.has(f));
  const newSuites = failedFiles.filter((f) => !known.has(f));
  if (newSuites.length > 0) return { result: "NEW", reason: `${newSuites.length} failing suite(s) not in KNOWN_FAILURES.md`, failed: newSuites, known: knownSuites, counts };
  if (knownSuites.length > 0) return { result: "BASELINE", reason: `${knownSuites.length} failing suite(s), all in KNOWN_FAILURES.md`, failed: [], known: knownSuites, counts };
  if (counts.failed > 0) {
    return { result: "NEW", reason: `${counts.failed} failing assertion(s) the file list does not attribute — read the log`, failed: ["(unattributed failures — see log)"], known: [], counts };
  }
  return { result: "PASS", reason: "", failed: [], known: [], counts };
}

const known = knownFailureSuites();
const logDir = mkdtempSync(join(process.env.TEMP ?? process.env.TMP ?? "/tmp", "decko-release-check-"));
const rows = [];
let newStages = 0;
let incompleteStages = 0;
let baselineStages = 0;

for (const stage of STAGES) {
  if (stage.runner === "vitest" && !existsSync(VITEST)) {
    rows.push({ stage: stage.name, result: "INCOMPLETE", reason: "vitest is not installed (node_modules missing)", failed: [], known: [], counts: null, seconds: 0 });
    incompleteStages += 1;
    continue;
  }
  const jsonPath = join(logDir, `${stage.name}.json`);
  const t0 = Date.now();
  const outcome = await runStage(stage, jsonPath);
  const seconds = (Date.now() - t0) / 1000;
  writeFileSync(
    join(logDir, `${stage.name}.log`),
    `argv: node ${stage.runner === "vitest" ? "vitest.mjs run" : "--test"} ${stage.target.join(" ")}\nexit: ${outcome.code}${outcome.error ? `\nspawn error: ${outcome.error.stack ?? outcome.error.message}` : ""}\n\n${outcome.stdout}${outcome.stderr}`,
  );
  const measured = stage.runner === "vitest" ? vitestOutcome(jsonPath, `${outcome.stdout}\n${outcome.stderr}`) : nodeTestOutcome(`${outcome.stdout}\n${outcome.stderr}`);
  const verdict = classify(measured, outcome.error === null && outcome.code !== null, known);
  rows.push({ stage: stage.name, result: verdict.result, reason: verdict.reason, failed: verdict.failed, known: verdict.known, counts: verdict.counts, seconds });
  if (verdict.result === "NEW") newStages += 1;
  else if (verdict.result === "INCOMPLETE") incompleteStages += 1;
  else if (verdict.result === "BASELINE") baselineStages += 1;
}

// Baseline entries that did not fail this run: KNOWN_FAILURES.md says a
// passing suite is not listed, so a stale entry is named, not silently kept.
const failedSuites = new Set(rows.flatMap((r) => [...(r.failed ?? []), ...(r.known ?? [])]));
const staleBaseline = [...known].filter((suite) => !failedSuites.has(suite));

const pad = (text, width) => (text.length >= width ? text : text + " ".repeat(width - text.length));
const total = (counts) => (counts ? `${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped` : "—");
const note = (row) =>
  [row.reason, ...(row.failed ?? []).map((s) => `new: ${s}`), ...(row.known ?? []).map((s) => `baseline: ${s}`)].filter(Boolean).join("; ");

console.log("\nRelease check — every stage runs; failures are classified against KNOWN_FAILURES.md\n");
console.log(`${pad("STAGE", 20)}${pad("RESULT", 12)}${pad("TESTS", 42)}${pad("s", 5)}NOTE`);
for (const row of rows) {
  console.log(`${pad(row.stage, 20)}${pad(row.result, 12)}${pad(total(row.counts), 42)}${pad(row.seconds.toFixed(0), 5)}${note(row)}`);
}
console.log(
  `\nBaseline stages: ${baselineStages} (accepted, recorded in KNOWN_FAILURES.md) · NEW-failure stages: ${newStages} · INCOMPLETE stages: ${incompleteStages}`,
);
if (staleBaseline.length > 0) {
  console.log(`Baseline entries that passed this run (KNOWN_FAILURES.md asks for their removal): ${staleBaseline.join(", ")}`);
}
console.log(`Full logs: ${logDir}`);
if (newStages > 0 || incompleteStages > 0) {
  console.log(
    `\nRelease check: NOT clean — ${newStages > 0 ? `${newStages} stage(s) with NEW failures` : ""}${newStages > 0 && incompleteStages > 0 ? " and " : ""}${incompleteStages > 0 ? `${incompleteStages} stage(s) without mandatory evidence` : ""}.`,
  );
  process.exitCode = 1;
} else {
  console.log("\nRelease check: clean — every stage ran; every failure is the accepted baseline.");
}
