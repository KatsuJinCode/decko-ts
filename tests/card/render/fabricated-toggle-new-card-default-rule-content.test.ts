// fabricated-toggle-new-card-default-rule-content.test.ts -- the
// *structure-template vs *default-content pin for a TOGGLE-TYPED fabricated
// new-card record.
//
// MECHANISM: an `agree+*right` set carries TWO rules --
//   - `agree+*right+*structure` (RichText-typed, a truthy template), and
//   - `agree+*right+*default` (Toggle-typed, content `0`).
// Zero `+agree` cards exist in the deck. When a Sign up person page nests
// `{{+agree | type:Toggle }}`, the nest fetch misses, the FetchEngine's
// virtual resolution (states.rb:44-50) fills dbContent with the *structure
// TEMPLATE, and RenderFormat#withNewCardContext re-types the record with
// the explicit opt. With the dbContent-keep chain in place the toggle core
// (formatToggleCore, views.ts) formats the truthy template -> "yes" where
// the expected byte is "no" (+1 byte on the +agree slot of every affected
// Sign up person page, content+open pairs).
//
// The expected byte is the ground truth: the toggle-typed fabricated
// record renders the *default rule's content ('0' -> "no"), never the
// *structure template. This pin seeds BOTH rules of the pair so the
// fixture deck reproduces the shape an earlier fixture deck lacked (an
// `agree+*right+*structure` row) -- exactly why the earlier "Toggle body
// 'no'" pin stayed green while the shaped decks regressed.
//
// The NON-toggle keep is intentionally untouched by the fix this pin
// accompanies: structured virtual bodies still render their *structure
// template -- guarded by structured-child-typed-view.test.ts and the
// nest-miss unknown-view-selection replay.

import { describe, expect, it } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
  type SeedOptions,
} from "./render-test-storage.js";
import {
  structureRuleUniverseStatement,
  structureUniverseFromResults,
  structureRuleTypesFromResults,
} from "../../../src/card/rules/structure.js";
import { createVirtualCardLookup } from "../../../src/card/fetch/virtual-cards.js";

const ANON_ID = 8;

async function seedCorpusRuleShapedDeck(): Promise<RenderTestStorage> {
  const storage = await createRenderTestStorage();
  const seed = (opts: SeedOptions) => seedCard(storage, opts);

  // Anchor + type cards (ids mirror the byte-formatting-parity suite's deck
  // where the two decks share rows: Set=1, *structure=5, *right=6, RichText=4,
  // Basic=9, *all=10, Sign up=12, *read=20, *default=21, Toggle=51).
  seed({ id: 1, name: "Set", codename: "set", typeId: 1 });
  seed({ id: 4, name: "RichText", codename: "rich_text" });
  seed({ id: 5, name: "*structure", codename: "structure", typeId: 2 });
  seed({ id: 6, name: "*right", codename: "right", typeId: 2 });
  seed({ id: 7, name: "anyone", codename: "anyone" });
  seed({ id: 8, name: "Anonymous", codename: "anonymous" });
  seed({ id: 9, name: "Basic", codename: "basic" });
  seed({ id: 10, name: "*all", codename: "all", typeId: 1 });
  seed({ id: 12, name: "Sign up", codename: "signup" });
  seed({ id: 20, name: "*read", codename: "read", typeId: 2 });
  seed({ id: 21, name: "*default", codename: "default", typeId: 2 });
  seed({ id: 51, name: "Toggle", codename: "toggle" });

  // The bootstrap read rule: *all+*read -> anyone.
  seed({ id: 30, name: "*all+*read", leftId: 10, rightId: 20, typeId: 2, dbContent: "anyone" });
  await seedReference(storage, 30, 7, "anyone");

  // The rule chain under `agree+*right`: BOTH rules a new `X+agree` child
  // resolves under.
  seed({ id: 17692, name: "agree", typeId: 9 });
  seed({ id: 17693, name: "agree+*right", leftId: 17692, rightId: 6, typeId: 1 });
  // The *default rule card -- Toggle-typed (the type new cards
  // under it inherit), content "0".
  seed({
    id: 17695,
    name: "agree+*right+*default",
    leftId: 17693,
    rightId: 21,
    typeId: 51,
    dbContent: "0",
  });
  // The *structure rule card -- RichText-typed, the truthy template.
  seed({
    id: 28589,
    name: "agree+*right+*structure",
    leftId: 17693,
    rightId: 5,
    typeId: 4,
    dbContent: "<p>{{Intellectual Property+Statement}}</p>",
  });

  // The Sign up host (self-signed-up), nesting +agree typed by the opt.
  // NO `<host>+agree` row -- the shaped deck carries zero +agree cards,
  // which is what makes the record fabricated. (Bare surface: the implicit
  // nest view is :titled, whose d0-card-body embeds the toggle core -- the
  // diff region's shape.)
  seed({
    id: 29677,
    name: "Sample Member",
    typeId: 12,
    creatorId: ANON_ID,
    createdAt: "2023-11-18 16:24:47",
    dbContent: "<div>\r\n{{+agree | type:Toggle }}\r\n</div>",
  });

  // The virtual-card hook over the seeded universe (states.rb#virtual?):
  // the +agree nest fetch must resolve virtually (template content) the way
  // the corpus machine's wiring does.
  const result = await storage.fetcher.driver.batch([structureRuleUniverseStatement()]);
  storage.fetcher.virtualCardLookup = createVirtualCardLookup(storage.fetcher, {
    contents: structureUniverseFromResults(result[0]),
    ruleTypeIds: structureRuleTypesFromResults(result[0]),
  });
  await storage.fetcher.installNameEnvironment();
  await storage.fetcher.warmLexicon([1, 4, 5, 6, 7, 8, 9, 10, 12, 20, 21, 51, 30, 17692, 17693, 17695, 28589, 29677]);
  return storage;
}

describe("toggle-typed fabricated new-card content (corpus rule pair 28589/17695)", () => {
  it("renders the *default rule's '0' as the toggle core 'no', never the *structure template's truthy 'yes'", async () => {
    const storage = await seedCorpusRuleShapedDeck();
    try {
      const html = await storage.engine.render("Sample Member", "content");
      // The fabricated +agree record is typed by the nest's type opt (the
      // R17 chain) -- pins that the test exercises the fabricated-record
      // path, not an accidentally known-card path.
      expect(html).toContain('data-card-type-id="51" data-card-type-name="Toggle"');
      expect(html).toContain("TYPE-toggle RIGHT-agree TYPE_PLUS_RIGHT-sign_up-agree");
      // The graded byte: the toggle core body "no" (*default rule content
      // '0') -- the d0-card-body div the titled nest embeds, the same region
      // the graded content/open pairs diff on.
      expect(html).toContain('">no</div>');
      expect(html).not.toContain('">yes</div>');
    } finally {
      storage.close();
    }
  });
});
