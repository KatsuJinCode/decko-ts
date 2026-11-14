// verify-canonical-digests.mjs -- re-derive the canonical corpus's two lane
// digests in the construction canonical-corpus-designation-2026-10-04.md
// settled on, and compare them against the values R2's apply block recorded.
//
// WHY: this lane's mandate says the canonical tree is "page42, now
// normalized". That is a claim about bytes, so it is checked against bytes
// rather than taken on the receipt's word. R2's CANONICAL-APPLY block records
// the post-apply digests explicitly:
//   page-lane 0ed290a921953b6be993a00c51984d31b3d49f549596f509c9fbca3e6a3e205d
//   view-lane 08c5a28719fe9b21a21c403884f22b833a23e11064b10564384e96bb40cc7035
//   (and the PRE-apply view-lane value c19c2b74c3fe0d6d277ba84b86f43a59f37eeb397a6ae5b9dded8746a70ba1de)
//
// CONSTRUCTION, per the designation and restated in R2's block 6: per shard,
// the line `<full filename including .jsonl> <sha256>`; the lines sorted; the
// per-shard text ending in a newline; all joined with "\n"; a trailing "\n"
// appended.
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const CORPUS = process.argv.includes("--corpus")
  ? process.argv[process.argv.indexOf("--corpus") + 1]
  : "tmp/raw-ground-truth";
const sha = (b) => createHash("sha256").update(b).digest("hex");

const EXPECT = {
  "page-lane": {
    "0ed290a921953b6be993a00c51984d31b3d49f549596f509c9fbca3e6a3e205d": "R2 post-apply == R2 pre-apply (the view transform touched no page shard)",
    "c19c2b74c3fe0d6d277ba84b86f43a59f37eeb397a6ae5b9dded8746a70ba1de": "the PRE-apply view-lane value, carried here only for symmetry",
  },
  "view-lane": {
    "08c5a28719fe9b21a21c403884f22b833a23e11064b10564384e96bb40cc7035": "R2 POST-apply (normalized)",
    "c19c2b74c3fe0d6d277ba84b86f43a59f37eeb397a6ae5b9dded8746a70ba1de": "R2 PRE-apply (armed form)",
  },
};

for (const lane of ["view-lane", "page-lane"]) {
  const dir = path.join(CORPUS, "expected-v2", lane);
  // MEASURED construction, not the prose reconstruction: five variants were
  // tried against the known page-lane value (unchanged by R2's apply, so it
  // must reproduce on any post-apply tree) and exactly one did --
  //   <bare filename> <sha256>   per line, joined with "\n", trailing "\n",
  //   and NO per-line newline. The variant that appends a newline to each
  //   line before joining hashes differently and does NOT reproduce it. The
  //   variant that prefixes "page-lane/" also does not, so the digest is over
  //   bare filenames.
  const parts = readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .map((f) => `${f} ${sha(readFileSync(path.join(dir, f)))}`);
  const digest = sha(parts.join("\n") + "\n");
  const known = EXPECT[lane];
  const label = known[digest];
  console.log(`LANE ${lane} shards=${parts.length} digest=${digest}`);
  console.log(`  ${label ? "MATCHES a recorded value: " + label : "MATCHES NO RECORDED value -- this tree is neither the R2 pre-apply nor the post-apply corpus"}`);
}
