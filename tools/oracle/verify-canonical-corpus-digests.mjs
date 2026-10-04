// verify-canonical-corpus-digests.mjs -- re-derive the grade-#10 canonical
// corpus digests for a given expected-v2 tree, from first principles.
//
// Why this script exists (queue-repair + corpus-re-designation lane,
// 2026-10-04): the original designation
// (tmp/wrong-goal-hunt/denied-seam-reanchor-lane.md, "Decision: option (b)")
// named a digest CONSTRUCTION in prose -- "sha256 over sorted 'filename
// sha256' lines" -- which is ambiguous: with or without the trailing newline,
// and with or without the file extension in the name. The tree it designated
// (decko-ts-lane-seam-reanchor) was destroyed mid-run by the hygiene
// remediation, so the recorded digests can no longer be recomputed from their
// own source and the ambiguity would otherwise be unfalsifiable. This script
// prints EVERY plausible variant so the ambiguity is settled by measurement
// against the two digests of record, not by trusting the prose.
//
// Read-only: hashes files, writes nothing, no network.
//
// Usage:
//   node verify-canonical-corpus-digests.mjs <expected-v2-dir>
//   node verify-canonical-corpus-digests.mjs <expected-v2-dir> --bench <sqlite>

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const EXPECTED = {
  "page-lane": "0ed290a921953b6be993a00c51984d31b3d49f549596f509c9fbca3e6a3e205d",
  "view-lane": "c19c2b74c3fe0d6d277ba84b86f43a59f37eeb397a6ae5b9dded8746a70ba1de",
};
const BENCH_PIN = "6a44dfdc20ca941e66da6ba08add7f1a5cf35ec1a3ba75cc43a70920e609440e";

const root = process.argv[2];
const benchIdx = process.argv.indexOf("--bench");
const benchPath = benchIdx > 0 ? process.argv[benchIdx + 1] : null;
if (!root) {
  console.error("usage: verify-canonical-corpus-digests.mjs <expected-v2-dir> [--bench <sqlite>]");
  process.exit(2);
}

function sha256File(p) {
  const h = createHash("sha256");
  h.update(fs.readFileSync(p));
  return h.digest("hex");
}

function shardDigests(dir) {
  const names = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();
  return names.map((n) => [n, sha256File(path.join(dir, n))]);
}

function variants(entries) {
  const strip = ([n]) => [n.replace(/\.jsonl$/, ""), null];
  const out = {};
  for (const [label, nameOf] of [
    ["with-extension", (n) => n],
    ["stripped-extension", (n) => n.replace(/\.jsonl$/, "")],
  ]) {
    for (const sepLabel of ["space", "double-space", "tab"]) {
      const sep = sepLabel === "space" ? " " : sepLabel === "double-space" ? "  " : "\t";
      for (const [nlLabel, nl] of [
        ["trailing-newline", "\n"],
        ["no-trailing-newline", ""],
      ]) {
        const body = entries
          .map(([n, h]) => `${nameOf(n)}${sep}${h}`)
          .sort()
          .join("\n");
        out[`${label} / ${sepLabel} / ${nlLabel}`] = createHash("sha256")
          .update(body + nl)
          .digest("hex");
      }
    }
  }
  return out;
}

const lanes = ["page-lane", "view-lane"];
let matched = 0;
for (const lane of lanes) {
  const dir = path.join(root, lane);
  if (!fs.existsSync(dir)) {
    console.log(`\n### ${lane}: MISSING at ${dir}`);
    continue;
  }
  const entries = shardDigests(dir);
  console.log(`\n### ${lane}: ${entries.length} shards in ${dir}`);
  const v = variants(entries);
  for (const [label, digest] of Object.entries(v)) {
    const hit = digest === EXPECTED[lane];
    if (hit) matched++;
    console.log(`  ${hit ? "CANONICAL-MATCH" : "            "} ${label.padEnd(38)} ${digest}`);
  }
  console.log(`  digest of record: ${EXPECTED[lane]}`);
  console.log(
    `  first shard: ${entries[0][0]} ${entries[0][1]}\n  last  shard: ${entries[entries.length - 1][0]} ${entries[entries.length - 1][1]}`,
  );
}

if (benchPath) {
  const d = sha256File(benchPath);
  console.log(`\n### bench-corpus-raw.sqlite3 (${fs.statSync(benchPath).size} bytes)`);
  console.log(`  ${d === BENCH_PIN ? "GRADE-9-PIN-MATCH" : "MISMATCH      "} ${d}`);
  console.log(`  pin of record: ${BENCH_PIN}`);
}

console.log(`\nvariants reproducing a digest of record: ${matched}`);
