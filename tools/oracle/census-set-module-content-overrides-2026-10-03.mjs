// census-set-module-content-overrides-2026-10-03.mjs
//
// Census leg of the set-override-fidelity lane. Counts every live card in the
// corpus mirror whose card.content would be answered by a set-module code
// override in Ruby (card-1.110.0 + mods 0.20.0, the capture deck's installed
// gems) rather than by the row.
//
// The module universe is CLOSED and comes from the gem census (see
// brandonDojoTech/tmp/wrong-goal-hunt/set-override-fidelity-lane.md): the only
// set modules in the installed gems defining a plain instance-level
// `def content` are
//   Self:  now, version, alerts, foot, mod, bootstrap_core, bootstrap_functions,
//          input_type+right+content_options
//   Right: group_remote, when_created, when_last_edited
//   Type:  bootswatch_skin, session
//   (abstracts haml_file / codename_list have zero includers; the All-pattern
//   module All::History::Selected is a super-passing wrapper with no answer
//   change when no action is selected, which is the corpus case.)
//
// Ruby qualification (lib/card/set/pattern/{base,class_methods}.rb): a set
// module applies to a card iff the pattern applies AND EVERY anchor name part
// carries a codename (anchor_codenames breaks to nil otherwise), and the
// module exists (module_list lookup).
//
// Usage: node tools/oracle/census-set-module-content-overrides-2026-10-03.mjs [sqlite-path]
// Zero network; read-only on the mirror.

import Database from "better-sqlite3";

const dbPath =
  process.argv[2] ?? "tmp/raw-ground-truth/bench-corpus-raw.sqlite3";

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
const RIGHT_MODULE_TAGS = new Set(["group_remote", "when_created", "when_last_edited"]);
const TYPE_MODULE_CODENAMES = new Set(["bootswatch_skin", "session"]);

const db = new Database(dbPath, { readonly: true });

const cards = db
  .prepare(
    `SELECT c.id, c.name, c.codename, c.type_id, c.content, c.trash,
            c.left_id, c.right_id
     FROM cards c WHERE c.trash = 0`,
  )
  .all();

// name -> codename over the WHOLE table (codenames can live on trashed rows'
// names too in theory; matching is by live card's part names)
const codenameByName = new Map();
for (const row of db
  .prepare(`SELECT name, codename FROM cards WHERE codename IS NOT NULL`)
  .all()) {
  if (!codenameByName.has(row.name)) codenameByName.set(row.name, row.codename);
}

const typeCodenameById = new Map();
const byId = new Map(cards.map((c) => [c.id, c]));
{
  for (const c of cards) {
    const t = byId.get(c.type_id);
    typeCodenameById.set(c.id, t ? (t.codename ?? null) : null);
  }
}

// Name resolution mirrors the port's junction composition: the mirror keeps
// junction name cells NULL (lead option (b), render-test-storage.ts:200-213)
// and the seeded storage composes junction names from left/right ids. Simple
// names read the name column directly.
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

// Part codenames resolve through the right-spine (each name part IS a card
// row; the mirror preserves the codename column), so no name-string matching
// is needed: for "A+B+C" the spine is card -> right=C, left -> right=B,
// left -> A.
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
for (const card of cards) {
  const name = composedName(card) ?? card.name ?? "";
  const partIds = spinePartIds(card);
  const partCodenames = (partIds ?? []).map((id) => byId.get(id)?.codename ?? null);

  // Self pattern: applies always; module exists iff every part has a codename
  // and the chain is one of the module files.
  if (partCodenames.every((c) => c !== null)) {
    const chain = partCodenames.join("+");
    if (SELF_MODULE_CHAINS.has(chain)) {
      hits.push({ card, setModule: `Self::${chain}`, kind: "self" });
      continue;
    }
  }
  // Right pattern: compound only; anchor = tag part codename.
  if (partIds && partIds.length > 1) {
    const tagCode = partCodenames[partCodenames.length - 1];
    if (tagCode && RIGHT_MODULE_TAGS.has(tagCode)) {
      hits.push({ card, setModule: `Right::${tagCode}`, kind: "right" });
      continue;
    }
  }
  // Type pattern: applies iff type_id present; anchor = type codename.
  const typeCode = typeCodenameById.get(card.id);
  if (typeCode && TYPE_MODULE_CODENAMES.has(typeCode)) {
    hits.push({ card, setModule: `Type::${typeCode}`, kind: "type" });
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
console.log(`override-hit cards: ${hits.length}`);
let total = 0;
for (const [mod, list] of [...byModule.entries()].sort()) {
  total += list.length;
  console.log(`\n== ${mod} — ${list.length} card(s)`);
  for (const c of list.slice(0, 12)) {
    const bytes = Buffer.byteLength(c.content ?? "", "utf8");
    console.log(
      `  id=${c.id} name=${JSON.stringify(c.name)} codename=${c.codename ?? "null"} ` +
        `contentBytes=${bytes} content=${JSON.stringify((c.content ?? "").slice(0, 90))}`,
    );
  }
  if (list.length > 12) console.log(`  ... +${list.length - 12} more`);
}
console.log(`\nTOTAL override-hit live cards: ${total}`);
