// A pointer/list host whose right
// setting is `*input type` renders its items through the `:name` item view,
// so the wrapper is `card-list-name` and each item is the item CARD'S NAME
// with no slot element and no permission denial.
//
// MECHANISM (ruby):
//
//   decko/mod/edit/set/right/input_type.rb:1-5
//     assign_type :pointer
//     format :html do
//       def default_item_view
//         :name
//       end
//
// `default_item_view` is a SET-MODULE method. card-mod-format's
// set/all/html.rb:20-22 says `:bar`; `set/right/input_type` is a more
// specific set, so Cardio's precedence puts the `:name` override ABOVE
// it for every card whose right name is `*input type`. Those cards are
// `assign_type :pointer`, so standard_pointer_core runs on them, and both
// of its class strings read the resolved value:
//
//   decko/mod/collection/set/all/item.rb:134-140
//     def implicit_item_view
//       view = voo_items_view || default_item_view
//       Card::View.normalize view
//     end
//   decko/mod/list/set/abstract/01_list/html_views.rb:6-13
//     class: "card-list card-list-#{item_view_options[:view]} pointer-list"
//   decko/mod/list/set/abstract/01_list/html_views.rb:28-30
//     %(<div class="pointer-item item-#{item_view}">#{rendered}</div>)
//
// The item BODY is `view :name, compact: true, perms: :none`
// (decko/mod/format/set/all/base.rb:14-16) -> `name_variant safe_name` ->
// `card&.name`. That declaration carries NO `wrap: :slot`, so
// `Card::Format#wrap_and_render` (render.rb:14-16) adds no card-slot div,
// and `perms: :none` means no denial span for an unreadable item.
//
// The BODY is the RESOLVED card's name, not the raw item line: the items
// come from `card.item_cards` (01_list/other_views.rb:11-14). The pinned
// family covers both directions:
//
//   `*script+*right+*input type`  dbContent `list`
//     -> <div class="pointer-item item-name">List</div>
//        (the item line resolves through the lexicon to the REAL card 47,
//         `List`, the cardtype whose key is `list`; `name.s` capitalizes)
//   `*follow+*right+*input type`  dbContent `radio`
//     -> <div class="pointer-item item-name">radio</div>
//        (`radio` is absent from the deck, so its phantom name IS the line)
//
// GATE SCOPE: the `name` item view appears ONLY on `*X+*Y+*input type`
// cards ({content, open} views); no other surface renders this view, which
// is why the gate is a right-setting key and not
// a broader "list items can be plain names" branch.
//
// The pinned shapes are transcribed, not read from any fixture at test
// time.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "./render-test-storage.js";
import { isInputTypeRuleCard } from "../../../src/card/render/pointer-list.js";
import { DeckoName } from "../../../src/card/name.js";

let storage: RenderTestStorage | undefined;

async function seedDeck(): Promise<void> {
  const s = storage!;
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 3, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 47, name: "List", codename: "list", typeId: 2 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 1, dbContent: "{}" });
  // The `*input type` setting the set/right/input_type module is named for.
  await seedCard(s, { id: 241, name: "*input type", codename: "input_type", typeId: 2 });
  // A second right setting with NO default_item_view override, so the pin
  // also holds the deck-wide `:bar` default in place.
  await seedCard(s, { id: 20, name: "*follow", codename: "follow", typeId: 2 });
  // The left trunks. A 3-part rule card is a JUNCTION: its left_id points at
  // its own `<left>+*right` trunk card, which is itself a junction over the
  // left card and the right setting (the 2020 Lexicon convention — see
  // markdown-cardtype-kramdown-core-corpus-parity
  // .test.ts:150-199).
  await seedCard(s, { id: 300, name: "*script", codename: "script", typeId: 2 });
  await seedCard(s, { id: 301, name: "*right", codename: "right", typeId: 2 });
  await seedCard(s, { id: 302, name: "*script+*right", typeId: 2, leftId: 300, rightId: 301 });
  await seedCard(s, { id: 303, name: "*follow+*right", typeId: 2, leftId: 20, rightId: 301 });

  // `<trunk>+*input type` — List-typed (assign_type :pointer), content is
  // the item line.
  await seedCard(s, { id: 20601, name: "*script+*right+*input type", typeId: 47, leftId: 302, rightId: 241, dbContent: "list" });
  await seedCard(s, { id: 22723, name: "*follow+*right+*input type", typeId: 47, leftId: 303, rightId: 241, dbContent: "radio" });
  // Same shape, right WITHOUT the override.
  await seedCard(s, { id: 20602, name: "*script+*right+*follow", typeId: 47, leftId: 302, rightId: 20, dbContent: "list" });
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("pointer/list item view: the *input type right's :name default", () => {
  it("gates on the right-setting key, not the deck-wide bar default", () => {
    const gated = (name: string) =>
      isInputTypeRuleCard({ name: DeckoName.parse(name) } as never);
    expect(gated("*script+*right+*input type")).toBe(true);
    expect(gated("*follow+*right+*input type")).toBe(true);
    expect(gated("*script+*right+*follow")).toBe(false);
    expect(gated("*script+*right")).toBe(false);
    expect(gated("Some List Card")).toBe(false);
  });

  it("renders an *input type rule card's items through the :name view", async () => {
    const html = await storage!.engine.render("*follow+*right+*input type", "content");
    // The wrapper class carries the item view (html_views.rb:6-13).
    expect(html).toContain(`<div class="card-list card-list-name pointer-list">`);
    // The item wrap carries it too (html_views.rb:28-30), and the body is
    // the item name with NO slot element and NO denial span.
    expect(html).toContain(`<div class="pointer-item item-name">radio</div>`);
    // Scoped to the POINTER LIST body: the HOST card's own content-view
    // slot div legitimately wraps the whole list.
    const list = html.slice(html.indexOf(`<div class="card-list`));
    expect(list).not.toContain("item-bar");
    expect(list).not.toContain("card-slot");
    expect(list).not.toContain(`class="denied"`);
  });

  it("renders the RESOLVED item card's name, not the raw item line", async () => {
    const html = await storage!.engine.render("*script+*right+*input type", "content");
    // dbContent is the lowercase line `list`; it resolves through the
    // lexicon to the real card 47 (`List`), whose name.s is capitalized.
    expect(html).toContain(`<div class="pointer-item item-name">List</div>`);
  });

  it("keeps the deck-wide :bar item view for a right with no override", async () => {
    const html = await storage!.engine.render("*script+*right+*follow", "content");
    expect(html).toContain(`<div class="card-list card-list-bar pointer-list">`);
    expect(html).toContain(`<div class="pointer-item item-bar">`);
    expect(html).not.toContain("item-name");
  });
});
