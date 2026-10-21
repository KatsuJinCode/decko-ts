// act155-w4-followers-view-content.test.ts
//
// THE PIN: the "+*followers" junction card renders its follower list the
// way Ruby renders it - the LIST core over the follower NAMES - instead of
// the unknown-card create form.
//
// THE RUBY SOURCE (card-mod-follow-0.20.0/set/right/followers.rb):
//   :3   include_set Abstract::List
//   :6-8 view :core, cache: :never do super() end   (the LIST core:
//        card-mod-list set/abstract/01_list/html_views.rb:6-13
//        standard_pointer_core - the card-list pointer-list wrapper whose
//        items nest each follower)
//   :16-18  def content; left ? item_names.to_pointer_content : ""; end
//   :20-22  def item_names; left ? left.follow_set_card.prototype.
//           follower_names : []; end
//   :22-24  def virtual?; new?; end
// and the names themselves (card-mod-follow set/all/follow/follower_ids.rb
// :53-55 follower_names = followers.map(&:name), :63-72 follower_ids =
// direct_follower_ids + indirect_follower_ids over each containing set's
// *follow preferences, lib/card/rule.rb:47-51 all_user_ids_with_rule_for).
//
// WHY THE JUNCTION IS A CARD AT ALL: states.rb:44-50 virtual? is OVERRIDDEN
// by the set module, so the junction with NO database row is KNOWN
// (states.rb:60-62 known? = real? || virtual?) and its page renders its own
// views - not card-mod-format set/all/html/error.rb:81-86
// page_view_for_unknown's create form (`ok?(:create) ? :new : super`).
//
// THE ROW'S GAP (the roster's named gap 1): the port registered the
// followers :core as a passthrough to the BASE core over the junction's
// stored content - a junction has none - so the view rendered the card's
// title and nothing else.
//
// WHAT THIS TEST ASSERTS.
//   1. the follower walk answers the follower names (the same walk the
//      notifications use);
//   2. the junction's content view carries the LIST core's pointer-list
//      wrapper AND the follower name (the two halves: include_set
//      Abstract::List + def content);
//   3. the junction seats KNOWN (unknown false - the virtual? override);
//   4. a junction whose left card does not exist renders the empty pointer
//      list (Ruby's `left ? ... : ""` arm) and never an item;
//   5. a junction NO set module makes virtual still seats unknown (the
//      create-form arm stays for it) - the registry is set-scoped, not
//      global.

import { describe, it, expect, afterEach } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import {
  ModLoader,
  modEngineHost,
  setDefaultModLoader,
} from "../../../src/card/mod-loader.js";
import {
  setDefaultContentOverrideRegistry,
} from "../../../src/card/render/content-overrides.js";
import {
  setDefaultVirtualCardRegistry,
} from "../../../src/card/render/virtual-card-registry.js";
import cardModFollow from "../../../src/card/mod-loader/mods/card-mod-follow.js";
import cardModList from "../../../src/card/mod-loader/mods/card-mod-list.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";
import { resolveFollowers } from "../../../src/card/notify/follower-resolver.js";

let storage: RenderTestStorage | undefined;

afterEach(() => {
  storage?.close();
  storage = undefined;
});

/** The fixture shape the ACT-155 probe's own deck carries: the user Mira
 *  Member follows every card through the deck-wide rule
 *  (*all+Mira Member+*follow = *always, the fixture's rows 909/910), and
 *  the followed card is a plain RichText card. */
async function boot(): Promise<RenderTestStorage> {
  const s = await createRenderTestStorage();
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 4, name: "List", codename: "list", typeId: 2 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 12, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 18, name: "User", codename: "user", typeId: 2 });
  await seedCard(s, { id: 455, name: "*follow", codename: "follow", typeId: 14 });
  await seedCard(s, { id: 456, name: "*always", codename: "always", typeId: 14 });
  await seedCard(s, { id: 617, name: "Mira Member", typeId: 18 });
  await seedCard(s, { id: 618, name: "Ada Admin", typeId: 18 });
  // the followed card (a plain RichText card, id 908 as in the fixture)
  await seedCard(s, { id: 908, name: "Report Index", typeId: 2 });
  // the *all set's user junction + the deck-wide follow preference
  await seedCard(s, {
    id: 909,
    name: "*all+Mira Member",
    leftId: 10,
    rightId: 617,
    typeId: 13,
  });
  await seedCard(s, {
    id: 910,
    name: "*all+Mira Member+*follow",
    leftId: 909,
    rightId: 455,
    typeId: 4,
    dbContent: "*always",
  });
  return s;
}

/** The follow + list mods, loaded, with the process-wide render seams bound
 *  (the content override registry the followers' `def content` registers
 *  into; the virtual-card registry the `def virtual?` flags register into;
 *  the default loader the wrap/super helpers read). Resets everything. */
async function withMods(
  run: (engine: RenderEngine, mods: ModLoader) => Promise<void>,
): Promise<void> {
  const s = storage!;
  const fetcher = new FetchEngine(s.counting);
  const engine = new RenderEngine(fetcher);
  const mods = new ModLoader([{ manifest: cardModList }, { manifest: cardModFollow }]);
  mods.load();
  // the sync codename peeks the view bodies make (the rule set's follow
  // label reads the tag card's codename; the follow_item link's known class
  // reads the virtual-search family's codename) answer from the warmed
  // environment - the same warm a deck boot runs
  // (fetch.ts#installNameEnvironment + codenames.ensureLoaded()).
  // "First engine wins" (fetch.ts:199): a previous test's FetchEngine may
  // have installed the process-global environment over ITS instances - the
  // explicit install rebinds it to THIS fetcher before the warm.
  fetcher.installNameEnvironment();
  await fetcher.codenames.ensureLoaded();
  await fetcher.lexicon.id("*all");
  await fetcher.lexicon.id("*by name");
  setDefaultModLoader(mods);
  setDefaultContentOverrideRegistry(mods.contentOverrideRegistry());
  setDefaultVirtualCardRegistry(mods.virtualCardRegistry());
  try {
    engine.modLoader = mods;
    await mods.installInto(modEngineHost(engine, fetcher));
    await run(engine, mods);
  } finally {
    setDefaultModLoader(undefined);
    setDefaultContentOverrideRegistry(undefined);
    setDefaultVirtualCardRegistry(undefined);
    mods.reset();
  }
}

describe("the +*followers junction renders the follower list (row mx-155, gap 1)", () => {
  it("the follower walk answers the follower names of the followed card", async () => {
    storage = await boot();
    const s = storage;
    const fetcher = new FetchEngine(s.counting);
    const left = await fetcher.fetchByName("Report Index");
    expect(left?.id).toBe(908);
    const refs = await resolveFollowers(fetcher, left!.id!);
    const names: string[] = [];
    for (const ref of refs) {
      const card = await fetcher.fetchById(ref.followerId);
      if (card?.name?.s !== undefined) names.push(card.name.s);
    }
    // the deck-wide *all rule (*always) applies to everyone: Mira follows
    // the card through it (follower_ids.rb:95-114 direct_follower_ids over
    // the card's set names, the *all set among them)
    expect(names).toContain("Mira Member");
  });

  it("the junction's content view is the LIST core over the follower names", async () => {
    storage = await boot();
    await withMods(async (engine) => {
      engine.viewer = { signedIn: true, actorId: 618 };
      engine.pageSession = engine.viewer;
      const body = await engine.render("Report Index+*followers", "content", {
        absentCard: true,
        focalRoot: true,
      });
      // the LIST core's wrapper (right/followers.rb:3 include_set
      // Abstract::List + :6-8 view :core super() -> standard_pointer_core)
      expect(body).toContain("card-list card-list-bar pointer-list");
      // the content override's item: the follower NAME
      // (right/followers.rb:16-22 def content -> item_names ->
      // follower_names)
      expect(body).toContain("Mira Member");
      // the unknown-card create form did NOT fire (states.rb:60-62 known?)
      expect(body).not.toContain('id="new_card"');
    });
  });

  it("the junction seats KNOWN without a row (the set module's virtual? override)", async () => {
    storage = await boot();
    await withMods(async (engine) => {
      engine.viewer = { signedIn: true, actorId: 618 };
      engine.pageSession = engine.viewer;
      await engine.render("Report Index+*followers", "content", {
        absentCard: true,
        focalRoot: true,
      });
      const seated = engine.fetchRenderCard("Report Index+*followers");
      expect(seated).toBeDefined();
      expect(seated?.unknown).toBe(false);
    });
  });

  it("a junction whose left does not exist renders the empty pointer list (the left-nil arm)", async () => {
    storage = await boot();
    await withMods(async (engine) => {
      engine.viewer = { signedIn: true, actorId: 618 };
      engine.pageSession = engine.viewer;
      const body = await engine.render("Zed Probe+*followers", "content", {
        absentCard: true,
        focalRoot: true,
      });
      // the LIST core still dispatches (the junction is virtual), over the
      // empty content (right/followers.rb:16-18 `left ? ... : ""`)
      expect(body).toContain('class="card-list card-list-bar pointer-list"></div>');
      expect(body).not.toContain("pointer-item");
      expect(body).not.toContain('id="new_card"');
    });
  });

  it("a junction no set module makes virtual still seats unknown (the registry is set-scoped)", async () => {
    storage = await boot();
    await withMods(async (engine) => {
      engine.viewer = { signedIn: true, actorId: 618 };
      engine.pageSession = engine.viewer;
      await engine.render("Report Index+*unclaimed_field_probe", "content", {
        absentCard: true,
        focalRoot: true,
      });
      const seated = engine.fetchRenderCard("Report Index+*unclaimed_field_probe");
      expect(seated).toBeDefined();
      // no registered virtual? override covers this right: the absent card
      // stays unknown and the unknown-card arm applies to it
      expect(seated?.unknown).toBe(true);
    });
  });
});
