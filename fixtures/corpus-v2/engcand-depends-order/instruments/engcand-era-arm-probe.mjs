// engcand-era-arm-probe.mjs -- ENGCAND LANE
// Renders the six recap23 mod pages under the ERA-LIVE arm
// (serializerEra: "live" + the graded five constants -- the defect20
// instrument's attribution arm) and reports live==engine per page.
// The class-token ORDER family (the accordion class tokens) is era-scoped:
// pages whose ONLY remaining divergence is that family PASS here.
//
// USAGE: node --max-old-space-size=6144 tmp/lane-engcand/engcand-era-arm-probe.mjs

import { register } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
register(
  "./typescript-source-loader.mjs",
  pathToFileURL(path.join(HERE, "..", "..", "tools", "oracle") + path.sep).href,
);
const REPO = path.resolve(HERE, "..", "..");
const LIVE_DIR = "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/recap23-live";

const { setDeploymentCloudAssetHost } = await import(
  pathToFileURL(path.join(REPO, "src", "card", "render", "views.ts")).href
);
const { setDeploymentFollowLiveConfig } = await import(
  pathToFileURL(path.join(REPO, "src", "card", "render", "deployment-follow-live-config.ts")).href
);
setDeploymentCloudAssetHost(
  "https://culturesmith-production-storage.fra1.cdn.digitaloceanspaces.com",
);

const ERA_LIVE_CONFIG = {
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
  recaptchaSiteKey: "6LeRJb4UAAAAANqYxbHo_VwgJY9aWwieAp6493sW",
  deckoRootUrl: "https://culturesmith.com/",
  serializerEra: "live",
};

const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(REPO, "tests", "card", "render", "raw-corpus-seeding.ts")).href
);
const { normalizeForReplay } = await import(
  pathToFileURL(path.join(REPO, "src", "testing", "diff.ts")).href
);
const Database = (await import("better-sqlite3")).default;

const captureLog = readFileSync(path.join(LIVE_DIR, "capture-log.jsonl"), "utf8")
  .split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
const livePath = new Map();
for (const l of captureLog) livePath.set(l.name, path.join(LIVE_DIR, l.storedAs));

const PAGES = ["mod: account", "mod: bootstrap", "mod: core", "mod: email", "mod: list"];

const everyLiveId = new Database(RAW_CORPUS_DB, { readonly: true })
  .prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
setDeploymentFollowLiveConfig(ERA_LIVE_CONFIG);

for (const name of PAGES) {
  if (!existsSync(livePath.get(name))) { console.log(name + ": NO LIVE BYTES"); continue; }
  const live = readFileSync(livePath.get(name), "utf8");
  const engine = await storage.engine.renderPage(name);
  const nL = normalizeForReplay(live);
  const nE = normalizeForReplay(engine);
  console.log(`${name}: liveEqEngine(era-live)=${nL === nE} live=${nL.length} engine=${nE.length}`);
}
