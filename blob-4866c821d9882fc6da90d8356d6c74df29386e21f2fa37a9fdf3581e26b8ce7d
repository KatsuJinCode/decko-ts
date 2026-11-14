// engcand-pointer-search-trace.mjs -- ENGCAND LANE
// The r4rows-style SQL trace for the Pointer cardtype page's member search.
//
// Question under measurement: the live page renders the 21 Pointer-typed
// cards as [242] + [13 junction cards created-DESC] + [7 simple cards], the
// engine renders [14 junctions id-ASC] + [the SAME 7 simple cards]. The
// virtual search card is "Pointer+*type+by name" whose CQL is fabricated at
// src/card/fetch/virtual-search-cards.ts:76 as {"found_by":"_left",
// "sort_by":"name"}. This trace runs THAT statement through the engine's own
// executeQuery over the seeded deck and prints the generated SQL, the row
// order, and the seat order the render actually used.
//
// USAGE: node --max-old-space-size=6144 tmp/lane-engcand/engcand-pointer-search-trace.mjs

import { register } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
register(
  "./typescript-source-loader.mjs",
  pathToFileURL(path.join(HERE, "..", "..", "tools", "oracle") + path.sep).href,
);
const REPO = path.resolve(HERE, "..", "..");

const { createRawStructureSeededStorage, RAW_CORPUS_DB } = await import(
  pathToFileURL(path.join(REPO, "tests", "card", "render", "raw-corpus-seeding.ts")).href
);
const { executeQuery, parseOptionsWithLexicon } = await import(
  pathToFileURL(path.join(REPO, "src", "cql", "execute.ts")).href
);
const Database = (await import("better-sqlite3")).default;

const everyLiveId = new Database(RAW_CORPUS_DB, { readonly: true })
  .prepare("SELECT id FROM cards WHERE trash = 0").all().map((r) => r.id);

console.log(`TRACE boot: ids=${everyLiveId.length}`);
const storage = await createRawStructureSeededStorage(new Set(everyLiveId));
storage.fetcher.installNameEnvironment();
await storage.fetcher.warmLexicon(everyLiveId);
console.log("TRACE boot done");

// 1. The seat order the render used (the modarm seam's read surface).
const seatItems = storage.engine.executeSearch({ card: { key: "pointer+*type+by_name" } });
const seatIds = seatItems.map((c) => c.id ?? c.record?.id);
console.log("SEAT order (post-render): " + JSON.stringify(seatIds));

// 2. The raw CQL the virtual card carries.
const { VIRTUAL_SEARCH_CQL_BY_RIGHT_KEY, virtualSearchCqlFor } = await import(
  pathToFileURL(path.join(REPO, "src", "card", "fetch", "virtual-search-cards.ts")).href
);
console.log("by_name CQL row: " + JSON.stringify(VIRTUAL_SEARCH_CQL_BY_RIGHT_KEY.get("by_name")));
console.log("virtualSearchCqlFor(Pointer+*type+by name): " + JSON.stringify(
  virtualSearchCqlFor((await import(pathToFileURL(path.join(REPO, "src", "card", "name.js")).href)).DeckoName.parse("Pointer+*type+by name")),
));

// 3. executeQuery over the same statement, the way runSearch drives it.
const stmt = { found_by: "_left", sort_by: "name", limit: 20 };
const lexicon = storage.fetcher.lexicon ?? storage.fetcher;
const parseOpts = parseOptionsWithLexicon(lexicon, { context: "Pointer+*type+by name" });
const result = await executeQuery(storage.counting, stmt, { parse: parseOpts });
console.log("SQL: " + result.sql);
console.log("PARAMS: " + JSON.stringify(result.params).slice(0, 600));
console.log("ROWS n=" + result.rows.length);
console.log("ROW ids: " + JSON.stringify(result.rows.map((r) => r.id)));
