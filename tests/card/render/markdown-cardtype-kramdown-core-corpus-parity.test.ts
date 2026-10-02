// Markdown cardtype kramdown core — corpus parity through the LOADER-LESS
// render engine (the corpus judge's world: verify-dual-lane.test.ts binds no
// mod loader, so the card-mod-markdown set-module `view :core` override never
// dispatches and coreViewBase fell through to the raw-content passthrough,
// emitting the markdown SOURCE where the oracle kramdowns it).
//
// Corpus population (tmp/raw-ground-truth/expected-v2/view-lane/, 6588 rows):
// exactly 4 rows carry type_code "markdown", 8 of their 11 captured views
// render kramdown bytes (:content + :open per card; :closed is bar-only).
// Every byte this file pins is copied verbatim from those captured oracle
// views (the raw ground-truth dumps this lane was sized from):
//
//   *all+*guide            45414  shard-000039  (the lane exemplar)
//   Cardtype+*type+*guide  38250  shard-000032
//   *structure+*right+*guide 38251 shard-000032
//   Administrator+Dashboard 34817 shard-000032  (only its kramdown-owned
//                                                stash-wrap shape is pinned
//                                                here, via a synthetic nest;
//                                                its `{{_L|configs}}` nest
//                                                needs the admin configs
//                                                view, a different mechanism)
//
// Ruby path (pinned from the installed gems):
//   card-mod-markdown-0.20.0 set/type/markdown.rb:6-13
//     view :core do
//       safe_process_content { |content|
//         Kramdown::Document.new(content, syntax_highlighter: :coderay,
//           syntax_highlighter_opts: { line_numbers: false, default_lang: :ruby }
//         ).to_html }
//     end
//   (card-1.110.0 lib/card/format/content.rb:12-17 safe_process_content:
//    stash nests/links as {{<i>}} references, kramdown the literal
//    remainder, restore, process_content)
//
// Library-vs-handroll decision: the kramdown conversion is the EXISTING
// hand-rolled converter (src/card/render/kramdown.ts, extracted from the
// markdown mod 2026-09-27, byte-verified against the real local gems
// kramdown-2.5.2 + kramdown-syntax-coderay-1.0.1 + coderay-1.1.3). No
// markdown library was evaluated as a replacement because the byte tests
// below (and the mod's existing oracle corpus) are matched by the handroll,
// and kramdown's decko-specific composition (the references stash feeding
// decko's own nest/link chunk passes) has no library shape. The decision
// this lane adds: the handroll is SUFFICIENT for every corpus-exercised
// construct (ATX header + auto id, paragraphs, strong/em, tight ordered
// list, smart quotes/apostrophes, ellipsis, wikilink/external/internal
// links, nest stash), so the fix is the DISPATCH, not the converter.

import { describe, expect, it } from "vitest";
import { createRenderTestStorage, seedCard, type RenderTestStorage } from "./render-test-storage.js";

// ---------------------------------------------------------------------------
// oracle bytes (verbatim from tmp/raw-ground-truth/expected-v2/view-lane/)
// ---------------------------------------------------------------------------

/** *all+*guide dbContent (corpus row 45414, shard-000039). */
const ALL_GUIDE_CONTENT =
  "#### Editing Guide\n\n" +
  "This default guide will appear in the full editor view of any card \n" +
  "without more specific guidance.  You can use it to put forward principles of style, \n" +
  "rules of conduct, or any other help text you think may be of use to persons editing \n" +
  "content.\n\n" +
  "Guide content can be edited in [[*guide|*guide rules]].\n";

/** *all+*guide :content inner core bytes — the captured oracle view minus the
 *  content-slot wrap (slotWrapCommon div), extracted verbatim from the
 *  capture (444 bytes). THE lane exemplar's deliverable bytes. */
const ALL_GUIDE_CORE =
  '<h4 id="editing-guide">Editing Guide</h4>\n\n' +
  "<p>This default guide will appear in the full editor view of any card \n" +
  "without more specific guidance.  You can use it to put forward principles of style, \n" +
  "rules of conduct, or any other help text you think may be of use to persons editing \n" +
  "content.</p>\n\n" +
  '<p>Guide content can be edited in <a class="known-card" href="/*guide">' +
  '<span class="card-title" title="*guide rules">*guide rules</span></a>.</p>\n';

/** Cardtype+*type+*guide dbContent (corpus row 38250, shard-000032) — the
 *  construct-richest markdown card: strong/em, tight ordered list, smart
 *  quotes/apostrophes, ellipsis, wikilinks with labels, an internal path
 *  link, an escaped-braces literal, and a nest. */
const CARDTYPE_GUIDE_CONTENT =
  "Every Decko card has one and only one __type__.\n\n" +
  "[[RichText]], [[List]], [[Image]], [[Search]], [[JavaScript]], [[User]]... All of these are types. \n" +
  "To see a given card's type, click its ellipses icon ({{\\_|board_link}})\n" +
  'to go to the card dashboard (or "cardboard").\n\n' +
  "Types are defined with [[Cardtype]] cards. For example, the Cardtype card named [[Image]] defines the image\n" +
  "type. You can create a new type by creating a [[/new/Cardtype|new Cardtype]] card.\n\n" +
  "Types are a core tool for organizing cards. To decide whether you need\n" +
  "a new type for a group of cards, consider whether you want to:\n\n" +
  "1. ...think up a name for each card?\n" +
  "2. ...create a patterned structure for the group?\n\n" +
  "As a rule of thumb, if the answer to both is yes, you probably want a new type. There are exceptions, of\n" +
  "course: [[\\*autoname|autonaming]], casual [[\\*structure|structures]], etc.\n\n" +
  "By convention, Cardtype names are usually singular, capitalized nouns. \n\n" +
  'To configure the structure for a Cardtype,  click the "Configure" button on a Cardtype cards or edit\n' +
  "the type's structure rule in the cardboard of _either_ the Cardtype card _or_ of any of the cards of that type.\n\n" +
  "A Cardtype card cannot be deleted as long as there are instances of that type.";

/** *structure+*right+*guide dbContent (corpus row 38251, shard-000032) —
 *  external URL links (target=_blank class=external-link), smart
 *  apostrophes/quotes, and the escaped-braces literal. */
const STRUCTURE_GUIDE_CONTENT =
  "[[*structure]] rules govern the type and content of cards in a given set. The content of\n" +
  "every card in the set is a copy of the structure rule's content.\n\n" +
  "You can create powerful card structures using [[http://decko.org/contextual_names|contextual names]].\n" +
  'Suppose a structure rule for City cards nests a card named "+Country". This establishes a pattern in\n' +
  'which every City has a Country field.  For example, the City card "Moscow" would nest a field card\n' +
  'named "Moscow+Country" with the content "Russia". and the card "Berlin+Country" could contain "Germany.\n\n' +
  "Nests are easy to create and manage using the nest editor, which can be opened using the curly bracket\n" +
  "icon (\\{{}}). This tool will help you create and configure nested fields, both through nest syntax \n" +
  "options (which only apply to the fields when presented within the structure) and through rules \n" +
  "(which apply in any context).";

/** The names the guide bodies' wiki links target. fetchRenderCard is
 *  CACHE-ONLY (render.ts:1994 - "returns undefined for anything the
 *  prefetch did not prepare"; the prefetch closure chases nest-syntax
 *  references and junction parts, not plain-text links), so a synthetic
 *  deck warms each link target through the engine's own on-demand hook -
 *  the corpus judge's whole-deck seeding does this implicitly for every
 *  row. */
const LINK_TARGETS = [
  "RichText",
  "List",
  "Image",
  "Search",
  "JavaScript",
  "User",
  "Cardtype",
  "*guide",
  "*structure",
  "*autoname",
];

async function seedMarkdownDeck(storage: RenderTestStorage): Promise<void> {
  // cardtype cards
  await seedCard(storage, { id: 2, name: "RichText", codename: "basic", typeId: 2 });
  await seedCard(storage, { id: 90, name: "Markdown", codename: "markdown", typeId: 2 });
  // cards the guide bodies link to (the link pass renders known-card only
  // for existing targets)
  await seedCard(storage, { id: 91, name: "List", typeId: 2 });
  await seedCard(storage, { id: 92, name: "Image", typeId: 2 });
  await seedCard(storage, { id: 93, name: "Search", typeId: 2 });
  await seedCard(storage, { id: 94, name: "JavaScript", typeId: 2 });
  await seedCard(storage, { id: 95, name: "User", typeId: 2 });
  await seedCard(storage, { id: 96, name: "Cardtype", typeId: 2 });
  await seedCard(storage, { id: 550, name: "*guide", codename: "guide", typeId: 2 });
  await seedCard(storage, { id: 551, name: "*structure", codename: "structure", typeId: 2 });
  await seedCard(storage, { id: 552, name: "*autoname", codename: "autoname", typeId: 2 });
  await seedCard(storage, { id: 553, name: "*type", codename: "type", typeId: 2 });
  await seedCard(storage, { id: 554, name: "*right", codename: "right", typeId: 2 });
  await seedCard(storage, { id: 274, name: "*all", codename: "all", typeId: 2 });
  // the 3-part junctions' left trunks (a junction's left_id points at its
  // own trunk card)
  await seedCard(storage, {
    id: 38249,
    name: "Cardtype+*type",
    typeId: 2,
    leftId: 96,
    rightId: 553,
  });
  await seedCard(storage, {
    id: 38252,
    name: "*structure+*right",
    typeId: 2,
    leftId: 551,
    rightId: 554,
  });
  // the corpus markdown cards, as junctions matching the corpus rows
  await seedCard(storage, {
    id: 45414,
    name: "*all+*guide",
    typeId: 90,
    leftId: 274,
    rightId: 550,
    dbContent: ALL_GUIDE_CONTENT,
  });
  await seedCard(storage, {
    id: 38250,
    name: "Cardtype+*type+*guide",
    typeId: 90,
    leftId: 38249,
    rightId: 550,
    dbContent: CARDTYPE_GUIDE_CONTENT,
  });
  await seedCard(storage, {
    id: 38251,
    name: "*structure+*right+*guide",
    typeId: 90,
    leftId: 38252,
    rightId: 550,
    dbContent: STRUCTURE_GUIDE_CONTENT,
  });
  // warm the wiki-link targets into the render cache (the corpus judge's
  // whole-deck seeding does this implicitly; see LINK_TARGETS above)
  for (const target of LINK_TARGETS) {
    await storage.engine.prepareItemForRender(target);
  }
}

// ---------------------------------------------------------------------------
// the loader-less :core dispatch (the corpus judge's world)
// ---------------------------------------------------------------------------

describe("Markdown-type cards kramdown through the loader-less core (corpus parity)", () => {
  it("*all+*guide :core renders the captured oracle kramdown bytes verbatim", async () => {
    // THE lane exemplar (expected-v2/view-lane/recapture-raw-shard-000039,
    // *all+*guide :content inner). Before the dispatch fix the engine fell
    // through to the raw passthrough and these bytes came out as the
    // markdown source ("#### Editing Guide", no <p> wrappers).
    const storage = await createRenderTestStorage();
    try {
      await seedMarkdownDeck(storage);
      const core = await storage.engine.render("*all+*guide", "core");
      expect(core).toBe(ALL_GUIDE_CORE);
    } finally {
      storage.close();
    }
  });

  it("*all+*guide :open carries the kramdown bytes inside the accordion body", async () => {
    // The open view's accordion-body delegates to bar_bottom -> content ->
    // core, so the same kramdown bytes must appear inside the bar. (The
    // bar's menu/help region is other lanes' surface; this pins only the
    // body bytes.)
    const storage = await createRenderTestStorage();
    try {
      await seedMarkdownDeck(storage);
      const open = await storage.engine.render("*all+*guide", "open");
      expect(open).toContain(ALL_GUIDE_CORE);
      expect(open).not.toContain("#### Editing Guide");
    } finally {
      storage.close();
    }
  });

  it("Cardtype+*type+*guide :core matches the captured construct bytes", async () => {
    // Byte regions copied from the captured content view
    // (expected-v2/view-lane/recapture-raw-shard-000032, row 38250). The
    // {{\_|board_link}} nest region is a permission/machine surface, not a
    // markdown surface, so the pins skip it.
    const storage = await createRenderTestStorage();
    try {
      await seedMarkdownDeck(storage);
      const core = await storage.engine.render("Cardtype+*type+*guide", "core");
      // __type__ -> <strong>type</strong> (the raw source never leaks)
      expect(core).toContain(
        "<p>Every Decko card has one and only one <strong>type</strong>.</p>",
      );
      expect(core).not.toContain("__type__");
      expect(core).not.toContain("[[RichText]]");
      // wikilinks render known-card anchors with card-title spans
      expect(core).toContain(
        '<a class="known-card" href="/RichText"><span class="card-title" title="RichText">RichText</span></a>',
      );
      // "..." -> the ellipsis character, straight quotes -> curly
      expect(core).toContain("</a>\u2026 All of these are types.");
      expect(core).toContain('(or \u201ccardboard\u201d)');
      // path-form link target -> internal-link class
      expect(core).toContain('<a class="internal-link" href="/new/Cardtype">new Cardtype</a>');
      // the tight ordered list (kramdown's transparent-li shape)
      expect(core).toContain(
        "<ol>\n  <li>\u2026think up a name for each card?</li>\n" +
          "  <li>\u2026create a patterned structure for the group?</li>\n</ol>",
      );
      // escaped star in link names; label form [[*autoname|autonaming]]
      expect(core).toContain(
        '<a class="known-card" href="/*autoname"><span class="card-title" title="autonaming">autonaming</span></a>',
      );
      expect(core).toContain(
        '<a class="known-card" href="/*structure"><span class="card-title" title="structures">structures</span></a>',
      );
      // _either_ / _or_ -> <em>
      expect(core).toContain("of <em>either</em> the Cardtype card <em>or</em> of any");
      expect(core).not.toContain("_either_");
      // paragraphs close with the captured bytes
      expect(core).toContain(
        "<p>A Cardtype card cannot be deleted as long as there are instances of that type.</p>",
      );
    } finally {
      storage.close();
    }
  });

  it("*structure+*right+*guide :core matches the captured construct bytes", async () => {
    // Byte regions copied from the captured content view
    // (expected-v2/view-lane/recapture-raw-shard-000032, row 38251).
    const storage = await createRenderTestStorage();
    try {
      await seedMarkdownDeck(storage);
      const core = await storage.engine.render("*structure+*right+*guide", "core");
      // [[*structure]] wikilink (known-card; the raw source never leaks)
      expect(core).toContain(
        '<a class="known-card" href="/*structure"><span class="card-title" title="*structure">*structure</span></a>' +
          " rules govern",
      );
      expect(core).not.toContain("[[*structure]]");
      // URL-form link target -> external-link class + target="_blank"
      // (attribute order is the captured link-pass order: target first)
      expect(core).toContain(
        '<a target="_blank" class="external-link" href="http://decko.org/contextual_names">contextual names</a>',
      );
      // straight apostrophe/quotes -> kramdown's smart quotes
      expect(core).toContain("the structure rule\u2019s content.");
      expect(core).toContain('named \u201cMoscow+Country\u201d');
      // the escaped-braces literal survives as literal braces
      expect(core).toContain("icon ({{}})");
      // paragraphs close with the captured bytes
      expect(core).toContain("(which apply in any context).</p>");
    } finally {
      storage.close();
    }
  });

  it("a nest inside markdown content is stashed: kramdown wraps the expansion in <p>", async () => {
    // Administrator+Dashboard's kramdown-owned byte shape (its captured
    // content view opens "<p><p><h3>Configurations</h3>...": the FIRST <p>
    // is kramdown wrapping the stashed {{0}} reference placeholder, the
    // expansion landing inside it). The card's own {{_L|configs}} nest needs
    // the admin configs view (a different mechanism, not pinned here); this
    // synthetic pins the stash-wrap bytes with a resolvable nest.
    const storage = await createRenderTestStorage();
    try {
      await seedMarkdownDeck(storage);
      await seedCard(storage, {
        id: 300,
        name: "nested config",
        typeId: 2,
        dbContent: "CONFIGS-BODY-BYTES",
      });
      await seedCard(storage, {
        id: 301,
        name: "dashboard probe",
        typeId: 90,
        dbContent: "{{nested config|content}}\n",
      });
      const core = await storage.engine.render("dashboard probe", "core");
      // the placeholder is kramdowned INSIDE a paragraph, then unstashed
      // (safeKey keeps the name's underscore: "nested config" ->
      // "nested_config")
      expect(core.startsWith('<p><div id="nested_config-content-view"')).toBe(true);
      expect(core.endsWith("</div></p>\n")).toBe(true);
      expect(core).toContain("CONFIGS-BODY-BYTES");
    } finally {
      storage.close();
    }
  });
});
