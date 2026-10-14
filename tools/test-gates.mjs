// Single source of truth for which tests run how often.
//
// The failure this exists to prevent: a test written to prove something about
// scale or the deployment got added and, because nothing asked, defaulted to
// running on every single change. Nobody decided that. It just happened, and it
// happened to ~79% of the suite's test time.
//
// The rule is: every test file belongs to exactly one gate, and a gate is a
// QUESTION, not a duration. "Is the product correct" runs constantly. "Does it
// survive a million rows", "does it survive the real edge runtime" and "does
// our tooling work" answer questions that do not change when someone fixes a
// typo, so they run at merge or on a schedule.
//
//   node tools/test-gates.mjs list          show every gate and its file count
//   node tools/test-gates.mjs run <gate>    run one gate through vitest
//   node tools/test-gates.mjs check         assert every file is classified
//
// `check` is wired into the correctness gate, so adding an unclassified test
// fails the suite instead of silently joining the constant path.

import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

// Ordered. First match wins, so specific rules must come before general ones.
export const GATES = [
  {
    id: "benchmarks",
    label: "BENCHMARKS - investigation tooling, not tests",
    when: "On demand, when investigating performance",
    // These are perf probes and diagnostic harnesses that happen to be named
    // *.test.ts. Eleven of them were running on every change and failing.
    // A file that exists to measure something is not a check that the product
    // is correct, and it should never be in the constant path.
    why: "They answer 'how fast is it', not 'is it right'. They fail without a live database, so in the constant path they were pure noise.",
    match: (p) => /^benchmarks\//.test(p),
  },
  {
    id: "harness",
    label: "Harness - our own agent tooling, not the product",
    when: "On demand / when the tooling itself changes",
    why: "A change to the wiki cannot break the process-killer or the lane runner. These only need to run when those tools change.",
    match: (p) =>
      /^tools\//.test(p) ||
      /dual-lane-verifier|lane-verifier|instrument-reliability|test-queue|kill-scoping|lane-job|cf-cost|reclaim|persist-write-probe|reference-harness/i.test(p),
  },
  {
    id: "capacity",
    label: "Capacity - proves scale, not correctness",
    when: "Nightly or on demand",
    why: "A million-row import must be proven, but it does not change when a view is edited. It costs seconds and proves nothing about a typo fix.",
    match: (p) =>
      /streaming-memory|importer-local-d1|d1-trickle|soak|\bsynthetic\b|fixture-sweep|deep-nesting|pair-chunk|\bbench\b|volume|throughput|1m-rows|million/i.test(p),
  },
  {
    id: "deploy",
    label: "Deployment - emulates the production edge runtime",
    when: "At merge",
    why: "These boot a copy of the serving environment. Correct and worth running before a change lands - but a copy of production does not need to boot every time a line is edited.",
    match: (p) =>
      /(^|\/)deploy\//.test(p) ||
      /workerd|miniflare|bunny-edge|cf-edge|edge-compiler|deploy-worker|compiled-script-bundle|cross-adapter-byte-parity|concurrent-saves|atomic-saves/i.test(p),
  },
  {
    id: "parity",
    label: "Parity - compares captured Ruby output byte for byte",
    when: "At merge",
    why: "Parity is the contract with the original. It is fast and it is precious, but it only moves when rendering changes, which is far rarer than any code change.",
    match: (p) =>
      /(^|\/)corpus\/|parity|oracle|capture|golden|replay/i.test(p),
  },
];

export const DEFAULT_GATE = "correctness";
const isTestFile = (name) => /\.(test|spec)\.(ts|mts|js|mjs|cjs)$/.test(name);

export function listTestFiles(dir = REPO_ROOT, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    // tmp/ is scratch: the gate's own working directories, and the vendored
    // gem tree an oracle checkout leaves there (bootstrap's jQuery specs are
    // `.spec.js`, which isTestFile accepts). No project suite lives under it.
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "tmp" || entry.name.startsWith(".git")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listTestFiles(full, out);
    else if (isTestFile(entry.name)) out.push(relative(REPO_ROOT, full).replace(/\\/g, "/"));
  }
  return out;
}

export function classify(relPath) {
  const gate = GATES.find((g) => g.match(relPath));
  return gate ? gate.id : DEFAULT_GATE;
}

function repoTestFiles() {
  return listTestFiles().sort();
}

function command() {
  const [verb, arg] = process.argv.slice(2);

  if (verb === "list" || !verb) {
    const files = repoTestFiles();
    const counts = new Map();
    for (const f of files) counts.set(classify(f), (counts.get(classify(f)) || 0) + 1);
    console.log(`${files.length} test files\n`);
    for (const g of GATES) {
      console.log(`  ${g.id.padEnd(11)} ${String(counts.get(g.id) || 0).padStart(4)} files   ${g.label}`);
      console.log(`  ${"".padEnd(11)} ${" ".repeat(4)} runs: ${g.when}`);
    }
    const dc = counts.get(DEFAULT_GATE) || 0;
    console.log(`  ${DEFAULT_GATE.padEnd(11)} ${String(dc).padStart(4)} files   everything else - the product's own behaviour`);
    console.log(`\n  ${((dc / files.length) * 100).toFixed(0)}% of files run on every change`);
    return;
  }

  if (verb === "check") {
    const files = repoTestFiles();
    const known = new Set(GATES.map((g) => g.id));
    const problems = [];
    for (const f of files) {
      const gate = classify(f);
      if (!known.has(gate) && gate !== DEFAULT_GATE) problems.push(`${f}: classified as unknown gate "${gate}"`);
    }
    if (problems.length) {
      console.error("test gate check FAILED:");
      for (const p of problems) console.error("  " + p);
      process.exit(1);
    }
    console.log(`test gate check OK - all ${files.length} test files are classified`);
    return;
  }

  if (verb === "run") {
    const gateId = arg;
    const known = new Set([...GATES.map((g) => g.id), DEFAULT_GATE, "full"]);
    if (!gateId || !known.has(gateId)) {
      console.error(`usage: node tools/test-gates.mjs run <gate>   known: ${[...known].join(", ")}`);
      process.exit(1);
    }
    const files = repoTestFiles();
    const selected =
      gateId === "full"
        ? files
        : gateId === DEFAULT_GATE
          ? files.filter((f) => classify(f) === DEFAULT_GATE)
          : files.filter((f) => classify(f) === gateId);

    if (selected.length === 0) {
      console.error(`gate "${gateId}" selected 0 files`);
      process.exit(1);
    }

    // Write a generated config rather than passing 500+ paths on the command
    // line. Windows caps a command at ~32k characters; passing the full suite
    // as arguments already fails outright at 626 files, and the correctness
    // gate alone is close enough to the cap that it would break next.
    const generated = join(REPO_ROOT, "vitest.gate.generated.ts");
    const includeList = selected.map((f) => `  ${JSON.stringify(f)},`).join("\n");
    writeFileSync(
      generated,
      [
        "// GENERATED by tools/test-gates.mjs - do not edit, do not commit.",
        "// Runs one test gate. Merges the project's real vitest.config.ts so gate",
        "// runs and a plain `vitest run` share settings.",
        'import { defineConfig, mergeConfig } from "vitest/config";',
        'import base from "./vitest.config";',
        "",
        "export default mergeConfig(base, defineConfig({",
        "  test: {",
        "    include: [",
        includeList,
        "    ],",
        "  },",
        "}));",
        "",
      ].join("\n")
    );

    console.error(`gate "${gateId}": ${selected.length} files`);
    const extra = process.argv.slice(4);
    try {
      execFileSync("npx", ["vitest", "run", "--config", generated, ...extra], {
        cwd: REPO_ROOT,
        stdio: "inherit",
        shell: process.platform === "win32",
      });
    } finally {
      // Never leave the generated config behind, whatever happened above.
      try { unlinkSync(generated); } catch { /* already gone */ }
    }
    return;
  }

  console.error(`unknown command "${verb}". use list | run <gate> | check`);
  process.exit(1);
}

// Only drive the CLI when executed directly; importing this module (to read the
// rules, from a test) must not run a command.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) command();