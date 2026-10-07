// bar-slots lane (2026-09-29, view-fail classes V4 + V8).
//
// V4 — wikilink anchors must classify known/wanted from LIVE card existence
// (links.rb:140-144 add_known_or_wanted_class -> Card.known?, a live
// fetch), not from prepared-map luck. The a work item view-fail dump pins the
// class both ways:
//
// - Oracle KNOWN where the engine emitted wanted-card for EXISTING cards:
//   the *content options help popover's [[List]]/[[Pointer]]/[[Search]]
//   cardtype links (10 dump entries, e.g. 000000-_layout_right_content_
//   options-open) and card-body wikilinks to real deck cards (5 entries,
//   e.g. 000020-Anthony_Gonzales-content: [[Bluevolution]] known).
// - Oracle WANTED stays wanted: "People Green" has NO card in the deck —
//   sabrina mejias AND Anthony Gonzales both pin
//   `<a class="wanted-card" href="/People_Green">` on the ORACLE side, and
//   the engine's warm-map answer byte-matches today (format.ts R17 note).
//   The fix must flip existence-hits only, never absence.
//
// Ruby truth per anchor: `Card.known?(name)` = a live fetch (cache + DB),
// identical in a fresh process and a warm one. The port's defect: the
// known check reads ONLY the prepared render-card map, so a fresh-process
// render emits wanted-card for existing cards whose names no {{nest}}
// reference reaches (the instrument hazard the a work item doc measured:
// `Aikido Oak Cliff+discussion :open` flips when the map warms).
//
// V8 — the pointer core paginates at Ruby's default_limit 20
// (card-mod-list set/abstract/01_list/other_views.rb:3-5) with the
// view :paging nav whenever show_paging? holds (count > 20): 8 dump
// entries render exactly 20 items plus the nav where the engine rendered
// the full unpaginated list (e.g. 000034-Learning_Pool_training_Notes:
// expected 3,692B vs actual 6,913B — 27 pointer-items, no nav).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

const SET_TYPE_ID = 1;
const SETTING_TYPE_ID = 2;
const LIST_TYPE_ID = 3;
const POINTER_TYPE_ID = 4;
const SEARCH_TYPE_ID = 5;
const RICH_TYPE_ID = 6;

let storage: RenderTestStorage | undefined;

async function seedDeck(): Promise<void> {
  const s = storage!;
  // Cardtype cards whose codenames the codehash fold registers: the
  // *content options static help links [[List]] [[Pointer]] [[Search]].
  await seedCard(s, { id: 1, name: "Set", codename: "set", typeId: SET_TYPE_ID });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 3, name: "List", codename: "list", typeId: LIST_TYPE_ID });
  await seedCard(s, { id: 4, name: "Pointer", codename: "pointer", typeId: POINTER_TYPE_ID });
  await seedCard(s, { id: 5, name: "Search", codename: "search", typeId: SEARCH_TYPE_ID });
  await seedCard(s, { id: 6, name: "RichText", codename: "rich_text", typeId: RICH_TYPE_ID });
  // Read grant: *all+*read -> [[Anyone]] (the harness's readable deck).
  await seedCard(s, { id: 7, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: SET_TYPE_ID, dbContent: "{}" });
  await seedCard(s, { id: 20, name: "*read", codename: "read", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, typeId: LIST_TYPE_ID, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 7, "anyone");

  // --- static-help surface: a stored *right rule row for *content options.
  // Family+*right+*content options :open renders the card-menu popover
  // whose data-bs-content is registeredSettingHelpText(right: content_options)
  // — "Value options for [[List]] and [[Pointer]] and cards. Can itself be
  // a List or a [[Search]]. ..." (setting-help-text.ts, verbatim from
  // card-mod-list set/right/content_options.rb).
  await seedCard(s, { id: 21, name: "*right", codename: "right", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 22, name: "*content options", codename: "content_options", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 30, name: "Family", typeId: RICH_TYPE_ID, dbContent: "family body" });
  await seedCard(s, { id: 31, leftId: 30, rightId: 21, typeId: SET_TYPE_ID, dbContent: "{}" });
  await seedCard(s, {
    id: 32,
    leftId: 31,
    rightId: 22,
    typeId: SETTING_TYPE_ID,
    dbContent: '["List"]',
  });

  // --- body-wikilink surface: links to an existing card under BOTH the
  // stored casing and a case-differing authored form, plus a link to a
  // card that does not exist (the People Green corpus shape).
  await seedCard(s, { id: 40, name: "Roxanne Parker", typeId: RICH_TYPE_ID, dbContent: "person" });
  await seedCard(s, {
    id: 41,
    name: "Discussion Post",
    typeId: RICH_TYPE_ID,
    dbContent: "See [[Roxanne Parker]] and [[roxanne parker]] plus [[Nobody At All]].",
  });

  // --- pagination surface (view-fail class V8): a pointer holding 27 items
  // (oracle: Learning Pool+training+Notes, Martial Nonviolence+Pages,
  // *recent settings, AI+Replacement+Documents — all render 20 items plus
  // the paging nav) and a small pointer (the corpus:77 unpaginated pin).
  const bigItems = Array.from({ length: 27 }, (_, i) => `Page ${String(i + 1).padStart(2, "0")}`);
  await seedCard(s, {
    id: 60,
    name: "Big Pages",
    typeId: POINTER_TYPE_ID,
    dbContent: bigItems.join("\n"),
  });
  await seedCard(s, {
    id: 61,
    name: "Small Pages",
    typeId: POINTER_TYPE_ID,
    dbContent: "Alpha\nBeta\nGamma",
  });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("wikilink known/wanted class follows live card existence (links.rb:140-144)", () => {
  it("renders the *content options static help's cardtype links known-card", async () => {
    // Oracle 000000-_layout_right_content_options-open: the popover body is
    // HTML-escaped inside data-bs-content; every cardtype anchor carries
    // class="known-card" with the display-case href.
    const html = await storage!.engine.render("Family+*right+*content options", "open");
    for (const cardtype of ["List", "Pointer", "Search"]) {
      expect(
        html.includes(`class=&quot;known-card&quot; href=&quot;/${cardtype}&quot;`),
        `help popover anchor to /${cardtype} must be known-card`,
      ).toBe(true);
      expect(
        html.includes(`class=&quot;wanted-card&quot; href=&quot;/${cardtype}&quot;`),
        `help popover anchor to /${cardtype} must not be wanted-card`,
      ).toBe(false);
    }
  });

  it("renders body wikilinks to an existing card known-card with the stored name's href", async () => {
    // Oracle 000020-Anthony_Gonzales-content: [[Bluevolution]] known. The
    // authored casing never leaks into the href (corpus scan: every
    // case-differing known-card anchor hrefs the REAL name,
    // [[narrative]] -> /Narrative); the label/title keep the authored form.
    const html = await storage!.engine.render("Discussion Post", "content");
    expect(
      (html.match(/<a class="known-card" href="\/Roxanne_Parker">/g) ?? []).length,
      "both casings of the [[Roxanne Parker]] link must be known-card with the stored-name href",
    ).toBe(2);
    // The lowercase-authored link keeps its authored label/title bytes.
    expect(html.includes('title="roxanne parker">roxanne parker</span>')).toBe(true);
  });

  it("keeps wanted-card for links to cards that do not exist", async () => {
    // Oracle pins (sabrina mejias + Anthony Gonzales): "People Green" has
    // no card — the anchor stays wanted-card on BOTH sides. The existence
    // fix must not flip absence.
    const html = await storage!.engine.render("Discussion Post", "content");
    expect(html.includes('<a class="wanted-card" href="/Nobody_At_All">')).toBe(true);
    expect(html.includes('<a class="known-card" href="/Nobody_At_All">')).toBe(false);
  });
});

describe("pointer core paginates at Ruby's default limit 20 (paging_views.rb show_paging?)", () => {
  it("renders 20 items plus the paging nav for a 27-item pointer", async () => {
    // Oracle phase-017 000034-Learning_Pool_training_Notes-content: 20
    // pointer-item divs, then with_paging's output-join "\n" and the
    // view :paging nav — « div (nil-page form), active page 1, page 2,
    // » anchor with aria-label first, the context "1 - 20 of 27".
    const html = await storage!.engine.render("Big Pages", "content");
    expect((html.match(/<div class="pointer-item item-bar">/g) ?? []).length).toBe(20);
    expect(
      html.includes(
        '<li class="page-item"><div class="page-link"><span aria-hidden="true">&laquo;</span></div></li>' +
          '<li class="page-item active"><a class="card-paging-link slotter page-link"' +
          ' href="/Big_Pages?limit=20&amp;offset=0" data-remote="true">1</a></li>' +
          '<li class="page-item"><a class="card-paging-link slotter page-link"' +
          ' href="/Big_Pages?limit=20&amp;offset=20" data-remote="true">2</a></li>' +
          '<li class="page-item"><a aria-label="Next" class="card-paging-link slotter page-link"' +
          ' href="/Big_Pages?limit=20&amp;offset=20" data-remote="true">' +
          '<span aria-hidden="true">&raquo;</span></a></li>',
      ),
    ).toBe(true);
    expect(html.includes("<div class='paging-context'>\n1\n-\n20\nof\n27\n</div>")).toBe(true);
    // The nav follows the card-list close through the output-join newline
    // and keeps the slot-close newline after </nav>.
    expect(html.includes("</div>\n<nav class='nav justify-content-between align-items-center'>")).toBe(true);
    expect(html.includes("</nav>\n</div>")).toBe(true);
  });

  it("leaves pointers at or under the limit unpaginated", async () => {
    // corpus:77 pin (the famfix48 trailing-newline family): a pointer at
    // 3 items renders NO nav and the card-list wrapper keeps its trailing
    // newline before the slot close.
    const html = await storage!.engine.render("Small Pages", "content");
    expect(html.includes("pagination paging")).toBe(false);
    expect((html.match(/<div class="pointer-item item-bar">/g) ?? []).length).toBe(3);
  });
});
