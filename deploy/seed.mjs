// seed.mjs — generate deploy/seed/seed.sql, the SYNTHETIC demo deck for the
// one-click deploy.
//
// DATA RULE (absolute, from the milestone tracker): no real SourceDeck
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
// name/key and are glued by left_id/right_id). CAUTION (the plural-stem
// trap the render stream documented): DeckoName singularizes trailing-s
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
 *  updater = 1 (Demo Bot), canonical timestamps, no revision/read-rule
 *  state (this demo is read-only; the write path is another stream). */
function cardSql(row) {
  const keyColumn = row.key !== undefined ? row.key : row.name !== undefined ? canonicalKey(row.name) : null;
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
    `  NULL, NULL, NULL, 0, ${q(row.typeId)}, ${q(row.dbContent ?? null)}`,
    `);`,
  ].join("\n");
}

// -- type scaffold -----------------------------------------------------------
// "Search" must exist BY NAME because the render engine dispatches search
// cores by the card's TYPE NAME (src/card/render/render.ts SEARCH_TYPE_NAME).
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
// tests/card/render/oracle-replay.test.ts; `type` resolves through the
// worker's primed name resolver (deploy/worker.ts).
const searchCards = [
  { id: 20, name: "Note Index", typeId: 2, label: "the demo search card (CQL-hittable set of every Note)",
    dbContent: '{"type":"Note","sort":"name"}' },
];

// Guard: the key derivation above is only canonical for names WITHOUT a
// plural stem (DeckoName singularizes trailing-s stems; see the guard
// comment at canonicalKey). Refuse to generate a deck that trips it.
for (const card of [...typeCards, ...contentCards, ...searchCards]) {
  if (card.name !== undefined && /[^s]s$/.test(card.name.toLowerCase())) {
    console.error(`seed: card name "${card.name}" ends in a plural stem — DeckoName would store key "${canonicalKey(card.name).replace(/s$/, "")}"; rename the card or extend the generator's key derivation`);
    process.exit(1);
  }
}

const header = [
  "-- ============================================================================ ",
  "-- seed.sql — GENERATED by deploy/seed.mjs. Do not edit; edit the generator.",
  "--",
  "-- SYNTHETIC demo deck for the decko-ts Cloudflare Workers deploy. Data rule:",
  "-- no real SourceDeck content ever reaches this file or this database.",
  "--",
  "-- Apply AFTER migrations/0001-schema.sql:",
  "--   npx wrangler d1 execute decko-ts-demo-db --remote --file seed/seed.sql",
  "--",
  "-- Contents: 5 type/author scaffold cards, 6 plain Note cards, the depth-4",
  "-- compound chain Demo Guide+Section One+Detail+History (junction rows with",
  "-- NULL name/key columns per the 2020 Lexicon convention), and the 'All",
  "-- Notes' search card whose db_content is a CQL statement.",
  "--",
  "-- Deliberately EMPTY tables (read-only demo; history is write-path, and no",
  "-- demo card carries rules or references bookkeeping): card_acts,",
  "-- card_actions, card_changes, card_references, card_revisions,",
  "-- card_virtuals, delayed_jobs, sessions, schema_migrations,",
  "-- ar_internal_metadata, transform_migrations.",
  "-- ============================================================================",
  "",
].join("\n");

const all = [...typeCards, ...contentCards, ...junctionCards, ...searchCards];
const body = all.map(cardSql).join("\n\n") + "\n";

const sql = header + body;

mkdirSync(dirname(TARGET), { recursive: true });
writeFileSync(TARGET, sql, "utf8");

const bytes = statSync(TARGET).size;
console.log(`seed: wrote ${TARGET} (${bytes} bytes, ${all.length} cards)`);
if (bytes >= 1024 * 1024) {
  console.error("seed: OVER THE 1 MB BUDGET — shrink the demo deck");
  process.exit(1);
}
