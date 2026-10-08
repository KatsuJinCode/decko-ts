#!/usr/bin/env node
// Generates a fixture's operation lists from its deck.json: what every engine
// is asked to do, per parity kind. Deterministic, plain data.
//
//   node reference-harness/corpus/generate-ops.mjs <fixtureDir>
//
// Writes <fixtureDir>/ops/render.jsonl, semantics.jsonl and scenarios.json.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: generate-ops.mjs <fixtureDir>");
  process.exit(2);
}
const deck = JSON.parse(readFileSync(path.join(dir, "deck.json"), "utf8"));
const ACTORS = Object.keys(deck.actors);
const deckNames = deck.cards.map((c) => c.name);
// Cards the seed provides that every deck page leans on, and two absent cards.
const SEED_CARDS = ["*all", "Administrator", "Anyone Signed In", "Anonymous"];
const ABSENT = ["Nonexistent Card", "Topic 001+nonexistent"];
const renderCards = [...deckNames, ...SEED_CARDS, ...ABSENT];

const lines = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const out = path.join(dir, "ops");
mkdirSync(out, { recursive: true });

// ---- rendering: the page (GET /<card>) and the core view, per actor ----------
const render = [];
for (const card of renderCards) {
  for (const actor of ACTORS) {
    render.push({ id: `page:${actor}:${card}`, op: "render", actor, card });
    render.push({ id: `core:${actor}:${card}`, op: "render", actor, card, view: "core" });
  }
}
writeFileSync(path.join(out, "render.jsonl"), lines(render));

// ---- semantics: questions whose answers are data, not HTML -------------------
const semantics = [];
for (const card of [...deckNames, ...SEED_CARDS]) {
  semantics.push({ id: `card:${card}`, op: "ask", actor: "admin", q: "card", card });
  semantics.push({ id: `sets:${card}`, op: "ask", actor: "admin", q: "set_names", card });
  for (const setting of ["read", "update", "create"]) {
    semantics.push({ id: `rule:${setting}:${card}`, op: "ask", actor: "admin", q: "rule", card, setting });
  }
  for (const actor of ACTORS) {
    semantics.push({ id: `perm:${actor}:${card}`, op: "ask", actor, q: "permissions", card });
  }
}
for (const card of ABSENT) {
  semantics.push({ id: `card:${card}`, op: "ask", actor: "admin", q: "card", card });
  for (const actor of ACTORS) semantics.push({ id: `perm:${actor}:${card}`, op: "ask", actor, q: "permissions", card });
}
for (const c of deck.cards.filter((c) => c.type === "Search")) {
  for (const actor of ACTORS) {
    semantics.push({ id: `search:${actor}:${c.name}`, op: "ask", actor, q: "search", query: JSON.parse(c.content) });
  }
}
const NAMES = [
  "Topic 001", "topic_001", "Topic 001+summary", "Topic 001+tags+Tag 01", "*all", "*all+*read",
  "Topic+*type+*structure", "  Spaced   Name  ", "Mixed CASE name", "Name+", "+summary", "A+B+C+D",
  "Dot.Name", "Café crème", "Number 1", "Chain 01", "_left+tags", "~123", "Plurals Notes",
  "Question?", "Slash/Name", "Ampersand & Co", "Hyphen-name", "under_score_name",
];
for (const name of NAMES) semantics.push({ id: `name:${name}`, op: "ask", actor: "anonymous", q: "name", name });
writeFileSync(path.join(out, "semantics.jsonl"), lines(semantics));

// ---- persistence and side effects: write scenarios, each on a fresh deck copy --
const member = deck.actors.member;
const scenarios = [
  { id: "create-note-as-member", steps: [
    { op: "write", actor: "member", action: "create", card: "Harness Note 1", fields: { type: "Note", content: "<p>From a member.</p>" } },
  ] },
  { id: "create-note-as-anonymous-denied", steps: [
    { op: "write", actor: "anonymous", action: "create", card: "Harness Note 2", fields: { type: "Note", content: "<p>Should be refused.</p>" } },
  ] },
  { id: "create-topic-with-fields-as-admin", steps: [
    { op: "write", actor: "admin", action: "create", card: "Topic 031", fields: { type: "Topic", fields: { "+summary": "<p>A new topic.</p>", "+tags": "[[Tag 02]]" } } },
  ] },
  { id: "update-content-adds-link", steps: [
    { op: "write", actor: "admin", action: "update", card: "Note 002", fields: { content: "<p>Now links [[Topic 004]] and [[Brand New Wanted]].</p>" } },
  ] },
  { id: "update-topic-as-member", steps: [
    { op: "write", actor: "member", action: "update", card: "Topic 001", fields: { content: "member edit" } },
    { op: "write", actor: "member", action: "update", card: "Topic 002+summary", fields: { content: "<p>Member summary edit.</p>" } },
  ] },
  { id: "update-as-anonymous-denied", steps: [
    { op: "write", actor: "anonymous", action: "update", card: "Note 003", fields: { content: "vandal" } },
  ] },
  { id: "rename-referenced-tag", steps: [
    { op: "write", actor: "admin", action: "update", card: "Tag 01", fields: { name: "Tag 01 Renamed" } },
  ] },
  { id: "delete-note", steps: [
    { op: "write", actor: "admin", action: "delete", card: "Note 005" },
  ] },
  { id: "delete-topic-with-fields", steps: [
    { op: "write", actor: "admin", action: "delete", card: "Topic 010" },
  ] },
  { id: "create-memo-member-then-read-denied-anonymous", steps: [
    { op: "write", actor: "member", action: "create", card: "Memo 99", fields: { type: "Memo", content: "<p>Members only.</p>" } },
    { op: "ask", actor: "anonymous", q: "permissions", card: "Memo 99" },
    { op: "render", actor: "anonymous", card: "Memo 99", view: "core" },
  ] },
  { id: "create-duplicate-name", steps: [
    { op: "write", actor: "admin", action: "create", card: "Note 001", fields: { type: "RichText", content: "dup" } },
  ] },
  { id: "create-tag-as-member", steps: [
    { op: "write", actor: "member", action: "create", card: "Tag 11", fields: { type: "Tag", content: "<p>New tag.</p>" } },
  ] },
  { id: "create-compound-on-new-left", steps: [
    { op: "write", actor: "admin", action: "create", card: "Fresh Left+Fresh Right", fields: { type: "RichText", content: "<p>Both sides new.</p>" } },
  ] },
  { id: "create-number-invalid", steps: [
    { op: "write", actor: "admin", action: "create", card: "Number Bad", fields: { type: "Number", content: "not a number" } },
  ] },
  { id: "update-then-render", steps: [
    { op: "write", actor: "admin", action: "update", card: "Chain 25", fields: { content: "<p>The bottom moved.</p>" } },
    { op: "render", actor: "anonymous", card: "Chain 20", view: "core" },
  ] },
  { id: "sign-in", steps: [
    { op: "signin", email: member.email, password: member.password },
    { op: "signin", email: member.email, password: "wrong password" },
    { op: "signin", email: "nobody@example.test", password: "whatever" },
  ] },
];
writeFileSync(path.join(out, "scenarios.json"), JSON.stringify({ scenarios }, null, 2) + "\n");
console.log(`render ${render.length}, semantics ${semantics.length}, scenarios ${scenarios.length}`);
