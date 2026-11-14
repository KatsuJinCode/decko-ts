// act155-w4-follow-overview-assembly.test.ts
//
// THE PIN: the "<User>+*follow" dashboard card renders the follow/ignore
// editor ASSEMBLED from the user's held follow preferences - the follow tab
// carries one row per held rule with its option - instead of an empty tab.
//
// THE RUBY SOURCE (card-mod-follow-0.20.0):
//   set/type_plus_right/user/follow.rb
//   :9-11   def virtual?; new?; end            (the dashboard with NO row is
//           KNOWN - states.rb:60-62 known? = real? || virtual?)
//   :15-19  def item_names; Card::Rule.preference_names user.name, "follow"
//           end   (lib/card/rule.rb:39-45: the preference-card name search
//           - "Set+User+*follow" for every set the user holds a rule on)
//   :39-43  view :core do tabs FOLLOW_TABS, "Follow", load: :lazy do
//           render_follow_tab end end   (the follow/ignore tab machinery)
//   :45-47  view :follow_tab; haml :follow_editor, items_method:
//           :following_rules_and_options   (follow_editor_helper.rb:7-11:
//           every preference card of the user with its option lines minus
//           *never; the rows render the right/follow module's follow_item
//           form, :67-78)
//
// THE ROW'S GAP (the roster's named gap 2, "the follow-overview assembly"):
// the port rendered the follow editor's SHELL without the assembled rows -
// and the member's own view answered 403, because the dashboard with no row
// took the unknown-card arm (the create form, denied for her).
//
// WHAT THIS TEST ASSERTS.
//   1. the dashboard's :core renders the tab machinery and the member's
//      held-rule row: the rule card's follow_item form (edit_card_<id>),
//      the option's button shape (the held rule renders the remove button),
//      and the rule set's follow label as the link text ("everything", the
//      *all set's short label);
//   2. the seam's assembly carries the preference name and option the way
//      Ruby's preference_names walk answers;
//   3. a user holding no rules renders the empty walk's "no entries" row
//      (follow_editor.haml's nil-rule arm) - the shell is not mistaken for
//      a missing assembly;
//   4. the dashboard seats KNOWN without a row (the virtual? override), so
//      the member's own view is her editor, not a 403 create-denial.

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

let storage: RenderTestStorage | undefined;

afterEach(() => {
  storage?.close();
  storage = undefined;
});

/** The ACT-155 probe deck's follow shape: the member holds the deck-wide
 *  rule (rows 909/910, option *always); the admin holds none. */
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

/** The follow mod, loaded, with the render seams bound. Resets everything. */
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

describe("the User+*follow dashboard assembles the held follow rules (row mx-155, gap 2)", () => {
  it("the member's :core renders the tabs and her held-rule row", async () => {
    storage = await boot();
    await withMods(async (engine) => {
      // the session actor is the member herself (current_user? - the
      // suggestions merge gate; the rows belong to the trunk whoever views)
      engine.viewer = { signedIn: true, actorId: 617 };
      engine.pageSession = engine.viewer;
      const body = await engine.render("Mira Member+*follow", "core", {
        absentCard: true,
        focalRoot: true,
      });
      // the follow/ignore tab machinery (user/follow.rb:39-43 tabs
      // FOLLOW_TABS, "Follow")
      expect(body).toContain("tab-pane-Follow");
      // the held rule's row: the preference card's follow_item form
      // (follow_editor.haml's subformat(rule_card).follow_item row)
      expect(body).toContain("edit_card_910");
      expect(body).toContain("*all+Mira Member+*follow");
      // the option's held shape: the remove button (right/follow.rb:91-105
      // follow_item_button - the rule already carries the condition, so
      // add_follow_item? is false and the button deletes)
      expect(body).toContain("btn-item-delete");
      expect(body).toContain("check</i>");
      // the link text is the rule set's follow label (right/follow.rb
      // :107-123 follow_item_link_text -> the option card's description ->
      // set_card.follow_label; the *all set's short label is "everything",
      // card-1.110.0 mod/core set_pattern/01_all.rb:4-6)
      expect(body).toContain(">everything</a>");
      // the unknown-card create form did not fire for the member's own view
      expect(body).not.toContain('id="new_card"');
    });
  });

  it("the seam's assembly carries the preference name and option (Ruby's preference_names walk)", async () => {
    storage = await boot();
    await withMods(async (engine) => {
      engine.viewer = { signedIn: true, actorId: 617 };
      engine.pageSession = engine.viewer;
      await engine.render("Mira Member+*follow", "core", {
        absentCard: true,
        focalRoot: true,
      });
      const bundle = engine.followRenderBundle?.();
      expect(bundle).toBeDefined();
      expect(bundle?.followTabRows.length).toBe(1);
      const row = bundle?.followTabRows[0];
      // the preference card name: "Set+User+*follow" composed
      // (lib/card/rule.rb:39-45 preference_names user.name, "follow")
      expect(row?.ruleCardName).toBe("*all+Mira Member+*follow");
      // the rule's option line (the rule card's content, brackets stripped)
      expect(row?.option).toBe("*always");
      // the row's rule set (ruleSetNameOf: the leading set part)
      expect(row?.ruleSetName).toBe("*all");
    });
  });

  it("a user holding no rules renders the empty walk's no-entries row", async () => {
    storage = await boot();
    await withMods(async (engine) => {
      engine.viewer = { signedIn: true, actorId: 618 };
      engine.pageSession = engine.viewer;
      const body = await engine.render("Ada Admin+*follow", "core", {
        absentCard: true,
        focalRoot: true,
      });
      // the tabs render (the assembly ran) and the walk's empty arm is the
      // literal "no entries" row (follow_editor.haml's -else arm)
      expect(body).toContain("tab-pane-Follow");
      expect(body).toContain("no entries");
      expect(body).not.toContain("edit_card_");
    });
  });

  it("the dashboard seats KNOWN without a row (the member's own view is her editor)", async () => {
    storage = await boot();
    await withMods(async (engine) => {
      engine.viewer = { signedIn: true, actorId: 617 };
      engine.pageSession = engine.viewer;
      await engine.render("Mira Member+*follow", "core", {
        absentCard: true,
        focalRoot: true,
      });
      const seated = engine.fetchRenderCard("Mira Member+*follow");
      expect(seated).toBeDefined();
      // states.rb:60-62: the set module's virtual? override makes the
      // row-less dashboard known, so the page never substitutes the create
      // form (the 403 the before-state answered the member)
      expect(seated?.unknown).toBe(false);
    });
  });
});
