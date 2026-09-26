// platform-ops.mjs — dual-path platform operations for the one-click CF
// deploy script (house rule: cross-platform code is dual-path or LOUD,
// never a silent no-op).
//
// Every platform-specific operation the one-click flow needs lives here as
// a named dual-path function. A platform with no implementation throws
// PlatformOpsError (message prefixed "PLATFORM-OPS:") naming exactly what
// is missing — it never falls through to a guessed default.
//
// Networking note: every HTTP call in this tool (CF API verify, /_status
// probe) uses the Node built-in global fetch — no curl, no platform split
// for HTTP. The only platform split is spawning the wrangler CLI, because
// on win32 npm installs .cmd shims that spawnSync cannot exec without a
// shell.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export class PlatformOpsError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlatformOpsError";
  }
}

/**
 * How to spawn the wrangler CLI on this platform.
 * win32: npm's npx is npx.cmd; spawnSync needs shell:true to resolve it.
 * linux/darwin: plain npx executable, no shell.
 * Any other platform: LOUD failure naming the missing branch.
 */
export function npxInvocation(platform = process.platform) {
  if (platform === "win32") {
    return { command: "npx.cmd", wranglerArgsPrefix: ["wrangler"], useShell: true };
  }
  if (platform === "linux" || platform === "darwin") {
    return { command: "npx", wranglerArgsPrefix: ["wrangler"], useShell: false };
  }
  throw new PlatformOpsError(
    `PLATFORM-OPS: npxInvocation() has no implementation for platform "${platform}". ` +
      `Needed to run the wrangler CLI (d1 execute / deploy). Add a branch here ` +
      `(scripts/deploy/one-click-deck/platform-ops.mjs) before running on this platform.`,
  );
}

/** Repo root (the directory containing this script's ../../.. chain). */
export function repoRoot(importMetaUrl) {
  // <repo>/scripts/deploy/one-click-deck/platform-ops.mjs -> <repo>
  return join(dirname(fileURLToPath(importMetaUrl)), "..", "..", "..");
}

/** Directory the script may write generated artifacts into (gitignored). */
export function outDir(importMetaUrl) {
  return join(dirname(fileURLToPath(importMetaUrl)), "out");
}
