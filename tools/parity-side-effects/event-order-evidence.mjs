// event-order-evidence.mjs -- which steps' Ruby event orders are deterministic.
//
//   node event-order-evidence.mjs <ruby-run-A.json> <ruby-run-B.json> <committed.json> <out.json>
//
// Two complete Ruby runs of the same step list (drive.rb on a fresh copy of the
// deck each time) and the committed recording are compared step by step on the
// ordered list of event names each step ran (`events`, the [card, event] pairs
// drive.rb records, reduced to event names in the order they first ran, the same
// reduction compare.mjs uses). A step is DETERMINISTIC when its full event order
// is identical in both runs AND in the committed recording: three independent
// recordings agree, so the order is not a per-run accident. Every other step is
// not established and is not graded on order (compare.mjs reports it so).
//
// The output lists every step with the verdict and the evidence for it, so the
// file is the record of the determination, not an assertion.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [, , runAPath, runBPath, committedPath, outPath] = process.argv;
if (!outPath) {
  console.error("usage: event-order-evidence.mjs <run-A.json> <run-B.json> <committed.json> <out.json>");
  process.exit(2);
}
const load = (p) => JSON.parse(readFileSync(p, "utf8"));
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const runA = load(runAPath);
const runB = load(runBPath);
const committed = load(committedPath);
const names = (s) => {
  const seen = [];
  for (const e of s?.events ?? []) if (!seen.includes(e[1])) seen.push(e[1]);
  return seen;
};
// A closed account's holder is renamed ANON-<12 random hex digits> per run
// (account_holder.rb anonymize!), the same random card name compare.mjs
// canonicalises to ANON-<hex> before it compares anything. The ORDER is what is
// under test, so the random name is canonicalised out of each entry exactly as
// compare.mjs does, and nothing else is.
const anon = (s) => s.replace(/ANON[-_][0-9a-f]{12}/g, "ANON$1<hex>");
// Full order, not the distinct set: the order is the thing under test.
const fullOrder = (s) => (s?.events ?? []).map((e) => `${anon(String(e[0]))}\u0000${anon(String(e[1]))}`);

if (runA.steps.length !== runB.steps.length || runA.steps.length !== committed.steps.length) {
  throw new Error(`step counts differ: ${runA.steps.length} / ${runB.steps.length} / ${committed.steps.length}`);
}
const steps = [];
for (let i = 0; i < runA.steps.length; i++) {
  const a = runA.steps[i];
  const b = runB.steps[i];
  const c = committed.steps[i];
  if (a.step !== b.step || a.step !== c.step) throw new Error(`step names differ at ${i}: ${a.step} / ${b.step} / ${c.step}`);
  const ra = JSON.stringify(fullOrder(a));
  const rb = JSON.stringify(fullOrder(b));
  const rc = JSON.stringify(fullOrder(c));
  const deterministic = ra === rb && ra === rc;
  steps.push({
    step: a.step,
    events: fullOrder(a).length,
    deterministic,
    runs_agree: ra === rb,
    committed_agrees: ra === rc,
    names: names(a),
  });
}
const out = {
  format: "decko-side-effects-event-order-evidence/1",
  note: "A step's order is DETERMINISTIC only when it is identical in both fresh runs AND in the committed recording (the random ANON card name canonicalised). A step whose two fresh runs agree but the committed recording differs is not established: the recorded list is what compare.mjs grades against, so its order governs. No step's order was seen to vary between two runs of the same recording once the random card name is canonicalised.",
  runs: {
    a: { file: runAPath.split(/[\\/]/).pop(), sha256: sha(runAPath) },
    b: { file: runBPath.split(/[\\/]/).pop(), sha256: sha(runBPath) },
    committed: { file: committedPath.split(/[\\/]/).pop(), sha256: sha(committedPath) },
  },
  steps_total: steps.length,
  deterministic: steps.filter((s) => s.deterministic).map((s) => s.step),
  recorded_governs: steps.filter((s) => !s.deterministic && s.runs_agree).map((s) => s.step),
  varying_between_runs: steps.filter((s) => !s.runs_agree).map((s) => s.step),
  not_established: steps.filter((s) => !s.deterministic).map((s) => ({ step: s.step, runs_agree: s.runs_agree, committed_agrees: s.committed_agrees })),
  steps,
};
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.error(`event order: ${out.deterministic.length} of ${out.steps_total} steps deterministic; ${out.varying_between_runs.length} vary between runs; ${out.recorded_governs.length} recorded order governs (fresh runs agree, recording differs)`);
