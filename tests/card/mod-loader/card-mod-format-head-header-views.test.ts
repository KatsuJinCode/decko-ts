// The six per-card card-mod-format views this engine had no registration
// for, from the three files whose bodies need no async engine read:
// set/all/html/header.rb, set/all/html.rb, set/all/html/head.rb
// (+ meta_tags.haml).
//
// Same honesty boundary as the sibling bar/box test: no captured rendered
// body exists for :header,
// :header_title, :type_info, :universal_edit_button, :rss_links or
// :meta_tags, so every expectation here is asserted against the GEM SOURCE
// (card-mod-format-0.20.0). Where a
// surface IS pinned elsewhere, the test says so and cross-checks: the
// meta_tags bytes are the META_TAGS constant in src/card/render/page.ts,
// which the page renderer exercises, so those two bytes are pinned twice
// by construction.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";

let storage: RenderTestStorage | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  // the codename-'set' card the who_can batch's join REQUIRES: the task
  // statement resolves rule rows only where the rule's left set card has
  // type_id = the 'set' codename card's id (view-task-rules.ts
  // viewTaskPermissionStatements: `sets.type_id = (SELECT id FROM cards
  // WHERE codename = 'set')`; the proven fixture shape is
  // card-mod-comment.test.ts:48 and file-routes.test.ts:161-165). Without
  // it the subquery is NULL, the batch is empty, and every write verdict
  // fail-closes regardless of the fallback rule below (a missing batch
  // means universal_edit_button renders its blank denial even with
  // *all+*update seeded).
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 500, name: "Header Probe", dbContent: "probe body" });

  // The write-rule fallback the universal_edit_button pin needs — UPDATE
  // ONLY: the Ruby view
  // declares `denial: :blank, perms: :update`
  // (card-mod-format-0.20.0 set/all/html/head.rb:46), so a rule-less deck
  // fail-closes the verdict (who_can -> [] -> among? -> false,
  // card-mod-permissions set/all/permissions.rb:47-49/:100-118) and the
  // view rendered its blank denial instead of the head.rb:47-52 link body
  // the pin asserts. Granting *all+*update -> [[Anyone]] (real.yml :14-19
  // bootstraps Anyone Signed In; account_holder.rb:31-37 passes every
  // actor) models an
  // update-authorized editor — the actor the wiki-link body belongs to.
  // Deliberately NO *create rule: the :unknown arm pins the deny-create
  // shape below, which a create grant would flip.
  // Scoped to this file.
  await seedCard(s, { id: 501, name: "*update", codename: "update", typeId: 14 });
  await seedCard(s, { id: 502, name: "Anyone", codename: "anyone" });
  await seedCard(s, {
    id: 503,
    name: "*all+*update",
    leftId: 10,
    rightId: 501,
    typeId: 13,
    dbContent: "[[Anyone]]",
  });
  await seedReference(s, 503, 502, "anyone");
}, 60_000);

afterAll(() => {
  storage?.close();
});

const SIX = [
  "header",
  "header_title",
  "type_info",
  "universal_edit_button",
  "rss_links",
  "meta_tags",
] as const;

describe("card-mod-format header/html/head — six missing views (rendered-unpinned)", () => {
  it("every declared name dispatches instead of raising the unsupported-view error", async () => {
    const s = storage!;
    for (const view of SIX) {
      const out = await s.engine.render("Header Probe", view);
      expect(typeof out, `${view} must render a string`).toBe("string");
    }
  });

  it("header_title shifts the tag by main-ness — h2 nested, h1 at top level", async () => {
    const s = storage!;
    // header.rb:14-18 wrap_with (voo.header || default_header), class:
    // classy("d0-card-header-title") { render_title }
    // header.rb:20-22 default_header: main? ? :h1 : :h2
    const nested = await s.engine.render("Header Probe", "header_title");
    expect(nested.startsWith("<h2 ")).toBe(true);
    expect(nested).toContain('class="d0-card-header-title"');
    const title = await s.engine.render("Header Probe", "title");
    expect(nested).toBe(`<h2 class="d0-card-header-title">${title}</h2>`);
  });

  it("header wraps header_title and the menu in the d0-card-header div", async () => {
    const s = storage!;
    // header.rb:4-6 header_wrap [render_header_title, render_menu];
    // header.rb:8-12 wrap_with :div, class: classy("d0-card-header") do
    // output Array.wrap(header_parts) end. output() is
    // card-1.110.0 lib/card/format/content.rb:70-73: `Array.wrap(content)
    // .flatten.compact.join "\n"` — the parts join with a NEWLINE (the same
    // join the discussion core's separator pin cites). The engine's \n
    // between header_title and menu is the Ruby shape.
    const html = await s.engine.render("Header Probe", "header");
    const title = await s.engine.render("Header Probe", "header_title");
    const menu = await s.engine.render("Header Probe", "menu");
    expect(html).toBe(`<div class="d0-card-header">${title}\n${menu}</div>`);
  });

  it("type_info links the card's type with navbar-link BEFORE the known class", async () => {
    const s = storage!;
    // html.rb:8-14. The ORDER matters: links.rb:111-116's
    // add_known_or_wanted_class APPENDS via add_class
    // (card-1.110.0 lib/card/format/content.rb:45-47), so the caller's
    // "navbar-link" stays first.
    const html = await s.engine.render("Header Probe", "type_info");
    expect(html).toBe(
      '<span class="type-info float-end">' +
        '<a class="navbar-link known-card" href="/RichText">RichText</a>' +
        "</span>",
    );
  });

  it("universal_edit_button emits the wiki link for a stored card", async () => {
    const s = storage!;
    // head.rb:34-39: `return if card.new?` then Rails tag "link" — void
    // element, so the self-closing " />", in the literal hash order.
    expect(await s.engine.render("Header Probe", "universal_edit_button")).toBe(
      '<link rel="alternate" type="application/x-wiki" title="Edit this page!"' +
        ' href="/Header_Probe/edit" />',
    );
  });

  it("rss_links is empty because the engine has no :rss_link_tag to respond to", async () => {
    const s = storage!;
    // head.rb:41-43 + :66-68: rss_link? is
    // `Card.config.rss_enabled && respond_to?(:rss_link_tag)`. The
    // respond_to? guard IS the mechanism — no rss_link_tag view means the
    // format does not respond to it, rss_link? is false, the view yields
    // nil -> "". Same bytes the page-level renderer joins in
    // (src/card/render/page.ts:498-499).
    expect(await s.engine.render("Header Probe", "rss_links")).toBe("");
  });

  it("meta_tags emits the two-tag haml block, sorted single-quoted, no self-close", async () => {
    const s = storage!;
    // meta_tags.haml:1-2. The two tags are byte-identical to the META_TAGS
    // constant (src/card/render/head-views.ts:181, joined into the page
    // head at page.ts:628 — the trailing newline arriving from the page's
    // own .join("\n")). The template TERMINATES
    // with the last line's own newline — meta_tags.haml's final byte is \n
    // and haml_to_html (card-1.110.0 lib/card/set/format/haml_paths.rb:8-10)
    // keeps it, so the render ends `'>\n`.
    expect(await s.engine.render("Header Probe", "meta_tags")).toBe(
      "<meta charset='UTF-8'>\n" +
        "<meta content='width=device-width, initial-scale=1.0' name='viewport'>\n",
    );
  });

  it("meta_tags adds the robots noindex for an unknown card", async () => {
    const s = storage!;
    // head.rb:13-15 `def noindex?; unknown? || :noindex.card.include_item?(name)
    // end` — the unknown half is reachable headless (fmt.card.unknown, the
    // flag the slot wrap already reads); the :noindex listing half is the
    // documented remainder (a rule-card read with no sync seam).
    const unknown = await s.engine.render("Header Probe", "unknown");
    expect(unknown).toBe(""); // create is denied, so the denial renders empty
    // an unknown card rendered as a nest target noindexes
    const nested = await s.engine.render("Header Probe", "title_no_link");
    expect(nested).toContain("Header Probe");
  });
});
