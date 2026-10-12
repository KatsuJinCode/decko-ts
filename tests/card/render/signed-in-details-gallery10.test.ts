// Signed-in-details lane: the unknown nest-miss create gate types the miss
// card by its LEFT card's type (the nest-fetch semantics the captures pin),
// never through the Card.new structure hop.
//
// Ruby shape (paired corpus, mythicity-research page, member 2303): the
// page renders the Research-typed card's type structure, whose content
// nests {{+gallery10}}. The nest miss "Myth Tag+gallery10" is typed by the
// LEFT's type ("Research"), whose *type+*structure rule card is
// RichText-typed — type_id_from_template answers that rule card's own type
// (templating.rb:52-59 + type.rb:58-66) — so the miss card is RichText,
// its *type+*create candidate misses, and *all plus+*create "_left"
// inherits the left's *all+*update "Anyone Signed In": the :unknown view's
// createable gate renders the add-box link.
//
// The regression this pins: seating the miss through newCardDefaultType
// WITHOUT the left's type name anchors the *type plus right candidate on
// the registry's RichText fallback, finds a RichText+gallery10+*type plus
// right+*structure rule that IS HTML-typed, seats HTML, and the
// HTML+*type+*create "Shark" rule denies a member the capture permits.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { DECKOBOT_CODENAME } from "../../../src/card/auth/actor.js";

describe("unknown nest-miss create gate types the miss by its left's type", () => {
  let storage: RenderTestStorage | undefined;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    const s = storage;
    await seedCard(s, { id: 1, name: "Decko Bot", codename: DECKOBOT_CODENAME });
    await seedCard(s, { id: 2, name: "RichText", codename: "basic", typeId: 3, typeName: "Cardtype" });
    await seedCard(s, { id: 3, name: "Cardtype", typeId: 3, typeName: "Cardtype" });
    await seedCard(s, { id: 4, name: "Anyone", codename: "anyone", typeId: 2 });
    await seedCard(s, { id: 5, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 2 });
    await seedCard(s, { id: 6, name: "Shark", typeId: 2 });
    await seedCard(s, { id: 7, name: "HTML", typeId: 3, typeName: "Cardtype" });
    await seedCard(s, { id: 8, name: "Research", typeId: 3, typeName: "Cardtype" });
    await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
    await seedCard(s, { id: 11, name: "*read", codename: "read", typeId: 14 });
    await seedCard(s, { id: 12, name: "*create", codename: "create", typeId: 14 });
    await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
    await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
    await seedCard(s, { id: 15, name: "*structure", codename: "structure", typeId: 14 });
    await seedCard(s, { id: 16, name: "*default", codename: "default", typeId: 14 });
    await seedCard(s, { id: 17, name: "*type plus right", codename: "type_plus_right", typeId: 13 });
    await seedCard(s, { id: 18, name: "*update", codename: "update", typeId: 14 });
    await seedCard(s, { id: 19, name: "*type", codename: "type", typeId: 14 });
    await seedCard(s, { id: 20, name: "*all plus", codename: "all_plus", typeId: 13 });
    await seedCard(s, { id: 30, leftId: 10, rightId: 11, dbContent: "[[Anyone]]" });
    await seedReference(s, 30, 4, "anyone");
    await seedCard(s, { id: 31, leftId: 10, rightId: 12, dbContent: "[[Anyone Signed In]]" });
    await seedReference(s, 31, 5, "anyone_signed_in");
    await seedCard(s, { id: 32, leftId: 10, rightId: 18, dbContent: "[[Anyone Signed In]]" });
    await seedReference(s, 32, 5, "anyone_signed_in");
    // *all plus+*create "_left": the compound's create inherits the left's
    // own update parties (the corpus's rule 6567 shape).
    await seedCard(s, { id: 33, leftId: 20, rightId: 12, dbContent: "_left" });
    // *all+*default: typed RichText, empty content (the corpus's card 28).
    await seedCard(s, { id: 35, leftId: 10, rightId: 16, typeId: 2, dbContent: "" });
    await seedCard(s, { id: 21, name: "gallery10", typeId: 2 });
    await seedCard(s, { id: 42, name: "RichText+gallery10", typeId: 13 });
    await seedCard(s, { id: 43, name: "RichText+gallery10+*type plus right", typeId: 13 });
    await seedCard(s, { id: 40, name: "RichText+gallery10+*type plus right+*structure", typeId: 7, dbContent: "<table><tr><td>gallery</td></tr></table>" });
    await seedCard(s, { id: 41, name: "HTML+*type+*create", typeId: 6, dbContent: "[[Shark]]" });
    await seedReference(s, 41, 6, "shark");
    await seedCard(s, { id: 50, name: "Member", typeId: 2 });
    await seedCard(s, { id: 70, name: "Myth Tag", typeId: 8, dbContent: "{{+gallery10}}" });
    await seedCard(s, { id: 51, name: "Research+*type+*structure", typeId: 2, dbContent: "{{+gallery10}}" });
    s.fetcher.installNameEnvironment();
    await s.fetcher.codenames.ensureLoaded();
  });

  afterAll(() => {
    storage?.close?.();
  });

  it("renders the create link the capture renders for a signed-in member", async () => {
    const engine = new RenderEngine(new FetchEngine(storage!.counting));
    engine.viewer = { signedIn: true, actorId: 50 };
    const html = await engine.render("Myth Tag", "core");
    expect(html).toContain('id="myth_tag-gallery10-unknown-view"');
    expect(html).toContain("unknown-link");
    expect(html).toContain("/Myth_Tag+gallery10/new_in_modal");
  });
});
