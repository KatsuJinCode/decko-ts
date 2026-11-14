// Regenerate every capture script in the tree against the pinned gemset and
// diff each against its committed fixture, reporting three numbers: how many
// regenerate byte-identically, how many differ, and how many fail to run at
// all.
//
// WHY A SCRIPT AND NOT A LOOP TYPED BY HAND. The capture loop's evidence is
// a COUNT over the whole tree, and a count typed by hand is a count someone
// could get wrong. This walks tests/server/oracle-capture-*.rb, runs each
// against DECKO_RUBY_GEMSET, and compares to fixtures/captured/<slug>-
// ruby-oracle.json by exact bytes.
//
// The output directory is a NAMED one under .tools-tmp (gitignored), so a
// regeneration never lands on a committed fixture: this script measures, it
// does not write the tree.
//
// Run from the repo root:
//   node tools/oracle-regenerate-every-capture-into-a-named-directory.mjs
//
// Exits 0 when every script that ran produced a fixture that either matches
// its committed copy or is reported as differing; it exits non-zero when a
// script fails to run, so a broken capture cannot pass as a clean sweep.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const CAPTURE_DIR = path.join(REPO, "tests", "server");
const FIXTURE_DIR = path.join(REPO, "fixtures", "captured");
const OUT_DIR = path.join(REPO, ".tools-tmp", "capture-sweep-output");

const GEMSET = process.env.DECKO_RUBY_GEMSET ?? "C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems";
if (!existsSync(GEMSET)) {
  console.error(`no pinned gemset at ${GEMSET}; set DECKO_RUBY_GEMSET`);
  process.exit(2);
}

mkdirSync(OUT_DIR, { recursive: true });

/**
 * The fixture a capture script owns. The naming convention is the SCRIPT'S
 * OWN NAME with the prefix and the extension swapped:
 *   oracle-capture-soft-redirect-ruby.rb -> soft-redirect-ruby-oracle.json
 * The `-ruby` in the script name is part of the slug, not a marker to strip
 * again - an earlier version of this function stripped it a second time and
 * matched no fixture at all.
 */
function fixtureFor(scriptName) {
  return `${scriptName.replace(/^oracle-capture-/, "").replace(/\.rb$/, "")}-oracle.json`;
}

const scripts = readdirSync(CAPTURE_DIR)
  .filter((name) => /^oracle-capture-.*\.rb$/.test(name))
  // The loading rig and the error rows' loader are not captures: they
  // produce no fixture of their own.
  .filter((name) => !["oracle-capture-pinned-deck-harness-ruby.rb", "oracle-capture-capture-sweep-ruby.rb"].includes(name))
  .sort();

const identical = [];
const differing = [];
const failing = [];
const noFixture = [];

for (const name of scripts) {
  const scriptPath = path.join(CAPTURE_DIR, name);
  const outPath = path.join(OUT_DIR, fixtureFor(name));
  const run = spawnSync("ruby", [scriptPath], {
    cwd: REPO,
    env: { ...process.env, DECKO_RUBY_GEMSET: GEMSET },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) {
    failing.push({ script: name, stderr: (run.stderr ?? "").slice(0, 400) });
    continue;
  }
  writeFileSync(outPath, run.stdout);
  const committedName = fixtureFor(name);
  const committedPath = path.join(FIXTURE_DIR, committedName);
  if (!existsSync(committedPath)) {
    noFixture.push({ script: name, produced: outPath });
    continue;
  }
  const fresh = readFileSync(outPath);
  const committed = readFileSync(committedPath);
  if (fresh.equals(committed)) identical.push(committedName);
  else differing.push(committedName);
}

const report = {
  gemset: GEMSET,
  scriptsRun: scripts.length,
  identical: identical.length,
  differing,
  failing,
  producedWithoutACommittedFixture: noFixture.map((entry) => entry.script),
  identicalFixtures: identical,
};
writeFileSync(path.join(OUT_DIR, "sweep-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, identicalFixtures: undefined }, null, 2));
process.exit(failing.length === 0 ? 0 : 1);