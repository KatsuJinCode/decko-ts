// dual-lane-direct-scaling-probe.mjs -- 2026-10-01 direct grade runner
// scaling probe (direct-runner-builder lane).
//
// THE ASSUMPTION BEING TESTED
//   grade-hours-autopsy-lane.md projects the whole-canvas grade at
//   W = 8 / 12 / 16 workers by dividing the derived 6,991-7,381 s of
//   render-only compute by W, and marks the division UNVALIDATED in its
//   Limitations #1: "no >2-worker run exists on record ... All W=8/12/16
//   projections divide by W and assume compute-bound behavior holds (SQLite
//   readonly contention, memory bandwidth unmeasured)." Every downstream
//   number in the Two-Minute-Design section rests on that division.
//
//   This probe measures it instead of assuming it. Same canvas at several
//   worker counts, wall clock recorded, speedup and efficiency derived.
//
// WHAT IS AND IS NOT BEING SCALED
//   The canvas is FIXED and the worker count varies. Every point renders the
//   same shards, so the comparison isolates parallelism: same bytes of work,
//   N ways. The per-worker fixed cost (Node boot, corpus open, full re-seed,
//   lexicon warm) is REPORTED SEPARATELY rather than netted out, because it
//   is exactly the term the redesign claims to shrink (24 fixed boots -> W),
//   and folding it into "efficiency" would hide both effects.
//
//   Machine state (cores, free RAM) is sampled per point. A scaling number
//   taken on a machine other lanes are loading is not a scaling number.
//
// USAGE
//   node tools/oracle/dual-lane-direct-scaling-probe.mjs --repo <repo> \
//        --files a.jsonl,b.jsonl,c.jsonl,d.jsonl --workers 1,2,4 \
//        [--heap-mb 1536] [--out <file>]
//
//   Each point is a separate, strictly sequential driver invocation with its
//   own artifacts directory, so no two points contend for the corpus DB
//   except the way the real run does. Exit 0 if every point succeeded; the
//   curve is printed either way, because a failed point is a measurement, not
//   a reason to hide the points that succeeded.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function fail(msg, code = 2) {
  console.error(`dual-lane-direct-scaling-probe: ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = {
    repo: process.cwd(),
    files: null,
    workers: [1, 2, 4],
    heapMb: 1536,
    out: null,
    keep: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) fail(`missing value for ${a}`);
      return argv[i];
    };
    if (a === "--repo") opts.repo = path.resolve(next());
    else if (a === "--files") opts.files = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--workers")
      opts.workers = next().split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
    else if (a === "--heap-mb") opts.heapMb = Number(next());
    else if (a === "--out") opts.out = path.resolve(next());
    else if (a === "--keep") opts.keep = true;
    else fail(`unknown argument: ${a}`);
  }
  if (opts.files === null) fail("--files is required (this probe never grades the whole canvas)");
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const points = [];

/** Free RAM in bytes, from the same OS the run is on. Reported per point:
 *  the runbook's worker gate is a free-memory gate, and a scaling curve
 *  collected across different memory pressure is not one measurement. */
function freeBytes() {
  return os.freemem();
}

console.log(
  `SCALING-PROBE repo=${opts.repo} shards=${opts.files.length} ` +
    `points=${opts.workers.join(",")} heap_mb=${opts.heapMb}`,
);
console.log(
  `SCALING-PROBE machine cores=${os.cpus().length} total_gb=${(os.totalmem() / 2 ** 30).toFixed(1)} ` +
    `free_gb=${(freeBytes() / 2 ** 30).toFixed(1)}`,
);

for (const w of opts.workers) {
  const artifacts = path.join(opts.repo, "tmp", "direct-runner-scaling", `w${w}`);
  if (existsSync(artifacts) && !opts.keep) {
    // A stale artifact directory would let a partial run's totals be unioned
    // into this point's numbers. The verdict must come from THIS invocation.
    rmSync(artifacts, { recursive: true, force: true });
  }
  const freeBefore = freeBytes();
  console.log(
    `\nSCALING-POINT W=${w} START free_gb=${(freeBefore / 2 ** 30).toFixed(1)}`,
  );
  const t0 = Date.now();
  const r = spawnSync(
    process.execPath,
    [
      path.join(HERE, "dual-lane-direct-driver.mjs"),
      "--repo", opts.repo,
      "--workers", String(w),
      "--files", opts.files.join(","),
      "--heap-mb", String(opts.heapMb),
      "--report-only",
      "--artifacts", artifacts,
    ],
    { cwd: opts.repo, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, windowsHide: true },
  );
  const wall = (Date.now() - t0) / 1000;
  const log = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  writeFileSync(path.join(path.dirname(artifacts), `w${w}.log`), log);
  for (const line of log.split("\n")) {
    if (/^(QUEUE|WORKER|WALL|TOTALS)/.test(line)) console.log(`  ${line}`);
  }
  const seedWarm = [...log.matchAll(/SEED-WARM ms=(\d+)/g)].map((m) => Number(m[1]));
  const unionPath = path.join(artifacts, "direct-runner-union-aggregate.json");
  let view = null;
  let page = null;
  if (existsSync(unionPath)) {
    const u = JSON.parse(readFileSync(unionPath, "utf8"));
    view = u.viewLane;
    page = u.pageLane;
  }
  const point = {
    workers: w,
    exit: r.status,
    wallSeconds: Number(wall.toFixed(1)),
    driverWallSeconds: Number((log.match(/^WALL ([\d.]+)s/m)?.[1] ?? "NaN")),
    perWorkerSeedWarmMs: seedWarm,
    perWorkerSeedWarmTotalMs: seedWarm.reduce((a, b) => a + b, 0),
    freeGbBefore: Number((freeBefore / 2 ** 30).toFixed(1)),
    view,
    page,
  };
  points.push(point);
  console.log(
    `SCALING-POINT W=${w} DONE exit=${r.status} wall=${wall.toFixed(1)}s ` +
      `view=${view ? `${view.pass}/${view.entries}` : "?"} ` +
      `page=${page ? `${page.pass}/${page.entries}` : "?"} ` +
      `seed_warm_total_ms=${point.perWorkerSeedWarmTotalMs}`,
  );
}

// ---------- the curve ----------
const base = points.find((p) => p.workers === 1) ?? points[0];
const entryTotal = (base.view?.entries ?? 0) + (base.page?.entries ?? 0);
console.log(`\nSCALING-CURVE canvas_entries=${entryTotal} (view ${base.view?.entries} + page ${base.page?.entries})`);
console.log("W  wall_s  speedup  efficiency  ms/entry  seed_warm_total_ms  verdict_identical");
for (const p of points) {
  const speedup = base.wallSeconds / p.wallSeconds;
  const eff = (speedup * 100) / p.workers;
  const entries = (p.view?.entries ?? 0) + (p.page?.entries ?? 0);
  const msPerEntry = (p.wallSeconds * 1000) / Math.max(1, entries);
  const sameVerdict =
    p.view?.pass === base.view?.pass &&
    p.view?.fail === base.view?.fail &&
    p.page?.pass === base.page?.pass &&
    p.page?.fail === base.page?.fail;
  console.log(
    `${p.workers}  ${p.wallSeconds.toFixed(1)}  ${speedup.toFixed(2)}x  ` +
      `${eff.toFixed(1)}%  ${msPerEntry.toFixed(1)}  ${p.perWorkerSeedWarmTotalMs}  ${sameVerdict}`,
  );
  p.speedup = Number(speedup.toFixed(3));
  p.efficiencyPercent = Number(eff.toFixed(1));
  p.msPerEntry = Number(msPerEntry.toFixed(1));
  p.verdictIdenticalToW1 = sameVerdict;
}

const allSame = points.every((p) => p.verdictIdenticalToW1 === true);
console.log(`\nSCALING-PROBE verdict identical at every worker count: ${allSame}`);
console.log(
  "SCALING-PROBE reading: efficiency above 100% would mean a point benefited from a " +
    "warm page cache the previous point left behind; below 100% is contention or the " +
    "per-worker fixed cost not amortising.",
);

if (opts.out !== null) {
  mkdirSync(path.dirname(opts.out), { recursive: true });
  writeFileSync(
    opts.out,
    JSON.stringify(
      {
        note: "dual-lane-direct-scaling-probe: one fixed canvas, varying worker count",
        shards: opts.files,
        heapMb: opts.heapMb,
        cores: os.cpus().length,
        points,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`SCALING-PROBE wrote ${opts.out}`);
}

const failed = points.filter((p) => p.exit !== 0);
process.exit(failed.length > 0 ? 1 : 0);
