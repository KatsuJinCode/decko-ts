// The search mod's two request-term views, and the seat they would need
// (register row 28, card-mod-search).
//
// RUBY (card-mod-search-0.20.0 set/abstract/0_search/views.rb:38-44):
//
//   view :name_complete do
//     Card.search("#{params[:term]}").select { |c| c.name =~ /#{params[:term]}/ }
//   end
//   view :name_match do
//     Card.search("#{params[:term]}").select { |c| c.name =~ /#{params[:term]}/ }
//   end
//
// Both read a REQUEST parameter (term_param -> Env.params[:term]) and run
// ad-hoc CQL against it AT VIEW TIME, for any card.
//
// THE PORT. The prepared request-term seat is
// RenderEngine#searchBoxCompleteSeat (src/card/render.ts:11678-11683),
// and it is SEARCH-SCOPED: the render that prepared it is the search
// render, and the two views that use it (:complete and
// :search_box_complete) raise when the seat is absent. The two
// request-term views have no seat, so they are not registered port-side,
// and the port's own file says what closing them would take: a per-card
// request-term prepare for every card in the deck, which is engine work
// and not a view body (src/card/mod-loader/mods/card-mod-search.ts:46-53).
//
// This file pins those facts, so the row's gap cannot change silently.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readPortSetPathRegistrations } from "../../../tools/audit-mod-port-registration-reader.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SEARCH_MOD = join(REPO, "src", "card", "mod-loader", "mods", "card-mod-search.ts");
const RENDER = join(REPO, "src", "card", "render.ts");

const portViewNames = (): Set<string> => {
  const text = readFileSync(SEARCH_MOD, "utf8");
  const { bySetPath } = readPortSetPathRegistrations(text);
  const views = new Set<string>();
  for (const entry of bySetPath.values()) for (const view of entry.views) views.add(view);
  return views;
};

describe("the search mod's two request-term views", () => {
  it("registers neither name port-side", () => {
    const views = portViewNames();
    expect(views.has("name_complete")).toBe(false);
    expect(views.has("name_match")).toBe(false);
  });

  it("registers the two views that DO have the seat", () => {
    const views = portViewNames();
    expect(views.has("complete")).toBe(true);
    expect(views.has("search_box_complete")).toBe(true);
  });

  it("the engine's only request-term seat is the search-scoped one", () => {
    const render = readFileSync(RENDER, "utf8");
    expect(render).toContain("searchBoxCompleteSeat");
    // The seat is prepared for the search render and the accessor says so
    // in its own name; there is no per-card term seat beside it.
    expect(render).not.toMatch(/requestTermSeat|perCardTermSeat/);
  });

  it("the mod's own file names the two views as not ported, with the reason", () => {
    const mod = readFileSync(SEARCH_MOD, "utf8");
    expect(mod).toContain("name_complete / name_match");
    expect(mod).toContain("request-term");
  });
});
