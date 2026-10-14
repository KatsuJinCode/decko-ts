// The card-mod-search mod loader test: the mod loaded through the loader
// registers its seven ported views (count, search_count, search_error,
// one_line_content, goto_autocomplete_item, add_autocomplete_item,
// select2_option) and each view proves its Ruby-source semantics against
// seeded search decks.
//
// Proof shape (A/B per ported view):
//   WITHOUT the mod: render the view raises the unsupported-view error
//     (render.rb#view_method - the view does not exist on the live registry).
//   WITH the mod: the view renders the port's documented bytes; the
//     set-modules basket records the ported gem-tree entries; view
//     registration order matches the gem's pattern walk.
//
// The count/search_count/search_error views read the mod's prepareEngine
// count warm (card-mod-search.ts prepareSearchCounts - the boot-time
// Rule::Cache analog of 0_search.rb:35-39's lazy count search). Ruby
// computes the count per render; the port pre-executes every Search-typed
// card's count once per engine, recording rescued-BadQuery messages in a
// failure channel (0_search.rb:66-77 rescuing_bad_query RETURNS the
// exception, so search_count renders its message and search_error renders
// class :: message :: content). STATE: the warm maps are module-level,
// last-warm-wins - the big-deck test below therefore runs LAST and uses its
// own storage + engine so its warm does not clobber the main deck's counts
// mid-suite.
//
// Probe deck A (main storage):
//   - id 2 "Basic" (the items' type card), id 5 "Cardtype", id 200 "Search"
//     (type card for search cards, codename "search_type" - the codename
//     registry's SearchTypeID source)
//   - id 301 "A Search" (Search-typed, cql {"type":"Basic"}) with items
//     id 401-403 "Item One/Two/Three" (Basic)
//   - id 302 "Counting Search" (cql {"type":"Basic","return":"count"})
//   - id 303 "A Search+Outer" (junction: found_by "_left" -> A Search's cql)
//   - id 305 "A Search+Size" (found_by "_left" + return "count")
//   - id 307 "Empty Search" (cql matching nothing)
//   - id 308 "Item One+Bad Found" (found_by "_left" with a NON-search left -
//     found_by.rb:23-25 invalid_found_by_card!)
//
// Of the gem's eighteen missing html views (compat-report
// metrics.htmlViewsMissingNames for card-mod-search-0.20.0), seven are
// ported here; the other eleven are not headlessly portable (csv/rss
// formats, json core machinery, request-term params, subformat wrap bytes)
// - each documented with its reason in card-mod-search.ts and reported in
// viewsMissing.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { RenderFormat, UnsupportedViewError } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
  setDefaultModLoader,
} from "../../../src/card/mod-loader.js";
import cardModSearch from "../../../src/card/mod-loader/mods/card-mod-search.js";
import cardModCollection from "../../../src/card/mod-loader/mods/card-mod-collection.js";

let storage: RenderTestStorage | undefined;
let bigStorage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let bigLoader: ModLoader | undefined;
let loadReport: ReturnType<ModLoader["load"]> | undefined;

/** The stock read substrate's own Set card and its plain codename cards
 *  (Set, *read, Anyone, Anonymous and the *all+*read rule junction) are
 *  Codename-typed — a Set whose members are Codename, so its rows are NOT
 *  Set-typed. This deck's Basic is that Codename (the suite's Cardtype-typed
 *  rows play the Cardtype role here), so a type query reads them the way
 *  Ruby reads a Codename set's rows — and a `{"type": <this deck's
 *  Codename>}` count stays Ruby-correct even though it counts the substrate
 *  rows as well as the deck's own. seedCard's default type is id 2, which is
 *  that card here; naming it (PLAIN_TYPE_ID) keeps the deck honest about it
 *  rather than leaning on the default. */
const PLAIN_TYPE_ID = 2;

/** Every card row here carries the catch-all read rule the deck's
 *  `*all+*read -> [[Anyone]]` grants, the DATA side of the read rule (a
 *  stored cards.read_rule_id + read_rule_class). Ruby stamps it on save via
 *  the set_read_rule store event (card-mod-permissions
 *  set/all/permissions.rb:1-5) and it is what two paths read:
 *    - the HTML permission check (permissions.rb:139-146: ok_to_read? is
 *      `read_rules_hash[read_rule_id]`), and
 *    - the CQL relation-level filter every search rides (card-1.110.0
 *      set/all/permissions.rb Where#permission_conditions: `read_rule_id
 *      IN (viewer's readable rule ids)`, ported at src/cql/sql.ts:277-293
 *      implicitConditions). A row WITHOUT the stored id has read_rule_id
 *      NULL and is filtered out of every search result for every viewer
 *      (render.ts cqlPermissionOptions: "there is no rule-less allowance
 *      here, and there never should have been one"), so an unstamped result
 *      row is invisible to the engine-side search while the mod's count warm
 *      (which runs with always_ok? true) still counts it. A real deck stores
 *      the id on every row; the deck below does the same.
 *
 *  Returns the catch-all rule card's id, the value readRuleId takes. A deck
 *  that brought its own `*all`/`*read` (which takes the codenames over from
 *  the stock substrate and moves the stock rule onto its sides) answers its
 *  own catch-all rule here; the suite brings neither, so the stock rule id
 *  stands. */
async function stampCatchAllReadRule(s: RenderTestStorage): Promise<number> {
  const ruleId = s.bootstrapRule;
  if (ruleId === undefined) {
    throw new Error(
      "card-mod-search: the stock read substrate's *all+*read rule is required; " +
        "build this deck with createRenderTestStorage() (default bootstrapReadRules)",
    );
  }
  return ruleId;
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  const CATCH_ALL = await stampCatchAllReadRule(s);
  // every seeded row below carries this pair: typeId 5 (Cardtype) where the
  // row is a plain type card, and the catch-all read rule.
  //
  // TYPE IDS NAMED EXPLICITLY. seedCard's default type is id 2 — this deck's
  // Basic card — so a Cardtype-typed row left on the default would be picked
  // up by the `{"type":"Basic"}` searches (Counting Search, Big Search) and
  // inflate their counts.
  // type/codename cards (id 5 self-typed so it stays OUT of Basic matches)
  await seedCard(s, { id: 5, name: "Cardtype", typeId: 5, readRuleId: CATCH_ALL, readRuleClass: "*all" });
  await seedCard(s, { id: 2, name: "Basic", typeId: 5, readRuleId: CATCH_ALL, readRuleClass: "*all" });
  // the Search cardtype card: codename search_type = the SearchTypeID source
  await seedCard(s, { id: 200, name: "Search", codename: "search_type", typeId: 5, readRuleId: CATCH_ALL, readRuleClass: "*all" });

  // search cards (typeId 200 -> typeName "Search"); A Search's cql uses a
  // name-in list (key comparison - resolvable by BOTH the mod's count warm
  // and the engine's executeSearch, which only resolves names inside its
  // prefetch closure)
  await seedCard(s, {
    id: 301,
    name: "A Search",
    typeId: 200,
    dbContent: '{"name":["in","Item One","Item Two","Item Three"]}',
    readRuleId: CATCH_ALL,
    readRuleClass: "*all",
  });
  await seedCard(s, {
    id: 302,
    name: "Counting Search",
    typeId: 200,
    dbContent: '{"type":"Basic","return":"count"}',
    readRuleId: CATCH_ALL,
    readRuleClass: "*all",
  });
  // junctions: "A Search+Outer" (found_by _left), "A Search+Size"
  // (found_by _left + return count)
  await seedCard(s, { id: 304, name: "Outer", typeId: 5, readRuleId: CATCH_ALL, readRuleClass: "*all" });
  await seedCard(s, {
    id: 303,
    leftId: 301,
    rightId: 304,
    typeId: 200,
    dbContent: '{"found_by":"_left"}',
    readRuleId: CATCH_ALL,
    readRuleClass: "*all",
  });
  await seedCard(s, { id: 306, name: "Size", typeId: 5, readRuleId: CATCH_ALL, readRuleClass: "*all" });
  await seedCard(s, {
    id: 305,
    leftId: 301,
    rightId: 306,
    typeId: 200,
    dbContent: '{"found_by":"_left","return":"count"}',
    readRuleId: CATCH_ALL,
    readRuleClass: "*all",
  });
  // empty search (matches nothing)
  await seedCard(s, {
    id: 307,
    name: "Empty Search",
    typeId: 200,
    dbContent: '{"type":"No Such Type"}',
    readRuleId: CATCH_ALL,
    readRuleClass: "*all",
  });
  // found_by whose left is NOT a search card -> BadQuery at the warm
  await seedCard(s, { id: 309, name: "Bad Found", typeId: 5, readRuleId: CATCH_ALL, readRuleClass: "*all" });
  await seedCard(s, {
    id: 308,
    leftId: 401,
    rightId: 309,
    typeId: 200,
    dbContent: '{"found_by":"_left"}',
    readRuleId: CATCH_ALL,
    readRuleClass: "*all",
  });

  // the search results (Basic items)
  await seedCard(s, { id: 401, name: "Item One", typeId: PLAIN_TYPE_ID, dbContent: "one body", readRuleId: CATCH_ALL, readRuleClass: "*all" });
  await seedCard(s, { id: 402, name: "Item Two", typeId: PLAIN_TYPE_ID, dbContent: "two body", readRuleId: CATCH_ALL, readRuleClass: "*all" });
  await seedCard(s, { id: 403, name: "Item Three", typeId: PLAIN_TYPE_ID, dbContent: "three body", readRuleId: CATCH_ALL, readRuleClass: "*all" });

  // the big deck for the number_with_delimiter grouping (storage B)
  bigStorage = await createRenderTestStorage();
  const b = bigStorage;
  const B_CATCH_ALL = await stampCatchAllReadRule(b);
  await seedCard(b, { id: 5, name: "Cardtype", typeId: 5, readRuleId: B_CATCH_ALL, readRuleClass: "*all" });
  await seedCard(b, { id: 2, name: "Basic", typeId: 5, readRuleId: B_CATCH_ALL, readRuleClass: "*all" });
  await seedCard(b, { id: 200, name: "Search", codename: "search_type", typeId: 5, readRuleId: B_CATCH_ALL, readRuleClass: "*all" });
  await seedCard(b, {
    id: 501,
    name: "Big Search",
    typeId: 200,
    dbContent: '{"type":"Basic"}',
    readRuleId: B_CATCH_ALL,
    readRuleClass: "*all",
  });
  // 1001 Basic rows in bulk INSERTs (500 per statement)
  for (let chunkStart = 0; chunkStart < 1001; chunkStart += 500) {
    const values: string[] = [];
    const params: unknown[] = [];
    for (let i = chunkStart; i < Math.min(chunkStart + 500, 1001); i++) {
      values.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      params.push(600 + i, `Bulk Item ${i}`, `bulk_item_${i}`, PLAIN_TYPE_ID, 0, 1, 1,
        "2026-09-19 00:00:00.000", "2026-09-19 00:00:00.000", B_CATCH_ALL, "*all");
    }
    await b.counting.query(
      `INSERT INTO cards (id, name, key, type_id, trash, creator_id, updater_id, created_at, updated_at, read_rule_id, read_rule_class)
       VALUES ${values.join(", ")}`,
      params,
    );
  }
}, 60_000);

afterAll(() => {
  setDefaultModLoader(undefined);
  loader?.reset();
  bigLoader?.reset();
  storage?.close();
  bigStorage?.close();
});

describe("card-mod-search through the mod loader (A/B)", () => {
  it("WITHOUT the mod: every ported view raises UnsupportedViewError", async () => {
    const s = storage!;
    await expect(s.engine.render("A Search", "count")).rejects.toThrow(
      UnsupportedViewError,
    );
    await expect(s.engine.render("A Search", "search_count")).rejects.toThrow(
      UnsupportedViewError,
    );
    await expect(s.engine.render("A Search", "search_error")).rejects.toThrow(
      UnsupportedViewError,
    );
    await expect(s.engine.render("A Search", "one_line_content")).rejects.toThrow(
      UnsupportedViewError,
    );
    await expect(s.engine.render("Item One", "goto_autocomplete_item")).rejects.toThrow(
      UnsupportedViewError,
    );
    await expect(s.engine.render("Item One", "select2_option")).rejects.toThrow(
      UnsupportedViewError,
    );
  });

  it("WITH the mod: :count renders the warmed search count (set/abstract/0_search.rb:86 -> collection item.rb:180-182)", async () => {
    const s = storage!;
    loader = new ModLoader([{ manifest: cardModSearch }]);
    loadReport = loader.load();
    bindModLoaderToEngine(storage!, loader!);
    await loader.installInto(modEngineHost(s.engine, s.fetcher));

    // A Search's cql name-in list matches the three item cards
    const html = await s.engine.render("A Search", "count");
    expect(html).toBe("3");
  });

  it("WITH the mod: :count on a count-returning cql renders the same digits (0_search.rb:35-39 count forces return count)", async () => {
    const s = storage!;
    const html = await s.engine.render("Counting Search", "count");
    // Eight, and the Ruby-correct count of this deck: the three Basic items
    // PLUS the five stock-substrate rows that are Codename-typed, where this
    // deck's Basic is that Codename (see PLAIN_TYPE_ID). `{"type":"Basic"}`
    // selects every row typed by the Basic card (real.yml:17: the Basic TYPE
    // card whose cards are its members' types); a Codename set's own rows
    // are Codename-typed, and Basic IS this deck's Codename, so the Set
    // card itself (10_000_002), its members *read (10_000_003), Anyone
    // (10_000_004), Anonymous (10_000_005) and the *all+*read rule junction
    // (10_000_006) match as well. Before the stock read substrate this deck
    // held only the three items, hence 3.
    expect(html).toBe("8");
  });

  it("WITH the mod: :count through found_by '_left' resolves the left search card's count (found_by.rb:7-19)", async () => {
    const s = storage!;
    const html = await s.engine.render("A Search+Outer", "count");
    expect(html).toBe("3");
  });

  it("WITH the mod: :count on a found_by card whose left is not a Search card raises the Ruby BadQuery message (found_by.rb:23-25)", async () => {
    const s = storage!;
    await expect(s.engine.render("Item One+Bad Found", "count")).rejects.toThrow(
      /"found_by" value must be valid Search/,
    );
  });

  it("WITH the mod: :search_count renders the Integer branch for count-returning cql (0_search/views.rb:2-4)", async () => {
    const s = storage!;
    // Integer#to_s - no delimiter (the count view's html delimiter is
    // collection item.rb's, not this view's). The digits are Counting
    // Search's count — eight on this deck, for the reason the :count test
    // above gives (the substrate's Codename-typed rows are typed by this
    // deck's Codename, Basic).
    expect(await s.engine.render("Counting Search", "search_count")).toBe("8");
  });

  it("WITH the mod: :search_count through found_by '_left' + return count renders the left card's count (views.rb:2-4)", async () => {
    const s = storage!;
    expect(await s.engine.render("A Search+Size", "search_count")).toBe("3");
  });

  it("WITH the mod: :search_count on a plain (non-count) cql refuses the ActiveRecord-inspect branch (views.rb:2-4 Array#to_s)", async () => {
    const s = storage!;
    await expect(s.engine.render("A Search", "search_count")).rejects.toThrow(
      /ActiveRecord#inspect/,
    );
  });

  it("WITH the mod: :search_count on an EMPTY result list renders '[]' (Array#to_s of [] - no objects to inspect)", async () => {
    const s = storage!;
    // the warm's count of 0 is exactly the empty result list; Ruby's
    // [].to_s == "[]" byte-for-byte
    expect(await s.engine.render("Empty Search", "search_count")).toBe("[]");
  });

  it("WITH the mod: :search_count on a rescued-BadQuery card renders the exception message (views.rb:2-4 + 0_search.rb:72-77 rescuing_bad_query returns the exception)", async () => {
    const s = storage!;
    // Ruby: search_with_params RESCUES the BadQuery and returns it; .to_s
    // renders the MESSAGE - found_by.rb:23-25's invalid_found_by_card!
    expect(await s.engine.render("Item One+Bad Found", "search_count")).toBe(
      '"found_by" value must be valid Search, but Item One is a Basic',
    );
  });

  it("WITH the mod: :search_error renders class :: message :: content (views.rb:6-8)", async () => {
    const s = storage!;
    // Card::Error::BadQuery = card-1.110.0 lib/card/error.rb:78; content =
    // the card's raw cql text
    expect(await s.engine.render("Item One+Bad Found", "search_error")).toBe(
      'Card::Error::BadQuery :: "found_by" value must be valid Search, but Item One is a Basic :: {"found_by":"_left"}',
    );
  });

  it("WITH the mod: :search_error on a healthy card raises Ruby's Array#message NoMethodError (the reproduced upstream failure; views.rb:6-8)", async () => {
    const s = storage!;
    // The healthy search warms with a result Array, so the view's
    // interpolation (`"#{search_with_params.class} :: #{search_with_params
    // .message} :: ..."` - 0_search/views.rb:6-8) gets through .class and
    // crashes on .message: "undefined method `message' for an instance of
    // Array" (Ruby 3.3's receiver phrasing). That is the oracle's observed
    // failure for view:admin:All Topics:search_error - the quiet
    // render-error span carrying that debug page (51 boot-inclusive Ruby
    // frames in the committed capture) - and the corpus gate now grades the
    // engine's page byte-identical to it. The suite's raise contracts run
    // the loud posture (raise_all_rendering_errors defaults true; only the
    // harness adapters set it false), so the raise surfaces here verbatim
    // instead of as the span.
    await expect(s.engine.render("A Search", "search_error")).rejects.toThrow(
      /undefined method `message' for an instance of Array/,
    );
  });

  // ---------------------------------------------------------------------
  // No rendered bytes exist for either view, so these are SHAPE
  // assertions derived from the Ruby source, NOT byte-pins, and are not
  // reported as byte-verified anywhere.
  // ---------------------------------------------------------------------

  it("WITH the mod: :checkbox_list renders the search-checkbox-list wrapper (0_search/views.rb:118-124)", async () => {
    const s = storage!;
    const html = await s.engine.render("A Search", "checkbox_list");
    // with_results yields; wrap_with :div, class: klass is a PLAIN div
    // (card-mod-format set/all/html/wrap.rb:117-120 block form - no slot
    // attributes), and Content#output joins the three items with "\n"
    // (card-1.110.0 lib/card/format/content.rb:70-73). The block-form
    // wrap_with newline lands AFTER the wrapper's close, so the tail bytes
    // are "</div></div>\n".
    expect(html.startsWith('<div class="_search-checkbox-list pe-2">')).toBe(true);
    expect(html.endsWith("</div>\n")).toBe(true);
    // three checkbox_item haml blocks, in cql result order
    expect(html.match(/class='w-100 d-flex align-items-center'/g)).toHaveLength(3);
    expect(html.match(/<label class='p-2 w-100'>/g)).toHaveLength(3);
    for (const [label, key] of [["Item One", "item_one"], ["Item Two", "item_two"], ["Item Three", "item_three"]]) {
      // check_box_tag item_card.name, item_card.key, false (checkbox_item.haml:4)
      expect(html).toContain(`name="${label}"`);
      expect(html).toContain(`value="${key}"`);
      expect(html).toContain('class="_checkbox-list-checkbox p-1 me-3"');
    }
    // the subformat slot wrap: no @current_view, so the literal "-view"
    // class and the double-dash slot id (subformat.rb:8-12 + wrap.rb:32-34)
    expect(html).toContain('id="item_one--view"');
    expect(html).toContain("card-slot -view");
    // items are joined by "\n" (exactly two separators for three items)
    expect(html.split("\n</div>").length).toBeGreaterThan(1);
  });

  it("WITH the mod: :checkbox_list on an empty result set is the bare no-search-results div (views.rb:22-24 with_results)", async () => {
    const s = storage!;
    // with_results short-circuits BEFORE the wrapper div, so the list div
    // is never emitted - the html no_search_results view (views.rb:126-128)
    // stands alone.
    expect(await s.engine.render("Empty Search", "checkbox_list")).toBe(
      '<div class="search-no-results"></div>',
    );
  });

  it("WITH the mod: :results_for_keyword raises off the *search card (set/self/search.rb is the SELF set - oracle-pinned)", async () => {
    const s = storage!;
    // self/search.rb:48 defines the view on Card::Set::Self::Search - the
    // set of the card literally named "*search" - NOT on the search TYPE
    // set. On Search-typed cards Ruby raises Card::Error::UserError "view
    // (results_for_keyword) not supported for ..."; only *search itself
    // renders ("" - the search_keyword request-param
    // guard, search_params.rb:32-34, is false in every headless render).
    await expect(s.engine.render("A Search", "results_for_keyword")).rejects.toThrow(
      UnsupportedViewError,
    );
  });

  it("WITH the mod: the new views are refused off a non-Search card (set-scoped like the module's other views)", async () => {
    const s = storage!;
    await expect(s.engine.render("Item One", "checkbox_list")).rejects.toThrow(/checkbox_list/);
    await expect(s.engine.render("Item One", "results_for_keyword")).rejects.toThrow(
      /results_for_keyword/,
    );
  });

  it("WITH the mod: :one_line_content renders the link-item list (search_views.rb:40-48 + 0_search/views.rb:108-136)", async () => {
    const s = storage!;
    const html = await s.engine.render("A Search", "one_line_content");
    // klasses = "card-list card-list-#{item_view_options[:view]}
    // search-result-list" with the items view forced to :link
    expect(html).toContain("card-list card-list-link search-result-list");
    // card_list_item wraps each nest in .search-result-item.item-<view>
    expect(html).toContain('<div class="search-result-item item-link">');
    // each item renders the :link view (known-card anchor)
    expect(html).toContain('class="known-card"');
    expect(html).toContain("Item One");
    expect(html).toContain("Item Two");
    expect(html).toContain("Item Three");
  });

  it("WITH the mod: :one_line_content on empty results renders :no_search_results (0_search/views.rb:22-24 with_results)", async () => {
    const s = storage!;
    const html = await s.engine.render("Empty Search", "one_line_content");
    expect(html).toContain("search-no-results");
  });

  it("WITH the mod: :one_line_content on a NON-search card raises (the base compact view, card-mod-format base.rb:97, is not ported)", async () => {
    const s = storage!;
    await expect(s.engine.render("Item One", "one_line_content")).rejects.toThrow(
      UnsupportedViewError,
    );
  });

  it("WITH the mod: :goto_autocomplete_item renders the haml item with the forward icon (autocomplete.rb:6-8 + haml)", async () => {
    const s = storage!;
    const html = await s.engine.render("Item One", "goto_autocomplete_item");
    // autocomplete_item.haml: Haml merges the hash class BEFORE the literal
    // one (`class: "autocomplete-item-#{type}"` on .autocomplete-item) and
    // emits the lines flush-left - the seconds-corpus oracle bytes pin both
    // (view op Topic 001:goto_autocomplete_item, 2026-10-10)
    expect(html).toContain("<div class='autocomplete-item-goto autocomplete-item'>");
    expect(html).toContain("<div class='autocomplete-icon'>");
    // no +image card -> icon_tag(:forward) -> basket forward: :arrow_forward
    // (card-mod-bootstrap icon.rb:26, material library, Rails double quotes)
    expect(html).toContain('<i class="notranslate material-icons">arrow_forward</i>');
    // label = card.name (escaped by Haml)
    expect(html).toContain("<div class='autocomplete-label'>");
    expect(html).toContain("Item One");
  });

  it("WITH the mod: :add_autocomplete_item renders the add icon (autocomplete.rb:10-12; :add falls through icon_lookup)", async () => {
    const s = storage!;
    const html = await s.engine.render("Item Two", "add_autocomplete_item");
    expect(html).toContain("<div class='autocomplete-item-add autocomplete-item'>");
    expect(html).toContain('<i class="notranslate material-icons">add</i>');
    expect(html).toContain("Item Two");
  });

  it("WITH the mod: the html format REJECTS :select2_option; the json format renders the hash bytes (autocomplete.rb:52-56)", async () => {
    const s = storage!;
    // FORMAT SCOPING (flat-table-format-scope, 2026-10-01): the view
    // lives in set/all/autocomplete.rb:52-56's `format :json` block -
    // register_all_set_format files it under JsonFormat (set/format.rb:
    // 137-139; registrar.rb:79-84 mixes it into THAT class only), so an
    // HTML-format render has no method and raises unsupported-view. The
    // pin used to receive the json bytes through the format-blind FLAT
    // last-wins seam (the flat record now admits only html/base keys -
    // mod-loader.ts registration seam; the census probe
    // view-dispatch-flat-record-format-scope-census.test.ts pins the
    // measured foreign rows). The json dispatch itself renders the hash
    // through the owning format class below.
    await expect(s.engine.render("Item One", "select2_option")).rejects.toThrow(
      UnsupportedViewError,
    );
    const card = await s.engine.prepareItemForRender("Item One");
    expect(card).toBeDefined();
    const fmt = new RenderFormat(card!, s.engine, { formatName: "json" });
    expect(fmt.renderView("select2_option")).toBe('{"id":"~401","text":"Item One"}');
  });

  it("WITH the mod: every ported set module from the gem tree is in the basket", () => {
    const basket = loader!.setModules();
    // all/* -> base bucket (loader.ts#kindOfSetPath)
    const baseShortnames = basket.base.map((m) => m.shortname);
    expect(baseShortnames).toContain("All::Autocomplete");
    // abstract/* -> abstract bucket
    const abstractShortnames = basket.abstract.map((m) => m.shortname);
    expect(abstractShortnames).toContain("Abstract::Search");
    expect(abstractShortnames).toContain("Abstract::Search::Views");
    expect(abstractShortnames).toContain("Abstract::SearchViews");
    // self/* -> nonbase bucket. The only self set module the port registers
    // is self/search (self/search.rb:48, the :results_for_keyword haml
    // view); the other self/right/type files are
    // method-only.
    expect([...basket.nonbase.values()].flat().map((m) => m.shortname)).toEqual(["Self::Search"]);
  });

  it("WITH the mod: the mod loader's load report lists every ported view", () => {
    const report = loadReport ?? loader!.load();
    expect(report.registeredViews).toContain("count");
    expect(report.registeredViews).toContain("search_count");
    expect(report.registeredViews).toContain("search_error");
    expect(report.registeredViews).toContain("one_line_content");
    expect(report.registeredViews).toContain("goto_autocomplete_item");
    expect(report.registeredViews).toContain("add_autocomplete_item");
    expect(report.registeredViews).toContain("select2_option");
    // 0_search/views.rb:118 + self/search.rb:48
    expect(report.registeredViews).toContain("checkbox_list");
    expect(report.registeredViews).toContain("results_for_keyword");
  });

  it("WITH the mod: the view configs match the gem's view settings", () => {
    // 0_search.rb:56/:86 view(:count, cache: :never)
    expect(loader!.viewConfigFor("count")?.cache).toBe("never");
    // 0_search/views.rb:2 view :search_count, cache: :never
    expect(loader!.viewConfigFor("search_count")?.cache).toBe("never");
    // 0_search/views.rb:6 view :search_error, cache: :never
    expect(loader!.viewConfigFor("search_error")?.cache).toBe("never");
    // search_views.rb:40 view :one_line_content, cache: :never
    expect(loader!.viewConfigFor("one_line_content")?.cache).toBe("never");
    // autocomplete.rb:10 view :add_autocomplete_item, unknown: true
    expect(loader!.viewConfigFor("add_autocomplete_item")?.unknown).toBe(true);
    // autocomplete.rb:53 view :select2_option, perms: :none
    expect(loader!.viewConfigFor("select2_option")?.perms).toBe("none");
  });

  it("WITH the mod: a card's baseline :content render still works (the mod adds views, it does not alter core)", async () => {
    const s = storage!;
    const html = await s.engine.render("Item One", "content");
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("one body");
  });

  // The include_set seam: with both mods loaded, Ruby's include_set MRO
  // places Abstract::Search's :count above All::Item for Search cards; the
  // chain walker now expands a type token with its abstract includes
  // (SET_INCLUDE_GRAPH), so the search module wins for them and a
  // non-Search card still gets All::Item's count.
  it("WITH the mod: :count on a non-Search card delegates down the loader's view chain to card-mod-collection's count (set/format.rb:146-150 MRO)", async () => {
    const s = storage!;
    // Both mods, collection registered FIRST: the search mod's flat
    // registration wins the :count slot, and its fn hands non-Search
    // cards to the chain's next entry (All::Item - item.rb:118-120).
    const bothLoader = new ModLoader([
      { manifest: cardModCollection },
      { manifest: cardModSearch },
    ]);
    bothLoader.load();
    bindModLoaderToEngine(storage!, bothLoader);
    setDefaultModLoader(bothLoader);
    try {
      // Item One's dbContent "one body" -> the All::Item item count 1
      // (card-mod-collection item.rb:104-106 itemCount)
      expect(await s.engine.render("Item One", "count")).toBe("1");
      // Search cards still resolve the warm count, not the item split
      expect(await s.engine.render("A Search", "count")).toBe("3");
    } finally {
      setDefaultModLoader(undefined);
      bothLoader.reset(); // restores the pre-test flat registrations
    }
  });

  // LAST: this warm replaces the module-level count maps (last-warm-wins),
  // so every warm-reading assertion above must have run already.
  it("WITH the mod: :count groups digits with number_with_delimiter above 999 (collection item.rb:180-182)", async () => {
    const b = bigStorage!;
    bigLoader = new ModLoader([{ manifest: cardModSearch }]);
    bigLoader.load();
    await bigLoader.installInto(modEngineHost(b.engine, b.fetcher));
    // 1001 Basic cards + the five stock-substrate rows typed by this deck's
    // Codename (the same count the :count test above derives: a Codename
    // set's rows are Codename-typed and Basic is this deck's Codename).
    const html = await b.engine.render("Big Search", "count");
    expect(html).toBe("1,006");
  });
});
