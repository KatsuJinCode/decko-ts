// Simulate the engine's structuredCardContent candidate walk for every
// record whose captured content matches a *structure rule template.
// We classify each into one of four outcomes:
//   PASS    - engine would pick the same template Ruby did
//   NO_MATCH - engine's candidate walk finds no rule in the universe
//   DIFFERENT_RULE - engine picks a different rule (precedence/candidate mismatch)
//   NULL_CONTENT - engine's winning rule has NULL content (Ruby equivalent = "" or db)

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

// Build the structure rule universe exactly like the engine does.
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
const engineUniverse = new Map(); // composed key -> content
for (const row of engineUniverseRows) {
  if (row.composed_key !== null) engineUniverse.set(row.composed_key, row.db_content);
}

// Map rule NAME (the engine's candidate format) -> the rule's composed key
// (what engineUniverse uses). For each *structure rule row, compute both.
const ruleRowToComposed = new Map();
const ruleRowsAll = db.prepare(
  "SELECT r.id, r.name, r.content, r.left_id, r.right_id, " +
  "s.\"key\" AS s_key, sl.\"key\" AS sl_key, sp.\"key\" AS sp_key, " +
  "r.key AS r_key " +
  "FROM cards r " +
  "JOIN cards st ON st.id = r.right_id " +
  "LEFT JOIN cards s ON s.id = r.left_id " +
  "LEFT JOIN cards sl ON sl.id = s.left_id " +
  "LEFT JOIN cards sp ON sp.id = s.right_id " +
  "WHERE r.trash = 0 AND r.content IS NOT NULL AND r.name LIKE '%+*structure'"
).all();
const ruleNameToComposed = new Map(); // rule's natural name -> composed key
const composedToContent = new Map(); // composed key -> rule's content
for (const r of ruleRowsAll) {
  let composed = null;
  if (r.s_key !== null) composed = r.s_key + "+*structure";
  else if (r.sl_key !== null && r.sp_key !== null) composed = r.sl_key + "+" + r.sp_key + "+*structure";
  if (composed !== null) {
    ruleNameToComposed.set(r.name, composed);
    composedToContent.set(composed, r.content);
  }
}

// content -> list of rule names that own it (the owning rule set)
const contentToRules = new Map();
for (const r of ruleRowsAll) {
  if (!contentToRules.has(r.content)) contentToRules.set(r.content, []);
  contentToRules.get(r.content).push(r);
}

// Build a Map of card id -> {name, type_id, left_id, right_id, type_name, left_type_name}
// for every card referenced in the corpus (cards table).
const cardRowById = new Map();
const cardRows = db.prepare(
  "SELECT id, name, key, type_id, left_id, right_id FROM cards"
).all();
for (const r of cardRows) cardRowById.set(r.id, r);

// Look up type name by type_id
const typeNameById = new Map();
for (const r of cardRows) {
  if (r.type_id !== null) typeNameById.set(r.id, r.name);
}
// And left-type: the type of the left card
function leftTypeNameOf(cardRow) {
  if (cardRow.left_id === null) return null;
  const left = cardRowById.get(cardRow.left_id);
  if (left === undefined) return null;
  if (left.type_id === null) return null;
  const typeCard = cardRowById.get(left.type_id);
  return typeCard ? typeCard.name : null;
}

// Walk all shards
const shardNames = readdirSync(SHARD_DIR)
  .filter((f) => /^shard-\d{6}\.jsonl$/.test(f))
  .sort();

const candidates = [];
for (const shardName of shardNames) {
  const p = path.join(SHARD_DIR, shardName);
  const lines = readFileSync(p, "utf8").split("\n").filter((l) => l.trim() !== "");
  for (const line of lines) {
    const obj = JSON.parse(line);
    if (obj.record === undefined) continue;
    const content = obj.record.content;
    if (!contentToRules.has(content)) continue;
    // matching record - simulate the engine
    const owningRules = contentToRules.get(content);
    const cardRow = cardRowById.get(obj.id);
    if (cardRow === undefined) continue;
    // Build PatternCardInput for the engine
    const card = {
      name: obj.name,
      id: obj.id,
      typeId: cardRow.type_id ?? undefined,
      typeName: cardRow.type_id !== null ? (typeNameById.get(cardRow.type_id) ?? null) : null,
      leftTypeName: leftTypeNameOf(cardRow),
      isNew: false,
      isRule: obj.name.includes("+") && obj.name.endsWith("+structure"), // approximation
    };
    // Compute candidates via ruleNamesForCard -> join each pattern's setName with *structure
    const instances = [];
    for (const spec of PATTERN_TABLE) {
      const inst = PatternInstance.tryNew(spec, card);
      if (inst) instances.push(inst);
    }
    const candidateNames = instances.map((inst) => ruleName(inst.setName, "*structure"));
    // Find first candidate that's in the universe
    let engineWin = null;
    let engineWinIndex = -1;
    let engineWinContent = undefined;
    for (let i = 0; i < candidateNames.length; i++) {
      const cName = candidateNames[i];
      const composed = ruleNameToComposed.get(cName);
      if (composed === undefined) continue;
      // Check via the composed key
      // Actually the engine uses DeckoName.parse(cName).key to match
      const key = DeckoName.parse(cName).key;
      if (engineUniverse.has(key)) {
        engineWin = cName;
        engineWinIndex = i;
        engineWinContent = engineUniverse.get(key);
        break;
      }
    }
    // Compare
    let outcome = "NO_MATCH";
    let winningRuleName = null;
    if (engineWinContent !== undefined) {
      if (engineWinContent === content) {
        outcome = "PASS";
      } else if (engineWinContent === null) {
        outcome = "NULL_CONTENT";
      } else {
        outcome = "DIFFERENT_RULE";
      }
      winningRuleName = engineWin;
    }
    candidates.push({
      shard: shardName,
      id: obj.id,
      name: obj.name,
      type: obj.record.type,
      type_code: obj.record.type_code,
      content,
      owningRule: owningRules[0].name,
      candidateCount: candidateNames.length,
      firstFewCandidates: candidateNames.slice(0, 4),
      engineWin: engineWin,
      engineWinContent: engineWinContent,
      outcome,
    });
  }
}

// Bucket by outcome
const outcomeBucket = new Map();
for (const c of candidates) {
  outcomeBucket.set(c.outcome, (outcomeBucket.get(c.outcome) ?? 0) + 1);
}
console.log("Outcome breakdown for all", candidates.length, "matching records:");
for (const [o, n] of [...outcomeBucket.entries()].sort((a, b) => b[1] - a[1])) {
  console.log("  " + n.toString().padStart(5) + "  " + o);
}

// Bucket by (outcome, owningRule) — the structurePending class is the
// FAIL bucket (everything that's not PASS).
const failByOwningRule = new Map();
const passByOwningRule = new Map();
for (const c of candidates) {
  const map = c.outcome === "PASS" ? passByOwningRule : failByOwningRule;
  map.set(c.owningRule, (map.get(c.owningRule) ?? 0) + 1);
}
const failSorted = [...failByOwningRule.entries()].sort((a, b) => b[1] - a[1]);
console.log("\nTop 25 FAIL buckets (owning rule Ruby picked):");
for (const [rule, n] of failSorted.slice(0, 25)) {
  console.log("  " + n.toString().padStart(5) + "  " + rule);
}

const passSorted = [...passByOwningRule.entries()].sort((a, b) => b[1] - a[1]);
console.log("\nTop 15 PASS buckets (engine matched Ruby):");
for (const [rule, n] of passSorted.slice(0, 15)) {
  console.log("  " + n.toString().padStart(5) + "  " + rule);
}

// For the FAIL bucket, breakdown by sub-outcome
const failSubOutcome = new Map();
for (const c of candidates) {
  if (c.outcome === "PASS") continue;
  const key = c.outcome + "|" + c.owningRule;
  failSubOutcome.set(key, (failSubOutcome.get(key) ?? 0) + 1);
}
const failSubSorted = [...failSubOutcome.entries()].sort((a, b) => b[1] - a[1]);
console.log("\nTop 25 (sub-outcome, owning rule) FAIL buckets:");
for (const [key, n] of failSubSorted.slice(0, 25)) {
  console.log("  " + n.toString().padStart(5) + "  " + key);
}

// For the DIFFERENT_RULE bucket, what's the engine actually picking?
const differentRulePairs = new Map();
for (const c of candidates) {
  if (c.outcome !== "DIFFERENT_RULE") continue;
  const key = c.owningRule + " -> " + c.engineWin;
  differentRulePairs.set(key, (differentRulePairs.get(key) ?? 0) + 1);
}
const pairSorted = [...differentRulePairs.entries()].sort((a, b) => b[1] - a[1]);
console.log("\nTop 20 DIFFERENT_RULE pairs (Ruby picked -> Engine picked):");
for (const [key, n] of pairSorted.slice(0, 20)) {
  console.log("  " + n.toString().padStart(5) + "  " + key);
}

// NO_MATCH details
const noMatchByRule = new Map();
const noMatchFirstCandidates = new Map();
for (const c of candidates) {
  if (c.outcome !== "NO_MATCH") continue;
  noMatchByRule.set(c.owningRule, (noMatchByRule.get(c.owningRule) ?? 0) + 1);
  const firstCand = (c.firstFewCandidates || []).join(" | ") || "(none)";
  noMatchFirstCandidates.set(firstCand, (noMatchFirstCandidates.get(firstCand) ?? 0) + 1);
}
console.log("\nNO_MATCH: top 10 owning rules:");
for (const [r, n] of [...noMatchByRule.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log("  " + n.toString().padStart(5) + "  " + r);
}
console.log("\nNO_MATCH: top 10 first-candidate-sets (engine's walk produced no match):");
for (const [r, n] of [...noMatchFirstCandidates.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log("  " + n.toString().padStart(5) + "  " + r);
}

// Sample 3 NO_MATCH records to inspect
console.log("\n=== Sample NO_MATCH records ===");
const noMatchSamples = candidates.filter(c => c.outcome === "NO_MATCH").slice(0, 5);
for (const s of noMatchSamples) {
  console.log("  shard=" + s.shard + " id=" + s.id + " name=" + s.name + " type=" + s.type_code);
  console.log("    content=" + s.content.slice(0, 80));
  console.log("    owningRule(Ruby)=" + s.owningRule);
  console.log("    candidates=" + s.firstFewCandidates.join(" | "));
}

db.close();
