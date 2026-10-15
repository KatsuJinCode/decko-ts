// The account-side view tests assigned to the follow suite: the views whose
// bodies need the actor session (Auth.current) + the form shapes:
//   self/signin   :reset_password_success, :edit_buttons (card-mod-account
//                  set/self/signin.rb:148-168)
//   type/role     :link_with_checkbox (set/type/role.rb:8-10, 26-32)
//   right/account :closure (set/right/account/views.rb:22 + closure.haml)
//
// All bytes are RENDERED-UNPINNED (no oracle captures exist for these names
// — verified against the capture shards); expectations pin the gem-source
// shape and claim no byte verification.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { UnsupportedViewError } from "../../../src/card/render/format.js";
import {
  ModLoader,
  modEngineHost,
} from "../../../src/card/mod-loader.js";
import cardModAccount from "../../../src/card/mod-loader/mods/card-mod-account.js";
import { bindModLoaderToEngine } from "../render/render-test-storage.js";
import type { RenderEngine } from "../../../src/card/render.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
let engine: RenderEngine | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 13 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  // the Role CARDTYPE card (id 6): the link_with_checkbox probe card
  // ("Helper", typeId 6) needs its type row so the render card's typeName
  // resolves "Role" and the set keys carry the TYPE-role token the
  // Type::Role set module dispatches through (surfaces-batch2, 2026-09-30 —
  // the unseeded type left the token TYPELESS and the view unreachable even
  // with the loader bound).
  await seedCard(s, { id: 6, name: "Role", codename: "role", typeId: 13 });
  await seedCard(s, { id: 141, name: "*signin", codename: "signin", typeId: 14 });
  await seedCard(s, { id: 142, name: "*account", codename: "account", typeId: 14 });
  // *roles only - name keys SINGULARIZE (variants.rb: "*roles".key ==
  // "*role"), so a separate *role seed would violate cards_key_index
  await seedCard(s, { id: 144, name: "*roles", codename: "roles", typeId: 14 });
  await seedCard(s, { id: 145, name: "*disabled roles", codename: "disabled_roles", typeId: 14 });

  // users + content cards
  await seedCard(s, { id: 300, name: "Dana", typeId: 3 });
  // a deletion candidate: a card whose LEFT is Dana (the closure search:
  // left: id, not: {right: :account}) - "Dana+Notebook"
  await seedCard(s, { id: 201, name: "Notebook" });
  await seedCard(s, {
    id: 200, name: "Dana+Notebook", leftId: 300, rightId: 201, dbContent: "notes",
  });
  // the +*account right card of Dana
  await seedCard(s, {
    id: 320, name: "Dana+*account", leftId: 300, rightId: 142, typeId: 14,
  });
  // a role card (Role-typed) for the link_with_checkbox probe
  await seedCard(s, { id: 400, name: "Helper", typeId: 6 });
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

async function loadMod(): Promise<RenderEngine> {
  if (engine) return engine;
  const s = storage!;
  loader = new ModLoader([{ manifest: cardModAccount }]);
  loader.load();
  // The render dispatch consults engine.modLoader / the process-wide
  // default (RenderFormat.renderView -> ModLoader#viewChain) — installInto
  // wires only the engine HOST (the event seam), not the view dispatch.
  // Every other loader-binding suite pairs the two (card-mod-account.test.ts
  // loadAccountMod, mod-events suites); without the bind the mod's
  // registrations are invisible and every WITH-the-mod assertion here dies
  // in UnsupportedViewError — the wiring bug that kept these four
  // red (surfaces-batch2, 2026-09-30).
  bindModLoaderToEngine(storage, loader);
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  engine = s.engine;
  return engine;
}

describe("card-mod-account form views through the loader (lane-follow)", () => {
  it("WITHOUT the mod: the account form views are unsupported", async () => {
    const s = storage!;
    await expect(s.engine.render("*signin", "reset_password_success")).rejects.toThrow(
      UnsupportedViewError,
    );
    await expect(s.engine.render("Helper", "link_with_checkbox")).rejects.toThrow(
      UnsupportedViewError,
    );
  });

  it(":reset_password_success frames the check-email notice (self/signin.rb:148-151)", async () => {
    await loadMod();
    const s = storage!;
    const html = await s.engine.render("*signin", "reset_password_success");
    // frame { t(:account_check_email) } — en.yml: "Check your email for a
    // link to reset your password", inside the standard slot wrap body
    expect(html).toContain("Check your email for a link to reset your password");
    expect(html).toContain("card-slot");
  });

  it(":edit_buttons on *signin renders the primary reset-password button (self/signin.rb:165-168)", async () => {
    await loadMod();
    const s = storage!;
    const html = await s.engine.render("*signin", "edit_buttons");
    expect(html).toBe(
      `<button type="submit" class="_close-modal-on-success btn btn-primary">Reset password</button>`,
    );
  });

  it(":link_with_checkbox renders the disabled-roles checkbox form for the session actor (type/role.rb:8-10, 26-32)", async () => {
    const s = storage!;
    const e = await loadMod();
    e.pageSession = { signedIn: true, actorId: 300 };
    const html = await e.render("Helper", "link_with_checkbox");
    // role_checkbox: subformat("Dana+*disabled roles").card_form :update
    // wrapping [check_box_tag("add_item", "400", true, class: "_edit-item"),
    // render_link]. The roles card is unseeded -> its items are empty ->
    // disabled? false -> name add_item, checked.
    expect(html).toContain(`<form class="card-form slotter autosave"`);
    expect(html).toContain(`<input type="checkbox" name="add_item" id="add_item" value="400" class="_edit-item" checked="checked" />`);
    // render_link - the card's :link view bytes (known-card anchor + title span)
    expect(html).toContain(`href="/Helper"`);
    expect(html).toContain(`>Helper</span></a>`);
    e.pageSession = undefined;
  });

  it(":closure raises stock Ruby's private-method NoMethodError (closure.haml:25 on the private walk)", async () => {
    const s = storage!;
    const e = await loadMod();
    e.pageSession = { signedIn: true, actorId: 300 };
    // closure.haml:25 `- card.accounted.closure_deletions.each` calls the
    // PRIVATE closure_deletions (account_holder.rb:81/87-89) from outside
    // its receiver — card.accounted is a different Card — so every render
    // passing perms :delete raises NoMethodError (the stock synthetic-v2
    // oracle pins the rescued admin span on
    // view:admin:Ada Admin+*account:closure). The haml below line 25 (the
    // warning, the deletion list, the confirmed delete link) never renders
    // in stock Ruby; the loud test posture re-raises to the caller.
    // Ruby's message ends with the receiver's default inspect
    // (`#<Card:0x000001bd38e4f4c0>`); the engine writes the same shape with
    // its own identity for the accounted card (the card id), and the harness
    // masks the sixteen digits on both sides (reference-harness N9).
    await expect(e.render("Dana+*account", "closure")).rejects.toThrow(
      /^private method `closure_deletions' called for #<Card:0x[0-9a-f]{16}>$/,
    );
    e.pageSession = undefined;
  });
});
