// The virtual card's save, in Ruby and in the port (register row 33,
// card-mod-virtual).
//
// RUBY (card-mod-virtual-0.20.0 set/abstract/virtual_cache.rb:21-29):
//
//   event :save_virtual_content, :prepare_to_store, on: :save do
//     Virtual.save self
//     abort :success
//   end
//
//   event :delete_virtual_content, :prepare_to_store, on: :delete do
//     Virtual.delete self
//     abort :success unless real?
//   end
//
// The abort unwinds the save, so a virtual card's OWN cards row is never
// written: the content lives in the card_virtuals row the Virtual.save
// wrote, and nothing else.
//
// THE PORT'S THREE MECHANISMS, MEASURED HERE:
//
// 1. THE PORT'S ABORT IS A THROW. The port models abort :success as the
//    ModEventAbortSuccess throw (src/card/actions/types.ts:104-110), and
//    the save entry catches it and answers a no-write success
//    (src/card/actions/card-action-engine.ts:3566). The virtual mod's own
//    body RETURNS the marker string instead of throwing it
//    (src/card/mod-loader/mods/card-mod-virtual.ts:452-465), and the event
//    dispatch discards an event body's return value
//    (src/card/mod-loader/mod-event-dispatch.ts:870), so a body written
//    that way would have no effect.
//
// 2. THE REGISTERED BODIES ARE NO-OPS. The manifest's fn bodies are
//    documented stubs (src/card/mod-loader/mods/card-mod-virtual.ts:
//    521-542): the port's write path has no virtual?-set diversion, so
//    wiring the body alone would run Virtual.save AND the row write, a
//    corruption Ruby never produces.
//
// 3. THE EVENTS CANNOT EVEN FIRE, because the port's set chain for the
//    virtual card carries no virtual_cache module. The virtual card is
//    the asset_input RIGHT card (card-mod-assets-0.20.0
//    set/right/asset_input.rb:1 `include_set Abstract::VirtualCache`),
//    and the set chain comes from the generated include graph
//    (src/card/mod-loader/set-include-graph.ts), which names NO includer
//    of Abstract::VirtualCache. The mod's two events are registered on the
//    set path "abstract/virtual_cache", so the dispatch answers
//    set-not-applicable for every save.
//
// Both facts are machine-checkable in the repo, and this file checks them.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SET_INCLUDE_GRAPH } from "../../../src/card/mod-loader/set-include-graph.js";
import cardModVirtual from "../../../src/card/mod-loader/mods/card-mod-virtual.js";
import { ModEventAbortSuccess } from "../../../src/card/actions/types.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const DISPATCH = join(REPO, "src", "card", "mod-loader", "mod-event-dispatch.ts");

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

const virtualEvents = () => {
  const module = (cardModVirtual.setModules ?? []).find(
    (entry) => entry.setPath === "abstract/virtual_cache",
  );
  return module?.events ?? [];
};

describe("the virtual card's save: the abort marker, the stub bodies and the set chain", () => {
  it("no concrete set module includes Abstract::VirtualCache, so the virtual events cannot fire", () => {
    expect(includersOf("Abstract::VirtualCache")).toEqual([]);
  });

  it("the mod registers both events on the abstract/virtual_cache set path", () => {
    const names = virtualEvents().map((event) => event.event);
    expect(names).toContain("save_virtual_content");
    expect(names).toContain("delete_virtual_content");
  });

  it("the port's abort is the ModEventAbortSuccess THROW", () => {
    expect(new ModEventAbortSuccess()).toBeInstanceOf(Error);
    expect(new ModEventAbortSuccess().name).toBe("ModEventAbortSuccess");
  });

  it("the registered bodies are no-ops, so the save goes on to write the cards row", async () => {
    for (const event of virtualEvents()) {
      await expect(
        (async () => event.fn?.({ name: "Probe" }, {} as never, {} as never))(),
      ).resolves.toBeUndefined();
    }
  });

  it("the dispatch calls the body and does not read its return value", () => {
    const dispatch = readFileSync(DISPATCH, "utf8");
    expect(dispatch).toContain("await event.fn(");
    expect(dispatch).not.toMatch(/(?:const|let|var)\s+\w+\s*=\s*await\s+event\.fn\(/);
  });
});
