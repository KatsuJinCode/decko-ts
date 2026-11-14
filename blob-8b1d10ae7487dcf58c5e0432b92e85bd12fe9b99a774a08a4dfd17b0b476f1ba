// generate-facts-from-corpus.mjs -- corpus facts for the rule/preference?
// truth-table oracle.
//
// WHAT THIS IS: the read-only corpus half of the static-ruby oracle that pins
// WHAT Ruby's `rule?` predicate (prototype/lib/card/rule/all.rb:33-54) admits
// for two families:
//
//   OVER-ADMITTED family: the `mod: <x>+*style` / `mod: <x>+*script` rule
//   rows. An engine isRuleCard reading "right is Setting AND left resolves"
//   admits these rows; Ruby refuses them (standard_rule? false: the left
//   `mod: <x>` is Mod-cardtype-typed, not Set; preference? false: only 2
//   parts). These are the rows the engine's widened predicate must NOT
//   admit.
//
//   LEGITIMATELY-ADMITTED family: the guard rule rows listed in GUARD_NAMES
//   below (`*all+*all+*follow` and the follow preferences whose preferer arm
//   is User-typed). Ruby admits all of them (preference? holds: trunk
//   Set-typed; preferer codename "all" / User-typed).
//
// For every target rule row it resolves, via the corpus left_id/right_id
// walk (junction rows store NULL name), the EXACT name parts the Ruby
// predicate fetches:
//
//   name.right            -> parts[last]          (fetch_type_id)
//   name.left             -> parts[0..-2].join    (fetch_type_id)
//   name[0..-3]           -> parts[0..-3].join    (fetch_type_id, parts>2)
//   self[-2]              -> parts[-2]            (type_id + codename)
//
// and emits one JSON facts document { "<name>": { id, typeId, codename } }
// covering every fetched name. The Ruby oracle consumes it; the predicate
// BEHAVIOR is the gem's own verbatim lines, the card FACTS are the corpus's.
//
// USAGE (from the worktree root):
//   node tools/oracle/rule-preference-truth-table/generate-facts-from-corpus.mjs \
//     [--db PATH_TO_CORPUS_DB] \
//     [--out tools/oracle/rule-preference-truth-table/corpus-facts.json]
// READ-ONLY on the DB. Aborts non-zero if any target or fetched part is
// absent -- a silent partial fact table would under-determine the oracle.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

const DB = path.resolve(argValue("--db", path.join(REPO, "tmp", "raw-ground-truth", "bench-corpus-raw.sqlite3")));
const OUT = path.resolve(argValue("--out", path.join(HERE, "corpus-facts.json")));

/** The over-admitted rule-row names: the `mod: <x>+*style` /
 *  `mod: <x>+*script` rows Ruby refuses (see the header). */
const OVER_ADMITTED_NAMES = [
  "mod: account+*style",
  "mod: api key+*style",
  "mod: bar and box+*style",
  "mod: bootstrap+*style",
  "mod: carrierwave+*style",
  "mod: comment+*style",
  "mod: edit+*style",
  "mod: follow+*style",
  "mod: format+*style",
  "mod: help+*style",
  "mod: history+*style",
  "mod: layout+*style",
  "mod: list+*style",
  "mod: permissions+*style",
  "mod: rules+*style",
  "mod: search+*style",
  "mod: style+*style",
  "mod: tinymce editor+*style",
  "mod: account+*script",
  "mod: ace editor+*script",
  "mod: bar and box+*script",
  "mod: bootstrap+*script",
  "mod: carrierwave+*script",
  "mod: edit+*script",
  "mod: follow+*script",
  "mod: format+*script",
  "mod: layout+*script",
  "mod: list+*script",
  "mod: recaptcha+*script",
  "mod: rules+*script",
  "mod: search+*script",
  "mod: shades+*script",
  "mod: tabs+*script",
  "mod: tinymce editor+*script",
];

/** The legitimately-admitted guard rule rows: follow preferences Ruby
 *  admits (trunk Set-typed; preferer codename "all" or User-typed). */
const GUARD_NAMES = [
  "*all+*all+*follow",
  "Don't Wait For The Study+*self+Riley Ellery+*follow",
  "Make Contact+*self+Riley Ellery+*follow",
];

function partsOf(name) {
  return name.split("+");
}

const db = new DatabaseSync(DB, { readOnly: true });

// Full row scan + junction name resolution (junction rows store NULL name).
const rows = db
  .prepare("SELECT id, name, key, codename, left_id, right_id, type_id, trash FROM cards")
  .all();
const byId = new Map(rows.map((r) => [r.id, r]));
const nameOf = new Map();
function resolveName(id, seen = new Set()) {
  if (nameOf.has(id)) return nameOf.get(id);
  if (seen.has(id)) return null;
  seen.add(id);
  const c = byId.get(id);
  if (!c) return null;
  let n = c.name;
  if ((!n || n === "") && c.left_id && c.right_id) {
    const l = resolveName(c.left_id, seen);
    const r = resolveName(c.right_id, seen);
    n = l && r ? `${l}+${r}` : null;
  }
  nameOf.set(id, n);
  return n;
}
for (const id of byId.keys()) resolveName(id);

// case-insensitive name -> row (first non-trashed wins).
const byName = new Map();
for (const [id, n] of nameOf) {
  if (!n) continue;
  const row = byId.get(id);
  if (row.trash) continue;
  const k = n.toLowerCase();
  if (!byName.has(k)) byName.set(k, row);
}

const facts = {};
const families = {};
const missing = [];

function factFor(name, via) {
  const row = byName.get(name.toLowerCase());
  if (row === undefined) {
    missing.push(`${name} (needed by ${via})`);
    return undefined;
  }
  const entry = { id: row.id, typeId: row.type_id, codename: row.codename ?? null };
  const k = name; // facts keyed by the EXACT fetched spelling
  if (facts[k] === undefined) facts[k] = entry;
  return entry;
}

for (const [familyKey, names] of [
  ["overAdmitted", OVER_ADMITTED_NAMES],
  ["guards", GUARD_NAMES],
]) {
  families[familyKey] = [];
  for (const name of names) {
    const parts = partsOf(name);
    const fetchedNames = {
      right: parts[parts.length - 1],
      left: parts.slice(0, -1).join("+"),
      trunk: parts.length > 2 ? parts.slice(0, -2).join("+") : null,
      preferer: parts.length > 2 ? parts[parts.length - 2] : null,
    };
    const resolved = {
      row: factFor(name, familyKey),
      right: factFor(fetchedNames.right, name),
      left: factFor(fetchedNames.left, name),
      trunk: fetchedNames.trunk !== null ? factFor(fetchedNames.trunk, name) : null,
      preferer: fetchedNames.preferer !== null ? factFor(fetchedNames.preferer, name) : null,
    };
    families[familyKey].push({ name, parts, fetchedNames, resolved });
  }
}

if (missing.length > 0) {
  console.error(`FACTS-ERROR: ${missing.length} corpus lookup(s) absent:`);
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(2);
}

const doc = {
  what: "corpus card facts (id/typeId/codename) for rule-preference-truth-table-oracle.rb",
  sourceDb: path.relative(REPO, DB),
  generatedBy: "tools/oracle/rule-preference-truth-table/generate-facts-from-corpus.mjs",
  fetchedNamesNote:
    "keys are the EXACT name spellings Ruby's predicate fetches (name.right, name.left, name[0..-3], self[-2]); the Ruby oracle stubs Card.fetch_type_id / Card#[] over this table",
  // The predicate's three type constants are corpus cards (all.rb compares
  // fetch_type_id against SettingID/SetID, valid_preferer? against UserID) --
  // read from the corpus codename cards, never hardcoded.
  typeConstantIds: Object.fromEntries(
    db
      .prepare("SELECT codename, id FROM cards WHERE codename IN ('set','setting','user') AND trash = 0")
      .all()
      .map((r) => [r.codename, r.id]),
  ),
  families: families,
  facts: facts,
};

writeFileSync(OUT, JSON.stringify(doc, null, 1) + "\n");
console.log(
  `facts: ${Object.keys(facts).length} names -> ${OUT}; over-admitted ${families.overAdmitted.length}, guards ${families.guards.length}`,
);
