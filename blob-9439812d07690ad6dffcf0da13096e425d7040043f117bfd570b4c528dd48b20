// measure-lane-denominators.mjs -- r2-era-normalization lane instrument.
// Counts the GRADE's own denominators, using the grade's own rule so the
// post-state number is comparable to the 16,862 of record.
//
// THE RULE (tools/oracle/dual-lane-shard-entry-weights.mjs, countLaneEntries):
//   view lane, per line: skip a whole-line capture error (error set, record
//     absent, views absent); then +1 if `record` is present, +1 per key of
//     `views`.
//   page lane, per line: +1 if `error` is present, else +1 if `page_html` is
//     a string. A line with neither is malformed, not an entry.
//   A line whose lane field does not match the directory is skipped.
//
// usage: node measure-lane-denominators.mjs --corpus <root> [--out <file.json>]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const CORPUS = path.resolve(argValue("--corpus", "tmp/raw-ground-truth"));
const OUT = argValue("--out", "");

function countLane(file, lane) {
  const text = readFileSync(file, "utf8");
  let entries = 0;
  let malformed = 0;
  let lines = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    lines += 1;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      malformed += 1;
      continue;
    }
    if (parsed.lane !== lane) continue;
    if (lane === "view") {
      if (parsed.error !== undefined && parsed.record === undefined && parsed.views === undefined) continue;
      if (parsed.record) entries += 1;
      if (parsed.views) entries += Object.keys(parsed.views).length;
    } else {
      if (parsed.error !== undefined) entries += 1;
      else if (typeof parsed.page_html === "string") entries += 1;
      else malformed += 1;
    }
  }
  return { entries, lines, malformed };
}

const perShard = {};
let view = 0;
let page = 0;
let viewRenderKeys = 0;
let viewLines = 0;
let pageLines = 0;
let malformed = 0;
for (const [lane, dir] of [
  ["view", path.join(CORPUS, "expected-v2", "view-lane")],
  ["page", path.join(CORPUS, "expected-v2", "page-lane")],
]) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl")).sort()) {
    const r = countLane(path.join(dir, f), lane);
    perShard[f] = { [lane]: r.entries, lines: r.lines, sha256: createHash("sha256").update(readFileSync(path.join(dir, f))).digest("hex") };
    if (lane === "view") { view += r.entries; viewLines += r.lines; } else { page += r.entries; pageLines += r.lines; }
    malformed += r.malformed;
    // view render keys: the number of (record, view) pairs the probe can target
    if (lane === "view") {
      for (const line of readFileSync(path.join(dir, f), "utf8").split("\n")) {
        if (line.trim() === "") continue;
        const p = JSON.parse(line);
        if (p.lane === "view" && p.views) viewRenderKeys += Object.keys(p.views).length;
      }
    }
  }
}

const report = {
  schema: "r2-era-denominators/1",
  measuredAt: new Date().toISOString(),
  corpusRoot: CORPUS,
  countRule: "tools/oracle/dual-lane-shard-entry-weights.mjs countLaneEntries (view: +1 per record-bearing line +1 per views key; page: +1 per page_html/error line)",
  viewEntries: view,
  pageEntries: page,
  total: view + page,
  viewRenderKeys,
  viewLines,
  pageLines,
  malformed,
  perShard,
};
if (OUT) writeFileSync(path.resolve(OUT), JSON.stringify(report, null, 2) + "\n");
console.log(`DENOMINATORS view=${view} page=${page} TOTAL=${view + page} (viewRenderKeys=${viewRenderKeys} lines view/page=${viewLines}/${pageLines} malformed=${malformed})`);
process.exit(0);
