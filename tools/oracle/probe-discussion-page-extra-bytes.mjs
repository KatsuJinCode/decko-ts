// probe-discussion-page-extra-bytes.mjs -- discussion-layout byte-diff
// reproduction probe (discussion-layout-signature lane, branch lane-dlsig).
//
// WHAT THIS IS
//   The single-page reproduction instrument for the dominant page-lane
//   failure family: pages whose layout resolves to a discussion card layout
//   render MORE bytes than the Ruby oracle's page_html (the canvas grade at
//   3ca1c09 measured 551 of 556 page failures in this family; example
//   "BHG 1948 Ch 7 p 22 Old Fashioned Sugar Cookies and Fig Bars+discussion"
//   first difference at byte offset 9724, expected 15824 actual 17207).
//
//   It boots the SAME engine graph the direct runner boots (the per-worktree
//   staging storage from tmp/raw-ground-truth/scripts/raw-corpus-seeding.ts,
//   through tools/oracle/typescript-source-loader.mjs), renders one page-lane
//   entry through storage.engine.renderPage (the exact handler the runner's
//   page lane registers), and byte-diffs actual vs the shard's page_html with
//   the same comparator the grade uses (src/testing/diff.ts compareNormalized).
//
//   Both sides are also written RAW (expected.html / actual.html) into the
//   output dir so the divergent region can be inspected byte for byte.
//
// USAGE (from the worktree root)
//   node tools/oracle/probe-discussion-page-extra-bytes.mjs \
//     --repo REPO_ROOT/ \
//     [--name "BHG 1948 Ch 7 p 22 Old Fashioned Sugar Cookies and Fig Bars+discussion"] \
//     [--names "A+discussion|B+discussion"] \
//     [--shard recapture-raw-shard-000017.jsonl] [--out tmp/dlsig-probe]
//
//   With no --name/--names, the FIRST page-lane line in the shard whose name
//   ends in "+discussion" is used. Exit 0 when at least one page reproduces
//   the byte-diff (fail verdict), 1 when none do or the run could not start
//   (the probe is a measuring instrument, not a gate -- the report says which).
//
// MECHANISM CHECK
//   For every failing page the probe also runs the single-block test: remove
//   the one inserted `<div id="<safe-key>-denial-view">...</div>` block (the
//   comment_box loud denial) plus its one extra closing </div>, re-normalize
//   slot ids on both sides, and report whether the rest of the page is then
//   byte-identical to the oracle. "block-only: true" on every reproduced page
//   is the evidence that the family's whole delta is that one block.

import { register } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
register("./typescript-source-loader.mjs", pathToFileURL(HERE + path.sep).href);

// ---- args -------------------------------------------------------------------

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const REPO = path.resolve(
  argValue("--repo", path.resolve(HERE, "..", "..")),
);
const SHARD = argValue("--shard", "recapture-raw-shard-000017.jsonl");
const OUT_DIR = path.isAbsolute(argValue("--out", ""))
  ? argValue("--out")
  : path.join(REPO, argValue("--out", "tmp/dlsig-probe"));
const WANT_NAME = argValue("--name", "");
const WANT_NAMES = argValue("--names", "");

// ---- boot (the runner core's exact boot sequence) ---------------------------

const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(REPO, "tmp", "raw-ground-truth", "scripts", "raw-corpus-seeding.js")).href
);
const Database = (await import("better-sqlite3")).default;
const { compareNormalized } = await import(
  pathToFileURL(path.join(REPO, "src", "testing", "diff.ts")).href
);

const shardPath = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2", "page-lane", SHARD);
const lines = readFileSync(shardPath, "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l));

function pickLine(name) {
  const found = lines.find((l) => l.name === name);
  if (found === undefined) {
    console.error(`PROBE-ERROR: name not in shard: ${name}`);
    process.exit(1);
  }
  return found;
}

let entries;
if (WANT_NAMES !== "") {
  entries = WANT_NAMES.split("|").map((n) => pickLine(n.trim()));
} else if (WANT_NAME !== "") {
  entries = [pickLine(WANT_NAME)];
} else {
  const line = lines.find((l) => typeof l.page_html === "string" && l.name.endsWith("+discussion"));
  if (line === undefined) {
    console.error("PROBE-ERROR: no +discussion page entry with page_html in shard");
    process.exit(1);
  }
  entries = [line];
}

const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = idLister.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
idLister.close();

console.log(`PROBE boot: corpus=${RAW_CORPUS_DB}`);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
console.log(`PROBE boot done: ids=${everyLiveId.length}`);

// ---- render + diff ----------------------------------------------------------

const SLOT_ID_RE = /data-slot-id="[^"]*"/g;
const normalizeSlotIds = (s) => s.replace(SLOT_ID_RE, 'data-slot-id="RANDOMIZED"');

/** Single-block test: locate the inserted `-denial-view` card-slot div (the
 *  comment_box loud denial) immediately before the page's closing sequence,
 *  remove it plus its ONE extra closing </div>, and report whether the
 *  remainder is byte-identical to the normalized oracle bytes. Returns
 *  null when the page's failure is not shaped like this block. */
function singleBlockCheck(expected, actual) {
  const e = normalizeSlotIds(expected);
  const a = normalizeSlotIds(actual);
  const marker = '-denial-view"';
  const divStart = a.indexOf(marker);
  if (divStart < 0) return { blockOnly: false, reason: "no -denial-view div in actual" };
  const openStart = a.lastIndexOf("<div ", divStart);
  if (openStart < 0) return { blockOnly: false, reason: "no <div open before marker" };
  const closeSeq = "</div></div></div></article>";
  const actualClose6 = "</div></div></div></div></article>";
  const closeIdx = a.indexOf(actualClose6, openStart);
  if (closeIdx < 0) return { blockOnly: false, reason: "no 5-close sequence after denial div" };
  const patched = a.slice(0, openStart) + a.slice(closeIdx + 6);
  if (patched === e) {
    return {
      blockOnly: true,
      insertedChars: closeIdx + 6 - openStart,
      atOffset: openStart,
    };
  }
  // locate the residual divergence for the report
  let at = -1;
  for (let i = 0; i < Math.min(patched.length, e.length); i += 1) {
    if (patched[i] !== e[i]) { at = i; break; }
  }
  return {
    blockOnly: false,
    reason: at >= 0
      ? `residual divergence after block removal at char ${at}`
      : `length mismatch after removal: patched ${patched.length} vs expected ${e.length}`,
  };
}

let reproduced = 0;
mkdirSync(OUT_DIR, { recursive: true });
for (const line of entries) {
  const expected = line.page_html;
  let actual;
  try {
    actual = await storage.engine.renderPage(line.name);
  } catch (error) {
    console.error(`PROBE-ERROR: renderPage raised for ${line.name}:`,
      error && error.stack ? error.stack : error);
    continue;
  }

  const diff = compareNormalized(expected, actual);
  const tag = line.name.length > 60 ? line.name.slice(0, 57) + "..." : line.name;
  if (diff.equal) {
    console.log(`PROBE ${tag}`);
    console.log("  VERDICT: PASS (byte-identical after slot-id normalization) -- signature NOT reproduced");
    continue;
  }
  reproduced += 1;
  const first = diff.firstDifference;
  const block = singleBlockCheck(expected, actual);
  console.log(`PROBE ${tag}`);
  console.log(`  VERDICT: FAIL (byte-diff reproduced)  expectedBytes=${diff.expectedBytes} actualBytes=${diff.actualBytes} delta=${diff.actualBytes - diff.expectedBytes}`);
  console.log(`  codeUnitOffset=${first.codeUnitOffset} byteOffset=${first.byteOffset}`);
  console.log(`  expected excerpt: ${first.expectedExcerpt}`);
  console.log(`  actual excerpt:   ${first.actualExcerpt}`);
  console.log(`  block-only: ${block.blockOnly === true}` + (block.insertedChars !== undefined ? ` (inserted ${block.insertedChars} chars at offset ${block.atOffset}, removal restores oracle bytes)` : ` (${block.reason})`));
  const safe = line.name.replace(/[^\w.-]+/g, "_").slice(0, 80);
  writeFileSync(path.join(OUT_DIR, `expected--${safe}.html`), expected, "utf8");
  writeFileSync(path.join(OUT_DIR, `actual--${safe}.html`), actual, "utf8");
}
console.log(`PROBE summary: ${reproduced}/${entries.length} pages reproduce the byte-diff; outputs in ${OUT_DIR}`);
storage.close();
process.exit(reproduced > 0 ? 0 : 1);
