// The *css setting address, the enumeration audit's gap 11 (A2 row `*css`,
// gaps.json "the *css setting address"):
//
//   /*css            (the bar menu's full-page link, the audit's "the *css
//                     address itself")
//   /*css/board      (the bar menu's "advanced" board link, the audit's
//                     "the board's advanced tab linking to /*css/board")
//
// The capture bytes are the spec:
//   - fixtures/captured/sass-style-pages/oracle-main-slot-regions.json
//     records the *css bar inside the "customized classic skin" page's
//     main-slot region: the pointer-item bar with the captured identity set
//     (data-card-id 198, ALL TYPE-css STAR SELF-Xcss, CSS-typed) and the
//     four-entry bar menu (page / modal / edit / advanced-board). The bar
//     region arm below byte-pins that slot against the capture's own bytes
//     (the page-level pin that already holds is
//     bootstrap-code-file-pages.test.ts; this pin extracts the bar slot
//     itself so the receipt names the address surface, not the whole page).
//   - No oracle bytes record what the two ADDRESSES answer, so the address
//     arms pin the response invariants the capture does establish: the
//     identity set the bar carries (the mark, the CSS type, the set keys)
//     on the page's main slot, and the board modal's breadcrumb + slot on
//     the advanced address, under the deck's own update grant (the board
//     view is update-gated; the real deck grants it).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRenderTestStorage, seedCard, seedReference, type RenderTestStorage } from "./render-test-storage.js";
import { renderPageBytes } from "../../../src/card/render/page.js";
import { setHamlSlotStyle } from "../../../src/card/render/haml-slot-style.js";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const FIXTURE = resolve(
  REPO_ROOT,
  "fixtures/captured/sass-style-pages/oracle-main-slot-regions.json",
);

interface PinnedPage {
  name: string;
  regionStart: number;
  regionLen: number;
  expected: string;
}

const FIXTURE_DATA = JSON.parse(readFileSync(FIXTURE, "utf8")) as { pages: PinnedPage[] };

/** The captured *css bar slot: the "customized classic skin" region's
 *  Xcss-bar-view slot div, bounded by tag matching (the region continues
 *  past the bar with the page's own closes). */
function capturedCssBarSlot(): string {
  const region = FIXTURE_DATA.pages.find((p) => p.name === "customized classic skin")!.expected;
  const start = region.indexOf('<div id="Xcss-bar-view"');
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (const match of region.slice(start).matchAll(/<div\b|<\/div>/g)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) {
      return region.slice(start, start + (match.index ?? 0) + match[0].length);
    }
  }
  throw new Error("capture's *css bar slot never closes");
}

/** The dumps normalize slot ids to RANDOMIZED; do the same to rendered
 *  bytes (both quote styles appear). */
function normalizeSlotIds(html: string): string {
  return html
    .replace(/data-slot-id="[^"]*"/g, 'data-slot-id="RANDOMIZED"')
    .replace(/data-slot-id='[^']*'/g, "data-slot-id='RANDOMIZED'");
}

/** The rendered *css bar slot from a nested render (the pointer-item nest
 *  context the capture recorded), bounded the same way. */
function renderedCssBarSlot(html: string): string {
  const start = html.indexOf('<div id="Xcss-bar-view"');
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (const match of html.slice(start).matchAll(/<div\b|<\/div>/g)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) {
      return html.slice(start, start + (match.index ?? 0) + match[0].length);
    }
  }
  throw new Error("render's *css bar slot never closes");
}

// Deck ids mirror the oracle's rows where the pinned bytes carry them
// (the sass-style suite's convention; CSS is 17435 in the oracle deck).
const T_SET = 1;
const T_LIST = 47;
const T_HTML = 5;
const T_ANYONE = 6;
const T_CARDTYPE = 7;
const T_SETTING = 8;
const T_CSS = 17435;
const T_SKIN = 17437;

let storage: RenderTestStorage | undefined;

beforeAll(async () => {
  // the oracle deck's bar template emits the slot id as its own
  // double-quoted attribute (the sass-style suite's same discipline)
  setHamlSlotStyle("separate");
  storage = await createRenderTestStorage();
  const s = storage;
  // ---- type cards ----
  await seedCard(s, { id: T_SET, name: "Set", codename: "set", typeId: T_CARDTYPE });
  await seedCard(s, { id: T_LIST, name: "List", codename: "list", typeId: T_CARDTYPE });
  await seedCard(s, { id: T_HTML, name: "HTML", codename: "html", typeId: T_CARDTYPE });
  await seedCard(s, { id: T_ANYONE, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: T_CARDTYPE, name: "Cardtype", codename: "cardtype" });
  await seedCard(s, { id: T_SETTING, name: "Setting", codename: "setting", typeId: T_CARDTYPE });
  await seedCard(s, { id: T_CSS, name: "CSS", codename: "css", typeId: T_CARDTYPE });
  await seedCard(s, { id: T_SKIN, name: "Skin", codename: "skin", typeId: T_CARDTYPE });
  // ---- settings (the layout the page arm renders through) ----
  await seedCard(s, { id: 20, name: "*read", codename: "read", typeId: T_SETTING });
  await seedCard(s, { id: 21, name: "*update", codename: "update", typeId: T_SETTING });
  await seedCard(s, { id: 42, name: "*layout", codename: "layout", typeId: T_SETTING });
  // *css (the audit's setting address; oracle pins id 198, CSS type).
  // No codename: the CSS CARDTYPE owns codename "css" (17435) in the real
  // deck - *css is a plain setting-shaped card typed CSS.
  await seedCard(s, { id: 198, name: "*css", typeId: T_CSS });
  // ---- the rule shape ----
  await seedCard(s, { id: 274, name: "*all", codename: "all", typeId: T_SET });
  // *all+*read -> [[Anyone]] (the deck's catch-all read rule)
  await seedCard(s, { id: 60, leftId: 274, rightId: 20, typeId: T_LIST, dbContent: "[[Anyone]]" });
  await seedReference(s, 60, T_ANYONE, "anyone");
  // *all+*update -> [[Anyone]]: the board view is update-gated, and the
  // real deck's signed-in viewers hold the update grant the advanced link
  // presumes
  await seedCard(s, { id: 65, leftId: 274, rightId: 21, typeId: T_LIST, dbContent: "[[Anyone]]" });
  await seedReference(s, 65, T_ANYONE, "anyone");
  // *all+*layout -> the probe layout (the page arm's chrome, the sass-style
  // suite's shape)
  await seedCard(s, { id: 62, leftId: 274, rightId: 42, typeId: T_SETTING, dbContent: "[[Sass Lane Layout]]" });
  await seedCard(s, {
    id: 63,
    name: "Sass Lane Layout",
    typeId: T_HTML,
    dbContent:
      '<article class="container flex-shrink-0" role="main">{{_main|titled}}</article>\n  <footer class="footer mt-auto py-3"></footer>',
  });
  // the skin whose pointer list carries the *css bar (the capture's own
  // nest context for it)
  await seedCard(s, {
    id: 17466,
    name: "customized classic skin",
    typeId: T_SKIN,
    dbContent: "[[*css]]",
  });
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
}, 60_000);

afterAll(() => {
  setHamlSlotStyle("hash");
  storage?.close();
});

describe("the *css setting address (enumeration gap 11)", () => {
  it("the capture carries the audit's evidence: the bar menu's four links, page and board among them", () => {
    const bar = capturedCssBarSlot();
    expect(bar).toContain('<a class="full-page-link known-card" href="/*css">');
    expect(bar).toContain('href="/*css?layout=modal"');
    expect(bar).toContain('href="/*css/edit"');
    expect(bar).toContain('<a rel="nofollow" class="board-link slotter" title="Advanced" data-bs-toggle="tooltip" data-bs-placement="bottom" data-slotter-mode="modal-replace" href="/*css/board"');
  });

  it("the captured *css bar stays the byte spec (the pointer-item nest the capture recorded)", async () => {
    const s = storage!;
    // the nested render: the skin's pointer list carries the bar with the
    // nest_name slot context the capture records
    const core = await s.engine.render("customized classic skin", "core");
    const ours = normalizeSlotIds(renderedCssBarSlot(core));
    const theirs = normalizeSlotIds(capturedCssBarSlot());
    expect(ours).toBe(theirs);
  });

  it("/*css answers: the page's main slot is the *css card with the captured identity set", async () => {
    const s = storage!;
    const page = await renderPageBytes(s.engine, "*css");
    const main = page.slice(page.indexOf('<div id="Xcss-titled-view"'));
    expect(main.startsWith(
      '<div id="Xcss-titled-view" class="card-slot titled-view ALL TYPE-css STAR SELF-Xcss"',
    )).toBe(true);
    expect(main).toContain('data-card-id="198"');
    expect(main).toContain('data-card-name="*css"');
    expect(main).toContain('data-card-type-id="17435"');
    expect(main).toContain('data-card-type-name="CSS"');
    expect(main).toContain('data-card-link-name="*css"');
  });

  it("/*css/board answers: the board modal carries the *css breadcrumb, slot identity and the edit link", async () => {
    const s = storage!;
    const board = await s.engine.render("*css", "board");
    // the board modal wrap (board.rb's full-size modal)
    expect(board.startsWith("<div class='modal fade _modal-slot' id='modal-container' role='dialog'>")).toBe(true);
    // the *css breadcrumb pair (the board header's breadcrumb_data)
    expect(board).toContain('<li class="breadcrumb-item">*css</li>');
    expect(board).toContain('<li class="breadcrumb-item active">Edit</li>');
    // the board slot with the captured identity set
    expect(board).toContain(
      '<div id="Xcss-board-view" class="card-slot board-view ALL TYPE-css STAR SELF-Xcss"',
    );
    expect(board).toContain('data-card-name="*css"');
    expect(board).toContain('data-card-type-id="17435"');
    // the board menu's edit link (switch_to_edit_link) is the same
    // /*css/edit address the bar menu carries
    expect(board).toContain('href="/*css/edit"');
  });
});
