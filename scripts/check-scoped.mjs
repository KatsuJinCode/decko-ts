#!/usr/bin/env node
// Concurrency-aware typecheck/test gate for parallel agent streams.
//
// Problem: five agents share one repo; a repo-wide `tsc --noEmit` run
// mid-wave reads half-finished files from other streams and reports their
// errors. This script runs the full check and POST-FILTERS the error list
// (tsc is a whole-program checker — you cannot skip files, only suppress
// their findings). Two suppression rules:
//   1. mtime lease: errors in files modified within the quiet window
//      (default 30 s) are in-flight — covers active edit bursts.
//   2. ownership: paths under --running directories belong to known
//      running streams — covers their long think-pauses between bursts.
// The coordinator's landing gate runs --strict (nothing suppressed).
//
// Usage:
//   node scripts/check-scoped.mjs                                  # tsc
//   node scripts/check-scoped.mjs --vitest                         # vitest
//   node scripts/check-scoped.mjs --strict                         # landing gate
//   node scripts/check-scoped.mjs --quiet-ms 60000 --running src/card/fetch,tests/card/fetch

import { spawnSync, execSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const argVal = (name, dflt) => {
  const inline = args.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.split("=")[1];
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const quietMs = Number(argVal("--quiet-ms", 30000)) || 30000;
const strict = args.includes("--strict");
const runVitest = args.includes("--vitest");
const runningDirs = String(argVal("--running", "")).split(",").map((s) => s.trim().replace(/\\/g, "/")).filter(Boolean);
// Ownership labels: "dir=stream-name" entries in --running attribute suppressed
// errors to the stream that must fix them; active (unsuppressed) errors are the
// CALLER's responsibility — the caller cannot report done while they stand.
const runningOwners = runningDirs.map((entry) => {
  const [dir, label] = entry.split("=");
  return { dir, label: label ?? dir };
});
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

const suppressReason = (relFile) => {
  if (strict) return null;
  const owner = runningOwners.find((o) => relFile === o.dir || relFile.startsWith(`${o.dir}/`));
  if (owner) return `in-flight: owned by '${owner.label}' (theirs to fix, not yours)`;
  try {
    if (Date.now() - statSync(path.join(repoRoot, relFile)).mtimeMs < quietMs) return "in-flight: fresh edit (owner still iterating)";
  } catch {
    return null; // file gone by check time: report the error as-is
  }
  return null;
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
    const why = suppressReason(rel(file));
    (why ? suppressed : active).push(why ? `${line}   [suppressed: ${why}]` : line);
  }
  for (const line of [...active, ...suppressed]) console.error(line);
  console.error(`[check-scoped] tsc: ${active.length} active error(s), ${suppressed.length} suppressed (strict=${strict}, quiet=${quietMs / 1000}s, running=[${runningDirs.join(", ")}])`);
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
  const active = failedFiles.filter((f) => !suppressReason(f));
  const suppressed = failedFiles.filter((f) => suppressReason(f));
  console.error(`[check-scoped] vitest: ${active.length} active failing file(s), ${suppressed.length} suppressed`);
  for (const f of active) console.error(`  ACTIVE FAIL: ${f}`);
  if (active.length > 0) {
    console.log(out);
    process.exit(1);
  }
}
console.error("[check-scoped] PASS");

