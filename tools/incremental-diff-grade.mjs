// incremental-diff-grade.mjs -- delta grader against a recorded per-shard
// baseline; companion to tools/capture-and-grade.mjs.
//
// THE PROBLEM IT EXISTS FOR
//   A full grade (capture-and-grade.mjs -> dual-lane-verifier-fast.mjs ->
//   verify-dual-lane.test.ts) renders and compares ~10,274 view entries +
//   ~6,588 page entries across 24 phases and takes ~69-75 minutes (measured
//   on a full grade: 4146.9 s). The operator approval burden makes routine
//   full grades impractical, so merges go ungraded. This tool reuses cached
//   per-shard verdicts for shards whose inputs did not change, re-renders only
//   the rest, diffs the fail-set against the previously recorded fail-set, and
//   emits PASS/FAIL against the same floors vocabulary and exit codes as the
//   full grader.
//
// MECHANISM (why the delta is sound)
//   An entry's verdict is a pure function of exactly three inputs:
//     1. the shard bytes holding the expected side (the photograph),
//     2. the corpus the engine seeds from (tmp/raw-ground-truth/
//        bench-corpus-raw.sqlite3, raw-corpus-seeding.ts:39-44 RAW_CORPUS_DB),
//     3. the engine source tree the render runs against.
//   The baseline records sha256 bindings for all three (per-shard, per-file).
//   A delta run re-verifies every binding and re-renders only what moved.
//   Anything unprovable-unchanged is re-rendered ("when in doubt, include"):
//   an engine-source change re-renders ALL shards, because every render goes
//   through shared marks/nest/rule infrastructure and no sound file->entry
//   call-graph mapping exists in this repo. A view-name->module shortcut would
//   be unsound through nested content and is deliberately not attempted.
//
// REUSE CONTRACT (Bazel exact-reuse + TurboSnap global invalidation; adopted
//   by lane delta-hardening 2026-10-01 over the earlier shard-byte-only keying;
//   design source: the incremental-verification research receipt 2026-10-01)
//   Each shard's baseline record carries inputHash = sha256 over its INPUT
//   TUPLE: the shard's per-lane entry bytes (which literally carry the entry
//   list + their input content + the frozen-capture bytes), the source-tree
//   hash (engine version + dependency closure: src/** + tests/** + the grading
//   spec + package/lock + vitest/tsconfig), the engine-input corpus hash, and
//   the grading-spec path (verifier config). A shard is REUSED only when
//   (a) its recorded verdict is PASS in both lanes -- Bazel caches PASS results
//   only; a failure always re-renders (DoNotCache) -- and (b) its input tuple
//   hash is unchanged. Everything else re-renders. A record that predates
//   input hashing has no provable tuple and re-renders once (never reuse on an
//   unprovable record). Global invalidation is unchanged (TurboSnap's "full
//   rebuilds"): ANY source-tree byte change re-renders ALL shards, and corpus/
//   manifest drift is a provenance refusal (exit 4) before any plan exists.
//   Floors/heap/deadline are deliberately NOT in the tuple: they change
//   thresholds and execution, not any entry's verdict. Because whole-shard
//   bytes are in the tuple, a byte move IS an input move; finer-than-shard
//   selection is unlocked structurally (the same hash function can key
//   per-entry tuples) but is not exercised at entry granularity here.
//
// PROVENANCE (same gates as the full grader, plus one it lacks)
//   - the capture-manifest gate runs VERBATIM
//     (verifyManifestForGrading from ./capture-manifest-provenance.mjs):
//     no manifest, no grade; before != after, no grade; live
//     deck-recapture/corpus-v2.sqlite3 differing from the recorded hash, no
//     grade. Exit 4.
//   - PLUS the binding the full grader never records: the baseline pins
//     sha256(bench-corpus-raw.sqlite3) -- the file the verifying engine
//     ACTUALLY renders from (measured 2026-09-30 in pass19-int: the manifest
//     binds deck-recapture/corpus-v2.sqlite3 = 739c470e..., while the engine
//     seed reads bench-corpus-raw.sqlite3 = 6a44dfdc..., a different file).
//     Changed engine-input corpus = exit 4 refusal.
//
// BASELINE (what gets cached)
//   tmp/diff-grade-baselines/<corpusSha8>/<baselineId>/baseline.json,
//   schema "incremental-diff-grade-baseline/1": corpus + engine-corpus +
//   manifest hashes, git head, per-file source-tree hashes, floors, per-shard
//   {view,page} sha256s, per-shard lane aggregates, per-shard FAILING entry
//   ids + signatures, per-shard capture-error counts. The pass side is cached
//   per shard as counts + "every entry not in the recorded fail list passed";
//   per-entry verdicts beyond that are not recorded by the grading instrument
//   itself (the vitest spec prints only totals + failures), so this is the
//   finest sound granularity. tmp/ is untracked, like every other grade
//   artifact; --baseline-root preserves baselines outside the worktree
//   (mirrors capture-and-grade --photograph-root).
//
// HOW IT RENDERS
//   Through the SAME grading instrument the full grader uses:
//   verify-dual-lane.test.ts, one shard per child (DUAL_LANE_FILES=<shard>,
//   DUAL_LANE_REPORT_ONLY=1), default strictly sequential, because the spec's
//   per-entry aggregate output file is overwritten by every child (last
//   writer wins). After each child the aggregate is snapshotted into the
//   run's artifacts dir (snapshot identity = the shard name; each shard is
//   rendered by at most one child per run) and reduced to {ids, sigs, totals}
//   for the baseline (the merge step).
//
//   --runner direct (added 2026-10-01, directrun-integration-seams lane)
//   swaps WHICH child does that grading, not what it grades: the direct
//   grade runner (tools/oracle/dual-lane-direct-runner.mjs) takes the same
//   DUAL_LANE_FILES shard and the same DUAL_LANE_REPORT_ONLY=1, writes the
//   enumeration aggregate to the SAME path this tool already validates
//   (enumerationOutFile above) in the SAME shape -- viewLane.aggregate.files
//   / pageLane.aggregate.files are the fields the per-child validation
//   below reads, and the direct runner's aggregate carries them because it
//   is the instrument's aggregate, not a re-derivation -- and exits with the
//   instrument's codes. The per-child validation, the mtime probe, the
//   one-retry-on-refused-aggregate rule, the deadline and its kill, and the
//   merge below are unchanged code in both modes: swapping the child is
//   only sound if the receipt the swap is judged by does not move, and this
//   is that receipt. Why the swap is worth making is the grade-hours
//   autopsy (a per-child test-framework boot, and one shard per child by
//   construction); the direct runner's aggregate is proven byte-identical
//   to the vitest instrument's by tools/oracle/dual-lane-direct-parity-
//   gate.mjs, which is what makes "the same receipt" a claim rather than a
//   hope.
//
//   BOUNDED CONCURRENCY (--concurrency N, default 1 = the soak-proven
//   sequential mode, unchanged): N>=2 runs up to N children through a worker
//   pool. The aggregate out-file is SHARED under concurrency (its path is
//   hardcoded in the real spec), so soundness rests on the per-child
//   validation, not on isolation: a snapshot is accepted only when the
//   aggregate names EXACTLY that child's shard in exactly the lanes that
//   exist AND the file mtime moved past this child's spawn; a racing
//   sibling's aggregate names a different shard, so a race surfaces as a
//   render FAILURE (refusal), never as a wrong verdict. Because two
//   similar-duration children CAN finish together, a concurrent child whose
//   aggregate was refused with a healthy exit re-renders ONCE (sound: inputs
//   unchanged; the pool is thinner by then); sequential mode never races and
//   stays strict. The snapshot bytes are read ONCE and validated and stored
//   from that single read (no validate-then-re-read window). On a deadline
//   breach the tool kills the breaching child's tree AND every other
//   in-flight child (recorded PIDs, all its own children) before exiting 2.
//
// MODES
//   (default)      delta grade vs the newest (or --baseline) baseline.
//   --baseline     build the FIRST baseline: render every shard, record the
//                  cache. ~70-100 min (48 sequential children) -- this is the
//                  one operator-approved full-canvas event; every later delta
//                  is minutes. There is no way to synthesize a baseline from
//                  existing grade artifacts: no real grade records per-entry
//                  fails (verified: pass-19 stdout has zero FAIL dual-lane
//                  lines; the enumeration aggregate is last-phase-wins).
//   --dry-run      print the plan (source-tree status, changed files by name,
//                  which shards would render, per-shard entry counts) WITHOUT
//                  rendering. Runs the same provenance gates, so a corpus swap
//                  is caught before any grading minute is spent.
//
// EXIT CODES (mirror capture-and-grade.mjs): 0 pass (floors met), 1 fail
//   (floors missed / child failure / usage), 2 stalled (child breached its
//   deadline; own child tree killed by recorded PID), 4 provenance refusal.
//   (The full grader's 3 = staging-gate failure has no analogue here: this
//   tool never touches staging.)
//
// PLATFORM: win32 only -- the child kill uses taskkill and the full grader
// this tool accompanies is win32-only (capture-and-grade.mjs PLATFORM header).
// Non-win32 hosts get a loud PLATFORM-OPS error, never a silent no-op.
//
// USAGE
//   First approved run (builds the baseline; full canvas):
//     node tools/incremental-diff-grade.mjs --repo <repo> --baseline --run-id baseline-1
//   Routine delta check after a merge (minutes):
//     node tools/incremental-diff-grade.mjs --repo <repo>
//   Plan only, no rendering:
//     node tools/incremental-diff-grade.mjs --repo <repo> --dry-run
//   Targeted re-render of specific shards (only when the source tree is
//   unchanged -- see --force-shards refusal rule below):
//     node tools/incremental-diff-grade.mjs --repo <repo> --force-shards recapture-raw-shard-000007.jsonl
//
// OPTIONS
//   --repo <dir>        the checkout whose expected-v2 tree + engine are graded.
//   --baseline          build a fresh baseline (render ALL shards; ignores any
//                       prior baseline as cache, still refuses on provenance).
//   --baseline <path>   (with --dry-run or default mode) explicit baseline file
//                       instead of the LATEST pointer.
//   --baseline-root <dir>  where baselines live (default
//                       <repo>/tmp/diff-grade-baselines).
//   --run-id <id>       artifacts/baseline generation key (default diff-<ts>).
//   --floors a=N,b=M    lane pass-count floors + captureErrors max; same
//                       parsing as the full grader. Defaults to the recorded
//                       baseline floors (the ratchet: the grade this baseline
//                       came from), else view=8030,page=2069,captureErrors=3.
//   --shards a,b        restrict the delta to these shard names. Refused when
//                       the source tree changed: rendering a subset would
//                       store verdicts from two different engines in one
//                       baseline (silent poison). All-shards restriction is
//                       allowed.
//   --force-shards a,b  ADD these shards to the re-render set even when their
//                       inputs hash-verify unchanged (suspected flake).
//                       Refused when the source tree changed (same poison
//                       rule), unless the forced set covers every shard.
//   --deadline-min <f>  per-child hard deadline in minutes (default 20, the
//                       verifier-fast default). Breach kills the child tree by
//                       recorded PID and exits 2.
//   --heap-mb <n>       per-child --max-old-space-size (default 1536, the
//                       verifier-fast per-child cap).
//   --concurrency <n>   render children in flight (default 1 = sequential,
//                       the soak-proven path). 2-3 is the evaluated range;
//                       the miniature proved identical verdicts vs
//                       sequential. See HOW IT RENDERS for the shared
//                       out-file guard.
//   --spec <relpath>    verify spec relative to --repo (default
//                       tmp/raw-ground-truth/scripts/verify-dual-lane.test.ts).
//   --runner <name>     which child grades a shard: "vitest" (default, the
//                       verify spec under its test framework) or "direct" (the
//                       direct grade runner,
//                       tools/oracle/dual-lane-direct-runner.mjs -- same shard,
//                       same env, same aggregate path, same exit codes, no
//                       test-framework boot per child). A non-default --spec is
//                       refused under --runner direct, because the direct
//                       child does not execute a spec and ignoring the flag
//                       would be a silent no-op.
//   --baseline-root --run-id --quiet   as named.
//   --dry-run           plan only; never spawns a render child.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  MANIFEST_FILENAME,
  sha256File,
  verifyManifestForGrading,
} from "./capture-manifest-provenance.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// ---------- constants (parity with the full grader + the verify spec) ----------

export const BASELINE_SCHEMA = "incremental-diff-grade-baseline/1";
// Version of the per-shard INPUT-TUPLE composition (the Bazel cache key).
// Bumping this string invalidates every recorded inputHash -> one all-shard
// re-render, never a false reuse.
export const SHARD_INPUT_SCHEMA = "incremental-diff-grade-shard-input/1";
export const SHARD_RE = /^recapture-raw-shard-\d{6}\.jsonl$/;
export const FULL_RUN_FLOORS = { view: 8030, page: 2069, captureErrors: 3 };
export const FLOOR_LANES = ["view", "page", "captureErrors"];
const LANES = ["view", "page"];

export const DEFAULT_SPEC = "tmp/raw-ground-truth/scripts/verify-dual-lane.test.ts";
export const DEFAULT_BASELINE_ROOT_SEGMENT = path.join("tmp", "diff-grade-baselines");

// Which child grades a shard (--runner). "vitest" is the historical path: an
// `npx vitest run <spec>` per shard. "direct" is the direct grade runner, a
// node process that transcribes the same protocol. The two are interchangeable
// here because the direct runner honours the same DUAL_LANE_FILES /
// DUAL_LANE_REPORT_ONLY env, writes the same enumeration aggregate to the
// same path in the same shape, and exits with the same codes -- and because
// everything that reads that aggregate (the per-child validation, the mtime
// probe, the merge) is shared code below.
export const RUNNER_VITEST = "vitest";
export const RUNNER_DIRECT = "direct";
// The direct grade runner, and the two files it needs beside it. Checked
// before any shard renders, so a missing runner fails the run in its
// pre-flight rather than 48 times in the render loop.
export const DIRECT_RUNNER_REL = "tools/oracle/dual-lane-direct-runner.mjs";
export const DIRECT_RUNNER_DEPS_REL = [
  "tools/oracle/dual-lane-direct-runner-core.ts",
  "tools/oracle/typescript-source-loader.mjs",
];

// The engine-input corpus (the file the verify spec's seeded storage reads):
// NOT the file the capture manifest binds. Both are bound; see header.
export const engineCorpusPath = (repo) =>
  path.join(repo, "tmp", "raw-ground-truth", "bench-corpus-raw.sqlite3");
export const manifestGateCorpusPath = (repo) =>
  path.join(repo, "tmp", "raw-ground-truth", "deck-recapture", "corpus-v2.sqlite3");
export const expectedV2Dir = (repo) =>
  path.join(repo, "tmp", "raw-ground-truth", "expected-v2");
export const laneDir = (repo, lane) =>
  path.join(expectedV2Dir(repo), `${lane}-lane`);
export const manifestPath = (repo) =>
  path.join(expectedV2Dir(repo), MANIFEST_FILENAME);
export const enumerationOutFile = (repo) =>
  path.join(repo, "tmp", "raw-ground-truth", "enumeration", "dual-lane-verification-aggregate.json");

function fail(msg) {
  console.error(`incremental-diff-grade: ${msg}`);
  process.exit(1);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// ---------- source-tree identity ----------

// Every file whose bytes can change an entry's verdict: the engine (src/**),
// the ENGINE-COMPOSING helpers the grading instrument imports from tests/**
// (the verify spec's seeding import composes FetchEngine / RenderEngine /
// ModLoader from tests/card/render/render-test-storage.ts -- a tests-only
// merge would otherwise re-render NOTHING while changing what renders, the
// exact two-engine poison this hash exists to prevent), the grading
// instrument itself and its two seeding imports, and the JS/TS build surface
// (deps, transpile config) the child runs under. Hashing both trees costs
// well under a second and is deliberately broader than a hand-picked import
// list -- "when in doubt, include".
const RENDER_SOURCE_TREES = ["src", "tests"];
const SOURCE_SEAM_FILES = [
  DEFAULT_SPEC,
  "tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts",
  "tmp/raw-ground-truth/scripts/oracle-deck-inflection-config.ts",
  "package.json",
  "package-lock.json",
  "vitest.config.ts",
  "tsconfig.json",
];

export function inventorySourceFiles(repo) {
  const files = [];
  for (const segment of RENDER_SOURCE_TREES) {
    const root = path.join(repo, segment);
    if (existsSync(root)) {
      const walk = (dir) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else files.push(p);
        }
      };
      walk(root);
    }
  }
  for (const rel of SOURCE_SEAM_FILES) {
    const p = path.join(repo, rel);
    if (existsSync(p)) files.push(p);
  }
  return files.sort();
}

/** {hash, files: {relPath: sha256}} over the working tree bytes (what vitest
 *  actually executes -- not git objects). */
export function hashSourceTree(repo) {
  const files = {};
  const hash = createHash("sha256");
  for (const abs of inventorySourceFiles(repo)) {
    const rel = path.relative(repo, abs).split(path.sep).join("/");
    const sha = sha256File(abs);
    files[rel] = sha;
    hash.update(`${rel}:${sha}\n`);
  }
  return { hash: hash.digest("hex"), files };
}

function changedSourceFiles(baselineFiles, nowFiles) {
  const changed = [];
  const removed = [];
  for (const [rel, sha] of Object.entries(nowFiles)) {
    if (baselineFiles[rel] === undefined) changed.push(`${rel} (new)`);
    else if (baselineFiles[rel] !== sha) changed.push(rel);
  }
  for (const rel of Object.keys(baselineFiles)) {
    if (nowFiles[rel] === undefined) removed.push(rel);
  }
  return { changed, removed };
}

// ---------- shard discovery + entry counting (mirrors verify-dual-lane.test.ts) ----------

export function discoverShards(repo) {
  const names = new Set();
  for (const lane of LANES) {
    const dir = laneDir(repo, lane);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (SHARD_RE.test(f)) names.add(f);
  }
  return [...names].sort();
}

/** Per-lane shard facts, counted by the SAME rules the verify spec applies
 *  when it flattens a shard into replay entries (verify-dual-lane.test.ts
 *  loadLane + the view/page flattening loops):
 *  view lane: a whole-line error row (error set, no record, no views) is a
 *  capture-error line and yields NO entries; a record row yields 1 entry;
 *  every key of `views` yields 1 entry. page lane: an error row yields 1
 *  entry (graded as a valid expected outcome) and counts as a capture-error
 *  line; a row with page_html yields 1 entry; otherwise malformed.
 *  captureErrorLines uses the full grader's own definition: raw lines
 *  containing "CAPTURE_ERROR:" (capture-and-grade.mjs countCaptureErrors). */
export function measureShardFile(file, lane) {
  const facts = { present: existsSync(file), lines: 0, entries: 0, malformed: 0, captureErrorLines: 0 };
  if (!facts.present) return facts;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    facts.lines += 1;
    if (line.includes("CAPTURE_ERROR:")) facts.captureErrorLines += 1;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      facts.malformed += 1;
      continue;
    }
    if (lane === "view") {
      if (obj.error !== undefined && obj.record === undefined && obj.views === undefined) continue;
      if (obj.record) facts.entries += 1;
      if (obj.views) facts.entries += Object.keys(obj.views).length;
    } else {
      if (obj.error !== undefined) {
        facts.entries += 1;
        continue;
      }
      if (typeof obj.page_html === "string") facts.entries += 1;
      else facts.malformed += 1;
    }
  }
  return facts;
}

export function measureShard(repo, name) {
  return {
    view: measureShardFile(path.join(laneDir(repo, "view"), name), "view"),
    page: measureShardFile(path.join(laneDir(repo, "page"), name), "page"),
  };
}

function shardBytesHashes(repo, name) {
  const out = { viewSha: null, pageSha: null };
  for (const lane of LANES) {
    const f = path.join(laneDir(repo, lane), name);
    if (existsSync(f)) out[`${lane}Sha`] = sha256File(f);
  }
  return out;
}

// ---------- the Bazel input tuple (what a shard's verdict depends on) ----------

/** sha256 over the shard's INPUT TUPLE: per-lane shard bytes (entry list +
 *  input content + frozen-capture bytes), the engine/dependency source-tree
 *  hash, the engine-input corpus hash, the grading-spec path (verifier
 *  config), and -- when the verdict was produced by the direct grade runner
 *  rather than by a spec -- the hash of the direct protocol's own source
 *  (protocolSha256). A shard's verdict is a pure function of exactly this
 *  tuple, so an unchanged tuple with a PASS record is exactly a Bazel
 *  `(cached)` hit. Floors/heap/deadline are excluded on purpose: they gate the
 *  RUN, not any entry's verdict.
 *
 *  WHY protocolSha256 IS CONDITIONAL (directrun-integration-seams lane):
 *  `specRelPath` names the instrument, and the source-tree hash covers the
 *  spec's bytes (DEFAULT_SPEC is in SOURCE_SEAM_FILES). Under --runner vitest
 *  that is the whole story. Under --runner direct the spec is NOT what graded
 *  -- tools/oracle/dual-lane-direct-runner-core.ts is, and the core is not in
 *  the source tree this tool hashes. Without this member a direct-mode edit to
 *  the core would leave every recorded inputHash unchanged and the next delta
 *  would reuse verdicts produced by the previous core: a false (cached) hit,
 *  which is the exact poison the tuple exists to prevent. Emitting the member
 *  ONLY when it is non-null keeps the vitest path's JSON -- and therefore its
 *  hash, and therefore every already-recorded baseline -- byte for byte what
 *  it was, and makes a direct-mode baseline structurally unreusable by a
 *  vitest run and vice versa. That is the correct Bazel reading: the cache key
 *  describes the action, and the two runners are different actions. */
export function shardInputHash({
  viewSha,
  pageSha,
  sourceTreeHash,
  engineCorpusSha256,
  specRelPath,
  protocolSha256 = null,
}) {
  const tuple = {
    view: viewSha,
    page: pageSha,
    sourceTreeHash,
    engineCorpusSha256,
    spec: specRelPath,
  };
  if (protocolSha256 !== null && protocolSha256 !== undefined) tuple.protocol = protocolSha256;
  return createHash("sha256")
    .update(`${SHARD_INPUT_SCHEMA}\n`)
    .update(JSON.stringify(tuple))
    .digest("hex");
}

/** The direct protocol's own source hash: the sha256 over the three files the
 *  direct grade runner executes or imports (runner entry, core, transform
 *  loader), each keyed by repo-relative path so a rename moves the hash too.
 *  Content-only, no mtime: this is a cache key, and a touched-but-unchanged
 *  file must not invalidate anything. Null under --runner vitest, where the
 *  spec is the protocol and the source-tree hash already covers it. */
export function directProtocolSha256(repo) {
  const hash = createHash("sha256");
  for (const rel of [DIRECT_RUNNER_REL, ...DIRECT_RUNNER_DEPS_REL]) {
    const p = path.join(repo, rel);
    if (!existsSync(p)) return null;
    hash.update(`${rel}:${sha256File(p)}\n`);
  }
  return hash.digest("hex");
}

// ---------- floors (same parsing as the full grader) ----------

export function resolveFloors(floorsArg, defaults) {
  const base = { ...FULL_RUN_FLOORS, ...(defaults ?? {}) };
  if (!floorsArg) return base;
  const parsed = {};
  for (const pair of floorsArg.split(",")) {
    const m = /^([a-zA-Z]+)=(\d+)$/.exec(pair.trim());
    if (!m) fail(`bad --floors pair: "${pair}" (expected lane=number; lanes: ${FLOOR_LANES.join(", ")})`);
    if (!FLOOR_LANES.includes(m[1])) fail(`unknown --floors lane: ${m[1]} (known lanes: ${FLOOR_LANES.join(", ")})`);
    parsed[m[1]] = Number(m[2]);
  }
  return { ...base, ...parsed };
}

// ---------- provenance (full grader's gate verbatim + the engine-input gate) ----------

/** Pure check; refusals non-empty means refuse (exit 4, the full grader's
 *  provenance-refusal code). Loads nothing when given precomputed hashes. */
export function checkProvenance({
  manifestCheck,          // result of verifyManifestForGrading (caller runs it once)
  baseline,               // may be null (baseline mode has no prior baseline)
  liveCorpusSha256,       // sha256(manifestGateCorpusPath) at run start
  liveEngineCorpusSha256, // sha256(engineCorpusPath) at run start
}) {
  const refusals = [];
  if (!manifestCheck.ok) refusals.push(...manifestCheck.refusals);
  if (baseline) {
    const manifestSha = manifestCheck.manifest?.corpusSha256?.after ?? null;
    if (manifestSha && baseline.corpusSha256 && manifestSha !== baseline.corpusSha256) {
      refusals.push(
        `the graded corpus changed since the baseline was recorded (baseline binds ` +
          `${baseline.corpusSha256.slice(0, 12)}..., live capture manifest binds ` +
          `${manifestSha.slice(0, 12)}...) -- the cached verdicts describe a different corpus; ` +
          "re-photograph and rebuild the baseline (--baseline)",
      );
    }
    if (baseline.engineCorpusSha256 && liveEngineCorpusSha256 !== baseline.engineCorpusSha256) {
      refusals.push(
        `the engine-input corpus changed since the baseline was recorded ` +
          `(baseline binds ${baseline.engineCorpusSha256.slice(0, 12)}..., live file ` +
          `${liveEngineCorpusSha256.slice(0, 12)}...) -- this is tmp/raw-ground-truth/` +
          "bench-corpus-raw.sqlite3, the file the verify spec's seeded storage reads " +
          "(raw-corpus-seeding.ts RAW_CORPUS_DB). The cached verdicts were rendered from " +
          "different corpus bytes; rebuild the baseline (--baseline)",
      );
    }
  }
  return { ok: refusals.length === 0, refusals };
}

// ---------- the delta plan ----------

/** Why a shard re-renders. Precedence: requested > forced > source-tree >
 *  absent-from-baseline > no-recorded-input-hash > bytes-moved (lane-named) >
 *  input-hash-moved > last-verdict-failed. Everything else is reused (Bazel
 *  exact-reuse: PASS-only, input-tuple-keyed). `engineCorpusSha256` and
 *  `specRelPath` must always be the LIVE values (they are tuple members), and
 *  so must `protocolSha256` (the direct runner's own source hash, or null when
 *  a spec did the grading) -- a plan computed with the wrong protocol member
 *  would compare live verdicts against a cache key for a different action.
 *  `sourceHash` may be null only where there is no baseline to compare. */
export function planDelta({ baseline, repo, sourceHash, forceShards, onlyShards, engineCorpusSha256, specRelPath, protocolSha256 = null }) {
  const discovered = discoverShards(repo);
  const names = onlyShards ?? discovered;
  const plan = [];
  for (const name of names) {
    const inBaseline = baseline ? baseline.shards[name] !== undefined : false;
    const bytes = shardBytesHashes(repo, name);
    const rec = inBaseline ? baseline.shards[name] : null;
    const nowInput = shardInputHash({
      viewSha: bytes.viewSha,
      pageSha: bytes.pageSha,
      sourceTreeHash: sourceHash ?? "unavailable",
      engineCorpusSha256: engineCorpusSha256 ?? "unavailable",
      specRelPath: specRelPath ?? "unavailable",
      protocolSha256,
    });
    let reason = null;
    if (onlyShards) reason = "requested";
    else if (forceShards?.includes(name)) reason = "forced";
    else if (!baseline || !inBaseline) reason = "not-in-baseline";
    else if (sourceHash && sourceHash !== baseline.sourceTreeHash) reason = "source-tree-changed";
    else {
      // Bazel contract: PASS-only reuse on an unchanged input tuple.
      if (!rec.inputHash) reason = "no-input-hash-in-baseline";
      else {
        for (const lane of LANES) {
          const nowSha = bytes[`${lane}Sha`];
          const wasSha = rec[`${lane}Sha`];
          if (nowSha !== wasSha) reason = `${lane}-bytes-moved`;
        }
        // A shard whose bytes hash-verify against the recorded per-shard manifest
        // hashes but not against the baseline copy is still moved bytes (the
        // baseline is the older record); manifest hashes are checked at refusal
        // time only when present.
        if (!reason && rec.inputHash !== nowInput) reason = "input-hash-moved";
        if (
          !reason &&
          ((rec.view?.failIds?.length ?? 0) > 0 || (rec.page?.failIds?.length ?? 0) > 0)
        ) {
          // DoNotCache: a failure is never memoized -- the next run re-renders
          // a shard whose last verdict failed, inputs identical or not.
          reason = "last-verdict-failed";
        }
      }
    }
    const m = measureShard(repo, name);
    plan.push({
      shard: name,
      action: reason ? "render" : "reuse",
      reason: reason ?? "inputs-unchanged",
      inputHash: nowInput,
      entries: m.view.entries + m.page.entries,
      view: m.view,
      page: m.page,
    });
  }
  const renderCount = plan.filter((p) => p.action === "render").length;
  return {
    plan,
    renderCount,
    reuseCount: plan.length - renderCount,
    entriesToRender: plan.filter((p) => p.action === "render").reduce((a, p) => a + p.entries, 0),
    entriesReused: plan.filter((p) => p.action === "reuse").reduce((a, p) => a + p.entries, 0),
  };
}

// ---------- fail-set diff (per-shard replacement semantics) ----------

/** Fresh results REPLACE the baseline's fail records for their shard (the
 *  whole shard was re-rendered). newFails = failing ids now that were not
 *  failing in the baseline. fixedFails = baseline failing ids whose shard WAS
 *  re-rendered and that no longer fail -- a fail on an unrendered shard is
 *  neither new nor fixed; it simply persists. */
export function diffFailSets(baselineShards, freshByShard) {
  const baseFail = new Map();
  for (const [shard, rec] of Object.entries(baselineShards ?? {})) {
    for (const lane of LANES) {
      for (const f of rec[lane]?.failIds ?? []) {
        baseFail.set(f.id, { shard, lane, sig: f.sig });
      }
    }
  }
  const nowFail = new Map();
  for (const [shard, rec] of Object.entries(freshByShard)) {
    for (const lane of LANES) {
      for (const f of rec[lane]?.failIds ?? []) {
        nowFail.set(f.id, { shard, lane, sig: f.sig });
      }
    }
  }
  const rendered = new Set(Object.keys(freshByShard ?? {}));
  const newFails = [];
  for (const [id, meta] of nowFail) {
    if (!baseFail.has(id)) newFails.push({ id, ...meta });
  }
  const fixedFails = [];
  for (const [id, meta] of baseFail) {
    if (!rendered.has(meta.shard)) continue; // unrendered shard: fail persists, not "fixed"
    if (!nowFail.has(id)) fixedFails.push({ id, ...meta });
  }
  const sortFail = (a, b) => (a.shard + a.lane + a.id).localeCompare(b.shard + b.lane + b.id);
  newFails.sort(sortFail);
  fixedFails.sort(sortFail);
  return { newFails, fixedFails };
}

// ---------- verdict (full grader's vocabulary) ----------

const pct = (pass, entries) => (100 * pass) / Math.max(1, entries);

export function totalsLine(lane, totals) {
  return `TOTALS ${lane}: ${totals.pass}/${totals.entries} (${pct(totals.pass, totals.entries).toFixed(1)}%), ${totals.fail} failing`;
}

export function floorsLine(totals, floors) {
  const notes = [];
  for (const lane of ["view", "page"]) {
    const actual = totals[lane]?.pass ?? 0;
    const ok = actual >= floors[lane];
    notes.push(`${lane}: ${actual} ${ok ? ">=" : "<"} floor ${floors[lane]}`);
  }
  return `FLOORS ${notes.join("; ")}`;
}

/** Returns {verdict, exitCode, lines[]} in capture-and-grade vocabulary.
 *  renderFailures > 0 forces FAIL (the full grader's "phase crashed or
 *  produced no parseable aggregate" arm), then floors decide. */
export function emitVerdict({ totals, floors, captureErrors, newFails, fixedFails, renderFailures, coverageCaveat, runMeta }) {
  const lines = [];
  for (const lane of ["view", "page"]) lines.push(totalsLine(lane, totals[lane]));
  let floorsOk = true;
  for (const lane of ["view", "page"]) {
    const actual = totals[lane]?.pass ?? 0;
    if (actual < floors[lane]) floorsOk = false;
  }
  const captureOk = captureErrors.total <= floors.captureErrors;
  lines.push(floorsLine(totals, floors));
  lines.push(
    `CAPTURE-ERRORS ${captureErrors.total} (view ${captureErrors.view}, page ${captureErrors.page}; floor ${
      Number.isFinite(floors.captureErrors) ? floors.captureErrors : "unlimited"
    }, target 0) ${captureOk ? "<=" : ">"} limit${captureOk ? "" : " -- over the capture-error floor"}`,
  );
  let verdict;
  let exitCode;
  if (renderFailures > 0) {
    verdict = "FAIL";
    exitCode = 1;
    lines.push(`RENDER-FAILURES ${renderFailures} shard render(s) crashed or produced no parseable aggregate`);
  } else if (!captureOk) {
    verdict = "FAIL";
    exitCode = 1;
  } else if (!floorsOk) {
    verdict = "FAIL";
    exitCode = 1;
  } else {
    verdict = "PASS";
    exitCode = 0;
  }
  const ratchet = `ratchet suggestion: --floors view=${totals.view.pass},page=${totals.page.pass}`;
  lines.push(
    `NEW-FAILS ${newFails.length}${newFails.length ? ":\n" + newFails.map((f) => `  NEW-FAIL ${f.id} (${f.lane}-lane, ${f.shard}, ${f.sig})`).join("\n") : ""}`,
  );
  lines.push(`FIXED ${fixedFails.length}${fixedFails.length ? ":\n" + fixedFails.map((f) => `  FIXED ${f.id} (${f.lane}-lane, ${f.shard}, was ${f.sig})`).join("\n") : ""}`);
  lines.push(ratchet);
  const oneLine =
    `VERDICT: ${verdict} -- measured: ${runMeta}. ` +
    `view: ${totals.view.pass}/${totals.view.entries} (${pct(totals.view.pass, totals.view.entries).toFixed(1)}%), ${totals.view.fail} failing | ` +
    `page: ${totals.page.pass}/${totals.page.entries} (${pct(totals.page.pass, totals.page.entries).toFixed(1)}%), ${totals.page.fail} failing | ` +
    `captureErrors=${captureErrors.total} (floor ${floors.captureErrors}) | ` +
    `newFails=${newFails.length} fixed=${fixedFails.length}` +
    (coverageCaveat ? ` | CAVEAT: ${coverageCaveat}` : "");
  return { verdict, exitCode, lines, oneLine };
}

// ---------- CLI ----------

function parseArgs(argv) {
  const opts = {
    repo: null,
    baseline: null,
    baselineFlag: false,
    baselineRoot: null,
    runId: null,
    floors: null,
    deadlineMin: 20,
    forceShards: null,
    shards: null,
    dryRun: false,
    heapMb: 1536,
    concurrency: 1,
    spec: DEFAULT_SPEC,
    quiet: false,
    runner: RUNNER_VITEST,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) fail(`missing value for ${a}`);
      return argv[i];
    };
    if (a === "--repo") opts.repo = path.resolve(next());
    // --baseline is overloaded by design (documented in USAGE): with a
    // non-flag next token it names a baseline file to load; bare, it builds
    // a fresh baseline. The if/else pair makes the two meanings mutually
    // exclusive by construction.
    else if (a === "--baseline" && i + 1 < argv.length && !argv[i + 1].startsWith("--")) opts.baseline = path.resolve(next());
    else if (a === "--baseline") opts.baselineFlag = true;
    else if (a === "--baseline-root") opts.baselineRoot = path.resolve(next());
    else if (a === "--run-id") opts.runId = next();
    else if (a === "--floors") opts.floors = next();
    else if (a === "--deadline-min") {
      const v = Number(next());
      if (!Number.isFinite(v) || v <= 0) fail("--deadline-min must be a positive number");
      opts.deadlineMin = v;
    } else if (a === "--force-shards") opts.forceShards = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--shards") opts.shards = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--heap-mb") opts.heapMb = Number(next());
    else if (a === "--concurrency") {
      const v = Number(next());
      if (!Number.isInteger(v) || v < 1 || v > 8) {
        fail("--concurrency must be an integer 1..8 (default 1 = sequential)");
      }
      opts.concurrency = v;
    }
    else if (a === "--spec") opts.spec = next();
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--runner") {
      const name = next();
      if (name !== RUNNER_VITEST && name !== RUNNER_DIRECT) {
        fail(`unknown --runner: ${name} (known: ${RUNNER_VITEST}, ${RUNNER_DIRECT})`);
      }
      opts.runner = name;
    }
    else fail(`unknown argument: ${a}`);
  }
  return opts;
}

// ---------- baseline store ----------

export function baselineRootFor(repo, override, corpusSha8) {
  const root = override ?? path.join(repo, DEFAULT_BASELINE_ROOT_SEGMENT);
  return path.join(root, corpusSha8);
}

function gitHead(repo) {
  const r = spawnSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8", timeout: 15_000, windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function buildBaselineObject({ baselineId, repo, runMeta }) {
  const manifestGate = verifyManifestForGrading({
    manifestPath: manifestPath(repo),
    corpusFile: manifestGateCorpusPath(repo),
  });
  if (!manifestGate.ok) return { refusal: manifestGate };
  const corpusSha256 = manifestGate.manifest.corpusSha256.after;
  const src = hashSourceTree(repo);
  return {
    baseline: {
      schema: BASELINE_SCHEMA,
      baselineId,
      createdAt: new Date().toISOString(),
      repo,
      gitHead: gitHead(repo),
      corpusSha256,
      manifestSha256: sha256File(manifestPath(repo)),
      engineCorpusSha256: existsSync(engineCorpusPath(repo)) ? sha256File(engineCorpusPath(repo)) : null,
      sourceTreeHash: src.hash,
      sourceFiles: src.files,
      specRelPath: runMeta.specRelPath,
      // Which child graded, and under --runner direct the sha256 of the
      // direct protocol's own source. Recorded so a baseline says what
      // produced it; the per-shard inputHash already carries the protocol
      // member, so this is the human-readable copy, not the mechanism.
      runner: runMeta.runner ?? RUNNER_VITEST,
      directProtocolSha256: runMeta.directProtocolSha256 ?? null,
      floors: runMeta.floors,
      totals: runMeta.totals,
      captureErrors: runMeta.captureErrors,
      shards: runMeta.shards,
      priorBaseline: runMeta.priorBaselineId ?? null,
    },
    corpusSha256,
  };
}

function loadBaseline(p) {
  let raw;
  try {
    raw = readFileSync(p, "utf8");
  } catch {
    return null;
  }
  try {
    const b = JSON.parse(raw);
    if (b.schema !== BASELINE_SCHEMA) return null;
    return b;
  } catch {
    return null;
  }
}

function resolveBaseline(repo, opts) {
  if (opts.baseline) {
    const b = loadBaseline(opts.baseline);
    if (!b) fail(`--baseline file missing or not schema ${BASELINE_SCHEMA}: ${opts.baseline}`);
    return b;
  }
  const latest = path.join(opts.baselineRoot ?? path.join(repo, DEFAULT_BASELINE_ROOT_SEGMENT), "LATEST.json");
  if (!existsSync(latest)) return null;
  let pointer;
  try {
    pointer = JSON.parse(readFileSync(latest, "utf8"));
  } catch {
    fail(`LATEST pointer unparseable: ${latest} -- pass --baseline <file> explicitly`);
  }
  const b = loadBaseline(pointer.path);
  if (!b) fail(`LATEST pointer target missing/unreadable: ${pointer.path} -- pass --baseline <file> explicitly`);
  return b;
}

// ---------- logging ----------

let LOG_FILE = null;
function log(line) {
  console.log(`${new Date().toISOString()} ${line}`);
  if (LOG_FILE) {
    try {
      appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
    } catch { /* artifacts dir not created yet */ }
  }
}

// ---------- render child (one shard, sequential) ----------

/** The child's spawn shape for one shard render, as data (pure, exported so a
 *  test can assert the two shapes without spawning a renderer).
 *
 *  vitest: the historical `npx vitest run <spec>` through the shell, byte for
 *  byte the command line this tool has always spawned.
 *  direct: the direct grade runner under this very node binary, no shell. It
 *  takes the shard from the SAME DUAL_LANE_FILES env the vitest child took it
 *  from, so one list travels by one mechanism; it is deliberately NOT also
 *  passed as --files (the runner fills the env only when the caller left it
 *  unset, and two channels for one value is two things that can disagree).
 *  It is given no --aggregate-out either: the aggregate must land on the
 *  shared enumerationOutFile path, because the per-child validation below
 *  reads that path and proves the bytes belong to THIS shard. Redirecting it
 *  would not be a faster grade, it would be an unvalidated one.
 *
 *  --label is the shard name: the direct runner prints it on its RUNNER-TIMING
 *  line, so a run log says which shard each child's numbers describe. */
export function renderCommand({ repo, shard, spec, runner }) {
  if (runner === RUNNER_DIRECT) {
    return {
      shell: false,
      file: process.execPath,
      args: [path.join(repo, DIRECT_RUNNER_REL), "--repo", repo, "--label", shard],
      describe: `${DIRECT_RUNNER_REL} --label ${shard}, DUAL_LANE_FILES=${shard}`,
    };
  }
  return {
    shell: true,
    file: "npx vitest run " + spec,
    args: [],
    describe: `npx vitest run ${spec}, DUAL_LANE_FILES=${shard}`,
  };
}

/** Spawns ONE child for ONE shard (same env contract verifier-fast uses),
 *  enforces the per-child deadline, kills its own child tree by recorded PID on
 *  breach (taskkill /PID <pid> /T /F -- fully owned: spawned here, command
 *  line known by construction), and snapshots the child's enumeration
 *  aggregate (last-writer-wins file -> snapshot per shard while it is still
 *  this child's). Which child that is comes from renderCommand above; every
 *  validation below it is runner-agnostic. Returns
 *  {status:'ok'|'failed'|'stalled', shard, pid, fresh?, why?, exit?} where
 *  fresh = {view:{entries,pass,fail,failIds},page:{...}} and pid is the
 *  recorded child pid (every resolution carries it so the caller can kill
 *  in-flight siblings on a stall). */
function renderShardChild({ repo, shard, spec, runner, deadlineMin, heapMb, artifactsDir, quiet, onSpawn }) {
  const expectedFiles = {
    view: existsSync(path.join(laneDir(repo, "view"), shard)),
    page: existsSync(path.join(laneDir(repo, "page"), shard)),
  };
  const outFile = enumerationOutFile(repo);
  const outBefore = existsSync(outFile) ? statSync(outFile).mtimeMs : -1;
  const env = {
    ...process.env,
    DUAL_LANE_FILES: shard,
    DUAL_LANE_REPORT_ONLY: "1",
    NODE_OPTIONS: `--max-old-space-size=${heapMb}`,
  };
  if (runner === RUNNER_DIRECT && env.DUAL_LANE_TSC_CACHE_DIR === undefined) {
    // The direct child's transform cache (tools/oracle/
    // typescript-source-loader.mjs), keyed by source CONTENT hash, so it is a
    // pure speed path -- a warm entry is the emitted JavaScript a cold boot
    // would have produced. Shared across every child in the run, which is the
    // point: N shards used to mean N test-framework boots each re-transforming
    // the graph. An inherited value from the caller always wins.
    env.DUAL_LANE_TSC_CACHE_DIR = path.join(repo, "tmp", "direct-runner-build", "tscache");
  }
  const t0 = Date.now();
  const cmd = renderCommand({ repo, shard, spec, runner });
  return new Promise((resolve) => {
    log(`RENDER ${shard}: START ${cmd.describe} (deadline ${deadlineMin} min, heap ${heapMb} MB)`);
    const child = cmd.shell
      ? spawn(cmd.file, { cwd: repo, env, shell: true, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
      : spawn(cmd.file, cmd.args, { cwd: repo, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const pid = child.pid;
    if (onSpawn) onSpawn(pid);
    let stalled = false;
    let output = "";
    const timer = setTimeout(() => {
      stalled = true;
      log(`DEADLINE breached: ${shard} exceeded ${deadlineMin} min -- killing own child tree (pid ${pid})`);
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", timeout: 30_000, windowsHide: true });
      resolve({ status: "stalled", shard, pid });
    }, deadlineMin * 60_000);
    const collect = (chunk) => {
      const text = chunk.toString();
      output += text;
      if (LOG_FILE) {
        try {
          appendFileSync(LOG_FILE, text.endsWith("\n") ? text : text + "\n");
        } catch { /* log unavailable */ }
      }
      if (!quiet) {
        for (const line of text.split("\n")) {
          if (line.trim() !== "") process.stdout.write(`[${shard}] ${line}\n`);
        }
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (stalled) return;
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      // Snapshot the enumeration aggregate ONLY if this child demonstrably
      // wrote it (mtime moved + the aggregate's own files lists name exactly
      // this shard in exactly the lanes that exist). A stale or foreign file
      // is a render failure, never silently-accepted data. The bytes are read
      // ONCE and validated AND stored from that single read -- under
      // concurrency a sibling could overwrite the file between a validate
      // read and a copy read, and the snapshot must be exactly the validated
      // bytes (a sibling's aggregate names a different shard, so it refuses
      // here rather than poisoning the snapshot).
      let fresh = null;
      let why = null;
      if (!existsSync(outFile)) {
        why = "enumeration aggregate missing after child exit";
      } else {
        const wrote = statSync(outFile).mtimeMs > outBefore;
        let raw = null;
        try {
          raw = readFileSync(outFile);
        } catch {
          why = "enumeration aggregate unreadable after child exit";
        }
        let agg = null;
        if (!why) {
          try {
            agg = JSON.parse(raw.toString("utf8"));
          } catch {
            why = "enumeration aggregate does not parse";
          }
        }
        const expectView = expectedFiles.view ? [shard] : [];
        const expectPage = expectedFiles.page ? [shard] : [];
        const viewOk = agg && JSON.stringify(agg.viewLane?.aggregate?.files ?? null) === JSON.stringify(expectView);
        const pageOk = agg && JSON.stringify(agg.pageLane?.aggregate?.files ?? null) === JSON.stringify(expectPage);
        if (!why && !wrote) why = "enumeration aggregate mtime did not move (child may have crashed before writing)";
        if (!why && (!viewOk || !pageOk)) why = `enumeration aggregate files lists mismatch (view=${JSON.stringify(agg?.viewLane?.aggregate?.files)}, page=${JSON.stringify(agg?.pageLane?.aggregate?.files)})`;
        if (!why) {
          const reduce = (laneOutcome) => ({
            entries: laneOutcome.aggregate.entries,
            pass: laneOutcome.aggregate.pass.total,
            fail: laneOutcome.aggregate.fail.total,
            failIds: laneOutcome.failures.map((f) => ({ id: f.id, sig: f.sig })),
            signatureCounts: laneOutcome.signatureCounts,
          });
          fresh = {
            view: { present: expectedFiles.view, ...(expectedFiles.view ? reduce(agg.viewLane) : { entries: 0, pass: 0, fail: 0, failIds: [] }) },
            page: { present: expectedFiles.page, ...(expectedFiles.page ? reduce(agg.pageLane) : { entries: 0, pass: 0, fail: 0, failIds: [] }) },
          };
          const snap = path.join(artifactsDir, `out-file-snapshot-${shard.replace(/\.jsonl$/, "")}.json`);
          writeFileSync(snap, raw);
        }
      }
      if (why) {
        log(`RENDER ${shard}: FAILED exit=${code} ${secs}s -- ${why}`);
        resolve({ status: "failed", shard, pid, why, exit: code });
        return;
      }
      if (code !== 0) {
        // report-only mode should not fail; a nonzero exit means the child
        // itself crashed late. The aggregate snapshot is kept as a receipt,
        // but the render loop DISCARDS this child's verdicts (a "failed"
        // status is never merged into totals or a baseline) -- the same
        // shape as verifier-fast's crashed phase, whose numbers never count.
        log(`RENDER ${shard}: CHILD-EXIT ${code} after ${secs}s (snapshot kept as receipt; verdicts DISCARDED -- a failed render never merges)`);
        resolve({ status: "failed", shard, pid, why: `child exit ${code}`, exit: code, fresh });
        return;
      }
      log(`RENDER ${shard}: DONE exit=0 ${secs}s view=${fresh.view.pass}/${fresh.view.entries} page=${fresh.page.pass}/${fresh.page.entries} failIds=${fresh.view.failIds.length + fresh.page.failIds.length}`);
      resolve({ status: "ok", shard, pid, fresh });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      if (!stalled) {
        log(`RENDER ${shard}: SPAWN-ERROR ${e.message}`);
        resolve({ status: "failed", shard, pid, why: `spawn error: ${e.message}` });
      }
    });
  });
}

// ---------- main ----------

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (process.platform !== "win32") {
    console.error(
      "PLATFORM-OPS: incremental-diff-grade has no linux branch -- it accompanies the " +
        "win32-only capture-and-grade flow and kills its render children with taskkill " +
        "by recorded PID. Implement a linux branch before running it there.",
    );
    process.exit(1);
  }
  if (!opts.repo) fail("--repo <dir> is required (the checkout to grade)");
  if (!existsSync(opts.repo)) fail(`--repo does not exist: ${opts.repo}`);

  const REPO = opts.repo;
  // --runner direct pre-flight. FIRST, ahead of the spec existence check and
  // ahead of the provenance hashes: a mode-compatibility refusal must not be
  // preempted by a check about the mode it does not apply to. (The seam-gate
  // run caught that: with the existence check first, `--runner direct --spec
  // <some path>` refused with "verify spec not found" -- true, but the wrong
  // sentence, and it left the real problem -- that the direct child executes
  // no spec at all -- unsaid. That ordering is the defect; the fix is the
  // order, not the message.)
  //
  // Two refusals, both loud, because the direct child does not execute a spec:
  //  1. a non-default --spec would be silently ignored. The flag is honoured
  //     by the vitest path only, so carrying it into direct mode is a lie
  //     about what is about to run.
  //  2. the runner and the two files it imports must exist under --repo, so a
  //     missing runner fails once, here, rather than once per shard.
  if (opts.runner === RUNNER_DIRECT) {
    if (opts.spec !== DEFAULT_SPEC) {
      fail(
        `--runner direct does not execute --spec: it grades through the tracked ` +
          `protocol in ${DIRECT_RUNNER_REL} (core ${DIRECT_RUNNER_DEPS_REL[0]}). A ` +
          `non-default --spec (${opts.spec}) would be silently ignored. Pass ` +
          "--runner vitest to grade through that spec.",
      );
    }
    for (const rel of [DIRECT_RUNNER_REL, ...DIRECT_RUNNER_DEPS_REL]) {
      if (!existsSync(path.join(REPO, rel))) {
        fail(`--runner direct: ${rel} not found under --repo ${REPO} (the direct grade runner cannot boot)`);
      }
    }
  }
  if (!existsSync(path.join(REPO, opts.spec))) {
    fail(`verify spec not found under --repo: ${opts.spec} (pass --spec to override)`);
  }

  const mode = opts.baselineFlag ? "baseline" : opts.dryRun ? "dry-run" : "delta";
  const runId = opts.runId ?? `${mode}-${stamp()}`;
  const artifactsDir = path.join(REPO, "tmp", `diff-grade-artifacts-${runId}`);
  mkdirSync(artifactsDir, { recursive: true });
  LOG_FILE = path.join(artifactsDir, "incremental-diff-grade.log");
  log(`run: repo=${REPO} mode=${mode} run-id=${runId} concurrency=${opts.concurrency} runner=${opts.runner} inputSchema=${SHARD_INPUT_SCHEMA}`);
  if (opts.runner === RUNNER_DIRECT) {
    log(
      `runner direct: shards are graded by ${DIRECT_RUNNER_REL} (core ${DIRECT_RUNNER_DEPS_REL[0]}). ` +
        `The spec at ${opts.spec} is NOT executed in this mode -- it is the parity oracle the ` +
        "direct protocol is proven against " +
        "(tools/oracle/dual-lane-direct-parity-gate.mjs). Shards, env, aggregate path, " +
        "per-child validation, deadline/kill and the merge are unchanged.",
    );
  }

  // ---- provenance gates (always, even for --dry-run: catch a swap before
  // any grading minute is spent) ----
  const liveCorpus = manifestGateCorpusPath(REPO);
  const liveEngineCorpus = engineCorpusPath(REPO);
  if (!existsSync(liveCorpus)) {
    fail(`no staged corpus at ${liveCorpus} -- the manifest gate hashes it; stage the photographed corpus first`);
  }
  const corpusBefore = sha256File(liveCorpus);
  const manifestCheck = verifyManifestForGrading({
    manifestPath: manifestPath(REPO),
    corpusFile: liveCorpus,
    liveCorpusSha256: corpusBefore,
  });
  if (!existsSync(liveEngineCorpus)) {
    fail(`no engine-input corpus at ${liveEngineCorpus} -- the verify spec's seeded storage reads it (raw-corpus-seeding.ts RAW_CORPUS_DB)`);
  }
  const engineCorpusSha = sha256File(liveEngineCorpus);

  const baseline = resolveBaseline(REPO, opts);
  if (mode !== "baseline" && mode !== "dry-run" && !baseline) {
    fail(
      "no baseline recorded yet -- there is nothing to diff against. Build one first " +
        "(ONE operator-approved full-canvas event): " +
        `node tools/incremental-diff-grade.mjs --repo ${REPO} --baseline --run-id baseline-1`,
    );
  }

  const prov = checkProvenance({ manifestCheck, baseline, liveCorpusSha256: corpusBefore, liveEngineCorpusSha256: engineCorpusSha });
  if (!prov.ok) {
    for (const r of prov.refusals) log(`PROVENANCE REFUSAL: ${r}`);
    console.error("PROVENANCE GATE: refusing to grade against provenance that does not check out (exit 4).");
    process.exit(4);
  }
  log(
    `provenance: OK -- manifest binds corpus ${corpusBefore.slice(0, 16)}..., engine-input corpus ` +
      `${engineCorpusSha.slice(0, 16)}...${baseline ? `, baseline ${baseline.baselineId} binds both` : ""}`,
  );

  // ---- source tree ----
  const src = hashSourceTree(REPO);
  let sourceChangedFiles = { changed: [], removed: [] };
  if (baseline) {
    sourceChangedFiles = changedSourceFiles(baseline.sourceFiles ?? {}, src.files);
    const sourceChanged = src.hash !== baseline.sourceTreeHash;
    log(
      `source tree: ${sourceChanged ? "CHANGED" : "unchanged"} (${Object.keys(src.files).length} files hashed)` +
        (sourceChanged
          ? ` -- ${sourceChangedFiles.changed.length} changed, ${sourceChangedFiles.removed.length} removed` +
            (sourceChangedFiles.changed.slice(0, 20).length ? `: ${sourceChangedFiles.changed.slice(0, 20).join(", ")}` : "")
          : ""),
    );
  }

  // ---- shard selection ----
  const discovered = discoverShards(REPO);
  if (discovered.length === 0) fail(`no shard files found under ${expectedV2Dir(REPO)} -- not a photographed tree`);
  for (const s of [...(opts.shards ?? []), ...(opts.forceShards ?? [])]) {
    if (!SHARD_RE.test(s)) fail(`shard name must look like recapture-raw-shard-NNNNNN.jsonl (got ${s})`);
    if (!discovered.includes(s)) fail(`shard not found in either lane: ${s}`);
  }
  if (opts.shards) {
    const missing = opts.shards.filter((s) => !discovered.includes(s));
    if (missing.length) fail(`--shards not found: ${missing.join(", ")}`);
  }
  const sourceChanged = baseline ? src.hash !== baseline.sourceTreeHash : true;
  if (opts.shards && sourceChanged && baseline) {
    const covered = new Set(opts.shards);
    const uncovered = discovered.filter((s) => !covered.has(s));
    if (uncovered.length > 0) {
      fail(
        `--shards restriction refused: the source tree changed since the baseline, so EVERY ` +
          `shard must re-render; rendering only [${opts.shards.join(", ")}] would store verdicts from ` +
          `two different engines in one baseline (${uncovered.length} shards uncovered). ` +
          "Run unrestricted, or rebuild the baseline.",
      );
    }
  }
  if (opts.forceShards && sourceChanged && baseline) {
    const covered = new Set(opts.forceShards);
    const uncovered = discovered.filter((s) => !covered.has(s));
    if (uncovered.length > 0) {
      fail(
        `--force-shards refused: the source tree changed since the baseline, so the plan already ` +
          `re-renders every shard; forcing a subset adds nothing (${uncovered.length} other shards ` +
          "are already in the render set by the source-change rule).",
      );
    }
  }
  const priorShards = mode === "baseline" ? {} : (baseline?.shards ?? {});
  // The direct protocol's own source hash, or null when a spec does the
  // grading. Read ONCE here and carried into both the plan and the merge so
  // the two can never disagree about which action the cache key names.
  const protocolSha = opts.runner === RUNNER_DIRECT ? directProtocolSha256(REPO) : null;
  if (opts.runner === RUNNER_DIRECT && protocolSha === null) {
    fail(`--runner direct: could not hash the direct protocol under --repo ${REPO} (a runner file is missing)`);
  }
  if (protocolSha !== null) {
    log(`direct protocol hash: ${protocolSha} (${[DIRECT_RUNNER_REL, ...DIRECT_RUNNER_DEPS_REL].join(", ")})`);
  }
  // One plan, computed once. In baseline mode every discovered shard
  // renders: no prior baseline to reuse, no restriction narrowing the set.
  const fullPlan = planDelta({
    baseline: mode === "baseline" ? null : baseline,
    repo: REPO,
    sourceHash: src.hash,
    forceShards: mode === "baseline" ? null : opts.forceShards,
    onlyShards: mode === "baseline" ? discovered : opts.shards,
    engineCorpusSha256: engineCorpusSha,
    specRelPath: opts.spec,
    protocolSha256: protocolSha,
  });

  const renderSet = fullPlan.plan.filter((p) => p.action === "render").map((p) => p.shard);
  log(
    `plan: ${fullPlan.renderCount} of ${fullPlan.plan.length} shards would render ` +
      `(${fullPlan.entriesToRender} entries; ${fullPlan.reuseCount} shards / ${fullPlan.entriesReused} entries reused)` +
      (mode === "baseline" ? " -- baseline mode renders ALL discovered shards" : ""),
  );

  if (mode === "dry-run") {
    console.log("DRY-RUN PLAN (no rendering performed):");
    console.log(`  mode: dry-run  repo: ${REPO}  run-id: ${runId}`);
    console.log(`  baseline: ${baseline ? `${baseline.baselineId} (${baseline.createdAt})` : "NONE -- the first real run must be --baseline (full canvas)"}`);
    console.log(`  provenance: OK (manifest corpus ${corpusBefore.slice(0, 12)}..., engine corpus ${engineCorpusSha.slice(0, 12)}...)`);
    console.log(`  source tree: ${baseline ? (sourceChanged ? "CHANGED" : "unchanged") : "no baseline to compare"}`);
    if (sourceChangedFiles.changed.length) console.log(`    changed files (${sourceChangedFiles.changed.length}):\n      ${sourceChangedFiles.changed.join("\n      ")}`);
    if (sourceChangedFiles.removed.length) console.log(`    removed files (${sourceChangedFiles.removed.length}):\n      ${sourceChangedFiles.removed.join("\n      ")}`);
    console.log(`  shards: ${fullPlan.renderCount} to render, ${fullPlan.reuseCount} reused of ${fullPlan.plan.length} discovered`);
    for (const p of fullPlan.plan) {
      console.log(
        `    ${p.action === "render" ? "RENDER" : "reuse"} ${p.shard} reason=${p.reason} entries=${p.entries} (view ${p.view.entries}, page ${p.page.entries})`,
      );
    }
    console.log(`  entries: ${fullPlan.entriesToRender} would render, ${fullPlan.entriesReused} reused`);
    console.log(`  estimated child runs: ${fullPlan.renderCount} sequential ${opts.runner} children`);
    writeFileSync(
      path.join(artifactsDir, "diff-grade-dry-run-plan.json"),
      JSON.stringify({ runId, mode, plan: fullPlan.plan, sourceChanged, sourceChangedFiles }, null, 2) + "\n",
    );
    log("dry-run: plan written, exiting 0 without rendering");
    process.exit(0);
  }

  // ---- render loop (sequential by default; --concurrency N runs a bounded
  // worker pool; per-shard aggregate snapshotting in both modes) ----
  const freshByShard = {};
  let renderFailures = 0;
  let stalled = false;
  if (opts.concurrency === 1) {
    for (const shard of renderSet) {
      const r = await renderShardChild({
        repo: REPO,
        shard,
        spec: opts.spec,
        runner: opts.runner,
        deadlineMin: opts.deadlineMin,
        heapMb: opts.heapMb,
        artifactsDir,
        quiet: opts.quiet,
      });
      if (r.status === "stalled") {
        stalled = true;
        break;
      }
      if (r.status === "failed") {
        renderFailures += 1;
        continue;
      }
      freshByShard[shard] = r.fresh;
    }
  } else {
    // Bounded worker pool. Each shard is rendered by exactly one child; the
    // per-shard snapshot (shard-named, written from the single validated
    // read) is the per-child receipt, and the merge step below reduces the
    // validated snapshots into the post-run state. On a deadline breach the
    // breaching child's own timer kills its tree; the pool then kills every
    // OTHER in-flight child by its recorded pid (all of them this process's
    // own children) so exit 2 leaves no orphan workers.
    log(`concurrency: ${opts.concurrency} children in flight over ${renderSet.length} shard render(s)`);
    const queue = [...renderSet];
    const inflight = new Map(); // shard -> pid
    const killShard = (shard) => {
      const pid = inflight.get(shard);
      if (pid) {
        log(`stall cleanup: killing in-flight sibling ${shard} (pid ${pid})`);
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", timeout: 30_000, windowsHide: true });
      }
    };
    // The aggregate out-file is shared (hardcoded path in the spec), so two
    // children finishing together can leave either one reading the other's
    // aggregate -- the per-child validation REFUSES that (sound), and a
    // healthy child whose aggregate was refused re-renders ONCE (its inputs
    // are unchanged, so a re-render is always sound; by the retry the pool
    // is thinner and the race window is gone). Sequential mode never races
    // and stays strict: an aggregate refusal there is a real child defect,
    // and retrying would only mask it. A crashed child (exit != 0) or a
    // deadline breach never retries.
    const maxAggregateRetries = 1;
    const worker = async () => {
      while (queue.length > 0 && !stalled) {
        const shard = queue.shift();
        let r = null;
        for (let attempt = 0; ; attempt += 1) {
          r = await renderShardChild({
            repo: REPO,
            shard,
            spec: opts.spec,
            runner: opts.runner,
            deadlineMin: opts.deadlineMin,
            heapMb: opts.heapMb,
            artifactsDir,
            quiet: opts.quiet,
            onSpawn: (pid) => inflight.set(shard, pid),
          });
          const retryable =
            r.status === "failed" && r.exit === 0 && attempt < maxAggregateRetries;
          if (!retryable) break;
          log(
            `RENDER ${shard}: aggregate refused under concurrency (${r.why}) -- ` +
              "re-rendering once (shared out-file race; a refusal never merges, " +
              "a re-render of unchanged inputs is always sound)",
          );
        }
        inflight.delete(shard);
        if (r.status === "stalled") {
          stalled = true;
          for (const other of [...inflight.keys()]) killShard(other);
          break;
        }
        if (r.status === "failed") {
          renderFailures += 1;
          continue;
        }
        freshByShard[shard] = r.fresh;
      }
    };
    const workers = Array.from({ length: Math.min(opts.concurrency, renderSet.length) }, () => worker());
    await Promise.all(workers);
    if (stalled) {
      // Wait out the killed siblings' close handlers so no child outlives
      // this process's exit.
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (stalled) {
    log("RESULT: STALLED (exit 2)");
    process.exit(2);
  }

  // ---- merge cached + fresh into the post-run state ----
  const mergedShards = {};
  for (const shard of discovered) {
    const prior = priorShards[shard];
    const fresh = freshByShard[shard];
    if (fresh) {
      const bytes = shardBytesHashes(REPO, shard);
      mergedShards[shard] = {
        ...bytes,
        inputHash: shardInputHash({
          viewSha: bytes.viewSha,
          pageSha: bytes.pageSha,
          sourceTreeHash: src.hash,
          engineCorpusSha256: engineCorpusSha,
          specRelPath: opts.spec,
          protocolSha256: protocolSha,
        }),
        view: fresh.view,
        page: fresh.page,
        captureErrors: {
          view: measureShardFile(path.join(laneDir(REPO, "view"), shard), "view").captureErrorLines,
          page: measureShardFile(path.join(laneDir(REPO, "page"), shard), "page").captureErrorLines,
        },
      };
    } else if (prior && mode !== "baseline") {
      mergedShards[shard] = prior;
    }
  }

  const totals = {
    view: { pass: 0, fail: 0, entries: 0 },
    page: { pass: 0, fail: 0, entries: 0 },
  };
  const captureErrors = { view: 0, page: 0, total: 0 };
  for (const rec of Object.values(mergedShards)) {
    for (const lane of LANES) {
      totals[lane].pass += rec[lane]?.pass ?? 0;
      totals[lane].fail += rec[lane]?.fail ?? 0;
      totals[lane].entries += rec[lane]?.entries ?? 0;
      captureErrors[lane] += rec.captureErrors?.[lane] ?? 0;
    }
  }
  captureErrors.total = captureErrors.view + captureErrors.page;

  // A baseline build has no prior fail-set to diff against; its fail-set IS
  // the baseline record (shards[].failIds), so newFails stays empty there.
  const { newFails, fixedFails } =
    mode === "baseline" ? { newFails: [], fixedFails: [] } : diffFailSets(priorShards, freshByShard);

  const floors = resolveFloors(opts.floors, baseline?.floors);
  const coverageCaveat =
    baseline && JSON.stringify(Object.keys(mergedShards).sort()) !== JSON.stringify(Object.keys(priorShards).sort())
      ? "shard coverage differs from the baseline set; totals are measured over the current shard set"
      : null;

  const { verdict, exitCode, lines, oneLine } = emitVerdict({
    totals,
    floors,
    captureErrors,
    newFails,
    fixedFails,
    renderFailures,
    coverageCaveat,
    runMeta:
      mode === "baseline"
        ? `baseline build (all ${renderSet.length} shards rendered)`
        : `incremental diff-grade vs baseline ${baseline.baselineId} (rendered ${Object.keys(freshByShard).length}/${discovered.length} shards; ${fullPlan.entriesReused} entries reused)`,
  });
  for (const line of lines) log(line);
  console.log("");
  console.log(oneLine);

  // ---- write the post-run baseline + summary ----
  const baselineObj = buildBaselineObject({
    baselineId: runId,
    repo: REPO,
    runMeta: {
      specRelPath: opts.spec,
      runner: opts.runner,
      directProtocolSha256: protocolSha,
      floors,
      totals,
      captureErrors,
      shards: mergedShards,
      priorBaselineId: mode === "baseline" ? null : baseline?.baselineId ?? null,
    },
  });
  if (baselineObj.refusal) {
    // The gates passed at run start; a refusal here means the tree moved
    // under the run. Say so and fail -- never record a half-bound baseline.
    for (const r of baselineObj.refusal.refusals) log(`PROVENANCE REFUSAL (at baseline write): ${r}`);
    console.error("PROVENANCE GATE: the tree moved under the run; refusing to record a baseline (exit 4).");
    process.exit(4);
  }
  if (renderFailures === 0) {
    const corpusSha8 = baselineObj.corpusSha256.slice(0, 8);
    const dir = baselineRootFor(REPO, opts.baselineRoot, corpusSha8);
    const baseDir = path.join(dir, runId);
    if (existsSync(baseDir)) fail(`baseline already exists at ${baseDir} -- baselines are immutable; use a new --run-id`);
    mkdirSync(baseDir, { recursive: true });
    const baselineFile = path.join(baseDir, "baseline.json");
    writeFileSync(baselineFile, JSON.stringify(baselineObj.baseline, null, 2) + "\n");
    const latestPath = path.join(opts.baselineRoot ?? path.join(REPO, DEFAULT_BASELINE_ROOT_SEGMENT), "LATEST.json");
    writeFileSync(
      latestPath,
      JSON.stringify({ path: baselineFile, corpusSha8, baselineId: runId, writtenAt: new Date().toISOString() }, null, 2) + "\n",
    );
    log(`baseline: ${baselineFile}`);
    log(`baseline: LATEST pointer -> ${latestPath}`);
  } else {
    log("baseline: NOT written (render failures present -- a baseline with holes would poison later deltas)");
  }

  writeFileSync(
    path.join(artifactsDir, "incremental-diff-grade-summary.json"),
    JSON.stringify(
      {
        runId,
        repo: REPO,
        mode,
        baselineId: baseline?.baselineId ?? null,
        concurrency: opts.concurrency,
        runner: opts.runner,
        directProtocolSha256: protocolSha,
        shardInputSchema: SHARD_INPUT_SCHEMA,
        floors,
        totals,
        captureErrors,
        newFails,
        fixedFails,
        renderFailures,
        renderedShards: Object.keys(freshByShard),
        reusedShards: fullPlan.plan.filter((p) => p.action === "reuse").map((p) => p.shard),
        sourceChanged,
        sourceChangedFiles,
        corpusSha256: baselineObj.corpusSha256,
        engineCorpusSha256: baselineObj.baseline.engineCorpusSha256,
        sourceTreeHash: baselineObj.baseline.sourceTreeHash,
        coverageCaveat,
        verdict,
        exitCode,
      },
      null,
      2,
    ) + "\n",
  );
  log(`summary: ${path.join(artifactsDir, "incremental-diff-grade-summary.json")}`);
  log(`RESULT: ${verdict} (exit ${exitCode})`);
  process.exit(exitCode);
}

// Entry guard: running as a program executes main(); importing this module
// (tests) must stay side-effect free. Same convention as capture-and-grade.mjs.
const INVOKED_DIRECTLY = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (INVOKED_DIRECTLY) {
  await main();
}
