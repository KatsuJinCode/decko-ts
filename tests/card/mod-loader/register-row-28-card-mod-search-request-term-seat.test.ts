// The search mod's two request-term views, seated the way Ruby seats them
// (register row 28, card-mod-search) - CLOSED.
//
// RUBY (card-mod-search-0.20.0 set/abstract/0_search/views.rb:37-45):
//
//   view :name_complete, cache: :never, perms: :none do
//     format_json_search { complete_search limit: AUTOCOMPLETE_LIMIT }
//   end
//   view :name_match, cache: :never, perms: :none do
//     format_json_search { complete_or_match_search limit: AUTOCOMPLETE_LIMIT }
//   end
//
// Both read a REQUEST parameter (term_param = params[:term],
// search_params.rb:28-30) and run ad-hoc CQL AT VIEW TIME, for any card -
// the abstract set's views exist deck-wide. Ruby needs no prepared seat;
// the request IS the seat. The port's equivalent request carrier is the
// render's search params (RenderEngine#renderSearch.term), and the
// per-card prepare (RenderEngine#prepareRequestTerm) runs the two
// searches - complete_search (views.rb:70-73, the card's own cql merged
// under {limit: 8 (AUTOCOMPLETE_LIMIT, 0_search.rb:4), sort_by: "name",
// return: "name", complete: term_param.to_s}) and, for :name_match,
// complete_or_match_search's match remainder (views.rb:48-57) - seating
// them for the one view being rendered, on every card.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readPortSetPathRegistrations } from "../../../tools/audit-mod-port-registration-reader.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SEARCH_MOD = join(REPO, "src", "card", "mod-loader", "mods", "card-mod-search.ts");
const RENDER = join(REPO, "src", "card", "render.ts");
const FORMAT = join(REPO, "src", "card", "render", "format.ts");

const portViewNames = (): Set<string> => {
  const text = readFileSync(SEARCH_MOD, "utf8");
  const { bySetPath } = readPortSetPathRegistrations(text);
  const views = new Set<string>();
  for (const entry of bySetPath.values()) for (const view of entry.views) views.add(view);
  return views;
};

describe("the search mod's two request-term views", () => {
  it("registers both names port-side", () => {
    const views = portViewNames();
    expect(views.has("name_complete")).toBe(true);
    expect(views.has("name_match")).toBe(true);
  });

  it("registers the two views that share the search-scoped seat", () => {
    const views = portViewNames();
    expect(views.has("complete")).toBe(true);
    expect(views.has("search_box_complete")).toBe(true);
  });

  it("the engine carries a per-card request-term seat beside the search-scoped one", () => {
    const render = readFileSync(RENDER, "utf8");
    // the prepare is per-card (any card renders these views) and reads the
    // request term; the accessor exposes it beside searchBoxCompleteSeat
    expect(render).toContain("prepareRequestTerm(");
    expect(render).toContain("requestTermSeat(");
    expect(render).toContain("this.requestTermData = undefined;");
    expect(render).toMatch(/view === "name_complete" \|\| view === "name_match"/);
  });

  it("the seat's shape carries the term, both search results and the failure", () => {
    const format = readFileSync(FORMAT, "utf8");
    expect(format).toContain("export interface RequestTermSeat");
    expect(format).toMatch(/requestTermSeat\?\(card: RenderCard\): RequestTermSeat \| undefined;/);
  });

  it("the mod's own file names the two views as ported, with the seat", () => {
    const mod = readFileSync(SEARCH_MOD, "utf8");
    expect(mod).toContain("name_complete");
    expect(mod).toContain("name_match");
    expect(mod).toContain("requestTermSeat");
  });
});

// ---------------------------------------------------------------------------
// the live mechanism: a real engine render of the two views with a request
// term (the render-test storage's seeded deck).
// ---------------------------------------------------------------------------

import { beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader } from "../../../src/card/mod-loader.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";
import cardModSearch from "../../../src/card/mod-loader/mods/card-mod-search.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  // the stock substrate's catch-all read rule: a CQL search filters on the
  // STORED cards.read_rule_id (sql.ts's read_rule_id IN (...), Ruby
  // where.rb:79-84), so the probe cards carry the rule id explicitly - a
  // fresh card saves under the *all rule in Ruby, and seedCard writes what
  // the save's rule closure would.
  const allRead = await s.fetcher.fetchByName("*all+*read");
  const readRuleId = allRead?.id;
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 3, name: "Search", codename: "search_type" });
  // the probe cards the term matches (complete: prefix; match: substring)
  await seedCard(s, { id: 1201, name: "Complete Me Alpha", dbContent: "alpha", readRuleId });
  await seedCard(s, { id: 1202, name: "Complete Me Beta", dbContent: "beta", readRuleId });
  await seedCard(s, { id: 1203, name: "Me and Complete Together", dbContent: "gamma", readRuleId });
  // the Search-typed card the views render on (the abstract set is
  // deck-wide; the Search card's own cql "{}" merges under the args)
  await seedCard(s, {
    id: 1204,
    name: "Term Probe Search",
    typeId: 3,
    dbContent: "{}",
    readRuleId,
  });
  // the molecule view the default item arm nests through is
  // card-mod-format's (set/right/data.rb molecule); the deck-wide json
  // chain needs it bound beside the search mod
  loader = new ModLoader([
    { manifest: cardModFormat },
    { manifest: cardModSearch },
  ]);
  loader.load();
  bindModLoaderToEngine(storage!, loader!);
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("the request-term views through a live engine render", () => {
  it("name_complete serves the complete matches as the nested json items", async () => {
    const s = storage!;
    const body = await s.engine.render("Term Probe Search", "name_complete", {
      format: "json",
      search: { term: "Complete Me" },
    });
    const parsed: unknown = JSON.parse(body);
    expect(Array.isArray(parsed)).toBe(true);
    const names = (parsed as { name?: { s?: string } | string }[]).map((item) =>
      typeof item?.name === "string" ? item.name : item?.name?.s,
    );
    expect(names).toContain("Complete Me Alpha");
    expect(names).toContain("Complete Me Beta");
    expect(names).not.toContain("Me and Complete Together");
  });

  it("name_match fills the slots the complete results leave", async () => {
    const s = storage!;
    const body = await s.engine.render("Term Probe Search", "name_match", {
      format: "json",
      search: { term: "Complete Me" },
    });
    const parsed: unknown = JSON.parse(body);
    const names = (parsed as { name?: { s?: string } | string }[]).map((item) =>
      typeof item?.name === "string" ? item.name : item?.name?.s,
    );
    // the match half: Ruby's match_value escapes the WHOLE term as one
    // literal regexp against cards.name (match_value.rb match_value:
    // escape_regexp_characters, match_field :name), so "Me and Complete
    // Together" - which carries neither the prefix nor the literal
    // "Complete Me" - stays out; the answer is the complete pair alone
    expect(names).toContain("Complete Me Alpha");
    expect(names).toContain("Complete Me Beta");
    expect(names).not.toContain("Me and Complete Together");
  });

  it("an absent term completes everything and adds no match half", async () => {
    const s = storage!;
    const body = await s.engine.render("Term Probe Search", "name_match", {
      format: "json",
      search: {},
    });
    // complete_cql's complete: "" (nil.to_s) prefix-matches every name, so
    // the complete list fills the eight slots; match_search returns []
    // for a blank term (views.rb:73-75) - the answer is the complete list.
    const names = (JSON.parse(body) as { name?: { s?: string } | string }[]).map((item) =>
      typeof item?.name === "string" ? item.name : item?.name?.s,
    );
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThanOrEqual(8);
    expect(names).toContain("Complete Me Alpha");
  });

  it("the reach follows the include graph: SearchType in, a plain card out", async () => {
    // Abstract::Search::Views rides Type::SearchType, Type::Set and
    // Type::Cardtype (set-include-graph.ts) - a Search-typed card renders
    // the view; a basic card's chain lacks the module and raises Ruby's
    // unsupported-view error.
    const s = storage!;
    const body = await s.engine.render("Term Probe Search", "name_complete", {
      format: "json",
      search: { term: "Me and Complete" },
    });
    const names = (JSON.parse(body) as { name?: { s?: string } | string }[]).map((item) =>
      typeof item?.name === "string" ? item.name : item?.name?.s,
    );
    expect(names).toContain("Me and Complete Together");
    await expect(
      s.engine.render("Complete Me Alpha", "name_complete", {
        format: "json",
        search: { term: "Complete Me" },
      }),
    ).rejects.toThrow(/view \(name_complete\) not supported/);
  });
});
