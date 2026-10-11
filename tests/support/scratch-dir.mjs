// Shared scratch-directory helper for tests, benchmarks and tools.
//
// Every temp directory a run creates is registered here and removed when the
// run ends (success or failure), so nothing accumulates (AGENTS.md, Zero
// Unmanaged Scratch Policy).
//
//   scratchDir(prefix)   mkdtemp under the repo scratch root, registered for removal
//   removeScratchDir(d)  remove one directory now (idempotent)
//   cleanupScratch()     remove everything registered (afterAll / finally)
//
// Removal also runs from a process "exit" handler, so a script whose lifetime
// is the scope needs no explicit cleanup call. A directory that cannot be
// removed in-process (an SQLite handle still open on Windows) is retried by a
// hidden detached node process after this one exits.
//
// DECKO_KEEP_SCRATCH=1 keeps every directory for debugging.
//
// Where directories live, and who may delete them: a scratch
// directory is created under the repo's own root — tmp/test-scratch/, or the
// directory named by DECKO_TEST_TEMP_ROOT — never directly in the shared OS
// temp folder, and it carries an ownership manifest naming this repo checkout
// and this machine. The stale-run purge (tests/support/purge-stale-vitest-temp.ts)
// deletes a stale directory only under that root and only when its manifest
// matches, so a directory this checkout did not create is never a deletion
// candidate, no matter how its name looks or how old it is.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const registered = new Set();
let exitHookInstalled = false;

/** The file inside a scratch directory that names its owner. */
export const SCRATCH_OWNERSHIP_FILE = "decko-scratch-ownership.json";
const OWNERSHIP_TOOL = "decko test scratch";
const envRoot = () => (process.env.DECKO_TEST_TEMP_ROOT ? resolve(process.env.DECKO_TEST_TEMP_ROOT) : null);
const repoRoot = realpathSync(fileURLToPath(new URL("../..", import.meta.url)));
const machine = hostname();

/** The dedicated root every scratch directory is created under: the repo's
 *  own tmp/test-scratch/, or DECKO_TEST_TEMP_ROOT for a run that must keep
 *  its scratch elsewhere (another drive, a CI cache). Created when missing. */
export function scratchRoot() {
  const root = envRoot() ?? join(repoRoot, "tmp", "test-scratch");
  mkdirSync(root, { recursive: true });
  return root;
}

/** The ownership manifest: which tool, which repo checkout, which machine. */
export function writeScratchOwnershipManifest(dir) {
  writeFileSync(join(dir, SCRATCH_OWNERSHIP_FILE), JSON.stringify({ tool: OWNERSHIP_TOOL, repo: repoRoot, machine, created_at: new Date().toISOString() }, null, 2) + "\n");
}

/** True when `dir` carries an ownership manifest naming this checkout of this
 *  repo on this machine. Anything else — no manifest, a corrupt one, another
 *  checkout's or another machine's — is not this repo's to delete. */
export function scratchOwnershipMatches(dir) {
  try {
    const m = JSON.parse(readFileSync(join(dir, SCRATCH_OWNERSHIP_FILE), "utf8"));
    return m.tool === OWNERSHIP_TOOL && m.repo === repoRoot && m.machine === machine;
  } catch {
    return false;
  }
}

export function keepScratch() {
  return process.env.DECKO_KEEP_SCRATCH === "1";
}

function tryRemove(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    return !existsSync(dir);
  }
  return !existsSync(dir);
}

// Open handles (SQLite on Windows) block removal until the owning process
// exits. Hand the stuck directories to a hidden, detached node process that
// retries for a while after this one is gone.
function removeAfterExit(stuck) {
  const script =
    "const fs=require('fs');const dirs=JSON.parse(process.argv[1]);" +
    "setTimeout(()=>{for(const d of dirs){try{fs.rmSync(d,{recursive:true,force:true,maxRetries:60,retryDelay:250})}catch{}}},1000);";
  try {
    spawn(process.execPath, ["-e", script, JSON.stringify(stuck)], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
  } catch {
    /* nothing more can be done */
  }
}

function installExitHook() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.on("exit", () => {
    if (keepScratch()) return;
    const stuck = [];
    for (const dir of registered) if (!tryRemove(dir)) stuck.push(dir);
    registered.clear();
    if (stuck.length > 0) removeAfterExit(stuck);
  });
}

/** Create a uniquely named directory under the repo scratch root, owned by
 *  this checkout (an ownership manifest is written at creation), removed at
 *  the end of the run (or by cleanupScratch). */
export function scratchDir(prefix) {
  const dir = mkdtempSync(join(scratchRoot(), prefix));
  writeScratchOwnershipManifest(dir);
  registered.add(dir);
  installExitHook();
  return dir;
}

/** Remove one scratch directory now. Safe to call twice. */
export function removeScratchDir(dir) {
  if (keepScratch()) return;
  if (tryRemove(dir)) registered.delete(dir);
}

/** Remove every registered directory. Any that an open handle still blocks
 *  are handed to a detached cleaner, which retries once this process (a test
 *  worker) has gone. */
export function cleanupScratch() {
  if (keepScratch()) return;
  const stuck = [];
  for (const dir of [...registered]) {
    registered.delete(dir);
    if (!tryRemove(dir)) stuck.push(dir);
  }
  if (stuck.length > 0) removeAfterExit(stuck);
}

/** Directories still registered (for the self-test). */
export function registeredScratch() {
  return [...registered];
}
