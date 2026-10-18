#!/usr/bin/env node
// search-order-default-invocation-proof.mjs — the real-engine proof for the
// compare-search-order.mjs CLI's DEFAULT invocation (no --terms) and its
// --no-letters invocation, the exact path the 2026-10-18 rehearsal found
// broken: the CLI passed its boolean --letters/--no-letters flag into
// defaultProbeTerms({letters}), whose contract is the letter ARRAY, so the
// plain default invocation died before any probe with "TypeError: letters is
// not iterable" (--no-letters spread `false` the same way). Every earlier
// proof had passed explicit --terms, so the default path was never exercised.
//
// Method: the search-order-two-local-engines-proof.mjs method — two LOCAL
// ts-engine instances (reference-harness/browser/engines/ts.json) booted by
// this script on private timestamp-normalized copies of the synthetic-v1
// fixture (deterministic per-rowid updated_at, so the relevance sort has a
// total order and the 20-item results window cannot flicker between two
// otherwise-identical instances). No request leaves this machine. The CLI
// runs as a subprocess — the proven tool is exactly the tool an operator runs.
//
//   Phase DEFAULT     — the CLI with no --terms must complete (exit 0) and
//                       walk the full default probe list: each letter a–z,
//                       then the module's default partial words, then the
//                       default exact name, in order.
//   Phase NO-LETTERS  — the CLI with --no-letters must complete (exit 0) and
//                       walk the same list WITHOUT the letters.
//
// Both phases run against two IDENTICAL engines, so beyond the probe list the
// walk must read clean: no capture-failed (a red engine is not a measurement)
// and no order-differs (identical decks cannot legitimately diverge).
//
//   node reference-harness/live-walk/prove/search-order-default-invocation-proof.mjs \
//     [--out tmp/search-order-default-invocation-lane] [--fixture synthetic-v1]
//
// The proof fails closed: any assertion failure exits non-zero, and the
// finally block stops both engines and removes the staged copies either way.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const { loadEngine, startEngine } = await import(
  pathToFileURL(path.join(repo, "reference-harness/browser/lib/engines.mjs")).href
);
const { DEFAULT_LETTER_PROBES, DEFAULT_PARTIAL_WORDS, DEFAULT_EXACT_NAME } = await import(
  pathToFileURL(path.join(repo, "reference-harness/live-walk/lib/search-order-compare.mjs")).href
);

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
const outDir = path.resolve(repo, args.out ?? "tmp/search-order-default-invocation-lane");
const fixtureName = args.fixture ?? "synthetic-v1";
const fixtureDir = path.join(repo, "reference-harness/fixtures", fixtureName);
mkdirSync(outDir, { recursive: true });

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const receipt = [];
const say = (line) => {
  console.log(line);
  receipt.push(line);
};

const assert = (cond, message) => {
  if (!cond) throw new Error(`PROOF ASSERTION FAILED: ${message}`);
};

/** Stage a private fixture copy with the proof's deterministic timestamp
 *  normalization (identical on every copy: same base file, same rowids). */
const stageNormalizedCopy = async () => {
  const root = mkdtempSync(path.join(tmpdir(), "decko-search-order-default-staged-"));
  const stagedFixture = path.join(root, "fixture");
  cpSync(fixtureDir, stagedFixture, { recursive: true });
  const deckPath = path.join(stagedFixture, "deck", "deck.sqlite3");
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(deckPath);
  db.prepare("UPDATE cards SET updated_at = datetime('2026-09-19 12:00:00', '+' || (rowid % 7000) || ' seconds')").run();
  const distinct = db.prepare("SELECT COUNT(DISTINCT updated_at) d, COUNT(*) n FROM cards").get();
  db.close();
  if (distinct.d !== distinct.n) throw new Error(`timestamp normalization left ties: ${distinct.d} distinct of ${distinct.n}`);
  return {
    stagedFixture,
    deckSha: sha256(readFileSync(deckPath)),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
};

/** Spawn the CLI the way an operator does — with (or without) the flag under
 *  proof, never --terms. Returns the parsed report; throws on any non-zero
 *  exit (the crash this proof anchors died with exit 1 before any probe). */
const runCli = async (cliArgs, hostA, hostB, reportPath) => {
  const cli = path.join(repo, "reference-harness/live-walk/compare-search-order.mjs");
  const proc = spawn(process.execPath, [cli, "--host-a", hostA, "--host-b", hostB, ...cliArgs, "--out", reportPath],
    { cwd: repo, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  proc.stdout.on("data", (b) => { out += b; });
  proc.stderr.on("data", (b) => { out += b; });
  const code = await new Promise((resolve) => proc.once("close", resolve));
  if (code !== 0) throw new Error(`compare-search-order CLI exited ${code}:\n${out}`);
  return { report: JSON.parse(readFileSync(reportPath, "utf8")), cliOutput: out };
};

const assertCleanWalk = (label, report, expectedTerms) => {
  assert(JSON.stringify(report.probes.map((p) => p.term)) === JSON.stringify(expectedTerms),
    `${label}: probe list is ${JSON.stringify(report.probes.map((p) => p.term))}, expected ${JSON.stringify(expectedTerms)}`);
  for (const probe of report.probes) {
    for (const [surface, v] of Object.entries(probe.surfaces)) {
      assert(v.kind !== "capture-failed", `${label}: capture failed on ${surface}/${JSON.stringify(probe.term)}: ${v.line}`);
      assert(v.kind !== "order-differs", `${label}: order-differs between identical engines on ${surface}/${JSON.stringify(probe.term)}: ${v.line}`);
    }
  }
  say(`[assert] ${label}: ${report.probes.length} probe terms walked in order, no capture-failed, no order-differs across identical engines`);
};

let engines = [];
const stagedCopies = [];
let exitCode = 0;
try {
  const engine = loadEngine(path.join(repo, "reference-harness/browser/engines/ts.json"));
  const copyA = await stageNormalizedCopy();
  stagedCopies.push(copyA);
  const copyB = await stageNormalizedCopy();
  stagedCopies.push(copyB);
  assert(copyA.deckSha === copyB.deckSha,
    `staged deck copies differ (A ${copyA.deckSha} vs B ${copyB.deckSha}) — the walk would not be identical-engine`);
  const engineA = await startEngine(engine, copyA.stagedFixture, { logFile: path.join(outDir, "default-proof-engine-a.log") });
  engines.push(engineA);
  const engineB = await startEngine(engine, copyB.stagedFixture, { logFile: path.join(outDir, "default-proof-engine-b.log") });
  engines.push(engineB);
  say(`engine A (normalized ${fixtureName}, deck sha ${copyA.deckSha.slice(0, 12)}): ${engineA.base} (boot ${engineA.bootMs} ms)`);
  say(`engine B (identical deck, sha ${copyB.deckSha.slice(0, 12)}): ${engineB.base} (boot ${engineB.bootMs} ms)`);

  say("\n=== PHASE DEFAULT: no --terms, no flags — the invocation that crashed before any probe ===");
  const expectedDefault = [...DEFAULT_LETTER_PROBES, ...DEFAULT_PARTIAL_WORDS, DEFAULT_EXACT_NAME];
  const def = await runCli([], engineA.base, engineB.base, path.join(outDir, "default-invocation-report.json"));
  for (const line of def.cliOutput.trimEnd().split("\n")) say(`    ${line}`);
  assertCleanWalk("DEFAULT", def.report, expectedDefault);

  say("\n=== PHASE NO-LETTERS: --no-letters must walk the list without the letters ===");
  const expectedNoLetters = [...DEFAULT_PARTIAL_WORDS, DEFAULT_EXACT_NAME];
  const noLetters = await runCli(["--no-letters"], engineA.base, engineB.base, path.join(outDir, "no-letters-invocation-report.json"));
  for (const line of noLetters.cliOutput.trimEnd().split("\n")) say(`    ${line}`);
  assertCleanWalk("NO-LETTERS", noLetters.report, expectedNoLetters);

  say(`\nPROOF COMPLETE: the default invocation walked ${def.report.probes.length} probe terms and --no-letters walked ${noLetters.report.probes.length}, both end-to-end against two local ts-engines.`);
} catch (e) {
  say(`\nPROOF FAILED: ${e.message}`);
  exitCode = 1;
} finally {
  for (const eng of engines) { try { await eng.stop(); } catch { /* best effort on a failed run */ } }
  for (const copy of stagedCopies) copy.cleanup();
  writeFileSync(path.join(outDir, "default-invocation-receipt.txt"), `${receipt.join("\n")}\n`);
  say(`receipt written: ${path.join(outDir, "default-invocation-receipt.txt")}`);
}
process.exit(exitCode);
