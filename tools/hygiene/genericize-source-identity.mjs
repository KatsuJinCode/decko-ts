#!/usr/bin/env node
// Hygiene round 1 companion: replaces the source-site identity (real
// deployment/workspace names) across tracked text files with the neutral
// pseudonym family used in the published tree:
//   Culturesmith            -> SourceDeck
//   culturesmith.com        -> source-deck.example
//   culturesmith-migration  -> source-deck-migration
//   culturesmith            -> source-deck
//   brandonDojoTech         -> workspace
// The real-name -> pseudonym mapping is intentionally documented NOWHERE in
// the repo; it lives in the operator's morning report. Re-runnable: exits 0
// with nothing to do once the tree is clean. Skips files listed in SKIP
// (in-flight edits by running workflow lanes) and binary files.

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const REPO = resolve(new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

// In-flight workflow lanes may be editing these; re-run after they land.
// The hygiene gates themselves are ALWAYS skipped: they must carry the real
// identity strings as scan patterns, or the sweep erases its own tripwires
// (happened 2026-09-23: the sweep rewrote its own REPLACEMENTS into no-ops
// and the scanner's tripwires into pseudonyms).
const SKIP = new Set([
  "tools/hygiene/genericize-source-identity.mjs",
  "tools/hygiene/scan-secrets-and-leaks.mjs",
]);

const REPLACEMENTS = [
  ["culturesmith-migration", "source-deck-migration"],
  ["culturesmith.com", "source-deck.example"],
  ["Culturesmith", "SourceDeck"],
  ["culturesmith", "source-deck"],
  ["brandonDojoTech", "workspace"],
  // possessive first, so "Casey's" becomes "the site owner's"
  ["Casey's", "the site owner's"],
  ["Casey", "the site owner"],
];

const files = execFileSync("git", ["ls-files", "-z"], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
  .toString("utf8").split("\0").filter(Boolean);

let changed = 0;
for (const rel of files) {
  if (SKIP.has(rel)) continue;
  let text;
  try {
    text = readFileSync(join(REPO, rel), "utf8");
  } catch {
    continue; // binary or unreadable
  }
  if (text.includes("\0")) continue; // binary
  let out = text;
  for (const [from, to] of REPLACEMENTS) out = out.split(from).join(to);
  if (out !== text) {
    writeFileSync(join(REPO, rel), out);
    const hits = REPLACEMENTS.reduce((n, [f]) => n + text.split(f).length - 1, 0);
    console.log(`${String(hits).padStart(3)}x  ${rel}`);
    changed += 1;
  }
}
console.log(changed === 0 ? "tree already clean" : `${changed} files updated`);
