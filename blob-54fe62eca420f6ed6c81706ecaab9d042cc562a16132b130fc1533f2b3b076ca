// The account-tab password field renders inside a CLOSED modal container,
// and that is what Ruby does too — the pin behind E19.
//
// E19 was graded RED twice ("the E19 account-tab password field renders
// HIDDEN on the account edit surface"): once by
// reference-harness/browser/probe-exhaustive-affordance-reds.mjs's ACT-077
// leg and once by probe-account-row-edit-slots.mjs. Measured 2026-10-20 on
// d8050251 against the pinned Ruby oracle (stock Decko 0.20.0 / card
// 1.110.0, C:/localProjects/decko-ruby-oracle-gems), the port is RIGHT and
// the instruments were sampling mid-flight:
//
//   1. Raw HTTP, no browser, GET /<card>+*account+*password/edit, both
//      engines: the #modal-container tag and BOTH card[content] input tags
//      are byte-identical, password row included —
//      `<input class="d0-card-content _pw-input form-control"
//      placeholder="Password" autocomplete="off" type="password"
//      name="card[content]" id="card_content" />`.
//   2. Both engines also serve the identical client assets
//      (/files/~307 sha256 53efb75374566e03, /files/~447 sha256
//      e9dbcbbb1bf1aa32), so the reveal path is the same script too.
//   3. The container the editor sits in renders CLOSED on both engines —
//      Ruby's own template is card-mod-layout-0.20.0/set/all/modal/
//      modal_dialog.haml:1, `#modal-container.modal.fade._modal-slot{ role:
//      "dialog" }`, which carries no `show`. Nothing server-side hides the
//      password field and nothing server-side shows it: the Decko client JS
//      opens the container on contentLoaded (`el.modal("show", $slotter)`),
//      AFTER the load event.
//   4. In a browser, at `waitUntil: "load"` the input has zero client rects
//      on BOTH engines; a few seconds later it has one on BOTH engines.
//      The instruments read at load, so whichever row the JS won the race
//      on passed and the other failed — same tree, same run.
//
// These tests pin the two halves of that join so a future reader who takes
// the red at face value cannot "fix" the engine by server-rendering the
// field into the page body or by stamping `show` on the container:
//
//   - the account password field's :input view is the valueless `_pw-input`
//     password field (A/B: WITHOUT card-mod-account the pin does not hold),
//   - and the modal container that carries it renders with class exactly
//     `modal fade _modal-slot` — no `show`, no inline `display`.
//
// Byte basis: GEM-DERIVED. password_input.haml:2-6 in the pinned
// card-mod-account-0.20.0 gem, right/password.rb:86-88's `input_type
// :password`, and modal_dialog.haml:1 in card-mod-layout-0.20.0.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModAccount from "../../../src/card/mod-loader/mods/card-mod-account.js";
import cardModLayout from "../../../src/card/mod-loader/mods/card-mod-layout.js";

const MEMBER = "Fields Probe Member";
const PASSWORD_FIELD = `${MEMBER}+*account+*password`;
const EMAIL_FIELD = `${MEMBER}+*account+*email`;

let storage: RenderTestStorage | undefined;

async function deck(): Promise<RenderTestStorage> {
  const s = await createRenderTestStorage();
  await seedCard(s, { id: 2, name: "RichText" }); // cardtypes' type card
  await seedCard(s, { id: 4, name: "User", codename: "user", typeId: 2 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 111, name: "*account", codename: "account", typeId: 14 });
  await seedCard(s, { id: 130, name: "*email", codename: "email", typeId: 14 });
  await seedCard(s, { id: 140, name: "*password", codename: "password", typeId: 14 });

  await seedCard(s, { id: 120, name: MEMBER, typeId: 4, dbContent: "member body" });
  await seedCard(s, {
    id: 121,
    name: EMAIL_FIELD,
    leftId: 110,
    rightId: 130,
    typeId: 2,
    dbContent: "probe@example.com",
  });
  await seedCard(s, {
    id: 141,
    name: PASSWORD_FIELD,
    leftId: 110,
    rightId: 140,
    typeId: 2,
    dbContent: "fake-hash-not-a-real-password",
  });
  await seedCard(s, { id: 110, name: `${MEMBER}+*account`, leftId: 120, rightId: 111, typeId: 2 });

  // the plain card the layout mod's :modal shell is rendered against
  await seedCard(s, { id: 90, name: "Oracle Layout Probe", typeId: 2 });
  return s;
}

async function install(mods: { manifest: unknown }[]) {
  const loader = new ModLoader(mods as never);
  loader.load();
  bindModLoaderToEngine(storage!, loader);
  await loader.installInto(modEngineHost(storage!.engine, storage!.fetcher));
  return loader;
}

describe("E19: the account-tab password field is revealed by the client, never by the render", () => {
  beforeAll(async () => {
    storage = await deck();
  });
  afterAll(async () => {
    await storage?.close();
  });

  it("WITHOUT card-mod-account the password field falls through to the rich-text editor, digest and all — the A/B that makes the pins below non-vacuous", async () => {
    // A/B first, in the only window where no mod is bound: every later
    // test in this file installs card-mod-account into the shared engine.
    // The fall-through is the hazard the pin removes — right/password.rb
    // :86-88's `input_type :password` routes to password_input FIRST,
    // ahead of editor.rb's rich-text default, precisely because that
    // default renders the card's content into the element body. (The
    // seeded digest here is this file's own placeholder string.)
    const fallback = await storage!.engine.render(PASSWORD_FIELD, "input");
    expect(fallback).toContain("tinymce-textarea");
    expect(fallback).toContain("fake-hash-not-a-real-password");
    // It is not the password field, and not valueless.
    expect(fallback).not.toContain("_pw-input");
    expect(fallback).not.toMatch(/type=["']password["']/);
  });

  it("WITH the mod: the password field is the valueless _pw-input password element (password_input.haml:2-6)", async () => {
    await install([{ manifest: cardModAccount }]);
    const input = await storage!.engine.render(PASSWORD_FIELD, "input");
    // The security half, restated because it is the load-bearing one: the
    // stored digest never reaches the bytes and there is no `value`
    // attribute at all (Rails' tag_options drops nil-valued attributes).
    expect(input).not.toContain("fake-hash-not-a-real-password");
    expect(input).not.toMatch(/\bvalue=/);
    expect(input).toBe(
      '<input class="d0-card-content _pw-input form-control" placeholder="Password" ' +
        'autocomplete="off" type="password" name="card[content]" id="card_content" />\n' +
        "<span class='_toggle-password visibility-icon _pw-text-area'>\n" +
        '<i class="_toggle-pw-visibility notranslate material-icons">visibility_off</i>\n' +
        "</span>\n",
    );
  });

  it("WITH the mod: the modal container that carries it renders CLOSED — no `show`, no inline display", async () => {
    await install([{ manifest: cardModAccount }, { manifest: cardModLayout }]);
    const modal = await storage!.engine.render("Oracle Layout Probe", "modal");
    const openingTag = modal.match(/<div[^>]*id=['"]modal-container['"][^>]*>/)?.[0];
    expect(openingTag).toBe(
      "<div class='modal fade _modal-slot' id='modal-container' role='dialog'>",
    );
    // The three ways a render could server-show the editor's container and
    // make the password field visible without the client JS. Each one is
    // what a "fix the E19 red" change would reach for, and each is a
    // divergence from modal_dialog.haml:1.
    expect(openingTag).not.toMatch(/\bshow\b/);
    expect(openingTag).not.toMatch(/style=/i);
    expect(modal).not.toMatch(/style=['"][^'"]*display\s*:\s*block/i);
  });
});