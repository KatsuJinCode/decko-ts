// The set-module `virtual?` registry and the three follow-family surfaces it
// unlocks (ACT-155 / W4), measured against the stock Ruby oracle on the
// synthetic-v1 fixture (decko 0.20.0 / card 1.110.0 / card-mod-follow-0.20.0).
//
// WHAT THE ORACLE ANSWERS, byte for byte, for the addresses this file pins:
//
//   /Ada_Admin+followers      200  firstView=new     (the CREATE FORM)
//   /Ada_Admin+follow         200  firstView=new     (the CREATE FORM)
//   /Mira_Member+follow       200  firstView=new     (the CREATE FORM)
//   /Ada_Admin+*followers     200  firstView=titled  "Ada Admin+*followers Mira Member"
//   /Home+*followers          200  firstView=titled  "Home+*followers Mira Member"
//   /Ada_Admin+*followers/core 200 firstView=bar     "Mira Member"
//   /Ada_Admin+*follow        200  firstView=titled  "Ada Admin+*follow Follow Ignore no entries"
//   /Mira_Member+*follow      200  firstView=titled  "Mira Member+*follow Follow Ignore check everything"
//
// The STAR is the whole difference: `*follow`'s lexicon key is `*follow`, so
// the STARRED name resolves `Right::Follow` / `TypePlusRight::User::Follow`
// (card-1.110.0 mod/core/set_pattern/08_type_plus_right.rb:30-32 anchors on
// `left_type(card)` + the tag; lib/card/name/name_variants.rb:37-39 `codename`
// is `Codename[card_id]`, so only a real lexicon KEY resolves). The plain card
// named "follow" resolves nothing, so the UNSTARRED junction stays unknown and
// Ruby substitutes the create form (card-mod-format set/all/html/error.rb:82-84
// `page_view_for_unknown`).
//
// The `Mira Member` name in the oracle's followers list comes from the
// fixture's DECK-WIDE rule `*all+Mira Member+*follow` (fixture rows 909/910,
// db_content "*always"), which `follower_ids` reaches through the `*all` entry
// of `Home.set_names` = ["Home+*self", "RichText+*type", "*all"] — measured in
// the oracle's own console.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModFollow from "../../../src/card/mod-loader/mods/card-mod-follow.js";
import cardModList from "../../../src/card/mod-loader/mods/card-mod-list.js";
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModFormat from "../../../src/card/mod-loader/mods/card-mod-format.js";
import cardModCollection from "../../../src/card/mod-loader/mods/card-mod-collection.js";
import {
  clearVirtualSetModules,
  registerVirtualSetModule,
  virtualSetModuleShortnameList,
} from "../../../src/card/set-modules/virtual-set-modules.js";
import { DeckoName } from "../../../src/card/name.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename anchors. The KEYS matter: Decko singularizes a codename card's
  // key, so `*followers` keys as `*follower` (verified in the fixture deck and
  // in the oracle: the `+*followers` safe key is `RIGHT-follower`).
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 13 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 110, name: "*follow", key: "*follow", codename: "follow", typeId: 14 });
  // Decko SINGULARIZES a codename card's key, so `*followers` keys as
  // `*follower` — verified in the fixture deck and in the oracle's own slot
  // class (`RIGHT-follower`, not `RIGHT-followers`).
  await seedCard(s, { id: 130, name: "*followers", key: "*follower", codename: "followers", typeId: 14 });
  await seedCard(s, { id: 120, name: "*following", key: "*following", codename: "following", typeId: 14 });
  await seedCard(s, { id: 112, name: "*always", codename: "always", typeId: 14 });
  await seedCard(s, { id: 113, name: "*never", codename: "never", typeId: 14 });
  await seedCard(s, { id: 114, name: "*created", codename: "created", typeId: 14 });
  await seedCard(s, { id: 115, name: "*edited", codename: "edited", typeId: 14 });

  // cardtypes: RichText (the plain cards) and User (the follow dashboard's left)
  await seedCard(s, { id: 2, name: "RichText", codename: "rich_text", typeId: 13 });
  await seedCard(s, { id: 3, name: "User", codename: "user", typeId: 13 });
  await seedCard(s, { id: 4, name: "List", codename: "list", typeId: 13 });
  await seedCard(s, { id: 5, name: "Pointer", codename: "pointer", typeId: 13 });

  // actors
  await seedCard(s, { id: 300, name: "Mira Member", typeId: 3 });
  await seedCard(s, { id: 301, name: "Ada Admin", typeId: 3 });

  // the deck-wide follow rule: *all + Mira Member (a Set), with +*follow
  // content "*always" — the fixture's rows 909/910, the source of the
  // "Mira Member" entry in the oracle's followers list.
  await seedCard(s, { id: 400, name: "*all+Mira Member", leftId: 10, rightId: 300, typeId: 13 });
  // a plain (non-User) card to hang a followers list on, with its self set
  // (follower_ids.rb:97 `set_names` walks `<card>+*self`, `<Type>+*type`,
  // `*all`; MEASURED in the oracle: `Home set_names = ["Home+*self",
  // "RichText+*type", "*all"]`)
  await seedCard(s, { id: 200, name: "Home", typeId: 2 });
  await seedCard(s, { id: 201, name: "Home+*self", leftId: 200, rightId: 11, typeId: 13 });
  await seedCard(s, {
    id: 410, name: "*all+Mira Member+*follow", leftId: 400, rightId: 110, typeId: 14,
    dbContent: "*always",
  });

  // the host's page seat: without it render() refuses to seat an ABSENT card,
  // and every address under test here is an unsaved junction (that is the
  // whole point of `virtual?`).
  s.engine.renderAbsentCards = true;
  // the name environment the module-key walk reads (fetch.ts
  // installNameEnvironment: the SYNC lexicon/codename adapters the codename
  // resolution in set-keys-to-modules.ts needs — `RIGHT-Xfollower` -> the
  // `*followers` card -> codename `followers` -> `Right::Followers`).
  await s.fetcher.warmLexicon([10, 11, 13, 14, 110, 120, 130, 112, 113, 114, 115, 2, 3, 4, 5, 200, 300, 301, 400, 410]);
  s.fetcher.installNameEnvironment();
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

beforeEach(() => {
  // ModLoader#reset clears the virtual registry (the loader's own
  // load-generation reset), so the NEXT loadMod must re-register.
  loader?.reset();
  loader = undefined;
});

async function loadMod(): Promise<void> {
  if (loader !== undefined) return;
  loader = new ModLoader([
    { manifest: cardModFormat },
    { manifest: cardModCollection },
    { manifest: cardModEdit },
    { manifest: cardModList },
    { manifest: cardModFollow },
  ]);
  loader.load();
  bindModLoaderToEngine(storage!, loader!);
  await loader.installInto(modEngineHost(storage!.engine, storage!.fetcher));
}

describe("the set-module virtual? registry (states.rb:44-50 known? : real? || virtual?)", () => {
  it("registers module shortnames, not set paths", () => {
    registerVirtualSetModule("right/followers");
    registerVirtualSetModule("type_plus_right/user/follow");
    expect(virtualSetModuleShortnameList()).toEqual([
      "Right::Followers",
      "TypePlusRight::User::Follow",
    ]);
    clearVirtualSetModules();
    expect(virtualSetModuleShortnameList()).toEqual([]);
  });

  it("the follow mod declares virtual? on exactly the four Ruby files that do", async () => {
    await loadMod();
    const registered = new Set(virtualSetModuleShortnameList());
    // right/followers.rb:22-24, right/following.rb:4-6,
    // type_plus_right/user/follow.rb:8-10
    expect(registered.has("Right::Followers")).toBe(true);
    expect(registered.has("Right::Following")).toBe(true);
    expect(registered.has("TypePlusRight::User::Follow")).toBe(true);
    // right/follow.rb declares NO virtual? (its card stays unknown)
    expect(registered.has("Right::Follow")).toBe(false);
  });

  it("assignsType: list is the include_set Abstract::List assignment, declared on the file", async () => {
    await loadMod();
    const { getSetTypeAssignment } = await import(
      "../../../src/card/set-patterns/set-type-assignment.js"
    );
    // MEASURED: the oracle renders /Home+*followers as TYPE-list.
    expect(getSetTypeAssignment("Right::Followers")).toBe("list");
    expect(getSetTypeAssignment("TypePlusRight::User::Follow")).toBe("list");
  });
});

describe("ACT-155 W4 — the followers view (right/followers.rb:13-19)", () => {
  it("the starless address is NOT the followers card (oracle: firstView=new)", async () => {
    await loadMod();
    const { isVirtualSetCardName } = await import(
      "../../../src/card/set-modules/virtual-set-modules.js"
    );
    // `followers` is a plain card, not a lexicon key, so Ruby builds no
    // module key and the card stays UNKNOWN; page_view_for_unknown then
    // substitutes :new. MEASURED: the oracle renders the create form here.
    expect(
      isVirtualSetCardName(DeckoName.parse("Ada Admin+followers"), { leftTypeName: "User" }),
    ).toBe(false);
  });

  it("the STARRED address renders the list family's pointer-list wrapper (no create form)", async () => {
    await loadMod();
    const s = storage!;
    const html = await s.engine.render("Home+*followers", "core");
    // `left ? item_names.to_pointer_content : ""` rendered through the list
    // family's card-list pointer-list wrapper (card-mod-list
    // set/abstract/01_list/html_views.rb:6-13).
    expect(html).toContain("pointer-list");
    expect(html).not.toContain("create-submit-button");
  });

  it("the followers ITEM NAMES walk the left card's follower set (follower_ids.rb:63-69)", async () => {
    await loadMod();
    const s = storage!;
    const { prepareFollowRender } = await import(
      "../../../src/card/follow/follow-render-seam.js"
    );
    // render first so the absent junction is seated on the render-card map
    await s.engine.render("Home+*followers", "core");
    const root = s.engine.fetchRenderCard("Home+*followers");
    expect(root).toBeDefined();
    const bundle = await prepareFollowRender(
      s.fetcher,
      s.engine.pageSession,
      root!,
      "core",
    );
    // follower_names = followers.map(&:name) over direct + indirect
    // follower_ids (follower_ids.rb:53-55, :63-69), with each id resolved to
    // its card name and de-duplicated.
    // follower_names = followers.map(&:name) over direct + indirect
    // follower_ids — the deck-wide `*all+Mira Member+*follow` rule is reached
    // through the `*all` entry of the card's set_names, which is exactly what
    // the oracle console measured on this deck (`Home follower_names =
    // ["Mira Member"]`, `Home set_names = ["Home+*self", "RichText+*type",
    // "*all"]`).
    expect(bundle.followerNames).toEqual(["Mira Member"]);
    // ids resolve to names one-for-one (no duplicate names, no unresolved id)
    expect(new Set(bundle.followerNames).size).toBe(bundle.followerNames.length);
    // followerCount stays 0 on a :core render because Ruby reads
    // follower_ids.size only on the board's pill (followers_board_link), and
    // the seam gates that walk on follow_section/engage_tab; the LIST and the
    // PILL read the same resolveFollowers walk, so they cannot disagree.
    expect(bundle.followerCount).toBe(0);
  });

  it("a card with no followers renders an empty pointer list, not a create form", async () => {
    await loadMod();
    const s = storage!;
    await seedCard(s, { id: 500, name: "Lonely Card", typeId: 2 });
    const html = await s.engine.render("Lonely Card+*followers", "core");
    expect(html).toContain("pointer-list");
    expect(html).not.toContain("card-form");
  });
});

describe("ACT-155 W4 — the all-followed-cards view (type_plus_right/user/follow.rb:13-19)", () => {
  it("the starless address is NOT the dashboard (oracle: firstView=new)", async () => {
    await loadMod();
    const { isVirtualSetCardName } = await import(
      "../../../src/card/set-modules/virtual-set-modules.js"
    );
    expect(
      isVirtualSetCardName(DeckoName.parse("Mira Member+follow"), { leftTypeName: "User" }),
    ).toBe(false);
  });

  it("the STARRED address renders the Follow/Ignore tabs", async () => {
    await loadMod();
    const s = storage!;
    const html = await s.engine.render("Ada Admin+*follow", "core");
    // user/follow.rb:39-43 FOLLOW_TABS — the tab machinery over the static hash
    expect(html).toContain("Follow");
    expect(html).toContain("Ignore");
  });

  it("the user's follow PREFERENCE RULE CARDS are the dashboard's items", async () => {
    await loadMod();
    const s = storage!;
    const { prepareFollowRender } = await import(
      "../../../src/card/follow/follow-render-seam.js"
    );
    // render first so the absent junction is seated on the render-card map
    await s.engine.render("Mira Member+*follow", "content");
    const root = s.engine.fetchRenderCard("Mira Member+*follow");
    expect(root).toBeDefined();
    const bundle = await prepareFollowRender(
      s.fetcher,
      s.engine.pageSession,
      root!,
      "content",
    );
    // user/follow.rb:13-19 `Card::Rule.preference_names user.name, "follow"`
    // — the `[Set]+[User]+:follow` cards the user holds. The member holds the
    // deck-wide `*all+Mira Member+*follow` (fixture rows 909/910).
    expect(bundle.followPreferenceNames).toContain("*all+Mira Member+*follow");
  });

  it("the follow_tab view renders the editor for the starred dashboard", async () => {
    await loadMod();
    const s = storage!;
    const html = await s.engine.render("Mira Member+*follow", "follow_tab");
    // follow_editor.haml's wrapper: `.pointer-list-editor` + the
    // `%ul.delete-list.list-group` of rows (or "no entries").
    expect(html).toContain("pointer-list-editor");
  });

  it("the content view is the list family's pointer list, not a create form", async () => {
    await loadMod();
    const s = storage!;
    const html = await s.engine.render("Mira Member+*follow", "content");
    expect(html).toContain("pointer-list");
    expect(html).not.toContain("create-submit-button");
  });

  it("a user with no follow rules gets an empty pointer list", async () => {
    await loadMod();
    const s = storage!;
    const html = await s.engine.render("Ada Admin+*follow", "content");
    expect(html).toContain("pointer-list");
    expect(html).not.toContain("*all+Mira Member+*follow");
  });
});

describe("the name predicate (virtual-set-modules.ts)", () => {
  it("is false for a simple name (states.rb:47 name.simple? short-circuits false)", async () => {
    await loadMod();
    const { isVirtualSetCardName } = await import(
      "../../../src/card/set-modules/virtual-set-modules.js"
    );
    expect(isVirtualSetCardName(DeckoName.parse("Home"))).toBe(false);
  });

  it("is false for the UNSTARRED junction (no lexicon key -> no module key)", async () => {
    await loadMod();
    const { isVirtualSetCardName } = await import(
      "../../../src/card/set-modules/virtual-set-modules.js"
    );
    // The tag "follow" is a plain card, not a lexicon key: Ruby's
    // `anchor_codenames` breaks and builds no module key, so the card stays
    // unknown and the page renders the create form.
    expect(isVirtualSetCardName(DeckoName.parse("Ada Admin+follow"), { leftTypeName: "User" })).toBe(
      false,
    );
    expect(
      isVirtualSetCardName(DeckoName.parse("Home+followers"), { leftTypeName: "RichText" }),
    ).toBe(false);
  });

  it("is true for the STARRED junction over a set-typed right", async () => {
    await loadMod();
    const { isVirtualSetCardName } = await import(
      "../../../src/card/set-modules/virtual-set-modules.js"
    );
    expect(
      isVirtualSetCardName(DeckoName.parse("Home+*followers"), { leftTypeName: "RichText" }),
    ).toBe(true);
    expect(
      isVirtualSetCardName(DeckoName.parse("Mira Member+*follow"), { leftTypeName: "User" }),
    ).toBe(true);
  });
});

describe("the base-format input view off the list family (card-mod-list inputView)", () => {
  it("a non-list card's input view answers the base editor, not a 500", async () => {
    await loadMod();
    const s = storage!;
    // Ruby: card-mod-edit set/all/editor.rb:32-36 view :input reaches
    // rich_text_input (:42-44) -> the configured editor. MEASURED: the oracle
    // answers /Ada_Admin+follow/input with the tinymce textarea.
    const html = await s.engine.render("Home", "input");
    expect(html).toContain("d0-card-content");
    expect(html).toContain("textarea");
  });
});