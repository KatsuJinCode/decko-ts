// targeted-test-deck.mjs — generate the Cloudflare TARGETED TEST deck.
//
// Purpose (operator-approved 2026-09-23): exercise every dimension the
// corpus replay showed matters on the deployed engine, with as little data
// as possible — nothing in this deck tests nothing:
//   1. point reads            — 2,000 ordinary content cards (varied sizes)
//   2. nesting/recursion      — one 32-deep inclusion chain
//   3. set membership at size — one 500-item pointer list
//   4. large content          — 5 cards with ~16KB bodies
//   5. junction/compound names— 50 junction pairs (100 sides + 50 rows)
//   6. permission denials     — 50 cards under a *self read rule
//   7. mod-view dispatch      — 100 cards rendered under mod-loaded views
//   8. CQL scans              — the search card over the ordinary set
// Total: ~2,340 cards + ~800 references ≈ 3,150 rows (≈3% of the D1 free
// daily write budget; verified against the arithmetic rule before apply).
//
// DATA RULE (absolute): every string is synthetic. No corpus content.
//
// Output: deploy/cf-scale-deck/seed.sql (apply AFTER migrations/0001-schema.sql).

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "..", "deploy", "cf-scale-deck");
const TARGET = join(OUT_DIR, "seed.sql");
const STAMP = "2026-09-23 00:00:00.000";

function q(value) {
  return typeof value === "string" ? `'${value.replace(/'/g, "''")}'` : value === null ? "NULL" : String(value);
}

const cards = []; // {id,label,sql}
const refs = []; // sql strings
let nextId = 1;
function addCard(row) {
  const id = row.id ?? nextId++;
  const key = row.name !== undefined && row.name !== null
    ? row.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")
    : null;
  cards.push({
    id,
    label: row.label,
    sql: [
      `INSERT INTO cards (id, name, key, codename, left_id, right_id, current_revision_id, created_at, updated_at, creator_id, updater_id, read_rule_class, read_rule_id, references_expired, trash, type_id, db_content) VALUES (`,
      `  ${q(id)}, ${q(row.name ?? null)}, ${q(key)}, ${q(row.codename ?? null)}, ${q(row.leftId ?? null)}, ${q(row.rightId ?? null)}, NULL,`,
      `  '${STAMP}', '${STAMP}', 1, 1, ${q(row.readRuleClass ?? null)}, ${q(row.readRuleId ?? null)}, NULL, 0, ${q(row.typeId)}, ${q(row.dbContent ?? null)});`,
    ].join(" "),
  });
  return id;
}
function addRef(id, refererId, refereeKey, refereeId, refType) {
  refs.push(
    `INSERT INTO card_references (id, referer_id, referee_key, referee_id, ref_type, is_present) VALUES (${q(id)}, ${q(refererId)}, ${q(refereeKey)}, ${q(refereeId)}, ${q(refType)}, 1);`,
  );
}

// -- type scaffold (same conventions as deploy/seed.mjs) ---------------------
addCard({ name: "CF Test Bot", typeId: 4, label: "author identity" });
addCard({ name: "Search", codename: "search_type", typeId: 3, label: "Search cardtype" });
addCard({ name: "Cardtype", typeId: 3, label: "Cardtype cardtype" });
addCard({ name: "User", typeId: 3, label: "User cardtype" });
addCard({ name: "Usertype", typeId: 3, label: "Usertype cardtype" });
addCard({ name: "Note", typeId: 3, label: "Note cardtype" });
addCard({ name: "Pointer", typeId: 3, label: "Pointer cardtype" });
const NOTE = 6; // type_id of the Note card
const POINTER = 7;

// -- home (smoke battery anchor) ---------------------------------------------
addCard({ name: "Home", typeId: NOTE, dbContent: "Cloudflare targeted-test deck home. Synthetic content only." });

// -- dimension 1: 2,000 ordinary point-read cards ----------------------------
const ORDINARY = 2000;
const ordinaryStart = [];
for (let i = 1; i <= ORDINARY; i += 1) {
  const size = 50 + ((i * 37) % 450); // 50-500 bytes, deterministic variety
  const body = `Scale page ${i}. ` + "Synthetic paragraph for read-path measurement. ".repeat(Math.ceil(size / 52)).slice(0, size);
  ordinaryStart.push(addCard({ name: `Scale Page ${i}x`, typeId: NOTE, dbContent: body }));
}

// -- dimension 2: 32-deep inclusion chain ------------------------------------
// Chain of junction cards: Depth Root includes L1 includes L2 ... includes L31.
// Parents are created downward from the leaf so each parent's nest content
// can reference its child by name at construction time. Junction rows carry
// NULL name/key with left_id/right_id (2020 convention).
const chainContent = "The deepest content of the 32-level chain.";
let childId = addCard({ name: "Depth Level 31", typeId: NOTE, dbContent: chainContent });
for (let level = 30; level >= 0; level -= 1) {
  const parentName = level === 0 ? "Depth Root" : `Depth Level ${level}`;
  const childName = level === 0 ? "Depth Level 1" : `Depth Level ${level + 1}`;
  const parentId = addCard({ name: parentName, typeId: NOTE, dbContent: `Depth level ${level} nests its child:\n\n{{${childName}}}` });
  const jid = addCard({ name: null, key: null, leftId: parentId, rightId: childId, typeId: NOTE, dbContent: null, label: `chain junction L${level}->L${level + 1}` });
  addRef(jid, parentId, childName.toLowerCase().replace(/[^a-z0-9]+/g, "_"), childId, "I");
  childId = parentId;
}

// -- dimension 3: 500-item pointer list ---------------------------------------
{
  const lines = [];
  for (let i = 1; i <= 500; i += 1) {
    lines.push(`[[Scale Page ${i}x]]`);
  }
  const pointerId = addCard({ name: "Big Pointer", typeId: POINTER, dbContent: lines.join("\n") });
  for (let i = 1; i <= 500; i += 1) {
    const targetName = `Scale Page ${i}x`;
    addRef(pointerId + 100000 + i, pointerId, targetName.toLowerCase().replace(/[^a-z0-9]+/g, "_"), ordinaryStart[i - 1], "L");
  }
}

// -- dimension 4: 5 large-content cards (~16KB bodies) ------------------------
for (let i = 1; i <= 5; i += 1) {
  const para = `Large content card ${i}. Dense synthetic text for pathological-page measurement, exercising every wrap and escape in the render path. `;
  addCard({ name: `Large Doc ${i}`, typeId: NOTE, dbContent: (para + `<p>[[Scale Page ${i}x]]</p>\n`).repeat(160).slice(0, 16384) });
}

// -- dimension 5: 50 junction/compound pairs ----------------------------------
for (let i = 1; i <= 50; i += 1) {
  const leftName = `Scale Page ${i}x`;
  const rightName = `Scale Page ${i + 500}x`;
  const leftId = ordinaryStart[i - 1];
  const rightId = ordinaryStart[i + 499];
  addCard({ name: null, key: null, leftId, rightId, typeId: NOTE, dbContent: `Compound body ${i}: junction of ${leftName} and ${rightName}.`, label: `compound ${i}` });
}

// -- dimension 6: 50 read-rule-denied cards -----------------------------------
// Denial semantics (src/card/permissions/read-rules.ts canReadByStoredRule):
// a card with a stored read_rule_id is readable iff that rule id is in the
// viewer's readable set. The rule card below carries no granting references,
// so anonymous's readable set excludes it and all 50 cards deny.
const restrictedRuleId = addCard({ name: "Restricted Access Rule", typeId: NOTE, dbContent: "Rule card with no granting references — anonymous readers are denied." });
for (let i = 1; i <= 50; i += 1) {
  addCard({ name: `Restricted Page ${i}`, typeId: NOTE, readRuleClass: "*self", readRuleId: restrictedRuleId, dbContent: `Restricted body ${i} — anonymous visitors must see the denial span, never this text.` });
}

// -- dimension 7: 100 mod-view cards ------------------------------------------
for (let i = 1; i <= 100; i += 1) {
  addCard({ name: `Mod Probe ${i}`, typeId: NOTE, dbContent: `Mod probe card ${i}. Rendered under the default mod deck on the deployed engine.` });
}

// -- dimension 8: CQL search card over the ordinary set -----------------------
// NOTE the name: a trailing plural ("All Scale Pages") hits the documented
// DeckoName singularization trap (Pages -> page) and the key never matches.
addCard({ name: "All Scale Page Probe", typeId: 2, dbContent: `{\"match\":\"Scale Page\",\"sort\":{\"name\":\"asc\"},\"limit\":50}` });

// -- assemble ------------------------------------------------------------------
mkdirSync(OUT_DIR, { recursive: true });
const out = [
  "-- Cloudflare targeted-test deck (synthetic; data rule absolute).",
  `-- ${cards.length} cards, ${refs.length} references. Generated by tools/cf-scale/targeted-test-deck.mjs`,
  "",
  ...cards.map((c) => `-- ${c.label ?? c.id}\n${c.sql}`),
  "",
  ...refs,
  "",
];
writeFileSync(TARGET, out.join("\n"), "utf8");

const bytes = Buffer.byteLength(out.join("\n"), "utf8");
const summary = {
  cards: cards.length,
  refs: refs.length,
  totalRows: cards.length + refs.length,
  bytes,
  // Repo-relative, not absolute: this manifest is checked in, so an absolute
  // path would bake the generating machine's directory layout into the tree.
  file: "deploy/cf-scale-deck/seed.sql",
};
console.log(JSON.stringify(summary, null, 2));
writeFileSync(join(OUT_DIR, "deck-manifest.json"), JSON.stringify({ ...summary, dimensions: { ordinary: ORDINARY, chainDepth: 32, pointerItems: 500, largeCards: 5, compounds: 50, denied: 50, modProbes: 100 } }, null, 2));
