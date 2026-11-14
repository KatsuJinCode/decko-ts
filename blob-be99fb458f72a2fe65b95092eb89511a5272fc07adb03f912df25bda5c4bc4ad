// ab-summary.mjs — median wall/trips/statements per scenario from an
// interleaved A/B probe log (lines "RUN <label>" then probe lines).
import { readFileSync } from "node:fs";
const text = readFileSync(process.argv[2], "utf8");
const agg = {};
let cur = "";
for (const line of text.split("\n")) {
  const r = /^RUN (base|after)/.exec(line);
  if (r) { cur = r[1]; continue; }
  const m = /^\s*(\d+) ms\s+(\d+)\s+(GET|POST)\s+(\S+)\s+\[([^\]]+)\] trips=(\d+) stmts=(\d+)/.exec(line);
  if (!m) continue;
  const key = m[5];
  (agg[key] ??= { base: [], after: [] })[cur].push({ ms: Number(m[1]), trips: Number(m[6]), stmts: Number(m[7]) });
}
const med = (a) => { const s = [...a].sort((x, y) => x.ms - y.ms); return s[Math.floor(s.length / 2)]; };
for (const [k, v] of Object.entries(agg)) {
  if (!v.base.length || !v.after.length) { console.log(`${k.padEnd(18)} missing data`); continue; }
  const b = med(v.base), a = med(v.after);
  const pct = (((a.ms - b.ms) / b.ms) * 100).toFixed(0);
  console.log(`${k.padEnd(18)} base ${String(b.ms).padStart(5)}ms t=${String(b.trips).padStart(3)} s=${String(b.stmts).padStart(4)} (n=${v.base.length}) | after ${String(a.ms).padStart(5)}ms t=${String(a.trips).padStart(3)} s=${String(a.stmts).padStart(4)} (n=${v.after.length}) | delta ${String(a.ms - b.ms).padStart(5)}ms ${pct}%`);
}