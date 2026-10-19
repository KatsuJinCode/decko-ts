// tools/perf/measure-bunny-edge-engine-boot-cost.mjs — what the edge bundle
// costs before it can serve a single request, and which modules pay for it.
//
// Bunny documents a 500 ms startup budget for an Edge Script (see
// deploy/bunny-edge-deployment-runbook.md, "Script size limit 10 MB; CPU 30
// s/request; memory 128 MB; 50 subrequests; startup 500 ms"). Every byte in
// the uploaded script is parsed and compiled on the isolate's first tick before
// any route runs, so boot cost is a function of bundle bytes — not of which
// routes a request touches. This script measures that cost so a proposal to
// lazy-load part of the graph can be judged against a number instead of an
// intuition.
//
// Three numbers per bundle, and they are different questions:
//
//   parse_ms    V8 parse + compile of the script text (SourceTextModule
//               construction). Nothing is linked and nothing runs. This is the
//               cost that a second chunk COULD defer, and it is also the cost
//               an in-place byte reduction removes.
//   (bare-specifier resolution is deliberately not timed: it is Node's own
//   module loader here, and the platform's loader on the edge runtime.)
//               Bunny SDK, node: builtins) against stubs. Cheap here; on the
//               real runtime it is the platform's own module resolution.
//   eval_ms     top-level execution: module-graph side effects — giant object
//               literals, `__commonJS` wrapper definitions, class bodies. This
//               is what actually executes on every cold isolate.
//
// Measured on Node's V8, which is NOT Bunny's V8 and not the Bunny isolate.
// Treat every figure here as RELATIVE RANKING, not as a prediction of the
// 500 ms budget. Only a staging probe
// (deploy/bunny-worker-src/bunny-edge-isolate-probe.ts, the x-decko-isolate
// header's perf_at_eval) produces the absolute number.
//
// Usage (SourceTextModule needs the vm-modules flag):
//   node --experimental-vm-modules tools/perf/measure-bunny-edge-engine-boot-cost.mjs [bundle...]
//   add --runs N to change the sample count (default 7)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import vm from "node:vm";

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i < 0 ? fallback : Number(process.argv[i + 1]);
}

if (typeof vm.SourceTextModule !== "function") {
  console.error("vm.SourceTextModule unavailable — run this with: node --experimental-vm-modules <script>");
  process.exit(2);
}

const RUNS = argValue("--runs", 7);
const DEFAULT_BUNDLES = [
  "deploy/dist/bunny-edge-engine.bundle.js",
  "deploy/dist/bunny-edge-read.bundle.js",
];
const bundles = process.argv.slice(2).filter((a) => !a.startsWith("--") && Number.isNaN(Number(a)));
const targets = bundles.length > 0 ? bundles : DEFAULT_BUNDLES;

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  return { median: s[Math.floor(s.length / 2)], min: s[0], max: s[s.length - 1] };
}

/** The bundle keeps `@bunny.net/edgescript-sdk` as a bare import, which nothing
 *  on this machine implements. Evaluation therefore runs in the REAL Node realm
 *  (not a vm context) with that one specifier rewritten to a local stub — Node's
 *  own `node:` builtins resolve as they do on the edge runtime, and
 *  DecompressionStream/Response are same-realm, which matters: the bundle's
 *  gzip-inline paths pump those streams at module evaluation and a cross-realm
 *  context deadlocks on them. `import * as SDK` then `SDK.net.http.serve(...)`
 *  is what both entries do, so the stub exports `net`. */
const STUB_SDK = "export const net = { http: { serve: () => {} } };\nexport default net;\nexport const serve = () => {};\n";

async function measure(path) {
  const source = readFileSync(path, "utf8");
  const bytes = Buffer.byteLength(source, "utf8");

  const parseSamples = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    // eslint-disable-next-line no-new
    new vm.SourceTextModule(source, { identifier: path });
    parseSamples.push(performance.now() - t0);
  }

  const stamp = path.replace(/[^a-zA-Z0-9]/g, "_");
  const sdkStub = resolve(import.meta.dirname ?? ".", `tmp/bootcost-sdk-stub-${stamp}.mjs`);
  const evalCopy = resolve(import.meta.dirname ?? ".", `tmp/bootcost-eval-${stamp}.mjs`);
  mkdirSync(dirname(sdkStub), { recursive: true });
  writeFileSync(sdkStub, STUB_SDK);
  // Only the SDK specifier is rewritten; node: builtins stay as the bundle
  // shipped them, so the graph under test is the deployed graph.
  const rewritten = source.replaceAll('from"@bunny.net/edgescript-sdk"', `from"./${basename(sdkStub)}"`);
  writeFileSync(evalCopy, rewritten);

  const evalSamples = [];
  let evalError = null;
  for (let i = 0; i < RUNS; i++) {
    // Cache-bust so each run re-evaluates rather than hitting Node's ESM cache.
    const spec = `${pathToFileURL(evalCopy).href}?run=${i}`;
    try {
      const t0 = performance.now();
      await import(spec);
      evalSamples.push(performance.now() - t0);
    } catch (err) {
      evalError = `${err.name}: ${err.message}`;
      break;
    }
  }
  return { path, bytes, parse: stats(parseSamples), eval: evalSamples.length ? stats(evalSamples) : null, evalError };
}

const results = [];
for (const target of targets) {
  const path = resolve(process.cwd(), target);
  let r;
  try {
    r = await measure(path);
  } catch (err) {
    console.error(`skip (unreadable): ${target} — ${err.message}`);
    continue;
  }
  results.push(r);
  const boot = r.eval ? r.parse.median + r.eval.median : null;
  console.log(`\n${target}`);
  console.log(`  bytes        ${r.bytes.toLocaleString()} (${(r.bytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  parse_ms     median ${r.parse.median.toFixed(1)}  [min ${r.parse.min.toFixed(1)} max ${r.parse.max.toFixed(1)}]  ${RUNS} runs, nothing linked or executed`);
  console.log(`  eval_ms      median ${r.eval ? r.eval.median.toFixed(1) : "NOT MEASURED"}  [top-level execution]`);
  if (r.evalError) console.log(`  eval_error   ${r.evalError}`);
  if (boot !== null) console.log(`  boot_ms      ${boot.toFixed(1)}  (parse + eval; the cold-isolate cost a second chunk could defer)`);
}

if (results.length > 0) {
  console.log(`\n--- boot cost summary (Node V8, median of ${RUNS} runs; relative ranking, NOT Bunny's V8) ---`);
  console.log("bundle".padEnd(44), "bytes".padStart(11), "parse_ms".padStart(10), "eval_ms".padStart(9), "boot_ms".padStart(9));
  for (const r of results) {
    const boot = r.eval ? (r.parse.median + r.eval.median).toFixed(1) : "n/a";
    console.log(
      r.path.slice(0, 43).padEnd(44),
      r.bytes.toLocaleString().padStart(11),
      r.parse.median.toFixed(1).padStart(10),
      (r.eval ? r.eval.median.toFixed(1) : "n/a").padStart(9),
      boot.padStart(9),
    );
  }
}