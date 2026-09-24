// Quick check: simulate what the engine's record handler produces for card
// id=12865 against the live corpus, after my Fix 1 to structure.ts.
// We don't need the full RenderEngine — just structuredCardContent.

import Database from "better-sqlite3";
import { DeckoName } from "../../dist-ts/card/name.js";
import { PATTERN_TABLE } from "../../dist-ts/card/set-patterns/registry.js";
import { PatternInstance } from "../../dist-ts/card/set-patterns/instance.js";
import { ruleName } from "../../dist-ts/card/set-patterns/rule-names.js";
import { structureRuleUniverseStatement, structureUniverseFromResults, resolveStructuredContent, structuredCardContent } from "../../dist-ts/card/rules/structure.js";
import { TABLES } from "../../dist-ts/server/schema.js";

// Build a test storage with the LIVE schema
const testDb = new Database(":memory:");
const cardCols = TABLES.cards.columns;
testDb.exec(
  `CREATE TABLE cards (${Object.entries(cardCols).map(([k, v]) => `${v} ${typeof k === "string" && k === "id" ? "INTEGER PRIMARY KEY" : "TEXT"}`).join(", ")})`
);

const corpusDb = new Database("./benchmarks/corpus-v2/bench-corpus-v2.sqlite3", { readonly: true });

// Seed all *structure rules
const structureId = corpusDb.prepare("SELECT id FROM cards WHERE name = '*structure'").get().id;
const ruleRows = corpusDb.prepare("SELECT id, name, key, content, type_id, left_id, right_id, codename FROM cards WHERE trash = 0 AND content IS NOT NULL AND name LIKE '%+*structure'").all();
const insert = testDb.prepare(`INSERT OR IGNORE INTO cards (id, name, key, db_content, type_id, left_id, right_id, codename) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
for (const r of ruleRows) {
  insert.run(r.id, r.name, r.key, r.content, r.type_id, r.left_id, r.right_id, r.codename);
}
insert.run(structureId, "*structure", "*structure", null, null, null, null, "structure");

// Seed card id=12865 and its type
const card12865 = corpusDb.prepare("SELECT id, name, key, content, type_id, left_id, right_id, codename FROM cards WHERE id = 12865").get();
insert.run(card12865.id, card12865.name, card12865.key, card12865.content, card12865.type_id, card12865.left_id, card12865.right_id, card12865.codename);
const typeCard = corpusDb.prepare("SELECT id, name, key, codename FROM cards WHERE id = ?").get(card12865.type_id);
insert.run(typeCard.id, typeCard.name, typeCard.key, null, null, null, null, typeCard.codename);
const leftCard = corpusDb.prepare("SELECT id, name, key, codename, type_id FROM cards WHERE id = ?").get(card12865.left_id);
insert.run(leftCard.id, leftCard.name, leftCard.key, null, leftCard.type_id, card12865.left_id, null, leftCard.codename);
const leftTypeCard = leftCard.type_id ? corpusDb.prepare("SELECT id, name, key, codename FROM cards WHERE id = ?").get(leftCard.type_id) : null;
if (leftTypeCard) insert.run(leftTypeCard.id, leftTypeCard.name, leftTypeCard.key, null, null, null, null, leftTypeCard.codename);

// Seed the *type plus right pattern card
const patternCard = corpusDb.prepare("SELECT id, name, key, codename FROM cards WHERE name = '*type plus right'").get();
if (patternCard) insert.run(patternCard.id, patternCard.name, patternCard.key, null, null, null, null, patternCard.codename);

// Build universe via NEW SQL
const result = testDb.prepare(structureRuleUniverseStatement().sql).all();
const universe = structureUniverseFromResults({ rows: result });
console.log("Universe size:", universe.size);
console.log("Has orvipveb+ghvmfggkmzxdn+*type_plu_right+*structure:", universe.has("orvipveb+ghvmfggkmzxdn+*type_plu_right+*structure"));

// Build card and resolve
const card = { name: card12865.name, id: card12865.id, typeId: card12865.type_id, typeName: typeCard.name, leftTypeName: leftTypeCard?.name ?? null, isNew: false, isRule: false };

const content = structuredCardContent(card, card12865.content, universe);
console.log("\nEngine-computed content for card 12865:");
console.log("  Length:", content.length);
console.log("  Preview:", content.slice(0, 80));
console.log("\nRuby-captured content:");
console.log("  Length:", card12865.content?.length);
console.log("  Preview:", (card12865.content ?? "").slice(0, 80));
console.log("\nMatch:", content === card12865.content);
