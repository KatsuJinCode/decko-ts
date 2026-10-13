// help-content-rule-page-setting-registry.test.ts -- byte tests for the
// setting-help popover content served on the rule and setting pages: the
// mod rule pages (mod: X+*style|script), the on-create/on-delete/on-update
// rule pages, and the *style/*script setting pages, where the resolver
// previously returned empty help text.
//
// Every expected data-bs-content value below is the exact expected
// attribute byte string, so a green run pins the rendered popover content
// exactly. Before the registry gained the style/script/on_create entries,
// the engine served "&amp;nbsp;" (mod + setting-card pages) or the bare
// count div (rule-branch pages).
//
// Ruby chain:
//   menu.rb:35-37 help_link -> all/help.rb:36-38 raw_help_text =
//   card.try(:raw_help_text) || help_rule_card&.content, where the static
//   strings register via Card::Setting#help_text_for_setting
//   (card-1.110.0 lib/card/setting.rb:112-114, Self + Right set modules) or
//   format/card-level `def raw_help_text` defs in the settings' set files.

import { describe, expect, it } from "vitest";
import { installHelpRules } from "../../../src/card/render/help-popover.js";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";

const SET_TYPE_ID = 10; // cardtype card "Set" (codename set)
const SETTING_TYPE_ID = 11; // cardtype card "Setting" (codename setting)
const BASIC_TYPE_ID = 2;

async function seedCodenameCards(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, { id: 5, name: "Cardtype", typeId: 5 });
  await seedCard(storage, { id: 2, name: "Basic", typeId: 5 });
  await seedCard(storage, { id: 10, name: "Set", codename: "set", typeId: 5 });
  await seedCard(storage, { id: 11, name: "Setting", codename: "setting", typeId: 5 });
  await seedCard(storage, { id: 12, name: "User", codename: "user", typeId: 5 });
}

/** The mod rule-card family: left part is a type-Mod card
 *  (data-card-type-name="Mod"), right part a setting card.
 *  The left type is NOT Set, so these cards take the PLAIN help branch
 *  (all/help.rb) - no setting_link count div (the expected bytes below
 *  carry none). Type ids here use Basic; the branch reads only left/right types. */
async function seedModRuleFamily(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, { id: 210, name: "*style", codename: "style", typeId: SETTING_TYPE_ID });
  await seedCard(storage, { id: 220, name: "mod: account", typeId: BASIC_TYPE_ID });
  await seedCard(storage, {
    id: 221, leftId: 220, rightId: 210, typeId: BASIC_TYPE_ID,
  });
  await seedCard(storage, { id: 230, name: "*script", codename: "script", typeId: SETTING_TYPE_ID });
  await seedCard(storage, { id: 240, name: "mod: bootstrap", typeId: BASIC_TYPE_ID });
  await seedCard(storage, {
    id: 241, leftId: 240, rightId: 230, typeId: BASIC_TYPE_ID,
  });
}

/** The rule-branch family: left part a Set-typed card, right part a setting
 *  card -> board_rules_editor.rb:17-19's :help_text override joins
 *  [rule_based_help, setting_link].join(" "). The junction cards THEMSELVES
 *  are the counted rules (the count query joins rules.left_id to Set-typed
 *  cards), so each count is 1, matching the expected bytes below. */
async function seedRuleBranchFamily(storage: RenderTestStorage): Promise<void> {
  await seedCard(storage, { id: 250, name: "*all", codename: "all", typeId: SET_TYPE_ID });
  await seedCard(storage, { id: 210, name: "*style", codename: "style", typeId: SETTING_TYPE_ID });
  await seedCard(storage, {
    id: 251, leftId: 250, rightId: 210, typeId: SETTING_TYPE_ID,
    dbContent: "quartz skin customized",
  });
  await seedCard(storage, { id: 260, name: "Sign up", typeId: BASIC_TYPE_ID });
  await seedCard(storage, { id: 261, name: "*type", codename: "type", typeId: SETTING_TYPE_ID });
  await seedCard(storage, { id: 262, leftId: 260, rightId: 261, typeId: SET_TYPE_ID });
  await seedCard(storage, {
    id: 263, name: "*on create", codename: "on_create", typeId: SETTING_TYPE_ID,
  });
  await seedCard(storage, {
    id: 264, leftId: 262, rightId: 263, typeId: SETTING_TYPE_ID,
  });
}

/** Extract the data-bs-content attribute value (still attribute-escaped). */
function helpContentOf(html: string): string {
  const marker = 'data-bs-content="';
  const start = html.indexOf(marker);
  expect(start, "menu help anchor present").toBeGreaterThanOrEqual(0);
  const rest = html.slice(start + marker.length);
  const end = rest.indexOf('"');
  return rest.slice(0, end);
}

describe("help-content lane: setting registry serves the rule pages' popover bytes", () => {
  it("mod: account+*style serves the *style help text (oracle 000039-mod_account_style)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCodenameCards(storage);
      await seedModRuleFamily(storage);
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();

      const html = await storage.engine.render("mod: account+*style", "closed");
      expect(helpContentOf(html)).toBe(
        "Skin (collection of stylesheets) for card&#39;s page. " +
        "&lt;a target=&quot;_blank&quot; class=&quot;external-link&quot; " +
        "href=&quot;http://decko.org/skins&quot;&gt;more&lt;/a&gt;",
      );
    } finally {
      storage.close();
    }
  });

  it("mod: bootstrap+*script serves the Right::Script help text (oracle 000039-mod_bootstrap_script)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCodenameCards(storage);
      await seedModRuleFamily(storage);
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();

      const html = await storage.engine.render("mod: bootstrap+*script", "closed");
      expect(helpContentOf(html)).toBe("JavaScript (or CoffeeScript) for card&#39;s page.");
    } finally {
      storage.close();
    }
  });

  it("*style (the setting card itself) serves its own help text (oracle 000012-_style)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCodenameCards(storage);
      await seedModRuleFamily(storage);
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();

      const html = await storage.engine.render("*style", "closed");
      expect(helpContentOf(html)).toBe(
        "Skin (collection of stylesheets) for card&#39;s page. " +
        "&lt;a target=&quot;_blank&quot; class=&quot;external-link&quot; " +
        "href=&quot;http://decko.org/skins&quot;&gt;more&lt;/a&gt;",
      );
    } finally {
      storage.close();
    }
  });

  it("*script (the setting card itself) keeps the nbsp placeholder - Self::Script registers no help text", async () => {
    // card-mod-script-0.20.0 set/self/script.rb is `setting_opts group:
    // :webpage, position: 5` - no help_text; the "JavaScript (or
    // CoffeeScript)..." string lives ONLY on the Right set (set/right/
    // script.rb:14-16, format-level def). The setting card's own page has no
    // pinned expectation below, but the registry's self-absent shape must not
    // regress.
    const storage = await createRenderTestStorage();
    try {
      await seedCodenameCards(storage);
      await seedModRuleFamily(storage);
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();

      const html = await storage.engine.render("*script", "closed");
      expect(helpContentOf(html)).toBe("&amp;nbsp;");
    } finally {
      storage.close();
    }
  });

  it("*all+*style joins help text + setting_link (oracle 000012-_all_style, rule branch)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCodenameCards(storage);
      await seedRuleBranchFamily(storage);
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();

      const html = await storage.engine.render("*all+*style", "closed");
      expect(helpContentOf(html)).toBe(
        "Skin (collection of stylesheets) for card&#39;s page. " +
        "&lt;a target=&quot;_blank&quot; class=&quot;external-link&quot; " +
        "href=&quot;http://decko.org/skins&quot;&gt;more&lt;/a&gt; " +
        "&lt;div class=&quot;ms-auto&quot;&gt;" +
        "&lt;a class=&quot;text-muted known-card&quot; href=&quot;/*style&quot;&gt; " +
        "(1 style rules)&lt;/a&gt;&lt;/div&gt;",
      );
    } finally {
      storage.close();
    }
  });

  it("Sign up+*type+*on create joins help text + setting_link (oracle 000016-Sign_up_type_on_create)", async () => {
    const storage = await createRenderTestStorage();
    try {
      await seedCodenameCards(storage);
      await seedRuleBranchFamily(storage);
      const resolver = installHelpRules(storage.engine, storage.fetcher);
      await resolver.prepare();

      const html = await storage.engine.render("Sign up+*type+*on create", "closed");
      expect(helpContentOf(html)).toBe(
        "Configure events to be executed when card is created " +
        "&lt;div class=&quot;ms-auto&quot;&gt;" +
        "&lt;a class=&quot;text-muted known-card&quot; href=&quot;/*on_create&quot;&gt; " +
        "(1 on create rules)&lt;/a&gt;&lt;/div&gt;",
      );
    } finally {
      storage.close();
    }
  });
});
