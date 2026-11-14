// census-mini-bar-body-split.mjs -- zero-boot census of the ORACLE's mini_bar
// inner-body split, and of what discriminates the two bodies.
//
// WHY THIS IS
//   On the probed corpus host the oracle renders the
//   FULL bar.haml body inside the mini_bar slot for a wanted pointer item
//   (a Project-typed card), while the port renders the
//   two-span denied body. The outer slot wrap is byte-identical on both sides,
//   so the decision is the INNER BODY only.
//
//   The views.ts comment cites a "133-entry census" of simple-named phantoms
//   that keep the two-span family. If that census and this entry disagree, then
//   "name.simple? => two-span" (states.rb:45, the rule the port seats the
//   decision on) is not the rule the capture deck ran, and the real rule has to
//   be read off the capture.
//
// WHAT IT DOES
//   Streams every expected-v2 view-lane shard, finds every `mini_bar-view`
//   slot div, classifies the body as FULL (contains `bar-body row g-0`) or
//   DENIED (contains the two `denied` spans), and prints the discriminating
//   attributes per entry: the data-slot JSON's `type`, the data-card-type-id /
//   -name, the host card's key, the item's name, and — the decisive read —
//   whether a REAL card row with that name exists in the corpus.
//
// USAGE
//   node tools/oracle/census-mini-bar-body-split.mjs [--shards 0,3,4] [--limit 40]

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
const namedRows = db.prepare("SELECT name FROM cards WHERE name IS NOT NULL AND name <> ''");
const byName = new Map();
for (const r of namedRows.iterate()) if (!byName.has(r.name)) byName.set(r.name, true);
console.log(`CENSUS corpus named cards=${byName.size}`);

const OPEN = /<div id="([^"]*?)-mini_bar-view" class="([^"]*)" data-card-name="([^"]*)" data-card-type-id="([^"]*)" data-card-type-name="([^"]*)"[^>]*?data-slot="([^"]*)"/g;

let files = readdirSync(VIEWS_DIR).filter((f) => f.endsWith(".jsonl")).sort();
if (WANT_SHARDS !== "") {
  const want = new Set(WANT_SHARDS.split(",").map((s) => Number(s.trim())));
  files = files.filter((f) => want.has(Number(f.match(/(\d+)\.jsonl$/)[1])));
}

const full = [];
const denied = [];
for (const f of files) {
  const lines = readFileSync(path.join(VIEWS_DIR, f), "utf8").split("\n");
  for (const line of lines) {
    if (line.trim() === "") continue;
    const entry = JSON.parse(line);
    for (const [view, html] of Object.entries(entry.views ?? {})) {
      if (typeof html !== "string" || !html.includes("-mini_bar-view")) continue;
      OPEN.lastIndex = 0;
      let m;
      while ((m = OPEN.exec(html)) !== null) {
        // body = from the end of the opening tag to the matching close of that div
        const start = m.index + m[0].length;
        const close = html.indexOf("</div></div>", start);
        const body = html.slice(start, close < 0 ? start + 4000 : close);
        const rec = {
          shard: f,
          host: entry.name,
          hostId: entry.id,
          view,
          item: m[3],
          cls: m[2],
          typeId: m[4],
          typeName: m[5],
          slot: m[6]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, "&")
            .replace(/&#39;/g, "'"),
          named: byName.has(m[3]),
          kind: body.includes("bar-body row g-0") ? "FULL" : body.includes('class="denied"') ? "DENIED" : "OTHER",
        };
        (rec.kind === "FULL" ? full : denied).push(rec);
      }
    }
  }
  if (WANT_SHARDS !== "") console.log(`CENSUS scanned ${f}: full=${full.length} denied=${denied.length}`);
}

const tally = (rows, key) => {
  const m = new Map();
  for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

console.log(`\nCENSUS TOTAL full=${full.length} denied=${denied.length}`);
for (const [label, rows] of [["FULL", full], ["DENIED", denied]]) {
  console.log(`\n=== ${label} (${rows.length}) ===`);
  console.log(`  named-in-corpus: ${JSON.stringify(tally(rows, "named"))}`);
  console.log(`  typeName:        ${JSON.stringify(tally(rows, "typeName"))}`);
  console.log(`  typeId:          ${JSON.stringify(tally(rows, "typeId").slice(0, 20))}`);
  console.log(`  byTypeNamed:     ${JSON.stringify(rows.reduce((m, r) => { const k = `${r.typeName}|named=${r.named}`; m[k] = (m[k] ?? 0) + 1; return m; }, {}))}`);
}
console.log("\nCENSUS FULL sample:");
for (const r of full.slice(0, LIMIT)) console.log(`  ${r.kind} item=${JSON.stringify(r.item)} type=${r.typeName}/${r.typeId} named=${r.named} host=${JSON.stringify(r.host)}:${r.view}`);
console.log("\nCENSUS DENIED sample:");
for (const r of denied.slice(0, LIMIT)) console.log(`  ${r.kind} item=${JSON.stringify(r.item)} type=${r.typeName}/${r.typeId} named=${r.named} host=${JSON.stringify(r.host)}:${r.view}`);
db.close();
