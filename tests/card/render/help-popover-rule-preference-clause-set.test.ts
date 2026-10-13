// Pin: the menu help popover's rule? predicate admits EXACTLY what Ruby's
// preference? + valid_preferer? admit (prototype/lib/card/rule/all.rb:33-54).
//
// Two families are pinned at the engine level:
//
//   REFUSED  - the `mod: <x>+*style/script` rows: standard_rule? false
//              (left `mod: <x>` is Mod-cardtype-typed, not Set) AND
//              preference? false (2 parts, all.rb:43 needs > 2). An earlier
//              widening that admitted rows on "left resolves" alone put
//              settingLinkBytes into their popover data-bs-content.
//   ADMITTED - the `*follow` preference rows: preference? holds (the trunk
//              `name[0..-3]` is a Set-typed row, such as `*all+*all` or a
//              `<card>+*self` junction) and valid_preferer? holds (the
//              preferer card is User-typed, or carries codename :all).
//
// The seeded shapes below mirror real deck rows; the clause DECISIONS are
// what is pinned, through the real resolver + render path (menu
// data-bs-content bytes).

import { describe, expect, it } from "vitest";
import { installHelpRules } from "../../../src/card/render/help-popover.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

// codename cards (the ids the rule? machinery compares against; same ids as
// help-popover.test.ts seeds).
const SET_TYPE_ID = 10; // codename "set"
const SETTING_TYPE_ID = 11; // codename "setting"
const USER_TYPE_ID = 12; // codename "user"
const BASIC_TYPE_ID = 2;
const MOD_CARDTYPE_ID = 40; // the "Mod" cardtype card

async function seedCodenameCards(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, { id: 5, name: "Cardtype", typeId: 5 });
  await seedCard(storage, { id: 2, name: "Basic", typeId: 5 });
  await seedCard(storage, { id: 10, name: "Set", codename: "set", typeId: 5 });
  await seedCard(storage, { id: 11, name: "Setting", codename: "setting", typeId: 5 });
  await seedCard(storage, { id: 12, name: "User", codename: "user", typeId: 5 });
}

/** Extract the data-bs-content attribute value (still attribute-escaped). */
function helpContentOf(html: string): string {
  const marker = 'data-bs-content="';
  const start = html.indexOf(marker);
  expect(start, "menu help anchor present").toBeGreaterThanOrEqual(0);
  const rest = html.slice(start + marker.length);
  const end = rest.indexOf('"');
  return rest.slice(0, end);
}

describe("rule? clause set (all.rb:33-54): the popover's setting_link rides Ruby's preference? exactly", () => {
  it("REFUSES the 2-part mod style/script row: static setting text, no setting_link (the 68 regressions)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCodenameCards(storage);
      // the seeded world: a Mod-cardtype `mod: account` card (NOT
      // Set-typed); a `*style` setting card; the rule row
      // `mod: account+*style` (typeId 47 = Rule).
      await seedCard(storage, { id: MOD_CARDTYPE_ID, name: "Mod", typeId: 5 });
      await seedCard(storage, {
        id: 17450, name: "*style", codename: "style", typeId: SETTING_TYPE_ID,
      });
      await seedCard(storage, {
        id: 45464, name: "mod: account", typeId: MOD_CARDTYPE_ID,
      });
      await seedCard(storage, {
        id: 45465, leftId: 45464, rightId: 17450, typeId: 47,
      });
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();

      const html = await storage.engine.render("mod: account+*style", "closed");
      const content = helpContentOf(html);
      // Ruby refuses the row (rule? false), so the popover carries the
      // setting's own help text - the static "style" registration - and
      // board_rules_editor's setting_link stays OFF the data-bs-content.
      expect(content).toContain("Skin (collection of stylesheets)");
      expect(content).not.toContain("ms-auto");
    } finally {
      storage.close();
    }
  });

  it("ADMITS the 3-part *all+*all+*follow guard: trunk *all is Set, preferer codename all", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCodenameCards(storage);
      // the seeded world: `*all` (codename "all", Set-typed); `*follow`
      // (setting); `*all+*all` (typeId 3, NOT Set); rule row
      // `*all+*all+*follow` (typeId 47).
      await seedCard(storage, {
        id: 274, name: "*all", codename: "all", typeId: SET_TYPE_ID,
      });
      await seedCard(storage, {
        id: 22720, name: "*follow", codename: "follow", typeId: SETTING_TYPE_ID,
      });
      await seedCard(storage, { id: 22734, leftId: 274, rightId: 274, typeId: 3 });
      await seedCard(storage, {
        id: 22735, leftId: 22734, rightId: 22720, typeId: 47,
      });
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();

      const html = await storage.engine.render("*all+*all+*follow", "closed");
      const content = helpContentOf(html);
      // preference? holds (3 parts; trunk *all is Set; preferer *all has
      // codename :all) - the board_rules_editor setting_link renders, and
      // the count is the live Setting#count (no Set-typed left with right
      // *follow exists in the seeded world: 0).
      expect(content).toContain("ms-auto");
      expect(content).toContain("(0 follow rules)");
    } finally {
      storage.close();
    }
  });

  it("ADMITS the 4-part self-set guard via the USER preferer arm", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCodenameCards(storage);
      // the seeded world: the basic card `Sample Card 074`, its
      // `+*self` junction (Set-typed, so preference?'s trunk clause
      // holds), a User-typed preferer card with no codename
      // ("Sample Member"), the junction to the preferer, and the `*follow`
      // rule row.
      await seedCard(storage, { id: 26848, name: "Sample Card 074", typeId: BASIC_TYPE_ID });
      await seedCard(storage, { id: 30, name: "*self", codename: "self", typeId: SETTING_TYPE_ID });
      await seedCard(storage, {
        id: 26849, leftId: 26848, rightId: 30, typeId: SET_TYPE_ID,
      });
      await seedCard(storage, {
        id: 393, name: "Sample Member", typeId: USER_TYPE_ID,
      });
      await seedCard(storage, {
        id: 26850, leftId: 26849, rightId: 393, typeId: 3,
      });
      await seedCard(storage, {
        id: 26851, name: "*follow", codename: "follow", typeId: SETTING_TYPE_ID,
      });
      // the rule row gets its own id (distinct from the *follow setting
      // card above) so the seed's left/right unique key holds
      await seedCard(storage, {
        id: 26852, leftId: 26850, rightId: 26851, typeId: 47,
      });
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();

      // fetchRenderCard is the cache-only render-path accessor (its contract:
      // "returns undefined for anything the prefetch did not prepare"), so a
      // card the harness never rendered is a map MISS, not a clause failure.
      // The one warm render below seats the preferer so THIS assertion
      // exercises the actual all.rb:53 clause, not a cold-map miss.
      await storage.engine.render("Sample Member", "closed");
      const html = await storage.engine.render(
        "Sample Card 074+*self+Sample Member+*follow",
        "closed",
      );
      // standard_rule? false (the preferer junction's left is not Set) but
      // preference? holds: 4 parts; trunk `Sample Card 074+*self`
      // IS Set-typed; the preferer card is User-typed (all.rb:53 arm 1).
      expect(helpContentOf(html)).toContain("ms-auto");
    } finally {
      storage.close();
    }
  });

  it("REFUSES the 4-part shape when the trunk is NOT Set-typed (the clause the widening skipped)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCodenameCards(storage);
      await seedCard(storage, { id: 26848, name: "Sample Card 074", typeId: BASIC_TYPE_ID });
      await seedCard(storage, { id: 30, name: "*self", codename: "self", typeId: SETTING_TYPE_ID });
      // the trunk junction is Basic-typed here - NOT Set-typed;
      // Ruby's fetch_type_id(name[0..-3]) == SetID fails
      await seedCard(storage, {
        id: 26849, leftId: 26848, rightId: 30, typeId: BASIC_TYPE_ID,
      });
      await seedCard(storage, {
        id: 393, name: "Sample Member", typeId: USER_TYPE_ID,
      });
      await seedCard(storage, {
        id: 26850, leftId: 26849, rightId: 393, typeId: 3,
      });
      await seedCard(storage, {
        id: 26851, name: "*follow", codename: "follow", typeId: SETTING_TYPE_ID,
      });
      await seedCard(storage, {
        id: 26852, leftId: 26850, rightId: 26851, typeId: 47,
      });
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();

      // warm the preferer into the render-card map (cache-only accessor;
      // see the USER-arm test above for why) so the refusal below comes
      // from the trunk clause, not a cold-map miss
      await storage.engine.render("Sample Member", "closed");
      const html = await storage.engine.render(
        "Sample Card 074+*self+Sample Member+*follow",
        "closed",
      );
      expect(helpContentOf(html)).not.toContain("ms-auto");
    } finally {
      storage.close();
    }
  });

  it("REFUSES when the preferer is neither User-typed nor codename all (all.rb:53)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCodenameCards(storage);
      await seedCard(storage, { id: 274, name: "*all", codename: "all", typeId: SET_TYPE_ID });
      await seedCard(storage, {
        id: 22720, name: "*follow", codename: "follow", typeId: SETTING_TYPE_ID,
      });
      await seedCard(storage, { id: 275, name: "Plain Set", typeId: SET_TYPE_ID });
      await seedCard(storage, { id: 900, name: "Not A User", typeId: BASIC_TYPE_ID });
      // trunk *all IS Set; the preferer "Not A User" is Basic-typed with no
      // codename - valid_preferer? fails both arms
      await seedCard(storage, { id: 901, leftId: 274, rightId: 900, typeId: 3 });
      await seedCard(storage, {
        id: 902, leftId: 901, rightId: 22720, typeId: 47,
      });
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();

      // warm the preferer into the render-card map (cache-only accessor;
      // see the USER-arm test above for why) so the refusal below comes
      // from valid_preferer?'s two arms, not a cold-map miss
      await storage.engine.render("Not A User", "closed");
      const html = await storage.engine.render("*all+Not A User+*follow", "closed");
      expect(helpContentOf(html)).not.toContain("ms-auto");
    } finally {
      storage.close();
    }
  });
});
