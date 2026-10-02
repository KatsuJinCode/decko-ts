// probe-staging-db-missing-content-reference-rows.mjs -- is the zero-row
// `refer_to` CQL a PORT defect or a STAGING-DB gap? (lane-negdelta-zero, M5)
//
// WHAT THIS IS
//   The Family / Archetypal pages nest `{{_self+*referred_to_by}}`, whose cql
//   is `{"refer_to":"_left","sort":"name"}`. The bound referee id is CORRECT
//   (568 = Family) and the generated SQL is correct, yet the query returns zero
//   rows -- see probe-search-cql-throws-instead-of-returning-rows.mjs output.
//   The corpus (`bench-corpus-raw.sqlite3`) holds 21 card_references rows with
//   referee_id = 568, so the rows exist at the source.
//
//   The engine does NOT query the corpus file. `createRawStructureSeededStorage`
//   builds a per-worktree STAGING database and copies into it a chosen subset
//   of the corpus. Its only `seedReference` call sites are the rule-card refs,
//   the SET-card refs, and the SET-card child refs (raw-corpus-seeding.ts:435,
//   :442, :448) -- all PERMISSION reference rows. An ordinary card's CONTENT
//   references are never seeded, so a `refer_to` / `referred_to_by` CQL over
//   content links matches nothing in staging while matching rows in the real
//   deck.
//
//   That distinction decides where the fix belongs. If the staging DB is
//   missing the rows, the defect is in the MEASUREMENT HARNESS
//   (tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts), not in the port, and
//   no change under src/ can close it. This probe answers it by counting the
//   same row set in BOTH databases through each database's own reader.
//
// USAGE (from the worktree root)
//   node tools/oracle/probe-staging-db-missing-content-reference-rows.mjs \
//     [--referee-id 568] [--out tmp/negdelta-zero/m5-staging-refs.json]
//
//   Exit 0 when the corpus holds the rows and staging does not (harness gap
//   confirmed), 1 when the two agree.

import { register } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const HERE = path.dirname(fileURLToPath(import.meta.url));
register("./typescript-source-loader.mjs", pathToFileURL(HERE + path.sep).href);

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const REPO = path.resolve(argValue("--repo", path.resolve(HERE, "..", "..")));
const OUT = path.isAbsolute(argValue("--out", ""))
  ? argValue("--out")
  : path.join(REPO, argValue("--out", "tmp/negdelta-zero/m5-staging-refs.json"));
const REFEREE_ID = Number(argValue("--referee-id", "568"));

const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(REPO, "tmp", "raw-ground-truth", "scripts", "raw-corpus-seeding.js")).href
);

const corpus = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = corpus.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
const corpusRefereeRows = corpus
  .prepare("SELECT referer_id, ref_type FROM card_references WHERE referee_id = ?")
  .all(REFEREE_ID);
const corpusRefTypeCounts = {};
for (const row of corpusRefereeRows) corpusRefTypeCounts[row.ref_type] = (corpusRefTypeCounts[row.ref_type] ?? 0) + 1;
corpus.close();
console.log(`CORPUS ${RAW_CORPUS_DB}`);
console.log(`  card_references WHERE referee_id = ${REFEREE_ID}: ${corpusRefereeRows.length} rows, ref_types ${JSON.stringify(corpusRefTypeCounts)}`);

const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);

const driver = storage.fetcher.driver;
const stagingRefereeRows = await driver.query(
  "SELECT referer_id, ref_type FROM card_references WHERE referee_id = ?",
  [REFEREE_ID],
);
const stagingTotal = await driver.query("SELECT COUNT(*) AS n FROM card_references", []);
const stagingCards = await driver.query("SELECT COUNT(*) AS n FROM cards", []);
console.log(`STAGING driver=${driver.constructor?.name ?? "unknown"}`);
console.log(`  card_references WHERE referee_id = ${REFEREE_ID}: ${(stagingRefereeRows.rows ?? []).length} rows`);
console.log(`  staging card_references total rows=${JSON.stringify(stagingTotal.rows)}`);
console.log(`  staging cards total rows=${JSON.stringify(stagingCards.rows)}`);

// The exact join the CQL generated, run against staging and against corpus.
const JOIN_SQL =
  "SELECT DISTINCT c0.id FROM cards c0 JOIN card_references cr1 ON c0.id = cr1.referer_id " +
  "WHERE (cr1.ref_type IN ('L','I') AND cr1.referee_id = ?) AND c0.trash is false LIMIT 20";
const stagingJoin = await driver.query(JOIN_SQL, [REFEREE_ID]);
console.log(`STAGING exact-CQL join rows=${(stagingJoin.rows ?? []).length}`);

const corpusDb = new Database(RAW_CORPUS_DB, { readonly: true });
const corpusJoin = corpusDb.prepare(JOIN_SQL.replace("LIMIT 20", "")).all(REFEREE_ID);
console.log(`CORPUS  exact-CQL join rows=${corpusJoin.length} first=${corpusJoin.slice(0, 8).map((r) => r.id).join(",")}`);
corpusDb.close();

const report = {
  refereeId: REFEREE_ID,
  corpus: {
    path: RAW_CORPUS_DB,
    rowsWithRefereeId: corpusRefereeRows.length,
    refTypeCounts: corpusRefTypeCounts,
    exactCqlJoinRows: corpusJoin.length,
  },
  staging: {
    rowsWithRefereeId: (stagingRefereeRows.rows ?? []).length,
    cardReferencesTotal: stagingTotal.rows ?? null,
    cardsTotal: stagingCards.rows ?? null,
    exactCqlJoinRows: (stagingJoin.rows ?? []).length,
  },
  verdict:
    corpusRefereeRows.length > 0 && (stagingRefereeRows.rows ?? []).length === 0
      ? "STAGING-GAP: the corpus holds the content reference rows and staging does not; the zero-row refer_to CQL is a measurement-harness gap, not a port defect."
      : "both databases agree on the row set; the zero-row CQL has another cause.",
};
console.log(`VERDICT ${report.verdict}`);
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`WROTE ${OUT}`);
storage.close();
process.exit(report.verdict.startsWith("STAGING-GAP") ? 0 : 1);
