#!/usr/bin/env node
// Runs one ACT-082 discovery probe against ONE engine, so the row's own
// instrument produces BOTH legs of the parity comparison.
//
// The ACT-082 probes name their engine manifest in one line and their output
// directory in one line. This runner copies the probe with those two lines
// rewritten, so the probe's own body runs UNCHANGED: the measurement stays
// the probe's, and the only difference between the two legs is the engine.
//
//   node tools/smell-act082-legs/run-leg.mjs <probe-basename> <ts|ruby33> <out-dir>
//
// The copy is written BESIDE the original (a dot-prefixed name the repo
// ignores) because the probe's relative imports ("./lib/launch.mjs",
// "../../tools/...") resolve from its own directory; a copy elsewhere would
// break them.
//
// The engines are the repo's own manifests:
//   reference-harness/browser/engines/ts.json       the port, served from this
//                                                      checkout's dist/ build
//   reference-harness/browser/engines/ruby33.json   the pinned Ruby 3.3
//                                                      oracle, on the machine's
//                                                      own pinned gem home
//
// The tree must be built first (`node tools/dist/build-engine.mjs`), and the
// oracle app's public/mod directory must exist (the engine serves the mods'
// public files from it).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const browserDir = path.join(repo, "reference-harness", "browser");

const [probe, engine, outDir] = process.argv.slice(2);
if (!probe || !engine || !outDir) {
  console.error("usage: run-leg.mjs <probe-basename> <ts|ruby33> <out-dir>");
  process.exit(2);
}
if (!["ts", "ruby33"].includes(engine)) {
  console.error(`unknown engine: ${engine} (want ts or ruby33)`);
  process.exit(2);
}
const source = path.join(browserDir, probe);
if (!existsSync(source)) {
  console.error(`probe not found: ${source}`);
  process.exit(2);
}

const manifestPath = path.join(browserDir, "engines", `${engine}.json`);
if (!existsSync(manifestPath)) {
  console.error(`engine manifest not found: ${manifestPath}`);
  process.exit(2);
}

let body = readFileSync(source, "utf8");
const manifestLine = /const engineManifest = path\.join\(repo, "reference-harness", "browser", "engines", "[^"]+\.json"\);/;
if (!manifestLine.test(body)) {
  console.error(`probe does not name an engine manifest the way this runner expects: ${source}`);
  process.exit(2);
}
body = body.replace(manifestLine, `const engineManifest = path.join(repo, "reference-harness", "browser", "engines", "${engine}.json");`);

const outLine = /const out = path\.resolve\(([^)]*)\);/;
if (!outLine.test(body)) {
  console.error(`probe does not name an output directory the way this runner expects: ${source}`);
  process.exit(2);
}
body = body.replace(outLine, `const out = path.resolve(${JSON.stringify(outDir)});`);

const copy = path.join(browserDir, `.act082-leg-${probe.replace(/\.mjs$/, "")}-${engine}.mjs`);
mkdirSync(path.dirname(path.resolve(outDir)), { recursive: true });
writeFileSync(copy, body);
await import(`file://${copy.replace(/\\/g, "/")}`);
