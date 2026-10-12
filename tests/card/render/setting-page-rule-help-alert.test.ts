// setting-page-rule-help-alert.test.ts -- pins for the Setting-type card
// pages' rule_help alert.
//
// Ruby chain: card-mod-rules set/type/setting.rb:59-61 view :rule_help
// nests `[:all, card.name]` at view :rule_help; the nested Rule arm
// (set/rule/editor.rb:24-28) wraps the card-mod-help chain in
// `<div class="alert alert-info rule-instruction">`; help.rb:36-38
// raw_help_text = `card.try(:raw_help_text) || card.help_rule_card&.content`
// — for the *all+<setting> rule card the FIRST operand is the setting's
// Right-set registry text (setting-help-text.ts). The engine's Setting-type
// core (views.ts settingCoreHtml, porting set/type/setting.rb + core.haml
// :1-12) computed the alert through the registered mod view, which the
// loader-less path never resolves, so the page rendered the bare
// "All X rules that apply to" h3 instead of opening with the alert.
//
// Expected bytes: the alert body is the registry's style text with the
// [[http://decko.org/skins|more]] link processed, followed by the h3.

import { describe, expect, it } from "vitest";
import { installHelpRules } from "../../../src/card/render/help-popover.js";
import {
  createRenderTestStorage,
  seedCard,
} from "./render-test-storage.js";

const CARDTYPE_TYPE_ID = 5;
const SET_TYPE_ID = 10;
const SETTING_TYPE_ID = 11;

const STYLE_ALERT =
  '<div class="alert alert-info rule-instruction">Skin (collection of stylesheets) for card\'s page. ' +
  '<a target="_blank" class="external-link" href="http://decko.org/skins">more</a></div>';

async function seedDeck(storage: Parameters<typeof seedCard>[0]): Promise<void> {
  await seedCard(storage, { id: 2, name: "Basic", typeId: CARDTYPE_TYPE_ID });
  await seedCard(storage, { id: 5, name: "Cardtype", typeId: CARDTYPE_TYPE_ID });
  await seedCard(storage, { id: 10, name: "Set", codename: "set", typeId: CARDTYPE_TYPE_ID });
  await seedCard(storage, { id: 11, name: "Setting", codename: "setting", typeId: CARDTYPE_TYPE_ID });
  await seedCard(storage, { id: 250, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(storage, { id: 210, name: "*style", codename: "style", typeId: SETTING_TYPE_ID });
  // the broadest *style rule (List-typed; the type is
  // irrelevant to the help chain)
  await seedCard(storage, { id: 251, leftId: 250, rightId: 210, typeId: SETTING_TYPE_ID });
  // a setting with NO registry entry and no *help rule card: the alert
  // still renders (Ruby wraps a blank rule_based_help unconditionally)
  await seedCard(storage, { id: 260, name: "*widget", typeId: SETTING_TYPE_ID });
  await seedCard(storage, { id: 261, leftId: 250, rightId: 260, typeId: SETTING_TYPE_ID });
  // a setting with NO *all rule at all: no alert (the nest misses and
  // substitutes the unknown view, "")
  await seedCard(storage, { id: 270, name: "*ruleless", typeId: SETTING_TYPE_ID });
}

describe("p20-help-content: the setting card page's rule_help alert", () => {
  it("*style core opens with the registry help text in the alert (oracle 17450)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();
      const core = await storage.engine.render("*style", "core");
      // the core.haml row shape: alert, h3, then the per-class row
      // `<p>\n<h5>\nall cards\n</h5>\n` + the *all+*style bar
      // (anchorless: show records Ruby's opt order ["full_name","bar"])
      // + `\n</p>\n`
      expect(core.startsWith(
        `${STYLE_ALERT}\n<h3>All style rules that apply to</h3>\n` +
        "<p>\n<h5>\nall cards\n</h5>\n",
      )).toBe(true);
      expect(core).toContain('id="Xall-Xstyle-bar-view"');
      expect(core).toContain("&quot;show&quot;:[&quot;full_name&quot;,&quot;bar&quot;]");
      expect(core.endsWith("\n</p>\n")).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("the alert renders on the resolver-less path too (the registry fallback)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      const core = await storage.engine.render("*style", "core");
      expect(core.startsWith(STYLE_ALERT)).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("a setting whose rule card has no help still renders the empty alert div", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();
      const core = await storage.engine.render("*widget", "core");
      // the *all+*widget rule card exists (warmed by the prepare phase),
      // so the alert renders unconditionally — Ruby's wrap_with around a
      // blank rule_based_help — and the set-class row follows
      expect(core.startsWith(
        '<div class="alert alert-info rule-instruction"></div>\n' +
        "<h3>All widget rules that apply to</h3>\n" +
        "<p>\n<h5>\nall cards\n</h5>\n",
      )).toBe(true);
      expect(core.endsWith("\n</p>\n")).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("*on create with NO junction row renders the registry text over the VIRTUAL rule card (oracle 21757)", async () => {
    // There is no stored *all+*on create row, yet the page opens with
    // "Configure events to be executed when card is created" —
    // rule_help is unknown: true (editor.rb:24), so the nest renders the
    // virtual rule card Ruby builds on the fly and its Right-set registry
    // text serves the body
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      await seedCard(storage, {
        id: 290, name: "*on create", codename: "on_create", typeId: SETTING_TYPE_ID,
      });
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();
      const core = await storage.engine.render("*on create", "core");
      expect(core.startsWith(
        '<div class="alert alert-info rule-instruction">' +
        "Configure events to be executed when card is created</div>\n" +
        "<h3>All on create rules that apply to</h3>\n",
      )).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("a setting whose junction is absent and whose setting has no registry entry still renders the blank alert", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      await seedCard(storage, { id: 280, name: "*eventless", typeId: SETTING_TYPE_ID });
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();
      const core = await storage.engine.render("*eventless", "core");
      expect(core.startsWith(
        '<div class="alert alert-info rule-instruction"></div>\n' +
        "<h3>All eventless rules that apply to</h3>\n",
      )).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("a setting with no junction row still renders the blank alert when the *all set card exists", async () => {
    // the nest of an absent junction does NOT fall to the unknown-view
    // blank — rule_help is unknown: true, so the virtual rule card
    // renders (blank help here)
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();
      const core = await storage.engine.render("*ruleless", "core");
      expect(core.startsWith(
        '<div class="alert alert-info rule-instruction"></div>\n' +
        "<h3>All ruleless rules that apply to</h3>\n",
      )).toBe(true);
    } finally {
      storage.close();
    }
  });

  it("a setting with no *all SET card renders no alert (the nest blank)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedDeck(storage);
      // drop the *all set card: the nest has no set universe, the virtual
      // card cannot build, and the view falls to the unknown-view blank
      await storage.counting.query("DELETE FROM cards WHERE id = 250", []);
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();
      const core = await storage.engine.render("*ruleless", "core");
      expect(core).toBe("<h3>All ruleless rules that apply to</h3>\n");
    } finally {
      storage.close();
    }
  });
});
