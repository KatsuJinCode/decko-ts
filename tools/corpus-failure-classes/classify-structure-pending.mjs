// Classify the structurePending record failures (4,151 of 47,131 in the
// permfix48 run) into mechanism buckets. The classification oracle the
// replay driver uses is: a card-engine failure whose EXPECTED (Ruby
// captured) content equals a *structure rule card's stored content is
// structure-pending. We can't easily reproduce the engine's
// structuredCardContent output here (that requires the full replay
// driver), but we CAN characterize the FAIL side by:
//   1. The expected content (the rule template string).
//   2. The owning *structure rule card (by content) in the corpus DB.
//   3. Whether that rule is reachable from the engine's universe statement
//      (the same flat composition the engine uses to build the universe).
// Mechanism hypothesis: the rule universe statement misses some rules
// (key composition drops them), OR the candidate walk yields a different
// precedence order, OR the structured content resolution picks a
// different set's template than Ruby did.

import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const CORPUS_DB = path.join(REPO, "benchmarks", "corpus-v2", "bench-corpus-v2.sqlite3");
const SHARD_DIR = path.join(REPO, "fixtures", "corpus");

const db = new Database(CORPUS_DB, { readonly: true });

// 1. Load every *structure rule with its content + set shape
const ruleRows = db.prepare(
  "SELECT r.id, r.name, r.content, r.left_id, r.right_id, " +
  "s.id AS set_id, s.name AS set_name, s.key AS set_key, " +
  "sl.id AS set_left_id, sl.name AS set_left_name, sl.key AS set_left_key, " +
  "sp.id AS set_right_id, sp.name AS set_right_name, sp.key AS set_right_key " +
  "FROM cards r " +
  "JOIN cards st ON st.id = r.right_id " +
  "LEFT JOIN cards s ON s.id = r.left_id " +
  "LEFT JOIN cards sl ON sl.id = s.left_id " +
  "LEFT JOIN cards sp ON sp.id = s.right_id " +
  "WHERE r.trash = 0 AND r.content IS NOT NULL AND r.name LIKE '%+*structure'"
).all();

const contentToRules = new Map();
for (const r of ruleRows) {
  if (!contentToRules.has(r.content)) contentToRules.set(r.content, []);
  contentToRules.get(r.content).push(r);
}

// 2. Walk all shards and collect records whose content matches a rule template
const shardNames = readdirSync(SHARD_DIR)
  .filter((f) => /^shard-\d{6}\.jsonl$/.test(f))
  .sort();

const matchingRecords = [];
let totalRecordEntries = 0;
for (const shardName of shardNames) {
  const p = path.join(SHARD_DIR, shardName);
  const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim() !== "");
  for (const line of lines) {
    const obj = JSON.parse(line);
    if (obj.record === undefined) continue;
    totalRecordEntries++;
    if (contentToRules.has(obj.record.content)) {
      matchingRecords.push({
        shard: shardName,
        id: obj.id,
        name: obj.name,
        type: obj.record.type,
        type_code: obj.record.type_code,
        content: obj.record.content,
        owningRules: contentToRules.get(obj.record.content),
      });
    }
  }
}

console.log("Total record entries across shards:", totalRecordEntries);
console.log("Records whose content matches a *structure rule template:", matchingRecords.length);

// 3. Bucket by set family, rule name, content, type_code combos
const setFamilyBucket = new Map();
const ruleNameBucket = new Map();
const contentBucket = new Map();
const contentTypeCodeBucket = new Map();
const setFamilyTypeCodeBucket = new Map();

function setFamilyOf(rule) {
  return rule.name.replace(/\+?\*structure$/, "");
}

for (const rec of matchingRecords) {
  const rule = rec.owningRules[0];
  const family = setFamilyOf(rule);
  setFamilyBucket.set(family, (setFamilyBucket.get(family) ?? 0) + 1);
  ruleNameBucket.set(rule.name, (ruleNameBucket.get(rule.name) ?? 0) + 1);
  contentBucket.set(rec.content, (contentBucket.get(rec.content) ?? 0) + 1);
  const ctKey = rec.content + "|" + rec.type_code;
  contentTypeCodeBucket.set(ctKey, (contentTypeCodeBucket.get(ctKey) ?? 0) + 1);
  const sfKey = family + "|" + rec.type_code;
  setFamilyTypeCodeBucket.set(sfKey, (setFamilyTypeCodeBucket.get(sfKey) ?? 0) + 1);
}

const sortedFamilies = [...setFamilyBucket.entries()].sort((a, b) => b[1] - a[1]);
const sortedRules = [...ruleNameBucket.entries()].sort((a, b) => b[1] - a[1]);
const sortedContents = [...contentBucket.entries()].sort((a, b) => b[1] - a[1]);

console.log("\n=== Top 25 set families ===");
for (const [family, count] of sortedFamilies.slice(0, 25)) {
  console.log("  " + count.toString().padStart(5) + "  " + family);
}

console.log("\n=== Top 25 exact rule names ===");
for (const [name, count] of sortedRules.slice(0, 25)) {
  console.log("  " + count.toString().padStart(5) + "  " + name);
}

console.log("\n=== Top 15 distinct template content ===");
for (const [content, count] of sortedContents.slice(0, 15)) {
  const preview = content.length > 100 ? content.slice(0, 100) + "..." : content;
  console.log("  " + count.toString().padStart(5) + "  \"" + preview + "\"");
}

// 4. Build the engine's universe the same way structure.ts does
const structureCard = db.prepare(
  "SELECT id FROM cards WHERE (name = '*structure' OR key = '*structure') AND trash = 0 ORDER BY id LIMIT 1"
).get();
const structureId = structureCard.id;
console.log("\n*structure setting card id:", structureId);

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
console.log("Engine universe size (composed keys):", engineUniverse.size);
console.log("Total *structure rule rows:", ruleRows.length);

// 5. For each matching record, find the owning rule's composed key and
//    check whether the engine's universe contains it
function composedKeyFor(ruleName) {
  const setName = ruleName.replace(/\+?\*structure$/, "");
  const rule = db.prepare(
    "SELECT r.left_id, r.right_id, " +
    "s.name AS s_name, s.\"key\" AS s_key, " +
    "sl.name AS sl_name, sl.\"key\" AS sl_key, " +
    "sp.name AS sp_name, sp.\"key\" AS sp_key " +
    "FROM cards r " +
    "LEFT JOIN cards s ON s.id = r.left_id " +
    "LEFT JOIN cards sl ON sl.id = s.left_id " +
    "LEFT JOIN cards sp ON sp.id = s.right_id " +
    "WHERE r.trash = 0 AND r.name = ? LIMIT 1"
  ).get(ruleName);
  if (!rule) return { key: null, reason: "no_rule_row", setName };
  if (rule.s_key) return { key: rule.s_key + "+*structure", reason: "simple_set", setName };
  if (rule.sl_key && rule.sp_key) return { key: rule.sl_key + "+" + rule.sp_key + "+*structure", reason: "junction_set", setName };
  return { key: null, reason: "unknown_set_shape", setName };
}

const missingRuleStats = { inUniverse: 0, missing: 0, noRuleRow: 0, unknownShape: 0 };
const missingByReason = new Map();
for (const rec of matchingRecords) {
  const rule = rec.owningRules[0];
  const comp = composedKeyFor(rule.name);
  if (comp.key === null) {
    if (comp.reason === "no_rule_row") missingRuleStats.noRuleRow++;
    else missingRuleStats.unknownShape++;
    missingByReason.set(comp.reason, (missingByReason.get(comp.reason) ?? 0) + 1);
    continue;
  }
  if (engineUniverse.has(comp.key)) {
    missingRuleStats.inUniverse++;
  } else {
    missingRuleStats.missing++;
    missingByReason.set("MISSING_FROM_UNIVERSE:" + comp.key, (missingByReason.get("MISSING_FROM_UNIVERSE:" + comp.key) ?? 0) + 1);
  }
}

console.log("\nOwning-rule-vs-engine-universe for", matchingRecords.length, "matching records:");
console.log("  in engine universe (engine could resolve):", missingRuleStats.inUniverse);
console.log("  missing from universe (key composition dropped it):", missingRuleStats.missing);
console.log("  owning rule has no row in DB:", missingRuleStats.noRuleRow);
console.log("  unknown set shape (deeper than junction):", missingRuleStats.unknownShape);

const sortedMissing = [...missingByReason.entries()].sort((a, b) => b[1] - a[1]);
console.log("\n=== Top 20 missing-by-reason buckets ===");
for (const [reason, count] of sortedMissing.slice(0, 20)) {
  console.log("  " + count.toString().padStart(5) + "  " + reason);
}

// 6. Bucket by presence in universe + set family
const presenceFamilyBucket = new Map();
for (const rec of matchingRecords) {
  const rule = rec.owningRules[0];
  const comp = composedKeyFor(rule.name);
  const present = comp.key !== null && engineUniverse.has(comp.key);
  const family = setFamilyOf(rule);
  const key = (present ? "PRESENT:" : "MISSING:") + family;
  presenceFamilyBucket.set(key, (presenceFamilyBucket.get(key) ?? 0) + 1);
}
const sortedPresence = [...presenceFamilyBucket.entries()].sort((a, b) => b[1] - a[1]);
console.log("\n=== Top 30 (presence, set-family) buckets ===");
for (const [key, count] of sortedPresence.slice(0, 30)) {
  console.log("  " + count.toString().padStart(5) + "  " + key);
}

// 7. For the MISSING rows, show the rule name and what the composed key was
const missingExamples = [];
for (const rec of matchingRecords) {
  const rule = rec.owningRules[0];
  const comp = composedKeyFor(rule.name);
  if (comp.key !== null && !engineUniverse.has(comp.key)) {
    missingExamples.push({
      shard: rec.shard, id: rec.id, name: rec.name,
      type_code: rec.type_code, ruleName: rule.name,
      composedKey: comp.key, contentPreview: rec.content.slice(0, 60)
    });
    if (missingExamples.length >= 5) break;
  }
}
console.log("\n=== Sample MISSING-from-universe records ===");
for (const ex of missingExamples) {
  console.log("  shard=" + ex.shard + " id=" + ex.id + " name=" + ex.name + " type_code=" + ex.type_code);
  console.log("    ruleName=" + ex.ruleName + " composedKey=" + ex.composedKey);
  console.log("    content=" + ex.contentPreview);
}

// 8. Look at top set families with type_code to find the engine-side gap
console.log("\n=== Top 20 (set-family, type_code) buckets ===");
const sortedFamilyType = [...setFamilyTypeCodeBucket.entries()].sort((a, b) => b[1] - a[1]);
for (const [key, count] of sortedFamilyType.slice(0, 20)) {
  console.log("  " + count.toString().padStart(5) + "  " + key);
}

db.close();
