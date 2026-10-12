// A compound fetch whose LEFT card has no row: quick_type types that left as a
// NEW card (set_pattern/class_methods.rb:59-71 fetches the left
// with `new: {}`), so the virtual? candidate walk's *type plus right anchor
// carries the left's NEW-CARD type (the *default universe's answer), not the
// RichText fallback. Typing a missing left as untyped instead would let a
// phantom whose left's new-card type is not RichText resolve the wrong
// *structure rule — or none.
//
// The typing walk reads the *default universe maps only — no fetches — so it
// cannot re-enter the fetch hook it sits inside (a fetch here would recurse:
// the walk's own rule-candidate fetches would consult the hook for row-less
// candidates whose left is missing again).
import { describe, expect, it } from "vitest";
import { DeckoName } from "../../../src/card/name.js";
import { ruleNamesForCard } from "../../../src/card/set-patterns/rule-names.js";
import { DEFAULT_SETTING_NAME, STRUCTURE_SETTING_NAME } from "../../../src/card/rules/structure.js";
import {
  createVirtualCardLookup,
  type NewCardTypeMaps,
  type StructureUniverseMaps,
} from "../../../src/card/fetch/virtual-cards.js";
import type { FetchEngine } from "../../../src/card/fetch.js";

const NAME = DeckoName.parse("Missing Host+Task");

/** Candidate rule keys the virtual? walk tries for NAME, computed the same
 *  way the lookup computes them, for a given left type name. */
function structureCandidateKeys(leftTypeName: string | undefined): string[] {
  return ruleNamesForCard(
    { name: NAME, isNew: true, ...(leftTypeName !== undefined ? { leftTypeName } : {}) },
    STRUCTURE_SETTING_NAME,
  ).map((c) => DeckoName.parse(c).key);
}

/** The *type plus right candidate the walk reaches when the left is typed
 *  by its new-card type ("PlainText", from the fabricated *default
 *  universe below) — the anchor the anchor-preference order hits first. */
const PLAIN_TEXT_TPR_KEY = structureCandidateKeys("PlainText").find((k) => k.includes("type_plu_right"))!;

const universe: StructureUniverseMaps = {
  contents: new Map([[PLAIN_TEXT_TPR_KEY, "PlainText anchored template"]]),
  ruleTypeIds: new Map([[PLAIN_TEXT_TPR_KEY, 55]]),
};

const newCardTypes: NewCardTypeMaps = {
  // *default universe: the new-card type walk's template leg answers
  // PlainText for the missing left "Missing Host" (*all+*default rule
  // typed 31; the type-name map names both universes' type ids).
  defaultTypeIds: new Map([[DeckoName.parse("*all+*default").key, 31]]),
  typeNamesById: new Map([
    [31, "PlainText"],
    [55, "Toggle"],
  ]),
};

/** A fetcher that knows NO rows and counts its calls — the left probe must
 *  be the only fetch (the typing itself may not fetch, or it could recurse
 *  into this very hook). */
function makeFetchCounter() {
  let calls = 0;
  const fetcher = {
    fetchByName: async () => {
      calls += 1;
      return undefined;
    },
    fetchById: async () => undefined,
  };
  return { fetcher: fetcher as unknown as FetchEngine, count: () => calls };
}

describe("virtual-card lookup: a missing left takes its new-card type", () => {
  it("resolves the *type plus right structure rule through the left's *default-universe type", async () => {
    const { fetcher, count } = makeFetchCounter();
    const lookup = createVirtualCardLookup(fetcher, universe, newCardTypes);
    const resolution = await lookup(NAME);
    expect(resolution).toBeDefined();
    expect(resolution!.ruleKey).toBe(PLAIN_TEXT_TPR_KEY);
    expect(resolution!.templateContent).toBe("PlainText anchored template");
    expect(resolution!.typeId).toBe(55);
    // the left probe is the only fetch: the typing walk itself is map-only
    expect(count()).toBe(1);
  });

  it("without the *default maps the phantom stays unknown (the old, untyped shape)", async () => {
    const { fetcher } = makeFetchCounter();
    const lookup = createVirtualCardLookup(fetcher, universe);
    expect(await lookup(NAME)).toBeUndefined();
  });

  it("an existing left still wins — its own row's type is used, not the new-card walk", async () => {
    let calls = 0;
    const fetcher = {
      fetchByName: async (key: string) => {
        calls += 1;
        if (key === "existing_host") {
          return { typeId: 31, name: DeckoName.parse("Existing Host") };
        }
        return undefined;
      },
      fetchById: async (id: number) => (id === 31 ? { name: DeckoName.parse("Real Type") } : undefined),
    } as unknown as FetchEngine;
    const lookup = createVirtualCardLookup(fetcher, universe, newCardTypes);
    const resolution = await lookup(DeckoName.parse("Existing Host+Task"));
    // "Real Type"+Task has no structure rule in the fabricated universe —
    // the row's own type decided the anchor, not *all+*default's PlainText.
    expect(resolution).toBeUndefined();
    expect(calls).toBe(1);
  });

  it("the *default candidate walk keys names the same way the universes do", () => {
    // guards the fabricated map keys against drift: the *default leg's
    // first candidate for the missing left is the anchorless *all+*default
    const keys = ruleNamesForCard(
      { name: DeckoName.parse("Missing Host"), isNew: true },
      DEFAULT_SETTING_NAME,
    ).map((c) => DeckoName.parse(c).key);
    expect(keys).toContain(DeckoName.parse("*all+*default").key);
  });
});
