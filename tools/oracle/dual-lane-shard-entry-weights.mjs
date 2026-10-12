// dual-lane-shard-entry-weights.mjs -- measured per-shard entry
// counts, the weight signal the direct driver's queues are balanced on.
//
// WHY THIS EXISTS
//   The driver used to balance its W queues on PHASE_WEIGHTS_S via
//   buildShardWeights(). That is a STATED ASSUMPTION, not a measurement:
//   tools/dual-lane-verifier-fast.mjs:216-223 splits each recorded phase's
//   seconds EVENLY across that phase's two shards because the profiler could
//   not split them. The W=8 probe measured the consequence: Pearson r = -0.21 between those weights and the
//   actual per-shard entry counts across all 48 shards -- the weight signal is
//   weakly ANTI-correlated with the work. Shard 4 carries the canvas's most
//   entries (1161) at a recorded weight of 72.55 s; shard 47 carries 93 at
//   346.6 s. LPT cannot fix a signal that points the wrong way: the predicted
//   queue spread was 1.8% while the actual worker spread was 60.8%.
//
//   So the driver now balances on a COUNTED quantity -- the number of replay
//   entries each shard contributes -- measured with the same counting rules the
//   runner itself applies (transcribed below, branch for branch, from
//   dual-lane-direct-runner-core.ts:375-464). Counting entries is cheap: the
//   full 48-shard canvas (96 files, 344 MB) counts in ~1.3 s, against a
//   ~1500 s run, and the count is cached against the capture manifest's
//   per-shard content hashes so a warm run pays ~0.
//
// WHAT THIS IS NOT
//   Entry count on its own is not a cost model. It is the best predictor
//   available from the expected-v2 tree BEFORE a run, and it is a weak one:
//   across the probe's 8 measured workers, r(queue entries, render seconds) =
//   0.290, r^2 = 0.084. Byte volume -- the obvious alternative proxy --
//   measured worse (r = 0.12), as did view bytes (r = 0.11) and page bytes
//   (r = 0.15). The weight is a measure of how much work
//   a queue is HANDED, not a prediction of how long that work will take.
//
// THE SECOND-ORDER SIGNAL, ADDED LATER IN THIS FILE
//   When a PRIOR run left per-shard failure counts behind, they are folded in
//   as a multiplicative factor: weight = entries x (1 + beta x failRate). The
//   failures come from the same eight measurements and are the strongest
//   candidate in this repo, at r^2 = 0.364 against entries' 0.084. beta is
//   fitted, not chosen, and its uncertainty is written down where it is used.
//   With no attributed shards -- which includes every run that predates the
//   attribution field -- the factor is 1 for every shard and the weights are
//   the entry weights, bit for bit.
//
// CACHE
//   <repo>/tmp/direct-runner-build/shard-entry-counts.json, keyed on the
//   capture manifest's per-shard sha256 map for both lanes (the capture tree's
//   own content address -- a re-captured or edited shard changes its hash and
//   invalidates the cache) plus a SEMANTICS tag. No manifest? The key falls
//   back to each shard file's size + mtime, which is weaker but still safe in
//   the direction that matters: a changed file re-counts.
//
// NEVER THROWS
//   A shard it cannot read or parse is simply absent from the returned map.
//   The caller falls back to the recorded weight for that shard, which
//   is the honest treatment of "no measurement" the driver already used.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const SHARD_RE = /^recapture-raw-shard-\d{6}\.jsonl$/;

/** Bump when the counting rules below change shape. The cached counts are only
 *  reusable while this tag matches; a stale tag re-counts from the tree. */
export const ENTRY_COUNT_SEMANTICS = "shard-entry-counts/1";

/** Bump when the attribution-reading rules below change shape. */
export const FAILURE_COST_SEMANTICS = "shard-failure-cost/1";

/** Entry-equivalents one FAILING entry is worth, in the weight.
 *
 *  MEASURED, not chosen. The W=8 probe's eight workers are eight independent
 *  (entries, failures, render-seconds) triples, and the two-parameter physical
 *  model -- a failing entry takes a different, slower path (excerpt generation
 *  and diffing, `formatReplayFailure` at dual-lane-direct-runner-core.ts:257),
 *  so cost = a*entries + b*failures -- fitted through the origin gives
 *  a = 0.411 s/entry, b = 3.509 s/failure, hence b/a = 8.54.
 *
 *  The honest spread on that number: leave-one-out over the eight workers gives
 *  5.5 to 10.4 in seven folds and 132.8 in the eighth (hold out w3, the
 *  190-failure worker). A fit WITH an intercept instead returns 44.8, five
 *  times higher, because it also charges a 852 s per-worker constant that the
 *  entries and failures do not explain. 8.5 is the physical fit, rounded; it
 *  is a measurement with a stated uncertainty, not a constant of nature. */
export const DEFAULT_FAILURE_COST_BETA = 8.5;

/** Ceiling on one shard's failure factor, so a corrupt or pathological artifact
 *  cannot hand a single shard an unbounded share of the canvas. The highest
 *  factor any measured shard in this repo actually needs is 2.49 (shard 17 at
 *  72/410 failures), so the rail is far above the data and changes nothing. */
export const DEFAULT_MAX_FAILURE_FACTOR = 4;

function shardPath(laneDir, name) {
  const p = path.join(laneDir, name);
  return existsSync(p) ? p : undefined;
}

/** Count one lane's entries from one shard file, applying the runner's own
 *  rules: a blank line is skipped, an unparseable line is malformed and
 *  contributes nothing, a line whose `lane` is not this lane is a mismatch and
 *  contributes nothing (core.ts:175-194 loadLane). */
function countLaneEntries(file, lane) {
  const text = readFileSync(file, "utf8");
  let entries = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // malformed: core.ts:183-185
    }
    if (parsed.lane !== lane) continue; // laneMismatch: core.ts:187-190
    if (lane === "view") {
      // Whole-line capture error: COUNTED AND REPORTED, never silently
      // skipped -- and never an entry either (core.ts:383-386).
      if (parsed.error !== undefined && parsed.record === undefined && parsed.views === undefined) {
        continue;
      }
      if (parsed.record) entries += 1; // core.ts:387-397
      if (parsed.views) entries += Object.keys(parsed.views).length; // core.ts:398-408
    } else {
      // core.ts:430-462: an error line is a graded entry; a page_html string is
      // a graded entry; a line with neither is malformed, not an entry.
      if (parsed.error !== undefined) entries += 1;
      else if (typeof parsed.page_html === "string") entries += 1;
    }
  }
  return entries;
}

/** Count every shard in `shards` that resolves in at least one lane.
 *  Returns Map<shardName, {view:number, page:number, total:number}>. */
function countAll(viewLaneDir, pageLaneDir, shards) {
  const counts = new Map();
  for (const name of shards) {
    const vp = shardPath(viewLaneDir, name);
    const pp = shardPath(pageLaneDir, name);
    if (vp === undefined && pp === undefined) continue;
    let view = 0;
    let page = 0;
    if (vp !== undefined) view = countLaneEntries(vp, "view");
    if (pp !== undefined) page = countLaneEntries(pp, "page");
    counts.set(name, { view, page, total: view + page });
  }
  return counts;
}

/** The cache key: the capture manifest's per-shard content hashes for both
 *  lanes. This is the tree's own content address, so the cache cannot serve
 *  counts for bytes that are no longer on disk. */
function manifestKey(expectedV2Dir, shards) {
  const manifestPath = path.join(expectedV2Dir, "capture-manifest.json");
  if (!existsSync(manifestPath)) return null;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
  const view = manifest?.shards?.view ?? {};
  const page = manifest?.shards?.page ?? {};
  const rows = shards.map((n) => `${n}:${view[n] ?? "-"}:${page[n] ?? "-"}`);
  if (rows.length === 0) return null;
  return { source: "capture-manifest", key: rows.join("\n") };
}

/** No manifest: key on each file's size + mtime. Weaker than a content hash,
 *  but it still invalidates on any ordinary edit, and it never silently keeps
 *  a count for a file that moved. */
function statKey(viewLaneDir, pageLaneDir, shards) {
  const rows = [];
  for (const n of shards) {
    for (const dir of [viewLaneDir, pageLaneDir]) {
      const p = path.join(dir, n);
      if (!existsSync(p)) continue;
      try {
        const s = statSync(p);
        rows.push(`${n}@${dir}:${s.size}:${s.mtimeMs}`);
      } catch {
        rows.push(`${n}@${dir}:unstatable`);
      }
    }
  }
  return rows.length === 0 ? null : { source: "file-stat", key: rows.join("\n") };
}

/**
 * Measured per-shard entry counts, from the staged expected-v2 tree.
 *
 * @param {string} repoRoot
 * @param {string[]} shards
 * @param {{cache?: boolean}} [options] cache:false re-counts and re-writes
 * @returns {{counts: Map<string, {view:number,page:number,total:number}>,
 *            source: "cache"|"measured",
 *            keySource: string|null,
 *            elapsedMs: number}}
 */
export function measureShardEntryCounts(repoRoot, shards, options = {}) {
  const useCache = options.cache !== false;
  const expectedV2Dir = path.join(repoRoot, "tmp", "raw-ground-truth", "expected-v2");
  const viewLaneDir = path.join(expectedV2Dir, "view-lane");
  const pageLaneDir = path.join(expectedV2Dir, "page-lane");
  const cacheDir = path.join(repoRoot, "tmp", "direct-runner-build");
  const cachePath = path.join(cacheDir, "shard-entry-counts.json");

  const t0 = Date.now();
  const key = manifestKey(expectedV2Dir, shards) ?? statKey(viewLaneDir, pageLaneDir, shards);

  if (useCache && key !== null && existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, "utf8"));
      if (cached.semantics === ENTRY_COUNT_SEMANTICS && cached.key === key.key) {
        const counts = new Map();
        for (const row of cached.counts) counts.set(row[0], { view: row[1], page: row[2], total: row[3] });
        return { counts, source: "cache", keySource: key.source, elapsedMs: Date.now() - t0 };
      }
    } catch {
      // A corrupt cache is a re-count, never an error.
    }
  }

  const counts = countAll(viewLaneDir, pageLaneDir, shards);
  if (useCache && key !== null) {
    try {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(
        cachePath,
        JSON.stringify({
          semantics: ENTRY_COUNT_SEMANTICS,
          keySource: key.source,
          key: key.key,
          countedAt: new Date().toISOString(),
          counts: [...counts].map(([name, c]) => [name, c.view, c.page, c.total]),
        }) + "\n",
      );
    } catch {
      // An unwritable cache dir costs a re-count next run, nothing more.
    }
  }
  return { counts, source: "measured", keySource: key?.source ?? null, elapsedMs: Date.now() - t0 };
}

/** The shard names the staged tree offers, for callers that want the default
 *  set without importing the driver's own resolver. */
export function discoverShardNames(expectedV2Dir) {
  const names = new Set();
  for (const lane of ["view-lane", "page-lane"]) {
    const dir = path.join(expectedV2Dir, lane);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (SHARD_RE.test(f)) names.add(f);
  }
  return [...names].sort();
}

// ---------------------------------------------------------------------------
// FAILURE COST -- the second-order signal
//
// WHY A SECOND SIGNAL AT ALL
//   Entry count is the best proxy available BEFORE a run, and it is a weak one:
//   across the W=8 probe's eight workers r(entries, render seconds) = 0.290,
//   r^2 = 0.084. Failures are the strongest candidate found anywhere in this
//   repo: r(failures, render seconds) = 0.604, r^2 = 0.364 -- four times the
//   explained variance, and from the same eight measurements.
//
//   The mechanism is plausible and named: a FAILING entry takes a different,
//   slower path than a passing one, because the runner has to build the replay
//   excerpt and diff it to explain the failure
//   (dual-lane-direct-runner-core.ts:257 formatReplayFailure). A passing entry
//   is a render and a byte compare. So cost is modelled as
//
//       cost(shard) = entries(shard) x (1 + beta x failRate(shard))
//
//   which is scale-invariant -- LPT only ever compares weights against each
//   other -- so the factor is a pure re-ranking of the entry signal, and with
//   beta = 0 or with no attributed shards it is EXACTLY the entry weight.
//
// WHERE THE FAILURE COUNTS COME FROM, AND WHAT IS NOT THERE
//   Only a PRIOR run knows them. They are read out of that run's per-worker
//   artifacts, by two exact routes, never by estimation:
//
//   A. `attribution.byShard` -- written as a sibling key on each
//      `<label>-view.json` / `<label>-page.json`. `attribution.lane` says
//      which lane the file covers,
//      so the two lanes of one shard never read as two sources for it.
//   B. A single-shard aggregate -- a `<label>-aggregate.json` whose `coverage`
//      table names exactly ONE shard. One worker, one shard, so every failure
//      in that file belongs to that shard. This is arithmetic, not inference,
//      and it is what makes the pre-attribution W=8 and W=3 probes usable at all.
//
//   A per-worker artifact with NO attribution and a multi-shard coverage table
//   contributes NOTHING, because its totals cannot be split between shards. The
//   W=8 probe's own artifact directory is exactly that case and yields zero
//   shards; its 48-shard totals are per-WORKER, and no
//   amount of reading turns 8 equations into 48 unknowns.
//
// NEVER THROWS, NEVER GUESSES
//   A file that is unreadable, unparseable, or shaped like neither route is
//   skipped. A shard attributed by more than one source for the same lane is
//   marked AMBIGUOUS and excluded rather than summed. The caller sees the
//   exclusions in the returned receipt and in the plan output.
// ---------------------------------------------------------------------------

/** One artifact file's contribution: {shardName -> {lane -> {fail, entries}}}. */
function contributionsFromFile(obj) {
  // Route A: the attribution sibling key, one lane per file.
  const at = obj?.attribution;
  if (at !== undefined && at !== null && typeof at.byShard === "object" && at.byShard !== null) {
    const lane = at.lane;
    if (lane !== "view" && lane !== "page") return null; // unknown lane: refuse it
    const byShard = new Map();
    for (const [shard, b] of Object.entries(at.byShard)) {
      if (typeof b?.fail !== "number" || typeof b?.entries !== "number") continue;
      byShard.set(shard, { [lane]: { fail: b.fail, entries: b.entries } });
    }
    return byShard.size === 0 ? null : byShard;
  }

  // Route B: a single-shard aggregate. Both lanes, one file, exact.
  const cov = obj?.coverage;
  if (!Array.isArray(cov) || cov.length !== 1) return null;
  const shard = cov[0]?.shard;
  if (typeof shard !== "string" || !SHARD_RE.test(shard)) return null;
  const view = obj?.viewLane?.aggregate;
  const page = obj?.pageLane?.aggregate;
  if (typeof view?.fail?.total !== "number" || typeof page?.fail?.total !== "number") return null;
  // The aggregate's own entry totals must agree with the coverage row it was
  // built from. A file where they disagree is internally inconsistent and is
  // refused rather than half-believed.
  if (view.entries !== cov[0]?.view?.entries || page.entries !== cov[0]?.page?.entries) return null;
  return new Map([
    [shard, {
      view: { fail: view.fail.total, entries: view.entries },
      page: { fail: page.fail.total, entries: page.entries },
    }],
  ]);
}

/**
 * Per-shard failure counts from the artifact directories a prior run (or
 * several prior runs) left behind.
 *
 * Read-only: no spawn, no grade, no write. A missing directory is not an
 * error -- it is the "no prior run" case, and it returns an empty result,
 * which is what makes the caller's fallback the pure entry weight.
 *
 * Several directories are merged, because a real repository does not keep one
 * run's artifacts in one place: the W=8 probe's worst-fail shards, the
 * weight-fix W=3 probe and a current run's own output are three
 * directories. A shard attributed more than once is CORROBORATED when every
 * attribution of it agrees exactly -- which is the normal shape of a current
 * run, where the per-lane sibling and the single-shard aggregate both describe
 * the same numbers -- and EXCLUDED as a conflict when they disagree. Neither
 * branch sums across a disagreement: two runs that contradict each other is a
 * fact about the artifacts, not a number to average.
 *
 * @param {string|string[]} artifactsDir one directory, or several
 * @returns {{dirs: string[],
 *            perShard: Map<string, {fail:number, entries:number,
 *              sources:number, view:number, page:number}>,
 *            ambiguous: Array<{shard:string, reason:string}>,
 *            perDir: Array<{dir:string, filesScanned:number,
 *              filesContributed:string[], filesWithoutAttribution:number,
 *              filesUnusable:number}>,
 *            filesScanned: number, filesContributed: string[],
 *            filesWithoutAttribution: number, filesUnusable: number}}
 */
export function readShardFailureCounts(artifactsDir) {
  const dirs = (Array.isArray(artifactsDir) ? artifactsDir : [artifactsDir]).filter(
    (d) => typeof d === "string" && d.length > 0,
  );
  const total = {
    filesScanned: 0,
    filesContributed: [],
    filesWithoutAttribution: 0,
    filesUnusable: 0,
  };
  const perDir = [];
  const perShard = new Map();
  const ambiguous = [];
  // shard -> lane -> [contribution, ...] so a lane seen twice is visible as a
  // count of 2 rather than silently summed.
  const raw = new Map();

  for (const dir of dirs) {
    const d = {
      dir,
      filesScanned: 0,
      filesContributed: [],
      filesWithoutAttribution: 0,
      filesUnusable: 0,
    };
    perDir.push(d);

    let names;
    try {
      if (!existsSync(dir)) {
        d.missing = true;
        continue;
      }
      names = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    } catch {
      d.missing = true;
      continue;
    }

    for (const name of names) {
      d.filesScanned += 1;
      total.filesScanned += 1;
      let obj;
      try {
        obj = JSON.parse(readFileSync(path.join(dir, name), "utf8"));
      } catch {
        d.filesUnusable += 1;
        total.filesUnusable += 1;
        continue;
      }
      const contribution = contributionsFromFile(obj);
      if (contribution === null) {
        // An artifact with no attribution and a multi-shard coverage table (or
        // no coverage at all) genuinely cannot be split per shard. Counted, so
        // the report can say how much was left on the table.
        d.filesWithoutAttribution += 1;
        total.filesWithoutAttribution += 1;
        continue;
      }
      d.filesContributed.push(name);
      total.filesContributed.push(`${dir}/${name}`);
      for (const [shard, lanes] of contribution) {
        const cur = raw.get(shard) ?? {};
        for (const [lane, value] of Object.entries(lanes)) {
          (cur[lane] ??= []).push(value);
        }
        raw.set(shard, cur);
      }
    }
  }

  for (const [shard, lanes] of raw) {
    const view = lanes.view ?? [];
    const page = lanes.page ?? [];
    if (view.length === 0 || page.length === 0) {
      const missing = view.length === 0 ? "view" : "page";
      ambiguous.push({ shard, reason: `no ${missing}-lane attribution` });
      continue;
    }
    // A shard can legitimately be attributed more than once: a CURRENT run
    // writes BOTH the per-lane `attribution` sibling and the single-shard
    // `<label>-aggregate.json`, so routes A and B both fire on the same run and
    // both are right. That is corroboration, not a double count, and refusing
    // it would throw away exactly the artifacts this reader exists to read.
    //
    // The line between corroboration and conflict is whether the numbers AGREE.
    // Equal contributions are one fact stated twice and are taken once.
    // Disagreeing contributions are a real conflict -- two runs, or a corrupted
    // file -- and averaging or picking one would be inventing data, so the
    // shard is excluded and named.
    const agree = (list) =>
      list.every((c) => c.fail === list[0].fail && c.entries === list[0].entries);
    if (view.length > 1 || page.length > 1) {
      if (!agree(view) || !agree(page)) {
        ambiguous.push({
          shard,
          reason:
            `attributed ${view.length}x view / ${page.length}x page with DISAGREEING counts ` +
            `(view fail [${view.map((c) => c.fail).join(",")}], ` +
            `page fail [${page.map((c) => c.fail).join(",")}])`,
        });
        continue;
      }
    }
    perShard.set(shard, {
      view: view[0].fail,
      page: page[0].fail,
      fail: view[0].fail + page[0].fail,
      entries: view[0].entries + page[0].entries,
      sources: view.length + page.length,
    });
  }
  return { dirs, perShard, ambiguous, perDir, ...total };
}

/**
 * Apply the failure cost to measured entry counts.
 *
 * The result is a weight per shard in ENTRY-EQUIVALENTS, and for every shard
 * with no attributed failure count it is EXACTLY the entry count -- the shipped
 * behaviour, not an approximation of it.
 *
 * Two exclusions, both reported, both deliberate:
 *   - a shard whose attributed entry total disagrees with the counted tree
 *     (stale artifacts against a re-captured or edited shard) is UNKNOWN: the
 *     rate it would contribute is computed against a denominator that no longer
 *     describes it;
 *   - a shard the reader marked ambiguous is UNKNOWN.
 *
 * @param {Map<string, {view:number,page:number,total:number}>} counts
 * @param {ReturnType<typeof readShardFailureCounts>} failures
 * @param {{beta?: number, maxFactor?: number}} [options]
 */
export function applyFailureCost(counts, failures, options = {}) {
  const beta = options.beta ?? DEFAULT_FAILURE_COST_BETA;
  const maxFactor = options.maxFactor ?? DEFAULT_MAX_FAILURE_FACTOR;
  const weights = new Map();
  const rows = [];
  let known = 0;
  let unknown = 0;
  let staleEntries = 0;
  let capped = 0;

  for (const [shard, c] of counts) {
    const entries = c.total;
    const rec = failures?.perShard?.get(shard);
    let factor = 1;
    let fail = null;
    let state = "unknown";
    if (rec !== undefined) {
      if (rec.entries !== entries) {
        state = "stale-entries";
        staleEntries += 1;
      } else if (rec.entries === 0) {
        state = "zero-entries";
      } else {
        fail = rec.fail;
        const raw = 1 + beta * (rec.fail / rec.entries);
        factor = Math.min(maxFactor, raw);
        if (raw > maxFactor) capped += 1;
        state = "attributed";
        known += 1;
      }
    } else {
      unknown += 1;
    }
    const weight = entries * factor;
    weights.set(shard, weight);
    rows.push({ shard, entries, fail, factor, weight, state });
  }
  rows.sort((a, b) => b.weight - a.weight || a.shard.localeCompare(b.shard));
  return { weights, rows, beta, maxFactor, known, unknown, staleEntries, capped };
}
