// dual-lane-direct-runner.mjs -- 2026-10-01 direct grade runner entry
// (direct-runner-builder lane).
//
// One worker child. Boots the engine graph once, grades the shard LIST it is
// given, writes the same artifacts the vitest instrument writes, exits with
// the same codes. The vitest spec (tools/oracle/verify-dual-lane.test.ts)
// stays in the tree untouched as the parity oracle.
//
// WHY A SEPARATE ENTRY POINT RATHER THAN A FLAG ON THE EXISTING DRIVER
//   tools/dual-lane-verifier-fast.mjs is the production harness: its child
//   shape, kill scoping, staged-spec integrity refusal, and artifact resume
//   keys are load-bearing for the completed earlier grades. This lane
//   was told not to modify existing production harness entry points, and the
//   direct runner needs different scheduling anyway (a weighted queue handed
//   to a fixed worker pool, instead of a fixed phase list dispatched 2 at a
//   time), so it lands beside the driver with its own invocation and its own
//   artifacts directory. Nothing here is on the path the existing grades ran.
//
// USAGE
//   node tools/oracle/dual-lane-direct-runner.mjs --repo <repo> \
//        --files recapture-raw-shard-000047.jsonl [--label w3] \
//        [--artifacts <dir>] [--aggregate-out <file>] [--report-only]
//
//   With no --files, the union of both lanes' shard files is graded, the same
//   default the spec uses when DUAL_LANE_FILES is unset.
//
// ENVIRONMENT (identical to the spec's contract, so a child is substitutable)
//   DUAL_LANE_FILES           comma-separated shard names; overrides --files
//   DUAL_LANE_REPORT_ONLY     "1" -> totals + aggregate, never a gate failure
//   DUAL_LANE_TSC_CACHE_DIR   transform cache dir (see typescript-source-loader)
//
// EXIT CODES
//   0   graded, and in hard-gate mode every gate condition held
//   1   the gate failed, or the grade threw (the vitest spec's failure codes)
//   2   bad arguments / unresolvable shard list
//
// STDOUT
//   The spec's own lines, verbatim: `coverage shard=...`, `SEED-WARM ms=...`,
//   `VIEW-LANE aggregate:` + JSON, `VIEW-LANE failure signatures: ...`,
//   `PAGE-LANE aggregate:` + JSON, `PAGE-LANE failure signatures: ...`,
//   `PAGE-LANE expected metadata ...`, `aggregate written: ...`, plus one
//   runner-only `RUNNER-TIMING` line. The old driver's brace-matched scraper
//   (tools/dual-lane-verifier-fast.mjs:436) reads the two aggregate labels
//   out of a child's stdout, so this child's output is drop-in for it.
//
//   `RUNNER-TIMING` is printed from a `finally`, so it is emitted on BOTH the
//   success path and the throw path, and carries `outcome=ok|threw`. A run that
//   fails the hard gate therefore still reports its boot/seed/render split, its
//   peak RSS, and the per-lane pass/entry/fail counts that decided the gate.

import { register } from "node:module";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

function fail(msg, code = 2) {
  console.error(`dual-lane-direct-runner: ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = {
    repo: process.cwd(),
    files: null,
    label: null,
    artifacts: null,
    aggregateOut: null,
    reportOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) fail(`missing value for ${a}`);
      return argv[i];
    };
    if (a === "--repo") opts.repo = path.resolve(next());
    else if (a === "--files")
      opts.files = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--label") opts.label = next();
    else if (a === "--artifacts") opts.artifacts = path.resolve(next());
    else if (a === "--aggregate-out") opts.aggregateOut = path.resolve(next());
    else if (a === "--report-only") opts.reportOnly = true;
    else fail(`unknown argument: ${a}`);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

// The env contract the spec already honours. --files only fills it in when the
// caller did not set it, so an inherited DUAL_LANE_FILES still wins.
if (opts.files !== null && process.env.DUAL_LANE_FILES === undefined) {
  process.env.DUAL_LANE_FILES = opts.files.join(",");
}
if (opts.reportOnly && process.env.DUAL_LANE_REPORT_ONLY === undefined) {
  process.env.DUAL_LANE_REPORT_ONLY = "1";
}

const bootT0 = Date.now();
// The loader supplies the two things vitest used to supply: `.js` -> `.ts`
// resolution and the TypeScript transform. It is vite's own transformer, the
// one vitest resolves TS through. See typescript-source-loader.mjs for why
// neither of Node's two built-in TypeScript modes can run this graph.
register("./typescript-source-loader.mjs", import.meta.url);

const { runDirectGrade, directRunResourceSnapshot } = await import(
  pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "dual-lane-direct-runner-core.ts")).href
);

// The timing report runs in a `finally`, and its numbers come from the core's
// module-level snapshot rather than from a returned result object. Both halves
// matter: `runDirectGrade` THROWS on the hard gate (the four assertions at
// core.ts's gate block) instead of returning a failed result, so a report that
// reads the return value never runs for a run that failed -- which is exactly
// the run whose resource profile you need. The W=8 probe measured nothing
// because of this: 8 workers reached the gate, every one threw, and
// `grep -c RUNNER-TIMING driver.log` returned 0 (w8-scaling-probe-lane.md
// Limitation 1).
//
// One line, one format, both paths: the success and failure lines are built by
// the same expression, so they cannot drift apart in shape. `outcome=` is the
// only difference, and `started=0` marks the case where the core never got far
// enough to measure anything (an import or boot failure), so a zeros line is
// never mistaken for a measured run.
let exitCode = 1;
let thrown = null;
try {
  const result = await runDirectGrade({
    repoRoot: opts.repo,
    aggregateOut: opts.aggregateOut ?? undefined,
    artifactDir: opts.artifacts ?? undefined,
    label: opts.label ?? undefined,
  });
  exitCode = result.exit;
} catch (err) {
  thrown = err;
} finally {
  try {
    const s = directRunResourceSnapshot();
    const totals = (t) => (t === null ? "n/a" : `${t.pass}/${t.entries}`);
    console.log(
      `RUNNER-TIMING label=${opts.label ?? "direct"} outcome=${thrown === null ? "ok" : "threw"} ` +
        `started=${s.started ? 1 : 0} boot_ms=${Date.now() - bootT0} ` +
        `seed_warm_ms=${s.seedWarmMs} render_ms=${s.renderMs} ` +
        `total_ms=${s.totalMs} ` +
        `peak_rss_mb=${(s.peakRssBytes / 1024 / 1024).toFixed(1)} ` +
        `heap_cap_mb=${process.env.DIRECT_RUNNER_HEAP_MB ?? "?"} ` +
        `view=${totals(s.view)} view_fail=${s.view === null ? "n/a" : s.view.fail} ` +
        `page=${totals(s.page)} page_fail=${s.page === null ? "n/a" : s.page.fail} ` +
        `shards=${s.shards}`,
    );
  } catch (snapErr) {
    // A reporting failure must never change the verdict or hide the real
    // error; the throw below is the thing the operator has to see.
    console.error(`RUNNER-TIMING-ERROR ${snapErr?.message ?? String(snapErr)}`);
  }
}

if (thrown !== null) {
  console.error(`RUNNER-ERROR ${thrown?.stack ?? thrown?.message ?? String(thrown)}`);
}
process.exit(exitCode);
