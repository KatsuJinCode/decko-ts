#!/usr/bin/env node
// Builds the synthetic-v2 coverage map: the render operation list
// (reference-harness/fixtures/synthetic-v2/ops/render.jsonl) folded against the registration
// census, so every operation's code paths are answerable from one artifact.
// The generation-time assertion in generate-ops.mjs guarantees every census
// view is exercised; this map is the reviewable record of WHICH operation
// exercises it, under which actors, served by which mods' registrations.
//
// The map is generated locally and is not part of the shipped tree. Write it
// under tmp/ (gitignored):
//
//   node reference-harness/corpus/build-coverage-map.mjs > tmp/coverage-map.json

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeCensus } from "./composed-deck-registration-census.mjs";
import { viewOps, unreachableViews } from "./coverage-view-ops.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(here, "../fixtures/synthetic-v2");
const deck = JSON.parse(readFileSync(path.join(fixtureDir, "deck.json"), "utf8"));

const census = computeCensus();
const rows = viewOps();
const htmlVisible = new Set(["html", "base"]);

// mod + set-path provenance per view, from the manifest walk.
const provenance = new Map();
for (const r of census.manifestRows) {
  if (!htmlVisible.has(r.formatKey)) continue;
  const entry = provenance.get(r.view) ?? { mods: new Set(), setPaths: new Set() };
  entry.mods.add(r.mod);
  entry.setPaths.add(r.setPath);
  provenance.set(r.view, entry);
}

const views = rows.map(({ view, card, actors, why }) => {
  const p = provenance.get(view);
  const opIds = actors.map((a) => `view:${a}:${card}:${view}`);
  return {
    view,
    corpusOps: opIds,
    actors,
    card,
    mods: p ? [...p.mods].sort() : [],
    setPaths: p ? [...p.setPaths].sort() : [],
    why,
  };
});

const unreachable = unreachableViews();

// The page grid's dimensions, stated once: every deck card plus every
// structural seed card renders as a full page for all four actors and as its
// core view for the allowed and the denied actor.
const deckNames = new Set(deck.cards.map((c) => c.name));
const pageGrid = {
  shape: "every deck or seed card x {page: 4 actors, core: admin + anonymous}",
  actorLattice: Object.entries(deck.actors).map(([name, a]) => ({
    actor: name,
    card: a.card,
    shape:
      name === "anonymous" ? "signed out" :
      name === "admin" ? "Administrator role: reads and writes everything" :
      name === "contractor" ? "Contractor role (the second role): denied Member-only cards, allowed Contractor-only cards" :
      "Member role: denied Briefs and Contractor-only cards, allowed Memos",
  })),
  cardTypes: [...new Set(deck.cards.map((c) => c.type).filter(Boolean))].sort(),
  seedTypesExercised: [
    "Bootswatch skin", "CSS", "Cardtype", "CoffeeScript", "Date", "Email template", "File", "HTML",
    "Image", "JSON", "JavaScript", "Layout", "Link list", "List", "Markdown", "Mod", "Nest list",
    "Number", "Phrase", "PlainText", "Pointer", "RichText", "Role", "SCSS", "Search", "Session",
    "Set", "Setting", "Sign up", "Toggle", "Topic", "URI", "User", "Notification template",
  ],
};

const map = {
  format: "synthetic-v2-coverage-map/1",
  fixture: "synthetic-v2",
  generatedBy: "reference-harness/corpus/build-coverage-map.mjs",
  census: {
    viewsServed: census.views.live.length,
    flatRecordViews: census.views.counts.flatRecord,
    chainServedOnlyViews: census.views.counts.chainServedOnly,
    modsComposed: census.modsInLoadOrder.length,
    modLoadOrder: census.modsInLoadOrder,
    registeredSettings: census.registeredSettings,
    registeredPatternCodes: census.registeredPatternCodes,
    registeredEvents: census.registeredEvents,
  },
  pageGrid,
  viewCoverage: views,
  unreachableViews: unreachable,
  notes: [
    "A corpus operation's coverage is its view row here (view ops) or the page-grid shape (page/core ops: the full page frame, the card's type editor and permission verdicts for the actor).",
    "Op ids: page:<actor>:<card>, core:<actor>:<card>, view:<actor>:<card>:<view> - see reference-harness/fixtures/synthetic-v2/ops/render.jsonl.",
    "unreachableViews holds the census rows no stock-deck card can instantiate, each with its reason; the generate-ops assertion keeps this list honest.",
  ],
};

process.stdout.write(JSON.stringify(map, null, 2) + "\n");
