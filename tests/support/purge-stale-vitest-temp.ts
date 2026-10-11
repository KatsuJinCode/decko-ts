// Removes stale scratch directories this repo's test runs left behind, so a
// killed run (a timeout, a crashed worker, an interrupted shell — none of which
// run scratch-dir.mjs's exit hook) does not fill the scratch root. Live runs
// write continuously, so they are never stale.
//
// What may be deleted, and what may not (the old version scanned
// the shared OS temp folder and deleted by name shape and age alone, which
// could delete another checkout's or another task's scratch):
//
// - Only directories under the repo's own scratch root are candidates
//   (scratch-dir.mjs's scratchRoot(): <repo>/tmp/test-scratch/, or
//   DECKO_TEST_TEMP_ROOT). The shared OS temp folder is never scanned.
// - A candidate is deleted only when its resolved real path stays inside the
//   root's resolved real path: a symlink or reparse point that leaves the root
//   is skipped, never followed, never deleted through.
// - A candidate is deleted only when it carries an ownership manifest naming
//   this checkout of this repo on this machine (scratch-dir.mjs writes one at
//   creation). No manifest, a corrupt manifest, or another repo's or machine's
//   manifest: the directory is skipped, whatever its name and age. Age alone
//   never authorizes a deletion.
// - The staleness walk never recurses into a link; a link's target timestamp
//   still counts, so a live process writing through a link keeps its
//   directory fresh.
//
// Vitest's own transform folders in the OS temp folder are no longer touched
// at all: vitest creates those, they carry no manifest of ours, and deleting
// another program's folder without ownership proof is exactly the bug this
// module had.

import { lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { scratchOwnershipMatches, scratchRoot } from "./scratch-dir.mjs";

const STALE_MS = 2 * 60 * 60 * 1000;

/** The newest mtime anywhere in `dir`'s tree. Links contribute their target's
 *  mtime (liveness through a link counts) but are never walked into. */
function newestWrite(dir: string): number {
  let newest = statSync(dir).mtimeMs;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      // statSync follows the link to its target; a broken link falls back to
      // the link's own mtime. Either way the link's tree is not entered.
      const mtime = statSync(p, { throwIfNoEntry: false })?.mtimeMs ?? lstatSync(p, { throwIfNoEntry: false })?.mtimeMs ?? 0;
      newest = Math.max(newest, mtime);
      continue;
    }
    newest = Math.max(newest, entry.isDirectory() ? newestWrite(p) : statSync(p).mtimeMs);
  }
  return newest;
}

/** The candidate's resolved real path when it stays inside `realRoot`, else null. */
function realPathInsideRoot(dir: string, realRoot: string): string | null {
  const real = realpathSync(dir);
  return real === realRoot || real.startsWith(realRoot + sep) ? real : null;
}

export function purgeStaleVitestTemp(now = Date.now(), root: string = scratchRoot()): number {
  let removed = 0;
  let entries;
  try {
    mkdirSync(root, { recursive: true });
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return 0;
  }
  let realRoot: string;
  try {
    realRoot = realpathSync(root);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const dir = join(root, entry.name);
    try {
      // A directory entry that resolves outside the root — a link out, a
      // mapped path, anything — is not ours to judge, not ours to touch.
      if (realPathInsideRoot(dir, realRoot) === null) continue;
      // No manifest, a corrupt one, or another checkout's or machine's: skip.
      if (!scratchOwnershipMatches(dir)) continue;
      if (now - newestWrite(dir) < STALE_MS) continue;
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      removed++;
    } catch {
      // A folder another process is still using or removing is left alone.
    }
  }
  return removed;
}
