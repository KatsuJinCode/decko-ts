// probe-viewsig-lane-V.mjs -- LANE-V (view lane) signature probe.
//
// WHAT THIS IS
//   One engine boot, then `engine.render(cardName, view)` for an explicit
//   list of (name, shard, view) triples, compared byte-for-byte against the
//   captured Ruby oracle HTML in tmp/raw-ground-truth/expected-v2/view-lane/.
//   For each target it reports the same fields the grade's failure record
//   carries -- id, area, signature, first-difference code-unit offset,
//   expected/actual bytes -- plus the HTML context around the first
//   divergence, and dumps expected/actual to disk for the failing ones.
//
//   The full shard grade (tools/oracle/dual-lane-direct-runner.mjs) is the
//   authority; this probe exists because the corpus seed is the expensive
//   part and a diagnosis round needs many single-view renders out of ONE
//   boot, not one boot per view.
//
// USAGE (from the worktree root)
//   node tools/oracle/probe-viewsig-lane-V.mjs \
//     --entries "*input type+*right+*content options::recapture-raw-shard-000007.jsonl::open" \
//     [--out tmp/viewsig-probe] [--context 240]
//
//   --entries entries are separated by "|", each "name::shard::view".
//   With no --entries the probe uses the 29 census target ids.

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
const OUT_DIR = path.isAbsolute(argValue("--out", ""))
  ? argValue("--out")
  : path.join(REPO, argValue("--out", "tmp/viewsig-probe"));
const CONTEXT = Number(argValue("--context", "240"));
const RAW_ENTRIES = argValue("--entries", "");
const QUIET = argValue("--quiet", "") === "1";

// The 29 view-lane failures the census names for shards 000000-000011, as
// (name, shard, view). "record" entries are lane-V card-engine records and
// have no view; the caller handles those through --card-engine instead.
const CENSUS_TARGETS = [
  ["Klickstein continues+discussion", "recapture-raw-shard-000005.jsonl", "open"],
  ["*input type+*right", "recapture-raw-shard-000000.jsonl", "content"],
  ["*input type+*right", "recapture-raw-shard-000000.jsonl", "open"],
  ["Cardtype+*type+*default", "recapture-raw-shard-000000.jsonl", "content"],
  ["Cardtype+*type+*default", "recapture-raw-shard-000000.jsonl", "open"],
  ["Menu+*right+*default", "recapture-raw-shard-000000.jsonl", "open"],
  ["Metashamanic+Core Project", "recapture-raw-shard-000000.jsonl", "open"],
  ["*input type+*right+*content options", "recapture-raw-shard-000007.jsonl", "closed"],
  ["*input type+*right+*content options", "recapture-raw-shard-000007.jsonl", "content"],
  ["*input type+*right+*content options", "recapture-raw-shard-000007.jsonl", "open"],
  ["Recommendations+*right", "recapture-raw-shard-000007.jsonl", "content"],
  ["Recommendations+*right", "recapture-raw-shard-000007.jsonl", "open"],
  ["RichText+Recommendations+*type plus right", "recapture-raw-shard-000007.jsonl", "content"],
  ["RichText+Recommendations+*type plus right", "recapture-raw-shard-000007.jsonl", "open"],
  ["Archetypal role playing discussion on Facebook Aug 2012", "recapture-raw-shard-000010.jsonl", "open"],
  ["media+GBA+YouTube Browser", "recapture-raw-shard-000008.jsonl", "open"],
  ["Lindsey Kerr+Family", "recapture-raw-shard-000011.jsonl", "open"],
  ["The Habit - a predictable travesty", "recapture-raw-shard-000011.jsonl", "open"],
  ["*rstar", "recapture-raw-shard-000003.jsonl", "content"],
  ["*rstar", "recapture-raw-shard-000003.jsonl", "open"],
  ["*star", "recapture-raw-shard-000003.jsonl", "content"],
  ["*star", "recapture-raw-shard-000003.jsonl", "open"],
  ["Andrew Porter", "recapture-raw-shard-000006.jsonl", "open"],
  ["RichText+Gallery10+*type plus right", "recapture-raw-shard-000006.jsonl", "content"],
  ["RichText+Gallery10+*type plus right", "recapture-raw-shard-000006.jsonl", "open"],
];

const ENTRIES = RAW_ENTRIES
  ? RAW_ENTRIES.split("|").filter(Boolean).map((e) => {
      const [name, shard, view] = e.split("::");
      return { name, shard, view };
    })
  : CENSUS_TARGETS.map(([name, shard, view]) => ({ name, shard, view }));

// Seeding rides the COMMITTED home (tests/card/render/raw-corpus-seeding.ts),
// whose relative ../../../src imports resolve to THIS repo's engine — the
// tmp/raw-ground-truth junction copy would import the negdelta worktree's
// src instead and silently render another tree's code.
const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(REPO, "tests", "card", "render", "raw-corpus-seeding.js")).href
);
const Database = (await import("better-sqlite3")).default;
const { compareNormalized } = await import(
  pathToFileURL(path.join(REPO, "src", "testing", "diff.ts")).href
);

const shardCache = new Map();
function shardLines(name) {
  if (!shardCache.has(name)) {
    shardCache.set(
      name,
      readFileSync(path.join(REPO, "tmp", "raw-ground-truth", "expected-v2", "view-lane", name), "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map(JSON.parse),
    );
  }
  return shardCache.get(name);
}

const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = idLister.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
idLister.close();
console.log(`PROBE-V boot: corpus=${RAW_CORPUS_DB} ids=${everyLiveId.length}`);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
console.log("PROBE-V boot done");

mkdirSync(OUT_DIR, { recursive: true });
const census = [];
for (const { name, shard, view } of ENTRIES) {
  const line = shardLines(shard).find((l) => l.name === name);
  if (line === undefined) {
    console.log(`RENDER-V ${name} :: ${view}: NOT-IN-SHARD ${shard}`);
    census.push({ name, shard, view, error: "not-in-shard" });
    continue;
  }
  const expected = line.views?.[view];
  if (expected === undefined) {
    console.log(`RENDER-V ${name} :: ${view}: NO-SUCH-VIEW (has ${Object.keys(line.views ?? {}).join(",")})`);
    census.push({ name, shard, view, error: "no-such-view" });
    continue;
  }
  let actual;
  try {
    actual = await storage.engine.render(name, view);
  } catch (error) {
    console.log(`RENDER-V ${name} :: ${view}: THREW ${error?.name}: ${error?.message}`);
    census.push({ name, shard, view, threw: `${error?.name}: ${error?.message}` });
    continue;
  }
  const d = compareNormalized(expected, actual);
  const delta = d.actualBytes - d.expectedBytes;
  let i = 0;
  const n = Math.min(actual.length, expected.length);
  while (i < n && actual[i] === expected[i]) i += 1;
  const rec = {
    name,
    shard,
    view,
    equal: d.equal === true,
    delta,
    firstDivergence: i,
    firstDifferenceOffset: d.firstDifference?.codeUnitOffset ?? null,
    expectedBytes: d.expectedBytes,
    actualBytes: d.actualBytes,
    tagCounts: {},
  };
  for (const [label, re] of [
    ["denial-view", /denial-view/g],
    ["card-slot-stub", /card-slot-stub/g],
    ["search-result-list", /search-result-list/g],
    ["search-result-item", /search-result-item/g],
    ["pointer-list", /pointer-list/g],
    ["pointer-item", /pointer-item/g],
    ["Xcontent_option", /Xcontent_option/g],
    ["input_field", /input_field/g],
    ["content_option", /content-option/g],
    ["content_option_dash", /content_option/g],
  ]) {
    rec.tagCounts[label] = {
      exp: (expected.match(re) ?? []).length,
      act: (actual.match(re) ?? []).length,
    };
  }
  const safe = `${name.replace(/[^\w.-]+/g, "_").slice(0, 70)}__${view}`;
  rec.outExpected = `expected--${safe}.html`;
  rec.outActual = `actual--${safe}.html`;
  writeFileSync(path.join(OUT_DIR, rec.outExpected), expected, "utf8");
  writeFileSync(path.join(OUT_DIR, rec.outActual), actual, "utf8");
  rec.expectedCtx = expected.slice(Math.max(0, i - CONTEXT), i + CONTEXT);
  rec.actualCtx = actual.slice(Math.max(0, i - CONTEXT), i + CONTEXT);
  census.push(rec);
  if (!QUIET) {
    console.log(
      `RENDER-V ${name} :: ${view}: equal=${rec.equal} delta=${delta} exp=${rec.expectedBytes} act=${rec.actualBytes} firstDiff=${rec.firstDifferenceOffset} rawFirst=${i}`,
    );
    const counts = Object.entries(rec.tagCounts)
      .filter(([, c]) => c.exp !== c.act)
      .map(([k, c]) => `${k}=${c.exp}/${c.act}`)
      .join(" ");
    if (counts !== "") console.log(`  COUNT-DIFF ${counts}`);
    console.log(`  EXPECTED-CTX ${JSON.stringify(rec.expectedCtx)}`);
    console.log(`  ACTUAL-CTX   ${JSON.stringify(rec.actualCtx)}`);
  }
}

writeFileSync(path.join(OUT_DIR, "lane-v-census.json"), JSON.stringify(census, null, 1));
const fail = census.filter((c) => c.equal !== true);
console.log(
  `PROBE-V summary: ${census.length} targets, ${fail.length} not-equal; census in ${path.join(OUT_DIR, "lane-v-census.json")}`,
);
storage.close();
process.exit(0);
