// six-skin-viewopen (2026-10-02): the Bootswatch-skin cardtype's bar_bottom
// renders the core inside a bare <code> pair -- card-mod-bootstrap
// set/type/bootswatch_skin/html_views.rb:69-73:
//
//   view :bar_bottom do
//     wrap_with :code do render_core end
//   end
//
// `wrap_with :code` is a VERBATIM tag wrapper: `<code>#{render_core}</code>`,
// with NO slot wrapper div. Every other cardtype gets bar.rb's
// `view :bar_bottom -> render :content, home_view: :content`, which wraps the
// body in `<div id="X-content-view" class="card-slot content-view …">`.
//
// That one wrapper swap was the whole of the six-skin view-open residual on
// shard-000028 at cf7dc5c -- lux +493, materia +511, minty +501, pulse +501,
// sketchy +509, solar +501, three divergence regions each (the wrapper open
// tag, the `</code>` vs nothing, the `</div>` vs nothing) and one shared
// cause. Oracle bytes for `lux skin` (id 33877) as captured in
// tmp/raw-ground-truth/expected-v2/view-lane/recapture-raw-shard-000028.jsonl
// (read at probe time, NOT at test time -- that tree is gitignored):
//
//   expected  …<div class='accordion-body d0-card-body'>\n<code><a class="btn btn-sm btn-outline-primary me-2 known-card" href="/update/lux_skin?card%5Btrigger%5D=use_as_current_skin">Use as current</a>
//   pre-fix   …<div class='accordion-body d0-card-body'>\n<div id="lux_skin-content-view" class="card-slot content-view ALL TYPE-bootswatch_skin SELF-lux_skin d0-card-content" …><a class="btn …">Use as current</a>
//   tail      …</div>\n\n</div>\n</code>\n</div>\n</div>\n</div>\n</div>
//
// The dispatch is the BASE bar_bottom with a typeCode gate, for the same
// reason barLeftView's is (bootswatch-skin-bar-left-media-bytes.test.ts:11-14)
// and coreView's is (views.ts:1186-1191): the corpus grading pipeline replays
// views through a RenderEngine that never binds a ModLoader, so only
// base-table registrations dispatch on the graded surface. The mod-layer copy
// of this same body (card-mod-bootstrap.ts:927, registered at :1427) is
// correct and stays dead there.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "./render-test-storage.js";

let storage: RenderTestStorage | undefined;

async function seedDeck(): Promise<void> {
  const s = storage!;
  await seedCard(s, { id: 1, name: "Set", codename: "set" });
  await seedCard(s, { id: 2, name: "Setting", codename: "setting" });
  await seedCard(s, { id: 5, name: "HTML", codename: "html" });
  await seedCard(s, { id: 6, name: "Anyone", codename: "anyone" });
  await seedCard(s, { id: 19, name: "Image", codename: "image", typeId: 19 });
  await seedCard(s, { id: 9, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 1, dbContent: "{}" });
  await seedCard(s, { id: 20, name: "*read", codename: "read", typeId: 2 });
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 6, "anyone");
  // The Bootswatch skin cardtype whose codename names the set module.
  await seedCard(s, { id: 33929, name: "Bootswatch skin", codename: "bootswatch_skin", typeId: 2 });
  // A skin card + its coded +Image child (the corpus rows: cerulean skin id
  // 22774 type 33929; cerulean skin+Image id 22850).
  await seedCard(s, { id: 22774, name: "cerulean skin", typeId: 33929, dbContent: "[[themeless bootstrap skin]]" });
  await seedCard(s, {
    id: 22850,
    name: "cerulean skin+Image",
    leftId: 22774,
    rightId: 19,
    typeId: 19,
    dbContent: ":cerulean_skin+:image/bootstrap.png",
  });
  // A NON-skin card, so the pin also holds the base bar_bottom in place for
  // every other cardtype. `cerulean skin+Image` is Image-typed (19), not
  // BootswatchSkin (33929), so the gate must not fire on it.
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("bootswatch_skin bar_bottom: the <code> wrap", () => {
  it("wraps a skin card's core in a bare <code> pair with no slot wrapper", async () => {
    const html = await storage!.engine.render("cerulean skin", "bar_bottom");
    expect(html.startsWith("<code>")).toBe(true);
    expect(html.endsWith("</code>")).toBe(true);
    // The base path's marker: the card's OWN content-view slot div must be
    // ABSENT. Scoped to `id="<card>-content-view"` because the skin core
    // nests its +Image child, and that nested slot legitimately carries
    // `content-view` in its own class.
    expect(html).not.toContain(`<div id="cerulean_skin-content-view"`);
    // And the body between the tags is the skin core -- the Use as current
    // anchor, which is the first thing core.haml emits for a non-current skin.
    expect(html).toContain(
      `<a class="btn btn-sm btn-outline-primary me-2 known-card" href="/update/cerulean_skin?card%5Btrigger%5D=use_as_current_skin">Use as current</a>`,
    );
  });

  it("keeps the content-view slot wrap for a non-skin card", async () => {
    const html = await storage!.engine.render("cerulean skin+Image", "bar_bottom");
    expect(html).not.toContain("<code>");
    // The base path: bar.rb's `view :bar_bottom -> render :content,
    // home_view: :content` wraps the body in a content-view slot div.
    expect(html.startsWith(`<div id="`)).toBe(true);
    expect(html).toContain(`class="card-slot content-view`);
    expect(html.endsWith("</div>")).toBe(true);
  });

  it("wraps the whole open-view accordion body in <code>, never a content-view div", async () => {
    const html = await storage!.engine.render("cerulean skin", "open");
    // The oracle's open view for a skin card carries the <code> pair where
    // the base path would carry `<div id="X-content-view" …>`.
    expect(html).toContain(`<div class='accordion-body d0-card-body'>\n<code>`);
    expect(html).not.toContain(`cerulean_skin-content-view`);
    // The bar_left media block (the sibling override) is unaffected.
    expect(html).toContain(`<span class="card-title" title="cerulean skin">cerulean skin</span>`);
  });
});
