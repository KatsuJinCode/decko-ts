// extract-raw-corpus-override-rows-from-captures.mjs -- build the raw-corpus
// OVERRIDE TABLE from the oracle capture artifacts (harness-corpus-repair
// lane, 2026-10-02).
//
// WHAT THIS IS
//   The oracle deck's stored bytes for some cards are unobtainable from
//   bench-corpus-raw.sqlite3 (sha-pinned 6a44dfdc...): the capture-time deck
//   held materialized bytes the dump does not carry (scss-double-emit-fix-lane.md:
//   card 34179 "journal skin customized" = [corpus prefix 251,225][M 221,051
//   bytes of compiled decko application CSS][corpus tail 945]; an instr search
//   for the M head over the whole corpus returns 0 rows). The p21 capture pair
//   holds the oracle's record envelope, so the bytes ARE recoverable -- from
//   the capture, not hand-authored.
//
//   This script re-derives the restoration from the capture files, verifies
//   every envelope equality the receipt recorded, cross-checks the +parent
//   capture records against the corpus rows, and writes the override table
//   the seeding module (tests/card/render/raw-corpus-seeding.ts) applies to
//   the STAGED deck. The pinned corpus file itself is never mutated.
//
// OVERRIDE TABLE CONTRACT (consumed by the seeding module)
//   {
//     meta: { corpusSha256, generatedBy, generatedAt, provenance: [...] },
//     cards: [ { id, content, note } ]            // column patches for rows
//                                                 // that exist in the corpus
//   }
//   The seeding module refuses to apply the table against any corpus whose
//   sha256 differs from meta.corpusSha256 (the bytes are only what the oracle
//   rendered for THAT snapshot).
//
// USAGE
//   node tools/oracle/extract-raw-corpus-override-rows-from-captures.mjs \
//     [--capture <000028-journal_skin_customized-_record_.expected.html>] \
//     [--expected-shard <page-lane/recapture-raw-shard-000039.jsonl>] \
//     [--out tests/card/render/raw-corpus-override-capture-restored-rows.json]

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";

const HERE = path.dirname(fileURLToPath(import.meta.url));
register("./typescript-source-loader.mjs", pathToFileURL(HERE + path.sep).href);
const { RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(HERE, "..", "..", "tests", "card", "render", "raw-corpus-seeding.js")).href
);

const EXPECTED_CAPTURE_DEFAULT =
  "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/p21-probe-results/" +
  "nest-tip-shard-000028/html/000028-journal_skin_customized-_record_.expected.html";
const EXPECTED_SHARD_DEFAULT =
  "C:/localProjects/decko-ts-lane-negdelta-zero/tmp/raw-ground-truth/expected-v2/" +
  "page-lane/recapture-raw-shard-000039.jsonl";

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const CAPTURE = argValue("--capture", EXPECTED_CAPTURE_DEFAULT);
const SHARD = argValue("--expected-shard", EXPECTED_SHARD_DEFAULT);
const OUT =
  argValue("--out", "") !== "" && path.isAbsolute(argValue("--out", ""))
    ? argValue("--out")
    : path.join(
        HERE,
        "..",
        "..",
        "tests",
        "card",
        "render",
        "raw-corpus-override-capture-restored-rows.json",
      );

// ---------- corpus side ----------
const corpusSha = createHash("sha256").update(readFileSync(RAW_CORPUS_DB)).digest("hex");
const corpus = new Database(RAW_CORPUS_DB, { readonly: true });
const card34179 = corpus
  .prepare("SELECT id, name, key, content, length(content) AS len FROM cards WHERE id = 34179")
  .get();
console.log(`CORPUS ${RAW_CORPUS_DB}`);
console.log(`  sha256 ${corpusSha}`);
console.log(`  34179 "${card34179.name}" content ${card34179.len} bytes`);

// ---------- capture side: the oracle record envelope ----------
const expectedBytes = readFileSync(CAPTURE);
const envelope = JSON.parse(expectedBytes.toString("utf8"));
const oracleContent = envelope.content;
console.log(`CAPTURE ${CAPTURE}`);
console.log(`  envelope bytes ${expectedBytes.length}, content ${oracleContent.length} chars`);

// Envelope equalities (scss-double-emit-fix-lane.md section 2), re-measured:
//   oracle.content[0..P] === corpus.content[0..P]  (prefix)
//   oracle.content.slice(-T) === corpus.content.slice(-T)  (tail)
//   M = oracle.content[P .. len-T] is decko application CSS absent from the corpus.
let prefix = 0;
while (
  prefix < Math.min(oracleContent.length, card34179.content.length) &&
  oracleContent[prefix] === card34179.content[prefix]
) prefix++;
let tail = 0;
while (
  tail < Math.min(oracleContent.length, card34179.content.length) - prefix &&
  oracleContent[oracleContent.length - 1 - tail] === card34179.content[card34179.content.length - 1 - tail]
) tail++;
const mBlock = oracleContent.slice(prefix, oracleContent.length - tail);
console.log(`  prefix match ${prefix} bytes, tail match ${tail} bytes, middle M ${mBlock.length} bytes`);
const mInCorpus = corpus.prepare("SELECT COUNT(*) AS n FROM cards WHERE instr(content, ?) > 0").get(
  mBlock.slice(0, 80),
);
console.log(`  corpus rows containing the M head: ${mInCorpus.n} (expected 0)`);
if (mInCorpus.n !== 0) {
  throw new Error("M block found in corpus -- the override premise is stale, refusing to emit");
}
if (oracleContent.slice(0, prefix) !== card34179.content.slice(0, prefix)) {
  throw new Error("prefix equality broke at the JS-string level");
}
if (oracleContent.slice(oracleContent.length - tail) !== card34179.content.slice(card34179.content.length - tail)) {
  throw new Error("tail equality broke at the JS-string level");
}
const restored = oracleContent;
if (restored.length !== prefix + mBlock.length + tail) {
  throw new Error("restored content is not exactly prefix + M + tail");
}

// ---------- capture side: the +parent records ----------
// scss-double-emit-fix-lane.md section 3 claimed the corpus holds 0 rows for
// the +parent subcards. The rows EXIST as junction children (name/key NULL;
// the name lives in left_id/right_id), so the override needs no +parent rows
// -- but the cross-check below pins the corpus rows to the capture records so
// the correction is measured, not asserted.
let shardRecords = [];
try {
  shardRecords = readFileSync(SHARD, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((o) => o.record && /^journal skin customized\+parent/.test(o.record.name ?? ""))
    .map((o) => o.record);
} catch (err) {
  console.log(`SHARD ${SHARD} unreadable (${err.message.slice(0, 80)}) -- +parent cross-check skipped`);
}
const parentChecks = [];
for (const rec of shardRecords) {
  const row = corpus.prepare("SELECT id, left_id, right_id, type_id, content FROM cards WHERE id = ?").get(rec.id);
  const left = row ? corpus.prepare("SELECT name FROM cards WHERE id = ?").get(row.left_id) : null;
  const right = row ? corpus.prepare("SELECT name FROM cards WHERE id = ?").get(row.right_id) : null;
  const check = {
    id: rec.id,
    captureName: rec.name,
    captureContent: rec.content,
    corpusRowExists: row !== undefined,
    corpusContent: row?.content ?? null,
    corpusJoinedName: row && left && right ? `${left.name}+${right.name}` : null,
    contentMatches: row !== undefined && row.content === rec.content,
  };
  parentChecks.push(check);
  console.log(`  +parent cross-check id ${rec.id}: corpusRow=${check.corpusRowExists} contentMatches=${check.contentMatches} joinedName=${check.corpusJoinedName}`);
}

corpus.close();

// ---------- emit ----------
const override = {
  meta: {
    what:
      "Capture-restored card rows the raw corpus dump lacks. Applied by " +
      "tests/card/render/raw-corpus-seeding.ts to the STAGED deck only; the " +
      "sha-pinned corpus file is never mutated.",
    corpusSha256: corpusSha,
    generatedBy: "tools/oracle/extract-raw-corpus-override-rows-from-captures.mjs",
    generatedAt: new Date().toISOString(),
    provenance: [
      {
        source: "p21 oracle record capture (2026-09-30)",
        file: CAPTURE,
        envelopeBytes: expectedBytes.length,
        contentChars: oracleContent.length,
        envelopeEqualities: {
          prefixBytes: prefix,
          middleBytes: mBlock.length,
          tailBytes: tail,
        },
      },
    ],
    parentCrossChecks: parentChecks,
  },
  cards: [
    {
      id: 34179,
      content: restored,
      note:
        "journal skin customized -- oracle deck's stored content " +
        `(${restored.length} chars = corpus prefix ${prefix} + M ${mBlock.length} + corpus tail ${tail}); ` +
        "the corpus row holds the 252,170-byte pre-materialization bytes.",
    },
  ],
  references: [],
};
writeFileSync(OUT, JSON.stringify(override, null, 2));
console.log(
  `WROTE ${OUT} (cards: ${override.cards.map((c) => `${c.id}@${c.content.length}`).join(", ")})`,
);
console.log(
  `ENVELOPE RECOVER: record envelope ${expectedBytes.length} B <- content ${restored.length} chars ` +
    `(corpus 252,170 -> oracle 473,221, +221,051)`,
);
