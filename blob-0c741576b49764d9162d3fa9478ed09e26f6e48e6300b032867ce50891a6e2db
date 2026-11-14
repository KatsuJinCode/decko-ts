// The ModEventCard population mechanism (src/card/mod-loader/
// mod-event-card-state.ts) — the seam that supplies the state Ruby's `when:`
// predicates read off the acting card.
//
// Ruby evaluates `when: :sym` as `send :sym` on the card itself
// (set/event/all.rb:79-85), so the predicate may read anything `self`
// carries. The port's event card is a structural snapshot, so a per-mod
// source supplies the rest. These expectations are hand-derived from the
// Ruby sources each source cites.
//
// The extension contract matters as much as the merge: a lane adding a
// mod's predicates registers one source beside that mod's predicate table.

import { afterEach, describe, expect, it } from "vitest";
import {
  clearModEventCardStateSources,
  modEventCardStateSources,
  populateModEventCardState,
  registerModEventCardStateSource,
  type ModEventCardStateContext,
} from "../../../src/card/mod-loader/mod-event-card-state.js";
import type { ModEventCard } from "../../../src/card/mod-loader/mod-manifest.js";

const DUMMY_DEPS = {} as ModEventCardStateContext;

function card(over: Partial<ModEventCard> = {}): ModEventCard {
  return { name: "Test Card", id: 50, action: "update", act: { action: "update" }, ...over };
}

function ctx(over: Partial<ModEventCardStateContext> = {}): ModEventCardStateContext {
  return { authCurrentId: null, isActCard: true, ...over } as ModEventCardStateContext;
}

afterEach(() => {
  clearModEventCardStateSources();
});

describe("mod-event card state — the population mechanism", () => {
  it("merges each registered source's fields onto the card", async () => {
    registerModEventCardStateSource({
      modName: "core",
      setPaths: ["all/content"],
      load: (c, context) => (context.params !== undefined ? { params: context.params } : {}),
    });
    registerModEventCardStateSource({
      modName: "history",
      setPaths: ["all/history"],
      load: () => ({ history: false }),
    });
    const populated = await populateModEventCardState(
      card(),
      ctx({ params: { draft: "true" } }),
    );
    expect(populated.params).toEqual({ draft: "true" });
    expect(populated.history).toBe(false);
    // the identity fields survive the merge
    expect(populated.name).toBe("Test Card");
    expect(populated.id).toBe(50);
  });

  it("leaves fields no source supplies absent, so a predicate reads false", () => {
    registerModEventCardStateSource({
      modName: "core",
      setPaths: ["all/content"],
      load: () => ({}),
    });
    return populateModEventCardState(card(), ctx()).then((populated) => {
      // use_default_content? (content.rb:30) asks whether the type supplies
      // default content; with nothing supplied the answer is "no", which is
      // what an absent template means.
      expect(populated.defaultContent).toBeUndefined();
      expect(populated.history).toBeUndefined();
    });
  });

  it("treats an unreadable source as an absent one instead of failing the save", () => {
    // population supplies state for a condition; a source that cannot read
    // it must reach the predicate as a missing field, not abort a save Ruby
    // would have completed. (The predicate's own raise — an unresolvable
    // NAME — is the dispatcher's, and stays loud.)
    registerModEventCardStateSource({
      modName: "carrierwave",
      setPaths: ["abstract/attachment"],
      load: () => {
        throw new Error("the deck is unreadable");
      },
    });
    return populateModEventCardState(card(), ctx()).then((populated) => {
      expect(populated.name).toBe("Test Card");
    });
  });

  it("registers sources in order and clears them for a reload", () => {
    registerModEventCardStateSource({
      modName: "core",
      setPaths: ["all/content"],
      load: () => ({}),
    });
    registerModEventCardStateSource({
      modName: "list",
      setPaths: ["abstract/01_list"],
      load: () => ({}),
    });
    expect(modEventCardStateSources().map((s) => s.modName)).toEqual(["core", "list"]);
    clearModEventCardStateSources();
    expect(modEventCardStateSources()).toEqual([]);
    expect(DUMMY_DEPS).toBeDefined();
  });
});