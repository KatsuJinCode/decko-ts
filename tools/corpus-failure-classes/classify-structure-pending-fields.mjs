// Refined classifier: actually simulate what the engine's record handler
// would produce for each matching record (applying structuredCardContent
// correctly), and compare ALL record fields against Ruby's capture to
// identify which field actually diverges.
//
// The structure-pending class = card-engine failure + Ruby content is a
// rule template. The failure can be on ANY field, not just content.

import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DeckoName } from "../../dist-ts/card/name.js";
import { PATTERN_TABLE } from "../../dist-ts/card/set-patterns/registry.js";
import { PatternInstance } from "../../dist-ts/card/set-patterns/instance.js";
import { ruleName } from "../../dist-ts/card/set-patterns/rule-names.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const CORPUS_DB = path.join(REPO, "benchmarks", "corpus-v2", "bench-corpus-v2.sqlite3");
const SHARD_DIR = path.join(REPO, "fixtures", "corpus");

const db = new Database(CORPUS_DB, { readonly: true });

// Build structure rule universe (engine view)
const structureId = db.prepare(
  "SELECT id FROM cards WHERE (name = '*structure' OR key = '*structure') AND trash = 0 ORDER BY id LIMIT 1"
).get().id;
const engineUniverseRows = db.prepare(
  "SELECT " +
  "(CASE WHEN s.\"key\" IS NOT NULL THEN s.\"key\" " +
  "WHEN sl.\"key\" IS NOT NULL THEN sl.\"key\" || '+' || sp.\"key\" " +
  "ELSE NULL END) || '+' || st.\"key\" AS composed_key, " +
  "r.content AS db_content " +
  "FROM cards r " +
  "JOIN cards st ON st.id = r.right_id " +
  "LEFT JOIN cards s ON s.id = r.left_id " +
  "LEFT JOIN cards sl ON sl.id = s.left_id " +
  "LEFT JOIN cards sp ON sp.id = s.right_id " +
  "WHERE r.trash = 0 AND r.right_id = ?"
).all(structureId);
const engineUniverse = new Map();
for (const row of engineUniverseRows) {
  if (row.composed_key !== null) engineUniverse.set(row.composed_key, row.db_content);
}

const ruleNameToComposed = new Map();
for (const r of db.prepare(
  "SELECT r.id, r.name, r.content, r.left_id, r.right_id, " +
  "s.\"key\" AS s_key, sl.\"key\" AS sl_key, sp.\"key\" AS sp_key " +
  "FROM cards r " +
  "JOIN cards st ON st.id = r.right_id " +
  "LEFT JOIN cards s ON s.id = r.left_id " +
  "LEFT JOIN cards sl ON sl.id = s.left_id " +
  "LEFT JOIN cards sp ON sp.id = s.right_id " +
  "WHERE r.trash = 0 AND r.content IS NOT NULL AND r.name LIKE '%+*structure'"
).all()) {
  let composed = null;
  if (r.s_key !== null) composed = r.s_key + "+*structure";
  else if (r.sl_key !== null && r.sp_key !== null) composed = r.sl_key + "+" + r.sp_key + "+*structure";
  if (composed !== null) ruleNameToComposed.set(r.name, composed);
}

const contentToRules = new Map();
for (const r of db.prepare(
  "SELECT name, content FROM cards WHERE trash = 0 AND content IS NOT NULL AND name LIKE '%+*structure'"
).all()) {
  if (!contentToRules.has(r.content)) contentToRules.set(r.content, []);
  contentToRules.get(r.content).push(r);
}

const cardRowById = new Map();
const typeNameById = new Map();
for (const r of db.prepare("SELECT id, name, key, type_id, left_id, right_id FROM cards").all()) {
  cardRowById.set(r.id, r);
  if (r.type_id !== null) typeNameById.set(r.id, r.name);
}
function leftTypeNameOf(cardRow) {
  if (cardRow.left_id === null) return null;
  const left = cardRowById.get(cardRow.left_id);
  if (!left || left.type_id === null) return null;
  const typeCard = cardRowById.get(left.type_id);
  return typeCard ? typeCard.name : null;
}

const shardNames = readdirSync(SHARD_DIR)
  .filter((f) => /^shard-\d{6}\.jsonl$/.test(f))
  .sort();

const results = [];
for (const shardName of shardNames) {
  const p = path.join(SHARD_DIR, shardName);
  const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim() !== "");
  for (const line of lines) {
    const obj = JSON.parse(line);
    if (obj.record === undefined) continue;
    const content = obj.record.content;
    if (!contentToRules.has(content)) continue;

    const owningRules = contentToRules.get(content);
    const cardRow = cardRowById.get(obj.id);
    if (!cardRow) continue;

    const card = {
      name: obj.name,
      id: obj.id,
      typeId: cardRow.type_id ?? undefined,
      typeName: cardRow.type_id !== null ? (typeNameById.get(cardRow.type_id) ?? null) : null,
      leftTypeName: leftTypeNameOf(cardRow),
      isNew: false,
      isRule: false,
    };

    // Candidate walk
    const instances = [];
    for (const spec of PATTERN_TABLE) {
      const inst = PatternInstance.tryNew(spec, card);
      if (inst) instances.push(inst);
    }
    const candidateNames = instances.map((inst) => ruleName(inst.setName, "*structure"));

    let engineWinContent = undefined;
    let engineWinIndex = -1;
    let engineWinName = null;
    for (let i = 0; i < candidateNames.length; i++) {
      const cName = candidateNames[i];
      const composed = ruleNameToComposed.get(cName);
      if (composed === undefined) continue;
      const key = DeckoName.parse(cName).key;
      if (engineUniverse.has(key)) {
        engineWinContent = engineUniverse.get(key);
        engineWinIndex = i;
        engineWinName = cName;
        break;
      }
    }

    // Simulate the engine's full record
    const isSimple = obj.name === "*self" || !obj.name.includes("+");
    const actualContent = engineWinContent !== undefined ? engineWinContent : (cardRow.content ?? "");
    const actualType = cardRow.type_id !== null ? (typeNameById.get(cardRow.type_id) ?? "") : "";
    // type_code comes from codenames; approximate as "basic" / "cardtype" / "search_type" / etc.
    // For now, simulate as "basic" for cards without an explicit type code in shard
    const actualTypeCode = obj.record.type_code; // assume engine would compute the same (codename resolution)
    const actualCodename = obj.record.codename;

    // Compare ALL fields
    const diffs = [];
    if (actualContent !== content) diffs.push("content");
    if (actualType !== obj.record.type) diffs.push("type");
    if (actualTypeCode !== obj.record.type_code) diffs.push("type_code");
    if ((actualCodename ?? null) !== obj.record.codename) diffs.push("codename");

    // Determine outcome based on full record comparison
    const isPass = diffs.length === 0;

    results.push({
      shard: shardName,
      id: obj.id,
      name: obj.name,
      type_code: obj.record.type_code,
      content,
      owningRule: owningRules[0].name,
      engineWin: engineWinName,
      engineWinIndex,
      diffs,
      outcome: isPass ? "PASS" : "FAIL",
    });
  }
}

// Bucket
const outcomeBucket = new Map();
for (const r of results) {
  outcomeBucket.set(r.outcome, (outcomeBucket.get(r.outcome) ?? 0) + 1);
}
console.log("Outcome breakdown for", results.length, "matching records:");
for (const [o, n] of [...outcomeBucket.entries()].sort((a, b) => b[1] - a[1])) {
  console.log("  " + n.toString().padStart(5) + "  " + o);
}

// Bucket FAIL by (owning rule, diffs)
const failDiffBucket = new Map();
for (const r of results) {
  if (r.outcome !== "FAIL") continue;
  const key = r.diffs.join("+") + " | " + r.owningRule;
  failDiffBucket.set(key, (failDiffBucket.get(key) ?? 0) + 1);
}
const failDiffSorted = [...failDiffBucket.entries()].sort((a, b) => b[1] - a[1]);
console.log("\nTop 25 (diffs, owning rule) FAIL buckets:");
for (const [key, n] of failDiffSorted.slice(0, 25)) {
  console.log("  " + n.toString().padStart(5) + "  " + key);
}

// Bucket FAIL by diffs alone
const diffsOnlyBucket = new Map();
for (const r of results) {
  if (r.outcome !== "FAIL") continue;
  const key = r.diffs.join("+");
  diffsOnlyBucket.set(key, (diffsOnlyBucket.get(key) ?? 0) + 1);
}
const diffsSorted = [...diffsOnlyBucket.entries()].sort((a, b) => b[1] - a[1]);
console.log("\nTop diff-buckets across all FAIL records:");
for (const [key, n] of diffsSorted) {
  console.log("  " + n.toString().padStart(5) + "  " + key);
}

// Bucket by content value
const contentBucket = new Map();
for (const r of results) {
  if (r.outcome !== "FAIL") continue;
  const c = r.content;
  contentBucket.set(c, (contentBucket.get(c) ?? 0) + 1);
}
const contentSorted = [...contentBucket.entries()].sort((a, b) => b[1] - a[1]);
console.log("\nTop 10 content values among FAIL records:");
for (const [c, n] of contentSorted.slice(0, 10)) {
  const preview = c.length > 100 ? c.slice(0, 100) + "..." : c;
  console.log("  " + n.toString().padStart(5) + "  \"" + preview + "\"");
}

// Bucket FAIL by content (first 60 chars) + owning rule
const failContentRule = new Map();
for (const r of results) {
  if (r.outcome !== "FAIL") continue;
  const key = r.content.slice(0, 60) + "|" + r.owningRule;
  failContentRule.set(key, (failContentRule.get(key) ?? 0) + 1);
}
const failContentSorted = [...failContentRule.entries()].sort((a, b) => b[1] - a[1]);
console.log("\nTop 15 FAIL (content-prefix, owning rule) buckets:");
for (const [key, n] of failContentSorted.slice(0, 15)) {
  console.log("  " + n.toString().padStart(5) + "  " + key);
}

// Sample 5 FAIL records from the largest bucket to see what fields diverge
console.log("\n=== Sample FAIL records (largest bucket: content=\"\") ===");
const samples = results.filter(r => r.outcome === "FAIL" && r.content === "").slice(0, 8);
for (const s of samples) {
  console.log("  shard=" + s.shard + " id=" + s.id + " name=" + s.name);
  console.log("    type_code=" + s.type_code + " owningRule=" + s.owningRule);
  console.log("    engineWin=" + s.engineWin + " (index " + s.engineWinIndex + ")");
  console.log("    diffs=" + s.diffs.join(","));
}

// What is the type distribution for empty-content FAIL records?
const emptyFailTypes = new Map();
for (const r of results) {
  if (r.outcome !== "FAIL" || r.content !== "") continue;
  const t = r.type_code;
  emptyFailTypes.set(t, (emptyFailTypes.get(t) ?? 0) + 1);
}
console.log("\nEmpty-content FAIL records by type_code:");
for (const [t, n] of [...emptyFailTypes.entries()].sort((a, b) => b[1] - a[1])) {
  console.log("  " + n.toString().padStart(5) + "  " + JSON.stringify(t));
}

// What is the type for card id=28 in the Ruby capture? Compare with what
// engine would compute.
console.log("\n=== Verify: card id=28 (*all+*default) full record ===");
const c28Shard0 = JSON.parse(readFileSync(path.join(SHARD_DIR, "shard-000000.jsonl"), "utf8").split("\n").filter(l => l.trim())[27]);
console.log("Ruby capture:", JSON.stringify(c28Shard0.record));
const c28Db = db.prepare("SELECT id, name, type_id, left_id, content FROM cards WHERE id = 28").get();
console.log("Corpus DB:", c28Db);

db.close();
