// report-divergence-regions-for-captured-render-pair.mjs -- offline region
// report for an expected/actual render pair already written by
// probe-view-lane-byte-divergence.mjs.
//
// WHAT THIS IS
//   The grade records only the FIRST byte difference of a failing entry, and a
//   first difference never accounts for the entry's total byte gap: an entry
//   can be hundreds of bytes short while its first difference is a
//   five-character token, and the rest of the gap lives somewhere the grade
//   never names. Attributing a mechanism needs EVERY region, not the first
//   one.
//
//   This tool is the offline half of that: it re-segments an
//   expected--*.html / actual--*.html pair the comparator's way
//   (SLOT_ID_PATTERN normalization, the exact regex src/testing/diff.ts:36
//   uses) and reports each region with its own byte delta, so the regions sum
//   to the entry's total gap. No engine boot, no corpus — the files are
//   already on disk.
//
//   SEGMENTATION. The walk advances BOTH cursors together over a shared
//   prefix, then cuts at the LONGEST COMMON SUFFIX of the two remainders. A
//   fixed-width resync search cannot work here: the two sides differ in
//   length, so a window at the same index on each side compares bytes from
//   different logical positions. The common-suffix cut is what a diff
//   actually does, and it handles substitutions, insertions and deletions
//   with one rule.
//
// USAGE (from the worktree root)
//   node tools/oracle/report-divergence-regions-for-captured-render-pair.mjs \
//     <expectedFile> <actualFile> [--max-regions 40] [--context 240]
//
//   Exit 0 always when both files are readable (a report, not a gate).

import { readFileSync } from "node:fs";
import path from "node:path";

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const [expectedPath, actualPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (expectedPath === undefined || actualPath === undefined) {
  console.error(
    "USAGE: report-divergence-regions-for-captured-render-pair.mjs <expectedFile> <actualFile>",
  );
  process.exit(2);
}
const MAX_REGIONS = Number(argValue("--max-regions", "40"));
const CONTEXT = Number(argValue("--context", "240"));

/** src/testing/diff.ts:36 SLOT_ID_PATTERN + :15 RANDOMIZED_SLOT_ATTRIBUTE. */
const SLOT_ID_PATTERN = /data-slot-id=(['"])([0-9a-f]{20})\1/g;
const normalizeSlotIds = (html) =>
  html.replace(SLOT_ID_PATTERN, 'data-slot-id="RANDOMIZED"');

const expected = readFileSync(expectedPath, "utf8");
const actual = readFileSync(actualPath, "utf8");
const e = normalizeSlotIds(expected);
const a = normalizeSlotIds(actual);

const regions = [];
let i = 0;
let j = 0;
for (let guard = 0; guard < 10_000; guard += 1) {
  while (i < e.length && j < a.length && e[i] === a[j]) {
    i += 1;
    j += 1;
  }
  if (i >= e.length && j >= a.length) break;
  let suffix = 0;
  const min = Math.min(e.length, a.length);
  while (suffix < min && e[e.length - 1 - suffix] === a[a.length - 1 - suffix]) suffix += 1;
  const eEnd = e.length - suffix;
  const aEnd = a.length - suffix;
  if (eEnd <= i && aEnd <= j) break;
  regions.push({ expectedStart: i, actualStart: j, expectedLen: eEnd - i, actualLen: aEnd - j });
  i = eEnd;
  j = aEnd;
}

const total = regions.reduce((sum, r) => sum + (r.actualLen - r.expectedLen), 0);
console.log(`EXPECTED ${expectedPath}`);
console.log(`ACTUAL   ${actualPath}`);
console.log(
  `  normalized lengths expected=${e.length} actual=${a.length} delta=${a.length - e.length}`,
);
console.log(`  regions=${regions.length} regionDeltaSum=${total}`);
for (const [n, r] of regions.slice(0, MAX_REGIONS).entries()) {
  console.log(
    `  region ${n + 1}/${regions.length} expected[${r.expectedStart}..+${r.expectedLen}] actual[${r.actualStart}..+${r.actualLen}] delta=${r.actualLen - r.expectedLen}`,
  );
  console.log(`    expected: ${JSON.stringify(e.slice(r.expectedStart, r.expectedStart + Math.max(r.expectedLen, CONTEXT))).slice(0, 900)}`);
  console.log(`    actual:   ${JSON.stringify(a.slice(r.actualStart, r.actualStart + Math.max(r.actualLen, CONTEXT))).slice(0, 900)}`);
}
console.log(`  base: ${path.basename(expectedPath)}`);
