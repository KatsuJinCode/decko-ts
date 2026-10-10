// fabricated-search-rule-core-raw-one-line.test.ts -- an earlier
// rule-bar one-line-content red-first pin (plan §(b)).
//
// The class: a Search-typed RULE card's bar-right one-line content must
// render the RAW stored CQL source, never the executed search. Ruby seats
// this on the RULE set's :core override
// (card-mod-rules-0.20.0 set/rule/html_views.rb:2-12:
//   `if card.type_id == SearchTypeID then render_raw else super() end`
//  -- "Rule cards that are searches ... refer to the left in the search
//  query. In that case the search doesn't work properly in the context of
//  the rule card itself. Hence we show the query syntax and not the search
//  result."), reached from the bar through bar_view.rb:39-44
// rule_short_content -> :one_line_content -> the METHOD
// (card-mod-format set/all/content.rb:47-49)
// `truncate strip_tags(render_core)` -> the overridden :core.
//
// The engine bug: the flat core dispatch's rule exemption
// (views.ts, the search-type arm) keyed on engine.cardIsRule, whose port
// carries a THREE-part-only gate (render.ts cardIsRule:
// `name.parts.length !== 3`), while Ruby's standard_rule?
// (lib/card/rule/all.rb:37-44; the engine's faithful port is
// cardMatchesRuleSet) has NO part-count limit. The corpus's named exemplar
// -- stored rule 17743 `Exhibit+Item+*type plus right+*content options`
// (Search-typed, db_content `{"type":"Item", "sort":"name"}`, FOUR name
// parts) -- therefore EXECUTED its search wherever its core rendered: the
// Exhibit+Item+*type plus right rules table rendered the one-line EMPTY
// (the search was never pre-executed on that page, so card_list fell to
// no_search_results whose bytes strip to ""), and the Search cardtype
// page's member bar rendered the EXECUTED result list (probe
// job-1790819678863-c558538f, tmp/p22-rulebar-content/results.jsonl).
// The oracle shows the raw JSON on BOTH pages (recapture-raw-shard-000013
// offset 53737 = the 30-byte residual; recapture-raw-shard-000000 card
// 17743 bar; all 14 non-default Search-typed rule bars across the 48
// oracle shards are raw -- census 2026-10-01).
//
// Fixture shape (corpus-equivalent, no corpus needed): the corpus's set
// anchor `Exhibit+Item+*type plus right` is a compound anchor whose
// prototype is List-typed (which is the only reason *content options --
// restricted_to_type [:list, :pointer, :session], card-mod-list
// set/self/content_options.rb:2 -- enumerates on that set's rules table
// at all). Here: the List-typed junction "Alpha+Beta", its +*self set,
// and the stored FOUR-part rule `Alpha+Beta+*self+*content options`
// (Search-typed, CQL source) -- four name parts, so engine.cardIsRule's
// 3-part gate misses it exactly like the corpus exemplar, and
// cardMatchesRuleSet (standard_rule?, any part count) is the arm that
// must catch it.

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
const BASIC_TYPE_ID = 9;
const SEARCH_TYPE_ID = 30;

async function seedDeck(): Promise<void> {
  const s = storage!;
  // Type cards (the codename column feeds the codehash).
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 3, name: "List", codename: "list" });
  await seedCard(s, { id: 30, name: "Search", codename: "search_type" });
  // Parties.
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  // Settings: *read (the grant), *self (the set anchor's right part),
  // *content options (the restricted setting under test).
  await seedCard(s, { id: 20, name: "*read", codename: "read", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 39, name: "*self", codename: "self", typeId: SETTING_TYPE_ID });
  await seedCard(s, { id: 86, name: "*content options", codename: "content_options", typeId: SETTING_TYPE_ID });
  // The List-typed anchor JUNCTION + its self set: the corpus anchor
  // `Exhibit+Item+*type plus right` is a junction (Exhibit+Item) whose
  // prototype is List-typed, and the rule under it has FOUR name parts.
  await seedCard(s, { id: 61, name: "Alpha", typeId: BASIC_TYPE_ID });
  await seedCard(s, { id: 60, name: "Beta", typeId: BASIC_TYPE_ID });
  await seedCard(s, { id: 66, name: "Alpha+Beta", leftId: 61, rightId: 60, typeId: LIST_TYPE_ID });
  await seedCard(s, { id: 63, name: "Alpha+Beta+*self", leftId: 66, rightId: 39, typeId: SET_TYPE_ID });
  // The deck's readable grant: *all+*read -> [[Anyone]].
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: SET_TYPE_ID, dbContent: "{}" });
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 6, "anyone");
  // The stored FOUR-part search rule -- the corpus's row 17743 shape
  // (Search-typed *content options rule, CQL source content).
  await seedCard(s, {
    id: 64,
    name: "Alpha+Beta+*self+*content options",
    leftId: 63,
    rightId: 86,
    typeId: SEARCH_TYPE_ID,
    dbContent: '{"type":"Item", "sort":"name"}',
  });
  // An Item-typed card the search WOULD return if it executed -- the base
  // bug's executed arm renders this name into the one-line (the Search
  // page's act bytes did); the fix must never render it here.
  await seedCard(s, { id: 65, name: "HDW CM 20131229 0264", typeId: LIST_TYPE_ID });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
  // Warm the setting cards into the render-card map (the r16 fixture
  // idiom).
  for (const name of ["*read", "*self", "*content options"]) {
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

describe("Search-typed rule card core renders raw (set/rule/html_views.rb:2-12)", () => {
  it("renders the stored 4-part search rule's bar-right one-line as the raw CQL source on its set page", async () => {
    // The set page's rules table -- the row bar for the stored rule
    // (stored-wins, rule_lists.rb:89-93).
    const html = await storage!.engine.render("Alpha+Beta+*self", "content");
    const at = html.indexOf("Xcontent_option-bar-view");
    expect(at).toBeGreaterThan(-1);
    const region = html.slice(html.lastIndexOf("<div", at));
    // The oracle's byte shape (recapture-raw-shard-000013 offset 53737,
    // 30 bytes): the one-line div carries the raw db_content JSON.
    expect(region).toContain(
      '<div class="text-muted one-line">{"type":"Item", "sort":"name"}</div>',
    );
    // Never the executed search (the base bug's Search-page arm).
    expect(region).not.toContain("HDW CM 20131229 0264");
    // Never the base bug's EI arm: an empty one-line inner (the
    // no_search_results bytes strip to "").
    expect(region).not.toContain('<div class="text-muted one-line"></div>');
  });
});
