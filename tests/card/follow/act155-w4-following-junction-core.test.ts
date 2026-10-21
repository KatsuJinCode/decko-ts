// act155-w4-following-junction-core.test.ts
//
// THE PIN: the "+*following" junction card is VIRTUAL-KNOWN and its :core
// view renders the two arms Ruby renders - the rule editor when the viewer
// is signed in over an existing left, the left's follower list (titled,
// link items) otherwise - instead of the unknown-card create form.
//
// THE RUBY SOURCE (card-mod-follow-0.20.0/set/right/following.rb):
//   :2    assign_type :list
//   :4-6  def virtual?; new?; end
//   :13-19 view :core do
//           if card.left && Auth.signed_in?
//             render_rule_editor
//           else
//             nest Card.fetch(card.name.left, :followers), view: :titled,
//               items: { view: :link }
//           end
//         end
// and the known? mechanism (card-1.110.0 mod/core/set/all/states.rb:60-62
// `known? = real? || virtual?`, the override registered from
// right/following.rb:4-6), the type assignment walk
// (advanced_api.rb:5-8 assign_type -> Type.assignment["Right::Following"];
// mod/core/set/all/type.rb:68-76 type_id_from_code).
//
// THE ROW'S GAP (the tranche-3 report's named remainder, item 3): the
// family's tranche 3 registered right/followers and
// type_plus_right/user/follow as virtual with their own views, and left
// right/following unregistered - "registering the virtual flag without
// the :core view would swap the honest create-form arm for a wrong-core
// render". Tranche 4 registers BOTH together: the virtual flag AND the
// two-armed :core.
//
// WHAT THIS TEST ASSERTS.
//   1. the signed-in :core over an EXISTING left renders the rule editor
//      (the same card's :rule_editor dispatch - right/following.rb:14-16),
//      never the create form;
//   2. the signed-out :core renders the LEFT's "+*followers" junction
//      titled with LINK items (right/following.rb:17-19) - the follower
//      names ride the seam's walk, each item a link;
//   3. the junction seats KNOWN without a row (the virtual? override,
//      states.rb:60-62 through the registry);
//   4. a junction whose left card does not exist takes the NEST arm even
//      SIGNED IN (the card.left guard answers nil first) and renders the
//      empty follower list (right/followers.rb:16-18 `left ? ... : ""`),
//      never a rule editor, never the create form;
//   5. the file's `assign_type :list` line rides the registration - the
//      type-assignment walk answers List for the junction
//      (Type.assignment["Right::Following"]).

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
import cardModEdit from "../../../src/card/mod-loader/mods/card-mod-edit.js";
import cardModContent from "../../../src/card/mod-loader/mods/card-mod-content.js";
import cardModPermissions from "../../../src/card/mod-loader/mods/card-mod-permissions.js";
import cardModRules from "../../../src/card/mod-loader/mods/card-mod-rules.js";
import { getSetTypeAssignment } from "../../../src/card/set-patterns/set-type-assignment.js";
import { RenderEngine } from "../../../src/card/render.js";
import { FetchEngine } from "../../../src/card/fetch.js";

let storage: RenderTestStorage | undefined;

afterEach(() => {
  storage?.close();
  storage = undefined;
});

/** The fixture shape the ACT-155 probe's own deck carries: the user Mira
 *  Member follows every card through the deck-wide rule
 *  (*all+Mira Member+*follow = *always, the fixture's rows 909/910), and
 *  the followed card is a plain RichText card. The *following tag and the
 *  follow-option cards join so the rule_form chain's walks resolve. */
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
  await seedCard(s, { id: 457, name: "*following", codename: "following", typeId: 14 });
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

/** The follow family's mod chain, loaded, with the process-wide render
 *  seams bound. The rule_form bytes live in the rules mod (whose chain
 *  loads edit/content/permissions first - the same load list the
 *  harness-probe suite rides, follow appended last, list first as the
 *  followers-view suite loads it). Resets everything. */
async function withMods(
  run: (engine: RenderEngine, mods: ModLoader) => Promise<void>,
): Promise<void> {
  const s = storage!;
  const fetcher = new FetchEngine(s.counting);
  const engine = new RenderEngine(fetcher);
  const mods = new ModLoader([
    { manifest: cardModList },
    { manifest: cardModEdit },
    { manifest: cardModContent },
    { manifest: cardModPermissions },
    { manifest: cardModRules },
    { manifest: cardModFollow },
  ]);
  mods.load();
  // the sync codename peeks the view bodies make (the rule set's follow
  // label reads the tag card's codename; the follow_item link's known
  // class reads the virtual-search family's codename) answer from the
  // warmed environment - the same warm a deck boot runs
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

describe("the +*following junction renders its own views (row mx-155, gap 3)", () => {
  it("the signed-in :core over an existing left renders the rule editor (right/following.rb:14-16)", async () => {
    storage = await boot();
    await withMods(async (engine) => {
      engine.viewer = { signedIn: true, actorId: 618 };
      engine.pageSession = engine.viewer;
      const body = await engine.render("Report Index+*following", "core", {
        absentCard: true,
        focalRoot: true,
      });
      // render_rule_editor: the same card's :rule_editor view - the
      // edit-rule wrap the view body emits, and the rules mod's rule_form
      // slot on the composed preference card (preference_name's
      // Auth.current.name ride - right/following.rb:40-43)
      expect(body).toContain('class="edit-rule"');
      expect(body).toContain('class="card-slot rule_form-view');
      expect(body).toContain('data-card-name="Report_Index+*self+Ada_Admin+*follow"');
      // no followers nest on this arm (the nest is the signed-out arm) and
      // no not-found substitution - the rule_form's own pointer EDITOR
      // classes (pointer-list-ul) are the form's, not the LIST core's
      expect(body).not.toContain("card-list card-list-link pointer-list");
      expect(body).not.toContain('class="pointer-item item-link"');
      expect(body).not.toContain("follow_item-view");
    });
  });

  it("the signed-out :core renders the left's followers nest titled with link items (right/following.rb:17-19)", async () => {
    storage = await boot();
    await withMods(async (engine) => {
      // signed OUT: no viewer, no page session (Auth.current_id ==
      // AnonymousID)
      const body = await engine.render("Report Index+*following", "core", {
        absentCard: true,
        focalRoot: true,
      });
      // the nested +*followers junction's LIST core (standard_pointer_core
      // - right/followers.rb:3 include_set Abstract::List), its wrapper
      // carrying the ITEM view the nest opts passed
      // ("card-list card-list-#{item_view} pointer-list", html_views.rb:9)
      expect(body).toContain("card-list card-list-link pointer-list");
      // each item is the follower as a LINK (items: { view: :link }) in
      // the pointer-item wrap (html_views.rb:28-30)
      expect(body).toContain('class="pointer-item item-link"');
      expect(body).toContain('href="/Mira_Member"');
      expect(body).toContain("Mira Member");
      // no rule editor signed out, no create form
      expect(body).not.toContain('class="edit-rule"');
      expect(body).not.toContain('id="new_card"');
    });
  });

  it("the junction seats KNOWN without a row (the set module's virtual? override, right/following.rb:4-6)", async () => {
    storage = await boot();
    await withMods(async (engine) => {
      engine.viewer = { signedIn: true, actorId: 618 };
      engine.pageSession = engine.viewer;
      await engine.render("Report Index+*following", "content", {
        absentCard: true,
        focalRoot: true,
      });
      const seated = engine.fetchRenderCard("Report Index+*following");
      expect(seated).toBeDefined();
      expect(seated?.unknown).toBe(false);
    });
  });

  it("a junction whose left does not exist takes the nest arm even signed in (the card.left guard) and renders the empty follower list", async () => {
    storage = await boot();
    await withMods(async (engine) => {
      engine.viewer = { signedIn: true, actorId: 618 };
      engine.pageSession = engine.viewer;
      const body = await engine.render("Zed Probe+*following", "core", {
        absentCard: true,
        focalRoot: true,
      });
      // the card.left guard answers nil for the missing trunk, so the
      // NEST arm runs: the left's +*followers junction titled, its LIST
      // core over the empty content (right/followers.rb:16-18
      // `left ? item_names.to_pointer_content : ""`)
      expect(body).toContain('class="card-list card-list-link pointer-list"></div>');
      expect(body).not.toContain("pointer-item");
      // never the rule editor (card.left is nil) and never the create form
      expect(body).not.toContain('class="edit-rule"');
      expect(body).not.toContain('id="new_card"');
    });
  });

  it("the type assignment rides the registration (right/following.rb:2 assign_type :list)", async () => {
    storage = await boot();
    await withMods(async () => {
      // the loader's SetLoader phase registered the file's assign_type
      // line: Type.assignment["Right::Following"] = "list"
      // (advanced_api.rb:5-8) - the walk the save/render new-card typing
      // consults (mod/core/set/all/type.rb:68-76)
      expect(getSetTypeAssignment("Right::Following")).toBe("list");
    });
  });
});
