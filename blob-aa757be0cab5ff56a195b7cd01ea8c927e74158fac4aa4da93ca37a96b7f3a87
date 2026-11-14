#!/usr/bin/env node
// Checks the inputs the found-by integration manifest instrument reads, one by
// one, against what is on this machine now.
//
//   node tools/smell-row-r5/distill-found-by-manifest.mjs <evidence-tree-dir> <out-file>
//
// The instrument is
// recovery/release/private-probes/private-tool-repairs-20261018/write-found-by-integration-manifest.mjs.
// It reads four things before it writes anything, and it refuses with
// "Qualified semantic, scoped and correctness evidence required" when the
// qualification does not hold and with "Pinned artifact mismatch" when the
// pinned bundle is not the one the scoped run measured.
//
// Each input is checked here on its own, so the receipt can name WHICH input
// is missing rather than that the instrument failed.
//
// Nothing here writes the manifest and nothing here writes to the evidence tree.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [treeDir, outFile] = process.argv.slice(2);
if (!treeDir || !outFile) {
  console.error("usage: distill-found-by-manifest.mjs <evidence-tree-dir> <out-file>");
  process.exit(2);
}

const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

const equivalencePath = path.join(treeDir, "found-by-real-deck-equivalence-r2/receipt.json");
const scopePath = path.join(treeDir, "scoped-layout-6f960810-r2/completed.json");
const reportPath = path.join(treeDir, "scoped-layout-6f960810-r2/report.md.json");
const gatePath = path.join(treeDir, "found-by-type-id-correctness.log");
const bundle = "C:/localProjects/decko-edge-verification-b00a4503/.runtime/private-cql-6f960810-bundle/bunny-edge-engine.bundle.js";

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
  measuredAt: new Date().toISOString(),
  inputs,
  gates,
  inputsPresent: inputs.filter((entry) => entry.holds).length,
  inputsTotal: inputs.length,
  gatesHolding: gates.filter((entry) => entry.holds).length,
  gatesTotal: gates.length,
  gatesFailing: gates.filter((entry) => !entry.holds).map((entry) => entry.name),
};

writeFileSync(outFile, `${JSON.stringify(capture, null, 2)}\n`);
console.log(
  `inputs ${capture.inputsPresent}/${capture.inputsTotal}, gates ${capture.gatesHolding}/${capture.gatesTotal}; ` +
    `failing: ${capture.gatesFailing.join(", ")}`,
);
