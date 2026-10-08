// bar-slots (2026-09-29, view-fail class V6): the Bootswatch-skin
// cardtype's bar_left renders the media+icon layout — card-mod-bootstrap
// set/type/bootswatch_skin/html_views.rb:57-63 (text_with_image →
// media_snippet.haml) — where the engine used to render a bare title span.
// The expected bytes are an earlier dump's oracle region for `cerulean
// skin :closed` (phase-008/html/000017-cerulean_skin-closed.expected.html,
// first-diff offset 848) verbatim: the media block with the +Image child's
// :boxed nest (coded content → /files/:codename+:image/bootstrap-small.png,
// IMAGE_BOX_SIZE_MAP medium→small) over the media-text title span.
//
// The dispatch is the BASE bar_left with a typeCode gate (views.ts
// bootswatchSkinBarLeftHtml): the corpus grading pipeline replays views
// through a RenderEngine that never binds a ModLoader, so only base-table
// registrations dispatch on the graded surface.

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
  // The cardtype cards: Basic (default new-card type), Image, and the
  // Bootswatch skin cardtype whose codename names the set module.
  await seedCard(s, { id: 9, name: "RichText", codename: "rich_text" });
  await seedCard(s, { id: 33929, name: "Bootswatch skin", codename: "bootswatch_skin", typeId: 2 });
  // The *all+*read grant (deck-readable).
  await seedCard(s, { id: 10, name: "*all", codename: "all", typeId: 1, dbContent: "{}" });
  await seedCard(s, { id: 20, name: "*read", codename: "read", typeId: 2 });
  await seedCard(s, { id: 50, leftId: 10, rightId: 20, dbContent: "[[Anyone]]" });
  await seedReference(s, 50, 6, "anyone");
  // The skin card + its coded +Image child (the corpus rows: cerulean
  // skin id 22774 type 33929; cerulean skin+Image id 22850 content
  // ":cerulean_skin+:image/bootstrap.png").
  await seedCard(s, { id: 22774, name: "cerulean skin", typeId: 33929, dbContent: "[[themeless bootstrap skin]]" });
  await seedCard(s, {
    id: 22850,
    name: "cerulean skin+Image",
    leftId: 22774,
    rightId: 19,
    typeId: 19,
    dbContent: ":cerulean_skin+:image/bootstrap.png",
  });
  // A skin WITHOUT an +Image child (the journal-skin-customized shape,
  // phase-014: the empty image-box bytes).
  await seedCard(s, { id: 22860, name: "bare skin", typeId: 33929, dbContent: "" });
}

const SET_TYPE_ID = 1;


/** The bar-left region: from `<div class='bar-left` up to (excluding) the
 *  bar-right div opener. The slice carries the bar-body wrapper's closing
 *  `</div>` plus the `<div class='` prefix of the bar-right opener — the
 *  helper strips that partial opener so the assertions compare the exact
 *  region bytes only. */
function barLeftRegion(html: string): string {
  const at = html.indexOf("<div class='bar-left");
  expect(at).toBeGreaterThan(-1);
  const end = html.indexOf("<div class='bar-right", at);
  expect(end).toBeGreaterThan(at);
  return html.slice(at, end);
}

beforeAll(async () => {
  storage = await createRenderTestStorage();
  await seedDeck();
}, 60_000);

afterAll(() => {
  storage?.close();
});

describe("bootswatch_skin bar_left: the media+icon layout", () => {
  it("renders the dumped oracle bar-left bytes for a skin with an +Image child", async () => {
    const html = await storage!.engine.render("cerulean skin", "closed");
    const region = barLeftRegion(html);
    // The an earlier pass dump's oracle bytes (phase-008 cerulean skin closed),
    // from `<div class='bar-left col-9'>` through the media block close.
    expect(region).toBe(
      `<div class='bar-left col-9'>\n` +
        `<div class='media align-items-center'>\n` +
        `<div class='media-left'>\n` +
        `<div title="cerulean skin" class="image-box medium"><img alt="cerulean skin+Image" src="/files/:cerulean_skin+:image/bootstrap-small.png" /></div>\n` +
        `</div>\n` +
        `<div class='media-body-medium media-body'>\n` +
        `<div class='media-text'>\n` +
        `<span class="card-title" title="cerulean skin">cerulean skin</span>\n` +
        `</div>\n` +
        `</div>\n` +
        `</div>\n` +
        // The bar-left wrapper's own close (the region helper slices up to
        // the bar-right opener, so the wrapper close is part of the region).
        `\n</div>\n`,
    );
  });

  it("renders the empty image-box for a skin without an +Image child", async () => {
    const html = await storage!.engine.render("bare skin", "closed");
    const region = barLeftRegion(html);
    expect(region).toContain(`<div title="bare skin" class="image-box medium"></div>`);
    expect(region).toContain(`<span class="card-title" title="bare skin">bare skin</span>`);
  });

  it("keeps the plain title span bar-left for non-skin cards", async () => {
    const html = await storage!.engine.render("cerulean skin+Image", "closed");
    const region = barLeftRegion(html);
    expect(region).toBe(
      `<div class='bar-left col-9'>\n<span class="card-title" title="cerulean skin+Image">cerulean skin<span>+</span>Image</span>\n</div>\n`,
    );
  });
});
