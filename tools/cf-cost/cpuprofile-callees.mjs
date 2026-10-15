// tools/cf-cost/cpuprofile-callees.mjs — inclusive time of the callees of a named
// function, summed over every call stack in the profile.
// Usage: node children.mjs <file.cpuprofile> <functionName> [depth]
import { readFileSync } from "node:fs";

const [file, target, depthArg] = process.argv.slice(2);
const depthLimit = Number(depthArg ?? 1);
const profile = JSON.parse(readFileSync(file, "utf8"));
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const parentOf = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parentOf.set(c, n.id);
const selfUs = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  selfUs.set(profile.samples[i], (selfUs.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0));
}
const label = (id) => {
  const cf = nodes.get(id).callFrame;
  return `${cf.functionName || "(anon)"} ${cf.url.split("/").pop()}:${cf.lineNumber + 1}`;
};
const totals = new Map();
let targetTotal = 0;
for (const [id, us] of selfUs) {
  // Walk up; remember the path from the target down to this sample.
  const path = [];
  let cur = id;
  let found = -1;
  while (cur !== undefined) {
    const cf = nodes.get(cur).callFrame;
    path.push(cur);
    if (cf.functionName === target) {
      found = path.length - 1;
      break;
    }
    cur = parentOf.get(cur);
  }
  if (found < 0) continue;
  targetTotal += us;
  // path[0] is the sample's leaf; path[found] is the target; callees sit between.
  const seen = new Set();
  for (let k = found - 1; k >= 0 && found - k <= depthLimit; k--) {
    const key = label(path[k]);
    if (seen.has(key)) continue;
    seen.add(key);
    totals.set(key, (totals.get(key) ?? 0) + us);
  }
  if (found === 0) totals.set("(self)", (totals.get("(self)") ?? 0) + us);
}
const pct = (us) => ((100 * us) / targetTotal).toFixed(1).padStart(5);
console.log(`${target}: inclusive ${(targetTotal / 1000).toFixed(1)} ms`);
for (const [k, us] of [...totals].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`${pct(us)}%  ${(us / 1000).toFixed(1).padStart(8)} ms  ${k}`);
}
