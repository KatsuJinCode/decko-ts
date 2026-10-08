// configure-button-nested-verdict.test.ts — the configure_button permission
// gate judges every card it renders for, not only the page's main card.
//
// card-mod-format set/type/cardtype.rb:57-63:
//   def can_configure?
//     Card.fetch(card, :type, :structure, new: {}).ok? :update
//   end
//   view :configure_button, cache: :never, denial: :blank, perms: :can_configure?
//
// Ruby evaluates `perms:` on the card the view renders for, so a cardtype
// nested in another card's content (a cardtype listed on the Cardtype page,
// one nested in a tag structure) is judged on ITS OWN `+*type+*structure`
// card. The port precomputes the verdict before the synchronous render; it
// once did so only for the page's main card, and an unverified predicate
// allows, so a signed-out visitor saw the nested card's "configure" button
// where Ruby renders nothing.

import { afterEach, describe, expect, it } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModHistory from "../../../src/card/mod-loader/mods/card-mod-history.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";

let storage: RenderTestStorage | undefined;

afterEach(() => {
  storage?.close();
  storage = undefined;
});

/** A deck with an anonymous viewer, `*all+*read` = Anyone, and
 *  `*all+*update` = the given party. "Widget" is a Cardtype-typed card
 *  whose content nests `{{_|configure_button}}`; "Host" is a plain card
 *  that nests Widget. */
async function deck(updateParty: "Anyone" | "Administrator"): Promise<RenderTestStorage> {
  const s = await createRenderTestStorage();
  await seedCard(s, { id: 1, name: "Decko Bot", typeId: 2 });
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 8, name: "*type", codename: "type", typeId: 14 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 15, name: "Anonymous", codename: "anonymous", typeId: 2 });
  await seedCard(s, { id: 16, name: "*read", codename: "read", typeId: 14 });
  await seedCard(s, { id: 18, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedCard(s, { id: 19, name: "Administrator", codename: "administrator", typeId: 2 });
  await seedCard(s, { id: 17, name: "*all+*read", leftId: 10, rightId: 16, typeId: 14, dbContent: "[[Anyone]]" });
  await seedReference(s, 17, 18, "anyone");
  await seedCard(s, {
    id: 20,
    name: "*all+*update",
    leftId: 10,
    rightId: 12,
    typeId: 14,
    dbContent: `[[${updateParty}]]`,
  });
  await seedReference(s, 20, updateParty === "Anyone" ? 18 : 19, updateParty.toLowerCase());
  await seedCard(s, { id: 22, name: "Cardtype", typeId: 2 });
  await seedCard(s, { id: 30, name: "Widget", typeId: 22, dbContent: "{{_|configure_button}}" });
  await seedCard(s, { id: 40, name: "Host", typeId: 2, dbContent: "before {{Widget|core}} after" });

  const loader = new ModLoader([{ manifest: cardModHistory }, { manifest: cardModFormat }]);
  loader.load();
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  bindModLoaderToEngine(s, loader);
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
  return s;
}

describe("configure_button judges can_configure? on every card it renders for", () => {
  it("a nested cardtype's button is blank for a viewer who cannot update its +*type+*structure", async () => {
    storage = await deck("Administrator");
    const html = await storage.engine.render("Host", "core");
    expect(html).toContain("before");
    expect(html).toContain("after");
    expect(html).not.toContain("configure-button");
    expect(html).not.toContain("configure-type-link");
  });

  it("the same nest renders the button when the viewer can update its +*type+*structure", async () => {
    storage = await deck("Anyone");
    const html = await storage.engine.render("Host", "core");
    // The button's body is Ruby's configure_link helper with the button
    // class (card-mod-format set/type/cardtype.rb:61-75): the rules-board
    // anchor "configure-type-link ms-3" plus "btn btn-secondary", titled
    // "Configure %{cardname}" over the pluralized name.
    expect(html).toContain('configure-type-link ms-3 btn btn-secondary');
    expect(html).toContain('title="Configure Widgets"');
    expect(html).toContain('href="/Widget/board?board%5Btab%5D=rules_tab&amp;set=Widget%2B%2Atype"');
  });

  it("the page's main card is judged the same way", async () => {
    storage = await deck("Administrator");
    expect(await storage.engine.render("Widget", "core")).not.toContain("configure-button");
  });
});
