// The bootswatch_skin starred-anchor family:
//   - the skin :core (card-mod-bootstrap set/type/bootswatch_skin/
//     html_views.rb:28, template :haml = core.haml) — the skin
//     configuration page;
//   - the html_views bar family: :bar_left (the Abstract::Media
//     text_with_image block — card-mod-bar_and_box set/abstract/media.rb +
//     media/media_snippet.haml), :bar_right (the empty body), :bar_bottom
//     (the <code> wrap).
//
// DECK SHAPE: the probe skin has ONE child row, +Image (type Image,
// content ":media_probe_skin+:image/bootstrap.png"); it has NO
// +*colors/+*variables/+*stylesheets rows — Ruby renders those field nests
// as FABRICATED pattern-typed cards (fetch new: {} + the TYPE_PLUS_RIGHT
// *default rule types them SCSS), and renders NO third accordion for
// :stylesheets at all. The probe reproduces that shape.
//
// NOT this family's defect: a programmatic field_nest target that exists as
// a ROW (the +Image card) renders through the render-side fetch cache — the
// test warms it through the engine's own enrichment hook
// (prepareItemForRender), the same seam a page render's prefetch would
// drive; the fabricated nests need no warming.

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  bindModLoaderToEngine,
  createRenderTestStorage,
  seedCard,
  seedReference,
  type RenderTestStorage,
} from "../render/render-test-storage.js";
import { ModLoader, modEngineHost } from "../../../src/card/mod-loader.js";
import cardModBootstrap from "../../../src/card/mod-loader/mods/card-mod-bootstrap.js";

let storage: RenderTestStorage | undefined;
let loader: ModLoader | undefined;
const SKIN = "Media Probe Skin";

async function installLoader(): Promise<void> {
  const s = storage!;
  loader = new ModLoader([{ manifest: cardModBootstrap }]);
  loader.load();
  bindModLoaderToEngine(s, loader);
  await loader.installInto(modEngineHost(s.engine, s.fetcher));
  s.fetcher.installNameEnvironment();
  await s.fetcher.codenames.ensureLoaded();
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  const s = storage;

  // type/codename scaffolding (the set-key algebra reads these)
  await seedCard(s, { id: 2, name: "RichText" });
  await seedCard(s, { id: 19, name: "Image", codename: "image", typeId: 2 });
  await seedCard(s, { id: 21, name: "SCSS", codename: "scss", typeId: 2 });
  await seedCard(s, { id: 22, name: "Bootswatch skin", codename: "bootswatch_skin", typeId: 2 });
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 13 });
  await seedCard(s, { id: 11, name: "*self", codename: "self", typeId: 14 });
  await seedCard(s, { id: 12, name: "*type", codename: "type", typeId: 14 });
  await seedCard(s, { id: 13, name: "*set", codename: "set", typeId: 13 });
  await seedCard(s, { id: 14, name: "*setting", codename: "setting", typeId: 14 });
  await seedCard(s, { id: 15, name: "*default", codename: "default", typeId: 14 });
  await seedCard(s, { id: 16, name: "*read", codename: "read", typeId: 14 });
  await seedCard(s, { id: 17, name: "*all+*read", leftId: 10, rightId: 16, typeId: 14, dbContent: "[[Anyone]]" });
  await seedCard(s, { id: 18, name: "Anyone", codename: "anyone", typeId: 2 });
  await seedReference(s, 17, 18, "anyone");

  // the +Image field (the deck's one real child row shape) — content is
  // the CODED attachment reference, exactly the raw deck's form
  await seedCard(s, { id: 30, name: SKIN, typeId: 22 });
  await seedCard(s, {
    id: 31,
    name: `${SKIN}+Image`,
    leftId: 30,
    rightId: 19,
    typeId: 19,
    dbContent: `:media_probe_skin+:image/bootstrap.png`,
  });
}, 60_000);

afterAll(() => {
  loader?.reset();
  storage?.close();
});

describe("bootswatch_skin family (skin :core + the media bar_left)", () => {
  it("WITHOUT the mod: the flat arm is the base-table skin family", async () => {
    const s = storage!;
    // The family lives on the BASE table
    // (tests/card/render/bootswatch-skin-bar-left-media-bytes.test.ts;
    // views.ts bootswatchSkinBarLeftHtml), so the LOADER-LESS pipeline
    // dispatches it — the flat :core renders the skin configuration
    // skeleton with no ModLoader bound at all.
    const flatCore = await s.engine.render(SKIN, "core");
    expect(flatCore).toContain("Use as current");
    expect(flatCore).toContain("Skin configuration");
    // bar_right: the flat arm for a non-rule card is empty (the same bytes
    // the mod view emits).
    expect(await s.engine.render(SKIN, "bar_right")).toBe("");
    // bar_bottom: the flat arm IS the <code> wrap. The skin override sits
    // on the BASE table's bar_bottom (views.ts barBottomView's
    // bootswatch_skin gate), so the loader-less pipeline dispatches it —
    // the same base-table landing as :core and bar_left. Ruby resolves
    // bar_bottom by MRO with the type-set module ahead of bar.rb, so a
    // bootswatch_skin card renders `wrap_with :code { render_core }`
    // REGARDLESS of loader binding
    // (card-mod-bootstrap set/type/bootswatch_skin/html_views.rb:69-73) —
    // the WITH-mod test below pins the identical bytes.
    const bareBarBottom = await s.engine.render(SKIN, "bar_bottom");
    expect(bareBarBottom.startsWith("<code>")).toBe(true);
  });

  it("WITH the mod: :closed carries the mod's media block in bar_left", async () => {
    const s = storage!;
    await installLoader();
    // warm the +Image field through the engine's enrichment hook (the
    // programmatic media nest's target is a real row outside the closure)
    await s.engine.prepareItemForRender(`${SKIN}+Image`);
    const html = await s.engine.render(SKIN, "closed");
    // media_snippet.haml bytes: the static haml classes, the UNWRAPPED
    // boxed image, the medium-box/small-file variant pair, the bare
    // media-text title span.
    expect(html).toContain("<div class='media align-items-center'>");
    expect(html).toContain("<div class='media-left'>");
    expect(html).toContain(`<div title="${SKIN}" class="image-box medium">`);
    expect(html).toContain(
      `<img alt="${SKIN}+Image" src="/files/:media_probe_skin+:image/bootstrap-small.png" />`,
    );
    expect(html).toContain("<div class='media-body-medium media-body'>");
    expect(html).toContain("<div class='media-text'>");
    expect(html).toContain(`<span class="card-title" title="${SKIN}">${SKIN}</span>`);
    // the class_up calls never reach the bytes
    expect(html).not.toContain("media-left m-0");
    expect(html).not.toContain("card-title my-0 ms-2");
  });

  it("WITH the mod: :core renders the mod's skin-configuration skeleton", async () => {
    const s = storage!;
    await installLoader();
    await s.engine.prepareItemForRender(`${SKIN}+Image`);
    const html = await s.engine.render(SKIN, "core");
    // the Use as current anchor (the current_skin? false arm)
    expect(html).toContain(
      `<a class="btn btn-sm btn-outline-primary me-2 known-card" href="/update/Media_Probe_Skin?card%5Btrigger%5D=use_as_current_skin">Use as current</a>`,
    );
    // no +parent row -> the customize arm
    expect(html).toContain(
      `<a class="btn btn-sm btn-outline-primary me-2 wanted-card"`,
    );
    expect(html).toContain("Customize</a>");
    // the image content nest (slot-wrapped, size :large -> -large file)
    expect(html).toContain("content-view");
    expect(html).toContain(
      `src="/files/:media_probe_skin+:image/bootstrap-large.png"`,
    );
    // the haml literal blocks
    expect(html).toContain("<h5 class='mt-4'>\nSkin configuration\n</h5>");
    expect(html).toContain("<div class='small mb-3'>\nfrom simplest to most advanced\n</div>");
    expect(html).toContain("<div class='accordion'>");
    // the accordion wrapper + the three field_nest call sites. The deck has NO
    // +*colors/+*variables/+*stylesheets rows (the probe skin's only child is
    // +Image), and Ruby renders the first two as FABRICATED pattern-typed
    // new-card accordions (SCSS-typed via the TYPE_PLUS_RIGHT *default rule,
    // codename-corrected slot names like "media_probe_skin+*colors") and
    // NOTHING for :stylesheets. The port's fabricated-nest arm renders the
    // empty string for all three (the engine's unknown-nest rendering), so
    // the accordion carries the wrapper and empty slots here. The full
    // fabricated-accordion bytes are the new-card nest machinery's named
    // gap, not this view's body (whose anchors/skeleton ARE pinned above).
    expect(html).toContain("<div class='accordion'>");
  });

  it("WITH the mod: :bar_bottom wraps the core in <code> (html_views.rb:69-73)", async () => {
    const s = storage!;
    await installLoader();
    const html = await s.engine.render(SKIN, "bar_bottom");
    expect(html.startsWith("<code>")).toBe(true);
    expect(html.endsWith("</code>")).toBe(true);
    expect(html).toContain("Skin configuration");
  });
});
