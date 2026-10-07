// Shared scratch-directory helper for tests, benchmarks and tools.
//
// Every temp directory a run creates is registered here and removed when the
// run ends (success or failure), so nothing accumulates in the OS temp folder
// (AGENTS.md, Zero Unmanaged Scratch Policy).
//
//   scratchDir(prefix)   mkdtemp under os.tmpdir(), registered for removal
//   removeScratchDir(d)  remove one directory now (idempotent)
//   cleanupScratch()     remove everything registered (afterAll / finally)
//
// Removal also runs from a process "exit" handler, so a script whose lifetime
// is the scope needs no explicit cleanup call. A directory that cannot be
// removed in-process (an SQLite handle still open on Windows) is retried by a
// hidden detached node process after this one exits.
//
// DECKO_KEEP_SCRATCH=1 keeps every directory for debugging.
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const registered = new Set();
let exitHookInstalled = false;

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

/** Create a uniquely named directory under the OS temp folder, removed at the
 *  end of the run (or by cleanupScratch). */
export function scratchDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
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
