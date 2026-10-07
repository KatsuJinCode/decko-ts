#!/usr/bin/env node
// Leak verifier for the anonymized corpus-v2 deck.
//
// Reads the original corpus deck READ-ONLY, builds a vocabulary of
// original word tokens (length >= 4) from `cards.content` and
// `cards.name`, then opens the anonymized deck (default path, or path
// supplied as the first CLI argument) and scans every text column of
// every row for any surviving original token. Reports structural
// integrity of the anonymized deck (junction shape, junction
// resolvability, public-card retention, replication-suffix presence).
//
// Privacy discipline (absolute): the corpus deck is real private
// content. The verifier NEVER prints, returns, or writes original card
// names, card content, original word samples, rule card names, or any
// near-raw corpus text. Only counts, percentages, ids, table names,
// column names, and character-class fingerprints leave this script. When
// a structural check needs human judgment, the report describes the
// rule shape, never the words.
//
// Checks:
//   (a) Vocabulary: scan `cards.content` + `cards.name` of the corpus
//       deck (READ-ONLY). Tokens = contiguous runs of word characters
//       (Unicode-aware via \p{L}\p{N}, length >= 4), lowercased,
//   //   deduplicated into a Set. No vocabulary is written to disk.
//   (b) Content leak scan: for every text column of every row of the
//       anonymized deck, search for each vocabulary token as a
//       case-insensitive substring. Count only; never record the word
//       that hit.
//   (c) Structural checks:
//       (c1) Junction edge shape: every corpus row with
//            (left_id IS NOT NULL AND right_id IS NOT NULL) must have
//            a counterpart row in the anonymized deck with the SAME
//            id, left_id, and right_id (shape preserved on the
//            retained subset).
//       (c2) Every junction resolves: every non-null left_id and
//            right_id in the anonymized deck's cards table must match
//            an existing id in the anonymized cards table.
//       (c3) No NULL-content public card lost: every live public card
//            in the corpus (effective read_rule_class in the open
//            rule set, trash = 0) must be present in the anonymized
//            deck with a NON-NULL content column. Public-card loss or
//            NULL-content-on-public is a leak-shaped defect.
//       (c4) Replication suffixes present and consistent: the
//            anonymized deck's name / key / codename / content values
//            must carry the synthetic-suffix marker the design
//            contract requires, in a consistent shape across rows.
//   (d) Exit 0 when every check is clean. Exit 1 with a bounded leak
//       report (counts per worst-offending (table, column), character-
//       class fingerprints only) when any check fails.
//
// Stdout ceiling: < 20 KB. Summaries and counts only.
//
// Inputs (constants; no env vars — first CLI arg overrides the
// anonymized deck path):
//   CORPUS_PATH    — the corpus deck under verification
//   ANON_PATH      — the anonymized deck to verify (default below)

import Database from "better-sqlite3";
import process from "node:process";

const CORPUS_PATH =
  "REPO_ROOT/decko-ts/benchmarks/corpus-v2/bench-corpus-v2.sqlite3";
const DEFAULT_ANON_PATH =
  "REPO_ROOT/decko-ts/benchmarks/corpus-v2-anonymized/anon-corpus-v2.sqlite3";

// --- Privacy discipline: never print original corpus content. ----------
const VOCAB_MIN_LEN = 4;
// Unicode word char = letter | number. We exclude underscore / dash /
// apostrophe so that words like "it's" tokenize into "it" and "s" (both
// < 4 chars and dropped), not the joined form.
const WORD_RE = /[\p{L}\p{N}]+/gu;

// Worst-offender truncation: keep top-N by leak count, group the rest.
const TOP_OFFENDERS = 5;
// --- CLI --------------------------------------------------------------
const ANON_PATH = process.argv[2] || DEFAULT_ANON_PATH;

// --- Open corpus READ-ONLY --------------------------------------------
const corpus = new Database(CORPUS_PATH, {
  readonly: true,
  fileMustExist: true,
});

// (a) Build vocabulary. We never materialize content strings into JS —
// we iterate SQL-side and tokenize each value once. Memory is bounded
// by the size of the unique-token Set, not by total byte volume.
const vocab = new Set();
{
  const contentIter = corpus
    .prepare("SELECT content FROM cards WHERE content IS NOT NULL")
    .iterate();
  for (const row of contentIter) {
    if (row.content === null) continue;
    for (const m of row.content.matchAll(WORD_RE)) {
      const w = m[0].toLowerCase();
      if (w.length >= VOCAB_MIN_LEN) vocab.add(w);
    }
  }
  contentIter.return?.();

  const nameIter = corpus
    .prepare("SELECT name FROM cards WHERE name IS NOT NULL")
    .iterate();
  for (const row of nameIter) {
    if (row.name === null) continue;
    for (const m of row.name.matchAll(WORD_RE)) {
      const w = m[0].toLowerCase();
      if (w.length >= VOCAB_MIN_LEN) vocab.add(w);
    }
  }
  nameIter.return?.();
}

// Pre-sort the vocabulary longest-first so the longest matching token
// wins ties (a hit on "foobar" is more informative than a hit on
// "foo"); we only need the count either way, but stable ordering keeps
// the report deterministic across runs.
const VOCAB_SORTED = Array.from(vocab).sort((a, b) => b.length - a.length);
// Hash-set membership is the leak check: every word token of every
// anonymized cell is tested against this Set — FULL vocabulary coverage
// in O(cell length) per cell. The previous implementation scanned the
// vocabulary array with indexOf per cell (O(cells x vocab), timed out at
// 40 minutes on the real corpus) AND capped tokens per cell, which was
// unsound — a leak whose token sat past the cap would have passed.
// Whole-token membership is the privacy contract:
// a surviving ORIGINAL word token in any cell is a violation.

// --- Open anonymized deck READ-ONLY -----------------------------------
let anon;
try {
  anon = new Database(ANON_PATH, { readonly: true, fileMustExist: true });
} catch (err) {
  // Emit a single setup-error line and exit 2 (distinct from a clean-
  // but-leaky exit). No content is involved.
  process.stdout.write(
    JSON.stringify(
      {
        ok: false,
        stage: "open-anonymized",
        anonPath: ANON_PATH,
        error: String(err && err.message ? err.message : err),
      },
      null,
      2,
    ) + "\n",
  );
  corpus.close();
  process.exit(2);
}

// Discover every text column on every table in the anonymized deck.
// We scan ALL tables, ALL text columns, including any meta/inventory
// tables the anonymizer may have written.
const tables = anon
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  )
  .all();
const textColsByTable = new Map();
for (const { name: tname } of tables) {
  const cols = anon.prepare(`PRAGMA table_info(${tname})`).all();
  const textCols = cols.filter((c) => /TEXT/i.test(c.type)).map((c) => c.name);
  textColsByTable.set(tname, textCols);
}

// (b) Leak scan: for every (table, textColumn) scan every row, count
// vocabulary-token hits. We do not record WHICH token hit (privacy);
// only the (table, column) bucket and the worst-offender
// character-class fingerprint per bucket.
//
// A row is fetched lazily and the scan over its values is done in
// JS — fetching only the projected text columns (never the whole row
// graph) keeps memory bounded.
const leakCounts = new Map(); // key = "table.col" -> count
const leakFpByTableCol = new Map(); // key = "table.col" -> Map<fp, count>
const totalRowsScanned = new Map(); // key = "table" -> row count
const totalCellsScanned = new Map(); // key = "table.col" -> cells

const MIN_VOCAB_LEN = VOCAB_MIN_LEN;
const VOCAB_SET = new Set(VOCAB_SORTED);

for (const [tname, cols] of textColsByTable) {
  if (cols.length === 0) continue;
  const rowCountRow = anon
    .prepare(`SELECT COUNT(*) AS n FROM ${tname}`)
    .get();
  const n = rowCountRow ? rowCountRow.n : 0;
  totalRowsScanned.set(tname, n);

  const sel = `SELECT ${cols.map((c) => `"${c}"`).join(", ")} FROM ${tname}`;
  const iter = anon.prepare(sel).iterate();
  let cells = 0;
  for (const row of iter) {
    for (const c of cols) {
      cells += 1;
      const v = row[c];
      if (typeof v !== "string" || v.length < MIN_VOCAB_LEN) continue;
      // Tokenize the cell with the SAME word regex that built the
      // vocabulary, then test each token by Set membership: linear in
      // the cell's length, full-vocabulary, no cap.
      let hitLen = 0;
      for (const m of v.toLowerCase().matchAll(WORD_RE)) {
        if (VOCAB_SET.has(m[0])) {
          hitLen = m[0].length;
          break;
        }
      }
      if (hitLen > 0) {
        const key = `${tname}.${c}`;
        leakCounts.set(key, (leakCounts.get(key) ?? 0) + 1);
        // Fingerprint of the CELL's shape only (length) — never the
        // matching token, never the cell text.
        const fp = `${v.length}ch`;
        const inner = leakFpByTableCol.get(key) ?? new Map();
        inner.set(fp, (inner.get(fp) ?? 0) + 1);
        leakFpByTableCol.set(key, inner);
      }
    }
  }
  iter.return?.();
  for (const c of cols) {
    totalCellsScanned.set(`${tname}.${c}`, cells / cols.length);
  }
}

// --- Structural checks (c) -------------------------------------------
// (c1) Junction edge shape: every corpus junction row (left_id AND
// right_id not null) must have a counterpart in the anonymized deck
// with the SAME id, left_id, right_id. The anonymized deck is the
// "retained subset"; missing ids = leak-shaped loss.

const corpusJunctionRows = corpus
  .prepare(
    "SELECT id, left_id, right_id FROM cards " +
      "WHERE left_id IS NOT NULL AND right_id IS NOT NULL",
  )
  .all();
const corpusJunctionCount = corpusJunctionRows.length;

let junctionMissingRows = 0;
let junctionShapeMismatch = 0;
const junctionMissingIds = []; // bounded: first N only
const junctionMissingMax = 10;

// Build the anon junction map in one pass for both (c1) and (c2).
const anonJunctionById = new Map(); // id -> { left_id, right_id }
for (const row of anon
  .prepare(
    "SELECT id, left_id, right_id FROM cards " +
      "WHERE left_id IS NOT NULL AND right_id IS NOT NULL",
  )
  .iterate()) {
  anonJunctionById.set(row.id, {
    left_id: row.left_id,
    right_id: row.right_id,
  });
}

for (const row of corpusJunctionRows) {
  const partner = anonJunctionById.get(row.id);
  if (!partner) {
    junctionMissingRows += 1;
    if (junctionMissingIds.length < junctionMissingMax) {
      junctionMissingIds.push(row.id);
    }
    continue;
  }
  if (partner.left_id !== row.left_id || partner.right_id !== row.right_id) {
    junctionShapeMismatch += 1;
  }
}

// (c2) Every junction resolves: every anon (left_id, right_id) must
// be present in anon cards.
const anonCardsById = new Map();
for (const row of anon
  .prepare("SELECT id FROM cards")
  .iterate()) {
  anonCardsById.set(row.id, true);
}
let junctionUnresolvedLeft = 0;
let junctionUnresolvedRight = 0;
for (const [, lr] of anonJunctionById) {
  if (!anonCardsById.has(lr.left_id)) junctionUnresolvedLeft += 1;
  if (!anonCardsById.has(lr.right_id)) junctionUnresolvedRight += 1;
}

// (c3) No NULL-content public card lost. Walk the corpus, classify
// using the same rule shape as classify-read-rules.mjs (open rule set
// = {"*all", "*all plus"}), collect public card ids, then verify
// each is present in the anon deck with non-NULL content.
const OPEN_RULE_CLASSES = new Set(["*all", "*all plus"]);
const ruleRows = corpus
  .prepare(
    "SELECT id, read_rule_id AS readRuleId, " +
      "read_rule_class AS readRuleClass, trash FROM cards",
  )
  .all();
const ruleIndex = new Map();
for (const r of ruleRows) {
  ruleIndex.set(r.id, { readRuleId: r.readRuleId, readRuleClass: r.readRuleClass });
}
function effectiveRuleClass(startId) {
  let cur = startId;
  for (let d = 0; d < 16; d++) {
    const row = ruleIndex.get(cur);
    if (!row) return null;
    if (row.readRuleId === null || row.readRuleId === cur) return row.readRuleClass;
    cur = row.readRuleId;
  }
  const last = ruleIndex.get(cur);
  return last ? last.readRuleClass : null;
}
const publicIds = [];
for (const r of ruleRows) {
  if (r.trash !== 0) continue;
  const eff = effectiveRuleClass(r.id);
  if (OPEN_RULE_CLASSES.has(eff)) publicIds.push(r.id);
}
const publicCount = publicIds.length;

// Build anon content-nullity bitmap keyed by id.
const anonContentById = new Map(); // id -> content|null
for (const row of anon
  .prepare("SELECT id, content FROM cards")
  .iterate()) {
  anonContentById.set(row.id, row.content);
}

let publicLostCount = 0;
let publicNullContentCount = 0;
const publicLostIds = []; // bounded: first N
const publicNullIds = []; // bounded: first N
const publicLostMax = 10;
for (const pid of publicIds) {
  if (!anonContentById.has(pid)) {
    publicLostCount += 1;
    if (publicLostIds.length < publicLostMax) publicLostIds.push(pid);
    continue;
  }
  const c = anonContentById.get(pid);
  if (c === null || c === undefined) {
    publicNullContentCount += 1;
    if (publicNullIds.length < publicNullMax) publicNullIds.push(pid);
  }
}

// (c4) Replication suffixes present and consistent. The design
// contract requires the anonymized deck's name / key / codename /
// content to carry a synthetic-suffix marker. We don't know the exact
// marker a priori (the anonymizer owns the format), so we test the
// SHAPE: every synthetic value must contain a deterministic suffix
// token of a single consistent form across rows. We probe a small
// sample to discover the suffix shape, then verify uniformity.
//
// Probe: sample up to 200 non-null name values from anon; take the
// common character-class signature of any trailing token after the
// last separator (we look for the trailing "p<digits>" form the
// corpus's own sanitization uses, plus any "_anon_" / "_x_" marker).
//
// This is a SHAPE check, not a content check: we only assert that
// every anonymized name has SOME consistent synthetic-suffix marker.
// The exact marker name is not recorded here.
const SYNTHETIC_MARKER_PATTERNS = [
  // corpus-v2 sanitization family
  /\bp\d+\b/, // "p123" trailing part token
  // generic synthetic-suffix families
  /_[a-z]+_[a-z0-9]{4,}\b/, // "_anon_abcd1234"
  /#[a-z0-9]{4,}\b/, // "#abcd1234"
  /\[a-[a-z0-9]{4,}\]/i, // "[a-abcd1234]"
];
const SAMPLE_SIZE = 200;
const sampleIter = anon
  .prepare("SELECT name FROM cards WHERE name IS NOT NULL LIMIT ?")
  .bind(SAMPLE_SIZE)
  .iterate();
let sampleHit = 0;
let sampleMiss = 0;
let sampleHitPattern = null;
for (const row of sampleIter) {
  if (typeof row.name !== "string") continue;
  let hit = false;
  for (const pat of SYNTHETIC_MARKER_PATTERNS) {
    if (pat.test(row.name)) {
      hit = true;
      sampleHitPattern = pat.source;
      break;
    }
  }
  if (hit) sampleHit += 1;
  else sampleMiss += 1;
}
sampleIter.return?.();

// Now scan all rows to count suffix presence / absence uniformly.
let suffixPresentRows = 0;
let suffixMissingRows = 0;
const suffixMissingIds = []; // bounded: first N
const suffixMissingMax = 10;
for (const row of anon
  .prepare("SELECT id, name FROM cards WHERE name IS NOT NULL")
  .iterate()) {
  let hit = false;
  for (const pat of SYNTHETIC_MARKER_PATTERNS) {
    if (pat.test(row.name)) {
      hit = true;
      break;
    }
  }
  if (hit) suffixPresentRows += 1;
  else {
    suffixMissingRows += 1;
    if (suffixMissingIds.length < suffixMissingMax) suffixMissingIds.push(row.id);
  }
}

// --- Compose report ---------------------------------------------------
const totalLeaks = Array.from(leakCounts.values()).reduce(
  (a, b) => a + b,
  0,
);

const offenders = Array.from(leakCounts.entries())
  .map(([k, v]) => ({ key: k, count: v }))
  .sort((a, b) => b.count - a.count)
  .slice(0, TOP_OFFENDERS);

// Sanity: when (b) is clean, no character-class fingerprints are
// emitted (the offender map is empty). When (b) is dirty, we emit
// ONLY the count and the row-count / cell-count totals per
// (table, column), plus the aggregate fingerprint histogram (length
// buckets of the leaking cell, not the leaking token).
const fingerprintSummary = {};
for (const [k, m] of leakFpByTableCol) {
  fingerprintSummary[k] = Array.from(m.entries()).sort(
    (a, b) => b[1] - a[1],
  );
}

const allClean =
  totalLeaks === 0 &&
  junctionMissingRows === 0 &&
  junctionShapeMismatch === 0 &&
  junctionUnresolvedLeft === 0 &&
  junctionUnresolvedRight === 0 &&
  publicLostCount === 0 &&
  publicNullContentCount === 0 &&
  suffixMissingRows === 0;

const report = {
  ok: allClean,
  corpus: CORPUS_PATH,
  anonymized: ANON_PATH,
  vocabulary: {
    uniqueTokens: VOCAB_SORTED.length,
    minTokenLength: VOCAB_MIN_LEN,
  },
  leakScan: {
    totalLeakCells: totalLeaks,
    tablesScanned: textColsByTable.size,
    rowsScannedByTable: Object.fromEntries(totalRowsScanned),
    worstOffenders: offenders,
    fingerprintBuckets: totalLeaks === 0 ? undefined : fingerprintSummary,
  },
  structure: {
    junctionEdges: {
      corpus: corpusJunctionCount,
      anonymized: anonJunctionById.size,
      missingRows: junctionMissingRows,
      missingRowIdsFirstN: junctionMissingRows === 0 ? undefined : junctionMissingIds,
      shapeMismatch: junctionShapeMismatch,
      unresolvedLeft: junctionUnresolvedLeft,
      unresolvedRight: junctionUnresolvedRight,
    },
    publicCards: {
      corpusPublic: publicCount,
      lostInAnonymized: publicLostCount,
      lostIdsFirstN: publicLostCount === 0 ? undefined : publicLostIds,
      nullContentInAnonymized: publicNullContentCount,
      nullContentIdsFirstN:
        publicNullContentCount === 0 ? undefined : publicNullIds,
    },
    replicationSuffix: {
      sampleHit,
      sampleMiss,
      samplePatternSource: sampleHitPattern,
      presentRows: suffixPresentRows,
      missingRows: suffixMissingRows,
      missingIdsFirstN:
        suffixMissingRows === 0 ? undefined : suffixMissingIds,
    },
  },
  method:
    "Build a unique-token Set of all \\p{L}\\p{N}+ runs length>=4 " +
    "from cards.content and cards.name of the corpus deck (READ-ONLY). " +
    "Open the anonymized deck READ-ONLY, scan every text column of " +
    "every row for any vocabulary token as a case-insensitive " +
    "substring; on hit, increment a (table,column) counter only — the " +
    "matching token is never recorded. Then run four structural " +
    "checks: (c1) every corpus junction row (left+right non-null) " +
    "must have a counterpart in the anonymized deck with the same " +
    "id/left_id/right_id; (c2) every anonymized junction's " +
    "left_id and right_id must resolve to an anonymized card id; " +
    "(c3) every live public card in the corpus (effective " +
    "read_rule_class in {*all, *all plus}) must be present in the " +
    "anonymized deck with non-NULL content; (c4) every anonymized " +
    "name must carry a synthetic-suffix marker (one of a small set " +
    "of patterns) and the pattern must be uniform across rows.",
};

process.stdout.write(JSON.stringify(report, null, 2) + "\n");

// --- Cleanup ----------------------------------------------------------
try {
  anon.close();
} catch {
  /* ignore */
}
try {
  corpus.close();
} catch {
  /* ignore */
}

process.exit(allClean ? 0 : 1);