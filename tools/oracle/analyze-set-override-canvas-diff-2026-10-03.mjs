// analyze-set-override-canvas-diff-2026-10-03.mjs
//
// Blast-radius adjudication for the set-override-fidelity lane (RELAUNCH #4):
// diffs THIS lane's full-canvas per-entry failures against the grade-9 base of
// record (7e843131 = this branch's base tip, committed at
// WORK_DIR/grade9-run4b-canvas-artifacts/
// 7e843131-full-fails.json).
//
//   FIXED  = base fail that passes on this tip — legal ONLY for the four
//            view-lane W5 record entries the targeted probe proved RED->GREEN
//            (dual-lane-view:{*alerts,*now,*version,*input type+*right+*content
//            options}:record); anything else is a mover that must be
//            adjudicated from Ruby, never silently accepted.
//   NEW    = this tip fails where base passed — MUST be zero (the port's only
//            graded caller is the view-lane record handler; any NEW fail is a
//            regression the lane has to explain).
//   STICKY = failing in both (Mod:record stays, the documented loud
//            divergence).
//
// Usage: node tools/oracle/analyze-set-override-canvas-diff-2026-10-03.mjs \
//          <artifacts-dir-with-w0-view.json-and-w0-page.json> [base-fails-json]
// Read-only; writes its verdict JSON beside the artifacts it read.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const artifactsDir = process.argv[2];
const basePath =
  process.argv[3] ??
  "WORK_DIR/grade9-run4b-canvas-artifacts/7e843131-full-fails.json";
if (!artifactsDir) {
  console.error("usage: analyze-set-override-canvas-diff-2026-10-03.mjs <artifacts-dir> [base-fails-json]");
  process.exit(2);
}

// The base ids mix two spellings ("dual-lane-page: X" and "dual-lane-view:X");
// normalize to the runner's own "dual-lane-<lane>:<name>:<slot>" form.
const norm = (id) => String(id).replace(/^dual-lane-(view|page):\s*/, "dual-lane-$1:");

const base = JSON.parse(readFileSync(basePath, "utf8"));
const baseFails = new Map();
for (const f of base.fails) baseFails.set(norm(f.id), f);

const viewOutcome = JSON.parse(readFileSync(path.join(artifactsDir, "w0-view.json"), "utf8"));
const pageOutcome = JSON.parse(readFileSync(path.join(artifactsDir, "w0-page.json"), "utf8"));
// The per-worker lane artifact nests its per-entry failure records under
// attribution.failures; there is no top-level `failures` key. Reading the
// wrong path yields tip fails=0 and reports every base fail as "fixed".
// Fail loudly if neither shape is present rather than diffing against nothing.
const outcomeFails = (outcome) => {
  const list = outcome.attribution?.failures ?? outcome.failures;
  if (!Array.isArray(list)) {
    throw new Error(
      `lane artifact for ${outcome.attribution?.lane ?? "?"} has no attribution.failures array ` +
        `(top-level keys: ${Object.keys(outcome).join(", ")})`,
    );
  }
  return list;
};
const myFails = new Map();
for (const outcome of [viewOutcome, pageOutcome]) {
  for (const f of outcomeFails(outcome)) myFails.set(norm(f.id), f);
}

const fixed = [];
const newFails = [];
const sticky = [];
for (const [id, f] of baseFails) {
  if (myFails.has(id)) sticky.push(f);
  else fixed.push(f);
}
for (const [id, f] of myFails) {
  if (!baseFails.has(id)) newFails.push(f);
}

const LEGAL_FIXED = new Set([
  "dual-lane-view:*alerts:record",
  "dual-lane-view:*now:record",
  "dual-lane-view:*version:record",
  "dual-lane-view:*input type+*right+*content options:record",
]);
const illegalFixed = fixed.filter((f) => !LEGAL_FIXED.has(norm(f.id)));

const verdict = {
  what: "set-override-fidelity blast-radius adjudication: this tip vs grade-9 base 7e843131",
  base: basePath,
  baseFailCount: baseFails.size,
  tipFailCount: myFails.size,
  viewAggregate: { entries: viewOutcome.entries, pass: viewOutcome.pass, fail: viewOutcome.fail },
  pageAggregate: { entries: pageOutcome.entries, pass: pageOutcome.pass, fail: pageOutcome.fail },
  fixed: fixed.map((f) => ({ id: norm(f.id), lane: f.lane, shard: f.shard, legal: LEGAL_FIXED.has(norm(f.id)) })),
  illegalFixed: illegalFixed.map((f) => norm(f.id)),
  newFails: newFails.map((f) => ({ id: norm(f.id), lane: f.lane, shard: f.shard, sig: f.sig })),
  stickyCount: sticky.length,
  stickyRecordIds: sticky.map((f) => norm(f.id)).filter((id) => id.endsWith(":record")),
  verdict:
    illegalFixed.length === 0 && newFails.length === 0
      ? "PASS — every movement is exactly the 4 proven RED->GREEN W5 view-lane records; zero new fails"
      : "ADJUDICATE — movement outside the probe-proven set exists; every entry must be adjudicated from Ruby",
};

writeFileSync(
  path.join(artifactsDir, "blast-radius-adjudication.json"),
  JSON.stringify(verdict, null, 2),
);

console.log(`base fails=${baseFails.size} tip fails=${myFails.size}`);
console.log(`tip artifact counts: view entries=${viewOutcome.entries} pass=${viewOutcome.pass.total} fail=${viewOutcome.fail.total} | page entries=${pageOutcome.entries} pass=${pageOutcome.pass.total} fail=${pageOutcome.fail.total}`);
console.log(`fixed=${fixed.length} (illegal=${illegalFixed.length}) new=${newFails.length} sticky=${sticky.length}`);
for (const f of fixed) console.log(`  FIXED ${norm(f.id)} legal=${LEGAL_FIXED.has(norm(f.id))}`);
for (const f of newFails.slice(0, 20)) console.log(`  NEW ${norm(f.id)} sig=${f.sig}`);
for (const id of verdict.stickyRecordIds) console.log(`  STICKY(record) ${id}`);
console.log(`verdict: ${verdict.verdict}`);
process.exit(illegalFixed.length === 0 && newFails.length === 0 ? 0 : 1);
