// The graded entry, judged by the REAL compare seam, without the full canvas.
//
//   npx tsx tools/oracle/verify-mod-record-entry-through-compare-seam.ts
//
// The full-canvas grade takes ~107 minutes and fires in the exclusive window;
// this answers the one question the grade would answer for this entry, in
// seconds, using the same code path the canvas uses: src/testing/replay.ts:301
// judge() -> compareNormalized -> normalizeForReplay on BOTH sides.
//
// It prints three results and they are meant to be read together:
//   - BEFORE, the old name-style answer, compareNormalized.equal = false.
//   - AFTER,  compareNormalized.equal = TRUE  — the graded comparison passes.
//   - AFTER,  byteDiff (NO normalization).equal = false — and it MUST stay
//     false. That is the honest part: the address VALUE is genuinely
//     unmatchable across languages, so a proof that showed byte-identity
//     without the mask would mean the port had started faking the value.
//
// The per-process id differs on every run by design, which is the point: a
// value that reproduced would be a name hash pretending to be a heap address.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compareNormalized, byteDiff } from "../../src/testing/diff.js";
import { modItemCodesContent } from "../../src/card/set-module-content-overrides.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARD = path.resolve(
  HERE,
  "..",
  "..",
  "tmp",
  "raw-ground-truth",
  "expected-v2",
  "view-lane",
  "recapture-raw-shard-000039.jsonl",
);

interface Entry {
  id: number;
  name: string;
  lane: string;
  record?: { content?: string };
}

let corpus: Entry | undefined;
for (const line of readFileSync(SHARD, "utf8").split("\n")) {
  if (line.trim() === "" || !line.includes("#<Cardio::Mod:0x")) continue;
  const e = JSON.parse(line) as Entry;
  if (e.id === 45410) corpus = e;
}
if (corpus === undefined) throw new Error("corpus entry 45410 not found");

const expectedContent = corpus.record?.content as string;
const actualContent = modItemCodesContent();

// 1. the CONTENT field alone, through the real comparator
const contentDiff = compareNormalized(expectedContent, actualContent);

// 2. the whole record content field as the canvas serializes it (JSON-escaped
//    inside canonicalJson) — the address pattern must survive the escaping
const expectedJson = JSON.stringify({ content: expectedContent });
const actualJson = JSON.stringify({ content: actualContent });
const jsonDiff = compareNormalized(expectedJson, actualJson);

// 3. what it was BEFORE the change, for the delta
const beforeNameStyle = "core_mod";
const beforeDiff = compareNormalized(expectedContent, beforeNameStyle);

const strict = byteDiff(expectedContent, actualContent);

console.log("graded entry  dual-lane-view:Mod:record  (card 45410, shard-000039)\n");
console.log(`  corpus content        : ${expectedContent.length} chars, 34 lines`);
console.log(`  port content          : ${actualContent.length} chars, ${actualContent.split("\n").length} lines`);
console.log(`  first port line       : ${JSON.stringify(actualContent.split("\n")[0])}`);
console.log(`\n  BEFORE (name-style "core_mod")  compareNormalized.equal = ${beforeDiff.equal}`);
console.log(`     first difference   : offset ${beforeDiff.firstDifference?.byteOffset}, ` +
  `expected ${beforeDiff.expectedBytes} B vs actual ${beforeDiff.actualBytes} B`);
console.log(`\n  AFTER  compareNormalized.equal   = ${contentDiff.equal}   (the normalized comparison the canvas runs)`);
console.log(`  AFTER  byteDiff (unnormalized).equal = ${strict.equal}   (the VALUE is genuinely unmatchable, as documented)`);
console.log(`  AFTER  JSON-escaped record  equal  = ${jsonDiff.equal}`);
