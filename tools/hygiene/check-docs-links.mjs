#!/usr/bin/env node
// Hygiene round 2 gate B: docs link integrity. Every relative markdown link
// and local image reference in tracked .md files must resolve to a tracked
// file (or an intentionally-gitignored receipts path, whitelisted below).
// Absolute URLs are not checked. Re-runnable; exit 1 on broken links.

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname, posix } from "node:path";

const REPO = resolve(new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

// Receipts/results paths that are real on disk but gitignored by design —
// docs may reference them as rebuildable artifacts.
const IGNORED_OK = [/^benchmarks\/corpus\//, /^tmp\//, /hygiene\/out\//];

const files = execFileSync("git", ["ls-files", "-z"], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
  .toString("utf8").split("\0").filter((f) => f.endsWith(".md"));

const tracked = new Set(
  execFileSync("git", ["ls-files", "-z"], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
    .toString("utf8").split("\0").filter(Boolean)
);

const LINK_RE = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const broken = [];
let checked = 0;

for (const rel of files) {
  let text;
  try { text = readFileSync(join(REPO, rel), "utf8"); } catch { continue; }
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(text)) !== null) {
    const target = m[1];
    if (/^[a-z]+:\/\//i.test(target) || target.startsWith("mailto:") || target.startsWith("#")) continue;
    checked += 1;
    const clean = decodeURIComponent(target.split("#")[0]).replace(/^\.\//, "");
    if (clean === "") continue; // pure-anchor link
    const resolved = posix.join(dirname(rel.split("\\").join("/")), clean);
    if (tracked.has(resolved)) continue;
    if (existsSync(join(REPO, resolved)) && IGNORED_OK.some((re) => re.test(resolved))) continue;
    broken.push({ from: rel, target, resolved });
  }
}

console.log(`# docs link check: ${checked} relative links across ${files.length} md files, ${broken.length} broken`);
for (const b of broken.slice(0, 40)) console.log(`  ${b.from}  ->  ${b.target}`);
if (broken.length > 40) console.log(`  ... ${broken.length - 40} more`);
process.exitCode = broken.length > 0 ? 1 : 0;
