// probe-negdelta-tracked-seeding-decides.mjs -- the decisive falsification
// for the negative-delta page family (lane-negdelta, attempt 3).
//
// WHAT THIS IS
//   Everything else this lane measured points at the SEEDING, not the
//   engine. The last open question is WHICH seeding the grade runs:
//
//     - the graded spec tmp/raw-ground-truth/scripts/verify-dual-lane.test.ts
//       imports its SIBLING ./raw-corpus-seeding.js -- an UNTRACKED copy
//       (gitignored by .gitignore:45 "tmp/") that predates the fix;
//     - the COMMITTED home tests/card/render/raw-corpus-seeding.ts carries
//       "THE FULL REFERENCE GRAPH PASS (the search-final lane fix)" at
//       :699-745, which copies the corpus card_references table verbatim
//       (id, referer_id, referee_key, referee_id, ref_type, is_present).
//       Its own header names this exact symptom: "Without the pass the
//       harness replays render search-no-results where the oracle lists
//       search-result-item bars".
//
//   So the hypothesis under test is: the 145 negative-delta failures are
//   the grade running a STALE copy of a module whose fix is already
//   committed, not an engine defect and not a missing fix.
//
//   This probe renders the same pages twice -- once through each seeding
//   module, same corpus, same engine, same compare -- and prints both
//   deltas side by side. If the tracked seeding drives the delta to 0
//   (or far past the stale copy) the hypothesis holds and the fix is to
//   point the grade at the committed home, not to edit the engine.
//
//   NOTHING IN src/ IS TOUCHED and nothing is written outside OUT_DIR.
//
// USAGE (from the worktree root)
//   node tools/oracle/probe-negdelta-tracked-seeding-decides.mjs \
//     --shard recapture-raw-shard-000008.jsonl \
//     --names "media+GBA+YouTube Browser" [--out tmp/negdelta-tracked-vs-stale]

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
  : path.join(REPO, argValue("--out", "tmp/negdelta-tracked-vs-stale"));
const WANT_NAMES = argValue("--names", "")
  .split("|")
  .map((s) => s.trim())
  .filter(Boolean);

const { compareNormalized } = await import(
  pathToFileURL(path.join(REPO, "src", "testing", "diff.ts")).href
);

// Specified with the ".js" extension exactly as the graded spec and the
// other probes in this lane import them: the TypeScript source loader
// registered above resolves the specifier to the .ts module. Importing
// the .ts path directly does NOT go through that resolution and fails
// with SQLITE_IOERR_READ inside the closure walk.
const SEEDINGS = {
  stale: "tmp/raw-ground-truth/scripts/raw-corpus-seeding.js",
  tracked: "tests/card/render/raw-corpus-seeding.js",
};

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

mkdirSync(OUT_DIR, { recursive: true });
const countOf = (html, re) => (html.match(re) ?? []).length;
const signature = (html) => ({
  resultLists: countOf(html, /search-result-list/g),
  resultItems: countOf(html, /search-result-item/g),
  noResults: countOf(html, /search-no-results/g),
});

const results = {};
for (const [label, rel] of Object.entries(SEEDINGS)) {
  const abs = path.join(REPO, rel);
  const mod = await import(pathToFileURL(abs).href);
  const Database = (await import("better-sqlite3")).default;
  const rawCorpus = new Database(mod.RAW_CORPUS_DB, { readonly: true });
  const everyLiveId = rawCorpus.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
  rawCorpus.close();

  console.log(`\n=== ${label}: ${rel} ===`);
  const storage = await mod.createRawStructureSeededStorage(new Set(everyLiveId));
  storage.fetcher.installNameEnvironment();
  await storage.fetcher.warmLexicon(everyLiveId);
  const staged = await storage.fetcher.driver.query("SELECT COUNT(*) n FROM card_references", []);
  console.log(`  staged card_references rows: ${staged.rows[0].n}`);
  results[label] = [];
  for (const line of entries) {
    const actual = await storage.engine.renderPage(line.name);
    const diff = compareNormalized(line.page_html, actual);
    const delta = diff.actualBytes - diff.expectedBytes;
    console.log(
      `  ${label} ${line.name}: expected=${diff.expectedBytes} actual=${diff.actualBytes} ` +
        `delta=${delta} firstDiff=${diff.firstDifference.codeUnitOffset} ` +
        `signature=${JSON.stringify(signature(actual))}`,
    );
    results[label].push({ name: line.name, delta, actual, expected: diff.expectedBytes });
    const safe = line.name.replace(/[^\w.-]+/g, "_").slice(0, 80);
    writeFileSync(path.join(OUT_DIR, `${label}--${safe}.html`), actual, "utf8");
  }
  storage.close();
}

console.log("\n=== VERDICT ===");
let stillNegative = 0;
for (let i = 0; i < entries.length; i++) {
  const s = results.stale[i];
  const t = results.tracked[i];
  console.log(
    `  ${s.name}: stale delta=${s.delta} -> tracked delta=${t.delta} ` +
      `moved=${t.delta - s.delta}${t.delta === 0 ? "  (BYTE-EXACT)" : ""}`,
  );
  if (t.delta !== 0) stillNegative++;
}
console.log(
  `  ${stillNegative === 0 ? "TRACKED SEEDING IS BYTE-EXACT" : "tracked seeding still differs"} ` +
    `(${stillNegative} of ${entries.length} non-zero)`,
);
console.log(`PROBE done: artifacts in ${OUT_DIR}`);
process.exit(0);
