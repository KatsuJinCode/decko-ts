// Run THE standing verification net as ONE machine test queue job.
//
// The canonical file list lives in tests/standing-net.json (checked in). This
// script is the only supported way to run the net: it reads the manifest,
// verifies every listed file exists in THIS worktree (a stale manifest is a
// loud failure, never a silently-shrinking net), and delegates to
// submit-test-job.mjs so the run goes through the same one shared queue,
// dedupe and result-recording path as every other test job.
//
// Usage (from any directory; the net that runs is the one in the worktree
// this script file lives in):
//   node tools/test-queue/run-standing-net.mjs [--cwd <worktree-root>] [--name <label>]
//
// --cwd defaults to the repo root containing this script, so a lane worktree
// runs its own tip's net. --name overrides the queue job label (default: the
// manifest's jobName); it never affects dedupe or the files run. Exit code =
// the queue job's exit code.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TOOL_DIR, "..", "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "tests", "standing-net.json");

// Only --cwd is accepted; anything else is a typo that must not silently
// become a different net.
const argv = process.argv.slice(2);
let cwd = REPO_ROOT;
let nameOverride;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--cwd") {
    cwd = path.resolve(argv[++i] ?? "");
  } else if (argv[i] === "--name") {
    nameOverride = argv[++i];
    if (!nameOverride) {
      console.error("run-standing-net: --name requires a value");
      process.exit(2);
    }
  } else {
    console.error(
      `run-standing-net: unknown argument ${argv[i]} (only --cwd and --name are supported)`,
    );
    process.exit(2);
  }
}
if (!fs.existsSync(cwd)) {
  console.error(`run-standing-net: --cwd does not exist: ${cwd}`);
  process.exit(2);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
} catch (err) {
  console.error(`run-standing-net: cannot parse ${MANIFEST_PATH}: ${err.message}`);
  process.exit(2);
}
if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
  console.error(`run-standing-net: ${MANIFEST_PATH} has no non-empty "files" array`);
  process.exit(2);
}

// Anti-drift gate: the net is the manifest, exactly. A file listed here that
// is missing from this worktree means the manifest is stale relative to this
// tip — fail and say which entries, instead of quietly running a shrunk net.
const missing = manifest.files.filter((f) => !fs.existsSync(path.join(cwd, f)));
if (missing.length > 0) {
  console.error(
    `run-standing-net: manifest is STALE for ${cwd} — ${missing.length} of ${manifest.files.length} files missing:`,
  );
  for (const f of missing) console.error(`  - ${f}`);
  console.error("Reconcile tests/standing-net.json at this tip before running the net.");
  process.exit(3);
}

const cmd = `npx vitest run ${manifest.files.join(" ")} ${(manifest.vitestArgs ?? []).join(" ")}`.trim();
const submitArgs = [
  path.join("tools", "test-queue", "submit-test-job.mjs"),
  "--name",
  nameOverride ?? manifest.jobName ?? "standing-net",
  "--cwd",
  cwd,
  "--cmd",
  cmd,
  "--timeout-min",
  String(manifest.timeoutMin ?? 2),
];

console.error(
  `run-standing-net: submitting ${manifest.files.length}-file standing net (${manifest.provenance?.reconciledAtCommit ?? "unversioned provenance"}) as queue job for ${cwd}`,
);
const submitter = spawnSync(process.execPath, submitArgs, { stdio: "inherit", cwd: REPO_ROOT, windowsHide: true });
if (submitter.error) {
  console.error(`run-standing-net: failed to run submit-test-job.mjs: ${submitter.error.message}`);
  process.exit(1);
}
process.exit(submitter.status ?? 1);
