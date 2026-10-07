// semantics-summarise.mjs -- group a compare.json's diffs by question kind and
// field, with counts and a few samples per group, for root-cause triage.
// usage: node semantics-summarise.mjs <compare.json> [kind-filter]
import { readFileSync } from "node:fs";

const [path, filter] = process.argv.slice(2);
const { results } = JSON.parse(readFileSync(path, "utf8"));
const groups = new Map();
for (const r of results) {
  if (filter && r.kind !== filter) continue;
  for (const d of r.diffs ?? []) {
    const field = d.path.split(".").slice(1).filter((p) => !/^\d+$/.test(p)).join(".") || "(root)";
    const key = `${r.kind} :: ${field} :: ${d.class}`;
    const g = groups.get(key) ?? { n: 0, samples: [] };
    g.n += 1;
    if (g.samples.length < 4) g.samples.push(d);
    groups.set(key, g);
  }
}
for (const [k, g] of [...groups].sort((x, y) => y[1].n - x[1].n)) {
  process.stdout.write(`${g.n}\t${k}\n`);
  for (const s of g.samples) process.stdout.write(`\t\t${JSON.stringify(s).slice(0, 400)}\n`);
}
