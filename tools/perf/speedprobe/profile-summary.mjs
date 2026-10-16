// profile-summary.mjs — summarize a V8 .cpuprofile: self time per function
// (top N), and the callers of a named function. Sample-interval aware.
//
// Usage: node tools/perf/speedprobe/profile-summary.mjs <profile.cpuprofile> [--top 30]
//        [--callers DeckoName.parse] [--inclusive]
import { readFileSync } from "node:fs";

const profile = JSON.parse(readFileSync(process.argv[2], "utf8"));
const TOP = Number(process.argv[process.argv.indexOf("--top") + 1] ?? 30);
const CALLERS = process.argv.includes("--callers") ? process.argv[process.argv.indexOf("--callers") + 1] : null;

const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const selfSamples = new Map();
for (const id of profile.samples ?? []) selfSamples.set(id, (selfSamples.get(id) ?? 0) + 1);
const interval = (profile.endTime - profile.startTime) / (profile.samples?.length || 1) / 1000;
const nameOf = (n) => `${n.callFrame.functionName || "(anonymous)"} @${(n.callFrame.url || "").split("/").slice(-1)[0]}:${n.callFrame.lineNumber + 1}`;

// inclusive: sum a node's subtree
const childSamples = new Map();
const selfTotal = (id) => selfSamples.get(id) ?? 0;
function subtree(id) {
  if (childSamples.has(id)) return childSamples.get(id);
  let total = selfTotal(id);
  for (const c of byId.get(id)?.children ?? []) total += subtree(c);
  childSamples.set(id, total);
  return total;
}

const agg = new Map();
for (const [id, count] of selfSamples) {
  const n = byId.get(id); if (!n) continue;
  const key = nameOf(n);
  agg.set(key, (agg.get(key) ?? 0) + count);
}
console.log(`samples: ${profile.samples.length}, ~${interval.toFixed(2)} ms interval, span ${((profile.endTime - profile.startTime) / 1000).toFixed(0)} ms`);
console.log(`\ntop self time${CALLERS ? "" : ` (top ${TOP})`}:`);
[...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, CALLERS ? 5 : TOP)
  .forEach(([k, c]) => console.log(`${String((c * interval).toFixed(0)).padStart(6)} ms  ${k}`));

if (CALLERS) {
  const callers = new Map();
  for (const [id] of selfSamples) {
    const n = byId.get(id); if (!n || !nameOf(n).startsWith(CALLERS)) continue;
    const pid = parent.get(id); const pn = pid ? byId.get(pid) : null;
    const key = pn ? nameOf(pn) : "(root)";
    callers.set(key, (callers.get(key) ?? 0) + 1);
  }
  console.log(`\ncallers of ${CALLERS} (self samples):`);
  [...callers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, c]) => console.log(`${String((c * interval).toFixed(0)).padStart(6)} ms  ${k}`));
}

// inclusive per function name
const incl = new Map();
for (const n of profile.nodes) {
  const key = nameOf(n);
  incl.set(key, Math.max(incl.get(key) ?? 0, subtree(n.id)));
}
console.log(`\ntop inclusive (max single node) top ${TOP}:`);
[...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP).forEach(([k, c]) => console.log(`${String((c * interval).toFixed(0)).padStart(6)} ms  ${k}`));