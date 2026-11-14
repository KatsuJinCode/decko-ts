// census-empty-name-nest-shapes.mjs -- zero-boot census of how the ORACLE
// renders a blank-name nest `{{}}`, and of what discriminates the shapes.
//
// WHY
//   The port renders `{{}}` in a way that disagrees with the oracle on
//   some captures and not others. A `census` over the sha-verified expected-v2
//   view lane reads every occurrence and classifies it:
//
//     RAW    the braces survive verbatim (the nest was not consumed)
//     EMPTY  the nest was consumed and produced nothing
//     DENIED the nest was consumed and produced the quiet denial span
//
//   Then it joins each occurrence to its host card row so the discriminator
//   can be read off the data instead of guessed.
//
// USAGE
//   node tools/oracle/census-empty-name-nest-shapes.mjs [--shards 0,6]

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const VIEWS_DIR = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2", "view-lane");
const CORPUS = path.join(REPO, "tmp", "raw-ground-truth", "bench-corpus-raw.sqlite3");

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
const WANT_SHARDS = argValue("--shards", "");
const LIMIT = Number(argValue("--limit", "40"));

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const db = new Database(CORPUS, { readonly: true });
const cardRows = new Map();
for (const r of db.prepare("SELECT id, key, name, type_id, read_rule_class FROM cards").iterate()) {
  cardRows.set(r.id, r);
}

let files = readdirSync(VIEWS_DIR).filter((f) => f.endsWith(".jsonl")).sort();
if (WANT_SHARDS !== "") {
  const want = new Set(WANT_SHARDS.split(",").map((s) => Number(s.trim())));
  files = files.filter((f) => want.has(Number(f.match(/(\d+)\.jsonl$/)[1])));
}

/** Classify the neighbourhood of a `double gullwings {{}}` occurrence. The
 *  sentence is the corpus's own carrier for every blank-name nest, so the
 *  window is fixed and comparable across captures. */
function classify(html, at) {
  const before = html.slice(Math.max(0, at - 40), at);
  const after = html.slice(at, at + 200);
  if (html.slice(at, at + 4) === "{{}}") return "RAW";
  const span = '<span class="denied"><!-- Sorry, you don\'t have permission (read) --></span>';
  if (after.startsWith(span)) return "DENIED";
  if (after.startsWith(".")) return "EMPTY";
  return `OTHER:${JSON.stringify(after.slice(0, 60))}`;
}

const rows = [];
const NEEDLE = "double gullwings ";
for (const f of files) {
  for (const line of readFileSync(path.join(VIEWS_DIR, f), "utf8").split("\n")) {
    if (line.trim() === "") continue;
    const entry = JSON.parse(line);
    for (const [view, html] of Object.entries(entry.views ?? {})) {
      if (typeof html !== "string" || !html.includes(NEEDLE)) continue;
      let i = -1;
      while ((i = html.indexOf(NEEDLE, i + 1)) >= 0) {
        const at = i + NEEDLE.length;
        const row = cardRows.get(entry.id);
        rows.push({
          shard: f,
          host: entry.name,
          hostId: entry.id,
          view,
          shape: classify(html, at),
          cardKey: row?.key ?? null,
          cardName: row?.name ?? null,
          cardType: row?.type_id ?? null,
          readRule: row?.read_rule_class ?? null,
          hasDeniedAnywhere: html.includes('class="denied"'),
          copies: html.split(NEEDLE).length - 1,
        });
      }
    }
  }
  if (WANT_SHARDS !== "") console.log(`CENSUS scanned ${f}: rows=${rows.length}`);
}

const tally = (key) => {
  const m = new Map();
  for (const r of rows) m.set(String(r[key]), (m.get(String(r[key])) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

console.log(`\nCENSUS TOTAL occurrences=${rows.length}`);
console.log(`  shape:      ${JSON.stringify(tally("shape"))}`);
console.log(`  view:       ${JSON.stringify(tally("view"))}`);
console.log(`  cardKey:    ${JSON.stringify(tally("cardKey"))}`);
console.log(`  cardType:   ${JSON.stringify(tally("cardType"))}`);
console.log(`  readRule:   ${JSON.stringify(tally("readRule"))}`);
console.log(`  copiesInDoc ${JSON.stringify(tally("copiesInDoc"))}`);
console.log(`\nCENSUS shape x hasDeniedAnywhere x copies:`);
const cross = new Map();
for (const r of rows) {
  const k = `${r.shape} | deniedElsewhere=${r.hasDeniedAnywhere} | copies=${r.copies}`;
  cross.set(k, (cross.get(k) ?? 0) + 1);
}
for (const [k, n] of [...cross.entries()].sort()) console.log(`  ${k} -> ${n}`);

console.log(`\nCENSUS rows (limit ${LIMIT}):`);
for (const r of rows.slice(0, LIMIT)) {
  console.log(
    `  ${r.shape.padEnd(7)} host=${JSON.stringify(r.host)}:${r.view} id=${r.hostId} cardKey=${JSON.stringify(r.cardKey)} cardName=${JSON.stringify(r.cardName)} type=${r.cardType} rule=${r.readRule} copies=${r.copies} deniedElsewhere=${r.hasDeniedAnywhere}`,
  );
}
db.close();
