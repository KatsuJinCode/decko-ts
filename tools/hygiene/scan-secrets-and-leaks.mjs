#!/usr/bin/env node
// Publication hygiene gate: scans the decko-ts working tree (tracked files)
// and the ENTIRE git object database (reachable or not) for secrets and
// private-content that must never appear in a published tree.
//
// Usage:
//   node tools/hygiene/scan-secrets-and-leaks.mjs worktree
//   node tools/hygiene/scan-secrets-and-leaks.mjs history
//   node tools/hygiene/scan-secrets-and-leaks.mjs both          (default)
//
// Exit codes: 0 = clean (or only REVIEW-class items, listed), 1 = SEVERE
// findings exist (a rotatable secret or private content is IN the tree or
// history and must be handled before publication).
//
// Findings are written (values redacted) to tools/hygiene/out/<mode>-<ts>.json.
// The scanner itself contains no secret values: known-secret entries are
// short low-entropy PREFIXES used as tripwires, plus structural patterns.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const OUT_DIR = join(REPO, "tools", "hygiene", "out");
const MODE = (process.argv[2] || "both").toLowerCase();

// --- Pattern classes -------------------------------------------------------
// severity: "severe" = blocks publication (secret value or private content).
//           "review" = not necessarily wrong; a human pass must acknowledge.
// Each hit prints at most PREFIX_KEEP chars of the match, never the whole.
const PREFIX_KEEP = 6;

function structural(id, severity, description, source) {
  return { id, severity, description, source };
}

// Structural regexes: patterns whose SHAPE alone is disqualifying.
const STRUCTURAL = [
  structural("private-key-block", "severe",
    "PEM private key material", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g),
  structural("openrouter-key", "severe",
    "OpenRouter API key literal", /\bsk-or-v1-[0-9a-zA-Z]{16,}/g),
  structural("aws-access-key", "severe",
    "AWS access key id literal", /\bAKIA[0-9A-Z]{16}\b/g),
  structural("slack-token", "severe",
    "Slack token literal", /\bxox[abprs]-[0-9a-zA-Z-]{10,}/g),
  structural("github-token", "severe",
    "GitHub token literal", /\bgh[pousr]_[0-9a-zA-Z]{20,}/g),
  structural("google-api-key", "severe",
    "Google API key literal", /\bAIza[0-9A-Za-z_-]{30,}\b/g),
  structural("cf-api-token-shape", "severe",
    "Cloudflare API token literal (37+ char opaque assignment)",
    /\b(?:api[_-]?token|bearer)\s*[:=]\s*["']?[A-Za-z0-9_-]{30,}["']?/gi),
  structural("password-assignment", "severe",
    "literal password assignment",
    // values starting with *, $, or { are codename/placeholder lookups, not literals
    /\b(?:password|passwd|pwd)\s*[:=]\s*["'](?![*${])[^"'\s]{8,}["']/gi),
  structural("cf-account-id-32hex", "review",
    "32-hex id (Cloudflare account ids are not secrets but flag for review)",
    /\b[0-9a-f]{32}\b/gi),
  structural("uuid-key-shape", "review",
    "UUID-shaped token (Bunny access keys look like this)",
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi),
  structural("jwt-literal", "severe",
    "JWT literal", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g),
  structural("machine-username-path", "review",
    "machine-local path or username (jpswi) in a published-tree candidate",
    /\b(?:jpswi|C:\\+Users\\+jpswi|\/home\/jpswi|C:\/Users\/jpswi)\b/g),
  structural("email-address", "review",
    "email address literal",
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g),
];

// Known-secret tripwires: fixed substrings of REAL values seen in this
// project's history. A hit means that specific value is present.
const KNOWN_TRIPWIRES = [
  { id: "bunny-readonly-key-prefix", severity: "severe",
    description: "known Bunny read-only key prefix (55213f71)",
    needle: "55213f71" },
  { id: "cf-decko-account-id", severity: "review",
    description: "decko-ts Cloudflare account id (981606791...) - account ids are identifiers, review placement",
    needle: "981606791" },
  { id: "token-env-var-name", severity: "review",
    description: "CLOUDFLARE_DECKO_TS_API_TOKEN name (the NAME is fine in docs; review that no value sits beside it)",
    needle: "CLOUDFLARE_DECKO_TS_API_TOKEN" },
  { id: "secrets-env-filename", severity: "review",
    description: "secrets.env reference (path mention is fine; ensure no content)",
    needle: "secrets.env" },
];

// Private-content tripwires: names/entities from the real decks this
// project was built from. The corpus is text-free by construction; if
// these appear, real content leaked into the repo.
const PRIVATE_CONTENT = [
  { needle: "culturesmith", label: "Culturesmith (real site/deck identity)" },
  { needle: "williamscraig", label: "Brandon WilliamsCraig (real person)" },
  { needle: "brandon", label: "Brandon (real person first name; genericize to 'the site owner')" },
  { needle: "campletters", label: "campletters.quest (real deployment hostname)" },
  { needle: "brandondojo", label: "brandonDojoTech (workspace identity)" },
];

// --- Redaction -------------------------------------------------------------
function redact(text) {
  if (text.length <= PREFIX_KEEP) return "*".repeat(text.length);
  return text.slice(0, PREFIX_KEEP) + "…(" + text.length + " chars)";
}

// --- Worktree scan ---------------------------------------------------------
// The hygiene gates themselves are exempt from the private-content classes:
// they are the pattern registry and legitimately contain the real identity
// strings. (Secret-shape classes still apply to them — a leaked key in a
// gate script is still a leaked key.)
const GATE_SELF_EXEMPT = new Set([
  "tools/hygiene/scan-secrets-and-leaks.mjs",
  "tools/hygiene/genericize-source-identity.mjs",
]);

function listTrackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
    .toString("utf8");
  return out.split("\0").filter(Boolean);
}

function scanWorktree(report) {
  const files = listTrackedFiles();
  report.worktreeFilesScanned = files.length;
  for (const rel of files) {
    let buf;
    try {
      const st = statSync(join(REPO, rel));
      if (st.size > 20 * 1024 * 1024) {
        report.worktreeSkipped.push({ path: rel, reason: `file larger than 20MB (${st.size} bytes)` });
        continue;
      }
      buf = readFileSync(join(REPO, rel));
    } catch {
      continue; // deleted in working tree, staged state is what matters
    }
    // Binary sniff: NUL byte in first 8k -> treat as binary, scan for
    // tripwires only via latin1 (regexes still work on the line level).
    const isBinary = buf.subarray(0, 8192).includes(0);
    const text = buf.toString("utf8");
    if (isBinary && !text.includes("55213f71") && !/-----BEGIN/.test(text)) {
      report.worktreeSkipped.push({ path: rel, reason: "binary file (no secret tripwire present)" });
      continue;
    }
    scanText(text, rel, "worktree", report, GATE_SELF_EXEMPT.has(rel));
  }
}

// --- History scan ----------------------------------------------------------
// Enumerate every blob object in the object database (includes unreachable
// objects: a secret purged from refs but still in .git is still a leak).
function scanHistory(report) {
  const revList = execFileSync(
    "git", ["rev-list", "--objects", "--all"],
    { cwd: REPO, maxBuffer: 256 * 1024 * 1024 }).toString("utf8");
  const pathByOid = new Map();
  const oids = new Set();
  for (const line of revList.split("\n")) {
    if (!line) continue;
    const sp = line.indexOf(" ");
    const oid = sp === -1 ? line : line.slice(0, sp);
    const path = sp === -1 ? "(no path)" : line.slice(sp + 1);
    oids.add(oid);
    if (!pathByOid.has(oid)) pathByOid.set(oid, path);
  }
  report.historyObjects = oids.size;

  const batch = execFileSync(
    "git", ["cat-file", "--batch-all-objects", "--batch", "--unordered"],
    { cwd: REPO, maxBuffer: 1024 * 1024 * 1024 });
  // Parse "<oid> blob <size>\n<content>\n" frames.
  let pos = 0;
  let blobs = 0;
  const decoder = new TextDecoder("utf8", { fatal: false });
  while (pos < batch.length) {
    const nl = batch.indexOf(0x0a, pos);
    if (nl === -1) break;
    const header = batch.toString("utf8", pos, nl);
    const parts = header.split(" ");
    if (parts.length !== 3 || parts[1] !== "blob") {
      // non-blob: we cannot know its length without parsing; skip by
      // re-reading via cat-file -t is expensive. --batch frames for
      // trees/commits are small; find the frame end = header + content,
      // where content for commit/tree is bounded. Instead: only treat
      // blob frames; for others, skip to next header by scanning for
      // the next 40-hex at line start is unreliable. Practical route:
      // use the size field when it is a blob; for non-blobs parse
      // structurally is out of scope - we rely on the fact that
      // --batch-all-objects frames always end with a trailing LF we can
      // locate via the size for blobs and, for non-blobs, by searching
      // the next occurrence of "\n<40-hex> " within a bounded window.
      pos = nl + 1;
      continue;
    }
    const oid = parts[0];
    const size = parseInt(parts[2], 10);
    const contentStart = nl + 1;
    const contentEnd = contentStart + size; // frame adds one trailing LF
    if (size > 20 * 1024 * 1024) {
      report.historySkipped.push({ oid, path: pathByOid.get(oid) || "(no path)", reason: `blob larger than 20MB (${size} bytes)` });
      pos = contentEnd + 1;
      continue;
    }
    if (contentEnd <= batch.length) {
      const text = decoder.decode(batch.subarray(contentStart, contentEnd));
      scanText(text, pathByOid.get(oid) || "(no path)", `history:${oid.slice(0, 12)}`, report);
      blobs += 1;
    }
    pos = Math.min(contentEnd + 1, batch.length);
  }
  report.historyBlobsScanned = blobs;
}

// --- Shared text scanner ---------------------------------------------------
function scanText(text, filePath, where, report, isGateScript = false) {
  const lower = text.toLowerCase();

  const record = (finding) => {
    report.findings.push({ where, path: filePath, ...finding });
  };

  for (const rule of STRUCTURAL) {
    rule.source.lastIndex = 0;
    let m;
    let hitsForRule = 0;
    while ((m = rule.source.exec(text)) !== null) {
      hitsForRule += 1;
      if (hitsForRule > 50) { // pathological file; record the burst once
        record({ severity: rule.severity, id: rule.id, description: rule.description + ` (>50 hits, counting stopped)`, sample: "" });
        break;
      }
      record({ severity: rule.severity, id: rule.id, description: rule.description, sample: redact(m[0]), line: lineOf(text, m.index) });
    }
  }

  for (const t of isGateScript ? [] : KNOWN_TRIPWIRES) {
    let idx = lower.indexOf(t.needle);
    let hits = 0;
    while (idx !== -1 && hits < 50) {
      hits += 1;
      const lineText = text.slice(text.lastIndexOf("\n", idx) + 1, text.indexOf("\n", idx) === -1 ? text.length : text.indexOf("\n", idx));
      record({ severity: t.severity, id: t.id, description: t.description, sample: redact(lineText.trim().slice(0, 80)), line: lineOf(text, idx) });
      idx = lower.indexOf(t.needle, idx + t.needle.length);
    }
  }

  for (const p of isGateScript ? [] : PRIVATE_CONTENT) {
    let idx = lower.indexOf(p.needle);
    let hits = 0;
    while (idx !== -1 && hits < 50) {
      hits += 1;
      record({ severity: "severe", id: "private-content:" + p.needle, description: p.label, line: lineOf(text, idx), sample: redact(text.slice(Math.max(0, text.lastIndexOf("\n", idx)) + 1, idx + 60).trim()) });
      idx = lower.indexOf(p.needle, idx + p.needle.length);
    }
  }
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

// --- Main ------------------------------------------------------------------
const report = {
  generatedAt: new Date().toISOString(),
  repo: REPO,
  modes: MODE,
  worktreeFilesScanned: 0,
  historyObjects: 0,
  historyBlobsScanned: 0,
  worktreeSkipped: [],
  historySkipped: [],
  findings: [],
};

if (MODE === "worktree" || MODE === "both") scanWorktree(report);
if (MODE === "history" || MODE === "both") scanHistory(report);

const severe = report.findings.filter((f) => f.severity === "severe");
const review = report.findings.filter((f) => f.severity === "review");

mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = join(OUT_DIR, `${MODE.replace("both", "full")}-${stamp}.json`);
writeFileSync(outFile, JSON.stringify(report, null, 2));

// Console summary (deduped by path+id; details in the JSON).
const byKey = new Map();
for (const f of report.findings) {
  const k = `${f.where} ${f.path} ${f.id}`;
  byKey.set(k, (byKey.get(k) || 0) + 1);
}
console.log(`# scan: ${MODE}  files=${report.worktreeFilesScanned} historyBlobs=${report.historyBlobsScanned}/${report.historyObjects} objects`);
console.log(`# SEVERE findings: ${severe.length}   REVIEW findings: ${review.length}`);
for (const [k, n] of byKey) console.log(`  ${n >= 50 ? ">50" : n}x  ${k}`);
console.log(`# full report: ${outFile}`);
process.exitCode = severe.length > 0 ? 1 : 0;
