// first-diff-named-entries-probe.mjs -- ONE boot, first-diff EVERY named
// residual block entry across many shards (lane mopup-longtail-bytes).
//
// WHAT THIS IS
//   tools/oracle/probe-view-lane-byte-divergence.mjs is the view-lane
//   instrument that already reports every divergence region, but it (a) boots
//   the STAGING seeding module (tmp/raw-ground-truth/scripts/...), which is
//   NOT the graded run's seeding module, and (b) takes one shard per boot.
//
//   (a) matters for byte-exactness. tools/oracle/dual-lane-direct-runner-core.ts:522
//   imports `tests/card/render/raw-corpus-seeding.js` -- the COMMITTED home --
//   and the comment above it (runner-core.ts:502-521) records that the staging
//   copy predates the FULL REFERENCE GRAPH PASS (3,184 card_references rows
//   staged where the committed home stages 556,526). So a probe booted on the
//   staging copy renders different bytes than the grade measured. This probe
//   uses the committed home, the same module the grade used.
//
//   (b) matters for throughput: the four residual blocks span 12 shards. One
//   boot, then every target. Booting per shard costs a full corpus seed+warm
//   per shard and was measured at minutes each.
//
//   WHAT IT PRINTS, PER TARGET
//   - the grade's own verdict fields (expectedBytes/actualBytes/delta/
//     firstDifference) so the probe's bytes can be checked against the
//     delta the grade recorded in residual-classes-29ef88f-w6.txt;
//   - EVERY divergence region (same RESYNC walk as the view-lane probe), with
//     its own delta, so the entry's total gap is accounted for;
//   - the expected/actual file pair, which tools/oracle/
//     report-divergence-regions-for-captured-render-pair.mjs then re-segments
//     offline with its common-suffix walk (a DIFFERENT walk, kept as the
//     cross-check).
//
// USAGE (from the worktree root)
//   node tools/oracle/first-diff-named-entries-probe.mjs \
//     --targets tmp/mopup-longtail-bytes/targets.txt \
//     [--out tmp/mopup-longtail-bytes/probe]
//
//   TARGET FILE FORMAT -- one target per line, `<lane>\t<shard>\t<name>\t<view>`
//   lane is `view` or `page`. Blank lines and `#` comments ignored.
//
//   Exit 0 always when the run could start (a measuring instrument, not a gate).

import { register } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// R2's copy of this probe lives beside its loader in tools/oracle/. This lane's
// copy lives in tmp/pageera/, so the loader is referenced at its committed
// home instead of relative to the instrument. Same file, same bytes.
const REPO_FOR_LOADER = path.resolve(HERE, "..", "..");
register(
  pathToFileURL(path.join(REPO_FOR_LOADER, "tools", "oracle", "typescript-source-loader.mjs")).href,
);

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const REPO = path.resolve(argValue("--repo", path.resolve(HERE, "..", "..")));
const TARGETS = argValue("--targets", "tmp/mopup-longtail-bytes/targets.txt");
const OUT_DIR = path.isAbsolute(argValue("--out", ""))
  ? argValue("--out")
  : path.join(REPO, argValue("--out", "tmp/mopup-longtail-bytes/probe"));
const MAX_REGIONS = Number(argValue("--max-regions", "60"));
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

// The graded run's seeding module: tools/oracle/dual-lane-direct-runner-core.ts:522.
const SEEDING_MODULE = path.join(REPO, "tests", "card", "render", "raw-corpus-seeding.js");
const seeding = await import(pathToFileURL(SEEDING_MODULE).href);
if (typeof seeding.createRawStructureSeededStorage !== "function") {
  console.error(`PROBE-ERROR: committed seeding lacks createRawStructureSeededStorage`);
  process.exit(2);
}
const { createRawStructureSeededStorage, RAW_CORPUS_DB } = seeding;
const Database = (await import("better-sqlite3")).default;
const { compareNormalized, normalizeSlotIds } = await import(
  pathToFileURL(path.join(REPO, "src", "testing", "diff.ts")).href
);
// The graded environment's cloud asset host: the live deployment serves
// carrierwave attachments from DigitalOcean Spaces FR1 (live-check-71:
// DO-host 34/34 pages, s3.amazonaws.com 0 occurrences), and the corpus
// expectations carry the same prefix (the close-71 transform moves engine
// config and expectations TOGETHER). Set BEFORE the first render, next to
// the corpus boot; the corpus grading path is a DEPLOYMENT of the engine,
// and this is its storage-config (fog asset_host) value. The engine default
// (fog s3 form) stays pinned for every suite that does not set it
// (tests/card/render/cloud-asset-host-deployment-config.test.ts).
const { setDeploymentCloudAssetHost } = await import(
  pathToFileURL(path.join(REPO, "src", "card", "render", "views.ts")).href
);
const DEPLOYMENT_CLOUD_ASSET_HOST =
  "https://production-storage.r1.cdn.objectstore.example";
setDeploymentCloudAssetHost(DEPLOYMENT_CLOUD_ASSET_HOST);

// The same deployment's serializer + head constants (serializer-follow-live
// lane): the live 0.19.1 serializer's conditional show-key + class-token
// order, the SRI integrity attrs, the compiled-CSS revision digits, the
// footer version and the recaptcha site key -- the byte-verbatim values the
// live pages carry (live-check-71; vm-staging-server.mjs derived constants).
// Set next to the host seam, BEFORE the corpus boot; unset = the frozen
// corpus forms (tests/card/render/serializer-follow-live-deployment-config.test.ts).
const { setDeploymentFollowLiveConfig, getDeploymentFollowLiveConfig } = await import(
  pathToFileURL(path.join(REPO, "src", "card", "render", "deployment-follow-live-config.ts")).href
);
// R2 era-normalization lane's instrument, plus ONE new era. `--era live` is
// byte-identical to R2's copy (the ARMED side); `--era frozen` leaves
// setDeploymentFollowLiveConfig UNSET, which is what `serializerFollowsLive()`
// reads (deployment-follow-live-config.ts:83-85, `config?.serializerEra ===
// "live"`). The cloud-asset-host seam above stays SET in every era: that is
// close-71's host axis, not the serializer era, and the corpus page-lane rows
// carry the DO host.
//
// `--era graded` is NEW in this lane and is the state the landed arm will
// actually run in: the five GRADED_ARM_DEPLOYMENT_CONSTANTS values SET, with
// `serializerEra` and `defaultHtmlViewNest` both ABSENT (the preset's type
// forbids reaching either). It exists because of a PAGE/view asymmetry:
// every graded PAGE carries the head, so a page entry's stored expectation
// holds the LIVE head constants by capture. Probing a page with `frozen`
// would measure the constants residual, not the era residual. R2's view lane
// had no head, so `frozen` was the correct probe there and `graded` is the
// correct probe here.
const ERA = argValue("--era", "graded");
if (ERA !== "live" && ERA !== "frozen" && ERA !== "graded") {
  console.error(`PROBE-ERROR: --era must be live|frozen|graded, got ${ERA}`);
  process.exit(2);
}
const FIVE_CONSTANTS = {
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
  mainStylesheetRevisionDigits: "8888888888",
  footerDeckoVersion: "0.19.1",
  recaptchaSiteKey: "6LSYNTHETICLIVEKEY00000000000000000000AA",
  deckoRootUrl: "https://culturesmith.com/",
};
if (ERA === "live") setDeploymentFollowLiveConfig({
  serializerEra: "live",
  defaultHtmlViewNest: "content",
  ...FIVE_CONSTANTS,
});
if (ERA === "graded") setDeploymentFollowLiveConfig({ ...FIVE_CONSTANTS });
if (ERA === "graded") {
  // The arm's own discriminating property, asserted at install: neither the era
  // nor the nest is reachable. A hand-built six-field object would pass the
  // type only after a cast; this check fails the run if one slips in.
  const installed = getDeploymentFollowLiveConfig();
  if (!installed || installed.serializerEra !== undefined || installed.defaultHtmlViewNest !== undefined) {
    console.error("PROBE-ERROR: graded era did not install as the five-constant, era-free arm");
    process.exit(2);
  }
}
console.log(
  `PROBE era=${ERA} (${
    ERA === "live"
      ? "ARMED: era + nest + five constants SET"
      : ERA === "graded"
        ? "GRADED: five constants SET, serializerEra and defaultHtmlViewNest UNSET"
        : "FROZEN: deployment-follow-live config UNSET"
  })`,
);

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

/** shard file -> parsed lines, read once. */
const shardCache = new Map();
// `--corpus` selects which expectation tree this probe reads. R2's copy hardcoded
// the lane's own staging copy; this lane has to probe a SCRATCH post-state
// before the canonical is touched, and the corpus db is identical in both
// trees, so the db path stays at the staging copy.
const CORPUS_ROOT = path.resolve(argValue("--corpus", path.join(REPO, "tmp", "raw-ground-truth")));
function shardLines(lane, shard) {
  const key = `${lane}/${shard}`;
  if (shardCache.has(key)) return shardCache.get(key);
  const p = path.join(
    CORPUS_ROOT,
    "expected-v2",
    lane === "view" ? "view-lane" : "page-lane",
    shard,
  );
  const lines = readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
  shardCache.set(key, lines);
  return lines;
}

const missing = [];
for (const t of targets) {
  const line = shardLines(t.lane, t.shard).find((l) => l.name === t.name);
  if (line === undefined) missing.push(`${t.lane} ${t.shard} ${t.name}`);
  else if (t.lane === "view" && !(t.view in (line.views ?? {})))
    missing.push(`${t.lane} ${t.shard} ${t.name}:${t.view} (view absent)`);
}
if (missing.length > 0) {
  console.error(`PROBE-ERROR: target(s) not in shard: ${missing.join(" | ")}`);
  process.exit(2);
}

const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = idLister.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
idLister.close();

console.log(
  `PROBE boot: corpus=${RAW_CORPUS_DB} seeding=tests/card/render/raw-corpus-seeding.js targets=${targets.length}`,
);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
console.log(`PROBE boot done: ids=${everyLiveId.length}`);

/**
 * Every non-overlapping divergence region over the SLOT-ID-NORMALIZED sides.
 * Same walk as probe-view-lane-byte-divergence.mjs:126-168 (RESYNC window).
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
      regions.push({
        expectedStart: ei,
        actualStart: aj,
        expectedLen: e.length - ei,
        actualLen: a.length - aj,
        resynced: false,
      });
      break;
    }
    regions.push({
      expectedStart: ei,
      actualStart: aj,
      expectedLen: k,
      actualLen: k,
      resynced: true,
    });
    i += k;
    j += k;
  }
  return regions.map((r) => ({
    ...r,
    expectedText: expected.slice(r.expectedStart, r.expectedStart + Math.max(r.expectedLen, 300)),
    actualText: actual.slice(r.actualStart, r.actualStart + Math.max(r.actualLen, 300)),
  }));
}

mkdirSync(OUT_DIR, { recursive: true });
const summary = [];
for (const t of targets) {
  const line = shardLines(t.lane, t.shard).find((l) => l.name === t.name);
  const expected = t.lane === "view" ? line.views[t.view] : line.page_html;
  const tag = `${t.name}:${t.view}`;
  let actual;
  try {
    actual =
      t.lane === "view"
        ? await storage.engine.render(t.name, t.view)
        : await storage.engine.renderPage(t.name);
  } catch (error) {
    console.log(`RAISE ${tag} ${error?.constructor?.name ?? "Error"}: ${error?.message ?? error}`);
    summary.push({ tag, verdict: "RAISE", lane: t.lane, shard: t.shard, name: t.name, view: t.view });
    continue;
  }
  const diff = compareNormalized(expected, actual);
  // R2 lane: --dump-all writes the expected/actual byte pair for EVERY target,
  // not just the FAILs. The era-normalization transform needs the engine's
  // frozen bytes for the entries that currently PASS armed, and the committed
  // probe only persists bytes when the two sides disagree.
  const safe = `${t.name}__${t.view}`.replace(/[^\w.-]+/g, "_").slice(0, 100);
  const DUMP_ALL = process.argv.includes("--dump-all");
  if (DUMP_ALL) {
    writeFileSync(path.join(OUT_DIR, `expected--${safe}.html`), expected, "utf8");
    writeFileSync(path.join(OUT_DIR, `actual--${safe}.html`), actual, "utf8");
  }
  if (diff.equal) {
    console.log(`PASS ${tag} (byte-identical after slot-id normalization)`);
    summary.push({
      tag, verdict: "PASS", delta: 0, safe,
      lane: t.lane, shard: t.shard, name: t.name, view: t.view,
      expectedSha256: sha256(expected), actualSha256: sha256(actual),
      expectedBytes: expected.length, actualBytes: actual.length,
    });
    continue;
  }
  if (!DUMP_ALL) {
    writeFileSync(path.join(OUT_DIR, `expected--${safe}.html`), expected, "utf8");
    writeFileSync(path.join(OUT_DIR, `actual--${safe}.html`), actual, "utf8");
  }
  const regions = divergenceRegions(expected, actual);
  const regionDeltaSum = regions.reduce((s, r) => s + (r.actualLen - r.expectedLen), 0);
  console.log(
    `FAIL ${tag} expectedBytes=${diff.expectedBytes} actualBytes=${diff.actualBytes} ` +
      `delta=${diff.actualBytes - diff.expectedBytes} firstDiffCodeUnitOffset=${diff.firstDifference.codeUnitOffset} ` +
      `regions=${regions.length} regionDeltaSum=${regionDeltaSum}`,
  );
  for (const [i, r] of regions.slice(0, MAX_REGIONS).entries()) {
    console.log(
      `  region ${i + 1}/${regions.length} expected[${r.expectedStart}..+${r.expectedLen}] ` +
        `actual[${r.actualStart}..+${r.actualLen}] delta=${r.actualLen - r.expectedLen} resynced=${r.resynced}`,
    );
    console.log(`    expected: ${JSON.stringify(r.expectedText).slice(0, 900)}`);
    console.log(`    actual:   ${JSON.stringify(r.actualText).slice(0, 900)}`);
  }
  summary.push({
    tag,
    verdict: "FAIL",
    delta: diff.actualBytes - diff.expectedBytes,
    firstDiff: diff.firstDifference.codeUnitOffset,
    regions: regions.length,
    regionDeltaSum,
    safe,
    lane: t.lane, shard: t.shard, name: t.name, view: t.view,
    expectedSha256: sha256(expected), actualSha256: sha256(actual),
    expectedBytes: expected.length, actualBytes: actual.length,
  });
}
console.log("PROBE summary:");
for (const s of summary) console.log(`  ${s.verdict} ${s.tag} ${s.delta ?? ""}`);
const SUMMARY_JSON = argValue("--summary-json", "");
if (SUMMARY_JSON) {
  writeFileSync(
    SUMMARY_JSON,
    JSON.stringify({ schema: "r2-era-probe-summary/1", era: ERA, repo: REPO, base: process.env.R2NORM_BASE ?? null, summary }, null, 2) + "\n",
  );
  console.log(`PROBE summary json -> ${SUMMARY_JSON}`);
}
console.log(`PROBE outputs in ${OUT_DIR}`);
storage.close();
process.exit(0);
