// census-set-module-content-overrides-2026-10-03.mjs
//
// Census of how many live cards in the corpus mirror have Ruby card.content
// answered by a set-module code override rather than by the DB row.
//
// The module universe is the derivation output: every card-level `def content` in
// a nonbase set module across card-1.110.0 + the installed card-mod-0.20.0 gems,
// swept with abstract include-chain closure. Dead ends (HamlFile, CodenameList,
// AssetFile-descendant abstracts) have zero concrete includers and are excluded.
//
// Ruby qualification (lib/card/set/pattern/{base,class_methods}.rb): a set
// module applies iff the pattern applies AND every anchor name part carries a
// codename (anchor_codenames breaks to nil otherwise) and the module exists
// (module_list lookup). Right pattern is compound_only (07_right.rb); Type
// applies iff type_id (03_type.rb); Self anchor = the full name (09_self.rb).
//
// Precedence (set_modules = concrete[0..-2].reverse, singleton includes in that
// order, lib/card/set/pattern/all.rb:44-46 + mod/core/set/all/initialize.rb:61-74):
// Self > TypePlusRight > Right > ... > Type. No corpus card matches two
// content-defining modules simultaneously (asserted below), so precedence is
// recorded but not exercised.
//
// Usage: node tools/oracle/census-set-module-content-overrides-2026-10-03.mjs [sqlite-path]
// Zero network; read-only on the mirror.

import Database from "better-sqlite3";

const dbPath =
  process.argv[2] ?? "tmp/raw-ground-truth/bench-corpus-raw.sqlite3";

// Self pattern: anchor = full card name; key = codename chain of ALL parts.
const SELF_MODULE_CHAINS = new Set([
  "now",
  "version",
  "alerts",
  "foot",
  "mod",
  "bootstrap_core",
  "bootstrap_functions",
  "input_type+right+content_options",
]);
// Right pattern: compound_only; anchor codename = right part (tag).
const RIGHT_MODULE_TAGS = new Set([
  "group_remote",
  "when_created",
  "when_last_edited",
  "followers",
]);
// Type pattern: anchor codename = the card's type.
const TYPE_MODULE_CODENAMES = new Set(["bootswatch_skin", "session"]);

const db = new Database(dbPath, { readonly: true });

const cards = db
  .prepare(
    `SELECT c.id, c.name, c.codename, c.type_id, c.content, c.trash,
            c.left_id, c.right_id, c.created_at, c.updated_at
     FROM cards c WHERE c.trash = 0`,
  )
  .all();

// name -> codename over the WHOLE table (matching is by live card's part ids,
// but the codename column lives on the part card rows themselves).
const byId = new Map(cards.map((c) => [c.id, c]));

// The mirror keeps junction name cells NULL by design
// (render-test-storage.ts:200-213); the seeded storage composes junction names
// from left/right ids. Simple names read the name column directly.
const simpleNameById = new Map();
for (const c of cards) {
  if (c.left_id === null && c.right_id === null && c.name) {
    simpleNameById.set(c.id, c.name);
  }
}
function composedName(card, seen = new Set()) {
  if (card.left_id === null || card.right_id === null) {
    return card.name ?? simpleNameById.get(card.id) ?? null;
  }
  if (seen.has(card.id)) return null;
  seen.add(card.id);
  const l = byId.get(card.left_id);
  const r = byId.get(card.right_id);
  if (!l || !r) return null;
  const ln = composedName(l, seen);
  const rn = composedName(r, new Set(seen));
  return ln && rn ? `${ln}+${rn}` : null;
}

// Part codenames resolve through the right-spine: for "A+B+C" the spine is
// card -> right=C, left -> right=B, left -> A. Each part IS a card row whose
// codename column is authoritative (Ruby anchor_codenames reads part cardnames).
function spinePartIds(card) {
  const parts = [];
  let cur = card;
  const guard = new Set();
  while (cur.left_id !== null && cur.right_id !== null) {
    if (guard.has(cur.id)) return null;
    guard.add(cur.id);
    parts.unshift(cur.right_id);
    cur = byId.get(cur.left_id);
    if (!cur) return null;
  }
  if (guard.has(cur.id)) return null;
  parts.unshift(cur.id);
  return parts;
}

const hits = [];
const multiMatch = [];
for (const card of cards) {
  const partIds = spinePartIds(card);
  const partCodenames = (partIds ?? []).map((id) => byId.get(id)?.codename ?? null);
  const matches = [];

  // Self pattern: applies always; module exists iff every part has a codename
  // and the codename chain is one of the module files.
  if (partIds && partCodenames.every((c) => c !== null)) {
    const chain = partCodenames.join("+");
    if (SELF_MODULE_CHAINS.has(chain)) {
      matches.push({ setModule: `Self::${chain}`, kind: "self" });
    }
  }
  // Right pattern: compound only; anchor = tag part codename.
  if (partIds && partIds.length > 1) {
    const tagCode = partCodenames[partCodenames.length - 1];
    if (tagCode && RIGHT_MODULE_TAGS.has(tagCode)) {
      matches.push({ setModule: `Right::${tagCode}`, kind: "right" });
    }
  }
  // Type pattern: applies iff type_id present; anchor = type codename.
  const typeCode = card.type_id ? byId.get(card.type_id)?.codename ?? null : null;
  if (typeCode && TYPE_MODULE_CODENAMES.has(typeCode)) {
    matches.push({ setModule: `Type::${typeCode}`, kind: "type" });
  }

  if (matches.length === 1) {
    hits.push({ card, ...matches[0] });
  } else if (matches.length > 1) {
    multiMatch.push({ card, matches });
  }
}

const byModule = new Map();
for (const h of hits) {
  const list = byModule.get(h.setModule) ?? [];
  list.push(h.card);
  byModule.set(h.setModule, list);
}

console.log(`mirror: ${dbPath}`);
console.log(`live cards: ${cards.length}`);
console.log(`override-hit live cards: ${hits.length}`);
console.log(`multi-match cards (precedence needed): ${multiMatch.length}`);
for (const m of multiMatch) {
  console.log(
    `  id=${m.card.id} name=${JSON.stringify(m.card.name)} matches=${m.matches.map((x) => x.setModule).join(" & ")}`,
  );
}
let total = 0;
for (const [mod, list] of [...byModule.entries()].sort()) {
  total += list.length;
  console.log(`\n== ${mod} — ${list.length} card(s)`);
  for (const c of list.slice(0, 20)) {
    const bytes = Buffer.byteLength(c.content ?? "", "utf8");
    console.log(
      `  id=${c.id} name=${JSON.stringify(c.name)} codename=${c.codename ?? "null"} ` +
        `contentBytes=${bytes} content=${JSON.stringify((c.content ?? "").slice(0, 80))}`,
    );
  }
  if (list.length > 20) console.log(`  ... +${list.length - 20} more`);
}
console.log(`\nTOTAL override-hit live cards: ${total}`);
