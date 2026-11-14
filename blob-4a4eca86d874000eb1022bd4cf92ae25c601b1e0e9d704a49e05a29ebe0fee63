// The set-page rule rows' bar_nav hide list must follow Ruby's
// `voo.hide :bar_nav unless existing_rule_card` (bar_view.rb:11) for
// EVERY rendered row — including the rows the pre-fix preload walk never
// memoized:
//
// 1. THE *star SET PAGE. The set card *star carries codename "star"; the
//    preload's existing-rule resolution asked prototypePatternInput for
//    the set's prototype and got undefined (the "star" pattern code was
//    not handled), so EVERY virtual row hid bar_nav. Correct behavior:
//    bar_nav hides only on the 8 rows whose rule exists at NO candidate
//    level (*autoname *help *input type *on create *on update *on delete
//    *thanks *follow) and stays on the 12 rows whose rule resolves at the
//    *all+<setting> level (*default *create *read *update *delete
//    *captcha *head *layout *style *script *guide *follow fields) —
//    exactly the nameless prototype's candidate reach.
// 2. THE RESTRICTED SETTINGS' rows: content_options/content_option_view
//    were filtered out of the preload walk by visibleGroupSettings
//    (SETTING_NEVER_VISIBLE) while the renderer's restricted_to_type gate
//    still RENDERS their rows on sets whose prototype type is
//    list/pointer/session. An unmemorized setting must not hide bar_nav
//    where a global *all+*content option view rule exists.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

const SET_TYPE_ID = 1;
const SETTING_TYPE_ID = 2;
const LIST_TYPE_ID = 3;

const SETTINGS: Array<[number, string, string]> = [
  [20, "*read", "read"],
  [21, "*default", "default"],
  [22, "*autoname", "autoname"],
  [23, "*create", "create"],
  [24, "*update", "update"],
  [25, "*delete", "delete"],
  [26, "*captcha", "captcha"],
  [27, "*head", "head"],
  [28, "*layout", "layout"],
  [29, "*style", "style"],
  [30, "*script", "script"],
  [31, "*help", "help"],
  [32, "*input type", "input_type"],
  [33, "*guide", "guide"],
  [34, "*thanks", "thanks"],
  [35, "*follow", "follow"],
  [36, "*follow fields", "follow_fields"],
  [37, "*content options", "content_options"],
  [38, "*content option view", "content_option_view"],
  [39, "*on create", "on_create"],
  [40, "*on update", "on_update"],
  [41, "*on delete", "on_delete"],
  [42, "*self", "self"],
];

async function seedDeck(): Promise<void> {
  const s = storage!;
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 3, name: "List", codename: "list" });
  await seedCard(s, { id: 4, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 7, name: "Anyone Signed In", codename: "anyone_signed_in" });
  await seedCard(s, { id: 8, name: "Anonymous", codename: "anonymous" });
  // The anchorless set card + the pattern card whose codename names the
  // *star set's pattern ("star").
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: SET_TYPE_ID, dbContent: "{}" });
  await seedCard(s, { id: 11, name: "*star", codename: "star", typeId: SET_TYPE_ID, dbContent: '{"complete":"*"}' });
  for (const [id, name, codename] of SETTINGS) {
    await seedCard(s, { id, name, codename, typeId: SETTING_TYPE_ID });
  }
  // The deck's readable grant.
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, typeId: LIST_TYPE_ID, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 6, "anyone");
  // The *star set card's own read grant (the *star page must be readable;
  // the bare *all grant does not reach it in this synthetic deck).
  await seedCard(s, { id: 51, leftId: 11, rightId: 20, typeId: LIST_TYPE_ID, dbContent: "[[Anyone]]" });
  await seedReference(s, 51, 6, "anyone");
  // The *all-level rules the *star page's prototype walk resolves. The
  // settings ABSENT from this list (*autoname *help *input type *on create
  // *on update *on delete *thanks *follow) are the rows that MUST hide
  // bar_nav — no stored rule exists at any candidate level.
  const allRules: Array<[number, number, string, string]> = [
    [60, 21, "", "default"],
    [61, 23, "[[Anyone Signed In]]", "create"],
    [62, 24, "[[Anyone Signed In]]", "update"],
    [63, 25, "[[Anonymous]]", "delete"],
    [64, 26, "1", "captcha"],
    [65, 27, "{{:head|core}}", "head"],
    [66, 28, "Default Layout", "layout"],
    [67, 29, "quartz skin customized", "style"],
    [68, 30, "mod scripts", "script"],
    [69, 33, "Editing Guide", "guide"],
    [70, 36, "*nests", "follow_fields"],
    // The restricted setting's global rule — the "smart_label" value the
    // content option view row must render.
    [71, 38, "smart_label", "content_option_view"],
  ];
  for (const [id, rightId, content] of allRules) {
    await seedCard(s, { id, leftId: 10, rightId, typeId: LIST_TYPE_ID, dbContent: content });
  }
  // A List-typed anchor with a SELF set: the prototype (the real *doc
  // card) is List-typed, so the restricted_to_type gate RENDERS the
  // content option rows on that set page — the shape the oracle's
  // *content options+*right page pins for the whole class.
  await seedCard(s, { id: 80, name: "*doc", typeId: LIST_TYPE_ID, dbContent: "a\nb" });
  await seedCard(s, { id: 81, leftId: 80, rightId: 42, typeId: SET_TYPE_ID, dbContent: "{}" });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
  const settingNames = SETTINGS.map(([, name]) => name);
  for (const name of settingNames) {
    try {
      await storage.engine.render(name, "open");
    } catch {
      // best-effort warm-up only
    }
  }
}, 60_000);

afterAll(() => {
  storage?.close();
});

/** The data-slot JSON of the set page's row for one setting, by the row's
 *  slot id (`card-<safe-key>-bar-view`). */
async function starRowSlot(settingSafe: string): Promise<string> {
  const html = await storage!.engine.render("*star", "content");
  const at = html.indexOf(`Xstar-X${settingSafe}-bar-view`);
  expect(at, `row *${settingSafe} not in ${html.length}-byte page`).toBeGreaterThan(-1);
  const slotStart = html.lastIndexOf("<div", at);
  return html.slice(slotStart, slotStart + 1600);
}

describe("set-page rule rows: bar_nav hides only when no existing rule resolves", () => {
  it("keeps bar_nav on the *star rows whose rule resolves at the *all level", async () => {
    // The *star page rows for default/create/read/update/delete/captcha/
    // head/layout/style/script/guide/follow fields carry NO hide key.
    for (const setting of [
      "default", "create", "read", "update", "delete", "captcha",
      "head", "layout", "style", "script", "guide", "follow_field",
    ]) {
      const slot = await starRowSlot(setting);
      expect(
        slot.includes("&quot;hide&quot;:[&quot;bar_nav&quot;]"),
        `row *star+*${setting} must not hide bar_nav`,
      ).toBe(false);
    }
  });

  it("hides bar_nav on the *star rows with no rule at any level", async () => {
    for (const setting of [
      "autoname", "help", "input_type", "thank", "follow",
      "on_create", "on_update", "on_delete",
    ]) {
      const slot = await starRowSlot(setting);
      expect(
        slot.includes("&quot;hide&quot;:[&quot;bar_nav&quot;]"),
        `row *star+*${setting} must hide bar_nav`,
      ).toBe(true);
    }
  });

  it("memoizes the restricted settings so their rendered rows keep the nav", async () => {
    // The *doc+*self set page renders the content option rows (the set's
    // prototype — the real *doc card — is List-typed). The global
    // *all+*content option view rule exists ("smart_label"), so the row's
    // bar_nav stays and the bar-right nests THAT rule's one-line value.
    const html = await storage!.engine.render("*doc+*self", "content");
    const at = html.indexOf("Xdoc-Xself-Xcontent_option_view-bar-view");
    expect(at).toBeGreaterThan(-1);
    const slotStart = html.lastIndexOf("<div", at);
    const slot = html.slice(slotStart, slotStart + 2000);
    expect(slot).not.toContain("&quot;hide&quot;:[&quot;bar_nav&quot;]");
    expect(slot).toContain("smart_label");
  });
});
