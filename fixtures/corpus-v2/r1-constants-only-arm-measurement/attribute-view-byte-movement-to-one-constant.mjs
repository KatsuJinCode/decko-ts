// attribute-view-byte-movement-to-one-constant.mjs -- R1 step 3 follow-up.
//
// The three-arm measurement shows 28 of 78 view-lane entries changing their
// NORMALIZED bytes under the constants-only arm while ZERO verdicts move.
// Those 28 entries carry none of the arm's markers in their expected bytes
// (no css revision, no SRI, no recaptcha key, no footer version, no rootUrl
// line), so none of the five head/body constants is visibly responsible.
//
// This probe isolates WHICH FIELD does it: one boot, each target rendered
// under the unset config, then under each constant ALONE, then under the full
// preset. The field whose alone-arm reproduces the preset's bytes is the
// carrier. It is the field that matters most for the ruling, because
// `defaultHtmlViewNest` ("content") is in the RULING's arm list but NOT in
// the MANDATE's five-constant list — and it is the only one of the six that
// can change a VIEW lane's nest resolution rather than a head constant.
//
// Movement is on normalizeForReplay(actual) — the same bytes
// compareNormalized (src/testing/diff.ts:280-286) compares.
//
// Usage: node tmp/r1-constants/attribute-view-byte-movement-to-one-constant.mjs

import { register } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, "..", "..");
const TOOLS_ORACLE = path.join(REPO, "tools", "oracle");
register(
  pathToFileURL(path.join(TOOLS_ORACLE, "typescript-source-loader.mjs")).href,
  pathToFileURL(TOOLS_ORACLE + path.sep).href,
);

const DEPLOYMENT_CLOUD_ASSET_HOST =
  "https://source-deck-production-storage.r1.cdn.objectstore.example";

const seeding = await import(pathToFileURL(path.join(REPO, "tests", "card", "render", "raw-corpus-seeding.js")).href);
const { createRawStructureSeededStorage, RAW_CORPUS_DB } = seeding;
const Database = (await import("better-sqlite3")).default;
const { compareNormalized, normalizeForReplay } = await import(
  pathToFileURL(path.join(REPO, "src", "testing", "diff.ts")).href
);
const { setDeploymentCloudAssetHost } = await import(
  pathToFileURL(path.join(REPO, "src", "card", "render", "views.ts")).href
);
const { setDeploymentFollowLiveConfig, LIVE_DEPLOYMENT_CONSTANTS } = await import(
  pathToFileURL(path.join(REPO, "src", "card", "render", "deployment-follow-live-config.ts")).href
);
setDeploymentCloudAssetHost(DEPLOYMENT_CLOUD_ASSET_HOST);

// Each arm = the preset with exactly ONE field.
const FIELDS = Object.keys(LIVE_DEPLOYMENT_CONSTANTS);
const ARMS = [
  { label: "UNSET", config: undefined },
  ...FIELDS.map((f) => ({ label: `ONLY:${f}`, config: { [f]: LIVE_DEPLOYMENT_CONSTANTS[f] } })),
  { label: "PRESET(all)", config: { ...LIVE_DEPLOYMENT_CONSTANTS } },
];

// A moved entry, an unmoved head-bearing entry, and a frozen-form PASS entry.
const TARGETS = [
  { shard: "recapture-raw-shard-000025.jsonl", name: "children", view: "open" },
  { shard: "recapture-raw-shard-000016.jsonl", name: "Guns", view: "open" },
  { shard: "recapture-raw-shard-000003.jsonl", name: "*all plus", view: "open" },
];

const cache = new Map();
function shardLines(shard) {
  if (!cache.has(shard))
    cache.set(
      shard,
      readFileSync(path.join(REPO, "tmp", "raw-ground-truth", "expected-v2", "view-lane", shard), "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l)),
    );
  return cache.get(shard);
}

const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = idLister.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
idLister.close();
console.log(`ISOLATE boot: targets=${TARGETS.length} arms=${ARMS.length}`);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
console.log(`ISOLATE boot done: ids=${everyLiveId.length}`);

const normSha = (s) => createHash("sha256").update(normalizeForReplay(s), "utf8").digest("hex").slice(0, 16);
const out = [];
for (const t of TARGETS) {
  const line = shardLines(t.shard).find((l) => l.name === t.name);
  if (line === undefined || !(t.view in (line.views ?? {}))) {
    console.log(`SKIP ${t.name}:${t.view} (not in shard)`);
    continue;
  }
  const expected = line.views[t.view];
  const row = { tag: `${t.name}:${t.view}`, arms: {} };
  for (const arm of ARMS) {
    setDeploymentFollowLiveConfig(arm.config);
    let actual;
    try {
      actual = await storage.engine.render(t.name, t.view);
    } catch (error) {
      row.arms[arm.label] = { verdict: "RAISE", error: String(error?.message ?? error) };
      continue;
    }
    const diff = compareNormalized(expected, actual);
    row.arms[arm.label] = {
      verdict: diff.equal ? "PASS" : "FAIL",
      delta: diff.actualBytes - diff.expectedBytes,
      normSha: normSha(actual),
    };
  }
  setDeploymentFollowLiveConfig(undefined);
  const base = row.arms.UNSET.normSha;
  const preset = row.arms["PRESET(all)"].normSha;
  const carriers = ARMS.filter(
    (a) => a.label.startsWith("ONLY:") && row.arms[a.label].normSha === preset && base !== preset,
  ).map((a) => a.label);
  const movers = ARMS.filter((a) => a.label.startsWith("ONLY:") && row.arms[a.label].normSha !== base).map(
    (a) => a.label,
  );
  row.baseSha = base;
  row.presetSha = preset;
  row.presetDiffersFromUnset = base !== preset;
  row.armsThatMoveBytesAlone = movers;
  row.armsThatReproducePreset = carriers;
  out.push(row);

  console.log("");
  console.log(`== ${row.tag}  presetDiffersFromUnset=${row.presetDiffersFromUnset}`);
  for (const a of ARMS) {
    const r = row.arms[a.label];
    const moved = r.normSha !== base ? "  MOVED" : "       ";
    console.log(`   ${a.label.padEnd(34)} ${String(r.verdict).padEnd(5)} delta=${String(r.delta).padStart(7)} sha=${r.normSha}${moved}`);
  }
  console.log(`   carrier(s) reproducing the preset: ${carriers.length ? carriers.join(", ") : "(none)"}`);
}

setDeploymentFollowLiveConfig(undefined);
mkdirSync(path.join(HERE, "measure"), { recursive: true });
writeFileSync(path.join(HERE, "measure", "constant-isolation.json"), JSON.stringify(out, null, 2), "utf8");
console.log("");
console.log("report: tmp/r1-constants/measure/constant-isolation.json");
