// engcand-base-render-probe.mjs -- ENGCAND LANE
// Re-measures the 3 ENGINE-CANDIDATE surfaces at THIS lane's base (69648930,
// which is NOT a descendant of the defect20 base 5047c6a4 -- the two lanes
// diverged), then renders ALL 20 recap23 pages so the fix's blast radius is a
// byte comparison against this same run's before-bytes, not an assertion.
//
// Render contract copied from the defect20 lane's classify-20.mjs instrument
// (fixtures/corpus-v2/defect20-classification/instruments/): graded five-constant
// arm (era EXCLUDED), createRawStructureSeededStorage over the full live-id
// closure, renderPage(name), normalizeForReplay on both sides.
//
// USAGE: node --max-old-space-size=6144 tmp/lane-engcand/engcand-base-render-probe.mjs
// Writes:
//   tmp/lane-engcand/out/base/actual--<page>.html     engine bytes at base
//   tmp/lane-engcand/out/base/live--<page>.html       live oracle bytes (copy)
//   tmp/lane-engcand/out/base-divergence.json         per-page divergence summary

import { register } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
register(
  "./typescript-source-loader.mjs",
  pathToFileURL(path.join(HERE, "..", "..", "tools", "oracle") + path.sep).href,
);
const REPO = path.resolve(HERE, "..", "..");
const OUT = path.join(REPO, "tmp", "lane-engcand", "out", "base");
const LIVE_DIR = "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/recap23-live";
const TARGETS = new Set(["mod: account", "mod: bootstrap", "Pointer"]);

const { setDeploymentCloudAssetHost } = await import(
  pathToFileURL(path.join(REPO, "src", "card", "render", "views.ts")).href
);
const { setDeploymentFollowLiveConfig } = await import(
  pathToFileURL(path.join(REPO, "src", "card", "render", "deployment-follow-live-config.ts")).href
);
setDeploymentCloudAssetHost(
  "https://production-storage.r1.cdn.objectstore.example",
);

const GRADED_ARM_FIVE_CONSTANTS = {
  scriptIntegrityBySrc: {
    "https://code.jquery.com/jquery-3.5.1.min.js":
      "sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0=",
    "https://cdnjs.cloudflare.com/ajax/libs/jquery-ujs/1.2.3/rails.min.js":
      "sha512-yDJWVxuRSkQa1u9/Zif6Gh93Gk0Urboz98JLEPcERMQ+pTHz/c27d0Xz08G+lgutFyKklB9UILtnhG6bth6B4A==",
    "https://cdnjs.cloudflare.com/ajax/libs/ace/1.18.0/ace.min.js":
      "sha512-xcE2qpHHeRGdUixQ0W0CRrb5RcfFLPol+7Kbix/fxXMnB+Dg4ECW3pldd3gY3bOOqcKQ3wv4IHJKUbSlgn83Qw==",
    "https://cdnjs.cloudflare.com/ajax/libs/select2/4.0.6-rc.1/js/select2.full.min.js":
      "sha512-Y4+u+T/6DpDb2AkTrxs3eJiN9o/u+l8pLNt0lSRKnJe2wIDVCwd7N8afy+70Pmr5FtmoX5IXmwK6H7Jlb8Nx8A==",
  },
  mainStylesheetRevisionDigits: "1790384218",
  footerDeckoVersion: "0.19.1",
  recaptchaSiteKey: "6LSYNTHETICLIVEKEY00000000000000000000AA",
  deckoRootUrl: "https://culturesmith.com/",
};

const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(REPO, "tests", "card", "render", "raw-corpus-seeding.ts")).href
);
const { normalizeForReplay } = await import(
  pathToFileURL(path.join(REPO, "src", "testing", "diff.ts")).href
);

const remainder = JSON.parse(
  readFileSync(path.join(HERE, "remainder-20.json"), "utf8"),
);
const captureLog = readFileSync(path.join(LIVE_DIR, "capture-log.jsonl"), "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l));
const livePath = new Map();
for (const l of captureLog) livePath.set(l.name, path.join(LIVE_DIR, l.storedAs));
for (const t of remainder) {
  if (!existsSync(livePath.get(t.name))) {
    console.error(`PROBE-ERROR: no live body for ${t.name}`);
    process.exit(2);
  }
}

function divergenceRegions(expected, actual, RESYNC = 40) {
  const e = expected;
  const a = actual;
  const regions = [];
  let i = 0;
  let j = 0;
  while (i < e.length || j < a.length) {
    while (i < e.length && j < a.length && e[i] === a[j]) { i += 1; j += 1; }
    if (i >= e.length && j >= a.length) break;
    let k = -1;
    const limit = Math.min(e.length - i, a.length - j) - RESYNC;
    for (let t = 1; t <= limit; t += 1) {
      let ok = true;
      for (let m = 0; m < RESYNC; m += 1) {
        if (e[i + t + m] !== a[j + t + m]) { ok = false; break; }
      }
      if (ok) { k = t; break; }
    }
    if (k === -1) {
      regions.push({ expectedStart: i, actualStart: j, expectedLen: e.length - i, actualLen: a.length - j, resynced: false });
      break;
    }
    regions.push({ expectedStart: i, actualStart: j, expectedLen: k, actualLen: k, resynced: true });
    i += k; j += k;
  }
  return regions;
}
function cardIdsIn(s) {
  const out = [];
  const re = /data-card-id='(\d+)'/g;
  let m;
  while ((m = re.exec(s)) !== null) { if (!out.includes(m[1])) out.push(m[1]); }
  return out;
}
function cardNamesIn(s) {
  const out = [];
  const re = /data-card-name="([^"]*)"/g;
  let m;
  while ((m = re.exec(s)) !== null) { if (!out.includes(m[1])) out.push(m[1]); }
  return out;
}

const everyLiveId = new (await import("better-sqlite3")).default(RAW_CORPUS_DB, { readonly: true })
  .prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);

console.log(`PROBE boot: corpus=${RAW_CORPUS_DB} targets=${remainder.length}`);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
console.log(`PROBE boot done: ids=${everyLiveId.length}`);

mkdirSync(OUT, { recursive: true });
setDeploymentFollowLiveConfig(GRADED_ARM_FIVE_CONSTANTS);

const report = [];
for (const t of remainder) {
  const live = readFileSync(livePath.get(t.name), "utf8");
  const safe = `${t.name}`.replace(/[^\w.-]+/g, "_").slice(0, 100);
  let actual;
  try {
    actual = await storage.engine.renderPage(t.name);
  } catch (error) {
    report.push({ name: t.name, verdict: "RAISE", error: String(error?.message ?? error) });
    continue;
  }
  writeFileSync(path.join(OUT, `actual--${safe}.html`), actual, "utf8");
  copyFileSync(livePath.get(t.name), path.join(OUT, `live--${safe}.html`));

  const nL = normalizeForReplay(live);
  const nE = normalizeForReplay(actual);
  const equal = nL === nE;
  const row = { name: t.name, liveLen: nL.length, engineLen: nE.length, liveEqEngine: equal };
  if (!equal && TARGETS.has(t.name)) {
    const regions = divergenceRegions(nL, nE);
    row.regions = regions.map((r) => {
      const liveChunk = nL.slice(r.expectedStart, r.expectedStart + r.expectedLen);
      const engChunk = nE.slice(r.actualStart, r.actualStart + r.actualLen);
      const liveIds = cardIdsIn(liveChunk);
      const engIds = cardIdsIn(engChunk);
      const onlyLive = liveIds.filter((id) => !engIds.includes(id));
      const onlyEngine = engIds.filter((id) => !liveIds.includes(id));
      return {
        at: r.expectedStart,
        resynced: r.resynced,
        liveLen: r.expectedLen,
        engineLen: r.actualLen,
        onlyLive,
        onlyEngine,
        onlyLiveNames: cardNamesIn(liveChunk),
        onlyEngineNames: cardNamesIn(engChunk),
      };
    });
  }
  report.push(row);
}
writeFileSync(path.join(REPO, "tmp", "lane-engcand", "out", "base-divergence.json"), JSON.stringify(report, null, 1));
const nEq = report.filter((r) => r.liveEqEngine).length;
console.log(`PROBE done: ${nEq}/${report.length} pages live==engine at base`);
for (const r of report) {
  if (TARGETS.has(r.name)) {
    console.log(`TARGET ${r.name}: live=${r.liveLen} engine=${r.engineLen} regions=${(r.regions || []).length}`);
    for (const reg of r.regions || []) {
      console.log(`  region@${reg.at} resynced=${reg.resynced} liveLen=${reg.liveLen} engineLen=${reg.engineLen}`);
      console.log(`    onlyLive: ${JSON.stringify(reg.onlyLive)} names=${JSON.stringify(reg.onlyLiveNames)}`);
      console.log(`    onlyEngine: ${JSON.stringify(reg.onlyEngine)} names=${JSON.stringify(reg.onlyEngineNames)}`);
    }
  }
}
