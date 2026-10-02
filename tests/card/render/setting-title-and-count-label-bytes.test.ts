// bar-slots lane (2026-09-29, view-fail classes Z10 + V9):
//
// Z10 SETTING DISPLAY TITLES: settings with an I18n display title render it
// in the card-title span (Card::Setting#title, the setting_title.<codename>
// locale keys) — the pass-15 dump pins `Search Results` for *search
// (phase-001/html/000003-_search-title.expected.html verbatim), `Sign In`
// for *signin and `Recent Changes` for *recent, where the engine rendered
// the raw star names. Every OTHER captured setting-codename card renders
// its RAW name in the oracle (*style, *structure, *on create, *recent
// settings — grep over expected-v2), so the table carries exactly the
// three pinned codenames and a miss falls through to the plain name.
// Rule rows (junction names) are never simple and keep their rule names.
//
// V9 COUNT LABEL (the fixable sub-shape): the List module's one_line_content
// renders "#{count} items" for count != 1 — INCLUDING 0
// (card-mod-list set/abstract/01_list/html_views.rb:99-105 short_content →
// short_content_items). The engine's branch gated `> 1`, so a 0-item rule
// rendered an empty one-line where the oracle pins "0 items" (the
// Doctor Myth+*self+*layout dump row, phase-002:
// `<div class="text-muted one-line">0 items</div>`).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

const SET_TYPE_ID = 1;
const SETTING_TYPE_ID = 2;
const LIST_TYPE_ID = 3;
const RICH_TYPE_ID = 4;

async function seedDeck(): Promise<void> {
  const s = storage!;
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 3, name: "List", codename: "list" });
  await seedCard(s, { id: 4, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: SET_TYPE_ID, dbContent: "{}" });
  await seedCard(s, { id: 20, name: "*read", codename: "read", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 21, name: "*layout", codename: "layout", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 22, name: "*search", codename: "search", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 23, name: "*signin", codename: "signin", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 24, name: "*recent", codename: "recent", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 25, name: "*style", codename: "style", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 26, name: "*self", codename: "self", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 30, name: "Joe Admin", typeId: RICH_TYPE_ID, dbContent: "body" });
  await seedCard(s, { id: 31, leftId: 30, rightId: 26, typeId: SET_TYPE_ID, dbContent: "{}" });
  // The deck's readable grant + the *all+*read rule.
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, typeId: LIST_TYPE_ID, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 6, "anyone");
  // The winning *layout rule for the *all level: a 0-item List — the
  // Doctor Myth+*self+*layout oracle shape's existing rule.
  await seedCard(s, { id: 51, leftId: 10, rightId: 21, typeId: LIST_TYPE_ID, dbContent: "" });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
  for (const name of ["*search", "*signin", "*recent", "*style", "*layout"]) {
    try {
      await storage.engine.render(name, "open");
    } catch {
      // best-effort warm-up only
    }
  }
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("Z10: setting display titles in the card-title span", () => {
  it("renders the dumped oracle title bytes for the three I18n-pinned settings", async () => {
    // phase-001 000003-_search-title.expected.html, verbatim.
    expect(await storage!.engine.render("*search", "title")).toBe(
      `<span class="card-title" title="Search Results">Search Results</span>`,
    );
    expect(await storage!.engine.render("*signin", "title")).toBe(
      `<span class="card-title" title="Sign In">Sign In</span>`,
    );
    expect(await storage!.engine.render("*recent", "title")).toBe(
      `<span class="card-title" title="Recent Changes">Recent Changes</span>`,
    );
  });

  it("keeps the raw name for settings without a pinned I18n title", async () => {
    // The oracle renders raw star names for every other setting-codename
    // card (*style, *structure, *on create, ... — expected-v2 grep).
    expect(await storage!.engine.render("*style", "title")).toBe(
      `<span class="card-title" title="*style">*style</span>`,
    );
  });

  it("keeps rule-row titles raw (junction names are never simple)", async () => {
    const html = await storage!.engine.render("Joe Admin+*self", "content");
    expect(html).toContain(`title="Joe Admin+*self+*layout"`);
    expect(html).not.toContain(`title="Joe Admin+*self+Recent Changes"`);
  });
});

describe("V9: the 0-item count label", () => {
  it("renders 0 items for a rule whose list content is empty", async () => {
    // The Doctor Myth+*self+*layout oracle row (phase-002):
    // `<div class="text-muted one-line">0 items</div>`.
    const html = await storage!.engine.render("Joe Admin+*self", "content");
    const at = html.indexOf("joe_admin-Xself-Xlayout-bar-view");
    expect(at, "layout row id").toBeGreaterThan(-1);
    const slot = html.slice(html.lastIndexOf("<div", at), at + 1600);
    expect(slot).toContain(`<div class="text-muted one-line">0 items</div>`);
  });
});
