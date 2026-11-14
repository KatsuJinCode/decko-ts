#!/usr/bin/env node
// Checks the six custody clauses the final manifest instrument checks, one by
// one, against what is on this machine now.
//
//   node tools/smell-row-r5/distill-a253-custody.mjs <evidence-tree-dir> <out-file>
//
// The instrument is
// recovery/release/private-probes/private-tool-repairs-20261018/write-final-a253-manifest.mjs.
// It refuses with "Exact final source/artifact/data custody mismatch" when any
// of its six clauses fails, so the clauses are evaluated here one at a time
// and each one records the fact it turns on.
//
// The evidence tree is the instrument's own directory. The pinned checkout and
// the pinned build output it names are absolute paths, and they are read here
// exactly as the instrument reads them.
//
// Nothing here writes to the evidence tree and nothing here writes a manifest.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [treeDir, outFile] = process.argv.slice(2);
if (!treeDir || !outFile) {
  console.error("usage: distill-a253-custody.mjs <evidence-tree-dir> <out-file>");
  process.exit(2);
}

const readJson = (name) => JSON.parse(readFileSync(path.join(treeDir, name), "utf8"));
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

const source = "a25329a805202bf4ee5879f084fd028c90058215";
const repo = "C:/localProjects/decko-edge-verification-53c86269";
const pinned = `${repo}/.runtime/private-final-f044d5af-bundle/bunny-edge-engine.bundle.js`;
const terminal = readJson("strengthened-full-complete-a25329a8/completed.json");
const data = JSON.parse(
  readFileSync(new URL("../authorized-widget-content-20261018-r2/application-receipt.json", `file:///${treeDir.replace(/\\/g, "/")}/`)),
);

// The pinned checkout may be absent from this machine, and git writes its own
// complaint when it is. The complaint is not evidence, so it is not collected:
// the clause records the absence instead.
const git = (...args) => {
  try {
    return execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};

const head = git("rev-parse", "HEAD");
const status = git("status", "--porcelain");

const clause = (name, holds, detail) => ({ name, holds, detail });
const clauses = [
  clause(
    "the checkout's HEAD is the exact source commit",
    head === source,
    { path: repo, present: existsSync(repo), head, expected: source },
  ),
  clause("the checkout is clean", status === "", { path: repo, present: existsSync(repo), statusPorcelain: status }),
  clause("the capture's terminal source is the same commit", terminal.source === source, {
    terminalSource: terminal.source,
    expected: source,
  }),
  clause("the pinned bundle hashes to the capture's bundle hash", existsSync(pinned) && hash(pinned) === terminal.bundleSha256, {
    path: pinned,
    present: existsSync(pinned),
    sha256: existsSync(pinned) ? hash(pinned) : null,
    expected: terminal.bundleSha256,
  }),
  clause("the restored deck hashes to the receipt's target hash", existsSync(data.target) && hash(data.target) === data.targetSha256, {
    path: data.target,
    present: existsSync(data.target),
    sha256: existsSync(data.target) ? hash(data.target) : null,
    expected: data.targetSha256,
  }),
  clause("the baseline deck hashes to the receipt's baseline hash", existsSync(data.baseline) && hash(data.baseline) === data.baselineSha256, {
    path: data.baseline,
    present: existsSync(data.baseline),
    sha256: existsSync(data.baseline) ? hash(data.baseline) : null,
    expected: data.baselineSha256,
  }),
];

const capture = {
  row: "write-final-a253-manifest",
  instrument:
    "recovery/release/private-probes/private-tool-repairs-20261018/write-final-a253-manifest.mjs",
  measuredAt: new Date().toISOString(),
  source,
  clauses,
  clausesHolding: clauses.filter((entry) => entry.holds).length,
  clausesCheckableHere: clauses.filter((entry) => entry.detail.present !== false).length,
  clausesFailing: clauses.filter((entry) => !entry.holds).map((entry) => entry.name),
};

writeFileSync(outFile, `${JSON.stringify(capture, null, 2)}\n`);
console.log(
  `clauses holding ${capture.clausesHolding} of ${clauses.length}; failing: ` +
    `${capture.clausesFailing.join(", ")}`,
);
