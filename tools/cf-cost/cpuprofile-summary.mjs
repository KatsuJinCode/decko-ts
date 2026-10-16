// tools/cf-cost/cpuprofile-summary.mjs — summarize a .cpuprofile: self time by function
// and by source file, and inclusive time for the engine entry points.
import { readFileSync } from "node:fs";
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const profile = JSON.parse(readFileSync(process.argv[2], "utf8"));
const top = Number(process.argv[3] ?? 40);
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const parentOf = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parentOf.set(c, n.id);
// Only samples inside the Worker's fetch() (the default export's method), so
// bundle compile, seed import and the harness's own loop are excluded.
function insideFetch(id) {
  let cur = id;
  while (cur !== undefined) {
    const cf = nodes.get(cur).callFrame;
    if (cf.functionName === "fetch" && cf.url.endsWith("profile-worker.mjs")) return true;
    cur = parentOf.get(cur);
  }
  return false;
}
const selfUs = new Map();
const dtUs = profile.timeDeltas;
const samples = profile.samples;
for (let i = 0; i < samples.length; i++) {
  const id = samples[i];
  if (process.env.ONLY_FETCH && !insideFetch(id)) continue;
  selfUs.set(id, (selfUs.get(id) ?? 0) + (dtUs[i] ?? 0));
}
const total = [...selfUs.values()].reduce((a, b) => a + b, 0);

const byFn = new Map();
const byFile = new Map();
for (const [id, us] of selfUs) {
  const n = nodes.get(id);
  const cf = n.callFrame;
  const fn = `${cf.functionName || "(anon)"} ${cf.url.split("/").pop()}:${cf.lineNumber + 1}`;
  byFn.set(fn, (byFn.get(fn) ?? 0) + us);
  let file = cf.url || `(${cf.functionName || 'native'})`;
  if (cf.url?.startsWith('file:')) {
    try { file = relative(process.cwd(), fileURLToPath(cf.url)).split(sep).join('/'); }
    catch { /* Non-file source labels retain the profiler's original text. */ }
  }
  byFile.set(file, (byFile.get(file) ?? 0) + us);
}

const pct = (us) => ((100 * us) / total).toFixed(1).padStart(5);
console.log(`total sampled ${(total / 1000).toFixed(0)} ms`);
console.log("\n== self time by file");
for (const [f, us] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, top)) {
  console.log(`${pct(us)}%  ${(us / 1000).toFixed(1).padStart(8)} ms  ${f}`);
}
console.log("\n== self time by function");
for (const [f, us] of [...byFn].sort((a, b) => b[1] - a[1]).slice(0, top)) {
  console.log(`${pct(us)}%  ${(us / 1000).toFixed(1).padStart(8)} ms  ${f}`);
}

// Inclusive time per named function (sum over every node carrying that name).
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const inclusive = new Map();
for (const [id, us] of selfUs) {
  const seen = new Set();
  let cur = id;
  while (cur !== undefined) {
    const n = nodes.get(cur);
    const key = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber + 1}`;
    if (!seen.has(key)) {
      inclusive.set(key, (inclusive.get(key) ?? 0) + us);
      seen.add(key);
    }
    cur = parent.get(cur);
  }
}
const want = (process.argv[4] ?? "").split(",").filter(Boolean);
if (want.length) {
  console.log("\n== inclusive time for selected functions");
  for (const [k, us] of [...inclusive].filter(([k]) => want.some((w) => k.includes(w))).sort((a, b) => b[1] - a[1]).slice(0, 60)) {
    console.log(`${pct(us)}%  ${(us / 1000).toFixed(1).padStart(8)} ms  ${k}`);
  }
}
