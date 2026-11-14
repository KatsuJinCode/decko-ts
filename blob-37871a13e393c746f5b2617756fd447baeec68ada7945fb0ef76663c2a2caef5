#!/usr/bin/env node
// Generates a fixture's operation lists from its deck.json: what every engine
// is asked to do, per parity kind. Deterministic, plain data.
//
//   node reference-harness/corpus/generate-ops.mjs <fixtureDir>
//
// Writes <fixtureDir>/ops/render.jsonl, semantics.jsonl and scenarios.json.
//
// v2 (the seconds corpus): the render list is the gate instrument. It is
// exhaustive over CODE PATHS, not over pages:
//   - every deck card and every structural seed card, as a full page, for
//     every actor (the permission lattice: anonymous, member, a second
//     role, admin),
//   - every such card as its core view, allowed and denied actor,
//   - every view the composed deck can serve (the registration census,
//     computed live from the manifests by
//     composed-deck-registration-census.mjs), through
//     coverage-view-ops.mjs's mapping - asserted complete below, so a new
//     registration with no corpus operation fails this generator.
// Semantics and scenarios stay empty: the corpus's parity kind is rendering,
// byte-compared against the Ruby oracle. synthetic-v1 remains the fixture
// for the other three kinds.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeCensus } from "./composed-deck-registration-census.mjs";
import { viewOps, unreachableViews } from "./coverage-view-ops.mjs";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: generate-ops.mjs <fixtureDir>");
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const deck = JSON.parse(readFileSync(path.join(dir, "deck.json"), "utf8"));
const ACTORS = Object.keys(deck.actors);
if (ACTORS.length !== 4) {
  console.error(`expected the four-actor lattice (anonymous, member, contractor, admin); got ${ACTORS.join(", ")}`);
  process.exit(2);
}

// ---- the census assertion: mapped + unreachable covers the census exactly ----
const census = computeCensus();
const liveViews = census.views.live;
const mappedViews = new Set(viewOps().map((r) => r.view));
const unknownMapped = [...mappedViews].filter((v) => !liveViews.includes(v));
const unmapped = liveViews.filter((v) => !mappedViews.has(v));
const unreachable = unreachableViews().map((r) => r.view);
const unknownUnreachable = unreachable.filter((v) => !liveViews.includes(v));
const problems = [];
if (unknownMapped.length) problems.push(`view ops name views the census does not serve: ${unknownMapped.join(", ")}`);
if (unknownUnreachable.length) problems.push(`unreachable rows name views the census does not serve: ${unknownUnreachable.join(", ")}`);
for (const v of unmapped) {
  if (!unreachable.includes(v)) problems.push(`census view "${v}" has no view op and no unreachable entry`);
}
if (problems.length) {
  console.error("the view-coverage table does not cover the registration census:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("regenerate coverage-view-ops.mjs rows for the views above (re-run the census to see them).");
  process.exit(1);
}

// ---- the page grid --------------------------------------------------------------
// Cards the seed provides that coverage leans on: the singleton machinery
// cards, the layout/email/script/style assets, the mod cards, the rule and
// set cards the view table names.
const SEED_CARDS = [
  "*all", "*read", "*create", "*script", "*style", "*title", "*head", "*layout",
  "*signin", "*search", "*recent", "*admin", "*account links", "*enabled roles",
  "*guide", "*help", "*home", "*footer", "*header", "*sidebar", "*favicon",
  "*logo", "*main menu", "*follow defaults", "*recaptcha settings",
  "*all+*read", "*all+*create", "*all+*script", "*all+*style",
  "Topic+*type", "Topic+*type+*structure", "*all+Mira Member+*follow",
  "Administrator", "Anyone Signed In", "Anonymous",
  "mod: account", "mod: help", "mod: style", "mod: script", "mod: search", "mod: email",
  "style: mods", "welcome email", "password reset email", "follower notification email",
  "verification email", "signup alert email", "Email template",
  "Home Layout", "Left Sidebar Layout", "Right Thin Sidebar Layout",
  "Sign up", "Decko Bot", "Decko logo", "Help Desk", "Search Page", "Recent Notes",
  "Cards with accounts", "JavaScript", "CoffeeScript",
  "Local script folder group", "Local style folder group",
  "Local script manifest group", "Local style manifest group",
];
// Absent cards: the unknown/denial/new-form branches render them on purpose.
// "Corpus New Card" must not exist in the deck - it is the new-card form's
// target.
const ABSENT = ["Nonexistent Card", "Topic 001+nonexistent", "Corpus New Card"];

const deckNames = deck.cards.map((c) => c.name);
const renderCards = [...deckNames, ...SEED_CARDS.filter((c) => !deckNames.includes(c)), ...ABSENT];

const lines = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
const out = path.join(dir, "ops");
mkdirSync(out, { recursive: true });

// ---- rendering: the page (GET /<card>) per actor, the core view allowed and
// denied, then every census view through its coverage-mapped operation.
const render = [];
for (const card of renderCards) {
  for (const actor of ACTORS) {
    render.push({ id: `page:${actor}:${card}`, op: "render", actor, card });
  }
  render.push({ id: `core:admin:${card}`, op: "render", actor: "admin", card, view: "core" });
  render.push({ id: `core:anonymous:${card}`, op: "render", actor: "anonymous", card, view: "core" });
}
for (const { view, card, actors } of viewOps()) {
  for (const actor of actors) {
    render.push({ id: `view:${actor}:${card}:${view}`, op: "render", actor, card, view });
  }
}
writeFileSync(path.join(out, "render.jsonl"), lines(render));

// ---- semantics and scenarios: deliberately empty (see the header comment) ----
writeFileSync(path.join(out, "semantics.jsonl"), "");
writeFileSync(path.join(out, "scenarios.json"), JSON.stringify({ scenarios: [] }, null, 2) + "\n");

console.log(
  `render ${render.length} ops over ${renderCards.length} cards x ${ACTORS.length} actors; ` +
  `census ${liveViews.length} views mapped ${mappedViews.size}, unreachable ${unreachable.length}`,
);
