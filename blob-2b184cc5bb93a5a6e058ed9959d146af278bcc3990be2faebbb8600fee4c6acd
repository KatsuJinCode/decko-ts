// One-command CPU profiler wrapper. Re-spawns the workload under V8's
// --cpu-prof, parses the .cpuprofile the runner flushes on exit, and
// prints (a) the workload's wall-ms and (b) the TOP 15 self-time frames.
//
// Usage:
//   node benchmarks/perf/profile-once.mjs <program> [args...]
//
// Example (the warm-entry huge-content probe from the 2026-09-21 suite):
//   node benchmarks/perf/profile-once.mjs \
//     ./node_modules/vitest/vitest.mjs run --root . \
//     benchmarks/corpus-v2/perf-probes-2026-09-21/warm-entry-probe.test.ts
//
// Zero deps beyond node builtins: child_process, fs, os, path.
//
// Output format is deliberately minimal so it can be diffed across runs:
//   wall-ms: <number>
//   profile-file: <path>
//   top 15 self-time frames:
//     <ticks>  <functionName> @ <url>:<line>
//
// Aggregation follows the task spec literally: sum hitCount per
// functionName across all nodes with that name, drop
// (program)/(root)/(idle)/garbage-collector frames, sort desc, take 15.

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

const argv = process.argv.slice(2);
if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
  console.error(
    "usage: node benchmarks/perf/profile-once.mjs <program> [args...]\n" +
      "\n" +
      "Re-spawns <program> under V8 --cpu-prof, parses the .cpuprofile, and\n" +
      "prints wall-ms plus the TOP 15 self-time frames (hitCount aggregated\n" +
      "by functionName, with (program)/(root)/(idle)/garbage-collector\n" +
      "frames excluded).",
  );
  process.exit(argv.length === 0 ? 2 : 0);
}

// V8 --cpu-prof-dir needs an absolute path on every node major we have
// shipped; relative paths were dropped in v20+. Anchor at process.cwd().
const absProfDir = resolve(process.cwd(), "./tmp-cpu-profile");
if (!existsSync(absProfDir)) mkdirSync(absProfDir, { recursive: true });

const stamp = Date.now();
const tag = `profile-once-${process.pid}-${stamp}`;
const expectedName = `${tag}.cpuprofile`;

const t0 = Date.now();
const child = spawn(
  process.execPath,
  [
    "--cpu-prof",
    `--cpu-prof-dir=${absProfDir}`,
    `--cpu-prof-name=${expectedName}`,
    ...argv,
  ],
  { stdio: "inherit" },
);

const exitCode = await new Promise((resolveExit) => {
  child.on("exit", (code, signal) => {
    if (signal) resolveExit(128);
    else resolveExit(code ?? 0);
  });
});
const wallMs = Date.now() - t0;

if (exitCode !== 0) {
  // V8 still flushes the .cpuprofile on exit regardless of exit code, so
  // we always continue to parse. The wall-ms is the wall-ms; the failure
  // is a separate signal the engineer will see in the workload's stderr
  // and the exit code at the very end.
  console.error(
    `[profile-once] workload exited ${exitCode} after ${wallMs} ms - profile still being parsed`,
  );
}

// V8 writes the profile on exit; locate the file we asked for, falling back
// to the newest .cpuprofile in the dir if V8 ignored --cpu-prof-name.
let profilePath = join(absProfDir, expectedName);
if (!existsSync(profilePath)) {
  const candidates = readdirSync(absProfDir)
    .filter((f) => f.endsWith(".cpuprofile"))
    .map((f) => ({ f, m: statSync(join(absProfDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (candidates.length === 0) {
    console.error(
      `[profile-once] no .cpuprofile found in ${absProfDir} after workload exit (wall-ms=${wallMs})`,
    );
    process.exit(1);
  }
  profilePath = join(absProfDir, candidates[0].f);
}

const raw_json = readFileSync(profilePath, "utf8");
const profile = JSON.parse(raw_json);
const nodes = Array.isArray(profile.nodes) ? profile.nodes : [];
const startTime = typeof profile.startTime === "number" ? profile.startTime : 0;
const endTime = typeof profile.endTime === "number" ? profile.endTime : 0;
const profileSpanUs = endTime > startTime ? endTime - startTime : 0;

// Per the task spec: sum hitCount by functionName. Multiple nodes can
// carry the same functionName (different call sites / urls); aggregate.
// Drop the noise buckets the spec names: (program), (root), (idle), and
// anything that smells like V8's garbage-collector sweep.
const isExcluded = (cf) => {
  const fn = (cf.functionName ?? "").toString();
  const url = (cf.url ?? "").toString();
  if (fn === "" || fn === "(root)" || fn === "(program)" || fn === "(idle)") {
    return true;
  }
  // GC frames in V8 surface as functionName "GC", "(GC)", "garbage
  // collector", or url containing "gc" / "garbage". Be conservative:
  // only flag functionName / url strings that *explicitly* mention
  // garbage collection. Generic "(anonymous)" stays.
  if (/\bgarbage\s*collector\b/i.test(fn)) return true;
  if (/^\s*\(?\s*gc\s*\)?\s*$/i.test(fn)) return true;
  if (/garbage[\-_/]collector/i.test(url)) return true;
  return false;
};

const agg = new Map(); // functionName -> { ticks, samples, urls }
const addTo = (key, url, ticks) => {
  let entry = agg.get(key);
  if (entry === undefined) {
    entry = { ticks: 0, urls: new Set() };
    agg.set(key, entry);
  }
  entry.ticks += ticks;
  if (url) entry.urls.add(url);
};

for (const node of nodes) {
  const cf = node.callFrame ?? {};
  if (isExcluded(cf)) continue;
  const fn = (cf.functionName ?? "(anonymous)").toString();
  const url = (cf.url ?? "").toString();
  const hit = typeof node.hitCount === "number" ? node.hitCount : 0;
  // hitCount for a node is its leaf-sample count; sum across nodes that
  // share the functionName.
  if (hit > 0) addTo(fn, url, hit);
  // positionTicks is V8's line-level breakdown; tick counts may exceed
  // hitCount for hot functions that span many lines. Include them too -
  // the task spec asks for self-time, and line-attributed ticks are
  // self-time on the same function. De-dup vs hitCount by adding the
  // delta (positionTicks already covers hitCount for the same node).
  const ticks = Array.isArray(node.positionTicks)
    ? node.positionTicks.reduce((s, p) => s + (p.ticks ?? 0), 0)
    : 0;
  if (ticks > hit) addTo(fn, url, ticks - hit);
}

const ranked = [...agg.entries()]
  .map(([fn, e]) => ({
    fn,
    ticks: e.ticks,
    urls: [...e.urls].filter((u) => u !== "").slice(0, 3),
  }))
  .sort((a, b) => b.ticks - a.ticks)
  .slice(0, 15);

const totalTicks = ranked.reduce((s, e) => s + e.ticks, 0);
const totalNodes = nodes.length;
const totalSamples = Array.isArray(profile.samples) ? profile.samples.length : 0;

console.log(`wall-ms: ${wallMs}`);
console.log(`profile-file: ${profilePath}`);
console.log(
  `profile span: ${(profileSpanUs / 1000).toFixed(1)} ms ` +
    `(samples=${totalSamples}, nodes=${totalNodes})`,
);
console.log(`top 15 self-time frames:`);
const width = String(Math.max(1, totalTicks)).length;
for (const row of ranked) {
  const pct = totalTicks > 0 ? (row.ticks * 100) / totalTicks : 0;
  const loc =
    row.urls.length > 0
      ? ` @ ${row.urls[0].replace(process.cwd(), ".")}`
      : "";
  console.log(
    `  ${String(row.ticks).padStart(width)}  ${pct.toFixed(1).padStart(5)}%  ${row.fn}${loc}`,
  );
}

// best-effort cleanup: leave the file on disk so the caller can re-inspect
// it. Print its basename so the engineer can find it without the full path.
console.log(`profile basename: ${basename(profilePath)}`);

// Optional: allow `--cleanup` flag to remove the .cpuprofile on success.
// Default behavior is to keep it (the task spec is parse-then-show, not
// parse-and-delete).
if (argv.includes("--cleanup")) {
  try {
    unlinkSync(profilePath);
  } catch {
    /* best effort */
  }
}

// exit with the workload's status so CI sees the right code even after
// the diagnostic output above.
process.exit(exitCode);