// Bar-menu links on wanted (unknown) bars must carry Ruby's
// `card[name]=<name>` query.
//
// Ruby mechanism: Card::Path#handle_unknown (lib/card/path.rb:89-109) — a
// path mark that is neither standardish (url_key == name.tr(" ", "_"),
// path.rb:107-109) nor known carries `card[name]=<name>` in its query
// (path.rb:84-87, Rails to_param). All four bar-menu links route through
// Card::Path (set/all/html/menu.rb:119-153 full_page_link /
// modal_page_link / edit_link / board_link), so all four gain the query
// on unknown bars.
//
// The rendered cases below pin both sides of handle_unknown: a
// non-standardish wanted name (`Sample-card 111+*self`, whose dashes the
// url_key keeps) gains the query, while a standardish wanted name
// (`*all+*autoname`) stays bare.

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
const RICH_TYPE_ID = 4;

const NAME_QUERY = "card%5Bname%5D=Sample-card+111%2B%2Aself%2B%2Adefault";
const NAME_QUERY_AUTONAME = "card%5Bname%5D=Sample-card+111%2B%2Aself%2B%2Aautoname";

async function seedDeck(): Promise<void> {
  const s = storage!;
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 3, name: "List", codename: "list" });
  await seedCard(s, { id: 4, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: SET_TYPE_ID, dbContent: "{}" });
  const settings: Array<[number, string, string]> = [
    [20, "*read", "read"],
    [21, "*default", "default"],
    [22, "*autoname", "autoname"],
    [23, "*structure", "structure"],
    [24, "*create", "create"],
    [25, "*update", "update"],
    [26, "*delete", "delete"],
    [27, "*captcha", "captcha"],
    [32, "*help", "help"],
    [33, "*input type", "input_type"],
  ];
  for (const [id, name, codename] of settings) {
    await seedCard(s, { id, name, codename, typeId: SETTING_TYPE_ID });
  }
  // Readable grant: *all+*read -> [[Anyone]].
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, typeId: LIST_TYPE_ID, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 6, "anyone");
  // The target card (dashes make the name non-standardish: url_key
  // underscores what tr(" ", "_") keeps) + its stored +*self set card, so
  // `Sample-card 111+*self` renders the rule list with wanted
  // `+*self+*setting` bars.
  await seedCard(s, { id: 80, name: "Sample-card 111", typeId: RICH_TYPE_ID, dbContent: "jerk notes" });
  await seedCard(s, { id: 81, leftId: 80, rightId: 39, typeId: SET_TYPE_ID });
  await seedCard(s, { id: 39, name: "*self", codename: "self", typeId: SETTING_TYPE_ID });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("bar-menu links on wanted bars carry Ruby's handle_unknown card[name] query", () => {
  it("emits the query on all four menu links (oracle 7797 bytes)", async () => {
    const html = await storage!.engine.render("Sample-card 111+*self", "content");
    // full_page_link (menu.rb:119-122): href="/<url_key>?card%5Bname%5D=<name>"
    expect(html).toContain(
      `href="/Sample_card_111+*self+*default?${NAME_QUERY}"`,
    );
    // modal_page_link (menu.rb:130-133): card[name] sorts before layout.
    expect(html).toContain(
      `href="/Sample_card_111+*self+*default?${NAME_QUERY}&amp;layout=modal"`,
    );
    // edit_link (menu.rb:151-153): query after the /edit view segment.
    expect(html).toContain(
      `href="/Sample_card_111+*self+*default/edit?${NAME_QUERY}"`,
    );
    // board_link: query after the /board view segment.
    expect(html).toContain(
      `href="/Sample_card_111+*self+*default/board?${NAME_QUERY}"`,
    );
    // Second wanted bar, distinct query value (no shared-constant leak).
    expect(html).toContain(
      `href="/Sample_card_111+*self+*autoname?${NAME_QUERY_AUTONAME}"`,
    );
  });

  it("keeps known-card menu hrefs bare (known_name? short-circuits, path.rb:98-100)", async () => {
    const html = await storage!.engine.render("Sample-card 111+*self", "content");
    // The stored +*self card is known — no link to it picks up the query.
    // (Known-bar menu bytes are pinned by their own suite; this render
    // only exercises the rule list.)
    expect(html).not.toContain("/Sample_card_111+*self?card%5B");
    expect(html).not.toContain("/Sample_card_111+*self/edit?card%5B");
  });

  it("emits no query for standardish wanted names (path.rb:107-109, oracle 274 bytes)", async () => {
    const html = await storage!.engine.render("*all", "content");
    // `*all+*autoname`.url_key == `*all+*autoname`.tr(" ", "_") — the
    // url_key loses nothing, so Ruby emits no card[name] even though the
    // bar is wanted: the href stays bare.
    expect(html).toContain('href="/*all+*autoname"');
    expect(html).not.toContain("*all+*autoname?card%5B");
    expect(html).not.toContain("*all+*help?card%5B");
  });
});
