// apply-asset-host-follow-live-close-71.mjs -- a REVERSIBLE, MANIFEST-BOUND
// corpus expectation transform: every expectation line carrying the s3
// asset-host prefix form gets the DigitalOcean Spaces form, so the corpus
// moves TOGETHER with the engine config the graded environment sets
// (setDeploymentCloudAssetHost).
//
// THE MAPPING (derived from data, never guessed; exactly one prefix form
// exists on each side):
//   FROM (s3):      http://s3.amazonaws.com//files/
//   TO   (Spaces):  https://production-storage.r1.cdn.objectstore.example/files/
// Tails (<id>/<name>.<ext>) are carried through unchanged; the replacement
// is a pure byte-level prefix substitution (it cannot touch line endings,
// so CRLF-per-line discipline holds by construction).
//
// MODES
//   --validate-only  No writes. (a) 34/34: each gen-2 page expectation for
//                    the checked pages equals the saved page capture after
//                    removing ONLY the documented per-response noise
//                    (Cloudflare __CF$cv$params r/t tokens + decko
//                    data-slot-id hashes, both quote forms); (b) prefix
//                    census of the staging (s3-carrier lines /
//                    Spaces-carrier lines); (c) pre-state sha check against
//                    the gen-2 manifest input copy.
//   --apply          Validate the pre-state, apply the transform to every
//                    s3-carrier line in both lanes, write
//                    asset-host-transform-manifest.json (per-shard
//                    before/after shas, per-line record) + the inverse
//                    manifest. Refuses (exit 2) on any drift; re-running
//                    after a successful apply refuses on the pre-state hash
//                    check (one-direction overlay tool).
//   --inverse        Revert: validate every recorded after-sha, replace the
//                    Spaces prefix back to the s3 prefix on exactly the
//                    recorded lines, verify the result sha equals the
//                    recorded before-sha. REFUSES anything else.
//
// USAGE (from the worktree root)
//   node tools/oracle/apply-asset-host-follow-live-close-71.mjs \
//     --repo <worktree-root> --mode apply
//
// COMMITTED DELIVERABLES (the staging itself is gitignored): the manifests
// under fixtures/corpus-v2/asset-host-follow-live-close-71/.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// ---------- args ----------
const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}
const REPO = path.resolve(argValue("--repo") ?? process.cwd());
const MODE = argValue("--mode") ?? "validate-only";
if (!["validate-only", "apply", "inverse"].includes(MODE)) {
  console.error("REFUSAL: --mode must be validate-only | apply | inverse");
  process.exit(2);
}

const STAGING = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2");
const VIEW_DIR = path.join(STAGING, "view-lane");
const PAGE_DIR = path.join(STAGING, "page-lane");
const CAPTURES = argValue("--captures") ??
  "C:/localProjects/brandonDojoTech/tmp/wrong-goal-hunt/live-check-71-captures-2026-10-03";
const OUT_DIR = path.join(REPO, "fixtures", "corpus-v2", "asset-host-follow-live-close-71");
const FORWARD_MANIFEST = path.join(OUT_DIR, "asset-host-transform-manifest.json");
const INVERSE_MANIFEST = path.join(OUT_DIR, "asset-host-transform-inverse-manifest.json");
const GEN2_MANIFEST_COPY = path.join(OUT_DIR, "prestate-gen2-manifest-input-copy.json");
const SHARD_RE = /^recapture-raw-shard-\d{6}\.jsonl$/;

// ---------- the mapping (both directions, exact forms from the census) ----------
const S3_PREFIX = "http://s3.amazonaws.com//files/";
const DO_PREFIX =
  "https://production-storage.r1.cdn.objectstore.example/files/";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const fail = (msg) => {
  console.error("REFUSAL: " + msg);
  process.exit(2);
};
const must = (cond, msg) => {
  if (!cond) fail(msg);
};

for (const d of [STAGING, VIEW_DIR, PAGE_DIR]) {
  must(existsSync(d), `missing required path: ${d}`);
}
must(existsSync(GEN2_MANIFEST_COPY),
  `missing gen-2 prestate input copy: ${GEN2_MANIFEST_COPY} (commit it from the ` +
  `final-dataset branch's fixtures/corpus-v2/live-recapture-2026-10-02/final-dataset-2026-10-03/final-dataset-manifest.json)`);

// ---------- pre-state drift check (every shard, vs the gen-2 manifest) ----------
const gen2 = JSON.parse(readFileSync(GEN2_MANIFEST_COPY, "utf8"));
const gen2After = new Map();
for (const [lane, shards] of Object.entries(gen2.shardAfter ?? {})) {
  for (const [shard, meta] of Object.entries(shards)) {
    gen2After.set(`${lane}/${shard}`, meta.sha256 ?? meta);
  }
}
must(gen2After.size > 0, "gen-2 manifest copy carries no shardAfter map");

function shardPaths() {
  const out = [];
  for (const [lane, dir] of [["view-lane", VIEW_DIR], ["page-lane", PAGE_DIR]]) {
    for (const f of readdirSync(dir).sort()) {
      if (SHARD_RE.test(f)) out.push({ lane, dir, file: f, abs: path.join(dir, f) });
    }
  }
  return out;
}
const shards = shardPaths();
must(shards.length === 96, `expected 96 shards (48 view + 48 page), found ${shards.length}`);

const drift = [];
for (const s of shards) {
  const sha = sha256(readFileSync(s.abs));
  const expected = gen2After.get(`${s.lane}/${s.file}`);
  if (expected !== undefined && expected !== sha) {
    drift.push(`${s.lane}/${s.file}`);
  }
}
must(drift.length === 0, `pre-state drift vs the gen-2 manifest's shardAfter: ${drift.join(", ")}`);
console.log(`prestate OK: 96 shards sha-match the gen-2 manifest's shardAfter`);

// ---------- 34/34 validation: gen-2 expectation vs saved page capture ----------
// Noise normalizer: the two documented per-response regions ONLY:
// CF __CF$cv$params r/t tokens; decko data-slot-id hashes (both quote forms).
function normalizeNoise(s) {
  return s
    .replace(/__CF\$cv\$params=\{r:'[0-9a-f]+',t:'[A-Za-z0-9+/=]*'\}/g, "__CF$cv$params=NOISE")
    .replace(/data-slot-id=(['"])[0-9a-f]{20}\1/g, 'data-slot-id="RANDOMIZED"');
}

const captureLog = readFileSync(path.join(CAPTURES, "capture-log.jsonl"), "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l));
const pageCaptures = captureLog.filter((r) => r.kind === "page");
must(pageCaptures.length === 34, `expected 34 page captures, found ${pageCaptures.length}`);

function slugToShardKey(urlName) {
  // capture files: percent-encoded <url-name>.html; JSONL rows: card name.
  return decodeURIComponent(urlName.replace(/\.html$/, "")).replace(/_/g, " ");
}

let okPages = 0;
const pageFailures = [];
for (const cap of pageCaptures) {
  const liveBytes = readFileSync(path.join(CAPTURES, cap.storedAs), "utf8");
  const liveName = cap.name;
  // find the gen-2 page row
  let row = null;
  for (const s of shards) {
    if (s.lane !== "page-lane") continue;
    const text = readFileSync(s.abs, "utf8");
    for (const line of text.split("\n")) {
      if (!line) continue;
      if (!line.includes(JSON.stringify(liveName).slice(1, -1))) continue;
      const obj = JSON.parse(line);
      if (obj.name === liveName) {
        row = { obj, line };
        break;
      }
    }
    if (row) break;
  }
  if (row === null) {
    pageFailures.push(`${liveName}: no gen-2 page row`);
    continue;
  }
  const expectation = row.obj.page_html;
  if (normalizeNoise(expectation) === normalizeNoise(liveBytes)) {
    okPages++;
  } else {
    pageFailures.push(`${liveName}: normalized mismatch`);
  }
}
console.log(`34/34 validation: ${okPages}/34 gen-2 page expectations equal the saved live captures after noise removal`);
if (okPages !== 34) {
  for (const f of pageFailures) console.error("  MISMATCH: " + f);
  fail(`expected 34/34, got ${okPages}/34`);
}

// ---------- the transform census ----------
function census(from) {
  const rows = [];
  let totalLines = 0;
  let carrierLines = 0;
  let occurrences = 0;
  for (const s of shards) {
    const text = readFileSync(s.abs, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === "") continue;
      totalLines++;
      const n = line.split(from).length - 1;
      if (n > 0) {
        carrierLines++;
        occurrences += n;
        let name = null;
        try {
          name = JSON.parse(line).name ?? null;
        } catch {
          name = "<unparsable>";
        }
        rows.push({ lane: s.lane, shard: s.file, line: i, name, occurrences: n });
      }
    }
  }
  return { rows, totalLines, carrierLines, occurrences };
}

if (MODE === "validate-only") {
  const c = census(S3_PREFIX);
  const d = census(DO_PREFIX);
  console.log(
    `census: ${c.totalLines} lines; s3-carrier lines ${c.carrierLines} (${c.occurrences} occurrences); ` +
    `DO-carrier lines ${d.carrierLines} (${d.occurrences} occurrences)`,
  );
  console.log("validate-only: no writes made");
  process.exit(0);
}

if (MODE === "apply") {
  must(!existsSync(FORWARD_MANIFEST),
    `forward manifest already exists (${FORWARD_MANIFEST}) - the apply is one-directional; ` +
    `use --mode inverse to revert`);
  const c = census(S3_PREFIX);
  must(c.carrierLines > 0, "no s3-carrier lines found - nothing to transform");

  const perShard = new Map();
  for (const s of shards) {
    perShard.set(`${s.lane}/${s.file}`, {
      lane: s.lane,
      shard: s.file,
      shaBefore: sha256(readFileSync(s.abs)),
      changedLines: 0,
      occurrences: 0,
    });
  }
  const lineRecords = [];
  for (const s of shards) {
    const text = readFileSync(s.abs, "utf8");
    let mutated = false;
    const outLines = text.split("\n").map((line, i) => {
      if (line === "" || !line.includes(S3_PREFIX)) return line;
      const n = line.split(S3_PREFIX).length - 1;
      const before = sha256(line);
      const after = sha256(line.split(S3_PREFIX).join(DO_PREFIX));
      let name = null;
      try {
        name = JSON.parse(line).name ?? null;
      } catch {
        name = "<unparsable>";
      }
      lineRecords.push({
        lane: s.lane,
        shard: s.file,
        line: i,
        name,
        occurrences: n,
        lineShaBefore: before,
        lineShaAfter: after,
      });
      const k = `${s.lane}/${s.file}`;
      perShard.get(k).changedLines++;
      perShard.get(k).occurrences += n;
      mutated = true;
      return line.split(S3_PREFIX).join(DO_PREFIX);
    });
    if (mutated) writeFileSync(s.abs, outLines.join("\n"));
  }
  // post-state verification: no s3 prefix remains anywhere, all shas recorded
  const after = census(S3_PREFIX);
  must(after.carrierLines === 0, `post-apply census still finds ${after.carrierLines} s3-carrier lines`);
  for (const s of shards) {
    const k = `${s.lane}/${s.file}`;
    const meta = perShard.get(k);
    meta.shaAfter = sha256(readFileSync(s.abs));
    must(meta.shaAfter !== meta.shaBefore || meta.changedLines === 0,
      `shard ${k} changed without a sha change`);
  }

  const manifest = {
    schema: "asset-host-follow-live/transform/1",
    title: "close-71-with-live corpus asset-host transform (s3 -> DigitalOcean Spaces, engine config + corpus moved together)",
    appliedAt: new Date().toISOString(),
    mapping: { from: S3_PREFIX, to: DO_PREFIX, tails: "carried through unchanged (pure prefix substitution)" },
    groundTruth: {
      liveCheck: "brandonDojoTech/tmp/wrong-goal-hunt/live-check-71-captures-2026-10-03 (2026-10-03T19:43Z, 71 GETs, 71/71 LIVE-CONFIRMS-RECAPTURED)",
      validation: "34/34 gen-2 page expectations equal the saved live captures after removing ONLY CF __CF$cv$params tokens + data-slot-id hashes",
    },
    prestate: {
      binding: "every shard sha256 matched the gen-2 final-dataset manifest's shardAfter (prestate-gen2-manifest-input-copy.json, source: branch lane-final-dataset-2026-10-03 fixtures/corpus-v2/live-recapture-2026-10-02/final-dataset-2026-10-03/final-dataset-manifest.json)",
      gen2ManifestSha256: sha256(readFileSync(GEN2_MANIFEST_COPY)),
    },
    counts: {
      changedLines: lineRecords.length,
      totalOccurrences: lineRecords.reduce((a, r) => a + r.occurrences, 0),
      byLane: lineRecords.reduce((acc, r) => {
        acc[r.lane] = (acc[r.lane] ?? 0) + 1;
        return acc;
      }, {}),
    },
    shardBefore: Object.fromEntries([...perShard].map(([k, v]) => [k, { sha256: v.shaBefore, changedLines: v.changedLines }])),
    shardAfter: Object.fromEntries([...perShard].map(([k, v]) => [k, { sha256: v.shaAfter, changedLines: v.changedLines }])),
    lines: lineRecords,
    revert: `node tools/oracle/apply-asset-host-follow-live-close-71.mjs --repo <worktree-root> --mode inverse`,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(FORWARD_MANIFEST, JSON.stringify(manifest, null, 1));

  const inverse = {
    schema: "asset-host-follow-live/transform/1",
    title: "INVERSE of asset-host-transform-manifest.json - reverts the corpus to the gen-2 s3-carrier form",
    direction: { from: DO_PREFIX, to: S3_PREFIX },
    inverseOf: { path: path.relative(REPO, FORWARD_MANIFEST), sha256: sha256(readFileSync(FORWARD_MANIFEST)) },
    appliedAt: null,
    binding: "refuses unless every recorded line's current sha equals lineShaAfter; verifies every shard sha returns to shaBefore",
    shardAfter: manifest.shardAfter,
    shardBefore: manifest.shardBefore,
    lines: lineRecords,
  };
  writeFileSync(INVERSE_MANIFEST, JSON.stringify(inverse, null, 1));

  console.log(
    `APPLIED: ${lineRecords.length} lines transformed (${manifest.counts.totalOccurrences} occurrences); ` +
    `manifest: ${path.relative(REPO, FORWARD_MANIFEST)}`,
  );
  console.log(`revert: ${manifest.revert}`);
  process.exit(0);
}

// ---------- --inverse ----------
{
  must(existsSync(FORWARD_MANIFEST), `no forward manifest to invert: ${FORWARD_MANIFEST}`);
  const fwd = JSON.parse(readFileSync(FORWARD_MANIFEST, "utf8"));
  must(fwd.schema === "asset-host-follow-live/transform/1", "forward manifest schema mismatch");

  // current state must equal the forward manifest's shardAfter
  for (const [k, meta] of Object.entries(fwd.shardAfter)) {
    const [lane, shard] = [k.split("/")[0], k.split("/")[1]];
    const abs = path.join(lane === "view-lane" ? VIEW_DIR : PAGE_DIR, shard);
    must(existsSync(abs), `missing shard: ${abs}`);
    must(sha256(readFileSync(abs)) === meta.sha256,
      `shard ${k} does not match the forward manifest's after-state (the transform was already reverted, or moved)`);
  }
  // every recorded line must still carry its recorded after-sha
  const lineMap = new Map();
  for (const s of shards) {
    const text = readFileSync(s.abs, "utf8");
    lineMap.set(`${s.lane}/${s.file}`, text.split("\n").map((l) => sha256(l)));
  }
  for (const r of fwd.lines) {
    const cur = lineMap.get(`${r.lane}/${r.shard}`)?.[r.line];
    must(cur === r.lineShaAfter,
      `line ${r.lane}/${r.shard}:${r.line} (${r.name}) drifted from the forward manifest's after-sha`);
  }
  // apply the inverse: DO prefix -> s3 prefix, EXACTLY on the recorded lines
  const touchedShards = new Set(fwd.lines.map((r) => `${r.lane}/${r.shard}`));
  const byShard = new Map();
  for (const r of fwd.lines) {
    const k = `${r.lane}/${r.shard}`;
    (byShard.get(k) ?? byShard.set(k, []).get(k)).push(r.line);
  }
  for (const k of touchedShards) {
    const [lane, shard] = [k.split("/")[0], k.split("/")[1]];
    const abs = path.join(lane === "view-lane" ? VIEW_DIR : PAGE_DIR, shard);
    const lines = readFileSync(abs, "utf8").split("\n");
    for (const i of byShard.get(k)) {
      must(lines[i].includes(DO_PREFIX), `line ${k}:${i} no longer carries the DO prefix`);
      lines[i] = lines[i].split(DO_PREFIX).join(S3_PREFIX);
      must(sha256(lines[i]) === fwd.lines.find((r) => r.lane === lane && r.shard === shard && r.line === i).lineShaBefore,
        `line ${k}:${i} inverse result sha mismatch`);
    }
    writeFileSync(abs, lines.join("\n"));
  }
  // final verification: every shard sha returns to shaBefore; no DO prefix left on recorded lines
  for (const [k, meta] of Object.entries(fwd.shardBefore)) {
    const [lane, shard] = [k.split("/")[0], k.split("/")[1]];
    const abs = path.join(lane === "view-lane" ? VIEW_DIR : PAGE_DIR, shard);
    must(sha256(readFileSync(abs)) === meta.sha256, `shard ${k} did not return to its before-sha`);
  }
  const fwdInverse = JSON.parse(readFileSync(INVERSE_MANIFEST, "utf8"));
  fwdInverse.appliedAt = new Date().toISOString();
  writeFileSync(INVERSE_MANIFEST, JSON.stringify(fwdInverse, null, 1));
  console.log(`INVERSE APPLIED: ${fwd.lines.length} lines reverted across ${touchedShards.size} shards; every shard sha verified back to the gen-2 prestate`);
  process.exit(0);
}
