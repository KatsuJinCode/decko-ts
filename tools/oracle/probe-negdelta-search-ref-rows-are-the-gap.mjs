// probe-negdelta-search-ref-rows-are-the-gap.mjs -- the falsification test for
// the negative-delta page family's root cause (lane-negdelta, attempt 3).
//
// WHAT THIS IS
//   The negative-delta page family (145 page-lane failures where the TS port
//   renders FEWER bytes than the Ruby oracle; 100 of them carrying 1,040,713
//   of the family's 1,084,985 missing bytes, all in one dropped search-result
//   list block) is caused by MISSING STAGED DATA, not by a wrong query.
//
//   Measured already (probe-negdelta-search-mechanism.mjs):
//     - the engine's own generated SQL is CORRECT;
//     - run against the RAW corpus it returns the exact decks the Ruby
//       oracle renders;
//     - run against the staging deck it returns 0 rows, because
//       SEEDED rows referer_id=<the searched card> : 0.
//
//   The searched card is a plain content list card, not a read rule, a SET
//   card, or a SET child, so raw-corpus-seeding.ts never inserts its
//   outgoing card_references rows: only the refs / setRefs / childRefs
//   loops at :434-449 do, and the BFS frontier at :469-524 calls fetchRows
//   (which adds CARD rows) without ever inserting the reference ROWS for
//   the cards it discovers.
//
//   This probe closes the loop in the other direction, WITHOUT editing any
//   tracked file: it boots the staging deck twice and inserts, between the
//   boots, exactly the card_references rows the raw corpus holds for the
//   referers the page's search cards actually query. If that closes the
//   byte gap, the seeding is the cause; if it does not, the cause is in the
//   render path and the localization is wrong.
//
//   NOTHING IN src/ OR IN THE SEEDING IS TOUCHED. The inserts go into the
//   throwaway staging sqlite this probe builds, which is a measurement, not
//   a product edit. The probe is not a gate: it exits with measured numbers.
//
// USAGE (from the worktree root)
//   node tools/oracle/probe-negdelta-search-ref-rows-are-the-gap.mjs \
//     --shard recapture-raw-shard-000008.jsonl \
//     --names "media+GBA+YouTube Browser" [--out tmp/negdelta-refrows-probe]

import { register } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
register("./typescript-source-loader.mjs", pathToFileURL(HERE + path.sep).href);

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const REPO = path.resolve(argValue("--repo", path.resolve(HERE, "..", "..")));
const SHARD = argValue("--shard", "recapture-raw-shard-000000.jsonl");
const OUT_DIR = path.isAbsolute(argValue("--out", ""))
  ? argValue("--out")
  : path.join(REPO, argValue("--out", "tmp/negdelta-refrows-probe"));
const WANT_NAMES = argValue("--names", "")
  .split("|")
  .map((s) => s.trim())
  .filter(Boolean);

const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(REPO, "tmp", "raw-ground-truth", "scripts", "raw-corpus-seeding.js")).href
);
const Database = (await import("better-sqlite3")).default;
const { compareNormalized } = await import(
  pathToFileURL(path.join(REPO, "src", "testing", "diff.ts")).href
);

const lines = readFileSync(
  path.join(REPO, "tmp", "raw-ground-truth", "expected-v2", "page-lane", SHARD),
  "utf8",
)
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l));
const entries = WANT_NAMES.map((n) => {
  const hit = lines.find((l) => l.name === n);
  if (hit === undefined) throw new Error(`name not in shard ${SHARD}: ${n}`);
  return hit;
});

const rawCorpus = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = rawCorpus.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);

async function boot() {
  const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
  storage.fetcher.installNameEnvironment();
  await storage.fetcher.warmLexicon(everyLiveId);
  return storage;
}

const countOf = (html, re) => (html.match(re) ?? []).length;
const signature = (html) => ({
  resultLists: countOf(html, /search-result-list/g),
  resultItems: countOf(html, /search-result-item/g),
  noResults: countOf(html, /search-no-results/g),
});

mkdirSync(OUT_DIR, { recursive: true });

// ---- phase A: the stock seeding (what the grade measures) --------------------

console.log(`PROBE corpus: ${RAW_CORPUS_DB}`);
console.log("PROBE phase A: stock seeding (the graded configuration)");
const storageA = await boot();
const phaseA = new Map();
for (const line of entries) {
  const actual = await storageA.engine.renderPage(line.name);
  const diff = compareNormalized(line.page_html, actual);
  phaseA.set(line.name, { actual, diff });
  console.log(
    `  A ${line.name}: expected=${diff.expectedBytes} actual=${diff.actualBytes} ` +
      `delta=${diff.actualBytes - diff.expectedBytes} ` +
      `firstDiff=${diff.firstDifference.codeUnitOffset} signature=${JSON.stringify(signature(actual))}`,
  );
}
{
  const total = await storageA.fetcher.driver.query("SELECT COUNT(*) n FROM card_references", []);
  console.log(`  A staged card_references rows: ${total.rows[0].n}`);
}
storageA.close();

// ---- which referers do the page's search cards actually query? --------------
//
// Derived, not hardcoded: every card in the deck whose content names a
// `referred_to_by` target, resolved through the raw corpus, plus the
// referee_id its own reference rows point at. For the GBA family this is
// card 12195 (media+GBA+youtube videos), the plain content list card the
// two search cards query.

console.log("PROBE: referers the search cards query, and the rows the corpus holds");
const refererIds = new Set();
for (const r of rawCorpus
  .prepare(`SELECT id, content FROM cards WHERE content LIKE '%referred_to_by%' AND trash = 0`)
  .all()) {
  // the card's own reference rows point at what its query resolves to
  for (const ref of rawCorpus
    .prepare(`SELECT referee_id FROM card_references WHERE referer_id = ? AND ref_type = 'Q'`)
    .all(r.id)) {
    if (ref.referee_id !== null) refererIds.add(ref.referee_id);
  }
}
const extraRows = [];
for (const id of refererIds) {
  for (const r of rawCorpus
    .prepare(
      `SELECT referer_id, referee_id, referee_key, ref_type FROM card_references WHERE referer_id = ?`,
    )
    .all(id)) {
    extraRows.push(r);
  }
}
console.log(`  referers the search-card queries resolve to: ${refererIds.size} ${JSON.stringify([...refererIds])}`);
console.log(`  card_references rows the raw corpus holds for them: ${extraRows.length}`);

// ---- phase B: the same boot, plus exactly those rows ------------------------

console.log("PROBE phase B: stock seeding + those rows inserted into the staging deck");
const storageB = await boot();
for (const r of extraRows) {
  await storageB.fetcher.driver.query(
    `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present) ` +
      `VALUES (?, ?, ?, ?, NULL)`,
    [r.referer_id, r.referee_key, r.referee_id, r.ref_type],
  );
}
{
  const total = await storageB.fetcher.driver.query("SELECT COUNT(*) n FROM card_references", []);
  console.log(`  B staged card_references rows: ${total.rows[0].n}`);
}
let stillShort = 0;
for (const line of entries) {
  const actual = await storageB.engine.renderPage(line.name);
  const diff = compareNormalized(line.page_html, actual);
  const a = phaseA.get(line.name);
  const aDelta = a.diff.actualBytes - a.diff.expectedBytes;
  const bDelta = diff.actualBytes - diff.expectedBytes;
  console.log(
    `  B ${line.name}: expected=${diff.expectedBytes} actual=${diff.actualBytes} ` +
      `delta=${bDelta} firstDiff=${diff.firstDifference.codeUnitOffset} ` +
      `signature=${JSON.stringify(signature(actual))}` +
      `  [phase A delta=${aDelta}] moved=${bDelta - aDelta}`,
  );
  if (bDelta < 0) stillShort++;
  const safe = line.name.replace(/[^\w.-]+/g, "_").slice(0, 80);
  writeFileSync(path.join(OUT_DIR, `expected--${safe}.html`), line.page_html, "utf8");
  writeFileSync(path.join(OUT_DIR, `phaseA-actual--${safe}.html`), a.actual, "utf8");
  writeFileSync(path.join(OUT_DIR, `phaseB-actual--${safe}.html`), actual, "utf8");
}
storageB.close();
rawCorpus.close();
console.log(
  `PROBE verdict: ${stillShort === 0 ? "SEEDING CONFIRMED" : "NOT the seeding alone"} ` +
    `(${stillShort} of ${entries.length} still short)`,
);
console.log(`PROBE done: artifacts in ${OUT_DIR}`);
process.exit(0);
