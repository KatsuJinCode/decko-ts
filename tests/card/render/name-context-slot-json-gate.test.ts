// Mechanism 3 of the live-wire page-render defect verdict
// (brandonDojoTech tmp/wrong-goal-hunt/live-wire-class-tokens.md, 2026-09-28):
// the engine omits the `,"name_context":"..."` member from bar data-slot JSON
// after `"home_view":"open"` on content-page nests. Probe evidence (pos1450
// Occupy page, pos1600 Sylvester; probe snap=3 eng=0 live=3 for the
// `home_view":"open","name_context":...` style, eng-style `open"}` live=0):
//
//   SNAP: ...&quot;hide&quot;:[&quot;bar_middle&quot;],&quot;home_view&quot;:&quot;open&quot;,
//         &quot;name_context&quot;:&quot;occupy_wall_street_first_officical_statement&quot;}
//   ENG : ...&quot;hide&quot;:[&quot;bar_middle&quot;],&quot;home_view&quot;:&quot;open&quot;}
//   LIVE: == SNAP
//
// All three wanted slots on that page (+pdf, +tags mini_bars, +discussion
// open slot) are ID-LESS in BOTH oracles (the junctions have no rows — the
// data-card-id attribute is absent on both sides) — the card identity is
// identical; ONLY the name_context member differs.
//
// Ruby mechanism (card-mod-format-0.20.0 set/all/html/wrap.rb:74-78
// name_context_slot_option):
//     return unless initial_context_names.present?
//     opts[:name_context] = initial_context_names.map(&:key) * ","
// The ONLY gate is initial_context_names presence — there is NO unknown-card
// gate at this layer. Which nests see a context is decided UPSTREAM by
// relevant_context_names (context_names.rb:26-29): the parent context is
// filtered to the parts of THIS card's name.
//
// The graded capture corpus itself arbitrates the two shapes
// (tmp/raw-ground-truth/expected-v2/page-lane/dual-lane-validation-2026-09-25.jsonl):
//   - Conflict_Done_Well nests {{+management|closed}} DIRECTLY in the page
//     body; the wanted (id-less) Conflict_Done_Well+management mini_bar slot
//     CARRIES name_context "conflict_done_well".
//   - Latest News's wanted Brian_Roemmele_...+pdf slots nest under the ITEM
//     card (the pointer item's own content), whose format context filtered
//     to the item's parts is EMPTY — name_context count 0 on the WHOLE page.
// The prior engine gate (`fmt.card.unknown !== true`, pinned to a stale
// live-v0.19.1 capture of /Aikido_2's +management) contradicts the graded
// oracle on the first shape and is removed; the part-filter alone decides.
//
// This test pins both oracle shapes: name_context PRESENT on the direct
// page-body wanted nest, ABSENT on the item-level wanted nest.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { renderPageBytes } from "../../../src/card/render/page.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

const POINTER_TYPE_ID = 10;

async function seedDeck(): Promise<void> {
  const s = storage!;
  await seedCard(s, { id: 2, name: "Basic", codename: "basic", typeId: 2 });
  await seedCard(s, { id: 3, name: "List", codename: "list" });
  await seedCard(s, { id: 4, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 5, name: "HTML", codename: "html" });
  await seedCard(s, { id: 10, name: "Pointer", codename: "pointer" });
  // Head-path settings the page chrome parses.
  await seedCard(s, { id: 42, name: "*layout", codename: "layout" });
  await seedCard(s, { id: 43, name: "*title", codename: "title" });
  await seedCard(s, { id: 44, name: "*favicon", codename: "favicon" });
  await seedCard(s, { id: 45, name: "*ace", codename: "ace" });
  await seedCard(s, { id: 46, name: "*tiny_mce", codename: "tiny_mce" });
  // The probe layout: main slot only.
  await seedCard(s, { id: 81, name: "*all", codename: "all", typeId: 2, dbContent: "{}" });
  await seedCard(s, {
    id: 82,
    name: "Context Probe Layout",
    typeId: 2,
    dbContent: "{{_main|titled}}",
  });
  await seedCard(s, {
    id: 83,
    leftId: 81,
    rightId: 42,
    typeId: 2,
    dbContent: "Context Probe Layout",
  });
  // SHAPE 1 (Conflict_Done_Well): the page nests +management directly; the
  // +management junction has NO row (wanted).
  await seedCard(s, {
    id: 90,
    name: "Context Page",
    typeId: 4,
    dbContent: "<p>{{+management|closed}}</p>",
  });
  // SHAPE 2 (Latest News): the item surface. The page nests an ABSOLUTE
  // card ("Report" — its parts do NOT include the page's) whose content
  // nests a WANTED +pdf junction. The item format's context filters EMPTY
  // (relevant_context_names: the item name shares no part with the page),
  // and :open adds no context of its own — so the +pdf slot must carry NO
  // name_context (the graded Latest News page pins name_context count 0
  // for exactly this shape: item-template rendering, absolute item names).
  await seedCard(s, {
    id: 91,
    name: "News Page",
    typeId: 4,
    dbContent: "<p>{{Report|open}}</p>",
  });
  await seedCard(s, {
    id: 94,
    name: "Report",
    typeId: 4,
    dbContent: "<p>{{+pdf|closed}}</p>",
  });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
  storage.fetcher.codenames.ensureLoaded();
  storage.fetcher.installNameEnvironment();
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("bar slot JSON name_context: wrap.rb gate (live-wire mechanism 3)", () => {
  it("emits name_context on the page-body WANTED +management mini_bar (CDW shape)", async () => {
    const html = await renderPageBytes(storage!.engine, "Context Page");
    const at = html.indexOf("context_page-management-mini_bar-view");
    expect(at).toBeGreaterThan(-1); // the wanted mini_bar renders
    // The oracle byte (Occupy +pdf / CDW +management shape): the member
    // lands AFTER home_view, as the LAST JSON key.
    expect(html).toContain(
      "&quot;home_view&quot;:&quot;open&quot;,&quot;name_context&quot;:&quot;context_page&quot;}",
    );
  });

  it("emits NO name_context inside an absolute-item nest (Latest News shape)", async () => {
    const html = await renderPageBytes(storage!.engine, "News Page");
    const at = html.indexOf("report-pdf-mini_bar-view");
    expect(at).toBeGreaterThan(-1); // the wanted +pdf mini_bar renders
    const divStart = html.lastIndexOf("<div", at);
    const slot = html.slice(divStart, divStart + 700);
    expect(slot).toContain("mini_bar-view");
    // The part-filter empties the context: "Report" shares no part with
    // "News Page" and :open adds none of its own (wrap.rb's presence gate
    // is the ONLY gate; the filter upstream does all the work).
    expect(slot).not.toContain("name_context");
  });
});
