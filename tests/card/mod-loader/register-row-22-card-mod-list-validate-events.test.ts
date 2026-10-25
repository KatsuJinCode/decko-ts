// The list mod's five events, and which of them can EVER fire in the
// pinned deck (register row 22, card-mod-list).
//
// RUBY (card-mod-list-0.20.0 set/abstract/01_list/events.rb:1-33 and
// set/abstract/delist.rb:2-9):
//
//   add_and_drop_items      :prepare_to_validate, on: :save
//   insert_item_event       :prepare_to_validate, on: :save, when: :item_to_insert
//   validate_item_type      :validate,           on: :save, when: :validate_item_type?
//   validate_item_uniqueness :validate,          on: :save, when: :unique_items?
//   delist                  :prepare_to_store,   on: :delete
//
// AT THIS TREE:
//
// - add_and_drop_items and insert_item_event are PORTED, at the write
//   route's list-item arm (src/server/write-routes.ts: the add_item /
//   drop_item / insert_item params). Their bytes are pinned by
//   tests/server/write-routes-id-mark-save.test.ts.
//
// - validate_item_type and validate_item_uniqueness HAVE NO PORT BODY: the
//   Ruby bodies read ok_item_types / item_cards / duplicate_item_names and
//   add a :content error to the acting card, and the port's write path has
//   no errors.add seam and no such card methods. The port's bodies are
//   documented stubs (src/card/mod-loader/mods/card-mod-list.ts:1276-1309),
//   so a wrong item type is saved where Ruby refuses it.
//
// - delist CANNOT FIRE. The event lives on the ABSTRACT set module
//   Abstract::Delist, and an abstract set module's code reaches a card
//   only through `include_set` (card-1.110.0 set/inheritance.rb). The
//   repo's own generated include census
//   (src/card/mod-loader/set-include-graph.ts, from
//   tools/oracle/set-include-graph.rb over the loaded Ruby deck) names no
//   includer of Abstract::Delist.
//
// This file pins those facts, so the row's gap can name ONE live pair
// instead of five.

import { describe, expect, it } from "vitest";

import { SET_INCLUDE_GRAPH } from "../../../src/card/mod-loader/set-include-graph.js";
import cardModList from "../../../src/card/mod-loader/mods/card-mod-list.js";

/** Every abstract set module the generated include graph names as
 *  included, with the concrete set module that includes it. */
const includersOf = (abstractModule: string): string[] => {
  const includers: string[] = [];
  for (const [setModule, includes] of Object.entries(SET_INCLUDE_GRAPH)) {
    for (const format of ["html", "base"] as const) {
      if (includes[format]?.includes(abstractModule) === true) includers.push(setModule);
    }
  }
  return includers.sort();
};

const eventsOn = (setPath: string) => {
  const module = (cardModList.setModules ?? []).find((entry) => entry.setPath === setPath);
  return module?.events ?? [];
};

describe("the list mod's events that can never fire, and the two that have no body", () => {
  it("no concrete set module includes Abstract::Delist, so :delist never fires", () => {
    expect(includersOf("Abstract::Delist")).toEqual([]);
  });

  it("registers :delist on the abstract/delist set path anyway", () => {
    expect(eventsOn("abstract/delist").map((event) => event.event)).toContain("delist");
  });

  it("registers the four list events, with the two validate ones gated", () => {
    const events = eventsOn("abstract/01_list/events");
    const names = events.map((event) => event.event);
    expect(names).toEqual([
      "add_and_drop_items",
      "insert_item_event",
      "validate_item_type",
      "validate_item_uniqueness",
    ]);
    const validateType = events.find((event) => event.event === "validate_item_type");
    expect(validateType?.when).toBe("validate_item_type?");
    const validateUniqueness = events.find((event) => event.event === "validate_item_uniqueness");
    expect(validateUniqueness?.when).toBe("unique_items?");
  });

  it("the two validate bodies add no content error, because the port has no errors.add seam", async () => {
    for (const name of ["validate_item_type", "validate_item_uniqueness"]) {
      const event = eventsOn("abstract/01_list/events").find((entry) => entry.event === name);
      expect(event?.fn).toBeTypeOf("function");
      // The body returns nothing and raises nothing: it cannot add the
      // :content error Ruby adds.
      await expect(
        (async () => event?.fn?.({ name: "Probe" }, {} as never, {} as never))(),
      ).resolves.toBeUndefined();
    }
  });
});
