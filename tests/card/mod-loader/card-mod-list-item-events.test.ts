// The two card-mod-list event rows the completeness register left at
// PARTIAL "body disposition not individually audited this pass":
// `add_and_drop_items` and `insert_item_event`.
//
// Ruby source, read this session at
// C:/localProjects/decko-ruby-oracle-gems/ruby/3.4.0/gems/card-mod-list-0.20.0/set/abstract/01_list/events.rb:
//
//   events.rb:1-6
//     event :add_and_drop_items, :prepare_to_validate, on: :save do
//       adds  = Env.params["add_item"]
//       drops = Env.params["drop_item"]
//       Array.wrap(adds).each  { |i| add_item i }  if adds
//       Array.wrap(drops).each { |i| drop_item i } if drops
//     end
//
//   events.rb:8-11
//     event :insert_item_event, :prepare_to_validate, on: :save, when: :item_to_insert do
//       index = Env.params["item_index"] || 0
//       insert_item index.to_i, item_to_insert
//     end
//
// THE STALE CITATION THIS FILE CORRECTS. The mod file's section header
// (card-mod-list.ts, above addAndDropItems) says:
//
//   "The event registry records declarations only; the action engine's
//    stage seam (eventsForStage at mod-event-registry.ts:120) does not fire
//    them in this port."
//
// That was true when written and is FALSE now: the seam is wired (the
// register's own method section records dispatchEventStage at 20 stage
// points in card-action-engine.ts, composed from write-routes.ts's
// servingModEventRuntime). What is still true — and what the fns honestly
// say — is that these two BODIES run inline in the write route rather than
// through a registered fn. listItemContent (write-routes.ts) applies
// Ruby's operations in Ruby's order, against the content the request
// assigned (Ruby's events read the card AFTER assign_attributes):
//
//   add_and_drop_items -> Array.wrap(adds).each { add_item }  (append)
//                         then Array.wrap(drops).each { drop_item }
//                         (drop rejects every item with the same identity)
//   insert_item_event  -> insert_item (item_index || 0).to_i, item_to_insert
//                         (remove wherever it sits, then insert at index)
//
// That is why the fn stays a stub: moving it into the dispatch would run it
// at a different point in the save than Ruby's :prepare_to_validate, after
// the content the item ops act on has already been fixed. The row is
// PORTED-BY-WRITE-PATH, and the tests below prove the body, not the stub.
//
// No Ruby engine was executed for these rows in this session.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ModLoader } from "../../../src/card/mod-loader.js";
import type { DeckoModManifest } from "../../../src/card/mod-loader/mod-manifest.js";
import cardModList from "../../../src/card/mod-loader/mods/card-mod-list.js";
import { defaultDeckEventRuntime } from "../../../src/card/mod-loader/default-mod-deck.js";

/** Every event declaration in a manifest, flattened with its set path. */
function declaredEvents(
  mod: DeckoModManifest,
): Array<{ setPath: string } & Record<string, unknown>> {
  const out: Array<{ setPath: string } & Record<string, unknown>> = [];
  for (const file of mod.setModules ?? []) {
    for (const event of file.events ?? []) {
      out.push({ setPath: file.setPath, ...(event as unknown as Record<string, unknown>) });
    }
  }
  return out;
}

describe("add_and_drop_items (events.rb:1-6)", () => {
  it("is registered at :prepare_to_validate on :save with no when clause", () => {
    const decl = declaredEvents(cardModList).find((d) => d.event === "add_and_drop_items");
    expect(decl, "add_and_drop_items not declared").toBeDefined();
    expect(decl!.setPath).toBe("abstract/01_list/events");
    expect(decl!.at).toBe("prepare_to_validate");
    expect(decl!.on).toEqual(["save"]);
    // Ruby declares no `when:` on this event — the body's own `if adds` /
    // `if drops` guards are inside the block.
    expect(decl!.when).toBeUndefined();
  });

  it("reaches the deck's prepare_to_validate stage", () => {
    const stage = defaultDeckEventRuntime().registry
      .forStage("prepare_to_validate")
      .map((e) => e.event);
    expect(stage).toContain("add_and_drop_items");
  });
});

describe("insert_item_event (events.rb:8-11)", () => {
  it("is registered at :prepare_to_validate on :save, gated on item_to_insert", () => {
    const decl = declaredEvents(cardModList).find((d) => d.event === "insert_item_event");
    expect(decl, "insert_item_event not declared").toBeDefined();
    expect(decl!.setPath).toBe("abstract/01_list/events");
    expect(decl!.at).toBe("prepare_to_validate");
    expect(decl!.on).toEqual(["save"]);
    // events.rb:8 — `when: :item_to_insert`. The gate is a real predicate
    // here (item_to_insert -> Env.params["insert_item"], which the route
    // parses at write-routes.ts:567), unlike the inline body.
    expect(decl!.when).toBe("item_to_insert");
  });

  it("reaches the deck's prepare_to_validate stage", () => {
    const stage = defaultDeckEventRuntime().registry
      .forStage("prepare_to_validate")
      .map((e) => e.event);
    expect(stage).toContain("insert_item_event");
  });
});

describe("the PORTED-BY-WRITE-PATH disposition, checked against the source", () => {
  it("the write route parses all four Ruby Env.params keys", () => {
    // events.rb:2-3 read add_item / drop_item; events.rb:9 reads
    // item_index and item_to_insert reads insert_item. If any key stops
    // being parsed the body can never see it.
    const route = readFileSync(
      new URL("../../../src/server/write-routes.ts", import.meta.url),
      "utf8",
    );
    for (const key of ["add_item", "drop_item", "insert_item", "item_index"]) {
      expect(route, `route stopped parsing ${key}`).toContain(`"${key}"`);
    }
  });

  it("the inline body applies Ruby's operations in Ruby's order (adds, then drops, then insert)", () => {
    // listItemContent's source order IS the behavioral pin: Ruby's two
    // events run in definition order within the same stage, so adds are
    // appended before drops are applied and the insert lands last.
    const route = readFileSync(
      new URL("../../../src/server/write-routes.ts", import.meta.url),
      "utf8",
    );
    const start = route.indexOf("function listItemContent");
    expect(start).toBeGreaterThan(-1);
    const body = route.slice(start, route.indexOf("\n}", start));
    const addAt = body.indexOf("parsed.addItem");
    const dropAt = body.indexOf("parsed.dropItem");
    const insertAt = body.indexOf("parsed.insertItem");
    expect(addAt).toBeGreaterThan(-1);
    expect(dropAt).toBeGreaterThan(addAt);
    expect(insertAt).toBeGreaterThan(dropAt);
  });

  it("the fn stays a stub on purpose, and the mod file says why — the stale 'seam does not fire' note is corrected in place", () => {
    const decl = declaredEvents(cardModList).find((d) => d.event === "add_and_drop_items");
    // the registered fn is the honest no-op; the BODY lives in the route.
    expect(typeof decl!.fn).toBe("function");
    expect((decl!.fn as () => unknown)()).toBeUndefined();

    const mod = readFileSync(
      new URL("../../../src/card/mod-loader/mods/card-mod-list.ts", import.meta.url),
      "utf8",
    );
    // the stale CLAIM is gone (the correction quotes it in a marked
    // aside, which is fine; these are the checks)
    expect(mod).not.toMatch(/^\/\/ The event registry records declarations only;/m);
    expect(mod).not.toMatch(/eventsForStage at [^)]*\) does\s*\n?\s*\/\/ not fire them/);
    // and the correction itself is on disk, so the next reader gets the
    // reason rather than the stale claim.
    expect(mod).toMatch(/PORTED-BY-WRITE-PATH|listItemContent/);
  });

  it("the route-level body tests exist and cover all three operations", () => {
    // the behavioural proof of the inline body lives with the route tests
    // (write-routes-id-mark-save.test.ts: add_item appends, drop_item
    // removes by identity, insert_item + item_index moves the name).
    // Named here so the event row and its body proof are linked.
    const tests = readFileSync(
      new URL("../../server/write-routes-id-mark-save.test.ts", import.meta.url),
      "utf8",
    );
    expect(tests).toContain("add_item appends to the stored list");
    expect(tests).toContain("insert_item with item_index moves the name");
  });
});
