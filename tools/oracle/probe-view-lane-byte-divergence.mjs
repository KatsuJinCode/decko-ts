// probe-view-lane-byte-divergence.mjs -- reproduce a VIEW-LANE byte divergence
// for named cards and dump every divergent region (lane-negdelta-zero).
//
// WHAT THIS IS
//   The view-lane sibling of probe-negdelta-page-bytes.mjs. That probe boots
//   the engine, renders whole PAGES and byte-diffs them against the shard's
//   `page_html`. This one does the same for the VIEW lane: the expected-v2
//   view-lane shard stores `views: { <view>: <html> }` per card, and the
//   runner's lane-V handler is exactly `storage.engine.render(cardName, view)`
//   (tools/oracle/dual-lane-direct-runner-core.ts:765). Same boot, same
//   comparator (src/testing/diff.ts compareNormalized) so the verdict matches
//   the grade byte for byte.
//
//   Why a second probe rather than widening the page probe: a view-lane
//   failure is usually a SINGLE slot wrapper inside one card, and the grade
//   records only the FIRST difference. When the byte-count gap is much larger
//   than the first-diff hunk there is a SECOND divergence further in, and the
//   decision about which mechanism owns the entry cannot be made from the
//   first hunk alone. This probe reports EVERY non-overlapping divergence
//   region so the size of the gap can be accounted for.
//
//   Boot is the runner's exact sequence: the tmp/raw-ground-truth staging
//   seeding module, installNameEnvironment, warmLexicon over every live id.
//   Using a different seeding module changes the byte counts (the older
//   tests/card/render copy renders *all+*all+*follow closed at 3112 bytes
//   where the graded run produced 3102), so the boot here must not drift.
//
// USAGE (from the worktree root)
//   node tools/oracle/probe-view-lane-byte-divergence.mjs \
//     --shard recapture-raw-shard-000017.jsonl \
//     --names "*all+*all+*follow" [--views closed,open] \
//     [--out tmp/negdelta-zero/probe-view]
//
//   With no --names the probe grades EVERY view of EVERY card in the shard
//   and prints only the failing entries (the "is this card still broken?"
//   sweep). Exit 0 when at least one divergence reproduces, 1 otherwise.
//   Exit 2 when a requested name or view is not in the shard (a usage error,
//   not a measurement).

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
  : path.join(REPO, argValue("--out", "tmp/negdelta-zero/probe-view"));
const WANT_NAMES = argValue("--names", "");
const WANT_VIEWS = argValue("--views", "");
const WRITE_RAW = argValue("--write-raw", "yes") !== "no";

if (SHARD === "") {
  console.error("PROBE-ERROR: --shard is required");
  process.exit(2);
}

const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(REPO, "tmp", "raw-ground-truth", "scripts", "raw-corpus-seeding.js")).href
);
const Database = (await import("better-sqlite3")).default;
const { compareNormalized, normalizeSlotIds } = await import(
  pathToFileURL(path.join(REPO, "src", "testing", "diff.ts")).href
);

const shardPath = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2", "view-lane", SHARD);
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

/** Longest common prefix length. */
function commonPrefixLen(a, b) {
  let n = 0;
  const min = Math.min(a.length, b.length);
  while (n < min && a[n] === b[n]) n += 1;
  return n;
}

/**
 * Every non-overlapping divergence region over the SLOT-ID-NORMALIZED sides
 * (the same normalization compareNormalized applies, so a randomized slot id
 * never masquerades as a byte difference).
 *
 * The walk keeps TWO cursors. A single shared index is wrong the moment the
 * sides differ in length: after an insertion every later comparison reads
 * the wrong actual offset and the walk reports one enormous "region" that
 * spans the whole rest of the render. Resynchronisation advances both cursors
 * by the same shift `k`, which is the only way a replacement, an insertion
 * and a deletion all land as one bounded region.
 */
function divergenceRegions(expected, actual, RESYNC = 40) {
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
      regions.push({ expectedStart: ei, actualStart: aj, expectedLen: e.length - ei, actualLen: a.length - aj, resynced: false });
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

const CONTEXT = 160;
let reproduced = 0;
let checked = 0;
mkdirSync(OUT_DIR, { recursive: true });

for (const line of entries) {
  const viewNames = WANT_VIEWS === "" ? Object.keys(line.views ?? {}) : WANT_VIEWS.split(",").map((v) => v.trim()).filter((v) => v in (line.views ?? {}));
  for (const view of viewNames) {
    const expected = line.views[view];
    if (typeof expected !== "string") continue;
    let actual;
    try {
      actual = await storage.engine.render(line.name, view);
    } catch (error) {
      console.log(`FAIL ${line.name}:${view} RAISED ${error?.constructor?.name ?? "Error"}: ${error?.message ?? error}`);
      reproduced += 1;
      continue;
    }
    checked += 1;
    const diff = compareNormalized(expected, actual);
    if (diff.equal) continue;
    reproduced += 1;
    const tag = line.name.length > 60 ? line.name.slice(0, 57) + "..." : line.name;
    console.log(`FAIL ${tag}:${view} expected=${diff.expectedBytes} actual=${diff.actualBytes} delta=${diff.actualBytes - diff.expectedBytes}`);
    const regions = divergenceRegions(expected, actual);
    for (const [i, r] of regions.entries()) {
      console.log(
        `  region ${i + 1}/${regions.length} expected[${r.expectedStart}..+${r.expectedLen}] actual[${r.actualStart}..+${r.actualLen}] delta=${r.actualLen - r.expectedLen} resynced=${r.resynced}`,
      );
      console.log(`    expected: ${JSON.stringify(r.expectedText).slice(0, 700)}`);
      console.log(`    actual:   ${JSON.stringify(r.actualText).slice(0, 700)}`);
    }
    if (regions.length === 0) {
      const off = diff.firstDifference.codeUnitOffset;
      console.log(`  context-before: ${JSON.stringify(expected.slice(Math.max(0, off - CONTEXT), off))}`);
      console.log(`  context-before-actual: ${JSON.stringify(actual.slice(Math.max(0, off - CONTEXT), off))}`);
    }
    if (WRITE_RAW) {
      const safe = `${line.name}__${view}`.replace(/[^\w.-]+/g, "_").slice(0, 100);
      writeFileSync(path.join(OUT_DIR, `expected--${safe}.html`), expected, "utf8");
      writeFileSync(path.join(OUT_DIR, `actual--${safe}.html`), actual, "utf8");
    }
  }
}
console.log(`PROBE summary: ${reproduced} divergences over ${checked} view renders; outputs in ${OUT_DIR}`);
storage.close();
process.exit(reproduced > 0 ? 0 : 1);
