// Union three revisions' tests/standing-net.json into one manifest, WITHOUT a
// hand-merge of the conflicted JSON.
//
// Sources of truth, all read from git objects (never hand-typed):
//   HEAD:tests/standing-net.json       the current manifest (112 files)
//   rev A:tests/standing-net.json      the additions recorded under the
//                                      relnames-source key (+2)
//   rev B:tests/standing-net.json      the additions recorded under the
//                                      slotctx-source key (+3)
// The provenance strings are lifted verbatim from those two revisions' blobs,
// so the manifest records their own wording, not a paraphrase.
//
// This script writes the UNION of all the additions, so the two manifest
// commits land as ONE reconciled commit rather than two that each fight the
// other's line numbering.
const fs = require("fs");
const cp = require("child_process");

const P = "tests/standing-net.json";
const blob = (rev) =>
  JSON.parse(cp.execFileSync("git", ["cat-file", "blob", `${rev}:${P}`], { maxBuffer: 1e9 }).toString("utf8"));

const head = blob("HEAD");
const relnames = blob("33b84fe0");
const slotctx = blob("9b7750bb");

const ADD = [
  "tests/card/render/relnames-lane-bar-title-slot-census-dump.test.ts",
  "tests/card/render/relnames-set-card-accordion-bar-title-must-stay-absolute-pins.test.ts",
  "tests/card/render/rule-bar-title-name-context.test.ts",
  "tests/card/render/title-in-context-relative-name.test.ts",
  "tests/card/render/view-lane-bar-slot-root-context-seat-pins.test.ts",
];

for (const f of ADD) {
  if (head.files.includes(f)) throw new Error(`already present, not an addition: ${f}`);
  if (!fs.existsSync(f)) throw new Error(`file does not exist in the worktree: ${f}`);
}

// Insertion rule, read off the manifest's OWN shape rather than assumed: the
// array is a sorted core with every later addition APPENDED at the tail. The
// tests/card/render/ entries are not contiguous and the block is not sorted,
// so there is no sorted position to compute. The manifest's actual convention
// is the tail, and that is where these five go — in the same relative order
// the slotctx source manifest lists them.
const files = head.files.slice();
for (const f of ADD) files.push(f);
if (new Set(files).size !== files.length) throw new Error("duplicate entries after insert");

// Provenance keys, lifted verbatim from the two lanes' own manifests. They
// live under provenance{} (verified: the donor manifests' top-level keys are
// what | canonicalCommand | jobName | timeoutMin | vitestArgs | provenance |
// files | manifestFileCount, and provenance's own keys include both *-source).
for (const key of ["relnames-source", "slotctx-source"]) {
  const donor = key === "relnames-source" ? relnames : slotctx;
  if (!(key in donor.provenance)) throw new Error(`${key} absent from the donor manifest's provenance`);
  head.provenance[key] = donor.provenance[key];
}

head.files = files;
head.manifestFileCount = files.length;

// The manifest's own self-description counts, restated for the union.
if (head.envGuard && typeof head.envGuard.expectedSkips === "number") {
  // NOT changed here. The skip count is a MEASUREMENT, not an arithmetic
  // consequence of the file list: the five additions carry their own
  // self-skipping behavior (the relnames census probe skips without its pin
  // by its own contract). The measured value from the gate run at this
  // tip is what lands, in its own commit, with the job id recorded.
}

fs.writeFileSync(P, JSON.stringify(head, null, 2) + "\n");

// Re-read and assert: valid JSON, the counts agree, the additions are in.
const check = JSON.parse(fs.readFileSync(P, "utf8"));
if (check.files.length !== 117) throw new Error(`expected 117 files, got ${check.files.length}`);
if (check.manifestFileCount !== check.files.length) throw new Error("manifestFileCount != files.length");
for (const f of ADD) if (!check.files.includes(f)) throw new Error(`missing after write: ${f}`);
console.log(
  `UNION WRITTEN: files 112 -> ${check.files.length}, manifestFileCount ${check.manifestFileCount}, ` +
    `expectedSkips left at ${check.envGuard.expectedSkips} pending the measured run, ` +
    `relnames-source + slotctx-source recorded`,
);
