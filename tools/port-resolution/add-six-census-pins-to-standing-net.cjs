// Add the six census pins to the standing net and re-pin the skip count.
//
// WHY THIS SCRIPT EXISTS. A guard that is not in the net is not guarded: the
// relnames lane established that precedent (510a603c added its two new guard
// files in the same commit that added the shape gate they probe, and moved
// expectedSkips 13 -> 14 with the evidence line). These six pins are the RED
// arms of the census engine ports, and they are the only thing standing between
// the six ported mechanisms and a silent regression.
//
// THE SKIP ARITHMETIC, measured not guessed. Run of the six pins together with
// no extra env: `Test Files 6 passed (6) | Tests 9 passed | 1 skipped (10)`.
// The single skip is referred-to-by-search-result-set-corpus-replay-pins, whose
// own contract (REPLAY_REQUESTED, 42dba231) is to SELF-SKIP without
// REFERRED_TO_BY_RESULT_SET_REPLAY=1 rather than fail. The other five run
// unconditionally. So expectedSkips goes 14 -> 15 and nothing else in the
// skip classes moves.
//
// The file list and the count are both rewritten from the array, so they cannot
// drift apart, and the script refuses if the count it computes disagrees with
// what it is about to write.
const fs = require("fs");
const P = "tests/standing-net.json";

const NEW_FILES = [
  "tests/card/render/main-card-image-size-pins.test.ts",
  "tests/card/render/mod-depends-on-declaration-order-pins.test.ts",
  "tests/card/render/mod-shades-script-groups-pins.test.ts",
  "tests/card/render/mod-tinymce-style-script-group-pins.test.ts",
  "tests/card/render/referred-to-by-search-result-set-corpus-replay-pins.test.ts",
  "tests/card/render/setting-group-applies-gate-pins.test.ts",
];

const PROVENANCE =
  "Serializer-line census pins, added 2026-10-04 (censusport lane, base d39da609): the six RED arms of the M2/M2-refit/M3/M4/M5/M6/M10 engine ports, transplanted verbatim from lane-serializer-followup2-2026-10-03 and each RED-then-GREEN re-measured on the fold base before its port. setting-group-applies-gate-pins (M2 + the M2 refit, 43d55e80's final state) pins the editing-group badge at 3 for a TEMPLATE-derived prototype and at 5 for a stored-pointer/assigned-list one, which is the shape the retired blanket SETTING_NEVER_VISIBLE fold could not produce. referred-to-by-search-result-set-corpus-replay-pins (M3, 42dba231) is the corpus-graph replay of the Family +*referred_to_by listing and SELF-SKIPS without REFERRED_TO_BY_RESULT_SET_REPLAY=1. mod-depends-on-declaration-order-pins (M4, a639ee62), mod-shades-script-groups-pins (M5, 0377f4d3), main-card-image-size-pins (M6, 32fe3163) and mod-tinymce-style-script-group-pins (M10, 735e6a45) are the four mod-loader/image-seam mechanisms, all of which render from transcribed graded bytes.";

const EVIDENCE_ADD =
  " | censusport lane (census M2/M2-refit/M3/M4/M5/M6/M10 port onto d39da609, 2026-10-04): 117 -> 123 files, expectedSkips 14 -> 15. The +1 is tests/card/render/referred-to-by-search-result-set-corpus-replay-pins.test.ts, whose own contract is to SELF-SKIP without REFERRED_TO_BY_RESULT_SET_REPLAY=1; measured directly as a six-file run with no extra env - 'Test Files 6 passed (6) | Tests 9 passed | 1 skipped (10)'. The other five new files run unconditionally and added no skip. All thirteen prior classes (p20 2, read-rule-left-climb 4, nest-miss 2, p21 1, re-photograph 1, focal-denial 1, layout-whitespace 1, layout-code-crlf 1, relnames census dump 1, edit-session-replay's rolled-back suite 14 measured as one class) are unchanged.";

// APPEND, never sort: the list carries its own append-order provenance (the
// relnames and slotctx entries sit last because those lanes appended them), and
// sorting it would turn a six-line addition into a whole-file reshuffle.
const m = JSON.parse(fs.readFileSync(P, "utf8"));

for (const f of NEW_FILES) {
  if (m.files.includes(f)) {
    console.log("already listed: " + f);
    continue;
  }
  if (!fs.existsSync(f)) {
    throw new Error("manifest would list a file that does not exist: " + f);
  }
  m.files.push(f);
  console.log("added: " + f);
}

const counted = m.files.length;
if (counted !== 123) {
  throw new Error(
    `expected 123 files after the addition, computed ${counted}. Do not write - recount first.`,
  );
}
m.manifestFileCount = counted;

const before = m.envGuard.expectedSkips;
m.envGuard.expectedSkips = before + 1;
m.envGuard.pinnedAtCommit =
  "lane-censusport-2026-10-04 (123-file union of the serializer+relnames port tip d39da609 plus the six census pins)";
if (!m.envGuard.evidence.includes("censusport lane")) {
  m.envGuard.evidence += EVIDENCE_ADD;
}
if (m.provenance["censusport-source"] === undefined) {
  m.provenance["censusport-source"] = PROVENANCE;
}
if (Array.isArray(m.provenance.sources)) {
  m.provenance.sources.push(PROVENANCE);
}
m.provenance.manifestFileCount = counted;

fs.writeFileSync(P, JSON.stringify(m, null, 2) + "\n");

// Re-read and assert what actually landed.
const after = JSON.parse(fs.readFileSync(P, "utf8"));
if (after.files.length !== after.manifestFileCount) {
  throw new Error("post-condition: files[] and manifestFileCount disagree");
}
if (after.envGuard.expectedSkips !== before + 1) {
  throw new Error("post-condition: expectedSkips did not move by exactly 1");
}
for (const f of NEW_FILES) {
  if (!after.files.includes(f)) throw new Error("post-condition: " + f + " missing");
}
console.log(
  `\nmanifest: files ${m.manifestFileCount} (manifestFileCount ${after.manifestFileCount}), expectedSkips ${before} -> ${after.envGuard.expectedSkips}`,
);
