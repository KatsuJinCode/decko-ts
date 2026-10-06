// survey-slot-id-conventions.mjs -- measure the slot-id convention each lane's
// corpus actually carries, and whether the committed mask covers it.
//
// WHY THIS LANE NEEDS IT. R2's transform splices the engine's frozen bytes
// into the corpus after rewriting `data-slot-id=<q>20-hex<q>` to
// `data-slot-id="RANDOMIZED"` (diff.ts:26-40: the id is EXACTLY 20 lowercase
// hex, "the strict length is deliberate - a TS engine emitting a
// different-length id is a real divergence and must survive normalization").
// That rule is safe on the view lane only if the view lane's corpus carries
// either the placeholder or 20-hex. If the PAGE lane carries a DIFFERENT
// length, the mask does not fire, the ids are compared literally, and a byte
// splice of the engine's output would write the engine's own per-render ids
// into the corpus -- which the next render would not reproduce. This measures
// the lengths per lane before any transform is built.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const CORPUS = process.argv.includes("--corpus")
  ? process.argv[process.argv.indexOf("--corpus") + 1]
  : "tmp/raw-ground-truth";
const LANES = (process.argv.includes("--lanes") ? process.argv[process.argv.indexOf("--lanes") + 1] : "view-lane,page-lane")
  .split(",")
  .filter(Boolean);

const idRe = /data-slot-id=(["'])([^"']*)\1/g;
const MASKED = /data-slot-id=(["'])[0-9a-f]{20}\1/g; // diff.ts SLOT_ID_PATTERN

for (const lane of LANES) {
  const dir = path.join(CORPUS, "expected-v2", lane);
  const byLength = new Map();
  const quoteStyle = new Map();
  let total = 0;
  let maskedByRule = 0;
  let placeholders = 0;
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".jsonl")) continue;
    const text = readFileSync(path.join(dir, f), "utf8");
    for (const m of text.matchAll(idRe)) {
      const v = m[2];
      total += 1;
      quoteStyle.set(m[1], (quoteStyle.get(m[1]) || 0) + 1);
      if (v === "RANDOMIZED") { placeholders += 1; continue; }
      byLength.set(v.length, (byLength.get(v.length) || 0) + 1);
    }
    maskedByRule += (text.match(MASKED) || []).length;
  }
  const lens = [...byLength.entries()].sort((a, b) => a[0] - b[0]);
  console.log(`LANE ${lane}: data-slot-id occurrences=${total}`);
  console.log(`  placeholder RANDOMIZED = ${placeholders}`);
  console.log(`  MATCHED by diff.ts 20-hex rule = ${maskedByRule}`);
  console.log(`  non-placeholder value lengths = ${lens.map(([l, n]) => `${l}hex:${n}`).join(" ") || "(none)"}`);
  console.log(`  quote styles = ${[...quoteStyle.entries()].map(([q, n]) => `${q === '"' ? "double" : "single"}:${n}`).join(" ")}`);
  const lengths = lens.map(([l]) => l);
  console.log(
    `  VERDICT: ${maskedByRule + placeholders === total
      ? "FULLY MASKED - the committed mask covers every id on this lane"
      : `NOT FULLY MASKED - ${total - maskedByRule - placeholders} ids survive normalization and are compared LITERALLY`}`,
  );
}
