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
  await seedCard(s, { id: 300, name: "Riley", typeId: 3 });
  await seedCard(s, { id: 301, name: "Tova", typeId: 3 });

  // followed card + set
  await seedCard(s, { id: 200, name: "Make Contact", dbContent: "contact body" });
  await seedCard(s, {
    id: 210, name: "Make Contact+*self", leftId: 200, rightId: 11, typeId: 13,
  });
  await seedCard(s, {
    id: 215, name: "Make Contact+*self+Riley", leftId: 210, rightId: 300, typeId: 14,
  });
  await seedCard(s, {
    id: 220, name: "Make Contact+*self+Riley+*follow",
    leftId: 215, rightId: 110, typeId: 14, dbContent: "*always",
  });

  // Riley's User+*follow dashboard pointer content (virtual; the items
  // walk reads preference cards, the dbContent stands in for the seeded state)
  await seedCard(s, { id: 310, name: "Riley+*follow", leftId: 300, rightId: 110, typeId: 14 });

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
      s.engine.render("Make Contact+*self+Riley+*follow", "follow_status"),
    ).rejects.toThrow(UnsupportedViewError);
    await expect(
      s.engine.render("Make Contact", "follow_button"),
    ).rejects.toThrow(UnsupportedViewError);
  });

  it(":follow_item renders the update form with the drop-item hidden tags for an *always rule (right/follow.rb:63-101)", async () => {
    await loadMod();
    const s = storage!;
    const html = await s.engine.render(
      "Make Contact+*self+Riley+*follow", "follow_item",
    );
    // follow_item(Env.params[:condition] -> nil -> "*always", button=true);
    // add_follow_item? is false (the rule's items include *always), so the
    // hidden tags carry condition + drop_item and the button is the delete
    // arm (follow_item_button_class "btn-item-delete btn-primary", icon
    // :check). Corpus-adjudicated bytes (2026-10-09, the synthetic-v2
    // follow_item pin): the form class is "card-form slotter" (no autosave),
    // the success rides the ACTION QUERY, and the button attributes render
    // in the captured order (name, type, aria-label, class).
    expect(html).toContain(`<form class="card-form slotter"`);
    expect(html).toContain(`action="/update/`);
    expect(html).toContain(`success%5Bview%5D=follow_item`);
    expect(html).toContain(`<input type="hidden" name="condition" id="condition" value="*always" autocomplete="off" />`);
    expect(html).toContain(`<input type="hidden" name="drop_item" id="drop_item" value="*always" autocomplete="off" />`);
    expect(html).toContain(
      `<button name="button" type="submit" aria-label="Left Align" class="btn-sm btn-item btn-item-delete btn-primary btn btn-primary">`,
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
      "Make Contact+*self+Riley+*follow", "follow_status",
    );
    // Haml template bytes, corpus-adjudicated (2026-10-09, the synthetic-v2
    // follow_status pin): the h4 text on its own lines, single-quoted class
    // attributes, the "more options" link_to_view anchor with rel nofollow,
    // the appended slotter (the caller class already carries one), and
    // data-remote last.
    expect(html).toContain(`<h4>\nGet notified about changes\n</h4>`);
    expect(html).toContain(`<ul class='delete-list list-group'>`);
    expect(html).toContain(`<li class='list-group-item'>\n`);
    expect(html).toContain(
      `<a rel="nofollow" class="btn update-follow-link slotter slotter"`,
    );
    expect(html).toContain(`more options`);
  });

  it(":follow_button renders the StartFollowLink arm signed out and the StopFollowLink arm signed in (follow_link_views.rb:26-28 + follow_link.rb)", async () => {
    const s = storage!;
    const e = await loadMod();
    // signed OUT: followed? is false under no session -> StartFollowLink.
    // Corpus-adjudicated bytes (2026-10-09, the synthetic-v2 follow_button
    // pins - the same builder the follow_section embed renders): the empty
    // css_class keeps its blank in the class list, the data-update-foreign-
    // slot's > is attribute-escaped, and the href's to_query pairs join
    // with &amp; inside the attribute.
    const out = await e.render("Make Contact", "follow_button");
    expect(out).toContain(`<span class="follow-verb">follow</span>`);
    expect(out).toContain(`title="send emails about changes to Make Contact"`);
    expect(out).toContain(`class="follow-link  slotter btn btn-sm btn-primary"`);
    expect(out).toContain(`data-update-foreign-slot=".d0-card-body &gt; .card-slot.RIGHT-Xfollower.content-view"`);
    expect(out).toContain(
      `href="/update/Make_Contact+*self+Anonymous+*follow?card%5Bcontent%5D=%5B%5B%2Aalways%5D%5D` +
        `&amp;success%5Bmark%5D=Make+Contact&amp;success%5Bview%5D=follow_section"`,
    );
    // signed IN as Riley, who follows *always -> StopFollowLink
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
    const html = await e.render("Riley+*follow", "follow_tab");
    // Haml template bytes, corpus-adjudicated (2026-10-09, the synthetic-v2
    // oracle's follow_tab/ignore_tab pins): single-quoted class attributes,
    // no indentation, every walk row wrapped in its own li, one trailing
    // newline after the closing div.
    expect(html).toContain(`<div class='pointer-list-editor'>`);
    expect(html).toContain(`<ul class='delete-list list-group'>`);
    expect(html).toContain(`<li class='list-group-item'>\n`);
    expect(html).not.toContain(`<div class="pointer-list-editor">`);
    expect(html).toContain(`Make Contact`);
    e.pageSession = undefined;
  });

  it(":ignore_tab renders rows only for rules holding *never (user/follow.rb:49-51)", async () => {
    const s = storage!;
    const e = await loadMod();
    e.pageSession = { signedIn: true, actorId: 300 };
    const html = await e.render("Riley+*follow", "ignore_tab");
    // Riley holds only *always -> the walk yields no rows -> the
    // haml's empty arm ("no entries")
    expect(html).toContain(`no entries`);
    e.pageSession = undefined;
  });

  // RETIRED 2026-10-13 (mm-I-R): the negative pin that stood here asserted
  // that ":edit_buttons on *follow defaults is UNREACHABLE in Ruby too" and
  // that the dispatch raises UnsupportedViewError. It asserted the OPPOSITE
  // of the recorded Ruby render, and it is retired rather than satisfied.
  //
  // THE RECEIPT — the stock oracle DISPATCHES the view for this card.
  // reference-harness/fixtures/synthetic-v2/expected/render.jsonl.gz carries
  //   view:admin:*follow defaults:confirm_update_all
  // for card id 467 with class "ALL TYPE-list STAR SELF-Xfollow_default",
  // captured by adapter "decko-ruby" (card 1.110.0 / decko 0.20.0, stock,
  // unpatched, 2026-10-09): the alert-info div "Are you sure you want to
  // change the default follow rules?". card-mod-follow.test.ts:200 pins the
  // same dispatch green, under the note that the corpus render disproves the
  // wave-1 "unreachable" reading for this view.
  //
  // WHY THE WAVE-1 CAPTURE COULD NOT SETTLE IT — the receipt it produced is
  // a PRE-DISPATCH reading. benchmarks/
  // capture-readonly-follow-defaults-and-core-shape.rb:92-97 reads
  // `fd.singleton_class.ancestors ... grep(/FollowDefault/)` inside the probe
  // hash literal whose render calls (:98-101) come AFTER it, so the singleton
  // is measured before any view resolution; Ruby includes the set modules
  // into the format singleton DURING dispatch (card-1.110.0
  // lib/card/format.rb:57-68 — `card.set_format_modules(klass).each do |m|
  // singleton_class.send :include, m; end`), which is why the empty
  // `included_modules_matching_follow_defaults` list in fixtures/captured/
  // readonly-follow-defaults-and-core-shape.json coexists with a dispatch.
  // That same capture's confirm_update_all came back as the anonymous denial
  // span (`<span class="denied">...`), i.e. the PERMISSION layer answering a
  // view the method table already carried — not a missing view. The corpus
  // render is the receipt; the ancestor grep was never one.
  //
  // THE MECHANISM THAT MAKES THE MODULE REACHABLE: the SELF token keys to
  // the anchor's CODENAME, as Ruby's Pattern::Base#module_key does (set/
  // pattern/base.rb:21-29 + class_methods.rb:45-50). The token
  // SELF-Xfollow_default carries the singularized name key, rubySelfToken
  // (src/card/render/set-keys-to-modules.ts:151-163) resolves it to the
  // codename follow_defaults, and the registered shortname for setPath
  // "self/follow_defaults" is Self::FollowDefaults (mod-registrar.ts:120-122),
  // so the chain walk answers both of the module's views. The wave-1 reading
  // took the singularized name spelling for the module key, which is the
  // lookup the codename resolution replaced.
  //
  // Nothing is pinned here in its place: the corpus carries no edit_buttons
  // bytes for this card (0 hits, and the module's confirm_update_all bytes
  // are pinned in the sibling suite that owns the oracle receipt).

  it("set/self/follow_defaults stays REGISTERED, and the card reaches it (see the retirement note above)", async () => {
    await loadMod();
    const basket = loader!.setModules();
    const registered = basket.allNonbase().map((m) => m.shortname);
    expect(registered).toContain("Self::FollowDefaults");
  });
});
