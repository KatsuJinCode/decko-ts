// dual-lane-verifier-fast.mjs -- fast runner for the dual-lane ground-truth
// verifier (capture + grade of the ~10,274-entry expected-v2 corpus against
// the decko-ts engine). Same verification protocol as the batch runner it
// replaces (same vitest spec, same DUAL_LANE_FILES env contract, same
// per-phase aggregate artifacts), but:
//   - phases run at capped parallelism (default 2 workers, ~1.5GB heap each
//     => ~3GB total) and the next phase dispatches the instant a worker
//     frees up -- zero idle time by construction; scheduling is purely
//     event-driven off child exit (no idle timers, no polling),
//   - one progress line per phase streams to stdout the moment it starts
//     and the moment it completes (no buffered silence),
//   - a hard per-phase deadline: on breach it kills ONLY the breaching
//     phase's own process tree -- killPhaseTree, rooted at that phase's
//     recorded PID. The kill set is the phase's PID plus its process-table
//     DESCENDANTS (the walk only descends): the shell is taskkilled /T /F,
//     every snapshot descendant is swept by its own PID, and a post-kill
//     residue re-check reports anything left. Sibling phases are children
//     of this runner, never descendants of another phase's shell, so they
//     are unreachable by construction. The process-table sweep (explicit
//     TAB separator) is what makes the scoped kill verifiable and catches
//     a still-spawning grandchild chain that taskkill /T alone can miss.
//     killOwnTree (every recorded child) fires ONLY on whole-runner
//     shutdown: SIGINT/SIGTERM, runner error, and the stalled-exit
//     residual sweep.
//   - the effective per-phase deadline is weight-aware:
//     max(--deadline-min, 1.5 x the phase's recorded duration weight), so a
//     pairing that sits at the flat deadline's edge cannot fail the run on
//     any slowdown; --flat-deadline restores the flat floor for fast stall
//     proofs. Over the full default shard set at group=2 the schedule is
//     re-paired heaviest-with-lightest; phase artifacts are keyed by the
//     phase's shard list (sha8) so a re-paired schedule can never
//     resume-skip against an earlier schedule's artifacts.
//   - the canonical verifier spec (tools/oracle/verify-dual-lane.test.ts)
//     is staged into the gitignored per-worktree instrument tree when the
//     default --spec path is used: missing -> staged, byte-identical ->
//     kept, DIFFERING -> the run refuses (a silently overwritten
//     instrument is how measurements go wrong).
//   - --runner direct routes the SAME phase list through the direct grade
//     runner (tools/oracle/dual-lane-direct-runner.mjs) instead of spawning
//     an `npx vitest run` child per phase. Everything else about a run is
//     unchanged: the phase list, the balanced pairing, the weight-aware
//     deadline, the kill scoping, the artifact names and their resume
//     keys, the aggregate extraction, the floors and the exit codes. Only
//     the child process shape changes. The direct child prints the spec's
//     own `VIEW-LANE aggregate:` / `PAGE-LANE aggregate:` lines, so the
//     brace-matched scraper below reads the same two objects out of it
//     that it reads out of a vitest child, and the phase artifacts are
//     written by the SAME line in both modes (the direct child is not
//     given an --artifacts dir: two writers of one path is a way to
//     produce two different artifacts). The spec is NOT executed in direct
//     mode -- it is the parity oracle the direct protocol is proven
//     against (tools/oracle/dual-lane-direct-parity-gate.mjs compares the
//     two aggregates byte for byte) -- and a non-default --spec is
//     refused there rather than silently ignored.
//
// The full contracts (kill scoping, deadline weighting, pairing, staged-spec
// integrity, per-shard weight assumptions) are documented in
// docs/parity-method.md.
//
// PHASES
//   A phase = one child invocation grading a small group of shards
//   (default 2 shards per child, so each child stays inside its heap cap;
//   the full shard tree exceeds a single process's heap). The per-phase
//   deadline applies to each child invocation. Under --runner direct the
//   child is the direct grade runner rather than vitest; the phase is
//   still one child with the same shard list and the same deadline.
//
// EXIT CODES
//   0  all phases completed AND every --floors name met its floor
//   1  completed but floors missed, or a phase crashed / produced no
//      parseable aggregate, or coverage incomplete
//   2  a phase breached the hard deadline (stalled); last output printed
//   130  interrupted (Ctrl-C); own child tree killed first
//
// USAGE
//   Full pass, report-only, with floors:
//     node dual-lane-verifier-fast.mjs --repo <repo> \
//       --floors view=7843,page=2 --report-only
//   One shard (small-slice proof):
//     node dual-lane-verifier-fast.mjs --repo <repo> \
//       --files <shard-file>.jsonl --workers 1 \
//       --floors view=0,page=0 --report-only
//   Restart-safe: phases whose aggregate artifacts already parse are skipped.
//
// OPTIONS
//   --repo <dir>          target checkout root (default: cwd)
//   --floors a=N,b=M      named pass-count floors; exit 0 requires each
//   --report-only         set DUAL_LANE_REPORT_ONLY=1 in the child env
//   --workers <n>         concurrent vitest children (default 2)
//   --heap-mb <n>         per-child --max-old-space-size (default 1536;
//                         2 workers x 1536MB ~= the 3GB total cap)
//   --group <n>           shards per child invocation (default 2)
//   --files <a,b,...>     restrict to these shard file names (small slices)
//   --deadline-min <f>    FLOOR of the hard per-phase deadline in minutes
//                         (default 20; fractions allowed, e.g. 0.03 = ~2s).
//                         Effective deadline per phase =
//                         max(deadline-min, 1.5 x the phase's recorded
//                         duration weight) -- see
//                         docs/parity-method.md.
//                         Unknown shards contribute weight 0,
//                         i.e. fall back to this floor.
//   --flat-deadline       the deadline is --deadline-min alone, no weight
//                         scaling (what fast stall proofs need: a
//                         weight-aware deadline would override a tiny
//                         --deadline-min on any shard with a recorded
//                         weight).
//   --artifacts <dir>     per-phase aggregate artifact dir
//                         (default: <repo>/tmp/verifier-fast-artifacts)
//   --spec <path>         vitest spec path relative to --repo. Explicit paths
//                         are used verbatim; the DEFAULT
//                         path (tmp/raw-ground-truth/scripts/
//                         verify-dual-lane.test.ts) is treated as the staging
//                         target of the tracked canonical
//                         tools/oracle/verify-dual-lane.test.ts: missing ->
//                         staged, identical -> kept, differing -> REFUSED.
//   --quiet               do not live-forward child output lines (progress
//                       lines still stream)
//   --runner <name>       which child grades a phase:
//                         "vitest" (default, the measuring instrument as it
//                         has always run) or "direct" (the direct grade
//                         runner, tools/oracle/dual-lane-direct-runner.mjs).
//                         Same shard lists, same deadlines, same artifacts,
//                         same floors, same exit codes; the child's process
//                         shape is the only difference. The direct child is
//                         proven byte-identical to the vitest child by
//                         tools/oracle/dual-lane-direct-parity-gate.mjs.
//
// Child trees are killed ONLY by PIDs this runner recorded from its own
// spawn() calls. There are no idle timers anywhere in this file.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ---------- CLI ----------

function parseArgs(argv) {
  const opts = {
    repo: process.cwd(),
    floors: {},
    reportOnly: false,
    workers: 2,
    heapMb: 1536,
    group: 2,
    files: null,
    deadlineMin: 20,
    flatDeadline: false,
    artifacts: null,
    spec: "tmp/raw-ground-truth/scripts/verify-dual-lane.test.ts",
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
    else if (a === "--floors") {
      for (const pair of next().split(",")) {
        const m = /^([a-z]+)=(\d+)$/.exec(pair.trim());
        if (!m) fail(`bad --floors pair: ${pair} (expected lane=number)`);
        opts.floors[m[1]] = Number(m[2]);
      }
    } else if (a === "--report-only") opts.reportOnly = true;
    else if (a === "--workers") opts.workers = positiveInt(next(), "--workers");
    else if (a === "--heap-mb") opts.heapMb = positiveInt(next(), "--heap-mb");
    else if (a === "--group") opts.group = positiveInt(next(), "--group");
    else if (a === "--files")
      opts.files = next()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === "--deadline-min") {
      const v = Number(next());
      if (!Number.isFinite(v) || v <= 0) fail("--deadline-min must be a positive number");
      opts.deadlineMin = v;
    } else if (a === "--flat-deadline") opts.flatDeadline = true;
    else if (a === "--artifacts") opts.artifacts = path.resolve(next());
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

function positiveInt(v, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) fail(`${label} must be a positive integer`);
  return n;
}

function fail(msg) {
  console.error(`dual-lane-verifier-fast: ${msg}`);
  process.exit(1);
}

// Module state is assigned by prepareRunState(), called from main(), which runs
// ONLY when this file is the program (INVOKED_DIRECTLY guard at the bottom).
// Importing this module -- tests, tooling -- must stay side-effect free: no
// argv parsing, no filesystem access, no process exits. Same entry-guard
// convention as capture-and-grade.mjs.
let opts = null;
let REPO = null;
let EXPECTED_V2 = null;
let VIEW_LANE_DIR = null;
let PAGE_LANE_DIR = null;
let ARTIFACTS = null;
let LOG_FILE = null;
let shards = [];
let phases = [];
let shardWeights = null;

const SHARD_RE = /^recapture-raw-shard-\d{6}\.jsonl$/;

const DEFAULT_SPEC = "tmp/raw-ground-truth/scripts/verify-dual-lane.test.ts";
const CANONICAL_SPEC = "tools/oracle/verify-dual-lane.test.ts";

// ---------- runner selection (--runner vitest | --runner direct) ----------
//
// The two names for the child that grades a phase. `vitest` is the measuring
// instrument run under its own test framework, unchanged and the default.
// `direct` is the direct grade runner, which transcribes the same protocol
// into a plain node process so a worker child pays Node startup instead of a
// test-framework boot. The contract that makes them interchangeable here:
// both take the same DUAL_LANE_FILES env list, both print the spec's own
// `VIEW-LANE aggregate:` / `PAGE-LANE aggregate:` lines, and both exit with
// the instrument's codes.
const RUNNER_VITEST = "vitest";
const RUNNER_DIRECT = "direct";

// The direct runner, and the two files it needs beside it (the core module it
// imports, and the loader that supplies `.js`->`.ts` resolution plus the
// TypeScript transform). Resolved under --repo so a run grades the tree it
// was pointed at, not whichever tree happens to hold this file.
const DIRECT_RUNNER_REL = "tools/oracle/dual-lane-direct-runner.mjs";
const DIRECT_RUNNER_DEPS_REL = [
  "tools/oracle/dual-lane-direct-runner-core.ts",
  "tools/oracle/typescript-source-loader.mjs",
];

// ---------- recorded weights + balanced pairing ----------
//
// The weights: per-phase durations (seconds) recorded by the instrument's
// own DONE lines during a completed FULL grade of the default 48-shard set
// (sum 8258.2s = 137.6 worker-minutes). Phase i of
// the DEFAULT sorted pairing holds shards 2i and 2i+1.
const PHASE_WEIGHTS_S = [
  63.2, 59.6, 145.1, 245.9, 708.0, 1182.7, 643.4, 221.6, 221.9, 243.0, // P1-P10
  267.4, 194.1, 347.3, 209.6, 257.8, 300.7, 268.6, 193.8, 319.6, 372.4, // P11-P20
  431.5, 505.2, 509.2, 346.6, // P21-P24
];

const defaultShardName = (idx) => `recapture-raw-shard-${String(idx).padStart(6, "0")}.jsonl`;

/** Per-shard weight = its default pair's recorded duration split EVENLY.
 *  STATED ASSUMPTION, not a measurement: the profiler receipt could not split
 *  a phase's time across its two shards (profile §6 -- "whether P6's 1182.7s is
 *  one 1000s shard or two ~590s shards is unknown"). Under this assumption the
 *  sum of a default pair's two shard weights reconstructs the recorded phase
 *  duration exactly, so every default pairing weight is preserved. Shards
 *  outside the default 48 have no entry and weigh 0 (deadline falls back to the
 *  flat floor -- no measurement, no scaling). */
function buildShardWeights(phaseWeights) {
  const byName = new Map();
  for (let i = 0; i < phaseWeights.length * 2; i++) {
    byName.set(defaultShardName(i), phaseWeights[Math.floor(i / 2)] / 2);
  }
  return byName;
}

/** A phase's weight = the sum of its shards' recorded weights (unknown -> 0). */
function phaseWeightSec(shardNames, shardWeights) {
  return shardNames.reduce((sum, n) => sum + (shardWeights.get(n) ?? 0), 0);
}

const DEADLINE_WEIGHT_MULTIPLIER = 1.5;

/** Effective per-phase deadline in seconds: the flat --deadline-min is the
 *  FLOOR; a phase with recorded weight gets 1.5x its weight if that is larger
 *  (phase 6's 1182.7s -> 1774.05s instead of the 1200s it breached twice).
 *  --flat-deadline restores the exact flat behavior. */
function phaseDeadlineSec(shardNames, shardWeights, floorMin, { multiplier = DEADLINE_WEIGHT_MULTIPLIER, flat = false } = {}) {
  const floorSec = floorMin * 60;
  if (flat) return floorSec;
  return Math.max(floorSec, multiplier * phaseWeightSec(shardNames, shardWeights));
}

// Balanced re-pairing: the three heavyweight default pairs (P5-P7: shards 8-13,
// 2534.1s = 30.7% of all compute) each contribute their shards to a NEW pair
// with a light partner -- heaviest shard with lightest shard by rank under the
// even-split weights (10/11 = 591.35 -> shards 2/3 = 29.8; 8/9 = 354.0 -> shards
// 0/1 = 31.6; 12/13 = 321.7 -> shards 4/5 = 72.55; shards 6+7 stay together at
// their recorded 245.9s). Max phase weight drops 1182.7s -> 621.15s; top-3
// share 30.7% -> 21.2%. List order is the dispatch order: heaviest phases
// first (longest work starts at t=0; the tail is the old P22/P23 classes).
// Shard indices, exactly 24 pairs, every shard of 0..47 exactly once.
const BALANCED_PHASE_PLAN = [
  [10, 2], [11, 3], [13, 5], [12, 4], [9, 1], [8, 0], [6, 7],
  [14, 15], [16, 17], [18, 19], [20, 21], [22, 23], [24, 25], [26, 27],
  [28, 29], [30, 31], [32, 33], [34, 35], [36, 37], [38, 39], [40, 41],
  [42, 43], [44, 45], [46, 47],
];

/** The phase list. Full default 48-shard set at group 2 -> the balanced plan
 *  (its weights are the recorded ones, so only there is re-pairing honest).
 *  Anything else (--files subsets, other group sizes) -> the historical sorted
 *  consecutive grouping, unchanged. */
function buildPhases(shards, group) {
  const isFullDefaultSet =
    group === 2 &&
    shards.length === PHASE_WEIGHTS_S.length * 2 &&
    [...shards].sort().every((n, i) => n === defaultShardName(i));
  if (!isFullDefaultSet) {
    const phases = [];
    for (let i = 0; i < shards.length; i += group) phases.push(shards.slice(i, i + group));
    return phases;
  }
  return BALANCED_PHASE_PLAN.map((pair) => pair.map(defaultShardName));
}

/** Spec staging decision (pure, exported for tests): given the tmp copy's
 *  bytes (null = missing) and the canonical bytes, what should the driver do?
 *  - "stage": tmp copy missing -> copy the canonical in (fresh worktree).
 *  - "keep":  byte-identical -> nothing to do.
 *  - "drift": tmp copy differs from the tracked instrument -> REFUSE. The
 *    verifier spec is the measuring instrument; a silently divergent copy is
 *    how measurements go wrong (provenance convention: a differing
 *    pre-existing destination is a refusal, never a skip or an overwrite).
 *    Remediation is named in the refusal: adopt the canonical, or run an
 *    explicit --spec for lane experiments. */
function specStageDecision(tmpBytes, canonicalBytes) {
  if (tmpBytes === null) return "stage";
  return tmpBytes.equals(canonicalBytes) ? "keep" : "drift";
}

/** Stage the tracked canonical verifier spec into the (gitignored,
 *  per-worktree) tmp instrument tree -- ONLY for the default spec path;
 *  an explicit --spec is used verbatim, no staging, no refusal (that is the
 *  lane-experiment escape hatch). */
function stageCanonicalSpec() {
  if (opts.spec !== DEFAULT_SPEC) return;
  const tmpSpecPath = path.join(REPO, opts.spec);
  const canonicalPath = path.join(REPO, CANONICAL_SPEC);
  if (!existsSync(canonicalPath)) {
    log(`SPEC-STAGE: canonical ${CANONICAL_SPEC} not found -- leaving ${opts.spec} as-is`);
    return;
  }
  const canonical = readFileSync(canonicalPath);
  const tmp = existsSync(tmpSpecPath) ? readFileSync(tmpSpecPath) : null;
  const decision = specStageDecision(tmp, canonical);
  if (decision === "keep") return;
  if (decision === "stage") {
    mkdirSync(path.dirname(tmpSpecPath), { recursive: true });
    copyFileSync(canonicalPath, tmpSpecPath);
    log(`SPEC-STAGE: staged canonical ${CANONICAL_SPEC} -> ${opts.spec} (${canonical.length} bytes)`);
    return;
  }
  fail(
    `SPEC-DRIFT: ${opts.spec} differs from the tracked canonical ${CANONICAL_SPEC} -- ` +
      "refusing to grade through an instrument that is not the tracked one. " +
      `Adopt the canonical (copy ${CANONICAL_SPEC} over ${opts.spec}) or pass an explicit ` +
      "--spec for lane experiments.",
  );
}

function prepareRunState() {
  // Loud platform gate: every kill and snapshot below (taskkill, powershell
  // Get-CimInstance, tasklist) is Windows-only, and this runner is only driven
  // by capture-and-grade on win32. Refuse loudly rather than fail silently on
  // another host -- same convention as capture-and-grade.mjs's PLATFORM-OPS
  // guard. (Importing this module stays platform-independent: the gate lives
  // in the program path, not at module load.)
  if (process.platform !== "win32") {
    console.error(
      "PLATFORM-OPS: dual-lane-verifier-fast has no linux branch -- its kill " +
        "path shells out to taskkill /T /F and snapshots the process table via " +
        "powershell Get-CimInstance. Implement a linux branch (e.g. pkill + " +
        "/proc walk) in this file before running it there.",
    );
    process.exit(1);
  }
  opts = parseArgs(process.argv.slice(2));

  // ---------- shard discovery (same contract as verify-dual-lane.test.ts) ----------

  REPO = opts.repo;
  EXPECTED_V2 = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2");
  VIEW_LANE_DIR = path.join(EXPECTED_V2, "view-lane");
  PAGE_LANE_DIR = path.join(EXPECTED_V2, "page-lane");
  ARTIFACTS = opts.artifacts ?? path.join(REPO, "tmp", "verifier-fast-artifacts");
  LOG_FILE = path.join(ARTIFACTS, "verifier-fast.log");
  mkdirSync(ARTIFACTS, { recursive: true });

  // Instrument staging BEFORE the spec existence check: staging is what makes
  // the default spec exist in a fresh worktree.
  stageCanonicalSpec();
  if (!existsSync(path.join(REPO, opts.spec))) {
    fail(
      `verifier spec not found under --repo: ${path.join(REPO, opts.spec)} ` +
        `(and no canonical ${CANONICAL_SPEC} to stage)`,
    );
  }

  // The staging gate above runs in BOTH runner modes and is deliberately NOT
  // skipped for --runner direct. The direct child does not execute the spec,
  // but the spec is the instrument the direct protocol is a transcription OF,
  // so a staged copy that has drifted from the tracked canonical means the
  // parity claim is being made against a different instrument than the one in
  // the tree. Refusing there is the same loud refusal the vitest path makes.
  if (opts.runner === RUNNER_DIRECT) prepareDirectRunner();

  shards = discoverShards();
  if (shards.length === 0) fail(`no shard files found under ${EXPECTED_V2}`);

  shardWeights = buildShardWeights(PHASE_WEIGHTS_S);
  phases = buildPhases(shards, opts.group);
}

/** --runner direct preflight. Three things, all loud:
 *   1. --spec is not executed in direct mode, so naming a non-default one
 *      would be a silent no-op: the run would grade through the tracked core
 *      while the operator believed it graded through their spec. Refuse and
 *      name the flag that does what they meant.
 *   2. the runner and the two files it imports must exist under --repo.
 *   3. say on the log WHICH protocol is about to execute, so a run record
 *      never leaves the reader guessing which child graded it. */
function prepareDirectRunner() {
  if (opts.spec !== DEFAULT_SPEC) {
    fail(
      `--runner direct does not execute --spec: it grades through the tracked ` +
        `protocol in ${DIRECT_RUNNER_REL} (core ${DIRECT_RUNNER_DEPS_REL[0]}). ` +
        `--spec only names the vitest instrument, which in direct mode is the ` +
        `parity oracle rather than the thing being run, so a non-default value ` +
        `(${opts.spec}) would be silently ignored. Pass --runner vitest to grade ` +
        "through that spec.",
    );
  }
  for (const rel of [DIRECT_RUNNER_REL, ...DIRECT_RUNNER_DEPS_REL]) {
    if (!existsSync(path.join(REPO, rel))) {
      fail(`--runner direct: ${rel} not found under --repo ${REPO} (the direct grade runner cannot boot)`);
    }
  }
  log(
    `RUNNER-DIRECT: phases will be graded by ${DIRECT_RUNNER_REL} (core ` +
      `${DIRECT_RUNNER_DEPS_REL[0]}, transform ${DIRECT_RUNNER_DEPS_REL[1]}). ` +
      `The spec at ${opts.spec} is NOT executed in this mode -- it is the parity ` +
      "oracle the direct protocol is proven against " +
      "(tools/oracle/dual-lane-direct-parity-gate.mjs). Shard lists, deadlines, " +
      "kill scoping, artifacts, floors and exit codes are unchanged.",
  );
}

function discoverShards() {
  if (opts.files) {
    for (const name of opts.files) {
      const inView = existsSync(path.join(VIEW_LANE_DIR, name));
      const inPage = existsSync(path.join(PAGE_LANE_DIR, name));
      if (!inView && !inPage) fail(`shard not found in either lane: ${name}`);
    }
    return [...opts.files];
  }
  const names = new Set();
  for (const dir of [VIEW_LANE_DIR, PAGE_LANE_DIR]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (SHARD_RE.test(f)) names.add(f);
  }
  return [...names].sort();
}

// ---------- timestamped logging (timestamps are the streaming proof) ----------

function log(line) {
  const stamped = `${new Date().toISOString()} ${line}`;
  console.log(stamped);
  if (LOG_FILE) appendFileSync(LOG_FILE, stamped + "\n");
}

// ---------- per-phase aggregate artifacts + resume-skip ----------

/** Artifact name prefix bound to the phase's SHARD LIST (sha8 of the sorted
 *  names), not just its index. The balanced re-pairing changed which shards a
 *  phase index holds, and a per-index name would let a re-paired schedule
 *  resume-skip against a PREVIOUS schedule's artifacts (wrong shards marked
 *  done, totals silently wrong). With the shard list in the name, old
 *  artifacts are simply never matched: the affected phases re-render.
 *  Same-generation resumes are unaffected (same shards -> same name). */
function phaseArtifactPrefix(idx, group) {
  const h = createHash("sha256").update([...group].sort().join("\n")).digest("hex").slice(0, 8);
  return `phase-${String(idx).padStart(3, "0")}-${h}`;
}

const phaseArtifacts = (idx) => {
  const prefix = phaseArtifactPrefix(idx, phases[idx]);
  return {
    view: path.join(ARTIFACTS, `${prefix}-view.json`),
    page: path.join(ARTIFACTS, `${prefix}-page.json`),
  };
};

function phaseDone(idx) {
  const f = phaseArtifacts(idx);
  for (const p of [f.view, f.page]) {
    if (!existsSync(p)) return false;
    try {
      const parsed = JSON.parse(readFileSync(p, "utf8"));
      if (typeof parsed.entries !== "number") return false;
    } catch {
      return false;
    }
  }
  return true;
}

// ---------- brace-matched aggregate extraction (earlier scanner, proven) ----------

function extractAfter(label, text, from) {
  const i = text.indexOf(label, from);
  if (i === -1) return null;
  const start = text.indexOf("{", i);
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < text.length; j++) {
    const c = text[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return { obj: JSON.parse(text.slice(start, j + 1)), next: j + 1 };
    }
  }
  return null;
}

function extractAggregates(text) {
  const out = {};
  for (const [lane, label] of [
    ["view", "VIEW-LANE aggregate:"],
    ["page", "PAGE-LANE aggregate:"],
  ]) {
    const m = extractAfter(label, text, 0);
    if (m) out[lane] = m.obj;
  }
  return out;
}

// ---------- worker pool: event-driven, no idle timers ----------

const liveChildren = new Map(); // pid -> { label }
let interrupted = false;

/** One synchronous process-table snapshot; recursive parent->child walk from
 *  the given root PIDs. Returns null if the snapshot itself failed (caller
 *  must report that honestly). Used at kill time only — this is not a poll
 *  loop, nothing here repeats on a timer. */
function listDescendants(rootPids) {
  const snap = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      // The separator MUST be a real TAB: the previous format string
      // '{0}`t{1}' was a SINGLE-quoted PowerShell string, so the backtick-t
      // escape was NOT expanded -- every row carried a literal `t pair, the
      // TAB regex below matched nothing, parentOf stayed empty, and this
      // walk returned [] its whole life ("KILL-SWEEP-CLEAN" was logged
      // unconditionally; the real killing was taskkill /T alone).
      // [char]9 is a real TAB.
      "Get-CimInstance Win32_Process | ForEach-Object { '{0}{2}{1}' -f $_.ProcessId, $_.ParentProcessId, [char]9 }",
    ],
    { encoding: "utf8", timeout: 30_000, windowsHide: true },
  );
  if (snap.status !== 0 || typeof snap.stdout !== "string") {
    log(`KILL-SNAPSHOT-FAILED status=${snap.status} err=${String(snap.stderr).slice(0, 200)}`);
    return null;
  }
  const parentOf = new Map(); // pid -> parentPid
  for (const line of snap.stdout.split(/\r?\n/)) {
    const m = /^(\d+)\t(\d+)\s*$/.exec(line);
    if (m) parentOf.set(Number(m[1]), Number(m[2]));
  }
  const found = new Set();
  const walk = (pid) => {
    for (const [p, parent] of parentOf) {
      if (parent === pid && !found.has(p)) {
        found.add(p);
        walk(p);
      }
    }
  };
  for (const root of rootPids) walk(root);
  return [...found];
}

/** The child's spawn shape for a phase, as data (pure, exported for tests).
 *  vitest: the historical `npx vitest run <spec>` through the shell, byte for
 *  byte the command line this runner has always spawned. direct: the direct
 *  grade runner under this very node binary, with no shell -- the runner
 *  takes its shard list from the same DUAL_LANE_FILES env the vitest child
 *  took it from, so both children see one list by one mechanism, and it is
 *  deliberately NOT also passed as --files (the runner only fills the env
 *  when the caller left it unset, and a second channel for one value is a
 *  second thing that can disagree).
 *
 *  No --artifacts here: the phase artifacts are written by the single
 *  writeFileSync in the close handler below, from the aggregate this driver's
 *  own scraper reads out of the child's stdout. Letting the direct child
 *  write the same paths would give one artifact two writers whose bytes
 *  nobody compares. */
function phaseCommand(idx, group, { runner, spec, repo }) {
  const files = group.join(",");
  if (runner === RUNNER_DIRECT) {
    const label = phaseArtifactPrefix(idx, group);
    return {
      shell: false,
      file: process.execPath,
      args: [path.join(repo, DIRECT_RUNNER_REL), "--repo", repo, "--label", label],
      describe: `${DIRECT_RUNNER_REL} --label ${label}, DUAL_LANE_FILES=${files}`,
    };
  }
  return {
    shell: true,
    file: "npx vitest run " + spec,
    args: [],
    describe: `npx vitest run ${spec}, DUAL_LANE_FILES=${files}`,
  };
}

function killOwnTree(reason) {
  const entries = [...liveChildren.entries()];
  if (entries.length === 0) return;
  const roots = entries.map(([pid]) => pid);
  // snapshot BEFORE killing: the stall-proof run showed taskkill /T on the
  // shell PID can miss a grandchild chain that is still spawning (the tree
  // walk below records it while every link is still parented)
  const descendants = listDescendants(roots);
  for (const [pid, meta] of entries) {
    log(`KILL pid=${pid} (${meta.label}) reason=${reason} (taskkill /T /F, own child)`);
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", timeout: 30_000, windowsHide: true });
  }
  if (descendants === null) {
    log("KILL-SWEEP-SKIPPED (snapshot unavailable) — if the machine shows leftover vitest processes, they belong to this runner's killed tree");
  } else if (descendants.length > 0) {
    for (const d of descendants) {
      const r = spawnSync("taskkill", ["/PID", String(d), "/T", "/F"], { stdio: "ignore", timeout: 30_000, windowsHide: true });
      log(`KILL-DESCENDANT pid=${d} (survived the tree kill; taskkill status=${r.status})`);
    }
    const after = listDescendants(roots);
    const residue = after === null ? [] : descendants.filter((d) => after.includes(d));
    if (residue.length > 0) log(`KILL-RESIDUE pids=${residue.join(",")} still resolvable after sweep — REPORTED, not hidden`);
    else log("KILL-SWEEP-CLEAN (no descendants remain)");
  } else {
    log("KILL-SWEEP-CLEAN (tree kill left no descendants)");
  }
  liveChildren.clear();
}

function taskkillPid(pid) {
  return spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", timeout: 30_000, windowsHide: true });
}

/** Registry write for a phase's own recorded shell PID. Kept as a named export
 *  so the kill-path tests exercise the exact production registration path. */
function recordLiveChild(pid, label) {
  liveChildren.set(pid, { label });
}

/** SCOPED kill -- the ONLY kill a per-phase deadline handler may use.
 *  Terminates the process tree rooted at rootPid (one phase's own recorded
 *  shell PID) and nothing else: the descendant set comes from a single
 *  process-table snapshot walked strictly DOWNWARD from rootPid, and no other
 *  registry entry, sibling, or later phase is ever enumerated here. A sibling
 *  phase's shell is a child of this runner, never a descendant of another
 *  phase's shell, so it is unreachable by construction. Returns the PIDs the
 *  kill targeted (root first) plus the residue check, so callers and tests can
 *  assert the scope. */
function killPhaseTree(rootPid, label, reason) {
  if (!Number.isInteger(rootPid) || rootPid <= 0) {
    log(`KILL-SKIP (no recorded pid to kill) label=${label} reason=${reason}`);
    return { root: rootPid, killed: [], residue: [], snapshotFailed: false };
  }
  // snapshot BEFORE killing, rooted at this one phase's PID alone (the
  // pre-kill snapshot exists because a grandchild chain still spawning must be
  // recorded while every link is still parented -- same per-phase need the
  // global kill documented)
  const descendants = listDescendants([rootPid]);
  const targets = descendants === null ? [] : descendants;
  log(`KILL pid=${rootPid} (${label}) reason=${reason} (taskkill /T /F, own child, SCOPED to this phase's tree)`);
  taskkillPid(rootPid);
  for (const d of targets) {
    const r = taskkillPid(d);
    log(`KILL-DESCENDANT pid=${d} (of phase root ${rootPid}; taskkill status=${r.status})`);
  }
  let residue = [];
  if (descendants === null) {
    log("KILL-SWEEP-SKIPPED (snapshot unavailable) — if the machine shows leftover vitest processes, they belong to this phase's killed tree");
  } else {
    const after = listDescendants([rootPid]);
    residue = after === null ? [] : targets.filter((d) => after.includes(d));
    if (residue.length > 0) log(`KILL-RESIDUE pids=${residue.join(",")} still resolvable after sweep — REPORTED, not hidden`);
    else log(`KILL-SWEEP-CLEAN (phase root ${rootPid} left no descendants)`);
  }
  return { root: rootPid, killed: [rootPid, ...targets], residue, snapshotFailed: descendants === null };
}

function onInterrupt(sig) {
  if (interrupted) return;
  interrupted = true;
  log(`INTERRUPT sig=${sig} — killing own child tree, then exiting 130`);
  killOwnTree(sig);
  process.exit(130);
}
process.on("SIGINT", () => onInterrupt("SIGINT"));
process.on("SIGTERM", () => onInterrupt("SIGTERM"));

function spawnPhase(idx) {
  return new Promise((resolve) => {
    const group = phases[idx];
    const files = group.join(",");
    const label = `phase ${idx + 1}/${phases.length} [${group[0]}${group.length > 1 ? ` .. ${group[group.length - 1]}` : ""}]`;
    const env = {
      ...process.env,
      DUAL_LANE_FILES: files,
      NODE_OPTIONS: `--max-old-space-size=${opts.heapMb}`,
    };
    delete env.DUAL_LANE_REPORT_ONLY;
    if (opts.reportOnly) env.DUAL_LANE_REPORT_ONLY = "1";
    if (opts.runner === RUNNER_DIRECT && env.DUAL_LANE_TSC_CACHE_DIR === undefined) {
      // The direct child's transform cache (tools/oracle/
      // typescript-source-loader.mjs). Keyed by source CONTENT hash, so it is
      // a pure speed path: a warm entry is the same emitted JavaScript a cold
      // boot would have produced. Pointed inside --repo so concurrent workers
      // on one run share it instead of each re-transforming the graph. An
      // inherited value from the caller always wins.
      env.DUAL_LANE_TSC_CACHE_DIR = path.join(REPO, "tmp", "direct-runner-build", "tscache");
    }

    const t0 = Date.now();
    // Weight-aware deadline: max(--deadline-min, 1.5 x the phase's recorded
    // weight); --flat-deadline = the old flat behavior. Both the weight and
    // the effective deadline go on the START line so every run records which
    // rule set its deadline.
    const weightS = phaseWeightSec(group, shardWeights);
    const deadlineSec = phaseDeadlineSec(group, shardWeights, opts.deadlineMin, {
      flat: opts.flatDeadline,
    });
    // The child swap, and the ONLY thing --runner changes. Both children read
    // the same DUAL_LANE_FILES list from the same env, print the same
    // aggregate labels, and exit with the instrument's codes; everything
    // downstream of the spawn (the deadline timer, the scoped kill rooted at
    // this child's recorded pid, the brace-matched aggregate extraction, the
    // artifact write, the floors) is the same code in both branches.
    //
    // `phaseCommand` is exported (pure) so a test can assert the two shapes
    // without spawning anything.
    const cmd = phaseCommand(idx, group, { runner: opts.runner, spec: opts.spec, repo: REPO });
    const child = cmd.shell
      ? spawn(cmd.file, { cwd: REPO, env, shell: true, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] })
      : spawn(cmd.file, cmd.args, { cwd: REPO, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const pid = child.pid;
    log(
      `PHASE ${idx + 1}/${phases.length} START shards=${files} pid=${pid} ` +
        `deadline_min=${(deadlineSec / 60).toFixed(2)} ` +
        `(floor=${opts.deadlineMin}${opts.flatDeadline ? " flat" : ` weight_s=${weightS.toFixed(1)} x${DEADLINE_WEIGHT_MULTIPLIER}`}) ` +
        `heap_mb=${opts.heapMb} runner=${opts.runner} (${cmd.describe})`,
    );
    const tail = [];
    let output = "";
    let stalled = false;

    const timer = setTimeout(() => {
      stalled = true;
      log(`DEADLINE breached: ${label} exceeded ${(deadlineSec / 60).toFixed(2)} min — killing ONLY this phase's child tree (pid ${pid})`);
      // SCOPED kill: this phase's recorded pid subtree and nothing else. The
      // earlier global sweep that ran here killed every live sibling with it
      // — sibling phases mid-render died under this phase's deadline reason,
      // their completed shard work lost and their aggregates labeled
      // AGGREGATE-MISSING. The scoping below is what rules that out.
      killPhaseTree(pid, label, `deadline:${label}`);
      liveChildren.delete(pid);
      const last = tail.length ? tail.join("\n") : "(no child output captured)";
      log(`STALLED at ${label} — last output:\n${last}`);
      resolve({ status: "stalled", label });
    }, deadlineSec * 1000);

    const collect = (chunk) => {
      const text = chunk.toString();
      output += text;
      appendFileSync(LOG_FILE, text.endsWith("\n") ? text : text + "\n");
      const lines = text.split("\n");
      // forward child output live so long phases are never silent
      for (const line of lines) {
        if (line.trim() === "") continue;
        if (!opts.quiet) process.stdout.write(`[${label}] ${line}\n`);
      }
      const all = output.split("\n").filter((l) => l.trim() !== "");
      tail.length = 0;
      tail.push(...all.slice(-40));
    };
    child.stdout.on("data", (c) => collect(c));
    child.stderr.on("data", (c) => collect(c));

    recordLiveChild(pid, label);
    child.on("close", (code) => {
      clearTimeout(timer);
      liveChildren.delete(pid);
      if (stalled || interrupted) return; // stall/interrupt path already resolved
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const aggs = extractAggregates(output);
      const art = phaseArtifacts(idx);
      let aggregateOk = true;
      for (const lane of ["view", "page"]) {
        if (aggs[lane]) writeFileSync(art[lane], JSON.stringify(aggs[lane], null, 2));
        else aggregateOk = false;
      }
      const v = aggs.view;
      const p = aggs.page;
      log(
        `PHASE ${idx + 1}/${phases.length} DONE exit=${code} ${secs}s ` +
          `view=${v ? `${v.pass.total}/${v.entries}` : "AGGREGATE-MISSING"} ` +
          `page=${p ? `${p.pass.total}/${p.entries}` : "AGGREGATE-MISSING"}`,
      );
      if (code !== 0) log(`PHASE ${idx + 1}/${phases.length} CHILD-FAILURE exit=${code} (see ${LOG_FILE})`);
      if (!aggregateOk) log(`PHASE ${idx + 1}/${phases.length} AGGREGATE-EXTRACTION-FAILED (labels not found in child output)`);
      resolve({
        status: code === 0 && aggregateOk ? "ok" : "failed",
        exit: code,
        label,
        aggregates: aggs,
      });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      liveChildren.delete(pid);
      log(`PHASE ${idx + 1}/${phases.length} SPAWN-ERROR ${e.message}`);
      resolve({ status: "failed", label, spawnError: e.message });
    });
  });
}

async function run() {
  log(
    `VERIFIER-FAST repo=${REPO} shards=${shards.length} phases=${phases.length} workers=${opts.workers} ` +
      `group=${opts.group} heap_mb=${opts.heapMb} report_only=${opts.reportOnly} ` +
      `runner=${opts.runner} ` +
      `deadline=floor_${opts.deadlineMin}min${opts.flatDeadline ? "_flat" : "_x_weight"} ` +
      `floors=${JSON.stringify(opts.floors)} artifacts=${ARTIFACTS}`,
  );
  const results = new Array(phases.length).fill(null);
  let nextPhase = 0;
  let stalled = false;

  const worker = async () => {
    while (!stalled && !interrupted) {
      const idx = nextPhase;
      if (idx >= phases.length) return;
      nextPhase += 1;
      if (phaseDone(idx)) {
        log(`PHASE ${idx + 1}/${phases.length} SKIP (artifacts already complete: ${phaseArtifacts(idx).view})`);
        results[idx] = { status: "skipped", label: `phase ${idx + 1}/${phases.length}` };
        continue;
      }
      const r = await spawnPhase(idx);
      results[idx] = r;
      if (r.status === "stalled") stalled = true;
    }
  };

  // capped parallelism: at most opts.workers vitest children at once; each
  // dispatch happens the moment a worker frees — no pacing, no idle timers
  await Promise.all(Array.from({ length: Math.min(opts.workers, phases.length) }, worker));

  if (stalled || interrupted) {
    // Every in-flight phase has settled here (Promise.all above), so anything
    // still registered is an own child whose kill/exit is already in flight;
    // reap it so the stalled exit never leaks a process. This is whole-runner
    // shutdown, where the global kill is the correct scope.
    if (liveChildren.size > 0) killOwnTree("stalled-exit:residual-own-children");
    log(`RESULT: STALLED (exit 2)`);
    process.exit(2);
  }

  // ---------- aggregate + floors (reads ALL phase artifacts, resume-safe) ----------
  const totals = {
    view: { pass: 0, fail: 0, entries: 0 },
    page: { pass: 0, fail: 0, entries: 0 },
  };
  let incomplete = 0;
  let failures = 0;
  for (let idx = 0; idx < phases.length; idx++) {
    const r = results[idx];
    if (r && r.status === "failed") failures += 1;
    const art = phaseArtifacts(idx);
    for (const lane of ["view", "page"]) {
      try {
        const a = JSON.parse(readFileSync(art[lane], "utf8"));
        totals[lane].pass += a.pass.total;
        totals[lane].fail += a.fail.total;
        totals[lane].entries += a.entries;
      } catch {
        incomplete += 1;
      }
    }
  }

  const pct = (l) => (100 * totals[l].pass) / Math.max(1, totals[l].entries);
  log(`TOTALS view: ${totals.view.pass}/${totals.view.entries} (${pct("view").toFixed(1)}%), ${totals.view.fail} failing`);
  log(`TOTALS page: ${totals.page.pass}/${totals.page.entries} (${pct("page").toFixed(1)}%), ${totals.page.fail} failing`);

  let floorsOk = true;
  const floorNotes = [];
  for (const [lane, floor] of Object.entries(opts.floors)) {
    const actual = totals[lane] ? totals[lane].pass : 0;
    const ok = actual >= floor;
    if (!ok) floorsOk = false;
    floorNotes.push(`${lane}: ${actual} ${ok ? ">=" : "<"} floor ${floor}`);
  }
  if (floorNotes.length) log(`FLOORS ${floorNotes.join("; ")}`);

  const union = {
    note: "verifier-fast union of per-phase lane aggregates (dual-lane-verifier-fast.mjs)",
    phases: phases.length,
    reportOnly: opts.reportOnly,
    viewLane: totals.view,
    pageLane: totals.page,
  };
  writeFileSync(path.join(ARTIFACTS, "verifier-fast-union-aggregate.json"), JSON.stringify(union, null, 2) + "\n");
  log(`aggregate written: ${path.join(ARTIFACTS, "verifier-fast-union-aggregate.json")}`);

  if (failures > 0) {
    log(`RESULT: FAIL — ${failures} phase(s) crashed or produced no aggregate (exit 1)`);
    process.exit(1);
  }
  if (incomplete > 0) {
    log(`RESULT: FAIL — ${incomplete} lane aggregate artifact(s) missing/unparseable; coverage incomplete (exit 1)`);
    process.exit(1);
  }
  if (!floorsOk) {
    log(`RESULT: FAIL — floors missed (exit 1)`);
    process.exit(1);
  }
  log(`RESULT: PASS (exit 0)`);
  process.exit(0);
}

function main() {
  prepareRunState();
  run().catch((e) => {
    log(`RUNNER-ERROR ${e.stack ?? e.message}`);
    killOwnTree("runner-error");
    process.exit(1);
  });
}

// Entry guard: running as a program executes main(); importing this module
// (tests, tooling) must stay side-effect free. Same convention as
// capture-and-grade.mjs.
const INVOKED_DIRECTLY = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (INVOKED_DIRECTLY) {
  main();
}

export {
  listDescendants,
  killOwnTree,
  killPhaseTree,
  recordLiveChild,
  PHASE_WEIGHTS_S,
  BALANCED_PHASE_PLAN,
  DEADLINE_WEIGHT_MULTIPLIER,
  defaultShardName,
  buildShardWeights,
  phaseWeightSec,
  phaseDeadlineSec,
  buildPhases,
  specStageDecision,
  phaseArtifactPrefix,
  phaseCommand,
  RUNNER_VITEST,
  RUNNER_DIRECT,
  DIRECT_RUNNER_REL,
};
