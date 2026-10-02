// probe-negdelta-seeded-reference-restore.mjs -- the falsification test for
// the negative-delta page family's root cause (lane-negdelta, attempt 3).
//
// WHAT THIS IS
//   The negative-delta page family (145 page-lane failures where the TS port
//   renders FEWER bytes than the Ruby oracle; 99 of them, 967,642 of the
//   family's 1,084,985 missing bytes, carry one dominant dropped list block)
//   was localized to ONE cause: the search content views on those pages
//   resolve to `search-no-results` on our side because the seeded staging
//   deck's `card_references` table carries no rows for ordinary content-card
//   referers. tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts:163-172
//   seeds reference rows ONLY for referers in the read-rule universe
//   (`refs`), plus the set-card (`setRefs`, :215-239) and set-child
//   (`childRefs`, :261-298) walks; the three insertion loops are :435-450.
//
//   probe-negdelta-search-mechanism.mjs shows the engine's own generated SQL
//   is CORRECT and returns 0 rows ONLY because the staging table is empty
//   for the referer. This probe closes the loop in the other direction: it
//   runs the SAME page render twice against two fresh storage boots --
//
//     PHASE A  the stock seeding (the graded configuration)
//     PHASE B  the stock seeding PLUS the card_references rows the raw
//              corpus holds for the page's search referers
//
//   and byte-compares each phase against the shard's page_html. If phase B
//   closes the first divergence, the seeding is the cause; if it does not,
//   the cause is in the render path and the localization is wrong.
//
//   NOTHING IN src/ IS TOUCHED. Phase B's inserts go into the throwaway
//   staging sqlite this probe builds (the same one the engine already
//   queries), which is a measurement, not an engine edit. The probe exits
//   with the measured numbers; it is not a gate.
//
// USAGE (from the worktree root)
//   node tools/oracle/probe-negdelta-seeded-reference-restore.mjs \
//     --shard recapture-raw-shard-000000.jsonl \
//     --names "somatic|Archetypal" [--out tmp/negdelta-restore-probe]
//
//   The shard is a single argument; every name in --names must live in it.

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
  : path.join(REPO, argValue("--out", "tmp/negdelta-restore-probe"));
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

const lines = readFileSync(path.join(REPO, "tmp", "raw-ground-truth", "expected-v2", "page-lane", SHARD), "utf8")
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

/** Fresh engine boot, the exact sequence probe-negdelta-page-bytes.mjs uses. */
async function boot() {
  const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
  storage.fetcher.installNameEnvironment();
  await storage.fetcher.warmLexicon(everyLiveId);
  return storage;
}

function countOf(html, re) {
  return (html.match(re) ?? []).length;
}

/** The signature that distinguishes this family from a generic byte drift. */
function signature(html) {
  return {
    resultLists: countOf(html, /search-result-list/g),
    resultItems: countOf(html, /search-result-item/g),
    noResults: countOf(html, /search-no-results/g),
  };
}

mkdirSync(OUT_DIR, { recursive: true });

// ---- phase A: the stock seeding (what the grade measures) -------------------

console.log(`PROBE corpus: ${RAW_CORPUS_DB}`);
console.log("PROBE phase A: stock seeding (the graded configuration)");
const storageA = await boot();
const phaseA = new Map();
for (const line of entries) {
  const actual = await storageA.engine.renderPage(line.name);
  const diff = compareNormalized(line.page_html, actual);
  phaseA.set(line.name, { actual, diff });
  const s = signature(actual);
  console.log(
    `  A ${line.name}: expected=${diff.expectedBytes} actual=${diff.actualBytes} ` +
      `delta=${diff.actualBytes - diff.expectedBytes} firstDiff=${diff.firstDifference.codeUnitOffset} ` +
      `signature=${JSON.stringify(s)}`,
  );
}
{
  const total = await storageA.engine.fetcher.driver.query("SELECT COUNT(*) n FROM card_references", []);
  console.log(`  A staged card_references rows: ${total.rows[0].n}`);
}
storageA.close();

// ---- phase B: the same boot plus the corpus's rows for the pages' referers --
//
// The referer set is derived, not hardcoded: for each page, the raw corpus's
// own card_references rows where the page card is EITHER side. Both directions
// matter -- `referred_to_by` is a referee-side join, `refer_to` is a
// referer-side join, and the two probes above showed both shapes in this
// family (somatic/Archetypal reverse, media+GBA+youtube videos forward).

const pageIds = new Map();
for (const line of entries) {
  const row = rawCorpus.prepare("SELECT id FROM cards WHERE name = ? AND trash = 0").get(line.name);
  pageIds.set(line.name, row?.id ?? null);
  console.log(`  corpus id for "${line.name}": ${row?.id ?? "NOT FOUND"}`);
}
const extraRows = [];
for (const [name, id] of pageIds) {
  if (id === null) continue;
  for (const r of rawCorpus
    .prepare(
      `SELECT referer_id, referee_id, referee_key, ref_type FROM card_references ` +
        `WHERE referer_id = ? OR referee_id = ?`,
    )
    .all(id, id)) {
    extraRows.push({ ...r, forPage: name });
  }
}
const byType = {};
for (const r of extraRows) byType[r.ref_type] = (byType[r.ref_type] ?? 0) + 1;
console.log(`  extra card_references rows the raw corpus holds for these pages: ${extraRows.length} ${JSON.stringify(byType)}`);

console.log("PROBE phase B: stock seeding + those rows inserted into the staging deck");
const storageB = await boot();
for (const r of extraRows) {
  // ref_type is carried this time -- the stock seeding's three loops
  // (raw-corpus-seeding.ts:435-450) never select it, so seedReference's
  // default "L" (render-test-storage.ts:306) labels every seeded row 'L'.
  await storageB.fetcher.driver.query(
    `INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present) VALUES (?, ?, ?, ?, NULL)`,
    [r.referer_id, r.referee_key, r.referee_id, r.ref_type],
  );
}
{
  const total = await storageB.fetcher.driver.query("SELECT COUNT(*) n FROM card_references", []);
  console.log(`  B staged card_references rows: ${total.rows[0].n}`);
}
for (const line of entries) {
  const actual = await storageB.engine.renderPage(line.name);
  const diff = compareNormalized(line.page_html, actual);
  const a = phaseA.get(line.name);
  const s = signature(actual);
  console.log(
    `  B ${line.name}: expected=${diff.expectedBytes} actual=${diff.actualBytes} ` +
      `delta=${diff.actualBytes - diff.expectedBytes} firstDiff=${diff.firstDifference.codeUnitOffset} ` +
      `signature=${JSON.stringify(s)}` +
      `  [phase A delta=${a.diff.actualBytes - a.diff.expectedBytes} firstDiff=${a.diff.firstDifference.codeUnitOffset}]`,
  );
  const safe = line.name.replace(/[^\w.-]+/g, "_").slice(0, 80);
  writeFileSync(path.join(OUT_DIR, `phaseB-actual--${safe}.html`), actual, "utf8");
  writeFileSync(path.join(OUT_DIR, `phaseA-actual--${safe}.html`), a.actual, "utf8");
  writeFileSync(path.join(OUT_DIR, `expected--${safe}.html`), line.page_html, "utf8");
}
storageB.close();
rawCorpus.close();
console.log(`PROBE done: artifacts in ${OUT_DIR}`);
process.exit(0);
