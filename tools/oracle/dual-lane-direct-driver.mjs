// dual-lane-direct-driver.mjs -- direct grade runner driver.
//
// WHAT THIS IS
//   The scheduling half of the direct runner. It hands each of W workers a
//   WEIGHTED shard queue, spawns one
//   tools/oracle/dual-lane-direct-runner.mjs child per worker, and unions the
//   per-lane artifacts the children write. One child per worker means one
//   engine boot (open corpus, re-seed, lexicon warm) per worker instead of one
//   per phase.
//
// THE PROBLEM IT IS BUILT AGAINST
//   A completed earlier pass grade records 8,258.2 s of render compute over
//   16,862 entries -- 137.6 worker-minutes -- turned into 4,146.9 s of wall
//   clock (69.1 min) at 99.6% worker utilisation, i.e. wall = compute / 2
//   exactly. The schedule was never the problem; the worker count was. The
//   same analysis names two costs that per-worker booting removes:
//     - 24 x (boot + full-corpus re-seed + per-id lexicon warm) = <= 8.4
//       worker-min, plus 24 x a first-render lazy init of 19.8-30.7 s.
//     - a heavy tail: the five heaviest phase pairs hold 43% of all compute,
//       and at 2 workers the last four phases alone stretch the tail.
//
//   This driver's job is to convert an uneven 48-shard set into W queues of
//   approximately equal render-seconds, and to let a worker that finishes
//   early pick up the next shard instead of idling.
//
// WEIGHTING -- WHAT THE NUMBERS ARE, HONESTLY
//   Queues are balanced on MEASURED entry counts: the number of replay entries
//   each shard contributes, counted out of the staged expected-v2 tree with the
//   runner's own counting rules (dual-lane-shard-entry-weights.mjs; ~1.3 s for
//   the whole 48-shard canvas, cached against the capture manifest's per-shard
//   content hashes). LPT is scale-invariant, so entries balance exactly as
//   entries x any positive constant would.
//
//   This replaced PASS19_PHASE_WEIGHTS_S, which was a STATED ASSUMPTION rather
//   than a measurement: the recorded per-phase DONE durations split evenly
//   across each phase's two shards, because the profiler could not split them
//   (the same note lives at
//   tools/dual-lane-verifier-fast.mjs:216-223). The W=8 probe measured what
//   that assumption cost -- Pearson r = -0.21 between those weights and actual
//   per-shard entry counts across all 48 shards, i.e. the weight signal was
//   weakly ANTI-correlated with the work, so LPT was balancing on a signal that
//   pointed the wrong way (predicted queue spread 1.8%, actual worker spread
//   60.8%). The recorded weights are kept, and are still used, as the
//   PER-SHARD fallback for any shard the counter cannot produce a count for:
//   no measurement for one shard falls back for that shard alone, not for the
//   run.
//
//   Entry count is a measure of how much work a queue is HANDED, not a
//   prediction of how long it will run. Against the probe's 8 measured workers
//   it is the best proxy available BEFORE a run (r = 0.290, r^2 = 0.084) but
//   still a weak one, and weaker than it looks because that run shared a
//   machine under memory pressure.
//
// SECOND-ORDER SIGNAL: FAILURE COST (--failure-artifacts)
//   A prior run's per-shard failure counts, when they exist, are folded in as a
//   multiplicative factor: weight = entries x (1 + beta x failRate). Failures
//   are the strongest candidate in this repo -- on the SAME eight workers,
//   r(failures, render seconds) = 0.604, r^2 = 0.364 against entries' 0.084 --
//   and the mechanism is named: a failing entry builds a replay excerpt and
//   diffs it (dual-lane-direct-runner-core.ts:257), a passing one does not.
//
//   The signal is OPT-IN, deliberately. It is knowable only after a run, it is
//   exact only where a prior run recorded per-shard attribution, and its
//   coverage in any single run is partial: at best one run grades the whole
//   canvas, so the map is as stale as the last run and no fresher. A run that
//   silently reweighted itself from a 6-shard sample would be scheduling on a
//   measurement it cannot vouch for. Without --failure-artifacts the weights
//   are the entry weights, bit for bit.
//
//   beta defaults to the fit from those eight workers (8.5 entry-equivalents
//   per failing entry; leave-one-out 5.5-10.4 in seven of eight folds).
//   --failure-cost-beta 0 reads the artifacts and applies nothing, which is the
//   A/B switch for measuring the factor's effect on a real run.
//
// EXIT CODES
//   0  every worker exited 0 and both lane unions were assembled
//   1  a worker failed / a lane artifact is missing or unparseable
//   2  bad arguments, or the artifacts-reuse guard refused the run
//      (ARTIFACTS-REFUSE: the directory already holds a prior run's
//      per-worker artifacts and --overwrite-artifacts was not passed)
//
// USAGE
//   node tools/oracle/dual-lane-direct-driver.mjs --repo <repo> --workers 8 \
//        [--files a.jsonl,b.jsonl] [--report-only] [--deadline-min <f>] \
//        [--artifacts <dir>] [--heap-mb 1536] [--plan] \
//        [--failure-artifacts <dir> [--failure-cost-beta <f>]] \
//        [--overwrite-artifacts]
//
//   node tools/oracle/dual-lane-direct-driver.mjs --artifacts <dir> \
//        --worst-shards 10 [--worst-signatures]
//
//   The second form is the REPORT mode: it spawns nothing and grades nothing.
//   It reads the per-worker artifacts a previous run already wrote and ranks
//   shards by their recorded failures, which is the question the aggregate
//   cannot answer -- `signatureCounts` is keyed by classification and
//   `coverage` by counts, and a failure id carries no shard. Exits 0 whether
//   or not shards fail; a failing shard is the report's content, not its error.
//
//   NOT the production grade path. tools/dual-lane-verifier-fast.mjs remains
//   that; this driver and the runner are additive and change nothing it does.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PASS19_PHASE_WEIGHTS_S,
  defaultShardName,
  buildShardWeights,
} from "../dual-lane-verifier-fast.mjs";
import {
  measureShardEntryCounts,
  readShardFailureCounts,
  applyFailureCost,
  DEFAULT_FAILURE_COST_BETA,
  DEFAULT_MAX_FAILURE_FACTOR,
} from "./dual-lane-shard-entry-weights.mjs";

const SHARD_RE = /^recapture-raw-shard-\d{6}\.jsonl$/;
const HERE = path.dirname(fileURLToPath(import.meta.url));

function fail(msg, code = 2) {
  console.error(`dual-lane-direct-driver: ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = {
    repo: process.cwd(),
    workers: 8,
    files: null,
    reportOnly: false,
    deadlineMin: 0,
    artifacts: null,
    heapMb: 1536,
    plan: false,
    worstShards: null,
    worstSignatures: false,
    failureArtifacts: [],
    failureCostBeta: DEFAULT_FAILURE_COST_BETA,
    failureCostMaxFactor: DEFAULT_MAX_FAILURE_FACTOR,
    overwriteArtifacts: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) fail(`missing value for ${a}`);
      return argv[i];
    };
    if (a === "--repo") opts.repo = path.resolve(next());
    else if (a === "--workers") {
      const n = Number(next());
      if (!Number.isInteger(n) || n <= 0) fail("--workers must be a positive integer");
      opts.workers = n;
    } else if (a === "--files")
      opts.files = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--report-only") opts.reportOnly = true;
    else if (a === "--deadline-min") opts.deadlineMin = Number(next());
    else if (a === "--artifacts") opts.artifacts = path.resolve(next());
    else if (a === "--heap-mb") opts.heapMb = Number(next());
    else if (a === "--plan") opts.plan = true;
    else if (a === "--failure-artifacts") opts.failureArtifacts.push(path.resolve(next()));
    else if (a === "--overwrite-artifacts") opts.overwriteArtifacts = true;
    else if (a === "--failure-cost-beta") {
      const n = Number(next());
      if (!Number.isFinite(n) || n < 0) fail("--failure-cost-beta must be a non-negative number");
      opts.failureCostBeta = n;
    } else if (a === "--worst-shards") {
      const n = Number(next());
      if (!Number.isInteger(n) || n <= 0) fail("--worst-shards must be a positive integer");
      opts.worstShards = n;
    } else if (a === "--worst-signatures") opts.worstSignatures = true;
    else fail(`unknown argument: ${a}`);
  }
  return opts;
}

// Module state, assigned at the top of main(): the driver is both a program
// and an imported module (the artifacts-reuse-guard tests import it), so
// nothing may parse argv at import time. Same convention as
// dual-lane-verifier-fast.mjs (INVOKED_DIRECTLY at the bottom).
let opts = null;
let REPO = null;
let EXPECTED_V2 = null;
let ARTIFACTS = null;

/** The shard set: the explicit --files list, else the union of both lanes'
 *  discovered shard files (the same default the spec and the old driver use). */
function resolveShards() {
  if (opts.files !== null) return [...opts.files];
  const names = new Set();
  for (const lane of ["view-lane", "page-lane"]) {
    const dir = path.join(EXPECTED_V2, lane);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (SHARD_RE.test(f)) names.add(f);
  }
  return [...names].sort();
}

/** Longest-processing-time-first: shards descending by weight, each to the
 *  currently lightest queue. Unequal shard costs are the whole reason this
 *  driver exists -- over the 48-shard canvas the heaviest shard carries 1161
 *  entries and the lightest 93, a 12.5x spread, so a naive round-robin hands
 *  one worker 12x what another one gets and leaves the heavy worker running
 *  long after the light one is done. Weight units are whatever the caller's
 *  signal is; only the ordering and the running totals matter here. */
export function buildWeightedQueues(shards, weights, workerCount) {
  const queues = Array.from({ length: workerCount }, () => ({ shards: [], seconds: 0 }));
  const sorted = [...shards].sort(
    (a, b) => (weights.get(b) ?? 0) - (weights.get(a) ?? 0) || a.localeCompare(b),
  );
  for (const name of sorted) {
    let lightest = queues[0];
    for (const q of queues) if (q.seconds < lightest.seconds) lightest = q;
    lightest.shards.push(name);
    lightest.seconds += weights.get(name) ?? 0;
  }
  return queues.map((q) => ({ shards: q.shards, seconds: q.seconds }));
}

/** (max - min) / mean over the queue weights: the imbalance the assignment
 *  actually produced, on whatever signal it balanced. This is the number a
 *  --plan run prints, and it is what an LPT assignment is supposed to drive
 *  down. */
function spreadPct(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 0) return 0;
  return (100 * (Math.max(...values) - Math.min(...values))) / mean;
}

/**
 * Bounded refinement on top of LPT: multi-start local search over single-shard
 * MOVEs and two-shard SWAPs, keeping the best assignment found.
 *
 * LPT alone is a 4/3-approximation and on a 48-shard canvas that is not
 * enough to balance it. Measured on the real entry counts (TOTAL 16862, ideal
 * 2107.8/queue):
 *
 *     plain LPT                        8.54%  (max 2214, min 2034)
 *     LPT + descent from the LPT start 7.02%  (max 2182, min 2034)
 *     10 deterministic restarts        0.095% (max 2109, min 2107)
 *
 * The middle row is the instructive one: descending from LPT is stuck. LPT's
 * own answer is a local optimum that no single move or swap improves, so
 * descent alone costs 1.5 percentage points for nothing. Re-starting from a
 * different assignment escapes it. Restarts beyond ~10 were measured to buy
 * nothing (0.095% at 10, at 40, at 100, at 400), so REFINE_RESTARTS is set
 * where the curve flattens, not to a round number.
 *
 * BEST-improvement within each descent (each pass applies the single best move
 * or swap found), because first-improvement was measured reaching 7.02% on
 * this canvas -- committing to the earliest improving move lands in the same
 * bad local optimum.
 *
 * Queue loads are ALWAYS recomputed from shard membership, never carried
 * alongside it. Carrying them separately is how a refinement pass ends up
 * reporting a spread for an assignment it did not actually produce.
 *
 * Deterministic: a fixed-seed LCG drives an explicit Fisher-Yates shuffle, so
 * the same shards always yield the same queues. Capped at MAX_DESCENT_PASSES
 * per start. Cost is ~0.4 s for the full 48-shard canvas, against a ~1500 s
 * run; it is not a search worth tuning.
 */
const MAX_DESCENT_PASSES = 500;
const REFINE_RESTARTS = 10;
const REFINE_SEED = 12345;

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export function refineWeightedQueues(queues, weights, options = {}) {
  const restarts = options.restarts ?? REFINE_RESTARTS;
  const seed = options.seed ?? REFINE_SEED;
  const K = queues.length;
  const shardNames = queues.flatMap((q) => q.shards);
  const w = (name) => weights.get(name) ?? 0;
  if (K < 2 || shardNames.length < 2) {
    return {
      queues: queues.map((q) => ({ shards: q.shards, seconds: q.seconds })),
      restartsTried: 0,
      spreadPct: spreadPct(queues.map((q) => q.seconds)),
    };
  }

  const binsToQueues = (bins) =>
    bins.map((shards) => ({
      shards: [...shards],
      seconds: shards.reduce((s, n) => s + w(n), 0),
    }));
  const score = (bins) => spreadPct(loadsOf(bins));

  const loadsOf = (bins) => bins.map((b) => b.reduce((s, n) => s + w(n), 0));

  /** Best-improvement descent to a local optimum. Returns null-safe bins. */
  const descend = (start) => {
    let cur = start.map((b) => [...b]);
    let best = score(cur);
    for (let pass = 0; pass < MAX_DESCENT_PASSES; pass++) {
      let winner = null;
      let winnerAfter = best;
      for (let i = 0; i < K; i++) {
        for (let j = 0; j < K; j++) {
          if (i === j) continue;
          for (const n of cur[i]) {
            const cand = cur.map((b, k) =>
              k === i ? b.filter((x) => x !== n) : k === j ? [...b, n] : b);
            const after = score(cand);
            if (after < winnerAfter - 1e-9) { winner = cand; winnerAfter = after; }
          }
          for (const a of cur[i]) {
            for (const b of cur[j]) {
              if (a === b) continue;
              const cand = cur.map((x, k) =>
                k === i ? x.map((y) => (y === a ? b : y))
                : k === j ? x.map((y) => (y === b ? a : y))
                : x);
              const after = score(cand);
              if (after < winnerAfter - 1e-9) { winner = cand; winnerAfter = after; }
            }
          }
        }
      }
      if (winner === null) break;
      cur = winner;
      best = winnerAfter;
    }
    return { bins: cur, spread: best };
  };

  // Start 0 is the LPT assignment the caller already has.
  const asBins = queues.map((q) => q.shards);
  let bestResult = descend(asBins);
  let tried = 1;

  const rnd = lcg(seed);
  for (let r = 0; r < restarts; r++) {
    const shuffled = [...shardNames];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const bins = Array.from({ length: K }, () => []);
    for (const n of shuffled) bins[Math.floor(rnd() * K)].push(n);
    const result = descend(bins);
    tried += 1;
    if (result.spread < bestResult.spread - 1e-9) bestResult = result;
  }

  return {
    queues: binsToQueues(bestResult.bins),
    restartsTried: tried,
    spreadPct: bestResult.spread,
  };
}

/**
 * The weight signal, and the receipt for where it came from.
 *
 * Primary: MEASURED entry counts, counted out of the staged expected-v2 tree
 * with the runner's own counting rules (dual-lane-shard-entry-weights.mjs).
 * The W=8 probe measured the recorded weights to be weakly
 * ANTI-correlated with actual per-shard entries (r = -0.21 over 48 shards), so
 * LPT was balancing on a signal that pointed the wrong way.
 *
 * Fallback: buildShardWeights(PASS19_PHASE_WEIGHTS_S), for any shard the count
 * could not be produced for -- a shard absent from the tree, or an unreadable
 * file. The fallback is per shard, not per run: a run where 47 of 48 shards
 * count balances on 47 measurements and falls back for exactly one.
 *
 * LPT is scale-invariant, so entries balance identically to entries x any
 * positive constant; the unit is printed so a reader never has to guess
 * whether the QUEUE numbers are seconds or counts.
 */
function resolveWeightSignal(shards) {
  const fallback = buildShardWeights(PASS19_PHASE_WEIGHTS_S);
  let measured = { counts: new Map(), source: "unavailable", keySource: null, elapsedMs: 0 };
  try {
    measured = measureShardEntryCounts(REPO, shards);
  } catch (err) {
    process.stdout.write(
      `WEIGHT-SIGNAL entry counting threw (${err?.message ?? String(err)}); ` +
        `falling back to PASS19_PHASE_WEIGHTS_S for every shard\n`,
    );
  }

  const weights = new Map();
  const signalFor = new Map();
  let counted = 0;
  let fellBack = 0;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const name of shards) {
    const c = measured.counts.get(name);
    if (c !== undefined) {
      weights.set(name, c.total);
      signalFor.set(name, "entries");
      counted += 1;
      min = Math.min(min, c.total);
      max = Math.max(max, c.total);
      sum += c.total;
    } else {
      weights.set(name, fallback.get(name) ?? 0);
      signalFor.set(name, "pass19_s");
      fellBack += 1;
    }
  }
  if (counted === 0) min = 0, max = 0, sum = 0;

  return {
    weights,
    counts: measured.counts,
    counted,
    fellBack,
    source: measured.source,
    keySource: measured.keySource,
    elapsedMs: measured.elapsedMs,
    unit: counted > 0 ? "entries" : "s",
    describe: () =>
      counted > 0
        ? `shard entries min=${min} max=${max} mean=${(sum / counted).toFixed(0)} ` +
            `ratio=${max > 0 ? (max / Math.max(1, min)).toFixed(2) : "n/a"}x` +
            (fellBack > 0 ? `, ${fellBack} shard(s) fell back to recorded seconds` : "")
        : "no counts available; every shard on PASS19_PHASE_WEIGHTS_S",
  };
}

/**
 * The second-order layer: fold a PRIOR run's per-shard failure counts into the
 * entry weights.
 *
 * Returns the WEIGHTS the caller should schedule on, plus the receipt for how
 * they were built. With no --failure-artifacts, or with a directory that holds
 * no attributable per-shard failures, the returned weights are the very Map
 * the entry layer produced -- same object, same numbers -- and the plan output
 * says so in one line.
 *
 * The invariant that keeps this safe: a shard the reader could not attribute
 * keeps a factor of exactly 1. Unknown is not zero. Treating an unattributed
 * shard as "no failures" would silently shrink its weight by up to the whole
 * factor and re-introduce precisely the imbalance this signal exists to remove.
 */
function applyFailureCostSignal(signal) {
  if (opts.failureArtifacts.length === 0) {
    return { weights: signal.weights, applied: false, reason: "no --failure-artifacts flag" };
  }
  const failures = readShardFailureCounts(opts.failureArtifacts);
  if (failures.perShard.size === 0) {
    return {
      weights: signal.weights,
      applied: false,
      failures,
      reason:
        failures.filesScanned === 0
          ? `no *.json in any of the ${failures.dirs.length} artifacts director(ies)`
          : `no file carried per-shard attribution ` +
            `(${failures.filesWithoutAttribution} file(s) hold per-worker totals only, ` +
            `which cannot be split between shards)`,
    };
  }
  const costed = applyFailureCost(signal.counts, failures, {
    beta: opts.failureCostBeta,
    maxFactor: opts.failureCostMaxFactor,
  });
  if (costed.known === 0) {
    return {
      weights: signal.weights,
      applied: false,
      failures,
      reason: `every attributed shard was excluded (${costed.staleEntries} stale-entries)`,
    };
  }

  // Start from the entry weights so any shard that fell back to the recorded
  // seconds KEEPS that weight: the failure layer scales measured entry
  // counts, and it has nothing to say about a shard it could not count.
  const weights = new Map(signal.weights);
  for (const [shard, weight] of costed.weights) weights.set(shard, weight);

  const attributed = costed.rows.filter((r) => r.state === "attributed");
  const entriesWeight = attributed.reduce((s, r) => s + r.entries, 0);
  const costedWeight = attributed.reduce((s, r) => s + r.weight, 0);
  const bump = entriesWeight > 0 ? costedWeight / entriesWeight : 1;
  const maxFactorSeen = attributed.reduce((m, r) => Math.max(m, r.factor), 1);

  return {
    weights,
    applied: true,
    failures,
    costed,
    reason:
      `${costed.known}/${costed.rows.length} counted shard(s) attributed, ` +
      `${costed.unknown} unattributed (factor 1), ` +
      `beta=${costed.beta} entry-equivalents per failing entry`,
    describe: () =>
      `beta=${costed.beta} attributed=${costed.known}/${costed.rows.length} ` +
      `unattributed=${costed.unknown} max_factor=${maxFactorSeen.toFixed(2)} ` +
      `attributed_entries ${entriesWeight}->${costedWeight.toFixed(0)} ` +
      `(+${((bump - 1) * 100).toFixed(1)}% weight on the attributed set)` +
      (costed.staleEntries > 0 ? `, ${costed.staleEntries} excluded as stale-entries` : "") +
      (costed.capped > 0 ? `, ${costed.capped} capped at ${costed.maxFactor}x` : "") +
      (failures.ambiguous.length > 0
        ? `, ${failures.ambiguous.length} ambiguous shard(s) excluded`
        : ""),
    rows: attributed,
  };
}

/** Sum the per-lane aggregate files a run produced. Reads the artifacts, not
 *  the children's stdout: the old driver has to brace-scan child output
 *  (tools/dual-lane-verifier-fast.mjs:436) because a vitest child can only
 *  report through its console; a direct child can write the object it already
 *  holds, so the union here is a read of the same JSON the old path scrapes
 *  out of the text. */
function unionLane(dir, lane) {
  const files = readdirSync(dir).filter((f) => f.endsWith(`-${lane}.json`)).sort();
  const total = { pass: 0, fail: 0, entries: 0, files: 0 };
  for (const f of files) {
    const a = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    if (typeof a.entries !== "number") {
      throw new Error(`unparseable lane artifact: ${f}`);
    }
    total.pass += a.pass.total;
    total.fail += a.fail.total;
    total.entries += a.entries;
    total.files += 1;
  }
  return total;
}

/** Rank shards by recorded failures, per lane, from the per-worker artifacts a
 *  previous run wrote. Read-only: no spawn, no grade, no writes.
 *
 *  The artifacts are summed by shard key rather than assumed unique. A worker's
 *  queue is a disjoint slice of the shard set, so within one run a shard
 *  appears in exactly one artifact and the sum is a plain read; but an
 *  artifacts directory is reused across runs and a re-grade of an overlapping
 *  shard set would double-count. `sources` counts the contributing artifact
 *  files, and any row with sources > 1 is flagged, so a double count is visible
 *  in the output instead of being read as a worse shard.
 *
 *  Ordering: failures descending, then entries descending (so among equally
 *  failing shards the one that failed MORE OF ITS OWN WORK is first), then
 *  name ascending for a stable, diffable order. */
function reportWorstShards(dir, n, withSignatures) {
  if (!existsSync(dir)) {
    fail(`--worst-shards: no artifacts directory at ${dir}`);
  }
  const lanes = {};
  let filesRead = 0;
  let filesWithoutAttribution = 0;

  for (const lane of ["view", "page"]) {
    const files = readdirSync(dir).filter((f) => f.endsWith(`-${lane}.json`)).sort();
    if (files.length === 0) {
      lanes[lane] = { shards: [], artifactFiles: 0, unattributed: 0 };
      continue;
    }
    const byShard = new Map();
    let unattributed = 0;
    for (const f of files) {
      const a = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
      const at = a.attribution;
      if (at === undefined || at === null || typeof at.byShard !== "object") {
        unattributed += 1;
        continue;
      }
      filesRead += 1;
      for (const [shard, b] of Object.entries(at.byShard)) {
        const cur = byShard.get(shard) ?? {
          entries: 0,
          pass: 0,
          fail: 0,
          sigs: {},
          sources: 0,
        };
        cur.entries += b.entries ?? 0;
        cur.pass += b.pass ?? 0;
        cur.fail += b.fail ?? 0;
        for (const [sig, count] of Object.entries(b.sigs ?? {})) {
          cur.sigs[sig] = (cur.sigs[sig] ?? 0) + count;
        }
        cur.sources += 1;
        byShard.set(shard, cur);
      }
    }
    filesWithoutAttribution += unattributed;
    const rows = [...byShard.entries()].map(([shard, b]) => ({
      shard,
      ...b,
      failPct: b.entries === 0 ? 0 : (100 * b.fail) / b.entries,
    }));
    rows.sort(
      (x, y) => y.fail - x.fail || y.entries - x.entries || x.shard.localeCompare(y.shard),
    );
    lanes[lane] = { shards: rows, artifactFiles: files.length, unattributed };
  }

  const totalFail = (lane) => lanes[lane].shards.reduce((s, r) => s + r.fail, 0);
  const totalEntries = (lane) => lanes[lane].shards.reduce((s, r) => s + r.entries, 0);

  process.stdout.write(
    `WORST-SHARDS artifacts=${dir} n=${n} ` +
      `files_with_attribution=${filesRead} files_without=${filesWithoutAttribution}\n`,
  );
  if (filesWithoutAttribution > 0) {
    process.stdout.write(
      `WORST-SHARDS NOTE ${filesWithoutAttribution} artifact file(s) predate the ` +
        `attribution field and contributed nothing; re-grade with the current ` +
        `runner to include them.\n`,
    );
  }

  const anyShards = lanes.view.shards.length + lanes.page.shards.length;
  if (anyShards === 0) {
    process.stdout.write("WORST-SHARDS: no attributed shard data found\n");
    return;
  }

  for (const lane of ["view", "page"]) {
    const rows = lanes[lane].shards;
    process.stdout.write(
      `WORST-SHARDS lane=${lane} shards=${rows.length} ` +
        `fail=${totalFail(lane)}/${totalEntries(lane)} entries\n`,
    );
    const shown = rows.slice(0, n);
    if (shown.length === 0) {
      process.stdout.write(`  (no shard had entries on the ${lane} lane)\n`);
      continue;
    }
    for (const [i, r] of shown.entries()) {
      const sigs = Object.entries(r.sigs)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([s, c]) => `${s}=${c}`)
        .join(" ");
      process.stdout.write(
        `  ${String(i + 1).padStart(2)}. ${r.shard} fail=${r.fail} ` +
          `pass=${r.pass} entries=${r.entries} fail_pct=${r.failPct.toFixed(1)}` +
          `${r.sources > 1 ? ` DOUBLE_COUNTED(sources=${r.sources})` : ""}` +
          `${sigs !== "" ? ` sigs[${sigs}]` : ""}\n`,
      );
    }
    if (rows.length > shown.length) {
      process.stdout.write(
        `  ... ${rows.length - shown.length} more shard(s) not shown (--worst-shards ${n})\n`,
      );
    }
    if (withSignatures) {
      const worst = shown[0];
      if (worst !== undefined && Object.keys(worst.sigs).length > 0) {
        const ids = [];
        for (const f of readdirSync(dir).filter((f) => f.endsWith(`-${lane}.json`)).sort()) {
          const at = JSON.parse(readFileSync(path.join(dir, f), "utf8")).attribution;
          if (at === undefined || at === null) continue;
          for (const r of at.failures ?? []) {
            if (r.shard === worst.shard) ids.push(r);
          }
        }
        process.stdout.write(
          `WORST-SHARDS lane=${lane} worst=${worst.shard} failing_entries=${ids.length}\n`,
        );
        for (const r of ids.slice(0, n)) {
          process.stdout.write(
            `    ${r.sig} ${r.area} id=${r.id} offset=${r.offset ?? "n/a"} ` +
              `expected=${r.expectedBytes ?? "n/a"} actual=${r.actualBytes ?? "n/a"}\n`,
          );
        }
        if (ids.length > n) {
          process.stdout.write(`    ... ${ids.length - n} more failing entry/entries\n`);
        }
      }
    }
  }
}

/** Every file in `dir` that a prior run of this pipeline wrote: a pooled
 *  worker's <label>-aggregate.json / <label>-view.json / <label>-page.json
 *  for any label (w0..wN from the driver, "direct" from a hand-run runner),
 *  plus this driver's own direct-runner-union-aggregate.json.
 *
 *  This is the reuse-detection half of the artifacts guard: worker labels are
 *  QUEUE INDEXES, not run identities, so file content cannot tell a prior
 *  run's w0 from this run's w0 -- presence of ANY of these names is the only
 *  honest evidence the directory was written before, and any grading run into
 *  it would overwrite at least one of them (labels always start at w0). An
 *  unrelated file in the directory is not evidence and does not refuse. */
export function priorRunArtifactFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /-aggregate\.json$/.test(f) || /-view\.json$/.test(f) || /-page\.json$/.test(f))
    .sort();
}

function runWorker(label, shards) {
  return new Promise((resolve) => {
    const args = [
      path.join(HERE, "dual-lane-direct-runner.mjs"),
      "--repo", REPO,
      "--label", label,
      "--artifacts", ARTIFACTS,
    ];
    if (shards.length > 0) args.push("--files", shards.join(","));
    if (opts.reportOnly) args.push("--report-only");

    const env = {
      ...process.env,
      DUAL_LANE_TSC_CACHE_DIR:
        process.env.DUAL_LANE_TSC_CACHE_DIR ??
        path.join(REPO, "tmp", "direct-runner-build", "tscache"),
      NODE_OPTIONS: `--max-old-space-size=${opts.heapMb}`,
    };
    if (opts.reportOnly) env.DUAL_LANE_REPORT_ONLY = "1";
    else delete env.DUAL_LANE_REPORT_ONLY;

    const t0 = Date.now();
    const child = spawn(process.execPath, args, {
      cwd: REPO,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    const relay = (chunk) => {
      const text = chunk.toString();
      out += text;
      for (const line of text.split("\n")) {
        if (line.trim() === "") continue;
        // Progress and the timing line stream; the per-entry aggregate dumps
        // stay out of the driver's log unless asked for.
        if (
          line.startsWith("coverage ") ||
          line.startsWith("SEED-WARM ") ||
          line.startsWith("RUNNER-") ||
          line.startsWith("RUNNER-ERROR")
        ) {
          process.stdout.write(`[${label}] ${line}\n`);
        }
      }
    };
    child.stdout.on("data", relay);
    child.stderr.on("data", relay);

    let timer = null;
    if (opts.deadlineMin > 0) {
      timer = setTimeout(() => {
        // Report and stop waiting. This driver does NOT kill: process-kill
        // authority is gated on this machine, and a driver that killed
        // children it merely suspects of stalling would be exactly the
        // unowned-kill shape the house rules forbid. The child is left to
        // exit on its own and the run is reported as incomplete.
        process.stdout.write(
          `[${label}] DEADLINE-WATCH fired after ${opts.deadlineMin} min — NOT killing; ` +
            `this driver holds no kill authority. Last line: ${
              out.split("\n").filter((l) => l.trim() !== "").slice(-1)[0] ?? "(none)"
            }\n`,
        );
      }, opts.deadlineMin * 60_000);
    }

    child.on("close", (code) => {
      if (timer !== null) clearTimeout(timer);
      resolve({
        label,
        code,
        seconds: (Date.now() - t0) / 1000,
        shards: shards.length,
        log: out,
      });
    });
    child.on("error", (e) => {
      if (timer !== null) clearTimeout(timer);
      resolve({ label, code: -1, seconds: (Date.now() - t0) / 1000, shards: shards.length, error: e.message, log: out });
    });
  });
}

async function main() {
  opts = parseArgs(process.argv.slice(2));
  REPO = opts.repo;
  EXPECTED_V2 = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2");
  ARTIFACTS = opts.artifacts ?? path.join(REPO, "tmp", "direct-runner-artifacts");
  // Report mode short-circuits before any scheduling: it grades nothing and
  // spawns nothing, so it must not be reachable only after the shard set and
  // the weighted queues have been computed.
  if (opts.worstShards !== null) {
    process.stdout.write(
      `DIRECT-DRIVER REPORT-MODE --worst-shards ${opts.worstShards} artifacts=${ARTIFACTS}\n`,
    );
    reportWorstShards(ARTIFACTS, opts.worstShards, opts.worstSignatures);
    process.stdout.write("RESULT: PASS (report mode; nothing graded)\n");
    process.exit(0);
  }
  const shards = resolveShards();
  const signal = resolveWeightSignal(shards);
  const failure = applyFailureCostSignal(signal);
  const weights = failure.weights;
  const workerCount = Math.min(opts.workers, Math.max(1, shards.length));
  const lptQueues = buildWeightedQueues(shards, weights, workerCount);
  const lptSpread = spreadPct(lptQueues.map((q) => q.seconds));
  const refined = refineWeightedQueues(lptQueues, weights);
  const queues = refined.queues;

  const totalWeight = queues.reduce((s, q) => s + q.seconds, 0);
  const queueWeights = queues.map((q) => q.seconds);
  const spread = spreadPct(queueWeights);
  process.stdout.write(
    `DIRECT-DRIVER repo=${REPO} shards=${shards.length} workers=${workerCount} ` +
      `heap_mb=${opts.heapMb} report_only=${opts.reportOnly} artifacts=${ARTIFACTS}\n`,
  );
  process.stdout.write(
    `WEIGHT-SIGNAL measured-entries (${signal.counted}/${shards.length} shards counted, ` +
      `${signal.source} in ${signal.elapsedMs} ms, cache-key=${signal.keySource ?? "none"}) ` +
      `${signal.describe()}\n`,
  );
  // The second-order layer gets its own line whether or not it fired, because
  // "the factor was not applied" and "the factor was applied and did nothing"
  // look identical in the queue numbers and are not the same fact.
  if (failure.applied) {
    process.stdout.write(
      `WEIGHT-SIGNAL failure-cost applied from ${opts.failureArtifacts.join(",")}: ` +
        `${failure.reason}; ${failure.describe()}\n`,
    );
    for (const d of failure.failures.perDir) {
      process.stdout.write(
        `WEIGHT-SIGNAL failure-cost source dir=${d.dir} ` +
          `files_scanned=${d.filesScanned} attributed=${d.filesContributed.length} ` +
          `without_attribution=${d.filesWithoutAttribution} unparseable=${d.filesUnusable}` +
          `${d.missing === true ? " MISSING" : ""}\n`,
      );
    }
    for (const r of failure.rows) {
      process.stdout.write(
        `WEIGHT-SHARD ${r.shard} entries=${r.entries} fail=${r.fail} ` +
          `fail_rate=${(100 * r.fail / r.entries).toFixed(1)}% ` +
          `factor=${r.factor.toFixed(3)} weight=${r.weight.toFixed(1)}\n`,
      );
    }
    for (const a of failure.failures.ambiguous) {
      process.stdout.write(`WEIGHT-SHARD-EXCLUDED ${a.shard} ${a.reason}\n`);
    }
  } else {
    process.stdout.write(
      `WEIGHT-SIGNAL failure-cost NOT applied: ${failure.reason}; ` +
        `weights are the entry weights unchanged\n`,
    );
    for (const d of failure.failures?.perDir ?? []) {
      process.stdout.write(
        `WEIGHT-SIGNAL failure-cost source dir=${d.dir} ` +
          `files_scanned=${d.filesScanned} attributed=${d.filesContributed.length} ` +
          `without_attribution=${d.filesWithoutAttribution} unparseable=${d.filesUnusable}` +
          `${d.missing === true ? " MISSING" : ""}\n`,
      );
    }
  }
  for (const [i, q] of queues.entries()) {
    process.stdout.write(
      `QUEUE w${i} shards=${q.shards.length} weight=${q.seconds.toFixed(0)}${signal.unit} ` +
        `(${totalWeight > 0 ? ((100 * q.seconds) / totalWeight).toFixed(1) : "0"}% of total weight) ` +
        `list=${q.shards.join(",")}\n`,
    );
  }
  process.stdout.write(
    `QUEUE-SPREAD max=${Math.max(...queueWeights).toFixed(0)} min=${Math.min(...queueWeights).toFixed(0)} ` +
      `mean=${(totalWeight / workerCount).toFixed(0)} spread=${spread.toFixed(2)}% ` +
      `(max-min)/mean over ${workerCount} queues; LPT alone was ${lptSpread.toFixed(2)}%, ` +
      `refinement (${refined.restartsTried} start(s)) -> ${spread.toFixed(3)}%\n`,
  );
  if (opts.plan) {
    process.stdout.write("PLAN-ONLY: not spawning (--plan)\n");
    return;
  }

  // Artifacts-reuse guard. The collision this refuses was MEASURED, not
  // hypothetical: a second driver invocation into the same --artifacts dir
  // overwrote the first run's per-worker artifacts (worker labels are queue
  // indexes and the runner names artifacts <label>-{aggregate,view,page}.json
  // unconditionally) -- w0-page.json's mtime moved
  // 06:32:45 -> 06:58:45, only w4/w7 survived, and shard coverage collapsed
  // 35 -> 26 of 48. The prior run's per-worker record is a measurement that
  // took real render-hours; losing it silently is the one outcome this driver
  // must not produce, so reuse requires the explicit --overwrite-artifacts
  // covenant. The guard sits here -- after the --plan early-return, before
  // the first write -- because --plan and report mode write nothing and can
  // lose nothing; refusing reads would only break --worst-shards over a
  // directory that is SUPPOSED to hold prior artifacts.
  const priorArtifacts = priorRunArtifactFiles(ARTIFACTS);
  if (priorArtifacts.length > 0 && !opts.overwriteArtifacts) {
    fail(
      `ARTIFACTS-REFUSE ${ARTIFACTS} already holds ${priorArtifacts.length} ` +
        `prior-run artifact file(s) (e.g. ${priorArtifacts[0]}); worker labels are ` +
        `queue indexes, so this run would overwrite them. Re-run with ` +
        `--overwrite-artifacts to cede the prior artifacts explicitly, or point ` +
        `--artifacts at a fresh directory.`,
      2,
    );
  }

  mkdirSync(ARTIFACTS, { recursive: true });
  const t0 = Date.now();
  // All workers start together: each takes its whole queue on one boot, so
  // there is no dispatch loop and no idle timer -- the same property the old
  // driver built its zero-idle argument on, with the phase count replaced by
  // the worker count.
  const results = await Promise.all(
    queues.map((q, i) => runWorker(`w${i}`, q.shards)),
  );
  const wall = (Date.now() - t0) / 1000;

  for (const [i, r] of results.entries()) {
    // With entries as the signal there is no predicted SECONDS to divide by,
    // so the honest derived number is the implied seconds-per-entry: the
    // per-entry cost this run actually measured, and the thing a future weight
    // model would need to predict rather than assume.
    const perEntry = queues[i].seconds > 0
      ? (r.seconds / queues[i].seconds).toFixed(4)
      : "n/a";
    process.stdout.write(
      `WORKER ${r.label} exit=${r.code} ${r.seconds.toFixed(1)}s shards=${r.shards} ` +
        `weight=${queues[i].seconds.toFixed(0)}${signal.unit} ` +
        `s_per_${signal.unit === "entries" ? "entry" : "s"}=${perEntry}\n`,
    );
    if (r.code !== 0) {
      const tail = r.log.split("\n").filter((l) => l.trim() !== "").slice(-20).join("\n");
      process.stdout.write(`WORKER ${r.label} FAILURE TAIL:\n${tail}\n`);
    }
  }
  process.stdout.write(`WALL ${wall.toFixed(1)}s workers=${workerCount}\n`);

  // Each worker wrote its own aggregate. Before the fix all W of them resolved
  // to one path in tmp/raw-ground-truth/enumeration and the last writer won,
  // so this is asserted from the artifacts rather than assumed: one file per
  // worker, every file present, no duplicates.
  const perWorker = results.map((r) => path.join(ARTIFACTS, `${r.label}-aggregate.json`));
  const written = perWorker.filter((p) => existsSync(p));
  const distinct = new Set(written.map((p) => path.basename(p))).size;
  const sharedPath = path.join(REPO, "tmp", "raw-ground-truth", "enumeration", "dual-lane-verification-aggregate.json");
  process.stdout.write(
    `AGGREGATES per-worker ${written.length}/${results.length} written, ` +
      `${distinct} distinct, shared-path-overwrites=${results.filter((r) =>
        r.log.includes(`aggregate written: ${sharedPath}`)).length} ` +
      `(must be 0; the shared path is the single-run default, untouched)\n`,
  );
  for (const r of results) {
    const m = /aggregate written: (.+)/.exec(r.log);
    if (m !== null) process.stdout.write(`AGGREGATE ${r.label} -> ${m[1]}\n`);
  }

  const view = unionLane(ARTIFACTS, "view");
  const page = unionLane(ARTIFACTS, "page");
  const pct = (t) => ((100 * t.pass) / Math.max(1, t.entries)).toFixed(1);
  process.stdout.write(
    `TOTALS view: ${view.pass}/${view.entries} (${pct(view)}%), ${view.fail} failing\n`,
  );
  process.stdout.write(
    `TOTALS page: ${page.pass}/${page.entries} (${pct(page)}%), ${page.fail} failing\n`,
  );

  const union = {
    note: "dual-lane-direct-driver union of per-worker lane aggregates",
    workers: workerCount,
    wallSeconds: Number(wall.toFixed(1)),
    reportOnly: opts.reportOnly,
    viewLane: view,
    pageLane: page,
  };
  const unionPath = path.join(ARTIFACTS, "direct-runner-union-aggregate.json");
  writeFileSync(unionPath, JSON.stringify(union, null, 2) + "\n");
  process.stdout.write(`aggregate written: ${unionPath}\n`);

  const failed = results.filter((r) => r.code !== 0);
  if (failed.length > 0) {
    process.stdout.write(`RESULT: FAIL — ${failed.length} worker(s) failed (exit 1)\n`);
    process.exit(1);
  }
  process.stdout.write("RESULT: PASS (exit 0)\n");
  process.exit(0);
}

// Entry guard: running as a program executes main(); importing this module
// (tests, tooling) must stay side-effect free -- no argv parsing, no spawn,
// no exit. Same convention as dual-lane-verifier-fast.mjs.
const INVOKED_DIRECTLY = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (INVOKED_DIRECTLY) {
  main().catch((e) => {
    console.error(`RUNNER-ERROR ${e?.stack ?? e?.message ?? String(e)}`);
    process.exit(1);
  });
}
