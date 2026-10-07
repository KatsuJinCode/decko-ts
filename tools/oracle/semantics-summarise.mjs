// semantics-summarise.mjs -- the report's tables from a comparison file.
//
//   node semantics-summarise.mjs <compare.json> <ruby1.json[,ruby2.json]>
//
// Prints: the headline, per-category and per-mod scores, the root-cause
// buckets (unreachable-by-id rows vs the rest), the view and event
// mismatches by mod, and the owner-agreement split (module naming only vs a
// different winning module).

import { readFileSync } from "node:fs";

const [comparePath, rubyPaths] = process.argv.slice(2);
const c = JSON.parse(readFileSync(comparePath, "utf8"));
const ruby = {};
for (const p of rubyPaths.split(",")) Object.assign(ruby, JSON.parse(readFileSync(p, "utf8")).answers);
const s = c.summary;
const pct = (a, b) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(2)}%`);

console.log(`HEADLINE ${s.passedItems}/${s.totalItems} = ${pct(s.passedItems, s.totalItems)}; not ported ${s.notPortedItems}; excluding not-ported ${pct(s.passedItems, s.totalItems - s.notPortedItems)}`);
console.log("\nCATEGORIES");
for (const [k, v] of Object.entries(s.byCategory)) console.log(`  ${k}: ${v.passed}/${v.items} ${pct(v.passed, v.items)} (${v.failing}/${v.questions} q failing)`);

// Root cause: rows Ruby cannot fetch by id.
const unreachable = new Set((ruby["136"] ?? []).filter((x) => x.fetch_by_id === null).map((x) => x.id));
let onUnreachable = 0;
const other = {};
for (const r of c.results) {
  if (r.status !== "fail") continue;
  for (const d of r.diffs ?? []) {
    const p = d.path.split(".");
    const rec = ruby[p[0]]?.[p[1]];
    if (r.kind === "id_fetch" || (rec && (rec.missing || unreachable.has(rec.id)))) { onUnreachable += 1; continue; }
    const key = `${r.kind}:${d.class}`;
    other[key] = (other[key] ?? 0) + 1;
  }
}
console.log(`\nDIFF RECORDS on rows Ruby cannot fetch by id: ${onUnreachable} (rows: ${unreachable.size})`);
console.log("DIFF RECORDS otherwise:", other);

for (const kind of ["view_defs_full", "event_defs_full"]) {
  const r = c.results.find((x) => x.kind === kind);
  console.log(`\n${kind}: ${r.passed}/${r.items} ${JSON.stringify(r.extra)}`);
  const byMod = {};
  for (const d of r.diffs) {
    if (d.class === "owner") continue;
    const mod = d.side === "ts-only" ? `ts-only` : d.rubyMod;
    const name = d.view ?? d.event;
    const m = (byMod[mod] ??= {});
    m[name] = (m[name] ?? 0) + 1;
  }
  for (const [mod, names] of Object.entries(byMod)) {
    const list = Object.entries(names).map(([n, k]) => `${n}(${k})`).join(" ");
    console.log(`  ${mod}: ${Object.values(names).reduce((a, b) => a + b, 0)} items, ${Object.keys(names).length} names: ${list}`);
  }
  if (kind === "view_defs_full") {
    const leaf = (o) => String(o).replace(/::(Html|Base)?Format$/, "").split(/::|\//).pop().toLowerCase().replace(/_/g, "");
    const pattern = (o) => String(o).replace(/^Card::Set::/, "").split(/::|\//)[0].toLowerCase();
    let namingOnly = 0;
    let differentWinner = 0;
    const winners = {};
    for (const d of r.diffs) {
      if (d.class !== "owner") continue;
      if (pattern(d.rubyOwner) === pattern(d.tsOwner) && leaf(d.rubyOwner) === leaf(d.tsOwner)) namingOnly += 1;
      else {
        differentWinner += 1;
        const k = `${d.view}: ruby ${d.rubyOwner} / ts ${d.tsOwner}`;
        winners[k] = (winners[k] ?? 0) + 1;
      }
    }
    console.log(`  owner disagreements: naming-only ${namingOnly}, different winning module ${differentWinner}`);
    for (const [k, v] of Object.entries(winners).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`    ${v} x ${k}`);
  }
}

console.log("\nPER MOD");
for (const [mod, m] of Object.entries(s.perMod).sort()) {
  const cats = Object.entries(m.byCategory).map(([k, v]) => `${k} ${v.passed}/${v.items}`).join(", ");
  console.log(`  ${mod}: ${m.passed}/${m.items} ${pct(m.passed, m.items)} (${cats})`);
}
