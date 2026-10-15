#!/usr/bin/env node
// Reruns every browser check:
//   1. the journeys on stock Ruby Decko (the reference),
//   2. the same journeys on the TypeScript port,
//   3. the comparison, journey by journey,
//   4. Decko's own @javascript cucumber scenarios on stock Ruby Decko.
//
//   node reference-harness/browser/run-all.mjs --out <dir> [--decko <decko git checkout>]
//     [--filter <regex>] [--shards <n>] [--ts-shards <n>] [--build 0] [--summary <file.md>] [--report-only 1]
//
// --decko names a checkout of the decko repository (its v0.20.0 tag supplies
// the feature files); without it step 4 is skipped and says so. Results:
// <out>/ruby, <out>/ts, <out>/report.json, <out>/cucumber/summary.json.
// --summary also writes a Markdown table of the run (date, command, each
// journey's outcome on both engines and in the comparison).
//
// Steps 1 and 2 run side by side. Each engine's journeys are split over
// --shards (Ruby, default 4) and --ts-shards (default 1) runner processes;
// every journey still runs alone on its own deck copy, server and browser.
// A Ruby server takes most of a minute to boot, which is why its journeys
// are sharded; the port's take seconds.
//
// Needs the Ruby oracle app's gems (bundler finds them as usual, e.g. through
// BUNDLE_PATH), an installed Chrome, Edge or Chromium, and playwright-core
// (a dev dependency; HARNESS_PLAYWRIGHT_CORE overrides it). Unless --build 0,
// the port is first built into dist/ (tsc -p tsconfig.json, plus the vendored
// asset-source snapshots the dist modules import).

import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const harness = path.resolve(here, "..");
const repo = path.resolve(harness, "..");

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, "")] = argv[i + 1];
if (!args.out) throw new Error("--out <dir> is required");
const out = path.resolve(args.out);
mkdirSync(out, { recursive: true });
const startedAt = new Date();

function step(title, command, commandArgs, options = {}) {
  console.log(`\n== ${title}`);
  const r = spawnSync(command, commandArgs, { stdio: "inherit", windowsHide: true, ...options });
  if (r.status !== 0) throw new Error(`${title} exited ${r.status}`);
}

function runNode(script, scriptArgs, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...scriptArgs], { stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
    child.stdout.setEncoding("utf8");
    let pending = "";
    child.stdout.on("data", (chunk) => {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop();
      for (const line of lines) console.log(`[${label}] ${line}`);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (pending) console.log(`[${label}] ${pending}`);
      if (code === 0) resolve();
      else reject(new Error(`${label} exited ${code}`));
    });
  });
}

// --report-only 1 skips the build and the runs: it compares the results
// already in <out> and rewrites the summary.
const reportOnly = args["report-only"] === "1";
if (!reportOnly && args.build !== "0") {
  step("build the complete engine distribution", process.execPath, [path.join(repo, "tools/dist/build-engine.mjs")], { cwd: repo });
}

// The mods' public files (TinyMCE's theme, ace's modes) must be in place
// before any server starts: both engines serve them from the oracle app's
// public/mod, unless --decko names a checkout whose mod/*/public directories
// the TS engine serves instead.
if (args.decko) process.env.DECKO_MOD_PUBLIC_DIR ??= args.decko;
if (!reportOnly) {
  step("link the mods' public files into the oracle app", "bash", [path.join(here, "engines", "ruby-server.sh"), "--link-mods"]);
}

// TinyMCE finishes initializing outside jQuery's knowledge, and a cold Ruby
// page is slow enough that an editor step or an observation can land before
// it does: the editor's default content is then saved instead of the typed
// text, or a half-built toolbar is observed. The settled-editor mode waits
// for the editor on both engines (run-journeys.mjs, settle and setEditor).
process.env.HARNESS_EDITOR_SETTLE ??= "1";

const fixture = path.join(harness, "fixtures", "synthetic-v1");
const journeysFile = path.join(here, "journeys", "synthetic-v1.json");
const filter = args.filter ? ["--filter", args.filter] : [];
const shards = { ruby: Number(args.shards ?? 4), ts: Number(args["ts-shards"] ?? 1) };
if (!reportOnly) console.log(`\n== journeys on ruby (${shards.ruby} shards) and ts (${shards.ts} shards)`);
const runs = [];
const runId = randomUUID();
for (const engine of reportOnly ? [] : ["ruby", "ts"]) {
  for (let k = 0; k < shards[engine]; k++) {
    runs.push(
      runNode(
        path.join(here, "run-journeys.mjs"),
        [
          "--engine", path.join(here, "engines", `${engine}.json`),
          "--fixture", fixture,
          "--journeys", journeysFile,
          "--out", path.join(out, engine),
          "--shard", `${k}/${shards[engine]}`,
          "--run-id", runId,
          ...filter,
        ],
        shards[engine] > 1 ? `${engine} ${k}` : engine,
      ),
    );
  }
}
await Promise.all(runs);

const comparison = spawnSync(process.execPath, [
  path.join(here, "compare-journeys.mjs"),
  "--expected", path.join(out, "ruby"),
  "--actual", path.join(out, "ts"),
  "--report", path.join(out, "report.json"),
  "--journeys", journeysFile, "--fixture", fixture,
  "--candidate", args.candidate ?? spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8", windowsHide: true }).stdout.trim(),
  ...filter,
], { stdio: "inherit", windowsHide: true });
if (comparison.status !== 0) process.exitCode = comparison.status ?? 1;

if (args.summary) {
  writeSummary(path.resolve(args.summary));
  console.log(`\nsummary written to ${path.relative(repo, path.resolve(args.summary))}`);
}

if (args.decko) {
  step("Decko's cucumber browser scenarios on stock Ruby", process.execPath, [
    path.join(here, "cucumber", "run-features.mjs"),
    "--decko", args.decko,
    "--out", path.join(out, "cucumber"),
  ]);
} else {
  console.log("\n== Decko's cucumber browser scenarios: SKIPPED (no --decko checkout given)");
}

function writeSummary(file) {
  const { journeys } = JSON.parse(readFileSync(journeysFile, "utf8"));
  const report = JSON.parse(readFileSync(path.join(out, "report.json"), "utf8"));
  const result = (engine, id) => {
    try {
      return JSON.parse(readFileSync(path.join(out, engine, `${id}.json`), "utf8"));
    } catch {
      return null;
    }
  };
  const ran = (r) => {
    if (!r) return "not run";
    if (r.completed) return "completed";
    const failed = r.steps?.find((s) => s.outcome === "failed");
    return failed ? `failed at step ${failed.i}` : `failed: ${String(r.error ?? "").slice(0, 60)}`;
  };
  const byId = Object.fromEntries(report.perJourney.map((j) => [j.id, j]));
  const rows = [];
  let rubyDone = 0;
  let tsDone = 0;
  let selected = 0;
  const filterRe = args.filter ? new RegExp(args.filter) : null;
  for (const j of journeys) {
    if (filterRe && !filterRe.test(j.id)) continue;
    selected++;
    const r = result("ruby", j.id);
    const t = result("ts", j.id);
    if (r?.completed) rubyDone++;
    if (t?.completed) tsDone++;
    const c = byId[j.id];
    const status = c ? c.status : "not compared";
    const differs = c?.failed?.length ? c.failed.join("; ") : "";
    rows.push(`| ${j.id} | ${ran(r)} | ${ran(t)} | ${status} | ${differs.replace(/\|/g, "\\|")} |`);
  }
  const date = startedAt.toISOString().slice(0, 10);
  const rubyVersion = spawnSync("bash", ["-c", "bundle exec ruby -e 'print RUBY_VERSION'"], {
    cwd: path.join(harness, "oracle", "app"),
    encoding: "utf8",
    windowsHide: true,
  }).stdout?.trim();
  // The declared oracle runtime is Ruby 3.3 (docs/parity-method.md).
  const runtimeNote =
    rubyVersion && !rubyVersion.startsWith("3.3.")
      ? [
          "",
          `The reference ran on Ruby ${rubyVersion}; the declared oracle runtime is Ruby 3.3`,
          "(`docs/parity-method.md`).",
        ]
      : [];
  // How an unhandled exception is answered on each side, so the
  // keyword-search pages are read correctly.
  const errorPageNote = [
    "",
    "Error pages: both sides answer an unhandled exception the way a deployed",
    "site does. The Ruby server runs with Decko's production error handling",
    "(`rescue_all_in_controller` on, `consider_all_requests_local` off, as",
    "`tools/parity-side-effects/ruby/drive.rb` sets them), so a plain keyword",
    "search on SQLite (the `match` raise in card's ActiveRecord patch) answers",
    "Decko's `:server_error` view under the page layout, status 500. The port's",
    "Node host renders that page through the engine with `:server_error` as the",
    "root view. No recorded page is copied and no comparison rule applies to it.",
  ];
  const extra = Object.entries(args)
    .filter(([k]) => !["out", "summary", "report-only"].includes(k))
    // A checkout path is this machine's, not part of the command's meaning.
    .map(([k, v]) => `--${k} ${k === "decko" ? "<decko checkout>" : /^[\w./:-]+$/.test(v) ? v : `'${v}'`}`);
  const command = `npm run test:browser-journeys${extra.length ? ` -- ${extra.join(" ")}` : ""}`;
  const md = [
    "# Browser journeys",
    "",
    "The journeys in `reference-harness/browser/journeys/synthetic-v1.json` are user",
    "flows written as plain data. Each one runs in a hidden (headless) browser with",
    "a throwaway profile, on a fresh copy of the synthetic deck, once against stock",
    "Ruby Decko (decko 0.20.0, card 1.110.0; the reference) and once against this",
    "port's Node host. The comparison then grades every observation (address, text,",
    "structure, form fields), the mail sent and the row delta in the card tables.",
    "`reference-harness/SPEC.md` section 8 defines the method.",
    "",
    "## Last run",
    "",
    `- Date: ${date}`,
    `- Command: \`${command}\``,
    `- Reference runtime: Ruby ${rubyVersion || "(unknown)"}`,
    `- Journeys: ${selected}`,
    `- Completed on Ruby: ${rubyDone} / ${selected}`,
    `- Completed on the port: ${tsDone} / ${selected}`,
    `- Comparison: ${report.journeys.pass} / ${report.journeys.graded} graded journeys pass` +
      ` (${report.journeys.total - report.journeys.graded} not graded: a journey that fails on the reference is not graded)`,
    ...runtimeNote,
    ...errorPageNote,
    "",
    "Per graded item:",
    "",
    "| item | pass | total |",
    "|---|---|---|",
    ...Object.entries(report.kinds).map(([k, v]) => `| ${k} | ${v.pass} | ${v.total} |`),
    "",
    "## Per journey",
    "",
    "| journey | Ruby | port | comparison | items that differ |",
    "|---|---|---|---|---|",
    ...rows,
    "",
    "## Reproducing",
    "",
    "Needs Ruby with the oracle app's gems installed (`reference-harness/oracle/app`;",
    "point bundler at them with `BUNDLE_PATH` if they are not in the default gem",
    "path), Node 22.5 or later, and an installed Chrome, Edge or Chromium",
    "(`HARNESS_CHROME` names one explicitly). Nothing is downloaded and no window",
    "opens. Per-journey results, server logs and `report.json` land in",
    "`tmp/browser-journeys/`.",
    "",
  ].join("\n");
  writeFileSync(file, md);
}
