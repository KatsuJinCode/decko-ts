// The follow-mod view tests: the follow views whose bodies the lane-follow
// port renders through the follow-rule walk + the form shapes + the actor
// session seam. A/B through the mod loader, per the established suite shape.
//
// All bytes are RENDERED-UNPINNED: the capture corpus carries NO Ruby-oracle
// bytes for any follow view name (verified: 0 hits for follow_status/
// follow_button/follow_item/follow_tab/ignore_tab/rule_editor/edit_buttons
// across tmp/raw-ground-truth/expected/recapture-raw-shard-*.jsonl), so the
// expectations pin the gem-source shape and claim no byte verification.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import cardModFollow from "../../../src/card/mod-loader/mods/card-mod-follow.js";
import type { RenderEngine } from "../../../src/card/render.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let engine: RenderEngine | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // codename/pattern anchors
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 13 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 110, name: "*follow", codename: "follow", typeId: 14 });
  await seedCard(s, { id: 112, name: "*always", codename: "always", typeId: 14 });
  await seedCard(s, { id: 113, name: "*never", codename: "never", typeId: 14 });
  await seedCard(s, { id: 114, name: "*created", codename: "created", typeId: 14 });
  await seedCard(s, { id: 115, name: "*edited", codename: "edited", typeId: 14 });
  await seedCard(s, { id: 120, name: "following", codename: "following", typeId: 14 });
  await seedCard(s, { id: 130, name: "followers", codename: "followers", typeId: 14 });

  // the User cardtype card (the preference SQL's users.type_id join key)
  await seedCard(s, { id: 3, name: "User", codename: "user", typeId: 13 });
  // users
  await seedCard(s, { id: 300, name: "Brandon", typeId: 3 });
  await seedCard(s, { id: 301, name: "Sara", typeId: 3 });

  // followed card + set
  await seedCard(s, { id: 200, name: "Make Contact", dbContent: "contact body" });
  await seedCard(s, {
    id: 210, name: "Make Contact+*self", leftId: 200, rightId: 11, typeId: 13,
  });
  await seedCard(s, {
    id: 215, name: "Make Contact+*self+Brandon", leftId: 210, rightId: 300, typeId: 14,
  });
  await seedCard(s, {
    id: 220, name: "Make Contact+*self+Brandon+*follow",
    leftId: 215, rightId: 110, typeId: 14, dbContent: "*always",
  });

  // Brandon's User+*follow dashboard pointer content (virtual; the items
  // walk reads preference cards, the dbContent stands in for the seeded state)
  await seedCard(s, { id: 310, name: "Brandon+*follow", leftId: 300, rightId: 110, typeId: 14 });

  // *follow defaults (the deprecated editor's host card)
  await seedCard(s, {
    id: 140, name: "*follow defaults", codename: "follow_defaults", typeId: 14,
    dbContent: "*all\n*always",
  });
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

async function loadMod(): Promise<RenderEngine> {
  if (engine) return engine;
  const s = storage!;
  loader = new ModLoader([{ manifest: cardModFollow }]);
  loader.load();
  // The A/B shape every other single-mod suite uses (card-mod-help.test.ts:223,
  // card-mod-content.test.ts:196, card-mod-date.test.ts): installInto wires
  // only the EVENT host — the render dispatch reads the loader off the engine
  // (render.ts:581 `this.modLoader = getDefaultModLoader()`) and the
  // process-wide default (render.ts:1296). Without the bind the mod's view
  // table never reaches the dispatch, so every ported follow view raised
  // UnsupportedViewError (the five standing reds this bind closes).
  bindModLoaderToEngine(storage!, loader!);
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  engine = s.engine;
  return engine;
}

describe("card-mod-follow views through the loader (lane-follow)", () => {
  it("WITHOUT the mod: the follow views are unsupported", async () => {
    const s = storage!;
    await expect(
      s.engine.render("Make Contact+*self+Brandon+*follow", "follow_status"),
    ).rejects.toThrow(UnsupportedViewError);
    await expect(
      s.engine.render("Make Contact", "follow_button"),
    ).rejects.toThrow(UnsupportedViewError);
  });

  it(":follow_item renders the update form with the drop-item hidden tags for an *always rule (right/follow.rb:63-101)", async () => {
    await loadMod();
    const s = storage!;
    const html = await s.engine.render(
      "Make Contact+*self+Brandon+*follow", "follow_item",
    );
    // follow_item(Env.params[:condition] -> nil -> "*always", button=true);
    // add_follow_item? is false (the rule's items include *always), so the
    // hidden tags carry condition + drop_item and the button is the delete
    // arm (follow_item_button_class "btn-item-delete btn-primary", icon
    // :check); the form is card_form :update, success view :follow_item.
    expect(html).toContain(`<form class="card-form slotter autosave"`);
    expect(html).toContain(`action="/update/`);
    expect(html).toContain(`<input type="hidden" name="condition" id="condition" value="*always" autocomplete="off" />`);
    expect(html).toContain(`<input type="hidden" name="drop_item" id="drop_item" value="*always" autocomplete="off" />`);
    expect(html).toContain(
      `class="btn-sm btn-item btn-item-delete btn-primary btn btn-primary"`,
    );
    expect(html).toContain(`>check</i>`);
    // the link arm: link_to_card(rule_set anchor name) — the set is
    // "Make Contact+*self", tag codename :self -> setname.left
    expect(html).toContain(`>Make Contact</a>`);
  });

  it(":follow_status wraps the haml list of follow items (right/follow.rb:58-60 + follow_status.haml)", async () => {
    await loadMod();
    const s = storage!;
    const html = await s.engine.render(
      "Make Contact+*self+Brandon+*follow", "follow_status",
    );
    expect(html).toContain(`<h4>Get notified about changes</h4>`);
    expect(html).toContain(`<ul class="delete-list list-group">`);
    expect(html).toContain(`<li class="list-group-item">`);
    expect(html).toContain(`Get notified about changes`);
    // the "more options" link_to_view :rule_form
    expect(html).toContain(`update-follow-link`);
    expect(html).toContain(`more options`);
  });

  it(":follow_button renders the StartFollowLink arm signed out and the StopFollowLink arm signed in (follow_link_views.rb:26-28 + follow_link.rb)", async () => {
    const s = storage!;
    const e = await loadMod();
    // signed OUT: followed? is false under no session -> StartFollowLink
    const out = await e.render("Make Contact", "follow_button");
    expect(out).toContain(`<span class="follow-verb">follow</span>`);
    expect(out).toContain(`title="send emails about changes to Make Contact"`);
    expect(out).toContain(`slotter btn btn-sm btn-primary`);
    expect(out).toContain(`data-update-foreign-slot=".d0-card-body > .card-slot.RIGHT-Xfollower.content-view"`);
    expect(out).toContain(
      `href="/update/Make_Contact+*self+Anonymous+*follow?card%5Bcontent%5D=%5B%5B%2Aalways%5D%5D`,
    );
    // signed IN as Brandon, who follows *always -> StopFollowLink
    e.pageSession = { signedIn: true, actorId: 300 };
    const inn = await e.render("Make Contact", "follow_button");
    expect(inn).toContain(`<span class="follow-verb">following</span>`);
    expect(inn).toContain(`title="stop sending emails about changes to Make Contact"`);
    expect(inn).toContain(`data-hover-text="unfollow"`);
    e.pageSession = undefined;
  });

  it(":follow_tab renders the pointer-list-editor rows for the followed sets (user/follow.rb:45-47 + follow_editor.haml)", async () => {
    const s = storage!;
    const e = await loadMod();
    e.pageSession = { signedIn: true, actorId: 300 };
    const html = await e.render("Brandon+*follow", "follow_tab");
    expect(html).toContain(`<div class="pointer-list-editor">`);
    expect(html).toContain(`<ul class="delete-list list-group">`);
    expect(html).toContain(`<li class="list-group-item">`);
    expect(html).toContain(`Make Contact`);
    e.pageSession = undefined;
  });

  it(":ignore_tab renders rows only for rules holding *never (user/follow.rb:49-51)", async () => {
    const s = storage!;
    const e = await loadMod();
    e.pageSession = { signedIn: true, actorId: 300 };
    const html = await e.render("Brandon+*follow", "ignore_tab");
    // Brandon holds only *always -> the walk yields no rows -> the
    // haml's empty arm ("no entries")
    expect(html).toContain(`no entries`);
    e.pageSession = undefined;
  });

  it(":edit_buttons on *follow defaults is UNREACHABLE in Ruby too (self/follow_defaults.rb:49-55 — the module constant vs the singularized self-anchor token)", async () => {
    await loadMod();
    const s = storage!;
    // mm-I-R: this pin was RED and is now a NEGATIVE pin, because
    // Ruby cannot reach the view either — the set module's constant and
    // the card's self-anchor token never meet.
    //
    // 09_self.rb: `def anchor_name card = card.name` (card-1.110.0
    // mod/core/set_pattern/09_self.rb) anchors the SELF pattern on the
    // card NAME, and Cardname#safe_key is `key.tr("*","X")`
    // (cardname-0.20.0 lib/cardname/variants.rb:19) over the SINGULARIZED
    // key. So the card "*follow defaults" produces the token
    // SELF-Xfollow_default, while set/self/follow_defaults.rb declares the
    // constant FollowDefaults. Live capture (benchmarks/
    // capture-readonly-follow-defaults-and-core-shape.rb → fixtures/
    // captured/readonly-follow-defaults-and-core-shape.json, card_actions
    // 5018 == 5018 around every render, the oracle app's development deck
    // with the real card at id 467):
    //   safe_set_keys                 = "ALL TYPE-list STAR SELF-Xfollow_default"
    //   ancestors grep(/FollowDefault/) = []
    //   :core / :confirm_update_all / :edit_buttons all render the
    //     anonymous-denial span, not the buttons.
    // The port matches that: the module is registered (the basket pin
    // covers set/self/follow_defaults), it is simply unreachable for its
    // own card, so the dispatch raises UnsupportedViewError.
    await expect(s.engine.render("*follow defaults", "edit_buttons")).rejects.toThrow(
      UnsupportedViewError,
    );
    await expect(
      s.engine.render("*follow defaults", "confirm_update_all"),
    ).rejects.toThrow(UnsupportedViewError);
  });

  it("set/self/follow_defaults stays REGISTERED even though the card can't reach it (see the negative pin above)", async () => {
    await loadMod();
    const basket = loader!.setModules();
    const registered = basket.allNonbase().map((m) => m.shortname);
    expect(registered).toContain("Self::FollowDefaults");
  });
});
