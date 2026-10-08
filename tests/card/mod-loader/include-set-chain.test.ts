// include_set in the view chain: a concrete set module's abstract includes
// (Ruby's include_set, transitively, read off the loaded Ruby deck into
// SET_INCLUDE_GRAPH) resolve directly under the module and above every less
// specific set, so abstract-set views reach the cards Ruby gives them to.

import { describe, expect, it } from "vitest";
import { ModLoader } from "../../../src/card/mod-loader.js";
import { defaultDeckSources, portedBundleOrder } from "../../../src/card/mod-loader/default-mod-deck.js";

function composedLoader(): ModLoader {
  const loader = new ModLoader(defaultDeckSources());
  loader.resolveOrder({ gemMods: portedBundleOrder() });
  loader.load();
  return loader;
}

const owners = (loader: ModLoader, setKeys: string, view: string): string[] =>
  loader.viewChain(setKeys, view, "html").map((e) => e.setModule);

describe("include_set chain expansion", () => {
  const loader = composedLoader();

  it("a List card reaches the list editors of Abstract::List (card-mod-list abstract/01_list/html_views)", () => {
    for (const view of ["checkbox", "radio", "select", "multiselect", "autocomplete"]) {
      expect(owners(loader, "ALL ALL_PLUS TYPE-list SELF-probe", view)[0]).toBe("Abstract::List::HtmlViews");
    }
    // Abstract::List::HtmlViews defines :input above the all-set editor
    expect(owners(loader, "ALL TYPE-list SELF-probe", "input").slice(0, 2)).toEqual([
      "Abstract::List::HtmlViews",
      "All::Editor",
    ]);
  });

  it("a Search card resolves :count through Abstract::Search before the all-set item module", () => {
    expect(owners(loader, "ALL TYPE-search_type SELF-probe", "count")[0]).toBe("Abstract::Search");
    expect(owners(loader, "ALL TYPE-search_type SELF-probe", "search_count")[0]).toBe("Abstract::Search::Views");
  });

  it("a card whose sets include no abstract keeps the all-set chain", () => {
    expect(owners(loader, "ALL TYPE-rich_text SELF-probe", "checkbox")).toEqual([]);
    expect(owners(loader, "ALL TYPE-rich_text SELF-probe", "count")[0]).toBe("All::Item");
  });
});
