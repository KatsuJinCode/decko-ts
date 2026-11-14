// Detailed trace for shard-0 matching records: compare all engine fields
// against Ruby's capture and print the diff.

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { DeckoName } from "../../dist-ts/card/name.js";
import { PATTERN_TABLE } from "../../dist-ts/card/set-patterns/registry.js";
import { PatternInstance } from "../../dist-ts/card/set-patterns/instance.js";
import { ruleName } from "../../dist-ts/card/set-patterns/rule-names.js";

const db = new Database("./benchmarks/corpus-v2/bench-corpus-v2.sqlite3", { readonly: true });
const structureId = db.prepare("SELECT id FROM cards WHERE name = '*structure'").get().id;
const universeRows = db.prepare(
  "SELECT (CASE WHEN s.\"key\" IS NOT NULL THEN s.\"key\" " +
    "WHEN sl.\"key\" IS NOT NULL THEN sl.\"key\" || '+' || sp.\"key\" " +
    "ELSE NULL END) || '+' || st.\"key\" AS ck, " +
    "r.content AS c " +
  "FROM cards r " +
  "JOIN cards st ON st.id = r.right_id " +
  "LEFT JOIN cards s ON s.id = r.left_id " +
  "LEFT JOIN cards sl ON sl.id = s.left_id " +
  "LEFT JOIN cards sp ON sp.id = s.right_id " +
  "WHERE r.trash = 0 AND r.right_id = ?"
).all(structureId);
const universe = new Map();
for (const r of universeRows) if (r.ck) universe.set(r.ck, r.c);

const rntc = new Map();
for (const r of db.prepare(
  "SELECT r.name AS rn, " +
    "(CASE WHEN s.\"key\" IS NOT NULL THEN s.\"key\" " +
    "WHEN sl.\"key\" IS NOT NULL THEN sl.\"key\" || '+' || sp.\"key\" " +
    "ELSE NULL END) || '+' || st.\"key\" AS ck " +
  "FROM cards r " +
  "JOIN cards st ON st.id = r.right_id " +
  "LEFT JOIN cards s ON s.id = r.left_id " +
  "LEFT JOIN cards sl ON sl.id = s.left_id " +
  "LEFT JOIN cards sp ON sp.id = s.right_id " +
  "WHERE r.trash = 0 AND r.content IS NOT NULL AND r.name LIKE '%+*structure'"
).all()) if (r.ck) rntc.set(r.rn, r.ck);

const cardRows = new Map();
const typeNameById = new Map();
for (const r of db.prepare("SELECT id, name, key, type_id, left_id, right_id, content, codename FROM cards").all()) {
  cardRows.set(r.id, r);
  if (r.type_id !== null) typeNameById.set(r.id, r.name);
}
function ltn(cardRow) {
  if (!cardRow.left_id) return null;
  const l = cardRows.get(cardRow.left_id);
  if (!l || !l.type_id) return null;
  return cardRows.get(l.type_id)?.name || null;
}

const ruleContents = new Map();
for (const r of db.prepare("SELECT name, content FROM cards WHERE trash = 0 AND content IS NOT NULL AND name LIKE '%+*structure'").all()) {
  if (!ruleContents.has(r.content)) ruleContents.set(r.content, []);
  ruleContents.get(r.content).push(r.name);
}

const shard = readFileSync("./fixtures/corpus/shard-000000.jsonl", "utf8").split("\n").filter((l) => l.trim());

let pass = 0, fail = 0;
const failingRecords = [];
for (const line of shard) {
  const o = JSON.parse(line);
  if (!o.record) continue;
  const content = o.record.content;
  if (!ruleContents.has(content)) continue;
  const cardRow = cardRows.get(o.id);
  if (!cardRow) continue;
  const card = { name: o.name, id: o.id, typeId: cardRow.type_id, typeName: typeNameById.get(cardRow.type_id) || null, leftTypeName: ltn(cardRow), isNew: false, isRule: false };
  const insts = [];
  for (const spec of PATTERN_TABLE) {
    const inst = PatternInstance.tryNew(spec, card);
    if (inst) insts.push(inst);
  }
  const candidates = insts.map((i) => ruleName(i.setName, "*structure"));
  let engineWinContent = undefined;
  let engineWinIndex = -1;
  for (let i = 0; i < candidates.length; i++) {
    const cn = candidates[i];
    const composed = rntc.get(cn);
    if (composed === undefined) continue;
    const key = DeckoName.parse(cn).key;
    if (universe.has(key)) {
      engineWinContent = universe.get(key);
      engineWinIndex = i;
      break;
    }
  }
  const actualContent = engineWinContent !== undefined ? engineWinContent : (cardRow.content ?? "");
  const actualType = cardRow.type_id !== null ? (typeNameById.get(cardRow.type_id) || "") : "";
  const actualTypeCode = ""; // approximation: not the full codename resolution
  const actualCodename = cardRow.codename || null;

  const diffs = [];
  if (actualContent !== content) diffs.push("content");
  if (actualType !== o.record.type) diffs.push("type");
  if (actualTypeCode !== (o.record.type_code || "")) diffs.push("type_code");
  if ((actualCodename || null) !== o.record.codename) diffs.push("codename");

  if (diffs.length === 0) pass++;
  else {
    fail++;
    failingRecords.push({ id: o.id, name: o.name, owningRule: ruleContents.get(content)[0], engineWinIndex, diffs, capturedType: o.record.type, engineType: actualType, capturedTypeCode: o.record.type_code });
  }
}

console.log("shard-0 matching records: pass=" + pass + " fail=" + fail);
console.log("\nSample failing records:");
for (const f of failingRecords.slice(0, 30)) {
  console.log("  id=" + f.id + " name=" + f.name + " owningRule=" + f.owningRule);
  console.log("    diffs=" + f.diffs.join(",") + " engineWinIdx=" + f.engineWinIndex);
  console.log("    capturedType=\"" + f.capturedType + "\" engineType=\"" + f.engineType + "\" capturedTypeCode=\"" + f.capturedTypeCode + "\"");
}

db.close();
