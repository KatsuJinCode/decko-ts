// The thirteen card-mod-bar_and_box views the shared render table had no
// implementation for, plus the three card-mod-format title/open_content
// views that the box family and the title machinery call.
//
// Why this file lives in mod-loader/ and not render/: these views are
// registered in src/card/render/views.ts's HTML_VIEWS (the shared view
// table), NOT in a mod manifest, because card-mod-bar_and_box has no
// manifest: its bar markup was inlined into :bar / :open / :closed and
// the view NAMES had nothing to dispatch to. The file sits beside the
// other mod-view pin suites it shares fixtures and conventions with.
//
// HONESTY BOUNDARY, byte-first: the pinned Ruby-oracle captures carry NO
// bytes for :bar_body,
// :bar_menu, the four bar aliases, :full_bar, the box family, :boxed,
// :boxed_link, :title_link, :title_no_link or :open_content. Every
// expectation below is therefore asserted against the GEM SOURCE shape
// (card-mod-bar_and_box-0.20.0
// set/all/bar.rb, bar_body.haml, bar_menu.haml, box.rb, box.haml,
// set/type/image.rb; card-mod-format-0.20.0 set/all/title.rb,
// set/all/base.rb), not against a Ruby capture. These views are
// RENDERED-UNPINNED. What the tests do prove is that each name dispatches
// (was UnsupportedViewError before this port) and that the bytes carry the
// structure the gem source mandates, with the exact class lists, the alias
// slot-id rule, and the image-size map.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  type RenderTestStorage,
} from "../render/render-test-storage.js";

let storage: RenderTestStorage | undefined;

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;
  // the seed deck the bar/box machinery reads: the type card supplies
  // data-card-type-name, *all/*self the set keys.
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  // the probe: a simple-name RichText card, so trunkName === the name and
  // the box title/link target are unambiguous.
  await seedCard(s, { id: 400, name: "Box Probe", dbContent: "probe body" });
  // a compound-name card, so image_box_card_name must take the LEFT name
  // (image.rb:8 `card.name.compound? ? card.name.left : card.name`).
  // seedCard nulls the name column for a compound name and keys the row by
  // left_id/right_id (render-test-storage.ts:189-193), so both halves are
  // real seeded cards.
  await seedCard(s, { id: 402, name: "child" });
  await seedCard(s, {
    id: 401,
    name: "Box Probe+child",
    leftId: 400,
    rightId: 402,
    dbContent: "child body",
  });
  // :boxed / :boxed_link live on Type::Image (card-mod-bar_and_box
  // set/type/image.rb), so their probes are Image-typed: a simple name and
  // a compound whose left is the box card.
  await seedCard(s, { id: 403, name: "Image", codename: "image" });
  await seedCard(s, { id: 404, name: "Box Image", typeId: 403, dbContent: "https://example.com/box.png" });
  await seedCard(s, {
    id: 405,
    name: "Box Image+child",
    leftId: 404,
    rightId: 402,
    typeId: 403,
    dbContent: "https://example.com/child.png",
  });
}, 60_000);

afterAll(() => {
  storage?.close();
});

/** Every view this file covers: the thirteen bar_and_box declarations the
 *  coverage doc counted missing, plus the three format views. */
const BOX_AND_BAR_VIEWS = [
  "bar_body",
  "bar_menu",
  "closed_bar",
  "accordion_bar",
  "open_bar",
  "expanded_bar",
  "full_bar",
  "box",
  "box_top",
  "box_middle",
  "box_bottom",
  "boxed",
  "boxed_link",
  "title_link",
  "title_no_link",
  "open_content",
] as const;

describe("card-mod-bar_and_box — the thirteen missing views (rendered-unpinned)", () => {
  it("every declared name dispatches instead of raising the unsupported-view error", async () => {
    const s = storage!;
    for (const view of BOX_AND_BAR_VIEWS) {
      const probe = view === "boxed" || view === "boxed_link" ? "Box Image" : "Box Probe";
      const out = await s.engine.render(probe, view);
      expect(typeof out, `${view} must render a string`).toBe("string");
    }
  });

  it("boxed and boxed_link are unsupported outside Type::Image (render.rb#view_method)", async () => {
    const s = storage!;
    await expect(s.engine.render("Box Probe", "boxed")).rejects.toThrow(/not supported/);
    await expect(s.engine.render("Box Probe", "boxed_link")).rejects.toThrow(/not supported/);
  });

  it("bar_body is the bare bar_body.haml row — no slot wrapper, and no prepare_bar of its own", async () => {
    const s = storage!;
    const html = await s.engine.render("Box Probe", "bar_body");
    // bar_body.haml:1 `.row.g-0{ class: classy("bar-body") }`
    expect(html.startsWith("<div class='bar-body row g-0'>\n")).toBe(true);
    // The col classes are NOT the view's own: Ruby runs prepare_bar in the
    // PARENT (:bar / :mini_bar / :closed / :open — bar.rb:10-22, 44-52), so a
    // standalone render :bar_body has the same bare classes Ruby would give.
    expect(html).toContain("<div class='bar-left'>");
    expect(html.endsWith("</div>\n")).toBe(true);
    expect(html).not.toContain("card-slot");
  });

  it("through :open, prepare_bar supplies the cols and HIDES bar_middle", async () => {
    const s = storage!;
    // bar.rb:44-52 build_accordion_bar -> prepare_bar mini_bar_cols:
    // bar-left col-9, bar-right col-3 (bar.rb:6 mini_bar_cols 9, 3) and
    // `voo.hide :bar_middle` (bar.rb:88). The `d-none d-md-flex` class_up
    // (bar.rb:87) lands on bar-middle, which is HIDDEN — so it is absent
    // from the emitted bytes and shows up instead in the slot's hide list.
    const html = await s.engine.render("Box Probe", "open_bar");
    expect(html).toContain("<div class='bar-left col-9'>");
    expect(html).toContain("<div class='bar-right col-3'>");
    expect(html).not.toContain("bar-middle");
    expect(html).toContain("&quot;hide&quot;:[&quot;bar_middle&quot;]");
    // open: true, so the body is bar_bottom inline, not the card stub.
    expect(html).toContain("accordion-body d0-card-body");
    expect(html).not.toContain("card-slot-stub");
  });

  it("bar_menu emits the four bar_menu_items in bar.rb order", async () => {
    const s = storage!;
    const html = await s.engine.render("Box Probe", "bar_menu");
    // bar.rb:69-74 bar_menu_items = full page, modal, edit, board
    const order = ["page", "modal", "edit", "advanced"];
    const at = order.map((t) => html.indexOf(`> ${t}</a>`));
    expect(at.every((i) => i >= 0)).toBe(true);
    for (let i = 1; i < at.length; i++) expect(at[i]).toBeGreaterThan(at[i - 1] as number);
    // a STORED card is known, so the full-page link carries known-card
    // (bar_and_box itemBarMenuHtml's known/wanted split).
    expect(html).toContain('class="full-page-link known-card"');
    // the haml wrapper is bar_menu.haml:1-2
    expect(html.startsWith("<div class='bar-menu _over-card-link _card-link-clickable'>")).toBe(true);
  });

  it("the closed/open aliases carry their OWN name in the slot id, not closed/open", async () => {
    const s = storage!;
    // wrap.rb:31-33 slot_id = "<safe_key>-<@current_view>-view", and
    // rendering an alias sets @current_view to the ALIAS. This is the one
    // place an alias port can silently inherit the target's slot id.
    for (const [alias, target] of [
      ["closed_bar", "closed"],
      ["accordion_bar", "closed"],
      ["open_bar", "open"],
      ["expanded_bar", "open"],
    ] as const) {
      const html = await s.engine.render("Box Probe", alias);
      expect(html, `${alias} slot id`).toContain(`id="box_probe-${alias}-view"`);
      expect(html, `${alias} must not borrow ${target}'s slot id`).not.toContain(
        `id="box_probe-${target}-view"`,
      );
      // closed aliases stub the body (bar.rb:96-98 bar_bottom open=false
      // -> card_stub); open aliases render bar_bottom inline.
      if (target === "closed") {
        expect(html).toContain('class="card-slot card-slot-stub"');
      }
    }
  });

  it("full_bar runs class_up_cols over THREE classes with no md prefix and hides nothing", async () => {
    const s = storage!;
    const html = await s.engine.render("Box Probe", "full_bar");
    expect(html).toContain("id=\"box_probe-full_bar-view\"");
    // bar.rb:19-20 class_up_cols %w[bar-left bar-middle bar-right], bar_cols
    // with context=nil. On a NON-rule card bar_cols is the *all module's
    // TWO-element `bar_cols 9, 3` (bar.rb:5), indexed by the CLASS index:
    //   bar-left   -> cols[0]=9     -> "col-9"
    //   bar-middle -> cols[1]=3     -> "col-3"
    //   bar-right  -> cols[2]=nil   -> ["col",nil,nil].compact.join("-")="col"
    // The bare "col" on bar-right is the load-bearing bit: a port that pads
    // the array to three entries would emit a made-up "col-0" here.
    expect(html).toContain("<div class='bar-left col-9'>");
    expect(html).toContain("<div class='bar-middle col-3'>");
    expect(html).toContain("<div class='bar-right col'>");
    expect(html).not.toContain("col-0");
    // no prepare_bar ran, so no d-none and no md context anywhere.
    expect(html).not.toContain("d-none");
    expect(html).not.toContain("col-md-");
  });

  it("box hides :menu and renders the three sections with the gem's classes", async () => {
    const s = storage!;
    const html = await s.engine.render("Box Probe", "box");
    // box.rb:1-3 `view :box ... do voo.hide :menu end` + box.haml:2
    // `.card._card-link.nodblclick{ class: box_classes, data: wrap_data }`
    expect(html.startsWith("<div class='box ")).toBe(true);
    expect(html).toContain("card _card-link nodblclick'");
    // wrap_data with slot=false carries the five card attrs + slot-id and
    // NO data-slot JSON on the BOX's own div (wrap.rb:37 `def wrap_data
    // slot=false`; box.haml:2 calls it bare, and with_slot_data :56-62 adds
    // the :slot JSON only when the flag is set). The blanket not-contains
    // this pin used to assert is Ruby-false for the FULL render: box_middle
    // is _render_content (box.rb:9-11) and the slot-wrapped content view it
    // renders carries its own data-slot JSON. Scoped to the box div (line
    // 1) the gem-true absence holds.
    expect(html).toMatch(/data-card-id='400'/);
    expect(html).toMatch(/data-card-name='Box Probe'/);
    expect(html).toMatch(/data-card-link-name='Box_Probe'/);
    expect(html).toMatch(/data-slot-id='[0-9a-f]{20}'/);
    expect(html.split("\n")[0]).not.toContain("data-slot=");
    // box_middle renders the slot-wrapped :content view inside the box
    // (box.rb:9-11) — the content-view slot frame is the corpus-pinned
    // nested-content shape.
    expect(html).toContain('id="box_probe-content-view"');
    // voo.hide :menu (box.rb:2) makes the `= render :menu` after box_top
    // (box.haml:7) render empty — the hidden view's bytes, not the menu
    // markup.
    expect(html).not.toContain("dropdown-menu");
    // the three box.haml sections
    expect(html).toContain("class='box-top card-header text-center'");
    expect(html).toContain("class='box-middle card-body'");
    expect(html).toContain("class='box-bottom card-footer text-center'");
  });

  it("box_top renders title_link and box_middle renders content (the slot-wrapped core)", async () => {
    const s = storage!;
    const top = await s.engine.render("Box Probe", "box_top");
    const link = await s.engine.render("Box Probe", "title_link");
    // box.rb:5-7 `view :box_top do render_title_link end`
    expect(top).toBe(link);
    // box.rb:9-11 `view :box_middle do _render_content end` — the body is
    // the :content view, NOT :core; the old `middle == core` pin cited
    // _render_content and then asserted core equality, its own citation
    // falsified. :content is the slot-wrapped core (the corpus-pinned
    // nested-content frame), so the middle bytes carry the content-view
    // slot wrap around the core body.
    const middle = await s.engine.render("Box Probe", "box_middle");
    expect(middle).toContain('id="box_probe-content-view"');
    expect(middle).toContain('class="card-slot content-view');
    expect(middle).toContain(">probe body</div>");
  });

  it("box_bottom renders the two credit wraps; the seed has no creator or updaters", async () => {
    const s = storage!;
    // box.rb:13-15 `view :box_bottom do [_render_creator_credit,
    // _render_updated_by] end` — the Array joins "\n" (card-1.110.0
    // lib/card/format/content.rb:68-70 output). Both halves ARE ported now:
    // card-mod-history set/all/history_board.rb:2-8 (:creator_credit, wrap
    // div class "text-muted creator-credit") and :10-16 (:updated_by, wrap
    // div class "text-muted"). The wrap option is an UNCONDITIONAL tag
    // wrapper (card-1.110.0 lib/card/set/format/abstract_format/wrapper.rb
    // define_tag_wrapper), so the guards' "" bodies still render their wrap
    // divs — the oracle pins exactly that empty-wrap shape for updated_by
    // (Home renders `<div class="text-muted"></div>`, deck_level arms).
    // The Box Probe seed carries no creator_id and no updater acts, so
    // both bodies take their guard arms and the footer is the two empty
    // wraps — the same disclosed empty-in-wrap shape views.ts ports.
    expect(await s.engine.render("Box Probe", "box_bottom")).toBe(
      `<div class="text-muted creator-credit"></div>\n<div class="text-muted"></div>`,
    );
  });

  it("boxed wraps the core in the image-box div with the DEFAULTED size", async () => {
    const s = storage!;
    const html = await s.engine.render("Box Image", "boxed");
    // image.rb:15-20 image_box: `voo.size ||= :medium` then
    // `wrap_with :div, title: image_box_title, class: "image-box #{voo.size}"`
    // image_box_title (image.rb:30) falls back to image_box_card_name.
    expect(html.startsWith("<div title=\"Box Image\" class=\"image-box medium\">")).toBe(true);
  });

  it("boxed on a COMPOUND name titles the box with the LEFT name", async () => {
    const s = storage!;
    const html = await s.engine.render("Box Image+child", "boxed");
    // image.rb:8 image_box_card_name: compound -> card.name.left
    expect(html.startsWith("<div title=\"Box Image\" class=\"image-box medium\">")).toBe(true);
  });

  it("boxed_link links the core to the box's own card name", async () => {
    const s = storage!;
    const html = await s.engine.render("Box Image", "boxed_link");
    // image.rb:10-12 + :33-35 image_box_link_target — the BOX card's name,
    // not the rendered card's, and for a simple name that is a self-link.
    expect(html).toContain('href="/Box_Image"');
  });
});

describe("card-mod-format — title_link / title_no_link / open_content (rendered-unpinned)", () => {
  it("title_no_link is the wrapped title with the bare joint span", async () => {
    const s = storage!;
    const html = await s.engine.render("Box Probe", "title_no_link");
    // title.rb:40-44 wrapped_title: <span class="card-title" title="NAME">
    expect(html).toBe(`<span class="card-title" title="Box Probe">Box Probe</span>`);
  });

  it("title_link wraps title_no_link in the known-card anchor", async () => {
    const s = storage!;
    const html = await s.engine.render("Box Probe", "title_link");
    const inner = await s.engine.render("Box Probe", "title_no_link");
    // title.rb:18-20 link_to_card card.name, render_title_no_link;
    // links.rb:111-116 adds the known/wanted class, links.rb:33-35 the path.
    expect(html).toBe(`<a class="known-card" href="/Box_Probe">${inner}</a>`);
  });

  it("title still renders title_no_link — the default is the un-linked branch", async () => {
    const s = storage!;
    // title.rb:14-16 show_view?(:title_link, :hide) is hide by default, so
    // the :title body must stay byte-identical after the refactor.
    expect(await s.engine.render("Box Probe", "title")).toBe(
      await s.engine.render("Box Probe", "title_no_link"),
    );
  });

  it("a compound title splits on the joint with a BARE span (class dropped)", async () => {
    const s = storage!;
    const html = await s.engine.render("Box Probe+child", "title_no_link");
    // title.rb:44-46 wrapped_joint: `wrap_with :span, (voo.joint || "+"),
    // classy("joint")` — content_tag takes the class as a positional arg,
    // so the joint span renders with NO class. Faithfully reproduced.
    expect(html).toContain("<span>+</span>");
    expect(html).not.toContain("joint");
  });

  it("open_content renders core EXPLICITLY, so a core override is what shows", async () => {
    const s = storage!;
    // base.rb:93-95 `_render_core`, with base.rb:113-116's NOTE that it must
    // not be aliased to :core. Equality here proves the delegation; the
    // override-honouring property is the reason it is a delegation.
    expect(await s.engine.render("Box Probe", "open_content")).toBe(
      await s.engine.render("Box Probe", "core"),
    );
  });
});
