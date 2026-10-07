// compute-corpus-lane-digests.mjs -- grade #11 staged-harness instrument.
//
// Re-derivation of the grade-10 corpus digest gate (the original instrument
// lived in the grade-10 worktree's gitignored tmp/grade10-instrument/ and that
// worktree is gone). Construction transcribed from the grade-10 receipt's own
// words (REPO_DIR an internal work log section 1, citing
// canonical-corpus-designation-2026-10-04.md sweep-3 addendum): per lane
// directory, sorted "<full filename including .jsonl>" + one space + the
// file's sha256 hex, one line per shard, joined with "\n", trailing "\n"
// appended, sha256 of the result. The bench deck is hashed whole.
//
// Read-only: hashes files, writes nothing, no network.
//
// Usage:
//   node compute-corpus-lane-digests.mjs --corpus <raw-ground-truth-dir> \
//        [--json <out.json>]
//
// The corpus dir is expected to hold expected-v2/{view-lane,page-lane}/*.jsonl
// and bench-corpus-raw.sqlite3 (the staged shape every lane uses).

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function sha256File(p) {
  const h = createHash("sha256");
  h.update(fs.readFileSync(p));
  return h.digest("hex");
}

// The designation construction, exactly: sorted "name hex" lines, "\n"-joined,
// trailing "\n", sha256 over the whole string.
function laneDigest(dir) {
  const names = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();
  const lines = names.map((n) => `${n} ${sha256File(path.join(dir, n))}`);
  const payload = lines.join("\n") + "\n";
  return { shards: names.length, digest: createHash("sha256").update(payload, "utf8").digest("hex") };
}

const argv = process.argv.slice(2);
const corpusIdx = argv.indexOf("--corpus");
const jsonIdx = argv.indexOf("--json");
const corpus = corpusIdx >= 0 ? path.resolve(argv[corpusIdx + 1]) : null;
if (!corpus) {
  console.error("usage: compute-corpus-lane-digests.mjs --corpus <raw-ground-truth-dir> [--json <out.json>]");
  process.exit(2);
}

const expectedV2 = path.join(corpus, "expected-v2");
const viewDir = path.join(expectedV2, "view-lane");
const pageDir = path.join(expectedV2, "page-lane");
const benchPath = path.join(corpus, "bench-corpus-raw.sqlite3");

const result = { corpusRoot: corpus };
let ok = true;
for (const [lane, dir] of [["view-lane", viewDir], ["page-lane", pageDir]]) {
  if (!fs.existsSync(dir)) {
    result[lane] = { shards: 0, digest: null, error: "directory missing" };
    ok = false;
    continue;
  }
  result[lane] = laneDigest(dir);
}
if (fs.existsSync(benchPath)) {
  result["bench-corpus-raw.sqlite3"] = {
    bytes: fs.statSync(benchPath).size,
    sha256: sha256File(benchPath),
  };
} else {
  result["bench-corpus-raw.sqlite3"] = { bytes: 0, sha256: null, error: "missing" };
  ok = false;
}

console.log(`view-lane  shards=${result["view-lane"].shards} digest=${result["view-lane"].digest}`);
console.log(`page-lane  shards=${result["page-lane"].shards} digest=${result["page-lane"].digest}`);
const bench = result["bench-corpus-raw.sqlite3"];
console.log(`bench-corpus-raw.sqlite3 bytes=${bench.bytes} sha256=${bench.sha256}`);
if (jsonIdx >= 0) fs.writeFileSync(argv[jsonIdx + 1], JSON.stringify(result, null, 2) + "\n");
process.exit(ok ? 0 : 1);
