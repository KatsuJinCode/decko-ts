// probe-page-lane-byte-divergence.mjs -- reproduce a PAGE-LANE byte divergence
// for named cards and dump the expected/actual pair the offline region
// reporter consumes. The page-lane sibling of
// probe-view-lane-byte-divergence.mjs (lane-negdelta-zero).
//
// WHAT THIS IS
//   The grade records a page entry's FIRST byte difference and its two byte
//   COUNTS, never the region between them. When a page entry's over-render
//   GROWS across two canvases (e.g. `Shark:page` +74,130 -> +79,196 between
//   cf7dc5c and 29ef88f, +5,066 of new over-render) the question "which
//   mechanism added the bytes" cannot be answered from the counts: the first
//   difference is at the same offset (9128) in both canvases, so it names
//   nothing about the growth. This probe re-renders ONE page through the same
//   boot the grade used, writes the exact `expected--*.html` / `actual--*.html`
//   pair, and prints every divergence region with its own delta.
//
//   IT IS THE VIEW PROBE, UNCHANGED IN EVERY LOAD-BEARING RESPECT, AND IT
//   PICKS THE SEEDING MODULE THE GRADE PICKS:
//   - `tests/card/render/raw-corpus-seeding.js` — the COMMITTED home, the one
//     `tools/oracle/dual-lane-direct-runner-core.ts:522` imports. NOT the
//     `tmp/raw-ground-truth/scripts/` staging copy the view probe uses: that
//     copy predates the full reference-graph pass and stages 3,184
//     card_references rows where the committed home stages 556,526
//     (runner-core.ts:502-521). Using it changed the measured Shark actual
//     from the grade's 210,273 to 213,667 — a 3,394-byte drift that would
//     have been misread as engine behaviour. The entry that opens by reading
//     `tmp/raw-ground-truth/scripts/` is therefore a BUG, and the count
//     assertion in the FAIL line below is what catches it;
//   - the same `installNameEnvironment()` and `warmLexicon` over every live id;
//   - the same comparator, `src/testing/diff.ts` compareNormalized, so the
//     verdict matches the grade byte for byte;
//   - the same `renderPage` call the grade's page handler makes
//     (tools/oracle/dual-lane-direct-runner-core.ts:782).
//   The only difference is the render call and the shard field read
//   (`page_html`, not `views`).
//
// USAGE (from the worktree root)
//   node tools/oracle/probe-page-lane-byte-divergence.mjs \
//     --shard recapture-raw-shard-000029.jsonl --names "Shark" \
//     [--out tmp/mopup-shark-m9/probe-page]
//
//   --names accepts a `|`-separated list. Exit 0 when at least one divergence
//   reproduces, 1 when the named entries are byte-equal, 2 on a usage error.

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
const SHARD = argValue("--shard", "");
const OUT_DIR = path.isAbsolute(argValue("--out", ""))
  ? argValue("--out")
  : path.join(REPO, argValue("--out", "tmp/mopup-shark-m9/probe-page"));
const WANT_NAMES = argValue("--names", "");
const WRITE_RAW = argValue("--write-raw", "yes") !== "no";
const RESYNC = Number(argValue("--resync", "40"));
/** Render the same page N times in one boot. A page whose bar nests are
 *  order-unstable can differ in byte COUNT between runs; without this the
 *  probe cannot tell an engine change from that instability, and an
 *  attribution built on one run is worthless. */
const REPEAT = Number(argValue("--repeat", "1"));

if (SHARD === "") {
  console.error("PROBE-ERROR: --shard is required");
  process.exit(2);
}

const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(REPO, "tests", "card", "render", "raw-corpus-seeding.js")).href
);
const Database = (await import("better-sqlite3")).default;
const { compareNormalized, normalizeSlotIds } = await import(
  pathToFileURL(path.join(REPO, "src", "testing", "diff.ts")).href
);

const shardPath = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2", "page-lane", SHARD);
const lines = readFileSync(shardPath, "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l));

let entries = lines;
if (WANT_NAMES !== "") {
  const wanted = WANT_NAMES.split("|").map((n) => n.trim());
  const missing = [];
  entries = wanted.map((name) => {
    const found = lines.find((l) => l.name === name);
    if (found === undefined) missing.push(name);
    return found;
  });
  if (missing.length > 0) {
    console.error(`PROBE-ERROR: name(s) not in shard ${SHARD}: ${missing.join(", ")}`);
    process.exit(2);
  }
}

const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = idLister.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
idLister.close();

console.log(`PROBE boot: corpus=${RAW_CORPUS_DB} shard=${SHARD} entries=${entries.length}`);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
console.log(`PROBE boot done: ids=${everyLiveId.length}`);

/** The view probe's own resynchronising walk, verbatim in behaviour. */
function divergenceRegions(expected, actual) {
  const e = normalizeSlotIds(expected);
  const a = normalizeSlotIds(actual);
  const regions = [];
  let i = 0;
  let j = 0;
  while (i < e.length || j < a.length) {
    while (i < e.length && j < a.length && e[i] === a[j]) {
      i += 1;
      j += 1;
    }
    if (i >= e.length && j >= a.length) break;
    const ei = i;
    const aj = j;
    let k = -1;
    const limit = Math.min(e.length - i, a.length - j) - RESYNC;
    for (let t = 1; t <= limit; t += 1) {
      let ok = true;
      for (let m = 0; m < RESYNC; m += 1) {
        if (e[i + t + m] !== a[j + t + m]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        k = t;
        break;
      }
    }
    if (k === -1) {
      regions.push({
        expectedStart: ei,
        actualStart: aj,
        expectedLen: e.length - ei,
        actualLen: a.length - aj,
        resynced: false,
      });
      break;
    }
    regions.push({ expectedStart: ei, actualStart: aj, expectedLen: k, actualLen: k, resynced: true });
    i += k;
    j += k;
  }
  return regions.map((r) => ({
    ...r,
    expectedText: expected.slice(r.expectedStart, r.expectedStart + Math.max(r.expectedLen, 260)),
    actualText: actual.slice(r.actualStart, r.actualStart + Math.max(r.actualLen, 260)),
  }));
}

let reproduced = 0;
let checked = 0;
mkdirSync(OUT_DIR, { recursive: true });

for (const line of entries) {
  const expected = line.page_html;
  if (typeof expected !== "string") {
    console.log(`SKIP ${line.name}: no page_html`);
    continue;
  }
  let actual;
  try {
    actual = await storage.engine.renderPage(line.name);
  } catch (error) {
    console.log(
      `FAIL ${line.name}:page RAISED ${error?.constructor?.name ?? "Error"}: ${error?.message ?? error}`,
    );
    reproduced += 1;
    continue;
  }
  checked += 1;
  if (REPEAT > 1) {
    const counts = [actual.length];
    for (let n = 1; n < REPEAT; n += 1) {
      counts.push((await storage.engine.renderPage(line.name)).length);
    }
    console.log(`STABILITY ${line.name}:page n=${REPEAT} actualBytes=[${counts.join(",")}]`);
  }
  const diff = compareNormalized(expected, actual);
  if (diff.equal) {
    console.log(`PASS ${line.name}:page expected=${diff.expectedBytes} actual=${diff.actualBytes}`);
    continue;
  }
  reproduced += 1;
  const tag = line.name.length > 60 ? line.name.slice(0, 57) + "..." : line.name;
  console.log(
    `FAIL ${tag}:page expected=${diff.expectedBytes} actual=${diff.actualBytes} delta=${diff.actualBytes - diff.expectedBytes} firstDiff=${diff.firstDifference?.codeUnitOffset}`,
  );
  const regions = divergenceRegions(expected, actual);
  for (const [i, r] of regions.entries()) {
    console.log(
      `  region ${i + 1}/${regions.length} expected[${r.expectedStart}..+${r.expectedLen}] actual[${r.actualStart}..+${r.actualLen}] delta=${r.actualLen - r.expectedLen} resynced=${r.resynced}`,
    );
    console.log(`    expected: ${JSON.stringify(r.expectedText).slice(0, 700)}`);
    console.log(`    actual:   ${JSON.stringify(r.actualText).slice(0, 700)}`);
  }
  if (WRITE_RAW) {
    const safe = `${line.name}__page`.replace(/[^\w.-]+/g, "_").slice(0, 100);
    writeFileSync(path.join(OUT_DIR, `expected--${safe}.html`), expected, "utf8");
    writeFileSync(path.join(OUT_DIR, `actual--${safe}.html`), actual, "utf8");
    console.log(`  wrote ${OUT_DIR}/expected--${safe}.html and actual--${safe}.html`);
  }
}
console.log(`PROBE summary: ${reproduced} divergences over ${checked} page renders; outputs in ${OUT_DIR}`);
storage.close();
process.exit(reproduced > 0 ? 0 : 1);
