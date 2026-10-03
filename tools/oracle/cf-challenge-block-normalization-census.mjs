// Census for the Cloudflare challenge-block normalization (the 9f023ce
// discipline): two counts over the full corpus, no engine boot.
//
// 1. CARRIER CENSUS: every expected-v2 shard line (view + page lanes) is
//    scanned for the __CF$cv$params challenge block. Asserts the carrier
//    set is exactly the graded page-lane captures (no view-lane line may
//    carry the block), and prints per-shard counts.
// 2. PAIR-FLIP CENSUS: over a probe output dir (pairs written by
//    first-diff-named-entries-probe), recompute compareNormalized with and
//    without the CF mask and list every entry whose verdict flips. Asserts
//    flips go FAIL->PASS only (the mask is a pure both-sides deletion, so
//    the reverse direction is impossible by construction - asserted, not
//    assumed), and that every flipping pair actually contains the CF block
//    on the expected side.
//
// Usage:
//   node tools/oracle/cf-challenge-block-normalization-census.mjs \
//     [--pairs tmp/serializer-follow-live/probe-v4] [--census-out <file>]
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const { compareNormalized, normalizeCloudflareChallengeBlocks, normalizeForReplay } =
  await import(pathToFileURL(path.join(REPO, "src/testing/diff.ts")).href);

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const CARRIER_RX = /<script>(?:(?!<\/script>)[\s\S])*__CF\$cv\$params(?:(?!<\/script>)[\s\S])*<\/script>/;

// ---- 1. carrier census over ALL expected-v2 shard lines ----
const base = path.join(REPO, "tmp/raw-ground-truth/expected-v2");
const carriers = { view: 0, page: 0 };
let viewLines = 0, pageLines = 0;
const carrierNames = [];
for (const lane of ["view-lane", "page-lane"]) {
  const dir = path.join(base, lane);
  for (const shard of readdirSync(dir)) {
    const lines = readFileSync(path.join(dir, shard), "utf8")
      .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
    for (const line of lines) {
      const blobs =
        lane === "view-lane"
          ? Object.values(line.views ?? {})
          : [line.page_html];
      if (lane === "view-lane") viewLines += 1; else pageLines += 1;
      let hit = false;
      for (const b of blobs) {
        if (typeof b === "string" && CARRIER_RX.test(b)) hit = true;
      }
      if (hit) {
        carriers[lane === "view-lane" ? "view" : "page"] += 1;
        carrierNames.push(`${lane}:${line.name}`);
      }
    }
  }
}
console.log(`carrier census: view-lane lines=${viewLines} carriers=${carriers.view}; page-lane lines=${pageLines} carriers=${carriers.page}`);
if (carriers.view !== 0) {
  console.error(`CENSUS FAIL: ${carriers.view} view-lane lines carry the CF block`);
  process.exit(1);
}

// ---- 2. pair-flip census over a probe dir ----
const pairsDir = argValue("--pairs", "");
if (pairsDir !== "") {
  const flips = [];
  let unchangedFail = 0, unchangedPass = 0;
  for (const f of readdirSync(pairsDir).filter((f) => f.startsWith("expected--"))) {
    const expected = readFileSync(path.join(pairsDir, f), "utf8");
    const actual = readFileSync(path.join(pairsDir, f.replace("expected--", "actual--")), "utf8");
    const before = compareNormalized(expected, actual).equal;
    const after = compareNormalized(
      normalizeCloudflareChallengeBlocks(expected),
      normalizeCloudflareChallengeBlocks(actual),
    ).equal;
    if (before === after) {
      before ? unchangedPass++ : unchangedFail++;
      continue;
    }
    if (before === false && after === true) {
      if (!CARRIER_RX.test(expected)) {
        console.error(`CENSUS FAIL: ${f} flipped FAIL->PASS without carrying the CF block`);
        process.exit(1);
      }
      flips.push(f);
    } else {
      console.error(`CENSUS FAIL: ${f} flipped PASS->FAIL (impossible for a pure both-sides deletion)`);
      process.exit(1);
    }
  }
  console.log(`pair-flip census (${pairsDir}): flips=${flips.length} unchangedFail=${unchangedFail} unchangedPass=${unchangedPass}`);
  for (const f of flips) console.log(`  FLIP FAIL->PASS: ${f}`);
}

const out = argValue("--census-out", "");
if (out !== "") {
  const dir = path.dirname(out);
  mkdirSync(dir, { recursive: true });
  writeFileSync(out, JSON.stringify({ carriers, carrierNames, generatedAt: new Date().toISOString() }, null, 2));
  console.log(`census written: ${out}`);
}
