// measure-constants-only-arm.mjs -- R1 step 3, THE BLAST-RADIUS MEASUREMENT.
//
// WHAT THIS MEASURES
//   Whether the R1 arm (the live deployment CONSTANTS, serializer era
//   FROZEN) can be had without the serializer era's collateral damage, and
//   what that arm actually buys. Three config states, ONE boot, ONE seeded
//   storage, every target rendered in every state:
//
//     UNARMED       the graded runner's config (asset host only). The
//                   control: what the corpus passes today.
//     CONSTANTS     the R1 arm — LIVE_DEPLOYMENT_CONSTANTS, era NOT armed.
//     FULL          constants + serializerEra "live" — the stock probe
//                   config the head49 Probe B measured. The comparison arm:
//                   it shows what arming the era ON TOP of R1 would cost.
//
//   For each (target, state) it records the verdict, the byte delta, the
//   first-difference offset, and the SHA-256 of the RENDERED BYTES. The sha
//   is what makes "must NOT move" provable at the byte level rather than at
//   the verdict level: an entry that must not move has the same sha in
//   UNARMED and CONSTANTS.
//
//   Boot cost is the reason for one boot: the corpus seed+warm over 47,235
//   card ids is minutes. The follow-live config is process-wide state read
//   at RENDER time (every constant getter is called inside a render function
//   — page.ts:829/899, head-views.ts:213, views.ts:774/1498, render.ts:1884,
//   card-mod-script.ts:223), so flipping it between renders within one boot
//   is sound. This is asserted, not assumed: the engine's own view is read
//   back after each flip.
//
//   EXPECTATIONS (the numbers the R1 mandate predicts):
//     - the 49 page entries: ~26 of 49 flip FAIL->PASS under CONSTANTS
//       (head49 Probe B measured 26 under FULL; the point of this run is
//       whether the constants alone account for the 26).
//     - the 20 frozen-form view entries: MUST NOT MOVE. Same sha UNARMED vs
//       CONSTANTS. (These are the ~3,624 entries the serializer era would
//       crater.)
//     - the 78 view83 entries: the 47 that close under FULL are the
//       serializer-gated ones; they MUST NOT close under CONSTANTS, because
//       closing them is the era's job, not the constants'.
//
// USAGE
//   node tmp/r1-constants/measure-constants-only-arm.mjs \
//     --targets tmp/r1-constants/targets-page49.txt \
//     --label page49 --out tmp/r1-constants/measure
//
//   TARGET FILE: `<lane>\t<shard>\t<name>\t<view>`, lane `view`|`page`.

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

const argValue = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};
const TARGETS = argValue("--targets", "tmp/r1-constants/targets-page49.txt");
const LABEL = argValue("--label", "targets");
const OUT_DIR = path.join(REPO, "tmp", "r1-constants", "measure", LABEL);

const STATES = ["UNARMED", "CONSTANTS", "FULL"];

// The graded environment's cloud asset host — set next to the corpus boot in
// BOTH prior probes (first-diff-named-entries-probe.mjs:76-84) and the graded
// runner (dual-lane-direct-runner-core.ts). It is the control's config too:
// UNARMED means "constants not armed", NOT "no deployment config at all".
const DEPLOYMENT_CLOUD_ASSET_HOST =
  "https://source-deck-production-storage.r1.cdn.objectstore.example";

const SEEDING_MODULE = path.join(REPO, "tests", "card", "render", "raw-corpus-seeding.js");
const seeding = await import(pathToFileURL(SEEDING_MODULE).href);
if (typeof seeding.createRawStructureSeededStorage !== "function") {
  console.error("PROBE-ERROR: committed seeding lacks createRawStructureSeededStorage");
  process.exit(2);
}
const { createRawStructureSeededStorage, RAW_CORPUS_DB } = seeding;
const Database = (await import("better-sqlite3")).default;
const { compareNormalized, normalizeForReplay } = await import(
  pathToFileURL(path.join(REPO, "src", "testing", "diff.ts")).href
);
const { setDeploymentCloudAssetHost } = await import(
  pathToFileURL(path.join(REPO, "src", "card", "render", "views.ts")).href
);
const followLive = await import(
  pathToFileURL(path.join(REPO, "src", "card", "render", "deployment-follow-live-config.ts")).href
);
const { setDeploymentFollowLiveConfig, getDeploymentFollowLiveConfig, LIVE_DEPLOYMENT_CONSTANTS, serializerFollowsLive } =
  followLive;

setDeploymentCloudAssetHost(DEPLOYMENT_CLOUD_ASSET_HOST);

/** Install one config state. The serializerEra key is added ONLY in FULL. */
function armState(state) {
  if (state === "UNARMED") {
    setDeploymentFollowLiveConfig(undefined);
    return;
  }
  if (state === "CONSTANTS") {
    // The R1 arm: the preset spread into the config. No serializerEra key.
    setDeploymentFollowLiveConfig({ ...LIVE_DEPLOYMENT_CONSTANTS });
    return;
  }
  setDeploymentFollowLiveConfig({ ...LIVE_DEPLOYMENT_CONSTANTS, serializerEra: "live" });
}

const targets = readFileSync(path.isAbsolute(TARGETS) ? TARGETS : path.join(REPO, TARGETS), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l !== "" && !l.startsWith("#"))
  .map((l) => {
    const [lane, shard, name, view] = l.split("\t");
    return { lane, shard, name, view };
  });
if (targets.length === 0) {
  console.error("PROBE-ERROR: no targets");
  process.exit(2);
}

const shardCache = new Map();
function shardLines(lane, shard) {
  const key = `${lane}/${shard}`;
  if (shardCache.has(key)) return shardCache.get(key);
  const p = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2", lane === "view" ? "view-lane" : "page-lane", shard);
  const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
  shardCache.set(key, lines);
  return lines;
}

const missing = [];
for (const t of targets) {
  const line = shardLines(t.lane, t.shard).find((l) => l.name === t.name);
  if (line === undefined) missing.push(`${t.lane} ${t.shard} ${t.name}`);
  else if (t.lane === "view" && !(t.view in (line.views ?? {}))) missing.push(`${t.lane} ${t.shard} ${t.name}:${t.view} (view absent)`);
}
if (missing.length > 0) {
  console.error(`PROBE-ERROR: target(s) not in shard: ${missing.join(" | ")}`);
  process.exit(2);
}

const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = idLister.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
idLister.close();

console.log(`MEASURE boot: label=${LABEL} corpus=${RAW_CORPUS_DB} targets=${targets.length} states=${STATES.join(",")}`);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
console.log(`MEASURE boot done: ids=${everyLiveId.length}`);

const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
// MOVEMENT IS MEASURED ON THE NORMALIZED BYTES, not the raw ones.
// compareNormalized (src/testing/diff.ts:280-286) compares
// normalizeForReplay(expected) against normalizeForReplay(actual), and
// normalizeForReplay (diff.ts:188-193) rewrites volatile slot ids, accordion
// group ids and mod object addresses. Hashing the RAW actual would therefore
// report "moved" for a re-render that the corpus comparator calls identical —
// a measurement artifact, not arm-induced movement. Both the raw and the
// normalized sha are recorded: rawSha for forensics, normalizedSha for the
// movement verdict.
const normSha = (s) => sha(normalizeForReplay(s));
mkdirSync(OUT_DIR, { recursive: true });

const rows = [];
for (const t of targets) {
  const line = shardLines(t.lane, t.shard).find((l) => l.name === t.name);
  const expected = t.lane === "view" ? line.views[t.view] : line.page_html;
  const tag = `${t.name}:${t.view}`;
  const row = { lane: t.lane, shard: t.shard, tag, states: {} };
  for (const state of STATES) {
    armState(state);
    // Assert the arm actually took: the config the engine will read.
    const live = getDeploymentFollowLiveConfig();
    const assertEra = serializerFollowsLive();
    if (state === "UNARMED" && live !== undefined) throw new Error("UNARMED state left a config installed");
    if (state === "CONSTANTS" && (live === undefined || assertEra)) throw new Error("CONSTANTS state is not constants-only");
    if (state === "FULL" && !assertEra) throw new Error("FULL state did not arm the era");
    let actual;
    try {
      actual = t.lane === "view" ? await storage.engine.render(t.name, t.view) : await storage.engine.renderPage(t.name);
    } catch (error) {
      row.states[state] = { verdict: "RAISE", error: String(error?.message ?? error) };
      continue;
    }
    const diff = compareNormalized(expected, actual);
    row.states[state] = {
      verdict: diff.equal ? "PASS" : "FAIL",
      delta: diff.actualBytes - diff.expectedBytes,
      firstDiffOffset: diff.equal ? null : diff.firstDifference.codeUnitOffset,
      normalizedSha: normSha(actual),
      rawSha: sha(actual),
      actualBytes: actual.length,
    };
  }
  // MOVEMENT, the load-bearing column: did the R1 arm change the bytes the
  // corpus actually compares? On the NORMALIZED sha (see normSha above), not
  // the verdict — a verdict can hold while bytes move (a delta of +1 still
  // says FAIL), and that is exactly the "must NOT move" claim under test.
  // rawShaMoved is reported alongside so a normalization-only difference
  // (volatile slot ids re-rolled between renders) is visible rather than
  // silently counted as movement.
  const bytesDiffer = (a, b) => (a.normalizedSha ?? null) !== (b.normalizedSha ?? null);
  row.movedByConstantsArm = bytesDiffer(row.states.UNARMED, row.states.CONSTANTS);
  row.movedByEraArm = bytesDiffer(row.states.CONSTANTS, row.states.FULL);
  row.rawShaMovedByConstantsArm =
    (row.states.UNARMED.rawSha ?? null) !== (row.states.CONSTANTS.rawSha ?? null);
  rows.push(row);

  const u = row.states.UNARMED;
  const c = row.states.CONSTANTS;
  const f = row.states.FULL;
  console.log(
    `${row.movedByConstantsArm ? "MOVED " : "STILL "} ${tag}\n` +
      `    UNARMED  ${u.verdict}${u.delta !== undefined ? ` delta=${u.delta} firstDiff=${u.firstDiffOffset} sha=${u.normalizedSha}` : ""}\n` +
      `    CONSTANTS ${c.verdict}${c.delta !== undefined ? ` delta=${c.delta} firstDiff=${c.firstDiffOffset} sha=${c.normalizedSha}` : ""}\n` +
      `    FULL     ${f.verdict}${f.delta !== undefined ? ` delta=${f.delta} firstDiff=${f.firstDiffOffset} sha=${f.normalizedSha}` : ""}\n` +
      `    movedByConstantsArm=${row.movedByConstantsArm} movedByEraArm=${row.movedByEraArm}`,
  );
}

// Restored so a later reader of this process is never surprised.
armState("UNARMED");

const tally = {};
for (const state of STATES) {
  tally[state] = { PASS: 0, FAIL: 0, RAISE: 0 };
  for (const r of rows) tally[state][r.states[state].verdict] += 1;
}
const flipped = rows.filter((r) => r.movedByConstantsArm);
const eraOnly = rows.filter((r) => r.movedByEraArm);

const report = {
  label: LABEL,
  targets: targets.length,
  states: STATES,
  tally,
  movedByConstantsArm: flipped.length,
  movedByEraArm: eraOnly.length,
  flippedTags: flipped.map((r) => r.tag),
  eraOnlyTags: eraOnly.map((r) => r.tag),
  rows,
};
writeFileSync(path.join(OUT_DIR, "measurement.json"), JSON.stringify(report, null, 2), "utf8");

console.log("");
console.log(`TALLY ${JSON.stringify(tally)}`);
console.log(`movedByConstantsArm (UNARMED -> CONSTANTS changed the bytes): ${flipped.length}/${rows.length}`);
console.log(`movedByEraArm      (CONSTANTS -> FULL changed the bytes):     ${eraOnly.length}/${rows.length}`);
console.log(`report: tmp/r1-constants/measure/${LABEL}/measurement.json`);
