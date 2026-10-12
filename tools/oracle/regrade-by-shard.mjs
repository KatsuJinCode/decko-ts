// Grade both lanes of a staged corpus shard by shard: one driver process per
// shard (one worker, report-only), CONCURRENCY at a time, every child hidden.
// Writes per-shard artifacts under <out>/<shard>/ and <out>/union.json.
//
//   node tools/oracle/regrade-by-shard.mjs --repo <checkout> --out <dir> [--concurrency 2] [--heap-mb 3072] [--shards 3,12]
//
// The checkout must stage the corpus shards in the expected-v2 layout and
// the graded corpus database where the driver expects them. The verdict of
// each entry is the driver's
// (src/testing/replay.ts -> compareNormalized).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i === -1 ? dflt : args[i + 1];
};
const REPO = path.resolve(opt("--repo", process.cwd()));
const OUT = path.resolve(opt("--out", ""));
const CONCURRENCY = Number(opt("--concurrency", 2));
const HEAP = String(opt("--heap-mb", 3072));
const wanted = opt("--shards", null);
if (!opt("--out", null)) {
  console.error("usage: regrade-by-shard.mjs --repo <checkout> --out <dir> [--concurrency n] [--heap-mb n] [--shards a,b]");
  process.exit(2);
}

const laneDir = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2", "page-lane");
let shards = fs.readdirSync(laneDir).filter((f) => f.endsWith(".jsonl")).sort();
if (wanted) {
  const want = new Set(wanted.split(",").map((n) => `recapture-raw-shard-${n.trim().padStart(6, "0")}.jsonl`));
  shards = shards.filter((s) => want.has(s));
}
// heaviest first, so the tail is short
shards.sort((a, b) => fs.statSync(path.join(laneDir, b)).size - fs.statSync(path.join(laneDir, a)).size);
fs.mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
const timings = [];
let next = 0;
const runOne = (shard) =>
  new Promise((resolve) => {
    const art = path.join(OUT, shard.replace(".jsonl", ""));
    const log = fs.openSync(`${art}.log`, "w");
    const started = Date.now();
    const child = spawn(
      process.execPath,
      [path.join(REPO, "tools", "oracle", "dual-lane-direct-driver.mjs"), "--repo", REPO, "--workers", "1",
        "--heap-mb", HEAP, "--files", shard, "--report-only", "--artifacts", art],
      { cwd: REPO, stdio: ["ignore", log, log], windowsHide: true },
    );
    child.on("exit", (code) => {
      fs.closeSync(log);
      const s = (Date.now() - started) / 1000;
      timings.push({ shard, code, s });
      console.log(`SHARD ${shard} exit=${code} ${s.toFixed(1)}s`);
      resolve();
    });
  });
const worker = async () => {
  while (next < shards.length) await runOne(shards[next++]);
};
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const totals = { view: { pass: 0, total: 0 }, page: { pass: 0, total: 0 } };
const failures = { view: [], page: [] };
const missing = [];
for (const shard of shards) {
  const agg = path.join(OUT, shard.replace(".jsonl", ""), "w0-aggregate.json");
  if (!fs.existsSync(agg)) {
    missing.push(shard);
    continue;
  }
  const a = JSON.parse(fs.readFileSync(agg, "utf8"));
  for (const [lane, key] of [["view", "viewLane"], ["page", "pageLane"]]) {
    totals[lane].pass += a[key].aggregate.pass.total;
    totals[lane].total += a[key].aggregate.entries;
    for (const f of a[key].failures) failures[lane].push({ shard, id: f.id, first: f.first });
  }
}
const wall = (Date.now() - t0) / 1000;
fs.writeFileSync(path.join(OUT, "union.json"), JSON.stringify({ repo: REPO, totals, failures, missing, timings, wall }, null, 1));
console.log(
  `TOTALS view ${totals.view.pass}/${totals.view.total} page ${totals.page.pass}/${totals.page.total} ` +
    `missing=${missing.length} wall=${wall.toFixed(1)}s maxShard=${Math.max(0, ...timings.map((t) => t.s)).toFixed(1)}s`,
);
process.exit(missing.length > 0 || timings.some((t) => t.code !== 0) ? 1 : 0);
