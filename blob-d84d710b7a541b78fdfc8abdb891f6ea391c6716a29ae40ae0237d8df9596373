#!/usr/bin/env node
// Runs the found-by integration manifest instrument and records what it wrote.
//
//   node tools/smell-row-r6/distill-found-by-manifest.mjs <evidence-tree-dir> <before-snapshot> <build-log> <out-file>
//
// The instrument is
// recovery/release/private-probes/private-tool-repairs-20261018/write-found-by-integration-manifest.mjs.
// It reads four things before it writes anything, and it refuses with
// "Qualified semantic, scoped and correctness evidence required" when the
// qualification does not hold and with "Pinned artifact mismatch" when the
// pinned bundle is not the one the scoped run measured.
//
// This tool does three things and writes only its own output file:
//
//   1. it runs the instrument, in the instrument's own directory, and keeps
//      the exit code and the line the instrument printed;
//   2. it reads the manifest of record the instrument wrote and compares it
//      with the snapshot taken before the run, field for field;
//   3. it checks the instrument's four inputs and its ten evidence gates, one
//      by one, against what is on this machine now.
//
// The evidence tree is only read. The manifest of record is written by the
// instrument itself, which is the point of the row.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const [treeDir, beforeSnapshot, buildLogPath, outFile] = process.argv.slice(2);
if (!treeDir || !beforeSnapshot || !buildLogPath || !outFile) {
  console.error(
    "usage: distill-found-by-manifest.mjs <evidence-tree-dir> <before-snapshot> <build-log> <out-file>",
  );
  process.exit(2);
}

const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

const instrumentPath = path.join(treeDir, "write-found-by-integration-manifest.mjs");
const manifestPath = path.join(treeDir, "found-by-type-integration", "manifest.json");
const equivalencePath = path.join(treeDir, "found-by-real-deck-equivalence-r2/receipt.json");
const scopePath = path.join(treeDir, "scoped-layout-6f960810-r2/completed.json");
const reportPath = path.join(treeDir, "scoped-layout-6f960810-r2/report.md.json");
const gatePath = path.join(treeDir, "found-by-type-id-correctness.log");
const bundle = "C:/localProjects/decko-edge-verification-b00a4503/.runtime/private-cql-6f960810-bundle/bunny-edge-engine.bundle.js";

// ---- 1. the instrument's own run -------------------------------------------

const run = spawnSync(process.execPath, [instrumentPath], {
  cwd: path.dirname(instrumentPath),
  encoding: "utf8",
  windowsHide: true,
  timeout: 600000,
});
const stdout = (run.stdout ?? "").trim();
const stderr = (run.stderr ?? "").trim();
let instrumentOutput = null;
try {
  instrumentOutput = stdout ? JSON.parse(stdout) : null;
} catch {
  instrumentOutput = null;
}

// ---- 2. the manifest of record, before and after ----------------------------

const before = existsSync(beforeSnapshot) ? readJson(beforeSnapshot) : null;
const after = existsSync(manifestPath) ? readJson(manifestPath) : null;
const withoutStamp = (value) => {
  if (!value) return null;
  const copy = { ...value };
  delete copy.at;
  return copy;
};
const contentIdenticalApartFromAt =
  before !== null &&
  after !== null &&
  JSON.stringify(withoutStamp(before)) === JSON.stringify(withoutStamp(after));

// ---- 3. the instrument's inputs and gates, one by one -----------------------

const present = (file) => existsSync(file);
const equivalence = present(equivalencePath) ? readJson(equivalencePath) : null;
const scope = present(scopePath) ? readJson(scopePath) : null;
const gate = present(gatePath) ? readFileSync(gatePath, "utf8") : null;

const check = (name, holds, detail) => ({ name, holds, detail });
const inputs = [
  check("the real-deck equivalence receipt is present", equivalence !== null, { path: equivalencePath, present: present(equivalencePath) }),
  check("the scoped-layout completion is present", scope !== null, { path: scopePath, present: present(scopePath) }),
  check("the scoped-layout report is present", present(reportPath), { path: reportPath, present: present(reportPath) }),
  check("the correctness gate log is present", gate !== null, { path: gatePath, present: present(gatePath) }),
];

const gates = [
  check("the equivalence run passed", equivalence?.pass === true, { pass: equivalence?.pass ?? null }),
  check("the equivalence run left the source clean", equivalence?.sourceClean === true, { sourceClean: equivalence?.sourceClean ?? null }),
  check("the equivalence run left the input unchanged", equivalence?.inputUnchanged === true, { inputUnchanged: equivalence?.inputUnchanged ?? null }),
  check(
    "the old and new CQL module differ",
    equivalence ? equivalence.oldCqlModuleSha256 !== equivalence.newCqlModuleSha256 : false,
    { old: equivalence?.oldCqlModuleSha256 ?? null, new: equivalence?.newCqlModuleSha256 ?? null },
  ),
  check("the scoped run passed every check", scope?.checks?.pass === 4 && scope?.checks?.total === 4, { checks: scope?.checks ?? null }),
  check("the scoped run left the source clean", scope?.sourceClean === true, { sourceClean: scope?.sourceClean ?? null }),
  check("the scoped run left the deck unchanged", scope?.deckUnchanged === true, { deckUnchanged: scope?.deckUnchanged ?? null }),
  check("the correctness gate reports 5954 passed", gate !== null && gate.includes("5954 passed"), { found: gate !== null && gate.includes("5954 passed") }),
  check("the correctness gate reports no failures", gate !== null && gate.includes('"failed":0'), { found: gate !== null && gate.includes('"failed":0') }),
  check("the pinned bundle is the one the scoped run measured", present(bundle) && scope ? hash(bundle) === scope.bundleSha256 : false, {
    path: bundle,
    present: present(bundle),
    sha256: present(bundle) ? hash(bundle) : null,
    expected: scope?.bundleSha256 ?? null,
  }),
];

const capture = {
  row: "write-found-by-integration-manifest",
  instrument:
    "recovery/release/private-probes/private-tool-repairs-20261018/write-found-by-integration-manifest.mjs",
  instrumentSha256: hash(instrumentPath),
  measuredAt: new Date().toISOString(),
  run: {
    command: "node write-found-by-integration-manifest.mjs",
    cwd: path.dirname(instrumentPath),
    exitCode: run.status,
    stdout,
    stderr,
    wroteManifest: run.status === 0 && after !== null,
  },
  manifestOfRecord: {
    path: manifestPath,
    sha256Before: beforeSnapshot && existsSync(beforeSnapshot) ? hash(beforeSnapshot) : null,
    sha256After: existsSync(manifestPath) ? hash(manifestPath) : null,
    atBefore: before?.at ?? null,
    atAfter: after?.at ?? null,
    contentIdenticalApartFromAt,
    source: after?.source ?? null,
    bundle: after?.bundle ?? null,
    dataSha256: after?.dataSha256 ?? null,
  },
  inputs,
  gates,
  pinnedBundle: {
    path: bundle,
    sha256: present(bundle) ? hash(bundle) : null,
    expected: scope?.bundleSha256 ?? null,
    rebuiltAt: "6f960810e3c9a1c5ab31fc0f4239c5d9f9a7ebf3",
    buildCommand: "node tools/bundle-bunny-edge-engine.mjs --out-dir .runtime/private-cql-6f960810-bundle",
    buildLogSha256: existsSync(buildLogPath) ? hash(buildLogPath) : null,
    buildLog: existsSync(buildLogPath) ? readFileSync(buildLogPath, "utf8") : null,
  },
  inputsPresent: inputs.filter((entry) => entry.holds).length,
  inputsTotal: inputs.length,
  gatesHolding: gates.filter((entry) => entry.holds).length,
  gatesTotal: gates.length,
  gatesFailing: gates.filter((entry) => !entry.holds).map((entry) => entry.name),
};

writeFileSync(outFile, `${JSON.stringify(capture, null, 2)}\n`);
console.log(
  `run exit ${capture.run.exitCode}, manifest written ${capture.run.wroteManifest}, ` +
    `content identical apart from at ${contentIdenticalApartFromAt}; ` +
    `inputs ${capture.inputsPresent}/${capture.inputsTotal}, gates ${capture.gatesHolding}/${capture.gatesTotal}; ` +
    `failing: ${capture.gatesFailing.join(", ")}`,
);
