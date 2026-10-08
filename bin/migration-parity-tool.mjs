#!/usr/bin/env node
// migration-parity-tool.mjs — one-command front door for the Decko migration parity checker.
//
//   "We port your Decko site to TypeScript and tell you how many pages are not byte-identical."
//
// Plan: deliverables/migration-parity-tool-PLAN.md   Docs:
//
// Status (honest): this scaffold validates inputs, prints or runs the EXISTING proven stage
// commands, and fails with a named missing-inputs list. It does not yet run end-to-end against
// a third-party site: stage 1's capture driver and stage 4's classifier are proven lane tooling
// not yet moved into this repo (PLAN.md gaps G1–G5). Tracked stages (import, staging server)
// are wired to their real, verified CLIs.

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXIT_OK,
  EXIT_USAGE,
  policyCheckMain,
  shadowMain,
  shadowUsage,
} from "./migration-parity-shadow.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Proven lane tooling not yet productized (PLAN.md G2/G4): default locations
// where the instruments live. Both are in-repo paths, so they resolve against
// THIS checkout rather than the per-lane worktree that produced the 2026-10-02
// oracle run -- that worktree (decko-ts-lane-final-dataset) has since been
// removed from this machine, and the absolute default made every invocation
// point at a directory that no longer exists. Each stays overridable through
// its PARITY_* env var (lines 111-113), so a deliberately-chosen instrument
// elsewhere is still reachable.
const LANE_WORKTREE_DEFAULT = path.join(
  REPO,
  "fixtures",
  "corpus-v2",
  "live-recapture-2026-10-02",
);
const LANE_DRIVER_DEFAULT = path.join(REPO, "tools", "oracle", "dual-lane-direct-driver.mjs");

function usage(exitCode = EXIT_OK) {
  const lines = [
    "Usage: node bin/migration-parity-tool.mjs <command> [options]",
    "",
    "Commands:",
    "  run      One-command migration parity check: capture -> import -> render -> compare.",
    "           We port your Decko site to TypeScript and tell you how many pages are not",
    "           byte-identical. (see the run section below)",
    "  shadow   Cutover-readiness shadow run: BASE vs CANDIDATE engine checkouts over a",
    "           LOCAL MIRROR deck (zero live-site requests), routing-policy sampling,",
    "           ENGINE-GAP vs CONTENT-CHANGED classification, N-consecutive-clean-runs gate.",
    "           DRY-RUN BY DEFAULT (see --help below: node bin/migration-parity-tool.mjs shadow --help).",
    "  policy   Validate a shadow routing-policy file: policy --check <file> [--sample-path /Name].",
    "",
    "run — one-command parity check",
    "  node bin/migration-parity-tool.mjs run --site <slug> --targets <targets.tsv>",
    "       (--dump <file.sql> | --source <deck.sqlite>) --out <run-dir> [options]",
    "",
    "Stages (all built from existing proven machinery; see deliverables/migration-parity-tool-PLAN.md):",
    "  1 CAPTURE  fetch the live site's public pages, byte-exact, sha256-bound (read-only GETs)",
    "  2 IMPORT   site dump -> SQLite via tools/migrate (verified count/checksum parity)",
    "  3 RENDER   boot the TS engine on the imported deck (vm-staging-server.mjs)",
    "  4 COMPARE  byte-diff rendered vs captured; classify ENGINE-GAP vs CONTENT-CHANGED; report",
    "",
    "Required for a full run:",
    "  --site <slug>         Site label (e.g. wikirate); names the run and the report",
    "  --targets <file>      TSV of pages to check: slug <TAB> url (one per line)",
    "  --dump <file>         mysqldump of the site (stage 2 path A) — or --source below",
    "  --source <file>       Existing SQLite deck of the site (stage 2 path B)",
    "  --out <dir>           Run directory for capture, deck, and report artifacts",
    "",
    "Partial modes:",
    "  --capture-only        Stop after stage 1 (capture log + page bodies only)",
    "  --report-only         Re-grade an existing run directory (--run-dir <dir>)",
    "  --dry-run             Print the exact stage commands; execute nothing",
    "",
    "Options:",
    "  --run-dir <dir>           Existing run dir (required with --report-only)",
    "  --capture-instrument <path>  Capture driver override (default: proven lane tooling, see docs)",
    "  --classifier <path>       Three-way analyzer override (default: proven lane tooling)",
    "  --direct-driver <path>    Grading driver override (default: proven lane tooling)",
    "  --staging-port <n>        Port for the render staging server (default 3100)",
    "  --workers <n>             Render/grade workers (default 8)",
    "  --help, -h                This help",
    "",
    "Examples:",
    "  node bin/migration-parity-tool.mjs run --site wikirate --targets wikirate-targets.tsv \\",
    "      --dump wikirate-dump.sql --out runs/wikirate-2026-10-03 --dry-run",
    "  node bin/migration-parity-tool.mjs run --site wikirate --targets t.tsv \\",
    "      --source deck.sqlite --out runs/wr --capture-only",
    "  node bin/migration-parity-tool.mjs run --report-only --run-dir runs/wikirate-2026-10-03",
    "",
  ];
  console.log(lines.join("\n"));
  return exitCode;
}

function fail(msg, exitCode = EXIT_USAGE) {
  console.error(`migration-parity-tool: ${msg}`);
  process.exit(exitCode);
}

// ---------- arg parsing ----------

function parseArgs(argv) {
  const opts = {
    site: null,
    targets: null,
    dump: null,
    source: null,
    out: null,
    runDir: null,
    captureOnly: false,
    reportOnly: false,
    dryRun: false,
    captureInstrument: process.env.PARITY_CAPTURE_INSTRUMENT || path.join(LANE_WORKTREE_DEFAULT, "capture-live-pages-culturesmith-2026-10-02.mjs"),
    classifier: process.env.PARITY_CLASSIFIER || path.join(LANE_WORKTREE_DEFAULT, "analyze-live-oracle-three-way.mjs"),
    directDriver: process.env.PARITY_DIRECT_DRIVER || LANE_DRIVER_DEFAULT,
    stagingPort: 3100,
    workers: 8,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) fail(`flag ${a} needs a value (see --help)`);
      i += 1;
      return v;
    };
    switch (a) {
      case "--site": opts.site = next(); break;
      case "--targets": opts.targets = next(); break;
      case "--dump": opts.dump = next(); break;
      case "--source": opts.source = next(); break;
      case "--out": opts.out = next(); break;
      case "--run-dir": opts.runDir = next(); break;
      case "--capture-only": opts.captureOnly = true; break;
      case "--report-only": opts.reportOnly = true; break;
      case "--dry-run": opts.dryRun = true; break;
      case "--capture-instrument": opts.captureInstrument = next(); break;
      case "--classifier": opts.classifier = next(); break;
      case "--direct-driver": opts.directDriver = next(); break;
      case "--staging-port": opts.stagingPort = Number(next()); break;
      case "--workers": opts.workers = Number(next()); break;
      default: fail(`unknown argument: ${a} (see --help)`);
    }
  }
  return opts;
}

// ---------- input validation ----------

function requireFile(label, p, problems) {
  if (!p) {
    problems.push(`  missing --${label.toLowerCase().includes("dump") ? "dump" : label}: ${label} not provided`);
    return;
  }
  if (!existsSync(p)) {
    problems.push(`  ${label}: file not found: ${p}`);
    return;
  }
  if (!statSync(p).isFile()) problems.push(`  ${label}: not a file: ${p}`);
}

function validate(opts) {
  const problems = [];
  if (opts.reportOnly) {
    if (!opts.runDir) {
      problems.push("  --report-only needs --run-dir <existing run directory>");
    } else if (!existsSync(opts.runDir)) {
      problems.push(`  --run-dir: directory not found: ${opts.runDir}`);
    } else {
      for (const art of ["capture-log.jsonl", "targets.tsv"]) {
        const p = path.join(opts.runDir, art);
        if (!existsSync(p)) {
          problems.push(`  --run-dir: missing artifact ${art} (expected at ${p})`);
        }
      }
    }
    return problems;
  }

  if (!opts.site) problems.push("  --site <slug> not provided (e.g. --site wikirate)");
  requireFile("targets", opts.targets, problems);
  if (opts.captureOnly) {
    return problems; // capture-only stops after stage 1: site data is not needed yet
  }
  if (opts.dump && opts.source) {
    problems.push("  provide ONE of --dump or --source, not both");
  } else if (!opts.dump && !opts.source) {
    problems.push("  site data missing: provide --dump <mysqldump.sql> or --source <deck.sqlite>");
  } else {
    if (opts.dump) requireFile("dump", opts.dump, problems);
    if (opts.source) requireFile("source", opts.source, problems);
  }
  if (!opts.out) problems.push("  --out <run-dir> not provided");
  return problems;
}

function checkInstrument(label, p, provenance, problems) {
  if (!existsSync(p)) {
    problems.push(
      `  ${label} not found: ${p}\n` +
      `    (${provenance})\n` +
      `    Supply it via the corresponding override flag, or see PLAN.md gap G2.`
    );
  }
}

// ---------- stage plan ----------

function buildStages(opts) {
  const node = process.execPath;
  const stages = [];

  if (!opts.reportOnly) {
    stages.push({
      n: 1,
      label: "CAPTURE — live site, byte-exact, read-only GETs",
      instrument: opts.captureInstrument,
      cmd: [node, opts.captureInstrument, "--targets", opts.targets],
      note:
        "Proven instrument (247-request oracle run). It is sequential, polite, cookie-jar'd, and " +
        "records sha256/fetchedAt/status per request. Productization tracked as PLAN.md G2.",
    });
    const importCmd = opts.dump
      ? [node, path.join(REPO, "tools", "migrate", "migrate.mjs"), "--dump", opts.dump, "--out", path.join(opts.out, "deck.sqlite"), "--verify"]
      : [node, path.join(REPO, "tools", "migrate", "migrate-generalized.mjs"), "--source", opts.source, "--out", path.join(opts.out, "deck.sqlite"), "--verify"];
    stages.push({
      n: 2,
      label: "IMPORT — site data into this engine (verified count/checksum parity)",
      instrument: importCmd[1],
      cmd: importCmd,
      note: "Tracked, proven on a 1.2 GiB dump and a 49,829-card corpus. Add --engine-verify for spot-render checks.",
    });
    stages.push({
      n: 3,
      label: "RENDER — boot the TS engine on the imported deck",
      instrument: path.join(REPO, "vm-staging-server.mjs"),
      cmd: [node, path.join(REPO, "vm-staging-server.mjs"), path.join(opts.out, "deck.sqlite"), String(opts.stagingPort)],
      note: "Long-running staging server on the port shown; grading drivers point at it. Ctrl-C when done.",
    });
    if (opts.captureOnly) stages.length = 1; // capture-only keeps ONLY stage 1
  }

  if (!opts.captureOnly) {
    stages.push({
      n: 4,
    label: "COMPARE + REPORT — byte-diff, ENGINE-GAP vs CONTENT-CHANGED classification",
    instrument: opts.reportOnly ? opts.classifier : opts.directDriver,
    cmd: opts.reportOnly
      ? [node, opts.classifier] // analyzer reads capture-log.jsonl/targets.tsv next to itself
      : [node, opts.directDriver, "--repo", REPO, "--workers", String(opts.workers), "--report-only"],
    note: opts.reportOnly
      ? "Analyzer is directory-coupled: it reads capture-log.jsonl and targets.tsv from its own directory. Copy it into the run dir (or point --classifier at an in-dir copy) — packaging gap G4."
      : "Report-only grading pass ranks failures without spawning engine boots; full grading reruns the driver without --report-only.",
    });
  }

  return stages;
}

// ---------- main ----------

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
  process.exit(usage(0));
}
if (argv[0] === "shadow") {
  process.exit(await shadowMain(argv.slice(1)));
}
if (argv[0] === "policy") {
  process.exit(policyCheckMain(argv.slice(1)));
}
if (argv[0] !== "run") {
  fail(`first argument must be "run", "shadow", or "policy" (got ${JSON.stringify(argv[0])}). See --help.`);
}

const opts = parseArgs(argv.slice(1));
const problems = validate(opts);
if (problems.length > 0) {
  console.error("MISSING INPUTS — the migration parity tool cannot start because:");
  console.error(problems.join("\n"));
  console.error("");
  console.error("Every stage behind this command already exists and is proven; see");
  console.error("deliverables/migration-parity-tool-PLAN.md for paths, provenance, and gaps.");
  process.exit(EXIT_USAGE);
}

// Instrument presence checks (after input validation so input errors are reported first).
const instProblems = [];
const stages = buildStages(opts);
for (const s of stages) checkInstrument(`stage ${s.n} instrument`, s.instrument, s.note, instProblems);
if (instProblems.length > 0) {
  console.error("INSTRUMENTS MISSING — stages are wired, but these proven pieces are not in place:");
  console.error(instProblems.join("\n"));
  process.exit(EXIT_USAGE);
}

console.log(`Migration parity run — site: ${opts.reportOnly ? opts.runDir : opts.site}`);
console.log(`Modes: ${[opts.reportOnly && "report-only", opts.captureOnly && "capture-only", opts.dryRun && "dry-run"].filter(Boolean).join(", ") || "full run"}\n`);

for (const s of stages) {
  const cmdLine = s.cmd.map((c) => (c.includes(" ") ? JSON.stringify(c) : c)).join(" ");
  if (opts.dryRun) {
    console.log(`[stage ${s.n}/4] (dry-run) ${cmdLine}`);
    console.log(`            ${s.note}`);
    continue;
  }
  console.log(`[stage ${s.n}/4] ${s.label}`);
  console.log(`  ${cmdLine}`);
  const r = spawnSync(s.cmd[0], s.cmd.slice(1), { stdio: "inherit" });
  if (r.error) fail(`stage ${s.n} failed to launch: ${r.error.message}`);
  if (r.status !== 0) fail(`stage ${s.n} exited ${r.status} — run artifacts kept in ${opts.out ?? opts.runDir}`);
  console.log("");
}

if (opts.dryRun) console.log("Dry run complete — nothing was executed.");
else console.log("Run complete. Report artifacts in " + (opts.out ?? opts.runDir));
