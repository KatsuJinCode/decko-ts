#!/usr/bin/env node
// Hygiene round 2 gate A: incomplete-work scan. Finds TODO/FIXME/XXX/HACK,
// stub and not-implemented markers in tracked source, and classifies each
// as documented (tracker reference or deliberate deferral) or bare debt.
// Re-runnable; writes the full list to tools/hygiene/out/todos-<ts>.json.
// Exit code is always 0 — this gate REPORTS, the human pass decides.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const REPO = resolve(new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const OUT_DIR = join(REPO, "tools", "hygiene", "out");

// Scan source trees, not receipts/docs (docs TODOs are planning notes).
const SCAN_PREFIXES = ["src/", "deploy/", "tests/", "tools/", "benchmarks/"];
// The gates themselves are exempt: this script's own docstring and regexes
// legitimately contain the marker patterns it scans for.
const SCAN_EXEMPT = new Set([
  "tools/hygiene/scan-incomplete-work.mjs",
  "tools/hygiene/scan-secrets-and-leaks.mjs",
  "tools/hygiene/genericize-source-identity.mjs",
  "tools/hygiene/check-docs-links.mjs",
]);
const SCAN_EXTS = new Set([".ts", ".mts", ".mjs", ".js", ".cjs", ".py", ".rb", ".sql", ".toml"]);

const MARKERS = [
  { re: /\b(TODO|FIXME|XXX|HACK)\b:? ?(.{0,140})/g, kind: "marker" },
  { re: /\bnot yet implemented\b|\bnot implemented\b|\bunimplemented\b(.{0,120})/gi, kind: "unimplemented" },
  { re: /throw new (Error|TypeError|RangeError)\(\s*["'`](not (yet )?implemented|unreachable|stub)["'`]/gi, kind: "throw-stub" },
];

// A marker is "ok-documented" when its context names a tracker or reference,
// states a deliberate deferral, quotes oracle bytes (e.g. the literal HAML
// template `-#TODO` shipped in the Ruby gem), or is a test pin asserting an
// intentional unimplemented-raise. ±2 lines joined give the classifier enough
// context for pins and doc pointers.
const DOCUMENTED_RE = /(#[A-Za-z0-9_]+|#[0-9]+|issue|Issue|upstream|deliberate|deferred|by design|tracked|port-tracker|queued)/;
const DOCUMENTED_CONTEXT_RE = /(deferred|deferral|decided but not implemented|documented but not implemented|see docs|docs\/[a-z]|oracle|upstream|pin preserves|shipped answer|toContain|toThrow|raisedError|CAPTURE_ERROR|expect\(|%\{func\}|lib_exception|[Hh]aml|template box_|sort_by_count|REGEXP|live-PG|Live-PG|reported as|in the report)/;

const files = execFileSync("git", ["ls-files", "-z"], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
  .toString("utf8").split("\0").filter(Boolean);

const findings = [];
for (const rel of files) {
  if (!SCAN_PREFIXES.some((p) => rel.startsWith(p))) continue;
  if (SCAN_EXEMPT.has(rel)) continue;
  if (!SCAN_EXTS.has(rel.slice(rel.lastIndexOf(".")))) continue;
  let text;
  try { text = readFileSync(join(REPO, rel), "utf8"); } catch { continue; }
  if (text.includes("\0")) continue;
  const lines = text.split("\n");
  for (const { re, kind } of MARKERS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const lineNum = text.slice(0, m.index).split("\n").length;
      const context = (m[2] ?? m[1] ?? "").toString().trim();
      const around = lines.slice(Math.max(0, lineNum - 3), lineNum + 2).join("\n");
      const documented = DOCUMENTED_RE.test(context) || DOCUMENTED_CONTEXT_RE.test(around);
      findings.push({ path: rel, line: lineNum, kind, documented, context: context.slice(0, 140) });
    }
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = join(OUT_DIR, `todos-${stamp}.json`);
writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), findings }, null, 2));

const bare = findings.filter((f) => !f.documented);
console.log(`# incomplete-work scan: ${findings.length} markers, ${bare.length} WITHOUT documentation`);
for (const f of bare.slice(0, 60)) console.log(`  ${f.path}:${f.line} [${f.kind}] ${f.context.slice(0, 100)}`);
if (bare.length > 60) console.log(`  ... ${bare.length - 60} more (see ${outFile})`);
console.log(`# full report: ${outFile}`);
