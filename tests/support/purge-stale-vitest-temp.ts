// Vitest's forks pool writes transformed modules to <os temp>/<21-char id>/ssr and
// removes the folder only when a run closes cleanly. Runs that are killed (a
// timeout, a crashed worker, an interrupted shell) leave it behind, and repeated
// test runs fill the temp drive. Each run therefore removes the folders that
// earlier runs left: a folder whose only child is ssr/ and that nothing has
// written to for STALE_MS. Live runs write continuously, so they are never stale.

import { readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const STALE_MS = 2 * 60 * 60 * 1000;
const RUN_DIR = /^[A-Za-z0-9_-]{21}$/;

function newestWrite(dir: string): number {
  let newest = statSync(dir).mtimeMs;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestWrite(path) : statSync(path).mtimeMs);
  }
  return newest;
}

export function purgeStaleVitestTemp(now = Date.now(), root = tmpdir()): number {
  let removed = 0;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !RUN_DIR.test(entry.name)) continue;
    const dir = join(root, entry.name);
    try {
      const children = readdirSync(dir);
      if (children.length !== 1 || children[0] !== "ssr") continue;
      if (now - newestWrite(dir) < STALE_MS) continue;
      rmSync(dir, { recursive: true, force: true });
      removed++;
    } catch {
      // A folder another process is still using or removing is left alone.
    }
  }
  return removed;
}
