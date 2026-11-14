// The `filter:` nest option must reach the :bar_setting_list view, or both
// setting lists on a role dashboard render the SAME full :all list.
//
// THE DEFECT
//   A page whose content holds the two filtered nests below rendered the
//   full 21-setting sorted list in BOTH blocks, where the reference render
//   shows 4 bars in the first (head, layout, style, script) and 5 in the
//   second (create, read, update, delete, captcha):
//     <h5>Webpage rules</h5>
//     <blockquote>{{:all|bar_setting_list; filter:webpage}}</blockquote>
//     <h5>Permission rules</h5>
//     <blockquote>{{:all|bar_setting_list; filter:permission}}</blockquote>
//
// THE MECHANISM
//   Ruby: mod/rules/set/type/set/html_views/rule_lists.rb:11-14
//     view :bar_setting_list … do
//       group = voo.filter&.to_sym || :all
//       category_setting_list_items(group, :bar, hide: :full_name)
//   -> setting_categories.rb:30-45 category_settings(:webpage) -> :58-60
//      group_settings(:webpage) -> the :webpage SETTING GROUP
//   (card/lib/card/setting.rb:46-55 `self.groups = %i[templating permission
//   webpage editing event other]`).
//   The engine PARSED `filter:webpage` correctly — it is a SHARK key
//   (src/card/render/nest-syntax.ts:31-37) and lands in `options.extra` — and
//   then DROPPED it on the way into the view context:
//   src/card/render/format.ts `nestOptionEntries` cherry-picked title, size,
//   show, hide, items, unknown and type, and `filter` was not on the list.
//   So `barSettingListBody` (src/card/render/views.ts) always read
//   `ctx.voo.opts["filter"]` as undefined and fell back to "all".
//   Ruby has no such drop: card/lib/card/format/nest.rb's `view_opts` IS the
//   voo's option hash (Nest#initialize:13; `prepare_view_and_opts!` only ADDS
//   :nest_name and :home_view), so `voo.filter` reads the nest's own value.
//
// WHAT THIS FILE PINS
//   1. (RED without the fix) a card whose CONTENT nests
//      `{{:all|bar_setting_list; filter:webpage}}` renders exactly the four
//      :webpage-group rule bars, and NOT the other 17 settings.
//   2. (RED without the fix) the same content with `filter:permission` renders
//      exactly the five :permission-group rule bars.
//   3. (green before and after — the control) the same card with NO filter
//      still renders all 21 in the sorted :all order: the fix narrows the
//      filtered case, it does not change the default.
//   4. (green before and after — the control) the `filter` opt parses into
//      `options.extra` regardless, so the defect was never the PARSER.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { parseNestOptions } from "../../../src/card/render/nest-syntax.js";

/** The 21 visible settings in sorted all_settings order
 *  (setting_registry.all_settings_sorted; the same list the sibling
 *  card-mod-rules-views.test.ts pins). */
const ALL_SETTINGS_SORTED = [
  "autoname", "captcha", "create", "default", "delete", "follow",
  "follow_fields", "guide", "head", "help", "input_type", "layout",
  "on_create", "on_delete", "on_update", "read", "script", "structure",
  "style", "thanks", "update",
] as const;

/** views.ts GROUP_TO_SETTINGS:314-3121 — the engine's transcription of
 *  Card::Setting.groups (card/lib/card/setting.rb:46-55), in the group's
 *  declaration order, which is also the ORDER the bars must appear in. */
const WEBPAGE_GROUP = ["head", "layout", "style", "script"] as const;
const PERMISSION_GROUP = ["create", "read", "update", "delete", "captcha"] as const;

const SETTING_CARDS: Array<{ id: number; name: string; codename: string }> = [
  { id: 101, name: "*structure", codename: "structure" },
  { id: 102, name: "*default", codename: "default" },
  { id: 103, name: "*autoname", codename: "autoname" },
  { id: 104, name: "*create", codename: "create" },
  { id: 105, name: "*read", codename: "read" },
  { id: 106, name: "*update", codename: "update" },
  { id: 107, name: "*delete", codename: "delete" },
  { id: 108, name: "*captcha", codename: "captcha" },
  { id: 109, name: "*head", codename: "head" },
  { id: 110, name: "*layout", codename: "layout" },
  { id: 111, name: "*style", codename: "style" },
  { id: 112, name: "*script", codename: "script" },
  { id: 113, name: "*help", codename: "help" },
  { id: 114, name: "*input type", codename: "input_type" },
  { id: 115, name: "*guide", codename: "guide" },
  { id: 116, name: "*on create", codename: "on_create" },
  { id: 117, name: "*on update", codename: "on_update" },
  { id: 118, name: "*on delete", codename: "on_delete" },
  { id: 119, name: "*thanks", codename: "thanks" },
  { id: 120, name: "*follow fields", codename: "follow_fields" },
  { id: 121, name: "*follow", codename: "follow" },
];

const TYPE_CARDS: Array<{ id: number; name: string; codename?: string; typeId?: number }> = [
  { id: 2, name: "RichText" },
  { id: 3, name: "Setting", codename: "setting" },
  { id: 4, name: "List" },
  { id: 5, name: "Set", codename: "set" },
  { id: 51, name: "Toggle" },
  { id: 52, name: "Phrase" },
  { id: 58, name: "Nest list" },
  { id: 60, name: "HTML" },
  { id: 61, name: "Pointer" },
];

const HOST_WEBPAGE = 900;
const HOST_PERMISSION = 901;
const HOST_ALL = 902;

/** One host card per arm — the card name is the render key, so each arm
 *  needs its own row rather than a re-seed. */
async function seedHost(id: number, name: string, extract: string): Promise<void> {
  await seedCard(storage!, {
    id,
    name,
    typeId: 2,
    dbContent: `<blockquote>{{:all|bar_setting_list${extract}}}</blockquote>`,
  });
}
function barIds(html: string): string[] {
  return [...html.matchAll(/<div id="Xall-X([a-z_]+)-bar-view"/g)].map((m) => m[1]!);
}

function safeKey(setting: string): string {
  if (setting === "follow_fields") return "follow_field";
  if (setting === "thanks") return "thank";
  return setting;
}

let storage: RenderTestStorage | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  await seedCard(s, { id: 7, name: "*all", codename: "all", typeId: 5 });
  await seedCard(s, { id: 6, name: "Role" });
  await seedCard(s, { id: 8, name: "*anyone", codename: "anyone", typeId: 6 });
  for (const type of TYPE_CARDS) {
    await seedCard(s, { id: type.id, name: type.name, codename: type.codename, typeId: type.typeId });
  }
  for (const setting of SETTING_CARDS) {
    await seedCard(s, { id: setting.id, name: setting.name, codename: setting.codename, typeId: 3 });
  }
  // the three host cards, ONE PER ARM, seeded here so every card row exists
  // before the name environment is installed (RenderFormat.resolveNestName
  // -> DeckoName.parse -> the codename snapshot)
  await seedHost(HOST_WEBPAGE, "Rule Host Webpage", "; filter:webpage");
  await seedHost(HOST_PERMISSION, "Rule Host Permission", "; filter:permission");
  await seedHost(HOST_ALL, "Rule Host All", "");
  s.fetcher.installNameEnvironment();
  // seat *all so the content nests below reach the view on a cold engine
  // (a cold engine needs the seat before these nests resolve). The subject
  // of this pin is the OPTION PLUMBING, not warm order, so the seat is a
  // seeding detail - and every arm renders the same way.
  await s.engine.render("*all", "bar_setting_list");
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("bar_setting_list's `filter:` nest option rides the voo (rule_lists.rb:11-14)", () => {
  it("CONTROL: the parser puts `filter` in options.extra (the defect was never the parser)", () => {
    // green before and after the fix — nest-syntax.ts SHARK_KEYS already
    // carried "filter"; only the hand-rolled nestOptionEntries dropped it.
    expect(parseNestOptions("bar_setting_list; filter:webpage").extra["filter"]).toBe("webpage");
    expect(parseNestOptions("bar_setting_list; filter:permission").extra["filter"]).toBe("permission");
  });

  it("filter:webpage renders ONLY the :webpage group, in group order (RED without the fix)", async () => {
    const html = await storage!.engine.render("Rule Host Webpage", "core");
    expect(barIds(html)).toEqual(WEBPAGE_GROUP.map(safeKey));
  });

  it("filter:permission renders ONLY the :permission group, in group order (RED without the fix)", async () => {
    const html = await storage!.engine.render("Rule Host Permission", "core");
    expect(barIds(html)).toEqual(PERMISSION_GROUP.map(safeKey));
  });

  it("CONTROL: no filter still renders all 21 visible settings in sorted :all order", async () => {
    const html = await storage!.engine.render("Rule Host All", "core");
    const direct = await storage!.engine.render("*all", "bar_setting_list");
    console.log("DBG host", html.length, "direct", direct.length,
      "findSettingCard head=", storage!.engine.findSettingCard?.("head")?.name?.s);
    for (const g of ["webpage","permission","all"]) {
      const h2 = await storage!.engine.render("*all", "bar_setting_list", { viewOpts: { filter: g } });
      console.log("DBG direct filter", g, h2.length, [...h2.matchAll(/<div id="Xall-X([a-z_]+)-bar-view"/g)].map(m=>m[1]).join(","));
    }
    expect(barIds(html)).toEqual(ALL_SETTINGS_SORTED.map(safeKey));
  });
});
