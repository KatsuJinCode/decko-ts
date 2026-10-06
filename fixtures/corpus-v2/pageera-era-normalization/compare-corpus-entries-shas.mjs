// compare-corpus-entries-shas.mjs -- hash EVERY entry in a corpus tree's
// expectation shards, before and after, and report exactly which entries moved.
//
// This is the lane's SPILL control, and it is deliberately a whole-lane census
// rather than a 500-entry sample. R2's step 4 drew a 500-entry control and its
// step 7(b) then had to concede that the draw's isolation claim was false (3 of
// the 26 shards it drew from were in fact transformed). A sample cannot settle
// "did the transform touch anything it did not name" -- a census can, because
// it enumerates every entry instead of inferring. The 500-sample the mandate
// names is still run and reported; this is the control that actually binds.
//
// KEYS are the record's own identity (shard + name), never its line index, so a
// reordering of lines cannot masquerade as movement.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const arg = (f, d) => (process.argv.includes(f) ? process.argv[process.argv.indexOf(f) + 1] : d);
const A = arg("--a", "tmp/raw-ground-truth");
const B = arg("--b", "tmp/pageera/scratch-corpus");
const LANES = arg("--lanes", "page-lane,view-lane").split(",");
const EXPECT = (arg("--expect-changed", "") || "").split(",").filter(Boolean);
const OUT = arg("--out", "");

const sha = (s) => createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");

function entries(corpus, lane) {
  const dir = path.join(corpus, "expected-v2", lane);
  const out = new Map();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl")).sort()) {
    for (const line of readFileSync(path.join(dir, f), "utf8").split("\n")) {
      if (line.trim() === "") continue;
      let o;
      try { o = JSON.parse(line); } catch { continue; }
      const key = `${lane}/${f} | ${o.name}`;
      // Every value-bearing field, so a transform that moved a non-page_html
      // field is caught too, not just a page_html edit.
      const parts = [];
      if (typeof o.page_html === "string") parts.push("page_html:" + sha(o.page_html));
      if (o.views && typeof o.views === "object") {
        for (const v of Object.keys(o.views).sort()) parts.push(`views.${v}:` + sha(o.views[v]));
      }
      parts.push("line:" + sha(JSON.stringify(o)));
      out.set(key, parts.join("|"));
    }
  }
  return out;
}

let allMoved = [];
let totalEntries = 0;
for (const lane of LANES) {
  const a = entries(A, lane);
  const b = entries(B, lane);
  totalEntries += a.size;
  const missing = [...a.keys()].filter((k) => !b.has(k));
  const added = [...b.keys()].filter((k) => !a.has(k));
  const moved = [...a.keys()].filter((k) => b.has(k) && a.get(k) !== b.get(k));
  console.log(`LANE ${lane}: entries=${a.size} moved=${moved.length} missing=${missing.length} added=${added.length}`);
  for (const k of moved) console.log(`  MOVED ${k}`);
  for (const k of missing) console.log(`  MISSING ${k}`);
  for (const k of added) console.log(`  ADDED ${k}`);
  allMoved = allMoved.concat(moved.map((k) => k.replace(/^[^|]+\| /, "")));
}
const expected = EXPECT.map((s) => s.replace(/:page$/, ""));
const unexpected = allMoved.filter((n) => !expected.includes(n));
const absent = expected.filter((n) => !allMoved.includes(n));
console.log(`TOTAL entries compared = ${totalEntries}`);
console.log(`MOVED total = ${allMoved.length}; expected = ${expected.length}`);
console.log(`UNEXPECTED movement (transform spilled) = ${unexpected.length}${unexpected.length ? ": " + unexpected.join(" | ") : ""}`);
console.log(`NAMED but NOT moved = ${absent.length}${absent.length ? ": " + absent.join(" | ") : ""}`);
if (OUT) writeFileSync(OUT, JSON.stringify({ a: A, b: B, totalEntries, moved: allMoved, unexpected, absent }, null, 2) + "\n");
if (unexpected.length > 0 || absent.length > 0) {
  console.error("SPILL-CHECK-FAIL");
  process.exit(3);
}
console.log("SPILL-CHECK-OK the transform moved exactly the entries it named and nothing else");
