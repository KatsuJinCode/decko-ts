#!/usr/bin/env node
// Compares two runs of the same engine on the same fixture, raw, to show what
// varies between runs and that the masks cover exactly that. This is the
// evidence a mask needs (reference-harness/SPEC.md, "Normalisation"): run it
// on two complete oracle runs; "unexplained" must be empty, and every mask
// must have matched values that actually differed.
//
//   node reference-harness/runner/compare-runs.mjs <runA> <runB> [--json <out.json>]
//
// Exit status 0 when every raw difference is explained by a mask, 1 otherwise.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { SLOT_ID, normalizeRender, sameJson } from "./normalize.mjs";

const [a, b, ...rest] = process.argv.slice(2);
const jsonOut = rest[0] === "--json" ? rest[1] : null;
if (!a || !b) {
  console.error("usage: compare-runs.mjs <runA> <runB> [--json <out.json>]");
  process.exit(2);
}

const read = (dir, kind) => {
  const f = path.join(dir, `${kind}.jsonl`);
  const text = existsSync(f) ? readFileSync(f, "utf8") : gunzipSync(readFileSync(f + ".gz")).toString("utf8");
  return new Map(text.split("\n").filter((l) => l.trim()).map((l) => { const j = JSON.parse(l); return [j.id, j]; }));
};
/** Every slot id N1 matches in any string of a recorded line, in order. */
const slotValues = (value) => {
  if (typeof value === "string") return [...value.matchAll(SLOT_ID)].map((m) => m[0]);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(slotValues);
  return [];
};

const result = { runs: [path.resolve(a), path.resolve(b)], kinds: {}, masks: { N1: { matched_pairs: 0, differing_pairs: 0 } }, unexplained: [] };
for (const kind of ["render", "semantics", "scenarios"]) {
  const A = read(a, kind);
  const B = read(b, kind);
  const k = { items: A.size, raw_equal: 0, equal_after_masks: 0, unexplained: 0 };
  if (A.size !== B.size || [...A.keys()].some((id) => !B.has(id))) result.unexplained.push(`${kind}: the runs hold different operations`);
  for (const [id, x] of A) {
    const y = B.get(id);
    if (!y) continue;
    if (JSON.stringify(x) === JSON.stringify(y)) {
      k.raw_equal++;
      continue;
    }
    const va = slotValues(x);
    const vb = slotValues(y);
    result.masks.N1.matched_pairs += Math.min(va.length, vb.length);
    va.forEach((v, i) => { if (vb[i] !== undefined && vb[i] !== v) result.masks.N1.differing_pairs++; });
    // Masked as the grader masks: render HTML by N1, everything else raw.
    const norm = (line) =>
      kind === "render"
        ? { ...line, result: normalizeRender(line.result) }
        : kind === "scenarios"
          ? { ...line, steps: line.steps.map((s) => ({ ...s, result: normalizeRender(s.result) })) }
          : line;
    if (sameJson(norm(x), norm(y))) k.equal_after_masks++;
    else {
      k.unexplained++;
      result.unexplained.push(`${kind} ${id}`);
    }
  }
  result.kinds[kind] = k;
}

for (const [kind, k] of Object.entries(result.kinds)) {
  console.log(`${kind.padEnd(10)} ${k.items} items: ${k.raw_equal} identical, ${k.equal_after_masks} equal after masks, ${k.unexplained} unexplained`);
}
console.log(`N1 slot ids: ${result.masks.N1.differing_pairs} of ${result.masks.N1.matched_pairs} paired values differ between the runs`);
for (const u of result.unexplained) console.log(`unexplained: ${u}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(result, null, 2) + "\n");
process.exit(result.unexplained.length ? 1 : 0);
