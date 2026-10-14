// seed.mjs — generate deploy/seed/seed.sql, the SYNTHETIC demo deck for the
// one-click deploy.
//
// DATA RULE (absolute): no real production-deck content
// content anywhere in the deploy path. Every string below is invented for
// this demo; the file is checked to stay under 1 MB (D1 free tier is 5 GB
// total; this seed is a rounding error).
//
// The deck exercises the three things the Worker demo needs:
//   1. a half-dozen plain content cards (render + .json routes),
//   2. ONE compound nesting chain of depth 4
//        Demo Guide + Section One + Detail + History
//      (junction rows with NULL name/key columns and left_id/right_id —
//      the 2020 Lexicon convention db/schema.sqlite.sql records),
//   3. one CQL-hittable set: the "All Notes" search card (type Search,
//      db_content is a CQL statement) that the card_list view and
//      POST /api/query execute.
//
// Output: plain SQL statements for `wrangler d1 execute --file seed/seed.sql`
// (and for the miniflare proof, which applies the same file through the D1
// binding). Apply AFTER migrations/0001-schema.sql.
//
// Run: node deploy/seed.mjs   (paths resolve relative to this file).

import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = join(HERE, "seed", "seed.sql");

const STAMP = "2026-09-20 00:00:00.000";

// Canonical key derivation for SIMPLE cards (junction rows store NULL
// name/key and are glued by left_id/right_id). CAUTION — the plural-stem
// trap: DeckoName singularizes trailing-s
// stems, so the canonical key of "Details" would be "detail" — the
// GUARD below refuses such names outright instead of reimplementing the
// inflection here. Every name in this deck is chosen to end in a
// non-plural stem so key === lowercase-underscored name.
function canonicalKey(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function q(value) {
  return typeof value === "string" ? `'${value.replace(/'/g, "''")}'` : value === null ? "NULL" : String(value);
}

/** One INSERT INTO cards with the demo conventions: trash 0, creator and
 *  updater = 1 (Demo Bot), canonical timestamps, no revision state — this
 *  demo deck is read-only and the write path is out of its scope. Every row
 *  carries the catch-all read rule (read_rule_class / read_rule_id), which is
 *  what Ruby's set_read_rule store event stamps on each saved row
 *  (card-mod-permissions set/all/permissions.rb:1-5) and what both the HTML
 *  permission check and the CQL read filter read.
 *
 *  The only rule a row here may carry is the catch-all (30), which grants
 *  Anyone: a card stamped with a rule no card_references row grants would be
 *  unreadable to every actor, and cardSql refuses to generate one. */
function cardSql(row) {
  const keyColumn = row.key !== undefined ? row.key : row.name !== undefined ? canonicalKey(row.name) : null;
  const readRuleClass = row.readRuleClass ?? "*all";
  const readRuleId = row.readRuleId ?? CATCH_ALL_RULE_ID;
  // The seed's ONLY rule card is the catch-all (30), which grants Anyone, so
  // any other rule id here is one this file does not create — a card stamped
  // with it would be unreadable to every actor. Refuse rather than generate it.
  if (readRuleId !== CATCH_ALL_RULE_ID) {
    console.error(`seed: card ${row.id} would be stamped with the raw rule ${readRuleId}, which grants nobody; stamp it with the catch-all or leave it NULL`);
    process.exit(1);
  }
  return [
    `-- id ${row.id}: ${row.label}`,
    `INSERT INTO cards (`,
    `  id, name, key, codename, left_id, right_id, current_revision_id,`,
    `  created_at, updated_at, creator_id, updater_id,`,
    `  read_rule_class, read_rule_id, references_expired, trash, type_id, db_content`,
    `) VALUES (`,
    `  ${q(row.id)}, ${q(row.name ?? null)}, ${q(keyColumn)}, ${q(row.codename ?? null)},`,
    `  ${q(row.leftId ?? null)}, ${q(row.rightId ?? null)}, NULL,`,
    `  '${STAMP}', '${STAMP}', 1, 1,`,
    `  ${q(readRuleClass)}, ${q(readRuleId)}, NULL, 0, ${q(row.typeId)}, ${q(row.dbContent ?? null)}`,
    `);`,
  ].join("\n");
}

// -- the stock read substrate (`*all+*read` -> [[Anyone]]) ---------------------
// EVERY real Ruby deck bootstraps this rule (card/auth/setup.rb:44;
// mod/core data/fixtures/real/cards.yml cards_010), and Ruby's ok_to_read?
// (card-mod-permissions set/all/permissions.rb:139-146) denies a deck that
// does not carry it: permission_rule_id :read resolves to nil and
// Auth.as_card.read_rules_hash[nil] is nil. Without these rows the dev deck
// this file produces renders every card as "Sorry, you don't have permission
// (read)" — correct Ruby behaviour on a deck shape Ruby never has, and a
// useless demo. The rows below are Ruby's shape, transcribed from
// migrations/0004 (types and codenames), 0006 (the roles) and 0009 (the
// rules); the dev chain cannot apply those files because their keys overlap
// this deck's (Cardtype id 3, User id 4, *all), so the same cards are
// generated here at ids above the deck's own range.
const CATCH_ALL_RULE_ID = 30;
// Ids below 30 are the seed's own (type scaffold 1-5, content and junctions
// 10-18, the search 20); the read substrate takes 6, 7, 8, 25-28 and 30,
// above them and out of the deck's way.
const substrateCards = [
  { id: 6, name: "Role", codename: "role", typeId: 3, label: "the Role cardtype (cards_020), the type of the two party cards below" },
  // Set carries the 'set' codename (Ruby: card-mod-core's Set type card is the
// deck's SetID, generated from the codename registry at boot). The
// permission statements join rule rows' left cards on that codename's id
// (read-rules.ts readPermissionStatements, statement 2), so without it the
// catch-all is not in read_rules_hash and the deck denies every card.
  { id: 7, name: "Set", codename: "set", typeId: 3, label: "the Set TYPE card (codename 'set' = the deck's SetID); the read-rule cache join filters rule rows' left cards on sets.type_id = SetID (read-rules.ts)" },
  { id: 8, name: "Setting", codename: "setting", typeId: 3, label: "the Setting TYPE card (cards_009)" },
  // The keys of *all and *read are given explicitly as '*all' / '*read' (as
  // migrations/0004:124 and 0009:86 store them): the generator's canonical
  // derivation turns a leading * into an underscore, and a set/setting card
  // carries its own name as the key.
  { id: 25, name: "*all", key: "*all", codename: "all", typeId: 7, label: "the *all set card (the catch-all's left side), typed Set (type 7) as a set card is — the read-rule join's sets.type_id = SetID filter needs it" },
  { id: 26, name: "*read", key: "*read", codename: "read", typeId: 8, label: "the *read setting card (the catch-all's right side), typed Setting (type 8) as a setting card is" },
  { id: 27, name: "Anyone", codename: "anyone", typeId: 6, label: "the party the catch-all grants (real.yml:20-26), typed Role; the reference below is what puts the rule in read_rules_hash" },
  { id: 28, name: "Anonymous", key: "anonymou", codename: "anonymous", typeId: 3, label: "the anonymous viewer's own card; key given explicitly because DeckoName singularizes the name to 'anonymou'. Typed Cardtype, as Ruby's setup seed types it (mod/core data/fixtures/real/cards.yml cards_016) — the actor card is not content, so it does not join a `type: \"Note\"` search" },
  // The catch-all itself: a Set card (typed Set as a set card is), so it does
  // not answer a `type: "Note"` search — a rule card is not content.
  { id: CATCH_ALL_RULE_ID, leftId: 25, rightId: 26, typeId: 7, label: "*all+*read, the catch-all read rule (a junction: NULL name/key, sides only, per the 2020 Lexicon migration), typed Set as the set card it is",
    dbContent: "[[Anyone]]" },
];

// -- type scaffold -----------------------------------------------------------
// "Search" must exist BY NAME because the render engine dispatches search
// cores by the card's TYPE NAME.
// "Note" must exist because CQL `type: "Note"` resolves through it, and the
// demo content cards carry type_id of the Note card. Cardtype is the type of
// the type cards (Cardtype's type is itself, as in every real deck).
const typeCards = [
  { id: 1, name: "Demo Bot", typeId: 4, label: "the demo author card (creator_id/updater_id everywhere)",
    dbContent: "Synthetic author identity used as creator and updater on every card in this demo deck." },
  { id: 2, name: "Search", codename: "search_type", typeId: 3, label: "the Search cardtype (codename matches the oracle fixtures)" },
  { id: 3, name: "Cardtype", typeId: 3, label: "the Cardtype cardtype (self-typed)" },
  { id: 4, name: "User", typeId: 3, label: "the User cardtype" },
  { id: 5, name: "Note", typeId: 3, label: "the demo content cardtype; CQL type:'Note' resolves here" },
];

// -- plain content cards (typeId 5 = Note) -----------------------------------
// Inclusion chain (ALL PROVEN shapes): Home -> {{Demo Guide}} ->
// {{Demo Guide+Section One}} (a depth-2 junction nest, the oracle-replay
// shape) -> {{Detail}} -> {{History}}. Four inclusion levels deep. Junction
// references deeper than two parts are NOT used here — the render
// prefetcher cannot resolve them yet (engine gap, reported in
// docs/deploy-cloudflare.md).
const contentCards = [
  { id: 10, name: "Home", typeId: 5, label: "the card GET / renders",
    dbContent: "<p>Welcome to the decko-ts synthetic demo deck on Cloudflare Workers.</p><p>{{Demo Guide}}</p>" },
  { id: 11, name: "About", typeId: 5, label: "second plain card",
    dbContent: "<p>This deck contains only synthetic demo content. No real member data is ever deployed here.</p>" },
  { id: 12, name: "Demo Guide", typeId: 5, label: "root of the depth-4 compound chain",
    dbContent: "<p>Guide intro. The sections below are compound cards:</p>{{Demo Guide+Section One}}" },
  { id: 13, name: "Section One", typeId: 5, label: "right part of junction id 16",
    dbContent: "<p>Section One body text (a simple Note card).</p>" },
  { id: 14, name: "Detail", typeId: 5, label: "third inclusion level; right part of junction id 17 (named without a trailing s: the canonical key stems plurals)",
    dbContent: "<p>Detail body text.</p>{{History}}" },
  { id: 15, name: "History", typeId: 5, label: "fourth inclusion level; right part of junction id 18",
    dbContent: "<p>History body text — the fourth inclusion level of the demo chain.</p>" },
];

// -- the depth-4 compound chain (junction rows: NULL name/key + side ids) ----
// Each level is fetchable and renderable by its compound name through the
// Lexicon (left-associative: level N's left side is level N-1). Content
// inclusions stop at the PROVEN depth-2 junction shape above; levels 3-4
// render by name (GET /Demo%20Guide+Section%20One+Detail+History).
const junctionCards = [
  { id: 16, leftId: 12, rightId: 13, typeId: 5, label: "'Demo Guide+Section One' (compound depth 2)",
    dbContent: "<p>Section One rendered as a compound card.</p>{{Detail}}" },
  { id: 17, leftId: 16, rightId: 14, typeId: 5, label: "'Demo Guide+Section One+Detail' (compound depth 3)",
    dbContent: "<p>Detail rendered at compound depth 3 of the demo chain.</p>" },
  { id: 18, leftId: 17, rightId: 15, typeId: 5, label: "'Demo Guide+Section One+Detail+History' (compound depth 4 — deepest)",
    dbContent: "<p>History body at compound depth 4 — the deepest node of the demo chain.</p>" },
];

// -- the CQL-hittable set -----------------------------------------------------
// type_id 2 = the Search cardtype, so the render engine executes the CQL in
// db_content when this card's card_list view renders. The statement shape
// ({"type": ..., "sort": "name"}) is the ORACLE-PROVEN shape from
// the render oracle replay suite (not in the public package); `type` resolves through the
// worker's primed name resolver (deploy/worker.ts).
const searchCards = [
  { id: 20, name: "Note Index", typeId: 2, label: "the demo search card (CQL-hittable set of every Note)",
    dbContent: '{"type":"Note","sort":"name"}' },
];

// Guard: the key derivation above is only canonical for names WITHOUT a
// plural stem (DeckoName singularizes trailing-s stems; see the guard
// comment at canonicalKey). Refuse to generate a deck that trips it.
for (const card of [...typeCards, ...contentCards, ...searchCards, ...substrateCards]) {
  if (card.name !== undefined && card.key === undefined && /[^s]s$/.test(card.name.toLowerCase())) {
    console.error(`seed: card name "${card.name}" ends in a plural stem — DeckoName would store key "${canonicalKey(card.name).replace(/s$/, "")}"; rename the card or extend the generator's key derivation`);
    process.exit(1);
  }
}

const header = [
  "-- ============================================================================ ",
  "-- seed.sql — GENERATED by deploy/seed.mjs. Do not edit; edit the generator.",
  "--",
  "-- SYNTHETIC demo deck for the decko-ts Cloudflare Workers deploy. Data rule:",
  "-- no real reference-deck content ever reaches this file or this database.",
  "--",
  "-- Apply AFTER migrations/0001-schema.sql:",
  "--   npx wrangler d1 execute decko-ts-demo-db --remote --file seed/seed.sql",
  "--",
  "-- Contents: 5 type/author scaffold cards, 6 plain Note cards, the depth-4",
  "-- compound chain Demo Guide+Section One+Detail+History (junction rows with",
  "-- NULL name/key columns per the 2020 Lexicon convention), the 'Note Index'",
  "-- search card whose db_content is a CQL statement, and the stock read",
  "-- substrate every Ruby deck carries (cards_010): *all+*read -> [[Anyone]],",
  "-- with Set/Setting/Role typed so the read-rule cache join admits it, every",
  "-- row stamped with the rule (set_read_rule, permissions.rb:1-5), and one",
  "-- card_references row naming Anyone (the rule's party).",
  "--",
  "-- Deliberately EMPTY tables (read-only demo; history is write-path; the one",
  "-- card_references row below is the catch-all's party, the only reference a",
  "-- read-only deck needs): card_acts, card_actions, card_changes,",
  "-- card_revisions, card_virtuals, delayed_jobs, sessions, schema_migrations,",
  "-- ar_internal_metadata, transform_migrations.",
  "-- ============================================================================",
  "",
].join("\n");

const all = [...typeCards, ...contentCards, ...junctionCards, ...searchCards, ...substrateCards];
const body = all.map(cardSql).join("\n\n") + "\n";

// The rule's party. read_rule_cache.rb (card-1.110.0) builds
// read_rules_hash from the reference graph, not the rule text: one row
// naming the Anyone card (27) as the rule card's (30) referee is what puts
// the catch-all in the anonymous viewer's readable rules (account_holder.rb:
// #parties = [AnyoneID, AnonymousID] for the signed-out actor).
const referenceSql = [
  "-- *all+*read grants Anyone: the reference that makes the catch-all readable",
  "INSERT INTO card_references (referer_id, referee_key, referee_id, ref_type, is_present)",
  `VALUES (${CATCH_ALL_RULE_ID}, '', 27, 'L', 1);`,
].join("\n");

const sql = header + body + "\n" + referenceSql + "\n";

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, sql, "utf8");

const bytes = statSync(TARGET).size;
console.log(`seed: wrote ${TARGET} (${bytes} bytes, ${all.length} cards)`);
if (bytes >= 1024 * 1024) {
  console.error("seed: OVER THE 1 MB BUDGET — shrink the demo deck");
  process.exit(1);
}
