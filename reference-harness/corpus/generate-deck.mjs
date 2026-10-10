#!/usr/bin/env node
// Generates the synthetic reference deck: a plain-data description of the
// cards a reference deck adds on top of a stock Decko seed. Deterministic:
// the same generator version always writes the same bytes, so the deck is a
// reproducible public corpus with no real-site content.
//
//   node reference-harness/corpus/generate-deck.mjs <fixtureDir>
//
// Writes <fixtureDir>/deck.json and the uploaded files under <fixtureDir>/files/.
// The deck exercises nesting (including a chain deeper than Decko's nest limit),
// type and right rules, structures and defaults, searches, pointers, links to
// missing cards, file uploads, and read/create/update rules that separate three
// actors: anonymous, a member, and an administrator.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const GENERATOR_VERSION = 2;
const out = process.argv[2];
if (!out) {
  console.error("usage: generate-deck.mjs <fixtureDir>");
  process.exit(2);
}

// mulberry32: a tiny seeded PRNG, so content varies without randomness.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = prng(1282);
const pick = (list) => list[Math.floor(rand() * list.length)];
const pad = (n, w = 3) => String(n).padStart(w, "0");

const WORDS = [
  "river", "lantern", "orchard", "granite", "harbor", "meadow", "copper", "willow",
  "signal", "atlas", "ember", "quarry", "summit", "canyon", "tundra", "beacon",
  "cobalt", "delta", "falcon", "garnet", "hollow", "island", "juniper", "kestrel",
];
const sentence = (n) => {
  const words = Array.from({ length: n }, () => pick(WORDS));
  words[0] = words[0][0].toUpperCase() + words[0].slice(1);
  return words.join(" ") + ".";
};

const cards = [];
const add = (card) => cards.push(card);

// ---- actors -----------------------------------------------------------------
// Passwords are fixture values for a throwaway deck, not secrets.
const ACTORS = {
  anonymous: { card: "Anonymous" },
  member: { card: "Mira Member", email: "mira.member@example.test", password: "Fixture member pass 1#" },
  // v2: a second custom role, so the read lattice carries two distinct
  // non-admin roles (a card Member may read that Contractor may not, and
  // the reverse).
  contractor: { card: "Quinn Contractor", email: "quinn.contractor@example.test", password: "Fixture contractor pass 3#" },
  admin: { card: "Ada Admin", email: "ada.admin@example.test", password: "Fixture admin pass 2#" },
};

// ---- types, roles, accounts ---------------------------------------------------
for (const t of ["Topic", "Note", "Memo", "Brief", "Tag"]) add({ name: t, type: "Cardtype" });
add({ name: "Member", type: "Role" });
add({
  name: "Ada Admin",
  type: "User",
  fields: {
    "+*account": { fields: { "+*email": ACTORS.admin.email, "+*password": ACTORS.admin.password, "+*status": "active" } },
  },
});
add({
  name: "Mira Member",
  type: "User",
  fields: {
    "+*account": { fields: { "+*email": ACTORS.member.email, "+*password": ACTORS.member.password, "+*status": "active" } },
  },
});

// Role membership lives on the role's +*members list (an existing card for
// Administrator, so this entry updates it).
add({ name: "Administrator+*members", content: "[[Ada Admin]]" });
add({ name: "Member+*members", content: "[[Mira Member]]" });

// ---- rules ------------------------------------------------------------------------
add({ name: "Topic+*type+*structure", type: "RichText", content: "{{+summary}}\n{{+tags|link}}\n{{+related|closed}}" });
add({ name: "Note+*type+*default", type: "RichText", content: "<p>Write a note here.</p>" });
add({ name: "summary+*right+*default", type: "RichText", content: "<p>No summary yet.</p>" });
add({ name: "tags+*right+*default", type: "Pointer", content: "" });
add({ name: "related+*right+*default", type: "Pointer", content: "" });
add({ name: "Memo+*type+*read", type: "Pointer", content: "[[Member]]" });
add({ name: "Brief+*type+*read", type: "Pointer", content: "[[Administrator]]" });
add({ name: "Topic+*type+*update", type: "Pointer", content: "[[Member]]" });
add({ name: "Note+*type+*create", type: "Pointer", content: "[[Anyone Signed In]]" });
add({ name: "Tag+*type+*create", type: "Pointer", content: "[[Member]]" });
add({ name: "Memo+*type+*create", type: "Pointer", content: "[[Member]]" });

// ---- tags -------------------------------------------------------------------------
const TAGS = Array.from({ length: 10 }, (_, i) => `Tag ${pad(i + 1, 2)}`);
for (const t of TAGS) add({ name: t, type: "Tag", content: `<p>${sentence(5)}</p>` });

// ---- topics with structured fields ---------------------------------------------------
const TOPICS = Array.from({ length: 30 }, (_, i) => `Topic ${pad(i + 1)}`);
for (const [i, t] of TOPICS.entries()) {
  add({ name: t, type: "Topic", content: "" });
  const other = TOPICS[(i + 7) % TOPICS.length];
  add({
    name: `${t}+summary`,
    type: "RichText",
    content: `<p>${sentence(8)} See [[${other}]].</p>` + (i % 5 === 0 ? `<p>Missing: [[Unwritten ${pad(i + 1)}]].</p>` : ""),
  });
  add({ name: `${t}+tags`, type: "Pointer", content: [TAGS[i % 10], TAGS[(i * 3 + 1) % 10]].map((x) => `[[${x}]]`).join("\n") });
  if (i % 3 !== 2) {
    add({ name: `${t}+related`, type: "Pointer", content: [TOPICS[(i + 1) % 30], TOPICS[(i + 11) % 30]].map((x) => `[[${x}]]`).join("\n") });
  }
}
// One topic only administrators can read.
add({ name: "Topic 003+*self+*read", type: "Pointer", content: "[[Administrator]]" });

// ---- memos (members) and briefs (administrators) ---------------------------------------
const MEMOS = Array.from({ length: 15 }, (_, i) => `Memo ${pad(i + 1, 2)}`);
for (const m of MEMOS) add({ name: m, type: "Memo", content: `<p>${sentence(7)}</p>` });
const BRIEFS = Array.from({ length: 10 }, (_, i) => `Brief ${pad(i + 1, 2)}`);
for (const b of BRIEFS) add({ name: b, type: "Brief", content: `<p>${sentence(6)}</p>` });

// ---- notes: links, nests across permission boundaries ------------------------------------
const NOTES = Array.from({ length: 40 }, (_, i) => `Note ${pad(i + 1)}`);
for (const [i, n] of NOTES.entries()) {
  const parts = [`<p>${sentence(10)}</p>`];
  if (i % 2 === 0) parts.push(`<p>Topic: [[${TOPICS[i % 30]}]]</p>`);
  if (i % 4 === 1) parts.push(`{{${TOPICS[(i + 2) % 30]}+summary|content}}`);
  if (i % 5 === 2) parts.push(`{{${MEMOS[i % 15]}}}`);
  if (i % 7 === 3) parts.push(`{{${BRIEFS[i % 10]}|titled}}`);
  if (i % 6 === 4) parts.push(`{{${TOPICS[(i + 5) % 30]}|open}}`);
  if (i % 9 === 0) parts.push(`<p>[[Wanted ${pad(i + 1)}|a card nobody wrote]]</p>`);
  add({ name: n, type: "RichText", content: parts.join("\n") });
}
// Typed notes (the Note cardtype and its default).
for (let i = 1; i <= 8; i++) add({ name: `Typed Note ${pad(i, 2)}`, type: "Note", ...(i % 2 ? { content: `<p>${sentence(6)}</p>` } : {}) });

// ---- a nest chain deeper than Decko's nest limit -------------------------------------
const CHAIN = 25;
for (let d = 1; d <= CHAIN; d++) {
  const next = d < CHAIN ? ` {{Chain ${pad(d + 1, 2)}}}` : "";
  add({ name: `Chain ${pad(d, 2)}`, type: "RichText", content: `<p>Depth ${d}.</p>${next}` });
}
// A two-card nest loop.
add({ name: "Loop A", type: "RichText", content: "<p>A</p>{{Loop B}}" });
add({ name: "Loop B", type: "RichText", content: "<p>B</p>{{Loop A}}" });

// ---- searches -----------------------------------------------------------------------
const SEARCHES = {
  "All Topics": { type: "Topic", sort: "name" },
  "Recent Notes": { type: "RichText", complete: "Note", sort: "name", limit: 10 },
  "Topic Summaries": { right: "summary", sort: "name", limit: 15 },
  "Memo List": { type: "Memo", sort: "name" },
  "Brief List": { type: "Brief", sort: "name" },
  "Links To Topic 001": { link_to: "Topic 001" },
  "Tagged 01": { right_plus: ["tags", { refer_to: "Tag 01" }], sort: "name" },
  "Chain Cards": { complete: "Chain", sort: "name", dir: "desc", limit: 5 },
  "Typed Notes": { type: "Note", sort: "name" },
  "Not Topics": { not: { type: ["in", "Topic", "Memo", "Brief", "RichText", "Pointer"] }, sort: "name", limit: 20 },
  "Tags In Use": { referred_to_by: { right: "tags" }, sort: "name" },
  "Count Of Notes": { type: "RichText", complete: "Note", return: "count" },
};
for (const [name, query] of Object.entries(SEARCHES)) add({ name, type: "Search", content: JSON.stringify(query) });
add({ name: "Search Page", type: "RichText", content: "{{All Topics|open}}\n{{Memo List|content}}\n{{Brief List|content}}\n{{Count Of Notes|core}}" });

// ---- simple types ---------------------------------------------------------------------
for (let i = 1; i <= 5; i++) add({ name: `Phrase ${i}`, type: "Phrase", content: sentence(3).slice(0, -1) });
for (let i = 1; i <= 5; i++) add({ name: `Number ${i}`, type: "Number", content: String(i * 137) });
for (let i = 1; i <= 5; i++) add({ name: `Plain ${i}`, type: "PlainText", content: `${sentence(4)}\n<b>not bold</b> & ${i}` });
for (let i = 1; i <= 3; i++) add({ name: `Markup ${i}`, type: "HTML", content: `<div class="box-${i}"><em>${sentence(3)}</em></div>` });
for (let i = 1; i <= 3; i++) add({ name: `Toggle ${i}`, type: "Toggle", content: i % 2 ? "1" : "0" });
for (let i = 1; i <= 3; i++) add({ name: `Date ${i}`, type: "Date", content: `2026-0${i}-1${i}` });

// ---- files ------------------------------------------------------------------------------
const filesDir = path.join(out, "files");
mkdirSync(filesDir, { recursive: true });
for (let i = 1; i <= 4; i++) {
  const file = `report-${i}.txt`;
  writeFileSync(path.join(filesDir, file), `Report ${i}\n${sentence(12)}\n`);
  add({ name: `Report ${i}`, type: "File", file: `files/${file}` });
}
add({ name: "Report Index", type: "RichText", content: "{{Report 1}}\n{{Report 2|core}}\n[[Report 3]]" });

// ---- followers (side effects) ---------------------------------------------------------
// `decko setup` leaves "email stylesheet" RichText although its seed data
// declares SCSS (card-mod-email data/real.yml); every notification email
// renders it compiled, so the deck restores the declared type.
add({ name: "email stylesheet", type: "SCSS" });
add({ name: "*all+Mira Member+*follow", content: "*always" });

// ---- v2 coverage additions ------------------------------------------------------------
// The seconds corpus renders every view the composed deck can serve (see
// reference-harness/corpus/coverage-view-ops.mjs). These cards give every
// registration a concrete card to render: one card per stock card type the
// seed lacks, a second custom role with its own read rules, the account and
// api-key surfaces, the mod card surface, and the discussion/help/rule
// machinery the view table names.
add({ name: "Contractor", type: "Role" });
add({ name: "Contractor+*members", content: "[[Quinn Contractor]]" });
add({
  name: "Quinn Contractor",
  type: "User",
  fields: {
    "+*account": { fields: { "+*email": ACTORS.contractor.email, "+*password": ACTORS.contractor.password, "+*status": "active" } },
    "+*api_key": "corpuscontractorkey0000000001",
  },
});
add({ name: "Ada Admin+*api_key", content: "corpusadminkey000000000000001" });
add({ name: "Ada Admin+*follow", content: "*always" });
// Permission lattice: a memo (Member-readable by type) a contractor is
// denied; a contractor-only note; a signed-in-only note.
add({ name: "Contractor Memo 01", type: "Memo", content: `<p>${sentence(6)}</p>` });
add({ name: "Contractor Note 01", type: "RichText", content: `<p>${sentence(6)}</p>` });
add({ name: "Contractor Note 01+*self+*read", type: "Pointer", content: "[[Contractor]]" });
add({ name: "Shared Note 01", type: "RichText", content: `<p>${sentence(6)}</p>` });
add({ name: "Shared Note 01+*self+*read", type: "Pointer", content: "[[Anyone Signed In]]" });
add({ name: "Topic 001+*self+*update", type: "Pointer", content: "[[Member]]" });
// One card per stock type the v1 deck did not carry.
add({ name: "Example Site", type: "URI", content: "http://deck.example/scene" });
add({ name: "Markdown Guide", type: "Markdown", content: "## Heading\n\nA **bold** word and a [link](http://deck.example)." });
add({ name: "Reading List", type: "Link list", content: "[[Topic 001]]\n[[Topic 002]]" });
add({ name: "Panel Layout", type: "Nest list", content: "summary\ntags" });
add({ name: "Corpus List", type: "List", content: "[[Topic 001]]\n[[Topic 002]]" });
add({ name: "Corpus Script", type: "JavaScript", content: "/* corpus script */\nwindow.corpusMarker = 1;\n" });
add({ name: "Corpus Style", type: "SCSS", content: ".corpus { color: #35507f; }\n" });
add({ name: "Corpus Layout", type: "Layout", content: "[[Corpus Header]]\n|open content|\n[[Corpus Footer]]" });
add({ name: "Corpus Header", type: "RichText", content: "<p>Corpus header.</p>" });
add({ name: "Corpus Footer", type: "RichText", content: "<p>Corpus footer.</p>" });
add({
  name: "Cohort Welcome",
  type: "Email template",
  fields: { "+*subject": "Welcome to the corpus", "+*html_message": "<p>Welcome, {{_self+*subject}}.</p>", "+*text_message": "Welcome to the corpus." },
});
add({ name: "Corpus Skin", type: "Bootswatch skin", content: "default", fields: { "+*colors": "" } });
add({ name: "mod: script+*script", content: "" });
add({ name: "mod: style+*style", content: "" });
// Discussions (comment machinery) and a type help rule (help machinery).
add({ name: "Topic 001+discussion", type: "RichText", content: "<p>First comment.</p>" });
add({ name: "Topic 002+discussion", type: "RichText", content: "" });
add({ name: "Note+*type+*help", type: "RichText", content: "<p>A note records an observation.</p>" });
// The image-type views render on the seed's own coded-storage Image cards
// (*favicon, Decko logo), so the corpus adds no upload of its own: uploads'
// persistence parity is synthetic-v1's File-card ground, and the view family
// needs only existing Image cards.

const deck = {
  format: "decko-reference-deck/1",
  name: path.basename(out),
  generator: { script: "reference-harness/corpus/generate-deck.mjs", version: GENERATOR_VERSION },
  base: { seed: "decko setup", decko: "0.20.0", card: "1.110.0" },
  clock: "2026-09-19T12:00:00Z",
  environment: { origin: "http://deck.example", default_html_view: "titled" },
  actors: ACTORS,
  cards,
};
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "deck.json"), JSON.stringify(deck, null, 2) + "\n");
console.log(`wrote ${cards.length} card definitions to ${path.join(out, "deck.json")}`);
