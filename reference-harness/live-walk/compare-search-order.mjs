#!/usr/bin/env node
// compare-search-order.mjs — the live-walk CLI for the search-order
// comparison module (lib/search-order-compare.mjs).
//
//   node reference-harness/live-walk/compare-search-order.mjs \
//     --host-a http://127.0.0.1:5001 --host-b http://127.0.0.1:5002 \
//     [--out tmp/search-order/report.json] \
//     [--terms "T,Memo,Topic 003"] \
//     [--partial "Topic,Memo"] [--exact "Topic 003"] [--no-letters] \
//     [--timeout-ms 15000]
//
// The default probe list is each letter a–z plus the module's default
// partial words plus the default exact name (lib/search-order-compare.mjs).
// --terms replaces the whole list; --partial/--exact/--no-letters adjust
// its parts.
//
// It walks both hosts' search surfaces — the navbox autocomplete and the
// search results page — strictly sequentially (a person typing, not a load
// test), prints one verdict line per probe term per surface, names the
// card-set discrepancy (cards only on one host) separately, and writes the
// full ordered captures + verdicts as JSON when --out is given.
//
// This tool talks to whatever two base URLs you hand it. Every proof in this
// repository runs it against local engines this session booted; pointing it
// at a live host is the operator's separate, approved action.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defaultProbeTerms, walkAndCompare, verdictLinesForProbe } from "./lib/search-order-compare.mjs";

function parseArgs(argv) {
  const args = { letters: true };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    if (key === "no-letters") { args.letters = false; i -= 1; continue; }
    args[key] = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args["host-a"] || !args["host-b"]) {
  console.error("usage: compare-search-order.mjs --host-a <base> --host-b <base> [--out report.json] [--terms list|] [--partial list] [--exact name] [--no-letters] [--timeout-ms n]");
  process.exit(2);
}

let terms;
if (args.terms !== undefined) {
  terms = args.terms === "" ? [] : String(args.terms).split(",").map((t) => t.trim()).filter(Boolean);
} else {
  terms = defaultProbeTerms({
    letters: args.letters !== false,
    partialWords: args.partial !== undefined ? String(args.partial).split(",").map((t) => t.trim()).filter(Boolean) : undefined,
    exactName: args.exact,
  });
}

const report = await walkAndCompare(args["host-a"], args["host-b"], {
  terms,
  timeoutMs: args["timeout-ms"] ? Number(args["timeout-ms"]) : undefined,
});

console.log(`search-order walk: host A ${report.hostA}  vs  host B ${report.hostB}`);
for (const side of ["A", "B"]) {
  const d = report.discovery[side];
  console.log(`  host ${side}: completepath=${d.completepath ?? "(none)"} formAction=${d.formAction ?? "(none)"} ok=${d.ok}${d.error ? ` error=${d.error}` : ""}${d.homeStatus ? ` homeStatus=${d.homeStatus}` : ""}`);
}
if (report.discoveryFailed) {
  console.error(`discovery failed on host(s) ${report.discoveryFailed.join(", ")} — nothing compared`);
  process.exit(1);
}
if (report.discovery.endpointDifference) {
  console.log(`  NOTE the hosts declare different search endpoints: ${JSON.stringify(report.discovery.endpointDifference)}`);
}

for (const probe of report.probes) {
  console.log(`probe ${JSON.stringify(probe.term)}:`);
  for (const line of verdictLinesForProbe(probe)) console.log(line);
}

console.log(`summary: ${JSON.stringify(report.summary)} over ${report.probes.length} probe terms x 2 surfaces`);

if (args.out) {
  mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(report, null, 1)}\n`);
  console.log(`report written: ${args.out}`);
}
