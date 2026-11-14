// dual-lane-direct-parity-gate.mjs -- direct grade runner parity gate.
//
// THE GATE THIS ENFORCES
//   The direct runner is only worth having if it reaches the same verdict as
//   the instrument it replaces. This runs BOTH paths over the SAME shard list,
//   in the same tree, and compares the two aggregate JSON files byte for
//   byte. Not "the same pass count" -- the same bytes, including the coverage
//   table, the failure-signature map, every failure record's first-difference
//   excerpt and byte offsets, and the page lane's expected-metadata block.
//
//   Byte comparison is the right bar rather than a tolerance because the
//   runner claims to have changed nothing about the protocol: the judge
//   (replayEntries / formatReplayFailure), the seed, the handlers, and the
//   aggregate shape are the spec's, transcribed. Any drift shows up as a
//   differing byte, and a differing byte is the whole class of defect this
//   gate exists to catch -- a renderer that a bundler or a transpiler
//   silently changed would still pass a "counts match" check.
//
// WHAT IT DOES NOT CLAIM
//   It does not prove the whole 48-shard canvas agrees; it proves the two
//   paths agree on the shard list given. `--files` defaults to shard 0, the
//   lightest recorded shard, which is also the one that produces a MIXED
//   verdict (its recorded weight is 31.6 s, split from P1's 63.2 s), so the
//   comparison exercises the failure-classification branches and not only the
//   all-pass path. Running it over more shards costs one more grade per path
//   per shard and is the same command with a longer --files list.
//
// EXIT CODES
//   0  both paths exited 0 AND the aggregate files are byte-identical
//   1  a path failed, or the files differ (the diff is printed)
//   2  bad arguments / missing tree
//
// USAGE
//   node tools/oracle/dual-lane-direct-parity-gate.mjs --repo <repo> \
//        [--files recapture-raw-shard-000000.jsonl] [--out <dir>]

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function fail(msg, code = 2) {
  console.error(`dual-lane-direct-parity-gate: ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { repo: process.cwd(), files: "recapture-raw-shard-000000.jsonl", out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) fail(`missing value for ${a}`);
      return argv[i];
    };
    if (a === "--repo") opts.repo = path.resolve(next());
    else if (a === "--files") opts.files = next();
    else if (a === "--out") opts.out = path.resolve(next());
    else fail(`unknown argument: ${a}`);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const OUT = opts.out ?? path.join(opts.repo, "tmp", "direct-runner-parity");
const files = opts.files.split(",").map((s) => s.trim()).filter(Boolean);

const stagedSpec = path.join(
  opts.repo, "tmp", "raw-ground-truth", "scripts", "verify-dual-lane.test.ts",
);
if (!existsSync(stagedSpec)) {
  fail(`staged instrument missing: ${stagedSpec} (run the driver's staging step, or pass --repo at a worktree that has it)`);
}
const canonicalSpec = path.join(opts.repo, "tools", "oracle", "verify-dual-lane.test.ts");
const stagedBytes = readFileSync(stagedSpec);
const canonicalBytes = readFileSync(canonicalSpec);
if (!stagedBytes.equals(canonicalBytes)) {
  // The instrument the driver would stage is not the instrument on disk. Run
  // against a divergent spec and the comparison means nothing, so this is a
  // refusal, not a warning.
  fail(
    `staged instrument differs from the tracked canonical ` +
      `(${stagedBytes.length} vs ${canonicalBytes.length} bytes). The old driver's own ` +
      `staging rule (tools/dual-lane-verifier-fast.mjs:292-295) refuses on drift too.`,
  );
}

mkdirSync(OUT, { recursive: true });
const directAggregate = path.join(OUT, "direct-aggregate.json");
const vitestAggregate = path.join(OUT, "vitest-aggregate.json");
const directLog = path.join(OUT, "direct-run.log");
const vitestLog = path.join(OUT, "vitest-run.log");

console.log(`PARITY-GATE repo=${opts.repo} files=${files.join(",")} out=${OUT}`);
console.log(`PARITY-GATE staged instrument is byte-identical to the tracked canonical (${stagedBytes.length} bytes)`);

const env = {
  ...process.env,
  DUAL_LANE_FILES: files.join(","),
  DUAL_LANE_REPORT_ONLY: "1",
  DUAL_LANE_TSC_CACHE_DIR:
    process.env.DUAL_LANE_TSC_CACHE_DIR ??
    path.join(opts.repo, "tmp", "direct-runner-build", "tscache"),
};

// Path A: the direct runner.
console.log("PARITY-GATE running path A (direct runner, no vitest)...");
const direct = spawnSync(
  process.execPath,
  [
    path.join(HERE, "dual-lane-direct-runner.mjs"),
    "--repo", opts.repo,
    "--aggregate-out", directAggregate,
    "--report-only",
  ],
  { cwd: opts.repo, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, windowsHide: true },
);
writeFileSync(directLog, `${direct.stdout ?? ""}${direct.stderr ?? ""}`);
console.log(
  `PARITY-GATE path A exit=${direct.status} ` +
    `${((direct.stdout ?? "").match(/RUNNER-TIMING .*/) ?? ["(no RUNNER-TIMING line)"])[0]}`,
);

// Path B: the instrument, unchanged, under vitest.
console.log("PARITY-GATE running path B (vitest spec, the parity oracle)...");
// The spec has no output-path option: OUT_FILE is fixed at
// verify-dual-lane.test.ts:110 to <repo>/tmp/raw-ground-truth/enumeration/
// dual-lane-verification-aggregate.json. That is the file path B's verdict
// lives in, so that is the file compared. (Path A is directed elsewhere by
// --aggregate-out precisely so the two runs cannot overwrite each other.)
const specAggregate = path.join(
  opts.repo, "tmp", "raw-ground-truth", "enumeration", "dual-lane-verification-aggregate.json",
);
if (existsSync(specAggregate)) rmSync(specAggregate);
const vitest = spawnSync(
  "npx",
  ["vitest", "run", path.relative(opts.repo, stagedSpec)],
  { cwd: opts.repo, env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, shell: true, windowsHide: true },
);
writeFileSync(vitestLog, `${vitest.stdout ?? ""}${vitest.stderr ?? ""}`);
console.log(`PARITY-GATE path B exit=${vitest.status}`);
if (existsSync(specAggregate)) {
  copyFileSync(specAggregate, vitestAggregate);
}

for (const [label, code] of [["A (direct)", direct.status], ["B (vitest)", vitest.status]]) {
  if (code !== 0) {
    console.error(`PARITY-GATE FAIL: path ${label} exited ${code}`);
    console.error(`PARITY-GATE see ${label.startsWith("A") ? directLog : vitestLog}`);
    process.exit(1);
  }
}

for (const [label, p] of [["direct", directAggregate], ["vitest", vitestAggregate]]) {
  if (!existsSync(p)) {
    fail(`path ${label} wrote no aggregate at ${p} (exit codes were 0, which means the artifact, not the grade, is missing)`);
  }
}

const a = readFileSync(directAggregate);
const b = readFileSync(vitestAggregate);
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
console.log(`PARITY-GATE direct sha256=${sha(a)} bytes=${a.length}`);
console.log(`PARITY-GATE vitest sha256=${sha(b)} bytes=${b.length}`);

if (!a.equals(b)) {
  // Report the first differing byte with context, so a failure is diagnosable
  // without re-running anything.
  const at = [...a].findIndex((c, i) => c !== b[i]);
  const from = Math.max(0, at - 120);
  console.error(`PARITY-GATE FAIL: aggregates differ, first differing byte offset ${at}`);
  console.error(`  direct @${from}: ${JSON.stringify(a.toString("utf8").slice(from, at + 160))}`);
  console.error(`  vitest @${from}: ${JSON.stringify(b.toString("utf8").slice(from, at + 160))}`);
  process.exit(1);
}

console.log("PARITY-GATE PASS: the direct runner's aggregate is byte-identical to the vitest instrument's");
process.exit(0);
