// Signed-in rendering parity, second part (recovery/parity-team/signed-in.md):
// the causes the first signed-in grade left open. Each case pins the bytes
// Ruby Decko renders for a signed-in actor on the capture deck.
//
//  * Pointer items typed by their list's item type (card-mod-collection
//    item.rb determine_item_view_options_type / new_unknown_item_args): a
//    wanted :link carries card[type] (base.rb specify_type_in_link!), and a
//    compound item whose item type has a *structure rule is virtual, hence
//    known (states.rb virtual?), while the name-only Card.known? its page
//    link asks still sees the default type (fetch/results.rb renew dups).
//  * An id mark naming a trashed card resolves to the trashed card's name in
//    the item slot's nest_name (item.rb nest_item: Card::Name[cardish].s).
//  * Type-plus-right type assignments (Role+*members is a List, a Bootswatch
//    skin's +*stylesheets is a Skin) type absent field cards.
//  * Image's :boxed is `unknown: true`: an absent image renders its box with
//    the unknown view inside (a skin's missing +Image offers its create link).
//  * Cardtype's :configure_button (cardtype.rb configure_link).

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

describe("signed-in shapes: typed list items, trashed members, field types, image boxes, configure", () => {
  let storage: RenderTestStorage | undefined;

  beforeAll(async () => {
    storage = await createRenderTestStorage();
    const s = storage;
    await seedCard(s, { id: 1, name: "Decko Bot", codename: DECKOBOT_CODENAME });
    await seedCard(s, { id: 2, name: "RichText", codename: "basic", typeId: 3 });
    await seedCard(s, { id: 3, name: "Cardtype", codename: "cardtype", typeId: 3 });
    await seedCard(s, { id: 4, name: "Anyone", codename: "anyone", typeId: 2 });
    await seedCard(s, { id: 5, name: "Anyone Signed In", codename: "anyone_signed_in", typeId: 2 });
    await seedCard(s, { id: 6, name: "List", codename: "list", typeId: 3 });
    await seedCard(s, { id: 7, name: "Search", codename: "search_type", typeId: 3 });
    await seedCard(s, { id: 8, name: "Project", typeId: 3 });
    await seedCard(s, { id: 9, name: "Role", codename: "role", typeId: 3 });
    await seedCard(s, { id: 23, name: "*set", codename: "set", typeId: 3 });
    await seedCard(s, { id: 24, name: "*setting", codename: "setting", typeId: 3 });
    await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 23 });
    await seedCard(s, { id: 11, name: "*read", codename: "read", typeId: 24 });
    await seedCard(s, { id: 12, name: "*update", codename: "update", typeId: 24 });
    await seedCard(s, { id: 13, name: "*create", codename: "create", typeId: 24 });
    await seedCard(s, { id: 14, name: "*type", codename: "type", typeId: 23 });
    await seedCard(s, { id: 15, name: "*structure", codename: "structure", typeId: 24 });
    await seedCard(s, { id: 16, name: "*right", codename: "right", typeId: 23 });
    await seedCard(s, { id: 17, name: "*content options", codename: "content_options", typeId: 24 });
    await seedCard(s, { id: 18, name: "*members", codename: "members", typeId: 24 });
    await seedCard(s, { id: 19, name: "Skin", codename: "skin", typeId: 3 });
    await seedCard(s, { id: 20, name: "Bootswatch skin", codename: "bootswatch_skin", typeId: 3 });
    await seedCard(s, { id: 21, name: "*stylesheets", codename: "stylesheets", typeId: 24 });
    await seedCard(s, { id: 22, name: "Image", codename: "image", typeId: 3 });
    // *all rules: everyone reads, signed-in actors create and update.
    await seedCard(s, { id: 30, leftId: 10, rightId: 11, dbContent: "[[Anyone]]" });
    await seedReference(s, 30, 4, "anyone");
    await seedCard(s, { id: 31, leftId: 10, rightId: 12, dbContent: "[[Anyone Signed In]]" });
    await seedReference(s, 31, 5, "anyone_signed_in");
    await seedCard(s, { id: 32, leftId: 10, rightId: 13, dbContent: "[[Anyone Signed In]]" });
    await seedReference(s, 32, 5, "anyone_signed_in");
    // Project+*type+*structure: a compound Project-typed card is virtual.
    await seedCard(s, { id: 40, leftId: 8, rightId: 14 });
    await seedCard(s, { id: 41, leftId: 40, rightId: 15, typeId: 2, dbContent: "{{+status}}" });
    // Tasks+*right+*content options = {"type":"Project"}: Plan+Tasks items are Project-typed.
    await seedCard(s, { id: 50, name: "Tasks", typeId: 2 });
    await seedCard(s, { id: 51, leftId: 50, rightId: 16 });
    await seedCard(s, { id: 52, leftId: 51, rightId: 17, typeId: 7, dbContent: '{"type":"Project"}' });
    await seedCard(s, { id: 53, name: "Plan", typeId: 2 });
    await seedCard(s, { id: 54, leftId: 53, rightId: 50, typeId: 6, dbContent: "Alpha+Beta\nGamma\n" });
    await seedCard(s, { id: 55, name: "Link Host", typeId: 2, dbContent: "{{Plan+Tasks|core|link}}" });
    await seedCard(s, { id: 56, name: "Bar Host", typeId: 2, dbContent: "{{Plan+Tasks|core|bar}}" });
    await seedCard(s, { id: 57, name: "Alpha", typeId: 2 });
    // An item line with a blank right part takes the list's name there.
    await seedCard(s, { id: 58, name: "Plan - B", typeId: 2 });
    await seedCard(s, { id: 59, leftId: 58, rightId: 50, typeId: 6, dbContent: "Alpha+\n" });
    await seedCard(s, { id: 67, name: "Blank Host", typeId: 2, dbContent: "{{Plan - B+Tasks|core|link}}" });
    // A role whose member list names a trashed card by id.
    await seedCard(s, { id: 60, name: "Crew", typeId: 9 });
    await seedCard(s, { id: 61, name: "Gone Member", typeId: 2, trash: true });
    await seedCard(s, { id: 62, leftId: 60, rightId: 18, typeId: 6, dbContent: "~61\n" });
    // A role without +*members, and a Bootswatch skin without +*stylesheets or +Image.
    await seedCard(s, { id: 63, name: "Empty Role", typeId: 9, dbContent: "{{+*members|titled}}" });
    await seedCard(s, { id: 64, name: "Plain Skin", typeId: 20, dbContent: "{{+*stylesheets|titled}}" });
    await seedCard(s, { id: 65, name: "Box Host", typeId: 2, dbContent: "{{Plain Skin+Image|boxed;type:Image}}" });
    // A cardtype for the configure button.
    await seedCard(s, { id: 66, name: "Log Entry", typeId: 3 });
    s.fetcher.installNameEnvironment();
    await s.fetcher.codenames.ensureLoaded();
    // The graded deck boot warms the lexicon, which keeps trashed names.
    await s.fetcher.warmLexicon([61]);
  });

  afterAll(() => {
    storage?.close?.();
  });

  const signedIn = (): RenderEngine => {
    const engine = new RenderEngine(new FetchEngine(storage!.counting));
    engine.viewer = { signedIn: true, actorId: 53 };
    engine.pageSession = { signedIn: true, actorId: 53 };
    return engine;
  };

  it("a wanted item link carries the list's item type; a virtual compound item links known", async () => {
    const html = await signedIn().render("Link Host", "core");
    expect(html).toContain('<a class="wanted-card" href="/Gamma?card%5Btype%5D=Project">');
    expect(html).toContain('<a class="known-card" href="/Alpha+Beta">');
  });

  it("a blank item extreme takes the list's name, and a known item keeps card[name] when Card.known?(name) is false", async () => {
    // item.rb clean_item_name -> contextual.rb absolutize_extremes; the
    // virtual Project item is known (no card[type]), but Card::Path asks
    // Card.known? by name, which sees the default type.
    const html = await signedIn().render("Blank Host", "core");
    expect(html).toContain(
      '<a class="known-card" href="/Alpha+Plan_B+Tasks?card%5Bname%5D=Alpha%2BPlan+-+B%2BTasks">',
    );
  });

  it("a virtual compound item renders its bar, and its page link answers by name (wanted)", async () => {
    const html = await signedIn().render("Bar Host", "core");
    expect(html).toContain('<div id="alpha-betum-bar-view" class="card-slot bar-view');
    expect(html).not.toContain('id="alpha-betum-mini_bar-view"');
    expect(html).toContain('<a class="full-page-link wanted-card" href="/Alpha+Beta">');
  });

  it("an id mark naming a trashed card nests under the trashed card's name", async () => {
    const html = await signedIn().render("Crew+*members", "core");
    expect(html).toContain("&quot;nest_name&quot;:&quot;Gone Member&quot;");
    expect(html).not.toContain("&quot;nest_name&quot;:&quot;~61&quot;");
  });

  it("an absent Role+*members is a List and an absent skin's +*stylesheets is a Skin", async () => {
    const role = await signedIn().render("Empty Role", "core");
    expect(role).toContain('<div id="empty_role-Xmember-unknown-view" class="card-slot unknown-view ALL ALL_PLUS TYPE-list');
    expect(role).toContain('data-card-type-name="List"');
    const skin = await signedIn().render("Plain Skin", "core");
    expect(skin).toContain('class="card-slot unknown-view ALL ALL_PLUS TYPE-skin');
    expect(skin).toContain('data-card-type-name="Skin"');
  });

  it("an absent image renders its box with the create link inside (image.rb :boxed, unknown: true)", async () => {
    const html = await signedIn().render("Box Host", "core");
    expect(html).toContain('<div title="Plain Skin" class="image-box medium"><div id="plain_skin-image-unknown-view" class="card-slot unknown-view');
    expect(html).toContain('<a rel="nofollow" class="unknown-link slotter" href="/Plain_Skin+Image/new_in_modal" data-remote="true">');
    const anonymous = await new RenderEngine(new FetchEngine(storage!.counting)).render("Box Host", "core");
    expect(anonymous).toContain('<div title="Plain Skin" class="image-box medium"></div>');
  });

  it("a cardtype's configure button links its rules board (cardtype.rb configure_link)", async () => {
    const html = await signedIn().render("Log Entry", "configure_button");
    expect(html).toBe(
      '<a class="configure-type-link ms-3 btn btn-secondary known-card" ' +
        'href="/Log_Entry/board?board%5Btab%5D=rules_tab&amp;set=Log+Entry%2B%2Atype">' +
        '<span class="card-title" title="Configure Log Entries">Configure Log Entries</span></a>',
    );
  });
});
