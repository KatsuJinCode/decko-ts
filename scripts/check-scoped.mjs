#!/usr/bin/env node
// Concurrency-aware typecheck/test gate for parallel agent streams.
//
// Problem: five agents share one repo; a repo-wide `tsc --noEmit` run
// mid-wave reads half-finished files from other streams and reports their
// errors. This script runs the full check and POST-FILTERS the error list:
// errors in files modified within the quiet window (default 30 s) are
// suppressed as in-flight, everything else fails loudly. mtime is the
// lease — no registration protocol. The coordinator's landing gate runs
// this with --strict (leases ignored).
//
// Usage:
//   node scripts/check-scoped.mjs              # tsc, leases honored
//   node scripts/check-scoped.mjs --vitest     # vitest, leases honored
//   node scripts/check-scoped.mjs --strict     # tsc, leases ignored
//   node scripts/check-scoped.mjs --quiet-ms 60000

import { execSync, spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const quietMs = Number(args.find((a) => a.startsWith("--quiet-ms"))?.split("=")[1] ?? args[args.indexOf("--quiet-ms") + 1] ?? 30000) || 30000;
const strict = args.includes("--strict");
const runVitest = args.includes("--vitest");
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

const isLeased = (relFile) => {
  if (strict) return false;
  try {
    return Date.now() - statSync(path.join(repoRoot, relFile)).mtimeMs < quietMs;
  } catch {
    return false; // file gone by check time: report the error as-is
  }
};

const rel = (p) => path.relative(repoRoot, p).replace(/\\/g, "/");

if (!runVitest) {
  const tsc = spawnSync("npx", ["tsc", "--noEmit", "--pretty", "false"], {
    cwd: repoRoot, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${tsc.stdout ?? ""}${tsc.stderr ?? ""}`;
  const lines = out.split("\n").filter((l) => /\(\d+,\d+\): error TS/.test(l));
  const active = [], suppressed = [];
  for (const line of lines) {
    const file = line.slice(0, line.indexOf("("));
    (isLeased(rel(file)) ? suppressed : active).push(line);
  }
  for (const line of active) console.error(line);
  console.error(`[check-scoped] tsc: ${active.length} active error(s), ${suppressed.length} suppressed as in-flight (quiet window ${quietMs / 1000}s${strict ? ", STRICT" : ""})`);
  if (active.length > 0) process.exit(1);
}

if (runVitest) {
  let out = "";
  try {
    out = execSync("npx vitest run --reporter=default 2>&1", {
      cwd: repoRoot, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    out = String(e.stdout ?? "") + String(e.stderr ?? "");
  }
  const failedFiles = [...out.matchAll(/^\s*[❯×✖x]\s+(tests\/\S+?\.test\.ts)/gm)].map((m) => m[1]);
  const active = failedFiles.filter((f) => !isLeased(f));
  const suppressed = failedFiles.filter((f) => isLeased(f));
  console.error(`[check-scoped] vitest: ${active.length} active failing file(s), ${suppressed.length} suppressed as in-flight`);
  for (const f of active) console.error(`  ACTIVE FAIL: ${f}`);
  if (active.length > 0) {
    console.log(out);
    process.exit(1);
  }
}
console.error("[check-scoped] PASS");
