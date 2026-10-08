#!/usr/bin/env node
// Privacy-fraction measurement for the v2 corpus SQLite.
//
// Reads the corpus deck (READ-ONLY via better-sqlite3), classifies every
// non-trashed card with the classify() function exported from
// classify-read-rules.mjs, and emits a single FractionResult JSON object
// on stdout. The JSON is the deliverable shape the workflow records.
//
// Privacy discipline (absolute): the corpus deck is real private content.
// This script never prints or returns card names, card content, rule
// content, party card names, or any sample text. Only counts, percentages,
// ids, and paths leave this script.
//
// Command:
//   node tools/corpus-anonymizer/measure-private-fraction.mjs
//
// Exit status: 0 on a clean run; non-zero on a setup error.
//
// Inputs (constants; no env vars or flags — one-shot measurement):
//   DB_PATH   — path to the corpus SQLite under measurement
//   SAMPLE_N  — number of cards to spot-check (default 20)

import {
  classify,
  openCorpusDb,
  OPEN_RULE_CLASSES,
} from "./classify-read-rules.mjs";

const DB_PATH =
  process.env.DECKO_CORPUS_DB ?? new URL("../../benchmarks/corpus-v2/bench-corpus-v2.sqlite3", import.meta.url).pathname;
const SAMPLE_N = 20;

// Deterministic PRNG (mulberry32) for the spot-check sample selection.
// The seed is fixed so a re-run is reproducible.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pct(part, total) {
  if (total === 0) return 0;
  return Math.round((part * 1000) / total) / 10;
}

const db = openCorpusDb(DB_PATH);

// 1. Classify every live card.
const classifications = classify(db);

// 2. Aggregate byte totals from the cards table, streaming the live rows.
//    We compute length(content) in SQL — content is the only sizable text
//    column on cards in this corpus (no separate `db_content` column
//    exists; the JSON blob's text live column is `content`).
//
// Privacy discipline: we never read the content values themselves into
// JS objects; SQLite's length() runs server-side and returns a number.
// We bucket by the classifier's verdict so the
// public/private attribution matches the classifier exactly, and never
// materialize content values in logs — only length sums and bucket counts.
let publicBytes = 0;
let privateBytes = 0;
let publicCards = 0;
let privateCards = 0;

const liveIter = db.prepare(
  "SELECT id, length(content) AS len FROM cards WHERE trash = 0",
).iterate();

for (const row of liveIter) {
  const verdict = classifications.get(row.id);
  if (verdict === "public") {
    publicBytes += row.len;
    publicCards += 1;
  } else if (verdict === "private") {
    privateBytes += row.len;
    privateCards += 1;
  }
}
// At this point publicCards + privateCards == classifications.size.

const totalCards = classifications.size;
const privateCardPct = pct(privateCards, totalCards);
const publicBytePct = pct(publicBytes, publicBytes + privateBytes);
const privateBytePct = pct(privateBytes, publicBytes + privateBytes);

// 4. Spot-check: pick SAMPLE_N card ids uniformly at random (seeded),
//    independently read each card's read_rule_class/read_rule_id AND the
//    resolved rule card's read_rule_class columns, and confirm the
//    classifier's verdict. Output ONLY counts.
function buildRuleClassIndex(db) {
  const rows = db
    .prepare(
      "SELECT id, read_rule_id AS readRuleId, read_rule_class AS readRuleClass " +
        "FROM cards",
    )
    .all();
  const idx = new Map();
  for (const row of rows) idx.set(row.id, row);
  return idx;
}
function effectiveRuleClass(id, idx) {
  let cur = id;
  for (let d = 0; d < 16; d++) {
    const r = idx.get(cur);
    if (r === undefined) return null;
    if (r.readRuleId === null || r.readRuleId === cur) return r.readRuleClass;
    cur = r.readRuleId;
  }
  return idx.get(cur)?.readRuleClass ?? null;
}

const idx = buildRuleClassIndex(db);
const liveIds = Array.from(classifications.keys());
let matches = 0;
let inspected = 0;
{
  // Deterministic, reservoir-style sampling over liveIds.
  const rng = mulberry32(0xc0ffee);
  // Shuffle a copy via partial Fisher-Yates using rng. liveIds is up
  // to ~47k; full shuffle is fine.
  const ids = liveIds.slice();
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = ids[i];
    ids[i] = ids[j];
    ids[j] = tmp;
  }
  const sample = ids.slice(0, SAMPLE_N);

  for (const id of sample) {
    // Re-derive the verdict independently from the raw rule columns:
    // 1. effective class via chain walk (re-computed here, not pulled
    //    from the classifier's internal state),
    // 2. classifier's verdict for the same id.
    const raw = db
      .prepare(
        "SELECT read_rule_class AS readRuleClass, read_rule_id AS readRuleId, trash " +
          "FROM cards WHERE id = ?",
      )
      .get(id);
    if (raw === undefined || raw.trash !== 0) continue;
    const eff = effectiveRuleClass(id, idx);
    const expected = OPEN_RULE_CLASSES.has(eff) ? "public" : "private";
    const actual = classifications.get(id);
    inspected += 1;
    if (expected === actual) matches += 1;
    // We deliberately do NOT log the id, the rule columns, or any
    // name/content values. Only the cumulative match counter is
    // recorded in the result.
  }
}

// 5. Close out.
db.close();

// 6. Compose the FractionResult JSON.
const result = {
  totalCards,
  publicCards,
  privateCards,
  privateCardPct,
  publicContentBytes: publicBytes,
  privateContentBytes: privateBytes,
  privateBytePct,
  method:
    "Open the corpus SQLite READ-ONLY and classify every row in `cards` " +
    "where trash = 0. A card is public iff its effective `read_rule_class` " +
    "(walked from the row through `read_rule_id` self/parent links up to " +
    "16 hops) is in the open rule set {\"*all\", \"*all plus\"}; all other " +
    "verdicts — `*right`, `*type`, `*type plus right`, `*self`, null, or " +
    "any other value — count as private. `db_content` does not exist in " +
    "this schema; the byte measure uses the only sizable text column on " +
    "live rows, `cards.content`, summing its length() in SQL.",
  spotCheck: `${matches}/${inspected} spot-checked cards matched when re-deriving the verdict from raw rule columns`,
};

process.stdout.write(JSON.stringify(result, null, 2) + "\n");
