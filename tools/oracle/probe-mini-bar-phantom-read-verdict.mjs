// probe-mini-bar-phantom-read-verdict.mjs -- for every mini_bar slot in the
// expected-v2 view-lane shards, ask the ENGINE whether the item's phantom is
// readable, and cross-tab that against what the ORACLE rendered as the body.
//
// WHY
//   M2: `mytho-psychology` (wanted card, Project/398) — the oracle renders the
//   FULL bar body inside a `mini_bar-view` slot whose data-slot JSON is
//   byte-identical to the denied arm's. So the decision is the BODY only.
//
//   The views.ts comment seats the decision on "name.simple? => not virtual =>
//   two-span". The capture census falsifies that (simple names like "Nick
//   Walker", "Everyone", "Oak Cliff" render FULL). The next question is the
//   one the code actually branches on: does the engine's own read verdict for
//   the phantom separate FULL from DENIED?
//
// USAGE
//   node tools/oracle/probe-mini-bar-phantom-read-verdict.mjs [--limit 40]

import { register } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
register("./typescript-source-loader.mjs", pathToFileURL(HERE + path.sep).href);

const REPO = path.resolve(HERE, "..", "..");
const VIEWS_DIR = path.join(REPO, "tmp", "raw-ground-truth", "expected-v2", "view-lane");

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}
const LIMIT = Number(argValue("--limit", "40"));
const SHARD = argValue("--shard", "recapture-raw-shard-000000.jsonl");

const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(REPO, "tmp", "raw-ground-truth", "scripts", "raw-corpus-seeding.js")).href
);
const Database = (await import("better-sqlite3")).default;

const idLister = new Database(RAW_CORPUS_DB, { readonly: true });
const everyLiveId = idLister.prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);
idLister.close();
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
console.log(`PROBE boot done: ids=${everyLiveId.length}`);

const OPEN = /<div id="([^"]*?)-mini_bar-view" class="([^"]*)" data-card-name="([^"]*)" data-card-type-id="([^"]*)" data-card-type-name="([^"]*)"/g;

const lines = readFileSync(path.join(VIEWS_DIR, SHARD), "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")
  .map((l) => JSON.parse(l));
const seen = new Set();
const rows = [];
for (const entry of lines) {
  for (const [view, html] of Object.entries(entry.views ?? {})) {
    if (typeof html !== "string" || !html.includes("-mini_bar-view")) continue;
    OPEN.lastIndex = 0;
    let m;
    while ((m = OPEN.exec(html)) !== null) {
      const item = m[3];
      const start = m.index + m[0].length;
      const close = html.indexOf("</div></div>", start);
      const body = html.slice(start, close < 0 ? start + 4000 : close);
      const kind = body.includes("bar-body row g-0") ? "FULL" : body.includes('class="denied"') ? "DENIED" : "OTHER";
      const dedupe = `${entry.name}|${item}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      rows.push({ host: entry.name, view, item, typeId: m[4], typeName: m[5], kind });
    }
  }
}
console.log(`PROBE mini_bar slots (shard ${SHARD}): ${rows.length}`);

const engine = storage.engine;
const { phantomPointerListItem } = await import(
  pathToFileURL(path.join(REPO, "src", "card", "render", "pointer-list.js")).href
);
const { DeckoName } = await import(
  pathToFileURL(path.join(REPO, "src", "card", "name.js")).href
);

for (const r of rows) {
  const fetched = engine.fetchRenderCard?.(r.item);
  let verdict;
  try {
    const hostCard = engine.fetchRenderCard(r.host);
    const phantom = phantomPointerListItem(r.item);
    verdict = engine.pointerItemVerdict?.(hostCard?.key ?? r.host, phantom.key);
  } catch (e) {
    verdict = { error: String(e?.message ?? e) };
  }
  let virtual;
  try {
    const parsed = DeckoName.parse(r.item);
    virtual = engine.phantomVirtualStructure?.(parsed, r.typeName, Number(r.typeId));
  } catch (e) {
    virtual = `ERR ${String(e?.message ?? e)}`;
  }
  r.compound = (() => { try { return String(DeckoName.parse(r.item).isCompound); } catch { return "ERR"; } })();
  r.fetched = fetched === undefined ? "MISS" : "HIT";
  r.read = verdict === undefined ? "undefined" : JSON.stringify(verdict);
  r.virtual = virtual === undefined ? "undefined" : "defined";
}

const tab = new Map();
for (const r of rows) {
  const k = `${r.kind}|fetch=${r.fetched}|read=${r.read}`;
  tab.set(k, (tab.get(k) ?? 0) + 1);
}
console.log(`\nPROBE crosstab kind x fetch x read-verdict:`);
for (const [k, v] of [...tab.entries()].sort()) console.log(`  ${k}  -> ${v}`);

console.log(`\nPROBE rows (limit ${LIMIT}):`);
for (const r of rows.slice(0, LIMIT)) {
  console.log(`  ${r.kind.padEnd(6)} fetch=${r.fetched.padEnd(4)} read=${r.read.padEnd(28)} virtual=${r.virtual.padEnd(9)} type=${r.typeName}/${r.typeId} item=${JSON.stringify(r.item)} host=${JSON.stringify(r.host)}:${r.view}`);
}
storage.close();
process.exit(0);
